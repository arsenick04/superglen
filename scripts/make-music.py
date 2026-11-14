#!/usr/bin/env python3
"""Original background loops for Superglen, generated procedurally (numpy/scipy + ffmpeg). Deterministic.

  python3 scripts/make-music.py            -> public/audio/music/ringan_a.mp3, ringan_b.mp3
  python3 scripts/make-music.py --check    -> also prints seam / loudness checks

A: bouncy marimba, 104 BPM, 16 bars (36.9 s).  B: calm music box + pizzicato, 100 BPM, 16 bars (38.4 s).
No drums or percussion. Every note is rendered into a circular buffer (tails wrap around), reverb is a circular
convolution and the low-pass is zero-phase on a tiled signal, so the loop seam is sample-continuous by construction.
"""
import os, re, subprocess, sys, tempfile
import numpy as np
from scipy.signal import butter, sosfiltfilt
from scipy.io import wavfile

SR = 44100
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'audio', 'music')
NAMES = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}

def midi(n):
    m = re.match(r'([A-G])(#?)(\d)', n)
    return 12 * (int(m.group(3)) + 1) + NAMES[m.group(1)] + (1 if m.group(2) else 0)
hz = lambda m: 440.0 * 2 ** ((m - 69) / 12)

class Mix:
    def __init__(self, n):
        self.n = n; self.buf = np.zeros((2, n))
    def add(self, sig, start, pan=0.0, gain=1.0):
        a = np.sqrt(0.5 * (1 - pan)) * gain; b = np.sqrt(0.5 * (1 + pan)) * gain
        idx = (start + np.arange(len(sig))) % self.n          # wrap around the loop end
        np.add.at(self.buf[0], idx, sig * a); np.add.at(self.buf[1], idx, sig * b)

def env_decay(t, tau, atk=0.004):
    return np.minimum(1, t / atk) * np.exp(-t / tau)

def marimba(f, length=1.2):
    t = np.arange(int(SR * length)) / SR
    tau = 0.38 * (440 / f) ** 0.25
    s = np.sin(2 * np.pi * f * t) * env_decay(t, tau) + 0.22 * np.sin(2 * np.pi * 4 * f * t) * env_decay(t, 0.05) \
        + 0.06 * np.sin(2 * np.pi * 10 * f * t) * env_decay(t, 0.02)
    return s * np.minimum(1, (length - t) / 0.05)

def pizz(f, length=1.0):
    t = np.arange(int(SR * length)) / SR
    s = sum(np.sin(2 * np.pi * f * k * t + 0.3 * k) * env_decay(t, 0.30 / k ** 0.8) / k ** 1.4 for k in range(1, 6))
    return s * np.minimum(1, (length - t) / 0.05)

def musicbox(f, length=2.0):
    t = np.arange(int(SR * length)) / SR
    s = np.sin(2 * np.pi * f * t) * env_decay(t, 0.9, 0.002) + 0.18 * np.sin(2 * np.pi * 2 * f * t) * env_decay(t, 0.6, 0.002) \
        + 0.07 * np.sin(2 * np.pi * 4.01 * f * t) * env_decay(t, 0.25, 0.002)
    return s * np.minimum(1, (length - t) / 0.1)

def bass(f, length=1.0):
    t = np.arange(int(SR * length)) / SR
    s = (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)) * env_decay(t, 0.45, 0.008)
    return s * np.minimum(1, (length - t) / 0.05)

CHORDS = {'C': ('C', 'E', 'G'), 'Am': ('A', 'C', 'E'), 'F': ('F', 'A', 'C'), 'G': ('G', 'B', 'D'),
          'Em': ('E', 'G', 'B'), 'Dm': ('D', 'F', 'A')}
def tone(name, octave):  # chord tone letter -> midi in octave (C-based octave number)
    return 12 * (octave + 1) + NAMES[name]

