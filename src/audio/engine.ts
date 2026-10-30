// Shade Verse audio engine: one AudioContext, three buses (world sfx, ambience, music), buffer playback only.
// - unlocks on the first user gesture (browsers keep a context suspended until then)
// - mute = master gain to 0; hidden tab = duck to 0 then suspend (and resume + fade back in on return)
// - voice cap with priority stealing, so a brawl can never pile up dozens of sources on the phone
// - positional one-shots: PannerNode (equalpower) on desktop, a plain StereoPanner + distance gain on phones
// - everything except the step sprite, the bird bed and the score is synthesized in-browser (./synth.ts)
import { RECIPES, renderRecipe } from './synth';

export type Vec3 = [number, number, number];
export interface PlayOpts { gain?: number; rate?: number; pos?: Vec3 | null; pan?: number; offset?: number; dur?: number; prio?: number; bus?: 'sfx' | 'amb'; when?: number; ref?: number; maxDist?: number }
interface Voice { src: AudioBufferSourceNode; g: GainNode; prio: number; t0: number; end: number }
interface Bed { name: string; src: AudioBufferSourceNode | null; g: GainNode; p: StereoPannerNode | null; cur: number; tgt: number; pan: number; rate: number; quiet: number }

const BASE = ((import.meta as any).env?.BASE_URL || '/') + 'audio/';
// downloaded assets (all small; see public/audio/CREDITS.md)
const FILES: Record<string, string> = { steps: 'steps', birds: 'birds', music_explore: 'music_explore', music_action: 'music_action', music_title: 'music_title' };
// character voice lines (Shifat Oct 29: "funny popular family friendly meme voices for every character"): public/audio/vo/<kind>_<i>, lazy-loaded
export const VO_N: Record<string, number> = { shadow: 16, ghost: 8, robot: 8, boss: 7, ped: 12, cg: 64, cs: 57 };   // cg / cs: Ghost & Shadow couple banter (src/audio/banter.ts)
for (const k in VO_N) for (let i = 0; i < VO_N[k]; i++) FILES[`vo_${k}_${i}`] = `vo/${k}_${i}`;
// footstep sprite: 4 takes per surface, 0.32 s slots (mp3 has ~26 ms encoder delay, compensated at play time)
export const STEP_SPRITE: Record<'concrete' | 'grass' | 'sand', number[]> = { concrete: [0, 0.32, 0.64, 0.96], grass: [1.28, 1.6, 1.92, 2.24], sand: [2.56, 2.88, 3.2, 3.52] };
const BED_LEVEL: Record<string, number> = { city: 0.32, wind: 0.42, waves: 0.55, lake: 0.36, birds: 0.34, leaves: 0.2, crickets: 0.12, underwater: 0.45, glide: 0.4, swingair: 0.4, beam: 0.6 };

const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

export class AudioEngine {
    ctx: AudioContext | null = null;
    readonly phone = coarse;
    readonly maxVoices = coarse ? 8 : 14;
    master!: GainNode; world!: GainNode; sfx!: GainNode; amb!: GainNode; music!: GainNode; muffle!: BiquadFilterNode;
    bufs = new Map<string, AudioBuffer>();
    private loading = new Map<string, Promise<AudioBuffer | null>>();
    voices: Voice[] = [];
    private beds = new Map<string, Bed>();
    private ext = 'ogg';
    private q: Promise<unknown> = Promise.resolve();
    muted = false; private hidden = false; private suspendT: any = 0;
    listener = { x: 0, y: 0, z: 0, yaw: 0 };
    // adaptive score
    private mus: { a: AudioBufferSourceNode; b: AudioBufferSourceNode; ga: GainNode; gb: GainNode } | null = null;
    private musStarting = false;
    private title: { s: AudioBufferSourceNode; g: GainNode } | null = null;
    wantTitle = false; wantScore = false;
    stats = { played: 0, dropped: 0, stolen: 0 };

