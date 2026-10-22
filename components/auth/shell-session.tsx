"use client";

import Link from "next/link";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Cta } from "@/components/brand/cta";

interface ShellSession {
  /** this screen offers "כבר יש לך חשבון? כניסה" when signed out (a signup card; not the intro, not sign-in) */
  loginVisible: boolean;
  /** a code was verified on this shell since it mounted: the cookie exists now, the header learns it here */
  signedInHere: boolean;
  markSignedIn: () => void;
}

const ShellSessionContext = createContext<ShellSession>({
  loginVisible: false,
  signedInHere: false,
  markSignedIn: () => {},
});

/** Held by the persistent signup/login shell, so its header follows a sign-in that happens inside it. */
export function ShellSessionProvider({
  loginVisible,
  children,
}: {
  loginVisible: boolean;
  children: ReactNode;
}) {
  const [signedInHere, setSignedInHere] = useState(false);
  const value = useMemo(
    () => ({ loginVisible, signedInHere, markSignedIn: () => setSignedInHere(true) }),
    [loginVisible, signedInHere],
  );
  return <ShellSessionContext.Provider value={value}>{children}</ShellSessionContext.Provider>;
}

/** For the code card: the session cookie was just set, before the router moves on. */
export function useMarkSignedIn(): () => void {
  return useContext(ShellSessionContext).markSignedIn;
}

/**
 * The shell header's account link. Signed in (the session cookie, or a code verified on this shell): the honey pill
 * "לאזור האישי", on every screen of the shell. Signed out: "כבר יש לך חשבון? כניסה" where the screen offers it.
 */
export function ShellAccountLink({ signedIn }: { signedIn: boolean }) {
  const { loginVisible, signedInHere } = useContext(ShellSessionContext);
  if (signedIn || signedInHere) {
    return (
      <Cta href="/account" size="sm">
        לאזור האישי
      </Cta>
    );
  }
  if (!loginVisible) return null;
  return (
    <Link
      href="/login"
      className="rounded-md px-2 py-1 text-[0.9375rem] text-cream-muted underline-offset-4 transition-colors hover:text-cream hover:underline"
    >
      כבר יש לך חשבון? כניסה
    </Link>
  );
}
