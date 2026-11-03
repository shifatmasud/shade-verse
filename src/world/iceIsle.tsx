import { seabedAt } from '../sim';
// Ice Isle (Shifat Oct 31 5:48 PM: 'iceberg island: translucent blue ice, snow cap, glowing igloos, floating chunks, cold fog'; 6:25 PM: 'an island
// from another side of the city'). Ground = seaWorld iceRaw (the sim walks it). Refs: Antarctic tabular bergs / Greenland glacier fronts:
// sheer cliffs glow cyan where light passes through thin ice, deep blue in the cracks, white snow on every flat top.
// Budget: 5 draw calls (terrain, igloo shells, igloo glow, floating chunks, fog cards), all static.
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { ICE, iceRaw, iceRR , ICE_IGLOOS, ICE_HUT_K, ICE_HUT_SINK } from '../seaWorld';
import { hutGeo } from './iceHuts';
import { iglooModel } from './igloos';
import { SELECTIVE_BLOOM_LAYER } from '../renderLayers';
import { type SouthSeaKit, PHONE, hazeShader, merged, rnd, setSeed } from './southSea/common';

const IGLOOS = ICE_IGLOOS;   // layout lives in seaWorld (shared with the collision boxes)

function terrainGeo(nLod?: number) {
    const n = nLod ?? (PHONE ? 130 : 180), half = ICE.R * 1.5, pos: number[] = [], col: number[] = [], ice: number[] = [], idx: number[] = [], ok: boolean[] = [];
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
        const x = ICE.cx - half + (i / n) * 2 * half, z = ICE.cz - half + (j / n) * 2 * half, h = iceRaw(x, z);
        pos.push(x, Math.max(h ?? -99, seabedAt(x, z) - 0.5), z); ok.push(h !== null);   /* Nov 1: runs down onto the sea floor - no stair-stepped cliff edge seen from under water */
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i, b = a + 1, d = a + n + 1, e = d + 1; if (ok[a] || ok[b] || ok[d] || ok[e]) idx.push(a, d, b, b, d, e); }
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
        totalEmissiveRadiance += vec3(0.10, 0.42, 0.55) * vIce * (0.35 + 0.65 * fr) * (0.45 + 0.55 * thin) * mix(0.35, 1.0, uIceDay);
        // snow sparkle: sparse sun glints on the flat snow that twinkle as the camera moves
        vec2 sc = floor(vHzW.xz * 2.0 + cameraPosition.xz * 0.2); float hs = fract(sin(dot(sc, vec2(12.9898, 78.233))) * 43758.5453);
        totalEmissiveRadiance += vec3(1.0) * step(0.985, hs) * (1.0 - vIce) * uIceDay * 1.6 * (1.0 - smoothstep(60.0, 220.0, length(vHzW - cameraPosition))); }`).replace('#include <color_fragment>', `#include <color_fragment>
      { // crevasses: thin deep-blue cracks across the snow fields
        vec2 q = vHzW.xz; float c1 = abs(sin(q.x * 0.21 + sin(q.y * 0.09) * 2.6 + q.y * 0.05)); float c2 = abs(sin(q.y * 0.17 - sin(q.x * 0.07) * 2.0));
        float cr = (1.0 - smoothstep(0.0, 0.1, c1)) * step(0.55, fract(q.y * 0.031 + q.x * 0.013)) + (1.0 - smoothstep(0.0, 0.09, c2)) * step(0.6, fract(q.x * 0.027));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.32, 0.55), clamp(cr, 0.0, 1.0) * (1.0 - vIce) * 0.85 * step(5.0, vIy)); }`);
};

function iglooGeo() {   // Shifat 9:56 PM: the igloos are now Polyfork alpine huts (refuge + patrol hut, alternating), lit windows glow at night
    const shell: THREE.BufferGeometry[] = [], glow: THREE.BufferGeometry[] = [], huts = [hutGeo(0), hutGeo(1)], igl = [iglooModel(0), iglooModel(1), iglooModel(2)];
    IGLOOS.forEach(([lx, lz, yaw, s], i) => {   // Shifat 10:42 PM: 3 custom igloos (even spots) + the 2 Polyfork huts (odd spots)
        const x = ICE.cx + lx, z = ICE.cz + lz, y = (iceRaw(x, z) ?? 4) - ICE_HUT_SINK, k = ICE_HUT_K * s, b = i % 2 === 0 ? igl[i >> 1] : huts[(i >> 1) % 2];
        for (const [src, out] of [[b.body, shell], [b.glass, glow]] as [THREE.BufferGeometry, THREE.BufferGeometry[]][]) { const g = src.clone(); g.scale(k, k, k); g.rotateY(yaw); g.translate(x, y, z); out.push(g); }
    });
    return { shell: merged(shell), glow: merged(glow) };
}
function chunksGeo() {   // floating ice chunks: flattened, jagged low-poly bergs scattered round the island
    const P: THREE.BufferGeometry[] = []; setSeed(6161);
    for (let t = 0, n = 0; n < (PHONE ? 26 : 38) && t < 900; t++) {
        const a = rnd() * 6.283, r = ICE.R * (1.12 + rnd() * 1.3), x = ICE.cx + Math.cos(a) * r, z = ICE.cz + Math.sin(a) * r;
        if (iceRR(x, z) < 1.08) continue; n++;
        const s = 1.2 + rnd() * (n < 6 ? 6 : 2.6), g0 = new THREE.IcosahedronGeometry(1, 0), g = g0.index ? g0.toNonIndexed() : g0, p = g.attributes.position as THREE.BufferAttribute;
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
    const terrain = useMemo(() => terrainGeo(), []), terrainFar = useMemo(() => terrainGeo(46), []), ig = useMemo(iglooGeo, []), chunks = useMemo(chunksGeo, []), fog = useMemo(fogGeo, []);
    const mats = useMemo(() => {
        const ck = (m: THREE.Material, k: string) => { (m as any).customProgramCacheKey = () => 'ice-' + k; return m; };
        const iceU = { value: 1 };
        const iceMat = (k: string) => { const m = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#0b1820' }); m.onBeforeCompile = (sh: any) => { sh.uniforms.uIceDay = kit.tod.day; hazeShader(kit.tod, iceShader)(sh); }; return ck(m, k); };
        const shell = new THREE.MeshLambertMaterial({ vertexColors: true });   /* Polyfork huts: their own baked colours, flat shaded */
        shell.onBeforeCompile = (sh: any) => { hazeShader(kit.tod, () => {})(sh); };
        const glow = new THREE.MeshBasicMaterial({ color: '#ffb766', side: THREE.DoubleSide, toneMapped: false });
        const fogM = new THREE.ShaderMaterial({ vertexShader: FOG_VS, fragmentShader: FOG_FS, uniforms: { uFogC: { value: kit.tod.fog }, uDay: kit.tod.day }, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
        return { ground: iceMat('g'), chunks: iceMat('c'), shell: ck(shell, 's'), glow, fogM, iceU };
    }, []);
    const glowRef = useRef<THREE.MeshBasicMaterial>(mats.glow);
    const grpRef = useRef<THREE.Group>(null!);
    useFrame((st) => { const c = st.camera.position, dd = Math.hypot(c.x - ICE.cx, c.z - ICE.cz); if (grpRef.current) { grpRef.current.visible = dd < 900; (grpRef.current.children[0] as THREE.Mesh).geometry = dd > 380 ? terrainFar : terrain;   /* Shifat 10:22 PM 25 fps: 1/3-res terrain past 380 m */ const ch = grpRef.current.children, near = dd < 450; if (ch.length > 4) { ch[1].visible = near; ch[4].visible = near; ch[3].visible = near || kit.tod.day.value < 0.4; } }   /* far LOD: chunks, fog cards (and the igloo glow by day) only within 450 m */ const d = kit.tod.day.value; glowRef.current.color.setRGB(1.0, 0.62 + 0.1 * d, 0.3 + 0.15 * d).multiplyScalar(0.85 + 1.4 * (1 - d)); });
    return (
        <group name="ice-isle" ref={grpRef}>
            <mesh geometry={terrain} material={mats.ground} />
            <mesh geometry={chunks} material={mats.chunks} />
            <mesh geometry={ig.shell} material={mats.shell} />
            <mesh geometry={ig.glow} material={mats.glow} onUpdate={(o) => o.layers.enable(SELECTIVE_BLOOM_LAYER)} />
            <mesh geometry={fog} material={mats.fogM} frustumCulled={false} renderOrder={5} />
        </group>
    );
}
