import { ensureDemoSessionUser, hasSession } from "@/lib/auth/current-user";
import { getBillingContext } from "@/lib/billing";
import { payResultOf, payResultUrl } from "@/lib/billing/result";
import { completePayment } from "@/lib/billing/service";
import { EnvError } from "@/lib/env";

/**
 * HYP success / error URL (set in the HYP portal to https://<domain>/api/pay/return).
 * Verifies the signed query with APISign What=VERIFY, activates the subscription (or, for Order=<user>:card, replaces
 * the saved card after a J2 check), then shows the user a page: the personal area when this browser is signed in,
 * otherwise /pay/done (a payment link from WhatsApp, opened on the phone).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = process.env.APP_URL || url.origin;
  const signedIn = await hasSession().catch(() => false);
  try {
    await ensureDemoSessionUser();
    const result = await completePayment(getBillingContext(), url.search.slice(1));
    const notice = result.ok && result.mode === "card" ? "הכרטיס עודכן. אפשר לחזור לוואטסאפ." : "התשלום התקבל והחשבון פעיל. אפשר לחזור לוואטסאפ.";
    return Response.redirect(payResultUrl(origin, { signedIn, result: payResultOf(result), message: result.ok ? notice : result.message }).toString(), 303);
  } catch (e) {
    if (e instanceof EnvError) return new Response(e.message, { status: 503 });
    console.error("[pay:return] failed:", (e as Error).message);
    return Response.redirect(payResultUrl(origin, { signedIn, result: "failed", message: "משהו השתבש באימות התשלום. אם היה חיוב, נבדוק ונחזור עם תשובה במייל." }).toString(), 303);
  }
}
