import "server-only";
import { dataMode } from "@/lib/env";
import { globalSingleton, setGlobalSingleton } from "@/lib/global-singleton";
import { MemoryDb } from "./memory";
import { SupabaseDb } from "./supabase";
import type { Db } from "./types";

export type { Db } from "./types";

const NAME = "db";

/**
 * The process-wide data layer. `DATA_MODE=memory` → in-memory (dev/tests, never production);
 * otherwise Supabase with the service-role key (throws a Hebrew EnvError listing missing vars).
 */
export function getDb(): Db {
  return globalSingleton<Db>(NAME, () => {
    if (dataMode() === "memory") {
      console.warn("[db] DATA_MODE=memory — הנתונים נשמרים בזיכרון התהליך בלבד (פיתוח/בדיקות).");
      return new MemoryDb();
    }
    return SupabaseDb.fromEnv();
  });
}

/** Tests only: swap the data layer. */
export function setDbForTests(db: Db | undefined): void {
  setGlobalSingleton(NAME, db);
}
