import "server-only";
import { getDb } from "@/lib/db";
import { getHyp } from "@/lib/hyp";
import { getWaSender } from "@/lib/wa";
import type { BillingContext } from "./service";

export function getBillingContext(): BillingContext {
  return { db: getDb(), hyp: getHyp(), wa: getWaSender(), appUrl: process.env.APP_URL || "http://localhost:3000", now: () => new Date() };
}
