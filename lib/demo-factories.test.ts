import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockProvider } from "@/lib/ai/mock";
import { getAiProvider } from "@/lib/ai";
import { getDb } from "@/lib/db";
import { MemoryDb } from "@/lib/db/memory";
import { SupabaseDb } from "@/lib/db/supabase";
import { DemoConfigError } from "@/lib/demo";
import { setGlobalSingleton } from "@/lib/global-singleton";
import { getGoogleConfig, getGoogleFetch } from "@/lib/google";
import { getHyp } from "@/lib/hyp";
import { MockHypGateway } from "@/lib/hyp/client";
import { getMailer } from "@/lib/mail";
import { ConsoleMailer } from "@/lib/mail/console";
import { getGraphFetch, getMsConfig } from "@/lib/ms";
import { getQueue } from "@/lib/queue";
import { LocalQueue } from "@/lib/queue/local";
import { getSttProvider } from "@/lib/stt";
import { MockStt } from "@/lib/stt/mock";
import { getWaSender } from "@/lib/wa";
import { DEV_PUBLIC_NUMBER, publicWaNumber } from "@/lib/wa/public-number";
import { RecordingWaSender } from "@/lib/wa/sender";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn(() => ({ from: () => ({}) })) }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

const SINGLETONS = ["db", "wa-sender", "ai-provider", "mailer", "hyp", "stt-provider", "queue", "graph-fixture", "google-fixture"];
const reset = () => SINGLETONS.forEach((n) => setGlobalSingleton(n, undefined));

/** Keys the demo may sit next to (it never uses them) — none of them can send anything on its own. */
const HARMLESS_KEYS = {
  ANTHROPIC_API_KEY: "sk-ant-real",
  SONIOX_API_KEY: "soniox-real",
  OPENAI_API_KEY: "sk-openai-real",
  STT_PROVIDER: "soniox",
  MS_CLIENT_ID: "real-ms-client",
  GOOGLE_CLIENT_ID: "real-google-client",
  WA_PHONE_NUMBER_ID: "123",
  HYP_MASOF: "0010000000",
  QSTASH_CURRENT_SIGNING_KEY: "sig",
};

function stubDemo(extra: Record<string, string> = {}) {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DEMO_MODE", "1");
  vi.stubEnv("TOKEN_ENC_KEY", Buffer.alloc(32, 9).toString("base64"));
  vi.stubEnv("APP_URL", "https://alze-demo.vercel.app");
  for (const [k, v] of Object.entries({ ...HARMLESS_KEYS, ...extra })) vi.stubEnv(k, v);
}

describe("DEMO_MODE=1 forces every integration factory to its mock", () => {
  beforeEach(reset);
  afterEach(() => {
    vi.unstubAllEnvs();
    reset();
    createClient.mockClear();
  });

  function expectAllMocked() {
    expect(getWaSender()).toBeInstanceOf(RecordingWaSender);
    expect(getAiProvider()).toBeInstanceOf(MockProvider);
    expect(getMailer()).toBeInstanceOf(ConsoleMailer);
    expect(getHyp()).toBeInstanceOf(MockHypGateway);
    expect(getSttProvider()).toBeInstanceOf(MockStt);
    expect(getQueue()).toBeInstanceOf(LocalQueue);
    expect(getMsConfig().clientId).toBe("memory-client");
    expect(getGraphFetch()).toBeTypeOf("function");
    expect(getGoogleConfig().clientId).toBe("memory-google-client");
    expect(getGoogleFetch()).toBeTypeOf("function");
    expect(publicWaNumber()).toBe(DEV_PUBLIC_NUMBER);
  }

  it("demo + memory (no Supabase): memory db in production, all mocks, even with keys present", () => {
    stubDemo();
    expect(getDb()).toBeInstanceOf(MemoryDb);
    expectAllMocked();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("demo + Supabase: the real data layer (stateless supabase-js client), still all mocks", () => {
    stubDemo({ SUPABASE_URL: "https://abc.supabase.co", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service-role" });
    expect(getDb()).toBeInstanceOf(SupabaseDb);
    // serverless-safe: HTTPS client, no session persistence / token refresh timers, no long-lived connection
    expect(createClient).toHaveBeenCalledWith("https://abc.supabase.co", "service-role", { auth: { persistSession: false, autoRefreshToken: false } });
    expectAllMocked();
  });

  it("a real WA_PUBLIC_NUMBER is kept for the wa.me links", () => {
    stubDemo({ WA_PUBLIC_NUMBER: "972501112233" });
    expect(publicWaNumber()).toBe("972501112233");
  });

  it("an outbound key makes every factory refuse (fail fast, Hebrew)", () => {
    stubDemo({ WA_ACCESS_TOKEN: "EAAG-real" });
    expect(() => getWaSender()).toThrow(DemoConfigError);
    expect(() => getDb()).toThrow(/WA_ACCESS_TOKEN/);
    expect(() => getMailer()).toThrow(/מצב ההדגמה/);
  });

  it("without DEMO_MODE the same keys mean the real clients (the switch is the demo, not the keys)", () => {
    vi.stubEnv("TOKEN_ENC_KEY", Buffer.alloc(32, 9).toString("base64"));
    vi.stubEnv("QSTASH_TOKEN", "qstash-real");
    for (const [k, v] of Object.entries(HARMLESS_KEYS)) vi.stubEnv(k, v);
    expect(getAiProvider()).not.toBeInstanceOf(MockProvider);
    expect(getQueue()).not.toBeInstanceOf(LocalQueue);
  });
});
