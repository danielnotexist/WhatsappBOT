import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const metadata: Metadata = {
  title: "התחלה",
};

/**
 * מסך ההרשמה — placeholder. אבן דרך 1: מייל → קוד 6 ספרות (Resend) → חיבור M365/Google → קונפטי → wa.me.
 */
export default function StartPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">נתחיל</CardTitle>
          <CardDescription>
            נשלח לך קוד בן 6 ספרות למייל. בקרוב — בשלב הבא של הפיתוח.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Input
            type="email"
            name="email"
            dir="ltr"
            inputMode="email"
            autoComplete="email"
            placeholder="name@company.co.il"
            className="text-end placeholder:text-end"
            disabled
          />
          <Button disabled>שליחת קוד</Button>
        </CardContent>
      </Card>
    </main>
  );
}
