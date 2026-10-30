// South Sea steps 2-4 renderer (Shifat Oct 29): the jungle island (bridge-free), later the bridge and Neon Harbor.
// Shapes and heights come from southsea.ts (the sim uses the same functions, so what you see is what you walk on).
import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Sim } from './sim';
import { ISLAND, LAGOON, POOLS, PEAK, FALLS, DOCK, SHACKS, LIGHTHOUSE, islandH, islandPeakY, coastK, islandRR, poolAt, RIVERS, riverNear, riverHW, POOL, FALL_WALL, riverY, RIVER_DEEP, BRIDGE, BRIDGE_L, bridgeDeckU, cableY, CABLE_X, towerZ, HARBOR, HBLOCKS, HBRIDGES, HTOWERS, HBOSS, HCOLS, HROWS, AVENUE } from './seaWorld';
import { buildings } from './sim';
import { QUALITY, QK, LOWQ } from './quality';
import { SELECTIVE_BLOOM_LAYER } from './renderLayers';
import { CAUSTIC_TEX, CAUSTIC_GLSL, HERO_REFL } from './caustics';
import { RIVER_MAT, fallsMat, FALLS_MATS, FOAM_MAT, poolWaterMat } from './water/islandWater';
import { type SouthSeaKit, PHONE, HAZE_K, SKY_BLUE, hazeShader, colorize, merged, rnd, setSeed } from './world/southSea/common';
import { NeonHarbor, LightShafts, CITY_LOD } from './world/southSea/neonHarbor';
import { Bridge } from './world/southSea/bridge';
export { hazeShader, CITY_LOD };
export type { SouthSeaKit };

/* Upgrade #4 (Oct 29 plan "beach sand flat"): per-pixel beach on the island terrain — a darker wet-sand band that a slow wash
   creeps up and back with a thin foam line at its edge, and wind ripples on the dry sand. Sand-coloured pixels only. */
