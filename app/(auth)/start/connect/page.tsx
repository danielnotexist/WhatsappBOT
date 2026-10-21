import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ConnectStep } from "@/components/auth/connect-step";
import { getSession } from "@/lib/auth/current-user";
import { createConnectLinkToken } from "@/lib/ms/connect-link";

export const metadata: Metadata = { title: "חיבור המייל" };

/** Step 4: connect Microsoft / Gmail or skip. Signed-in only; the Microsoft callback may come back with `?error=`. */
export default function StartConnectPage(props: PageProps<"/start/connect">) {
  return (
    <Suspense fallback={<ConnectStep />}>
      <WithSession searchParams={props.searchParams} />
    </Suspense>
  );
}

async function WithSession({ searchParams }: { searchParams: PageProps<"/start/connect">["searchParams"] }) {
  await connection(); // session expiry and the admin link's expiry use the current time
  const session = await getSession();
  if (!session) redirect("/start/email");
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error.slice(0, 300) : "";
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  // the IT admin opens this without our session: a one-time 30-minute start link for the tenant-wide consent
  const adminLink =
    error && sp.admin === "1"
      ? new URL(`/api/auth/microsoft/start?admin=1&t=${encodeURIComponent(createConnectLinkToken(session.userId, "microsoft"))}`, appUrl).toString()
      : null;
  return <ConnectStep error={error} adminLink={adminLink} />;
}
