import { trackServerEvent } from "@/lib/analytics/track";
import { extractLinkToken, linkTokenHash, trialPhoneHash } from "@/lib/auth/link-token";
import { copy, buttons } from "@/lib/copy/bot";
import type { UserRow } from "@/lib/db/types";
import type { InboundMessage } from "@/lib/wa/types";
import { LINK, maskPhone, siteLink, type BotContext } from "./context";
import { startOnboarding } from "./onboarding";

/**
 * A message from a number that is not linked to any account (PLAN §1 "קישור לוואטסאפ"):
 * token in the text → link (one phone per account, one account per phone) → welcome + onboarding.
 * No token → a pointer to the site (at most once an hour; never a strike). 3 bad tokens → silent block for 24h, then
 * the count starts over (0020 wa_link_attempt).
 */
export async function handleUnlinkedPhone(ctx: BotContext, msg: InboundMessage): Promise<{ handled: boolean; note: string }> {
  const phone = msg.fromE164;
  if (await ctx.db.isPhoneBlocked(phone)) return { handled: true, note: "blocked" };
  const token = msg.text ? extractLinkToken(msg.text) : null;
  const attempt = (strike: boolean) =>
    ctx.db.recordLinkAttempt(phone, { strike, waMessageId: msg.waMessageId ?? null, maxAttempts: LINK.maxTokenAttempts, blockMs: LINK.blockMs, pointerEveryMs: LINK.pointerEveryMs });

  if (!token) {
    // a plain message is never a strike: the pointer to the site, at most once an hour (and once per delivery)
    const { reply } = await attempt(false);
    if (reply) await ctx.wa.sendText(phone, copy["link.unknown_number"](siteLink(ctx, "/start")));
    return { handled: true, note: "unknown number" };
  }

  // 0020 link_token_consume: the code (by its HMAC), one phone per account and the link itself — one locked step
  const res = await ctx.db.consumeLinkToken({ tokenHash: linkTokenHash(token), phoneE164: phone, waName: msg.profileName, phoneHash: trialPhoneHash(phone) });
  switch (res.result) {
    case "invalid": {
      const { reply } = await attempt(true);
      if (reply) await ctx.wa.sendText(phone, copy["link.token_invalid"](siteLink(ctx, "/start/ready")));
      return { handled: true, note: "invalid token" };
    }
    case "expired":
    case "phone_taken":
      await ctx.wa.sendText(phone, copy["link.token_expired"](siteLink(ctx, "/start/ready")));
      return { handled: true, note: res.result === "expired" ? "expired token" : "phone taken" };
    case "no_user":
      await ctx.wa.sendText(phone, copy["link.token_invalid"](siteLink(ctx, "/start")));
      return { handled: true, note: "token without user" };
    case "second_phone":
      await ctx.wa.sendText(phone, copy["link.second_phone"](maskPhone(res.otherPhone), siteLink(ctx, "/account?tab=whatsapp")));
      return { handled: true, note: "account has another phone" };
  }
  const user = await ctx.db.getUser(res.userId);
  if (!user) return { handled: true, note: "token without user" };
  await welcomeLinkedPhone(ctx, user, phone);
  return { handled: true, note: res.trialReused ? "linked (trial already used on this phone)" : "linked" };
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
