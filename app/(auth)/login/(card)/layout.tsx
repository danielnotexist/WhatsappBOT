import { SignupShell } from "@/components/auth/signup-shell";

/** /login/email, /login/code, /login/whatsapp share the signup shell (same morphing card). */
export default function LoginCardLayout({ children }: { children: React.ReactNode }) {
  return <SignupShell>{children}</SignupShell>;
}
