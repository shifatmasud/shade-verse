// South Sea steps 2-4 renderer (Shifat Oct 29): the jungle island (bridge-free), later the bridge and Neon Harbor.
// Shapes and heights come from southsea.ts (the sim uses the same functions, so what you see is what you walk on).
import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Sim } from './sim';
import { ISLAND, LAGOON, POOLS, PEAK, FALLS, DOCK, SHACKS, LIGHTHOUSE, islandH, islandPeakY, poolAt, RIVERS, riverNear, POOL, FALL_WALL, BRIDGE, BRIDGE_L, bridgeDeckU, cableY, CABLE_X, towerZ } from './seaWorld';
import { QUALITY, QK, LOWQ } from './quality';
import { SELECTIVE_BLOOM_LAYER } from './renderLayers';

export interface SouthSeaKit {
    tod: { fog: THREE.Color; sky: THREE.Color; sun: THREE.Vector3; day: { value: number } };
    palmGeo: (seed: number) => { trunk: THREE.BufferGeometry; leaves: THREE.BufferGeometry; lo: THREE.BufferGeometry };
    treeGeo: (kind: 'broad' | 'umbrella' | 'poplar' | 'cherry', seed: number, leafN: number, scaleMul?: number) => { trunk: THREE.BufferGeometry; leaves: THREE.BufferGeometry };
    palmTrunkTex: () => THREE.Texture; palmFrondTex: () => THREE.Texture;
    palmFrondShader: (sh: any) => void; trunkWindShader: (sh: any) => void; leafWindShader: (sh: any) => void;
}
const PHONE = QUALITY.coarse || (QUALITY as any).weakGpu || LOWQ;
const HAZE_K = { value: 0.0021 };
const SKY_BLUE = new THREE.Color(0.42, 0.6, 0.78);
// Distance haze toward the day/night fog colour (the city shaders fog much harder; the sea sights use a lighter haze so the
// island and the far city read as silhouettes from the beach). Off underwater, where the scene fog takes over.
export function hazeShader(tod: SouthSeaKit['tod'], inner?: (sh: any) => void) {
    return (sh: any) => {
        inner?.(sh);
        sh.uniforms.uHazeCol = { value: tod.fog }; sh.uniforms.uHazeK = HAZE_K;
        sh.vertexShader = 'varying vec3 vHzW;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
        { vec4 hzp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
        hzp = instanceMatrix * hzp;
        #endif
        vHzW = (modelMatrix * hzp).xyz; }`);
        sh.fragmentShader = 'varying vec3 vHzW; uniform vec3 uHazeCol; uniform float uHazeK;\n' + sh.fragmentShader.replace('#include <fog_fragment>', `#include <fog_fragment>
        if (cameraPosition.y > -0.6) { float hzd = length(vHzW - cameraPosition); gl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeCol, min(0.93, 1.0 - exp(-hzd * uHazeK))); }`);
    };
}
const colorize = (g: THREE.BufferGeometry, c: THREE.ColorRepresentation) => { const cc = new THREE.Color(c), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (g.attributes.uv) g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g; };
const merged = (parts: THREE.BufferGeometry[]) => { const g = mergeGeometries(parts.map((p) => { const q = p.index ? p.toNonIndexed() : p; if (q.attributes.uv) q.deleteAttribute('uv'); if (!q.attributes.normal) q.computeVertexNormals(); return q; }), false)!; return g; };
let _seed = 4242; const rnd = () => (_seed = (_seed * 16807) % 2147483647) / 2147483647;

// ---------------------------------------------------------------- island terrain
function islandTerrainGeo() {
    const half = ISLAND.R * 1.22, step = PHONE ? 2.6 : 2.0, n = Math.ceil(half * 2 / step);
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
function fallsSheet(width: number, out: number, n = 22) {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const ux = -FALLS.dx, uz = -FALLS.dz, px = -uz, pz = ux, lip = FALL_WALL + 2.3, base = FALL_WALL - 1.2 - out * 0.6, top = FALLS.top + 0.25, bot = POOL.y - 0.3;
    for (let j = 0; j <= n; j++) {
        const t = j / n, along = lip - (lip - base) * Math.pow(t, 0.42), y = top - (top - bot) * (t * t * 0.35 + t * 0.65), w = width * (0.82 + 0.3 * t);
        const cx = POOL.cx + ux * along, cz = POOL.cz + uz * along;
        for (const sgn of [-1, 1]) { pos.push(cx + px * w / 2 * sgn - ux * out * Math.sin(t * Math.PI) * 0.6, y, cz + pz * w / 2 * sgn - uz * out * Math.sin(t * Math.PI) * 0.6); uv.push((sgn + 1) / 2, t); }
    }
    for (let j = 0; j < n; j++) { const a = j * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function fallsMat(speed: number, alpha: number, bright: number) {
    return new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uT: { value: 0 }, uDay: { value: 1 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `varying vec2 vUv; uniform float uT; uniform float uDay;
        float h(float x){ return fract(sin(x * 91.7) * 43758.5); }
        void main(){ float cols = 34.0; float col = floor(vUv.x * cols); float sp = (0.8 + h(col) * 0.7) * ${speed.toFixed(2)};
          float s = fract(vUv.y * (2.0 + h(col + 7.0) * 2.0) - uT * sp + h(col + 3.0));
          float streak = smoothstep(0.0, 0.18, s) * (1.0 - smoothstep(0.35, 1.0, s));
          float fine = 0.5 + 0.5 * sin(vUv.x * 210.0 + h(col) * 6.0);
          float edge = smoothstep(0.0, 0.12, vUv.x) * (1.0 - smoothstep(0.88, 1.0, vUv.x));
          float lip = 1.0 - smoothstep(0.0, 0.07, vUv.y), foam = smoothstep(0.78, 1.0, vUv.y);
          vec3 c = mix(vec3(0.42, 0.72, 0.82), vec3(0.97, 1.0, 1.0), clamp(streak * 0.75 * ${bright.toFixed(2)} + foam * 0.7 + lip * 0.5 + fine * 0.08, 0.0, 1.0)) * mix(0.32, 1.0, uDay);
          gl_FragColor = vec4(c, clamp((${alpha.toFixed(2)} + 0.45 * streak + 0.4 * foam + 0.3 * lip) * edge, 0.0, 1.0)); }`,
    });
}
const FALLS_MATS = [fallsMat(0.55, 0.38, 0.6), fallsMat(0.85, 0.22, 0.9), fallsMat(1.25, 0.1, 1.2)];
const FOAM_MAT = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uT: { value: 0 }, uDay: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float uT; uniform float uDay;
    float n2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(n2(i), n2(i + vec2(1, 0)), f.x), mix(n2(i + vec2(0, 1)), n2(i + vec2(1, 1)), f.x), f.y); }
    void main(){ vec2 q = vUv - 0.5; float r = length(q) * 2.0;
      float foam = (1.0 - smoothstep(0.15, 0.62, r)) * smoothstep(0.35, 0.75, vn(q * 9.0 + vec2(uT * 0.7, -uT * 0.9)) * 0.6 + vn(q * 23.0 - uT * 1.3) * 0.5);
      float ring = pow(0.5 + 0.5 * sin(r * 26.0 - uT * 5.5), 6.0) * smoothstep(1.0, 0.45, r) * smoothstep(0.2, 0.4, r);
      float a = clamp(foam * 0.95 + ring * 0.35, 0.0, 1.0);
      gl_FragColor = vec4(vec3(0.96, 0.99, 1.0) * mix(0.35, 1.0, uDay), a); }`,
});
function sprayGeo(n: number, spread: number) {
    const N = n, pos = new Float32Array(N * 3), ph = new Float32Array(N), bx = POOL.cx + (-FALLS.dx) * (FALL_WALL - 1.6), bz = POOL.cz + (-FALLS.dz) * (FALL_WALL - 1.6);
    for (let i = 0; i < N; i++) { pos[i * 3] = bx + (rnd() - 0.5) * spread; pos[i * 3 + 1] = POOL.y; pos[i * 3 + 2] = bz + (rnd() - 0.5) * spread; ph[i] = rnd(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('ph', new THREE.BufferAttribute(ph, 1)); return g;
}
function sprayMat(rise: number, size: number, alpha: number, rate: number) {
    return new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, uniforms: { uT: { value: 0 } },
        vertexShader: `attribute float ph; uniform float uT; varying float vA; void main(){ float life = fract(uT * ${rate.toFixed(2)} + ph); vec3 p = position; p.y += life * ${rise.toFixed(1)} - life * life * ${(rise * 0.45).toFixed(1)}; p.x += sin(ph * 40.0) * life * 3.0; p.z += cos(ph * 23.0) * life * 3.0;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; vA = (1.0 - life) * smoothstep(0.0, 0.12, life); gl_PointSize = (${size.toFixed(1)} * (0.6 + life)) * 60.0 / max(-mv.z, 1.0); }`,
        fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(0.95, 0.99, 1.0, vA * ${alpha.toFixed(2)} * (1.0 - smoothstep(0.15, 0.5, d))); }`,
    });
}
const SPRAY_MAT = sprayMat(4.5, 7, 0.45, 0.65), MIST_MAT = sprayMat(9, 26, 0.12, 0.22);
// river (2b): a strip along each carved channel, flow streaks scroll downstream, white water where it drops fastest
function riverGeo() {
    const pos: number[] = [], uv: number[] = [], sl: number[] = [], idx: number[] = [];
    for (const r of RIVERS) {
        const base = pos.length / 3; let k = 0;
        for (let s = 0; s <= r.len + 0.01; s += 1.5) {
            let i = 0; while (i < r.acc.length - 2 && r.acc[i + 1] < s) i++;
            const t = (s - r.acc[i]) / (r.acc[i + 1] - r.acc[i]), [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], x = ax + (bx - ax) * t, z = az + (bz - az) * t, l = Math.hypot(bx - ax, bz - az), px = -(bz - az) / l, pz = (bx - ax) / l;
            const y = r.y0 + (r.y1 - r.y0) * (s / r.len) + 0.04, w = r.hw * 1.38, slope = Math.abs(r.y1 - r.y0) / r.len;
            if (y < -0.62) break;   // stop at the shoreline (no turquoise strip out on the open sea)
            for (const sg of [-1, 1]) { pos.push(x + px * w * sg, y, z + pz * w * sg); uv.push((sg + 1) / 2, s); sl.push(slope); }
            if (k > 0) { const a = base + (k - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } k++;
        }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('aSlope', new THREE.Float32BufferAttribute(sl, 1)); g.setIndex(idx); return g;
}
const RIVER_MAT = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uT: { value: 0 }, uDay: { value: 1 }, uSky: { value: new THREE.Color('#bcd3df') } },
    vertexShader: `attribute float aSlope; varying vec2 vUv; varying float vSl; varying vec3 vW; void main(){ vUv = uv; vSl = aSlope; vec4 w = modelMatrix * vec4(position, 1.0); w.y += 0.04 * sin(uv.y * 1.3 - 0.0) ; vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `varying vec2 vUv; varying float vSl; varying vec3 vW; uniform float uT; uniform float uDay; uniform vec3 uSky;
    float n2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(n2(i), n2(i + vec2(1, 0)), f.x), mix(n2(i + vec2(0, 1)), n2(i + vec2(1, 1)), f.x), f.y); }
    void main(){ float sp = 1.6 + vSl * 40.0; vec2 f = vec2(vUv.x * 4.0, vUv.y * 0.55 - uT * sp);
      float streak = vn(f * vec2(3.0, 1.0)) * 0.6 + vn(f * vec2(9.0, 2.5) + 3.1) * 0.4;
      float bank = 1.0 - smoothstep(0.0, 0.2, min(vUv.x, 1.0 - vUv.x));
      float white = clamp(smoothstep(0.55, 0.85, streak) * (0.35 + vSl * 9.0) + bank * 0.45 * smoothstep(0.4, 0.7, vn(f * 6.0)), 0.0, 1.0);
      vec3 V = normalize(cameraPosition - vW); float fr = 0.03 + 0.97 * pow(1.0 - max(V.y, 0.0), 5.0);
      vec3 body = mix(vec3(0.05, 0.42, 0.45), vec3(0.18, 0.66, 0.62), 0.5 + 0.5 * streak);
      vec3 c = mix(mix(body, uSky, fr * 0.6), vec3(0.95, 0.99, 1.0), white) * mix(0.3, 1.0, uDay);
      gl_FragColor = vec4(c, 0.78 + 0.18 * white); }`,
});
// long grass (2b): clumps of three crossed blades, swaying in the vertex shader; only on the meadow/jungle ground, never on sand
const GRASS_T = { value: 0 };
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
// Lagoon + plunge pool water (Shifat's screenshot: the lake material read as a flat grey slab). Own shallow-water look: white-sand
// turquoise at the edge deepening to teal in the middle, soft transparent rim (no hard edge on the sand), ripples, sky fresnel, night-dim.
function poolWaterMat(p: { cx: number; cz: number; r: number; rim: number }) {
    return new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { uT: { value: 0 }, uDay: { value: 1 }, uSky: { value: new THREE.Color('#bcd3df') }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uC: { value: new THREE.Vector2(p.cx, p.cz) }, uR: { value: p.r * p.rim } },
        vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `varying vec3 vW; uniform float uT, uDay, uR; uniform vec3 uSky, uSun; uniform vec2 uC;
        void main(){ float rr = length(vW.xz - uC) / uR; if (rr > 1.0) discard;
          vec2 q = vW.xz; vec2 g = vec2(cos(q.x * 1.7 + uT * 1.3) * 0.5 + cos(q.x * 0.9 - q.y * 1.3 + uT * 0.9) * 0.4, cos(q.y * 1.9 - uT * 1.1) * 0.5 + cos(q.y * 0.7 + q.x * 1.1 + uT * 0.8) * 0.4) * 0.06;
          vec3 n = normalize(vec3(-g.x, 1.0, -g.y)); vec3 v = normalize(cameraPosition - vW); bool below = !gl_FrontFacing;
          float fr = 0.03 + 0.97 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
          float deep = smoothstep(1.0, 0.35, rr);
          vec3 body = mix(vec3(0.52, 0.9, 0.84), vec3(0.04, 0.46, 0.52), deep);
          float caus = pow(0.5 + 0.5 * sin(q.x * 2.3 + sin(q.y * 1.7 + uT) * 1.4 + uT * 0.7) * sin(q.y * 2.1 + sin(q.x * 1.3 - uT * 0.8) * 1.6), 6.0) * (1.0 - deep) * 0.35;
          vec3 r = reflect(-v, n); float sp = pow(max(dot(r, uSun), 0.0), 120.0) * 1.4 * uDay;
          vec3 col = mix(body + caus, uSky, below ? 0.1 : fr * 0.75) + sp;
          float edgeFoam = smoothstep(0.86, 0.97, rr) * (0.55 + 0.45 * sin(rr * 60.0 - uT * 2.0)) * 0.5;
          col = mix(col, vec3(0.97, 1.0, 1.0), edgeFoam) * mix(0.28, 1.0, uDay);
          float a = mix(0.42, 0.9, deep) * (1.0 - smoothstep(0.9, 1.0, rr)) + fr * 0.2;
          gl_FragColor = vec4(col, clamp(below ? 0.7 : a, 0.0, 1.0)); }`,
    });
}

