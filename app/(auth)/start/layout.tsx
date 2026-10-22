import { BySession } from "@/components/auth/by-session";
import { ShellAccountLink } from "@/components/auth/shell-session";
import { SignupShell } from "@/components/auth/signup-shell";

/**
 * One persistent shell for the whole signup: the step card morphs between the routes below (round plan §3).
 * The header's account link reads the session cookie in a request-time hole: "לאזור האישי" when signed in (e.g.
 * /start/ready opened from the personal area to link a number), "כבר יש לך חשבון? כניסה" otherwise.
 */
export default function StartLayout({ children }: LayoutProps<"/start">) {
  return (
    <SignupShell
      account={
        <BySession
          signedIn={<ShellAccountLink signedIn />}
          signedOut={<ShellAccountLink signedIn={false} />}
        />
      }
    >
      {children}
    </SignupShell>
  );
}
