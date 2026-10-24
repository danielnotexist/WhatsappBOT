import { notFound } from "next/navigation";
import { connection, NextResponse } from "next/server";
import { gateCookie, recognisedOwner } from "@/lib/admin/auth";

/**
 * GET /admin/enter — "ניהול" in the personal area. For the owner (a session whose email is in ADMIN_EMAILS) it sets the
 * panel's gate cookie and goes on to /admin, where the one-time code is asked; for anyone else a 404, like /admin
 * itself (proxy.ts). The email alone opens nothing (lib/admin/auth.ts).
 */
export async function GET(request: Request) {
  await connection();
  const owner = await recognisedOwner();
  if (!owner) notFound();
  const gate = gateCookie(owner.id);
  const response = NextResponse.redirect(new URL("/admin", request.url), 303);
  response.cookies.set(gate.name, gate.value, gate.options);
  response.headers.set("cache-control", "no-store");
  return response;
}
