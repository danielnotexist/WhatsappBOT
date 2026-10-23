import "server-only";
import type { Db } from "@/lib/db/types";
import { driveReadAccess, gmailReadAccess, googleCapConfig } from "@/lib/google/user-cap";
import { envReadGates, gateFrom, type ReadGates } from "./services";

/**
 * The restricted Google reads for one account, as the start route will decide them (lib/google/user-cap.ts): open,
 * switched off, or the user cap full for an account Google has not counted. Never throws — a ledger or config error
 * falls back to the switches alone (the start route then answers an explicit request itself).
 */
export async function googleReadGates(db: Db, accountEmail: string | null): Promise<ReadGates> {
  try {
    const cfg = googleCapConfig();
    const [gmail, drive] = await Promise.all([gmailReadAccess(db, accountEmail, cfg), driveReadAccess(db, accountEmail, cfg)]);
    return { gmail_read: gateFrom(gmail), drive_read: gateFrom(drive) };
  } catch (e) {
    console.error("[connections] read gates fell back to the switches:", (e as Error).message);
    return envReadGates();
  }
}
