import * as THREE from 'three';
import { DOCK, FALLS, FALL_WALL, ISLAND, LIGHTHOUSE, POOL, POOLS, RIVERS, RIVER_DEEP, SHACKS, islandH, islandRR, poolAt, riverHW, riverY } from '../../seaWorld';
import { PHONE, colorize, hazeShader, merged, rnd, type SouthSeaKit } from './common';
import { CAUSTIC_GLSL, CAUSTIC_TEX } from '../../caustics';

// Island shape builders: beach shader, terrain, lighthouse/shacks/dock, waterfall sheets + spray, river strips, grass clumps and ferns.
/* Upgrade #4 (Oct 29 plan "beach sand flat"): per-pixel beach on the island terrain — a darker wet-sand band that a slow wash
   creeps up and back with a thin foam line at its edge, and wind ripples on the dry sand. Sand-coloured pixels only. */
export const BEACH_T = { value: 0 };
export function beachShader(sh: any) {
    sh.uniforms.uBT = BEACH_T; sh.uniforms.uCaus = { value: CAUSTIC_TEX };
    sh.fragmentShader = 'uniform float uBT;\n' + CAUSTIC_GLSL + '\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
    /* Shifat 3:43 AM: seen from underwater, the island's submerged sand carries the SAME simulated caustics as the refracted view from above */
    if (cameraPosition.y < -1.0 && vHzW.y < -1.0) diffuseColor.rgb *= 0.74 + causRGB(vHzW.xz * 0.5, uBT * 0.8) * 3.4 * exp(-(-1.0 - vHzW.y) * 0.10) * smoothstep(-1.0, -1.6, vHzW.y);
    { vec2 bxz = vHzW.xz; float yb = vHzW.y;
      float sandM = smoothstep(0.5, 0.62, diffuseColor.r) * smoothstep(0.02, 0.08, diffuseColor.r - diffuseColor.b) * smoothstep(-2.4, -1.4, yb) * (1.0 - smoothstep(1.6, 2.4, yb));
      float wash = -0.85 + 0.32 * sin(uBT * 0.55 + bxz.x * 0.045 + bxz.y * 0.03) + 0.08 * sin(uBT * 1.3 + bxz.y * 0.21);
      float wet = 1.0 - smoothstep(wash + 0.1, wash + 1.25, yb);
      float rip = sin(dot(bxz, vec2(0.92, 0.38)) * 2.3 + sin(bxz.y * 0.27 + bxz.x * 0.11) * 2.2);
      float ripM = 0.5 + 0.5 * sin(bxz.x * 0.13 + 1.7) * sin(bxz.y * 0.11 + 0.6); vec3 sc = diffuseColor.rgb * (1.0 + 0.035 * rip * ripM * (1.0 - wet));
      sc = mix(sc, sc * vec3(0.68, 0.64, 0.55), wet * 0.9);
      float foam = exp(-pow((yb - wash - 0.05) / 0.07, 2.0)) * (0.6 + 0.4 * sin(bxz.x * 1.7 + bxz.y * 1.3 + uBT * 2.0));
      sc = mix(sc, vec3(1.0), clamp(foam, 0.0, 1.0) * 0.75);
      diffuseColor.rgb = mix(diffuseColor.rgb, sc, sandM); }
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.11, 0.17), smoothstep(-9.0, -14.0, vHzW.y));   /* deep shelf fades to the open-seabed tone: the terrain mesh ends at -14 m and its edge no longer draws a sawtooth through clear water */`);
}
// ---------------------------------------------------------------- island terrain
export function islandTerrainGeo() {
    const half = ISLAND.R * 1.22, step = PHONE ? 1.8 : 1.3,   // water blend: finer grid so the carved river banks, plunge pool and waterfall notch read as smooth curves, not 2.6 m facets
        n = Math.ceil(half * 2 / step);
    const pos: number[] = [], col: number[] = [], idx: number[] = [], ok: boolean[] = [];
    const sand = new THREE.Color('#f7efd8'), wet = new THREE.Color('#d2bf96'), grass = new THREE.Color('#5f9a3c'), jungle = new THREE.Color('#2f6b2a'), rock = new THREE.Color('#9d9686'), under = new THREE.Color('#d8cba3'), c = new THREE.Color();
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
        const x = ISLAND.cx - half + i * step, z = ISLAND.cz - half + j * step, h = islandH(x, z);
        const y = h ?? -40; pos.push(x, y, z); ok.push(h !== null && h > -14);
        const hx = (islandH(x + 1.5, z) ?? y) - (islandH(x - 1.5, z) ?? y), hz = (islandH(x, z + 1.5) ?? y) - (islandH(x, z - 1.5) ?? y), slope = Math.hypot(hx, hz) / 3;
        const nz = 0.5 + 0.5 * Math.sin(x * 0.37 + z * 0.29) * Math.cos(x * 0.13 - z * 0.41);
        if (y < -0.4) c.copy(under).lerp(wet, Math.min(1, (y + 6) / 6) * 0.5);
        else if (y < 0.6) c.copy(wet).lerp(sand, (y + 0.4));
        else if (y < 2.6) c.copy(sand).lerp(grass, Math.max(0, (y - 1.9) / 0.7));
        else c.copy(grass).lerp(jungle, Math.min(1, (y - 2.6) / 6) * (0.6 + 0.4 * nz));
        if (poolAt(x, z)) c.copy(wet).lerp(rock, 0.4);
        if (y > 2.6) c.lerp(rock, Math.max(0, Math.min(1, (slope - 1.0) * 1.4)));
        col.push(c.r, c.g, c.b);
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i, b = a + n + 1; if (ok[a] || ok[a + 1] || ok[b] || ok[b + 1]) idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
export function lighthouseGeo() {
    const parts: THREE.BufferGeometry[] = [], b = LIGHTHOUSE.base - 1.5, H = LIGHTHOUSE.h + 1.5, segs = 6;
    for (let k = 0; k < segs; k++) {   // white / red bands, gentle taper
        const t0 = k / segs, t1 = (k + 1) / segs, r0 = LIGHTHOUSE.r * (1 - 0.32 * t0), r1 = LIGHTHOUSE.r * (1 - 0.32 * t1);
        const c = new THREE.CylinderGeometry(r1, r0, H * (t1 - t0) * 0.82, 14, 1); c.translate(0, b + H * 0.82 * (t0 + t1) / 2, 0); parts.push(colorize(c, k % 2 ? '#d8423a' : '#f6f3ec'));
    }
    const top = b + H * 0.82;
    { const g = new THREE.CylinderGeometry(2.6, 2.6, 0.5, 14); g.translate(0, top + 0.25, 0); parts.push(colorize(g, '#30343a')); }   // gallery
    { const g = new THREE.CylinderGeometry(2.55, 2.55, 0.9, 14, 1, true); g.translate(0, top + 0.95, 0); parts.push(colorize(g, '#30343a')); }   // railing band
    { const g = new THREE.ConeGeometry(1.9, 2.0, 14); g.translate(0, top + 4.3, 0); parts.push(colorize(g, '#c23a33')); }   // cap
    { const g = new THREE.CylinderGeometry(1.4, 1.6, 1.2, 10); g.translate(0, b + 0.6 + 0.2, 0); parts.push(colorize(g, '#9b938a')); }   // door base
    const body = merged(parts); body.translate(LIGHTHOUSE.x, 0, LIGHTHOUSE.z);
    const lamp = new THREE.CylinderGeometry(1.5, 1.5, 2.4, 12); lamp.translate(LIGHTHOUSE.x, top + 2.1, LIGHTHOUSE.z);
    return { body, lamp, lampY: top + 2.1 };
}
export function shacksGeo() {
    const parts: THREE.BufferGeometry[] = [], walls = ['#e8d2a6', '#9fd3c7', '#f2b5a0', '#f6e7a1', '#b9c8ec'];
    for (const s of SHACKS) {
        const one: THREE.BufferGeometry[] = [];
        const w = new THREE.BoxGeometry(4.6, 2.7, 4.6); w.translate(0, 1.35 + 0.35, 0); one.push(colorize(w, walls[s.c % walls.length]));
        const st = new THREE.BoxGeometry(5.0, 0.4, 5.0); st.translate(0, 0.2, 0); one.push(colorize(st, '#8a6a46'));   // stilt deck
        const r = new THREE.ConeGeometry(4.3, 2.3, 4); r.rotateY(Math.PI / 4); r.translate(0, 2.7 + 0.35 + 1.15, 0); one.push(colorize(r, '#c9a35e'));   // thatch
        const d = new THREE.BoxGeometry(1.1, 1.8, 0.1); d.translate(0, 1.25, 2.33); one.push(colorize(d, '#6b4a2e'));
        const m = merged(one); m.rotateY(s.yaw); m.translate(s.x, s.y - 0.1, s.z); parts.push(m);
    }
    return merged(parts);
}
export function dockGeo() {
    const parts: THREE.BufferGeometry[] = [], L = DOCK.z1 - DOCK.z0;
    const deck = new THREE.BoxGeometry(DOCK.w, 0.3, L); deck.translate(DOCK.x, DOCK.y - 0.15, (DOCK.z0 + DOCK.z1) / 2); parts.push(colorize(deck, '#a07a52'));
    for (let z = DOCK.z0 + 2; z < DOCK.z1; z += 4) for (const sx of [-1, 1]) { const p = new THREE.CylinderGeometry(0.18, 0.2, 6, 6); p.translate(DOCK.x + sx * (DOCK.w / 2 - 0.2), DOCK.y - 3, z); parts.push(colorize(p, '#6b5038')); }
    for (const sx of [-1, 1]) { const r = new THREE.BoxGeometry(0.12, 0.12, L * 0.6); r.translate(DOCK.x + sx * (DOCK.w / 2 - 0.1), DOCK.y + 0.9, DOCK.z1 - L * 0.3); parts.push(colorize(r, '#7a5a3c')); }
    return merged(parts);
}
// waterfall (2b): three layered free-falling sheets bowing out from the ledge in front of the cliff face, foam + ripples where it
// hits the plunge pool, mist and spray. Streak scroll speeds differ per layer so the fall reads as depth, not one flat card.
export function fallsSheet(width: number, out: number, n = 22, C = 8) {
    // water blend: 8 columns across instead of 2, so each sheet bows forward in a smooth convex curve (thickest mid-fall, flat at the
    // lip), tapers narrower at the ledge and fans out toward the pool. No more flat card with straight polygon edges.
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const ux = -FALLS.dx, uz = -FALLS.dz, px = -uz, pz = ux, lip = FALL_WALL + 2.3, base = FALL_WALL - 1.2 - out * 0.6, top = FALLS.top + 0.25, bot = POOL.y - 0.3;
    for (let j = 0; j <= n; j++) {
        const t = j / n, along = lip - (lip - base) * Math.pow(t, 0.42), y = top - (top - bot) * (t * t * 0.35 + t * 0.65), w = width * (0.66 + 0.48 * t);
        const cx = POOL.cx + ux * along, cz = POOL.cz + uz * along, push = out * Math.sin(t * Math.PI) * 0.6;
        for (let c = 0; c <= C; c++) { const sg = (c / C) * 2 - 1, bow = (1 - sg * sg) * (0.25 + 0.75 * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5)) * 0.9, f = push + bow; pos.push(cx + px * w / 2 * sg - ux * f, y, cz + pz * w / 2 * sg - uz * f); uv.push(c / C, t); }
    }
    for (let j = 0; j < n; j++) for (let c = 0; c < C; c++) { const a = j * (C + 1) + c, b = a + C + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
export function sprayGeo(n: number, spread: number) {
    const N = n, pos = new Float32Array(N * 3), ph = new Float32Array(N), bx = POOL.cx + (-FALLS.dx) * (FALL_WALL - 1.6), bz = POOL.cz + (-FALLS.dz) * (FALL_WALL - 1.6);
    for (let i = 0; i < N; i++) { pos[i * 3] = bx + (rnd() - 0.5) * spread; pos[i * 3 + 1] = POOL.y; pos[i * 3 + 2] = bz + (rnd() - 0.5) * spread; ph[i] = rnd(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('ph', new THREE.BufferAttribute(ph, 1)); return g;
}
function sprayMat(rise: number, size: number, alpha: number, rate: number) {
    return new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, uniforms: { uT: { value: 0 }, uCaus: { value: CAUSTIC_TEX } },
        vertexShader: `attribute float ph; uniform float uT; varying float vA; varying float vPh; void main(){ vPh = ph; float life = fract(uT * ${rate.toFixed(2)} + ph); vec3 p = position; p.y += life * ${rise.toFixed(1)} - life * life * ${(rise * 0.45).toFixed(1)}; p.x += sin(ph * 40.0) * life * 3.0; p.z += cos(ph * 23.0) * life * 3.0;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; vA = (1.0 - life) * smoothstep(0.0, 0.12, life); gl_PointSize = (${size.toFixed(1)} * (0.6 + life)) * 60.0 / max(-mv.z, 1.0); }`,
        fragmentShader: `varying float vA; varying float vPh; uniform sampler2D uCaus; void main(){ vec2 pc = gl_PointCoord - 0.5; float d = length(pc);   /* clumpy droplet puffs, not flat discs */
          float clump = texture2D(uCaus, pc * 0.55 + vec2(vPh * 7.3, vPh * 3.1)).r * 0.9 + 0.35; float m = (1.0 - smoothstep(0.12, 0.5, d)) * smoothstep(0.25, 0.75, clump - d * 0.6);
          gl_FragColor = vec4(0.95, 0.99, 1.0, vA * ${alpha.toFixed(2)} * 1.25 * m); }`,
    });
}
export const SPRAY_MAT = sprayMat(4.5, 7, 0.45, 0.65), MIST_MAT = sprayMat(9, 26, 0.12, 0.22);
// river (2b): a strip along each carved channel, flow streaks scroll downstream, white water where it drops fastest
const sm = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function riverGeo() {
    // water blend: the river centreline is already a dense spline (seaWorld smoothPts); each cross-section uses the averaged tangent so
    // consecutive sections never fold or gap at bends, 5 vertices across (soft banks), and the strip fades out inside the plunge pool /
    // lagoon it leaves or enters, so pool -> river -> lagoon -> estuary -> sea reads as one surface instead of overlapping slabs.
    const pos: number[] = [], uv: number[] = [], sl: number[] = [], fd: number[] = [], cm: number[] = [], ac: number[] = [], idx: number[] = [], X = 4;
    const inPool = (x: number, z: number) => { let f = 1; for (const p of POOLS) f = Math.min(f, sm(p.rim * 0.55, p.rim * 0.95, Math.hypot(x - p.cx, z - p.cz) / p.r)); return f; };
    for (const r of RIVERS) {
        const base = pos.length / 3, slope = Math.abs(r.y1 - r.y0) / r.len, P: [number, number][] = [...r.pts], A = [...r.acc];
        // an end that opens into a pool runs 4.5 m on into it and fades there, so the joint has no cut edge and no gap at the rim
        const ext = (e: [number, number], f: [number, number]) => { if (!POOLS.some((q) => Math.hypot(e[0] - q.cx, e[1] - q.cz) < q.r * 1.3)) return [] as [number, number][]; const l = Math.hypot(e[0] - f[0], e[1] - f[1]) || 1, dx = (e[0] - f[0]) / l, dz = (e[1] - f[1]) / l; return [1, 2, 3].map((k) => [e[0] + dx * 1.5 * k, e[1] + dz * 1.5 * k] as [number, number]); };
        const pre = ext(P[0], P[1]), post = ext(P[P.length - 1], P[P.length - 2]);
        for (let k = 0; k < pre.length; k++) { P.unshift(pre[k]); A.unshift(-1.5 * (k + 1)); }
        for (let k = 0; k < post.length; k++) { P.push(post[k]); A.push(r.len + 1.5 * (k + 1)); }
        const N = P.length;
        for (let i = 0; i < N; i++) {
            const a = P[Math.max(0, i - 1)], b = P[Math.min(N - 1, i + 1)], tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, px = -(b[1] - a[1]) / tl, pz = (b[0] - a[0]) / tl;
            const [x, z] = P[i], s = A[i], tt = Math.max(0, Math.min(1, s / r.len)), y = riverY(r, tt) + 0.04 * (1 - tt), w = riverHW(r, tt) * 1.38;
            const te = r.tEnd ?? 1, calm = r.y1 < -0.5 ? sm(te * 0.45, te * 0.95, tt) : 0, fade = (r.y1 < -0.5 ? (1 - sm(te * 0.62, te * 1.12, tt)) * sm(1.12, 0.9, islandRR(x, z)) : 1) * inPool(x, z);   // the sea reach fades out over the estuary into the ocean (no seam)
            const dC = Math.max(0.4, Math.min(3.2, y - (islandH(x, z) ?? (y - RIVER_DEEP))));   // real carved depth at the centreline (for the refraction trace)
            for (let k = 0; k <= X; k++) { const sg = (k / X) * 2 - 1, bw = 1 - 0.35 * sg * sg; pos.push(x + px * w * sg, y + 0.05 * bw, z + pz * w * sg); uv.push(k / X, s); sl.push(slope); fd.push(fade); cm.push(calm); ac.push(px, pz, w, dC); }
            if (i > 0) for (let k = 0; k < X; k++) { const c = base + (i - 1) * (X + 1) + k, d = c + X + 1; idx.push(c, d, c + 1, c + 1, d, d + 1); }
        }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('aSlope', new THREE.Float32BufferAttribute(sl, 1)); g.setAttribute('aFade', new THREE.Float32BufferAttribute(fd, 1)); g.setAttribute('aCalm', new THREE.Float32BufferAttribute(cm, 1)); g.setAttribute('aAcr', new THREE.Float32BufferAttribute(ac, 4)); g.setIndex(idx); return g;
}
// long grass (2b): clumps of three crossed blades, swaying in the vertex shader; only on the meadow/jungle ground, never on sand
export const GRASS_T = { value: 0 };
export const GRASS_U = { uTime: { value: 0 }, uHero: { value: new THREE.Vector3() }, uCam: { value: new THREE.Vector3() } };
function grassClumpGeo() {
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    for (let b = 0; b < 6; b++) {
        const a = b * 2.39 + 0.3, ca = Math.cos(a), sa = Math.sin(a), h = 0.9 + ((b * 7) % 5) * 0.12, base = pos.length / 3, segs = 3, ox = Math.cos(b * 1.7) * 0.18, oz = Math.sin(b * 2.3) * 0.18, lean = 0.12 + (b % 3) * 0.08;
        for (let k = 0; k <= segs; k++) { const t = k / segs, w = 0.055 * (1 - t * 0.9), bend = lean * t * t; for (const sg of [-1, 1]) { pos.push(ox + ca * w * sg + sa * bend, h * t, oz + sa * w * sg - ca * bend); const g = 0.35 + 0.65 * t; col.push(0.36 * g, 0.62 * g, 0.2 * g); } }
        for (let k = 0; k < segs; k++) { const i = base + k * 2; idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
const grassShader = (tod: SouthSeaKit['tod']) => hazeShader(tod, (sh: any) => {
    sh.uniforms.uGrassT = GRASS_T;
    sh.vertexShader = 'uniform float uGrassT;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    { vec2 root = instanceMatrix[3].xz; float ph = root.x * 0.13 + root.y * 0.11; float k = position.y * position.y;
      transformed.x += k * (0.16 * sin(uGrassT * 1.6 + ph) + 0.06 * sin(uGrassT * 3.7 + ph * 2.3)); transformed.z += k * 0.08 * sin(uGrassT * 1.2 + ph * 1.7); }`);
    sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = vec3(0.0, 1.0, 0.0);');   // grass lit like the ground (no dark flipped backsides)
});
// ferns / bushes (2b): arched fronds from one root, no texture
function fernGeo() {
    const pos: number[] = [], col: number[] = [], idx: number[] = [], N = 9;
    for (let f = 0; f < N; f++) {
        const a = f * 2.399, ca = Math.cos(a), sa = Math.sin(a), L = 1.3 + (f % 3) * 0.3, up = 0.9 - (f % 3) * 0.25, base = pos.length / 3, segs = 5;
        for (let k = 0; k <= segs; k++) { const t = k / segs, r = L * t, y = up * Math.sin(t * Math.PI * 0.8) * L * 0.7, w = 0.32 * Math.sin(Math.PI * Math.min(1, t * 1.15)); for (const sg of [-1, 1]) { pos.push(ca * r - sa * w * sg, y + 0.05, sa * r + ca * w * sg); const g = 0.5 + 0.5 * t; col.push(0.25 * g, 0.62 * g, 0.22 * g); } }
        for (let k = 0; k < segs; k++) { const i = base + k * 2; idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

export type Inst = { x: number; y: number; z: number; s: number; r: number; sy?: number; tint?: number };
