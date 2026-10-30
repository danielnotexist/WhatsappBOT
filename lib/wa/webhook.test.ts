import { describe, expect, it } from "vitest";
import { parseWebhook, toE164 } from "./webhook";

const base = (messages: unknown[], statuses: unknown[] = []) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "972500000000", phone_number_id: "PNID" },
            contacts: [{ profile: { name: "דנה לוי" }, wa_id: "972501234567" }],
            messages,
            statuses,
          },
        },
      ],
    },
  ],
});

describe("parseWebhook", () => {
  it("parses text, audio, image, button, list and template-button messages", () => {
    const parsed = parseWebhook(
      base([
        { from: "972501234567", id: "wamid.1", timestamp: "1760954400", type: "text", text: { body: "מה יש לי מחר?" } },
        { from: "972501234567", id: "wamid.2", timestamp: "1760954401", type: "audio", audio: { id: "M1", mime_type: "audio/ogg; codecs=opus", voice: true } },
        { from: "972501234567", id: "wamid.3", timestamp: "1760954402", type: "image", image: { id: "M2", mime_type: "image/jpeg", caption: "החשבונית" } },
        { from: "972501234567", id: "wamid.4", timestamp: "1760954403", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "approve:abc", title: "שלח" } }, context: { id: "wamid.out9" } },
        { from: "972501234567", id: "wamid.5", timestamp: "1760954404", type: "interactive", interactive: { type: "list_reply", list_reply: { id: "mt:0730", title: "07:30" } } },
        { from: "972501234567", id: "wamid.6", timestamp: "1760954405", type: "button", button: { text: "בוצע", payload: "reminder_done" } },
        { from: "972501234567", id: "wamid.7", timestamp: "1760954406", type: "sticker", sticker: { id: "S" } },
      ]),
    );
    expect(parsed.messages).toHaveLength(7);
    const [t, a, i, b, l, tb, o] = parsed.messages;
    expect(t).toMatchObject({ type: "text", text: "מה יש לי מחר?", from: "972501234567", fromE164: "+972501234567", profileName: "דנה לוי", phoneNumberId: "PNID" });
    expect(t!.timestamp.toISOString()).toBe("2025-10-20T10:00:00.000Z");
    expect(a).toMatchObject({ type: "audio", mediaId: "M1", mimeType: "audio/ogg; codecs=opus", text: null });
    expect(i).toMatchObject({ type: "image", mediaId: "M2", text: "החשבונית" });
    expect(b).toMatchObject({ type: "button", reply: { id: "approve:abc", title: "שלח" }, contextMessageId: "wamid.out9", text: "שלח" });
    expect(l).toMatchObject({ type: "list", reply: { id: "mt:0730", title: "07:30" } });
    expect(tb).toMatchObject({ type: "template_button", reply: { id: "reminder_done", title: "בוצע" } });
    expect(o).toMatchObject({ type: "other", text: null });
  });

  it("parses statuses and ignores malformed bodies", () => {
    const parsed = parseWebhook(base([], [{ id: "wamid.out1", status: "read", timestamp: "1760954400", recipient_id: "972501234567" }, { id: "wamid.out2", status: "failed", errors: [{ code: 131047, title: "Re-engagement message" }] }]));
    expect(parsed.statuses).toHaveLength(2);
    expect(parsed.statuses[1]!.errors[0]!.code).toBe(131047);
    expect(parseWebhook(null).messages).toEqual([]);
    expect(parseWebhook({ object: "page" }).messages).toEqual([]);
    expect(parseWebhook({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "message_template_status_update", value: {} }] }] }).other).toEqual(["message_template_status_update"]);
    expect(parseWebhook(base([{ type: "text", text: { body: "no id" } }])).messages).toEqual([]);
  });

  it("drops reactions and WhatsApp's own notices; keeps an unsupported message so it gets the 'not supported' reply", () => {
    const parsed = parseWebhook(
      base([
        { from: "972501234567", id: "wamid.r1", timestamp: "1760954400", type: "reaction", reaction: { message_id: "wamid.out1", emoji: "👍" } },
        { from: "972501234567", id: "wamid.r2", timestamp: "1760954401", type: "reaction", reaction: { message_id: "wamid.out1" } },
        { from: "972501234567", id: "wamid.e1", timestamp: "1760954402", type: "ephemeral" },
        { from: "972501234567", id: "wamid.s1", timestamp: "1760954403", type: "system", system: { body: "changed number" } },
        { from: "972501234567", id: "wamid.u1", timestamp: "1760954404", type: "unsupported" },
      ]),
    );
    expect(parsed.messages.map((m) => m.waMessageId)).toEqual(["wamid.u1"]);
    expect(parsed.messages[0]).toMatchObject({ type: "other" });
  });

  it("with phoneNumberId skips changes addressed to another number", () => {
    const body = base([{ from: "972501234567", id: "wamid.1", timestamp: "1760954400", type: "text", text: { body: "היי" } }], [{ id: "wamid.out2", status: "failed" }]);
    expect(parseWebhook(body, { phoneNumberId: "PNID" }).messages).toHaveLength(1);
    const foreign = parseWebhook(body, { phoneNumberId: "OTHER" });
    expect(foreign.messages).toEqual([]);
    expect(foreign.statuses).toEqual([]);
    expect(foreign.other).toEqual(["messages:foreign_number"]);
    expect(parseWebhook(body).messages).toHaveLength(1);
  });

  it("normalises phone numbers to E.164", () => {
    expect(toE164("972501234567")).toBe("+972501234567");
    expect(toE164("+972-50-123-4567")).toBe("+972501234567");
    expect(toE164("")).toBe("");
  });
});
