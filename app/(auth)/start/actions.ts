"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/auth/session";

/** "להשתמש במייל אחר" on the ready step: drop the session and start again from the email card. */
export async function switchEmailAction(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/start/email");
}
