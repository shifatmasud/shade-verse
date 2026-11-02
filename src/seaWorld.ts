// South Sea plan, steps 2-4 (Shifat Oct 29): the jungle island, the long bridge and the 2nd city.
// Pure data + height functions shared by the sim (walk / land / swim / anchors) and the renderer. No imports from sim.ts
// (sim.ts imports this file), so the few world constants it needs are repeated here.
export interface SeaBld { x0: number; x1: number; z0: number; z1: number; h: number; y0?: number; sea: true; kind: 'light' | 'shack' | 'tower' | 'harbor' | 'solid'; host?: number; ob?: [number, number, number, number, number] }   // ob = oriented box [cx, cz, yaw, halfX, halfZ]; x0..z1 then encloses it
const W_Y = -1.0;
const sm = (a: number, b: number, v: number) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- STEP 2: the island
// ~600 m offshore, a bit west. Bridge-free (Shifat 4:49 PM: "Jungle Island shouldn't have bridge"): reach it by swimming, gliding or a boat.
export const ISLAND = { cx: -160, cz: -820, R: 92 };
export const LAGOON = { cx: ISLAND.cx + 40, cz: ISLAND.cz - 30, r: 17, y: 0.9 };
export const PEAK = { x: ISLAND.cx - 12, z: ISLAND.cz + 14 };
export const POOL = { cx: ISLAND.cx + 12, cz: ISLAND.cz - 14, r: 9, y: 0 };   // y filled below (waterfall plunge pool on the hill's flank)
// 2c (Shifat 5:49 PM "island looks shitty, unrealistic shaped"): an organic coastline (five harmonics: headlands, bays and a small cove
// at the river mouth; the ocean shader's shallows ring uses the same formula) and one long natural ridge with gentle foothills.
export const COAST: [number, number, number][] = [[0.13, 2, 3.16], [0.085, 3, 5.06], [0.05, 5, 0.83], [0.03, 8, 4.71], [0.018, 13, 2.25]];
export function coastK(a: number) { let k = 1; for (const [A, f, ph] of COAST) k += A * Math.sin(f * a + ph); return k; }
export function islandRR(x: number, z: number) {
    const dx = x - ISLAND.cx, dz = z - ISLAND.cz, a = Math.atan2(dz, dx);
    return Math.hypot(dx, dz) / (ISLAND.R * coastK(a));
}
const RIDGE = (() => { const dx = 24, dz = -28, l = Math.hypot(dx, dz); return { ux: dx / l, uz: dz / l }; })();   // the ridge runs from the summit down past the waterfall
function hillH(x: number, z: number) {
    const rx = x - PEAK.x, rz = z - PEAK.z, u = rx * RIDGE.ux + rz * RIDGE.uz, v = -rx * RIDGE.uz + rz * RIDGE.ux;
    const ridge = 25 * Math.exp(-((u / (u > 0 ? 50 : 30)) ** 2) - ((v / 22) ** 2));
    const d2 = Math.hypot(x - (ISLAND.cx - 40), z - (ISLAND.cz - 24));
    return ridge + 6 * Math.exp(-((d2 / 26) ** 2)) + 1.3 * Math.sin(x * 0.11 + 0.4) * Math.cos(z * 0.09) + 0.6 * Math.sin(x * 0.23 - z * 0.19) + 0.25 * Math.sin(x * 0.61 + z * 0.47);
}
// South Sea 2b (Shifat 5:13 PM "long grasses, more tree variations, river, better water fall"): a cliff notch behind the plunge pool
// for a real free-falling waterfall, and a river (pool -> lagoon -> sea) carved into the terrain.
const toPeak = (() => { const dx = PEAK.x - POOL.cx, dz = PEAK.z - POOL.cz, l = Math.hypot(dx, dz); return [dx / l, dz / l]; })();
export const FALL_WALL = 10.2;   // metres from the pool centre (uphill) to the cliff face
function cliffBump(x: number, z: number) { const cx = POOL.cx + toPeak[0] * (FALL_WALL + 5), cz = POOL.cz + toPeak[1] * (FALL_WALL + 5), d = Math.hypot(x - cx, z - cz); return 9 * Math.exp(-((d / 9) ** 2)); }
export interface River { pts: [number, number][]; y0: number; y1: number; hw: number; hw1: number; len: number; acc: number[]; tEnd?: number }
export const RIVERS: River[] = [];
// water blend (Shifat 6:39 PM "sharp water… connect & blend from water fall to river to sea"): the control points are run through a
// Catmull-Rom spline sampled every ~1.5 m, so the carved channel and the water strip bend in smooth curves instead of hard corners.
function smoothPts(cp: [number, number][], step = 1.5): [number, number][] {
    const P = (i: number) => cp[Math.max(0, Math.min(cp.length - 1, i))], out: [number, number][] = [];
    for (let i = 0; i < cp.length - 1; i++) {
        const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2), n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
        for (let k = 0; k < n; k++) { const t = k / n, t2 = t * t, t3 = t2 * t; out.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)) as [number, number]); }
    }
    out.push(cp[cp.length - 1]); return out;
}
/** water height along a river at fraction t: eases into its end level with no kink (the old min(1, t*1.15) left a crease) */
export function riverY(r: { y0: number; y1: number; tEnd?: number }, t: number) { const u = Math.min(1, t / (r.tEnd ?? 0.87)); return r.y0 + (r.y1 - r.y0) * u * u * (3 - 2 * u); }
function mkRiver(cpts: [number, number][], y0: number, y1: number, hw: number, hw1 = hw) { const pts = smoothPts(cpts); const acc = [0]; for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); const r: River = { pts, y0, y1, hw, hw1, len: acc[acc.length - 1], acc };
    // a river that runs out to sea reaches sea level AT the coastline (it used to still be ~1.4 m up there and stop on dry sand)
    if (y1 < -0.5) { const i = pts.findIndex((p) => islandRR(p[0], p[1]) > 0.97); if (i > 0) r.tEnd = acc[i] / r.len; }
    RIVERS.push(r); return r; }
