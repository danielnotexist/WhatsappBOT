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

export const metadata: Metadata = { title: "כניסה דרך וואטסאפ" };

/** "הצטרפת דרך וואטסאפ?" — write "כניסה" to עלזה and get a one-time sign-in link back (round plan §3 row 7). */
export default function LoginWhatsappPage() {
  return (
    <>
      <StepAside>
        <StepHeading tag="דרך וואטסאפ" title={`שולחים ל${BRAND.name} ״כניסה״.`} />
        <p className="mt-3 text-[1.0625rem] lg:mt-5 lg:text-lede lg:text-cream-muted">היא שולחת בחזרה קישור כניסה אישי, שעובד פעם אחת ל-10 דקות.</p>
        <ol className="mt-6 flex list-decimal flex-col gap-2 ps-5 text-[1rem] leading-snug marker:font-heading marker:font-bold lg:mt-8">
          <li className="ps-1">פותחים את השיחה עם {BRAND.name} בוואטסאפ</li>
          <li className="ps-1">שולחים את המילה ״כניסה״</li>
          <li className="ps-1">לוחצים על הקישור שמגיע, ונכנסים לאזור האישי</li>
        </ol>
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
        <p className="text-[0.9375rem] leading-relaxed">במחשב? סורקים עם הטלפון, והשיחה נפתחת עם המילה ״כניסה״.</p>
      </div>
    </div>
  );
}
