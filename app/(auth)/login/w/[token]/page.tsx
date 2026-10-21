import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ShellFrame } from "@/components/auth/signup-shell";
import { StepHeading } from "@/components/auth/step-heading";
import { Cta } from "@/components/brand/cta";
import { peekLoginToken } from "@/lib/auth/login-token";
import { loginWithTokenAction } from "./actions";

export const metadata: Metadata = { title: "כניסה", robots: { index: false, follow: false } };

const REASONS: Record<string, string> = {
  invalid: "הקישור לא תקין.",
  expired: "הקישור פג (הוא עובד 10 דקות).",
  used: "הקישור כבר שימש לכניסה, או שנשלח קישור חדש יותר.",
};

/** The link from the chat ("כניסה"): one button that signs this browser in. Dynamic token → known tone, no usePathname. */
export default function LoginTokenPage(props: PageProps<"/login/w/[token]">) {
  return (
    <ShellFrame tone="ready">
      <Suspense fallback={null}>
        <Confirm params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </ShellFrame>
  );
}

async function Confirm({ params, searchParams }: { params: PageProps<"/login/w/[token]">["params"]; searchParams: PageProps<"/login/w/[token]">["searchParams"] }) {
  await connection(); // the token's expiry is checked against the current time
  const [{ token: raw }, sp] = await Promise.all([params, searchParams]);
  const token = decodeURIComponent(raw);
  const peek = peekLoginToken(token);
  const reason = typeof sp.error === "string" ? sp.error : typeof peek === "string" ? peek : null;

  if (reason) {
    return (
      <div className="flex flex-1 flex-col">
        <StepHeading tag="קישור ישן" title="הקישור לא בתוקף" onDark />
        <p role="alert" className="mt-4 text-lede text-cream-muted">
          {REASONS[reason] ?? REASONS.invalid} אפשר לכתוב שוב ״כניסה״ בוואטסאפ ולקבל קישור חדש.
        </p>
        <div className="mt-auto flex flex-col gap-3 pt-10">
          <Cta href="/login/whatsapp" block>
            קישור חדש דרך וואטסאפ
          </Cta>
          <Link href="/login/email" className="self-center py-2 font-semibold underline underline-offset-3">
            כניסה עם מייל
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={loginWithTokenAction} className="flex flex-1 flex-col">
      <input type="hidden" name="token" value={token} />
      <StepHeading tag="נכנסת." title="כניסה לאזור " light="האישי" onDark />
      <p className="mt-4 text-lede text-cream-muted">הקישור מהשיחה בוואטסאפ. לחיצה אחת, והדפדפן הזה מחובר לחשבון שלך.</p>
      <div className="mt-auto pt-10">
        <Cta type="submit" block>
          כניסה
        </Cta>
      </div>
    </form>
  );
}
