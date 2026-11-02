// Combat hit FX (Nov 2 2026, Shifat: "particles, glow, trail are must have" for both heroes).
// Pure data: the sim spawns into fixed pools, src/CombatFX.tsx steps and draws them.
// Budget (Adreno 506): <=160 live particles (ADD_MAX + ALPHA_MAX), <=4 ribbon trails x 12 points,
// 3 draw calls (additive sprites, alpha sprites, ribbons) + the additive set in the bloom pass. Nothing allocates per hit.
// Recipe numbers: /home/user/tab/files/combat_reference.md section D.

import { QK } from './quality';

// additive shapes
// Nov 2 2026 (Shifat: "No more solid rings. Only particle burst, vfx explosion, glow, electric shock"): ring / ground-ring / dashed
// preview / ink-band shapes removed. SH_GPUFF = soft ground-hugging light smear, stretched along its velocity (particle shockwave).
export const SH_GLOW = 0, SH_SPARK = 2, SH_CORE = 3, SH_GPUFF = 4, SH_GSTREAK = 5, SH_SEG = 6;
// alpha shapes
export const SH_STAR = 10, SH_SPLAT = 11, SH_DUST = 12, SH_CHUNK = 13;

export const ADD_MAX = 128, ALPHA_MAX = 32;
export const F = 21;   // floats per particle
// layout: 0-2 pos, 3-5 vel (or segment/ground-streak direction), 6 age, 7 life, 8 size0, 9 size1, 10-12 rgb, 13 alpha, 14 shape, 15 gravity, 16 drag, 17 rot, 18 thick, 19 fade power, 20 floor y (bounce; -1e9 = none)
export const addP = new Float32Array(ADD_MAX * F), alphaP = new Float32Array(ALPHA_MAX * F);
export const pool = { addN: 0, alphaN: 0 };

