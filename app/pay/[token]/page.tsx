import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ensureDemoSessionUser } from "@/lib/auth/current-user";
import { verifyPayLinkToken } from "@/lib/billing/pay-link";
import { PLANS } from "@/lib/billing/plans";
import { getDb } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { startPaymentAction } from "./actions";

export const metadata: Metadata = { title: "תשלום" };

/** Personal payment page reached from the WhatsApp link (no session needed). Placeholder UI. */
export default function PayPage(props: PageProps<"/pay/[token]">) {
  return (
    <main id="main" className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <Suspense fallback={null}>
        <PayCard params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function PayCard({ params, searchParams }: { params: PageProps<"/pay/[token]">["params"]; searchParams: PageProps<"/pay/[token]">["searchParams"] }) {
  await connection();
  const { token } = await params;
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : "";
  const link = verifyPayLinkToken(token);
  await ensureDemoSessionUser();
  const user = link ? await getDb().getUser(link.userId) : null;
  if (!link || !user) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">הקישור לא בתוקף</CardTitle>
          <CardDescription>קישור התשלום תקף לשבוע. אפשר לבקש קישור חדש בשיחה עם העוזר (&quot;תשלום&quot;).</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const sub = await getDb().getSubscription(user.id);
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="font-heading text-2xl">{sub && sub.status !== "trial" ? "עדכון אמצעי תשלום" : "בחירת מסלול"}</CardTitle>
        <CardDescription>
          המחירים כוללים מע״מ. חיוב חודשי אוטומטי דרך HYP, חשבונית מס-קבלה במייל, ביטול בכל רגע מהאזור האישי או מהשיחה.
          <span className="block" dir="ltr">
            {user.email}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error ? (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {(["basic", "pro"] as const).map((plan) => (
          <form key={plan} action={startPaymentAction} className="flex items-center justify-between gap-3 rounded-md border p-4">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="plan" value={plan} />
            <div>
              <div className="font-medium">
                {PLANS[plan].nameHe} — {PLANS[plan].priceIls} ₪ לחודש
              </div>
              <div className="text-sm text-muted-foreground">{plan === "basic" ? "עד 750 הודעות בחודש, סיכום בוקר, תזכורות, הקלטות" : "עד 3,000 הודעות, סוכנים מובנים, אוטומציות, היסטוריה של שנה"}</div>
            </div>
            <Button type="submit" variant={plan === "pro" ? "default" : "outline"}>
              לתשלום
            </Button>
          </form>
        ))}
        <p className="text-xs text-muted-foreground">בלחיצה על &quot;לתשלום&quot; מאושרים תנאי השימוש, כולל חיוב חוזר חודשי עד לביטול.</p>
      </CardContent>
    </Card>
  );
}
