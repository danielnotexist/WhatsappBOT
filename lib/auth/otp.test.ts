import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { captureOwnerAlerts, stopCapturingOwnerAlerts } from "@/lib/admin/alerts";
import { MemoryDb } from "@/lib/db/memory";
import { ConsoleMailer } from "@/lib/mail/console";
import { MemoryRateLimiter } from "@/lib/rate-limit";
import { OTP_POLICY, codeMatches, generateCode, hashCode, mailboxKey, normalizeEmail, sendOtp, verifyOtp, type OtpDeps } from "./otp";

const otpKey = randomBytes(32);

function setup(start = new Date()) {
  let now = start;
  const db = new MemoryDb();
  const mailer = new ConsoleMailer();
  const deps: OtpDeps = { db, mailer, limiter: new MemoryRateLimiter(), now: () => now, otpKey };
  const advance = (ms: number) => {
    now = new Date(now.getTime() + ms);
  };
  /** this browser: the challenge of its last send rides on its verifies (the wb_otp cookie) */
  const send = async (email: string, ip: string) => {
    const r = await sendOtp(deps, email, ip);
    if (r.ok && r.challenge) deps.challenge = r.challenge;
    return r;
  };
  return { db, mailer, deps, advance, send };
}

describe("normalizeEmail", () => {
  it("lowercases, trims and rejects junk", () => {
    expect(normalizeEmail("  Dana@Levi-Law.co.il ")).toBe("dana@levi-law.co.il");
    expect(normalizeEmail("nope")).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
    expect(normalizeEmail("a@b")).toBeNull();
  });

  it("never accepts an internal key such as the admin code's admin:<email>", () => {
    expect(normalizeEmail("admin:danielnotexist@gmail.com")).toBeNull();
    expect(normalizeEmail("a b@c.co")).toBeNull();
    expect(normalizeEmail("dana.levi+news@gmail.com")).toBe("dana.levi+news@gmail.com");
  });

  it("mailboxKey folds +tags and Gmail dots into one mailbox", () => {
    expect(mailboxKey("d.ana+1@gmail.com")).toBe("dana@gmail.com");
    expect(mailboxKey("dana@googlemail.com")).toBe("dana@gmail.com");
    expect(mailboxKey("dana.levi+x@levi-law.co.il")).toBe("dana.levi@levi-law.co.il");
  });
});

describe("codes and hashes", () => {
  it("generates 6 digits and hashes without storing the code", () => {
    const code = generateCode();
    expect(code).toMatch(/^\d{6}$/);
    const hash = hashCode("a@b.co", code, otpKey);
    expect(hash).not.toContain(code);
    expect(codeMatches("a@b.co", code, hash, otpKey)).toBe(true);
    expect(codeMatches("a@b.co", "000000", hash, otpKey)).toBe(code === "000000");
    expect(codeMatches("other@b.co", code, hash, otpKey)).toBe(false);
  });
});

describe("sendOtp", () => {
  it("sends a code, stores only its hash and enforces the 60s cooldown", async () => {
    const { db, mailer, advance, send } = setup();
    const r1 = await send("Dana@Example.com", "1.1.1.1");
    expect(r1).toMatchObject({ ok: true, cooldownSeconds: 60, challenge: expect.stringMatching(/^[A-Za-z0-9_-]{32}$/) });
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]!.to).toBe("dana@example.com");
    expect(db.otps[0]!.code_hash).not.toContain(mailer.sent[0]!.code);

    const r2 = await send("dana@example.com", "1.1.1.1");
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.code).toBe("cooldown");

    advance(61_000);
    const r3 = await send("dana@example.com", "1.1.1.1");
    expect(r3.ok).toBe(true);
    expect(db.otps[0]!.used_at).not.toBeNull(); // the old code is superseded
  });

  it("caps codes per email per hour and sends per IP", async () => {
    const { advance, send } = setup();
    for (let i = 0; i < OTP_POLICY.maxPerHourPerEmail; i++) {
      expect((await send("x@y.co", "1.1.1.1")).ok).toBe(true);
      advance(61_000);
    }
    const r = await send("x@y.co", "1.1.1.1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("too_many");

    for (let i = 0; i < OTP_POLICY.maxSendsPerIpPerHour; i++) await send(`u${i}@y.co`, "9.9.9.9");
    const rIp = await send("last@y.co", "9.9.9.9");
    expect(rIp.ok).toBe(false);
    if (!rIp.ok) expect(rIp.code).toBe("rate_limited");
  });

  it("reports mail failures without leaking the code", async () => {
    const { deps, send } = setup();
    deps.mailer = {
      async sendOtp() {
        throw new Error("boom");
      },
    };
    const r = await send("x@y.co", "1.1.1.1");
    expect(r).toMatchObject({ ok: false, code: "mail_failed" });
  });
});

