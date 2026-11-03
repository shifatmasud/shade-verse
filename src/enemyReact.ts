import * as THREE from 'three';
import { getCompanionSim, enemyBodyOffset, shadowFloorAt, waterSurfaceAt } from './sim';
import { emit, SH_GLOW, SH_DUST, LOW, tint } from './combatFx';

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
    w: number; kind: number; n: number; r: number; g: number; b: number; halo: number;
    ko?: number; kt?: number; ka0?: number; kimp?: number; kpuff?: number; kmote?: number; kh?: number; kfl?: number; kwet?: number };
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
/** under-damped spring step; the result rides one preallocated scratch (no per-frame tuple) */
const _sp = { x: 0, v: 0 };
function spring(x: number, v: number, tgt: number, k: number, c: number, dt: number): typeof _sp {
    const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
    for (let i = 0; i < n; i++) { v += (k * (tgt - x) - c * v) * h; x += v * h; }
    _sp.x = x; _sp.v = v; return _sp;
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
export type ReactOut = { q: THREE.Quaternion; sy: number; sxz: number; jx: number; jy: number; jz: number; r: number; g: number; b: number; hot: boolean;
    ko: boolean; ksc: number; limp: number };   // limp 0..1: the KO'd bot's walk cycle fades out (aStill)   // ko: this module poses the KO (fall + dissolve); Scene then skips its old fixed-axis fall and shrink-out and scales by ksc
const out: ReactOut = { q: new THREE.Quaternion(), sy: 1, sxz: 1, jx: 0, jy: 0, jz: 0, r: 1, g: 1, b: 1, hot: false, ko: false, ksc: 1, limp: 0 };
const frozenNow = (sim: any, t: number) => { const cs = getCompanionSim() as any; return ((sim.hitStop || 0) > 0 || ((cs && cs.hitStop) || 0) > 0) && t < 0.2; };

/** per bot, per frame (Scene.tsx). hold = the old stun lean (radians); the flinch settles on a weight-scaled version of it while e.hit lasts */
export function enemyReact(e: any, sim: any, dt: number, hold: number): ReactOut {
    if (DBG && (globalThis as any).__enemyReactV1) return reactV1(e, sim, dt, hold);
    let st: HR = e.__hr; if (!st) st = e.__hr = newState();
    const hit = e.hit || 0;
    const koOld = DBG && !!(globalThis as any).__enemyKoOld;   // DBG A/B: the pre-Nov 3 KO (fixed-axis 0.2 s tip, then shrink-out) for before/after strips
    const koNow = e.down > 0 && !e.boss && !koOld;
    // the killing blow reacts too (it used to be skipped because the sim downs the bot on the same frame it sets the stun)
    if (hit > st.h + 0.05 && (e.down <= 0 || (koNow && !st.ko))) onBlow(st, e, sim, hit);
    st.h = hit; st.t += dt;
    const w = st.w, heavy = w >= 0.6, frozen = frozenNow(sim, st.t);
    // weight-scaled stun lean: a shot or jab holds a little lean, a finisher / Slam a deep one (was 0.32 / 0.55 by move id alone)
    const lean = e.down > 0 || hold <= 0 ? 0 : Math.min(1, hit / 0.3) * (0.04 + 0.46 * w);
    if (!frozen && dt > 0) {
        st.pt += dt;   // the white pop holds through the freeze, then cools
        { const r = spring(st.a, st.av, lean, 260, 14, dt); st.a = r.x; st.av = r.v; }
        { const r = spring(st.s, st.sv, 0, 420, 16, dt); st.s = r.x; st.sv = r.v; }
        { const r = spring(st.y, st.yv, 0, 110, 9, dt); st.y = r.x; st.yv = r.v; }
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
    out.ko = false; out.ksc = 1; out.limp = 0;
    if (koNow) koPose(st, e, sim, dt, frozen, a);
    else if (e.down <= 0) st.ko = 0;
    return out;
}

/* KO (Nov 3 combat-feel pass). Render-only, reads e.down (3 s, counted by the sim) and the killing blow's direction.
   Was: every KO'd bot tipped over the same world axis in a linear 0.2 s, lay inert, then shrank to a point.
   Now:  TOPPLE  - falls AWAY from the killing blow, pivoting on its leading foot edge, accelerating like a real fall (u^2) from wherever the
                   flinch had the top, ~0.36 s;
         IMPACT  - lands with one damped bounce (~0.17 rad) and a squash, a low soft dust puff + faint hero-colour glow along the ground;
         EMBERS  - the killing blow's hero colour lingers on the shell and cools;
         DISSOLVE- last 1.0 s: the shell warms into a soft glow in the hero's colour, swells a touch, then eases away while soft glowing motes
                   drift up off it, ending in one soft glow puff - no pop. Soft, blurry, additive glow only (Shifat: no sharp VFX). */
const KO_ANG = 1.5, KO_FALL = 0.36, KO_DIS = 1.0, KO_G = 18, KO_DROP_MAX = 1.2;   // airborne KO drop: ~gravity, capped so even a high drone lands well before the dissolve
const _kq = new THREE.Quaternion();
const ss = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function koPose(st: HR, e: any, sim: any, dt: number, frozen: boolean, aNow: number) {
    if (!st.ko) {
        st.ko = 1; st.kt = 0; st.ka0 = Math.max(0, Math.min(0.9, aNow)); st.kimp = 0; st.kpuff = 0; st.kmote = 0;
        // a hover drone (or any airborne bot) is KO'd where it hangs: it drops to the floor below first (falls under a gravity ease,
        // h*u^2), toppling on the way down, and the impact bounce + dust happen when it lands. Ground bots: no drop (unchanged).
        st.kh = 0; st.kfl = KO_FALL; st.kwet = 0;
        if (e.air && !(DBG && (globalThis as any).__koNoDrop)) { const fl = shadowFloorAt(e.x, e.y, e.z), fy = fl ?? waterSurfaceAt(e.x, e.z), h = e.y - fy;
            if (h > 0.25) { st.kh = h; st.kwet = fl === null ? 1 : 0; st.kfl = Math.max(KO_FALL, Math.min(KO_DROP_MAX, Math.sqrt(2 * h / KO_G))); } }
        if (st.pt > 0.3) { const hs = striker(e, sim), dx = e.x - hs.pos[0], dz = e.z - hs.pos[2], d = Math.hypot(dx, dz); if (d > 0.01) { st.ux = dx / d; st.uz = dz / d; } }   // downed without a fresh blow (e.g. a blast): fall away from the nearer hero
    }
    if (!frozen && dt > 0) st.kt! += dt;
    const kt = st.kt!, a0 = st.ka0!, w = st.w, TF = st.kfl ?? KO_FALL, kh = st.kh || 0;
    let th: number;
    if (kt < TF) { const u = kt / TF; th = a0 + (KO_ANG - a0) * u * u; }
    else { const tb = kt - TF; th = KO_ANG - (0.1 + 0.08 * w) * Math.exp(-tb / 0.12) * Math.abs(Math.sin(tb * Math.PI / 0.16)); }
    // pivot on the leading foot edge (half the bot's depth ahead along the fall): offset = h(u(1-cos) + up sin)
    const sc = e.kind === 3 ? 1 : 1.25, hd = 0.24 * sc, c = Math.cos(th), sn = Math.sin(th);
    _ax.set(st.uz, 0, -st.ux); out.q.setFromAxisAngle(_ax, th);
    if (Math.abs(st.y) > 1e-4) { _kq.setFromAxisAngle(_ay, Math.max(-0.5, Math.min(0.5, st.y)) * 0.6); out.q.multiply(_kq); }
    const drop = kh > 0 ? (kt < TF ? kh * (kt / TF) * (kt / TF) : kh) : 0;   // airborne KO: fall to the floor (h*u^2), then lie there
    out.jx += st.ux * hd * (1 - c); out.jz += st.uz * hd * (1 - c); out.jy += hd * sn - 0.04 * ss(0, 1, th / KO_ANG) - drop;
    // IMPACT: squash + soft dust and a faint ground glow along the body
    const bodyY = e.y + (e.ly || 0) - drop, len = Math.max(0.8, Math.min(2.2, enemyBodyOffset(e) * 2));
    const col = ((Math.round(st.r * 255) << 16) | (Math.round(st.g * 255) << 8) | Math.round(st.b * 255));
    if (!st.kimp && kt >= TF) {
        st.kimp = 1; st.sv -= 6 + 4 * w;
        const n = st.kwet ? 0 : LOW ? 2 : 4;   // no ground dust off water
        for (let i = 0; i < n; i++) { const f = (i + 0.5) / n * len, px = e.x + st.ux * f, pz = e.z + st.uz * f, sx = (Math.random() - 0.5) * 1.2;
            emit(SH_DUST, px, bodyY + 0.12, pz, -st.uz * sx + st.ux * 0.5, 0.35 + Math.random() * 0.3, st.ux * sx + st.uz * 0.5, 0.55, 0.5, 1.4, 0x9aa3b8, 0.32, 0, 2.5, 0.12, 1.5); }
        emit(SH_GLOW, e.x + st.ux * len * 0.5, bodyY + 0.15, e.z + st.uz * len * 0.5, 0, 0.1, 0, 0.35, 1.0, 2.2, col, 0.3, 0, 3, 0.12, 2);
    }
    // EMBERS: the hero colour lingers on the shell and cools; DISSOLVE: it warms into a soft glow and eases away
    const f = e.down < KO_DIS ? 1 - e.down / KO_DIS : 0;
    const ember = 0.12 + 0.5 * Math.exp(-kt / 0.55);
    const gl = ss(0, 0.5, f), hot = 1 - 0.6 * gl;   // white body tone gives way to the hero colour
    const lift = 4.6 * gl + ember, pt = st.pt, pk = pt < 0.5 ? (3 + 3 * w) * Math.exp(-pt / (0.035 + 0.05 * w)) * (0.45 + 0.55 * w) * hot : 0;   // the killing blow's white-hot pop, as in enemyReact
    out.r = 1 + pk + lift * (st.r * 1.6 - 0.25) + 0.9 * gl; out.g = 1 + pk + lift * (st.g * 1.6 - 0.25) + 0.9 * gl; out.b = 1 + pk + lift * (st.b * 1.6 - 0.25) + 0.9 * gl;
    out.hot = true; out.ko = true; out.limp = ss(0, TF, kt);   // limbs stop walking as it goes over
    out.ksc = Math.max(0.001, (1 + 0.07 * Math.sin(Math.PI * Math.min(1, f / 0.5))) * (1 - ss(0.45, 1, f)));   // glows at full size first, then eases away
    out.jy += 0.22 * f * f;
    if (f > 0.08 && f < 0.97 && !frozen && dt > 0) {   // soft glowing motes drifting up off the body
        st.kmote! += dt * (LOW ? 10 : 20) * (0.4 + 0.6 * Math.sin(Math.PI * Math.min(1, f)));
        while (st.kmote! >= 1) { st.kmote! -= 1;
            const g = Math.random() * len * out.ksc, px = e.x + st.ux * (hd + g) + (Math.random() - 0.5) * 0.4, pz = e.z + st.uz * (hd + g) + (Math.random() - 0.5) * 0.4;
            emit(SH_GLOW, px, bodyY + 0.15 + Math.random() * 0.25, pz, (Math.random() - 0.5) * 0.3, 0.9 + Math.random() * 0.8, (Math.random() - 0.5) * 0.3, 0.7 + Math.random() * 0.4, 0.3 + Math.random() * 0.16, 0.05, tint(col, 0.3 + Math.random() * 0.3), 0.9, -0.4, 1.2, 0.12, 1.4); }
    }
    if (!st.kpuff && f >= 0.9) {   // the last of it goes as one soft glow puff
        st.kpuff = 1; const px = e.x + st.ux * len * 0.5, pz = e.z + st.uz * len * 0.5;
        emit(SH_GLOW, px, bodyY + 0.3, pz, 0, 0.4, 0, 0.55, 0.8, 2.2, col, 0.6, 0, 2, 0.12, 2);
        if (!LOW) emit(SH_GLOW, px, bodyY + 0.3, pz, 0, 0.3, 0, 0.3, 0.4, 1.0, tint(col, 0.6), 0.55, 0, 2, 0.12, 2);
    }
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
    if (!frozen && dt > 0) { st.pt += dt; { const r = spring(st.a, st.av, 0, 120, 8, dt); st.a = r.x; st.av = r.v; } }
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
    if (!frozen) { st.pt += dt; { const r = spring(st.a, st.av, e.down > 0 ? 0 : hold, 260, 14, dt); st.a = r.x; st.av = r.v; } { const r = spring(st.s, st.sv, 0, 420, 16, dt); st.s = r.x; st.sv = r.v; } }
    const a = Math.max(-0.9, Math.min(0.9, st.a)), s = Math.max(-0.3, Math.min(0.25, st.s));
    _ax.set(st.uz, 0, -st.ux); out.q.setFromAxisAngle(_ax, a);
    out.sy = 1 + s; out.sxz = 1 / Math.sqrt(out.sy); out.jy = 0;
    if (frozen) { const j = Math.sin(st.t * 190) * 0.06 * st.w * Math.max(0, 1 - st.t / 0.2); out.jx = st.ux * j; out.jz = st.uz * j; } else { out.jx = 0; out.jz = 0; }
    const pop = st.pt < 0.4 ? Math.exp(-st.pt / 0.05) * st.w : 0, glow = Math.min(1, hit / 0.3) * 0.6;
    out.hot = hit > 0 || pop > 0.01;
    out.r = 1 + 2.2 * pop + glow * (st.r * 1.6 - 0.25); out.g = 1 + 2.2 * pop + glow * (st.g * 1.6 - 0.25); out.b = 1 + 2.2 * pop + glow * (st.b * 1.6 - 0.25);
    return out;
}
