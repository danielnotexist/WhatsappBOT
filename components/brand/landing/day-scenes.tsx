import { PhoneMockup } from "@/components/brand/phone-mockup";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { BrandFilm } from "./brand-film";
import { SCENES } from "./content";
import { DeferredMascot } from "./mascot";
import { DaySwitch } from "./day-switch";
import { LAST_CHAT_SCENE } from "./phone-parts";
import { SCENE_LIGHT, SceneCaption, SceneScreen } from "./scene-parts";
import { CONTAINER, H2, LEDE } from "./ui";

/**
 * "How it works" as one working day (13:05 → 18:20 → 18:24 → 07:30 the next morning). The room's light follows the
 * clock: daylight, dusk, evening, dawn. Server-rendered as a vertical sequence (phones, reduced motion, no JS); on
 * large screens with motion allowed, DaySwitch swaps in the pinned scroll scene (lazy-loaded with motion + its data).
 * For now (DAY_SECTION) the section shows the brand film instead; the scenes stay here, one line away.
 */

/** The vertical sequence: an ordered list, because a day is a sequence. */
export function DayStatic() {
  return (
    <ol className={cn(CONTAINER, "mt-16 flex flex-col gap-24 sm:mt-24 sm:gap-32")}>
      {SCENES.map((scene, i) => (
        <li
          key={scene.time}
          className="alze-defer grid items-center gap-10 md:grid-cols-2 md:gap-12"
        >
          <SceneCaption scene={scene} />
          <div className="relative flex justify-center pt-[6.75rem] sm:pt-[8rem]">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-x-16 -inset-y-12 blur-2xl"
              style={{ backgroundImage: SCENE_LIGHT[i] }}
            />
            <div className="relative w-[min(100%,17.5rem)] sm:w-[18.5rem]">
              {/* she perches on the phone, in the pose of the scene (decorative) */}
              <DeferredMascot
                pose={scene.pose}
                sizes="(min-width: 640px) 120px, 104px"
                className="absolute end-3 bottom-[calc(100%-0.55rem)] z-10 w-[6.5rem] sm:w-[7.5rem]"
              />
              <PhoneMockup
                label={
                  i > LAST_CHAT_SCENE
                    ? `מסך הנעילה ב-${scene.time}: סיכום הבוקר מ${BRAND.name}`
                    : `השיחה עם ${BRAND.name} ב-${scene.time}`
                }
                className="w-full"
                screenClassName="max-sm:aspect-[9/16.5]"
              >
                <SceneScreen index={i} />
              </PhoneMockup>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * What stands under the heading of "יום עבודה אחד, בוואטסאפ." - a test (Daniel, 24.10.2026): "film" is the brand film
 * in a framed card (brand-film.tsx); "scenes" is the working day as scenes, pinned on large screens (DaySwitch).
 * Back to the scenes: change this one line to "scenes".
 */
export const DAY_SECTION: "film" | "scenes" = "film";

export function DaySection({ variant = DAY_SECTION }: { variant?: "film" | "scenes" }) {
  return (
    <section
      id="day"
      aria-labelledby="day-title"
      className={cn("relative scroll-mt-6 pt-12 sm:pt-20", variant === "film" ? "pb-20 sm:pb-28" : "pb-28 lg:pb-16")}
    >
      <div className={CONTAINER}>
        <h2 id="day-title" className={cn(H2, "max-w-[14ch]")}>
          יום עבודה אחד, בוואטסאפ.
        </h2>
        <p className={cn("mt-6 max-w-[33rem]", LEDE)}>
          בלי אפליקציה חדשה ובלי ללמוד מערכת. מה שמבקשים ממנה בשיחה, היא מטפלת בו במייל, ביומן
          ובקבצים.
        </p>
      </div>
      {variant === "film" ? (
        <div className={cn(CONTAINER, "mt-12 sm:mt-16")}>
          <BrandFilm />
        </div>
      ) : (
        <DaySwitch>
          <DayStatic />
        </DaySwitch>
      )}
    </section>
  );
}
