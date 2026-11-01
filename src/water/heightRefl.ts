import * as THREE from 'three';
import { buildings, WATER_Y } from '../sim';
import { islandH, PIRATE, ICE, BRIDGE, BRIDGE_L, bridgeDeckU } from '../seaWorld';

/* HEIGHTFIELD-TRACED REFLECTIONS (Shifat Nov 1 2:50 PM 'there may be even better reflection method not well known'): the VoxelSpace / Comanche
   trick applied to water. The world (isles, city blocks, towers, bridge, pirate ship, trees) is baked ONCE on the CPU into a small top-down map -
   rgb = the colour seen from the water, a = height above the sea - and each sea pixel steps its reflected ray through it (a few fetches) until
   it passes under the height: true parallax near and far, no render pass, fixed per-pixel cost. Heroes keep their own analytic reflection. */
export const HF_N = 512, HF_HMAX = 160;
export const HF_BRIDGE = new THREE.Vector4(BRIDGE.x, BRIDGE.hw, BRIDGE.z0, BRIDGE_L);   // for the analytic deck in the shader
export const HF_DECK = { top: BRIDGE.top, end: 0 }; 
export const HF_BOUNDS = new THREE.Vector4(-1500, -2300, 3000, 3000);   // x0, z0, size x, size z (metres) - rewritten by the bake from the world extent
const data = new Uint8Array(HF_N * HF_N * 4);
export const HF_TEX = new THREE.DataTexture(data, HF_N, HF_N, THREE.RGBAFormat);
HF_TEX.magFilter = THREE.LinearFilter; HF_TEX.minFilter = THREE.LinearMipmapLinearFilter; HF_TEX.generateMipmaps = true; HF_TEX.wrapS = HF_TEX.wrapT = THREE.ClampToEdgeWrapping;
const PAL = [[0.74, 0.76, 0.8], [0.62, 0.65, 0.7], [0.8, 0.76, 0.7], [0.55, 0.58, 0.64], [0.7, 0.72, 0.68], [0.72, 0.6, 0.55], [0.82, 0.82, 0.85]];   // same facades as the ring illusion
let baked = false;
export function bakeHeightRefl() {
    if (baked) return; baked = true;
    let x0 = -700, x1 = 560, z0 = -1300, z1 = -150;
    for (const b of buildings) { if (b.host !== undefined) continue; x0 = Math.min(x0, b.x0); x1 = Math.max(x1, b.x1); z0 = Math.min(z0, b.z0); z1 = Math.max(z1, b.z1); }
    x0 = Math.max(x0 - 20, -2600); x1 = Math.min(x1 + 20, 2600); z0 = Math.max(z0 - 20, -3200); z1 = Math.min(z1 + 20, 1800);
    const sx = x1 - x0, sz = z1 - z0; HF_BOUNDS.set(x0, z0, sx, sz);
    const cx = (x: number) => Math.floor((x - x0) / sx * HF_N), cz = (z: number) => Math.floor((z - z0) / sz * HF_N);
    const H = new Float32Array(HF_N * HF_N), R = new Float32Array(HF_N * HF_N), G = new Float32Array(HF_N * HF_N), B = new Float32Array(HF_N * HF_N);
    const put = (i: number, j: number, h: number, r: number, g: number, b: number) => { if (i < 0 || j < 0 || i >= HF_N || j >= HF_N) return; const k = j * HF_N + i; if (h > H[k]) { H[k] = h; R[k] = r; G[k] = g; B[k] = b; } };
    // isles (main, farm, ice): terrain height per cell centre; green tops, pale sand at the water's edge, snow on the ice isle
    for (let j = 0; j < HF_N; j++) for (let i = 0; i < HF_N; i++) {
        const x = x0 + (i + 0.5) / HF_N * sx, z = z0 + (j + 0.5) / HF_N * sz, h = islandH(x, z); if (h == null || h < WATER_Y + 0.3) continue;
        const e = h - WATER_Y, sand = 1 - THREE.MathUtils.smoothstep(e, 1.2, 3.5), ice = Math.hypot(x - ICE.cx, z - ICE.cz) < ICE.R * 1.4;
        const c = ice ? [0.82, 0.9, 0.96] : [0.16 + 0.6 * sand, 0.42 + 0.4 * sand, 0.2 + 0.45 * sand];
        put(i, j, e, c[0], c[1], c[2]);
    }
    // the building list: city + harbor towers, bridge towers, the pirate hull, trees (small solids)
    for (let n = 0; n < buildings.length; n++) {
        const b: any = buildings[n]; if (b.host !== undefined) continue; const e = b.h - WATER_Y; if (e < 0.5) continue;
        const tree = b.kind === 'solid' && b.x1 - b.x0 < 1.5 && b.z1 - b.z0 < 1.5;
        const p = b.kind === 'tower' ? [0.77, 0.27, 0.18] : tree ? [0.16, 0.36, 0.2] : b.kind === 'solid' && Math.abs((b.x0 + b.x1) / 2 - PIRATE.cx) < 70 && Math.abs((b.z0 + b.z1) / 2 - PIRATE.cz) < 30 ? [0.16, 0.17, 0.21]
            : b.kind === 'solid' && Math.hypot((b.x0 + b.x1) / 2 - ICE.cx, (b.z0 + b.z1) / 2 - ICE.cz) < 80 ? [0.9, 0.94, 0.98] : PAL[(n * 2654435761 >>> 0) % PAL.length];
        for (let j = cz(b.z0); j <= cz(b.z1); j++) for (let i = cx(b.x0); i <= cx(b.x1); i++) put(i, j, e, p[0], p[1], p[2]);
    }
    // the bridge deck (a solid band in a heightfield: no sky under it)
    if (false) for (let u = 0; u < BRIDGE_L; u += 2) {   /* the deck is traced analytically in the shader (open sky under it) */ const z = BRIDGE.z0 - u, e = bridgeDeckU(u) + 1.2 - WATER_Y; for (let i = cx(BRIDGE.x - BRIDGE.hw); i <= cx(BRIDGE.x + BRIDGE.hw); i++) put(i, cz(z), e, 0.5, 0.48, 0.46); }
    /* close the streets: a max filter (radius 3 cells, ~20 m) keeps a coarse ray step from slipping through a gap between towers, so the far city
       mirrors as one soft mass instead of dotted pieces (the reflection is blurred and streaked anyway) */
    for (let pass = 0; pass < 2; pass++) {
        const h0 = H.slice(), r0 = R.slice(), g0 = G.slice(), b0 = B.slice();
        for (let j = 0; j < HF_N; j++) for (let i = 0; i < HF_N; i++) { const k = j * HF_N + i; for (let d = -3; d <= 3; d++) { const q = pass === 0 ? i + d : j + d; if (q < 0 || q >= HF_N) continue; const m = pass === 0 ? j * HF_N + q : q * HF_N + i; if (h0[m] > H[k]) { H[k] = h0[m]; R[k] = r0[m]; G[k] = g0[m]; B[k] = b0[m]; } } }
    }
    for (let k = 0; k < HF_N * HF_N; k++) { const o = k * 4; data[o] = R[k] * 255; data[o + 1] = G[k] * 255; data[o + 2] = B[k] * 255; data[o + 3] = Math.min(255, H[k] / HF_HMAX * 255); }
    HF_TEX.needsUpdate = true;
}
