import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * דף נחיתה — placeholder בלבד. כיווני העיצוב (PLAN §10) נבנים בנפרד; כאן רק כותרת אחת ו-CTA אחד.
 */
export default function HomePage() {
  return (
    <main id="main" className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-24 text-center">
      <h1 className="max-w-3xl font-heading text-4xl leading-tight font-bold text-balance sm:text-6xl">
        עוזר אישי בוואטסאפ שמטפל במייל, ביומן ובקבצים של העסק שלך — בעברית
      </h1>
      <Button size="lg" nativeButton={false} render={<Link href="/start" />}>
        להתחיל — לוקח בערך דקה
      </Button>
    </main>
  );
}
