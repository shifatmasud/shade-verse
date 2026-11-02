// Combat FX renderer (Nov 2 2026): draws the pools in src/combatFx.ts.
// 3 draw calls: additive sprites (glow/ring/spark/core/ground ring/ground streak/lightning segment/preview ring, also drawn in the
// selective-bloom pass), alpha sprites (comic hit-star with black ink rim, web splat, dust, debris), additive ribbon trails.
// Procedural shapes in the fragment shader: no textures, no new passes, pooled fixed-size buffers.
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { addP, alphaP, pool, F, ADD_MAX, ALPHA_MAX, stepPools, stepTrails, trails, trailPoint, TRAIL_PTS, TRAIL_SLOTS, bolts, screenFlash, emit, fxChargeTick, SH_CORE, SH_GLOW, SH_SPARK, SH_SEG, SH_GPREVIEW, SH_GSTREAK } from './combatFx';
import { MOVES, getCompanionSim, type Sim } from './sim';
import { SELECTIVE_BLOOM_LAYER } from './renderLayers';

type FxHero = { getSim: () => Sim | null; rig: any; base: number; visible: () => boolean; acc: { v: number }; full: boolean };
const heroes: FxHero[] = [];
const DBG = !!(import.meta as any).env.VITE_DBG;
/** heroes register their rig so trails/fist glow read the posed bones at render time (base = first of 2 trail slots) */
export function registerFxHero(getSim: () => Sim | null, rig: any, base: number, visible: () => boolean = () => true) {
    const h: FxHero = { getSim, rig, base, visible, acc: { v: 0 }, full: false }; heroes.push(h);
    return () => { const i = heroes.indexOf(h); if (i >= 0) heroes.splice(i, 1); for (let k = 0; k < 2; k++) trails[base + k].n = 0; };
}

