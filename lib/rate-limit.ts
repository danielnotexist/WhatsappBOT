import { isIP } from "node:net";
import { globalSingleton, setGlobalSingleton } from "@/lib/global-singleton";

/**
 * Sliding-window rate limiter. In-memory (per server instance) — best-effort per-IP limits; the limits that guard an
 * account (email codes, the admin code, the WhatsApp link code) are enforced in the database, atomically (0020).
 * Swap `RateLimiter` for a shared store later without touching callers.
 */
export interface RateLimiter {
  /** Returns true when the call is allowed, false when the window is exhausted. */
  hit(key: string, limit: number, windowMs: number, now?: number): boolean;
}

const MAX_KEYS = 10_000;
const SWEEP_EVERY_MS = 60_000;

export class MemoryRateLimiter implements RateLimiter {
  /** each key keeps its own window, so a sweep never cuts an hourly or daily key down to someone else's minute */
  private hits = new Map<string, { windowMs: number; times: number[] }>();
  private lastSweep = 0;

  hit(key: string, limit: number, windowMs: number, now: number = Date.now()): boolean {
    const entry = this.hits.get(key);
    const window = Math.max(windowMs, entry?.windowMs ?? 0);
    const list = (entry?.times ?? []).filter((t) => t > now - windowMs);
    // most recently used last (Map order) — the cap below drops the least recently used keys first
    this.hits.delete(key);
    if (list.length >= limit) {
      this.hits.set(key, { windowMs: window, times: list });
      return false;
    }
    list.push(now);
    this.hits.set(key, { windowMs: window, times: list });
    if (this.hits.size > MAX_KEYS) this.sweep(now);
    return true;
  }

  private sweep(now: number): void {
    if (now - this.lastSweep >= SWEEP_EVERY_MS) {
      this.lastSweep = now;
      for (const [k, v] of this.hits) {
        const kept = v.times.filter((t) => t > now - v.windowMs);
        if (kept.length) v.times = kept;
        else this.hits.delete(k);
      }
    }
    // still over the cap: the least recently used keys go
    for (const k of this.hits.keys()) {
      if (this.hits.size <= MAX_KEYS) break;
      this.hits.delete(k);
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

/** Expands an IPv6 address to its 8 groups (null when it is not one). */
function ipv6Groups(ip: string): string[] | null {
  if (isIP(ip) !== 6) return null;
  let s = ip.toLowerCase();
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (v4) {
    const b = v4[1]!.split(".").map(Number);
    s = s.slice(0, -v4[1]!.length) + `${((b[0]! << 8) | b[1]!).toString(16)}:${((b[2]! << 8) | b[3]!).toString(16)}`;
  }
  const [head, tail] = s.split("::") as [string, string | undefined];
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const groups = tail === undefined ? h : [...h, ...Array(8 - h.length - t.length).fill("0"), ...t];
  return groups.length === 8 ? groups.map((g) => g.padStart(4, "0")) : null;
}

/**
 * The client a limit counts: IPv4 as is; IPv6 by its /64 network (one subscriber usually holds a whole /64, so each
 * address of it is not a new client). An IPv4-mapped IPv6 address counts as its IPv4.
 */
export function clientKeyOf(ip: string): string {
  const groups = ipv6Groups(ip);
  if (!groups) return ip;
  if (groups.slice(0, 5).every((g) => g === "0000") && groups[5] === "ffff") {
    const n = [groups[6]!, groups[7]!].map((g) => parseInt(g, 16));
    return `${n[0]! >> 8}.${n[0]! & 255}.${n[1]! >> 8}.${n[1]! & 255}`;
  }
  return `${groups.slice(0, 4).join(":")}::/64`;
}

/** Client IP from the proxy headers Vercel sets ("unknown" when absent), IPv6 folded to its /64 (`clientKeyOf`). */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  const raw = xff ? xff.split(",")[0]!.trim() : (headers.get("x-real-ip") ?? "").trim();
  return raw ? clientKeyOf(raw) : "unknown";
}
