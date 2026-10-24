"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { alertSettingsFromForm, saveAlertSettings, sendTestAlert } from "@/lib/admin/alerts";
import { requireOwner } from "@/lib/admin/auth";
import { OWNER_ALERT_KINDS } from "@/lib/copy/owner-alerts";
import { getDb } from "@/lib/db";

/**
 * The alerts tab's server actions (/admin?tab=alerts). Each one checks the owner again (requireOwner: the open panel,
 * or a 404) and leaves an audit entry. Back to the tab with a notice.
 */

const back = (kind: "notice" | "error", text: string): Route => `/admin?${new URLSearchParams({ tab: "alerts", [kind]: text }).toString()}` as Route;

/** "שמירת ההגדרות": the switch of every type, the quiet hours, Shabbat and the error-spike threshold. */
export async function saveAlertSettingsAction(form: FormData): Promise<void> {
  const owner = await requireOwner();
  const parsed = alertSettingsFromForm(form);
  if (!parsed.ok) redirect(back("error", parsed.error));
  const db = getDb();
  const s = await saveAlertSettings(db, parsed.settings);
  const off = OWNER_ALERT_KINDS.filter((k) => !s.types[k.type]).map((k) => k.type);
  const quiet = s.quiet.enabled ? `${s.quiet.start}-${s.quiet.end}` : "none";
  await db.addAudit({ user_id: owner.id, action: "admin.alerts_update", target: "owner_alerts:settings", result: `off=${off.join(",") || "none"};quiet=${quiet};shabbat=${s.quiet.shabbat ? "on" : "off"};spike=${s.errorSpikeThreshold}` });
  redirect(back("notice", "הגדרות ההתראות נשמרו."));
}

/** "שליחת מייל בדיקה": one mail to the owner addresses now, whatever the switches and the quiet hours say. */
export async function sendTestAlertAction(): Promise<void> {
  const owner = await requireOwner();
  const db = getDb();
  const r = await sendTestAlert(owner.email, { db });
  await db.addAudit({ user_id: owner.id, action: "admin.alerts_test", target: owner.email, result: r.status });
  if (r.status === "sent") redirect(back("notice", "מייל הבדיקה נשלח. כדאי לבדוק את תיבת הדואר (וגם את תיקיית הספאם)."));
  if (r.status === "limited") redirect(back("error", "נשלחו יותר מדי מיילי בדיקה בשעה האחרונה. אפשר לנסות שוב מאוחר יותר."));
  redirect(back("error", `מייל הבדיקה לא נשלח${r.error ? `: ${r.error}` : "."}`.slice(0, 300)));
}
