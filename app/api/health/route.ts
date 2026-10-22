import { connection } from "next/server";
import { isDemo } from "@/lib/demo";
import { checkServerEnv, dataMode, liveAiInDemo } from "@/lib/env";

/**
 * GET /api/health — בדיקת חיות ל-Vercel/מוניטורינג.
 * לא חושף ערכים: רק האם כל משתני הסביבה הנדרשים קיימים ותקינים.
 */
export async function GET() {
  // מסמן ל-Next (Cache Components) שהתשובה תלויה בבקשה ולא ניתנת ל-prerender.
  await connection();
  const env = checkServerEnv();
  // "demo-memory" / "demo-supabase" במצב הדגמה (lib/demo.ts) — בלי ערכים, רק המצב
  let mode: string;
  let liveAi = false;
  try {
    mode = isDemo() ? `demo-${dataMode()}` : dataMode();
    liveAi = liveAiInDemo(); // the demo with the real model and STT (LIVE_AI=1)
  } catch {
    mode = "misconfigured";
  }

  return Response.json(
    {
      ok: true,
      service: "web",
      time: new Date().toISOString(),
      region: process.env.VERCEL_REGION ?? "local",
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      mode,
      liveAi,
      checks: {
        env: env.ok ? "ok" : mode.startsWith("demo") ? "demo" : "incomplete",
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
