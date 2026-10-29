// Sound director: reads the simulation every frame (no changes to sim.ts) and turns state changes into sound.
// Ambient beds cross-fade by zone and position; hero / enemy one-shots fire on state edges; the score follows the action.
import { audio, STEP_SPRITE, type Vec3 } from './engine';
import { PARK, PARK_POND, WATER_Z, WATER_Y, isLakeWater, waterSurfaceAt, sandWeight, isLegacyCityCore, bridgeSurfaceAt, SNARE, enemyBodyOffset, type Sim } from '../sim';

const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
// mirror of Scene's day/night clock (DN_DUR 300 s), so birds sing by day and crickets take over at night without touching Scene.tsx
const T0 = typeof performance !== 'undefined' ? performance.now() : 0;
function daylight() { const ph = Math.asin(0.22 / 0.95) + (((performance.now() - T0) / 1000) / 300) * Math.PI * 2; const x = -0.5, y = Math.sin(ph) * 0.95, z = Math.cos(ph) * 0.85 + 0.3; const sy = y / Math.hypot(x, y, z); return sstep(-0.12, 0.3, sy); }

type Surface = 'concrete' | 'grass' | 'sand';
export function surfaceAt(x: number, z: number, y: number, groundY: number): Surface {
    if (y > groundY + 2.5) return 'concrete';   // rooftops
    if (bridgeSurfaceAt(x, z) !== null) return 'concrete';   // (wooden deck reads closest to the hard set)
    if (sandWeight(x, z) > 0.5) return 'sand';
    if (x > PARK.x0 && x < PARK.x1 && z > PARK.z0 && z < PARK.z1) return 'grass';
    return 'concrete';
}

interface Prev { web: boolean; spring: number; shotT: number; atkT: number; snareT: number; swim: boolean; dive: boolean; glide: boolean; mode: string; hit: number[]; down: number[]; speed: number }

export class SoundDirector {
    private p: Prev = { web: false, spring: 0, shotT: 0, atkT: 0, snareT: 0, swim: false, dive: false, glide: false, mode: 'menu', hit: [], down: [], speed: 0 };
    private stepAcc = 0; private stepI = 0;
    private intensity = 0; private idleT = 0; private combatT = 0; private swingVol = 0; private lastLand = -9;
    private glideV: any = null; private chargeV: any = null;
    debug: Record<string, number | string> = {};
    constructor(private sim: Sim) { }

    // ---- hooks wired from App's sim events (positionless) ----
    onJump() { audio.play('jump', { gain: 0.35, rate: 0.9 + Math.random() * 0.2, prio: 1 }); }
    onLand(hard: boolean) {
        const s = this.sim; if (s.t - this.lastLand < 0.15) return; this.lastLand = s.t;
        audio.play(hard ? 'land' : 'land_soft', { gain: hard ? 0.85 : 0.45, rate: 0.95 + Math.random() * 0.1, prio: 3 });
        this.step(1.0);
    }
    onHit() { audio.play('punch', { gain: 0.7, rate: 0.85 + Math.random() * 0.3, prio: 3 }); this.combatT = 6; }
    onBlast(x: number, y: number, z: number) { audio.play('punch_heavy', { gain: 0.9, rate: 0.9 + Math.random() * 0.15, pos: [x, y, z], prio: 3 }); this.combatT = 6; }
    onHurt() { audio.play('hurt', { gain: 0.7, prio: 4 }); this.combatT = 6; }
    onOrb() { audio.play('orb', { gain: 0.45, rate: 1 + Math.min(this.sim.score, 20) * 0.012, prio: 2 }); }
    onFall() { audio.play('whoosh', { gain: 0.6, rate: 0.55, prio: 3 }); }
    onStart() { audio.playSoon('start_hit', { gain: 0.8, prio: 5 }); }

    // ---- hooks for the coming Iron Man-style weapons (call from the enemy/boss code when it lands) ----
    repulsorCharge(pos: Vec3) { return audio.play('repulsor_charge', { gain: 0.6, pos, prio: 3, ref: 6 }); }
    repulsorBolt(pos: Vec3) { audio.play('repulsor_bolt', { gain: 0.8, pos, prio: 3, ref: 8 }); this.combatT = 6; }
    repulsorImpact(pos: Vec3) { audio.play('punch_heavy', { gain: 0.7, pos, prio: 3 }); }
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

