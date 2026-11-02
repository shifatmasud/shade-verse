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
        const c = b.kind === 'tower' ? [0.77, 0.27, 0.18] : b.kind === 'light' ? [0.8, 0.52, 0.5] : PAL[(n * 2654435761 >>> 0) % PAL.length];
        /* the lone lighthouse: its red-white bands averaged, and its height halved here so the 2x-stretched mirror ray gives a true-length reflection
           instead of a long pale streak toward the camera (the city stays stretched - it is a dense skyline) */
        L.push({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, y0: Math.max(0, (b.y0 ?? WATER_Y) - WATER_Y), y1: b.kind === 'light' ? top * 0.5 : top, c, h: (n * 0.6180339) % 1 });
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
    /* LOW DETAIL (Shifat 3:59 PM 'heavy blurry low detail cheap'): each cell is ONE block - the union of its boxes' footprints, the tallest top,
       the lowest bottom (the bridge deck keeps sky under it), the footprint-weighted average colour. texel 0 = x0 z0 x1 z1, texel 1 = r g b top,
       texel 2 = top count bottom emptyDist */
    const gd = new Float32Array(nx * nz * 3 * 4); let over = 0;
    cells.forEach((c, ci) => { if (!c.length) { gd.set([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], ci * 12); return; }
        let ux0 = 1e9, uz0 = 1e9, ux1 = -1e9, uz1 = -1e9, mt = 0, mb = 1e9, w = 0, r = 0, g = 0, bl = 0;
        const cx0 = x0 + (ci % nx) * GC, cz0 = z0 + Math.floor(ci / nx) * GC;
        for (const i of c) { const b = L[i]; const bx0 = Math.max(b.x0, cx0), bx1 = Math.min(b.x1, cx0 + GC), bz0 = Math.max(b.z0, cz0), bz1 = Math.min(b.z1, cz0 + GC);
            ux0 = Math.min(ux0, bx0); ux1 = Math.max(ux1, bx1); uz0 = Math.min(uz0, bz0); uz1 = Math.max(uz1, bz1); mt = Math.max(mt, b.y1); mb = Math.min(mb, b.y0);
            const a = Math.max(1, (bx1 - bx0) * (bz1 - bz0)) * b.y1; w += a; r += b.c[0] * a; g += b.c[1] * a; bl += b.c[2] * a; }
        gd.set([ux0, uz0, ux1, uz1, r / w, g / w, bl / w, mt, mt, c.length, mb, 0], ci * 12); });
    /* empty-space skip: per cell, the Chebyshev distance (in cells, capped at 8) to the nearest occupied cell -> texel 2 .w.
       An open-sea ray in a cell with distance d can jump d-1 cells at once instead of stepping through empty sea. */
    { const D = new Float32Array(nx * nz).fill(8);
      for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) if (cells[z * nx + x].length) {
        for (let dz = -7; dz <= 7; dz++) for (let dx = -7; dx <= 7; dx++) { const X = x + dx, Z = z + dz; if (X < 0 || Z < 0 || X >= nx || Z >= nz) continue;
          const d = Math.max(Math.abs(dx), Math.abs(dz)); const k = Z * nx + X; if (d < D[k]) D[k] = d; } }
      for (let k = 0; k < nx * nz; k++) gd[k * 12 + 11] = D[k]; }
    const mk = (d: Float32Array, w: number, h: number) => { const t = new THREE.DataTexture(d, w, h, THREE.RGBAFormat, THREE.FloatType); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; };
    GRID.box = mk(bd, bw, 1); GRID.tex = mk(gd, nx * 3, nz); GRID.b.set(x0, z0, GC, 0); GRID.n.set(nx, nz); GRID.nb = L.length; GRID.boxW = bw;
    if (typeof window !== 'undefined') (window as any).__grid = { nb: L.length, nx, nz, over, maxPer: Math.max(...cells.map(c => c.length)) };
    return GRID;
}

/* GLSL: the low-detail analytic air trace through the map grid (one soft block per 40 m cell, blur growing with distance).
   Accumulates soft coverage front-to-back into acc/cov; tb/nb = distance and face normal of the first hit.
   Needs GRID_UNIFORMS_GLSL. Used by the sea (reflection + underwater Snell window) and the park pond. */
