import * as THREE from 'three';
import { buildings, WATER_Y } from '../sim';
import { ISLAND, FARM, ICE, PIRATE, BRIDGE, BRIDGE_L, bridgeDeckU, islandH } from '../seaWorld';

/* ANALYTIC RAYTRACED REFLECTIONS (Shifat Nov 1 3:08 PM 'analytic raytrace too'): the same exact-maths trick the heroes use, for the landmarks.
   Every time the camera moves ~30 m the CPU picks the AR_N boxes that look biggest from here (city + harbor towers, bridge towers, the bridge deck
   as a few spans with open sky under them, the pirate hull) and the three isles as half-ellipsoid domes; each sea pixel intersects its reflected
   ray with all of them exactly and takes the nearest hit, lit by the sun on the face it hit. */
export const AR_N = 24;
export const AR_MIN = Array.from({ length: AR_N }, () => new THREE.Vector4(0, -999, 0, 0));
export const AR_MAX = Array.from({ length: AR_N }, () => new THREE.Vector4(0, -999, 0, 0));
export const AR_COL = Array.from({ length: AR_N }, () => new THREE.Vector3());
export const AR_ISLE = [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()];   // cx, cz, horizontal radius, height (above the sea)
const PAL = [[0.74, 0.76, 0.8], [0.62, 0.65, 0.7], [0.8, 0.76, 0.7], [0.55, 0.58, 0.64], [0.7, 0.72, 0.68], [0.72, 0.6, 0.55], [0.82, 0.82, 0.85]];
let islesDone = false;
type Box = { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number; c: number[]; s: number };
export function pickAnalytic(cx: number, cz: number) {
    if (!islesDone) { islesDone = true;
        ([[ISLAND, 0], [FARM, 1], [ICE, 2]] as [{ cx: number; cz: number; R: number }, number][]).forEach(([I, k]) => { let hm = 0, rm = 0;
            for (let j = -12; j <= 12; j++) for (let i = -12; i <= 12; i++) { const x = I.cx + i / 12 * I.R * 1.3, z = I.cz + j / 12 * I.R * 1.3, h = islandH(x, z); if (h == null || h < WATER_Y + 0.3) continue; hm = Math.max(hm, h - WATER_Y); rm = Math.max(rm, Math.hypot(x - I.cx, z - I.cz)); }
            AR_ISLE[k].set(I.cx, I.cz, Math.max(rm, 10), Math.max(hm, k === 1 ? 15 : 2)); });   /* Farm Isle: its low ground (~4 m) is not what you see from the sea - the orchard and village canopy (~15 m) is (Shifat 8:47 PM 'Farm village has no reflection') */
    }
    const L: Box[] = [];
    for (let n = 0; n < buildings.length; n++) {
        const b: any = buildings[n]; if (b.host !== undefined) continue; const top = b.h - WATER_Y; if (top < 3) continue;
        if (b.kind === 'solid' && b.x1 - b.x0 < 1.5) continue;   // single trees: sub-pixel in a rippled reflection
        const mx = (b.x0 + b.x1) / 2, mz = (b.z0 + b.z1) / 2, d = Math.max(20, Math.hypot(mx - cx, mz - cz)); if (d > 1800) continue;
        const pir = Math.abs(mx - PIRATE.cx) < 70 && Math.abs(mz - PIRATE.cz) < 30;
        const c = b.kind === 'tower' ? [0.77, 0.27, 0.18] : pir ? [0.16, 0.17, 0.21] : PAL[(n * 2654435761 >>> 0) % PAL.length];
        L.push({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, y0: Math.max(0, (b.y0 ?? WATER_Y) - WATER_Y), y1: top, c, s: top * Math.max(b.x1 - b.x0, b.z1 - b.z0, 12) / (d * d) * (b.kind === 'tower' ? 50 : 1) });   // the red bridge towers always make the list
    }
    // bridge deck: 4 spans following the deck's rise (sky under them)
    for (let k = 0; k < 4; k++) { const u0 = k / 4 * BRIDGE_L, u1 = (k + 1) / 4 * BRIDGE_L, e = bridgeDeckU((u0 + u1) / 2) - WATER_Y, mz = BRIDGE.z0 - (u0 + u1) / 2, d = Math.max(20, Math.hypot(BRIDGE.x - cx, mz - cz));
        L.push({ x0: BRIDGE.x - BRIDGE.hw, x1: BRIDGE.x + BRIDGE.hw, z0: BRIDGE.z0 - u1, z1: BRIDGE.z0 - u0, y0: Math.max(0, e - 1.0), y1: e + 1.4, c: [0.5, 0.48, 0.46], s: 1e3 * (u1 - u0) / (d * d) }); }
    L.sort((a, b) => b.s - a.s);
    for (let i = 0; i < AR_N; i++) { const b = L[i]; if (!b) { AR_MIN[i].set(0, -999, 0, 0); AR_MAX[i].set(0, -998, 0, 0); continue; }
        AR_MIN[i].set(b.x0, b.y0, b.z0, 0); AR_MAX[i].set(b.x1, b.y1, b.z1, 0); AR_COL[i].set(b.c[0], b.c[1], b.c[2]); }
}
