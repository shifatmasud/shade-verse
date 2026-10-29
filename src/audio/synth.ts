// Procedural sound recipes for Shade Verse (all original, synthesized in the browser; no downloads).
// Each recipe renders ONCE into an AudioBuffer through an OfflineAudioContext (off the main thread), then playback is a plain
// buffer source: near-zero CPU per voice, which is what the Adreno 506 / Cortex-A53 phone needs.
type OAC = OfflineAudioContext;
export interface Recipe { dur: number; sr?: number; ch?: number; loop?: number; build: (c: OAC, r: () => number) => void }

// small seeded RNG so every player hears the same sounds
const mkRng = (seed: number) => { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) / 4294967296); }; };
// One long noise buffer per colour and sample rate, generated once and shared by every recipe (AudioBuffers are not tied to a
// context). Each use starts at a different seeded offset, so layers stay decorrelated without re-generating noise in JS.
const noiseCache = new Map<string, AudioBuffer>();
function noise(c: OAC, color: 'white' | 'pink' | 'brown'): AudioBuffer {
    const key = color + c.sampleRate; const hit = noiseCache.get(key); if (hit) return hit;
    const n = Math.ceil((c.sampleRate > 30000 ? 6 : 16) * c.sampleRate), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0), r = mkRng(color.length * 7919 + 13);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, l = 0;
    for (let i = 0; i < n; i++) {
        const w = r() * 2 - 1;
        if (color === 'white') d[i] = w;
        else if (color === 'pink') { b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; }
        else { l = (l + 0.02 * w) / 1.02; d[i] = l * 3.5; }
    }
    noiseCache.set(key, b); return b;
}
const N = (c: OAC, color: 'white' | 'pink' | 'brown', t0: number, dur: number, seed = 1, rate = 1) => {
    const s = c.createBufferSource(), b = noise(c, color); s.buffer = b; s.playbackRate.value = rate; s.loop = true;   // loops if a layer outlasts the buffer
    const off = ((seed * 0.6180339887) % 1) * b.duration; s.start(t0, off); s.stop(t0 + dur); return s;
};
const F = (c: OAC, type: BiquadFilterType, f: number, Q = 0.707) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; return b; };
const G = (c: OAC, v = 0) => { const g = c.createGain(); g.gain.value = v; return g; };
const O = (c: OAC, type: OscillatorType, f: number, t0: number, t1: number) => { const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.start(t0); o.stop(t1); return o; };
// envelope helper: points [t, v]; ramps linear, 'e' after value for exponential
function E(p: AudioParam, pts: [number, number, ('e' | 'l')?][]) {
    p.cancelScheduledValues(0); p.setValueAtTime(pts[0][1], pts[0][0]);
    for (let i = 1; i < pts.length; i++) { const [t, v, k] = pts[i]; if (k === 'e') p.exponentialRampToValueAtTime(Math.max(1e-4, v), t); else p.linearRampToValueAtTime(v, t); }
}
const chain = (...n: AudioNode[]) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; };
const hit = (c: OAC, t: number, a: number, d: number) => { const g = G(c, 0); E(g.gain, [[t, 0.0001], [t + a, 1, 'e'], [t + a + d, 0.0001, 'e']]); return g; };

