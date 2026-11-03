import * as THREE from 'three';
import { getCompanionSim, enemyBodyOffset } from './sim';
import { emit, SH_GLOW, LOW, tint } from './combatFx';

/* Enemy hit reactions (Nov 2 combat-feel pass, reworked Nov 3 "never stop" queue: make the struck bot READ the hit). Render-only:
   reads e.hit / e.kb / hitDir that the sim already writes and the striking hero's colour; changes nothing the sim reads
   (no control, input timing, hitbox, damage, knockback, stun or AI change).
   Nov 2 pass: flinch away from the blow on a spring, squash jolt, hit-stop shake, white pop cooling to the hero's colour. But its size came
   from the stun value, so a web-shot (stun 0.5) rocked the bot harder than a cross (0.32), jab and cross were identical, and nothing
   staggered. Now every reaction is scaled by the WEIGHT of the blow that landed, read from the stun value the sim set + its hitDir:
     shot .25 < jab .38 < yank .45 < cross .5 < launcher .62 < finisher .72 < dunk .78 < Shock .86 < Slam 1
   - FLASH: white-hot pop (brighter and longer the heavier the blow), cooling into a soft glow of the striking hero's colour
     (Shadow purple 0xa855f7 / Ghost pink 0xff1a96) for the stun.
   - FLINCH: the bot's top snaps away from the blow, ~0.22 rad for a shot up to ~0.72 rad for Slam, on an under-damped spring; a squash jolt
     that springs back (deeper for heavy blows).
   - STAGGER (finisher, launcher, dunk, Shock, Slam): the knees buckle (a dip that recovers), the body twists off the blow and rocks
     side to side a few times before it settles, so a heavy hit reads even from behind Shadow's shoulder.
   - SHOCK: an electric shiver + hero-colour flicker while the stun lasts.
   - HALO: heavy blows add one soft hero-colour glow puff on the bot (one additive sprite from the existing pool, no new draw call), which
     spills past Shadow's silhouette when he is between the camera and the bot.
   Bosses get the same read at a fraction: a small tilt away from the blow and a softer flash (bossReact). */
type HR = { h: number; t: number; pt: number; ux: number; uz: number; a: number; av: number; s: number; sv: number; y: number; yv: number;
    w: number; kind: number; n: number; r: number; g: number; b: number; halo: number };
const _ax = new THREE.Vector3(), _c = new THREE.Color(), _q2 = new THREE.Quaternion(), _ax2 = new THREE.Vector3(), _ay = new THREE.Vector3(0, 1, 0);
const PURPLE = 0xa855f7;
const DBG = !!(import.meta as any).env.VITE_DBG;
/* blow kinds */
const K_HOLD = 0, K_SHOT = 1, K_JAB = 2, K_CROSS = 3, K_YANK = 4, K_LAUNCH = 5, K_FIN = 6, K_DUNK = 7, K_SHOCK = 8, K_SLAM = 9;
const W = [0.15, 0.25, 0.38, 0.5, 0.45, 0.62, 0.72, 0.78, 0.86, 1];
/** which blow just landed, from the stun value the sim set on this frame (sim.ts: shot 0.5, jab/cross 0.32, moves 3-6 0.55, Slam 0.6,
 *  dunk bounce 0.6 with e.slam, Shock 0.75, holds 0.2-0.3) and the hitDir the melee code writes (= move id) */
