"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Typed confirmation for deleting the account: the button wakes up only once the exact word is typed (the server
 * action checks it again — lib/account/service.ts). Shown inside a closed <details>, so it is never in the way.
 */
export function DeleteAccountForm({ action, word }: { action: (formData: FormData) => Promise<void>; word: string }) {
  const id = useId();
  const hintId = useId();
  const [value, setValue] = useState("");
  const ready = value.trim() === word;
  return (
    <form action={action} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-2">
        <label htmlFor={id} className="text-[0.9375rem]">
          כדי למחוק, מקלידים את המילה <b className="font-semibold text-cream">״{word}״</b>
        </label>
        <input
          id={id}
          name="confirm"
          autoComplete="off"
          spellCheck={false}
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-describedby={hintId}
          className="h-12 w-full rounded-field border-2 border-cream-muted/60 bg-night px-4 text-[1.0625rem] text-cream transition-[border-color,box-shadow] duration-150 focus-visible:border-[var(--alze-error-on-dark)] focus-visible:shadow-[0_0_0_4px_rgb(242_160_139/0.18)] focus-visible:outline-none"
        />
      </div>
      <button
        type="submit"
        disabled={!ready}
        className={cn(
          "inline-flex min-h-12 flex-none items-center justify-center rounded-full px-6 text-[0.9375rem] font-semibold transition-[background-color,color,transform] duration-150 select-none focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[var(--alze-error-on-dark)]",
          ready ? "cursor-pointer bg-[var(--alze-error-on-dark)] text-night hover:bg-[#F5B3A2] active:translate-y-px" : "cursor-not-allowed bg-cream/8 text-cream-muted",
        )}
      >
        מחיקת החשבון לצמיתות
      </button>
      <p id={hintId} className="sr-only">
        הכפתור נפתח אחרי הקלדת המילה.
      </p>
    </form>
  );
}
