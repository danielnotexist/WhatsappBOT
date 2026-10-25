import { afterEach, describe, expect, it, vi } from "vitest";
import { setHypForTests } from "@/lib/hyp";
import { MockHypGateway } from "@/lib/hyp/client";
import { GET, POST } from "./route";

vi.mock("next/server", () => ({ connection: async () => undefined }));

afterEach(() => {
  vi.unstubAllEnvs();
  setHypForTests(undefined);
});

const post = (body: unknown) => POST(new Request("http://localhost/api/dev/hyp", { method: "POST", body: JSON.stringify(body) }));

describe("/api/dev/hyp (memory-mode development only)", () => {
  it("scripts the mock gateway's next charges and counts them", async () => {
    vi.stubEnv("DATA_MODE", "memory");
    vi.stubEnv("NODE_ENV", "development");
    const hyp = new MockHypGateway("http://localhost");
    setHypForTests(hyp);
    expect(await (await post({ charge: ["4", "x", 6, "0"] })).json()).toEqual({ queued: 2 });
    expect(hyp.chargeScript).toEqual(["4", "0"]);
    await hyp.chargeToken({ amount: 1, token: "t", tokef: "3012", info: "i", order: "o", items: [] } as never);
    expect(await (await GET()).json()).toEqual({ charges: 1, queued: 1, lastCharge: { amount: 1 }, lastPage: null });
  });

  it("is a 404 outside memory mode and in production", async () => {
    setHypForTests(new MockHypGateway("http://localhost"));
    vi.stubEnv("DATA_MODE", "supabase");
    expect((await post({ charge: ["4"] })).status).toBe(404);
    expect((await GET()).status).toBe(404);
    vi.stubEnv("DATA_MODE", "memory");
    vi.stubEnv("NODE_ENV", "production");
    expect((await post({ charge: ["4"] })).status).toBe(404);
  });
});
