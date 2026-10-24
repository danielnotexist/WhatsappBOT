"use client";

import { useState } from "react";
import { Cta } from "@/components/brand/cta";

/** "העתקת פרטים": the user's details as plain text to the clipboard (to paste into a reply or a note). */
export function CopyButton({ text, label = "העתקת פרטים" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Cta
      type="button"
      tone="ghost"
      size="sm"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 2000);
          },
          () => setDone(false),
        );
      }}
    >
      <span aria-live="polite">{done ? "הועתק" : label}</span>
    </Cta>
  );
}
