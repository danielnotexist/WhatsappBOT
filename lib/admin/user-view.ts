import "server-only";
import { notFound } from "next/navigation";
import type { Db, UserRow } from "@/lib/db/types";
import { ownerState } from "./auth";

/** The audit action of each page about one user (every view is written to audit_log). */
export type UserViewAction = "admin.view_user" | "admin.view_conversation" | "admin.view_activity";

export const USER_ID_RE = /^[0-9a-f-]{36}$/;

/**
 * The gate of /admin/users/<id> and its sub-pages: the owner with an open panel (lib/admin/auth.ts) and a well-formed
 * id of an existing user — anything else is notFound(). The view is written to the audit log under the owner, with the
 * user as the target. Request-time (cookies): call inside Suspense, after `await connection()`.
 */
export async function openUserView(db: Db, rawId: string, action: UserViewAction): Promise<{ owner: UserRow; user: UserRow }> {
  const s = await ownerState(db);
  if (s.state !== "ok") notFound();
  if (!USER_ID_RE.test(rawId)) notFound();
  const user = await db.adminGetUser(rawId);
  if (!user) notFound();
  await db.addAudit({ user_id: s.user.id, action, target: user.id, result: "ok" });
  return { owner: s.user, user };
}
