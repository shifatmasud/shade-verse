// Sound director: reads the simulation every frame (no changes to sim.ts) and turns state changes into sound.
// Ambient beds cross-fade by zone and position; hero / enemy one-shots fire on state edges; the score follows the action.
import { audio, STEP_SPRITE, HIT_SPRITE, VO_N, type Vec3 } from './engine';
import { WEATHER } from '../world/env';
// Mix (Shifat Oct 31 6:27 PM): ambience 1x, background strings/pads 0.8x (engine MUSIC_MIX), hero dialogue 1.2x
const VO_MIX = 1.2;
import { FALLS, HARBOR, ISLAND, isIsland, inHarbor, bridgeDeckY, isFarm, isIce, isPirate } from '../seaWorld';
import { BANTER, type BanterTrig } from './banter';
import { PARK, PARK_POND, WATER_Z, WATER_Y, isLakeWater, waterSurfaceAt, sandWeight, isLegacyCityCore, bridgeSurfaceAt, SNARE, enemyBodyOffset, PED_VOICE, getCompanionSim, type Sim } from '../sim';

// small fading caption at the bottom of the screen ("Ghost: ...", "Shadow: ...")
let capEl: HTMLDivElement | null = null, capT = 0;
function caption(who: string, text: string) {
    if (typeof document === 'undefined') return;
    if (!capEl) { capEl = document.createElement('div'); capEl.style.cssText = 'position:fixed;left:50%;bottom:9%;transform:translateX(-50%);max-width:80vw;padding:4px 10px;border-radius:8px;background:rgba(10,12,20,0.45);color:#fff;font:600 13px/1.3 system-ui,sans-serif;text-align:center;pointer-events:none;z-index:40;transition:opacity 0.4s;opacity:0;text-shadow:0 1px 2px #000'; document.body.appendChild(capEl); }
    capEl.innerHTML = ''; const b = document.createElement('span'); b.style.color = who === 'Ghost' ? '#c9e7ff' : '#ffd29a'; b.textContent = who + ': '; capEl.appendChild(b); capEl.appendChild(document.createTextNode(text));
    capEl.style.opacity = '1'; const my = ++capT; setTimeout(() => { if (my === capT && capEl) capEl.style.opacity = '0'; }, 2600 + text.length * 35);
    if ((import.meta as any).env?.VITE_DBG) ((window as any).__captions ||= []).push(who + ': ' + text);
}
const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
// mirror of Scene's day/night clock (DN_DUR 1200 s), so birds sing by day and crickets take over at night without touching Scene.tsx
const T0 = typeof performance !== 'undefined' ? performance.now() : 0;
function daylight() { const ph = Math.asin(0.22 / 0.95) + (((performance.now() - T0) / 1000) / 1200) * Math.PI * 2; const x = -0.5, y = Math.sin(ph) * 0.95, z = Math.cos(ph) * 0.85 + 0.3; const sy = y / Math.hypot(x, y, z); return sstep(-0.12, 0.3, sy); }

type Surface = 'concrete' | 'grass' | 'sand';
export function surfaceAt(x: number, z: number, y: number, groundY: number): Surface {
    if (y > groundY + 2.5) return 'concrete';   // rooftops
    if (bridgeSurfaceAt(x, z) !== null) return 'concrete';   // (wooden deck reads closest to the hard set)
    if (sandWeight(x, z) > 0.5) return 'sand';
    if (x > PARK.x0 && x < PARK.x1 && z > PARK.z0 && z < PARK.z1) return 'grass';
    return 'concrete';
}

interface Prev { slamPh: number; cc: number; csn: number; muted: boolean; web: boolean; spring: number; shotT: number; atkT: number; snareT: number; swim: boolean; dive: boolean; glide: boolean; mode: string; hit: number[]; down: number[]; speed: number }

/* Per-move hit sounds (Shifat Nov 2 3:42 PM on the synth layers of 77696ea: "Sounds wrong. Hit should sound like real hits. Study real sounds refs").
   Every hit is now a REAL recording (CC0 foley: boxing-mitt and punching-bag hits, face/body punches, a power kick, body falls, metal clanks;
   public/audio/CREDITS.md), cut tight into the 'hits' sprite: a short skin/cloth slap transient over a fast-decaying body thump, no synth ring, short tails.
   Move -> [sprite set, gain, web character]. Jab = light snappy slap; cross = fuller bag hit; spin hook kick = heavier, more low body; launcher = a full
   body punch pitched up a touch; spike/dunk = heavy body impact + floor thud; web pull / web yank = real impacts with the web 'attach' zip kept under them.
   Takes round-robin (never the same take twice in a row), with small pitch (+-4%) and level (+-8%) variation. */
