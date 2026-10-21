import { z } from "zod";
import { EnvError, dataMode, requireEnv } from "@/lib/env";
import { FallbackStt } from "./fallback";
import { MockStt } from "./mock";
import { OpenAiStt } from "./openai";
import { SonioxStt } from "./soniox";
import type { SttProvider } from "./types";

/**
 * STT env (kept out of lib/env.ts's full-app schema because both keys are optional for the app as a whole):
 *   STT_PROVIDER   soniox (default) | openai | mock   (DATA_MODE=memory defaults to mock)
 *   SONIOX_API_KEY required for soniox (already in lib/env.ts)
 *   OPENAI_API_KEY required for openai; with soniox it enables the gpt-4o-transcribe fallback
 * Missing / invalid values throw lib/env's EnvError (Hebrew, names only).
 */
const sttSchema = z.object({
  STT_PROVIDER: z.enum(["soniox", "openai", "mock"], { message: "STT_PROVIDER חייב להיות soniox, openai או mock" }),
  OPENAI_API_KEY: z.string().trim().min(1),
});

type SttEnv = z.infer<typeof sttSchema>;

export function requireSttEnv<K extends keyof SttEnv>(keys: readonly K[], source: Record<string, string | undefined> = process.env): Pick<SttEnv, K> {
  const issues: z.core.$ZodIssue[] = [];
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const r = sttSchema.shape[key].safeParse(source[key]);
    if (r.success) out[key] = r.data;
    else issues.push(...r.error.issues.map((issue) => ({ ...issue, path: [key, ...issue.path] })));
  }
  if (issues.length) throw new EnvError(issues);
  return out as Pick<SttEnv, K>;
}

/** Builds the provider from env (no network calls). */
export function sttFromEnv(source: Record<string, string | undefined> = process.env, fetchImpl?: typeof fetch): SttProvider {
  const raw = source.STT_PROVIDER?.trim();
  const provider = raw ? requireSttEnv(["STT_PROVIDER"], source).STT_PROVIDER : dataMode(source) === "memory" ? "mock" : "soniox";
  if (provider === "mock") return new MockStt();
  if (provider === "openai") return new OpenAiStt({ apiKey: requireSttEnv(["OPENAI_API_KEY"], source).OPENAI_API_KEY, fetchImpl });
  const soniox = new SonioxStt({ apiKey: requireEnv(["SONIOX_API_KEY"], source).SONIOX_API_KEY, fetchImpl });
  const openaiKey = source.OPENAI_API_KEY?.trim();
  return openaiKey ? new FallbackStt([soniox, new OpenAiStt({ apiKey: openaiKey, fetchImpl })]) : soniox;
}