function slot(alpha: boolean): number {
    const buf = alpha ? alphaP : addP, max = alpha ? (LOW ? ALPHA_LOW : ALPHA_MAX) : (LOW ? ADD_LOW : ADD_MAX);   // low tier: smaller live caps (fewer instances drawn)
    if (alpha ? pool.alphaN < max : pool.addN < max) { const i = alpha ? pool.alphaN++ : pool.addN++; return i; }
    let oi = 0, oa = -1;   // full: recycle the particle closest to its end (oldest first, never allocate)
    for (let i = 0; i < max; i++) { const f = buf[i * F + 6] / Math.max(1e-3, buf[i * F + 7]); if (f > oa) { oa = f; oi = i; } }
    return oi;
}
// Low FX tier = the game's quality setting (quality.ts QK.fxLow: ?q=low, or any touch/phone device): halve sparks, drop dust,
// live caps 80 additive + 20 alpha instead of 128 + 32. Desktop auto/high keeps the full path.
export const ADD_LOW = 80, ALPHA_LOW = 20;
export let LOW = QK.fxLow;
export function setFxLow(v: boolean) { LOW = v; }
export function emit(shape: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, col: number, a = 1, grav = 0, drag = 0, thick = 0.12, fade = 1, floor = -1e9) {
    const alpha = shape >= 10, i = slot(alpha), b = alpha ? alphaP : addP, o = i * F;
    b[o] = x; b[o + 1] = y; b[o + 2] = z; b[o + 3] = vx; b[o + 4] = vy; b[o + 5] = vz; b[o + 6] = 0; b[o + 7] = life; b[o + 8] = s0; b[o + 9] = s1;
    b[o + 10] = ((col >> 16) & 255) / 255; b[o + 11] = ((col >> 8) & 255) / 255; b[o + 12] = (col & 255) / 255; b[o + 13] = a; b[o + 14] = shape; b[o + 15] = grav; b[o + 16] = drag;
    b[o + 17] = Math.random() * Math.PI * 2; b[o + 18] = thick; b[o + 19] = fade; b[o + 20] = floor;
}
export function stepPools(dt: number) {
    for (let pass = 0; pass < 2; pass++) {
        const b = pass ? alphaP : addP; let n = pass ? pool.alphaN : pool.addN;
        for (let i = 0; i < n; i++) {
            const o = i * F; b[o + 6] += dt;
            if (b[o + 6] >= b[o + 7]) { n--; if (i !== n) b.copyWithin(o, n * F, n * F + F); i--; continue; }
            const sh = b[o + 14]; if (sh === SH_SEG || sh === SH_GSTREAK) continue;   // static (direction stored in vel)
            const dr = b[o + 16] > 0 ? Math.exp(-b[o + 16] * dt) : 1;
            b[o + 3] *= dr; b[o + 4] = b[o + 4] * dr - b[o + 15] * dt; b[o + 5] *= dr;
            b[o + 0] += b[o + 3] * dt; b[o + 1] += b[o + 4] * dt; b[o + 2] += b[o + 5] * dt;
            if (b[o + 1] < b[o + 20] && b[o + 4] < 0) { b[o + 1] = b[o + 20]; b[o + 4] *= -0.35; b[o + 3] *= 0.6; b[o + 5] *= 0.6; }   // bounce off the ground
        }
        if (pass) pool.alphaN = n; else pool.addN = n;
    }
}
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
function sparks(n: number, x: number, y: number, z: number, col: number, sp0: number, sp1: number, life0: number, life1: number, w = 0.05, upBias = 0.25, floor = -1e9) {
    if (LOW) n = Math.ceil(n / 2);
    for (let k = 0; k < n; k++) {
        const u = rnd(-1, 1), th = rnd(0, Math.PI * 2), r = Math.sqrt(1 - u * u), sp = rnd(sp0, sp1);
        emit(SH_SPARK, x, y, z, Math.cos(th) * r * sp, (u * 0.8 + upBias) * sp, Math.sin(th) * r * sp, rnd(life0, life1), w, w * 0.6, k & 1 ? 0xffffff : col, 1, 4.9, 2.2, 0.12, 1, floor);
    }
}
// ---- ribbon trails: 4 slots (Shadow 0-1, Ghost 2-3), 12 points each, points expire by age ----
export const TRAIL_SLOTS = 4, TRAIL_PTS = 12;
export const trails = Array.from({ length: TRAIL_SLOTS }, () => ({ n: 0, pts: new Float32Array(TRAIL_PTS * 4), life: 0.12, width: 0.22, col: 0xffffff }));
export function trailPoint(slot: number, x: number, y: number, z: number, col: number, life: number, width: number) {
    const t = trails[slot]; t.col = col; t.life = life; t.width = width;
    const P = t.pts; if (t.n > 0) { const dx = x - P[0], dy = y - P[1], dz = z - P[2]; if (dx * dx + dy * dy + dz * dz < 0.0009) { P[3] = 0; return; } }
    P.copyWithin(4, 0, (TRAIL_PTS - 1) * 4); P[0] = x; P[1] = y; P[2] = z; P[3] = 0; t.n = Math.min(TRAIL_PTS, t.n + 1);
}
export function stepTrails(dt: number) {
    for (const t of trails) { for (let i = 0; i < t.n; i++) t.pts[i * 4 + 3] += dt; while (t.n > 0 && t.pts[(t.n - 1) * 4 + 3] > t.life) t.n--; }
}
// ---- one-shot screen flash (Slam: 35% white for 2 frames) ----
export const screenFlash = { frames: 0, a: 0 };
// ---- hit recipes (D4, D5, D6, D7) ----
/** melee hit at (x,y,z); lvl 1/2/3 = combo hit 1, 2, finisher */
export function fxMelee(x: number, y: number, z: number, col: number, lvl: number, grounded = true) {
    const sc = lvl >= 3 ? 1.6 : lvl === 2 ? 1.15 : 1;
    emit(SH_CORE, x, y, z, 0, 0, 0, 0.05, 0.6 * sc, 1.2 * sc, 0xffffff, 1);                       // white core flash, 50 ms
    emit(SH_STAR, x, y, z, 0, 0, 0, 0.10, 1.17 * sc, 0.9 * sc, col, 1);                            // comic hit-star, black ink rim, pop 1.3 -> 1.0
    emit(SH_GLOW, x, y, z, 0, 0, 0, 0.18, 1.4 * sc, 1.6 * sc, col, 0.9, 0, 0, 0.12, 2);           // hero-colour glow, quadratic fade
    sparks(lvl >= 3 ? 14 : lvl === 2 ? 8 : 6, x, y, z, col, 6, 12, 0.15, 0.3);                   // spark streaks
    if (lvl >= 3 && grounded && !LOW) for (let k = 0; k < 6; k++) { const th = rnd(0, Math.PI * 2), sp = rnd(1.5, 3); emit(SH_DUST, x + Math.cos(th) * 0.3, y - 0.9, z + Math.sin(th) * 0.3, Math.cos(th) * sp, rnd(0.4, 1.2), Math.sin(th) * sp, 0.45, 0.35, 0.9, 0xb9b2c6, 0.55, 0, 3); }
}
export function fxShot(x: number, y: number, z: number, col: number) {
    emit(SH_SPLAT, x, y, z, 0, 0, 0, 0.6, 0.75, 0.95, 0xffffff, 1, 0, 0, 0.12, 0);                  // web splat (fades over its last third)
    emit(SH_CORE, x, y, z, 0, 0, 0, 0.035, 0.35, 0.5, 0xffffff, 1);
    emit(SH_GLOW, x, y, z, 0, 0, 0, 0.14, 0.5, 0.8, col, 0.8, 0, 0, 0.12, 2);
    sparks(6, x, y, z, col, 5, 10, 0.12, 0.2);
}
const CYAN = 0x7ff6ff;
/** Shock hit: cyan-white flash, jagged lightning from (hx,hy,hz) to the target + crackle arcs on the bot, spark burst, glow */
export function fxShock(x: number, y: number, z: number, hx: number, hy: number, hz: number) {
    emit(SH_CORE, x, y, z, 0, 0, 0, 0.05, 0.8, 1.1, 0xe8ffff, 1);
    emit(SH_GLOW, x, y, z, 0, 0, 0, 0.2, 1.6, 1.8, CYAN, 0.9, 0, 0, 0.12, 2);
    sparks(12, x, y, z, CYAN, 5, 12, 0.15, 0.32, 0.045, 0.25, y - 0.95);
    bolt(hx, hy, hz, x, y, z, 0.25);
    bolt(x, y + 0.6, z, x + rnd(-1, 1), y - 0.8, z + rnd(-1, 1), 0.2);
    bolt(x, y, z, x + rnd(-0.9, 0.9), y + rnd(0.3, 0.9), z + rnd(-0.9, 0.9), 0.14);   // crackle arc on the bot
}
export const BOLT_MAX = 10;
function bolt(ax: number, ay: number, az: number, bx: number, by: number, bz: number, life: number) { bolts.push({ ax, ay, az, bx, by, bz, t: 0, life }); if (bolts.length > BOLT_MAX) bolts.shift(); }
export const bolts: { ax: number; ay: number; az: number; bx: number; by: number; bz: number; t: number; life: number }[] = [];
/** Charged Slam impact on the ground at (x,gy,z), blast radius R. No ring mesh: a ground-hugging particle shockwave (soft light smears
 *  racing outward to R), radial dust, sparks + hot embers that bounce, white-hot core and a heat glow. */