const HIT_SET: Record<number, [string, number, number]> = {
    1: ['jab', 0.78, 0], 2: ['cross', 0.78, 0], 3: ['kick', 0.8, 0], 4: ['launcher', 0.78, 0], 5: ['dunk', 0.85, 0], 6: ['webpull', 0.78, 0.22], 7: ['yank', 0.82, 0.25],
};
/* Audio polish (Nov 3): low-end layer matched to hitFeel.ts's camera kick. The recorded hit stays the voice of the blow; a short procedural
   sub 'thump' underneath gives the heavy ones their weight, scaled like the kick: jab/cross/web-pull none, launcher light, yank light,
   finisher (spin hook kick) and dunk medium, Shock and Slam heaviest. Pitch/level jittered each time so repeats never sound copy-pasted. */
const THUMP: Record<number, number> = { 3: 0.5, 4: 0.28, 5: 0.6, 7: 0.3 };
function thump(gain: number, o: { pos?: Vec3; rate?: number; delay?: number } = {}) {
    if (gain <= 0.01) return;
    audio.play('thump', { gain: gain * (0.9 + Math.random() * 0.15), rate: (o.rate ?? 1) * (0.94 + Math.random() * 0.1), pos: o.pos, ref: 10, prio: 4, when: o.delay ? audio.ctx.currentTime + o.delay : undefined });
}
/** move-specific whoosh for the melee wind-up: the jab is short and bright, the cross fuller, the spin kick a deeper, longer sweep */
const SWISH: Record<number, [number, number]> = { 1: [0.34, 1.15], 2: [0.4, 1.0], 3: [0.5, 0.78], 4: [0.42, 0.9], 5: [0.46, 0.82], 6: [0.38, 0.95], 7: [0.4, 0.92] };
const hitRR: Record<string, number> = {};
/** plays one take of a hit-sprite set: round-robin, small random pitch/level */
function playHit(set: string, gain: number, o: { pos?: Vec3; prio?: number; ref?: number; rate?: number } = {}) {
    const takes = HIT_SPRITE[set]; if (!takes) return;
    const i = hitRR[set] = ((hitRR[set] ?? -1) + 1 + (takes.length > 2 && Math.random() < 0.3 ? 1 : 0)) % takes.length, [off, dur] = takes[i];
    audio.play('hits', { offset: off, dur, gain: gain * (0.92 + Math.random() * 0.16), rate: (o.rate ?? 1) * (0.96 + Math.random() * 0.08), pos: o.pos, ref: o.ref, prio: o.prio ?? 3 });
}
export class SoundDirector {
    private p: Prev = { slamPh: -1, cc: 0, csn: 0, muted: false, web: false, spring: 0, shotT: 0, atkT: 0, snareT: 0, swim: false, dive: false, glide: false, mode: 'menu', hit: [], down: [], speed: 0 };
    private stepAcc = 0; private stepI = 0;
    private intensity = 0; private idleT = 0; private combatT = 0; private swingVol = 0; private lastLand = -9;
    private chargeV: any = null; private slamV: any = null;
    // ---- character voices: one line at a time world-wide, per-kind cooldowns, so the world chatters without spamming ----
    private voGap = 0; private voCd: Record<string, number> = { shadow: 0, ghost: 0, robot: 0, boss: 0, ped: 0 }; private bossAggro = false;
    vo(kind: string, pick?: number[], o: { pos?: Vec3; gain?: number; cd?: number; force?: boolean } = {}) {
        if (!o.force && (this.voGap > 0 || this.voCd[kind] > 0)) return;
        const n = VO_N[kind], i = pick ? pick[Math.floor(Math.random() * pick.length)] : Math.floor(Math.random() * n);
        audio.playSoon(`vo_${kind}_${i}`, { gain: (o.gain ?? 0.85) * VO_MIX, pos: o.pos ?? null, prio: 4, ref: 10, maxDist: 90 }, 1.2);
        this.voGap = 2.2; this.voCd[kind] = o.cd ?? 6;
    }
    // ---- Ghost & Shadow banter (husband & wife): an exchange plays line by line, the reply 0.3 s after the line before it ends; never overlaps
    // other voice lines; about one exchange every 10-20 s (talk more), combat ones throttled harder; music ducks a little; small fading captions ----
    private bBusy = false; private bCd = 6; private bIdleT = 0; private bIdleAt = 10; private bCombatCd = 0; private bLast: Record<string, number> = {}; private lowWas = false;
    banter(trig: BanterTrig, force = false): boolean {
        if (this.bBusy || this.sim.mode !== 'play' || (!force && (this.bCd > 0 || this.voGap > 0))) return false;
        const opts = BANTER.map((x, i) => i).filter((i) => BANTER[i].t === trig); if (!opts.length) return false;
        let k = opts[Math.floor(Math.random() * opts.length)]; if (opts.length > 1 && k === this.bLast[trig]) k = opts[(opts.indexOf(k) + 1) % opts.length]; this.bLast[trig] = k;
        const ex = BANTER[k], names = ex.l.map(([sp, i]) => `vo_${sp === 'g' ? 'cg' : 'cs'}_${i}`);
        this.bBusy = true; this.voGap = 99; audio.voDuck = 0.7;
        const t0 = performance.now();
        void Promise.all(names.map((n) => audio.load(n))).then((bufs) => {
            if (performance.now() - t0 > 2500 || bufs.some((b) => !b)) { this.endBanter(); return; }   // slow network: skip rather than talk late
            let j = 0;
            const next = () => {
                if (j >= names.length || this.sim.mode !== 'play') { this.endBanter(); return; }
                const [sp, , text] = ex.l[j]; audio.play(names[j], { gain: 0.85 * VO_MIX, prio: 4 }); caption(sp === 'g' ? 'Ghost' : 'Shadow', text);
                const dur = bufs[j]!.duration; j++; setTimeout(next, (dur + 0.3) * 1000);
            };
            next();
        });
        return true;
    }
    private endBanter() { this.bBusy = false; this.voGap = 1.5; this.bCd = 9 + Math.random() * 7;   /* Shifat 7:26 PM "they should talk more with each other": was 30-60 s */ this.voCd.ghost = Math.max(this.voCd.ghost, 6); this.voCd.shadow = Math.max(this.voCd.shadow, 6); audio.voDuck = 1; }
    private zoneWas: BanterTrig | null = null; private zoneAt: Record<string, number> = {};
    private banterTick(dt: number, day: number, near: number) {
        const s = this.sim; this.bCd = Math.max(0, this.bCd - dt); this.bCombatCd = Math.max(0, this.bCombatCd - dt);
        { // arrival exchanges (Shifat Oct 31 7:10 PM): the first moment the heroes reach Ice Isle, the pirate ship, the jungle island or Farm Isle they talk about it
            const ax = s.pos[0], az = s.pos[2];
            const zone: BanterTrig | null = isPirate(ax, az, 1.0) ? 'ship' : isFarm(ax, az, 1.0) ? 'farm' : isIce(ax, az, 1.0) ? 'ice' : isIsland(ax, az, 1.0) ? 'arrive_island' : null;
            if (zone !== this.zoneWas && !this.bBusy) {
                this.zoneWas = zone; const now = performance.now() / 1000;
                if (zone && now - (this.zoneAt[zone] ?? -1e9) > 150) { this.zoneAt[zone] = now; setTimeout(() => this.banter(zone, true), 900); }
            }
        }
        if (this.bBusy) { this.voGap = Math.max(this.voGap, 0.5); return; }
        const low = s.hp > 0 && s.hp < 30; if (low && !this.lowWas) this.banter('low', true); this.lowWas = low;
        if (this.combatT > 0 && near > 0) { this.bIdleT = 0; if (this.bCombatCd <= 0 && this.bCd <= 0 && Math.random() < dt * 0.3) { if (this.banter('combat')) this.bCombatCd = 16; } return; }
        this.bIdleT += dt; if (this.bIdleT < this.bIdleAt) return;
        this.bIdleT = 0; this.bIdleAt = 8 + Math.random() * 7;
        const x = s.pos[0], z = s.pos[2], ctx: BanterTrig[] = [];
        if (s.swim) ctx.push('swim'); if (isIsland(x, z, 1.05)) ctx.push('island'); if (inHarbor(x, z, 10)) ctx.push('harbor'); if (bridgeDeckY(x, z) !== null) ctx.push('bridge'); if (day < 0.3) ctx.push('night');
        this.banter(ctx.length && Math.random() < 0.7 ? ctx[Math.floor(Math.random() * ctx.length)] : 'idle');
    }
    debug: Record<string, number | string> = {};
    constructor(private sim: Sim) { }

