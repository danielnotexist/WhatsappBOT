import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { StepHeading } from "@/components/auth/step-heading";
import { StepAside, StepBody, StepMascot } from "@/components/auth/step-slots";
import { QrCode } from "@/components/brand/qr-code";
import { WaLinkButton } from "@/components/brand/wa-link-button";
import { BRAND } from "@/lib/brand";
import { publicWaNumber, waMeText } from "@/lib/wa/public-number";
import { NOINDEX } from "@/lib/seo/site";

export const metadata: Metadata = { title: "כניסה דרך וואטסאפ", robots: NOINDEX };

/** "הצטרפת דרך וואטסאפ?" — write "כניסה" to עלזה and get a one-time sign-in link back (round plan §3 row 7). */
export default function LoginWhatsappPage() {
  return (
    <>
      <StepAside>
        <StepHeading tag="דרך וואטסאפ" title={`שולחים ל${BRAND.name} ״כניסה״.`} />
        <p className="mt-3 text-[1.0625rem] lg:mt-5 lg:text-lede lg:text-cream-muted">היא שולחת בחזרה קישור כניסה אישי.</p>
      </StepAside>
      <StepBody>
        <Suspense fallback={null}>
          <WaLinks />
        </Suspense>
        <div className="mt-auto flex items-end justify-between gap-4 pt-8">
          <Link href="/login/email" className="rounded-sm text-[0.9375rem] font-semibold underline underline-offset-3">
            כניסה עם מייל במקום
          </Link>
          <StepMascot pose="listening" />
        </div>
      </StepBody>
    </>
  );
}

async function WaLinks() {
  await connection(); // the number comes from the environment at request time
  const href = waMeText(publicWaNumber(), "כניסה");
  return (
    <div className="flex flex-col gap-7">
      <WaLinkButton href={href} tone="ink" block>
        פתיחת וואטסאפ
      </WaLinkButton>
      <div className="hidden items-center gap-4 lg:flex">
        <QrCode value={href} label="קוד QR לפתיחת וואטסאפ בטלפון" className="size-28 flex-none" />
        <p className="text-[0.9375rem] leading-relaxed">במחשב? סורקים עם הטלפון.</p>
      </div>
    </div>
  );
}