function classify(hit: number, ea: any): number {
    const near = (v: number) => Math.abs(hit - v) < 0.021;
    if (near(0.75)) return K_SHOCK;
    if (near(0.6)) return ea.slam ? K_DUNK : K_SLAM;
    if (near(0.5)) return K_SHOT;
    if (near(0.55)) { const d = ea.hitDir; return d === 4 ? K_LAUNCH : d === 5 ? K_DUNK : d === 6 ? K_YANK : K_FIN; }
    if (near(0.32)) return ea.hitDir === 2 ? K_CROSS : K_JAB;
    if (hit <= 0.31) return K_HOLD;
    return hit >= 0.7 ? K_SHOCK : hit >= 0.52 ? K_FIN : K_CROSS;
}
function spring(x: number, v: number, tgt: number, k: number, c: number, dt: number): [number, number] {
    const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
    for (let i = 0; i < n; i++) { v += (k * (tgt - x) - c * v) * h; x += v * h; }
    return [x, v];
}
/** the striking hero (whichever of Shadow / Ghost is nearer the bot) */
function striker(e: any, sim: any) {
    const cs = getCompanionSim() as any;
    if (cs && cs.pos && Math.hypot(cs.pos[0] - e.x, cs.pos[2] - e.z) < Math.hypot(sim.pos[0] - e.x, sim.pos[2] - e.z)) return cs;
    return sim;
}
function newState(): HR { return { h: 0, t: 9, pt: 9, ux: 0, uz: 1, a: 0, av: 0, s: 0, sv: 0, y: 0, yv: 0, w: 0, kind: 0, n: 0, r: 1, g: 1, b: 1, halo: 0 }; }
/** detect a new blow (stun went UP; continuous holds such as the Shock gather or a web yank do not re-trigger) and arm the reaction */
function onBlow(st: HR, e: any, sim: any, hit: number) {
    const ea = e as any, kind = classify(hit, ea), w = W[kind], hs = striker(e, sim);
    const kx = e.kb ? e.kb[0] : 0, kz = e.kb ? e.kb[1] : 0, kl = Math.hypot(kx, kz);
    if (kl > 0.5) { st.ux = kx / kl; st.uz = kz / kl; }
    else { const dx = e.x - hs.pos[0], dz = e.z - hs.pos[2], d = Math.hypot(dx, dz); if (d > 0.01) { st.ux = dx / d; st.uz = dz / d; } }
    st.kind = kind; st.w = w; st.t = 0; st.pt = 0; st.n++;
    st.av += (0.06 + 0.26 * w) / 0.036;             // flinch kick away from the blow; with the stun lean the top peaks ~0.22 rad (shot), 0.27 jab, 0.33 cross, 0.53 finisher, 0.62 Shock, 0.72 Slam
    st.sv -= 2 + 8 * w;                             // squash jolt
    if (w >= 0.6) st.yv += ((st.n & 1) ? 1 : -1) * (3 + 5 * w);   // heavy: twist off the blow
    st.halo = w >= 0.6 ? 1 : 0;
    _c.setHex(hs.fxCol ?? PURPLE); st.r = _c.r; st.g = _c.g; st.b = _c.b;
}
export type ReactOut = { q: THREE.Quaternion; sy: number; sxz: number; jx: number; jy: number; jz: number; r: number; g: number; b: number; hot: boolean };
const out: ReactOut = { q: new THREE.Quaternion(), sy: 1, sxz: 1, jx: 0, jy: 0, jz: 0, r: 1, g: 1, b: 1, hot: false };
const frozenNow = (sim: any, t: number) => { const cs = getCompanionSim() as any; return ((sim.hitStop || 0) > 0 || ((cs && cs.hitStop) || 0) > 0) && t < 0.2; };

