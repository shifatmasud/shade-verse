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
// Nov 2 (Shifat: "Punch hit effect mustn't be comic like", "only glowing blurry vfx", "no sharp edges"): comic hit-star, ink web splat
// and square debris removed; only soft dust remains on the alpha side.
export const SH_DUST = 12, SH_SMOKE = 13;   // SH_SMOKE: soft dark-to-warm smoke puff (warm glowing centre early, dark soft edge, no rim)

export const ADD_MAX = 256, ALPHA_MAX = 32;   // Nov 2 3:00 PM (web-shot particles): 128 -> 256 additive (one instanced draw either way)
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
export const ADD_LOW = 144, ALPHA_LOW = 20;   // phone: 80 -> 144 for the web-shot trail (sprites are small)
export let LOW = QK.fxLow;
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
function sparks(n: number, x: number, y: number, z: number, col: number, sp0: number, sp1: number, life0: number, life1: number, w = 0.05, upBias = 0.25, floor = -1e9, hot = 0xffffff) {
    if (LOW) n = Math.ceil(n / 2);
    for (let k = 0; k < n; k++) {
        const u = rnd(-1, 1), th = rnd(0, Math.PI * 2), r = Math.sqrt(1 - u * u), sp = rnd(sp0, sp1);
        emit(SH_SPARK, x, y, z, Math.cos(th) * r * sp, (u * 0.8 + upBias) * sp, Math.sin(th) * r * sp, rnd(life0, life1), w, w * 0.6, k & 1 ? hot : col, 1, 4.9, 2.2, 0.12, 1, floor);
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
/** melee hit at (x,y,z); lvl 1/2/3 = combo hit 1, 2, finisher; (dx,dz) = direction of the blow (attacker -> target), sparks spray through.
 *  Cinematic, not comic (refs: Marvel's Spider-Man 2 / God of War / Ghost of Tsushima impacts): a 3-frame white-hot core, a white-orange
 *  flash bloom, hero-colour bloom, faint heat falloff, a dense high-velocity PARTICLE BURST (velocity-stretched glowing streaks that cool
 *  white -> orange, gravity, drag, bounce), a soft ember cloud that drifts and lingers briefly, and a soft dark-to-warm smoke puff
 *  (alpha-blended, not additive) behind it so the burst still reads on bright roofs. Every shape is a soft falloff, no edge.
 *  Nov 2 (Shifat: "Comic hit star must be replaced by particle burst"): ~2x sparks and size vs ca27334, life 250-380 ms. */
export function fxMelee(x: number, y: number, z: number, col: number, lvl: number, grounded = true, dx = 0, dz = 0) {
    const sc = lvl >= 3 ? 1.5 : lvl === 2 ? 1.15 : 1, floor = grounded ? y - 1.0 : -1e9;
    const dl = Math.hypot(dx, dz), bx = dl > 1e-3 ? dx / dl : 0, bz = dl > 1e-3 ? dz / dl : 0;
    // soft dark-to-warm smoke puff first (alpha pool, drawn under the additive light): contrast on bright backgrounds
    const ns = LOW ? 2 : 3;
    for (let k = 0; k < ns; k++) emit(SH_SMOKE, x + rnd(-0.12, 0.12) + bx * 0.15, y + rnd(-0.08, 0.12), z + rnd(-0.12, 0.12) + bz * 0.15, bx * 1.6 + rnd(-0.5, 0.5), rnd(0.2, 0.7), bz * 1.6 + rnd(-0.5, 0.5), rnd(0.42, 0.55), 0.3 * sc, rnd(0.95, 1.2) * sc, 0x2a2026, 0.6, -0.4, 3);
    emit(SH_CORE, x, y, z, 0, 0, 0, 0.05, 0.6 * sc, 1.15 * sc, 0xfff4e6, 1.35);                    // white-hot core, ~3 frames
    emit(SH_GLOW, x, y, z, 0, 0, 0, 0.1, 0.9 * sc, 1.4 * sc, 0xffa65a, lvl >= 3 ? 0.85 : 1.0, 0, 0, 0.12, 2);        // white-orange flash bloom
    emit(SH_GLOW, x, y, z, 0, 0, 0, 0.26, 1.1 * sc, 1.8 * sc, col, 0.8, 0, 0, 0.12, 2);            // hero-colour bloom
    emit(SH_GLOW, x, y, z, 0, 0, 0, 0.45, 1.6 * sc, 2.5 * sc, 0xff9050, 0.2, 0, 0, 0.12, 1);       // faint heat falloff
    let n = lvl >= 3 ? 40 : lvl === 2 ? 26 : 18; if (LOW) n = Math.ceil(n / 2);
    for (let k = 0; k < n; k++) {   // particle burst: radial spray biased along the blow, a few go back toward the camera side
        const u = rnd(-0.7, 1), th = rnd(0, Math.PI * 2), r = Math.sqrt(1 - u * u * 0.5), sp = rnd(10, 22) * (k < n * 0.3 ? 1.2 : 1);
        let vx = Math.cos(th) * r, vy = u * 0.75 + 0.25, vz = Math.sin(th) * r; const fw = Math.random() < 0.7 ? 1.4 : -0.4; vx += bx * fw; vz += bz * fw;
        const L = Math.hypot(vx, vy, vz) || 1, hot = Math.random() < 0.7;
        emit(SH_SPARK, x, y, z, vx / L * sp, vy / L * sp, vz / L * sp, rnd(0.25, 0.38), rnd(0.07, 0.1) * sc, 0.035, hot ? 0xff8a3a : col, hot ? 1.5 : 1.25, 9.8, 2.4, 1.5, 1, floor);
    }
    const ne = (lvl >= 3 ? 14 : lvl === 2 ? 10 : 8) >> (LOW ? 1 : 0);
    for (let k = 0; k < ne; k++) {   // soft glowing ember cloud: slow, drifting up, lingers ~0.5-0.8 s
        const th = rnd(0, Math.PI * 2), sp = rnd(1.2, 3.5);
        emit(SH_GLOW, x + rnd(-0.15, 0.15), y + rnd(-0.12, 0.12), z + rnd(-0.15, 0.15), Math.cos(th) * sp + bx * 1.5, rnd(-0.4, 1.6), Math.sin(th) * sp + bz * 1.5, rnd(0.5, 0.8), rnd(0.09, 0.14) * sc, 0.04, Math.random() < 0.6 ? 0xffb060 : col, 1.1, -0.8, 3.5, 0.12, 1);
    }
    if (!LOW) for (let k = 0; k < 3; k++) emit(SH_DUST, x + rnd(-0.15, 0.15), y + rnd(-0.1, 0.1), z + rnd(-0.15, 0.15), bx * 1.2 + rnd(-0.6, 0.6), rnd(0.1, 0.6), bz * 1.2 + rnd(-0.6, 0.6), 0.5, 0.25 * sc, 0.8 * sc, 0xb5aec2, 0.35, 0, 3);   // small dust puff
    if (lvl >= 3 && grounded && !LOW) for (let k = 0; k < 6; k++) { const th = rnd(0, Math.PI * 2), sp = rnd(1.5, 3); emit(SH_DUST, x + Math.cos(th) * 0.3, y - 0.9, z + Math.sin(th) * 0.3, Math.cos(th) * sp, rnd(0.4, 1.2), Math.sin(th) * sp, 0.45, 0.35, 0.9, 0xb9b2c6, 0.55, 0, 3); }
}
/** web-shot hit (Shifat Nov 2 3:00 PM: "Web shot must have more layered vfx. Plain glowy orb projectiles feels basic. Use particles"):
 *  layered, all soft falloffs in the caster's colour (Shadow purple / Ghost pink): a 3-frame white-hot core, a hot flash, a hero-colour
 *  bloom, a wide faint wash (the blast reach), velocity-stretched sparks scattered in a hemisphere around the surface normal (n = toward
 *  the shooter, lifted a little so ground hits spray up), slow glowing motes that drift off the normal and fade, and the pale web mist.
 *  Replaces the old flash sprite + 12 round points (enemies.tsx PlasmaFx): same pooled instanced draw as every other hit. */
export function fxShot(x: number, y: number, z: number, col: number, nx = 0, ny = 1, nz = 0) {
    let ux = nx, uy = ny + 0.35, uz = nz; const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
    const hot = tint(col, 0.72);
    emit(SH_CORE, x, y, z, 0, 0, 0, 0.05, 0.45, 0.85, tint(col, 0.85), 1.25);                       // white-hot core, ~3 frames
    emit(SH_GLOW, x, y, z, 0, 0, 0, 0.12, 0.8, 1.7, tint(col, 0.5), 0.85, 0, 0, 0.12, 2);           // hot flash
    emit(SH_GLOW, x, y, z, 0, 0, 0, 0.3, 1.0, 2.6, col, 0.6, 0, 0, 0.12, 2);                         // hero-colour bloom
    emit(SH_GLOW, x, y, z, 0, 0, 0, 0.34, 1.6, 5.5, col, 0.16, 0, 0, 0.12, 2);                       // wide faint wash (blast reach)
    const n = LOW ? 7 : 14;
    for (let k = 0; k < n; k++) {   // sparks: hemisphere around the normal, stretched along their velocity, cool hot -> hero colour
        const a = rnd(-1, 1), th = rnd(0, Math.PI * 2), r = Math.sqrt(1 - a * a);
        let vx = ux + Math.cos(th) * r * 0.85, vy = uy + a * 0.85, vz = uz + Math.sin(th) * r * 0.85;
        if (vx * ux + vy * uy + vz * uz < 0.1) { vx += ux; vy += uy; vz += uz; }
        const L = Math.hypot(vx, vy, vz) || 1, sp = rnd(7, 16);
        emit(SH_SPARK, x, y, z, vx / L * sp, vy / L * sp, vz / L * sp, rnd(0.2, 0.36), rnd(0.05, 0.07), 0.02, k & 1 ? hot : col, 1.35, 7, 3, 1.5, 1);
    }
    const nm = LOW ? 4 : 8;
    for (let k = 0; k < nm; k++) emit(SH_GLOW, x + rnd(-0.12, 0.12), y + rnd(-0.12, 0.12), z + rnd(-0.12, 0.12), ux * rnd(0.8, 2.2) + rnd(-1.2, 1.2), uy * rnd(0.8, 2.2) + rnd(-0.6, 0.9), uz * rnd(0.8, 2.2) + rnd(-1.2, 1.2), rnd(0.45, 0.75), rnd(0.1, 0.16), 0.03, k & 1 ? hot : col, 1.0, -0.6, 2.5, 0.12, 1);   // drifting glow motes
    if (!LOW) for (let k = 0; k < 3; k++) emit(SH_DUST, x, y, z, rnd(-0.8, 0.8), rnd(-0.3, 0.6), rnd(-0.8, 0.8), 0.5, 0.2, 0.6, tint(col, 0.7), 0.4, 0, 3);   // soft web mist, pale caster tint
}
/** web-shot fire: soft muzzle burst at the hands along the shot direction (dx,dy,dz unit): hot core pop, hero-colour bloom,
 *  a cone of short stretched sparks with heavy drag, and a few slow motes. */
export function fxShotMuzzle(x: number, y: number, z: number, dx: number, dy: number, dz: number, col: number) {
    const hot = tint(col, 0.75);
    emit(SH_CORE, x, y, z, 0, 0, 0, 0.05, 0.25, 0.5, tint(col, 0.85), 1.1);
    emit(SH_GLOW, x, y, z, 0, 0, 0, 0.14, 0.5, 1.1, col, 0.7, 0, 0, 0.12, 2);
    const n = LOW ? 5 : 9;
    for (let k = 0; k < n; k++) {
        const vx = dx + rnd(-0.5, 0.5), vy = dy + rnd(-0.4, 0.5), vz = dz + rnd(-0.5, 0.5), L = Math.hypot(vx, vy, vz) || 1, sp = rnd(5, 12);
        emit(SH_SPARK, x, y, z, vx / L * sp, vy / L * sp, vz / L * sp, rnd(0.1, 0.18), 0.045, 0.015, k & 1 ? hot : col, 1.2, 2, 7, 1.3, 1);
    }
    for (let k = 0; k < (LOW ? 2 : 3); k++) emit(SH_GLOW, x, y, z, dx * rnd(1, 2.5) + rnd(-0.6, 0.6), dy * rnd(1, 2.5) + rnd(-0.2, 0.7), dz * rnd(1, 2.5) + rnd(-0.6, 0.6), rnd(0.3, 0.45), 0.2, 0.05, col, 0.5, -0.4, 3, 0.12, 1);
}
/** web-shot trail, one puff at (x,y,z) of a bolt flying along (dx,dy,dz unit); k = running count. Velocity-stretched streaks shed
 *  forward and slightly outward (heavy drag: they slow, shrink and cool white -> hero colour), every 2nd a soft glow puff that drifts. */
export function fxShotTrail(x: number, y: number, z: number, dx: number, dy: number, dz: number, col: number, k: number) {
    const px = rnd(-1, 1), py = rnd(-1, 1), pz = rnd(-1, 1), dp = px * dx + py * dy + pz * dz;
    let ox = px - dx * dp, oy = py - dy * dp, oz = pz - dz * dp; const ol = Math.hypot(ox, oy, oz) || 1; ox /= ol; oy /= ol; oz /= ol;   // random direction across the path
    const f = rnd(2, 6), o = rnd(0.8, 2.4), r0 = rnd(0.03, 0.12);
    emit(SH_SPARK, x + ox * r0, y + oy * r0, z + oz * r0, dx * f + ox * o, dy * f + oy * o + 0.3, dz * f + oz * o, rnd(0.24, 0.4), 0.07, 0.014, k % 3 === 0 ? tint(col, 0.5) : col, 1.0, -0.8, 4.5, 1.2, 1);
    if (k & 1) emit(SH_GLOW, x + ox * r0, y + oy * r0, z + oz * r0, dx * 1.2 + ox * rnd(0.4, 1.1), dy * 1.2 + oy * rnd(0.4, 1.1) + 0.35, dz * 1.2 + oz * rnd(0.4, 1.1), rnd(0.34, 0.5), rnd(0.45, 0.6), 0.1, tint(col, 0.2), 1.0, 0, 2.5, 0.12, 1);   // soft haze puff: drifts, shrinks, fades
}
/** trail puff spacing in metres along the bolt's path (phone: sparser) */
export const SHOT_TRAIL_STEP = LOW ? 0.7 : 0.4;
/* Shifat Nov 2 10:40 AM: "Ghosts shock color must be pink, & purple for shadow" - every part of the Web Shock (tethers, hand glow, lightning,
   ground arcs, discharge burst, sparks, glow) takes the caster's own colour: Shadow purple 0xa855f7, Ghost pink 0xff1a96 (sim fxCol). Was one cyan for both. */
export const SHOCK_SHADOW = 0xa855f7, SHOCK_GHOST = 0xff1a96;
/** caster colour lifted toward white by k (0..1): the hot core of a soft glow keeps the hue instead of going cyan/white */
export function tint(col: number, k: number) { const r = (col >> 16) & 255, g = (col >> 8) & 255, b = col & 255; return (Math.round(r + (255 - r) * k) << 16) | (Math.round(g + (255 - g) * k) << 8) | Math.round(b + (255 - b) * k); }
/** Shock hit: caster-coloured flash, jagged lightning from (hx,hy,hz) to the target + crackle arcs on the bot, spark burst, glow */
export function fxShock(x: number, y: number, z: number, hx: number, hy: number, hz: number, col = SHOCK_SHADOW) {
    const hot = tint(col, 0.72), mid = tint(col, 0.35);
    emit(SH_CORE, x, y, z, 0, 0, 0, 0.05, 0.8, 1.1, hot, 1);
    emit(SH_GLOW, x, y, z, 0, 0, 0, 0.2, 1.6, 1.8, col, 0.9, 0, 0, 0.12, 2);
    sparks(12, x, y, z, mid, 5, 12, 0.15, 0.32, 0.04, 0.25, y - 0.95, hot);
    bolt(hx, hy, hz, x, y, z, 0.25, col);
    bolt(x, y + 0.6, z, x + rnd(-1, 1), y - 0.8, z + rnd(-1, 1), 0.2, col);
    bolt(x, y, z, x + rnd(-0.9, 0.9), y + rnd(0.3, 0.9), z + rnd(-0.9, 0.9), 0.14, col);   // crackle arc on the bot
}
export const BOLT_MAX = 10;
function bolt(ax: number, ay: number, az: number, bx: number, by: number, bz: number, life: number, col = SHOCK_SHADOW) { bolts.push({ ax, ay, az, bx, by, bz, t: 0, life, col }); if (bolts.length > BOLT_MAX) bolts.shift(); }
export const bolts: { ax: number; ay: number; az: number; bx: number; by: number; bz: number; t: number; life: number; col: number }[] = [];
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
/** Shock discharge around the caster: lightning arcs racing out along the ground to the hit range, ground-hugging light burst,
 *  caster-coloured spark burst, core flash, glow (no ring) */
export function fxDischarge(x: number, gy: number, z: number, R: number, col: number) {
    const y = gy + 0.08, hot = tint(col, 0.72), mid = tint(col, 0.35);
    emit(SH_CORE, x, gy + 1.2, z, 0, 0, 0, 0.06, 1.2, 2.0, hot, 1);
    emit(SH_GLOW, x, gy + 1.2, z, 0, 0, 0, 0.3, 2.4, 3.0, col, 0.9, 0, 0, 0.12, 2);
    emit(SH_GPUFF, x, y, z, 0, 0, 0, 0.4, R * 0.4, R * 0.8, col, 0.35, 0, 0, 0.12, 2);
    const nb = LOW ? 4 : 6;
    for (let k = 0; k < nb; k++) { const th = (k / nb) * Math.PI * 2 + rnd(-0.3, 0.3), L = R * rnd(0.6, 1); bolt(x, gy + 0.9, z, x + Math.cos(th) * L, y, z + Math.sin(th) * L, rnd(0.18, 0.26), col); }
    const np = LOW ? 10 : 16, d = 5;
    for (let k = 0; k < np; k++) { const th = (k / np) * Math.PI * 2 + rnd(-0.15, 0.15), life = rnd(0.3, 0.4), v0 = R * d / (1 - Math.exp(-d * life)); emit(SH_GPUFF, x + Math.cos(th) * 0.3, y, z + Math.sin(th) * 0.3, Math.cos(th) * v0, 0, Math.sin(th) * v0, life, 0.3, 0.7, k & 1 ? hot : mid, 0.8, 0, d, 0.12, 1); }
    sparks(16, x, gy + 1.0, z, mid, 6, 13, 0.2, 0.4, 0.045, 0.3, gy + 0.03, hot);
}
