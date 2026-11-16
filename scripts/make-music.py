#!/usr/bin/env python3
"""Original background loops for Superglen, generated procedurally (numpy/scipy + ffmpeg). Deterministic.

  python3 scripts/make-music.py            -> public/audio/music/ringan_a.mp3, ringan_b.mp3
  python3 scripts/make-music.py --check    -> also prints seam / loudness checks
  python3 scripts/make-music.py --battle-b [--check] -> battle_b.mp3 only (tense D minor battle loop, 160 BPM, 24 bars)
  python3 scripts/make-music.py --battle [--check] -> public/audio/music/battle_a.mp3 only (see below)

Battle loop (--battle): 144 BPM, 20 bars (33.3 s), C major pentatonic, lion-dance flavour (gong, cymbal crashes,
taiko/kick pattern), brass-like lead, pizzicato stabs, punchy bass. Drums are allowed here (battle only).

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

# ---------------------------------------------------------------- battle loop (drums allowed)
def brass(f, length=0.5):
    t = np.arange(int(SR * length)) / SR
    s = np.zeros_like(t)
    for k in range(1, 12):
        if f * k > 8000: break
        s += np.sin(2 * np.pi * k * f * t + 0.5 * k) / k ** 1.15 * np.minimum(1, t / (0.015 + 0.012 * k))
    e = np.minimum(1, t / 0.02) * (0.75 + 0.25 * np.exp(-t / 0.15)) * np.minimum(1, (length - t) / 0.06)
    return s * e

def bass_punch(f, length=0.4):
    t = np.arange(int(SR * length)) / SR
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) + 0.18 * np.sin(6 * np.pi * f * t)
    return s * env_decay(t, 0.16, 0.004) * np.minimum(1, (length - t) / 0.03)

def sweep(f0, f1, tau, length, click=0.0):
    t = np.arange(int(SR * length)) / SR
    f = f1 + (f0 - f1) * np.exp(-t / 0.03)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * env_decay(t, tau, 0.002)
    if click: s += click * np.exp(-t / 0.004)
    return s * np.minimum(1, (length - t) / 0.02)

def render_battle():
    bpm, bars = 144, 20
    beat = 60 / bpm; step = beat / 2
    n = int(round(bars * 4 * beat * SR)); mix = Mix(n)
    at = lambda st: int(round(st * step * SR)) % n
    rng = np.random.default_rng(11)
    nz = rng.standard_normal(SR * 8)
    hp = lambda x, fc: sosfiltfilt(butter(2, fc, 'high', fs=SR, output='sos'), x)
    bp = lambda x, lo, hi: sosfiltfilt(butter(2, [lo, hi], 'band', fs=SR, output='sos'), x)
    n_hat = hp(nz, 7000); n_snare = bp(nz, 1200, 6500); n_crash = hp(nz, 4500)
    def noise(src, off, tau, length, atk=0.002):
        t = np.arange(int(SR * length)) / SR
        return src[off:off + len(t)] * env_decay(t, tau, atk) * np.minimum(1, (length - t) / 0.01)
    def gong(f0=98.0, length=3.6):
        t = np.arange(int(SR * length)) / SR
        s = np.zeros_like(t)
        for i, (r, a, tau) in enumerate(((1, 1, 1.6), (1.51, .8, 1.3), (2.07, .6, 1.0), (2.63, .5, .8), (3.2, .35, .6), (4.14, .25, .4), (5.4, .15, .3))):
            s += a * np.sin(2 * np.pi * f0 * r * t + 0.17 * i * np.sin(2 * np.pi * 3.1 * t)) * np.exp(-t / tau)
        return s * np.minimum(1, t / 0.006) * np.minimum(1, (length - t) / 0.2)
    chords = ['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G', 'C', 'G']
    mel = [
        'E5 - G5 G5 A5 - G5 - | E5 - D5 E5 G5 - - -',
        'A5 - A5 G5 E5 - G5 - | A5 - C6 A5 G5 - - -',
        'C6 - C6 A5 G5 - A5 - | C6 - A5 G5 E5 - - -',
        'D6 - D6 C6 A5 - G5 - | D5 E5 G5 A5 D6 - - -',
        'G5 - C6 C6 D6 - E6 - | D6 - C6 A5 G5 - - -',
        'E6 - D6 C6 A5 - C6 - | D6 - C6 A5 G5 - E5 -',
        'A5 - C6 D6 E6 - D6 - | C6 - A5 G5 A5 - - -',
        'D6 - E6 D6 C6 - A5 - | G5 - A5 - D6 - - -',
        'E6 - D6 C6 G5 - A5 - | C6 - E6 - G6 - - -',
        'D6 - D6 C6 A5 - G5 - | A5 - G5 - D5 - - -']
    for ci, ch in enumerate(chords):
        base = ci * 16
        root, third, fifth = CHORDS[ch]
        for bar in range(2):
            b0 = base + bar * 8
            for st, which, octv, dur in ((0, 0, 2, .35), (2, 0, 2, .3), (3, 0, 2, .2), (4, 1, 2, .3), (6, 0, 2, .3), (7, 1, 2, .2)):
                mix.add(bass_punch(hz(tone((root, fifth)[which], octv)), dur), at(b0 + st), pan=-0.05, gain=0.85)
            for st in (1, 3, 5, 7):                       # pizzicato stabs on the off-beats
                for nm, o, pn in ((third, 4, -0.3), (fifth, 4, 0.3), (root, 5, 0.0)):
                    mix.add(pizz(hz(tone(nm, o)), 0.4), at(b0 + st), pan=pn, gain=0.11)
        toks = mel[ci].replace('|', ' ').split()
        assert len(toks) == 16, (ci, len(toks))
        for k, tk in enumerate(toks):
            if tk == '-': continue
            d = 1
            while k + d < 16 and toks[k + d] == '-': d += 1
            mix.add(brass(hz(midi(tk)), d * step * 0.95 + 0.05), at(base + k), pan=0.1, gain=0.34)
    for bar in range(bars):
        b0 = bar * 8
        for st in (0, 2, 4, 6):                           # driving kick
            mix.add(sweep(130, 48, 0.13, 0.4, click=0.35), at(b0 + st), gain=1.0)
        for st in (2, 6):                                 # snare backbeat
            mix.add(noise(n_snare, 2000 + 5000 * st, 0.11, 0.3) * 0.5 + 0.5 * sweep(210, 170, 0.07, 0.3), at(b0 + st), pan=0.05, gain=0.7)
        for st in (3, 5):                                 # low lion-dance drum ("dong")
            mix.add(sweep(150, 80, 0.2, 0.5), at(b0 + st), pan=-0.1, gain=0.55)
        for st in range(8):                               # hats
            mix.add(noise(n_hat, 9000 + 777 * (bar * 8 + st) % 90000, 0.03, 0.12), at(b0 + st), pan=0.25 if st % 2 else -0.25, gain=0.17 if st % 2 else 0.1)
        if bar % 2 == 1:                                  # small cymbal "chiang" at end of odd bars
            mix.add(noise(n_crash, 70000 + 3000 * bar, 0.22, 0.7), at(b0 + 7), pan=0.3, gain=0.2)
        if bar % 4 == 3:                                  # fill: tom + snare roll
            for st, fr in ((4, 190), (5, 160), (6, 130), (7, 100)):
                mix.add(sweep(fr + 60, fr, 0.15, 0.3), at(b0 + st), pan=(st - 5.5) * 0.15, gain=0.6)
            for st in (6, 7):
                mix.add(noise(n_snare, 40000 + 4000 * st, 0.08, 0.2), at(b0 + st) + int(step * SR / 2), gain=0.35)
        if bar % 4 == 0:                                  # crash on the 1 of each phrase
            mix.add(noise(n_crash, 20000 + 9000 * (bar // 4), 0.7, 2.0, 0.003), at(b0), pan=-0.2, gain=0.42)
        if bar % 8 == 0:                                  # gong every 8 bars
            mix.add(gong(), at(b0), gain=0.3)
    x = mix.buf
    L = int(0.9 * SR); tt = np.arange(L) / SR
    wetsig = np.zeros_like(x)
    for c in range(2):
        ir = rng.standard_normal(L) * np.exp(-tt / 0.2)
        ir = sosfiltfilt(butter(2, 5000, fs=SR, output='sos'), ir); ir /= np.sqrt(np.sum(ir ** 2))
        irp = np.zeros(n); irp[:L] = ir
        wetsig[c] = np.fft.irfft(np.fft.rfft(x[c]) * np.fft.rfft(irp), n)
    x = x + 0.14 * wetsig
    sos = np.vstack([butter(4, 9500, fs=SR, output='sos'), butter(2, 45, 'high', fs=SR, output='sos')])
    x = sosfiltfilt(sos, np.tile(x, (1, 3)), axis=1)[:, n:2 * n]
    return np.tanh(x / np.max(np.abs(x)) * 1.6) * 0.6        # gentle glue/limit (memoryless, keeps the loop seamless)

def stac(f, length=0.14):
    t = np.arange(int(SR * length)) / SR
    s = sum(np.sin(2 * np.pi * k * f * t + 0.4 * k) / k ** 1.1 for k in range(1, 8) if f * k < 8000)
    return s * env_decay(t, 0.05, 0.003) * np.minimum(1, (length - t) / 0.02)

def render_battle_b():
    bpm, bars = 160, 24
    beat = 60 / bpm; st16 = beat / 4
    n = int(round(bars * 4 * beat * SR)); mix = Mix(n)
    at = lambda k: int(round(k * st16 * SR)) % n
    rng = np.random.default_rng(23)
    nz = rng.standard_normal(SR * 8)
    hp = lambda x, fc: sosfiltfilt(butter(2, fc, 'high', fs=SR, output='sos'), x)
    bp = lambda x, lo, hi: sosfiltfilt(butter(2, [lo, hi], 'band', fs=SR, output='sos'), x)
    n_hat = hp(nz, 7000); n_snare = bp(nz, 1200, 6500); n_crash = hp(nz, 4500)
    def noise(src, off, tau, length, atk=0.002):
        t = np.arange(int(SR * length)) / SR
        return src[off:off + len(t)] * env_decay(t, tau, atk) * np.minimum(1, (length - t) / 0.01)
    def gong(f0=73.4, length=3.6):
        t = np.arange(int(SR * length)) / SR
        s = np.zeros_like(t)
        for i, (r, a, tau) in enumerate(((1, 1, 1.6), (1.51, .8, 1.3), (2.07, .6, 1.0), (2.63, .5, .8), (3.2, .35, .6), (4.14, .25, .4))):
            s += a * np.sin(2 * np.pi * f0 * r * t + 0.17 * i * np.sin(2 * np.pi * 3.1 * t)) * np.exp(-t / tau)
        return s * np.minimum(1, t / 0.006) * np.minimum(1, (length - t) / 0.2)
    PC = {'Dm': (2, 3), 'Bb': (10, 4), 'A': (9, 4), 'Gm': (7, 3), 'C': (0, 4), 'F': (5, 4)}
    prog = ('Dm Dm Bb A  Dm Dm Gm A  Dm Bb C A  Dm Dm Bb A  Bb C Dm A  Gm A Bb A').split()
    mel = [  # 8 eighth-note tokens per bar, 4 bars per phrase
        'D5 - - D5 F5 - E5 D5 | D5 - - - A4 - C#5 - | A#4 - - A#4 D5 - C5 A#4 | A4 - - - C#5 - E5 -',
        'D5 - - D5 F5 - A5 - | G5 - F5 - E5 - D5 - | G5 - - G5 A#5 - A5 G5 | F5 - E5 - C#5 - E5 A5',
        'A5 - A5 - A5 - A#5 A5 | G5 - G5 - G5 - A5 G5 | E5 - G5 - C6 - G5 E5 | C#6 - E6 - A5 - C#6 E6',
        'D6 - - D6 F6 - E6 D6 | A5 - - - D6 - C#6 - | A#5 - - A#5 D6 - C6 A#5 | A5 - C#6 - E6 - A6 -',
        'D6 - - F6 - - D6 - | E6 - - G6 - - E6 - | F6 - A6 - - F6 D6 - | E6 - C#6 - A5 - E6 -',
        'D6 - A#5 - D6 - G6 - | E6 - A5 - C#6 - E6 - | F6 - D6 - A#5 - D6 - | E6 - C#6 - A5 - C#6 E6']
    for bar in range(bars):
        ch = prog[bar]; pc, third = PC[ch]; ph = bar // 4
        root = 38 + (pc - 2) % 12
        tones = [pc, pc + third, pc + 7]
        b0 = bar * 16
        # 16th-note bass ostinato with octave jumps
        sem = [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 0, 7, 0, 12]
        for k in range(16):
            acc = 1.0 if k % 4 == 0 else 0.7
            mix.add(bass_punch(hz(root + sem[k]), 0.16), at(b0 + k), pan=-0.05, gain=0.8 * acc)
        # staccato arpeggio (rises in later phrases)
        octv = 5 if ph in (2, 5) else 4
        pat = [0, 1, 2, 1, 0, 1, 2, 1] if ph < 4 else [0, 2, 1, 2, 0, 2, 1, 2]
        for k in range(16):
            m = 12 * (octv + 1) + tones[pat[k % 8] % 3] % 12 + (12 if pat[k % 8] == 2 and tones[2] % 12 < tones[0] % 12 else 0)
            mix.add(stac(hz(m), 0.12), at(b0 + k), pan=(-0.3, 0.3)[k % 2], gain=0.12)
        # drums
        for k in (0, 8) + ((10,) if bar % 2 else ()):
            mix.add(sweep(130, 48, 0.12, 0.4, click=0.35), at(b0 + k), gain=1.0)
        for k in (4, 12):
            mix.add(noise(n_snare, 3000 + 6000 * k + 20000 * (bar % 3), 0.1, 0.3) * 0.5 + 0.5 * sweep(210, 170, 0.07, 0.3), at(b0 + k), gain=0.75)
        step_h = 1 if ph in (2, 5) else 2
        for k in range(0, 16, step_h):
            mix.add(noise(n_hat, 9000 + 3331 * (bar * 16 + k) % 90000, 0.025, 0.1), at(b0 + k), pan=(-0.25, 0.25)[(k // step_h) % 2], gain=0.12 if k % 4 else 0.18)
        if bar % 4 == 3:   # fill: 16th snare roll building, tom run
            for i, k in enumerate(range(8, 16)):
                mix.add(noise(n_snare, 30000 + 3500 * k, 0.07, 0.2), at(b0 + k), gain=0.25 + 0.05 * i)
            for k, fr in ((12, 170), (13, 150), (14, 125), (15, 100)):
                mix.add(sweep(fr + 50, fr, 0.14, 0.3), at(b0 + k), pan=(k - 13.5) * 0.15, gain=0.5)
        if bar % 4 == 0 and bar != 0:
            mix.add(noise(n_crash, 20000 + 9000 * (bar // 4), 0.7, 2.0, 0.003), at(b0), pan=-0.2, gain=0.4)
        if bar == 0:
            mix.add(noise(n_crash, 15000, 0.9, 2.5, 0.003), at(b0), pan=-0.2, gain=0.45)
        if bar in (0, 12):
            mix.add(gong(), at(b0), gain=0.3)
        if bar in (4, 16, 20):   # serious taiko hits
            for k in (0, 6, 8):
                mix.add(sweep(110, 52, 0.35, 0.8), at(b0 + k), gain=0.7)
        # melody (8th grid) + counter-melody in second half
        if bar % 4 == 0:
            toks = mel[ph].replace('|', ' ').split(); assert len(toks) == 32, ph
            for k, tk in enumerate(toks):
                if tk == '-': continue
                d = 1
                while k + d < 32 and toks[k + d] == '-': d += 1
                mix.add(brass(hz(midi(tk)), d * 2 * st16 * 0.95 + 0.05), at(b0 + 2 * k), pan=0.1, gain=0.3)
        if bar >= 12:
            mix.add(brass(hz(12 * 5 + tones[2] % 12 - 12 * 0 + (0 if tones[2] % 12 >= 0 else 0)) / 2, 4 * beat * 0.97), at(b0), pan=-0.2, gain=0.16)
    # cymbal swell over the last 2 bars into the loop point
    L = int(2 * 4 * beat * SR); t = np.arange(L) / SR
    sw = n_crash[:L] * (np.minimum(1, t / (t[-1])) ** 2.5) * np.minimum(1, (t[-1] - t) / 0.03 + 0.0) if False else None
    sw = n_crash[40000:40000 + L] * (t / t[-1]) ** 2.5 * np.minimum(1, (t[-1] - t) / 0.03)
    mix.add(sw, n - L, pan=0.1, gain=0.45)
    x = mix.buf
    Lr = int(0.9 * SR); tt = np.arange(Lr) / SR
    wetsig = np.zeros_like(x)
    for c in range(2):
        ir = rng.standard_normal(Lr) * np.exp(-tt / 0.2)
        ir = sosfiltfilt(butter(2, 5000, fs=SR, output='sos'), ir); ir /= np.sqrt(np.sum(ir ** 2))
        irp = np.zeros(n); irp[:Lr] = ir
        wetsig[c] = np.fft.irfft(np.fft.rfft(x[c]) * np.fft.rfft(irp), n)
    x = x + 0.12 * wetsig
    sos = np.vstack([butter(4, 9500, fs=SR, output='sos'), butter(2, 45, 'high', fs=SR, output='sos')])
    x = sosfiltfilt(sos, np.tile(x, (1, 3)), axis=1)[:, n:2 * n]
    return np.tanh(x / np.max(np.abs(x)) * 1.6) * 0.6

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    if '--battle-b' in sys.argv:
        mp3, xf = finish(render_battle_b(), 'battle_b', target=-17.0)
        lufs, tp = measure(mp3)
        print(f'battle_b: {os.path.getsize(mp3)} bytes, {xf.shape[1]/SR:.2f} s, {lufs} LUFS, sample peak {tp} dBFS')
        if '--check' in sys.argv:
            for k, v in seam_report(xf, mp3).items(): print('  seam', k, v)
        sys.exit(0)
    if '--battle' in sys.argv:
        mp3, xf = finish(render_battle(), 'battle_a', target=-18.0)
        lufs, tp = measure(mp3)
        print(f'battle_a: {os.path.getsize(mp3)} bytes, {xf.shape[1]/SR:.2f} s, {lufs} LUFS, sample peak {tp} dBFS')
        if '--check' in sys.argv:
            for k, v in seam_report(xf, mp3).items(): print('  seam', k, v)
        sys.exit(0)
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
