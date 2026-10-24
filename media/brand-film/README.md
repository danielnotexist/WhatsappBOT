# עלזה - brand film v2 (16 s, "לילה ירוק")

A 16-second, 8-bar, 120 BPM motion piece in the landing's "יום עבודה אחד" language: the night stage, cream type, a
honey time stamp that rolls like an odometer, the thin progress line at the side, a phone with the WhatsApp thread,
the felt hoopoe beside it in the pose of the scene, and the products' own coloured marks. The last frame is the first
frame, so it loops. v1 (the black-and-white single-shape cut) is in the git history.

Self-contained: its own `package.json`, excluded from the web app's lint / typecheck / tests (`media/**`).

## The script (on-screen copy, from what the product does)

| Bar | Beats | Time stamp | Screen | Words | Hoopoe |
| --- | --- | --- | --- | --- | --- |
| 8+1 | 29-4 | 07:58 · בדרך למשרד | Lock screen: Gmail and Outlook notifications stack up, "ועוד 23 → 31 מיילים" | מיילים. / פגישות. / הבטחות. · והיום רק התחיל. | thinking → calling |
| 2 | 5-8 | 08:02 · ברמזור | The stack folds into the WhatsApp mark, which opens into the chat; press and hold the mic, voice note, ✅, "מקלידה…" | מקליטים / חצי דקה. · הודעה קולית בוואטסאפ, בעברית. | listening |
| 3 | 9-12 | 08:03 · דקה אחר כך | Three mails waiting (Gmail / Outlook marks), the draft, שלח / ערוך / בטל, click שלח, "נשלח." | היא מסכמת / ומנסחת. · שום דבר לא יוצא בלי אישור. | envelope |
| 4 | 13-16 | 18:20 · סוף היום | "מה יש לי מחר?", tomorrow from Google Calendar + Outlook with Meet and Teams chips | שואלים / מה מחר. · היא קוראת את היומן ואת המייל. | calendar |
| 5 | 17-20 | 07:30 · למחרת בבוקר | Dawn lock screen with one notification: her morning summary | הבוקר כבר / מסודר. · סיכום בוקר, בשעה שבוחרים. | front |
| 6 | 21-24 | Google + Microsoft + WhatsApp marks · מסלול פרו | The phone frame turns into the honey pro card (full from its first frame), click "לשדרג לפרו" | הכול / בשיחה אחת. · Google ו-Microsoft יחד, בוואטסאפ. | celebrating |
| 7 | 25-28 | - | The card turns back into the phone | מה שהבטחת / לעשות. / עלזה על זה. · 10 הודעות ראשונות בחינם. | waving |

Every claim is from `lib/billing/plans.ts` and the landing (`components/brand/landing/content.ts`): mail, calendar
and files, voice notes, drafts that go out only after "שלח", the morning summary, pro's two accounts together,
Teams / Google Meet summaries, proactive alerts and phishing warnings, the three built-in agents, 299 ₪, 10 free
messages. The persona's dates follow the landing (Wednesday 21.10 → Thursday 22.10.2026).

## Files

| Path | What |
| --- | --- |
| `index.html` | The whole film: markup, styles, the product marks (an SVG sprite copied from `components/brand/integrations/icons.tsx` and `provider-logo.tsx`) and a pure `seek(t)`. `?format=wide` gives the 1920x1080 cut with its own layout and a larger type scale. HyperFrames composition (`data-composition-id="main"`, answers `hf-seek`). |
| `assets/mascot` | A link to the site's `public/brand/mascot` (the eight poses and her profile picture). |
| `render.mjs` | Playwright renderer: beat frames, any instant, the loop check, and the full render. |
| `tools/beatgrid.py` | numpy beat grid: fine tempo/phase search on the onset envelope, downbeat from kick energy. |
| `tools/mix_audio.py` | The 8-bar phrase from the measured downbeat + procedural UI sounds placed by their measured peaks; -14 LUFS target. |
| `tools/fetch-music.sh` | Downloads the Mixkit track (not committed). |
| `audio/beatgrid.json` | The measured grid (120.00 BPM, downbeat 63.868 s). |
| `assets/fonts/` | Varela Round (hebrew, latin) from Google Fonts (OFL). |

