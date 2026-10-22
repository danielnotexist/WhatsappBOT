import { connection } from "next/server";
import { ensureDemoSessionUser, hasSession } from "@/lib/auth/current-user";
import { getBillingContext } from "@/lib/billing";
import { verifyCardLinkToken } from "@/lib/billing/links";
import { payResultUrl, type PayResult } from "@/lib/billing/result";
import { startCardUpdate } from "@/lib/billing/service";
import { EnvError } from "@/lib/env";

/**
 * [עדכון כרטיס] from WhatsApp (or "לעדכון הכרטיס" on /pay/<token>) → a fresh HYP page for this click: J2 card
 * verification (no charge) + getToken on the way back (/api/pay/return, Order = <user>:card). The signed link is
 * valid for 7 days; the HYP page is created now. Not a page of its own: a link that cannot open lands on the personal
 * area when signed in, otherwise on /pay/done.
 */
export async function GET(request: Request, ctx: RouteContext<"/pay/card/[token]">) {
  await connection();
  const { token } = await ctx.params;
  const origin = process.env.APP_URL || new URL(request.url).origin;
  const signedIn = await hasSession().catch(() => false);
  const back = (result: PayResult, error: string) => Response.redirect(payResultUrl(origin, { signedIn, result, message: error }).toString(), 303);
  const link = verifyCardLinkToken(token);
  if (!link) return back("card_link", 'הקישור לעדכון הכרטיס לא בתוקף. אפשר לבקש קישור חדש בשיחה: "עדכון כרטיס".');
  try {
    await ensureDemoSessionUser();
    const billing = getBillingContext();
    const user = await billing.db.getUser(link.userId);
    if (!user) return back("card_link", "החשבון לא נמצא.");
    const page = await startCardUpdate(billing, user);
    await billing.db.addAudit({ user_id: user.id, action: "billing.card_page", result: "opened" });
    return Response.redirect(page, 303);
  } catch (e) {
    if (e instanceof EnvError) return new Response(e.message, { status: 503 });
    console.error("[pay:card] failed:", (e as Error).message);
    return back("card_unavailable", "לא הצלחנו לפתוח את דף עדכון הכרטיס כרגע. אפשר לנסות שוב בעוד רגע.");
  }
}
