import { touchLastSeen } from "@/lib/admin/activity";
import { ownerAlert } from "@/lib/admin/alerts";
import type { Db, SignupSource, UserRow } from "@/lib/db/types";
import { attachReferralOnSignup } from "@/lib/referrals/service";

/** How the email was proven: a code sent to it (lib/auth/otp.ts) or the provider's verified claim (lib/auth/sso.ts). */
export type SignInMethod = "otp" | "google" | "microsoft";

export interface SignInDeps {
  db: Db;
  now?: () => Date;
  /** where this browser first came from (lib/admin/source.ts, the alze_src cookie) — kept on a user created now */
  signupSource?: SignupSource | null;
  /** a friend's code from /r/<code> (the alze_ref cookie, lib/referrals) — attached to a user created now */
  referralCode?: string | null;
}

export interface SignInOutcome {
  user: UserRow;
  isNewUser: boolean;
  email: string;
}

/**
 * The one place a proven email becomes the session's user — the OTP code and Sign in with Microsoft / Google share it.
 * The existing user (login) or a new one (signup), audited either way (`signup` / `login`, with the method in `reason`
 * when it is not the code). A new user keeps the browser's first-visit source, gets the friend's referral and the owner
 * is told (lib/admin/alerts.ts, after the response); both mark "last seen". Those are best effort (the admin panel's
 * data): a failure there never fails the sign-in.
 * `known`: the caller already looked the email up (the SSO trust decision) — pass what it found, null for nobody.
 * The caller decides whether the email is proven; this function never checks.
 */
export async function signInVerifiedEmail(deps: SignInDeps, email: string, method: SignInMethod = "otp", known?: UserRow | null): Promise<SignInOutcome> {
  const db = deps.db;
  let user = known === undefined ? await db.findUserByEmail(email) : known;
  let isNewUser = false;
  const via = method === "otp" ? {} : { reason: method };
  if (!user) {
    user = await db.createUser(email);
    isNewUser = true;
    await db.addAudit({ user_id: user.id, action: "signup", target: email, result: "ok", ...via });
    if (deps.signupSource) {
      await db.setSignupSource(user.id, deps.signupSource).catch((e: unknown) => console.warn("[sign-in] signup source not recorded:", (e as Error).message));
    }
    // "חבר מביא חבר": new users only — a login never attaches a referral (attachReferralOnSignup never throws)
    if (deps.referralCode) await attachReferralOnSignup(db, user, deps.referralCode);
    ownerAlert({ type: "signup", userId: user.id, email, name: user.name, business: user.business_name, source: deps.signupSource ?? null }, { db });
  } else {
    await db.addAudit({ user_id: user.id, action: "login", target: email, result: "ok", ...via });
  }
  await touchLastSeen(db, user.id, deps.now?.() ?? new Date());
  return { user, isNewUser, email };
}