export const RECIPES: Record<string, Recipe> = {
    // ---------------- ambient beds (looped) ----------------
    wind: { dur: 8, sr: 22050, loop: 1, build: (c, r) => {
        const n = N(c, 'pink', 0, 9, 3), bp = F(c, 'bandpass', 520, 0.55), lp = F(c, 'lowpass', 2600), g = G(c, 0.9);
        const t = 9; const pts: [number, number][] = []; for (let i = 0; i <= 18; i++) pts.push([i * t / 18, 0.55 + 0.45 * Math.abs(Math.sin(i * 1.7 + r() * 2))]);
        E(g.gain, pts); E(bp.frequency, pts.map(([tt, v]) => [tt, 380 + v * 420] as [number, number]));
        chain(n, bp, lp, g, c.destination);
        const n2 = N(c, 'white', 0, 9, 4), hp = F(c, 'bandpass', 2300, 1.2), g2 = G(c, 0.05); chain(n2, hp, g2, c.destination);   // airy whistle
    } },
    city: { dur: 12, sr: 22050, loop: 1.5, build: (c, r) => {
        const hum = N(c, 'brown', 0, 13.5, 5), lp = F(c, 'lowpass', 220), gh = G(c, 0.55); chain(hum, lp, gh, c.destination);
        const mid = N(c, 'pink', 0, 13.5, 6), bp = F(c, 'bandpass', 420, 0.4), gm = G(c, 0.16); chain(mid, bp, gm, c.destination);
        for (let i = 0; i < 7; i++) {   // distant car passes: band-limited swells with a slight pitch sweep (doppler)
            const t0 = r() * 12, d = 2.2 + r() * 2.5, f0 = 600 + r() * 500;
            const s = N(c, 'pink', t0, d, 20 + i), f = F(c, 'bandpass', f0, 1.4), g = G(c, 0);
            E(f.frequency, [[t0, f0 * 1.25], [t0 + d, f0 * 0.75, 'e']]); E(g.gain, [[t0, 0.0001], [t0 + d * 0.5, 0.18 + r() * 0.12, 'e'], [t0 + d, 0.0001, 'e']]);
            chain(s, f, g, c.destination);
        }
        for (let i = 0; i < 2; i++) { const t0 = 2 + r() * 9, o = O(c, 'sawtooth', 330 + r() * 80, t0, t0 + 0.35), f = F(c, 'lowpass', 900), g = G(c, 0); E(g.gain, [[t0, 0], [t0 + 0.03, 0.025], [t0 + 0.3, 0.02], [t0 + 0.35, 0]]); chain(o, f, g, c.destination); }   // far horn
    } },
    waves: { dur: 13, sr: 22050, loop: 2, build: (c, r) => {
        for (let k = 0; k < 3; k++) {   // three breakers per loop, each a rise -> crash -> wash
            const t0 = k * 5 + r() * 0.8, s = N(c, 'pink', t0, 7, 40 + k), lp = F(c, 'lowpass', 300, 0.5), g = G(c, 0);
            E(lp.frequency, [[t0, 250], [t0 + 1.6, 900, 'e'], [t0 + 2.0, 3200, 'e'], [t0 + 3.2, 1400, 'e'], [t0 + 6.5, 500, 'e']]);
            E(g.gain, [[t0, 0.0001], [t0 + 1.7, 0.35, 'e'], [t0 + 2.05, 0.9, 'e'], [t0 + 3.5, 0.45, 'e'], [t0 + 6.8, 0.0001, 'e']]);
            chain(s, lp, g, c.destination);
            const w = N(c, 'white', t0 + 2, 4.5, 50 + k), hp = F(c, 'highpass', 2500), gw = G(c, 0); E(gw.gain, [[t0 + 2, 0.0001], [t0 + 2.3, 0.12, 'e'], [t0 + 6.4, 0.0001, 'e']]); chain(w, hp, gw, c.destination);   // foam fizz
        }
        const bed = N(c, 'brown', 0, 15, 44), lb = F(c, 'lowpass', 400), gb = G(c, 0.25); chain(bed, lb, gb, c.destination);
    } },
    lake: { dur: 9, sr: 22050, loop: 1, build: (c, r) => {
        let t = 0.1; while (t < 9.6) {   // small laps against the bank
            const d = 0.35 + r() * 0.5, s = N(c, 'brown', t, d + 0.1, Math.floor(t * 100)), f = F(c, 'bandpass', 280 + r() * 260, 1.6), g = hit(c, t, d * 0.35, d * 0.65);
            const sc = G(c, 0.5 + r() * 0.5); chain(s, f, g, sc, c.destination); t += 0.45 + r() * 0.7;
        }
        for (let i = 0; i < 9; i++) { const t0 = r() * 9.5, f0 = 500 + r() * 600, o = O(c, 'sine', f0, t0, t0 + 0.09), g = G(c, 0); E(o.frequency, [[t0, f0], [t0 + 0.06, f0 * 2.4, 'e']]); E(g.gain, [[t0, 0.0001], [t0 + 0.005, 0.07, 'e'], [t0 + 0.08, 0.0001, 'e']]); chain(o, g, c.destination); }   // plips
        const bed = N(c, 'pink', 0, 10, 61), lp = F(c, 'lowpass', 700), gb = G(c, 0.08); chain(bed, lp, gb, c.destination);
    } },
    leaves: { dur: 7, sr: 22050, loop: 1, build: (c, r) => {
        const s = N(c, 'white', 0, 8, 71), hp = F(c, 'bandpass', 4200, 0.7), g = G(c, 0);
        const pts: [number, number][] = []; for (let i = 0; i < 400; i++) { const tt = i * 8 / 400, gust = 0.5 + 0.5 * Math.sin(tt * 1.3 + 1) * Math.sin(tt * 0.7); pts.push([tt, (0.05 + 0.35 * gust) * (0.3 + r() * r() * 1.6)]); }
        E(g.gain, pts); chain(s, hp, g, c.destination);
        const s2 = N(c, 'pink', 0, 8, 72), bp = F(c, 'bandpass', 1500, 0.6), g2 = G(c, 0.08); chain(s2, bp, g2, c.destination);
    } },
    crickets: { dur: 6, sr: 22050, loop: 0.5, build: (c, r) => {
        for (let k = 0; k < 3; k++) { const f0 = 4200 + k * 350 + r() * 200; let t = r() * 0.5; while (t < 6.4) { for (let j = 0; j < 3; j++) { const t0 = t + j * 0.045, o = O(c, 'sine', f0, t0, t0 + 0.03), g = G(c, 0); E(g.gain, [[t0, 0], [t0 + 0.005, 0.05 / (k + 1)], [t0 + 0.03, 0]]); chain(o, g, c.destination); } t += 0.5 + r() * 0.5; } }
    } },
    underwater: { dur: 7, sr: 22050, loop: 1, build: (c, r) => {
        const s = N(c, 'brown', 0, 8, 81), lp = F(c, 'lowpass', 170, 0.9), g = G(c, 0.9); chain(s, lp, g, c.destination);
        const s2 = N(c, 'pink', 0, 8, 82), lp2 = F(c, 'lowpass', 500), g2 = G(c, 0.1); chain(s2, lp2, g2, c.destination);
        for (let i = 0; i < 16; i++) { const t0 = r() * 7.5, f0 = 250 + r() * 500, d = 0.03 + r() * 0.05, o = O(c, 'sine', f0, t0, t0 + d + 0.02), g3 = G(c, 0); E(o.frequency, [[t0, f0], [t0 + d, f0 * 2.2, 'e']]); E(g3.gain, [[t0, 0.0001], [t0 + 0.004, 0.06 + r() * 0.06, 'e'], [t0 + d, 0.0001, 'e']]); chain(o, g3, c.destination); }   // bubbles
    } },
    glide: { dur: 4, sr: 22050, loop: 0.5, build: (c, r) => {
        const s = N(c, 'pink', 0, 4.6, 91), bp = F(c, 'bandpass', 850, 0.9), g = G(c, 0.6); chain(s, bp, g, c.destination);
        const fl = O(c, 'sine', 15, 0, 4.6), fg = G(c, 0.25); fl.connect(fg); fg.connect(g.gain);   // cape flutter
        const s2 = N(c, 'brown', 0, 4.6, 92), lp = F(c, 'lowpass', 160), g2 = G(c, 0.4); chain(s2, lp, g2, c.destination); void r;
    } },
    swingair: { dur: 3, sr: 22050, loop: 0.4, build: (c) => {
        const s = N(c, 'pink', 0, 3.5, 101), bp = F(c, 'bandpass', 650, 0.8), g = G(c, 0.9); chain(s, bp, g, c.destination);
        const s2 = N(c, 'white', 0, 3.5, 102), bp2 = F(c, 'bandpass', 1900, 2.5), g2 = G(c, 0.07); chain(s2, bp2, g2, c.destination);
    } },
    beam: { dur: 2, loop: 0.25, build: (c) => {   // boss unibeam sustain (hook)
        for (const [f, v] of [[110, 0.12], [110.7, 0.12], [221, 0.06], [55, 0.15]] as [number, number][]) { const o = O(c, 'sawtooth', f, 0, 2.3), lp = F(c, 'lowpass', 1800, 2), g = G(c, v); chain(o, lp, g, c.destination); }
        const s = N(c, 'white', 0, 2.3, 111), bp = F(c, 'bandpass', 2600, 1.5), g = G(c, 0.12); chain(s, bp, g, c.destination);
        const am = O(c, 'sine', 31, 0, 2.3), ag = G(c, 0.3); am.connect(ag); ag.connect(g.gain);
    } },
    // ---------------- one-shots ----------------
    thwip: { dur: 0.32, build: (c) => {
        const s = N(c, 'white', 0, 0.3, 201), bp = F(c, 'bandpass', 5000, 2.2), g = hit(c, 0, 0.006, 0.22);
        E(bp.frequency, [[0, 6500], [0.22, 1300, 'e']]); chain(s, bp, g, c.destination);
        const o = O(c, 'triangle', 2400, 0, 0.18), og = hit(c, 0, 0.003, 0.15), sc = G(c, 0.18); E(o.frequency, [[0, 2600], [0.15, 700, 'e']]); chain(o, og, sc, c.destination);
    } },
    attach: { dur: 0.25, build: (c) => {
        const s = N(c, 'white', 0, 0.06, 211), bp = F(c, 'bandpass', 1500, 1.5), g = hit(c, 0, 0.002, 0.05); chain(s, bp, g, c.destination);
        const o = O(c, 'sine', 160, 0, 0.2), og = hit(c, 0, 0.003, 0.17), sc = G(c, 0.6); E(o.frequency, [[0, 180], [0.15, 70, 'e']]); chain(o, og, sc, c.destination);
    } },
    whoosh: { dur: 0.95, build: (c) => {
        const s = N(c, 'pink', 0, 0.95, 221), bp = F(c, 'bandpass', 400, 1.3), g = G(c, 0);
        E(bp.frequency, [[0, 300], [0.42, 1500, 'e'], [0.9, 420, 'e']]); E(g.gain, [[0, 0.0001], [0.4, 1, 'e'], [0.92, 0.0001, 'e']]); chain(s, bp, g, c.destination);
    } },
    spring: { dur: 0.6, build: (c) => {
        const s = N(c, 'white', 0, 0.25, 231), bp = F(c, 'bandpass', 4000, 2), g = hit(c, 0, 0.004, 0.2); E(bp.frequency, [[0, 5200], [0.2, 1500, 'e']]); chain(s, bp, g, c.destination);
        const o = O(c, 'sawtooth', 150, 0.02, 0.58), lp = F(c, 'lowpass', 900, 3), og = hit(c, 0.02, 0.005, 0.5), sc = G(c, 0.22);
        E(o.frequency, [[0.02, 140], [0.12, 330, 'e'], [0.55, 290]]); const vib = O(c, 'sine', 22, 0, 0.6), vg = G(c, 18); vib.connect(vg); vg.connect(o.frequency); chain(o, lp, og, sc, c.destination);
    } },
    shock_charge: { dur: 1.5, build: (c, r) => {
        const o = O(c, 'sawtooth', 70, 0, 1.5), o2 = O(c, 'square', 71, 0, 1.5), bp = F(c, 'bandpass', 500, 3), g = G(c, 0);
        E(o.frequency, [[0, 70], [1.4, 420, 'e']]); E(o2.frequency, [[0, 71.5], [1.4, 425, 'e']]); E(bp.frequency, [[0, 400], [1.4, 3200, 'e']]); E(g.gain, [[0, 0.0001], [1.3, 0.35, 'e'], [1.5, 0.0001, 'e']]);
        const lfo = O(c, 'square', 18, 0, 1.5), lg = G(c, 0.15); E(lfo.frequency, [[0, 14], [1.4, 46, 'e']]); lfo.connect(lg); lg.connect(g.gain);
        o.connect(bp); o2.connect(bp); chain(bp, g, c.destination);
        for (let i = 0; i < 22; i++) { const t0 = Math.pow(r(), 0.6) * 1.35, s = N(c, 'white', t0, 0.03, 300 + i), hp = F(c, 'highpass', 3500), cg = hit(c, t0, 0.001, 0.02), sc = G(c, 0.25 * (t0 / 1.4 + 0.2)); chain(s, hp, cg, sc, c.destination); }   // crackle
    } },
    zap: { dur: 0.9, build: (c, r) => {
        const s = N(c, 'white', 0, 0.06, 241), g = hit(c, 0, 0.001, 0.05); chain(s, g, c.destination);
        const s2 = N(c, 'white', 0, 0.6, 242), bp = F(c, 'bandpass', 3000, 0.9), g2 = hit(c, 0, 0.002, 0.45), sc2 = G(c, 0.6); chain(s2, bp, g2, sc2, c.destination);
        const o = O(c, 'square', 62, 0, 0.6), fm = O(c, 'sawtooth', 173, 0, 0.6), fg = G(c, 90); fm.connect(fg); fg.connect(o.frequency); const lp = F(c, 'lowpass', 2500), og = hit(c, 0, 0.002, 0.5), sc = G(c, 0.25); chain(o, lp, og, sc, c.destination);
        const b = O(c, 'sine', 80, 0, 0.8), bg = hit(c, 0, 0.004, 0.7), bs = G(c, 0.8); E(b.frequency, [[0, 90], [0.6, 32, 'e']]); chain(b, bg, bs, c.destination);
        for (let i = 0; i < 10; i++) { const t0 = 0.05 + r() * 0.45, ss = N(c, 'white', t0, 0.02, 250 + i), cg = hit(c, t0, 0.001, 0.015), sc3 = G(c, 0.35); chain(ss, cg, sc3, c.destination); }
    } },
    punch: { dur: 0.4, build: (c) => {
        const b = O(c, 'sine', 160, 0, 0.35), bg = hit(c, 0, 0.002, 0.28); E(b.frequency, [[0, 170], [0.09, 48, 'e']]); chain(b, bg, c.destination);
        const s = N(c, 'white', 0, 0.06, 261), lp = F(c, 'lowpass', 3500), sg = hit(c, 0, 0.001, 0.04), sc = G(c, 0.7); chain(s, lp, sg, sc, c.destination);
        const k = N(c, 'pink', 0.004, 0.12, 262), bp = F(c, 'bandpass', 750, 1.5), kg = hit(c, 0.004, 0.003, 0.09), ks = G(c, 0.9); chain(k, bp, kg, ks, c.destination);
    } },
    punch_heavy: { dur: 0.6, build: (c) => {
        const b = O(c, 'sine', 120, 0, 0.55), bg = hit(c, 0, 0.002, 0.45); E(b.frequency, [[0, 130], [0.14, 36, 'e']]); chain(b, bg, c.destination);
        const s = N(c, 'white', 0, 0.08, 271), lp = F(c, 'lowpass', 2500), sg = hit(c, 0, 0.001, 0.06), sc = G(c, 0.8); chain(s, lp, sg, sc, c.destination);
        const k = N(c, 'brown', 0.005, 0.3, 272), bp = F(c, 'lowpass', 600), kg = hit(c, 0.005, 0.004, 0.25), ks = G(c, 0.9); chain(k, bp, kg, ks, c.destination);
    } },
    swish: { dur: 0.28, build: (c) => {
        const s = N(c, 'pink', 0, 0.28, 281), bp = F(c, 'bandpass', 1100, 1.6), g = G(c, 0); E(bp.frequency, [[0, 900], [0.12, 3200, 'e'], [0.26, 1500, 'e']]); E(g.gain, [[0, 0.0001], [0.1, 1, 'e'], [0.27, 0.0001, 'e']]); chain(s, bp, g, c.destination);
    } },
    land: { dur: 0.8, build: (c, r) => {
        const b = O(c, 'sine', 95, 0, 0.7), bg = hit(c, 0, 0.003, 0.55); E(b.frequency, [[0, 100], [0.3, 34, 'e']]); chain(b, bg, c.destination);
        const s = N(c, 'brown', 0, 0.4, 291), lp = F(c, 'lowpass', 700), sg = hit(c, 0, 0.002, 0.35), sc = G(c, 1.2); chain(s, lp, sg, sc, c.destination);
        for (let i = 0; i < 14; i++) { const t0 = 0.03 + r() * r() * 0.5, ss = N(c, 'white', t0, 0.02, 292 + i), hp = F(c, 'bandpass', 2500 + r() * 3000, 2), cg = hit(c, t0, 0.001, 0.015), s3 = G(c, 0.3 * (1 - t0)); chain(ss, hp, cg, s3, c.destination); }   // grit
    } },
    land_soft: { dur: 0.3, build: (c) => {
        const b = O(c, 'sine', 120, 0, 0.25), bg = hit(c, 0, 0.003, 0.18), sc = G(c, 0.6); E(b.frequency, [[0, 130], [0.15, 60, 'e']]); chain(b, bg, sc, c.destination);
        const s = N(c, 'pink', 0, 0.15, 311), lp = F(c, 'lowpass', 1600), sg = hit(c, 0, 0.002, 0.1), s2 = G(c, 0.5); chain(s, lp, sg, s2, c.destination);
    } },
    jump: { dur: 0.3, build: (c) => {
        const s = N(c, 'pink', 0, 0.3, 321), bp = F(c, 'bandpass', 700, 1.2), g = G(c, 0); E(bp.frequency, [[0, 500], [0.2, 1700, 'e']]); E(g.gain, [[0, 0.0001], [0.07, 0.8, 'e'], [0.28, 0.0001, 'e']]); chain(s, bp, g, c.destination);
    } },
    splash: { dur: 1.0, build: (c, r) => {
        const s = N(c, 'white', 0, 0.9, 331), lp = F(c, 'lowpass', 4500, 0.8), g = hit(c, 0, 0.01, 0.8); E(lp.frequency, [[0, 5000], [0.7, 350, 'e']]); chain(s, lp, g, c.destination);
        const b = N(c, 'brown', 0, 0.5, 332), lb = F(c, 'lowpass', 300), bg = hit(c, 0, 0.01, 0.4); chain(b, lb, bg, c.destination);
        for (let i = 0; i < 12; i++) { const t0 = 0.1 + r() * 0.7, f0 = 400 + r() * 900, o = O(c, 'sine', f0, t0, t0 + 0.06), og = hit(c, t0, 0.003, 0.05), sc = G(c, 0.12); E(o.frequency, [[t0, f0], [t0 + 0.05, f0 * 2, 'e']]); chain(o, og, sc, c.destination); }
    } },
    orb: { dur: 0.9, build: (c) => {
        [[1318.5, 0.2, 0], [1975.5, 0.14, 0.05], [2637, 0.1, 0.1], [3951, 0.05, 0.1]].forEach(([f, v, t0]) => { const o = O(c, 'sine', f, t0, 0.9), g = hit(c, t0, 0.004, 0.75), s = G(c, v); chain(o, g, s, c.destination); });
    } },
    hurt: { dur: 0.45, build: (c) => {
        const b = O(c, 'sine', 110, 0, 0.4), bg = hit(c, 0, 0.002, 0.35); E(b.frequency, [[0, 120], [0.3, 45, 'e']]); chain(b, bg, c.destination);
        const o = O(c, 'sawtooth', 220, 0, 0.3), lp = F(c, 'lowpass', 1200), og = hit(c, 0, 0.003, 0.25), sc = G(c, 0.2); E(o.frequency, [[0, 240], [0.25, 90, 'e']]); chain(o, lp, og, sc, c.destination);
        const s = N(c, 'white', 0, 0.05, 341), sg = hit(c, 0, 0.001, 0.04), s2 = G(c, 0.5); chain(s, sg, s2, c.destination);
    } },
    metal: { dur: 0.6, build: (c, r) => {   // robot enemy hit: inharmonic clank
        [523, 1187, 1873, 2960, 4210].forEach((f, i) => { const o = O(c, 'sine', f * (0.97 + r() * 0.06), 0, 0.6), g = hit(c, 0, 0.001, 0.12 + 0.35 / (i + 1)), s = G(c, 0.16 / (1 + i * 0.4)); chain(o, g, s, c.destination); });
        const s = N(c, 'white', 0, 0.04, 351), hp = F(c, 'highpass', 1500), sg = hit(c, 0, 0.001, 0.03), s2 = G(c, 0.6); chain(s, hp, sg, s2, c.destination);
        const b = O(c, 'sine', 140, 0, 0.2), bg = hit(c, 0, 0.002, 0.15), bs = G(c, 0.5); E(b.frequency, [[0, 150], [0.12, 60, 'e']]); chain(b, bg, bs, c.destination);
    } },
    enemy_down: { dur: 1.5, build: (c, r) => {
        const s = N(c, 'white', 0, 1.0, 361), bp = F(c, 'bandpass', 4000, 1.2), g = G(c, 0); const pts: [number, number][] = []; for (let i = 0; i <= 60; i++) pts.push([i / 60, (r() > 0.5 ? 0.35 : 0.02) * (1 - i / 60)]); E(g.gain, pts); chain(s, bp, g, c.destination);   // electrical fizz
        const o = O(c, 'sawtooth', 700, 0, 1.2), lp = F(c, 'lowpass', 1500), og = G(c, 0); E(o.frequency, [[0, 700], [1.1, 45, 'e']]); E(og.gain, [[0, 0.12], [1.15, 0.0001, 'e']]); chain(o, lp, og, c.destination);   // power-down
        const bm = N(c, 'brown', 0.05, 1.2, 362), bl = F(c, 'lowpass', 900), bg = hit(c, 0.05, 0.01, 1.0), bs = G(c, 1.0); E(bl.frequency, [[0.05, 1400], [1.1, 150, 'e']]); chain(bm, bl, bg, bs, c.destination);   // small burst
        const sub = O(c, 'sine', 70, 0.05, 1.0), sg = hit(c, 0.05, 0.005, 0.8), ss = G(c, 0.7); E(sub.frequency, [[0.05, 75], [0.8, 30, 'e']]); chain(sub, sg, ss, c.destination);
    } },
    boss_hit: { dur: 0.9, build: (c, r) => {
        [196, 451, 733, 1180, 1710].forEach((f, i) => { const o = O(c, 'sine', f * (0.98 + r() * 0.04), 0, 0.9), g = hit(c, 0, 0.001, 0.25 + 0.5 / (i + 1)), s = G(c, 0.18 / (1 + i * 0.4)); chain(o, g, s, c.destination); });
        const b = O(c, 'sine', 80, 0, 0.6), bg = hit(c, 0, 0.002, 0.5); E(b.frequency, [[0, 90], [0.3, 35, 'e']]); chain(b, bg, c.destination);
        const s = N(c, 'brown', 0, 0.3, 371), lp = F(c, 'lowpass', 1200), sg = hit(c, 0, 0.001, 0.25), s2 = G(c, 0.8); chain(s, lp, sg, s2, c.destination);
    } },
    boss_down: { dur: 3.0, build: (c, r) => {
        const s = N(c, 'brown', 0, 3, 381), lp = F(c, 'lowpass', 3000, 0.8), g = hit(c, 0, 0.01, 2.8), sc = G(c, 1.4); E(lp.frequency, [[0, 3500], [2.5, 120, 'e']]); chain(s, lp, g, sc, c.destination);
        const sub = O(c, 'sine', 55, 0, 2.6), sg = hit(c, 0, 0.005, 2.4); E(sub.frequency, [[0, 60], [2.2, 24, 'e']]); chain(sub, sg, c.destination);
        for (let i = 0; i < 26; i++) { const t0 = 0.15 + r() * 2.0, ss = N(c, 'white', t0, 0.05, 382 + i), bp = F(c, 'bandpass', 1500 + r() * 4000, 2), cg = hit(c, t0, 0.001, 0.04), s3 = G(c, 0.3 * (1 - t0 / 2.4)); chain(ss, bp, cg, s3, c.destination); }   // debris
    } },
    siren: { dur: 7, sr: 22050, build: (c) => {
        const o = O(c, 'triangle', 700, 0, 7), o2 = O(c, 'sine', 1400, 0, 7), lfo = O(c, 'sine', 0.33, 0, 7), lg = G(c, 330); lfo.connect(lg); lg.connect(o.frequency); const l2 = G(c, 660); lfo.connect(l2); l2.connect(o2.frequency); o.frequency.value = 1000; o2.frequency.value = 2000;
        const lp = F(c, 'lowpass', 1600), g = G(c, 0); E(g.gain, [[0, 0.0001], [1.5, 0.25, 'e'], [5.0, 0.25], [7, 0.0001, 'e']]); const g2 = G(c, 0.25); o.connect(lp); o2.connect(g2); g2.connect(lp); chain(lp, g, c.destination);
    } },
    start_hit: { dur: 2.2, build: (c) => {   // title -> play cinematic hit
        const s = N(c, 'pink', 0, 0.8, 391), bp = F(c, 'bandpass', 600, 0.8), g = G(c, 0); E(bp.frequency, [[0, 300], [0.55, 3000, 'e']]); E(g.gain, [[0, 0.0001], [0.55, 0.6, 'e'], [0.6, 0.0001, 'e']]); chain(s, bp, g, c.destination);
        const b = O(c, 'sine', 60, 0.55, 2.2), bg = hit(c, 0.55, 0.005, 1.6); E(b.frequency, [[0.55, 70], [2.0, 30, 'e']]); chain(b, bg, c.destination);
        const n = N(c, 'brown', 0.55, 1.5, 392), lp = F(c, 'lowpass', 900), ng = hit(c, 0.55, 0.005, 1.3), ns = G(c, 0.8); chain(n, lp, ng, ns, c.destination);
    } },
    // ---------------- hooks for the Iron Man-style enemy/boss weapons (wire when that feature lands) ----------------
    repulsor_charge: { dur: 1.0, build: (c) => {
        const o = O(c, 'sine', 400, 0, 1), o2 = O(c, 'triangle', 404, 0, 1), g = G(c, 0); E(o.frequency, [[0, 380], [0.95, 1700, 'e']]); E(o2.frequency, [[0, 386], [0.95, 1720, 'e']]); E(g.gain, [[0, 0.0001], [0.9, 0.22, 'e'], [1, 0.0001, 'e']]); o.connect(g); o2.connect(g); g.connect(c.destination);
        const s = N(c, 'white', 0, 1, 401), hp = F(c, 'highpass', 6000), sg = G(c, 0); E(sg.gain, [[0, 0], [0.9, 0.08], [1, 0]]); chain(s, hp, sg, c.destination);
    } },
    repulsor_bolt: { dur: 0.8, build: (c) => {
        const o = O(c, 'square', 1400, 0, 0.25), lp = F(c, 'lowpass', 4000), og = hit(c, 0, 0.002, 0.2), os = G(c, 0.2); E(o.frequency, [[0, 1500], [0.2, 180, 'e']]); chain(o, lp, og, os, c.destination);
        const s = N(c, 'white', 0, 0.3, 411), bp = F(c, 'bandpass', 2500, 0.8), sg = hit(c, 0, 0.002, 0.25), ss = G(c, 0.5); chain(s, bp, sg, ss, c.destination);
        const b = O(c, 'sine', 95, 0, 0.7), bg = hit(c, 0, 0.003, 0.6), bs = G(c, 0.8); E(b.frequency, [[0, 100], [0.5, 38, 'e']]); chain(b, bg, bs, c.destination);
    } },
    unibeam_charge: { dur: 1.9, build: (c) => {
        const o = O(c, 'sawtooth', 110, 0, 1.9), o2 = O(c, 'sawtooth', 111, 0, 1.9), lp = F(c, 'lowpass', 300, 4), g = G(c, 0); E(o.frequency, [[0, 90], [1.8, 880, 'e']]); E(o2.frequency, [[0, 91], [1.8, 886, 'e']]); E(lp.frequency, [[0, 200], [1.8, 3500, 'e']]); E(g.gain, [[0, 0.0001], [1.75, 0.3, 'e'], [1.9, 0.0001, 'e']]); o.connect(lp); o2.connect(lp); chain(lp, g, c.destination);
        const sub = O(c, 'sine', 40, 0, 1.9), sg = G(c, 0); E(sub.frequency, [[0, 35], [1.8, 70]]); E(sg.gain, [[0, 0], [1.7, 0.6], [1.9, 0]]); chain(sub, sg, c.destination);
    } },
    unibeam_fire: { dur: 0.8, build: (c) => {
        const s = N(c, 'white', 0, 0.7, 421), lp = F(c, 'lowpass', 6000), g = hit(c, 0, 0.003, 0.6); E(lp.frequency, [[0, 8000], [0.6, 1200, 'e']]); chain(s, lp, g, c.destination);
        const b = O(c, 'sine', 70, 0, 0.8), bg = hit(c, 0, 0.004, 0.7), bs = G(c, 0.9); E(b.frequency, [[0, 80], [0.6, 30, 'e']]); chain(b, bg, bs, c.destination);
    } },
};

