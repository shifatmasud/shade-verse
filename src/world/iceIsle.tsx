// Ice Isle (Shifat Oct 31 5:48 PM: 'iceberg island: translucent blue ice, snow cap, glowing igloos, floating chunks, cold fog'; 6:25 PM: 'an island
// from another side of the city'). Ground = seaWorld iceRaw (the sim walks it). Refs: Antarctic tabular bergs / Greenland glacier fronts:
// sheer cliffs glow cyan where light passes through thin ice, deep blue in the cracks, white snow on every flat top.
// Budget: 5 draw calls (terrain, igloo shells, igloo glow, floating chunks, fog cards), all static.
import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { ICE, iceRaw, iceRR } from '../seaWorld';
import { SELECTIVE_BLOOM_LAYER } from '../renderLayers';
import { type SouthSeaKit, PHONE, hazeShader, colorize, merged, rnd, setSeed } from './southSea/common';

const IGLOOS: [number, number, number, number][] = [[18, 20, 2.4, 1], [30, 4, 0.9, 0.85], [10, 34, 3.6, 0.8], [34, 24, 1.8, 0.75], [-30, 30, 4.4, 0.9]];   // local x, z, door yaw, size

function terrainGeo() {
    const n = PHONE ? 130 : 180, half = ICE.R * 1.5, pos: number[] = [], col: number[] = [], ice: number[] = [], idx: number[] = [], ok: boolean[] = [];
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
        const x = ICE.cx - half + (i / n) * 2 * half, z = ICE.cz - half + (j / n) * 2 * half, h = iceRaw(x, z);
        pos.push(x, h ?? -40, z); ok.push(h !== null && h > -30);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i, b = a + 1, d = a + n + 1, e = d + 1; if (ok[a] && ok[b] && ok[d] && ok[e]) idx.push(a, d, b, b, d, e); }
    g.setIndex(idx); g.computeVertexNormals();
    const nr = g.attributes.normal as THREE.BufferAttribute, c = new THREE.Color(), snow = new THREE.Color('#f3f7fb'), snow2 = new THREE.Color('#dfe9f2'), iceHi = new THREE.Color('#9fe3f2'), iceLo = new THREE.Color('#2a86b4'), crack = new THREE.Color('#0f4f80');
    for (let k = 0; k < nr.count; k++) {
        const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2], up = nr.getY(k), steep = THREE.MathUtils.smoothstep(1 - up, 0.2, 0.45);
        const band = 0.5 + 0.5 * Math.sin(y * 1.9 + Math.sin(x * 0.3 + z * 0.2) * 1.5);   // horizontal annual layers in the cliff
        c.copy(iceHi).lerp(iceLo, THREE.MathUtils.clamp((4 - y) / 13, 0, 1)).lerp(crack, 0.25 * band * steep);
        const sn = 0.5 + 0.5 * Math.sin(x * 0.21 + z * 0.17);
        c.lerp(snow2.clone().lerp(snow, sn), 1 - steep);
        col.push(c.r, c.g, c.b); ice.push(steep);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('aIce', new THREE.Float32BufferAttribute(ice, 1));
    return g;
}
// translucent-ice look on a Lambert: cyan glow through thin ice (fresnel-weighted), stronger low on the cliffs; snow stays plain
const iceShader = (sh: any) => {
    sh.vertexShader = 'attribute float aIce; varying float vIce; varying float vIy;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vIce = aIce; vIy = (modelMatrix * vec4(position, 1.0)).y;');
    sh.fragmentShader = 'varying float vIce; varying float vIy; uniform float uIceDay;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      { float fr = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 2.0);
        float thin = 1.0 - smoothstep(-8.0, 14.0, vIy);
        totalEmissiveRadiance += vec3(0.10, 0.42, 0.55) * vIce * (0.35 + 0.65 * fr) * (0.45 + 0.55 * thin) * mix(0.35, 1.0, uIceDay); }`);
};

function iglooGeo() {
    const shell: THREE.BufferGeometry[] = [], glow: THREE.BufferGeometry[] = [];
    for (const [lx, lz, yaw, s] of IGLOOS) {
        const x = ICE.cx + lx, z = ICE.cz + lz, y = (iceRaw(x, z) ?? 4) - 0.25, R = 4.8 * s;
        const d = new THREE.SphereGeometry(R, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2); d.translate(x, y, z); colorize(d, '#eef4fa'); shell.push(d);
        for (let k = 1; k < 4; k++) { const r = new THREE.TorusGeometry(R * Math.cos(k * 0.38) + 0.02, 0.05, 3, 24); r.rotateX(Math.PI / 2); r.translate(x, y + R * Math.sin(k * 0.38), z); colorize(r, '#c8d6e4'); shell.push(r); }   // snow-block courses
        const t = new THREE.CylinderGeometry(1.5 * s, 1.5 * s, 3.2 * s, 10, 1, true, 0, Math.PI); t.rotateZ(Math.PI / 2); t.rotateY(yaw); const fx = Math.sin(yaw), fz = Math.cos(yaw); t.translate(x + fx * (R + 0.6 * s), y, z + fz * (R + 0.6 * s)); colorize(t, '#e6eef6'); shell.push(t);   // entrance tunnel
        const door = new THREE.CircleGeometry(1.3 * s, 12, 0, Math.PI); door.rotateY(yaw); door.translate(x + fx * (R + 2.22 * s), y + 0.02, z + fz * (R + 2.22 * s)); glow.push(door);
        for (const a of [yaw + 1.6, yaw - 1.4]) { const w = new THREE.CircleGeometry(0.6 * s, 8); w.rotateY(a); w.translate(x + Math.sin(a) * (R * 0.93), y + R * 0.38, z + Math.cos(a) * (R * 0.93)); glow.push(w); }   // ice windows
    }
    return { shell: merged(shell), glow: merged(glow) };
}
function chunksGeo() {   // floating ice chunks: flattened, jagged low-poly bergs scattered round the island
    const P: THREE.BufferGeometry[] = []; setSeed(6161);
    for (let t = 0, n = 0; n < (PHONE ? 26 : 38) && t < 900; t++) {
        const a = rnd() * 6.283, r = ICE.R * (1.12 + rnd() * 1.3), x = ICE.cx + Math.cos(a) * r, z = ICE.cz + Math.sin(a) * r;
        if (iceRR(x, z) < 1.08) continue; n++;
        const s = 1.2 + rnd() * (n < 6 ? 6 : 2.6), g = new THREE.IcosahedronGeometry(1, 0).toNonIndexed(), p = g.attributes.position as THREE.BufferAttribute;
        for (let k = 0; k < p.count; k++) { const vx = p.getX(k), vy = p.getY(k), vz = p.getZ(k), h = Math.sin(vx * 7.1 + vz * 3.3 + n) * 0.18; p.setXYZ(k, vx * (1 + h), vy > 0 ? vy * 0.55 + 0.25 : vy * 1.2, vz * (1 - h)); }
        g.scale(s * (1 + rnd() * 0.8), s, s); g.rotateY(rnd() * 6.28); g.translate(x, -1.0 + s * 0.12, z); g.computeVertexNormals();
        const c = new THREE.Color('#d9f1fa'), nc = g.attributes.normal as THREE.BufferAttribute, col = new Float32Array(p.count * 3), ic = new Float32Array(p.count);
        for (let k = 0; k < p.count; k++) { const up = nc.getY(k), st = Math.min(1, Math.max(0, (0.75 - up) / 0.5)); const cc = c.clone().lerp(new THREE.Color('#5fb9dc'), st * 0.8); col[k * 3] = cc.r; col[k * 3 + 1] = cc.g; col[k * 3 + 2] = cc.b; ic[k] = st; }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aIce', new THREE.BufferAttribute(ic, 1)); P.push(g);
    }
    return P.length ? (merged(P)) : new THREE.BufferGeometry();
}
function fogGeo() {   // cold sea fog: soft low cards hugging the water round the island (camera-facing in the shader)
    const P: THREE.BufferGeometry[] = []; setSeed(7272);
    for (let k = 0; k < (PHONE ? 14 : 22); k++) {
        const a = rnd() * 6.283, r = ICE.R * (0.7 + rnd() * 1.1), x = ICE.cx + Math.cos(a) * r, z = ICE.cz + Math.sin(a) * r, w = 50 + rnd() * 50, h = 12 + rnd() * 8;
        const g = new THREE.PlaneGeometry(1, 1); const c = new Float32Array(4 * 4); for (let q = 0; q < 4; q++) { c[q * 4] = x; c[q * 4 + 1] = -1.0 + h * 0.35; c[q * 4 + 2] = z; c[q * 4 + 3] = w; }
        g.setAttribute('aC', new THREE.BufferAttribute(c, 4)); const hh = new Float32Array(4).fill(h); g.setAttribute('aH', new THREE.BufferAttribute(hh, 1)); P.push(g);
    }
    const m = new THREE.BufferGeometry(), all = P.map((g) => g.toNonIndexed()); const keys = ['position', 'uv', 'aC', 'aH'];
    for (const k of keys) { const n = all.reduce((s, g) => s + (g.attributes[k] as THREE.BufferAttribute).array.length, 0), sz = (all[0].attributes[k] as THREE.BufferAttribute).itemSize, arr = new Float32Array(n); let o = 0; for (const g of all) { const a = (g.attributes[k] as THREE.BufferAttribute).array as Float32Array; arr.set(a, o); o += a.length; } m.setAttribute(k, new THREE.BufferAttribute(arr, sz)); }
    m.boundingSphere = new THREE.Sphere(new THREE.Vector3(ICE.cx, 0, ICE.cz), ICE.R * 2.6); return m;
}
const FOG_VS = `attribute vec4 aC; attribute float aH; varying vec2 vUv; varying float vF;
void main(){ vUv = uv; vec3 cv = (viewMatrix * vec4(aC.xyz, 1.0)).xyz; vec3 p = cv + vec3(position.x * aC.w, position.y * aH, 0.0);
  float d = length(cv); vF = smoothstep(6.0, 40.0, d) * (1.0 - smoothstep(700.0, 1100.0, d)); gl_Position = projectionMatrix * vec4(p, 1.0); }`;
const FOG_FS = `uniform vec3 uFogC; uniform float uDay; varying vec2 vUv; varying float vF;
void main(){ vec2 q = vUv * 2.0 - 1.0; float a = (1.0 - smoothstep(0.2, 1.0, length(q * vec2(1.0, 1.15)))) * smoothstep(-1.0, -0.2, q.y) * 0.2 * vF;
  if (a < 0.004) discard; gl_FragColor = vec4(mix(uFogC * 0.5, mix(uFogC, vec3(0.86, 0.93, 0.98), 0.6), uDay), a); }`;

export function IceIsle({ kit }: { kit: SouthSeaKit }) {
    const terrain = useMemo(terrainGeo, []), ig = useMemo(iglooGeo, []), chunks = useMemo(chunksGeo, []), fog = useMemo(fogGeo, []);
    const mats = useMemo(() => {
        const ck = (m: THREE.Material, k: string) => { (m as any).customProgramCacheKey = () => 'ice-' + k; return m; };
        const iceU = { value: 1 };
        const iceMat = (k: string) => { const m = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#0b1820' }); m.onBeforeCompile = (sh: any) => { sh.uniforms.uIceDay = kit.tod.day; hazeShader(kit.tod, iceShader)(sh); }; return ck(m, k); };
        const shell = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#000000' });
        shell.onBeforeCompile = (sh: any) => { sh.uniforms.uIceDay = kit.tod.day; hazeShader(kit.tod, (s2: any) => {
            s2.vertexShader = 'varying float vGy;\n' + s2.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vGy = position.y;');
            s2.fragmentShader = 'varying float vGy; uniform float uIceDay;\n' + s2.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(1.0, 0.62, 0.32) * (0.10 + 0.5 * (1.0 - uIceDay)) * 0.55;');   // warm lamplight glowing through the snow shell
        })(sh); };
        const glow = new THREE.MeshBasicMaterial({ color: '#ffb766', side: THREE.DoubleSide, toneMapped: false });
        const fogM = new THREE.ShaderMaterial({ vertexShader: FOG_VS, fragmentShader: FOG_FS, uniforms: { uFogC: { value: kit.tod.fog }, uDay: kit.tod.day }, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
        return { ground: iceMat('g'), chunks: iceMat('c'), shell: ck(shell, 's'), glow, fogM, iceU };
    }, []);
    const glowRef = useRef<THREE.MeshBasicMaterial>(mats.glow);
    useFrame(() => { const d = kit.tod.day.value; glowRef.current.color.setRGB(1.0, 0.62 + 0.1 * d, 0.3 + 0.15 * d).multiplyScalar(0.85 + 1.4 * (1 - d)); });
    return (
        <group name="ice-isle">
            <mesh geometry={terrain} material={mats.ground} />
            <mesh geometry={chunks} material={mats.chunks} />
            <mesh geometry={ig.shell} material={mats.shell} />
            <mesh geometry={ig.glow} material={mats.glow} onUpdate={(o) => o.layers.enable(SELECTIVE_BLOOM_LAYER)} />
            <mesh geometry={fog} material={mats.fogM} frustumCulled={false} renderOrder={5} />
        </group>
    );
}
