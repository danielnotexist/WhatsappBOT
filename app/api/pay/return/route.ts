import { ensureDemoSessionUser } from "@/lib/auth/current-user";
import { getBillingContext } from "@/lib/billing";
import { completePayment } from "@/lib/billing/service";
import { EnvError } from "@/lib/env";

/**
 * HYP success / error URL (set in the HYP portal to https://<domain>/api/pay/return).
 * Verifies the signed query with APISign What=VERIFY, activates the subscription (or, for Order=<user>:card, replaces
 * the saved card after a J2 check), then shows the user a page.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    await ensureDemoSessionUser();
    const result = await completePayment(getBillingContext(), url.search.slice(1));
    const dest = new URL("/account", process.env.APP_URL || url.origin);
    const notice = result.ok && result.mode === "card" ? "הכרטיס עודכן. אפשר לחזור לוואטסאפ." : "התשלום התקבל והחשבון פעיל. אפשר לחזור לוואטסאפ.";
    dest.searchParams.set(result.ok ? "notice" : "error", result.ok ? notice : result.message);
    return Response.redirect(dest.toString(), 303);
  } catch (e) {
    if (e instanceof EnvError) return new Response(e.message, { status: 503 });
    console.error("[pay:return] failed:", (e as Error).message);
    const dest = new URL("/account", process.env.APP_URL || url.origin);
    dest.searchParams.set("error", "משהו השתבש באימות התשלום. אם חויבת — נבדוק ונחזור אלייך.");
    return Response.redirect(dest.toString(), 303);
  }
}
