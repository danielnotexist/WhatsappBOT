import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";

// Drafts until a lawyer signs off: keep them out of search engines (round plan §3).
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="stage flex min-h-dvh flex-col">
      <header className="mx-auto flex h-[4.75rem] w-full max-w-3xl items-center justify-between px-4 sm:px-8">
        <Wordmark />
        <nav aria-label="מסמכים" className="flex gap-4 text-[0.9375rem] text-cream-muted">
          <Link href="/terms" className="hover:text-cream hover:underline">
            תנאים
          </Link>
          <Link href="/privacy" className="hover:text-cream hover:underline">
            פרטיות
          </Link>
          <Link href="/accessibility" className="hover:text-cream hover:underline">
            נגישות
          </Link>
        </nav>
      </header>
      <div role="note" className="mx-auto mt-2 w-[calc(100%-2rem)] max-w-3xl rounded-2xl bg-honey px-5 py-3 text-[0.9375rem] font-semibold text-night sm:w-[calc(100%-4rem)]">
        טיוטה — המסמך עדיין בבדיקה משפטית ואינו בתוקף. הנוסח הסופי יפורסם כאן לפני ההשקה.
      </div>
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-24 text-[1.0625rem] leading-[1.75] sm:px-8">
        <article>{children}</article>
      </main>
    </div>
  );
}