def render(bpm, bars, chords, melody, voice_mel, voice_acc, acc_kind, bass_pat, mel_gain, acc_gain, bass_gain, wet):
    beat = 60 / bpm; step = beat / 2                        # 8 eighth-steps per bar
    n = int(round(bars * 4 * beat * SR)); mix = Mix(n)
    at = lambda s: int(round(s * step * SR)) % n
    for ci, ch in enumerate(chords):                        # each chord lasts 2 bars = 16 steps
        base = ci * 16
        root, third, fifth = CHORDS[ch]
        # bass
        for (st, which, octv, dur) in bass_pat:
            nm = (root, fifth)[which]
            mix.add(bass(hz(tone(nm, octv)), dur), at(base + st), pan=-0.1, gain=bass_gain)
        # accompaniment
        if acc_kind == 'stab':                              # soft off-beat two-note stabs (the "bounce")
            for st in (3, 7, 11, 15):
                for nm, o, pn in ((third, 4, -0.2), (fifth, 4, 0.2)):
                    mix.add(voice_acc(hz(tone(nm, o)), 0.5), at(base + st), pan=pn, gain=acc_gain)
        else:                                               # quiet pizzicato arpeggio on quarter notes
            tones = [root, third, fifth, third]
            for k in range(8):
                nm = tones[k % 4]
                mix.add(voice_acc(hz(tone(nm, 4)), 0.7), at(base + 2 * k), pan=(-0.25, 0.25)[k % 2], gain=acc_gain)
        # melody
        toks = melody[ci].replace('|', ' ').split()
        assert len(toks) == 16, (ci, len(toks))
        for k, tk in enumerate(toks):
            if tk != '-':
                mix.add(voice_mel(hz(midi(tk))), at(base + k), pan=0.1 + 0.1 * ((k % 4) - 1.5) / 1.5, gain=mel_gain)
    x = mix.buf
    # circular reverb: decaying noise impulse response, different per channel
    rng = np.random.default_rng(7)
    L = int(1.3 * SR); tt = np.arange(L) / SR
    wetsig = np.zeros_like(x)
    for c in range(2):
        ir = rng.standard_normal(L) * np.exp(-tt / 0.32)
        ir = sosfiltfilt(butter(2, 3500, fs=SR, output='sos'), ir); ir /= np.sqrt(np.sum(ir ** 2))
        irp = np.zeros(n); irp[:L] = ir[:L] if L <= n else ir[:n]
        wetsig[c] = np.fft.irfft(np.fft.rfft(x[c]) * np.fft.rfft(irp), n)   # circular convolution => wraps
    x = x + wet * wetsig
    # zero-phase low-pass (no harsh highs) and high-pass, on a tiled signal so the wrap stays continuous
    sos = np.vstack([butter(4, 5500, fs=SR, output='sos'), butter(2, 60, 'high', fs=SR, output='sos')])
    t3 = np.tile(x, (1, 3)); t3 = sosfiltfilt(sos, t3, axis=1)
    return t3[:, n:2 * n]

def ff(args):
    return subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-y'] + args, capture_output=True, text=True).stderr

def measure(path):
    e = ff(['-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'])
    s = e[e.rfind('Summary:'):]
    return float(re.search(r'I:\s+(-?[\d.]+) LUFS', s).group(1)), float(re.search(r'Peak:\s+(-?[\d.]+) dBFS', s).group(1))

def finish(x, name, target=-20.0):
    tmp = tempfile.mkdtemp()
    w = os.path.join(tmp, name + '.wav')
    x = x / (np.max(np.abs(x)) + 1e-9) * 0.5
    wavfile.write(w, SR, (x.T * 32767).astype(np.int16))
    lufs, _ = measure(w)
    g = 10 ** ((target - lufs) / 20)
    x = x * g
    peak = np.max(np.abs(x))
    if peak > 0.80: x = x * 0.80 / peak                      # keep well below -1 dBTP before encoding
    wavfile.write(w, SR, (x.T * 32767).astype(np.int16))
    mp3 = os.path.join(OUT, name + '.mp3')
    ff(['-i', w, '-ar', '44100', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '112k', '-metadata', 'title=Superglen ' + name, mp3])
    return mp3, x