        // ---------- beds ----------
        if (true) {
            const menu = !play;
            audio.bed('city', menu ? 0.5 : cityW * (1 - alt * 0.45) * (1 - under), 0, 1);
            const windK = clamp01(alt * 0.7 + clamp01(sp / 45) * 0.8);
            audio.bed('wind', menu ? 0.15 : (0.12 + 0.88 * windK) * (1 - under) * (s.swim ? 0.2 : 1), 0, 0.75 + windK * 0.65);
            const op = audio.spatial([x, 0, WATER_Z - 4]);
            audio.bed('waves', oceanW * lowW * (1 - under), op.pan * 0.7, 1);
            const lp = audio.spatial([PARK_POND.cx, y, PARK_POND.cz]);
            audio.bed('lake', lakeW * lowW * (1 - under), pondD > 16 ? lp.pan * 0.8 : 0, 1);
            audio.bed('birds', Math.max(parkW * 0.75, groveW) * day * lowW * (1 - under) * (menu ? 0 : 1), 0, 1);
            audio.bed('crickets', Math.max(parkW, groveW) * (1 - day) * lowW * (1 - under), 0, 1);
            audio.bed('leaves', groveW * lowW * (0.55 + 0.45 * clamp01(sp / 30)) * (1 - under), 0, 1);
            audio.bed('underwater', under, 0, 1);
            // swinging: continuous air rush whose pitch follows speed, plus a doppler-ish lift while accelerating
            const acc = (sp - p.speed) / Math.max(dt, 1e-3); this.swingVol += ((s.web ? clamp01((sp - 6) / 30) : 0) - this.swingVol) * Math.min(1, dt * 6);
            const dop = Math.max(-0.12, Math.min(0.15, acc * 0.006));
            audio.bed('swingair', this.swingVol, 0, 0.7 + clamp01(sp / 50) * 0.75 + dop);
            audio.bed('glide', s.glideOn && play ? 0.4 + 0.6 * clamp01(sp / 25) : 0, 0, 0.85 + clamp01(sp / 30) * 0.4);
            audio.bed('beam', this.beamOn ? (this.beamPos ? audio.spatial(this.beamPos, 14, 220).gain : 1) : 0, this.beamPos ? audio.spatial(this.beamPos).pan : 0, 1);
        }
        audio.setUnderwater(under);
        // lazy-load the zone beds only when the hero is getting close to them
        if (oceanW > 0.01) audio.preload(['waves', 'splash']); if (lakeW > 0.01 || parkW > 0.01) audio.preload(['lake', 'birds', 'leaves', 'crickets', 'splash', 'underwater']);
        if (play && s.enemies.some((e) => e.boss && e.down <= 0 && Math.hypot(e.x - x, e.z - z) < 120)) audio.preload(['boss_hit', 'boss_down']);

