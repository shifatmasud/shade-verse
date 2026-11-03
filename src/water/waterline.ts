import * as THREE from 'three';
import { waveDispJS, waveMeshHJS, swellKJS, WAVE_HMAX } from './waves';
const DBG = !!(import.meta as any).env.VITE_DBG;
import { OCEAN_HALF, OCEAN_N, OCEAN_SNAP, OCEAN_WARP } from './seabed';
import { WATER_Y } from '../sim';
import { WATERLINE } from '../world/env';

/* Half-underwater lens line (Shifat Nov 2 10:44/10:45 AM: 'water line must cover more distance & must not bleed underwater or wave to air',
   'when swimming water line sometimes let wave in air zone').
   The line is the top edge of the water as the lens sees it: per screen column, the highest point where the view ray meets the drawn waves
   anywhere from the lens plane (WL_D in front of the camera) out to the far crests near the horizon. Below it the frame is under water (the sea
   draws only its underside there, the post pass gives the dive look); above it is air (no wave within that reach may draw there).
   Was: the line was cut 1.2 m out only, on the swim-physics swell (no chop, no sideways Gerstner push - up to ~0.4 m off the drawn mesh), with
   9 columns, and the post pass added its own fake sine ripples the sea didn't have: every wave further out stood above the line in the air half,
   and each mismatch showed as a band of underwater tint above the line.
   Now: solved on the exact surface the sea mesh draws (same trains, same grid fades, Gerstner push inverted), 25 columns x up to 30 depths,
   one shared GLSL function for the sea and the post pass (bit-identical cut), the sea's side per fragment read from its real triangle (screen
   derivatives), not the GPU facing flag. Cost: every column every frame (Nov 2 8:06 PM fix, see updateWaterline), depths that can't beat the line skipped; only while the lens straddles the surface, a 4-tap uniform
   spline per pixel; nothing otherwise. */
export const WL_N = 25, WL_D = 1.2;
const WL_EPS = 0.02;   // the line sits 2 cm above the analytic surface: the drawn triangles cut the curve up to ~2 cm high in troughs, and a line under the mesh would open a sliver of sky above it

/** GLSL shared by the sea and the post pass: uWL.w = 1 while the lens straddles the surface; wlY(ndc x) = ndc height of the line. */
export const WL_GLSL = `uniform vec4 uWL; uniform vec4 uWLq[7];
float wlAt(int i){ vec4 v = uWLq[i / 4]; int c = i - (i / 4) * 4; return c == 0 ? v.x : (c == 1 ? v.y : (c == 2 ? v.z : v.w)); }
float wlY(float x){ float f = clamp(x * 12.0 + 12.0, 0.0, 23.999); int i = int(f); float t = f - float(i);
  float p0 = wlAt(max(i - 1, 0)), p1 = wlAt(i), p2 = wlAt(i + 1), p3 = wlAt(min(i + 2, 24));
  float a = atan(x * uWLq[6].z) + uWLq[6].y, T = uWL.x;   /* the column's world heading: the ripple stays put on the water when the camera turns */
  return p1 + 0.5 * t * (p2 - p0 + t * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3 + t * (3.0 * (p1 - p2) + p3 - p0)))   /* Catmull-Rom through the 25 solved columns */
    + uWL.z * (0.020 * sin(a * 9.0 + T * 1.3) + 0.010 * sin(a * 23.0 - T * 2.1) + 0.004 * sin(a * 53.0 + T * 3.7)); }   /* meniscus ripple (the mesh carries no sub-metre waves): in the shared cut, so sea and tint still agree; full when the lens itself is in the water, faint when the line is the far horizon */
`;

const _o = [0, 0, 0], _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();
const SPK = OCEAN_WARP * OCEAN_HALF * 2 / OCEAN_N, SPE = (OCEAN_WARP - 1) / OCEAN_WARP;
const sst = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Height of the sea mesh as drawn at world (x, z): the sheet follows the camera in OCEAN_SNAP steps, each vertex is pushed sideways by the
 *  Gerstner term, so the undisplaced point is found by fixed-point iteration, then the vertex height is evaluated there at its grid spacing. */
export function seaMeshY(x: number, z: number, t: number, sx: number, sz: number, iters = 3) {
    let px = x, pz = z;
    for (let i = 0; i < iters; i++) {
        const lx = Math.abs(px - sx) / OCEAN_HALF, lz = Math.abs(pz - sz) / OCEAN_HALF, sp = SPK * Math.pow(Math.max(lx, lz, 1e-4), SPE);
        const qz = Math.min(pz, -222); waveDispJS(px, qz, t, sp, _o); const k = sst(-222, -232, qz);
        px = x - _o[1] * k; pz = z - _o[2] * k;
    }
    const lx = Math.abs(px - sx) / OCEAN_HALF, lz = Math.abs(pz - sz) / OCEAN_HALF, sp = SPK * Math.pow(Math.max(lx, lz, 1e-4), SPE);
    return WATER_Y + waveMeshHJS(px, Math.min(pz, -222), t, sp);   // perf: push-only / height-only halves of waveMeshJS, bit-identical, ~40% fewer trig calls
}

