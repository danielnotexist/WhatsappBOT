import { connection } from "next/server";
import { ensureDemoSessionUser } from "@/lib/auth/current-user";
import { getBillingContext } from "@/lib/billing";
import { verifyCardLinkToken } from "@/lib/billing/links";
import { startCardUpdate } from "@/lib/billing/service";
import { EnvError } from "@/lib/env";

/**
 * [עדכון כרטיס] from WhatsApp → a fresh HYP page for this click: J2 card verification (no charge) + getToken on the
 * way back (/api/pay/return, Order = <user>:card). The signed link is valid for 7 days; the HYP page is created now.
 */
export async function GET(request: Request, ctx: RouteContext<"/pay/card/[token]">) {
  await connection();
  const { token } = await ctx.params;
  const origin = process.env.APP_URL || new URL(request.url).origin;
  const back = (error: string) => {
    const dest = new URL("/account", origin);
    dest.searchParams.set("error", error);
    return Response.redirect(dest.toString(), 303);
  };
  const link = verifyCardLinkToken(token);
  if (!link) return back('הקישור לעדכון הכרטיס לא בתוקף. אפשר לבקש קישור חדש בשיחה: "עדכון כרטיס".');
  try {
    await ensureDemoSessionUser();
    const billing = getBillingContext();
    const user = await billing.db.getUser(link.userId);
    if (!user) return back("החשבון לא נמצא.");
    const page = await startCardUpdate(billing, user);
    await billing.db.addAudit({ user_id: user.id, action: "billing.card_page", result: "opened" });
    return Response.redirect(page, 303);
  } catch (e) {
    if (e instanceof EnvError) return new Response(e.message, { status: 503 });
    console.error("[pay:card] failed:", (e as Error).message);
    return back("לא הצלחנו לפתוח את דף עדכון הכרטיס כרגע. אפשר לנסות שוב בעוד רגע.");
  }
}
