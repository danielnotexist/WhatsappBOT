import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ReadyStep } from "@/components/auth/ready-step";
import { getSession } from "@/lib/auth/current-user";
import { issueLinkToken, waMeUrl } from "@/lib/auth/link-token";
import { getDb } from "@/lib/db";
import { publicWaNumber } from "@/lib/wa/public-number";
import { switchEmailAction } from "../actions";

export const metadata: Metadata = { title: "העוזרת שלך מוכנה" };

/** Step 6: confetti + the wa.me link with a one-time token (and a QR on desktop). */
export default function StartReadyPage(props: PageProps<"/start/ready">) {
  return (
    <Suspense fallback={null}>
      <Ready searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Ready({ searchParams }: { searchParams: PageProps<"/start/ready">["searchParams"] }) {
  await connection(); // the token's expiry depends on the current time — never prerender
  const session = await getSession();
  if (!session) redirect("/start/email");
  const [token, sp] = await Promise.all([issueLinkToken(getDb(), session.userId), searchParams]);
  return (
    <ReadyStep
      waHref={waMeUrl(publicWaNumber(), token.token)}
      token={token.token}
      connected={typeof sp.connected === "string" ? sp.connected : null}
      signOutAction={switchEmailAction}
    />
  );
}
