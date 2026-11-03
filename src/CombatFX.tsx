// Combat FX renderer (Nov 2 2026): draws the pools in src/combatFx.ts.
// 3 draw calls: additive sprites (glow/spark/core/ground light smear/ground streak/lightning segment, also drawn in the
// selective-bloom pass), alpha sprites (soft dust, soft web strand), additive ribbon trails (motion-blur style).
// Nov 2 (Shifat): no rings, no comic shapes, no hard edges - every shape is a soft falloff, lit by the always-on bloom.
// Procedural shapes in the fragment shader: no textures, no new passes, pooled fixed-size buffers.
import { useEffect, useMemo } from 'react';
import { hitFeelTrails } from './hitFeel';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { addP, alphaP, pool, F, ADD_MAX, ALPHA_MAX, stepPools, stepTrails, trails, trailPoint, TRAIL_PTS, TRAIL_SLOTS, bolts, screenFlash, emit, fxChargeTick, SH_CORE, SH_GLOW, SH_SPARK, SH_SEG, SH_GSTREAK, LOW, fxShotMuzzle, fxShotTrail, SHOT_TRAIL_STEP, tint } from './combatFx';
import { MOVES, SNARE, enemyBodyOffset, getCompanionSim, type Sim } from './sim';
import { SELECTIVE_BLOOM_LAYER } from './renderLayers';

type FxHero = { getSim: () => Sim | null; rig: any; base: number; visible: () => boolean; acc: { v: number }; acc2: { v: number }; full: boolean };
const heroes: FxHero[] = [];
const DBG = !!(import.meta as any).env.VITE_DBG;
/** heroes register their rig so trails/fist glow read the posed bones at render time (base = first of 2 trail slots) */
export function registerFxHero(getSim: () => Sim | null, rig: any, base: number, visible: () => boolean = () => true) {
    const h: FxHero = { getSim, rig, base, visible, acc: { v: 0 }, acc2: { v: 0 }, full: false }; heroes.push(h);
    return () => { const i = heroes.indexOf(h); if (i >= 0) heroes.splice(i, 1); for (let k = 0; k < 2; k++) trails[base + k].n = 0; };
}