    // ---- hooks wired from App's sim events (positionless) ----
    onJump() { audio.play('jump', { gain: 0.35, rate: 0.9 + Math.random() * 0.2, prio: 1 }); }
    onLand(hard: boolean) {
        const s = this.sim; if (s.t - this.lastLand < 0.15) return; this.lastLand = s.t;
        audio.play(hard ? 'land' : 'land_soft', { gain: hard ? 0.85 : 0.45, rate: 0.95 + Math.random() * 0.1, prio: 3 });
        if (hard && !(this.sim as any).slam) thump(0.35, { rate: 1.08 });   // hard landing: a little body under it (the Slam has its own)
        this.step(1.0);
    }
    onHit() {   // real recorded hit per move (see HIT_SET)
        const m = (this.sim as any).mv, H = m ? HIT_SET[m.id] : undefined;
        const sa = this.sim as any, slam = sa.slam && sa.slam.ph >= 4, shock = (sa.snareT || 0) > 0;
        if (!H) playHit('cross', slam ? 0.66 : shock ? 0.6 : 0.5);   // web-shot hits (lighter than a jab now: shot < jab in the weight order), slam/Shock (their low end comes from onBlast / the zap)
        else { playHit(H[0], H[1]); if (H[2] > 0) audio.play('attach', { gain: H[2], rate: 1.05 + Math.random() * 0.1, prio: 2 }); thump(THUMP[m.id] ?? 0); }
        this.combatT = 6;
    }
    onBlast(x: number, y: number, z: number) {
        const sa = this.sim as any;
        if (sa.slam && sa.slam.ph >= 4) { playHit('dunk', 0.82, { pos: [x, y, z], rate: 0.86 }); thump(0.7, { rate: 0.82 }); thump(0.3, { rate: 0.62, delay: 0.035 }); }   // Slam: the heaviest blow -> deepest, doubled sub (a 35 ms flam, felt more than heard)
        else playHit('dunk', 0.66, { pos: [x, y, z], rate: 0.95, prio: 2 });   // web-shot detonation / bot-into-wall: was 0.9 on EVERY shot, louder than a jab; now under the melee hits
        this.combatT = 6;
    }
    onHurt() { audio.play('hurt', { gain: 0.66 + Math.random() * 0.08, rate: 0.93 + Math.random() * 0.12, prio: 4 }); this.combatT = 6; if (Math.random() < 0.55 && this.banter('hurt')) return; if (Math.random() < 0.45) this.vo('shadow', [7, 8, 12], { cd: 5 }); }
    onOrb() { audio.play('orb', { gain: 0.45, rate: 1 + Math.min(this.sim.score, 20) * 0.012, prio: 2 }); }
    onFall() { audio.play('whoosh', { gain: 0.6, rate: 0.55, prio: 3 }); }
    onStart() { audio.playSoon('start_hit', { gain: 0.8, prio: 5 }); }

