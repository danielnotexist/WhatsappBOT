import { connection } from "next/server";
import { checkServerEnv } from "@/lib/env";

/**
 * GET /api/health — בדיקת חיות ל-Vercel/מוניטורינג.
 * לא חושף ערכים: רק האם כל משתני הסביבה הנדרשים קיימים ותקינים.
 */
export async function GET() {
  // מסמן ל-Next (Cache Components) שהתשובה תלויה בבקשה ולא ניתנת ל-prerender.
  await connection();
  const env = checkServerEnv();

  return Response.json(
    {
      ok: true,
      service: "web",
      time: new Date().toISOString(),
      region: process.env.VERCEL_REGION ?? "local",
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      checks: {
        env: env.ok ? "ok" : "incomplete",
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
