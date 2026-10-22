import type { BillingContext } from "@/lib/billing/context";
import { LazyHypGateway } from "@/lib/hyp/client";
import { handleBillingButton, handleBillingCommand, handlePaused, handlePlanLimit } from "@/lib/billing/whatsapp";
import { copy } from "@/lib/copy/bot";
import type { UserRow } from "@/lib/db/types";
import type { InboundMessage } from "@/lib/wa/types";
import type { BotContext } from "./context";

/**
 * The inbound pipeline's hooks into WhatsApp-native billing (lib/billing/whatsapp.ts). Kept in one small module so
 * process-inbound.ts only gains a few lines. Without a HYP gateway in the context (`ctx.hyp`), commands and buttons
 * still answer (offers, links), and a press that would charge fails safely before HYP is called.
 */
export function billingCtxOf(ctx: BotContext): BillingContext {
  const factory = ctx.hyp;
  return {
    db: ctx.db,
    wa: ctx.wa,
    appUrl: ctx.appUrl,
    now: ctx.now,
    hyp: new LazyHypGateway(() => {
      if (!factory) throw new Error("HYP gateway not configured for the bot context");
      return factory();
    }),
  };
}

/** `bill:*` buttons (interactive replies and template quick replies). true = handled. */
export async function handleBillingPress(ctx: BotContext, user: UserRow, msg: InboundMessage): Promise<boolean> {
  if (!((msg.type === "button" || msg.type === "template_button") && msg.reply?.id.startsWith("bill:"))) return false;
  await handleBillingButton(billingCtxOf(ctx), user, msg.fromE164, msg.reply.id, msg.waMessageId);
  return true;
}

/** Typed billing commands ("קבלה", "שדרוג", "ביטול מנוי", "עדכון כרטיס"…). true = handled. */
export async function handleBillingText(ctx: BotContext, user: UserRow, msg: InboundMessage): Promise<boolean> {
  if (msg.type !== "text" && !(msg.type === "template_button" && msg.text)) return false;
  return handleBillingCommand(billingCtxOf(ctx), user, msg.fromE164, msg.text ?? "");
}

/** Basic plan at 750: the one-tap upgrade offer (falls back to the link message without a saved card). */
export async function basicLimitReached(ctx: BotContext, user: UserRow, to: string, text: string): Promise<void> {
  try {
    await handlePlanLimit(billingCtxOf(ctx), user, to, text);
  } catch (e) {
    console.error("[bot] upgrade offer failed:", (e as Error).message);
    await ctx.wa.sendText(to, copy["err.generic"]());
  }
}

/** A message while the account is paused: [ניסיון חוזר] [עדכון כרטיס], once a day. */
export async function pausedAccount(ctx: BotContext, user: UserRow, to: string, text: string): Promise<void> {
  await handlePaused(billingCtxOf(ctx), user, to, text);
}
