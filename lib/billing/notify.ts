import { billCopy } from "@/lib/copy/bot-billing";
import type { UserRow } from "@/lib/db/types";
import { paymentReceiptTemplate, type TemplateSend } from "@/lib/wa/templates";
import type { ReplyButton } from "@/lib/wa/types";
import { localDateOf } from "@/lib/time/zoned";
import type { BillingContext } from "./context";
import { createInvoiceToken, invoiceLinkFor } from "./links";
import { formatIls } from "./money";
import { PLANS, type BillingCycle, type PaidPlan } from "./plans";

const WINDOW_MS = 24 * 3_600_000;

/** "20.11.2026" in Israel time. */
export function shortDateHe(d: Date | string): string {
  const l = localDateOf(new Date(d));
  return `${l.day}.${l.month}.${l.year}`;
}

/** The user's linked WhatsApp number (the only number billing messages go to and accept presses from). */
export async function activePhone(ctx: Pick<BillingContext, "db">, userId: string): Promise<string | null> {
  return (await ctx.db.listWaIdentities(userId)).find((w) => w.status === "active")?.phone_e164 ?? null;
}

/** The 24-hour customer-service window is open when the user's last inbound message is younger than 24 hours. */
export async function isWindowOpen(ctx: Pick<BillingContext, "db" | "now">, userId: string): Promise<boolean> {
  const recent = await ctx.db.recentMessages(userId, 20);
  const lastInbound = [...recent].reverse().find((m) => m.direction === "in");
  return lastInbound ? ctx.now().getTime() - Date.parse(lastInbound.created_at) < WINDOW_MS : false;
}

export interface Delivery {
  /** free text (inside the window) — also stored as the outbound message */
  text: string;
  buttons?: ReplyButton[];
  /** approved template for outside the window; null/absent → nothing is sent outside the window */
  template?: TemplateSend | null;
}

/**
 * Sends to the user's linked number: free text (+ reply buttons) inside the 24-hour window, otherwise the approved
 * UTILITY template (docs/copy/wa-templates.md). Never throws. Returns where it went (null = nothing sent).
 */
export async function deliver(ctx: BillingContext, user: UserRow, d: Delivery, known?: { phone: string; windowOpen: boolean }): Promise<{ phone: string; windowOpen: boolean } | null> {
  try {
    const phone = known?.phone ?? (await activePhone(ctx, user.id));
    if (!phone) return null;
    const windowOpen = known?.windowOpen ?? (await isWindowOpen(ctx, user.id));
    if (windowOpen) {
      if (d.buttons?.length) await ctx.wa.sendButtons(phone, d.text, d.buttons);
      else await ctx.wa.sendText(phone, d.text);
      await ctx.db.insertMessage({ user_id: user.id, direction: "out", type: d.buttons?.length ? "button" : "text", text: d.text });
    } else if (d.template) {
      await ctx.wa.sendTemplate(
        phone,
        d.template.name,
        d.template.params.map((t) => ({ type: "text" as const, text: t })),
        d.template.buttons,
      );
      await ctx.db.insertMessage({ user_id: user.id, direction: "out", type: "template", text: d.text });
    } else {
      return null;
    }
    return { phone, windowOpen };
  } catch (e) {
    console.error("[billing] deliver failed:", (e as Error).message);
    return null;
  }
}

export interface InvoiceInfo {
  transId: string;
  amountIls: number;
  date: Date;
  /** for the `payment_receipt` template outside the window */
  plan?: PaidPlan;
  nextChargeAt?: Date;
  /** annual → the `payment_receipt_annual` template */
  cycle?: BillingCycle;
}

/**
 * The receipt ("קבלה" — HYP's invoice document) in chat after a successful charge: a WhatsApp document whose link is our signed /invoice/<token> route
 * (it fetches a fresh HYP PrintHesh signature on every open — HYP's own links are temporary). Falls back to a text
 * link; outside the window → the `payment_receipt` template with the same link behind a button. Never throws.
 */
export async function sendInvoice(ctx: BillingContext, user: UserRow, info: InvoiceInfo, known?: { phone: string; windowOpen: boolean }): Promise<void> {
  try {
    const phone = known?.phone ?? (await activePhone(ctx, user.id));
    if (!phone) return;
    const windowOpen = known?.windowOpen ?? (await isWindowOpen(ctx, user.id));
    const amount = formatIls(info.amountIls);
    const date = shortDateHe(info.date);
    const link = invoiceLinkFor(ctx.appUrl, user.id, info.transId);
    if (windowOpen) {
      const caption = billCopy["bill.invoice_caption"]({ amount, date });
      try {
        await ctx.wa.sendDocument(phone, { link, filename: `קבלה-${info.transId}.pdf` }, caption);
        await ctx.db.insertMessage({ user_id: user.id, direction: "out", type: "doc", text: caption, media_url: link });
      } catch (e) {
        console.error("[billing] invoice document failed, sending the link:", (e as Error).message);
        const text = billCopy["bill.invoice_link"]({ amount, date, link });
        await ctx.wa.sendText(phone, text);
        await ctx.db.insertMessage({ user_id: user.id, direction: "out", type: "text", text });
      }
    } else if (info.plan && info.nextChargeAt) {
      const t = paymentReceiptTemplate({ amount, plan: PLANS[info.plan].nameHe, nextCharge: shortDateHe(info.nextChargeAt), invoiceToken: createInvoiceToken(user.id, info.transId), annual: info.cycle === "annual" });
      await ctx.wa.sendTemplate(phone, t.name, t.params.map((text) => ({ type: "text" as const, text })), t.buttons);
      await ctx.db.insertMessage({ user_id: user.id, direction: "out", type: "template", text: billCopy["bill.invoice_link"]({ amount, date, link }) });
    }
  } catch (e) {
    console.error("[billing] sendInvoice failed:", (e as Error).message);
  }
}