const EXTRA = 48;   // per-frame state sprites: fist glow / preview ring (2 heroes) + lightning segments (5 bolts x 7)
const VS = `attribute vec4 iA; attribute vec4 iB; attribute vec4 iC; attribute vec4 iD;
varying vec2 vQ; varying vec4 vC; varying vec3 vD;
void main(){
  vQ = position.xy; float sh = iB.w; vec3 P = iA.xyz; float S = iA.w; vec4 mv;
  if (sh > 1.5 && sh < 2.5 || sh > 5.5 && sh < 6.5) {
    vec3 ax = iB.xyz; float L = length(ax); ax = L > 1e-4 ? ax / L : vec3(0.0, 1.0, 0.0);
    vec3 vd = normalize(P - cameraPosition); vec3 sd = cross(ax, vd); float sl = length(sd); sd = sl > 1e-4 ? sd / sl : vec3(1.0, 0.0, 0.0);
    mv = viewMatrix * vec4(P + ax * (position.y * 0.5 * L) + sd * (position.x * S), 1.0);
  } else if (sh > 3.5 && sh < 4.5 || sh > 6.5 && sh < 7.5 || sh > 13.5) {
    mv = viewMatrix * vec4(P + vec3(position.x * S, 0.0, position.y * S), 1.0);
  } else if (sh > 4.5 && sh < 5.5) {
    vec3 ax = vec3(iB.x, 0.0, iB.z); float L = length(ax); ax = ax / max(L, 1e-4); vec3 sd = vec3(-ax.z, 0.0, ax.x);
    mv = viewMatrix * vec4(P + ax * (position.y * 0.5 * L) + sd * (position.x * S), 1.0);
  } else {
    float c = cos(iD.y), s = sin(iD.y); vec2 q = vec2(c * position.x - s * position.y, s * position.x + c * position.y);
    mv = viewMatrix * vec4(P, 1.0); mv.xy += q * S;
  }
  vC = iC; vD = vec3(sh, iD.x, iD.z);
  gl_Position = projectionMatrix * mv;
}`;
const FS_ADD = `varying vec2 vQ; varying vec4 vC; varying vec3 vD;
void main(){
  float sh = vD.x, r = length(vQ), a = 0.0; vec3 col = vC.rgb;
  if (sh < 0.5) { a = max(0.0, 1.0 - r); a *= a; col = mix(col, vec3(1.0), a * a * 0.6); }
  else if (sh < 1.5 || (sh > 3.5 && sh < 4.5) || sh > 6.5) {
    float th = vD.z, d = abs(r - (1.0 - th * 0.5)); a = 1.0 - smoothstep(th * 0.2, th * 0.5, d);
    if (sh > 6.5) { float dash = step(0.35, fract(atan(vQ.y, vQ.x) * 5.0)); a = a * (0.45 + 0.55 * dash) + (r < 1.0 ? 0.10 * r * r : 0.0); }
    col = mix(col, vec3(1.0), a * a * 0.55);
  }
  else if (sh < 2.5 || (sh > 5.5 && sh < 6.5)) { float ac = max(0.0, 1.0 - abs(vQ.x)); a = ac * ac * (1.0 - vQ.y * vQ.y); col = mix(col, vec3(1.0), ac * ac * ac); r = 0.0; }
  else if (sh < 3.5) { a = smoothstep(1.0, 0.5, r); col = vec3(1.0); }
  else { float ac = max(0.0, 1.0 - abs(vQ.x)); a = ac * smoothstep(1.0, 0.5, abs(vQ.y)); col = mix(col, vec3(1.0), ac * ac); r = 0.0; }
  if (r > 1.0) a = 0.0;
  a *= vC.a; if (a < 0.004) discard;
  gl_FragColor = vec4(col * a, a);
}`;
const FS_ALPHA = `varying vec2 vQ; varying vec4 vC; varying vec3 vD;
void main(){
  float sh = vD.x, r = length(vQ), a = 0.0; vec3 col = vC.rgb;
  if (sh < 10.5) {   // comic hit-star: 5 spikes, coloured fill with white core, black ink rim
    float th = atan(vQ.y, vQ.x), f = fract(th * 5.0 / 6.2831853 + 0.5) * 2.0 - 1.0, spike = 1.0 - abs(f);
    float rs = 0.38 + 0.62 * pow(spike, 2.2), w = fwidth(r) * 1.5;
    a = 1.0 - smoothstep(rs - w, rs, r);
    float ink = smoothstep(rs * 0.74 - w, rs * 0.74, r);
    col = mix(mix(vec3(1.0), col, smoothstep(0.08, 0.5, r / rs)), vec3(0.02, 0.02, 0.05), ink);
  } else if (sh < 11.5) {   // web splat: 8 spokes + 2 rings, white with a dark rim
    float th = atan(vQ.y, vQ.x), sp = abs(sin(th * 4.0)) * r, w = fwidth(r);
    float ln = max(max(1.0 - smoothstep(0.035, 0.06 + w, sp), 1.0 - smoothstep(0.03, 0.055 + w, abs(r - 0.45 - 0.04 * sin(th * 8.0)))), 1.0 - smoothstep(0.03, 0.05 + w, abs(r - 0.82 - 0.05 * sin(th * 8.0))));
    float rim = max(max(1.0 - smoothstep(0.06, 0.09 + w, sp), 1.0 - smoothstep(0.055, 0.085 + w, abs(r - 0.45 - 0.04 * sin(th * 8.0)))), 1.0 - smoothstep(0.05, 0.08 + w, abs(r - 0.82 - 0.05 * sin(th * 8.0))));
    float blob = 1.0 - smoothstep(0.12, 0.16, r);
    a = max(rim, blob) * (1.0 - smoothstep(0.9, 1.0, r)); col = mix(vec3(0.05, 0.05, 0.1), vec3(1.0), max(ln, blob));
  } else if (sh < 12.5) { a = pow(max(0.0, 1.0 - r), 1.6) * 0.7; }
  else if (sh > 13.5) {   // comic shockwave band on the ground: ink rims, white leading edge, hero colour behind it (reads on bright roofs where additive washes out)
    float th = vD.z, d = r - (1.0 - th * 0.5), w = fwidth(r) * 1.5;
    a = 1.0 - smoothstep(th * 0.5 - w, th * 0.5, abs(d));
    float ink = smoothstep(th * 0.32 - w, th * 0.32, abs(d));
    col = mix(mix(col, vec3(1.0), smoothstep(-th * 0.3, th * 0.3, d)), vec3(0.02, 0.02, 0.06), ink);
    if (sh > 14.5) { float dash = step(0.4, fract(atan(vQ.y, vQ.x) * 24.0 / 6.2831853 + vD.y)); a *= dash; col = mix(vC.rgb, vec3(0.02, 0.02, 0.06), ink); }   // Slam radius preview: dashed, rotating
  }
  else { float m = max(abs(vQ.x), abs(vQ.y)); a = 1.0 - step(0.85, m); col = mix(col, vec3(0.0), step(0.6, m)); }
  a *= vC.a; if (a < 0.01) discard;
  gl_FragColor = vec4(col, a);
}`;
const VS_RIB = `attribute vec4 aC; attribute float aV; varying vec4 vC; varying float vV; void main(){ vC = aC; vV = aV; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`;
const FS_RIB = `varying vec4 vC; varying float vV; void main(){ float ac = 1.0 - abs(vV); float a = vC.a * ac; vec3 col = mix(vC.rgb, vec3(1.0), ac * ac * ac); if (a < 0.004) discard; gl_FragColor = vec4(col * a, a); }`;

