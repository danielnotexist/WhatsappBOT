import { Suspense, type ReactNode } from "react";
import { hasSession } from "@/lib/auth/current-user";

/**
 * A request-time hole that picks what to show by the session cookie. Everything around it stays prerendered
 * (cacheComponents): the static shell carries `signedOut`, and the cookie decides when the request streams in.
 */
export function BySession({
  signedIn,
  signedOut = null,
}: {
  signedIn: ReactNode;
  signedOut?: ReactNode;
}) {
  return (
    <Suspense fallback={signedOut}>
      <SessionSwitch signedIn={signedIn} signedOut={signedOut} />
    </Suspense>
  );
}

/** Exported for tests; use <BySession>. */
export async function SessionSwitch({
  signedIn,
  signedOut,
}: {
  signedIn: ReactNode;
  signedOut: ReactNode;
}) {
  return (await hasSession()) ? signedIn : signedOut;
}
