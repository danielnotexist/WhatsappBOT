"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { areaHref, type AccountArea } from "../areas";

/**
 * The result of an action, shown at the top of the area it belongs to (../areas.ts). "סגירה" is a link to the area's
 * clean address; with JavaScript it closes the banner in place and drops the notice from the address bar.
 */
export function Banner({ kind, text, area }: { kind: "notice" | "error"; text: string; area: AccountArea }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  const error = kind === "error";
  const href = areaHref(area);
  return (
    <div
      role={error ? "alert" : "status"}
      className={cn(
        "mb-6 flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-[0.9375rem] leading-relaxed text-cream sm:px-5",
        error ? "border-destructive/45 bg-destructive/10" : "border-sage/35 bg-sage/10",
      )}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("mt-0.5 size-5 flex-none fill-none stroke-current stroke-[2.2]", error ? "text-destructive" : "text-sage")}>
        {error ? <path d="M12 7.5v5.5M12 16.5v.5M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" strokeLinecap="round" /> : <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
      <p className="flex-1">{text}</p>
      <a
        href={href}
        onClick={(e) => {
          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          setOpen(false);
          window.history.replaceState(null, "", href);
        }}
        className="flex-none rounded-sm text-cream-muted underline underline-offset-3 hover:text-cream"
      >
        סגירה
      </a>
    </div>
  );
}