type Inst = { x: number; y: number; z: number; s: number; r: number; sy?: number; tint?: number };
function Island({ sim, kit }: { sim: Sim; kit: SouthSeaKit }) {
    const terrain = useMemo(islandTerrainGeo, []);
    const terrainMat = useMemo(() => { const m = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#1d1b16' }); m.onBeforeCompile = hazeShader(kit.tod); return m; }, []);
    const lh = useMemo(lighthouseGeo, []), shacks = useMemo(shacksGeo, []), dock = useMemo(dockGeo, []);
    const sheets = useMemo(() => [fallsSheet(FALLS.w * 1.15, 0.0), fallsSheet(FALLS.w, 0.7), fallsSheet(FALLS.w * 0.8, 1.4)], []);
    const spray = useMemo(() => sprayGeo(PHONE ? 50 : 110, FALLS.w), []), mist = useMemo(() => sprayGeo(PHONE ? 14 : 30, FALLS.w * 1.6), []), river = useMemo(riverGeo, []);
    const foamPos = useMemo(() => [POOL.cx + (-FALLS.dx) * (FALL_WALL - 2.2), POOL.y + 0.06, POOL.cz + (-FALLS.dz) * (FALL_WALL - 2.2)] as [number, number, number], []);
    const propMat = useMemo(() => { const m = new THREE.MeshLambertMaterial({ vertexColors: true }); m.onBeforeCompile = hazeShader(kit.tod); return m; }, []);
    const lampMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#fff3c4' }), []);
    const beamMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#fff1b8', transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), []);
    const beamGeo = useMemo(() => { const g = new THREE.ConeGeometry(5, 70, 16, 1, true); g.translate(0, -35, 0); g.rotateZ(Math.PI / 2); return g; }, []);
    const waters = useMemo(() => POOLS.map((p) => { const g = new THREE.CircleGeometry(p.r * p.rim, 48); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, poolWaterMat(p)); m.position.set(p.cx, p.y, p.cz); m.renderOrder = 2; return m; }), []);
    // vegetation (2b: more variety): tall curved palms, short bushy palms, jungle broadleaves, tall thin canopy trees, ferns, bushes
    const veg = useMemo(() => {
        _seed = 9001;
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
        const ring = (a0: number, a1: number): (() => [number, number]) => () => { const a = rnd() * Math.PI * 2, rr = a0 + rnd() * (a1 - a0); return [ISLAND.cx + Math.cos(a) * ISLAND.R * rr, ISLAND.cz + Math.sin(a) * ISLAND.R * rr]; };
        const disc = (r: number): (() => [number, number]) => () => { const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * r; return [ISLAND.cx + Math.cos(a) * ISLAND.R * rr, ISLAND.cz + Math.sin(a) * ISLAND.R * rr]; };
        const F = PHONE ? 0.65 : 1;
        put('palmA', Math.round(28 * F), 900, ring(0.62, 0.84), (y) => y > 1.2 && y < 4.5, 5.5, [1.0, 1.4], undefined, true);   // coconut palms lean out toward the sea
        put('palmB', Math.round(18 * F), 900, ring(0.55, 0.8), (y) => y > 1.4 && y < 7, 4.5, [0.95, 1.2], [0.5, 0.65], true);
        put('broad', Math.round(56 * F), 3000, disc(0.66), (y, x, z) => y > 3.2 && slopeAt(x, z) < 1.4, 7, [0.9, 1.4]);
        put('tall', Math.round(26 * F), 3000, disc(0.62), (y, x, z) => y > 5 && slopeAt(x, z) < 1.2, 6, [0.9, 1.2], [1.5, 1.9]);
        put('bush', Math.round(60 * F), 3000, disc(0.72), (y) => y > 2.4, 2.2, [0.28, 0.55]);
        put('rock', 20, 900, ring(0.86, 1.02), (y) => y > -2.2 && y < 1.4, 6, [0.9, 2.4], [0.6, 1.0]);   // limestone boulders on the waterline
        put('rock', 34, 2500, disc(0.7), (y, x, z) => y > 6 && slopeAt(x, z) > 0.7, 7, [1.6, 3.6], [0.8, 1.6]);   // outcrops on the steep hill
        put('fern', Math.round(95 * F), 3500, disc(0.74), (y) => y > 2.2, 0, [0.8, 1.4]);
        // long grass: a 1 m mask of where it may grow (height or NaN), so the hero-centred patch re-places with plain lookups
        const half = 110, n = 220, mask = new Float32Array(n * n).fill(NaN);
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = ISLAND.cx - half + i + 0.5, z = ISLAND.cz - half + j + 0.5, y = islandH(x, z); if (y === null || y < 2.7 || Math.hypot(x - ISLAND.cx, z - ISLAND.cz) > ISLAND.R * 0.8) continue; if (slopeAt(x, z) > 1.3 || !clear(x, z, 0.5)) continue; mask[j * n + i] = y; }
        (out as any).mask = { half, n, mask };
        return out;
    }, []);
    const geos = useMemo(() => {
        const pA = kit.palmGeo(97), pB = kit.palmGeo(41), t = kit.treeGeo('broad', 23, Math.round(260 * (PHONE ? 0.8 : 1)), 1.45), u = kit.treeGeo('umbrella', 61, Math.round(200 * (PHONE ? 0.8 : 1)), 1.3), b = kit.treeGeo('broad', 7, Math.round(120 * (PHONE ? 0.7 : 1)), 2.0);
        const rock = (() => { const g = new THREE.DodecahedronGeometry(1, 1).toNonIndexed(); const pa = g.attributes.position as THREE.BufferAttribute; let r = 31; const rn = () => (r = (r * 16807) % 2147483647) / 2147483647; const seen = new Map<string, number>(); for (let i = 0; i < pa.count; i++) { const k = pa.getX(i).toFixed(3) + pa.getY(i).toFixed(3) + pa.getZ(i).toFixed(3); if (!seen.has(k)) seen.set(k, 0.75 + rn() * 0.5); const f = seen.get(k)!; pa.setXYZ(i, pa.getX(i) * f, pa.getY(i) * f * 0.8, pa.getZ(i) * f); } g.computeVertexNormals(); return colorize(g, '#ffffff'); })();
        return { pA, pB, t, u, b, fern: fernGeo(), grass: grassClumpGeo(), rock };
    }, []);
    const tex = useMemo(() => { const l = new THREE.TextureLoader(); const mk = (u: string, rep = false) => { const t = l.load(u); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = QK.anisotropy; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 3); } return t; }; return { leaf: mk('/spray145.png'), bark: mk('/bark.jpg', true) }; }, []);
    const mats = useMemo(() => ({
        palmTrunk: Object.assign(new THREE.MeshLambertMaterial({ map: kit.palmTrunkTex(), bumpMap: kit.palmTrunkTex(), bumpScale: 1.6, vertexColors: true, color: '#a89274', emissive: '#3a3024', side: THREE.DoubleSide }), { onBeforeCompile: hazeShader(kit.tod, kit.trunkWindShader) }),
        palmLeaf: Object.assign(new THREE.MeshLambertMaterial({ map: kit.palmFrondTex(), vertexColors: true, emissive: '#2a3a14', alphaTest: 0.5, side: THREE.DoubleSide }), { onBeforeCompile: hazeShader(kit.tod, kit.palmFrondShader) }),
        trunk: Object.assign(new THREE.MeshLambertMaterial({ map: tex.bark, bumpMap: tex.bark, bumpScale: 2.2, vertexColors: true, emissive: '#4a3a2c', side: THREE.DoubleSide }), { onBeforeCompile: hazeShader(kit.tod, kit.trunkWindShader) }),
        leaf: Object.assign(new THREE.MeshLambertMaterial({ map: tex.leaf, vertexColors: true, color: '#8fd06a', emissive: '#2e5a26', alphaTest: 0.5, side: THREE.DoubleSide }), { onBeforeCompile: hazeShader(kit.tod, kit.leafWindShader) }),
        leafDeep: Object.assign(new THREE.MeshLambertMaterial({ map: tex.leaf, vertexColors: true, color: '#5fae55', emissive: '#1f4a22', alphaTest: 0.5, side: THREE.DoubleSide }), { onBeforeCompile: hazeShader(kit.tod, kit.leafWindShader) }),
        fern: Object.assign(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: '#10260e' }), { onBeforeCompile: hazeShader(kit.tod, kit.leafWindShader) }),
        grass: Object.assign(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: '#0f200a' }), { onBeforeCompile: grassShader(kit.tod) }),
        rock: Object.assign(new THREE.MeshLambertMaterial({ vertexColors: true, color: '#d4ccba', emissive: '#1a1814', flatShading: true }), { onBeforeCompile: hazeShader(kit.tod) }),
    }), []);
    const vegRef = useRef<THREE.Group>(null!), nearRef = useRef<THREE.Group>(null!), grassRef = useRef<THREE.Group>(null!), beam = useRef<THREE.Mesh>(null!);
    const inst = useRef<Record<string, THREE.InstancedMesh | null>>({});
    useEffect(() => {
        const o = new THREE.Object3D(), c = new THREE.Color();
        const fill = (key: string, list: Inst[], tintA: string, tintB: string) => { const m = inst.current[key]; if (!m) return; list.forEach((p, i) => { o.position.set(p.x, p.y, p.z); o.rotation.set(0, p.r, 0); o.scale.set(p.s, p.s * (p.sy ?? 1), p.s); o.updateMatrix(); m.setMatrixAt(i, o.matrix); m.setColorAt(i, c.set(tintA).lerp(new THREE.Color(tintB), p.tint ?? 0)); }); m.count = list.length; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); };
        fill('pAt', veg.palmA, '#ffffff', '#e8dccb'); fill('pAl', veg.palmA, '#ffffff', '#d8e8a8');
        fill('pBt', veg.palmB, '#f0e6d6', '#ffffff'); fill('pBl', veg.palmB, '#c8f0a0', '#ffffff');
        fill('bt', veg.broad, '#ffffff', '#d8cfc4'); fill('bl', veg.broad, '#ffffff', '#b8e890');
        fill('ut', veg.tall, '#ffffff', '#e0d8d0'); fill('ul', veg.tall, '#d8ffc0', '#9fcf7a');
        fill('bush', veg.bush, '#cfe8b0', '#ffffff'); fill('fern', veg.fern, '#ffffff', '#c8e6a0'); fill('rock', veg.rock, '#ffffff', '#b8b0a0');
    }, []);
    const grassPool = useMemo(() => { _seed = 555; const N = PHONE ? 2600 : 6500, R0 = PHONE ? 34 : 44, a = new Float32Array(N * 5); for (let i = 0; i < N; i++) { const r = R0 * Math.sqrt(rnd()), t = rnd() * 6.283; a[i * 5] = Math.cos(t) * r; a[i * 5 + 1] = Math.sin(t) * r; a[i * 5 + 2] = rnd() * 6.283; a[i * 5 + 3] = 0.75 + rnd() * 0.7; a[i * 5 + 4] = rnd(); } return { N, a }; }, []);
    const grassAt = useRef([1e9, 1e9]);
    const placeGrass = (hx: number, hz: number) => {
        const m = inst.current['grass']; if (!m) return; const { half, n, mask } = (veg as any).mask, o = new THREE.Object3D(), c = new THREE.Color(), cA = new THREE.Color('#ffffff'), cB = new THREE.Color('#cfe38f'); let k = 0;
        for (let i = 0; i < grassPool.N; i++) {
            const q = grassPool.a, x = hx + q[i * 5], z = hz + q[i * 5 + 1], gi = Math.floor(x - ISLAND.cx + half), gj = Math.floor(z - ISLAND.cz + half);
            if (gi < 0 || gj < 0 || gi >= n || gj >= n) continue; const y = mask[gj * n + gi]; if (y !== y) continue;
            o.position.set(x, y - 0.05, z); o.rotation.set(0, q[i * 5 + 2], 0); o.scale.set(q[i * 5 + 3], q[i * 5 + 3] * (0.8 + q[i * 5 + 4] * 0.9), q[i * 5 + 3]); o.updateMatrix(); m.setMatrixAt(k, o.matrix); m.setColorAt(k, c.copy(cA).lerp(cB, q[i * 5 + 4])); k++;
        }
        m.count = k; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    };
    useFrame(({ camera }) => {
        const d = Math.hypot(camera.position.x - ISLAND.cx, camera.position.z - ISLAND.cz);
        if (d < 170 && Math.hypot(sim.pos[0] - grassAt.current[0], sim.pos[2] - grassAt.current[1]) > 6) { grassAt.current = [sim.pos[0], sim.pos[2]]; placeGrass(sim.pos[0], sim.pos[2]); }
        if (vegRef.current) vegRef.current.visible = d < (PHONE ? 330 : 430);
        if (nearRef.current) nearRef.current.visible = d < 260;
        if (grassRef.current) grassRef.current.visible = d < 170;
        const t = sim.t, day = kit.tod.day.value; GRASS_T.value = t;
        for (const m of FALLS_MATS) { m.uniforms.uT.value = t; m.uniforms.uDay.value = day; }
        FOAM_MAT.uniforms.uT.value = t; FOAM_MAT.uniforms.uDay.value = day; SPRAY_MAT.uniforms.uT.value = t; MIST_MAT.uniforms.uT.value = t;
        RIVER_MAT.uniforms.uT.value = t; RIVER_MAT.uniforms.uDay.value = day; (RIVER_MAT.uniforms.uSky.value as THREE.Color).copy(kit.tod.fog).lerp(SKY_BLUE, 0.45);
        for (const w of waters) { const u = (w.material as THREE.ShaderMaterial).uniforms; u.uT.value = t; u.uDay.value = day; u.uSky.value.copy(kit.tod.fog).lerp(SKY_BLUE, 0.45); u.uSun.value.copy(kit.tod.sun); }
        if (beam.current) { const night = 1 - day; beam.current.rotation.y = t * 0.9; beamMat.opacity = 0.05 + 0.2 * night; beam.current.visible = night > 0.15; lampMat.color.setRGB(1, 0.95, 0.75).multiplyScalar(0.8 + 0.6 * night); }
    });
    const I = (key: string, geo: THREE.BufferGeometry, mat: THREE.Material, n: number) => <instancedMesh ref={(m) => { inst.current[key] = m; }} args={[geo, mat, Math.max(1, n)]} frustumCulled={false} />;
    return <group name="south-sea-island">
        <mesh geometry={terrain} material={terrainMat} frustumCulled={false} />
        <mesh geometry={lh.body} material={propMat} />
        <mesh geometry={lh.lamp} material={lampMat} onUpdate={(o) => o.layers.enable(SELECTIVE_BLOOM_LAYER)} />
        <mesh ref={beam} geometry={beamGeo} material={beamMat} position={[LIGHTHOUSE.x, lh.lampY, LIGHTHOUSE.z]} frustumCulled={false} />
        <mesh geometry={shacks} material={propMat} />
        <mesh geometry={dock} material={propMat} />
        <group ref={vegRef}>
            {I('pAt', geos.pA.trunk, mats.palmTrunk, veg.palmA.length)}{I('pAl', PHONE ? geos.pA.lo : geos.pA.leaves, mats.palmLeaf, veg.palmA.length)}
            {I('pBt', geos.pB.trunk, mats.palmTrunk, veg.palmB.length)}{I('pBl', geos.pB.lo, mats.palmLeaf, veg.palmB.length)}
            {I('bt', geos.t.trunk, mats.trunk, veg.broad.length)}{I('bl', geos.t.leaves, mats.leaf, veg.broad.length)}
            {I('ut', geos.u.trunk, mats.trunk, veg.tall.length)}{I('ul', geos.u.leaves, mats.leafDeep, veg.tall.length)}
            {I('bush', geos.b.leaves, mats.leafDeep, veg.bush.length)}
            {I('rock', geos.rock, mats.rock, veg.rock.length)}
        </group>
        <group ref={grassRef}><instancedMesh ref={(m) => { inst.current['grass'] = m; }} userData={{ outlineMaskAlpha: 0.5, outlineMaskThreshold: 0.75 }} args={[geos.grass, mats.grass, grassPool.N]} frustumCulled={false} />{I('fern', geos.fern, mats.fern, veg.fern.length)}</group>
        <mesh geometry={river} material={RIVER_MAT} renderOrder={2} frustumCulled={false} />
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

