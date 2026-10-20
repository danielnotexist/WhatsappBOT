import { describe, expect, it, vi } from "vitest";
import { QSTASH_PUBLISH_BASE, QStashQueue, signQStashJwt, verifyQStashSignature } from "./qstash";

describe("QStashQueue.enqueue", () => {
  it("publishes to the worker url with bearer token, dedupe id, retries and delay", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(`${QSTASH_PUBLISH_BASE}/https://app.example.co.il/api/wa/worker`);
      const h = init!.headers as Record<string, string>;
      expect(h.Authorization).toBe("Bearer qs_token");
      expect(h["Upstash-Deduplication-Id"]).toBe("wamid.1");
      expect(h["Upstash-Retries"]).toBe("3");
      expect(h["Upstash-Delay"]).toBe("5s");
      expect(JSON.parse(String(init!.body))).toEqual({ kind: "inbound" });
      return new Response(JSON.stringify({ messageId: "msg_1" }), { status: 201 });
    });
    const q = new QStashQueue("qs_token", fetchImpl as unknown as typeof fetch);
    expect(await q.enqueue({ url: "https://app.example.co.il/api/wa/worker", body: { kind: "inbound" }, dedupeId: "wamid.1", delaySeconds: 5 })).toEqual({ id: "msg_1" });
    const bad = new QStashQueue("qs_token", (async () => new Response("nope", { status: 401 })) as unknown as typeof fetch);
    await expect(bad.enqueue({ url: "https://x", body: {} })).rejects.toThrow(/401/);
  });
});

describe("verifyQStashSignature", () => {
  const url = "https://app.example.co.il/api/wa/worker";
  const body = JSON.stringify({ kind: "inbound", n: 1 });

  it("accepts a token signed with the current or next key", () => {
    expect(verifyQStashSignature(signQStashJwt(body, url, "cur"), body, url, { current: "cur", next: "nxt" })).toEqual({ ok: true });
    expect(verifyQStashSignature(signQStashJwt(body, url, "nxt"), body, url, { current: "cur", next: "nxt" })).toEqual({ ok: true });
  });

  it("rejects wrong key, wrong url, tampered body, expiry and garbage", () => {
    expect(verifyQStashSignature(signQStashJwt(body, url, "other"), body, url, { current: "cur" })).toMatchObject({ ok: false, reason: "bad signature" });
    expect(verifyQStashSignature(signQStashJwt(body, "https://evil", "cur"), body, url, { current: "cur" })).toMatchObject({ ok: false, reason: "url mismatch" });
    expect(verifyQStashSignature(signQStashJwt(body, url, "cur"), body + " ", url, { current: "cur" })).toMatchObject({ ok: false, reason: "body hash mismatch" });
    expect(verifyQStashSignature(signQStashJwt(body, url, "cur", { exp: 1 }), body, url, { current: "cur" })).toMatchObject({ ok: false, reason: "expired" });
    expect(verifyQStashSignature(signQStashJwt(body, url, "cur", { iss: "Nope" }), body, url, { current: "cur" })).toMatchObject({ ok: false, reason: "bad issuer" });
    expect(verifyQStashSignature(undefined, body, url, { current: "cur" })).toMatchObject({ ok: false });
    expect(verifyQStashSignature("a.b", body, url, { current: "cur" })).toMatchObject({ ok: false, reason: "malformed jwt" });
  });
});
