import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { verifyCodeAction } from "../actions";

export const metadata: Metadata = { title: "קוד אימות" };

/** Step 2 of signup: the 6-digit code. */
export default function CodePage(props: PageProps<"/start/code">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <Suspense fallback={<CodeForm email="" />}>
        <CodeFormWithParams searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function CodeFormWithParams({ searchParams }: { searchParams: PageProps<"/start/code">["searchParams"] }) {
  const sp = await searchParams;
  const email = typeof sp.email === "string" ? sp.email : "";
  const error = typeof sp.error === "string" ? sp.error : "";
  return <CodeForm email={email} error={error} />;
}

function CodeForm({ email, error = "" }: { email: string; error?: string }) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="font-heading text-2xl">הקוד במייל</CardTitle>
        <CardDescription>
          שלחנו קוד בן 6 ספרות ל-<span dir="ltr">{email || "המייל שלך"}</span>. הקוד תקף ל-10 דקות.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={verifyCodeAction} className="flex flex-col gap-3">
          <input type="hidden" name="email" value={email} />
          <label htmlFor="code" className="text-sm font-medium">
            קוד אימות
          </label>
          <Input
            id="code"
            name="code"
            dir="ltr"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder="••••••"
            className="text-center text-2xl tracking-[0.5em]"
            required
            autoFocus
          />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit">כניסה</Button>
          <p className="text-xs text-muted-foreground">
            לא הגיע? כדאי לבדוק בספאם, או{" "}
            <Link href={{ pathname: "/start", query: email ? { email } : {} }} className="underline">
              לבקש קוד חדש
            </Link>{" "}
            (אפשר אחרי דקה).
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
