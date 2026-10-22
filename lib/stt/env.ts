import { z } from "zod";
import { isDemo } from "@/lib/demo";
import { EnvError, requireEnv, sttMocked } from "@/lib/env";
import { FallbackStt } from "./fallback";
import { MockStt } from "./mock";
import { OpenAiStt } from "./openai";
import { OPENROUTER_STT_FALLBACK_MODEL, OPENROUTER_STT_MODEL, OpenRouterStt } from "./openrouter";
import { SonioxStt } from "./soniox";
import type { SttProvider } from "./types";

/**
 * STT env (kept out of lib/env.ts's full-app schema because these keys are optional for the app as a whole):
 *   STT_PROVIDER        openrouter | soniox | openai | mock. Unset: mock in DATA_MODE=memory; otherwise openrouter
 *                       (also when OPENROUTER_API_KEY is missing → a Hebrew EnvError naming it), except that a deployment
 *                       with only SONIOX_API_KEY keeps Soniox. DEMO_MODE=1 is mock, except with LIVE_AI=1: then OpenRouter
 *                       (the only real STT the demo uses; STT_PROVIDER=mock keeps it mocked).
 *   OPENROUTER_API_KEY  required for openrouter (already in lib/env.ts — the same key also serves images)
 *   STT_MODEL           OpenRouter model slug, default deepgram/nova-3
 *   STT_FALLBACK_MODEL  OpenRouter model slug tried when the first fails or hears nothing, default openai/gpt-transcribe;
 *                       "none" turns the fallback off
 *   SONIOX_API_KEY      required for soniox
 *   OPENAI_API_KEY      required for openai; with soniox it enables the gpt-4o-transcribe fallback
 * Missing / invalid values throw lib/env's EnvError (Hebrew, names only).
 */
const modelSlug = z
  .string()
  .trim()
  .regex(/^[a-z0-9][\w.-]*\/[\w.:-]+$/i, { message: "מזהה מודל של OpenRouter בצורה ספק/מודל, למשל deepgram/nova-3" });

const sttSchema = z.object({
  STT_PROVIDER: z.enum(["openrouter", "soniox", "openai", "mock"], { message: "STT_PROVIDER חייב להיות openrouter, soniox, openai או mock" }),
  STT_MODEL: modelSlug,
  STT_FALLBACK_MODEL: z.union([z.literal("none"), modelSlug], { message: "STT_FALLBACK_MODEL חייב להיות מזהה מודל של OpenRouter או none" }),
  SONIOX_API_KEY: z.string().trim().min(1),
  OPENAI_API_KEY: z.string().trim().min(1),
});

type SttEnv = z.infer<typeof sttSchema>;
type Source = Record<string, string | undefined>;

export function requireSttEnv<K extends keyof SttEnv>(keys: readonly K[], source: Source = process.env): Pick<SttEnv, K> {
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

const isSet = (source: Source, key: string) => Boolean(source[key]?.trim());

function defaultProvider(source: Source): SttEnv["STT_PROVIDER"] {
  if (sttMocked(source)) return "mock";
  if (!isSet(source, "OPENROUTER_API_KEY") && isSet(source, "SONIOX_API_KEY")) return "soniox"; // a pre-OpenRouter setup keeps working
  return "openrouter";
}

/** deepgram/nova-3 → openai/gpt-transcribe, both through the one OpenRouter key. */
function openRouterFromEnv(source: Source, fetchImpl?: typeof fetch): SttProvider {
  const { OPENROUTER_API_KEY: apiKey } = requireEnv(["OPENROUTER_API_KEY"], source);
  const set = (["STT_MODEL", "STT_FALLBACK_MODEL"] as const).filter((k) => isSet(source, k));
  const env: Partial<Pick<SttEnv, "STT_MODEL" | "STT_FALLBACK_MODEL">> = requireSttEnv(set, source);
  const model = env.STT_MODEL ?? OPENROUTER_STT_MODEL;
  const fallback = env.STT_FALLBACK_MODEL ?? OPENROUTER_STT_FALLBACK_MODEL;
  const primary = new OpenRouterStt({ apiKey, model, fetchImpl });
  if (fallback === "none" || fallback === model) return primary;
  return new FallbackStt([primary, new OpenRouterStt({ apiKey, model: fallback, fetchImpl })]);
}

/** Builds the provider from env (no network calls). */
export function sttFromEnv(source: Source = process.env, fetchImpl?: typeof fetch): SttProvider {
  if (isDemo(source)) {
    // the demo calls no paid STT, whatever STT_PROVIDER says — except LIVE_AI=1, and then only OpenRouter (or mock on request)
    if (sttMocked(source) || source.STT_PROVIDER?.trim() === "mock") return new MockStt();
    return openRouterFromEnv(source, fetchImpl);
  }
  const provider = isSet(source, "STT_PROVIDER") ? requireSttEnv(["STT_PROVIDER"], source).STT_PROVIDER : defaultProvider(source);
  switch (provider) {
    case "mock":
      return new MockStt();
    case "openai":
      return new OpenAiStt({ apiKey: requireSttEnv(["OPENAI_API_KEY"], source).OPENAI_API_KEY, fetchImpl });
    case "soniox": {
      const soniox = new SonioxStt({ apiKey: requireSttEnv(["SONIOX_API_KEY"], source).SONIOX_API_KEY, fetchImpl });
      const openaiKey = source.OPENAI_API_KEY?.trim();
      return openaiKey ? new FallbackStt([soniox, new OpenAiStt({ apiKey: openaiKey, fetchImpl })]) : soniox;
    }
    case "openrouter":
      return openRouterFromEnv(source, fetchImpl);
  }
}
