import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ShellFrame } from "@/components/auth/signup-shell";
import { StepHeading } from "@/components/auth/step-heading";
import { StepAside, StepBody } from "@/components/auth/step-slots";
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
    <ShellFrame tone="night">
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
      <>
        <StepAside>
          <StepHeading tag="קישור ישן" title="הקישור לא בתוקף" onDark />
          <p role="alert" className="mt-4 text-lede text-cream-muted">
            {REASONS[reason] ?? REASONS.invalid}
          </p>
        </StepAside>
        <StepBody className="lg:justify-center">
          <div className="flex flex-col gap-3">
            <Cta href="/login/whatsapp" block>
              קישור חדש דרך וואטסאפ
            </Cta>
            <Link href="/login/email" className="self-center rounded-sm py-2 font-semibold underline underline-offset-3">
              כניסה עם מייל
            </Link>
          </div>
        </StepBody>
      </>
    );
  }

  return (
    <>
      <StepAside>
        <StepHeading tag="שוב כאן." title="כניסה לאזור האישי" onDark />
      </StepAside>
      <StepBody className="lg:justify-center">
        <form action={loginWithTokenAction} className="flex flex-col gap-4">
          <input type="hidden" name="token" value={token} />
          <Cta type="submit" block>
            כניסה
          </Cta>
        </form>
      </StepBody>
    </>
  );
}