/** per bot, per frame (Scene.tsx). hold = the old stun lean (radians); the flinch settles on a weight-scaled version of it while e.hit lasts */
export function enemyReact(e: any, sim: any, dt: number, hold: number): ReactOut {
    if (DBG && (globalThis as any).__enemyReactV1) return reactV1(e, sim, dt, hold);
    let st: HR = e.__hr; if (!st) st = e.__hr = newState();
    const hit = e.hit || 0;
    if (hit > st.h + 0.05 && e.down <= 0) onBlow(st, e, sim, hit);
    st.h = hit; st.t += dt;
    const w = st.w, heavy = w >= 0.6, frozen = frozenNow(sim, st.t);
    // weight-scaled stun lean: a shot or jab holds a little lean, a finisher / Slam a deep one (was 0.32 / 0.55 by move id alone)
    const lean = e.down > 0 || hold <= 0 ? 0 : Math.min(1, hit / 0.3) * (0.04 + 0.46 * w);
    if (!frozen && dt > 0) {
        st.pt += dt;   // the white pop holds through the freeze, then cools
        [st.a, st.av] = spring(st.a, st.av, lean, 260, 14, dt);
        [st.s, st.sv] = spring(st.s, st.sv, 0, 420, 16, dt);
        [st.y, st.yv] = spring(st.y, st.yv, 0, 110, 9, dt);
    }
    const a = Math.max(-0.95, Math.min(0.95, st.a)), s = Math.max(-0.34, Math.min(0.25, st.s));
    _ax.set(st.uz, 0, -st.ux); out.q.setFromAxisAngle(_ax, a);   // up x away: positive angle tips the top away from the blow
    // STAGGER: side-to-side rock about the blow direction (perpendicular to the flinch), and a twist about the vertical
    const pt = st.pt;
    if (heavy && pt < 1.1 && e.down <= 0) {
        const k = (w - 0.55) / 0.45, env = Math.exp(-pt / 0.32) * Math.min(1, pt / 0.06);
        const rock = Math.sin(pt * 2 * Math.PI * 2.3) * 0.2 * (0.45 + 0.55 * k) * env;
        _ax2.set(st.ux, 0, st.uz); _q2.setFromAxisAngle(_ax2, rock); out.q.premultiply(_q2);
    }
    if (Math.abs(st.y) > 1e-4) { _q2.setFromAxisAngle(_ay, Math.max(-0.7, Math.min(0.7, st.y))); out.q.multiply(_q2); }
    out.sy = 1 + s; out.sxz = 1 / Math.sqrt(out.sy);
    out.jx = 0; out.jy = 0; out.jz = 0;
    if (frozen) { const j = Math.sin(st.t * 190) * (0.025 + 0.06 * w) * Math.max(0, 1 - st.t / 0.2); out.jx = st.ux * j; out.jz = st.uz * j; }
    // knee buckle on heavy blows: dips ~6-14 cm a beat after the freeze, then recovers
    if (heavy && pt < 0.6 && e.down <= 0) out.jy = -(0.06 + 0.08 * (w - 0.6) / 0.4) * Math.sin(Math.min(1, pt / 0.5) * Math.PI) * Math.min(1, pt / 0.04 + 0.3);
    // SHOCK: electric shiver while the stun lasts
    const shock = st.kind === K_SHOCK && hit > 0.05 && e.down <= 0;
    if (shock && !frozen) { const f = Math.min(1, hit / 0.4), ph = st.t * 61; out.jx += Math.sin(ph) * 0.03 * f; out.jz += Math.cos(ph * 1.31) * 0.03 * f; out.jy += Math.sin(ph * 0.77) * 0.015 * f; }
    // FLASH: white-hot pop, then the hero's colour as a soft glow for the rest of the stun
    const tau = 0.035 + 0.05 * w;
    const pop = pt < 0.5 ? Math.exp(-pt / tau) * (0.45 + 0.55 * w) : 0;
    let glow = Math.min(1, hit / 0.3) * (0.4 + 0.3 * w);
    if (shock) glow *= 0.75 + 0.5 * Math.abs(Math.sin(st.t * 37) * Math.sin(st.t * 23 + 1));
    out.hot = hit > 0 || pop > 0.01;
    const pk = (3 + 3 * w) * pop;   // white-hot: up to ~7x on the bot's dark shell so it reads white even half-hidden behind the hero
    out.r = 1 + pk + glow * (st.r * 1.6 - 0.25); out.g = 1 + pk + glow * (st.g * 1.6 - 0.25); out.b = 1 + pk + glow * (st.b * 1.6 - 0.25);
    // HALO: one soft glow puff in the hero's colour on a heavy blow (and a smaller one for the rest, as the freeze ends)
    if (st.halo && !frozen && dt > 0) {
        st.halo = 0;
        const y = e.y + (e.ly || 0) + enemyBodyOffset(e), col = ((Math.round(st.r * 255) << 16) | (Math.round(st.g * 255) << 8) | Math.round(st.b * 255));
        emit(SH_GLOW, e.x, y, e.z, st.ux * 0.6, 0.2, st.uz * 0.6, 0.26, 1.1 + 0.6 * w, 2.0 + 1.0 * w, col, 0.5 + 0.3 * w, 0, 3, 0.12, 2);
        if (!LOW) emit(SH_GLOW, e.x, y + 0.1, e.z, 0, 0, 0, 0.12, 0.7, 1.3, tint(col, 0.7), 0.7, 0, 3, 0.12, 2);
    }
    return out;
}

/* Bosses: the same read, much subtler. Returns a tilt away from the blow (applied at the boss root, which pivots at the feet) and a
   flash multiplier for the boss skin. */
