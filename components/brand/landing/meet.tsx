import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { HoopoeLoop } from "./hoopoe-loop";
import { CONTAINER, H2, LEDE } from "./ui";

/**
 * "נעים להכיר": the moment between the hero and the working day where the visitor meets her - one headline, one line,
 * and the hoopoe loop in a framed card (hoopoe-loop.tsx). On large screens the words sit at the start and the card
 * takes the wider column; on phones the card follows the words at full width.
 */
export function Meet() {
  return (
    <section id="meet" aria-labelledby="meet-title" className="relative scroll-mt-6 pt-4 pb-20 sm:pt-8 sm:pb-28">
      <div
        className={cn(
          CONTAINER,
          "grid items-center gap-10 sm:gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20",
        )}
      >
        <div>
          <h2 id="meet-title" className={cn(H2, "max-w-[12ch]")}>
            נעים להכיר, זו {BRAND.name}.
          </h2>
          <p className={cn(LEDE, "mt-6 max-w-[28rem]")}>
            שקטה, מסודרת ויודעת איפה הכול - כמו עוזרת ותיקה במשרד, רק בוואטסאפ.
          </p>
        </div>
        <HoopoeLoop />
      </div>
    </section>
  );
}