## How the motion works

- **Time only.** `seek(t)` sets every style from `t`; no CSS transitions, timers or state carried between frames.
- **Springs** are closed-form step responses (damping 0.78-0.9 for size and position, 1.0 for colour, opacity, the
  camera and the cursor). A value that changes target many times is the sum of one spring per change; the previous
  cycle's springs are summed too, so `seek(t) === seek(t + 16)` (`node render.mjs --loopcheck` compares PNGs).
- **Time stamp**: four digit reels, each on its own spring, minutes first (an odometer cascade); 07:58 → 08:02 rolls
  through the digits in between.
- **Thread**: every bubble is placed from the bubbles that arrived after it (each with a presence spring), so the
  chat scrolls up continuously; typing bubbles arrive and leave the same way.
- **One continuous element where it serves the story**: the notification stack folds into the WhatsApp mark, which
  opens into the chat; the phone frame turns into the honey pro card and back. The honey arrives and leaves as an iris
  (a clip-path circle on a spring) with the card's content already on it, so there is never a blended in-between
  colour and the card is full from its first frame.
- **Progress line**: its bottom edge follows the scene; at the loop its top edge drains down into the last dot, then
  both edges return to the top together (zero length, unseen).
- **Hoopoe**: one pose per scene, swapped on the bar: spring in from 16 px below at 96 % scale, a 0.14 s blur out.
- **Words**: per word (blur + rise), per letter for the brand line; content leaves 30 ms before its container changes.
- **Motion blur**: 8 sub-frames per frame (480 fps) blended by ffmpeg `tmix` (a trailing 7/480 s shutter), 60 fps out.
- **Loop**: 961 frames, frames 0 and 960 identical: the closing frame's sub-frames are copies of the first frame's,
  and both are intra-coded at one constant quantiser, so they decode to the same pixels. The soundtrack is circular
  and carries one extra frame.

## Re-render

Requirements: Node 22, ffmpeg, Python 3, Playwright in `/opt/node-tools` with browsers in `/opt/pw-browsers`
(override with `PLAYWRIGHT_REQUIRE_FROM` / `PLAYWRIGHT_BROWSERS_PATH`).

```bash
cd media/brand-film
npm install                                   # hyperframes (lint / snapshot / preview)
python3 -m venv .venv && .venv/bin/pip install numpy scipy librosa soundfile
tools/fetch-music.sh                          # the Mixkit track -> audio/

# 1. beat grid (already in audio/beatgrid.json)
mkdir -p build && ffmpeg -v error -y -i audio/mixkit-ramp-it-up-69.mp3 -ar 48000 -ac 2 build/music.wav
.venv/bin/python -I tools/beatgrid.py build/music.wav --start-near 63.9 --json audio/beatgrid.json

# 2. sound: events from the page, then the mix -> assets/audio/mix.wav
node render.mjs --events
.venv/bin/python -I tools/mix_audio.py

# 3. review: one frame per beat (and half a beat later), any instant, the loop
node render.mjs --beats                       # build/beats-square/beat-01..32.png
node render.mjs --beats --offset 0.5
node render.mjs --at 2.1,10.1 --format wide
node render.mjs --loopcheck

# 4. full renders -> out/
node render.mjs --full                        # out/alze-film-1440.mp4 (1440x1440)
node render.mjs --full --format wide          # out/alze-film-1920x1080.mp4
```

A full render takes 7,688 screenshots (about 9 minutes on 4 cores). Output: H.264 high, yuv420p, 60 fps,
`+faststart`, AAC 192k.

HyperFrames: `npx hyperframes lint .` (two warnings: the single-file composition is long, by design, and her
profile picture appears twice) and `npx hyperframes snapshot --at 6,10.5` (set `HYPERFRAMES_BROWSER_PATH` to the
Playwright Chromium to avoid a download). The final render uses `render.mjs` for the 8-sub-frame motion blur.
