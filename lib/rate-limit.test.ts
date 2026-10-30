import { describe, expect, it } from "vitest";
import { MemoryRateLimiter, clientIp, clientKeyOf } from "./rate-limit";

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

  it("counts an IPv6 client by its /64: rotating addresses inside it is one client", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "2001:db8:1:2:aaaa::1" }))).toBe("2001:0db8:0001:0002::/64");
    expect(clientKeyOf("2001:db8:1:2:ffff:ffff:ffff:ffff")).toBe("2001:0db8:0001:0002::/64");
    expect(clientKeyOf("2001:db8:1:3::1")).toBe("2001:0db8:0001:0003::/64");
    expect(clientKeyOf("::ffff:1.2.3.4")).toBe("1.2.3.4");
    expect(clientKeyOf("::1")).toBe("0000:0000:0000:0000::/64");
    expect(clientKeyOf("not-an-ip")).toBe("not-an-ip");
    const rl = new MemoryRateLimiter();
    for (let i = 1; i <= 3; i++) rl.hit(`otp:${clientKeyOf(`2001:db8:1:2::${i}`)}`, 3, 60_000, 1000);
    expect(rl.hit(`otp:${clientKeyOf("2001:db8:1:2::99")}`, 3, 60_000, 1000)).toBe(false);
  });

  it("a crowded map never cuts an hourly key down to a 1-minute caller's window", () => {
    const rl = new MemoryRateLimiter();
    const t0 = 10_000_000;
    for (let i = 0; i <= 10_000; i++) rl.hit(`m${i}`, 5, 60_000, t0); // a crowded map of 1-minute keys
    expect(rl.hit("hourly", 1, 3_600_000, t0 + 1)).toBe(true);
    // two minutes later a 1-minute caller sweeps the crowded map: the stale minute keys go, the hourly hit stays
    rl.hit("late", 5, 60_000, t0 + 2 * 60_000);
    expect(rl.hit("hourly", 1, 3_600_000, t0 + 10 * 60_000)).toBe(false);
  });
});
