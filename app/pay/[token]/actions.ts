"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { ensureDemoSessionUser } from "@/lib/auth/current-user";
import { getBillingContext } from "@/lib/billing";
import { verifyPayLinkToken } from "@/lib/billing/pay-link";
import { isBillingCycle, isPaidPlan } from "@/lib/billing/plans";
import { startPayment } from "@/lib/billing/service";
import { upgradeFromWeb } from "@/lib/billing/web-upgrade";
import { EnvError, SERVICE_UNAVAILABLE, paymentsOpen } from "@/lib/env";
import { flashQuery } from "@/lib/flash";

/**
 * [לשדרג עכשיו] on /pay/<token> (a POST — server actions never run from a GET). The pay-link token names the account
 * (no session needed, like the page); the signed offer in the form must belong to that same account, so only the
 * token's own subscription can change. Lands back on the page: `?upgrade=<approval>` shows the result of the charge
 * (a refresh or a replayed form shows the same result — the offer's nonce is single-use), `?r=<code>` a fixed notice
 * when nothing was charged.
 */
export async function upgradeAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const offer = String(formData.get("offer") ?? "");
  const page = `/pay/${encodeURIComponent(token)}`;
  const link = verifyPayLinkToken(token);
  if (!link || !paymentsOpen()) redirect(page as Route); // the page explains an invalid link, or that payments open soon
  let to: string;
  try {
    await ensureDemoSessionUser();
    const ctx = getBillingContext();
    const user = await ctx.db.getUser(link.userId);
    if (!user) {
      to = page;
    } else {
      const out = await upgradeFromWeb(ctx, user, offer);
      to = out.kind === "done" ? `${page}?upgrade=${out.approvalId}` : `${page}?r=${out.kind}`;
    }
  } catch (e) {
    console.error("[pay] upgrade failed:", (e as Error).message);
    to = `${page}?r=error`;
  }
  redirect(to as Route);
}

/**
 * Plan (and cycle) chosen on /pay/<token> → HYP hosted payment page (SIGN happens server-side, keys never leave the
 * server). The price comes from lib/billing/plans.ts for the plan and the cycle — never from the form.
 */
export async function startPaymentAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const plan = String(formData.get("plan") ?? "");
  const rawCycle = String(formData.get("cycle") ?? "monthly");
  const cycle = isBillingCycle(rawCycle) ? rawCycle : "monthly";
  const link = verifyPayLinkToken(token);
  if (link && !paymentsOpen()) redirect(`/pay/${encodeURIComponent(token)}` as Route); // the page: "התשלום ייפתח בקרוב"
  if (!link || !isPaidPlan(plan)) redirect(`/pay/${encodeURIComponent(token)}?${flashQuery("error", "הקישור לא בתוקף - אפשר לבקש קישור חדש בשיחה.")}` as Route);
  const ctx = getBillingContext();
  await ensureDemoSessionUser();
  const user = await ctx.db.getUser(link.userId);
  if (!user) redirect("/start");
  let url: string;
  try {
    url = await startPayment(ctx, user, plan, cycle);
  } catch (e) {
    const message = e instanceof EnvError ? SERVICE_UNAVAILABLE : "לא הצלחנו לפתוח את דף התשלום כרגע. אפשר לנסות שוב בעוד רגע.";
    console.error("[pay] startPayment failed:", (e as Error).message);
    redirect(`/pay/${encodeURIComponent(token)}?${flashQuery("error", message)}` as Route);
  }
  redirect(url as Route);
}
