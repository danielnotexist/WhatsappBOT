import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MemoryDb } from "@/lib/db/memory";
import { ConsoleMailer } from "@/lib/mail/console";
import { MemoryRateLimiter } from "@/lib/rate-limit";
import { OTP_POLICY, codeMatches, generateCode, hashCode, normalizeEmail, sendOtp, verifyOtp, type OtpDeps } from "./otp";

const otpKey = randomBytes(32);

function setup(start = new Date()) {
  let now = start;
  const db = new MemoryDb();
  const mailer = new ConsoleMailer();
  const deps: OtpDeps = { db, mailer, limiter: new MemoryRateLimiter(), now: () => now, otpKey };
  const advance = (ms: number) => {
    now = new Date(now.getTime() + ms);
  };
  return { db, mailer, deps, advance };
}

describe("normalizeEmail", () => {
  it("lowercases, trims and rejects junk", () => {
    expect(normalizeEmail("  Dana@Levi-Law.co.il ")).toBe("dana@levi-law.co.il");
    expect(normalizeEmail("nope")).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
    expect(normalizeEmail("a@b")).toBeNull();
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
    const { db, mailer, deps, advance } = setup();
    const r1 = await sendOtp(deps, "Dana@Example.com", "1.1.1.1");
    expect(r1).toEqual({ ok: true, cooldownSeconds: 60 });
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]!.to).toBe("dana@example.com");
    expect(db.otps[0]!.code_hash).not.toContain(mailer.sent[0]!.code);

    const r2 = await sendOtp(deps, "dana@example.com", "1.1.1.1");
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.code).toBe("cooldown");

    advance(61_000);
    const r3 = await sendOtp(deps, "dana@example.com", "1.1.1.1");
    expect(r3.ok).toBe(true);
    expect(db.otps[0]!.used_at).not.toBeNull(); // the old code is superseded
  });

  it("caps codes per email per hour and sends per IP", async () => {
    const { deps, advance } = setup();
    for (let i = 0; i < OTP_POLICY.maxPerHourPerEmail; i++) {
      expect((await sendOtp(deps, "x@y.co", "1.1.1.1")).ok).toBe(true);
      advance(61_000);
    }
    const r = await sendOtp(deps, "x@y.co", "1.1.1.1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("too_many");

    for (let i = 0; i < OTP_POLICY.maxSendsPerIpPerHour; i++) await sendOtp(deps, `u${i}@y.co`, "9.9.9.9");
    const rIp = await sendOtp(deps, "last@y.co", "9.9.9.9");
    expect(rIp.ok).toBe(false);
    if (!rIp.ok) expect(rIp.code).toBe("rate_limited");
  });

  it("reports mail failures without leaking the code", async () => {
    const { deps } = setup();
    deps.mailer = {
      async sendOtp() {
        throw new Error("boom");
      },
    };
    const r = await sendOtp(deps, "x@y.co", "1.1.1.1");
    expect(r).toMatchObject({ ok: false, code: "mail_failed" });
  });
});

describe("verifyOtp", () => {
  it("creates the user on first login and returns an existing one afterwards", async () => {
    const { db, mailer, deps, advance } = setup();
    await sendOtp(deps, "dana@example.com", "1.1.1.1");
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
    await sendOtp(deps, "dana@example.com", "1.1.1.1");
    const ok2 = await verifyOtp(deps, "dana@example.com", mailer.sent[1]!.code, "1.1.1.1");
    expect(ok2.ok).toBe(true);
    if (ok2.ok) expect(ok2.isNewUser).toBe(false);
    expect(db.users.size).toBe(1);
  });

  it("rejects wrong codes, counts attempts and locks after 5", async () => {
    const { deps, mailer } = setup();
    await sendOtp(deps, "dana@example.com", "1.1.1.1");
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
    const { deps, mailer, advance } = setup();
    await sendOtp(deps, "dana@example.com", "1.1.1.1");
    const code = mailer.sent[0]!.code;
    advance(OTP_POLICY.ttlMs + 1);
    const r = await verifyOtp(deps, "dana@example.com", code, "1.1.1.1");
    expect(r).toMatchObject({ ok: false, code: "expired" });

    advance(61_000);
    await sendOtp(deps, "dana@example.com", "1.1.1.1");
    const c2 = mailer.sent[1]!.code;
    const spaced = `${c2.slice(0, 3)} ${c2.slice(3)}`;
    expect((await verifyOtp(deps, "DANA@example.com", spaced, "1.1.1.1")).ok).toBe(true);
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