/** river half-width at fraction t of its length (2c: the sea reach widens into an estuary) */
export function riverHW(r: River, t: number) { return r.hw + (r.hw1 - r.hw) * t * t; }
/** nearest point on a river: distance, water height there and flow direction */
export function riverNear(x: number, z: number): { d: number; y: number; fx: number; fz: number; hw: number } | null {
    let best: { d: number; y: number; fx: number; fz: number; hw: number } | null = null;
    for (const r of RIVERS) for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), d = Math.hypot(x - ax - dx * t, z - az - dz * t);
        if (d > r.hw1 * 3 || (best && d >= best.d)) continue;
        const sAlong = (r.acc[i] + Math.sqrt(l2) * t) / r.len, l = Math.sqrt(l2);
        best = { d, y: riverY(r, sAlong), fx: dx / l, fz: dz / l, hw: riverHW(r, sAlong) };
    }
    return best;
}
export const RIVER_DEEP = 4.2;   // metres of water in the river's centre
function islandRaw(x: number, z: number, pools = true): number | null {
    const rr = islandRR(x, z);
    if (rr > 1.6) return null;
    if (rr >= 1.0) { let y = -2.6 - 42 * (rr - 1.0); if (pools && rr < 1.25) { const rv = riverNear(x, z); if (rv && rv.d < rv.hw * 2.6) y = Math.min(y, rv.y - RIVER_DEEP); } return y; }
    let y = 1.5 + 0.25 * Math.sin(x * 0.3 + z * 0.2);
    if (rr >= 0.8) y = y + (-2.6 - y) * sm(0.8, 1.0, rr);   // white-sand beach sloping into the sea
    else y += (hillH(x, z) + cliffBump(x, z)) * sm(0.8, 0.42, rr);   // long gentle foothills down to the beach
    if (pools) {
        const dl = Math.hypot(x - LAGOON.cx, z - LAGOON.cz) / LAGOON.r;
        if (dl < 1.7) y = y + (LAGOON.y + 0.5 - 7.5 * sm(0.95, 0.35, dl) - y)   /* 9:28 PM 'increase the depth of the lake': 3.4 -> 7.5 m */ * sm(1.7, 1.0, dl);
        const dp = Math.hypot(x - POOL.cx, z - POOL.cz) / POOL.r;
        if (dp < 1.8) y = y + (POOL.y + 0.5 - 5.0 * sm(0.95, 0.5, dp) - y) * sm(1.8, 1.0, dp);
        {   // waterfall notch: flat at pool level up to the cliff face, then a near-vertical wall up to the ledge
            const rx = x - POOL.cx, rz = z - POOL.cz, along = rx * toPeak[0] + rz * toPeak[1], perp = Math.abs(-rx * toPeak[1] + rz * toPeak[0]);
            if (along > 0 && along < 30 && perp < 11) { const floor = POOL.y + 0.5 + Math.max(0, along - FALL_WALL) * 7, wf = sm(14, 6.5, perp); /* water blend: wider, softer notch sides (rounded gorge, not a sharp shelf) */ y = y + (Math.min(y, floor) - y) * wf; }
        }
        const rv = riverNear(x, z);
        if (rv && rv.d < rv.hw * 2.6) { const bed = rv.y - RIVER_DEEP + (RIVER_DEEP + 0.5) * sm(rv.hw * 0.7, rv.hw * 1.6, rv.d);   /* deep swimmable channel (was 1.4 m) */ y = y + (bed - y) * sm(rv.hw * 2.6, rv.hw * 1.6, rv.d); }
    }
    return y;
}
POOL.y = (islandRaw(POOL.cx, POOL.cz, false) as number) - 1.2;
/* Oct 29 9:20 PM (Shifat: "make water fall to sea a direct curved river blended into sea water… make them deep so it feels better to swim under river water"):
   ONE curved river now runs straight from the plunge pool to the south coast and widens into the sea (the old pool→lagoon→east-coast pair is gone; the lagoon stays a pond). */
