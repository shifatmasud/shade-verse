// Tech pirate ship (Shifat Oct 31 7:05 PM: 'big pirate ship ... modern pirate ship full of tech'). Refs: Sea of Thieves galleon silhouette crossed with
// cyberpunk stealth-ship materials: carbon-black lofted hull with a red underbelly, neon cyan gunwale + waterline light strips, three carbon masts carrying
// holographic sails, a holo Jolly Roger, railgun turrets down both sides, a stern castle with lit windows, radar + antenna mast.
// Budget: 4 draw calls (hull/superstructure, neon, holo sails+flag, sails are one mesh), static. Decks come from seaWorld (walkable).
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { PIRATE, pirateHalfBeam, pirateDeckY } from '../seaWorld';
import { SELECTIVE_BLOOM_LAYER } from '../renderLayers';
import { type SouthSeaKit, hazeShader, colorize, merged } from './southSea/common';

const KEEL = -5.5;
function hullGeo() {   // lofted hull: N sections along x, each a rounded U from gunwale to keel, both sides + the deck cap
    const N = 48, K = 9, pos: number[] = [], col: number[] = [], idx: number[] = [];
    const black = new THREE.Color('#15171d'), red = new THREE.Color('#5a1418'), deckC = new THREE.Color('#3a3430'), strip = new THREE.Color('#202430');
    const ring = (i: number) => { const lx = -PIRATE.L / 2 + (i / N) * PIRATE.L; return { lx, hw: Math.max(0.05, pirateHalfBeam(lx)), top: pirateDeckY(lx) + 1.1 }; };
    const vid = (i: number, k: number, side: number) => (i * (2 * K + 2)) + (side > 0 ? k : K + 1 + k);
    for (let i = 0; i <= N; i++) {
        const r = ring(i), keel = KEEL + 2.0 * Math.max(0, ((i / N) - 0.85) / 0.15);   // keel rises at the bow
        for (const side of [1, -1]) for (let k = 0; k <= K; k++) {
            const a = (k / K) * Math.PI / 2, y = r.top - (r.top - keel) * Math.sin(a), w = r.hw * Math.pow(Math.cos(a), 0.45);
            pos.push(PIRATE.cx + r.lx, y, PIRATE.cz + side * w);
            const c = y < -1.2 ? red : (Math.abs(y - 1.6) < 0.35 ? strip : black); col.push(c.r, c.g, c.b);
        }
    }
    for (let i = 0; i < N; i++) for (const side of [1, -1]) for (let k = 0; k < K; k++) {
        const a = vid(i, k, side), b = vid(i + 1, k, side), c2 = vid(i, k + 1, side), d = vid(i + 1, k + 1, side);
        if (side > 0) idx.push(a, c2, b, b, c2, d); else idx.push(a, b, c2, b, d, c2);
    }
    // transom (flat stern plate) + deck cap
    const base = pos.length / 3;
    for (let i = 0; i <= N; i++) { const r = ring(i), y = pirateDeckY(r.lx); for (const side of [1, -1]) { pos.push(PIRATE.cx + r.lx, y, PIRATE.cz + side * Math.max(0.05, r.hw - 0.6)); col.push(deckC.r, deckC.g, deckC.b); } }
    for (let i = 0; i < N; i++) { const a = base + i * 2, b = a + 1, c2 = a + 2, d = a + 3; idx.push(a, c2, b, b, c2, d); }
    for (let k = 0; k < K; k++) { const a = vid(0, k, 1), b = vid(0, k + 1, 1), c2 = vid(0, k, -1), d = vid(0, k + 1, -1); idx.push(a, c2, b, b, c2, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
    g.computeVertexNormals(); return g.toNonIndexed();
}
const P = (g: THREE.BufferGeometry, c: string, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0, rz = 0) => { const q = g.index ? g.toNonIndexed() : g.clone(); q.scale(sx, sy, sz); if (rz) q.rotateZ(rz); if (ry) q.rotateY(ry); q.translate(PIRATE.cx + x, y, PIRATE.cz + z); colorize(q, c); return q; };
const MASTS: [number, number][] = [[-30, 36], [4, 44], [34, 38]];   // local x, height above deck
function partsGeo() {
    const S: THREE.BufferGeometry[] = [], Ng: THREE.BufferGeometry[] = [], box = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(1, 1, 1, 10), D = PIRATE.deck, L = PIRATE.L;
    // stern castle with neon window bands
    S.push(P(box, '#1b1e26', -L / 2 + 12, D + 3.1, 0, 22, 6.2, 18)); S.push(P(box, '#262a34', -L / 2 + 12, D + 6.5, 0, 23, 0.6, 19));
    for (const z of [-9.05, 9.05]) for (let k = 0; k < 5; k++) Ng.push(P(box, '#7ff3ff', -L / 2 + 4 + k * 4, D + 3.6, z, 2.2, 1.0, 0.08));
    for (let k = 0; k < 4; k++) Ng.push(P(box, '#ffb35a', -L / 2 + 0.95 - 0.1, D + 2.4 + (k % 2) * 2.2, -5 + (k >> 1) * 10, 0.08, 1.2, 3.4));   // warm stern lights
    // bridge tower + radar + antennas
    S.push(P(box, '#20242e', -12, D + 6.5, 0, 12, 13, 8)); Ng.push(P(box, '#7ff3ff', -12, D + 11.2, 0, 12.1, 0.9, 8.1));
    S.push(P(new THREE.SphereGeometry(2.4, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#c8ced8', -12, D + 13.6, 0, 1, 0.55, 1));
    for (const [x, h] of [[-15, 9], [-9, 6]] as [number, number][]) S.push(P(cyl, '#9aa2ae', x, D + 13 + h / 2, 2.5, 0.12, h, 0.12));
    // masts, yards, crow's nests
    for (const [mx, h] of MASTS) {
        const y0 = (pirateDeckY(mx));
        S.push(P(cyl, '#2a2e38', mx, y0 + h / 2, 0, 0.75, h, 0.75)); Ng.push(P(cyl, '#7ff3ff', mx, y0 + h / 2, 0, 0.8, h * 0.98, 0.12));
        for (const f of [0.38, 0.62, 0.86]) { const w = 22 * (1.15 - f * 0.55); S.push(P(box, '#2a2e38', mx, y0 + h * f, 0, 0.6, 0.6, w)); Ng.push(P(box, '#ff4fd8', mx, y0 + h * f - 0.35, 0, 0.62, 0.08, w * 0.98)); }
        S.push(P(cyl, '#20242e', mx, y0 + h * 0.93, 0, 1.6, 1.2, 1.6));
    }
    // railgun turrets along both sides
    for (const side of [1, -1]) for (let k = 0; k < 6; k++) {
        const lx = -32 + k * 12, hw = pirateHalfBeam(lx) - 1.6, y = pirateDeckY(lx);
        S.push(P(cyl, '#2e333e', lx, y + 0.7, side * hw, 1.2, 1.4, 1.2)); S.push(P(box, '#3a404c', lx, y + 1.5, side * (hw + 2.2), 0.6, 0.5, 4.6));
        Ng.push(P(box, '#7ff3ff', lx, y + 1.5, side * (hw + 4.5), 0.66, 0.56, 0.12));
    }
    // bowsprit + figurehead light
    S.push(P(cyl, '#2a2e38', L / 2 + 6, pirateDeckY(L / 2 - 4) + 3, 0, 0.45, 20, 0.45, 0, -1.2)); Ng.push(P(new THREE.SphereGeometry(0.8, 10, 6), '#ff4fd8', L / 2 + 13, pirateDeckY(L / 2 - 4) + 7, 0));
    // neon gunwale + waterline strips following the hull
    for (let i = 0; i < 40; i++) {
        const lx = -L / 2 + 1 + i * (L - 4) / 40, l2 = lx + (L - 4) / 40, hw = pirateHalfBeam(lx), hw2 = pirateHalfBeam(l2); if (hw < 0.5 || hw2 < 0.5) continue;
        const yaw = Math.atan2(hw - hw2, l2 - lx), len = Math.hypot(l2 - lx, hw2 - hw);
        for (const side of [1, -1]) {
            Ng.push(P(box, '#7ff3ff', (lx + l2) / 2, pirateDeckY((lx + l2) / 2) + 1.15, side * ((hw + hw2) / 2 + 0.02), len, 0.16, 0.12, side * yaw));
            Ng.push(P(box, '#7ff3ff', (lx + l2) / 2, 1.6, side * ((hw + hw2) / 2 * 0.985 + 0.05), len, 0.12, 0.1, side * yaw));
        }
    }
    return { solid: merged(S), neon: merged(Ng) };
}
function sailsGeo() {   // holo sails between the yards (uv drives the shader) + the Jolly Roger flag on the main mast
    const G: THREE.BufferGeometry[] = [];
    for (const [mx, h] of MASTS) {
        const y0 = pirateDeckY(mx);
        for (const [f0, f1] of [[0.38, 0.62], [0.62, 0.86]] as [number, number][]) {
            const wA = 22 * (1.15 - f0 * 0.55), wB = 22 * (1.15 - f1 * 0.55), g = new THREE.PlaneGeometry(1, 1, 6, 4), p = g.attributes.position as THREE.BufferAttribute;
            for (let k = 0; k < p.count; k++) { const u = p.getX(k) + 0.5, v = p.getY(k) + 0.5, w = wA + (wB - wA) * v, y = y0 + h * (f0 + (f1 - f0) * v) - 0.4; p.setXYZ(k, PIRATE.cx + mx + 1.6 * Math.sin(u * Math.PI) * (1 - 0.3 * v), y, PIRATE.cz + (u - 0.5) * w * 0.94); }
            const fl = new Float32Array(p.count).fill(0); g.setAttribute('aFlag', new THREE.BufferAttribute(fl, 1)); G.push(g.toNonIndexed());
        }
    }
    { const [mx, h] = MASTS[1], y0 = pirateDeckY(mx), g = new THREE.PlaneGeometry(9, 6); g.rotateY(Math.PI / 2); g.translate(PIRATE.cx + mx, y0 + h + 3.5, PIRATE.cz + 4.6); const fl = new Float32Array(g.attributes.position.count).fill(1); g.setAttribute('aFlag', new THREE.BufferAttribute(fl, 1)); G.push(g.toNonIndexed()); }
    const out = new THREE.BufferGeometry(); for (const k of ['position', 'uv', 'aFlag']) { const parts = G.map((g) => (g.attributes[k] as THREE.BufferAttribute)); const n = parts.reduce((s, a) => s + a.array.length, 0), arr = new Float32Array(n); let o = 0; for (const a of parts) { arr.set(a.array as Float32Array, o); o += a.array.length; } out.setAttribute(k, new THREE.BufferAttribute(arr, parts[0].itemSize)); }
    out.computeBoundingSphere(); return out;
}
const SAIL_VS = `attribute float aFlag; varying vec2 vUv; varying float vF; varying vec3 vW; uniform float uT;
void main(){ vUv = uv; vF = aFlag; vec3 p = position; if (aFlag > 0.5) p.z += sin(uv.x * 6.0 - uT * 4.0) * 0.6 * uv.x; vW = p; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`;
const SAIL_FS = `varying vec2 vUv; varying float vF; varying vec3 vW; uniform float uT; uniform float uDay;
float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
void main(){
  vec2 uv = vUv; float scan = 0.65 + 0.35 * sin(uv.y * 90.0 - uT * 6.0);
  float edge = smoothstep(0.0, 0.06, uv.x) * smoothstep(1.0, 0.94, uv.x) * smoothstep(0.0, 0.05, uv.y) * smoothstep(1.0, 0.95, uv.y);
  vec3 c = mix(vec3(0.15, 0.85, 1.0), vec3(1.0, 0.3, 0.85), uv.y + 0.15 * sin(uT * 0.7 + vW.x * 0.05));
  float a = (0.16 + 0.22 * (1.0 - edge) + 0.08 * scan) * (0.75 + 0.25 * sin(uT * 2.3 + vW.x));
  if (vF > 0.5) {   // holographic Jolly Roger: skull + crossbones
    vec2 q = (uv - vec2(0.5, 0.55)) * vec2(1.5, 1.0);
    float skull = length(q * vec2(1.0, 1.15)) - 0.22; float jaw = max(abs(q.x) - 0.11, abs(q.y + 0.2) - 0.06);
    float eyes = min(length(q - vec2(-0.08, 0.02)), length(q - vec2(0.08, 0.02))) - 0.055;
    float bones = min(sdSeg(q, vec2(-0.38, -0.38), vec2(0.38, 0.12)), sdSeg(q, vec2(-0.38, 0.12), vec2(0.38, -0.38))) - 0.035;
    float sh = min(min(skull, jaw), bones); float ink = 1.0 - smoothstep(0.0, 0.015, sh); ink *= smoothstep(0.0, 0.015, eyes);
    c = mix(vec3(0.05, 0.06, 0.08), vec3(0.95, 1.0, 1.0), ink); a = 0.82 * (0.85 + 0.15 * scan);
  }
  gl_FragColor = vec4(c * mix(1.0, 1.35, 1.0 - uDay), a);
}`;

export function PirateShip({ kit }: { kit: SouthSeaKit }) {
    const hull = useMemo(hullGeo, []), parts = useMemo(partsGeo, []), sails = useMemo(sailsGeo, []);
    const mats = useMemo(() => {
        const solid = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#0a0b0e', side: THREE.DoubleSide }); solid.onBeforeCompile = hazeShader(kit.tod); (solid as any).customProgramCacheKey = () => 'pirate-s';
        const neon = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
        const sail = new THREE.ShaderMaterial({ vertexShader: SAIL_VS, fragmentShader: SAIL_FS, uniforms: { uT: { value: 0 }, uDay: kit.tod.day }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending, fog: false });
        return { solid, neon, sail };
    }, []);
    const grp = React.useRef<THREE.Group>(null!);
    useFrame((st, dt) => { const c = st.camera.position, d = Math.hypot(c.x - PIRATE.cx, c.z - PIRATE.cz); if (grp.current) { grp.current.visible = d < 900; const ch = grp.current.children; if (ch.length > 3) ch[3].visible = d < 450; }   /* far LOD: holo sails only within 450 m */ mats.sail.uniforms.uT.value += Math.min(dt, 0.1); });
    return (
        <group name="pirate-ship" ref={grp}>
            <mesh geometry={hull} material={mats.solid} />
            <mesh geometry={parts.solid} material={mats.solid} />
            <mesh geometry={parts.neon} material={mats.neon} onUpdate={(o) => o.layers.enable(SELECTIVE_BLOOM_LAYER)} />
            <mesh geometry={sails} material={mats.sail} renderOrder={4} />
        </group>
    );
}
