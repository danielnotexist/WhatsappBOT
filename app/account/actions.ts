"use server";

import type { Route } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/current-user";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import {
  cancelSubscriptionFor,
  deleteAccountFor,
  disconnectConnectionFor,
  unlinkPhoneFor,
  type AccountActionResult,
} from "@/lib/account/service";

function back(result: AccountActionResult): never {
  const sp = new URLSearchParams();
  sp.set(result.ok ? "notice" : "error", result.message);
  redirect(`/account?${sp.toString()}` as Route);
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

export async function signOutAction(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/");
}