mkRiver([[POOL.cx + 2, POOL.cz - 8], [POOL.cx - 2, POOL.cz - 22], [POOL.cx - 6, POOL.cz - 38], [POOL.cx - 4, POOL.cz - 56], [POOL.cx - 1, POOL.cz - 74], [POOL.cx + 1, POOL.cz - 92], [POOL.cx + 2, POOL.cz - 108]], POOL.y, -1.0, 4.2, 12);
export const LAGOON_RIM = 0.93, POOL_RIM = 0.9;
/** island ground height (may be under the sea near the edge), or null away from the island */
export function islandH(x: number, z: number): number | null { return islandRaw(x, z) ?? farmRaw(x, z) ?? iceRaw(x, z); }
export function isIsland(x: number, z: number, pad = 1.3) { return Math.hypot(x - ISLAND.cx, z - ISLAND.cz) < ISLAND.R * pad; }
export function islandPeakY() { return islandRaw(PEAK.x, PEAK.z) as number; }
// waterfall: a free-falling sheet just in front of the cliff face, from the ledge down into the plunge pool
export const FALLS = { x: POOL.cx + toPeak[0] * (FALL_WALL - 0.7), z: POOL.cz + toPeak[1] * (FALL_WALL - 0.7), dx: -toPeak[0], dz: -toPeak[1], top: 0, w: 9 };
FALLS.top = (islandRaw(POOL.cx + toPeak[0] * (FALL_WALL + 3.5), POOL.cz + toPeak[1] * (FALL_WALL + 3.5)) as number);

// inland pools (lake-style water, swimmable): lagoon + waterfall pool
export const POOLS = [{ ...LAGOON, rim: LAGOON_RIM }, { cx: POOL.cx, cz: POOL.cz, r: POOL.r, y: POOL.y, rim: POOL_RIM }];
export function poolAt(x: number, z: number): { y: number; fx?: number; fz?: number } | null {
    for (const p of POOLS) { const dx = (x - p.cx) / p.r, dz = (z - p.cz) / p.r; if (dx * dx + dz * dz < p.rim * p.rim) return p; }
    if (Math.hypot(x - ISLAND.cx, z - ISLAND.cz) < ISLAND.R * 1.15) { const rv = riverNear(x, z); if (rv && rv.d < rv.hw * 1.2 && rv.y > -0.9) return { y: rv.y, fx: rv.fx, fz: rv.fz }; }   // the river swims too (with a current)
    return null;
}

// ---------------------------------------------------------------- Farm Isle (Shifat Oct 31 6:25 PM: 'Village should be a separate island on sea, from another side of city')
// A low green farm island east of the bridge: gentle rolling fields on a sandy rim. Same rules as the jungle island: the sim and the
// renderer read this one function, so what you see is what you walk on.
export const FARM = { cx: 392, cz: -585, R: 98 };
export function farmRR(x: number, z: number) {
    const dx = x - FARM.cx, dz = z - FARM.cz, a = Math.atan2(dz, dx);
    const k = 1 + 0.09 * Math.sin(a * 3 + 0.7) + 0.05 * Math.sin(a * 5 + 2.1) + 0.03 * Math.sin(a * 9 + 4.0);
    return Math.hypot(dx, dz) / (FARM.R * k);
}
export function farmRaw(x: number, z: number): number | null {
    const rr = farmRR(x, z);
    if (rr > 1.7) return null;
    if (rr >= 1.0) return -2.6 - 30 * (rr - 1.0);
    let y = 1.6 + 0.9 * Math.sin(x * 0.031 + 0.4) * Math.cos(z * 0.027 - 0.8) + 0.5 * Math.sin(x * 0.07 - z * 0.05);   // rolling fields
    y += 2.2 * Math.max(0, 1 - Math.hypot(x - (FARM.cx + 34), z - (FARM.cz + 22)) / 38) ** 2;                          // the windmill knoll
    if (rr >= 0.84) y = y + (-2.6 - y) * sm(0.84, 1.0, rr);                                                              // sand rim into the sea
    return y;
}
export function isFarm(x: number, z: number, pad = 1.3) { return Math.hypot(x - FARM.cx, z - FARM.cz) < FARM.R * pad; }