// ---------------------------------------------------------------- STEP 3: the bridge
const ORANGE = '#c4462e';
function quad(pos: number[], col: number[], a: number[], b: number[], c: number[], d: number[], cc: THREE.Color) { pos.push(...a, ...b, ...c, ...a, ...c, ...d); for (let i = 0; i < 6; i++) col.push(cc.r, cc.g, cc.b); }
function bridgeDeckGeo() {
    const pos: number[] = [], col: number[] = [], hw = BRIDGE.hw, step = 5, n = Math.ceil(BRIDGE_L / step);
    const prof: [number, number, string][] = [[-hw - 0.3, -1.9, ORANGE], [-hw - 0.3, 0.15, '#b9b4aa'], [-hw + 1.4, 0.15, '#9a958c'], [-hw + 1.4, 0.0, '#3b3f47'], [hw - 1.4, 0.0, '#9a958c'], [hw - 1.4, 0.15, '#b9b4aa'], [hw + 0.3, 0.15, ORANGE], [hw + 0.3, -1.9, '#5a3a32']];
    const cc = new THREE.Color();
    for (let i = 0; i < n; i++) {
        const u0 = i * step, u1 = Math.min(BRIDGE_L, (i + 1) * step), z0 = BRIDGE.z0 - u0, z1 = BRIDGE.z0 - u1, y0 = bridgeDeckU(u0), y1 = bridgeDeckU(u1);
        for (let k = 0; k < prof.length; k++) {
            const A = prof[k], B = prof[(k + 1) % prof.length]; cc.set(A[2]);
            quad(pos, col, [BRIDGE.x + A[0], y0 + A[1], z0], [BRIDGE.x + B[0], y0 + B[1], z0], [BRIDGE.x + B[0], y1 + B[1], z1], [BRIDGE.x + A[0], y1 + A[1], z1], cc);
        }
        if (i % 2 === 0) { cc.set('#f2d24a'); for (const lx of [-0.12, 0.12]) quad(pos, col, [BRIDGE.x + lx - 0.08, y0 + 0.03, z0], [BRIDGE.x + lx + 0.08, y0 + 0.03, z0], [BRIDGE.x + lx + 0.08, y1 + 0.03, z1], [BRIDGE.x + lx - 0.08, y1 + 0.03, z1], cc); }   // centre line
        cc.set(ORANGE);
        for (const sx of [-1, 1]) { const x = BRIDGE.x + sx * (hw + 0.25); quad(pos, col, [x, y0 + 0.15, z0], [x, y0 + 1.15, z0], [x, y1 + 1.15, z1], [x, y1 + 0.15, z1], cc); quad(pos, col, [x, y1 + 0.15, z1], [x, y1 + 1.15, z1], [x, y0 + 1.15, z0], [x, y0 + 0.15, z0], cc); }   // railings (both faces)
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
}
function bridgeStructGeo() {
    const parts: THREE.BufferGeometry[] = [], H = BRIDGE.towerH, floor = -32;
    for (let i = 0; i < 3; i++) {
        const z = towerZ(i), dy = bridgeDeckU(BRIDGE.towerU[i]);
        for (const sx of [-1, 1]) { const g = new THREE.BoxGeometry(BRIDGE.legW, H - floor, BRIDGE.legW * 1.3); g.translate(BRIDGE.x + sx * BRIDGE.legX, (H + floor) / 2, z); parts.push(colorize(g, ORANGE)); }
        for (const y of [dy - 2.6, 44, 70, H - 3]) { const g = new THREE.BoxGeometry(BRIDGE.legX * 2 + BRIDGE.legW, y === dy - 2.6 ? 1.6 : 3.2, BRIDGE.legW * 1.1); g.translate(BRIDGE.x, y, z); parts.push(colorize(g, ORANGE)); }
        { const g = new THREE.BoxGeometry(BRIDGE.legX * 2 + 9, 34, 12); g.translate(BRIDGE.x, floor + 17 + 1.0, z); parts.push(colorize(g, '#9c968c')); }   // concrete pier through the waterline
        for (const sx of [-1, 1]) { const g = new THREE.BoxGeometry(BRIDGE.legW + 0.8, 1.2, BRIDGE.legW * 1.6); g.translate(BRIDGE.x + sx * BRIDGE.legX, H + 0.6, z); parts.push(colorize(g, '#8f3322')); }   // saddles
    }
    for (let u = 40; u < BRIDGE_L - 20; u += 45) {   // approach piers where the deck is low
        if (u > 150 && u < BRIDGE_L - 150) continue;
        const y = bridgeDeckU(u) - 1.9; for (const sx of [-1, 1]) { const g = new THREE.BoxGeometry(2.4, y - floor, 2.4); g.translate(BRIDGE.x + sx * 3.8, (y + floor) / 2, BRIDGE.z0 - u); parts.push(colorize(g, '#a49e94')); }
    }
    const hstep = PHONE ? 14 : 10;
    for (let u = 60; u < BRIDGE_L - 60; u += hstep) { const yd = bridgeDeckU(u) + 0.2, yc = cableY(u); if (yc - yd < 2.5) continue; for (const sx of [-1, 1]) { const g = new THREE.BoxGeometry(0.14, yc - yd, 0.14); g.translate(BRIDGE.x + sx * CABLE_X, (yc + yd) / 2, BRIDGE.z0 - u); parts.push(colorize(g, '#d0583c')); } }
    for (let u = 15; u < BRIDGE_L; u += 30) { const y = bridgeDeckU(u), sx = (Math.round(u / 30) % 2) ? 1 : -1; const g = new THREE.CylinderGeometry(0.09, 0.12, 6, 5); g.translate(BRIDGE.x + sx * (BRIDGE.hw - 0.5), y + 3, BRIDGE.z0 - u); parts.push(colorize(g, '#5d6168')); }   // lamp posts
    return merged(parts);
}
function cableGeo() {
    const out: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) { const pts: THREE.Vector3[] = []; for (let u = 0; u <= BRIDGE_L; u += 6) pts.push(new THREE.Vector3(BRIDGE.x + sx * CABLE_X, cableY(u), BRIDGE.z0 - u)); const t = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, 0.5, PHONE ? 4 : 6, false); out.push(colorize(t, '#b8432c')); }
    return merged(out);
}
function lampHeadGeo() { const parts: THREE.BufferGeometry[] = []; for (let u = 15; u < BRIDGE_L; u += 30) { const y = bridgeDeckU(u), sx = (Math.round(u / 30) % 2) ? 1 : -1; const g = new THREE.SphereGeometry(0.35, 6, 4); g.translate(BRIDGE.x + sx * (BRIDGE.hw - 0.5), y + 6.1, BRIDGE.z0 - u); parts.push(g); } return merged(parts); }
// (3b) the bridge's traffic is the game's flying cars (sim CARS axis 2), drawn by FlyingCars with the city ones
function Bridge({ sim, kit }: { sim: Sim; kit: SouthSeaKit }) {
    const deck = useMemo(bridgeDeckGeo, []), struct = useMemo(bridgeStructGeo, []), cables = useMemo(cableGeo, []), heads = useMemo(lampHeadGeo, []);
    const mat = useMemo(() => { const m = new THREE.MeshLambertMaterial({ vertexColors: true }); m.onBeforeCompile = hazeShader(kit.tod); return m; }, []);
    const lampMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffe7a8' }), []);
    useFrame(() => { const night = 1 - kit.tod.day.value; lampMat.color.setRGB(1, 0.91, 0.66).multiplyScalar(0.35 + 0.9 * night); });
    return <group name="south-sea-bridge">
        <mesh geometry={deck} material={mat} frustumCulled={false} />
        <mesh geometry={struct} material={mat} frustumCulled={false} />
        <mesh geometry={cables} material={mat} frustumCulled={false} />
        <mesh geometry={heads} material={lampMat} onUpdate={(o2) => o2.layers.enable(SELECTIVE_BLOOM_LAYER)} frustumCulled={false} />
    </group>;
}

export function SouthSea({ sim, kit }: { sim: Sim; kit: SouthSeaKit }) {
    return <group name="south-sea"><Island sim={sim} kit={kit} /><Bridge sim={sim} kit={kit} /></group>;
}
void islandPeakY;
