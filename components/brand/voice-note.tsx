import { cn } from "@/lib/utils";

const WAVE = [6, 10, 16, 12, 20, 8, 14, 18, 10, 6, 12, 16, 9, 14, 7, 11, 17, 9, 13, 6];

/**
 * A WhatsApp voice note (play button, waveform, length) with an optional transcript line under it. `icon="mic"`: a
 * recording the page does not keep (the website chat) shows a microphone instead of a play button that would do nothing.
 * The parent bubble carries the accessible label ("הודעה קולית, 0:34: …").
 */
export function VoiceNote({ duration, transcript, className, icon = "play" }: { duration: string; transcript?: string; className?: string; icon?: "play" | "mic" }) {
  return (
    <div className={cn("min-w-[12.5rem]", className)}>
      {/* media controls are not mirrored in RTL */}
      <div className="flex items-center gap-2" aria-hidden="true">
        <span className="grid size-[1.875rem] flex-none place-items-center rounded-full bg-[var(--wa-meta,var(--wa-time))]">
          {icon === "mic" ? (
            // a recording that cannot be played here: a microphone, not a play button
            <svg viewBox="0 0 24 24" className="size-3.5 fill-none stroke-[var(--wa-out)] stroke-[2.5]">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="size-3.5 fill-[var(--wa-out)]">
              <path d="M7 4l13 8-13 8z" />
            </svg>
          )}
        </span>
        <span className="flex h-[1.375rem] flex-1 items-center gap-[2px]">
          {WAVE.map((h, i) => (
            <i key={i} className="block w-[3px] rounded-sm bg-[var(--wa-meta,var(--wa-time))]" style={{ height: `${h}px` }} />
          ))}
        </span>
        <span className="text-[0.6875rem] text-[var(--wa-meta,var(--wa-time))] tabular">{duration}</span>
      </div>
      {transcript ? <p className="mt-1 text-[0.8125rem] text-[var(--wa-meta,var(--wa-time))]">״{transcript}״</p> : null}
    </div>
  );
}