// ---------------------------------------------------------------- Ice Isle (Shifat Oct 31 6:25 PM: 'Iceberg too is an island from another side of the city')
// A glacier island west of the jungle island: an ice shelf with sheer blue ice cliffs into the sea, a snow-capped glacier dome in the middle.
export const ICE = { cx: -440, cz: -500, R: 62 };
export function iceRR(x: number, z: number) {
    const dx = x - ICE.cx, dz = z - ICE.cz, a = Math.atan2(dz, dx);
    const k = 1 + 0.11 * Math.sin(a * 2 + 1.9) + 0.07 * Math.sin(a * 5 + 0.4) + 0.04 * Math.sin(a * 11 + 2.7);
    return Math.hypot(dx, dz) / (ICE.R * k);
}
export function iceRaw(x: number, z: number): number | null {
    const rr = iceRR(x, z);
    if (rr > 1.5) return null;
    if (rr >= 0.97) return -9 - 25 * (rr - 0.97);                                                                  // sheer ice cliff foot, deep water
    let y = 4.2 + 0.6 * Math.sin(x * 0.11 + z * 0.07) * Math.sin(x * 0.05 - z * 0.13);                               // shelf top
    const dome = Math.max(0, 1 - Math.hypot(x - (ICE.cx - 8), z - (ICE.cz - 6)) / 40);
    const d2 = Math.max(0, 1 - Math.hypot(x - (ICE.cx + 18), z - (ICE.cz - 20)) / 24);
    const ridge = 1 - Math.abs(Math.sin(x * 0.16 + Math.sin(z * 0.07) * 2.2) * Math.cos(z * 0.13 - x * 0.04));          // sharp seracs / pressure ridges
    y += 15 * dome * dome * (3 - 2 * dome) + 7 * d2 * d2 * (3 - 2 * d2) + 4.5 * ridge * ridge * Math.max(dome, d2) + 1.2 * ridge * (1 - dome);   // twin glacier domes
    if (rr > 0.9) y = y + (-9 - y) * sm(0.9, 0.97, rr);                                                             // the cliff drop
    return y;
}
export function isIce(x: number, z: number, pad = 1.3) { return Math.hypot(x - ICE.cx, z - ICE.cz) < ICE.R * pad; }

// ---------------------------------------------------------------- walkable decks (dock now; bridge + harbor platform later)
export interface Deck { x0: number; x1: number; z0: number; z1: number; y: number }
const DECKS: Deck[] = [];
export const DOCK = { x: ISLAND.cx + 18, z0: 0, z1: 0, w: 4.2, y: 0.55 };
{   // the dock runs north from the beach toward the city
    let z = ISLAND.cz; while ((islandRaw(DOCK.x, z) ?? -9) > 0.2) z += 1;
    DOCK.z0 = z - 6; DOCK.z1 = z + 30;
    DECKS.push({ x0: DOCK.x - DOCK.w / 2, x1: DOCK.x + DOCK.w / 2, z0: DOCK.z0, z1: DOCK.z1, y: DOCK.y });
}
export const decks = DECKS;

// ---------------------------------------------------------------- Tech pirate ship (Shifat Oct 31 7:05 PM: 'another island like big ship on another side, like big pirate
// ship ... modern pirate ship full of tech'). A 120 m carbon-black galleon moored in the far south-west sea. Its decks are one-way walkable rectangles
// (the same deck rule as the dock and the harbor), so you can land on it, run its length and swing off its masts.
export const PIRATE = { cx: -440, cz: -1090, L: 120, B: 26, deck: 7.5 };
/** half-beam of the hull at local x (stern at -L/2, bow at +L/2); also used by the renderer's loft */
export function pirateHalfBeam(lx: number) {
    const t = (lx + PIRATE.L / 2) / PIRATE.L;
    if (t < 0 || t > 1) return 0;
    const bow = t > 0.55 ? Math.sqrt(Math.max(0, 1 - ((t - 0.55) / 0.45) ** 2)) : 1, stern = 0.82 + 0.18 * Math.min(1, t / 0.12);
    return (PIRATE.B / 2) * bow * stern;
}
export function pirateDeckY(lx: number) {   // sheer: the deck sweeps up to the forecastle and the stern castle
    const t = (lx + PIRATE.L / 2) / PIRATE.L;
    return PIRATE.deck + 3.2 * Math.max(0, (t - 0.8) / 0.2) ** 2;
}
{
    const P = PIRATE, step = 6;
    for (let lx = -P.L / 2 + 0.5; lx < P.L / 2 - 3; lx += step) {
        const hw = Math.min(pirateHalfBeam(lx), pirateHalfBeam(lx + step)) - 1.0; if (hw < 1.5) continue;
        DECKS.push({ x0: P.cx + lx, x1: P.cx + lx + step, z0: P.cz - hw, z1: P.cz + hw, y: pirateDeckY(lx + step / 2) });
    }
    DECKS.push({ x0: P.cx - P.L / 2 + 1, x1: P.cx - P.L / 2 + 23, z0: P.cz - 9, z1: P.cz + 9, y: P.deck + 6.2 });   // stern castle roof
    DECKS.push({ x0: P.cx - 18, x1: P.cx - 6, z0: P.cz - 4, z1: P.cz + 4, y: P.deck + 13.5 });                     // bridge tower roof
}
export function isPirate(x: number, z: number, pad = 1.2) { return Math.abs(x - PIRATE.cx) < PIRATE.L / 2 * pad && Math.abs(z - PIRATE.cz) < PIRATE.B / 2 * pad + 4; }

