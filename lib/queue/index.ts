import "server-only";
import { isDemo } from "@/lib/demo";
import { globalSingleton, setGlobalSingleton } from "@/lib/global-singleton";
import { LocalQueue } from "./local";
import { QStashQueue } from "./qstash";
import type { Queue } from "./types";

export type { Queue, QueueJob } from "./types";

const NAME = "queue";

/**
 * QStash when QSTASH_TOKEN is set (production); otherwise the in-process local fallback with a warning.
 * Production without QStash is a misconfiguration we surface loudly but do not block on — the webhook
 * must keep answering 200 to Meta. DEMO_MODE=1 always uses the local queue (nothing leaves the process).
 */
export function getQueue(): Queue {
  return globalSingleton<Queue>(NAME, () => {
    if (isDemo()) return new LocalQueue();
    const token = process.env.QSTASH_TOKEN?.trim();
    if (token) return new QStashQueue(token);
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[queue] אזהרה: QSTASH_TOKEN חסר בייצור — ההודעות והמשימות עוברות בתור מקומי בתוך התהליך: בלי ניסיונות חוזרים, ומשימה שנכשלה באמצע לא תישלח שוב. " +
          "המסירה הפנימית חתומה (HMAC על הזמן והתוכן, 5 דקות). להגדיר ב-Vercel: QSTASH_TOKEN, QSTASH_CURRENT_SIGNING_KEY, QSTASH_NEXT_SIGNING_KEY.",
      );
    } else {
      console.warn("[queue] QSTASH_TOKEN חסר — משתמש בתור מקומי בתוך התהליך (בלי ניסיונות חוזרים). להגדיר QSTASH_TOKEN, QSTASH_CURRENT_SIGNING_KEY, QSTASH_NEXT_SIGNING_KEY.");
    }
    return new LocalQueue();
  });
}

export function setQueueForTests(queue: Queue | undefined): void {
  setGlobalSingleton(NAME, queue);
}
