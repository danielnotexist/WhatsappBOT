import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ReadyLink, ReadyLinkPending, ReadyStep } from "@/components/auth/ready-step";
import { getSession } from "@/lib/auth/current-user";
import { issueLinkToken, waMeUrl } from "@/lib/auth/link-token";
import { getDb } from "@/lib/db";
import { publicWaNumber } from "@/lib/wa/public-number";
import { switchEmailAction } from "../actions";
import { NOINDEX } from "@/lib/seo/site";

export const metadata: Metadata = { title: "העוזרת שלך מוכנה", robots: NOINDEX };

/**
 * Step 6: the step is static and drawn at once; the wa.me link with its one-time token (and the QR, the confetti) is
 * made per request and streams into it, with the same block as a placeholder until then.
 */
export default function StartReadyPage(props: PageProps<"/start/ready">) {
  return (
    <ReadyStep
      signOutAction={switchEmailAction}
      link={
        <Suspense fallback={<ReadyLinkPending />}>
          <Ready searchParams={props.searchParams} />
        </Suspense>
      }
    />
  );
}

async function Ready({ searchParams }: { searchParams: PageProps<"/start/ready">["searchParams"] }) {
  await connection(); // the token's expiry depends on the current time — never prerender
  const session = await getSession();
  if (!session) redirect("/start/email");
  const [token, sp] = await Promise.all([issueLinkToken(getDb(), session.userId), searchParams]);
  return <ReadyLink waHref={waMeUrl(publicWaNumber(), token.token)} token={token.token} connected={typeof sp.connected === "string" ? sp.connected : null} />;
}
