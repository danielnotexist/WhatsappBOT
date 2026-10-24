#!/usr/bin/env bash
# The landing's copy of the film ("יום עבודה אחד, בוואטסאפ.", components/brand/landing/brand-film.tsx), from the
# 1920x1080 render (node render.mjs --full --format wide):
#   public/brand/video/brand-film.mp4          H.264 high, CRF 23, 30 fps, AAC 128k, +faststart (Safari; keeps the sound)
#   public/brand/video/brand-film.webm         VP9 (two passes, constant quality), 30 fps, Opus 96k (everyone else)
#   public/brand/video/brand-film-poster.webp  the frame at POSTER_AT seconds (the poster, and all that shows under
#                                              reduced motion / "עצירת אנימציות")
# The render's closing frame repeats its first, so the web copies stop at 32 s (-t 32) and the player loops them.
# Usage: tools/encode-web.sh [WIDTH (default 1920)]
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=out/alze-film-1920x1080.mp4
DST=../../public/brand/video
W="${1:-1920}"
H=$((W * 9 / 16))
POSTER_AT="${POSTER_AT:-15.5}"
VP9_CRF="${VP9_CRF:-36}"
[ -f "$SRC" ] || { echo "$SRC missing - run: node render.mjs --full --format wide" >&2; exit 1; }
mkdir -p "$DST" build
VF="fps=30,scale=${W}:${H}:flags=lanczos,format=yuv420p"
ffmpeg -v error -y -i "$SRC" -t 32 -vf "$VF" \
  -c:v libx264 -preset slow -crf 23 -profile:v high -g 60 \
  -c:a aac -b:a 128k -movflags +faststart "$DST/brand-film.mp4"
ffmpeg -v error -y -i "$SRC" -t 32 -vf "$VF" \
  -c:v libvpx-vp9 -crf "$VP9_CRF" -b:v 0 -row-mt 1 -deadline good -cpu-used 2 -g 60 -pass 1 -passlogfile build/vp9 \
  -an -f null /dev/null
ffmpeg -v error -y -i "$SRC" -t 32 -vf "$VF" \
  -c:v libvpx-vp9 -crf "$VP9_CRF" -b:v 0 -row-mt 1 -deadline good -cpu-used 2 -g 60 -pass 2 -passlogfile build/vp9 \
  -c:a libopus -b:a 96k "$DST/brand-film.webm"
ffmpeg -v error -y -ss "$POSTER_AT" -i "$SRC" -frames:v 1 -vf "scale=${W}:${H}:flags=lanczos" \
  -c:v libwebp -quality 82 "$DST/brand-film-poster.webp"
ls -l "$DST"/brand-film*
