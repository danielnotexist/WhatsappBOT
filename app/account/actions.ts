"use server";

import type { Route } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isBuiltinRole } from "@/lib/agents/constraints";
import { createAgentFor, deleteAgentFor, setAgentEnabledFor, updateAgentFor, type AgentResult } from "@/lib/agents/service";
import { getSession } from "@/lib/auth/current-user";
import { acopy } from "@/lib/copy/bot-agents";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import {
  cancelSubscriptionFor,
  deleteAccountFor,
  disconnectConnectionFor,
  keepAnnualFor,
  scheduleMonthlyFor,
  setProactiveAlertsFor,
  unlinkPhoneFor,
  type AccountActionResult,
} from "@/lib/account/service";
import { getBillingContext } from "@/lib/billing";
import { annualSwitchMessage, annualSwitchResult, switchToAnnualFromWeb } from "@/lib/billing/annual-switch";
import { EnvError } from "@/lib/env";
import { setFlash } from "@/lib/flash";
import { formatDay } from "./view";
import type { AccountArea } from "./areas";

/** Back to the personal area, on the area the action belongs to (./areas.ts), with the result as its notice. */
function back(result: AccountActionResult, area: Exclude<AccountArea, "overview">): never {
  const sp = new URLSearchParams();
  sp.set("tab", area);
  setFlash(sp, result.ok ? "notice" : "error", result.message);
  redirect(`/account?${sp.toString()}` as Route);
}

async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session) redirect("/start");
  return session.userId;
}

export async function disconnectAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  back(await disconnectConnectionFor(getDb(), userId, String(formData.get("id") ?? "")), "connections");
}

export async function unlinkPhoneAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  back(await unlinkPhoneFor(getDb(), userId, String(formData.get("id") ?? "")), "whatsapp");
}

export async function cancelSubscriptionAction(): Promise<void> {
  const userId = await requireUserId();
  back(await cancelSubscriptionFor(getDb(), userId), "plan");
}

/**
 * [מעבר לשנתי עכשיו] (a POST — server actions never run from a GET): the user id comes from the session only, and the
 * signed offer in the form must belong to it. Charges the saved card the amount that was shown (the annual price less
 * the unused part of the month); a replayed form shows the first result and never charges twice.
 */
export async function switchToAnnualAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  let result: AccountActionResult;
  try {
    const ctx = getBillingContext();
    const user = await ctx.db.getUser(userId);
    if (!user) {
      result = { ok: false, message: "החשבון לא נמצא." };
    } else {
      const out = await switchToAnnualFromWeb(ctx, user, String(formData.get("offer") ?? ""));
      const tz = user.timezone || "Asia/Jerusalem";
      if (out.kind === "done") {
        const m = annualSwitchMessage(await annualSwitchResult(ctx, user.id, out.approvalId), (d) => formatDay(d.toISOString(), tz));
        result = { ok: m.ok, message: m.text };
      } else {
        result = {
          ok: false,
          message:
            out.kind === "expired"
              ? "עברו יותר מ-10 דקות מאז שהמחיר הוצג, ולכן לא בוצע חיוב. כאן המחיר המעודכן."
              : out.kind === "busy"
                ? "יש חיוב קודם שעדיין בבדיקה. כדי לא לחייב פעמיים, לא בוצע חיוב נוסף."
                : "המצב של המנוי השתנה מאז שהמחיר הוצג, ולכן לא בוצע חיוב.",
        };
      }
    }
  } catch (e) {
    console.error("[account] switch to annual failed:", (e as Error).message);
    result = { ok: false, message: e instanceof EnvError ? e.message : "לא הצלחנו להשלים את המעבר לשנתי כרגע, ולא בוצע חיוב. אפשר לנסות שוב בעוד רגע." };
  }
  back(result, "plan");
}

/** Annual → monthly at the renewal (no charge, no refund). */
export async function scheduleMonthlyAction(): Promise<void> {
  const userId = await requireUserId();
  back(await scheduleMonthlyFor(getDb(), userId), "plan");
}

/** Undo: the plan stays annual. */
export async function keepAnnualAction(): Promise<void> {
  const userId = await requireUserId();
  back(await keepAnnualFor(getDb(), userId), "plan");
}

export async function deleteAccountAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const result = await deleteAccountFor(getDb(), userId, String(formData.get("confirm") ?? ""));
  if (!result.ok) back(result, "settings");
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/?deleted=1" as Route);
}

/** The proactive alerts' switch (pro; the same profile key as "בלי התראות" / "להחזיר התראות" in WhatsApp). */
export async function setAlertsAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  back(await setProactiveAlertsFor(getDb(), userId, String(formData.get("enabled") ?? "") === "1", new Date()), "settings");
}

// ---- agents (docs/design/agents.md §10): the user id comes only from the session; every key is checked against it
// in lib/agents/service.ts (a key from another account is simply "not found").

const field = (formData: FormData, name: string) => String(formData.get(name) ?? "");

/** The service result as a notice; a saved text that asks to skip the approval gets the explanation too. */
function agentNotice(result: AgentResult): AccountActionResult {
  if (!result.ok) return result;
  return { ok: true, message: result.approvalNote ? `${result.message} ${acopy["agent.approval_note"]()}` : result.message };
}

export async function createAgentAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const template = field(formData, "template");
  const result = await createAgentFor(
    getDb(),
    userId,
    {
      name: field(formData, "name"),
      template: isBuiltinRole(template) ? template : null,
      instructions: field(formData, "instructions"),
      capabilities: formData.getAll("capabilities").map(String),
      recipients: field(formData, "recipients"),
      maxOutboundPerDay: field(formData, "max_outbound") || null,
    },
    { source: "account", now: new Date() },
  );
  back(agentNotice(result), "agents");
}

export async function updateAgentAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const key = field(formData, "key");
  const builtin = key.startsWith("builtin:");
  const result = await updateAgentFor(
    getDb(),
    userId,
    key,
    {
      ...(builtin ? {} : { name: field(formData, "name") }),
      instructions: field(formData, "instructions"),
      capabilities: formData.getAll("capabilities").map(String),
      recipients: field(formData, "recipients"),
      maxOutboundPerDay: field(formData, "max_outbound") || null,
    },
    { source: "account", now: new Date() },
  );
  back(agentNotice(result), "agents");
}

export async function toggleAgentAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  back(agentNotice(await setAgentEnabledFor(getDb(), userId, field(formData, "key"), field(formData, "enabled") === "1", { source: "account", now: new Date() })), "agents");
}

export async function deleteAgentAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  back(agentNotice(await deleteAgentFor(getDb(), userId, field(formData, "key"), { source: "account", now: new Date() })), "agents");
}

export async function signOutAction(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/");
}
