"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { ensureDemoSessionUser, getSession } from "@/lib/auth/current-user";
import { getBillingContext } from "@/lib/billing";
import { verifyPayLinkToken } from "@/lib/billing/pay-link";
import { isBillingCycle, isPaidPlan } from "@/lib/billing/plans";
import { startPayment } from "@/lib/billing/service";
import { upgradeFromWeb } from "@/lib/billing/web-upgrade";
import { EnvError, SERVICE_UNAVAILABLE, paymentsOpen } from "@/lib/env";
import { flashQuery } from "@/lib/flash";

/**
 * [לשדרג עכשיו] on /pay/<token> (a POST — server actions never run from a GET). It charges the saved card, so the pay
 * link alone is not enough (it is a 7-day link that travels in chats and screenshots): the browser must be signed in
 * to the account the token names (`?r=signin` otherwise — the page says how). The signed offer in the form must belong
 * to that same account. Lands back on the page: `?upgrade=<approval>` shows the result of the charge (a refresh or a
 * replayed form shows the same result — the offer's nonce is single-use), `?r=<code>` a fixed notice when nothing was
 * charged.
 */
export async function upgradeAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const offer = String(formData.get("offer") ?? "");
  const page = `/pay/${encodeURIComponent(token)}`;
  const link = verifyPayLinkToken(token);
  if (!link || !paymentsOpen()) redirect(page as Route); // the page explains an invalid link, or that payments open soon
  if ((await getSession())?.userId !== link.userId) redirect(`${page}?r=signin` as Route);
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
  // a paid period that is running (active, not overdue) is never paid again from the plan choice: the page shows the
  // card update / the upgrade instead — an old plan-choice page posted later lands there
  const sub = await ctx.db.getSubscription(user.id);
  if (sub?.status === "active" && isPaidPlan(sub.plan) && !sub.cancelled_at && sub.charge_failures === 0) redirect(`/pay/${encodeURIComponent(token)}` as Route);
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