describe("verifyOtp", () => {
  it("creates the user on first login and returns an existing one afterwards", async () => {
    const { db, mailer, deps, advance, send } = setup();
    await send("dana@example.com", "1.1.1.1");
    const code = mailer.sent[0]!.code;
    const ok = await verifyOtp(deps, "dana@example.com", code, "1.1.1.1");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.isNewUser).toBe(true);
    expect(db.users.size).toBe(1);
    expect(db.audit.map((a) => a.action)).toContain("signup");

    // code is single use
    const again = await verifyOtp(deps, "dana@example.com", code, "1.1.1.1");
    expect(again).toMatchObject({ ok: false, code: "no_code" });

    advance(61_000);
    await send("dana@example.com", "1.1.1.1");
    const ok2 = await verifyOtp(deps, "dana@example.com", mailer.sent[1]!.code, "1.1.1.1");
    expect(ok2.ok).toBe(true);
    if (ok2.ok) expect(ok2.isNewUser).toBe(false);
    expect(db.users.size).toBe(1);
  });

  it("a new user tells the owner (lib/admin/alerts.ts, with the source); a returning user does not", async () => {
    const seen = captureOwnerAlerts();
    try {
      const { db, mailer, deps, advance, send } = setup();
      const source = { utm_source: "google", utm_campaign: "spring", landing: "/pricing" };
      await send("dana@example.com", "1.1.1.1");
      const ok = await verifyOtp({ ...deps, signupSource: source }, "dana@example.com", mailer.sent[0]!.code, "1.1.1.1");
      expect(ok.ok).toBe(true);
      const user = (await db.findUserByEmail("dana@example.com"))!;
      expect(seen.map((s) => s.event)).toEqual([{ type: "signup", userId: user.id, email: "dana@example.com", name: null, business: null, source }]);
      expect(seen[0]!.deps.db).toBe(db);
      advance(61_000);
      await send("dana@example.com", "1.1.1.1");
      await verifyOtp(deps, "dana@example.com", mailer.sent[1]!.code, "1.1.1.1");
      expect(seen).toHaveLength(1);
    } finally {
      stopCapturingOwnerAlerts();
    }
  });

  it("rejects wrong codes, counts attempts and locks after 5", async () => {
    const { deps, mailer, send } = setup();
    await send("dana@example.com", "1.1.1.1");
    const right = mailer.sent[0]!.code;
    const wrong = right === "111111" ? "222222" : "111111";
    for (let i = 1; i < OTP_POLICY.maxAttempts; i++) {
      const r = await verifyOtp(deps, "dana@example.com", wrong, "1.1.1.1");
      expect(r).toMatchObject({ ok: false, code: "invalid_code", attemptsLeft: OTP_POLICY.maxAttempts - i });
    }
    const locked = await verifyOtp(deps, "dana@example.com", wrong, "1.1.1.1");
    expect(locked).toMatchObject({ ok: false, code: "too_many_attempts" });
    // even the right code no longer works
    const after = await verifyOtp(deps, "dana@example.com", right, "1.1.1.1");
    expect(after.ok).toBe(false);
  });

  it("expires after 10 minutes and accepts formatted input", async () => {
    const { deps, mailer, advance, send } = setup();
    await send("dana@example.com", "1.1.1.1");
    const code = mailer.sent[0]!.code;
    advance(OTP_POLICY.ttlMs + 1);
    const r = await verifyOtp(deps, "dana@example.com", code, "1.1.1.1");
    expect(r).toMatchObject({ ok: false, code: "expired" });

    advance(61_000);
    await send("dana@example.com", "1.1.1.1");
    const c2 = mailer.sent[1]!.code;
    const spaced = `${c2.slice(0, 3)} ${c2.slice(3)}`;
    expect((await verifyOtp(deps, "DANA@example.com", spaced, "1.1.1.1")).ok).toBe(true);
  });
});

