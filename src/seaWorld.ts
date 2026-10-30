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
function islandRR(x: number, z: number) {
    const dx = x - ISLAND.cx, dz = z - ISLAND.cz, a = Math.atan2(dz, dx);
    return Math.hypot(dx, dz) / (ISLAND.R * (1 + 0.075 * Math.sin(3 * a + 1.0) + 0.045 * Math.sin(5 * a - 0.7)));
}
function hillH(x: number, z: number) {
    const d1 = Math.hypot(x - PEAK.x, z - PEAK.z), d2 = Math.hypot(x - (ISLAND.cx - 38), z - (ISLAND.cz - 22));
    return 30 * Math.exp(-((d1 / 33) ** 2)) + 9 * Math.exp(-((d2 / 20) ** 2)) + 1.1 * Math.sin(x * 0.21 + 0.4) * Math.cos(z * 0.17) + 0.7 * Math.sin(x * 0.47 - z * 0.39);
}
// South Sea 2b (Shifat 5:13 PM "long grasses, more tree variations, river, better water fall"): a cliff notch behind the plunge pool
// for a real free-falling waterfall, and a river (pool -> lagoon -> sea) carved into the terrain.
const toPeak = (() => { const dx = PEAK.x - POOL.cx, dz = PEAK.z - POOL.cz, l = Math.hypot(dx, dz); return [dx / l, dz / l]; })();
export const FALL_WALL = 10.2;   // metres from the pool centre (uphill) to the cliff face
function cliffBump(x: number, z: number) { const cx = POOL.cx + toPeak[0] * (FALL_WALL + 5), cz = POOL.cz + toPeak[1] * (FALL_WALL + 5), d = Math.hypot(x - cx, z - cz); return 9 * Math.exp(-((d / 9) ** 2)); }
export interface River { pts: [number, number][]; y0: number; y1: number; hw: number; len: number; acc: number[] }
export const RIVERS: River[] = [];
function mkRiver(pts: [number, number][], y0: number, y1: number, hw: number) { const acc = [0]; for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); const r = { pts, y0, y1, hw, len: acc[acc.length - 1], acc }; RIVERS.push(r); return r; }
/** nearest point on a river: distance, water height there and flow direction */
export function riverNear(x: number, z: number): { d: number; y: number; fx: number; fz: number; hw: number } | null {
    let best: { d: number; y: number; fx: number; fz: number; hw: number } | null = null;
    for (const r of RIVERS) for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), d = Math.hypot(x - ax - dx * t, z - az - dz * t);
        if (d > r.hw * 3 || (best && d >= best.d)) continue;
        const sAlong = (r.acc[i] + Math.sqrt(l2) * t) / r.len, l = Math.sqrt(l2);
        best = { d, y: r.y0 + (r.y1 - r.y0) * sAlong, fx: dx / l, fz: dz / l, hw: r.hw };
    }
    return best;
}
function islandRaw(x: number, z: number, pools = true): number | null {
    const rr = islandRR(x, z);
    if (rr > 1.6) return null;
    if (rr >= 1.0) { let y = -2.6 - 42 * (rr - 1.0); if (pools && rr < 1.25) { const rv = riverNear(x, z); if (rv && rv.d < rv.hw * 2.6) y = Math.min(y, rv.y - 1.4); } return y; }
    let y = 1.5 + 0.25 * Math.sin(x * 0.3 + z * 0.2);
    if (rr >= 0.8) y = y + (-2.6 - y) * sm(0.8, 1.0, rr);   // white-sand beach sloping into the sea
    else y += (hillH(x, z) + cliffBump(x, z)) * sm(0.8, 0.6, rr);
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
mkRiver([[LAGOON.cx + 15, LAGOON.cz + 4], [LAGOON.cx + 30, LAGOON.cz + 8], [LAGOON.cx + 44, LAGOON.cz + 11], [LAGOON.cx + 60, LAGOON.cz + 14], [LAGOON.cx + 72, LAGOON.cz + 15]], LAGOON.y, -1.0, 4.0);
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
export const BRIDGE = { x: 141, hw: 6, z0: -196, z1: HARBOR.z1 + 2, top: 22, towerH: 96, towerU: [235, 425, 615], legX: 9.6, legW: 2.6 };
export const BRIDGE_L = BRIDGE.z0 - BRIDGE.z1;
/** deck height at distance u (m) from the beach end */
export function bridgeDeckU(u: number) { return 0.05 + (BRIDGE.top - 0.05) * sm(0, 125, u) - (BRIDGE.top - HARBOR.y) * sm(BRIDGE_L - 125, BRIDGE_L, u) + 1.2 * Math.sin(Math.PI * Math.max(0, Math.min(1, (u - 125) / (BRIDGE_L - 250)))); }
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
