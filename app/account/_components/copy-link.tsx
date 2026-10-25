"use client";

import { useState } from "react";
import { Cta } from "@/components/brand/cta";

/** "העתקת הקישור": the referral link to the clipboard, with a short confirmation read out to screen readers. */
export function CopyLinkButton({ text }: { text: string }) {
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
            setTimeout(() => setDone(false), 2500);
          },
          () => setDone(false),
        );
      }}
    >
      <span aria-live="polite">{done ? "הקישור הועתק" : "העתקת הקישור"}</span>
    </Cta>
  );
}