function makeSprites(n: number, fs: string, additive: boolean) {
    const plane = new THREE.PlaneGeometry(2, 2), g = new THREE.InstancedBufferGeometry();
    g.setIndex(plane.index); g.setAttribute('position', plane.attributes.position);
    const mk = () => { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4); a.setUsage(THREE.DynamicDrawUsage); return a; };
    g.setAttribute('iA', mk()); g.setAttribute('iB', mk()); g.setAttribute('iC', mk()); g.setAttribute('iD', mk()); g.instanceCount = 0;
    const m = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, transparent: true, depthWrite: false, depthTest: true, toneMapped: false, fog: false, side: THREE.DoubleSide });   // ground quads face either way
    if (additive) { m.blending = THREE.CustomBlending; m.blendEquation = THREE.AddEquation; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneFactor; m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor; }
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = additive ? 12 : 11;
    return mesh;
}
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Color();
const LIMB: Record<number, string> = { 1: 'handL', 2: 'handR', 3: 'footR', 4: 'handR', 5: 'footR', 6: 'footR', 7: 'handR' };

export function CombatFX({ sim }: { sim: Sim }) {
    const { camera } = useThree();
    const st = useMemo(() => {
        const add = makeSprites(ADD_MAX + EXTRA, FS_ADD, true), alpha = makeSprites(ALPHA_MAX, FS_ALPHA, false);
        const nv = TRAIL_SLOTS * TRAIL_PTS * 2, rg = new THREE.BufferGeometry();
        const pos = new THREE.BufferAttribute(new Float32Array(nv * 3), 3), col = new THREE.BufferAttribute(new Float32Array(nv * 4), 4), av = new THREE.BufferAttribute(new Float32Array(nv), 1);
        pos.setUsage(THREE.DynamicDrawUsage); col.setUsage(THREE.DynamicDrawUsage);
        for (let i = 0; i < nv; i++) av.setX(i, i & 1 ? 1 : -1);
        const idx: number[] = []; for (let t = 0; t < TRAIL_SLOTS; t++) for (let j = 0; j < TRAIL_PTS - 1; j++) { const b = (t * TRAIL_PTS + j) * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
        rg.setIndex(idx); rg.setAttribute('position', pos); rg.setAttribute('aC', col); rg.setAttribute('aV', av); rg.setDrawRange(0, 0);
        const rm = new THREE.ShaderMaterial({ vertexShader: VS_RIB, fragmentShader: FS_RIB, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
        rm.blending = THREE.CustomBlending; rm.blendEquation = THREE.AddEquation; rm.blendSrc = THREE.OneFactor; rm.blendDst = THREE.OneFactor; rm.blendSrcAlpha = THREE.ZeroFactor; rm.blendDstAlpha = THREE.OneFactor;
        const rib = new THREE.Mesh(rg, rm); rib.frustumCulled = false; rib.renderOrder = 12;
        const flash = document.createElement('div'); flash.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:0;visibility:hidden;pointer-events:none;z-index:5';
        return { add, alpha, rib, flash, frame: -1, tick: 0, boltSeed: 0 };
    }, []);
    useEffect(() => {
        st.add.layers.enable(SELECTIVE_BLOOM_LAYER);
        document.body.appendChild(st.flash);
        const write = () => { if (st.tick === st.frame) return; st.frame = st.tick; writeBuffers(); };   // once per game frame, at the first render that draws an FX mesh
        st.add.onBeforeRender = write; st.alpha.onBeforeRender = write; st.rib.onBeforeRender = write;
        if ((import.meta as any).env.VITE_DBG) (window as any).__combatFx = { pool, trails, st };
        return () => { st.flash.remove(); };
    }, []);
    // write the instance buffers at render time, so trails and fist glow read this frame's posed bones
    function writeBuffers() {
        const A = st.add.geometry as THREE.InstancedBufferGeometry;
        const a1 = (A.attributes.iA as THREE.InstancedBufferAttribute).array as Float32Array, b1 = (A.attributes.iB as any).array as Float32Array, c1 = (A.attributes.iC as any).array as Float32Array, d1 = (A.attributes.iD as any).array as Float32Array;
        let n = 0;
        const put = (x: number, y: number, z: number, size: number, dx: number, dy: number, dz: number, sh: number, r: number, g: number, b: number, al: number, u: number, rot: number, th: number) => {
            if (n >= ADD_MAX + EXTRA) return; const o = n * 4; a1[o] = x; a1[o + 1] = y; a1[o + 2] = z; a1[o + 3] = size; b1[o] = dx; b1[o + 1] = dy; b1[o + 2] = dz; b1[o + 3] = sh; c1[o] = r; c1[o + 1] = g; c1[o + 2] = b; c1[o + 3] = al; d1[o] = u; d1[o + 1] = rot; d1[o + 2] = th; n++;
        };
        for (let i = 0; i < pool.addN; i++) {
            const o = i * F, u = addP[o + 6] / addP[o + 7], sh = addP[o + 14], size = addP[o + 8] + (addP[o + 9] - addP[o + 8]) * (sh === 1 || sh === 4 ? 1 - Math.pow(1 - u, 3) : u);
            let al = addP[o + 13] * (addP[o + 19] === 2 ? (1 - u) * (1 - u) : sh === 4 ? (u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4) : sh === 5 ? (1 - u) * ((st.tick >> 1) & 1 ? 1 : 0.55) : 1 - u);
            let dx = addP[o + 3], dy = addP[o + 4], dz = addP[o + 5];
            if (sh === 2) { const k = 0.035; dx *= k; dy *= k; dz *= k; const L = Math.hypot(dx, dy, dz); if (L < 0.08) { const s = 0.08 / Math.max(1e-4, L); dx *= s; dy *= s; dz *= s; } }
            put(addP[o], addP[o + 1], addP[o + 2], size, dx, dy, dz, sh, addP[o + 10], addP[o + 11], addP[o + 12], al, u, addP[o + 17], sh === 1 ? Math.min(0.6, Math.max(0.04, addP[o + 18] * (1.15 - u) / Math.max(0.05, size))) : addP[o + 18]);   // ring thickness: metres -> fraction of radius (impact ring thins as it grows); ground ring: fraction
        }
        // per-frame state: Charged Slam fist glow + radius preview, dive fists
        const previews: number[] = [];
        for (const h of heroes) {
            const s = h.getSim(); if (!s || !h.visible()) continue; const S = (s as any).slam; if (!S) { h.full = false; continue; }
            const col = (s as any).fxCol ?? 0xa855f7; _c.setHex(col);
            const hand = h.rig.b.handR as THREE.Bone; _v.setFromMatrixPosition(hand.matrixWorld);
            if (S.ph === 0) {
                const c = S.c, hz = 6 + 6 * c, pulse = 0.8 + 0.2 * Math.sin(s.t * hz * Math.PI * 2), size = (0.15 + 0.3 * c) * pulse;
                put(_v.x, _v.y, _v.z, size * 2.2, 0, 0, 0, SH_GLOW, _c.r, _c.g, _c.b, 0.7 + 0.3 * c, 0, 0, 0);
                put(_v.x, _v.y, _v.z, size * 0.9, 0, 0, 0, SH_CORE, 1, 1, 1, 0.9, 0, 0, 0);
                put(s.pos[0], s.pos[1] - 0.95, s.pos[2], S.R, 0, 0, 0, SH_GPREVIEW, _c.r, _c.g, _c.b, 0.25 + 0.25 * c, 0, 0, 0.04);
                previews.push(s.pos[0], s.pos[1] - 0.96, s.pos[2], S.R, _c.r, _c.g, _c.b, s.t * 0.15);
                if (S.full && !h.full) emit(SH_CORE, _v.x, _v.y, _v.z, 0, 0, 0, 0.034, 1.2, 1.4, 0xffffff, 1);   // full charge: 1-frame white ping
                h.full = S.full;
            } else if (S.ph >= 1 && S.ph <= 4) {
                put(_v.x, _v.y, _v.z, 0.9, 0, 0, 0, SH_GLOW, _c.r, _c.g, _c.b, 1, 0, 0, 0);
                const hl = h.rig.b.handL as THREE.Bone; _w.setFromMatrixPosition(hl.matrixWorld); put(_w.x, _w.y, _w.z, 0.7, 0, 0, 0, SH_GLOW, _c.r, _c.g, _c.b, 0.8, 0, 0, 0);
            }
        }
        // lightning: 7-segment jagged lines, vertices re-randomised every 2 frames
        if (!(st.tick & 1)) st.boltSeed = Math.random() * 1000;
        let seed = st.boltSeed; const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 - 0.5; };
        for (const bo of bolts) {
            const u = bo.t / bo.life, al = 1 - u; let px = bo.ax, py = bo.ay, pz = bo.az; const L = Math.hypot(bo.bx - bo.ax, bo.by - bo.ay, bo.bz - bo.az), j = Math.min(0.6, L * 0.12);
            for (let k = 1; k <= 7; k++) {
                const f = k / 7, nx = k === 7 ? bo.bx : bo.ax + (bo.bx - bo.ax) * f + rnd() * j, ny = k === 7 ? bo.by : bo.ay + (bo.by - bo.ay) * f + rnd() * j, nz = k === 7 ? bo.bz : bo.az + (bo.bz - bo.az) * f + rnd() * j;
                put((px + nx) / 2, (py + ny) / 2, (pz + nz) / 2, 0.07, nx - px, ny - py, nz - pz, SH_SEG, 0.6, 0.97, 1, al, u, 0, 0);
                px = nx; py = ny; pz = nz;
            }
        }
        A.instanceCount = n; for (const k of ['iA', 'iB', 'iC', 'iD']) { const at = A.attributes[k] as THREE.InstancedBufferAttribute; at.clearUpdateRanges(); at.addUpdateRange(0, n * 4); at.needsUpdate = true; }
        // alpha sprites
        const B = st.alpha.geometry as THREE.InstancedBufferGeometry;
        const a2 = (B.attributes.iA as any).array as Float32Array, b2 = (B.attributes.iB as any).array as Float32Array, c2 = (B.attributes.iC as any).array as Float32Array, d2 = (B.attributes.iD as any).array as Float32Array;
        for (let i = 0; i < pool.alphaN; i++) {
            const o = i * F, q = i * 4, u = alphaP[o + 6] / alphaP[o + 7], sh = alphaP[o + 14];
            const pop = sh === 14 ? alphaP[o + 8] + (alphaP[o + 9] - alphaP[o + 8]) * (1 - Math.pow(1 - u, 3)) : sh === 10 ? alphaP[o + 9] + (alphaP[o + 8] - alphaP[o + 9]) * Math.pow(1 - Math.min(1, u * 2.5), 2) : alphaP[o + 8] + (alphaP[o + 9] - alphaP[o + 8]) * u;
            a2[q] = alphaP[o]; a2[q + 1] = alphaP[o + 1]; a2[q + 2] = alphaP[o + 2]; a2[q + 3] = pop; b2[q] = 0; b2[q + 1] = 0; b2[q + 2] = 0; b2[q + 3] = sh;
            c2[q] = alphaP[o + 10]; c2[q + 1] = alphaP[o + 11]; c2[q + 2] = alphaP[o + 12];
            c2[q + 3] = alphaP[o + 13] * (sh === 14 ? (u < 0.6 ? 1 : (1 - u) / 0.4) : sh === 11 ? Math.min(1, (1 - u) * 3) : sh === 10 ? (u < 0.7 ? 1 : (1 - u) / 0.3) : 1 - u);
            d2[q] = u; d2[q + 1] = alphaP[o + 17]; d2[q + 2] = alphaP[o + 18];
        }
        let an = pool.alphaN;
        for (let k = 0; k + 7 < previews.length && an < ALPHA_MAX + 4; k += 8, an++) { const q = an * 4; a2[q] = previews[k]; a2[q + 1] = previews[k + 1]; a2[q + 2] = previews[k + 2]; a2[q + 3] = previews[k + 3]; b2[q] = 0; b2[q + 1] = 0; b2[q + 2] = 0; b2[q + 3] = 15; c2[q] = previews[k + 4]; c2[q + 1] = previews[k + 5]; c2[q + 2] = previews[k + 6]; c2[q + 3] = 0.9; d2[q] = previews[k + 7]; d2[q + 1] = 0; d2[q + 2] = 0.05; }
        B.instanceCount = an; for (const k of ['iA', 'iB', 'iC', 'iD']) { const at = B.attributes[k] as THREE.InstancedBufferAttribute; at.clearUpdateRanges(); at.addUpdateRange(0, an * 4); at.needsUpdate = true; }
        // ribbons: camera-facing strips, width tapers with age
        const G = st.rib.geometry, P = G.attributes.position.array as Float32Array, C = (G.attributes.aC as THREE.BufferAttribute).array as Float32Array; let maxT = 0;
        const cp = camera.position;
        for (let t = 0; t < TRAIL_SLOTS; t++) {
            const tr = trails[t]; _c.setHex(tr.col);
            for (let j = 0; j < TRAIL_PTS; j++) {
                const v0 = (t * TRAIL_PTS + j) * 2;
                if (j >= tr.n) { const q = Math.max(0, tr.n - 1) * 4; for (let k = 0; k < 2; k++) { P.set([tr.pts[q], tr.pts[q + 1], tr.pts[q + 2]], (v0 + k) * 3); C[(v0 + k) * 4 + 3] = 0; } continue; }
                const q = j * 4, j0 = Math.max(0, j - 1) * 4, j1 = Math.min(tr.n - 1, j + 1) * 4;
                const tx = tr.pts[j1] - tr.pts[j0], ty = tr.pts[j1 + 1] - tr.pts[j0 + 1], tz = tr.pts[j1 + 2] - tr.pts[j0 + 2];
                const vx = tr.pts[q] - cp.x, vy = tr.pts[q + 1] - cp.y, vz = tr.pts[q + 2] - cp.z;
                let sx = ty * vz - tz * vy, sy = tz * vx - tx * vz, sz = tx * vy - ty * vx; const sl = Math.hypot(sx, sy, sz) || 1;
                const age = tr.pts[q + 3] / tr.life, w = tr.width * 0.5 * Math.max(0, 1 - age) * (1 - j / TRAIL_PTS * 0.5); sx = sx / sl * w; sy = sy / sl * w; sz = sz / sl * w;
                P[v0 * 3] = tr.pts[q] - sx; P[v0 * 3 + 1] = tr.pts[q + 1] - sy; P[v0 * 3 + 2] = tr.pts[q + 2] - sz; P[v0 * 3 + 3] = tr.pts[q] + sx; P[v0 * 3 + 4] = tr.pts[q + 1] + sy; P[v0 * 3 + 5] = tr.pts[q + 2] + sz;
                const al = Math.max(0, 1 - age) * 0.95; for (let k = 0; k < 2; k++) { const c0 = (v0 + k) * 4; C[c0] = _c.r; C[c0 + 1] = _c.g; C[c0 + 2] = _c.b; C[c0 + 3] = al; }
            }
            if (tr.n > 1) maxT = t + 1;
        }
        G.setDrawRange(0, maxT * (TRAIL_PTS - 1) * 6); G.attributes.position.needsUpdate = true; G.attributes.aC.needsUpdate = true;
    }
    useFrame((_, rawDt) => {
        const dt = Math.min(0.1, rawDt) * (DBG && (window as any).__ts != null ? (window as any).__ts : 1) * ((sim as any).tsNow || 1); st.tick++;   // same clock as the sim (test hook __ts included)
        stepPools(dt); stepTrails(dt); for (let i = bolts.length - 1; i >= 0; i--) { bolts[i].t += dt; if (bolts[i].t >= bolts[i].life) bolts.splice(i, 1); }
        // trails + charge particles from the posed bones of the previous render (matrixWorld)
        for (const h of heroes) {
            const s = h.getSim(); if (!s || !h.visible()) continue; const sa = s as any, col = sa.fxCol ?? 0xa855f7, m = sa.mv, S = sa.slam;
            if (m && MOVES[m.id]) {
                const M = MOVES[m.id];
                if (m.t >= M.hit - 0.07 && m.t <= M.hit + 0.09) { _v.setFromMatrixPosition((h.rig.b[LIMB[m.id]] as THREE.Bone).matrixWorld); trailPoint(h.base, _v.x, _v.y, _v.z, col, m.id >= 3 ? 0.2 : 0.12, 0.22); if (m.id === 7) { _w.setFromMatrixPosition((h.rig.b.handL as THREE.Bone).matrixWorld); trailPoint(h.base + 1, _w.x, _w.y, _w.z, col, 0.12, 0.22); } }
            }
            if (S && S.ph >= 2 && S.ph <= 4) { _v.setFromMatrixPosition((h.rig.b.handR as THREE.Bone).matrixWorld); trailPoint(h.base, _v.x, _v.y, _v.z, col, 0.16, 0.26); _w.setFromMatrixPosition((h.rig.b.handL as THREE.Bone).matrixWorld); trailPoint(h.base + 1, _w.x, _w.y, _w.z, col, 0.16, 0.26); }
            if (S && S.ph === 0) { _v.setFromMatrixPosition((h.rig.b.handR as THREE.Bone).matrixWorld); fxChargeTick(_v.x, _v.y, _v.z, S.c, col, dt, h.acc); }
        }
        // visibility decided here (onBeforeRender only runs for visible meshes): no FX on screen = no FX draw calls
        let slamOn = false; for (const h of heroes) { const s = h.getSim(); if (s && (s as any).slam && h.visible()) slamOn = true; }
        st.add.visible = pool.addN > 0 || bolts.length > 0 || slamOn; st.alpha.visible = pool.alphaN > 0 || slamOn; st.rib.visible = trails.some((t) => t.n > 1);
        // Slam white flash: 2 frames at 35 %, then hidden (a full-screen layer costs the compositor even at opacity 0)
        if (screenFlash.frames > 0) { st.flash.style.visibility = 'visible'; st.flash.style.opacity = String(screenFlash.a); screenFlash.frames--; }
        else if (st.flash.style.visibility !== 'hidden') { st.flash.style.visibility = 'hidden'; st.flash.style.opacity = '0'; }
    });
    void getCompanionSim; void SH_SPARK; void SH_GSTREAK;
    return <><primitive object={st.add} /><primitive object={st.alpha} /><primitive object={st.rib} /></>;
}