// ---------------------------------------------------------------- solid shapes (collision + web anchors)
export const SEA_BLDS: SeaBld[] = [];
export const LIGHTHOUSE = { x: PEAK.x, z: PEAK.z, base: 0, h: 27, r: 2.6 };
LIGHTHOUSE.base = islandPeakY();
SEA_BLDS.push({ x0: PEAK.x - LIGHTHOUSE.r, x1: PEAK.x + LIGHTHOUSE.r, z0: PEAK.z - LIGHTHOUSE.r, z1: PEAK.z + LIGHTHOUSE.r, h: LIGHTHOUSE.base + LIGHTHOUSE.h, sea: true, kind: 'light' });
export const SHACKS: { x: number; z: number; y: number; yaw: number; c: number }[] = [];
for (const [a, c] of [[2.3, 0], [2.75, 1], [3.6, 2], [4.4, 3], [5.6, 4]] as [number, number][]) {
    // place on the beach ring where the sand is flat and dry
    let best = 0;
    for (let k = 0.82; k > 0.55; k -= 0.01) { const x = ISLAND.cx + Math.cos(a) * ISLAND.R * k, z = ISLAND.cz + Math.sin(a) * ISLAND.R * k, h = islandRaw(x, z) ?? -9; if (h > 1.3 && h < 3.0) { best = k; break; } }
    if (!best) continue;
    const x = ISLAND.cx + Math.cos(a) * ISLAND.R * best, z = ISLAND.cz + Math.sin(a) * ISLAND.R * best, y = islandRaw(x, z) as number;
    SHACKS.push({ x, z, y, yaw: -a + Math.PI / 2, c });
    SEA_BLDS.push({ x0: x - 2.4, x1: x + 2.4, z0: z - 2.4, z1: z + 2.4, h: y + 3.4, sea: true, kind: 'shack' });
}


