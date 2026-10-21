import { cn } from "@/lib/utils";
import type { Scene } from "./content";
import { LAST_CHAT_SCENE, LockScreen, ThreadSnapshot, WaComposer, WaHeader } from "./phone-parts";
import { LEDE } from "./ui";

/** Pieces shared by the day scene's vertical sequence (server) and its pinned version (client, lazy). */

/** The light of each hour, thrown behind the phone (vertical sequence) or across the whole stage (pinned). */
export const SCENE_LIGHT = [
  // 13:05 — flat daylight from a window above
  "radial-gradient(60% 55% at 70% 0%, rgb(214 232 214 / 0.13), transparent 72%)",
  // 18:20 — low sun from the side
  "radial-gradient(55% 60% at 100% 70%, rgb(231 182 92 / 0.19), transparent 70%)",
  // 18:24 — the last of it, rosier and dimmer
  "radial-gradient(50% 55% at 95% 85%, rgb(216 169 156 / 0.11), transparent 70%)",
  // 07:30 — dawn from below
  "radial-gradient(75% 60% at 50% 110%, rgb(233 184 102 / 0.3), rgb(216 169 156 / 0.07) 55%, transparent 80%)",
] as const;

/**
 * A scene's caption: the clock time (honey, light serif — the scene marker), where/when, the line, one sentence.
 * `large` is the pinned stage, where the clock is the anchor of the frame.
 */
export function SceneCaption({
  scene,
  className,
  large = false,
}: {
  scene: Scene;
  className?: string;
  large?: boolean;
}) {
  return (
    <div className={className}>
      <p
        className={cn(
          "flex flex-wrap items-baseline gap-x-4 gap-y-1",
          large && "flex-col items-start gap-y-5",
        )}
      >
        <time
          dateTime={scene.time}
          className={cn(
            "tabular font-heading font-light text-honey",
            large
              ? "text-[clamp(5.5rem,1.5rem+7vw,10rem)] leading-[0.82] tracking-[-0.03em]"
              : "text-[clamp(2.75rem,2rem+2.6vw,4.5rem)] leading-none",
          )}
        >
          {scene.time}
        </time>
        <span className="text-[1.0625rem] text-cream-muted">{scene.moment}</span>
      </p>
      <h3
        className={cn(
          "font-heading leading-[1.08] font-bold text-balance",
          large
            ? "mt-9 text-[clamp(2.25rem,1.4rem+1.9vw,3.25rem)]"
            : "mt-5 text-[clamp(1.875rem,1.45rem+1.7vw,2.75rem)]",
        )}
      >
        {scene.title}
      </h3>
      <p className={cn("mt-4 max-w-[29rem]", LEDE)}>{scene.body}</p>
    </div>
  );
}

/** What the phone shows at a scene: the chat up to that point, or the lock screen the next morning. */
export function SceneScreen({ index }: { index: number }) {
  if (index > LAST_CHAT_SCENE) return <LockScreen />;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <WaHeader />
      <ThreadSnapshot scene={index} />
      <WaComposer />
    </div>
  );
}
