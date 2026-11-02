// Combat hit FX (Nov 2 2026, Shifat: "particles, glow, trail are must have" for both heroes).
// Pure data: the sim spawns into fixed pools, src/CombatFX.tsx steps and draws them.
// Budget (Adreno 506): <=160 live particles (ADD_MAX + ALPHA_MAX), <=4 ribbon trails x 12 points,
// 3 draw calls (additive sprites, alpha sprites, ribbons) + the additive set in the bloom pass. Nothing allocates per hit.
// Recipe numbers: /home/user/tab/files/combat_reference.md section D.

// additive shapes
export const SH_GLOW = 0, SH_RING = 1, SH_SPARK = 2, SH_CORE = 3, SH_GRING = 4, SH_GSTREAK = 5, SH_SEG = 6, SH_GPREVIEW = 7;
// alpha shapes
export const SH_STAR = 10, SH_SPLAT = 11, SH_DUST = 12, SH_CHUNK = 13, SH_GBAND = 14;

export const ADD_MAX = 128, ALPHA_MAX = 32;
export const F = 20;   // floats per particle
// layout: 0-2 pos, 3-5 vel (or segment/ground-streak direction), 6 age, 7 life, 8 size0, 9 size1, 10-12 rgb, 13 alpha, 14 shape, 15 gravity, 16 drag, 17 rot, 18 thick, 19 fade power
export const addP = new Float32Array(ADD_MAX * F), alphaP = new Float32Array(ALPHA_MAX * F);
export const pool = { addN: 0, alphaN: 0 };