export function fxSlam(x: number, gy: number, z: number, R: number, col: number) {
    screenFlash.frames = 2; screenFlash.a = 0.35;
    const y = gy + 0.05;
    emit(SH_CORE, x, gy + 0.8, z, 0, 0, 0, 0.07, 1.6, 2.6, 0xffffff, 1);
    emit(SH_GLOW, x, gy + 0.5, z, 0, 0, 0, 0.18, 2.0, 3.0, 0xffb070, 0.9, 0, 0, 0.12, 2);       // white-orange heat
    emit(SH_GLOW, x, gy + 0.6, z, 0, 0, 0, 0.45, 3.2, 4.4, col, 0.95, 0, 0, 0.12, 2);           // hero-colour bloom
    emit(SH_GPUFF, x, y, z, 0, 0, 0, 0.6, R * 0.5, R * 0.9, col, 0.35, 0, 0, 0.12, 2);          // soft ground heat glow under the blast
    const np = LOW ? 16 : 28, d = 4;
    for (let k = 0; k < np; k++) {   // particle shockwave: front reaches ~R at the end of each smear's life
        const th = (k / np) * Math.PI * 2 + rnd(-0.12, 0.12), life = rnd(0.38, 0.5), v0 = R * rnd(0.85, 1.05) * d / (1 - Math.exp(-d * life));
        emit(SH_GPUFF, x + Math.cos(th) * 0.4, y + 0.02 * (k & 3), z + Math.sin(th) * 0.4, Math.cos(th) * v0, 0, Math.sin(th) * v0, life, rnd(0.35, 0.5), rnd(0.8, 1.1), k % 3 === 0 ? 0xfff0dc : col, 0.85, 0, d, 0.12, 1);
    }
    sparks(22, x, gy + 0.4, z, col, 8, 16, 0.25, 0.45, 0.06, 0.9, gy + 0.03);
    for (let k = 0; k < (LOW ? 5 : 10); k++) { const th = rnd(0, Math.PI * 2), sp = rnd(3, 8); emit(SH_SPARK, x + Math.cos(th) * 0.5, gy + 0.2, z + Math.sin(th) * 0.5, Math.cos(th) * sp, rnd(5, 10), Math.sin(th) * sp, rnd(0.7, 1.0), 0.04, 0.03, 0xff9a4a, 1, 16, 0.6, 0.12, 1, gy + 0.03); }   // hot embers (bounce)
    if (!LOW) for (let k = 0; k < 10; k++) { const th = (k / 10) * Math.PI * 2 + rnd(-0.2, 0.2), sp = rnd(4, 8); emit(SH_DUST, x + Math.cos(th) * 0.8, gy + 0.25, z + Math.sin(th) * 0.8, Math.cos(th) * sp, rnd(0.4, 1.4), Math.sin(th) * sp, 0.7, 0.7, 2.0, 0xbdb6cc, 0.55, 0, 2.5); }   // radial dust
}
/** per-frame charge feedback: inward particles toward the fist */
export function fxChargeTick(hx: number, hy: number, hz: number, c: number, col: number, dt: number, acc: { v: number }, gx = 0, gy = 0, gz = 0, R = 0, acc2?: { v: number }) {
    if (acc2 && R > 0) {   // blast radius shown by motes of light rising off the ground at R (replaces the dashed preview ring)
        acc2.v += dt * (LOW ? 12 : 22);
        while (acc2.v >= 1) { acc2.v -= 1; const th = rnd(0, Math.PI * 2), r = R * rnd(0.92, 1.02); emit(SH_GLOW, gx + Math.cos(th) * r, gy + 0.12, gz + Math.sin(th) * r, -Math.cos(th) * 0.6, rnd(0.6, 1.3), -Math.sin(th) * 0.6, 0.5, 0.22, 0.1, Math.random() < 0.35 ? 0xffffff : col, 0.45 + 0.4 * c); }
    }
    acc.v += dt * (4 + 12 * c) / 0.25;   // 4 -> 16 live at once (life 250 ms)
    while (acc.v >= 1) {
        acc.v -= 1; const u = rnd(-1, 1), th = rnd(0, Math.PI * 2), r = Math.sqrt(1 - u * u), d = rnd(0.9, 1.5);
        const ox = Math.cos(th) * r * d, oy = u * d, oz = Math.sin(th) * r * d;
        emit(SH_SPARK, hx + ox, hy + oy, hz + oz, -ox / 0.25, -oy / 0.25, -oz / 0.25, 0.25, 0.04, 0.02, Math.random() < 0.5 ? 0xffffff : col, 0.9);
    }
}
export function resetFx() { pool.addN = 0; pool.alphaN = 0; for (const t of trails) t.n = 0; bolts.length = 0; screenFlash.frames = 0; }
/** Shock discharge around the caster: lightning arcs racing out along the ground to the hit range, ground-hugging light burst,
 *  cyan spark burst, core flash, glow (no ring) */