export const GRID_UNIFORMS_GLSL = 'uniform highp sampler2D uGrid; uniform highp sampler2D uGBox; uniform vec4 uGB; uniform vec2 uGN;';
export const GRID_TRACE_GLSL = `
    void gridTrace(vec3 ro, vec3 hd, inout float tb, inout vec3 nb, inout vec3 acc, inout float cov) {
          vec3 ih = 1.0 / hd;
          /* clip the ray to the grid's rectangle first: open-sea rays start outside it and would burn steps on empty cells */
          vec2 gmn = uGB.xy, gmx = uGB.xy + uGN * uGB.z; vec2 ta = (gmn - ro.xz) / hd.xz, tbb = (gmx - ro.xz) / hd.xz; vec2 tlo = min(ta, tbb), thi = max(ta, tbb);
          float te = max(max(tlo.x, tlo.y), 0.0), tx = min(min(min(thi.x, thi.y), 170.0 / max(hd.y, 1e-3)), 800.0);   /* past ~800 m the sea fog owns the water anyway */
          vec2 g = (ro.xz + hd.xz * (te + 0.01) - uGB.xy) / uGB.z; ivec2 c = ivec2(floor(g)); vec2 sd = sign(hd.xz) + step(0.0, -abs(hd.xz)); ivec2 st = ivec2(sd);
          vec2 ia = 1.0 / max(abs(hd.xz), vec2(1e-5)); vec2 tD = uGB.z * ia; vec2 nx = te + (vec2(c) + step(0.0, sd) - g) * sd * tD; float tc = te; ivec2 N = ivec2(uGN);
          for (int i = 0; i < 20; i++) { if (tc > tx || cov > 0.97) break;
            if (c.x >= 0 && c.y >= 0 && c.x < N.x && c.y < N.y) {
              vec4 m = texelFetch(uGrid, ivec2(c.x * 3 + 2, c.y), 0);
              if (m.w > 1.5) {   // empty sea around: jump (d-1) cells in one go, then re-seed the DDA there
                tc += (m.w - 1.0) * uGB.z / max(abs(hd.x), abs(hd.z)); if (tc > tx || hd.y * tc > 170.0) break;
                g = (ro.xz + hd.xz * (tc + 0.01) - uGB.xy) / uGB.z; c = ivec2(floor(g)); nx = tc + (vec2(c) + step(0.0, sd) - g) * sd * tD; continue; }
              if (m.y > 0.5 && hd.y * tc < m.x + 8.0) {
                vec4 fp = texelFetch(uGrid, ivec2(c.x * 3, c.y), 0), cc = texelFetch(uGrid, ivec2(c.x * 3 + 1, c.y), 0);
                vec3 bm = vec3(fp.x, m.z, fp.y), bx = vec3(fp.z, cc.w, fp.w);
                float sf = 3.0 + tc * 0.05;   // softness grows with distance (heavy blur far out)
                vec3 t0 = (bm - vec3(sf, 0.0, sf) - ro) * ih, t1 = (bx + vec3(sf, sf, sf) - ro) * ih, tn = min(t0, t1), tf = max(t0, t1);
                float a = max(max(tn.x, tn.y), tn.z), b = min(min(tf.x, tf.y), tf.z);
                if (a < b && b > 0.5) { float pen = (b - max(a, 0.5)) / (2.0 * sf * max(length(ih.xz) * 0.0 + 1.0, 1.0)); float k = clamp(pen * 0.6, 0.0, 1.0) * smoothstep(bx.y + sf, bx.y - sf, hd.y * max(a, 0.5));
                  if (tb > 9e4) { tb = max(a, 0.5); nb = a == tn.x ? vec3(-sign(hd.x), 0.0, 0.0) : a == tn.z ? vec3(0.0, 0.0, -sign(hd.z)) : vec3(0.0, -1.0, 0.0); }
                  acc += (1.0 - cov) * k * cc.rgb; cov += (1.0 - cov) * k; }
              }
            }
            float tn2 = min(nx.x, nx.y); if (hd.y * tn2 > 170.0) break;
            if (nx.x < nx.y) { c.x += st.x; nx.x += tD.x; } else { c.y += st.y; nx.y += tD.y; } tc = tn2;
          }
    }
`;
