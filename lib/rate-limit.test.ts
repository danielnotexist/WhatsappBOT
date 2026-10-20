import { describe, expect, it } from "vitest";
import { MemoryRateLimiter, clientIp } from "./rate-limit";

describe("MemoryRateLimiter", () => {
  it("allows up to the limit inside the window and recovers after it", () => {
    const rl = new MemoryRateLimiter();
    const t0 = 1_000_000;
    expect(rl.hit("k", 2, 1000, t0)).toBe(true);
    expect(rl.hit("k", 2, 1000, t0 + 10)).toBe(true);
    expect(rl.hit("k", 2, 1000, t0 + 20)).toBe(false);
    expect(rl.hit("other", 2, 1000, t0 + 20)).toBe(true);
    expect(rl.hit("k", 2, 1000, t0 + 1001)).toBe(true);
  });

  it("reads the client ip from proxy headers", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(clientIp(new Headers({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