export function fxDischarge(x: number, gy: number, z: number, R: number, col: number) {
    const y = gy + 0.08;
    emit(SH_CORE, x, gy + 1.2, z, 0, 0, 0, 0.06, 1.2, 2.0, 0xe8ffff, 1);
    emit(SH_GLOW, x, gy + 1.2, z, 0, 0, 0, 0.3, 2.4, 3.0, CYAN, 0.9, 0, 0, 0.12, 2);
    emit(SH_GPUFF, x, y, z, 0, 0, 0, 0.4, R * 0.4, R * 0.8, col, 0.35, 0, 0, 0.12, 2);
    const nb = LOW ? 4 : 6;
    for (let k = 0; k < nb; k++) { const th = (k / nb) * Math.PI * 2 + rnd(-0.3, 0.3), L = R * rnd(0.6, 1); bolt(x, gy + 0.9, z, x + Math.cos(th) * L, y, z + Math.sin(th) * L, rnd(0.18, 0.26)); }
    const np = LOW ? 10 : 16, d = 5;
    for (let k = 0; k < np; k++) { const th = (k / np) * Math.PI * 2 + rnd(-0.15, 0.15), life = rnd(0.3, 0.4), v0 = R * d / (1 - Math.exp(-d * life)); emit(SH_GPUFF, x + Math.cos(th) * 0.3, y, z + Math.sin(th) * 0.3, Math.cos(th) * v0, 0, Math.sin(th) * v0, life, 0.3, 0.7, k & 1 ? 0xe8ffff : CYAN, 0.8, 0, d, 0.12, 1); }
    sparks(16, x, gy + 1.0, z, CYAN, 6, 13, 0.2, 0.4, 0.045, 0.3, gy + 0.03);
}
