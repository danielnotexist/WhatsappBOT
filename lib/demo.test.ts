import { describe, expect, it } from "vitest";
import { DEMO_COPY, DEMO_FORBIDDEN_KEYS, DEMO_OTP_CODE, DemoConfigError, assertDemoSafe, demoFlag, demoHasSupabase, demoProblems, isDemo } from "./demo";
import { dataMode, integrationsMocked } from "./env";

const KEY = Buffer.alloc(32, 3).toString("base64");
const demo = (extra: Record<string, string | undefined> = {}) => ({ DEMO_MODE: "1", TOKEN_ENC_KEY: KEY, ...extra });
const SUPABASE = { SUPABASE_URL: "https://abc.supabase.co", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service" };

describe("DEMO_MODE switch", () => {
  it("is on only for DEMO_MODE=1 / true", () => {
    expect(demoFlag({ DEMO_MODE: "1" })).toBe(true);
    expect(demoFlag({ DEMO_MODE: " TRUE " })).toBe(true);
    for (const v of [undefined, "", "0", "false", "yes"]) expect(demoFlag({ DEMO_MODE: v })).toBe(false);
    expect(isDemo({})).toBe(false);
    expect(isDemo(demo())).toBe(true);
  });

  it("off: never throws, whatever keys exist", () => {
    expect(() => assertDemoSafe({ WA_ACCESS_TOKEN: "real", HYP_KEY: "real" })).not.toThrow();
    expect(demoProblems({ WA_ACCESS_TOKEN: "real" })).toEqual({ forbidden: [], missing: [] });
  });
});

describe("the demo refuses to run next to outbound keys", () => {
  it.each(DEMO_FORBIDDEN_KEYS.map((k) => [k]))("%s → Hebrew DemoConfigError naming it (never the value)", (key) => {
    const env = demo({ [key]: "s3cr3t-value" });
    expect(() => isDemo(env)).toThrow(DemoConfigError);
    try {
      assertDemoSafe(env);
    } catch (e) {
      const err = e as DemoConfigError;
      expect(err.message).toContain("מצב ההדגמה (DEMO_MODE=1) לא עולה ליד מפתחות ששולחים דברים באמת");
      expect(err.message).toContain(key);
      expect(err.message).not.toContain("s3cr3t-value");
      expect(err.forbidden).toEqual([key]);
    }
  });

  it("covers exactly the outbound-capable keys of the spec", () => {
    expect([...DEMO_FORBIDDEN_KEYS].sort()).toEqual(["GOOGLE_CLIENT_SECRET", "HYP_KEY", "HYP_PASSP", "MS_CLIENT_SECRET", "QSTASH_TOKEN", "RESEND_API_KEY", "WA_ACCESS_TOKEN"]);
  });

  it("lists every offender at once; empty values do not count", () => {
    expect(demoProblems(demo({ WA_ACCESS_TOKEN: "x", RESEND_API_KEY: "y", HYP_KEY: "  " })).forbidden).toEqual(["WA_ACCESS_TOKEN", "RESEND_API_KEY"]);
  });

  it("allows Supabase (staging data) and keys that are only ever mocked", () => {
    const env = demo({ ...SUPABASE, NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", ANTHROPIC_API_KEY: "a", SONIOX_API_KEY: "s", MS_CLIENT_ID: "id", GOOGLE_CLIENT_ID: "id", HYP_MASOF: "123", QSTASH_CURRENT_SIGNING_KEY: "k" });
    expect(() => assertDemoSafe(env)).not.toThrow();
    expect(isDemo(env)).toBe(true);
  });

  it("requires a stable 32-byte TOKEN_ENC_KEY", () => {
    for (const bad of [undefined, "", "c2hvcnQ="]) {
      const env = demo({ TOKEN_ENC_KEY: bad });
      expect(() => isDemo(env)).toThrow(/TOKEN_ENC_KEY.*openssl rand -base64 32/s);
      expect(demoProblems(env).missing).toEqual(["TOKEN_ENC_KEY"]);
    }
  });
});

describe("data layer and integrations in the demo", () => {
  it("memory without Supabase — production included", () => {
    expect(dataMode(demo({ NODE_ENV: "production" }))).toBe("memory");
    // outside the demo memory stays forbidden in production
    expect(() => dataMode({ DATA_MODE: "memory", NODE_ENV: "production" })).toThrow(/production/);
  });

  it("Supabase when SUPABASE_* is configured; an explicit DATA_MODE wins", () => {
    expect(demoHasSupabase(SUPABASE)).toBe(true);
    expect(demoHasSupabase({ SUPABASE_ANON_KEY: "anon" })).toBe(false);
    expect(dataMode(demo({ ...SUPABASE, NODE_ENV: "production" }))).toBe("supabase");
    expect(dataMode(demo({ ...SUPABASE, DATA_MODE: "memory", NODE_ENV: "production" }))).toBe("memory");
    expect(dataMode(demo({ DATA_MODE: "supabase" }))).toBe("supabase");
  });

  it("integrations are mocked in the demo even on Supabase, and in memory mode; real otherwise", () => {
    expect(integrationsMocked(demo(SUPABASE))).toBe(true);
    expect(integrationsMocked(demo())).toBe(true);
    expect(integrationsMocked({ DATA_MODE: "memory", NODE_ENV: "test" })).toBe(true);
    expect(integrationsMocked({ ...SUPABASE })).toBe(false);
  });

  it("a misconfigured demo fails on the first data-mode question", () => {
    expect(() => dataMode(demo({ QSTASH_TOKEN: "x" }))).toThrow(DemoConfigError);
    expect(() => integrationsMocked(demo({ TOKEN_ENC_KEY: undefined }))).toThrow(DemoConfigError);
  });
});

describe("the demo's words", () => {
  it("has the strip, the code note and the robots rule", () => {
    expect(DEMO_OTP_CODE).toBe("123456");
    expect(DEMO_COPY.strip).toBe("גרסת הדגמה — שום דבר לא נשלח באמת");
    expect(DEMO_COPY.codeNote).toBe("בגרסת ההדגמה הקוד הוא 123456");
    expect(DEMO_COPY.robots).toBe("noindex, nofollow");
  });
});
