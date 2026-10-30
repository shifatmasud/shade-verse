// South Sea plan, steps 2-4 (Shifat Oct 29): the jungle island, the long bridge and the 2nd city.
// Pure data + height functions shared by the sim (walk / land / swim / anchors) and the renderer. No imports from sim.ts
// (sim.ts imports this file), so the few world constants it needs are repeated here.
export interface SeaBld { x0: number; x1: number; z0: number; z1: number; h: number; y0?: number; sea: true; kind: 'light' | 'shack' | 'tower' | 'harbor'; host?: number }
const W_Z = -222, W_Y = -1.0;
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
export interface River { pts: [number, number][]; y0: number; y1: number; hw: number; hw1: number; len: number; acc: number[] }
export const RIVERS: River[] = [];
function mkRiver(pts: [number, number][], y0: number, y1: number, hw: number, hw1 = hw) { const acc = [0]; for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); const r = { pts, y0, y1, hw, hw1, len: acc[acc.length - 1], acc }; RIVERS.push(r); return r; }
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
        best = { d, y: r.y0 + (r.y1 - r.y0) * Math.min(1, sAlong * 1.15), fx: dx / l, fz: dz / l, hw: riverHW(r, sAlong) };
    }
    return best;
}
function islandRaw(x: number, z: number, pools = true): number | null {
    const rr = islandRR(x, z);
    if (rr > 1.6) return null;
    if (rr >= 1.0) { let y = -2.6 - 42 * (rr - 1.0); if (pools && rr < 1.25) { const rv = riverNear(x, z); if (rv && rv.d < rv.hw * 2.6) y = Math.min(y, rv.y - 1.4); } return y; }
    let y = 1.5 + 0.25 * Math.sin(x * 0.3 + z * 0.2);
    if (rr >= 0.8) y = y + (-2.6 - y) * sm(0.8, 1.0, rr);   // white-sand beach sloping into the sea
    else y += (hillH(x, z) + cliffBump(x, z)) * sm(0.8, 0.42, rr);   // long gentle foothills down to the beach
    if (pools) {
        const dl = Math.hypot(x - LAGOON.cx, z - LAGOON.cz) / LAGOON.r;
        if (dl < 1.7) y = y + (LAGOON.y + 0.5 - 3.4 * sm(0.95, 0.5, dl) - y) * sm(1.7, 1.0, dl);
        const dp = Math.hypot(x - POOL.cx, z - POOL.cz) / POOL.r;
        if (dp < 1.8) y = y + (POOL.y + 0.5 - 2.9 * sm(0.95, 0.5, dp) - y) * sm(1.8, 1.0, dp);
        {   // waterfall notch: flat at pool level up to the cliff face, then a near-vertical wall up to the ledge
            const rx = x - POOL.cx, rz = z - POOL.cz, along = rx * toPeak[0] + rz * toPeak[1], perp = Math.abs(-rx * toPeak[1] + rz * toPeak[0]);
            if (along > 0 && along < 30 && perp < 11) { const floor = POOL.y + 0.5 + Math.max(0, along - FALL_WALL) * 7, wf = sm(11, 7, perp); y = y + (Math.min(y, floor) - y) * wf; }
        }
        const rv = riverNear(x, z);
        if (rv && rv.d < rv.hw * 2.6) { const bed = rv.y - 1.4 + 1.9 * sm(rv.hw * 0.75, rv.hw * 1.6, rv.d); y = y + (bed - y) * sm(rv.hw * 2.6, rv.hw * 1.6, rv.d); }
    }
    return y;
}
POOL.y = (islandRaw(POOL.cx, POOL.cz, false) as number) - 1.2;
mkRiver([[POOL.cx + 3, POOL.cz - 8], [POOL.cx + 1, POOL.cz - 18], [POOL.cx + 8, POOL.cz - 29], [POOL.cx + 20, POOL.cz - 33], [LAGOON.cx - 1, LAGOON.cz - 15]], POOL.y, LAGOON.y, 3.2);
mkRiver([[LAGOON.cx + 15, LAGOON.cz + 4], [LAGOON.cx + 30, LAGOON.cz + 8], [LAGOON.cx + 44, LAGOON.cz + 11], [LAGOON.cx + 60, LAGOON.cz + 15], [LAGOON.cx + 76, LAGOON.cz + 17], [LAGOON.cx + 92, LAGOON.cz + 19]], LAGOON.y, -1.0, 4.0, 13);   // widens into an estuary and reaches sea level before the coast
export const LAGOON_RIM = 0.93, POOL_RIM = 0.9;
/** island ground height (may be under the sea near the edge), or null away from the island */
export function islandH(x: number, z: number): number | null { return islandRaw(x, z); }
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
    const ih = islandRaw(x, z);
    if (ih !== null && ih > W_Y - 0.6 && !poolAt(x, z)) best = ih;
    for (const d of DECKS) if (x > d.x0 && x < d.x1 && z > d.z0 && z < d.z1 && footY >= d.y - 0.7 && (best === null || d.y > best)) best = d.y;
    const by = bridgeDeckY(x, z); if (by !== null && footY >= by - 0.7 && (best === null || by > best)) best = by;
    return best;
}
/** seabed lifted by the island so the swim floor and the seabed mesh follow its underwater slopes */
export function seaLift(x: number, z: number, y: number) { const ih = islandRaw(x, z, false); return ih === null ? y : Math.max(y, ih - 0.3); }
/** enemies never spawn or roam here */
export function inCalmZone(x: number, z: number) { return isIsland(x, z, 1.45); }
export const SEA_W = { W_Z, W_Y };
