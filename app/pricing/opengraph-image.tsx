import { BRAND } from "@/lib/brand";
import { PLANS, TRIAL_MESSAGES } from "@/lib/billing/plans";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og/card";

/** /pricing's share image: the two plans and the free start (lib/billing/plans.ts), lib/og/card.tsx. */
export const alt = `המחירים של ${BRAND.name}: ${PLANS.basic.nameHe} ו${PLANS.pro.nameHe}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    kicker: "מחירים ומסלולים",
    title: `${PLANS.basic.nameHe} ${PLANS.basic.priceIls} ₪, ${PLANS.pro.nameHe} ${PLANS.pro.priceIls} ₪ לחודש.`,
    subtitle: `${TRIAL_MESSAGES} ההודעות הראשונות בחינם, בלי כרטיס אשראי ובלי התחייבות.`,
  });
}