// ---------------------------------------------------------------- solid props (Shifat Oct 31 8:51 PM 'many things need collision: bridge parts, houses etc')
/** oriented solid box: centre, yaw (same convention as geometry.rotateY), half sizes, bottom / top y. The AABB encloses it for anchors and line-of-sight. */
export function solidBox(cx: number, cz: number, yaw: number, hx: number, hz: number, y0: number, h: number) {
    const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw)), ex = hx * c + hz * s, ez = hx * s + hz * c;
    SEA_BLDS.push({ x0: cx - ex, x1: cx + ex, z0: cz - ez, z1: cz + ez, h, y0, sea: true, kind: 'solid', ob: yaw ? [cx, cz, yaw, hx, hz] : undefined });
}
{   // pirate ship: hull below the decks (swim into it = blocked; decks stay one-way from above), stern castle, bridge tower, masts
    const P = PIRATE;
    for (let lx = -P.L / 2 + 3; lx < P.L / 2 - 3; lx += 8) { const m = lx + 4, hw = pirateHalfBeam(m) * 0.92; if (hw < 1.5) continue; solidBox(P.cx + m, P.cz, 0, 4, hw, -9, pirateDeckY(m) - 1.2); }
    solidBox(P.cx - P.L / 2 + 12, P.cz, 0, 11, 9, P.deck, P.deck + 6.2);   // stern castle (its roof is also a deck)
    solidBox(P.cx - 12, P.cz, 0, 6, 4, P.deck, P.deck + 13);             // bridge tower
    for (const [mx, mh] of [[-30, 36], [4, 44], [34, 38]] as [number, number][]) solidBox(P.cx + mx, P.cz, 0, 0.8, 0.8, pirateDeckY(mx), pirateDeckY(mx) + mh);   // masts (= pirateShip MASTS)
}
// Farm Isle buildings (layout shared with src/world/farmIsle.tsx): two-storey houses, red barn, silo, windmill
export const FARM_HOUSES: [number, number, number, number][] = [   // local x, z, yaw, size
    [-26, 24, 0.25, 1], [-2, 30, -0.35, 0.92], [12, 2, 2.6, 1.05], [-30, -2, 1.7, 0.95], [-44, 18, 0.6, 0.9], [-8, -6, -1.2, 1], [6, -30, 2.2, 0.9], [-56, -10, 1.3, 0.95],
];
export const FARM_BARN = { x: -52, z: -50, yaw: 0.65 }, FARM_SILO = { x: -40, z: -60 }, FARM_MILL = { x: 34, z: 22 };
export function farmGroundAt(lx: number, lz: number, r: number) {   // lowest ground under a footprint, so nothing floats on a slope
    let m = 1e9; for (let k = 0; k < 8; k++) { const a = k * 0.785; m = Math.min(m, farmRaw(FARM.cx + lx + Math.cos(a) * r, FARM.cz + lz + Math.sin(a) * r) ?? 0); } return Math.min(m, farmRaw(FARM.cx + lx, FARM.cz + lz) ?? 0);
}
for (const [lx, lz, yaw, s] of FARM_HOUSES) { const y0 = farmGroundAt(lx, lz, 5 * s) - 0.8; solidBox(FARM.cx + lx, FARM.cz + lz, yaw, 3.3 * s + 0.15, 4.5 * s + 0.15, y0 - 2, y0 + 0.8 + 7.6 * s + 1.4 * s); }
{ const b = FARM_BARN, y0 = farmGroundAt(b.x, b.z, 9) - 0.6; solidBox(FARM.cx + b.x, FARM.cz + b.z, b.yaw, 6, 8.5, y0 - 2, y0 + 8); }
{ const y0 = farmGroundAt(FARM_SILO.x, FARM_SILO.z, 3) - 0.5; solidBox(FARM.cx + FARM_SILO.x, FARM.cz + FARM_SILO.z, 0.39, 2.6, 2.6, y0 - 2, y0 + 14); }
{ const y0 = farmGroundAt(FARM_MILL.x, FARM_MILL.z, 3.5) - 0.5; solidBox(FARM.cx + FARM_MILL.x, FARM.cz + FARM_MILL.z, 0.39, 2.6, 2.6, y0 - 2, y0 + 15); }
// Ice Isle igloos (layout shared with src/world/iceIsle.tsx): domes of radius 4.8*s -> a box of 0.75 R half width, the dome top is landable
export const ICE_IGLOOS: [number, number, number, number][] = [[18, 20, 2.4, 1], [30, 4, 0.9, 0.85], [10, 34, 3.6, 0.8], [34, 24, 1.8, 0.75], [-30, 30, 4.4, 0.9]];   // local x, z, door yaw, size
export const ICE_HUT_K = 1.4, ICE_HUT_SINK = 0.35;   // Polyfork huts (src/world/iceHuts.ts) at the igloo spots: scale per size unit, sunk into the snow
const ICE_HUT_HALF: [number, number, number][] = [[3, 4.41, 3], [1.98, 4.66, 1.98]];   // refuge hut, patrol hut (half x, height, half z) - alternate by index
const ICE_IGLOO_HALF: [number, number, number][] = [[2.3, 3.0, 2.3], [2.9, 3.6, 2.9], [1.8, 2.2, 1.8]];   // custom igloos (src/world/igloos.ts) main dome: half x, height, half z
ICE_IGLOOS.forEach(([lx, lz, yaw, s], i) => { const x = ICE.cx + lx, z = ICE.cz + lz, y = (iceRaw(x, z) ?? 4) - ICE_HUT_SINK, k = ICE_HUT_K * s, [hx, h, hz] = i % 2 === 0 ? ICE_IGLOO_HALF[i >> 1] : ICE_HUT_HALF[(i >> 1) % 2]; solidBox(x, z, yaw, hx * k, hz * k, y - 2, y + h * k * 0.9); });   // even spots igloos, odd spots huts
// ---------------------------------------------------------------- STEP 3: the long bridge (east side, clear of the island)
// From the city's south beach (street at x=141) straight south over the ocean into Neon Harbor's north edge. Suspension bridge:
// 3 towers, two main cables + hangers. Deck is walkable (one-way from above, so you can swim under it); towers are solid; towers and
// cable points take webs.
export const HARBOR = { x0: 18, x1: 282, z0: -1242, z1: -1010, y: 8 };
export const BRIDGE = { x: 141, hw: 6, z0: -196, z1: HARBOR.z1 - 1.5, top: 22,   /* 2c (Shifat 5:57 PM 'bridge must connect to neon city'): the deck now runs 1.5 m onto the avenue, flush at 8 m (was a 2 m gap) */ towerH: 96, towerU: [235, 425, 615], legX: 9.6, legW: 2.6 };
export const BRIDGE_L = BRIDGE.z0 - BRIDGE.z1;
/** deck height at distance u (m) from the beach end */
export function bridgeDeckU(u: number) { return 0.05 + (BRIDGE.top - 0.05) * sm(0, 125, u) - (BRIDGE.top - HARBOR.y) * sm(BRIDGE_L - 135, BRIDGE_L - 22, u) + 1.2 * Math.sin(Math.PI * Math.max(0, Math.min(1, (u - 125) / (BRIDGE_L - 250)))); }
export function bridgeDeckY(x: number, z: number): number | null { if (Math.abs(x - BRIDGE.x) > BRIDGE.hw || z > BRIDGE.z0 || z < BRIDGE.z1) return null; return bridgeDeckU(BRIDGE.z0 - z); }
export const towerZ = (i: number) => BRIDGE.z0 - BRIDGE.towerU[i];
for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) {
    const cx = BRIDGE.x + sx * BRIDGE.legX, cz = towerZ(i), hw = BRIDGE.legW / 2;
    SEA_BLDS.push({ x0: cx - hw, x1: cx + hw, z0: cz - hw * 1.3, z1: cz + hw * 1.3, h: BRIDGE.towerH, y0: -60, sea: true, kind: 'tower' });
}
{   // bridge parts (Shifat 8:51 PM): tower cross-beams, the concrete piers through the waterline, approach piers, and the railings
    const floor = -32, H = BRIDGE.towerH;
    for (let i = 0; i < 3; i++) {
        const z = towerZ(i), dy = bridgeDeckU(BRIDGE.towerU[i]), bx = BRIDGE.legX + BRIDGE.legW / 2, bz = BRIDGE.legW * 0.55;
        for (const [y, t] of [[44, 3.2], [70, 3.2], [H - 3, 3.2]] as [number, number][]) solidBox(BRIDGE.x, z, 0, bx, bz, y - t / 2, y + t / 2);   // the deck-level beam is under the deck (deck decks handle it)
        solidBox(BRIDGE.x, z, 0, BRIDGE.legX + 4.5, 6, -60, floor + 35);   // concrete pier
        void dy;
    }
    for (let u = 40; u < BRIDGE_L - 20; u += 45) { if (u > 150 && u < BRIDGE_L - 150) continue; const y = bridgeDeckU(u) - 1.9; for (const sx of [-1, 1]) solidBox(BRIDGE.x + sx * 3.8, BRIDGE.z0 - u, 0, 1.2, 1.2, -60, y); }
    for (let u = 0; u < BRIDGE_L - 1; u += 6) { const u1 = Math.min(BRIDGE_L, u + 6), y = Math.min(bridgeDeckU(u), bridgeDeckU(u1)), zc = BRIDGE.z0 - (u + u1) / 2;   // railings: 1 m walls on both deck edges
        for (const sx of [-1, 1]) solidBox(BRIDGE.x + sx * (BRIDGE.hw + 0.25), zc, 0, 0.2, (u1 - u) / 2, y + 0.1, Math.max(bridgeDeckU(u), bridgeDeckU(u1)) + 1.15); }
}
// main cables: end anchors near each end, up over the 3 tower tops, sagging to just above the deck mid-span
export function cableY(u: number) {
    const keys = [55, ...BRIDGE.towerU, BRIDGE_L - 55], top = BRIDGE.towerH - 1;
    if (u <= keys[0] || u >= keys[keys.length - 1]) return bridgeDeckU(u) + 1.5;
    for (let k = 0; k < keys.length - 1; k++) {
        const a = keys[k], b = keys[k + 1]; if (u < a || u > b) continue;
        const ya = k === 0 ? bridgeDeckU(a) + 1.5 : top, yb = k === keys.length - 2 ? bridgeDeckU(b) + 1.5 : top;
        const t = (u - a) / (b - a), mid = bridgeDeckU((a + b) / 2) + 4.5;
        if (k === 0 || k === keys.length - 2) { const lin = ya + (yb - ya) * t; return lin - (lin - (bridgeDeckU(u) + 3)) * 0.55 * Math.sin(Math.PI * t); }
        const s2 = (2 * t - 1) ** 2; return mid + (top - mid) * s2;
    }
    return top;
}
export const CABLE_X = BRIDGE.hw + 0.6;
export const SEA_ANCHORS: [number, number, number][] = [];
for (let u = 70; u < BRIDGE_L - 70; u += 14) for (const sx of [-1, 1]) { const y = cableY(u); if (y - bridgeDeckU(u) > 10) SEA_ANCHORS.push([BRIDGE.x + sx * CABLE_X, y, BRIDGE.z0 - u]); }
for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) SEA_ANCHORS.push([BRIDGE.x + sx * BRIDGE.legX, BRIDGE.towerH + 1, towerZ(i)]);

