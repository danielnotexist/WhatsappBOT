import { globalSingleton, setGlobalSingleton } from "@/lib/global-singleton";

/**
 * Sliding-window rate limiter. In-memory (per server instance) — good enough for best-effort
 * per-IP limits on a single Vercel region; the per-email OTP limit is enforced in the database.
 * Swap `RateLimiter` for an Upstash-backed one later without touching callers.
 */
export interface RateLimiter {
  /** Returns true when the call is allowed, false when the window is exhausted. */
  hit(key: string, limit: number, windowMs: number, now?: number): boolean;
}

export class MemoryRateLimiter implements RateLimiter {
  private hits = new Map<string, number[]>();

  hit(key: string, limit: number, windowMs: number, now: number = Date.now()): boolean {
    const from = now - windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > from);
    if (list.length >= limit) {
      this.hits.set(key, list);
      return false;
    }
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 10_000) this.sweep(from);
    return true;
  }

  private sweep(from: number): void {
    for (const [k, v] of this.hits) {
      const kept = v.filter((t) => t > from);
      if (kept.length) this.hits.set(k, kept);
      else this.hits.delete(k);
    }
  }
}

const NAME = "rate-limiter";
export function getRateLimiter(): RateLimiter {
  return globalSingleton<RateLimiter>(NAME, () => new MemoryRateLimiter());
}
export function setRateLimiterForTests(limiter: RateLimiter | undefined): void {
  setGlobalSingleton(NAME, limiter);
}

/** Client IP from the proxy headers Vercel sets; "unknown" when absent. */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim() || "unknown";
  return headers.get("x-real-ip") ?? "unknown";
}
