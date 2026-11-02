import * as THREE from 'three';
import { buildings, WATER_Y } from '../sim';
import { BRIDGE, BRIDGE_L, bridgeDeckU } from '../seaWorld';

/* ANALYTIC RAYTRACE, every building (Shifat Nov 1 3:57 PM 'Analytic raytrace reflection has more potential... trace every building, bridge,
   islands. Lets go with this if performance good'). All landmark boxes go once into a float data texture; a coarse 2D grid over the map lists,
   per cell, the boxes touching it (and the tallest top there). Each sea pixel walks its reflected ray through the grid (2D DDA) and only tests
   the boxes of the cells it crosses - near-exact nearest hit for hundreds of boxes at the cost of a few. */
export const GC = 40;                  // grid cell size, m
export const GK = 8;                   // boxes per cell (2 RGBA texels of indices)
export const GRID = { tex: null as THREE.DataTexture | null, box: null as THREE.DataTexture | null, b: new THREE.Vector4(), n: new THREE.Vector2(), nb: 0, boxW: 0 };
export function bakeGrid() {
    if (GRID.tex) return GRID;
    type B = { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number; c: number[]; h: number };
    const L: B[] = [];
    const PAL = [[0.74, 0.76, 0.8], [0.62, 0.65, 0.7], [0.8, 0.76, 0.7], [0.55, 0.58, 0.64], [0.7, 0.72, 0.68], [0.72, 0.6, 0.55], [0.82, 0.82, 0.85]];
    for (let n = 0; n < buildings.length; n++) {
        const b: any = buildings[n]; if (b.host !== undefined) continue; const top = b.h - WATER_Y; if (top < 3) continue;
        if (b.kind === 'solid') continue;   // trees: the isles carry their own look
        const c = b.kind === 'tower' ? [0.77, 0.27, 0.18] : PAL[(n * 2654435761 >>> 0) % PAL.length];
        L.push({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, y0: Math.max(0, (b.y0 ?? WATER_Y) - WATER_Y), y1: top, c, h: (n * 0.6180339) % 1 });
    }
    const NS = 16; for (let k = 0; k < NS; k++) { const u0 = k / NS * BRIDGE_L, u1 = (k + 1) / NS * BRIDGE_L, e = bridgeDeckU((u0 + u1) / 2) - WATER_Y;   // deck: 16 spans following its rise, open sky under
        L.push({ x0: BRIDGE.x - BRIDGE.hw, x1: BRIDGE.x + BRIDGE.hw, z0: BRIDGE.z0 - u1, z1: BRIDGE.z0 - u0, y0: Math.max(0, e - 1.0), y1: e + 1.4, c: [0.5, 0.48, 0.46], h: 0.5 }); }
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const b of L) { x0 = Math.min(x0, b.x0); x1 = Math.max(x1, b.x1); z0 = Math.min(z0, b.z0); z1 = Math.max(z1, b.z1); }
    x0 -= GC; z0 -= GC; const nx = Math.ceil((x1 - x0) / GC) + 1, nz = Math.ceil((z1 - z0) / GC) + 1;
    // boxes: 3 texels each (min.xyz + hash, max.xyz + 0, colour)
    const bw = 3 * L.length, bd = new Float32Array(bw * 4);
    L.forEach((b, i) => { bd.set([b.x0, b.y0, b.z0, b.h, b.x1, b.y1, b.z1, 0, b.c[0], b.c[1], b.c[2], 1], i * 12); });
    const cells: number[][] = Array.from({ length: nx * nz }, () => []);
    L.forEach((b, i) => { for (let j = Math.floor((b.z0 - z0) / GC); j <= Math.floor((b.z1 - z0) / GC); j++) for (let k = Math.floor((b.x0 - x0) / GC); k <= Math.floor((b.x1 - x0) / GC); k++) if (j >= 0 && j < nz && k >= 0 && k < nx) cells[j * nx + k].push(i); });
    // per cell: 2 texels of indices (-1 = none) + 1 texel (max top, count); overflow keeps the tallest
    const gd = new Float32Array(nx * nz * 3 * 4).fill(-1); let over = 0;
    cells.forEach((c, ci) => { c.sort((a, b) => L[b].y1 - L[a].y1); if (c.length > GK) over++; let mt = 0; c.forEach(i => (mt = Math.max(mt, L[i].y1)));
        const s = c.slice(0, GK); for (let q = 0; q < GK; q++) gd[ci * 12 + q] = q < s.length ? s[q] : -1; gd[ci * 12 + 8] = mt; gd[ci * 12 + 9] = s.length; gd[ci * 12 + 10] = 0; gd[ci * 12 + 11] = 0; });
    const mk = (d: Float32Array, w: number, h: number) => { const t = new THREE.DataTexture(d, w, h, THREE.RGBAFormat, THREE.FloatType); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; };
    GRID.box = mk(bd, bw, 1); GRID.tex = mk(gd, nx * 3, nz); GRID.b.set(x0, z0, GC, 0); GRID.n.set(nx, nz); GRID.nb = L.length; GRID.boxW = bw;
    if (typeof window !== 'undefined') (window as any).__grid = { nb: L.length, nx, nz, over, maxPer: Math.max(...cells.map(c => c.length)) };
    return GRID;
}
