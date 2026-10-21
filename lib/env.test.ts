import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { EnvError, SERVER_ENV_KEYS, checkServerEnv, dataMode, parseServerEnv, requireEnv } from "./env";

const validEnv: Record<string, string> = {
  NODE_ENV: "test",
  APP_URL: "https://app.example.co.il",
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  TOKEN_ENC_KEY: randomBytes(32).toString("base64"),
  WA_PHONE_NUMBER_ID: "123",
  WA_PUBLIC_NUMBER: "972501234567",
  WA_ACCESS_TOKEN: "EAAG...",
  WA_VERIFY_TOKEN: "verify",
  META_APP_SECRET: "secret",
  MS_CLIENT_ID: "ms-id",
  MS_CLIENT_SECRET: "ms-secret",
  GOOGLE_CLIENT_ID: "g-id",
  GOOGLE_CLIENT_SECRET: "g-secret",
  ANTHROPIC_API_KEY: "sk-ant",
  OPENROUTER_API_KEY: "or",
  HYP_MASOF: "0010000000",
  HYP_KEY: "hyp-key",
  HYP_PASSP: "hyp-passp",
  QSTASH_TOKEN: "qs",
  QSTASH_CURRENT_SIGNING_KEY: "sig1",
  QSTASH_NEXT_SIGNING_KEY: "sig2",
  RESEND_API_KEY: "re_",
};

describe("lib/env", () => {
  it("parses a complete environment and applies defaults", () => {
    const env = parseServerEnv(validEnv);
    expect(env.APP_URL).toBe("https://app.example.co.il");
    expect(env.MS_TENANT).toBe("common");
    expect(env.NODE_ENV).toBe("test");
  });

  it("lists every variable from the plan", () => {
    for (const key of [
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "TOKEN_ENC_KEY",
      "WA_PHONE_NUMBER_ID",
      "WA_PUBLIC_NUMBER",
      "WA_ACCESS_TOKEN",
      "WA_VERIFY_TOKEN",
      "META_APP_SECRET",
      "MS_CLIENT_ID",
      "MS_CLIENT_SECRET",
      "MS_TENANT",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "ANTHROPIC_API_KEY",
      "OPENROUTER_API_KEY",
      "HYP_MASOF",
      "HYP_KEY",
      "HYP_PASSP",
      "QSTASH_TOKEN",
      "QSTASH_CURRENT_SIGNING_KEY",
      "QSTASH_NEXT_SIGNING_KEY",
      "RESEND_API_KEY",
      "APP_URL",
    ]) {
      expect(SERVER_ENV_KEYS).toContain(key);
    }
    // transcription goes through OPENROUTER_API_KEY; Soniox / OpenAI are optional (lib/stt/env.ts)
    expect(SERVER_ENV_KEYS).not.toContain("SONIOX_API_KEY");
  });

  it("reports missing variables by name only", () => {
    const partial: Record<string, string | undefined> = { ...validEnv };
    delete partial.SUPABASE_URL;
    delete partial.RESEND_API_KEY;
    const check = checkServerEnv(partial);
    expect(check.ok).toBe(false);
    expect(check.missing).toEqual(expect.arrayContaining(["SUPABASE_URL", "RESEND_API_KEY"]));
    expect(check.missing.join()).not.toContain(validEnv.TOKEN_ENC_KEY);
  });

  it("rejects a TOKEN_ENC_KEY that is not 32 base64 bytes", () => {
    expect(() => parseServerEnv({ ...validEnv, TOKEN_ENC_KEY: "short" })).toThrow(EnvError);
    expect(() =>
      parseServerEnv({ ...validEnv, TOKEN_ENC_KEY: randomBytes(16).toString("base64") }),
    ).toThrow(/TOKEN_ENC_KEY/);
  });

  it("rejects an APP_URL that is not a URL", () => {
    expect(() => parseServerEnv({ ...validEnv, APP_URL: "localhost" })).toThrow(EnvError);
  });

  it("requireEnv checks only the requested keys and names the missing ones in Hebrew", () => {
    expect(requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"], validEnv).SUPABASE_URL).toBe(
      "https://abc.supabase.co",
    );
    try {
      requireEnv(["RESEND_API_KEY", "APP_URL"], { APP_URL: "https://x.co.il" });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(EnvError);
      expect((e as EnvError).missing).toEqual(["RESEND_API_KEY"]);
      expect((e as EnvError).message).toContain("משתני סביבה חסרים");
    }
  });

  it("dataMode defaults to supabase and forbids memory in production", () => {
    expect(dataMode({})).toBe("supabase");
    expect(dataMode({ DATA_MODE: "memory", NODE_ENV: "test" })).toBe("memory");
    expect(() => dataMode({ DATA_MODE: "memory", NODE_ENV: "production" })).toThrow(/production/);
    expect(() => dataMode({ DATA_MODE: "redis" })).toThrow();
  });
});
