"use client";

import {
  AnimatePresence,
  motion,
  useInView,
  useMotionValueEvent,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useEffect, useRef, useState } from "react";
import { PhoneMockup } from "@/components/brand/phone-mockup";
import { TypingDots } from "@/components/brand/typing-dots";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { SCENES } from "./content";
import {
  isHers,
  LAST_CHAT_SCENE,
  LockScreen,
  THREAD,
  ThreadItemView,
  WaComposer,
  WaHeader,
} from "./phone-parts";
import { Mascot } from "./mascot";
import { SCENE_LIGHT, SceneCaption } from "./scene-parts";
import { CONTAINER } from "./ui";

/**
 * The pinned day scene (large screens, motion allowed — see DaySwitch). The section is 4½ screens tall; its stage
 * sticks to the viewport while scrolling moves through the day. Scroll position drives (useScroll/useTransform):
 * the light of the hour, the progress rail and a slight drift of the phone. The scene index drives the captions and
 * the chat, which plays like the real thing — her replies arrive after "מקלידה…".
 */

const EASE = [0.22, 1, 0.36, 1] as const;
const N = SCENES.length;

/** Thread items shown for a chat scene (everything up to and including it). */
const countFor = (scene: number) => THREAD.filter((i) => i.scene <= scene).length;

/**
 * Reveal the thread up to `scene`, one message at a time (her messages after a typing pause). Going back shows the
 * earlier state at once; a jump over several scenes shows the skipped ones at once and plays only the last.
 * scene = -1: nothing yet (the stage is not on screen).
 */
function useThreadSequence(scene: number): { count: number; typing: boolean } {
  const [count, setCount] = useState(0);
  const [typing, setTyping] = useState(false);
  const shown = useRef(0);

  useEffect(() => {
    if (scene < 0) return;
    const target = countFor(scene);
    const sceneStart = countFor(scene - 1);
    const timers: number[] = [];
    let cancelled = false;
    const wait = (ms: number) =>
      new Promise<void>((resolve) => timers.push(window.setTimeout(resolve, ms)));
    const show = (n: number) => {
      shown.current = n;
      setCount(n);
    };

    void (async () => {
      await wait(0);
      if (cancelled) return;
      if (target <= shown.current) {
        setTyping(false);
        show(target);
        return;
      }
      if (shown.current < sceneStart) show(sceneStart);
      let first = true;
      while (shown.current < target) {
        const item = THREAD[shown.current]!;
        if (isHers(item)) {
          await wait(first ? 250 : 350);
          if (cancelled) return;
          setTyping(true);
          await wait(950);
          if (cancelled) return;
          setTyping(false);
        } else {
          await wait(first ? 120 : 420);
          if (cancelled) return;
        }
        first = false;
        show(shown.current + 1);
      }
    })();

    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [scene]);

  return { count, typing };
}

/** One hour's light across the whole stage, fading in around its scene. */
function HourLight({ index, progress }: { index: number; progress: MotionValue<number> }) {
  const center = (index + 0.5) / N;
  const half = 0.5 / N;
  const input =
    index === 0
      ? [0, center + half * 0.5, center + half * 1.6]
      : index === N - 1
        ? [center - half * 1.6, center - half * 0.5, 1]
        : [center - half * 1.6, center - half * 0.5, center + half * 0.5, center + half * 1.6];
  const output = index === 0 ? [1, 1, 0] : index === N - 1 ? [0, 1, 1] : [0, 1, 1, 0];
  const opacity = useTransform(progress, input, output);
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{ opacity, backgroundImage: SCENE_LIGHT[index] }}
    />
  );
}