/** Solve the line for this frame (sea: exact mesh surface; lake: its own surface function). Writes WATERLINE.q / .v.
 *  Line = the top edge of the water as seen from the lens: for each column, the highest point where the view ray meets the waves anywhere
 *  between the lens plane and uWL.y metres out (out to 250 m - the far crests' silhouette at the horizon - while the lens is in or just over
 *  the water; that reach shrinks to the lens plane itself as the camera rises 0.35 -> 0.9 m over the surface, so the line slides off the bottom
 *  of the screen before the split view ends instead of popping). Above the line nothing of the sea within that reach is drawn. */
const NEAR = 6, WL_FAR = 250;   // 250 m: past it the sea is drawn flat (Shifat Oct 31), so nothing further out rises over the line
const colJ = new Int32Array(WL_N).fill(1 << 20), colNy = new Float64Array(WL_N);   // per column: the view depth that set the line last frame, and its height
let wlFrame = 0, wlLastT = -1e9;
const TS: number[] = []; for (let d = WL_D; d < WL_FAR; d *= d < NEAR ? 1.38 : 1.2) TS.push(d); TS.push(WL_FAR);   // 6 depths inside 6 m (mesh-exact, chop), then every 20 % out to 250 m
export function updateWaterline(camera: THREE.PerspectiveCamera, t: number, lakeY: ((x: number, z: number) => number) | null, dy: number) {
    const t0 = DBG ? performance.now() : 0; let ev = 0;
    const sx = Math.round(camera.position.x / OCEAN_SNAP) * OCEAN_SNAP, sz = Math.round(camera.position.z / OCEAN_SNAP) * OCEAN_SNAP;
    camera.getWorldDirection(_f); _r.set(1, 0, 0).applyQuaternion(camera.quaternion); _u.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const ty = Math.tan(camera.fov * Math.PI / 360), tx = ty * camera.aspect, c = camera.position, q = WATERLINE.q;
    const reach = lakeY ? WL_D : WL_FAR * Math.pow(WL_D / WL_FAR, sst(0.35, 0.9, dy));
    /* Shifat Nov 2 8:06 PM 'water line is getting wavy distorted based on camera movements': every column is re-cut every frame against THIS
       frame's camera. Was: half the columns per frame (odd/even alternating) and the other half kept as last frame's ndc heights - fine for the
       slow swell, but those heights belonged to last frame's camera, so any pan/tilt/move left every second column off by the camera's own motion
       and the spline through them swam as a wave with a two-column period (0.021 ndc mean, 0.035 max on a 2 deg/frame pan vs 0.0006 held still).
       Now half the columns get the full depth search (as before) and the other half re-solve, with this frame's camera, the view depth that set
       their line last frame and its two neighbours; the full search skips depths whose highest possible crest can't beat the line found so far.
       Fewer wave evaluations per frame than before. */
    const fresh = !(Math.abs(t - wlLastT) < 0.25), par = wlFrame++ & 1; wlLastT = t;
    let nj = 0; while (nj < TS.length && (nj === 0 || TS[nj] <= reach * 1.0001)) nj++;   // depths inside this frame's reach
    for (let k = 0; k < WL_N; k++) {
        const nx = -1 + k * 2 / (WL_N - 1), fy = _f.y + nx * tx * _r.y, full = fresh || (k & 1) === par || colJ[k] >= nj;
        let best = -3, bj = 0, ny = full ? 0 : colNy[k];
        const j0 = full ? 0 : Math.max(0, colJ[k] - 1), j1 = full ? nj - 1 : Math.min(nj - 1, colJ[k] + 1);
        for (let j = j0; j <= j1; j++) {
            const d = TS[j], uy = d * ty * _u.y || 1e-4, near = d < NEAR;
            if (full && !lakeY && j > 0 && uy > 0 && !(DBG && (window as any).__wlNoSkip)) {   // exact skip: this depth's highest possible crest (all trains in phase) stays under the line already found
                const px = c.x + d * (_f.x + nx * tx * _r.x + ny * ty * _u.x), pz = c.z + d * (_f.z + nx * tx * _r.z + ny * ty * _u.z);
                const hb = WATER_Y + WAVE_HMAX * swellKJS(px, Math.min(pz, -222)) * 1.05 + 0.05 + WL_EPS;
                if ((hb - c.y - d * fy) / uy <= best) continue;
            }
            for (let it = 0, n = near ? 2 : 1; it < n; it++) {   // the point at view depth d under ndc (nx, ny): solve its height = surface height for ny (warm start from the previous depth)
                const px = c.x + d * (_f.x + nx * tx * _r.x + ny * ty * _u.x), pz = c.z + d * (_f.z + nx * tx * _r.z + ny * ty * _u.z);
                const h = (lakeY ? lakeY(px, pz) : seaMeshY(px, pz, t, sx, sz, near ? 1 : 0)) + WL_EPS; if (DBG) ev += near ? 2 : 1;
                ny = Math.max(-3, Math.min(3, (h - c.y - d * fy) / uy));
            }
            if (ny > best) { best = ny; bj = j; }
        }
        colJ[k] = bj; colNy[k] = best;
        (q[k >> 2] as any)[XYZW[k & 3]] = best;
    }
    q[6].y = Math.atan2(-_f.x, -_f.z); q[6].z = tx;
    WATERLINE.v.set(t, reach, 1 - 0.8 * sst(-0.1, 0.4, dy), 1);
    if (DBG) { const g = window as any, ms = performance.now() - t0; g.__wlMs = (g.__wlMs || 0) * 0.9 + ms * 0.1; g.__wlN = (g.__wlN || 0) + 1; g.__wlEv = ev; }
}
const XYZW = ['x', 'y', 'z', 'w'];