    constructor() {
        try { const a = document.createElement('audio'); this.ext = a.canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'mp3'; } catch (e) { this.ext = 'mp3'; }
        try { const m = localStorage.getItem('shadeverse-muted'); if (m === '1') this.muted = true; } catch (e) { /* private mode */ }
    }
    get ready() { return !!this.ctx && this.ctx.state === 'running'; }

    /** Call from any user gesture. Creates the context once, then just resumes it. */
    unlock() {
        try {
            if (!this.ctx) {
                const AC = (window as any).AudioContext || (window as any).webkitAudioContext; if (!AC) return;
                const c: AudioContext = new AC({ latencyHint: 'interactive' }); this.ctx = c;
                this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 1;
                this.world = c.createGain(); this.sfx = c.createGain(); this.amb = c.createGain(); this.music = c.createGain();
                this.sfx.gain.value = 0.9; this.amb.gain.value = 0.85; this.music.gain.value = 0.55;
                this.muffle = c.createBiquadFilter(); this.muffle.type = 'lowpass'; this.muffle.frequency.value = 20000; this.muffle.Q.value = 0.5;
                this.sfx.connect(this.world); this.amb.connect(this.world); this.world.connect(this.muffle); this.muffle.connect(this.master); this.music.connect(this.master);
                if (!this.phone) { const lim = c.createDynamicsCompressor(); lim.threshold.value = -6; lim.knee.value = 6; lim.ratio.value = 8; lim.attack.value = 0.003; lim.release.value = 0.2; this.master.connect(lim); lim.connect(c.destination); }
                else this.master.connect(c.destination);   // phone: no compressor (CPU); levels are set to leave headroom instead
                this.preload(['start_hit', 'thwip', 'whoosh', 'attach', 'jump', 'land', 'land_soft', 'steps', 'wind', 'city', 'swingair', 'punch', 'swish', 'metal', 'orb']);
            }
            if (this.ctx.state !== 'running' && !this.hidden) { const p = this.ctx.resume(); if (p && (p as any).catch) (p as any).catch(() => { /* ignore */ }); }
        } catch (e) { /* audio is optional */ }
    }
    setMuted(m: boolean) {
        this.muted = m; try { localStorage.setItem('shadeverse-muted', m ? '1' : '0'); } catch (e) { /* ignore */ }
        const c = this.ctx; if (!c) return; this.master.gain.cancelScheduledValues(c.currentTime); this.master.gain.setTargetAtTime(m ? 0 : 1, c.currentTime, 0.05);
    }
    /** Hidden tab: duck to silence over ~150 ms, then suspend so the audio thread sleeps. */
    setHidden(h: boolean) {
        this.hidden = h; const c = this.ctx; if (!c) return; clearTimeout(this.suspendT);
        if (h) { this.master.gain.setTargetAtTime(0, c.currentTime, 0.05); this.suspendT = setTimeout(() => { try { c.suspend(); } catch (e) { /* ignore */ } }, 300); }
        else { try { const p = c.resume(); if (p && (p as any).catch) (p as any).catch(() => { /* ignore */ }); } catch (e) { /* ignore */ } this.master.gain.setTargetAtTime(this.muted ? 0 : 1, c.currentTime + 0.05, 0.12); }
    }

    // ---------- loading ----------
    preload(names: string[]) { for (const n of names) void this.load(n); }
    has(name: string) { return this.bufs.has(name); }
    load(name: string): Promise<AudioBuffer | null> {
        const hit = this.loading.get(name); if (hit) return hit;
        const c = this.ctx; if (!c) return Promise.resolve(null);
        let p: Promise<AudioBuffer | null>;
        if (FILES[name]) {
            p = fetch(BASE + FILES[name] + '.' + this.ext).then((r) => r.arrayBuffer()).then((ab) => new Promise<AudioBuffer>((res, rej) => { const q = c.decodeAudioData(ab, res, rej); if (q && (q as any).catch) (q as any).catch(rej); }));
        } else if (RECIPES[name]) { const rc = RECIPES[name]; p = this.q.then(() => renderRecipe(name, rc)); this.q = p.catch(() => null); }   // one offline render at a time: no load spike
        else p = Promise.resolve(null as any);
        p = p.then((b) => { if (b) this.bufs.set(name, b); return b; }).catch(() => null);
        this.loading.set(name, p); return p;
    }

