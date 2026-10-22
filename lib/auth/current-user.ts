import "server-only";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { isDemo } from "@/lib/demo";
import { restoreDemoUser } from "./demo-user";
import { SESSION_COOKIE, verifySessionToken, type Session } from "./session";

/**
 * The signed-in session from the request cookie, or null. Request-time API — call inside Suspense / actions.
 * Demo on the memory store: when this serverless instance never saw the session's user, it is recreated from the
 * signed claims first, so /account, /start/ready and /pay work on whichever instance answers.
 */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const session = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (session?.email && isDemo()) await restoreDemoUser(getDb(), session);
  return session;
}

/**
 * Whether the request carries a valid session cookie. Signature and expiry only — no database read and no demo
 * restore — for the headers that switch "כניסה" to "לאזור האישי" (a request-time hole: call inside Suspense).
 */
export async function hasSession(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value) !== null;
}

/**
 * For pages that load a user by an id from elsewhere (the /pay link, the payment return): in the demo on the memory
 * store, recreate the signed-in user on this instance first. No-op outside the demo.
 */
export async function ensureDemoSessionUser(): Promise<void> {
  if (isDemo()) await getSession();
}
