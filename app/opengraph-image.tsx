import { BRAND } from "@/lib/brand";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og/card";

/** The site's share image (the home page, and every page without its own): lib/og/card.tsx. */
export const alt = `${BRAND.name} - ${BRAND.tagline}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({ title: BRAND.tagline, subtitle: "מייל, יומן וקבצים של העסק, בעברית. שום דבר לא יוצא בלי אישור." });
}
