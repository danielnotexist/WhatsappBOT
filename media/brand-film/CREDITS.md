# Credits and licenses

## Music

- **Track:** "Ramp It Up" by Ahjay Stelino (Mixkit item 69)
- **Page:** https://mixkit.co/free-stock-music/ (tags: Rhythmic Underscore, Corporate Music, Positive, Futuristic, Technology)
- **File:** https://assets.mixkit.co/music/69/69.mp3 (downloaded by `tools/fetch-music.sh`; not committed)
- **License:** Mixkit Stock Music Free License (https://mixkit.co/license/#musicFree). Free for commercial and
  non-commercial projects, no attribution required; allowed on web and social platforms, online ads, podcasts and
  video-on-demand. Not allowed: CDs/DVDs, TV and radio broadcast, video games, remixing it into a music-only track,
  claiming it or registering it with a rights-management service. If a content-ID claim arrives, forward it to
  team@mixkit.co. Checked on 23.10.2026.
- **Used:** one 8-bar phrase (16.0 s) from 63.868 s, the downbeat measured by `tools/beatgrid.py` (120.00 BPM).

## Sound effects

All UI sounds (click, tick, pop, swish, whoosh) are synthesised in `tools/mix_audio.py` from seeded noise. No samples,
no third-party audio.

## Fonts

- **Varela Round** (Joe Prince), SIL Open Font License 1.1 - the site font (`lib/fonts.ts`), Hebrew and Latin subsets
  downloaded from Google Fonts into `assets/fonts/`.
- **Noto Color Emoji** (Google), SIL Open Font License 1.1 - the ✅ reaction, from the system fonts.

## Brand assets

- The hoopoe poses and her profile picture: the site's own `public/brand/mascot` (linked as `assets/mascot`).
- Product marks (Gmail, Google Calendar, Google Meet, Outlook, Teams, the Google "G", the Microsoft four squares, the
  WhatsApp glyph on its green): copied from `components/brand/integrations/icons.tsx` and
  `components/brand/provider-logo.tsx`, unchanged in geometry and colour. Each mark belongs to its owner (Google LLC,
  Microsoft Corporation, WhatsApp LLC / Meta) and is shown only to say that עלזה works with the product (nominative
  use). Before publishing: the same legal check against the owners' brand guidelines as the site (docs/PROGRESS.md).

## Tools

- HyperFrames (HeyGen, Apache-2.0) - composition format, `lint` and `snapshot` (npm `hyperframes`).
- Playwright + Chromium (Apache-2.0 / BSD) and FFmpeg (LGPL/GPL) - frame rendering and encoding.
- numpy, scipy, librosa, soundfile - beat analysis and the mix.