    // ---- hooks for the coming Iron Man-style weapons (call from the enemy/boss code when it lands) ----
    repulsorCharge(pos: Vec3) { return audio.play('repulsor_charge', { gain: 0.6, pos, prio: 3, ref: 6 }); }
    repulsorBolt(pos: Vec3) { audio.play('repulsor_bolt', { gain: 0.8, pos, prio: 3, ref: 8 }); this.combatT = 6; }
    repulsorImpact(pos: Vec3) { playHit('kick', 0.7, { pos }); }
    unibeamCharge(pos: Vec3) { return audio.play('unibeam_charge', { gain: 0.9, pos, prio: 4, ref: 14, maxDist: 220 }); }
    private beamOn = false; private beamPos: Vec3 | null = null;
    unibeamStart(pos: Vec3) { audio.play('unibeam_fire', { gain: 1, pos, prio: 4, ref: 14, maxDist: 220 }); this.beamOn = true; this.beamPos = pos; this.combatT = 8; }
    unibeamMove(pos: Vec3) { this.beamPos = pos; }
    unibeamStop() { this.beamOn = false; }

    private step(gain = 0.5) {
        const s = this.sim, ground = (s as any).groundY ?? s.pos[1];
        const surf = surfaceAt(s.pos[0], s.pos[2], s.pos[1], typeof ground === 'number' ? ground : s.pos[1]);
        const takes = STEP_SPRITE[surf]; this.stepI = (this.stepI + 1 + Math.floor(Math.random() * 3)) % takes.length;
        audio.play('steps', { offset: takes[this.stepI], dur: 0.3, gain: gain * (surf === 'concrete' ? 0.55 : 0.7), rate: 0.92 + Math.random() * 0.16, prio: 1 });
        this.debug.surface = surf;
    }

