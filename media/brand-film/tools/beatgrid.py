"""Beat-grid analysis with numpy (librosa only decodes audio and computes the onset envelope).

1. Onset-strength envelope (spectral flux) at ~5.8 ms resolution.
2. Fine tempo search: for every BPM in [lo, hi] at 0.01 steps and every phase, the mean onset strength sampled on
   the grid; the best (bpm, phase) pair is the beat grid.
3. Downbeats: of the 4 possible bar phases, the one whose beats carry the most low-frequency (kick) energy.
4. Picks the start bar: the downbeat after `--min-start` seconds whose next 10 bars are loudest and steadiest,
   or the downbeat nearest `--start-near`.

Usage:
  .venv/bin/python -I tools/beatgrid.py <audio> [--lo 110 --hi 130 --bars 10 --min-start 4 --start-near 63.9 --json out.json]
"""

import argparse
import json

import librosa
import numpy as np

SR = 44100
HOP = 256


def onset_env(y: np.ndarray) -> np.ndarray:
    S = np.abs(librosa.stft(y, n_fft=2048, hop_length=HOP))
    logS = np.log1p(100 * S)
    flux = np.maximum(0, np.diff(logS, axis=1)).sum(axis=0)
    flux = np.concatenate([[0], flux])
    flux -= np.convolve(flux, np.ones(64) / 64, mode="same")  # local mean removal
    return np.maximum(flux, 0)


def low_env(y: np.ndarray) -> np.ndarray:
    S = np.abs(librosa.stft(y, n_fft=2048, hop_length=HOP))
    freqs = librosa.fft_frequencies(sr=SR, n_fft=2048)
    low = S[freqs < 150].sum(axis=0)
    return low


def fine_grid(env: np.ndarray, lo: float, hi: float, t0: float, t1: float):
    fps = SR / HOP
    best = (-1.0, 0.0, 0.0)
    for bpm in np.arange(lo, hi, 0.01):
        period = 60.0 / bpm
        phases = np.linspace(0, period, 64, endpoint=False)
        n = int((t1 - t0) / period)
        k = np.arange(n)
        for ph in phases:
            idx = np.round((t0 + ph + k * period) * fps).astype(int)
            idx = idx[idx < len(env)]
            score = env[idx].mean()
            if score > best[0]:
                best = (score, bpm, t0 + ph)
    # refine phase at 1 ms
    _, bpm, ph = best
    period = 60.0 / bpm
    n = int((t1 - t0) / period)
    k = np.arange(n)
    cand = np.arange(ph - 0.02, ph + 0.02, 0.001)
    scores = []
    for p in cand:
        idx = np.round((p + k * period) * fps).astype(int)
        idx = idx[(idx < len(env)) & (idx >= 0)]
        scores.append(env[idx].mean())
    ph = float(cand[int(np.argmax(scores))])
    while ph - period > 0:
        ph -= period
    return float(bpm), ph


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("--lo", type=float, default=110)
    ap.add_argument("--hi", type=float, default=130)
    ap.add_argument("--bars", type=int, default=10)
    ap.add_argument("--min-start", type=float, default=4.0)
    ap.add_argument("--start-near", type=float, help="use the downbeat nearest this time instead of the auto pick")
    ap.add_argument("--json")
    a = ap.parse_args()

    y, _ = librosa.load(a.audio, sr=SR, mono=True)
    dur = len(y) / SR
    env = onset_env(y)
    fps = SR / HOP
    bpm, phase = fine_grid(env, a.lo, a.hi, 2.0, min(dur - 2, 90.0))
    period = 60.0 / bpm
    beats = phase + np.arange(int((dur - phase) / period)) * period

    lowe = low_env(y)
    bar_scores = []
    for b in range(4):
        idx = np.round(beats[b::4] * fps).astype(int)
        idx = idx[idx < len(lowe)]
        bar_scores.append(float(lowe[idx].mean()))
    down = int(np.argmax(bar_scores))
    downbeats = beats[down::4]

    # loudness per bar, pick the best 10-bar window that starts after min-start and is loud and steady
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=HOP)[0]
    bar_rms = []
    for t in downbeats:
        i0, i1 = int(t * fps), int((t + 4 * period) * fps)
        bar_rms.append(float(rms[i0:i1].mean()) if i1 < len(rms) else 0.0)
    bar_rms = np.array(bar_rms)
    best_i, best_s = None, -1.0
    for i, t in enumerate(downbeats):
        if t < a.min_start or i + a.bars + 1 >= len(downbeats):
            continue
        w = bar_rms[i : i + a.bars]
        s = w.mean() - 0.5 * w.std()
        if s > best_s:
            best_s, best_i = s, i
    if a.start_near is not None:
        best_i = int(np.argmin(np.abs(downbeats - a.start_near)))
    start = float(downbeats[best_i])

    # grid fit check: residual of nearest strong onset to each beat inside the window
    peaks = librosa.util.peak_pick(env, pre_max=3, post_max=3, pre_avg=10, post_avg=10, delta=env.std() * 0.5, wait=8)
    pt = peaks / fps
    win = beats[(beats >= start) & (beats < start + a.bars * 4 * period)]
    res = [float(pt[np.argmin(np.abs(pt - b))] - b) for b in win]
    res_ms = np.array(res) * 1000

    out = {
        "file": a.audio,
        "duration": dur,
        "bpm": round(bpm, 3),
        "period": period,
        "first_beat": phase,
        "downbeat_offset_in_bar": down,
        "bar_low_energy": bar_scores,
        "start": start,
        "start_bar_index": best_i,
        "window_bars": a.bars,
        "window_rms_mean": float(bar_rms[best_i : best_i + a.bars].mean()),
        "beat_residual_ms_median": float(np.median(np.abs(res_ms))),
        "beat_residual_ms_p90": float(np.percentile(np.abs(res_ms), 90)),
    }
    print(json.dumps(out, indent=2))
    if a.json:
        with open(a.json, "w") as f:
            json.dump(out, f, indent=2)


if __name__ == "__main__":
    main()
