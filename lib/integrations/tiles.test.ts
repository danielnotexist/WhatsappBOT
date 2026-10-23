import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SERVICE_TILE, serviceTileSrc } from "@/lib/connections/service-tiles";
import { INTEGRATIONS } from "./catalogue";
import { INTEGRATION_MARK_STYLE, INTEGRATION_TILE, MORE_TILE, integrationTileSrc, tileSrc, type TileSet } from "./tiles";

const PUBLIC = join(__dirname, "..", "..", "public");
const SETS: TileSet[] = ["night", "paper"];
const onDisk = (src: string) => existsSync(join(PUBLIC, src));

describe("the icon tiles (public/brand/integrations/<set>/*.webp)", () => {
  it("are the switched-on style; the SVG marks stay behind the one switch", () => {
    expect(["tiles", "svg"]).toContain(INTEGRATION_MARK_STYLE);
    expect(INTEGRATION_MARK_STYLE).toBe("tiles");
  });

  it("map every catalogue system to a tile that exists in both sets, and nothing else", () => {
    expect(Object.keys(INTEGRATION_TILE).sort()).toEqual(INTEGRATIONS.map((i) => i.id).sort());
    for (const i of INTEGRATIONS)
      for (const set of SETS) {
        const src = integrationTileSrc(i.id, set);
        expect(src, `${i.id} (${set})`).toBe(`/brand/integrations/${set}/${INTEGRATION_TILE[i.id]}.webp`);
        expect(onDisk(src!), `${src}`).toBe(true);
      }
    expect(integrationTileSrc("no-such-system")).toBeNull();
  });

  it("has the 'more' tile and every services-row tile in both sets, and the two sets hold the same files", () => {
    for (const set of SETS) {
      expect(onDisk(tileSrc(MORE_TILE, set))).toBe(true);
      for (const file of Object.values(SERVICE_TILE)) expect(onDisk(tileSrc(file, set)), `${file} (${set})`).toBe(true);
    }
    const files = (set: TileSet) => readdirSync(join(PUBLIC, "brand", "integrations", set)).sort();
    expect(files("night")).toEqual(files("paper"));
    expect(files("night")).toHaveLength(24);
    expect(serviceTileSrc("outlook_calendar")).toBe("/brand/integrations/night/ms-calendar.webp");
  });
});
