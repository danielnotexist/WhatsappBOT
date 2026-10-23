# עלזה - brand film (20 s, UI motion)

A 10-bar, 120 BPM UI-motion film: one shape that never cuts. Every state (lock-screen notification, snooze button,
WhatsApp composer, sent bubble, typing, summary card, draft, loader, calendar event, toggle, tabs, pro card, toast)
is the same element morphing its size, radius and colour while its content swaps with a short blur. A cursor drives
every change. The last frame is the first frame, so it loops.

Self-contained: its own `package.json`, excluded from the web app's lint / typecheck / tests (`media/**`).

## Files

| Path | What |
| --- | --- |
| `index.html` | The whole film: markup, styles and a pure `seek(t)`. `?format=wide` gives the 1920x1080 cut (same timeline, its own camera fit). HyperFrames composition (`data-composition-id="main"`, answers `hf-seek`). |
| `render.mjs` | Playwright renderer: beat frames, any instant, the loop check, and the full render. |
| `tools/beatgrid.py` | numpy beat grid: fine tempo/phase search on the onset envelope, downbeat from kick energy, the start bar. |
| `tools/mix_audio.py` | 10 bars of music from the measured downbeat + procedural UI sounds placed by their measured peaks; loudness to -14 LUFS. |
| `tools/fetch-music.sh` | Downloads the Mixkit track (not committed). |
| `audio/beatgrid.json` | The measured grid (120.00 BPM, start 63.868 s). |
| `assets/fonts/` | Varela Round (hebrew, latin) and Geist, from Google Fonts (OFL). |
| `CREDITS.md` | Music, fonts and licenses. |

## How the motion works

- **Time only.** `seek(t)` sets every style from `t`; no CSS transitions, timers or state carried between frames.
- **Springs** are closed-form step responses (damping 0.75-0.85 for size and position, 1.0 for colour, opacity and
  the camera). A value that changes target many times is the sum of one spring per change; the previous cycle's
  springs are summed too, so `seek(t) === seek(t + 20)` and the loop is seamless (`node render.mjs --loopcheck`
  compares the PNGs of `seek(0)` and `seek(20)`).
- **Content windows.** Each content block has `data-in` / `data-out` in beats and its own blur enter/exit, starting a
  hair before its container morphs.
- **Toggle knob -> tab indicator**: its four edges are separate springs; the leading edge rides a fast spring and the
  trailing edge a slow one, so it stretches as it moves. The tab labels are drawn twice (white, and black clipped to
  the indicator), so the label colour flips exactly where the indicator is.
- **Drag** over "שלישי" is direct manipulation: while held the selection edge is the cursor's x; on release it springs
  from where it was, with the cursor's release velocity, to the new word "רביעי".
- **Camera**: one box per state, fitted to the frame (76% of the width, 72% of the height, minus a caption band while a
  caption shows); scale is sprung in log space. Nothing the camera scales carries `will-change`.
- **Motion blur**: 4 sub-frames per frame (240 fps) blended by ffmpeg `tmix` (a trailing 1/80 s shutter), 60 fps out.

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

# 3. review: one frame per beat (and a quarter beat later), plus any instant
node render.mjs --beats                       # build/beats-square/beat-01..40.png
node render.mjs --beats --offset 0.25
node render.mjs --at 8.3,12.1 --format wide
node render.mjs --loopcheck

# 4. full renders -> out/
node render.mjs --full                        # out/alze-film-1440.mp4 (1440x1440)
node render.mjs --full --format wide          # out/alze-film-1920x1080.mp4
```

Each full render takes 4,803 screenshots (about half an hour on 4 cores). Output: H.264 high, yuv420p, 60 fps,
`+faststart`, AAC 192k.

HyperFrames: `npx hyperframes lint .` (one warning: the single-file composition is long, by design) and
`npx hyperframes snapshot --at 8.3,16.3` (set `HYPERFRAMES_BROWSER_PATH` to the Playwright Chromium to avoid a
download). The final render uses `render.mjs` for the 4-sub-frame motion blur.

## Beat sheet (beat n starts at (n-1) x 0.5 s)

| Bars | Beats | What happens |
| --- | --- | --- |
| 1-2 | 1-8 | Lock-screen notification "3 מיילים חדשים" pings -> 12 -> 27 (swells); caption "בדרכים. בשיחות. כל היום." word per beat; morph into "תזכיר לי אחר כך", pressed and squashed on 8; "ומיילים מחכים." |
| 3 | 9-12 | Composer "תביאי לי מה חשוב", click send on 10, black sent bubble, 👀 on 11, typing dots under the עלזה pill on 12 |
| 4-5 | 13-20 | Summary card (3 mails waiting), rows on 14, click "לנסח תשובה" on 15, draft on 16, drag-select on 17, "רביעי" on 18, click שלח on 19, loader -> check on 20, "עונים מהוואטסאפ." |
| 6-7 | 21-28 | Check stretches into "פגישה עם כהן, 10:00", Meet chip on 22, "סיכום בוקר" row on 23, toggle flips on 24, knob becomes the tab indicator on 25, יומן / קבצים / משימות on 26-28 |
| 8-9 | 29-36 | Honey pro card, lines on 30-33, "לשדרג לפרו" on 34, click on 35, loader, toast on 36 |
| 10 | 37-40 | "עלזה על זה." completes on 37, cursor heads home on 38, toast shrinks into the notification on 39, clock returns on 40 = frame 1 |