// ---------------------------------------------------------------- STEP 4: Neon Harbor, the 2nd city on stilts
// A raised platform (top at HARBOR.y) on stilts over the sea, cut into 3x3 blocks by canals (the sea shows below). The bridge lands on
// the central avenue (x=141). Tighter towers with neon/pastel styling (renderer), solid + webbable like the city.
export const HCOLS: [number, number][] = [[HARBOR.x0, 86], [98, 184], [196, HARBOR.x1]];
export const HROWS: [number, number][] = [[-1080, HARBOR.z1], [-1162, -1092], [HARBOR.z0, -1174]];   // [zMin, zMax] north row first
export const AVENUE = { x: BRIDGE.x, hw: 9 };
export const HBLOCKS: Deck[] = [];
for (const [x0, x1] of HCOLS) for (const [z0, z1] of HROWS) HBLOCKS.push({ x0, x1, z0, z1, y: HARBOR.y });
export const HBRIDGES: Deck[] = [];   // footbridges over the canals (and the avenue's wide crossings)
for (let r = 0; r < 3; r++) { const zc = (HROWS[r][0] + HROWS[r][1]) / 2; HBRIDGES.push({ x0: HCOLS[0][1] - 0.5, x1: HCOLS[1][0] + 0.5, z0: zc - 3, z1: zc + 3, y: HARBOR.y }, { x0: HCOLS[1][1] - 0.5, x1: HCOLS[2][0] + 0.5, z0: zc - 3, z1: zc + 3, y: HARBOR.y }); }
for (let c = 0; c < 3; c++) { const xc = c === 1 ? AVENUE.x : (HCOLS[c][0] + HCOLS[c][1]) / 2, hw = c === 1 ? AVENUE.hw : 3; HBRIDGES.push({ x0: xc - hw, x1: xc + hw, z0: HROWS[1][1] - 0.5, z1: HROWS[0][0] + 0.5, y: HARBOR.y }, { x0: xc - hw, x1: xc + hw, z0: HROWS[2][1] - 0.5, z1: HROWS[1][0] + 0.5, y: HARBOR.y }); }
for (const d of [...HBLOCKS, ...HBRIDGES]) DECKS.push(d);
export const HTOWERS: { x0: number; x1: number; z0: number; z1: number; h: number; seed: number; boss?: boolean }[] = [];
{
    let r = 777; const hr = () => (r = (r * 16807) % 2147483647) / 2147483647;
    HBLOCKS.forEach((b, bi) => {
        const m = 3.5, bx0 = b.x0 + m, bx1 = b.x1 - m, bz0 = b.z0 + m, bz1 = b.z1 - m;
        const bossBlock = bi === 7;   // east column, middle row
        if (bossBlock) {   // the tallest tower: the mini-boss roof
            const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
            HTOWERS.push({ x0: cx - 12, x1: cx + 12, z0: cz - 12, z1: cz + 12, h: HARBOR.y + 142, seed: 0.5, boss: true });
        }
        for (let x = bx0; x < bx1 - 10; ) {
            const w = 13 + hr() * 9, xe = Math.min(bx1, x + w);
            if (xe - x < 10) break;
            for (let z = bz0; z < bz1 - 10; ) {
                const d = 13 + hr() * 9, ze = Math.min(bz1, z + d);
                if (ze - z < 10) break;
                const onAvenue = b.x0 === HCOLS[1][0] && xe > AVENUE.x - AVENUE.hw - 1 && x < AVENUE.x + AVENUE.hw + 1;
                const overBoss = bossBlock && xe > (bx0 + bx1) / 2 - 15 && x < (bx0 + bx1) / 2 + 15 && ze > (bz0 + bz1) / 2 - 15 && z < (bz0 + bz1) / 2 + 15;
                if (!onAvenue && !overBoss && hr() > 0.12) {
                    const tall = Math.pow(hr(), 1.6), h = HARBOR.y + 26 + tall * 92;
                    HTOWERS.push({ x0: x + 0.6, x1: xe - 0.6, z0: z + 0.6, z1: ze - 0.6, h, seed: hr() });
                }
                z = ze + 4 + hr() * 3;
            }
            x = xe + 4 + hr() * 3;
        }
    });
    for (const t of HTOWERS) SEA_BLDS.push({ x0: t.x0, x1: t.x1, z0: t.z0, z1: t.z1, h: t.h, y0: HARBOR.y - 0.5, sea: true, kind: 'harbor' });
}
export const HBOSS = (() => { const t = HTOWERS.find((q) => q.boss)!; return { x: (t.x0 + t.x1) / 2, y: t.h + 1, z: (t.z0 + t.z1) / 2, roof: { x0: t.x0, x1: t.x1, z0: t.z0, z1: t.z1 } }; })();
export function inHarbor(x: number, z: number, pad = 0) { return x > HARBOR.x0 - pad && x < HARBOR.x1 + pad && z > HARBOR.z0 - pad && z < HARBOR.z1 + pad; }
/** inside the harbor footprint (+pad) but over a canal / off the platform */
export function harborVoid(x: number, z: number) {
    if (!inHarbor(x, z, 20)) return false;
    for (const d of HBLOCKS) if (x > d.x0 && x < d.x1 && z > d.z0 && z < d.z1) return false;
    for (const d of HBRIDGES) if (x > d.x0 && x < d.x1 && z > d.z0 && z < d.z1) return false;
    return true;
}