    tick(dt: number) {
        const s = this.sim, p = this.p, sa = s as any; if (!audio.ctx) return;
        dt = Math.min(dt, 0.1);
        audio.updateListener(s.pos[0], s.pos[1], s.pos[2], s.yaw);
        const play = s.mode === 'play';
        audio.wantTitle = !play; audio.wantScore = play;   // title theme on the title and game-over screens, adaptive score in play
        const sp = Math.hypot(s.vel[0], s.vel[1], s.vel[2]), hs = Math.hypot(s.vel[0], s.vel[2]);
        const x = s.pos[0], y = s.pos[1], z = s.pos[2];
        if (p.mode !== s.mode && s.mode === 'play') this.onStart();
        // in-game sound-on tick (HUD mute chip): only in play, only when turning sound back ON (a muted tick would be inaudible anyway); title untouched
        if (play && p.muted && !audio.muted) audio.play('ui_tick', { gain: 0.35, when: audio.ctx.currentTime + 0.12, prio: 5 });
        p.muted = audio.muted;

        // ---------- zone weights ----------
        const inBay = z < WATER_Z + 6, inLake = isLakeWater(x, z), surfY = inLake ? waterSurfaceAt(x, z, s.t) : WATER_Y;
        const under = play && (s.dive || ((inBay || inLake) && y < surfY - 0.9)) ? 1 : 0;
        const alt = clamp01((y - 2) / 70);   // height above the streets
        const pondD = Math.hypot(x - PARK_POND.cx, z - PARK_POND.cz);
        const parkIn = Math.min(x - PARK.x0, PARK.x1 - x, z - PARK.z0, PARK.z1 - z);   // >0 inside the park
        const parkW = sstep(-25, 15, parkIn);
        const oceanW = sstep(110, 4, z - WATER_Z);
        const cityW = clamp01((isLegacyCityCore(x, z) ? 1 : 0.8) * (1 - parkW * 0.8) * (1 - oceanW * 0.6));
        const day = daylight();
        const lakeW = sstep(55, 13, pondD);
        const groveW = sstep(48, 20, pondD) * (pondD > 9 ? 1 : 0.5);   // cherry blossom ring + beach palms around the lake
        const lowW = 1 - alt * 0.85;
        const harborD = Math.hypot(Math.max(HARBOR.x0 - x, 0, x - HARBOR.x1), Math.max(HARBOR.z0 - z, 0, z - HARBOR.z1));
        const fallsW = sstep(75, 12, Math.hypot(x - FALLS.x, z - FALLS.z)), isleW = sstep(150, 75, Math.hypot(x - ISLAND.cx, z - ISLAND.cz));   // South Sea 2b: waterfall roar + jungle birds/crickets on the island

        // ---------- beds ----------
        if (true) {
            const menu = !play;
            audio.bed('city', menu ? 0.5 : cityW * (1 - alt * 0.45) * (1 - under), 0, 1);
            const windK = clamp01(alt * 0.7 + clamp01(sp / 45) * 0.8);
            audio.bed('wind', menu ? 0.15 : (0.12 + 0.88 * windK) * (1 - under) * (s.swim ? 0.2 : 1), 0, 0.75 + windK * 0.65);
            const op = audio.spatial([x, 0, WATER_Z - 4]);
            audio.bed('waves', oceanW * lowW * (1 - under), op.pan * 0.7, 1);
            const lp = audio.spatial([PARK_POND.cx, y, PARK_POND.cz]);
            if (fallsW > lakeW) { const fp = audio.spatial([FALLS.x, y, FALLS.z]); audio.bed('lake', fallsW * (1 - under * 0.5), fp.pan * 0.6, 1.45); }
            else audio.bed('lake', lakeW * lowW * (1 - under), pondD > 16 ? lp.pan * 0.8 : 0, 1);
            audio.bed('birds', Math.max(parkW * 0.75, groveW, isleW * 0.8) * day * lowW * (1 - under) * (menu ? 0 : 1), 0, 1);
            audio.bed('crickets', Math.max(parkW, groveW, isleW) * (1 - day) * lowW * (1 - under), 0, 1);
            audio.bed('leaves', Math.max(groveW, isleW * 0.6) * lowW * (0.55 + 0.45 * clamp01(sp / 30)) * (1 - under), 0, 1);
            const harborW = sstep(70, 10, harborD) * (1 - day) * (1 - under) * (menu ? 0 : 1);   // Neon Harbor night: neon buzz + pier laps + far city hum
            audio.bed('harbor', harborW * (1 - alt * 0.6), 0, 1);
            audio.bed('underwater', under, 0, 1);
            audio.bed('rain', menu ? 0 : WEATHER.rain.value * 0.26 * (1 - under) * (s.swim ? 0.6 : 1), 0, 1);   // subtle rain bed (Shifat 6:31 PM 'not heavy'), follows the weather cycle
            // swinging: continuous air rush whose pitch follows speed, plus a doppler-ish lift while accelerating
            const acc = (sp - p.speed) / Math.max(dt, 1e-3); this.swingVol += ((s.web ? clamp01((sp - 6) / 30) : 0) - this.swingVol) * Math.min(1, dt * 6);
            const dop = Math.max(-0.12, Math.min(0.15, acc * 0.006));
            audio.bed('swingair', this.swingVol, 0, 0.7 + clamp01(sp / 50) * 0.75 + dop);
            audio.bed('glide', s.glideOn && play ? 0.4 + 0.6 * clamp01(sp / 25) : 0, 0, 0.85 + clamp01(sp / 30) * 0.4);
            audio.bed('beam', this.beamOn ? (this.beamPos ? audio.spatial(this.beamPos, 14, 220).gain : 1) : 0, this.beamPos ? audio.spatial(this.beamPos).pan : 0, 1);
        }
        audio.setUnderwater(under);
        // lazy-load the zone beds only when the hero is getting close to them
        if (oceanW > 0.01) audio.preload(['waves', 'splash']); if (harborD < 90) audio.preload(['harbor']); if (lakeW > 0.01 || parkW > 0.01 || fallsW > 0.01 || isleW > 0.01) audio.preload(['lake', 'birds', 'leaves', 'crickets', 'splash', 'underwater']);
        if (play && s.enemies.some((e) => e.boss && e.down <= 0 && Math.hypot(e.x - x, e.z - z) < 120)) audio.preload(['boss_down']);

        if (play) {
            // ---------- hero edges ----------
            if (s.web && !p.web) { audio.play('thwip', { gain: 0.6, rate: 0.85 + Math.random() * 0.15, prio: 3 }); audio.play('attach', { gain: 0.35, when: audio.ctx.currentTime + 0.1, pos: s.anchor as Vec3, prio: 1, ref: 20 }); audio.play('whoosh', { gain: 0.35 + 0.3 * clamp01(sp / 40), rate: 0.85 + clamp01(sp / 50) * 0.5, prio: 2 }); }
            if (!s.web && p.web && !s.ground) audio.play('whoosh', { gain: 0.25 + 0.35 * clamp01(sp / 40), rate: 1.0 + clamp01(sp / 50) * 0.5, prio: 2 });
            if (s.spring > 0.3 && p.spring <= 0.05) audio.play('spring', { gain: 0.6, rate: 0.95 + Math.random() * 0.1, prio: 3 });
            if (s.shotT > p.shotT + 0.1) { audio.play('thwip', { gain: 0.55, rate: 1.2 + Math.random() * 0.15, prio: 3 }); this.combatT = 6; }
            if (s.atkT > p.atkT + 0.1 && s.shotT <= p.shotT + 0.1) { const W = SWISH[sa.mv?.id] ?? [0.4, 1]; audio.play('swish', { gain: W[0] * (0.9 + Math.random() * 0.2), rate: W[1] * (0.92 + Math.random() * 0.16), prio: 2 }); }
            // Slam: holding K past HOLD_MS (ph 0 = charging) now has a rising charge swell; it cuts the moment the leap starts
            const slPh = sa.slam ? sa.slam.ph : -1;
            if (slPh === 0 && p.slamPh !== 0) { audio.stopVoice(this.slamV, 0.05); this.slamV = audio.play('slam_charge', { gain: 0.55, rate: 0.97 + Math.random() * 0.06, prio: 4 }); this.combatT = 8; }
            if (slPh !== 0 && p.slamPh === 0) { audio.stopVoice(this.slamV, 0.06); this.slamV = null; }
            if (slPh === 4 && p.slamPh !== 4 && p.slamPh >= 0) audio.play('whoosh', { gain: 0.45, rate: 0.6 + Math.random() * 0.08, prio: 3 });   // the dive down onto the ground
            p.slamPh = slPh;
            const snT = sa.snareT || 0;
            if (snT > 0 && !(p.snareT > 0)) { this.chargeV = audio.play('shock_charge', { gain: 0.6, rate: 0.97 + Math.random() * 0.06, prio: 4 }); this.combatT = 8; }
            if (p.snareT > SNARE.IMPACT && snT <= SNARE.IMPACT) { audio.stopVoice(this.chargeV, 0.05); this.chargeV = null; audio.play('zap', { gain: 0.8 + Math.random() * 0.08, rate: 0.95 + Math.random() * 0.1, prio: 5 }); thump(0.8, { rate: 0.9 }); }   // Shock discharge: zap + sub thump (matches the hitFeel kick)
            if (s.swim !== p.swim || (s.dive && !p.dive)) audio.play('splash', { gain: s.swim ? 0.7 : 0.45, rate: 0.9 + Math.random() * 0.2, prio: 3 });
            if (s.glideOn && !p.glide) audio.play('whoosh', { gain: 0.25, rate: 0.7, prio: 1 });
            // footsteps: one per stride of travelled ground distance (stride grows with speed)
            if (s.ground && !s.swim && !s.web && hs > 1.2) { this.stepAcc += hs * dt; const stride = 1.15 + Math.min(hs, 30) * 0.055; if (this.stepAcc > stride) { this.stepAcc = 0; this.step(0.3 + clamp01(hs / 20) * 0.35); } } else this.stepAcc = 0.8;

            // ---------- enemies: hits and KOs, positional ----------
            const E = s.enemies; let near = 0;
            for (let i = 0; i < E.length; i++) {
                const e = E[i], ph = p.hit[i] ?? 0, pd = p.down[i] ?? 0, pos: Vec3 = [e.x, e.y + enemyBodyOffset(e), e.z];
                if (e.down <= 0 && Math.hypot(e.x - x, e.z - z) < 30) near++;
                if (e.hit > ph + 0.25 && e.down <= 0) playHit(e.boss ? 'boss_metal' : 'metal', e.boss ? 0.7 : 0.34, { pos, prio: 2, ref: e.boss ? 14 : 8 });   // real metal clank, a touch under the flesh hit (robots)
                if (e.hit > ph + 0.25 && e.down <= 0 && Math.random() < (e.boss ? 0.35 : 0.2)) this.vo(e.boss ? 'boss' : 'robot', e.boss ? [5] : [4], { pos, cd: 4 });
                if (e.down > 0 && !(pd > 0)) { this.vo(e.boss ? 'boss' : 'robot', e.boss ? [6] : [6], { pos, force: e.boss, cd: 5 }); if (e.boss) setTimeout(() => this.banter('boss', true), 3200); else if (Math.random() < 0.35) setTimeout(() => this.banter('kill'), 1300); else if (!e.boss && Math.random() < 0.5) setTimeout(() => this.vo('shadow', [0, 2, 9, 14], { cd: 6 }), 1300); else if (!e.boss && Math.random() < 0.3) setTimeout(() => this.vo('ghost', undefined, { cd: 12 }), 1500); }
                if (e.down > 0 && !(pd > 0)) audio.play(e.boss ? 'boss_down' : 'enemy_down', { gain: e.boss ? 1 : 0.75, rate: 0.92 + Math.random() * 0.16, pos, prio: e.boss ? 5 : 3, ref: e.boss ? 20 : 10, maxDist: 200 });
                p.hit[i] = e.hit; p.down[i] = e.down;
            }
            // Ghost (companion) runs on a silent event set, so her landed blows only had the robot's metal clank. Now each landed hit of hers
            // plays her move's recorded hit (positional, a touch under Shadow's so the player's own blows stay on top) + the same thump layer.
            const cs = getCompanionSim() as any;
            if (cs && cs !== s) {
                const cc = cs.combo || 0;
                if (cc > p.cc) { const cm = cs.mv, H = cm ? HIT_SET[cm.id] : undefined, cpos: Vec3 = [cs.pos[0], cs.pos[1] + 1, cs.pos[2]];
                    playHit(H ? H[0] : 'cross', (H ? H[1] : 0.5) * 0.72, { pos: cpos, prio: 2, ref: 10, rate: 1.04 });
                    const tg = cm ? (THUMP[cm.id] ?? 0) : (cs.slam && cs.slam.ph >= 4 ? 0.8 : (cs.snareT || 0) > 0 ? 0.6 : 0); thump(tg * 0.6, { pos: cpos, rate: 1.05 }); }
                p.cc = cc;
                const csn = cs.snareT || 0;   // her pink Shock discharge was silent too
                if (p.csn > SNARE.IMPACT && csn <= SNARE.IMPACT) { const cpos: Vec3 = [cs.pos[0], cs.pos[1] + 1, cs.pos[2]]; audio.play('zap', { gain: 0.6 + Math.random() * 0.08, rate: 1.06 + Math.random() * 0.08, pos: cpos, ref: 10, prio: 3 }); thump(0.45, { pos: cpos, rate: 1.0 }); }
                p.csn = csn;
            } else { p.cc = 0; p.csn = 0; }

            // ---------- character voices ----------
            this.voGap = Math.max(0, this.voGap - dt); for (const k in this.voCd) this.voCd[k] = Math.max(0, this.voCd[k] - dt);
            if (s.web && !p.web && Math.random() < 0.18) this.vo('shadow', [0, 1, 2, 4, 10, 15], { cd: 9 });
            if (((!s.web && p.web && p.speed > 30) || (s.dive && !p.dive)) && Math.random() < 0.5) this.banter('swing');   // big swing release or a dive: she teases, he shows off
            for (let i = 0; i < E.length; i++) {
                const e = E[i], pos: Vec3 = [e.x, e.y + enemyBodyOffset(e), e.z], d = Math.hypot(e.x - x, e.z - z);
                if (e.boss) {
                    const ag = !!(e as any).aggro;
                    if (ag && !(e as any)._voAg && e.down <= 0) this.vo('boss', [0, 4], { pos, gain: 1, cd: 10, force: true });
                    (e as any)._voAg = ag; this.bossAggro = ag || this.bossAggro && E.some((q) => q.boss && (q as any).aggro);   // per boss (Neon Harbor adds a mini-boss)
                    if (e.down > 0 && (p.down[i] ?? 0) <= 0) {}
                    if (ag && e.down <= 0 && d < 70) this.vo('boss', [1, 2, 3], { pos, gain: 1, cd: 11 });
                } else if (e.down <= 0 && d < 22) this.vo('robot', [0, 1, 2, 3, 5, 7], { pos, cd: 7 });
            }
            if (near === 0 && !s.swim && s.pos[1] < 26 && sp > 9 && PED_VOICE.d < 20 && performance.now() - PED_VOICE.t < 500) this.vo('ped', undefined, { pos: [PED_VOICE.x, PED_VOICE.y + 1.5, PED_VOICE.z], gain: 0.8, cd: 8 });
            if (this.idleT > 12 && this.idleT - dt <= 12) this.vo('shadow', [3, 5, 11, 13], { cd: 20 });

            // ---------- adaptive score ----------
            this.combatT = Math.max(0, this.combatT - dt); if (near > 0 && (s.atkT > 0 || s.hurtT > 0)) this.combatT = Math.max(this.combatT, 4);
            const swingI = s.web || s.glideOn ? 0.55 + 0.45 * clamp01(sp / 40) : clamp01((sp - 12) / 30) * 0.6;
            const target = Math.max(swingI, this.combatT > 0 ? 1 : near > 2 ? 0.45 : 0);
            this.intensity += (target - this.intensity) * Math.min(1, dt * (target > this.intensity ? 1.6 : 0.22));
            this.idleT = sp < 1.5 && !s.web ? this.idleT + dt : 0;
            audio.setMusic(this.intensity, 1 - sstep(6, 16, this.idleT));
            this.banterTick(dt, day, near);
            this.debug = { ...this.debug, zoneCity: +cityW.toFixed(2), zonePark: +parkW.toFixed(2), zoneOcean: +oceanW.toFixed(2), zoneLake: +lakeW.toFixed(2), grove: +groveW.toFixed(2), day: +day.toFixed(2), alt: +alt.toFixed(2), under, music: +this.intensity.toFixed(2) };
        }
        p.web = s.web; p.spring = s.spring; p.shotT = s.shotT; p.atkT = s.atkT; p.snareT = sa.snareT || 0; p.swim = s.swim; p.dive = s.dive; p.glide = s.glideOn; p.mode = s.mode; p.speed = sp;
        audio.tick(dt);
    }
}
