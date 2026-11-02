import * as THREE from 'three';
import { ISLAND } from '../seaWorld';
import { SEA, WATER_Z, HALF, seabedAt } from '../sim';
import { CAUSTIC_TEX, CAUSTIC_GLSL } from '../caustics';
import { TOD, UWF } from '../world/env';

// seabed: sand with animated caustic light lines, fading into teal haze with distance (reference: two underwater game shots - sandy floor with web-like caustic lines, cyan fading to deeper teal)
const mkSea = (xy: boolean) => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFog: UWF, uCaus: { value: CAUSTIC_TEX }, uDayC: TOD.day },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `varying vec3 vW; uniform float uTime; uniform vec3 uFog;
    // Shifat 3:43 AM 'refracted caustic patterns are best, use them underwater too': the SAME simulated ray-splat caustic tile + causRGB the
    // ocean's refracted view uses (same scale, speed, gain), so the seabed looks identical from above and below. Also far cheaper than the old 24-call warp.
    ${CAUSTIC_GLSL}
    uniform float uDayC;
    vec3 cau3(vec2 p){ return causRGB(p * 0.5 / 0.9, uTime * 0.8) * 2.6; }
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main(){ vec3 fogDisplay=linearToOutputTexel(vec4(uFog,1.0)).rgb; vec3 fogUsed=mix(uFog,fogDisplay,0.65*(1.0-smoothstep(-2.0,-1.0,cameraPosition.y))); vec2 p = ${xy ? 'vW.xy' : 'vW.xz'} * 0.9; float depthK = mix(1.0, 0.3, smoothstep(-10.0, -48.0, vW.y)); vec3 c3 = cau3(p) * exp(-max(-1.0 - vW.y, 0.0) * 0.05) * 1.45 * uDayC * (1.0 - smoothstep(-3.0, -1.2, cameraPosition.y));   /* sunlight only, and only seen from below (from above the ocean shader draws them) */ float c = dot(c3, vec3(0.333));
      vec3 sand = mix(vec3(0.46, 0.62, 0.58), vec3(0.58, 0.70, 0.62), h(floor(${xy ? 'vW.xy' : 'vW.xz'} * 3.0)) * 0.6);
      vec3 col = sand * 0.7 * (0.82 + c3);   /* same light model as the refracted bed: albedo * (0.82 + caustics) */
      float d = length(vW - cameraPosition); float sbA = smoothstep(-3.0, -1.2, cameraPosition.y); d = mix(d, min(d * clamp((-1.0 - vW.y) / max(cameraPosition.y - vW.y, 0.001), 0.0, 1.0), 14.0), sbA);   /* blends over the first metres of a dive, no switch */   /* Shifat 1:55 AM 'when swimming the real sea gets visible & blue layer hides': from above, only the part of the ray under the surface is water - the air part was fogging the bed into a flat blue sheet */ vec3 Tb = exp(-vec3(0.45, 0.07, 0.02) * d * 0.12); col = col * Tb; float fg = smoothstep(45.0, 190.0, d);   /* far-only underwater fog (Shifat Oct 29) */ ${xy ? 'fg = fg * 0.8;' : ''} fg *= 1.0 - sbA;   /* from above the sea surface already carries the water colour: the bed only gets its own (short) water path */ col = col * (1.0 - 0.4 * fg) + fogUsed * fg * 0.9; ${xy ? 'col = mix(col, fogUsed, smoothstep(-6.0, -0.6, vW.y));' : ''}
      ${xy ? `// Match grazing rays at the wall/surface junction without changing the deeper sand wall.
      vec3 ray=normalize(cameraPosition-vW);vec3 junction=fogUsed*(1.0+0.9*pow(1.0-clamp(abs(ray.y),0.0,1.0),2.5));
      col=mix(col,junction,smoothstep(-5.0,-0.6,vW.y));` : ''}
      gl_FragColor = vec4(col, 1.0); }`,
});
export const seabedMat = mkSea(false), wallMat = mkSea(true);

