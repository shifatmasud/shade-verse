import * as THREE from 'three';
import { buildings, WATER_Y } from '../sim';
import { ISLAND, islandH, PIRATE, ICE, iceRaw, FARM, farmRaw } from '../seaWorld';

/* Reflection illusion (Shifat Oct 31 12:58 'illusion of reflection, super performant for all devices'). Nothing is rendered: the skyline
   around the camera (city + harbor towers from the building list, the island's hills) is projected on the CPU into a 512-px ring
   - per azimuth: the silhouette's top elevation (alpha) and its colour - and re-projected only when the camera has moved ~30 m.
   The sea reads it with ONE texture fetch along its rippled reflection ray, heavily softened and tinted (src/water/common.ts look). */
export const SKYLINE_N = 512, SKY_EL_MAX = 0.35;
const data = new Uint8Array(SKYLINE_N * 8);   /* row 0: colour + top elevation; row 1: distance to that silhouette from the ring centre (16-bit, RG) */
export const SKYLINE_TEX = new THREE.DataTexture(data, SKYLINE_N, 2, THREE.RGBAFormat);
export const SKY_D_MAX = 4000;
export const SKYLINE_C = new THREE.Vector2(0, -560);   /* ring centre: the sea shader parallax-corrects each pixel's lookup against it (Shifat Nov 1 11:13 'reflection moves with camera') */
SKYLINE_TEX.wrapS = THREE.RepeatWrapping; SKYLINE_TEX.magFilter = SKYLINE_TEX.minFilter = THREE.LinearFilter; SKYLINE_TEX.needsUpdate = true;
const el = new Float32Array(SKYLINE_N), dd = new Float32Array(SKYLINE_N), cr = new Float32Array(SKYLINE_N), cg = new Float32Array(SKYLINE_N), cb = new Float32Array(SKYLINE_N);
const PAL = [[0.74, 0.76, 0.8], [0.62, 0.65, 0.7], [0.8, 0.76, 0.7], [0.55, 0.58, 0.64], [0.7, 0.72, 0.68], [0.72, 0.6, 0.55], [0.82, 0.82, 0.85]];   // sunlit facades: brighter than the blue water they lie on, so the mirrored skyline reads as pale streaks (like a real bay at noon)
const TAU = Math.PI * 2;
const bin = (a: number) => (((Math.round((a / TAU + 0.5) * SKYLINE_N) % SKYLINE_N) + SKYLINE_N) % SKYLINE_N);
function put(a0: number, a1: number, e: number, r: number, g: number, b: number, dist = 0) {
    let d = a1 - a0; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU;
    const n = Math.max(1, Math.ceil(Math.abs(d) / TAU * SKYLINE_N)), s = d / n;
    for (let k = 0; k <= n; k++) { const i = bin(a0 + s * k); if (e > el[i]) { el[i] = e; cr[i] = r; cg[i] = g; cb[i] = b; dd[i] = dist; } }
}
function fillRing(cx: number, cz: number, baseY: number, island: boolean) {
    el.fill(0); dd.fill(0);
    for (let i = 0; i < buildings.length; i++) {
        const b = buildings[i]; if (b.host !== undefined) continue;
        const mx = (b.x0 + b.x1) * 0.5 - cx, mz = (b.z0 + b.z1) * 0.5 - cz, dist = Math.max(8, Math.hypot(mx, mz) - 0.5 * Math.hypot(b.x1 - b.x0, b.z1 - b.z0));
        if (dist > 1600) continue;
        const e = Math.atan2((b.y0 || 0) + b.h - baseY, dist); if (e < 0.004) continue;
        const a = [Math.atan2(b.x0 - cx, b.z0 - cz), Math.atan2(b.x1 - cx, b.z0 - cz), Math.atan2(b.x0 - cx, b.z1 - cz), Math.atan2(b.x1 - cx, b.z1 - cz)];
        let lo = a[0], hi = a[0]; for (const v of a) { let dv = v - a[0]; if (dv > Math.PI) dv -= TAU; if (dv < -Math.PI) dv += TAU; lo = Math.min(lo, a[0] + dv); hi = Math.max(hi, a[0] + dv); }
        const bb = b as any, tree = bb.kind === 'solid' && b.x1 - b.x0 < 1.5 && b.z1 - b.z0 < 1.5;   /* Shifat 9:58 PM 'blue layer hides reflection': every solid now mirrors in its own colour - trees green, the pirate hull dark, igloos white */
        const p = tree ? [0.16, 0.36, 0.2] : bb.kind === 'solid' && Math.abs((b.x0 + b.x1) / 2 - PIRATE.cx) < 70 && Math.abs((b.z0 + b.z1) / 2 - PIRATE.cz) < 30 ? [0.16, 0.17, 0.21] : bb.kind === 'solid' && Math.hypot((b.x0 + b.x1) / 2 - ICE.cx, (b.z0 + b.z1) / 2 - ICE.cz) < 80 ? [0.9, 0.94, 0.98] : PAL[(i * 2654435761 >>> 0) % PAL.length];
        put(lo, hi, e, p[0], p[1], p[2], dist);
    }
    if (!island) return;
    const R = ISLAND.R * 1.15;
    for (let j = -6; j <= 6; j++) for (let i = -6; i <= 6; i++) {
        const x = ISLAND.cx + i / 6 * R, z = ISLAND.cz + j / 6 * R, h = islandH(x, z); if (h == null || h < WATER_Y + 0.5) continue;
        const dx = x - cx, dz = z - cz, dist = Math.max(10, Math.hypot(dx, dz)), a = Math.atan2(dx, dz), w = (R / 6) / dist;
        put(a - w, a + w, Math.atan2(h - WATER_Y, dist), 0.16, 0.42, 0.2, dist);
    }
    for (const [I, raw, col] of [[FARM, farmRaw, [0.3, 0.5, 0.22]], [ICE, iceRaw, [0.82, 0.9, 0.96]]] as [{ cx: number; cz: number; R: number }, (x: number, z: number) => number | null, number[]][]) {   // Farm + Ice isles mirror too
        const R2 = I.R * 1.15;
        for (let j = -5; j <= 5; j++) for (let i = -5; i <= 5; i++) {
            const x = I.cx + i / 5 * R2, z = I.cz + j / 5 * R2, h = raw(x, z); if (h == null || h < WATER_Y + 0.5) continue;
            const dx = x - cx, dz = z - cz, dist = Math.max(10, Math.hypot(dx, dz)), a = Math.atan2(dx, dz), w = (R2 / 5) / dist;
            put(a - w, a + w, Math.atan2(h - WATER_Y, dist), col[0], col[1], col[2], dist);
        }
    }
}
function writeRing(d: Uint8Array, tex: THREE.DataTexture) {
    for (let i = 0; i < SKYLINE_N; i++) { const o = i * 4; d[o] = cr[i] * 255; d[o + 1] = cg[i] * 255; d[o + 2] = cb[i] * 255; d[o + 3] = Math.min(255, el[i] / SKY_EL_MAX * 255);
        if (d.length >= SKYLINE_N * 8) { const q = Math.round(Math.min(1, dd[i] / SKY_D_MAX) * 65535), o2 = (SKYLINE_N + i) * 4; d[o2] = q >> 8; d[o2 + 1] = q & 255; d[o2 + 2] = 0; d[o2 + 3] = 255; } }
    tex.needsUpdate = true;
}
export function projectSkyline(cx: number, cz: number) { fillRing(cx, cz, WATER_Y, true); writeRing(data, SKYLINE_TEX); SKYLINE_C.set(cx, cz); }

