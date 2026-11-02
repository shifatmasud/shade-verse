#!/usr/bin/env python3
"""Builds public/audio/hits.ogg/.mp3: the per-move REAL hit sprite (Shifat Nov 2 3:42 PM: "Sounds wrong. Hit should sound like real hits").
Sources: CC0 recordings on freesound.org (see public/audio/CREDITS.md), fetched as their high-quality previews.
Each hit = a body/bag thump (60-200 Hz, fast decay) + a skin/cloth slap transient (2-6 kHz), trimmed at -42 dB, short fade, peak-normalised.
Prints the HIT_SPRITE table for src/audio/engine.ts. Needs numpy, scipy, requests, ffmpeg.
"""
import os, subprocess, requests, numpy as np, scipy.signal as ss, json, sys
SR = 44100; TMP = '/tmp/hits_src'; OUT = os.environ.get('HITS_OUT') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../public/audio')
H = {'User-Agent': 'Mozilla/5.0'}
def preview(sid):
    fn = f'{TMP}/{sid}.mp3'
    if not os.path.exists(fn):
        t = requests.get(f'https://freesound.org/s/{sid}/', headers=H, timeout=30).text
        url = t.split('data-mp3="')[1].split('"')[0].replace('-lq.mp3', '-hq.mp3')
        assert 'publicdomain/zero/1.0' in t, f'{sid} is not CC0'
        open(fn, 'wb').write(requests.get(url, headers=H, timeout=60).content)
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', fn, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout
    return np.frombuffer(raw, np.float32).copy()
def env(x, w=220): return np.sqrt(np.convolve(x * x, np.ones(w) / w, 'same') + 1e-12)
def onsets(x, thr_db=-24, gap=0.18):
    e = env(x); above = 20 * np.log10(e / e.max()) > thr_db; res = []; last = -1e9
    for i0 in np.flatnonzero(np.diff(above.astype(int)) == 1):
        if i0 - last < gap * SR: continue
        p = i0 + int(np.argmax(e[i0:i0 + int(.04 * SR)])); j = p
        while j > 0 and e[j] > e[p] * 0.08 and p - j < int(.03 * SR): j -= 1
        res.append(max(0, j - int(.005 * SR))); last = i0
    return res
def clip(x, a, maxlen=0.45, floor_db=-38):
    seg = x[a:a + int(maxlen * SR)].copy(); e = env(seg, 132); p = np.argmax(e[:int(.05 * SR)])
    b = np.flatnonzero(e[p:] < e[p] * 10 ** (floor_db / 20)); seg = seg[:min(len(seg), p + (b[0] if len(b) else len(seg)))]
    fo = min(len(seg) // 3, int(.03 * SR)); seg[-fo:] *= np.linspace(1, 0, fo) ** 2
    return seg / np.abs(seg).max()
def filt(x, kind, fc): return ss.sosfilt(ss.butter(2, fc / (SR / 2), 'high' if kind == 'hp' else 'low', output='sos'), x)
def rs(x, r): return x if abs(r - 1) < 1e-3 else np.interp(np.arange(int(len(x) / r)) * r, np.arange(len(x)), x)
os.makedirs(TMP, exist_ok=True)
CL = {}
def C(sid, k):
    if sid not in CL: x = preview(sid); CL[sid] = [c for c in (clip(x, a) for a in onsets(x)) if len(c) >= int(.06 * SR)]
    return CL[sid][k]
def layer(specs, peak, maxlen, tail_db=-42):
    n = int(.6 * SR); out = np.zeros(n)
    for sid, k, g, off, r, *f in specs:
        x = rs(C(sid, k), r)
        if f: x = filt(x, *f[0])
        o = int(off / 1000 * SR); m = min(len(x), n - o); out[o:o + m] += g * x[:m]
    out = filt(out, 'hp', 40); e = env(out, 132); p = np.argmax(e)
    s0 = max(0, np.flatnonzero(e[:p + 1] > e[p] * 0.03)[0] - int(.002 * SR)); out, e, p = out[s0:], e[s0:], p - s0
    b = np.flatnonzero(e[p:] < e[p] * 10 ** (tail_db / 20)); out = out[:min(len(out), p + (b[0] if len(b) else len(out)), int(maxlen * SR))].copy()
    fo = min(len(out) // 3, int(.04 * SR)); out[-fo:] *= np.linspace(1, 0, fo) ** 2; out[:66] *= np.linspace(0, 1, 66)
    return out / np.abs(out).max() * peak
R = {}
R['jab'] = [layer([(545523, a, 1, 0, 1.0, ('hp', 140)), (346931, b, .55, 0, 1.0)], .55, .18) for a, b in [(1, 0), (12, 4), (2, 6)]]
R['cross'] = [layer([(616953, a, 1, 1, 1.0), (545523, b, .7, 0, 1.0, ('hp', 200)), (346931, c, .3, 0, .95)], .72, .26) for a, b, c in [(1, 9, 3), (20, 10, 1), (13, 7, 5)]]
R['kick'] = [layer([(586841, a, 1, 0, .97), (346931, b, .35, 2, .9), (616953, c, .4, 0, .9)], .86, .32) for a, b, c in [(0, 3, 4), (3, 1, 3), (7, 2, 9)]]
R['launcher'] = [layer([(503277, a, 1, 0, 1.08), (545523, b, .55, 0, 1.05, ('hp', 200))], .8, .3) for a, b in [(0, 8), (2, 11), (4, 18)]]
R['dunk'] = [layer([(586841, a, 1, 0, .9), (673424, b, .85, 14, 1.0), (128103, c, .45, 22, 1.0), (346931, 3, .25, 0, .85)], .95, .45, -40) for a, b, c in [(11, 0, 31), (2, 1, 11), (9, 2, 4)]]
R['webpull'] = [layer([(753427, a, 1, 0, 1.0), (616953, b, .7, 0, 1.03), (346931, c, .3, 0, 1.05)], .74, .26) for a, b, c in [(13, 23, 0), (8, 9, 4), (12, 16, 6)]]
R['yank'] = [layer([(503277, a, 1, 0, .98), (128103, b, .6, 12, 1.0), (346931, c, .25, 0, .9)], .86, .38) for a, b, c in [(5, 13, 2), (2, 29, 1)]]
R['metal'] = [layer([(545547, k, 1, 0, r, ('hp', 300))], .5, .14, -36) for k, r in [(12, 1.0), (2, 1.0), (3, .95), (4, 1.05)]]
R['boss_metal'] = [layer([(650701, 0, 1, 0, .85), (545547, k, .6, 0, .8, ('hp', 250)), (586841, b, .5, 0, .9)], .85, .4) for k, b in [(11, 5), (0, 3)]]
parts = [np.zeros(int(.05 * SR))]; pos = len(parts[0]); spr = {}
for k, takes in R.items():
    spr[k] = []
    for x in takes:
        pre = int(.03 * SR); spr[k].append([round((pos + pre) / SR - .003, 3), round(len(x) / SR + .035, 3)])
        parts += [np.zeros(pre), x, np.zeros(int(.09 * SR))]; pos += pre + len(x) + int(.09 * SR)
raw = f'{TMP}/hits.f32'; np.concatenate(parts).astype(np.float32).tofile(raw)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', raw, '-c:a', 'libvorbis', '-q:a', '4', f'{OUT}/hits.ogg'], check=True)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', raw, '-c:a', 'libmp3lame', '-b:a', '96k', f'{OUT}/hits.mp3'], check=True)
for k, v in spr.items(): print(f'    {k}: {json.dumps(v)},')