        if (play) {
            // ---------- hero edges ----------
            if (s.web && !p.web) { audio.play('thwip', { gain: 0.6, rate: 0.85 + Math.random() * 0.15, prio: 3 }); audio.play('attach', { gain: 0.35, when: audio.ctx.currentTime + 0.1, pos: s.anchor as Vec3, prio: 1, ref: 20 }); audio.play('whoosh', { gain: 0.35 + 0.3 * clamp01(sp / 40), rate: 0.85 + clamp01(sp / 50) * 0.5, prio: 2 }); }
            if (!s.web && p.web && !s.ground) audio.play('whoosh', { gain: 0.25 + 0.35 * clamp01(sp / 40), rate: 1.0 + clamp01(sp / 50) * 0.5, prio: 2 });
            if (s.spring > 0.3 && p.spring <= 0.05) audio.play('spring', { gain: 0.6, rate: 0.95 + Math.random() * 0.1, prio: 3 });
            if (s.shotT > p.shotT + 0.1) { audio.play('thwip', { gain: 0.55, rate: 1.2 + Math.random() * 0.15, prio: 3 }); this.combatT = 6; }
            if (s.atkT > p.atkT + 0.1 && s.shotT <= p.shotT + 0.1) audio.play('swish', { gain: 0.4, rate: 0.9 + Math.random() * 0.25, prio: 2 });
            const snT = sa.snareT || 0;
            if (snT > 0 && !(p.snareT > 0)) { this.chargeV = audio.play('shock_charge', { gain: 0.6, prio: 4 }); this.combatT = 8; }
            if (p.snareT > SNARE.IMPACT && snT <= SNARE.IMPACT) { audio.stopVoice(this.chargeV, 0.05); this.chargeV = null; audio.play('zap', { gain: 0.85, prio: 5 }); }
            if (s.swim !== p.swim || (s.dive && !p.dive)) audio.play('splash', { gain: s.swim ? 0.7 : 0.45, rate: 0.9 + Math.random() * 0.2, prio: 3 });
            if (s.glideOn && !p.glide) audio.play('whoosh', { gain: 0.25, rate: 0.7, prio: 1 });
            // footsteps: one per stride of travelled ground distance (stride grows with speed)
            if (s.ground && !s.swim && !s.web && hs > 1.2) { this.stepAcc += hs * dt; const stride = 1.15 + Math.min(hs, 30) * 0.055; if (this.stepAcc > stride) { this.stepAcc = 0; this.step(0.3 + clamp01(hs / 20) * 0.35); } } else this.stepAcc = 0.8;

            // ---------- enemies: hits and KOs, positional ----------
            const E = s.enemies; let near = 0;
            for (let i = 0; i < E.length; i++) {
                const e = E[i], ph = p.hit[i] ?? 0, pd = p.down[i] ?? 0, pos: Vec3 = [e.x, e.y + enemyBodyOffset(e), e.z];
                if (e.down <= 0 && Math.hypot(e.x - x, e.z - z) < 30) near++;
                if (e.hit > ph + 0.25 && e.down <= 0) audio.play(e.boss ? 'boss_hit' : 'metal', { gain: e.boss ? 0.9 : 0.55, rate: 0.9 + Math.random() * 0.2, pos, prio: 2, ref: e.boss ? 14 : 8 });
                if (e.down > 0 && !(pd > 0)) audio.play(e.boss ? 'boss_down' : 'enemy_down', { gain: e.boss ? 1 : 0.75, rate: 0.92 + Math.random() * 0.16, pos, prio: e.boss ? 5 : 3, ref: e.boss ? 20 : 10, maxDist: 200 });
                p.hit[i] = e.hit; p.down[i] = e.down;
            }

            // ---------- adaptive score ----------
            this.combatT = Math.max(0, this.combatT - dt); if (near > 0 && (s.atkT > 0 || s.hurtT > 0)) this.combatT = Math.max(this.combatT, 4);
            const swingI = s.web || s.glideOn ? 0.55 + 0.45 * clamp01(sp / 40) : clamp01((sp - 12) / 30) * 0.6;
            const target = Math.max(swingI, this.combatT > 0 ? 1 : near > 2 ? 0.45 : 0);
            this.intensity += (target - this.intensity) * Math.min(1, dt * (target > this.intensity ? 1.6 : 0.22));
            this.idleT = sp < 1.5 && !s.web ? this.idleT + dt : 0;
            audio.setMusic(this.intensity, 1 - sstep(6, 16, this.idleT));
            this.debug = { ...this.debug, zoneCity: +cityW.toFixed(2), zonePark: +parkW.toFixed(2), zoneOcean: +oceanW.toFixed(2), zoneLake: +lakeW.toFixed(2), grove: +groveW.toFixed(2), day: +day.toFixed(2), alt: +alt.toFixed(2), under, music: +this.intensity.toFixed(2) };
        }
        p.web = s.web; p.spring = s.spring; p.shotT = s.shotT; p.atkT = s.atkT; p.snareT = sa.snareT || 0; p.swim = s.swim; p.dive = s.dive; p.glide = s.glideOn; p.mode = s.mode; p.speed = sp;
        audio.tick(dt);
    }
}