/* #5 park pond (Shifat 2:32 PM 'environment reflection on park lake, pond not showing'): the same zero-render illusion, projected once from the pond
   centre - the city towers around the park plus the ring of cherry / leafy trees on the bank (a noisy pink-green band ~12-30 m out). */
const pondData = new Uint8Array(SKYLINE_N * 4);
export const POND_SKYL_TEX = new THREE.DataTexture(pondData, SKYLINE_N, 1, THREE.RGBAFormat);
POND_SKYL_TEX.wrapS = THREE.RepeatWrapping; POND_SKYL_TEX.magFilter = POND_SKYL_TEX.minFilter = THREE.LinearFilter;
export function projectPondSkyline(cx: number, cz: number, baseY: number, r: number) {
    fillRing(cx, cz, baseY, false);
    for (let i = 0; i < SKYLINE_N; i++) { cr[i] *= 0.6; cg[i] *= 0.62; cb[i] *= 0.68; }   // towers seen past the shady bank read darker in a small pond
    for (let i = 0; i < SKYLINE_N; i++) {
        const a = (i / SKYLINE_N - 0.5) * TAU, n = 0.5 + 0.25 * Math.sin(a * 7.0 + 1.3) + 0.15 * Math.sin(a * 17.0 + 0.4) + 0.1 * Math.sin(a * 41.0);
        const dist = r + 6 + 10 * (0.5 + 0.5 * Math.sin(a * 3.0 + 2.0)), e = Math.atan2(5.5 + 4.5 * n, dist), pink = 0.5 + 0.5 * Math.sin(a * 5.0 + 0.7);
        if (e > el[i]) { el[i] = e; cr[i] = 0.14 + 0.36 * pink; cg[i] = 0.3 - 0.06 * pink; cb[i] = 0.14 + 0.2 * pink; }
    }
    writeRing(pondData, POND_SKYL_TEX);
}
