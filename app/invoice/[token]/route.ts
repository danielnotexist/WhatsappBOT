import { connection } from "next/server";
import { ensureDemoSessionUser } from "@/lib/auth/current-user";
import { getBillingContext } from "@/lib/billing";
import { verifyInvoiceToken } from "@/lib/billing/links";
import { EnvError, integrationsMocked } from "@/lib/env";

const text = (body: string, status: number) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

/**
 * The receipt link sent in WhatsApp (document message / "קבלה" / the payment_receipt template). The signed token
 * names the user and the HYP transaction; every open asks HYP for a fresh PrintHesh signature (HYP's links are
 * temporary) and streams the PDF, so WhatsApp's document fetch gets `application/pdf` from our own domain.
 */
export async function GET(_request: Request, ctx: RouteContext<"/invoice/[token]">) {
  await connection();
  const { token } = await ctx.params;
  const notFound = () => text('הקבלה לא נמצאה או שהקישור פג (90 יום). אפשר לכתוב בשיחה "קבלה" לקבלת קישור חדש.', 404);
  const v = verifyInvoiceToken(token);
  if (!v) return notFound();
  try {
    await ensureDemoSessionUser();
    const billing = getBillingContext();
    const payment = (await billing.db.listPayments(v.userId, 100)).find((p) => p.hyp_trans_id === v.transId && p.ccode === "0");
    if (!payment) return notFound();
    const url = await billing.hyp.invoiceUrl(v.transId);
    if (!url) return text("HYP לא החזיר חתימה לקבלה. אפשר לנסות שוב בעוד רגע.", 502);
    if (integrationsMocked()) return Response.redirect(url, 302);
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15_000) });
    if (res.ok && /pdf/i.test(res.headers.get("content-type") ?? "")) {
      return new Response(res.body, {
        status: 200,
        headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="receipt-${v.transId}.pdf"`, "cache-control": "private, no-store" },
      });
    }
    // not a PDF (HYP answered with a page): let the browser follow HYP's signed link itself
    return Response.redirect(url, 302);
  } catch (e) {
    if (e instanceof EnvError) return text(e.message, 503);
    console.error("[invoice] failed:", (e as Error).message);
    return text("לא הצלחנו להביא את הקבלה כרגע. אפשר לנסות שוב בעוד רגע.", 502);
  }
}
