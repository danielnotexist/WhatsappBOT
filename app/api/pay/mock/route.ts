import { dataMode } from "@/lib/env";

/**
 * DATA_MODE=memory only: stands in for HYP's hosted payment page. "Pays" immediately and redirects to
 * /api/pay/return with the query HYP would send (Id, CCode, Amount, ACode, Order, Sign).
 */
export async function GET(request: Request) {
  if (dataMode() !== "memory") return new Response("not found", { status: 404 });
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
