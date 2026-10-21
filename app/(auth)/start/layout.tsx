import { SignupShell } from "@/components/auth/signup-shell";

/** One persistent shell for the whole signup: the step card morphs between the routes below (round plan §3). */
export default function StartLayout({ children }: LayoutProps<"/start">) {
  return <SignupShell>{children}</SignupShell>;
}
