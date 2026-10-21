import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getSession } from "@/lib/auth/current-user";
import { issueLinkToken, linkMessage, waMeUrl } from "@/lib/auth/link-token";
import { getDb } from "@/lib/db";
import { requireEnv } from "@/lib/env";
import { PRODUCT_NAME } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "קישור לוואטסאפ" };

/**
 * Step 4: "the assistant is ready" + wa.me link with the one-time token (PLAN §1).
 * The confetti and the QR image belong to the chosen design; here only the working link.
 */
export default function LinkPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <Suspense fallback={null}>
        <LinkCard />
      </Suspense>
    </main>
  );
}

async function LinkCard() {
  await connection(); // the token expiry uses the current time — never prerender this card
  const session = await getSession();
  if (!session) redirect("/start");
  const token = await issueLinkToken(getDb(), session.userId);
  const publicNumber = process.env.DATA_MODE === "memory" && !process.env.WA_PUBLIC_NUMBER ? "972500000000" : requireEnv(["WA_PUBLIC_NUMBER"]).WA_PUBLIC_NUMBER;
  const href = waMeUrl(publicNumber, token.token);
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="font-heading text-2xl">העוזר מוכן</CardTitle>
        <CardDescription>
          הוא רואה רק מה ששולחים לו בשיחה — לא את שאר הוואטסאפ שלך. לחיצה אחת מקשרת את המספר שלך לחשבון.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button nativeButton={false} render={<a href={href} target="_blank" rel="noopener noreferrer" />}>
          לפתוח את {PRODUCT_NAME} בוואטסאפ
        </Button>
        <p className="text-sm text-muted-foreground">
          במחשב: לסרוק את ה-QR (יתווסף עם העיצוב), או לשלוח ידנית את ההודעה:
        </p>
        <p className="rounded-md bg-muted p-3 text-sm select-all" dir="rtl">
          {linkMessage(token.token)}
        </p>
        <p className="text-xs text-muted-foreground">
          הקוד <span dir="ltr">{token.token}</span> תקף ל-15 דקות ולפעם אחת. פג? רענון הדף מפיק קוד חדש.
        </p>
        <Button variant="ghost" nativeButton={false} render={<Link href="/account" />}>
          לאזור האישי
        </Button>
      </CardContent>
    </Card>
  );
}
