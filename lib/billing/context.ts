import type { Db } from "@/lib/db/types";
import type { HypGateway } from "@/lib/hyp/client";
import type { WaSender } from "@/lib/wa/sender";

/** Everything the billing flows need — injected, so tests run with MemoryDb + MockHypGateway + RecordingWaSender. */
export interface BillingContext {
  db: Db;
  hyp: HypGateway;
  wa: WaSender;
  /** public site URL (APP_URL) for links sent in chat */
  appUrl: string;
  now: () => Date;
}