def seam_report(x, mp3):
    """x: float stereo (2, n) master. Also decode the mp3 with ffmpeg (it honours the LAME gapless tag)."""
    out = {}
    d = os.path.join(tempfile.mkdtemp(), 'd.wav'); ff(['-i', mp3, '-ac', '1', '-ar', str(SR), d])
    _, y = wavfile.read(d); y = y.astype(float) / 32768
    for label, sig in (('wav', x.mean(0)), ('mp3', y)):
        two = np.concatenate([sig, sig]); n = len(sig)
        d1 = np.abs(np.diff(two)); seam = d1[n - 2:n + 1].max(); typ = np.percentile(d1, 99.9)
        w = int(0.05 * SR)
        rms = lambda a: np.sqrt(np.mean(a ** 2))
        before, after = rms(two[n - w:n]), rms(two[n:n + w])
        out[label] = dict(len_s=round(n / SR, 3), seam_step=float(seam), p99_9_step=float(typ), rms_before=float(before), rms_after=float(after))
    return out

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    # ---- A: bouncy marimba, C major pentatonic, 104 BPM
    chA = ['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G']
    melA = [
        'E5 - G5 - E5 G5 - A5 | G5 - E5 - D5 - C5 -',
        'C5 - E5 - A4 C5 - E5 | D5 - C5 - A4 - - -',
        'A4 - C5 - A4 C5 - D5 | C5 - A4 - G4 - - -',
        'D5 - G5 - D5 G5 - A5 | G5 - E5 - D5 - - -',
        'G5 - A5 - G5 E5 - D5 | E5 - G5 - C6 - - -',
        'A5 - G5 - E5 - D5 - | C5 - E5 - A5 - - -',
        'C6 - A5 - G5 A5 - C6 | A5 - G5 - C5 - - -',
        'D5 - E5 - G5 - A5 - | G5 - - - - - - -']
    bassA = [(0, 0, 2, 0.9), (4, 1, 2, 0.6), (8, 0, 2, 0.9), (12, 1, 2, 0.6)]
    A = render(104, 16, chA, melA, marimba, marimba, 'stab', bassA, 1.0, 0.22, 0.55, 0.22)
    # ---- B: calm music box + pizzicato, 100 BPM
    chB = ['C', 'Em', 'F', 'C', 'Am', 'F', 'Dm', 'G']
    melB = [
        'E5 - - - G5 - - - | A5 - G5 - E5 - - -',
        'G5 - - - B5 - - - | A5 - G5 - E5 - - -',
        'A5 - - - C6 - - - | A5 - G5 - F5 - - -',
        'G5 - E5 - G5 - C6 - | A5 - - - G5 - - -',
        'E5 - - - A5 - - - | G5 - E5 - D5 - - -',
        'C6 - - - A5 - F5 - | G5 - A5 - C6 - - -',
        'D5 - F5 - A5 - - - | G5 - F5 - D5 - - -',
        'G5 - F5 - D5 - B4 - | D5 - - - - - - -']
    bassB = [(0, 0, 2, 1.2), (8, 1, 2, 1.0)]
    B = render(100, 16, chB, melB, musicbox, pizz, 'arp', bassB, 0.9, 0.16, 0.6, 0.28)
    for name, x in (('ringan_a', A), ('ringan_b', B)):
        mp3, xf = finish(x, name)
        size = os.path.getsize(mp3)
        lufs, tp = measure(mp3)
        print(f'{name}: {size} bytes, {xf.shape[1]/SR:.2f} s, {lufs} LUFS, sample peak {tp} dBFS')
        if '--check' in sys.argv:
            for k, v in seam_report(xf, mp3).items(): print('  seam', k, v)