export default function DayPinned() {
  const track = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: track, offset: ["start start", "end end"] });
  const [active, setActive] = useState(0);
  const onStage = useInView(stage, { amount: 0.45, once: true });

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const next = Math.min(N - 1, Math.max(0, Math.floor(v * N)));
    setActive((prev) => (prev === next ? prev : next));
  });

  const { count, typing } = useThreadSequence(onStage ? Math.min(active, LAST_CHAT_SCENE) : -1);
  const phoneY = useTransform(scrollYProgress, [0, 1], [28, -28]);
  const lock = active > LAST_CHAT_SCENE;

  return (
    <div ref={track} data-day-track className="relative mt-4 h-[450vh]">
      <div ref={stage} className="sticky top-0 h-dvh overflow-hidden">
        {SCENES.map((s, i) => (
          <HourLight key={s.time} index={i} progress={scrollYProgress} />
        ))}

        <div
          className={cn(
            CONTAINER,
            "relative grid h-full grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] items-center gap-x-10",
          )}
        >
          <div className="flex items-center gap-10 xl:gap-14">
            {/* progress through the day (decorative: the captions carry the times) */}
            <div aria-hidden="true" className="relative h-[min(26rem,56dvh)] w-3 flex-none">
              <span className="absolute inset-x-0 inset-y-0 mx-auto w-px bg-line" />
              <motion.span
                className="absolute inset-x-0 inset-y-0 mx-auto w-px origin-top bg-honey"
                style={{ scaleY: scrollYProgress }}
              />
              {SCENES.map((s, i) => (
                <span
                  key={s.time}
                  className={cn(
                    "absolute inset-x-0 mx-auto size-3 -translate-y-1/2 rounded-full border-2 transition-colors duration-500",
                    i <= active ? "border-honey bg-honey" : "border-line bg-night",
                  )}
                  style={{ top: `${(i / (N - 1)) * 100}%` }}
                />
              ))}
            </div>

            {/* the captions share one grid cell; only the current one is visible, all four stay readable in order */}
            <ol className="grid">
              {SCENES.map((s, i) => (
                <motion.li
                  key={s.time}
                  className="[grid-area:1/1]"
                  initial={false}
                  animate={{
                    opacity: i === active ? 1 : 0,
                    y: i === active ? 0 : i < active ? -28 : 28,
                  }}
                  transition={{ duration: 0.55, ease: EASE }}
                >
                  <SceneCaption scene={s} large />
                </motion.li>
              ))}
            </ol>
          </div>

          <motion.div style={{ y: phoneY }} className="relative justify-self-center">
            <div
              aria-hidden="true"
              className="alze-screen-light pointer-events-none absolute inset-x-[-35%] -bottom-[12%] h-[50%] blur-xl"
            />
            {/* she stands beside the phone, on the same floor, in the pose of the hour (decorative) */}
            <div className="absolute end-[calc(100%-2.25rem)] bottom-0 z-10 w-[9rem] xl:w-[10.5rem]">
              <span
                aria-hidden="true"
                className="absolute inset-x-[26%] bottom-0 h-2.5 rounded-[50%] bg-black/55 blur-[5px]"
              />
              {SCENES.map((s, i) => (
                <motion.div
                  key={s.time}
                  className={cn(
                    i === 0 ? "relative" : "absolute inset-0",
                    i !== active && "pointer-events-none",
                  )}
                  initial={false}
                  animate={{
                    opacity: i === active ? 1 : 0,
                    y: i === active ? 0 : 12,
                    scale: i === active ? 1 : 0.97,
                  }}
                  transition={{ duration: 0.5, ease: EASE }}
                >
                  <Mascot pose={s.pose} sizes="(min-width: 1280px) 168px, 144px" />
                </motion.div>
              ))}
            </div>
            <PhoneMockup
              label={`השיחה עם ${BRAND.name} לאורך היום`}
              className="w-[min(20rem,calc((100dvh-7rem)*0.45))]"
            >
              <div className="relative flex h-full min-h-0 flex-col">
                <WaHeader typing={typing} />
                <div className="flex min-h-0 flex-1 flex-col justify-end gap-1.5 overflow-hidden px-2.5 pt-2 pb-3 [&>*]:flex-none">
                  <AnimatePresence initial={false} mode="popLayout">
                    {THREAD.slice(0, count).map((item) => (
                      <motion.div
                        key={item.id}
                        layout="position"
                        className="flex flex-col"
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, transition: { duration: 0.15 } }}
                        transition={{ duration: 0.4, ease: EASE }}
                      >
                        <ThreadItemView item={item} />
                      </motion.div>
                    ))}
                    {typing ? (
                      <motion.div
                        key="typing"
                        layout="position"
                        className="flex flex-col"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <TypingDots label={`${BRAND.name} מקלידה`} />
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
                <WaComposer />
                <AnimatePresence>
                  {lock ? (
                    <motion.div
                      key="lock"
                      className="absolute inset-0 z-[5]"
                      initial={{ opacity: 0, scale: 1.04 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 1.02 }}
                      transition={{ duration: 0.7, ease: EASE }}
                    >
                      <LockScreen />
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </PhoneMockup>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
