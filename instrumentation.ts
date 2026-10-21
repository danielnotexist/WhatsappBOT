/**
 * Runs once when a server instance starts, before it answers anything (Next.js instrumentation).
 * DEMO_MODE=1 next to outbound keys, or without a stable TOKEN_ENC_KEY, refuses to start with a Hebrew message
 * naming the variables (lib/demo.ts). The same check also runs on every `isDemo()`, so nothing slips past it.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertDemoSafe, isDemo } = await import("./lib/demo");
  assertDemoSafe();
  if (isDemo()) console.info("[demo] DEMO_MODE=1 — מצב הדגמה: כל האינטגרציות מדומות, שום דבר לא נשלח החוצה.");
}
