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
export const POOL = { cx: ISLAND.cx + 12, cz: ISLAND.cz - 14, r: 7.5, y: 0 };   // y filled below (waterfall plunge pool on the hill's flank)
function islandRR(x: number, z: number) {
    const dx = x - ISLAND.cx, dz = z - ISLAND.cz, a = Math.atan2(dz, dx);
    return Math.hypot(dx, dz) / (ISLAND.R * (1 + 0.075 * Math.sin(3 * a + 1.0) + 0.045 * Math.sin(5 * a - 0.7)));
}
function hillH(x: number, z: number) {
    const d1 = Math.hypot(x - PEAK.x, z - PEAK.z), d2 = Math.hypot(x - (ISLAND.cx - 38), z - (ISLAND.cz - 22));
    return 30 * Math.exp(-((d1 / 33) ** 2)) + 9 * Math.exp(-((d2 / 20) ** 2)) + 1.1 * Math.sin(x * 0.21 + 0.4) * Math.cos(z * 0.17) + 0.7 * Math.sin(x * 0.47 - z * 0.39);
}
function islandRaw(x: number, z: number, pools = true): number | null {
    const rr = islandRR(x, z);
    if (rr > 1.6) return null;
    if (rr >= 1.0) return -2.6 - 42 * (rr - 1.0);
    let y = 1.5 + 0.25 * Math.sin(x * 0.3 + z * 0.2);
    if (rr >= 0.8) return y + (-2.6 - y) * sm(0.8, 1.0, rr);   // white-sand beach sloping into the sea
    y += hillH(x, z) * sm(0.8, 0.6, rr);
    if (pools) {
        const dl = Math.hypot(x - LAGOON.cx, z - LAGOON.cz) / LAGOON.r;
        if (dl < 1.7) y = y + (LAGOON.y + 0.5 - 3.4 * sm(0.95, 0.5, dl) - y) * sm(1.7, 1.0, dl);
        const dp = Math.hypot(x - POOL.cx, z - POOL.cz) / POOL.r;
        if (dp < 1.8) y = y + (POOL.y + 0.5 - 2.9 * sm(0.95, 0.5, dp) - y) * sm(1.8, 1.0, dp);
    }
    return y;
}
POOL.y = (islandRaw(POOL.cx, POOL.cz, false) as number) - 1.2;
export const LAGOON_RIM = 0.93, POOL_RIM = 0.9;
/** island ground height (may be under the sea near the edge), or null away from the island */
export function islandH(x: number, z: number): number | null { return islandRaw(x, z); }
export function isIsland(x: number, z: number, pad = 1.3) { return Math.hypot(x - ISLAND.cx, z - ISLAND.cz) < ISLAND.R * pad; }
export function islandPeakY() { return islandRaw(PEAK.x, PEAK.z) as number; }
// waterfall: from a ledge up the hill down to the plunge pool (sampled along the terrain so the sheet hugs the slope)
const wfDir = (() => { const dx = PEAK.x - POOL.cx, dz = PEAK.z - POOL.cz, l = Math.hypot(dx, dz); return [dx / l, dz / l]; })();
export const FALLS = { x0: POOL.cx + wfDir[0] * 21, z0: POOL.cz + wfDir[1] * 21, x1: POOL.cx + wfDir[0] * POOL.r * 0.55, z1: POOL.cz + wfDir[1] * POOL.r * 0.55, w: 5 };

// inland pools (lake-style water, swimmable): lagoon + waterfall pool
export const POOLS = [{ ...LAGOON, rim: LAGOON_RIM }, { cx: POOL.cx, cz: POOL.cz, r: POOL.r, y: POOL.y, rim: POOL_RIM }];
export function poolAt(x: number, z: number) { for (const p of POOLS) { const dx = (x - p.cx) / p.r, dz = (z - p.cz) / p.r; if (dx * dx + dz * dz < p.rim * p.rim) return p; } return null; }

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

/** highest walkable surface under a foot at footY: island ground always counts; decks only from above (one-way) */
export function seaSurface(x: number, z: number, footY: number): number | null {
    let best: number | null = null;
    const ih = islandRaw(x, z);
    if (ih !== null && ih > W_Y - 0.6 && !poolAt(x, z)) best = ih;
    for (const d of DECKS) if (x > d.x0 && x < d.x1 && z > d.z0 && z < d.z1 && footY >= d.y - 0.7 && (best === null || d.y > best)) best = d.y;
    return best;
}
/** seabed lifted by the island so the swim floor and the seabed mesh follow its underwater slopes */
export function seaLift(x: number, z: number, y: number) { const ih = islandRaw(x, z, false); return ih === null ? y : Math.max(y, ih - 0.3); }
/** enemies never spawn or roam here */
export function inCalmZone(x: number, z: number) { return isIsland(x, z, 1.45); }
export const SEA_W = { W_Z, W_Y };