    // ---------- spatial helpers ----------
    /** pan -1..1 and distance gain for a world position, relative to the hero and the camera's facing */
    spatial(pos: Vec3, ref = 8, maxDist = 140): { pan: number; gain: number; dist: number } {
        const L = this.listener, dx = pos[0] - L.x, dy = pos[1] - L.y, dz = pos[2] - L.z, dist = Math.hypot(dx, dy, dz);
        const rx = -Math.cos(L.yaw), rz = Math.sin(L.yaw);   // camera right vector (camera looks along (sin yaw, cos yaw))
        const pan = dist < 0.5 ? 0 : Math.max(-1, Math.min(1, (dx * rx + dz * rz) / Math.max(dist, 1))) * 0.85;
        const gain = dist >= maxDist ? 0 : (ref / Math.max(ref, dist)) * (1 - Math.pow(dist / maxDist, 2));
        return { pan, gain, dist };
    }
    updateListener(x: number, y: number, z: number, yaw: number) {
        this.listener.x = x; this.listener.y = y; this.listener.z = z; this.listener.yaw = yaw;
        const c = this.ctx; if (!c || this.phone) return; const l: any = c.listener, fx = Math.sin(yaw), fz = Math.cos(yaw);
        try { if (l.positionX) { l.positionX.value = x; l.positionY.value = y; l.positionZ.value = z; l.forwardX.value = fx; l.forwardY.value = 0; l.forwardZ.value = fz; l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0; } else { l.setPosition(x, y, z); l.setOrientation(fx, 0, fz, 0, 1, 0); } } catch (e) { /* ignore */ }
    }

