import { BySession } from "@/components/auth/by-session";
import { ShellAccountLink } from "@/components/auth/shell-session";
import { SignupShell } from "@/components/auth/signup-shell";

/** /login/email, /login/code, /login/whatsapp share the signup shell (same morphing card), and its account link. */
export default function LoginCardLayout({ children }: { children: React.ReactNode }) {
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
