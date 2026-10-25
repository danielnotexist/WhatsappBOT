import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ConnectError, ConnectStep, OneAccountNote } from "@/components/auth/connect-step";
import { getSession } from "@/lib/auth/current-user";
import { effectivePlan, entitlements, primaryProvider } from "@/lib/billing/plans";
import { getDb } from "@/lib/db";
import { createConnectLinkToken } from "@/lib/ms/connect-link";
import { NOINDEX } from "@/lib/seo/site";

export const metadata: Metadata = { title: "חיבור המייל", robots: NOINDEX };

/**
 * Step 4: connect Microsoft / Gmail or skip. The card is static (drawn at once, mounted once); only the session check
 * and the Microsoft callback's `?error=` are request-time, streamed into its notice slot.
 */
export default function StartConnectPage(props: PageProps<"/start/connect">) {
  return (
    <ConnectStep
      notice={
        <Suspense fallback={null}>
          <WithSession searchParams={props.searchParams} />
        </Suspense>
      }
    />
  );
}

/**
 * Signed-in only (else back to the email card); after a failed round-trip, the reason and the IT-admin mail. An account
 * already connected on a one-account plan (back to this step): which one, and that a second one is pro — the start
 * route refuses it as well (lib/connections/plan-gate.ts).
 */
async function WithSession({ searchParams }: { searchParams: PageProps<"/start/connect">["searchParams"] }) {
  await connection(); // session expiry and the admin link's expiry use the current time
  const session = await getSession();
  if (!session) redirect("/start/email");
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error.slice(0, 300) : "";
  if (!error) {
    const db = getDb();
    const [sub, connections] = await Promise.all([db.getSubscription(session.userId), db.listConnections(session.userId)]);
    const connected = primaryProvider(connections);
    return connected && entitlements(effectivePlan(sub, new Date())).maxProviders < 2 ? <OneAccountNote connected={connected} /> : null;
  }
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  // the IT admin opens this without our session: a one-time 30-minute start link for the tenant-wide consent
  const adminLink =
    sp.admin === "1"
      ? new URL(`/api/auth/microsoft/start?admin=1&t=${encodeURIComponent(createConnectLinkToken(session.userId, "microsoft"))}`, appUrl).toString()
      : null;
  return <ConnectError error={error} adminLink={adminLink} />;
}
