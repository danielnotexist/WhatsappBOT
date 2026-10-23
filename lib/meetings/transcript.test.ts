import { describe, expect, it } from "vitest";
import { KOHEN_VTT } from "./__fixtures__/meetings-harness";
import { chunkText, cuesToText, docTranscriptToText, parseTimestamp, parseVtt, vttToText } from "./transcript";

describe("WebVTT (Teams transcripts)", () => {
  it("reads timestamps with and without hours", () => {
    expect(parseTimestamp("00:01:02.500")).toBe(62.5);
    expect(parseTimestamp("01:02.5")).toBe(62.5);
    expect(parseTimestamp("1:00:00.000")).toBe(3600);
    expect(parseTimestamp("nope")).toBeNaN();
  });

  it("skips the header, NOTE blocks and cue ids; keeps the speaker of <v …>", () => {
    const cues = parseVtt(KOHEN_VTT);
    expect(cues).toHaveLength(5);
    expect(cues[0]).toEqual({ start: 1, end: 5.2, speaker: "דנה לוי", text: "שלום לכולם, נעבור על הסטטוס של פרויקט כהן." });
    expect(cues.map((c) => c.speaker)).toEqual(["דנה לוי", "דנה לוי", "יוסי כהן", "רונית לוי", "יוסי כהן"]);
  });

  it("merges one speaker's consecutive cues into a turn, no timestamps", () => {
    expect(vttToText(KOHEN_VTT)).toBe(
      ["דנה לוי: שלום לכולם, נעבור על הסטטוס של פרויקט כהן. הלקוח ביקש להקדים את ההגשה.", "יוסי כהן: מסכים. מגישים את הטיוטה עד 28.10.", "רונית לוי: אני אכין את הנספחים עד יום ראשון.", "יוסי כהן: אני אבדוק את החוזה מול רו״ח ברק."].join("\n"),
    );
  });

  it("CRLF, a BOM, <v.class Name> without a closing tag, inner tags, entities and invisible marks", () => {
    const raw = "﻿WEBVTT\r\n\r\n00:00:01.000 --> 00:00:02.000 align:start position:10%\r\n<v.loud Moshe Cohen><b>Hello</b> &amp; welcome‏\r\nsecond line\r\n\r\n00:00:03.000 --> 00:00:04.000\r\nno speaker here\r\n\r\n00:00:05.000 --> 00:00:06.000\r\n<v Moshe Cohen></v>\r\n";
    const cues = parseVtt(raw);
    expect(cues).toEqual([
      { start: 1, end: 2, speaker: "Moshe Cohen", text: "Hello & welcome second line" },
      { start: 3, end: 4, speaker: null, text: "no speaker here" },
    ]);
    expect(cuesToText(cues)).toBe("Moshe Cohen: Hello & welcome second line\nno speaker here");
  });

  it("an empty or broken file gives no cues", () => {
    expect(parseVtt("")).toEqual([]);
    expect(parseVtt("WEBVTT\n\nNOTE nothing here")).toEqual([]);
    expect(vttToText("not a vtt at all")).toBe("");
  });
});

describe("Google Meet transcript Docs", () => {
  it("drops the timestamp lines and merges a speaker's lines", () => {
    const doc = "פגישת צוות - תמליל\n\n00:00:00\n\nדנה לוי: בוקר טוב.\nנתחיל בלקוחות.\nיוסי אברהם: מוכן.\n00:05:12\nיוסי אברהם: ההצעה נשלחה אתמול.\n";
    expect(docTranscriptToText(doc)).toBe("פגישת צוות - תמליל\nדנה לוי: בוקר טוב. נתחיל בלקוחות.\nיוסי אברהם: מוכן. ההצעה נשלחה אתמול.");
  });
});

describe("chunking long transcripts", () => {
  it("cuts at line boundaries, never above the limit, keeps everything in order", () => {
    const lines = Array.from({ length: 50 }, (_, i) => `דובר ${i}: ${"מילה ".repeat(10).trim()}`);
    const parts = chunkText(lines.join("\n"), 300);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(300);
    expect(parts.join("\n")).toBe(lines.join("\n"));
  });

  it("a single line longer than the limit is cut at a space", () => {
    const parts = chunkText(`${"א".repeat(40)} ${"ב".repeat(40)} ${"ג".repeat(40)}`, 90);
    expect(parts).toEqual([`${"א".repeat(40)} ${"ב".repeat(40)}`, "ג".repeat(40)]);
  });
});