// Render a recipe. Loops are rendered (dur + loop) long and the tail is cross-faded into the head so they repeat seamlessly.
export async function renderRecipe(name: string, rc: Recipe): Promise<AudioBuffer> {
    const sr = rc.sr ?? 44100, ch = rc.ch ?? 1, xf = rc.loop ?? 0, total = rc.dur + xf;
    const OC = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    const c: OAC = new OC(ch, Math.ceil(total * sr), sr);
    let seed = 0; for (let i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) | 0;
    rc.build(c, mkRng(seed));
    const out: AudioBuffer = await new Promise((res, rej) => { (c as any).oncomplete = (e: any) => res(e.renderedBuffer); const p = c.startRendering(); if (p && (p as any).then) (p as any).then(res, rej); });
    // normalise to a predictable peak so mixing levels live in one place (the engine), not inside each recipe
    let pk = 0; for (let k = 0; k < out.numberOfChannels; k++) { const d = out.getChannelData(k); for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > pk) pk = a; } }
    const nrm = pk > 0 ? 0.89 / pk : 1;
    if (!xf) { for (let k = 0; k < out.numberOfChannels; k++) { const d = out.getChannelData(k); for (let i = 0; i < d.length; i++) d[i] *= nrm; } return out; }
    const n = Math.ceil(rc.dur * sr), k = out.length - n, lp = c.createBuffer(out.numberOfChannels, n, sr);
    for (let chn = 0; chn < out.numberOfChannels; chn++) {
        const s = out.getChannelData(chn), d = lp.getChannelData(chn);
        for (let i = 0; i < n; i++) d[i] = s[i] * nrm;
        for (let i = 0; i < k && i < n; i++) { const w = Math.sin((i / k) * Math.PI / 2); d[i] = (s[i] * w * w + s[n + i] * (1 - w * w)) * nrm; }
    }
    return lp;
}
