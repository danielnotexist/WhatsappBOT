/**
 * The site frame (Daniel, 28.10.2026: the logo and the slogan never move between pages). Every page header is this
 * bar: the landing's 84rem grid with its 16 / 32 / 48px gutters, 4.75rem tall, the wordmark at its inline start — so
 * the wordmark sits on the same pixel on the landing, /pricing, the signup and sign-in screens, /account and the legal
 * pages, and the page transition (components/brand/page-transition.tsx) can hold it perfectly still.
 * The html element reserves the scrollbar's gutter (app/globals.css), so a page that scrolls and one that does not
 * centre this frame on the same width.
 */
export const FRAME = "mx-auto w-full max-w-[84rem] px-4 sm:px-8 lg:px-12";

/** The header row inside the frame. */
export const HEADER_BAR = `${FRAME} flex h-[4.75rem] flex-none items-center justify-between gap-4`;

/** The frame's content box on wide screens (84rem minus the 2 × 3rem gutters): a grid that lines up with the wordmark. */
export const FRAME_CONTENT_MAX = "lg:max-w-[78rem]";
