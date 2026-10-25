import { notFound } from "next/navigation";
import { PROFESSION_PAGES, professionPage } from "@/components/brand/landing/profession-pages";
import { BRAND } from "@/lib/brand";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og/card";

/** Each profession page's share image: its headline and one of its everyday questions (lib/og/card.tsx). */
export const alt = `${BRAND.name} - עוזרת אישית בוואטסאפ לפי מקצוע`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export function generateStaticParams(): { profession: string }[] {
  return PROFESSION_PAGES.map((p) => ({ profession: p.slug }));
}

export default async function Image({ params }: { params: Promise<{ profession: string }> }) {
  const p = professionPage((await params).profession);
  if (!p) notFound();
  return ogImage({ kicker: `לפי מקצוע: ${p.profession}`, title: p.headline, subtitle: `״${p.exchanges[0]!.ask}״` });
}
