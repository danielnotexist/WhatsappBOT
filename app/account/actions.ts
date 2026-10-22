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
  unlinkPhoneFor,
  type AccountActionResult,
} from "@/lib/account/service";

/** Back to the personal area with a notice; `section` puts it (and the scroll position) on that section. */
function back(result: AccountActionResult, section?: "agents"): never {
  const sp = new URLSearchParams();
  sp.set(result.ok ? "notice" : "error", result.message);
  if (section) sp.set("at", section);
  redirect(`/account?${sp.toString()}${section ? `#${section}` : ""}` as Route);
}

async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session) redirect("/start");
  return session.userId;
}

export async function disconnectAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  back(await disconnectConnectionFor(getDb(), userId, String(formData.get("id") ?? "")));
}

export async function unlinkPhoneAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  back(await unlinkPhoneFor(getDb(), userId, String(formData.get("id") ?? "")));
}

export async function cancelSubscriptionAction(): Promise<void> {
  const userId = await requireUserId();
  back(await cancelSubscriptionFor(getDb(), userId));
}

export async function deleteAccountAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const result = await deleteAccountFor(getDb(), userId, String(formData.get("confirm") ?? ""));
  if (!result.ok) back(result);
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/?deleted=1" as Route);
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
