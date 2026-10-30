import { afterEach, describe, expect, it, vi } from "vitest";
import { getQueue, setQueueForTests } from "./index";

describe("getQueue", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    setQueueForTests(undefined);
  });

  it("production without QSTASH_TOKEN: falls back to the local queue with a clear error in the log, not silently", () => {
    vi.stubEnv("DEMO_MODE", "0");
    vi.stubEnv("QSTASH_TOKEN", "");
    vi.stubEnv("NODE_ENV", "production");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    setQueueForTests(undefined);
    expect(getQueue().kind).toBe("local");
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]![0])).toMatch(/אזהרה: QSTASH_TOKEN חסר בייצור.*QSTASH_CURRENT_SIGNING_KEY/);
  });

  it("uses QStash when QSTASH_TOKEN is set", () => {
    vi.stubEnv("DEMO_MODE", "0");
    vi.stubEnv("QSTASH_TOKEN", "qs_token");
    setQueueForTests(undefined);
    expect(getQueue().kind).toBe("qstash");
  });
});
