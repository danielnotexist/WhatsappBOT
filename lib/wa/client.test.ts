import { describe, expect, it, vi } from "vitest";
import { WaApiError, WaClient } from "./client";

function mockFetch(responder: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init?: RequestInit; body?: unknown }[] = [];
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    let body: unknown;
    if (typeof init?.body === "string") body = JSON.parse(init.body);
    calls.push({ url, init, body });
    return responder(url, init);
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const okSend = () => new Response(JSON.stringify({ messaging_product: "whatsapp", contacts: [{ wa_id: "972501234567" }], messages: [{ id: "wamid.out1" }] }), { status: 200 });

describe("WaClient", () => {
  const make = (responder: (url: string, init?: RequestInit) => Response | Promise<Response> = okSend) => {
    const f = mockFetch(responder);
    const client = new WaClient({ accessToken: "TOKEN", phoneNumberId: "PNID", fetchImpl: f.fn });
    return { client, ...f };
  };

  it("sends text with bearer auth, digits-only recipient and optional reply context", async () => {
    const { client, calls } = make();
    const r = await client.sendText("+972501234567", "שלום", { replyTo: "wamid.in1" });
    expect(r).toEqual({ messageId: "wamid.out1", waId: "972501234567" });
    expect(calls[0]!.url).toBe("https://graph.facebook.com/v21.0/PNID/messages");
    expect((calls[0]!.init!.headers as Record<string, string>).Authorization).toBe("Bearer TOKEN");
    expect(calls[0]!.body).toMatchObject({ messaging_product: "whatsapp", to: "972501234567", type: "text", text: { body: "שלום", preview_url: false }, context: { message_id: "wamid.in1" } });
  });

  it("sends reply buttons (max 3, titles trimmed to 20) and lists (max 10 rows)", async () => {
    const { client, calls } = make();
    await client.sendButtons("972501234567", "לשלוח כך?", [
      { id: "approve:1", title: "שלח" },
      { id: "edit:1", title: "ערוך" },
      { id: "cancel:1", title: "בטל" },
    ]);
    const b = calls[0]!.body as { interactive: { type: string; action: { buttons: { reply: { id: string; title: string } }[] } } };
    expect(b.interactive.type).toBe("button");
    expect(b.interactive.action.buttons.map((x) => x.reply.title)).toEqual(["שלח", "ערוך", "בטל"]);
    expect(() => client.sendButtons("1", "x", [])).toThrow(/buttons/);
    expect(() => client.sendButtons("1", "x", new Array(4).fill({ id: "a", title: "b" }))).toThrow(/buttons/);

    await client.sendList("972501234567", "באיזו שעה?", "בחירה", [{ rows: [{ id: "t:0700", title: "07:00" }, { id: "t:none", title: "לא עכשיו", description: "אפשר לקבוע אחר כך" }] }]);
    const l = calls[1]!.body as { interactive: { type: string; action: { button: string; sections: { rows: unknown[] }[] } } };
    expect(l.interactive.type).toBe("list");
    expect(l.interactive.action.button).toBe("בחירה");
    expect(l.interactive.action.sections[0]!.rows).toHaveLength(2);
    expect(() => client.sendList("1", "x", "b", [{ rows: new Array(11).fill({ id: "a", title: "b" }) }])).toThrow(/rows/);
  });

  it("sends reactions, read receipts with typing, images and templates", async () => {
    const { client, calls } = make();
    await client.sendReaction("972501234567", "wamid.in1", "✅");
    expect(calls[0]!.body).toMatchObject({ type: "reaction", reaction: { message_id: "wamid.in1", emoji: "✅" } });
    await client.markRead("wamid.in1", { typing: true });
    expect(calls[1]!.body).toEqual({ messaging_product: "whatsapp", status: "read", message_id: "wamid.in1", typing_indicator: { type: "text" } });
    await client.sendImage("972501234567", { link: "https://x/y.png" }, "4 דרכים");
    expect(calls[2]!.body).toMatchObject({ type: "image", image: { link: "https://x/y.png", caption: "4 דרכים" } });
    await client.sendTemplate("972501234567", "reminder", [{ type: "text", text: "להתקשר לבנק" }, { type: "text", text: "18:40" }], [{ index: 0, subType: "url", text: "u_1" }]);
    expect(calls[3]!.body).toMatchObject({
      type: "template",
      template: {
        name: "reminder",
        language: { code: "he" },
        components: [
          { type: "body", parameters: [{ type: "text", text: "להתקשר לבנק" }, { type: "text", text: "18:40" }] },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "u_1" }] },
        ],
      },
    });
  });

  it("downloads media in two steps with the bearer token and enforces the size cap", async () => {
    const { client, calls } = make((url) => {
      if (url.endsWith("/MEDIA1")) return new Response(JSON.stringify({ id: "MEDIA1", url: "https://lookaside/x", mime_type: "audio/ogg", sha256: "s", file_size: 3 }), { status: 200 });
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    });
    const m = await client.downloadMedia("MEDIA1");
    expect(m.mimeType).toBe("audio/ogg");
    expect([...m.bytes]).toEqual([1, 2, 3]);
    expect((calls[1]!.init!.headers as Record<string, string>).Authorization).toBe("Bearer TOKEN");
    await expect(client.downloadMedia("MEDIA1", 2)).rejects.toThrow(/too large/);
  });

  it("surfaces Graph errors as WaApiError with retryable classification", async () => {
    const { client } = make(() => new Response(JSON.stringify({ error: { message: "(#130429) Rate limit hit", code: 130429 } }), { status: 400 }));
    const err = (await client.sendText("1", "x").catch((e: unknown) => e)) as WaApiError;
    expect(err).toBeInstanceOf(WaApiError);
    expect(err.code).toBe(130429);
    expect(err.retryable).toBe(true);
    expect(err.message).toContain("Rate limit");
    const { client: c2 } = make(() => new Response("nope", { status: 401 }));
    const e2 = (await c2.sendText("1", "x").catch((e: unknown) => e)) as WaApiError;
    expect(e2.retryable).toBe(false);
  });
});
