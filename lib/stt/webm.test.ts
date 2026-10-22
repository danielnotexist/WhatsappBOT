import { describe, expect, it } from "vitest";
import { fakeOggOpus, fakeWebm } from "./test-fixtures";
import { webmDurationMs } from "./webm";

describe("webmDurationMs — the length of a MediaRecorder WebM", () => {
  it("reads the latest block of unknown-size clusters (no Duration in a live recording)", () => {
    expect(webmDurationMs(fakeWebm(4000))).toBe(3800); // the last block starts at 3.8 s
    expect(webmDurationMs(fakeWebm(65_000))).toBe(64_800);
    expect(webmDurationMs(fakeWebm(65_000, { knownSizes: true }))).toBe(64_800);
    expect(webmDurationMs(fakeWebm(500, { blockMs: 20 }))).toBe(480);
  });

  it("a Duration element wins", () => {
    expect(webmDurationMs(fakeWebm(2000, { declaredMs: 90_000 }))).toBe(90_000);
  });

  it("null for anything else, a truncated file, or a stream without blocks", () => {
    expect(webmDurationMs(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]))).toBeNull();
    expect(webmDurationMs(fakeOggOpus(3000))).toBeNull();
    expect(webmDurationMs(new Uint8Array(0))).toBeNull();
    expect(webmDurationMs(fakeWebm(0))).toBeNull();
    const full = fakeWebm(10_000);
    expect(webmDurationMs(full.subarray(0, Math.floor(full.length / 2)))).toBeGreaterThan(0); // what arrived so far
  });
});
