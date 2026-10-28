import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { TRUST } from "./content";
import { DeferredMascot, ProfileAvatar } from "./mascot";
import { CONTAINER, H2 } from "./ui";

/** Widths of the redacted chat rows (name, last message) — other people's chats, which she never sees. */
const HIDDEN_ROWS = [
  [38, 72],
  [52, 60],
  [30, 80],
  [46, 54],
  [34, 68],
  [42, 76],
] as const;

/** WhatsApp's chat list with everything blurred except her conversation: the headline, drawn. */
function ChatList() {
  const hidden = (w: readonly [number, number], i: number) => (
    <li key={i} className="flex items-center gap-3 px-5 py-3 opacity-70 blur-[2.5px]">
      <span className="size-11 flex-none rounded-full bg-[#2A3942]" />
      <span className="flex-1">
        <span className="block h-3 rounded-sm bg-[#2A3942]" style={{ width: `${w[0]}%` }} />
        <span className="mt-2 block h-2.5 rounded-sm bg-[#1D2A31]" style={{ width: `${w[1]}%` }} />
      </span>
      <span className="h-2 w-8 rounded-sm bg-[#1D2A31]" />
    </li>
  );
  return (
    <div className="mx-auto flex w-full max-w-[23rem] flex-col">
      {/* she perches on the list, thinking — decorative, the headline says it */}
      <DeferredMascot
        pose="thinking"
        sizes="(min-width: 640px) 136px, 112px"
        className="relative z-10 ms-8 -mb-[0.6rem] w-[7rem] self-start sm:w-[8.5rem]"
      />
      <div
        role="img"
        aria-label={`רשימת הצ׳אטים בוואטסאפ: רק השיחה עם ${BRAND.name} גלויה לה, כל השאר מוסתרות`}
        className="alze-crop relative overflow-hidden rounded-t-[2rem] bg-[var(--wa-bg)] text-[var(--wa-fg)] shadow-stage"
      >
        <p className="px-5 pt-6 pb-3 text-[1.375rem] font-bold">צ׳אטים</p>
        <ul>
          {HIDDEN_ROWS.slice(0, 2).map(hidden)}
          <li className="relative flex items-center gap-3 bg-[#1A2930] px-5 py-3.5">
            <ProfileAvatar size={44} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <b className="text-[1rem]">{BRAND.name}</b>
                <span className="tabular text-[0.75rem] text-[var(--wa-green)]">07:30</span>
              </span>
              <span className="mt-0.5 flex items-center justify-between gap-2">
                <span className="truncate text-[0.875rem] text-[var(--wa-time)]">
                  סיכום הבוקר, יום ה׳ 22.10
                </span>
                <span className="grid size-5 flex-none place-items-center rounded-full bg-[var(--wa-green)] text-[0.6875rem] font-bold text-[var(--wa-bg)]">
                  1
                </span>
              </span>
            </span>
          </li>
          {HIDDEN_ROWS.slice(2).map((w, i) => hidden(w, i + 2))}
        </ul>
      </div>
    </div>
  );
}

/** Trust: what she can and cannot see (drawn), and four plain facts as short headings. */
export function Trust() {
  return (
    <section
      id="trust"
      aria-labelledby="trust-title"
      className="alze-defer relative scroll-mt-6 bg-night-2 py-24 sm:py-32"
    >
      <div
        className={cn(
          CONTAINER,
          "grid gap-16 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-center lg:gap-20",
        )}
      >
        <div>
          <h2 id="trust-title" className={cn(H2, "max-w-[15ch]")}>
            היא רואה רק מה ששולחים לה.
          </h2>
          {/* four plain facts, headings only: the details are on the privacy page */}
          <ul className="mt-10 grid gap-x-12 sm:mt-12 sm:grid-cols-2">
            {TRUST.map((term) => (
              <li key={term} className="border-t border-line py-5 font-heading text-[1.5rem] leading-tight font-bold">
                {term}
              </li>
            ))}
          </ul>
        </div>
        <ChatList />
      </div>
    </section>
  );
}