// Greater ocean: a camera-following sea sheet whose grid is dense under the camera and coarse toward the horizon (one mesh, no extra
// draw calls). The vertex shader folds anything north of the shoreline onto it, so the sheet never covers land.
export const OCEAN_HALF = 1500, OCEAN_SNAP = 8;   // South Sea 3: 900 -> 1500 so the sheet reaches past the raised far plane (no seabed band at the horizon)
export const OCEAN_N = 170, OCEAN_WARP = 2.1;
export const OCEAN_BINS = 180, OCEAN_INNER_R = 60;
export function oceanGeo() {
    const n = OCEAN_N, pos: number[] = [];   /* keep 170: 124 made the camera-follow snap visibly shift the coarser wave mesh (Shifat 4:40 AM 'sea is glitching') */
    const warp = (u: number) => Math.sign(u) * Math.pow(Math.abs(u), OCEAN_WARP) * OCEAN_HALF;
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) pos.push(warp(i / n * 2 - 1), 0, warp(j / n * 2 - 1));
    /* Shifat 11:44 PM 'sea wave math is the cause' (no sea = 2x fps on his phone): the sheet is a full 360 deg disc round the camera and every vertex
       runs the wave math, including the ~60% behind the camera that is never seen. Triangles are stored as: the inner disc (always drawn), then the
       rest sorted by angle round the centre in OCEAN_BINS slices, so OceanSlices can draw only the slices inside the view. Same triangles, same look. */
    const inner: number[] = [], outer: { a: number; t: number[] }[] = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const a = j * (n + 1) + i, b = a + n + 1;
        for (const t of [[a, b, a + 1], [a + 1, b, b + 1]]) {
            const cx = (pos[t[0] * 3] + pos[t[1] * 3] + pos[t[2] * 3]) / 3, cz = (pos[t[0] * 3 + 2] + pos[t[1] * 3 + 2] + pos[t[2] * 3 + 2]) / 3;
            if (Math.hypot(cx, cz) < OCEAN_INNER_R) inner.push(...t); else outer.push({ a: Math.atan2(cx, cz), t });
        }
    }
    /* within each slice keep the grid's own row order (was: sorted by exact angle, which scattered neighbouring triangles and broke the GPU's
       vertex reuse - each vertex ran the wave math up to 6x; on a tiling phone GPU that is paid again per screen tile). Same triangles per slice. */
    const binOf = (a: number) => Math.min(OCEAN_BINS - 1, Math.floor((a + Math.PI) / (Math.PI * 2) * OCEAN_BINS));
    outer.forEach((o, k) => { (o as any).b = binOf(o.a); (o as any).k = k; });
    outer.sort((p: any, q: any) => p.b - q.b || p.k - q.k);
    const idx = inner.slice(), binStart = new Int32Array(OCEAN_BINS + 1); let bi = 0;
    outer.forEach((o, k) => { const b = (o as any).b; while (bi <= b) binStart[bi++] = inner.length + k * 3; idx.push(...o.t); });
    while (bi <= OCEAN_BINS) binStart[bi++] = idx.length;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    g.userData = { inner: inner.length, binStart };
    return g;
}
// Seabed with the real depth profile (shelf -> slope -> trench), shared with the swim floor in the sim.
export function seabedGeo() {
    const nx = 80, nz = 110, x0 = -(HALF + 500), x1 = HALF + 500, z0 = WATER_Z + 1, z1 = SEA.zMin - 450, pos: number[] = [], idx: number[] = [];
    for (let j = 0; j <= nz; j++) { const tz = j / nz, z = z0 + (z1 - z0) * Math.pow(tz, 1.25); for (let i = 0; i <= nx; i++) { const x = x0 + (x1 - x0) * i / nx; const ex = Math.max(Math.abs(x - ISLAND.cx), Math.abs(z - ISLAND.cz)), sink = 3.5 * (1 - THREE.MathUtils.smoothstep(ex, ISLAND.R * 1.22 - 24, ISLAND.R * 1.22));   /* under the island's terrain square the coarse (~19 m) sea floor is sunk out of sight: its facets poked through the finer island slope as dark wedges; at the square's edge it meets the terrain exactly */
        pos.push(x, Math.min(seabedAt(x, z), -3.2) - sink, z); } }   // the island's own terrain mesh covers anything shallower
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + nx + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