export type BossReactOut = { q: THREE.Quaternion; r: number; g: number; b: number };
const bout: BossReactOut = { q: new THREE.Quaternion(), r: 1, g: 1, b: 1 };
export function bossReact(boss: any, sim: any, dt: number): BossReactOut {
    let st: HR = boss.__hr; if (!st) st = boss.__hr = newState();
    const hit = boss.hit || 0;
    if (DBG && (globalThis as any).__enemyReactV1) { const f = hit > 0 ? 1 + Math.min(0.06, hit * 0.04) : 1; bout.q.identity(); bout.r = bout.g = bout.b = f; return bout; }
    if (hit > st.h + 0.05 && boss.down <= 0) {
        const kind = classify(hit, boss), w = W[kind], hs = striker(boss, sim);
        const dx = boss.x - hs.pos[0], dz = boss.z - hs.pos[2], d = Math.hypot(dx, dz);
        if (d > 0.01) { st.ux = dx / d; st.uz = dz / d; }
        st.kind = kind; st.w = w; st.t = 0; st.pt = 0;
        st.av += (0.012 + 0.05 * w) / 0.05;   // ~0.02 rad for a shot up to ~0.06 rad for Slam at the peak (a few tens of cm at the head)
        _c.setHex(hs.fxCol ?? PURPLE); st.r = _c.r; st.g = _c.g; st.b = _c.b;
    }
    st.h = hit; st.t += dt;
    const frozen = frozenNow(sim, st.t);
    if (!frozen && dt > 0) { st.pt += dt; [st.a, st.av] = spring(st.a, st.av, 0, 120, 8, dt); }
    const a = boss.down > 0 ? 0 : Math.max(-0.12, Math.min(0.12, st.a));
    _ax.set(st.uz, 0, -st.ux); bout.q.setFromAxisAngle(_ax, a);
    const pop = st.pt < 0.4 ? Math.exp(-st.pt / (0.03 + 0.03 * st.w)) * (0.25 + 0.35 * st.w) : 0, glow = Math.min(1, hit / 0.3) * 0.18;
    bout.r = 1 + 1.4 * pop + glow * (st.r * 1.5 - 0.3); bout.g = 1 + 1.4 * pop + glow * (st.g * 1.5 - 0.3); bout.b = 1 + 1.4 * pop + glow * (st.b * 1.5 - 0.3);
    return bout;
}

/* test hook (instrumented builds only): window.__enemyReactV1 = true renders bots with the Nov 2 reaction, for before/after frames */
function reactV1(e: any, sim: any, dt: number, hold: number): ReactOut {
    let st: HR = e.__hr1; if (!st) st = e.__hr1 = newState();
    const hit = e.hit || 0;
    if (hit > st.h + 0.05 && e.down <= 0) {
        const kx = e.kb ? e.kb[0] : 0, kz = e.kb ? e.kb[1] : 0, kl = Math.hypot(kx, kz), hs = striker(e, sim);
        if (kl > 0.5) { st.ux = kx / kl; st.uz = kz / kl; }
        else { const dx = e.x - hs.pos[0], dz = e.z - hs.pos[2], d = Math.hypot(dx, dz); if (d > 0.01) { st.ux = dx / d; st.uz = dz / d; } }
        const amp = Math.min(1, 0.3 + hit * 1.2); st.w = amp; st.t = 0; st.pt = 0; st.av += 8 * amp; st.sv -= 6 * amp;
        _c.setHex(hs.fxCol ?? PURPLE); st.r = _c.r; st.g = _c.g; st.b = _c.b;
    }
    st.h = hit; st.t += dt;
    const frozen = frozenNow(sim, st.t);
    if (!frozen) { st.pt += dt; [st.a, st.av] = spring(st.a, st.av, e.down > 0 ? 0 : hold, 260, 14, dt); [st.s, st.sv] = spring(st.s, st.sv, 0, 420, 16, dt); }
    const a = Math.max(-0.9, Math.min(0.9, st.a)), s = Math.max(-0.3, Math.min(0.25, st.s));
    _ax.set(st.uz, 0, -st.ux); out.q.setFromAxisAngle(_ax, a);
    out.sy = 1 + s; out.sxz = 1 / Math.sqrt(out.sy); out.jy = 0;
    if (frozen) { const j = Math.sin(st.t * 190) * 0.06 * st.w * Math.max(0, 1 - st.t / 0.2); out.jx = st.ux * j; out.jz = st.uz * j; } else { out.jx = 0; out.jz = 0; }
    const pop = st.pt < 0.4 ? Math.exp(-st.pt / 0.05) * st.w : 0, glow = Math.min(1, hit / 0.3) * 0.6;
    out.hot = hit > 0 || pop > 0.01;
    out.r = 1 + 2.2 * pop + glow * (st.r * 1.6 - 0.25); out.g = 1 + 2.2 * pop + glow * (st.g * 1.6 - 0.25); out.b = 1 + 2.2 * pop + glow * (st.b * 1.6 - 0.25);
    return out;
}
