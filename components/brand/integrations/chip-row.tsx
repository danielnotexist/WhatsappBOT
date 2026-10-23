import type { IntegrationGroup } from "@/lib/integrations/catalogue";
import { IntegrationChips } from "./chips";
import { IntegrationTile, type TileSize } from "./tile";
import type { TileTone } from "./soon-tag";

/**
 * Catalogue groups → the interactive chip row (chips.tsx). Server component: the tiles (pictures or SVG marks) render
 * here and travel to the client island as finished elements.
 */
export function IntegrationChipRow({
  groups,
  labelledBy,
  label,
  size = "md",
  tone = "night",
  collapsed,
  className,
}: {
  groups: IntegrationGroup[];
  labelledBy?: string;
  label?: string;
  size?: TileSize;
  tone?: TileTone;
  /** show the first N and a "+K" button for the rest (chips.tsx) */
  collapsed?: number;
  className?: string;
}) {
  return (
    <IntegrationChips
      labelledBy={labelledBy}
      label={label}
      tone={tone}
      collapsed={collapsed}
      className={className}
      groups={groups.map((g) => ({
        id: g.vendor,
        label: g.title,
        items: g.items.map((i) => ({
          id: i.id,
          name: i.name,
          benefit: i.benefit,
          soon: i.status === "soon",
        })),
        marks: g.items.map((i) => <IntegrationTile key={i.id} integration={i} size={size} tone={tone} />),
      }))}
    />
  );
}
