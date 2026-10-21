import { issueLoginToken } from "@/lib/auth/login-token";
import { copy } from "@/lib/copy/bot";
import type { InboundMessage } from "@/lib/wa/types";
import { siteLink, type BotContext } from "./context";

/** "כניסה" and close variants — the whole message, not a word inside a sentence. */
export const LOGIN_RE = /^(כניסה|קישור כניסה|כניסה לאתר|כניסה לאזור האישי|לאזור האישי|login)[.!?]?$/i;

/**
 * "הצטרפת דרך וואטסאפ? כניסה כאן" (round plan §3 row 7): a linked user writes "כניסה" and gets a one-time
 * /login/w/<token> link (10 minutes). Runs before onboarding and billing, so it works even when the trial is over.
 * Returns true when it handled the message.
 */
export async function handleLoginKeyword(ctx: BotContext, userId: string, msg: InboundMessage, say: (text: string) => Promise<void>): Promise<boolean> {
  if (msg.type !== "text" || !LOGIN_RE.test((msg.text ?? "").trim())) return false;
  const { token } = await issueLoginToken(ctx.db, userId, { now: ctx.now() });
  await say(copy["link.login_link"](siteLink(ctx, `/login/w/${token}`)));
  return true;
}
