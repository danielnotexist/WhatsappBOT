import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { WaLinkButton } from "@/components/brand/wa-link-button";
import { isPayResult, PAY_RESULTS } from "@/lib/billing/result";
import { BRAND } from "@/lib/brand";
import { publicWaNumber } from "@/lib/wa/public-number";
import { PayHeading, PayPaper, PayStage, StageLink } from "../_components/pay-ui";

export const metadata: Metadata = { title: "תשלום", robots: { index: false, follow: false } };

/**
 * Where HYP sends a browser that is not signed in here (a payment or card link from WhatsApp, opened on the phone):
 * the result of the payment or the card update, and the way back to WhatsApp. The text is fixed per result code
 * (lib/billing/result.ts); nothing from the URL is shown.
 */
export default function PayDonePage(props: PageProps<"/pay/done">) {
  return (
    <PayStage>
      <Suspense
        fallback={
          <p role="status" className="pt-12 text-cream-muted">
            טוען…
          </p>
        }
      >
        <Done searchParams={props.searchParams} />
      </Suspense>
    </PayStage>
  );
}

async function Done({ searchParams }: { searchParams: PageProps<"/pay/done">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const code = isPayResult(sp.r) ? sp.r : null;
  const result = code ? PAY_RESULTS[code] : { ok: true, tag: "אפשר לחזור לשיחה.", title: "חזרה לוואטסאפ", text: `${BRAND.name} מחכה בוואטסאפ.` };
  let waHref: string | null = null;
  try {
    waHref = `https://wa.me/${publicWaNumber()}`;
  } catch {
    waHref = null; // no public number configured: the page still says what happened
  }
  return (
    <>
      <PayHeading tag={result.tag} title={result.title} />
      <PayPaper pose={result.ok ? "celebrating" : "thinking"}>
        <p role={result.ok ? "status" : "alert"} className="text-[1.125rem] leading-relaxed">
          {result.text}
        </p>
        {waHref ? (
          <WaLinkButton href={waHref} tone="ink" block className="mt-7">
            חזרה לוואטסאפ
          </WaLinkButton>
        ) : null}
      </PayPaper>
      <p className="mt-8">
        <StageLink href="/account">לאזור האישי</StageLink>
      </p>
    </>
  );
}
