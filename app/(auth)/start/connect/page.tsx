import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSession } from "@/lib/auth/current-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "חיבור" };

/**
 * Step 3: connect Microsoft 365 (first) or Google, or skip (PLAN §1). The OAuth routes arrive in Milestone 4/6;
 * until then the buttons link to the (not yet existing) start endpoints and are disabled.
 */
export default function ConnectPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <Suspense fallback={null}>
        <ConnectCard />
      </Suspense>
    </main>
  );
}

async function ConnectCard() {
  const session = await getSession();
  if (!session) redirect("/start");
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="font-heading text-2xl">לחבר את המייל והיומן</CardTitle>
        <CardDescription>
          חיבור ישיר ומאובטח (OAuth). הסיסמה נשארת אצל Microsoft/Google. אפשר לדלג ולחבר אחר כך, מתוך השיחה.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button disabled title="זמין באבן דרך 4">
          חיבור Microsoft 365 (בקרוב)
        </Button>
        <Button variant="outline" disabled title="זמין באבן דרך 6">
          חיבור Google (בקרוב)
        </Button>
        <Button variant="ghost" nativeButton={false} render={<Link href="/start/link" />}>
          דילוג — להמשיך לוואטסאפ
        </Button>
      </CardContent>
    </Card>
  );
}
