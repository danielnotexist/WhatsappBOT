"""Quick tempo scan over candidate tracks: prints librosa's tempo estimate, beat regularity and loudness.

Usage: .venv/bin/python -I tools/tempo_scan.py <file.mp3> [...]
"""

import sys

import librosa
import numpy as np


def scan(path: str) -> None:
    y, sr = librosa.load(path, sr=22050, mono=True)
    onset = librosa.onset.onset_strength(y=y, sr=sr)
    tempo, beats = librosa.beat.beat_track(onset_envelope=onset, sr=sr, units="time")
    tempo = float(np.atleast_1d(tempo)[0])
    ibi = np.diff(beats)
    jitter = float(np.std(ibi) * 1000) if len(ibi) else -1
    rms = float(np.sqrt(np.mean(y**2)))
    print(f"{path}\t{len(y) / sr:6.1f}s\ttempo {tempo:6.2f}\tibi-jitter {jitter:5.1f}ms\trms {rms:.3f}")


if __name__ == "__main__":
    for p in sys.argv[1:]:
        scan(p)
