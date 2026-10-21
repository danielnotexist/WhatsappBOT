import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getSession } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db";
import { DELETE_CONFIRM_WORD, formatDate, planLabel, statusLabel } from "@/lib/account/service";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cancelSubscriptionAction, deleteAccountAction, disconnectAction, signOutAction, unlinkPhoneAction } from "./actions";

export const metadata: Metadata = { title: "האזור האישי" };

/** Personal area skeleton: connections, WhatsApp numbers, subscription, delete account (PLAN §11 milestone 1). */
export default function AccountPage(props: PageProps<"/account">) {
  return (
    <main id="main" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-12">
      <Suspense fallback={<p className="text-muted-foreground">טוען…</p>}>
        <Account searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Account({ searchParams }: { searchParams: PageProps<"/account">["searchParams"] }) {
  await connection(); // the session check compares against the current time
  const session = await getSession();
  if (!session) redirect("/login");
  const db = getDb();
  const user = await db.getUser(session.userId);
  if (!user) redirect("/login");
  const [connections, phones, subscription, usage, sp] = await Promise.all([
    db.listConnections(user.id),
    db.listWaIdentities(user.id),
    db.getSubscription(user.id),
    db.getCurrentUsage(user.id),
    searchParams,
  ]);
  const notice = typeof sp.notice === "string" ? sp.notice : "";
  const error = typeof sp.error === "string" ? sp.error : "";

  return (
    <>
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl">האזור האישי</h1>
          <p className="text-sm text-muted-foreground" dir="ltr">
            {user.email}
          </p>
        </div>
        <form action={signOutAction}>
          <Button variant="ghost" type="submit">
            יציאה
          </Button>
        </form>
      </header>

      {notice ? (
        <p role="status" className="rounded-md bg-muted p-3 text-sm">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>חיבורים</CardTitle>
          <CardDescription>Microsoft 365 ו-Google. ניתוק מוחק את טוקני הגישה אצלנו.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {connections.length === 0 ? <p className="text-sm text-muted-foreground">אין חיבורים עדיין.</p> : null}
          {connections.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
              <div>
                <div className="font-medium">{c.provider === "microsoft" ? "Microsoft 365" : "Google"}</div>
                <div className="text-muted-foreground" dir="ltr">
                  {c.account_email ?? ""}
                </div>
                <div className="text-xs text-muted-foreground">
                  {c.status === "active" ? "פעיל" : c.status === "revoked" ? "נותק" : c.status === "expired" ? "פג תוקף — צריך לחבר מחדש" : "שגיאה"}
                </div>
              </div>
              {c.status === "active" ? (
                <form action={disconnectAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <Button variant="outline" size="sm" type="submit">
                    ניתוק
                  </Button>
                </form>
              ) : null}
            </div>
          ))}
          <div className="flex gap-2">
            <Button disabled size="sm" title="זמין באבן דרך 4">
              חיבור Microsoft 365 (בקרוב)
            </Button>
            <Button disabled size="sm" variant="outline" title="זמין באבן דרך 6">
              חיבור Google (בקרוב)
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>וואטסאפ</CardTitle>
          <CardDescription>מספר אחד לחשבון. להחלפה — ניתוק ואז קישור מחדש.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {phones.filter((p) => p.status !== "unlinked").length === 0 ? (
            <p className="text-sm text-muted-foreground">עוד לא קושר מספר.</p>
          ) : null}
          {phones
            .filter((p) => p.status !== "unlinked")
            .map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                <div>
                  <div className="font-medium" dir="ltr">
                    {p.phone_e164}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    קושר ב-{formatDate(p.linked_at)} · {p.status === "active" ? "פעיל" : "חסום"}
                  </div>
                </div>
                <form action={unlinkPhoneAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <Button variant="outline" size="sm" type="submit">
                    ניתוק
                  </Button>
                </form>
              </div>
            ))}
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/start/ready" />}>
            קישור מספר (קוד חדש)
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>מנוי</CardTitle>
          <CardDescription>ביטול בכל רגע; המנוי נשאר פעיל עד סוף התקופה ששולמה.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-muted-foreground">מסלול</dt>
            <dd>{planLabel(subscription?.plan ?? "trial")}</dd>
            <dt className="text-muted-foreground">מצב</dt>
            <dd>{statusLabel(subscription?.status ?? "trial")}</dd>
            {subscription?.next_charge_at ? (
              <>
                <dt className="text-muted-foreground">{subscription.status === "cancelled" ? "פעיל עד" : "חיוב הבא"}</dt>
                <dd>{formatDate(subscription.next_charge_at)}</dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">הודעות בתקופה</dt>
            <dd>
              {usage ? `${usage.counted_messages} מתוך ${usage.plan_limit}` : "0 מתוך 10 (ניסיון)"}
            </dd>
          </dl>
          {subscription && subscription.status !== "trial" && subscription.status !== "cancelled" ? (
            <form action={cancelSubscriptionAction}>
              <Button variant="outline" size="sm" type="submit">
                ביטול המנוי
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>מחיקת חשבון</CardTitle>
          <CardDescription>
            מוחק לצמיתות את ההודעות, ההעדפות, התזכורות, יומן הפעולות והחיבורים, ומבטל את המנוי. אין שחזור.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={deleteAccountAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="confirm" className="text-sm">
                להקלדה: <b>{DELETE_CONFIRM_WORD}</b>
              </label>
              <Input id="confirm" name="confirm" autoComplete="off" required />
            </div>
            <Button variant="destructive" type="submit">
              למחוק את החשבון
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
