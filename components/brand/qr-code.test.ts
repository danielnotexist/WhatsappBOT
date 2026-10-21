import { describe, expect, it } from "vitest";
import { palette } from "@/lib/design/tokens";
import { qrSvg } from "./qr-code";

describe("QrCode", () => {
  it("renders an SVG in the brand colours on the server", async () => {
    const svg = await qrSvg("https://wa.me/972500000000?text=%D7%94%D7%99%D7%99");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("<path");
    expect(svg.toLowerCase()).toContain(palette.ink.toLowerCase());
    expect(svg.toLowerCase()).toContain(palette.paper.toLowerCase());
    expect(svg).not.toMatch(/<script/i);
  });
});
