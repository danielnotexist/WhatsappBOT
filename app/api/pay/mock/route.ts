import { connection } from "next/server";
import { integrationsMocked } from "@/lib/env";

/**
 * DATA_MODE=memory / DEMO_MODE=1 only: stands in for HYP's hosted payment page. "Pays" immediately and redirects to
 * /api/pay/return with the query HYP would send (Id, CCode, Amount, ACode, Order, Sign).
 */
export async function GET(request: Request) {
  // request-time: otherwise Cache Components prerenders this GET at build (a frozen 404 or a frozen redirect)
  await connection();
  if (!integrationsMocked()) return new Response("not found", { status: 404 });
  // The server action's redirect() reaches this same-origin URL as a client-side (RSC) navigation, which cannot follow
  // a route handler (the address bar would keep this URL). Answer it with a plain page so the router falls back to a
  // full load — like the real HYP page, which is always a full, cross-origin navigation.
  if (request.headers.get("rsc") === "1") {
    return new Response("", { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  }
  const url = new URL(request.url);
  const ret = new URL("/api/pay/return", process.env.APP_URL || url.origin);
  ret.searchParams.set("Id", String(Date.now()).slice(-9));
  ret.searchParams.set("CCode", url.searchParams.get("decline") ? "6" : "0");
  ret.searchParams.set("Amount", url.searchParams.get("Amount") ?? "99");
  ret.searchParams.set("ACode", "0001234");
  ret.searchParams.set("Order", url.searchParams.get("Order") ?? "");
  ret.searchParams.set("Sign", "mock");
  return Response.redirect(ret.toString(), 303);
}
