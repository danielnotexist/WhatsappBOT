"use server";

import type { Route } from "next";
import { notFound, redirect } from "next/navigation";
import { closeAdmin, recognisedOwner, requireOwner, sendAdminCode, verifyAdminCode, type AdminCodeResult } from "@/lib/admin/auth";
import { CHAT_PAGE, toChatMessage, type ChatMessage } from "@/lib/admin/conversation";
import { USER_ID_RE } from "@/lib/admin/user-view";
import { getDb } from "@/lib/db";
import type { SupportTicketStatus } from "@/lib/db/types";

/**
 * The admin panel's server actions. Each one checks the owner again (lib/admin/auth.ts): the code step needs the
 * recognised owner (session + ADMIN_EMAILS), everything else the open panel (requireOwner). Anyone else: 404.
 */

export type CodeStepState = { sent: boolean; message: string | null; error: boolean };

/** "שליחת קוד" / "שליחת קוד חדש" on the code step. */
export async function sendCodeAction(prev: CodeStepState): Promise<CodeStepState> {
  const owner = await recognisedOwner();
  if (!owner) notFound();
  const r: AdminCodeResult = await sendAdminCode(owner);
  return { sent: r.ok || prev.sent, message: r.message ?? null, error: !r.ok };
}

/** The six digits. Right → the panel opens (the page reloads behind the cookie). */
export async function verifyCodeAction(_prev: CodeStepState, form: FormData): Promise<CodeStepState> {
  const owner = await recognisedOwner();
  if (!owner) notFound();
  const r = await verifyAdminCode(owner, form.get("code"));
  if (r.ok) redirect("/admin");
  return { sent: true, message: r.message, error: true };
}

const STATUSES: readonly SupportTicketStatus[] = ["open", "in_progress", "closed"];

/** A ticket's status and note (the tickets tab, the user page). Back to where it was sent from. */
export async function setTicketStatusAction(form: FormData): Promise<void> {
  const owner = await requireOwner();
  const id = String(form.get("id") ?? "");
  const status = String(form.get("status") ?? "") as SupportTicketStatus;
  const note = form.get("note");
  const back = safeBack(form.get("back"));
  if (!STATUSES.includes(status)) redirect(withNotice(back, "error", "סטטוס לא מוכר.") as Route);
  const db = getDb();
  const row = await db.setSupportTicketStatus(id, status, typeof note === "string" ? note.slice(0, 2000) : undefined);
  if (!row) redirect(withNotice(back, "error", "הפנייה לא נמצאה.") as Route);
  await db.addAudit({ user_id: owner.id, action: "admin.ticket_status", target: id, result: status });
  redirect(withNotice(back, "notice", "הפנייה עודכנה.") as Route);
}

/**
 * "טעינת הודעות קודמות" in the conversation reader: the page of messages before `before`, oldest first, shaped for the
 * reader only (no media URLs or WhatsApp ids). The owner only, like every page here.
 */
export async function olderMessagesAction(userId: string, before: string): Promise<{ messages: ChatMessage[]; more: boolean }> {
  await requireOwner();
  if (typeof userId !== "string" || !USER_ID_RE.test(userId) || typeof before !== "string" || Number.isNaN(Date.parse(before))) return { messages: [], more: false };
  const rows = await getDb().adminMessages(userId, { before, limit: CHAT_PAGE + 1 });
  return { messages: rows.slice(0, CHAT_PAGE).map(toChatMessage).reverse(), more: rows.length > CHAT_PAGE };
}

/** "סגירת הפאנל": the panel's cookies go, the session stays. */
export async function closeAdminAction(): Promise<void> {
  await closeAdmin();
  redirect("/account");
}

/** Only our own panel addresses (no open redirect). */
function safeBack(value: FormDataEntryValue | null): string {
  const v = typeof value === "string" ? value : "";
  return /^\/admin(\/users\/[0-9a-f-]{36})?(\?[A-Za-z0-9_=&%.\-]*)?(#[a-z0-9-]+)?$/.test(v) ? v : "/admin?tab=tickets";
}

function withNotice(back: string, kind: "notice" | "error", text: string): string {
  const [path, hash] = back.split("#");
  const url = new URL(path!, "https://admin.local");
  url.searchParams.set(kind, text);
  url.searchParams.delete(kind === "notice" ? "error" : "notice");
  return `${url.pathname}${url.search}${hash ? `#${hash}` : ""}`;
}