const EXTRA_A = 10;   // alpha per-frame state: web strands (2 heroes x 2 hands x 2 segments)
const EXTRA = 224;   // per-frame state sprites: fist glow / previews, Shock tethers (2 heroes x 5 targets x 7 segments), lightning bolts (10 x 7), web-shot bolts (2 heroes x 3 bolts x 10 layers)
const VS = `attribute vec4 iA; attribute vec4 iB; attribute vec4 iC; attribute vec4 iD;
varying vec2 vQ; varying vec4 vC; varying vec3 vD;
void main(){
  vQ = position.xy; float sh = iB.w; vec3 P = iA.xyz; float S = iA.w; vec4 mv;
  if (sh > 1.5 && sh < 2.5 || sh > 5.5 && sh < 6.5 || sh > 15.5 && sh < 16.5) {
    vec3 ax = iB.xyz; float L = length(ax); ax = L > 1e-4 ? ax / L : vec3(0.0, 1.0, 0.0);
    vec3 vd = normalize(P - cameraPosition); vec3 sd = cross(ax, vd); float sl = length(sd); sd = sl > 1e-4 ? sd / sl : vec3(1.0, 0.0, 0.0);
    float W = sh > 5.5 && sh < 6.5 ? S * 2.6 : sh < 2.5 ? S * 1.8 : S;   // segments + sparks: room for the soft halo
    mv = viewMatrix * vec4(P + ax * (position.y * 0.5 * L * (sh > 5.5 && sh < 6.5 ? 1.12 : 1.0)) + sd * (position.x * W), 1.0);
  } else if (sh > 3.5 && sh < 4.5) {   // ground light smear: flat on the ground, stretched along its velocity
    vec3 ax = vec3(iB.x, 0.0, iB.z); float L = length(ax); ax = L > 1e-4 ? ax / L : vec3(1.0, 0.0, 0.0); vec3 sd = vec3(-ax.z, 0.0, ax.x);
    mv = viewMatrix * vec4(P + ax * (position.y * (S + 0.5 * L)) + sd * (position.x * S), 1.0);
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
  if (sh < 0.5) { a = max(0.0, 1.0 - r); a *= a; col = mix(col, vec3(1.0), a * a * 0.6); }   // soft glow
  else if (sh > 3.5 && sh < 4.5) { a = max(0.0, 1.0 - r); a = a * a * a; col = mix(col, vec3(1.0), a * 0.5); }   // soft ground smear, no edge
  else if (sh < 2.5) {   // spark streak: gaussian hot core in a wide blurred halo, soft rounded ends (no needle tip), brighter head;
    // cools white-hot -> its colour over its life (Nov 2, Shifat: "no sharp edges. Only soft edges for vfx")
    float ax = abs(vQ.x), core = exp(-ax * ax * 16.0), halo = exp(-ax * ax * 3.5) * 0.42;
    a = (core + halo) * (1.0 - ax) * smoothstep(1.0, 0.3, abs(vQ.y)) * (0.35 + 0.65 * smoothstep(-1.0, 0.6, vQ.y));
    col = mix(vec3(1.0, 0.96, 0.88), col, smoothstep(0.05, 0.7, vD.y)); col = mix(col, vec3(1.0), core * 0.6); r = 0.0; }
  else if (sh > 5.5 && sh < 6.5) {   // lightning / tether / strand glow: thin hot core inside a wide blurred halo, soft ends
    float ac = max(0.0, 1.0 - abs(vQ.x)), c6 = pow(ac, 7.0); a = (c6 + 0.3 * ac * ac) * (1.0 - vQ.y * vQ.y * 0.85); col = mix(col, vec3(1.0), c6); r = 0.0; }
  else if (sh < 3.5) { a = exp(-r * r * 5.0) * (1.0 - r); col = mix(col, vec3(1.0), a); }   // hot core: gaussian, no disc edge
  else { float ac = max(0.0, 1.0 - abs(vQ.x)); a = ac * smoothstep(1.0, 0.5, abs(vQ.y)); col = mix(col, vec3(1.0), ac * ac); r = 0.0; }
  if (r > 1.0) a = 0.0;
  a *= vC.a; if (a < 0.004) discard;
  gl_FragColor = vec4(col * a, a);
}`;
const FS_ALPHA = `varying vec2 vQ; varying vec4 vC; varying vec3 vD;
void main(){
  float sh = vD.x, r = length(vQ), a = 0.0; vec3 col = vC.rgb;
  if (sh > 15.5) {   // web strand (pull / yank): soft white core with a soft falloff, ends tapered (no ink rim)
    float ax = abs(vQ.x), tip = smoothstep(1.0, 0.75, abs(vQ.y));
    a = exp(-ax * ax * 6.0) * tip; col = mix(col, vec3(0.72, 0.74, 0.86), smoothstep(0.1, 0.8, ax));
  } else if (sh > 12.5) {   // dark-to-warm smoke puff: gaussian, warm glowing centre that cools to soft dark smoke over its life, no edge
    a = exp(-r * r * 3.2) * (1.0 - r * r); float w = (1.0 - smoothstep(0.0, 0.55, vD.y)) * exp(-r * r * 6.0);
    col = mix(col, vec3(1.0, 0.62, 0.3), w);
  } else { a = pow(max(0.0, 1.0 - r), 1.6) * 0.7; }   // soft dust
  a *= vC.a; if (a < 0.01) discard;
  gl_FragColor = vec4(col, a);
}`;
const VS_RIB = `attribute vec4 aC; attribute float aV; varying vec4 vC; varying float vV; void main(){ vC = aC; vV = aV; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`;
const FS_RIB = `varying vec4 vC; varying float vV; void main(){ float ac = 1.0 - abs(vV); float a = vC.a * ac * ac; vec3 col = mix(vC.rgb, vec3(1.0), ac * ac * ac * ac * 0.7); if (a < 0.004) discard; gl_FragColor = vec4(col * a, a); }`;   // soft motion-blur smear (no hard edge)

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
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Color(), _cw = new THREE.Color(), _cx = new THREE.Color();
const LIMB: Record<number, string> = { 1: 'handL', 2: 'handR', 3: 'footR', 4: 'handR', 5: 'footR', 6: 'footR', 7: 'handR' };

