import { cn } from "@/lib/utils";

export interface Draft {
  to: string;
  subject: string;
  body: string;
}

/** An email draft inside an incoming bubble (the thing עלזה asks to approve). Addresses stay LTR. */
export function DraftCard({ draft, className }: { draft: Draft; className?: string }) {
  return (
    <div className={cn("mb-1.5 rounded-lg border-s-[3px] border-honey bg-black/20 px-2.5 py-2 whitespace-normal", className)}>
      <p className="text-[0.6875rem] font-bold text-honey">טיוטת מייל</p>
      <p className="flex gap-1.5 text-[0.75rem] text-[var(--wa-time)]">
        <span>אל</span>
        <b dir="ltr" className="font-semibold break-all text-[var(--wa-fg)]">
          {draft.to}
        </b>
      </p>
      <p className="flex gap-1.5 text-[0.75rem] text-[var(--wa-time)]">
        <span>נושא</span>
        <b className="font-semibold text-[var(--wa-fg)]">{draft.subject}</b>
      </p>
      <p className="mt-1 text-[0.8125rem] whitespace-pre-line">{draft.body}</p>
    </div>
  );
}
