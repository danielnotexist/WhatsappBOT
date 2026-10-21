import "server-only";
import { createDemoDb } from "@/lib/auth/demo-user";
import { isDemo } from "@/lib/demo";
import { dataMode } from "@/lib/env";
import { globalSingleton, setGlobalSingleton } from "@/lib/global-singleton";
import { MemoryDb } from "./memory";
import { SupabaseDb } from "./supabase";
import type { Db } from "./types";

export type { Db } from "./types";

const NAME = "db";

/**
 * The process-wide data layer.
 *   - `DATA_MODE=memory` → in-memory (dev/tests, never production).
 *   - `DEMO_MODE=1` without SUPABASE_* → in-memory, production included, user ids derived from the email
 *     (lib/auth/demo-user.ts) so every serverless instance agrees on them.
 *   - otherwise (the demo with SUPABASE_* included) → Supabase with the service-role key over HTTPS (supabase-js,
 *     stateless — fine on serverless); throws a Hebrew EnvError listing missing vars.
 */
export function getDb(): Db {
  return globalSingleton<Db>(NAME, () => {
    const demo = isDemo();
    if (dataMode() === "memory") {
      if (demo) {
        console.info("[db] DEMO_MODE=1 בלי Supabase — הנתונים בזיכרון התהליך בלבד.");
        return createDemoDb();
      }
      console.warn("[db] DATA_MODE=memory — הנתונים נשמרים בזיכרון התהליך בלבד (פיתוח/בדיקות).");
      return new MemoryDb();
    }
    if (demo) console.info("[db] DEMO_MODE=1 עם Supabase — הנתונים נשמרים, שום דבר לא נשלח החוצה.");
    return SupabaseDb.fromEnv();
  });
}

/** Tests only: swap the data layer. */
export function setDbForTests(db: Db | undefined): void {
  setGlobalSingleton(NAME, db);
}