describe("abuse (security round B)", () => {
  it("only the browser that asked may try the code: a stranger's guesses neither count nor burn it", async () => {
    const { deps, mailer, send } = setup();
    await send("dana@example.com", "1.1.1.1");
    const right = mailer.sent[0]!.code;
    const wrong = right === "111111" ? "222222" : "111111";
    for (let i = 0; i < 10; i++) {
      expect(await verifyOtp({ ...deps, challenge: null }, "dana@example.com", wrong, "6.6.6.6")).toMatchObject({ code: "no_code" });
      expect(await verifyOtp({ ...deps, challenge: "x".repeat(32) }, "dana@example.com", wrong, "6.6.6.6")).toMatchObject({ code: "no_code" });
    }
    expect((await verifyOtp(deps, "dana@example.com", right, "1.1.1.1")).ok).toBe(true);
  });

  it("parallel wrong guesses are each counted: 10 at once leave the code burned after 5", async () => {
    const { db, deps, mailer, send } = setup();
    await send("dana@example.com", "1.1.1.1");
    const right = mailer.sent[0]!.code;
    const wrong = right === "111111" ? "222222" : "111111";
    const results = await Promise.all(Array.from({ length: 10 }, () => verifyOtp(deps, "dana@example.com", wrong, "1.1.1.1")));
    expect(results.filter((r) => !r.ok && r.code === "invalid_code")).toHaveLength(4);
    expect(db.otps[0]!.attempts).toBe(OTP_POLICY.maxAttempts);
    expect((await verifyOtp(deps, "dana@example.com", right, "1.1.1.1")).ok).toBe(false);
  });

  it("parallel sends pass the cooldown once", async () => {
    const { mailer, send } = setup();
    const results = await Promise.all(Array.from({ length: 5 }, () => send("dana@example.com", "1.1.1.1")));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(mailer.sent).toHaveLength(1);
  });

  it("a code burned by wrong guesses keeps the cooldown (no instant resend)", async () => {
    const { deps, mailer, send } = setup();
    await send("dana@example.com", "1.1.1.1");
    const wrong = mailer.sent[0]!.code === "111111" ? "222222" : "111111";
    for (let i = 0; i < OTP_POLICY.maxAttempts; i++) await verifyOtp(deps, "dana@example.com", wrong, "1.1.1.1");
    expect(await send("dana@example.com", "1.1.1.1")).toMatchObject({ ok: false, code: "cooldown" });
  });

  it("a code spent by a clean sign-in does not hold the next send back", async () => {
    const { deps, mailer, send } = setup();
    await send("dana@example.com", "1.1.1.1");
    expect((await verifyOtp(deps, "dana@example.com", mailer.sent[0]!.code, "1.1.1.1")).ok).toBe(true);
    expect((await send("dana@example.com", "1.1.1.1")).ok).toBe(true);
  });

  it("a stranger's sends neither kill the owner's code nor use up the owner's hour", async () => {
    const { deps, mailer, advance, send } = setup();
    await send("dana@example.com", "1.1.1.1");
    const mine = { ...deps };
    const code = mailer.sent[0]!.code;
    for (let i = 0; i < OTP_POLICY.maxPerHourPerEmail; i++) {
      expect((await sendOtp(deps, "dana@example.com", "6.6.6.6")).ok).toBe(true);
      advance(61_000);
    }
    expect(await sendOtp(deps, "dana@example.com", "6.6.6.6")).toMatchObject({ ok: false, code: "too_many" });
    expect((await verifyOtp(mine, "dana@example.com", code, "1.1.1.1")).ok).toBe(true);
    expect((await send("dana@example.com", "1.1.1.1")).ok).toBe(true);
  });

  it("one requester sending to many addresses hits its own hourly cap, not the site-wide ceiling", async () => {
    const { deps } = setup();
    deps.limiter = { hit: () => true } as unknown as typeof deps.limiter; // past the per-instance limiter (another instance)
    for (let i = 0; i < OTP_POLICY.maxSendsPerIpPerHour; i++) expect((await sendOtp(deps, `rand${i}@example.com`, "6.6.6.6")).ok).toBe(true);
    expect(await sendOtp(deps, "rand-last@example.com", "6.6.6.6")).toMatchObject({ ok: false, code: "too_many" });
    expect((await sendOtp(deps, "dana@example.com", "1.1.1.1")).ok).toBe(true);
  });

  it("plus-addresses and Gmail dots share one hourly backstop", async () => {
    const { send } = setup();
    for (let i = 0; i < OTP_POLICY.maxPerHourPerMailbox; i++) expect((await send(`d.ana+${i}@gmail.com`, `10.0.0.${i}`)).ok).toBe(true);
    expect(await send("dana@gmail.com", "10.0.1.1")).toMatchObject({ ok: false, code: "too_many" });
  });
});

describe("client-side OTP constants", () => {
  it("match the server policy", async () => {
    const c = await import("./otp-constants");
    const { OTP_POLICY } = await import("./otp");
    expect(c.CODE_LENGTH).toBe(OTP_POLICY.digits);
    expect(c.RESEND_SECONDS * 1000).toBe(OTP_POLICY.resendCooldownMs);
    expect(c.CODE_TTL_MINUTES * 60_000).toBe(OTP_POLICY.ttlMs);
  });
});
