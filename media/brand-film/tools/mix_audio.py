"""Builds the film's soundtrack: one 8-bar phrase (16 s) of the Mixkit track from the measured downbeat + procedural UI sounds.

- Music: build/music.wav (decoded from audio/mixkit-ramp-it-up-69.mp3), cut at the downbeat in audio/beatgrid.json.
- UI sounds: synthesised here from seeded noise (no samples, no tones): click, tick, pop, swish, whoosh, two or three
  takes each, rotated. Each take's peak is measured and the take is placed so its peak lands one frame (1/60 s)
  after the picture event it belongs to (events from build/events.json, written by `node render.mjs --events`).
- Sounds are placed on a circular buffer of the film's length, so the audio loops with the picture; one more video
  frame of audio (the loop's first 1/60 s) is appended for the closing frame, which repeats the first frame.
- Loudness: measured with ffmpeg ebur128, gained to about -14 LUFS with the true peak kept at or under -1 dBTP.

Usage: .venv/bin/python -I tools/mix_audio.py
"""

import json
import re
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

HERE = Path(__file__).resolve().parent.parent
BUILD = HERE / "build"
SR = 48000
FRAME = 1 / 60

# where the picture event's strongest moment sits after its beat (seconds)
VISUAL_OFFSET = {"click": 0.0, "tick": 0.03, "pop": 0.05, "swish": 0.06, "whoosh": 0.07}
GAIN = {"click": 0.75, "tick": 0.4, "pop": 0.5, "swish": 0.28, "whoosh": 0.34}


def band(x, lo, hi):
    sos = butter(2, [lo, hi], btype="bandpass", fs=SR, output="sos")
    return sosfilt(sos, x)


def lowpass(x, f):
    return sosfilt(butter(2, f, btype="lowpass", fs=SR, output="sos"), x)


def highpass(x, f):
    return sosfilt(butter(2, f, btype="highpass", fs=SR, output="sos"), x)


def norm(x):
    return x / (np.max(np.abs(x)) + 1e-9)


def synth(kind, take):
    rng = np.random.default_rng(1000 * len(kind) + take)
    if kind == "click":
        n = int(0.07 * SR)
        t = np.arange(n) / SR
        a = band(rng.standard_normal(n), 2400 + 500 * take, 7000) * (1 - np.exp(-t / 0.0006)) * np.exp(-t / 0.009)
        body = lowpass(rng.standard_normal(n), 900 - 120 * take) * (1 - np.exp(-t / 0.001)) * np.exp(-t / 0.016)
        return norm(a + 0.9 * norm(body) * np.max(np.abs(a)))
    if kind == "tick":
        n = int(0.04 * SR)
        t = np.arange(n) / SR
        return norm(highpass(rng.standard_normal(n), 4200 + 600 * take) * (1 - np.exp(-t / 0.0004)) * np.exp(-t / 0.005))
    if kind == "pop":
        n = int(0.12 * SR)
        t = np.arange(n) / SR
        x = band(rng.standard_normal(n), 380 + 60 * take, 1500 + 200 * take)
        return norm(x * (1 - np.exp(-t / 0.002)) * np.exp(-t / 0.03))
    if kind in ("swish", "whoosh"):
        dur, peak = (0.24, 0.1) if kind == "swish" else (0.4, 0.17)
        n = int(dur * SR)
        t = np.arange(n) / SR
        env = np.where(t < peak, np.sin(0.5 * np.pi * t / peak) ** 2, np.exp(-((t - peak) / (0.22 * (dur - peak))) ** 2))
        lo = band(rng.standard_normal(n), 300 + 80 * take, 1400)
        hi = band(rng.standard_normal(n), 1400, 4200 + 400 * take)
        # a sweep without tones: the high band arrives slightly later than the low band
        mix = norm(lo) * env + 0.7 * norm(hi) * np.roll(env, int(0.02 * SR))
        return norm(mix)
    raise ValueError(kind)


def peak_time(x):
    env = np.convolve(np.abs(x), np.ones(48) / 48, mode="same")  # 1 ms smoothing
    return int(np.argmax(env)) / SR


def loudness(path):
    out = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128=peak=true", "-f", "null", "-"],
        capture_output=True,
        text=True,
    ).stderr
    lufs = float(re.findall(r"I:\s+(-?[\d.]+) LUFS", out)[-1])
    tp = float(re.findall(r"Peak:\s+(-?[\d.]+) dBFS", out)[-1])
    return lufs, tp


def main():
    grid = json.loads((HERE / "audio/beatgrid.json").read_text())
    events = json.loads((BUILD / "events.json").read_text())
    T = float(events["T"])
    music_path = BUILD / "music.wav"
    if not music_path.exists():
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", str(HERE / "audio/mixkit-ramp-it-up-69.mp3"), "-ar", str(SR), "-ac", "2", str(music_path)],
            check=True,
        )
    music, sr = sf.read(music_path, always_2d=True)
    assert sr == SR, sr
    s0 = int(round(grid["start"] * SR))
    N = int(round(T * SR))
    bed = music[s0 : s0 + N].copy()
    fade = int(0.006 * SR)
    ramp = np.linspace(0, 1, fade)[:, None]
    bed[:fade] *= ramp
    bed[-fade:] *= ramp[::-1]
    bed *= 0.8

    sfx_dir = BUILD / "sfx"
    sfx_dir.mkdir(parents=True, exist_ok=True)
    takes = {}
    for kind, count in {"click": 3, "tick": 2, "pop": 3, "swish": 2, "whoosh": 3}.items():
        takes[kind] = []
        for k in range(count):
            x = synth(kind, k)
            sf.write(sfx_dir / f"{kind}-{k}.wav", x, SR, subtype="PCM_16")
            takes[kind].append((x, peak_time(x)))

    fx = np.zeros(N)
    used = {k: 0 for k in takes}
    placed = []
    for ev in events["sounds"]:
        kind = ev["kind"]
        x, pk = takes[kind][used[kind] % len(takes[kind])]
        used[kind] += 1
        target_peak = ev["t"] + VISUAL_OFFSET[kind] + FRAME
        start = int(round((target_peak - pk) * SR))
        idx = (start + np.arange(len(x))) % N  # circular: the soundtrack loops with the picture
        fx[idx] += GAIN[kind] * x
        placed.append({"beat": ev["beat"], "kind": kind, "peak_at": round(target_peak, 4), "take_peak": round(pk, 4)})

    mix = bed + fx[:, None]
    # the closing frame (frame T*60, identical to frame 0) carries the loop's first 1/60 s
    mix = np.concatenate([mix, mix[: int(round(SR * FRAME))]])
    tmp = BUILD / "mix-raw.wav"
    sf.write(tmp, mix, SR, subtype="FLOAT")
    lufs, tp = loudness(tmp)
    gain_db = min(-14.0 - lufs, -1.0 - tp)
    mix *= 10 ** (gain_db / 20)
    out = HERE / "assets/audio/mix.wav"
    out.parent.mkdir(parents=True, exist_ok=True)
    sf.write(out, mix, SR, subtype="PCM_16")
    lufs2, tp2 = loudness(out)
    report = {
        "music_start": grid["start"],
        "bpm": grid["bpm"],
        "gain_db": round(gain_db, 2),
        "integrated_lufs": lufs2,
        "true_peak_dbfs": tp2,
        "sounds": placed,
    }
    (BUILD / "mix-report.json").write_text(json.dumps(report, indent=2))
    print(json.dumps({k: v for k, v in report.items() if k != "sounds"}, indent=2), f"\n{len(placed)} sounds placed")


if __name__ == "__main__":
    main()
