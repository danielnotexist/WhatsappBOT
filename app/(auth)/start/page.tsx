import type { Metadata } from "next";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requestCodeAction } from "./actions";

export const metadata: Metadata = { title: "התחלה" };

/**
 * Step 1 of signup: email → 6-digit code by mail (PLAN §1). Placeholder UI until a design direction is chosen.
 * searchParams is request-time, so the form sits inside <Suspense> (Cache Components).
 */
export default function StartPage(props: PageProps<"/start">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <Suspense fallback={<StartForm />}>
        <StartFormWithParams searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function StartFormWithParams({ searchParams }: { searchParams: PageProps<"/start">["searchParams"] }) {
  const sp = await searchParams;
  const email = typeof sp.email === "string" ? sp.email : "";
  const error = typeof sp.error === "string" ? sp.error : "";
  return <StartForm email={email} error={error} />;
}

function StartForm({ email = "", error = "" }: { email?: string; error?: string }) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="font-heading text-2xl">נתחיל</CardTitle>
        <CardDescription>נשלח קוד בן 6 ספרות למייל. בלי סיסמה, בלי טפסים.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={requestCodeAction} className="flex flex-col gap-3">
          <label htmlFor="email" className="text-sm font-medium">
            כתובת המייל של העסק
          </label>
          <Input
            id="email"
            type="email"
            name="email"
            dir="ltr"
            inputMode="email"
            autoComplete="email"
            placeholder="name@company.co.il"
            className="text-end placeholder:text-end"
            defaultValue={email}
            required
            maxLength={254}
          />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit">שליחת קוד</Button>
          <p className="text-xs text-muted-foreground">
            ההרשמה מהווה הסכמה לתנאי השימוש ולמדיניות הפרטיות. ללא ניוזלטר.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
