import * as THREE from 'three';
import { MOVES, enemyBodyOffset, getCompanionSim } from './sim';
import { emit, SH_GLOW, LOW, tint } from './combatFx';

/* Hit feel, camera + readability layer (Nov 3 2026, "never stop" queue: combat hit feel for BOTH heroes).
   Render-only. Reads what the sim already writes (combo count, current move, Slam / Shock state, enemy e.kb / vy / hit),
   changes nothing the sim reads: controls, input timing, hitboxes, damage, knockback and physics are untouched.
   - HIT-STOP CAP: every whole-game freeze is held to <= 60 ms (was 55 / 65 / 90 / 100 / 130 ms by move); sim.ts calls capHitStop.
   - IMPACT KICK: the old trauma^2 shake made a jab (+0.15 trauma) move the camera by ~0.03 deg, i.e. nothing. Each landed hit now
     also kicks the camera ALONG the blow (a short lurch toward the target with a pitch dip and a roll toward the striking side) on a
     damped spring (peak ~35 ms, one soft rebound, settled by ~250 ms), scaled by hit weight: shot < jab < cross < finisher < Shock < Slam.
     Plus a matching FOV pinch (-0.6 deg jab .. -2.2 deg Slam) added after the camera's FOV smoothing so it is not eaten by it.
     Ghost's hits (the companion) give the player's camera a smaller kick scaled by distance, so her blows land too.
   - KNOCKBACK TRAILS: a bot flying from a hit sheds soft glowing wisps in the striking hero's colour (Shadow purple / Ghost pink),
     so the direction and force of the knockback read at a glance. Soft additive glow sprites from the existing pool; no new draw call. */

export const HITSTOP_MAX = 0.06;
/** sim.ts: clamp a freshly set hit-stop to the cap before it is counted down */
export function capHitStop(sa: any) { if (sa.hitStop > HITSTOP_MAX && !off()) sa.hitStop = HITSTOP_MAX; }

type Kick = { t: number; w: number; dx: number; dz: number; side: number; who: number };
const kicks: Kick[] = [];
const seen = { pc: 0, cc: 0, pt: -1 };
const PURPLE = 0xa855f7;
const DBG = !!(import.meta as any).env.VITE_DBG;
/** test hook (instrumented builds only): window.__hitFeelOff = true renders the game as before this pass (no cap, kick or wisps) */
const off = () => DBG && !!(globalThis as any).__hitFeelOff;
if (DBG) (globalThis as any).__hfKicks = kicks;

/** hit weight of what the hero just landed (same ordering as the sim's own trauma numbers) */
function weightOf(sa: any): number {
    if (sa.slam && sa.slam.ph >= 4) return 0.7;
    if (sa.snareT > 0) return 0.34;
    if (sa.mv && MOVES[sa.mv.id]) return MOVES[sa.mv.id].shake;
    return 0.1;   // web shot
}
function push(w: number, dx: number, dz: number, side: number, who: number) {
    if (kicks.length >= 4) kicks.shift();
    kicks.push({ t: 0, w, dx, dz, side, who });
}
function watch(s: any, key: 'pc' | 'cc', scale: number) {
    const c = s.combo || 0, prev = seen[key];
    seen[key] = c;
    if (!(c > prev) || scale <= 0.01) return;
    const w = weightOf(s) * scale;
    let dx = Math.sin(s.ang || 0), dz = Math.cos(s.ang || 0);
    const e = (s.mv && s.mv.e) || s.shotE;
    if (e) { const ex = e.x - s.pos[0], ez = e.z - s.pos[2], d = Math.hypot(ex, ez); if (d > 0.3) { dx = ex / d; dz = ez / d; } }
    push(w, dx, dz, (s.combo & 1) ? 1 : -1, key === 'pc' ? 0 : 1);
}
/** damped spring envelope: 0 -> 1 at ~35 ms, soft rebound, ~0 by 250 ms */
function env(t: number) { return Math.sin(t * 45) * Math.exp(-t / 0.075); }