/** highest walkable surface under a foot at footY: island ground always counts; decks only from above (one-way) */
export function seaSurface(x: number, z: number, footY: number): number | null {
    let best: number | null = null;
    const ih = islandRaw(x, z) ?? farmRaw(x, z) ?? iceRaw(x, z);   // Oct 31 7:45 PM fix: Farm Isle + Ice Isle ground was not walkable (Shifat)
    if (ih !== null && ih > W_Y - 0.6 && !poolAt(x, z)) best = ih;
    for (const d of DECKS) if (x > d.x0 && x < d.x1 && z > d.z0 && z < d.z1 && footY >= d.y - 0.7 && (best === null || d.y > best)) best = d.y;
    const by = bridgeDeckY(x, z); if (by !== null && footY >= by - 0.7 && (best === null || by > best)) best = by;
    return best;
}
/** seabed lifted by the island so the swim floor and the seabed mesh follow its underwater slopes */
export function seaLift(x: number, z: number, y: number) { const ih = islandRaw(x, z, false) ?? farmRaw(x, z) ?? iceRaw(x, z); return ih === null ? y : Math.max(y, ih - 0.3); }
/** enemies never spawn or roam here */
export function inCalmZone(x: number, z: number) { return isIsland(x, z, 1.45) || isFarm(x, z, 1.45) || isIce(x, z, 1.45) || isPirate(x, z, 1.6); }
