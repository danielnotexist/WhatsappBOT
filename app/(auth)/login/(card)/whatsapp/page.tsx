import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { StepHeading } from "@/components/auth/step-heading";
import { Cta } from "@/components/brand/cta";
import { QrCode } from "@/components/brand/qr-code";
import { BRAND } from "@/lib/brand";
import { publicWaNumber, waMeText } from "@/lib/wa/public-number";

export const metadata: Metadata = { title: "כניסה דרך וואטסאפ" };

/** "הצטרפת דרך וואטסאפ?" — write "כניסה" to עלזה and get a one-time sign-in link back (round plan §3 row 7). */
export default function LoginWhatsappPage() {
  return (
    <div className="flex flex-1 flex-col">
      <StepHeading tag="דרך וואטסאפ" title={`שולחים ל${BRAND.name} `} light="״כניסה״" after="." />
      <p className="mt-3 text-lede">היא שולחת בחזרה קישור כניסה אישי, שעובד פעם אחת ל-10 דקות.</p>
      <ol className="mt-6 flex list-decimal flex-col gap-2 ps-5 text-[1rem]">
        <li>פותחים את השיחה עם {BRAND.name} בוואטסאפ</li>
        <li>שולחים את המילה ״כניסה״</li>
        <li>לוחצים על הקישור שמגיע — ונכנסים לאזור האישי</li>
      </ol>
      <Suspense fallback={null}>
        <WaLinks />
      </Suspense>
      <p className="mt-auto pt-8 text-center text-[0.9375rem]">
        <Link href="/login/email" className="font-semibold underline underline-offset-3">
          כניסה עם מייל במקום
        </Link>
      </p>
    </div>
  );
}

async function WaLinks() {
  await connection(); // the number comes from the environment at request time
  const href = waMeText(publicWaNumber(), "כניסה");
  return (
    <div className="mt-8 flex flex-col gap-6">
      <Cta href={href} external tone="ink" block>
        פתיחת וואטסאפ
      </Cta>
      <div className="hidden items-center gap-4 lg:flex">
        <QrCode value={href} label="קוד QR לפתיחת וואטסאפ בטלפון" className="size-28 flex-none" />
        <p className="text-[0.9375rem]">במחשב? סורקים עם הטלפון, והשיחה נפתחת עם המילה ״כניסה״.</p>
      </div>
    </div>
  );
}