const _v = new THREE.Vector3();
let fovOut = 0;
/** Scene.tsx, right after the trauma shake: apply the impact kick to the camera. Returns nothing; read hitFeelFov() for the FOV pinch. */
export function hitFeelCamera(camera: THREE.Camera, sim: any, rawDt: number, enabled = true) {
    const dt = Math.min(0.05, Math.max(0, rawDt));
    if (sim.mode !== 'play') { kicks.length = 0; seen.pc = sim.combo || 0; fovOut = 0; return; }
    watch(sim, 'pc', 1);
    const cs = getCompanionSim() as any;
    if (cs && cs.pos) { const d = Math.hypot(cs.pos[0] - sim.pos[0], cs.pos[2] - sim.pos[2]); watch(cs, 'cc', 0.5 * Math.max(0, 1 - d / 22)); }
    let px = 0, pz = 0, pitch = 0, roll = 0, fov = 0;
    for (let i = kicks.length - 1; i >= 0; i--) {
        const k = kicks[i]; k.t += dt;
        if (k.t > 0.3) { kicks.splice(i, 1); continue; }
        const a = Math.sqrt(k.w) * env(k.t);
        px += k.dx * a * 0.2; pz += k.dz * a * 0.2;          // lurch along the blow: jab ~8 cm, Slam ~17 cm
        pitch -= a * 1.3; roll += k.side * a * 0.9;           // degrees: nod into the hit, roll toward the striking side
        fov -= a * (k.w >= 0.5 ? 2.6 : 1.6);
    }
    if (off()) { fovOut = 0; return; }
    fovOut = fov;
    if (!enabled || (px === 0 && pz === 0 && pitch === 0)) return;
    const D2R = Math.PI / 180;
    _v.set(px, 0, pz); camera.position.add(_v);
    camera.rotateX(pitch * D2R); camera.rotateZ(roll * D2R);
}
/** FOV pinch (degrees, <= 0) from the impact kicks, added after the camera's FOV smoothing */
export function hitFeelFov() { return fovOut; }

/** CombatFX.tsx, per frame: knockback wisps behind bots flying from a hit */
export function hitFeelTrails(sim: any, dt: number) {
    if (sim.mode !== 'play' || !sim.enemies || off()) return;
    const cs = getCompanionSim() as any;
    for (const e of sim.enemies as any[]) {
        if (e.down > 0 || e.boss || !(e.hit > 0)) { if (e.__hfa) e.__hfa = 0; continue; }
        const kx = e.kb ? e.kb[0] : 0, kz = e.kb ? e.kb[1] : 0, vy = e.vy || 0, sp = Math.hypot(kx, kz, Math.max(0, vy) * 0.6);
        if (sp < 5.5) continue;
        e.__hfa = (e.__hfa || 0) + dt;
        const every = LOW ? 0.05 : 0.028;
        if (e.__hfa < every) continue;
        e.__hfa = 0;
        let col = sim.fxCol ?? PURPLE;
        if (cs && cs.pos && Math.hypot(cs.pos[0] - e.x, cs.pos[2] - e.z) < Math.hypot(sim.pos[0] - e.x, sim.pos[2] - e.z)) col = cs.fxCol ?? col;
        const y = e.y + (e.ly || 0) + enemyBodyOffset(e), k = Math.min(1, (sp - 5.5) / 12);
        const ux = kx / (sp || 1), uz = kz / (sp || 1), j = () => (Math.random() - 0.5) * 0.5;
        // soft wisp left behind the body, drifting back along the path; one hotter, smaller core every other puff
        emit(SH_GLOW, e.x - ux * 0.35 + j(), y + j() * 0.8, e.z - uz * 0.35 + j(), -kx * 0.12, 0.3, -kz * 0.12, 0.22 + 0.1 * k, 0.55 + 0.35 * k, 0.15, col, 0.55 + 0.35 * k, 0, 2.5, 0.12, 2);
        if (!LOW && Math.random() < 0.5) emit(SH_GLOW, e.x - ux * 0.2, y, e.z - uz * 0.2, -kx * 0.05, 0, -kz * 0.05, 0.12, 0.3, 0.08, tint(col, 0.6), 0.8, 0, 2, 0.12, 2);
    }
}
