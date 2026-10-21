import { describe, expect, it } from "vitest";
import { MockStt } from "@/lib/stt/mock";
import { SttError } from "@/lib/stt/types";
import { zonedToUtc } from "@/lib/time/zoned";
import { WaApiError } from "@/lib/wa/client";
import { processInbound } from "./process-inbound";
import { makeHarness } from "./test-harness";

const OGG = { bytes: new Uint8Array([0x4f, 0x67, 0x67, 0x53]), mimeType: "audio/ogg; codecs=opus" };

async function setup(stt: MockStt | null = new MockStt(), onboarding: Record<string, unknown> = { step: "done", startedAt: "x" }) {
  const h = makeHarness(zonedToUtc({ year: 2026, month: 10, day: 21, hour: 10, minute: 15 }, "Asia/Jerusalem"));
  if (stt) h.ctx.stt = () => stt;
  const user = await h.db.createUser("dana@example.com");
  await h.db.mergeUserProfile(user.id, { onboarding });
  h.db.seedWaIdentity(user.id, "+972501234567");
  h.wa.media.set("media-1", OGG);
  const voice = () => h.inbound(null as unknown as string, { type: "audio", text: null, mediaId: "media-1", mimeType: "audio/ogg; codecs=opus" });
  return { h, user, voice, stt };
}

describe("voice notes", () => {
  it('"מקשיבה…", transcribes in Hebrew, stores the transcript on the message and answers it as text', async () => {
    const { h, user, voice, stt } = await setup();
    const r = await processInbound(h.ctx, voice());
    expect(r.note).toBe("replied");
    expect(h.wa.sent.map((s) => s.kind)).toEqual(["read", "reaction", "text", "text"]);
    expect(h.wa.sent[2]!.body).toBe("מקשיבה…");
    // MockStt says "תזכיר לי מחר ב-9 להתקשר לבנק" → the assistant sets the reminder
    expect(h.wa.texts.at(-1)).toBe("אזכיר: להתקשר לבנק\nמחר, 9:00");
    expect(stt!.calls[0]!.audio).toMatchObject({ bytes: OGG.bytes, mimeType: "audio/ogg; codecs=opus" });
    expect(stt!.calls[0]!.opts).toEqual({ language: "he" });
    const inbound = (await h.db.recentMessages(user.id, 10)).find((m) => m.direction === "in")!;
    expect(inbound).toMatchObject({ type: "audio", transcript: "תזכיר לי מחר ב-9 להתקשר לבנק", media_url: "wa-media:media-1" });
    expect(h.ai.calls[0]!.messages.at(-1)).toEqual({ role: "user", content: "תזכיר לי מחר ב-9 להתקשר לבנק" });
    expect((await h.db.getCurrentUsage(user.id))!.counted_messages).toBe(1);
  });

  it("echoes long or unclear recordings before acting on them", async () => {
    const { h, voice, stt } = await setup();
    stt!.enqueue({ text: "מה יש לי מחר", durationMs: 25_000 });
    await processInbound(h.ctx, voice());
    expect(h.wa.texts).toContain('הבנתי כך: "מה יש לי מחר"\nממשיכה לפי זה.');
  });

  it("answers in Hebrew when transcription fails or is empty, without counting the message", async () => {
    const { h, user, voice, stt } = await setup();
    stt!.enqueue(new SttError("Soniox 503", true, "soniox"), { text: "  " });
    expect((await processInbound(h.ctx, voice())).note).toBe("transcription failed");
    expect(h.wa.texts.at(-1)).toBe("לא הצלחתי להבין את ההקלטה — אולי רעש רקע או שהיא קצרה מדי. אפשר להקליט שוב, או לכתוב במילים.");
    expect((await processInbound(h.ctx, voice())).note).toBe("empty transcript");
    expect(await h.db.getCurrentUsage(user.id)).toBeNull();
  });

  it("refuses recordings over 20MB", async () => {
    const { h, voice } = await setup();
    h.wa.downloadMedia = async () => {
      throw new WaApiError("media too large: 30000000 bytes", 413, null, null);
    };
    expect((await processInbound(h.ctx, voice())).note).toBe("audio too large");
    expect(h.wa.texts.at(-1)).toContain("הקובץ גדול מדי");
  });

  it("transcribes before onboarding, so a spoken answer works too", async () => {
    const { h, user, voice, stt } = await setup(new MockStt(), { step: "ask_name", startedAt: "x" });
    stt!.enqueue({ text: "דנה" });
    expect((await processInbound(h.ctx, voice())).note).toBe("onboarding");
    expect((await h.db.getUser(user.id))!.name).toBe("דנה");
  });

  it("without an STT provider audio is declined as before", async () => {
    const { h, voice } = await setup(null);
    expect((await processInbound(h.ctx, voice())).note).toBe("unsupported audio");
    expect(h.wa.texts.at(-1)).toContain("עם הקלטות אני עדיין לא עובד");
  });
});
