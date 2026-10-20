"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { getBillingContext } from "@/lib/billing";
import { verifyPayLinkToken } from "@/lib/billing/pay-link";
import { isPaidPlan } from "@/lib/billing/plans";
import { startPayment } from "@/lib/billing/service";
import { EnvError } from "@/lib/env";

/** Plan chosen on /pay/<token> → HYP hosted payment page (SIGN happens server-side, keys never leave the server). */
export async function startPaymentAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const plan = String(formData.get("plan") ?? "");
  const link = verifyPayLinkToken(token);
  if (!link || !isPaidPlan(plan)) redirect(`/pay/${encodeURIComponent(token)}?error=${encodeURIComponent("הקישור לא בתוקף — אפשר לבקש קישור חדש בשיחה.")}` as Route);
  const ctx = getBillingContext();
  const user = await ctx.db.getUser(link.userId);
  if (!user) redirect("/start");
  let url: string;
  try {
    url = await startPayment(ctx, user, plan);
  } catch (e) {
    const message = e instanceof EnvError ? e.message : "לא הצלחנו לפתוח את דף התשלום כרגע. אפשר לנסות שוב בעוד רגע.";
    console.error("[pay] startPayment failed:", (e as Error).message);
    redirect(`/pay/${encodeURIComponent(token)}?error=${encodeURIComponent(message)}` as Route);
  }
  redirect(url as Route);
}