const BEACH_T = { value: 0 };
function beachShader(sh: any) {
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
function islandTerrainGeo() {
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
function lighthouseGeo() {
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
function shacksGeo() {
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
function dockGeo() {
    const parts: THREE.BufferGeometry[] = [], L = DOCK.z1 - DOCK.z0;
    const deck = new THREE.BoxGeometry(DOCK.w, 0.3, L); deck.translate(DOCK.x, DOCK.y - 0.15, (DOCK.z0 + DOCK.z1) / 2); parts.push(colorize(deck, '#a07a52'));
    for (let z = DOCK.z0 + 2; z < DOCK.z1; z += 4) for (const sx of [-1, 1]) { const p = new THREE.CylinderGeometry(0.18, 0.2, 6, 6); p.translate(DOCK.x + sx * (DOCK.w / 2 - 0.2), DOCK.y - 3, z); parts.push(colorize(p, '#6b5038')); }
    for (const sx of [-1, 1]) { const r = new THREE.BoxGeometry(0.12, 0.12, L * 0.6); r.translate(DOCK.x + sx * (DOCK.w / 2 - 0.1), DOCK.y + 0.9, DOCK.z1 - L * 0.3); parts.push(colorize(r, '#7a5a3c')); }
    return merged(parts);
}
// waterfall (2b): three layered free-falling sheets bowing out from the ledge in front of the cliff face, foam + ripples where it
// hits the plunge pool, mist and spray. Streak scroll speeds differ per layer so the fall reads as depth, not one flat card.
function fallsSheet(width: number, out: number, n = 22, C = 8) {
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
function sprayGeo(n: number, spread: number) {
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
const SPRAY_MAT = sprayMat(4.5, 7, 0.45, 0.65), MIST_MAT = sprayMat(9, 26, 0.12, 0.22);
// river (2b): a strip along each carved channel, flow streaks scroll downstream, white water where it drops fastest
const sm = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function riverGeo() {
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
const GRASS_T = { value: 0 };
const GRASS_U = { uTime: { value: 0 }, uHero: { value: new THREE.Vector3() }, uCam: { value: new THREE.Vector3() } };
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

type Inst = { x: number; y: number; z: number; s: number; r: number; sy?: number; tint?: number };
function Island({ sim, kit }: { sim: Sim; kit: SouthSeaKit }) {
    const terrain = useMemo(islandTerrainGeo, []);
    const terrainMat = useMemo(() => { const m = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#1d1b16' }); m.onBeforeCompile = hazeShader(kit.tod, beachShader); return m; }, []);
    useFrame((_, dt) => { BEACH_T.value += Math.min(dt, 0.1); });
    const lh = useMemo(lighthouseGeo, []), shacks = useMemo(shacksGeo, []), dock = useMemo(dockGeo, []);
    const sheets = useMemo(() => [fallsSheet(FALLS.w * 1.15, 0.0), fallsSheet(FALLS.w, 0.7), fallsSheet(FALLS.w * 0.8, 1.4)], []);
    const spray = useMemo(() => sprayGeo(PHONE ? 50 : 110, FALLS.w), []), mist = useMemo(() => sprayGeo(PHONE ? 14 : 30, FALLS.w * 1.6), []), river = useMemo(riverGeo, []);
    const foamPos = useMemo(() => [POOL.cx + (-FALLS.dx) * (FALL_WALL - 2.2), POOL.y + 0.06, POOL.cz + (-FALLS.dz) * (FALL_WALL - 2.2)] as [number, number, number], []);
    const propMat = useMemo(() => { const m = new THREE.MeshLambertMaterial({ vertexColors: true }); m.onBeforeCompile = hazeShader(kit.tod); return m; }, []);
    const lampMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#fff3c4' }), []);
    const waters = useMemo(() => POOLS.map((p) => { const g = new THREE.CircleGeometry(p.r * p.rim, 48); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, poolWaterMat(p)); m.position.set(p.cx, p.y, p.cz); m.renderOrder = 2; return m; }), []);
    // vegetation (2b: more variety): tall curved palms, short bushy palms, jungle broadleaves, tall thin canopy trees, ferns, bushes
    const veg = useMemo(() => {
        setSeed(9001);
        const out: Record<string, Inst[]> = { palmA: [], palmB: [], broad: [], tall: [], fern: [], bush: [], grass: [], rock: [] };
        const all: Inst[] = [];
        const clear = (x: number, z: number, m = 1) => Math.hypot(x - PEAK.x, z - PEAK.z) > 7 * m && !poolAt(x, z) && Math.hypot(x - LAGOON.cx, z - LAGOON.cz) > LAGOON.r * 1.05 && Math.hypot(x - POOL.cx, z - POOL.cz) > POOL.r * 1.15 && Math.abs(x - DOCK.x) + Math.max(0, z - DOCK.z0) > 5 && !SHACKS.some((s) => Math.hypot(x - s.x, z - s.z) < 5 * m) && distToFalls(x, z) > 5 * m && (riverNear(x, z)?.d ?? 99) > (riverNear(x, z)?.hw ?? 0) * 1.5;
        const slopeAt = (x: number, z: number) => { const y = islandH(x, z) ?? 0; return Math.hypot((islandH(x + 1, z) ?? y) - y, (islandH(x, z + 1) ?? y) - y); };
        const put = (key: string, n: number, tries: number, pick: () => [number, number], ok: (y: number, x: number, z: number) => boolean, gap: number, sc: [number, number], sy?: [number, number], seaward = false) => {
            for (let k = 0; k < tries && out[key].length < n; k++) {
                const [x, z] = pick(), y = islandH(x, z) ?? -9;
                if (!ok(y, x, z) || !clear(x, z) || (gap > 0 && all.some((p) => Math.hypot(p.x - x, p.z - z) < gap))) continue;
                const it: Inst = { x, y: y - 0.2, z, s: sc[0] + rnd() * (sc[1] - sc[0]), r: seaward ? -Math.atan2(z - ISLAND.cz, x - ISLAND.cx) + (rnd() - 0.5) * 0.7 : rnd() * 6.28, sy: sy ? sy[0] + rnd() * (sy[1] - sy[0]) : undefined, tint: rnd() };
                out[key].push(it); if (gap > 0) all.push(it);
            }
        };
        const ring = (a0: number, a1: number): (() => [number, number]) => () => { const a = rnd() * Math.PI * 2, rr = (a0 + rnd() * (a1 - a0)) * coastK(a); return [ISLAND.cx + Math.cos(a) * ISLAND.R * rr, ISLAND.cz + Math.sin(a) * ISLAND.R * rr]; };   // relative to the organic coastline
        const disc = (r: number): (() => [number, number]) => () => { const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * r * coastK(a); return [ISLAND.cx + Math.cos(a) * ISLAND.R * rr, ISLAND.cz + Math.sin(a) * ISLAND.R * rr]; };
        const F = PHONE ? 0.65 : 1;
        put('palmA', Math.round(28 * F), 900, ring(0.62, 0.84), (y) => y > 1.2 && y < 4.5, 5.5, [1.0, 1.4], undefined, true);   // coconut palms lean out toward the sea
        put('palmB', Math.round(18 * F), 900, ring(0.55, 0.8), (y) => y > 1.4 && y < 7, 4.5, [0.95, 1.2], [0.5, 0.65], true);
        put('broad', Math.round(56 * F), 3000, disc(0.66), (y, x, z) => y > 3.2 && slopeAt(x, z) < 1.4, 7, [0.9, 1.4]);
        put('tall', Math.round(30 * F), 3000, disc(0.66), (y, x, z) => y > 4 && slopeAt(x, z) < 1.3, 6, [0.85, 1.25]);   // 2c: park broadleaf (second seed) instead of the custom umbrella tree
        put('bush', Math.round(70 * F), 3000, disc(0.74), (y) => y > 2.4, 2.2, [1.4, 2.4]);   // the park's shrub
        put('rock', 14, 900, ring(0.88, 1.0), (y) => y > -2.0 && y < 1.2, 8, [0.8, 1.9], [0.55, 0.85]);   // a few weathered boulders at the waterline
        // long grass: a 1 m mask of where it may grow (height or NaN), so the hero-centred patch re-places with plain lookups
        const half = 110, n = 220, mask = new Float32Array(n * n).fill(NaN);
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = ISLAND.cx - half + i + 0.5, z = ISLAND.cz - half + j + 0.5, y = islandH(x, z); if (y === null || y < 2.7) continue; if (slopeAt(x, z) > 1.3 || !clear(x, z, 0.5)) continue; mask[j * n + i] = y; }
        (out as any).mask = { half, n, mask };
        return out;
    }, []);
    const geos = useMemo(() => {
        const pA = kit.palmGeo(97), pB = kit.palmGeo(41), t = kit.treeGeo('broad', 23, Math.round(260 * (PHONE ? 0.8 : 1)), 1.45), u = kit.treeGeo('broad', 11, Math.round(460 * QK.foliage), 1.45), b = { leaves: kit.parkBushGeo() };   // 2c: the city park's own broadleaf + shrub
        const rock = (() => { const g = new THREE.DodecahedronGeometry(1, 1).toNonIndexed(); const pa = g.attributes.position as THREE.BufferAttribute; let r = 31; const rn = () => (r = (r * 16807) % 2147483647) / 2147483647; const seen = new Map<string, number>(); for (let i = 0; i < pa.count; i++) { const k = pa.getX(i).toFixed(3) + pa.getY(i).toFixed(3) + pa.getZ(i).toFixed(3); if (!seen.has(k)) seen.set(k, 0.75 + rn() * 0.5); const f = seen.get(k)!; pa.setXYZ(i, pa.getX(i) * f, pa.getY(i) * f * 0.8, pa.getZ(i) * f); } g.computeVertexNormals(); return colorize(g, '#ffffff'); })();
        return { pA, pB, t, u, b, grass: kit.tuftGeo(), rock };
    }, []);
    const tex = useMemo(() => { const l = new THREE.TextureLoader(); const mk = (u: string, rep = false) => { const t = l.load(u); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = QK.anisotropy; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 3); } return t; }; return { leaf: mk('/spray145.png'), bark: mk('/bark.jpg', true), bush: mk('/shrub134.png') }; }, []);
    const mats = useMemo(() => ({
        palmTrunk: Object.assign(new THREE.MeshLambertMaterial({ map: kit.palmTrunkTex(), bumpMap: kit.palmTrunkTex(), bumpScale: 1.6, vertexColors: true, color: '#a89274', emissive: '#3a3024', side: THREE.DoubleSide }), { onBeforeCompile: hazeShader(kit.tod, kit.trunkWindShader) }),
        palmLeaf: Object.assign(new THREE.MeshLambertMaterial({ map: kit.palmFrondTex(), vertexColors: true, emissive: '#2a3a14', alphaTest: 0.5, side: THREE.DoubleSide }), { onBeforeCompile: hazeShader(kit.tod, kit.palmFrondShader) }),
        trunk: Object.assign(new THREE.MeshLambertMaterial({ map: tex.bark, bumpMap: tex.bark, bumpScale: 2.2, vertexColors: true, emissive: '#4a3a2c', side: THREE.DoubleSide }), { onBeforeCompile: hazeShader(kit.tod, kit.trunkWindShader) }),
        leaf: Object.assign(new THREE.MeshLambertMaterial({ map: tex.leaf, vertexColors: true, color: '#8fd06a', emissive: '#2e5a26', alphaTest: 0.5, side: THREE.DoubleSide }), { onBeforeCompile: hazeShader(kit.tod, kit.leafWindShader) }),
        leafDeep: Object.assign(new THREE.MeshLambertMaterial({ map: tex.leaf, vertexColors: true, color: '#5fae55', emissive: '#1f4a22', alphaTest: 0.5, side: THREE.DoubleSide }), { onBeforeCompile: hazeShader(kit.tod, kit.leafWindShader) }),
        bush: Object.assign(new THREE.MeshLambertMaterial({ map: tex.bush, color: '#dce1cd', emissive: '#182510', alphaTest: 0.5, side: THREE.DoubleSide }), { onBeforeCompile: hazeShader(kit.tod, kit.leafWindShader) }),
        grass: Object.assign(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: '#1c3410' }), { onBeforeCompile: kit.parkGrassOnCompile(GRASS_U) }),   // 2c: the park meadow's grass + its shader
        rock: Object.assign(new THREE.MeshLambertMaterial({ vertexColors: true, color: '#d4ccba', emissive: '#1a1814', flatShading: true }), { onBeforeCompile: hazeShader(kit.tod) }),
    }), []);
    const vegRef = useRef<THREE.Group>(null!), nearRef = useRef<THREE.Group>(null!), grassRef = useRef<THREE.Group>(null!);
    const inst = useRef<Record<string, THREE.InstancedMesh | null>>({});
    useEffect(() => {
        const o = new THREE.Object3D(), c = new THREE.Color();
        const fill = (key: string, list: Inst[], tintA: string, tintB: string) => { const m = inst.current[key]; if (!m) return; list.forEach((p, i) => { o.position.set(p.x, p.y, p.z); o.rotation.set(0, p.r, 0); o.scale.set(p.s, p.s * (p.sy ?? 1), p.s); o.updateMatrix(); m.setMatrixAt(i, o.matrix); m.setColorAt(i, c.set(tintA).lerp(new THREE.Color(tintB), p.tint ?? 0)); }); m.count = list.length; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); };
        fill('pAt', veg.palmA, '#ffffff', '#e8dccb'); fill('pAl', veg.palmA, '#ffffff', '#d8e8a8');
        fill('pBt', veg.palmB, '#f0e6d6', '#ffffff'); fill('pBl', veg.palmB, '#c8f0a0', '#ffffff');
        fill('bt', veg.broad, '#ffffff', '#d8cfc4'); fill('bl', veg.broad, '#ffffff', '#b8e890');
        fill('ut', veg.tall, '#ffffff', '#e0d8d0'); fill('ul', veg.tall, '#ffffff', '#c8e8a8');
        fill('bush', veg.bush, '#e6f0d6', '#ffffff'); fill('rock', veg.rock, '#ffffff', '#b8b0a0');
    }, []);
    const grassPool = useMemo(() => { setSeed(555); const N = PHONE ? 2600 : 6500, R0 = PHONE ? 34 : 44, a = new Float32Array(N * 5); for (let i = 0; i < N; i++) { const r = R0 * Math.sqrt(rnd()), t = rnd() * 6.283; a[i * 5] = Math.cos(t) * r; a[i * 5 + 1] = Math.sin(t) * r; a[i * 5 + 2] = rnd() * 6.283; a[i * 5 + 3] = 0.75 + rnd() * 0.7; a[i * 5 + 4] = rnd(); } return { N, a }; }, []);
    const grassAt = useRef([1e9, 1e9]);
    const placeGrass = (hx: number, hz: number) => {
        const m = inst.current['grass']; if (!m) return; const { half, n, mask } = (veg as any).mask, o = new THREE.Object3D(), c = new THREE.Color(), cA = new THREE.Color('#ffffff'), cB = new THREE.Color('#cfe38f'); let k = 0;
        for (let i = 0; i < grassPool.N; i++) {
            const q = grassPool.a, x = hx + q[i * 5], z = hz + q[i * 5 + 1], gi = Math.floor(x - ISLAND.cx + half), gj = Math.floor(z - ISLAND.cz + half);
            if (gi < 0 || gj < 0 || gi >= n || gj >= n) continue; const y = mask[gj * n + gi]; if (y !== y) continue;
            o.position.set(x, y - 0.05, z); o.rotation.set(0, q[i * 5 + 2], 0); o.scale.set(q[i * 5 + 3], q[i * 5 + 3] * (0.8 + q[i * 5 + 4] * 0.9), q[i * 5 + 3]); o.updateMatrix(); m.setMatrixAt(k, o.matrix); const cl = Math.sin(x * 0.11 + 1.3) * Math.cos(z * 0.09); m.setColorAt(k, c.setHSL(0.22 + q[i * 5 + 4] * 0.1 - 0.045 * cl + 0.03 * Math.sin(x * 0.045 + z * 0.06), 0.30 + 0.06 * cl, 0.34 + q[i * 5 + 4] * 0.10 + 0.065 * cl)); k++;   // the park meadow's tint formula
        }
        m.count = k; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    };
    useFrame(({ camera }) => {
        const d = Math.hypot(camera.position.x - ISLAND.cx, camera.position.z - ISLAND.cz);
        if (d < 170 && Math.hypot(sim.pos[0] - grassAt.current[0], sim.pos[2] - grassAt.current[1]) > 6) { grassAt.current = [sim.pos[0], sim.pos[2]]; placeGrass(sim.pos[0], sim.pos[2]); }
        if (vegRef.current) vegRef.current.visible = d < (PHONE ? 330 : 430);
        if (nearRef.current) nearRef.current.visible = d < 260;
        if (grassRef.current) grassRef.current.visible = d < 170;
        const t = sim.t, day = kit.tod.day.value; GRASS_T.value = t; GRASS_U.uTime.value = t; GRASS_U.uHero.value.set(sim.pos[0], sim.pos[1], sim.pos[2]); GRASS_U.uCam.value.copy(camera.position);
        for (const m of FALLS_MATS) { m.uniforms.uT.value = t; m.uniforms.uDay.value = day; }
        FOAM_MAT.uniforms.uT.value = t; FOAM_MAT.uniforms.uDay.value = day; SPRAY_MAT.uniforms.uT.value = t; MIST_MAT.uniforms.uT.value = t;
        RIVER_MAT.uniforms.uT.value = t; RIVER_MAT.uniforms.uDay.value = day; (RIVER_MAT.uniforms.uSky.value as THREE.Color).copy(kit.tod.fog).lerp(SKY_BLUE, 0.45);
        for (const w of waters) { const u = (w.material as THREE.ShaderMaterial).uniforms; u.uT.value = t; u.uDay.value = day; u.uSky.value.copy(kit.tod.fog).lerp(SKY_BLUE, 0.45); u.uSun.value.copy(kit.tod.sun); }
        { const night = 1 - day; lampMat.color.setRGB(1, 0.95, 0.75).multiplyScalar(0.8 + 0.6 * night); }
    });
    const I = (key: string, geo: THREE.BufferGeometry, mat: THREE.Material, n: number) => <instancedMesh ref={(m) => { inst.current[key] = m; }} args={[geo, mat, Math.max(1, n)]} frustumCulled={false} />;
    return <group name="south-sea-island">
        <mesh geometry={terrain} material={terrainMat} frustumCulled={false} />
        <mesh geometry={lh.body} material={propMat} />
        <mesh geometry={lh.lamp} material={lampMat} onUpdate={(o) => o.layers.enable(SELECTIVE_BLOOM_LAYER)} />
        <LightShafts kit={kit} lampY={lh.lampY} />
        <mesh geometry={shacks} material={propMat} />
        <mesh geometry={dock} material={propMat} />
        <group ref={vegRef}>
            {I('pAt', geos.pA.trunk, mats.palmTrunk, veg.palmA.length)}{I('pAl', PHONE ? geos.pA.lo : geos.pA.leaves, mats.palmLeaf, veg.palmA.length)}
            {I('pBt', geos.pB.trunk, mats.palmTrunk, veg.palmB.length)}{I('pBl', geos.pB.lo, mats.palmLeaf, veg.palmB.length)}
            {I('bt', geos.t.trunk, mats.trunk, veg.broad.length)}{I('bl', geos.t.leaves, mats.leaf, veg.broad.length)}
            {I('ut', geos.u.trunk, mats.trunk, veg.tall.length)}{I('ul', geos.u.leaves, mats.leaf, veg.tall.length)}
            {I('bush', geos.b.leaves, mats.bush, veg.bush.length)}
            {I('rock', geos.rock, mats.rock, veg.rock.length)}
        </group>
        <group ref={grassRef}><instancedMesh ref={(m) => { inst.current['grass'] = m; }} userData={{ outlineMaskAlpha: 0.5, outlineMaskThreshold: 0.75 }} args={[geos.grass, mats.grass, grassPool.N]} frustumCulled={false} /></group>
        <mesh geometry={river} material={RIVER_MAT} renderOrder={1} frustumCulled={false} />
        <group ref={nearRef}>
            {waters.map((w, i) => <primitive key={i} object={w} />)}
            {sheets.map((g, i) => <mesh key={i} geometry={g} material={FALLS_MATS[i]} renderOrder={3 + i} frustumCulled={false} />)}
            <mesh position={foamPos} rotation={[-Math.PI / 2, 0, 0]} material={FOAM_MAT} renderOrder={3} frustumCulled={false}><planeGeometry args={[FALLS.w * 1.9, FALLS.w * 1.9]} /></mesh>
            <points geometry={spray} material={SPRAY_MAT} renderOrder={6} frustumCulled={false} />
            <points geometry={mist} material={MIST_MAT} renderOrder={7} frustumCulled={false} />
        </group>
    </group>;
}
function distToFalls(x: number, z: number) {
    const ux = -FALLS.dx, uz = -FALLS.dz, rx = x - POOL.cx, rz = z - POOL.cz, along = rx * ux + rz * uz, perp = Math.abs(-rx * uz + rz * ux);
    return along > FALL_WALL - 4 && along < FALL_WALL + 6 ? Math.max(0, perp - FALLS.w * 0.6) : 99;
}

export function SouthSea({ sim, kit }: { sim: Sim; kit: SouthSeaKit }) {
    return <group name="south-sea"><Island sim={sim} kit={kit} /><Bridge sim={sim} kit={kit} /><NeonHarbor kit={kit} /></group>;
}
void islandPeakY; void HCOLS; void HROWS;
