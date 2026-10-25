import { trackServerEvent } from "@/lib/analytics/track";
import { extractLinkToken } from "@/lib/auth/link-token";
import { copy, buttons } from "@/lib/copy/bot";
import type { UserRow } from "@/lib/db/types";
import type { InboundMessage } from "@/lib/wa/types";
import { LINK, maskPhone, siteLink, type BotContext } from "./context";
import { startOnboarding } from "./onboarding";

/**
 * A message from a number that is not linked to any account (PLAN §1 "קישור לוואטסאפ"):
 * token in the text → link (one phone per account, one account per phone) → welcome + onboarding.
 * No token → one-time pointer to the site. 3 bad tokens → silent block for 24h.
 */
export async function handleUnlinkedPhone(ctx: BotContext, msg: InboundMessage): Promise<{ handled: boolean; note: string }> {
  const phone = msg.fromE164;
  if (await ctx.db.isPhoneBlocked(phone)) return { handled: true, note: "blocked" };
  const token = msg.text ? extractLinkToken(msg.text) : null;

  if (!token) {
    const { blocked } = await ctx.db.recordLinkAttempt(phone, LINK.maxTokenAttempts, LINK.blockMs);
    if (!blocked) await ctx.wa.sendText(phone, copy["link.unknown_number"](siteLink(ctx, "/start")));
    return { handled: true, note: "unknown number" };
  }

  const row = await ctx.db.findLinkToken(token);
  if (!row) {
    const { blocked } = await ctx.db.recordLinkAttempt(phone, LINK.maxTokenAttempts, LINK.blockMs);
    if (!blocked) await ctx.wa.sendText(phone, copy["link.token_invalid"](siteLink(ctx, "/start/ready")));
    return { handled: true, note: "invalid token" };
  }
  if (row.used_at || Date.parse(row.expires_at) <= ctx.now().getTime()) {
    await ctx.wa.sendText(phone, copy["link.token_expired"](siteLink(ctx, "/start/ready")));
    return { handled: true, note: "expired token" };
  }
  const user = await ctx.db.getUser(row.user_id);
  if (!user) {
    await ctx.wa.sendText(phone, copy["link.token_invalid"](siteLink(ctx, "/start")));
    return { handled: true, note: "token without user" };
  }
  const existing = (await ctx.db.listWaIdentities(user.id)).find((w) => w.status !== "unlinked");
  if (existing && existing.phone_e164 !== phone) {
    await ctx.wa.sendText(phone, copy["link.second_phone"](maskPhone(existing.phone_e164), siteLink(ctx, "/account?tab=whatsapp")));
    return { handled: true, note: "account has another phone" };
  }

  await ctx.db.createWaIdentity(user.id, phone, msg.profileName);
  await ctx.db.markLinkTokenUsed(row.id);
  await welcomeLinkedPhone(ctx, user, phone);
  return { handled: true, note: "linked" };
}

/**
 * After a number was linked to the account: the audit line, "linked", the welcome with its buttons and the first
 * onboarding step. Shared by the WhatsApp link token and the website chat's virtual number (lib/demo-chat).
 */
export async function welcomeLinkedPhone(ctx: BotContext, user: UserRow, phone: string, source: "whatsapp" | "demo_chat" = "whatsapp"): Promise<void> {
  await ctx.db.addAudit({ user_id: user.id, action: "wa.link", target: source === "demo_chat" ? "demo-chat" : maskPhone(phone), result: "ok" });
  trackServerEvent(ctx.db, "wa_linked", user.id, ctx.now()); // the signup funnel (lib/analytics)
  await ctx.wa.sendText(phone, copy["link.success"]());
  await ctx.wa.sendButtons(phone, copy["onb.welcome"](user.name), buttons.welcome);
  await startOnboarding(ctx, user.id);
}