export function CombatFX({ sim }: { sim: Sim }) {
    const { camera } = useThree();
    const st = useMemo(() => {
        const add = makeSprites(ADD_MAX + EXTRA, FS_ADD, true), alpha = makeSprites(ALPHA_MAX + EXTRA_A, FS_ALPHA, false);
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
        if ((import.meta as any).env.VITE_DBG) (window as any).__combatFx = { pool, trails, st, get low() { return LOW; } };
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
            const o = i * F, u = addP[o + 6] / addP[o + 7], sh = addP[o + 14], size = addP[o + 8] + (addP[o + 9] - addP[o + 8]) * (sh === 4 ? 1 - Math.pow(1 - u, 2) : u);
            let al = addP[o + 13] * (addP[o + 19] === 2 ? (1 - u) * (1 - u) : sh === 4 ? (1 - u) * (1 - u * 0.5) : sh === 5 ? (1 - u) * ((st.tick >> 1) & 1 ? 1 : 0.55) : 1 - u);
            let dx = addP[o + 3], dy = addP[o + 4], dz = addP[o + 5];
            if (sh === 4) { const k = 0.03; dx *= k; dy = 0; dz *= k; }
            if (sh === 2) { const k = 0.035 * Math.max(1, addP[o + 18]);   // thick >= 1 on sparks = longer velocity stretch (melee burst)
                dx *= k; dy *= k; dz *= k; const L = Math.hypot(dx, dy, dz); if (L < 0.08) { const s = 0.08 / Math.max(1e-4, L); dx *= s; dy *= s; dz *= s; } }
            put(addP[o], addP[o + 1], addP[o + 2], size, dx, dy, dz, sh, addP[o + 10], addP[o + 11], addP[o + 12], al, u, addP[o + 17], addP[o + 18]);
        }
        // per-frame state: Charged Slam fist glow, dive fists (the blast radius is shown by ground motes, see fxChargeTick)
        for (const h of heroes) {
            const s = h.getSim(); if (!s || !h.visible()) continue; const S = (s as any).slam; if (!S) { h.full = false; continue; }
            const col = (s as any).fxCol ?? 0xa855f7; _c.setHex(col);
            const hand = h.rig.b.handR as THREE.Bone; _v.setFromMatrixPosition(hand.matrixWorld);
            if (S.ph === 0) {
                const c = S.c, hz = 6 + 6 * c, pulse = 0.8 + 0.2 * Math.sin(s.t * hz * Math.PI * 2), size = (0.15 + 0.3 * c) * pulse;
                put(_v.x, _v.y, _v.z, size * 2.2, 0, 0, 0, SH_GLOW, _c.r, _c.g, _c.b, 0.7 + 0.3 * c, 0, 0, 0);
                put(_v.x, _v.y, _v.z, size * 0.9, 0, 0, 0, SH_CORE, 1, 1, 1, 0.9, 0, 0, 0);
                if (S.full && !h.full) emit(SH_CORE, _v.x, _v.y, _v.z, 0, 0, 0, 0.034, 1.2, 1.4, 0xffffff, 1);   // full charge: 1-frame white ping
                h.full = S.full;
            } else if (S.ph >= 1 && S.ph <= 4) {
                put(_v.x, _v.y, _v.z, 0.9, 0, 0, 0, SH_GLOW, _c.r, _c.g, _c.b, 1, 0, 0, 0);
                const hl = h.rig.b.handL as THREE.Bone; _w.setFromMatrixPosition(hl.matrixWorld); put(_w.x, _w.y, _w.z, 0.7, 0, 0, 0, SH_GLOW, _c.r, _c.g, _c.b, 0.8, 0, 0, 0);
            }
        }
        // web shot in flight (Shifat Nov 2 3:00 PM: "Web shot must have more layered vfx. Plain glowy orb projectiles feels basic"): every
        // hero's bolt is drawn here in the caster's colour, layered, all soft falloffs: a breathing outer halo, a hero-colour inner glow, a
        // white-hot core, a velocity-stretched comet tail (wide soft + thin hot), and small motes swirling round the core as short motion-
        // blurred streaks. The particle trail / muzzle burst / impact burst live in the pool (combatFx.ts). Was: one sprite pair per bolt
        // (enemies.tsx) + a Points dot for Ghost (Ghost.tsx) + a soft segment here; now all in this one instanced draw.
        for (const h of heroes) {
            const s = h.getSim(); if (!s || !s.plasma || !s.plasma.length) continue; const col = (s as any).fxCol ?? 0xa855f7; _c.setHex(col); _cw.setHex(tint(col, 0.6)); _cx.setHex(tint(col, 0.88));
            for (let bi = 0; bi < s.plasma.length; bi++) {
                const b = s.plasma[bi], sp = Math.hypot(b.vx, b.vy, b.vz) || 1, dx = b.vx / sp, dy = b.vy / sp, dz = b.vz / sp, ph = bi * 2.1 + h.base;
                const L = Math.min(1.3, 0.3 + b.t * 12), br = 1 + Math.sin(s.t * 9 + ph) * 0.13 + Math.sin(s.t * 23 + ph) * 0.05;   // tail grows out of the hand; halo breathes
                put(b.x - dx * L * 0.5, b.y - dy * L * 0.5, b.z - dz * L * 0.5, 0.34, dx * L, dy * L, dz * L, SH_SEG, _c.r, _c.g, _c.b, 0.42, 0, 0, 0);
                put(b.x - dx * L * 0.3, b.y - dy * L * 0.3, b.z - dz * L * 0.3, 0.12, dx * L * 0.6, dy * L * 0.6, dz * L * 0.6, SH_SEG, _cw.r, _cw.g, _cw.b, 0.45, 0, 0, 0);
                put(b.x, b.y, b.z, 1.75 * br, 0, 0, 0, SH_GLOW, _c.r, _c.g, _c.b, 0.3, 0, 0, 0);
                put(b.x, b.y, b.z, 0.8, 0, 0, 0, SH_GLOW, _c.r, _c.g, _c.b, 0.45, 0, 0, 0);
                put(b.x, b.y, b.z, 0.3 * (0.95 + 0.05 * br), 0, 0, 0, SH_CORE, _cx.r, _cx.g, _cx.b, 0.95, 0, 0, 0);
                // swirling motes: orbit the flight axis, each a short streak along its own orbit tangent
                const ax = Math.abs(dy) < 0.9 ? 0 : 1, ay = ax ? 0 : 1;   // helper axis
                let ux = dy * 0 - dz * ay, uy = dz * ax - dx * 0, uz = dx * ay - dy * ax; const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
                const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux, nm = LOW ? 3 : 5;
                for (let k = 0; k < nm; k++) {
                    const an = s.t * (k & 1 ? -13 : 16) + (k / nm) * Math.PI * 2 + ph, r = 0.3 + 0.08 * Math.sin(s.t * 7 + k * 1.7), ca = Math.cos(an), sa = Math.sin(an), back = 0.12 * k / nm;
                    const mx = b.x + (ux * ca + vx * sa) * r - dx * back, my = b.y + (uy * ca + vy * sa) * r - dy * back, mz = b.z + (uz * ca + vz * sa) * r - dz * back;
                    const tl = (k & 1 ? -0.2 : 0.2), tx = (-ux * sa + vx * ca) * tl - dx * 0.12, ty = (-uy * sa + vy * ca) * tl - dy * 0.12, tz = (-uz * sa + vz * ca) * tl - dz * 0.12;
                    put(mx, my, mz, 0.04, tx, ty, tz, SH_SPARK, k & 1 ? _c.r : _cw.r, k & 1 ? _c.g : _cw.g, k & 1 ? _c.b : _cw.b, 1.1, 0.6, 0, 0);
                }
            }
        }
        // web-pull / yank strand (gap #3): the old 1 px GL line was invisible. Now a soft white strand (alpha: soft core, no rim, 2 instances
        // per hand with a slight sag) plus a hero-colour glow line (additive, bloom). It shoots out from the hand over the first 60 ms.
        const strands: number[] = [];
        for (const h of heroes) {
            const s = h.getSim(); if (!s || !h.visible()) continue; const cw = (s as any).cWeb; if (!cw || !cw.e || cw.e.down > 0) continue;
            const e = cw.e, ex = e.x, ey = e.y + (e.ly || 0) + enemyBodyOffset(e), ez = e.z, grow = Math.min(1, cw.t / 0.06);
            _c.setHex((s as any).fxCol ?? 0xa855f7);
            for (let sd = cw.mode === 'yank' ? 0 : 1; sd < 2; sd++) {
                _v.setFromMatrixPosition((h.rig.b[sd ? 'handR' : 'handL'] as THREE.Bone).matrixWorld);
                const bx = _v.x + (ex - _v.x) * grow, by = _v.y + (ey - _v.y) * grow, bz = _v.z + (ez - _v.z) * grow;
                const L = Math.hypot(bx - _v.x, by - _v.y, bz - _v.z), sag = Math.min(0.35, L * 0.03) * (1 - Math.min(1, cw.t / 0.2));   // taut after 0.2 s
                const mx = (_v.x + bx) / 2, my = (_v.y + by) / 2 - sag, mz = (_v.z + bz) / 2;
                strands.push((_v.x + mx) / 2, (_v.y + my) / 2, (_v.z + mz) / 2, mx - _v.x, my - _v.y, mz - _v.z, 0.08, (mx + bx) / 2, (my + by) / 2, (mz + bz) / 2, bx - mx, by - my, bz - mz, 0.08);
                put((_v.x + bx) / 2, (_v.y + by) / 2 - sag * 0.5, (_v.z + bz) / 2, 0.16, bx - _v.x, by - _v.y, bz - _v.z, SH_SEG, _c.r, _c.g, _c.b, 0.55, 0, 0, 0);
                if (grow >= 1 && cw.t < 0.12) put(ex, ey, ez, 0.6, 0, 0, 0, SH_GLOW, 1, 1, 1, 0.8 * (1 - cw.t / 0.12), 0, 0, 0);   // attach ping on the bot
            }
        }
        // lightning: 7-segment jagged lines, vertices re-randomised every 2 frames
        if (!(st.tick & 1)) st.boltSeed = Math.random() * 1000;
        let seed = st.boltSeed; const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 - 0.5; };
        const zig = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, al: number, w: number, r: number, g: number, bl: number) => {
            let px = ax, py = ay, pz = az; const L = Math.hypot(bx - ax, by - ay, bz - az), j = Math.min(0.7, L * 0.1);
            for (let k = 1; k <= 7; k++) { const f = k / 7, nx = k === 7 ? bx : ax + (bx - ax) * f + rnd() * j, ny = k === 7 ? by : ay + (by - ay) * f + rnd() * j, nz = k === 7 ? bz : az + (bz - az) * f + rnd() * j; put((px + nx) / 2, (py + ny) / 2, (pz + nz) / 2, w, nx - px, ny - py, nz - pz, SH_SEG, r, g, bl, al, 0, 0, 0); px = nx; py = ny; pz = nz; }
        };
        // Shock (finding #6): visible energy tethers from the caster's hands to every bound bot, glow on the hands, until the discharge
        for (const h of heroes) {
            const s = h.getSim(); if (!s || !h.visible()) continue; const sa = s as any; if (!(sa.snareT > SNARE.IMPACT) || !sa.snareList) continue;
            _c.setHex(sa.fxCol ?? 0xa855f7); _v.setFromMatrixPosition((h.rig.b.handR as THREE.Bone).matrixWorld); _w.setFromMatrixPosition((h.rig.b.handL as THREE.Bone).matrixWorld);
            const hx = (_v.x + _w.x) / 2, hy = (_v.y + _w.y) / 2, hz = (_v.z + _w.z) / 2, grip = sa.snareT < SNARE.GATHER_END, fl = 0.75 + 0.25 * Math.sin(s.t * 60);
            const lr = _c.r + (1 - _c.r) * 0.4, lg = _c.g + (1 - _c.g) * 0.4, lb = _c.b + (1 - _c.b) * 0.4, hr = _c.r + (1 - _c.r) * 0.75, hg = _c.g + (1 - _c.g) * 0.75, hb = _c.b + (1 - _c.b) * 0.75;   // caster colour lifted toward white (Shadow purple / Ghost pink, Shifat 10:40 AM; was cyan for both)
            put(hx, hy, hz, grip ? 1.1 : 0.8, 0, 0, 0, SH_GLOW, _c.r, _c.g, _c.b, 0.9, 0, 0, 0); put(hx, hy, hz, 0.35, 0, 0, 0, SH_CORE, hr, hg, hb, 0.9 * fl, 0, 0, 0);
            for (const e of sa.snareList) { if (e.down > 0) continue; const ey = e.y + enemyBodyOffset(e); zig(hx, hy, hz, e.x, ey, e.z, fl, grip ? 0.09 : 0.06, lr, lg, lb); if (grip) zig(hx, hy, hz, e.x, ey, e.z, 0.6 * fl, 0.05, _c.r, _c.g, _c.b); put(e.x, ey, e.z, 1.0, 0, 0, 0, SH_GLOW, _c.r, _c.g, _c.b, 0.6 * fl, 0, 0, 0); }
        }
        for (const bo of bolts) {
            const u = bo.t / bo.life, al = 1 - u; _c.setHex(bo.col); const br = _c.r + (1 - _c.r) * 0.4, bg = _c.g + (1 - _c.g) * 0.4, bb = _c.b + (1 - _c.b) * 0.4; /* lightning in the caster's colour */ let px = bo.ax, py = bo.ay, pz = bo.az; const L = Math.hypot(bo.bx - bo.ax, bo.by - bo.ay, bo.bz - bo.az), j = Math.min(0.6, L * 0.12);
            for (let k = 1; k <= 7; k++) {
                const f = k / 7, nx = k === 7 ? bo.bx : bo.ax + (bo.bx - bo.ax) * f + rnd() * j, ny = k === 7 ? bo.by : bo.ay + (bo.by - bo.ay) * f + rnd() * j, nz = k === 7 ? bo.bz : bo.az + (bo.bz - bo.az) * f + rnd() * j;
                put((px + nx) / 2, (py + ny) / 2, (pz + nz) / 2, 0.07, nx - px, ny - py, nz - pz, SH_SEG, br, bg, bb, al, u, 0, 0);
                px = nx; py = ny; pz = nz;
            }
        }
        A.instanceCount = n; for (const k of ['iA', 'iB', 'iC', 'iD']) { const at = A.attributes[k] as THREE.InstancedBufferAttribute; at.clearUpdateRanges(); at.addUpdateRange(0, n * 4); at.needsUpdate = true; }
        // alpha sprites
        const B = st.alpha.geometry as THREE.InstancedBufferGeometry;
        const a2 = (B.attributes.iA as any).array as Float32Array, b2 = (B.attributes.iB as any).array as Float32Array, c2 = (B.attributes.iC as any).array as Float32Array, d2 = (B.attributes.iD as any).array as Float32Array;
        for (let i = 0; i < pool.alphaN; i++) {
            const o = i * F, q = i * 4, u = alphaP[o + 6] / alphaP[o + 7], sh = alphaP[o + 14];
            const pop = alphaP[o + 8] + (alphaP[o + 9] - alphaP[o + 8]) * (1 - (1 - u) * (1 - u));
            a2[q] = alphaP[o]; a2[q + 1] = alphaP[o + 1]; a2[q + 2] = alphaP[o + 2]; a2[q + 3] = pop; b2[q] = 0; b2[q + 1] = 0; b2[q + 2] = 0; b2[q + 3] = sh;
            c2[q] = alphaP[o + 10]; c2[q + 1] = alphaP[o + 11]; c2[q + 2] = alphaP[o + 12];
            c2[q + 3] = alphaP[o + 13] * Math.min(1, u * 8) * (1 - u);   // soft fade in and out
            d2[q] = u; d2[q + 1] = alphaP[o + 17]; d2[q + 2] = alphaP[o + 18];
        }
        let an = pool.alphaN;
        for (let k = 0; k + 6 < strands.length && an < ALPHA_MAX + EXTRA_A; k += 7, an++) { const q = an * 4; a2[q] = strands[k]; a2[q + 1] = strands[k + 1]; a2[q + 2] = strands[k + 2]; a2[q + 3] = strands[k + 6]; b2[q] = strands[k + 3]; b2[q + 1] = strands[k + 4]; b2[q + 2] = strands[k + 5]; b2[q + 3] = 16; c2[q] = 1; c2[q + 1] = 1; c2[q + 2] = 1; c2[q + 3] = 1; d2[q] = 0; d2[q + 1] = 0; d2[q + 2] = 0; }
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
                const al = Math.max(0, 1 - age) * 0.75; for (let k = 0; k < 2; k++) { const c0 = (v0 + k) * 4; C[c0] = _c.r; C[c0 + 1] = _c.g; C[c0 + 2] = _c.b; C[c0 + 3] = al; }
            }
            if (tr.n > 1) maxT = t + 1;
        }
        G.setDrawRange(0, maxT * (TRAIL_PTS - 1) * 6); G.attributes.position.needsUpdate = true; G.attributes.aC.needsUpdate = true;
    }
    useFrame((_, rawDt) => {
        const dt = Math.min(0.1, rawDt) * (DBG && (window as any).__ts != null ? (window as any).__ts : 1) * ((sim as any).tsNow || 1); st.tick++;   // same clock as the sim (test hook __ts included)
        // web shot: muzzle burst the first frame a bolt is seen, then trail puffs every SHOT_TRAIL_STEP metres along the path it flew this frame
        // (render-only bookkeeping on the bolt object: _fx = last position + distance carried; the sim never reads it)
        let shotOn = false;
        for (const h of heroes) {
            const s = h.getSim(); if (!s || !s.plasma || !s.plasma.length) continue; shotOn = true; const col = (s as any).fxCol ?? 0xa855f7;
            for (const b of s.plasma) {
                const sp = Math.hypot(b.vx, b.vy, b.vz) || 1, dx = b.vx / sp, dy = b.vy / sp, dz = b.vz / sp; let f = (b as any)._fx;
                if (!f) { const ox = b.x - b.vx * b.t, oy = b.y - b.vy * b.t, oz = b.z - b.vz * b.t; f = (b as any)._fx = { x: ox, y: oy, z: oz, acc: SHOT_TRAIL_STEP * 0.5, k: 0 }; fxShotMuzzle(ox, oy, oz, dx, dy, dz, col); }
                const mx = b.x - f.x, my = b.y - f.y, mz = b.z - f.z, d = Math.hypot(mx, my, mz);
                if (d > 1e-4 && d < 20) { let a = f.acc + d; while (a >= SHOT_TRAIL_STEP) { a -= SHOT_TRAIL_STEP; const u = 1 - a / d; fxShotTrail(f.x + mx * u, f.y + my * u, f.z + mz * u, dx, dy, dz, col, f.k++); } f.acc = a; }
                f.x = b.x; f.y = b.y; f.z = b.z;
            }
        }
        hitFeelTrails(sim, dt);   // knockback wisps (src/hitFeel.ts)
        stepPools(dt); stepTrails(dt); for (let i = bolts.length - 1; i >= 0; i--) { bolts[i].t += dt; if (bolts[i].t >= bolts[i].life) bolts.splice(i, 1); }
        // trails + charge particles from the posed bones of the previous render (matrixWorld)
        for (const h of heroes) {
            const s = h.getSim(); if (!s || !h.visible()) continue; const sa = s as any, col = sa.fxCol ?? 0xa855f7, m = sa.mv, S = sa.slam;
            if (m && MOVES[m.id]) {
                const M = MOVES[m.id];
                if (m.t >= M.hit - 0.09 && m.t <= M.hit + 0.1) { _v.setFromMatrixPosition((h.rig.b[LIMB[m.id]] as THREE.Bone).matrixWorld); trailPoint(h.base, _v.x, _v.y, _v.z, col, m.id >= 3 ? 0.2 : 0.12, 0.3); if (m.id === 7) { _w.setFromMatrixPosition((h.rig.b.handL as THREE.Bone).matrixWorld); trailPoint(h.base + 1, _w.x, _w.y, _w.z, col, 0.12, 0.22); } }
            }
            if (S && S.ph >= 2 && S.ph <= 4) { _v.setFromMatrixPosition((h.rig.b.handR as THREE.Bone).matrixWorld); trailPoint(h.base, _v.x, _v.y, _v.z, col, 0.16, 0.26); _w.setFromMatrixPosition((h.rig.b.handL as THREE.Bone).matrixWorld); trailPoint(h.base + 1, _w.x, _w.y, _w.z, col, 0.16, 0.26); }
            if (S && S.ph === 0) { _v.setFromMatrixPosition((h.rig.b.handR as THREE.Bone).matrixWorld); fxChargeTick(_v.x, _v.y, _v.z, S.c, col, dt, h.acc, s.pos[0], s.pos[1] - 1, s.pos[2], S.R, h.acc2); }
        }
        // visibility decided here (onBeforeRender only runs for visible meshes): no FX on screen = no FX draw calls
        let slamOn = false; for (const h of heroes) { const s = h.getSim(); if (s && ((s as any).slam || (s as any).snareT > 0 || (s as any).cWeb) && h.visible()) slamOn = true; }
        st.add.visible = pool.addN > 0 || bolts.length > 0 || slamOn || shotOn; st.alpha.visible = pool.alphaN > 0 || slamOn; st.rib.visible = trails.some((t) => t.n > 1);
        // Slam white flash: 2 frames at 35 %, then hidden (a full-screen layer costs the compositor even at opacity 0)
        if (screenFlash.frames > 0) { st.flash.style.visibility = 'visible'; st.flash.style.opacity = String(screenFlash.a); screenFlash.frames--; }
        else if (st.flash.style.visibility !== 'hidden') { st.flash.style.visibility = 'hidden'; st.flash.style.opacity = '0'; }
    });
    void getCompanionSim; void SH_SPARK; void SH_GSTREAK;
    return <><primitive object={st.add} /><primitive object={st.alpha} /><primitive object={st.rib} /></>;
}
