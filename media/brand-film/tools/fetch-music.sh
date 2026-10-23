#!/usr/bin/env bash
# Downloads the film's music bed from Mixkit (Mixkit Stock Music Free License, see CREDITS.md).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p audio
if [ ! -f audio/mixkit-ramp-it-up-69.mp3 ]; then
  curl -fsSL -o audio/mixkit-ramp-it-up-69.mp3 https://assets.mixkit.co/music/69/69.mp3
fi
echo "audio/mixkit-ramp-it-up-69.mp3 ready"
