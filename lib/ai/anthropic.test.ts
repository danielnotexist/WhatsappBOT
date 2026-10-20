import { describe, expect, it, vi } from "vitest";
import { AnthropicProvider, costUsd } from "./anthropic";
import { AiProviderError } from "./types";

function fakeFetch(body: unknown, status = 200) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

describe("AnthropicProvider", () => {
  it("sends adaptive thinking at low effort, cached system prompt and strict tools; parses text + tool calls", async () => {
    const f = fakeFetch({
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-5-5",
      content: [
        { type: "text", text: "רגע" },
        { type: "tool_use", id: "tu_1", name: "draft_email", input: { to_name: "רונית" } },
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 1000, output_tokens: 50, cache_read_input_tokens: 4000, cache_creation_input_tokens: 0 },
    });
    const p = new AnthropicProvider({ apiKey: "sk-test", fetch: f.fn });
    const res = await p.complete({ tier: "strong", system: "SYS", messages: [{ role: "user", content: "היי" }], tools: [{ name: "draft_email", description: "d", input_schema: { type: "object", properties: {}, required: [], additionalProperties: false } }] });
    expect(res.text).toBe("רגע");
    expect(res.toolCalls).toEqual([{ id: "tu_1", name: "draft_email", input: { to_name: "רונית" } }]);
    expect(res.stopReason).toBe("tool_use");
    expect(res.costUsd).toBeCloseTo((1000 * 2 + 50 * 10 + 4000 * 0.2) / 1e6, 8);
    const body = f.calls[0]!.body;
    expect(f.calls[0]!.url).toContain("/v1/messages");
    expect(body.model).toBe("claude-sonnet-5-5");
    expect(body.thinking).toEqual({ type: "adaptive" });
    expect(body.output_config).toEqual({ effort: "low" });
    expect(body.system).toEqual([{ type: "text", text: "SYS", cache_control: { type: "ephemeral" } }]);
    expect((body.tools as { strict: boolean }[])[0]!.strict).toBe(true);
    expect(body.tool_choice).toEqual({ type: "auto" });
  });

  it("uses the router model for the router tier and maps API errors", async () => {
    const f = fakeFetch({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }, 529);
    const p = new AnthropicProvider({ apiKey: "sk-test", fetch: f.fn });
    const err = (await p.complete({ tier: "router", system: "s", messages: [{ role: "user", content: "x" }] }).catch((e: unknown) => e)) as AiProviderError;
    expect(err).toBeInstanceOf(AiProviderError);
    expect(err.retryable).toBe(true);
    expect(f.calls[0]!.body.model).toBe("claude-haiku-5-5");
  });

  it("prices known models and returns null for unknown ones", () => {
    expect(costUsd("claude-haiku-5-5", { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 })).toBe(0.1);
    expect(costUsd("gpt-x", { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 })).toBeNull();
  });
});