    // ---------- one-shots ----------
    play(name: string, o: PlayOpts = {}): Voice | null {
        const c = this.ctx; if (!c || c.state !== 'running' || this.muted) return null;
        const buf = this.bufs.get(name); if (!buf) { void this.load(name); return null; }
        let gain = o.gain ?? 1, pan = o.pan ?? 0; const prio = o.prio ?? 1;
        let panner: PannerNode | null = null;
        if (o.pos) {
            const sp = this.spatial(o.pos, o.ref ?? 8, o.maxDist ?? 140); if (sp.gain < 0.015) { this.stats.dropped++; return null; }
            if (this.phone) { gain *= sp.gain; pan = sp.pan; }
            else { panner = c.createPanner(); panner.panningModel = 'equalpower'; panner.distanceModel = 'inverse'; panner.refDistance = o.ref ?? 8; panner.maxDistance = o.maxDist ?? 140; panner.rolloffFactor = 1;
                try { if ((panner as any).positionX) { panner.positionX.value = o.pos[0]; panner.positionY.value = o.pos[1]; panner.positionZ.value = o.pos[2]; } else (panner as any).setPosition(o.pos[0], o.pos[1], o.pos[2]); } catch (e) { /* ignore */ }
                gain *= 1 - Math.pow(Math.min(1, sp.dist / (o.maxDist ?? 140)), 2); }
        }
        const now = c.currentTime;
        this.voices = this.voices.filter((v) => v.end > now);
        if (this.voices.length >= this.maxVoices) {   // steal the lowest-priority, oldest voice; drop the new one if it is the least important
            let wi = -1; for (let i = 0; i < this.voices.length; i++) { const v = this.voices[i]; if (v.prio <= prio && (wi < 0 || v.prio < this.voices[wi].prio || (v.prio === this.voices[wi].prio && v.t0 < this.voices[wi].t0))) wi = i; }
            if (wi < 0) { this.stats.dropped++; return null; }
            const v = this.voices[wi]; try { v.g.gain.setTargetAtTime(0, now, 0.015); v.src.stop(now + 0.06); } catch (e) { /* ignore */ } this.voices.splice(wi, 1); this.stats.stolen++;
        }
        const src = c.createBufferSource(); src.buffer = buf; const rate = o.rate ?? 1; src.playbackRate.value = rate;
        const g = c.createGain(); g.gain.value = gain;
        let tail: AudioNode = g; src.connect(g);
        if (panner) { g.connect(panner); tail = panner; }
        else if (Math.abs(pan) > 0.02 && (c as any).createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); tail = p; }
        tail.connect(o.bus === 'amb' ? this.amb : this.sfx);
        const off = (o.offset ?? 0) + (o.offset !== undefined && this.ext === 'mp3' ? 0.026 : 0), when = Math.max(now, o.when ?? now);
        const dur = o.dur ?? (buf.duration - off);
        try { if (o.dur !== undefined) src.start(when, off, dur); else src.start(when, off); } catch (e) { return null; }
        const v: Voice = { src, g, prio, t0: now, end: when + dur / rate + 0.05 }; this.voices.push(v); this.stats.played++;
        src.onended = () => { try { src.disconnect(); g.disconnect(); tail.disconnect(); } catch (e) { /* ignore */ } };
        return v;
    }
    /** Like play(), but if the sound is still rendering it plays as soon as it is ready (within maxWait seconds). */
    playSoon(name: string, o: PlayOpts = {}, maxWait = 0.6) {
        if (this.bufs.has(name)) return void this.play(name, o);
        const t0 = performance.now(); void this.load(name).then(() => { if ((performance.now() - t0) / 1000 < maxWait) this.play(name, o); });
    }
    stopVoice(v: Voice | null, fade = 0.08) { const c = this.ctx; if (!c || !v) return; try { v.g.gain.setTargetAtTime(0, c.currentTime, fade / 3); v.src.stop(c.currentTime + fade + 0.05); } catch (e) { /* ignore */ } }

    // ---------- looping beds ----------
    /** Target level 0..1 (scaled by the bed's mix level), pan -1..1, playback rate. Sources start lazily and stop after 3 s of silence. */
    bed(name: string, level: number, pan = 0, rate = 1) {
        const c = this.ctx; if (!c) return; let b = this.beds.get(name);
        if (!b) { const g = c.createGain(); g.gain.value = 0; let p: StereoPannerNode | null = null; if ((c as any).createStereoPanner && name !== 'underwater' && name !== 'wind') { p = c.createStereoPanner(); g.connect(p); p.connect(this.amb); } else g.connect(this.amb); b = { name, src: null, g, p, cur: 0, tgt: 0, pan: 0, rate: 1, quiet: 0 }; this.beds.set(name, b); }
        b.tgt = Math.max(0, Math.min(1, level)) * (BED_LEVEL[name] ?? 0.4); b.pan = pan; b.rate = rate;
    }
    private tickBeds(dt: number) {
        const c = this.ctx!; const now = c.currentTime;
        for (const b of this.beds.values()) {
            if (b.tgt > 0.002 && !b.src) {
                const buf = this.bufs.get(b.name); if (!buf) { void this.load(b.name); continue; }
                const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(b.g); s.start(now, Math.random() * buf.duration); b.src = s; b.quiet = 0;
            }
            if (!b.src) continue;
            b.g.gain.setTargetAtTime(b.tgt, now, 0.35);
            if (b.p) b.p.pan.setTargetAtTime(b.pan, now, 0.25);
            b.src.playbackRate.setTargetAtTime(b.rate, now, 0.12);
            if (b.tgt <= 0.002) { b.quiet += dt; if (b.quiet > 3) { try { b.src.stop(); b.src.disconnect(); } catch (e) { /* ignore */ } b.src = null; } } else b.quiet = 0;
        }
    }
    activeBeds() { const o: Record<string, number> = {}; for (const b of this.beds.values()) if (b.src) o[b.name] = Math.round(b.tgt * 1000) / 1000; return o; }

    // ---------- music ----------
    /** intensity 0..1: 0 = calm exploration layer only, 1 = action layer fully in. calm 0..1 dims everything when idle. */
    private musI = 0; private musCalm = 1;
    setMusic(intensity: number, calm = 1) { this.musI = intensity; this.musCalm = calm; }
    private tickMusic() {
        const c = this.ctx!; const now = c.currentTime;
        // title track
        if (this.wantTitle && !this.title && this.bufs.has('music_title')) { const s = c.createBufferSource(); s.buffer = this.bufs.get('music_title')!; s.loop = true; const g = c.createGain(); g.gain.value = 0; s.connect(g); g.connect(this.music); s.start(now + 0.05); g.gain.setTargetAtTime(0.9, now, 0.8); this.title = { s, g }; }
        else if (this.wantTitle && !this.title) void this.load('music_title');
        if (!this.wantTitle && this.title) { const t = this.title; t.g.gain.setTargetAtTime(0, now, 0.6); try { t.s.stop(now + 3); } catch (e) { /* ignore */ } this.title = null; }
        // adaptive two-layer score: both loops start on the same sample so they stay locked
        if (this.wantScore && !this.mus && !this.musStarting) {
            const a = this.bufs.get('music_explore'), b = this.bufs.get('music_action');
            if (a && b) { const ga = c.createGain(), gb = c.createGain(); ga.gain.value = 0; gb.gain.value = 0; const sa = c.createBufferSource(), sb = c.createBufferSource(); sa.buffer = a; sb.buffer = b; sa.loop = sb.loop = true; sa.connect(ga); sb.connect(gb); ga.connect(this.music); gb.connect(this.music); const t0 = now + 0.1; sa.start(t0); sb.start(t0); this.mus = { a: sa, b: sb, ga, gb }; }
            else { this.musStarting = true; Promise.all([this.load('music_explore'), this.load('music_action')]).then(() => { this.musStarting = false; }); }
        }
        if (!this.wantScore && this.mus) { const m = this.mus; m.ga.gain.setTargetAtTime(0, now, 0.8); m.gb.gain.setTargetAtTime(0, now, 0.8); try { m.a.stop(now + 4); m.b.stop(now + 4); } catch (e) { /* ignore */ } this.mus = null; }
        if (this.mus) {
            const i = this.musI, calm = this.musCalm;
            this.mus.ga.gain.setTargetAtTime((0.55 + 0.3 * (1 - i)) * (0.45 + 0.55 * calm), now, 1.2);
            this.mus.gb.gain.setTargetAtTime(Math.pow(i, 1.3) * 0.95, now, i > 0.5 ? 0.6 : 1.8);
        }
    }

    /** Underwater: world bus through a 600 Hz low-pass, score dips. */
    private uw = 0;
    voDuck = 1;
    setUnderwater(k: number) { this.uw = k; }
    tick(dt: number) {
        const c = this.ctx; if (!c || c.state !== 'running') return;
        const now = c.currentTime;
        this.muffle.frequency.setTargetAtTime(this.uw > 0.5 ? 650 : 20000, now, this.uw > 0.5 ? 0.06 : 0.15);
        this.music.gain.setTargetAtTime((this.uw > 0.5 ? 0.3 : 0.55) * this.voDuck, now, 0.3);   // voDuck: music dips a little under the couple's banter
        this.tickBeds(dt); this.tickMusic();
    }
}

export const audio = new AudioEngine();
if ((import.meta as any).env?.VITE_DBG && typeof window !== 'undefined') (window as any).__svSynth = { RECIPES, renderRecipe };   // test/demo hooks, instrumented builds only