function slot(alpha: boolean): number {
    const buf = alpha ? alphaP : addP, max = alpha ? ALPHA_MAX : ADD_MAX;
    if (alpha ? pool.alphaN < max : pool.addN < max) { const i = alpha ? pool.alphaN++ : pool.addN++; return i; }
    let oi = 0, oa = -1;   // full: recycle the particle closest to its end (oldest first, never allocate)
    for (let i = 0; i < max; i++) { const f = buf[i * F + 6] / Math.max(1e-3, buf[i * F + 7]); if (f > oa) { oa = f; oi = i; } }
    return oi;
}
export let LOW = false;   // low quality tier: halve sparks, drop dust
export function setFxLow(v: boolean) { LOW = v; }
export function emit(shape: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, col: number, a = 1, grav = 0, drag = 0, thick = 0.12, fade = 1) {
    const alpha = shape >= 10, i = slot(alpha), b = alpha ? alphaP : addP, o = i * F;
    b[o] = x; b[o + 1] = y; b[o + 2] = z; b[o + 3] = vx; b[o + 4] = vy; b[o + 5] = vz; b[o + 6] = 0; b[o + 7] = life; b[o + 8] = s0; b[o + 9] = s1;
    b[o + 10] = ((col >> 16) & 255) / 255; b[o + 11] = ((col >> 8) & 255) / 255; b[o + 12] = (col & 255) / 255; b[o + 13] = a; b[o + 14] = shape; b[o + 15] = grav; b[o + 16] = drag;
    b[o + 17] = Math.random() * Math.PI * 2; b[o + 18] = thick; b[o + 19] = fade;
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
        }
        if (pass) pool.alphaN = n; else pool.addN = n;
    }
}
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
function sparks(n: number, x: number, y: number, z: number, col: number, sp0: number, sp1: number, life0: number, life1: number, w = 0.05, upBias = 0.25) {
    if (LOW) n = Math.ceil(n / 2);
    for (let k = 0; k < n; k++) {
        const u = rnd(-1, 1), th = rnd(0, Math.PI * 2), r = Math.sqrt(1 - u * u), sp = rnd(sp0, sp1);
        emit(SH_SPARK, x, y, z, Math.cos(th) * r * sp, (u * 0.8 + upBias) * sp, Math.sin(th) * r * sp, rnd(life0, life1), w, w * 0.6, k & 1 ? 0xffffff : col, 1, 4.9, 2.2);
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
    emit(SH_RING, x, y, z, 0, 0, 0, 0.18, 0.2 * sc, 1.2 * sc, col, 1, 0, 0, 0.1);                 // expanding ring
    sparks(lvl >= 3 ? 14 : lvl === 2 ? 8 : 6, x, y, z, col, 6, 12, 0.15, 0.3);                   // spark streaks
    if (lvl >= 3 && grounded && !LOW) for (let k = 0; k < 6; k++) { const th = rnd(0, Math.PI * 2), sp = rnd(1.5, 3); emit(SH_DUST, x + Math.cos(th) * 0.3, y - 0.9, z + Math.sin(th) * 0.3, Math.cos(th) * sp, rnd(0.4, 1.2), Math.sin(th) * sp, 0.45, 0.35, 0.9, 0xb9b2c6, 0.55, 0, 3); }
}
export function fxShot(x: number, y: number, z: number, col: number) {
    emit(SH_SPLAT, x, y, z, 0, 0, 0, 0.6, 0.75, 0.95, 0xffffff, 1, 0, 0, 0.12, 0);                  // web splat (fades over its last third)
    emit(SH_CORE, x, y, z, 0, 0, 0, 0.035, 0.35, 0.5, 0xffffff, 1);
    emit(SH_RING, x, y, z, 0, 0, 0, 0.12, 0.1, 0.6, col, 1, 0, 0, 0.12);
    sparks(4, x, y, z, col, 5, 9, 0.12, 0.15);
}
const CYAN = 0x7ff6ff;
/** Shock hit: cyan-white flash, jagged lightning from (hx,hy,hz) to the target, 8 sparks, ring */
export function fxShock(x: number, y: number, z: number, hx: number, hy: number, hz: number) {
    emit(SH_CORE, x, y, z, 0, 0, 0, 0.05, 0.8, 1.1, 0xe8ffff, 1);
    emit(SH_GLOW, x, y, z, 0, 0, 0, 0.2, 1.6, 1.8, CYAN, 0.9, 0, 0, 0.12, 2);
    emit(SH_RING, x, y, z, 0, 0, 0, 0.2, 0.3, 1.6, CYAN, 1, 0, 0, 0.1);
    sparks(8, x, y, z, CYAN, 5, 11, 0.15, 0.3);
    bolts.push({ ax: hx, ay: hy, az: hz, bx: x, by: y, bz: z, t: 0, life: 0.25 }); if (bolts.length > 5) bolts.shift();
    bolts.push({ ax: x, ay: y + 0.6, az: z, bx: x + rnd(-1, 1), by: y - 0.8, bz: z + rnd(-1, 1), t: 0, life: 0.2 }); if (bolts.length > 5) bolts.shift();
}
export const bolts: { ax: number; ay: number; az: number; bx: number; by: number; bz: number; t: number; life: number }[] = [];
/** Charged Slam impact on the ground at (x,gy,z), blast radius R */
export function fxSlam(x: number, gy: number, z: number, R: number, col: number) {
    screenFlash.frames = 2; screenFlash.a = 0.35;
    const y = gy + 0.06;
    emit(SH_GRING, x, y, z, 0, 0, 0, 0.28, 0.3, R, col, 1, 0, 0, 0.16);                          // shockwave ring 0 -> R in 280 ms
    emit(SH_GBAND, x, y + 0.01, z, 0, 0, 0, 0.28, 0.3, R, col, 1, 0, 0, 0.09);                   // comic ink band riding the same front
    emit(SH_GRING, x, y + 0.02, z, 0, 0, 0, 0.36, 0.2, R * 0.72, 0xffffff, 0.8, 0, 0, 0.1);     // white inner edge
    emit(SH_CORE, x, gy + 0.8, z, 0, 0, 0, 0.07, 1.6, 2.6, 0xffffff, 1);
    emit(SH_GLOW, x, gy + 0.6, z, 0, 0, 0, 0.4, 3.2, 4.2, col, 0.95, 0, 0, 0.12, 2);
    const ns = LOW ? 5 : 7;
    for (let k = 0; k < ns; k++) { const th = (k / ns) * Math.PI * 2 + rnd(-0.3, 0.3), L = R * rnd(0.55, 0.9); emit(SH_GSTREAK, x + Math.cos(th) * L * 0.5, y + 0.01, z + Math.sin(th) * L * 0.5, Math.cos(th) * L, 0, Math.sin(th) * L, 0.9, 0.22, 0.22, k & 1 ? 0xffffff : col, 1, 0, 0, 0.12, 1); }
    sparks(24, x, gy + 0.4, z, col, 8, 16, 0.25, 0.45, 0.06, 0.9);
    for (let k = 0; k < (LOW ? 5 : 10); k++) { const th = rnd(0, Math.PI * 2), sp = rnd(4, 9); emit(SH_CHUNK, x + Math.cos(th) * 0.5, gy + 0.2, z + Math.sin(th) * 0.5, Math.cos(th) * sp, rnd(5, 10), Math.sin(th) * sp, 0.7, 0.16, 0.12, 0x2a2733, 1, 24, 0.5); }
    if (!LOW) for (let k = 0; k < 8; k++) { const th = (k / 8) * Math.PI * 2, sp = rnd(4, 7); emit(SH_DUST, x + Math.cos(th) * 0.8, gy + 0.3, z + Math.sin(th) * 0.8, Math.cos(th) * sp, rnd(0.5, 1.5), Math.sin(th) * sp, 0.6, 0.7, 1.8, 0xbdb6cc, 0.6, 0, 2.5); }
}
/** per-frame charge feedback: inward particles toward the fist */
export function fxChargeTick(hx: number, hy: number, hz: number, c: number, col: number, dt: number, acc: { v: number }) {
    acc.v += dt * (4 + 12 * c) / 0.25;   // 4 -> 16 live at once (life 250 ms)
    while (acc.v >= 1) {
        acc.v -= 1; const u = rnd(-1, 1), th = rnd(0, Math.PI * 2), r = Math.sqrt(1 - u * u), d = rnd(0.9, 1.5);
        const ox = Math.cos(th) * r * d, oy = u * d, oz = Math.sin(th) * r * d;
        emit(SH_SPARK, hx + ox, hy + oy, hz + oz, -ox / 0.25, -oy / 0.25, -oz / 0.25, 0.25, 0.04, 0.02, Math.random() < 0.5 ? 0xffffff : col, 0.9);
    }
}
export function resetFx() { pool.addN = 0; pool.alphaN = 0; for (const t of trails) t.n = 0; bolts.length = 0; screenFlash.frames = 0; }
/** Shock discharge around the caster: ground shockwave to the hit range, core flash, glow */
export function fxDischarge(x: number, gy: number, z: number, R: number, col: number) {
    const y = gy + 0.06;
    emit(SH_GRING, x, y, z, 0, 0, 0, 0.25, 0.4, R, CYAN, 1, 0, 0, 0.14);
    emit(SH_GBAND, x, y + 0.01, z, 0, 0, 0, 0.25, 0.4, R, col, 1, 0, 0, 0.08);
    emit(SH_CORE, x, gy + 1.2, z, 0, 0, 0, 0.06, 1.2, 2.0, 0xe8ffff, 1);
    emit(SH_GLOW, x, gy + 1.2, z, 0, 0, 0, 0.3, 2.4, 3.0, CYAN, 0.9, 0, 0, 0.12, 2);
}
