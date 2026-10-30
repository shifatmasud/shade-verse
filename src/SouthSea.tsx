// South Sea steps 2-4 renderer (Shifat Oct 29): the jungle island (bridge-free), later the bridge and Neon Harbor.
// Shapes and heights come from southsea.ts (the sim uses the same functions, so what you see is what you walk on).
import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Sim } from './sim';
import { ISLAND, LAGOON, POOLS, PEAK, FALLS, DOCK, SHACKS, LIGHTHOUSE, islandH, islandPeakY, poolAt, BRIDGE, BRIDGE_L, bridgeDeckU, cableY, CABLE_X, towerZ } from './seaWorld';
import { LAKE_VS, LAKE_FS } from './polyforkEnvironment';
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
    const sand = new THREE.Color('#efe2c0'), wet = new THREE.Color('#c9b48a'), grass = new THREE.Color('#5f9a3c'), jungle = new THREE.Color('#2f6b2a'), rock = new THREE.Color('#7d7468'), under = new THREE.Color('#d8cba3'), c = new THREE.Color();
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
        if (y > 2.6) c.lerp(rock, Math.max(0, Math.min(1, (slope - 0.75) * 1.6)));
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
// waterfall sheet: hugs the slope from the ledge down to the pool, scrolling streaks
function fallsGeo() {
    const n = 18, pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const dx = FALLS.x1 - FALLS.x0, dz = FALLS.z1 - FALLS.z0, l = Math.hypot(dx, dz), px = -dz / l, pz = dx / l;
    for (let j = 0; j <= n; j++) {
        const t = j / n, x = FALLS.x0 + dx * t, z = FALLS.z0 + dz * t, y = Math.max(islandH(x, z) ?? 0, POOLS[1].y) + 0.45 + 0.4 * Math.sin(t * Math.PI);
        const w = FALLS.w * (0.75 + 0.35 * t);
        for (const s of [-1, 1]) { pos.push(x + px * w / 2 * s, y, z + pz * w / 2 * s); uv.push((s + 1) / 2, t); }
    }
    for (let j = 0; j < n; j++) { const a = j * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
const FALLS_MAT = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uT: { value: 0 }, uDay: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float uT; uniform float uDay;
    float h(float x){ return fract(sin(x * 91.7) * 43758.5); }
    void main(){ float col = floor(vUv.x * 22.0); float sp = 0.9 + h(col) * 0.8; float s = fract(vUv.y * 3.0 - uT * sp + h(col + 3.0));
      float streak = smoothstep(0.0, 0.25, s) * (1.0 - smoothstep(0.55, 1.0, s));
      float edge = smoothstep(0.0, 0.18, vUv.x) * (1.0 - smoothstep(0.82, 1.0, vUv.x));
      float foam = smoothstep(0.75, 1.0, vUv.y);
      vec3 c = mix(vec3(0.55, 0.82, 0.9), vec3(0.97, 1.0, 1.0), streak * 0.7 + foam * 0.5) * mix(0.35, 1.0, uDay);
      gl_FragColor = vec4(c, (0.45 + 0.4 * streak + 0.3 * foam) * edge); }`,
});
function sprayGeo() {
    const N = PHONE ? 40 : 80, pos = new Float32Array(N * 3), ph = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos[i * 3] = FALLS.x1 + (rnd() - 0.5) * FALLS.w; pos[i * 3 + 1] = POOLS[1].y; pos[i * 3 + 2] = FALLS.z1 + (rnd() - 0.5) * FALLS.w; ph[i] = rnd(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('ph', new THREE.BufferAttribute(ph, 1)); return g;
}
const SPRAY_MAT = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uT: { value: 0 } },
    vertexShader: `attribute float ph; uniform float uT; varying float vA; void main(){ float life = fract(uT * 0.6 + ph); vec3 p = position; p.y += life * 3.2 - life * life * 2.0; p.x += sin(ph * 40.0) * life * 2.2; p.z += cos(ph * 23.0) * life * 2.2;
      vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; vA = (1.0 - life) * smoothstep(0.0, 0.1, life); gl_PointSize = (6.0 + 9.0 * life) * 60.0 / max(-mv.z, 1.0); }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(0.95, 0.99, 1.0, vA * 0.4 * (1.0 - smoothstep(0.2, 0.5, d))); }`,
});
function poolWaterMat(p: { cx: number; cz: number; r: number; rim: number }) {
    return new THREE.ShaderMaterial({
        vertexShader: LAKE_VS, fragmentShader: LAKE_FS, side: THREE.DoubleSide, transparent: true, depthWrite: true, toneMapped: false,
        uniforms: { uTime: { value: 0 }, tScene: { value: null }, tDepth: { value: null }, uUseScene: { value: 0 }, uSteps: { value: 1 }, uNear: { value: 0.5 }, uFar: { value: 1600 }, uProj: { value: new THREE.Matrix4() },
            uPondCenter: { value: new THREE.Vector2(p.cx, p.cz) }, uPondR: { value: p.r }, uShore: { value: p.rim }, uHero: { value: new THREE.Vector3(0, -999, 0) },
            uHor: { value: new THREE.Color('#bcd3df') }, uZen: { value: new THREE.Color('#5b8fc4') }, uSun: { value: new THREE.Vector3(-0.36, 0.82, 0.44).normalize() }, uDay: { value: 1 } },
    });
}

function Island({ sim, kit }: { sim: Sim; kit: SouthSeaKit }) {
    const terrain = useMemo(islandTerrainGeo, []);
    const terrainMat = useMemo(() => { const m = new THREE.MeshLambertMaterial({ vertexColors: true }); m.onBeforeCompile = hazeShader(kit.tod); return m; }, []);
    const lh = useMemo(lighthouseGeo, []), shacks = useMemo(shacksGeo, []), dock = useMemo(dockGeo, []), falls = useMemo(fallsGeo, []), spray = useMemo(sprayGeo, []);
    const propMat = useMemo(() => { const m = new THREE.MeshLambertMaterial({ vertexColors: true }); m.onBeforeCompile = hazeShader(kit.tod); return m; }, []);
    const lampMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#fff3c4' }), []);
    const beamMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#fff1b8', transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), []);
    const beamGeo = useMemo(() => { const g = new THREE.ConeGeometry(5, 70, 16, 1, true); g.translate(0, -35, 0); g.rotateZ(Math.PI / 2); return g; }, []);
    const waters = useMemo(() => POOLS.map((p) => { const g = new THREE.CircleGeometry(p.r * (p.rim + 0.04), 48); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, poolWaterMat(p)); m.position.set(p.cx, p.y, p.cz); m.renderOrder = 2; return m; }), []);
    // vegetation: palms on the sand ring, jungle broadleaves on the hill (instanced, reuse the park species)
    const veg = useMemo(() => {
        _seed = 9001;
        const palms: { x: number; y: number; z: number; s: number; r: number }[] = [], trees: typeof palms = [];
        const nPalm = Math.round((PHONE ? 22 : 34)), nTree = Math.round((PHONE ? 34 : 60));
        const clear = (x: number, z: number) => Math.hypot(x - PEAK.x, z - PEAK.z) > 7 && !poolAt(x, z) && Math.hypot(x - LAGOON.cx, z - LAGOON.cz) > LAGOON.r * 1.05 && Math.hypot(x - POOLS[1].cx, z - POOLS[1].cz) > POOLS[1].r * 1.2 && Math.abs(x - DOCK.x) + Math.max(0, z - DOCK.z0) > 5 && !SHACKS.some((s) => Math.hypot(x - s.x, z - s.z) < 5) && distToFalls(x, z) > 4;
        for (let k = 0; k < 900 && palms.length < nPalm; k++) {
            const a = rnd() * Math.PI * 2, rr = 0.62 + rnd() * 0.22, x = ISLAND.cx + Math.cos(a) * ISLAND.R * rr, z = ISLAND.cz + Math.sin(a) * ISLAND.R * rr, y = islandH(x, z) ?? -9;
            if (y < 1.2 || y > 4.5 || !clear(x, z) || palms.some((p) => Math.hypot(p.x - x, p.z - z) < 6)) continue;
            palms.push({ x, y: y - 0.2, z, s: 0.95 + rnd() * 0.35, r: rnd() * 6.28 });
        }
        for (let k = 0; k < 2000 && trees.length < nTree; k++) {
            const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * 0.66, x = ISLAND.cx + Math.cos(a) * ISLAND.R * rr, z = ISLAND.cz + Math.sin(a) * ISLAND.R * rr, y = islandH(x, z) ?? -9;
            if (y < 3.2 || !clear(x, z) || trees.some((p) => Math.hypot(p.x - x, p.z - z) < 7)) continue;
            trees.push({ x, y: y - 0.3, z, s: 0.85 + rnd() * 0.45, r: rnd() * 6.28 });
        }
        return { palms, trees };
    }, []);
    const geos = useMemo(() => { const p = kit.palmGeo(97); const t = kit.treeGeo('broad', 23, Math.round(260 * (PHONE ? 0.8 : 1)), 1.45); return { p, t }; }, []);
    const tex = useMemo(() => { const l = new THREE.TextureLoader(); const mk = (u: string, rep = false) => { const t = l.load(u); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = QK.anisotropy; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 3); } return t; }; return { leaf: mk('/spray145.png'), bark: mk('/bark.jpg', true) }; }, []);
    const mats = useMemo(() => ({
        palmTrunk: Object.assign(new THREE.MeshLambertMaterial({ map: kit.palmTrunkTex(), bumpMap: kit.palmTrunkTex(), bumpScale: 1.6, vertexColors: true, color: '#a89274', emissive: '#3a3024', side: THREE.DoubleSide }), { onBeforeCompile: hazeShader(kit.tod, kit.trunkWindShader) }),
        palmLeaf: Object.assign(new THREE.MeshLambertMaterial({ map: kit.palmFrondTex(), vertexColors: true, emissive: '#2a3a14', alphaTest: 0.5, side: THREE.DoubleSide }), { onBeforeCompile: hazeShader(kit.tod, kit.palmFrondShader) }),
        trunk: Object.assign(new THREE.MeshLambertMaterial({ map: tex.bark, bumpMap: tex.bark, bumpScale: 2.2, vertexColors: true, emissive: '#4a3a2c', side: THREE.DoubleSide }), { onBeforeCompile: hazeShader(kit.tod, kit.trunkWindShader) }),
        leaf: Object.assign(new THREE.MeshLambertMaterial({ map: tex.leaf, vertexColors: true, color: '#8fd06a', emissive: '#2e5a26', alphaTest: 0.5, side: THREE.DoubleSide }), { onBeforeCompile: hazeShader(kit.tod, kit.leafWindShader) }),
    }), []);
    const vegRef = useRef<THREE.Group>(null!), nearRef = useRef<THREE.Group>(null!), beam = useRef<THREE.Mesh>(null!);
    const inst = useRef<(THREE.InstancedMesh | null)[]>([]);
    useEffect(() => {
        const o = new THREE.Object3D();
        const fill = (m: THREE.InstancedMesh | null, list: { x: number; y: number; z: number; s: number; r: number }[]) => { if (!m) return; list.forEach((p, i) => { o.position.set(p.x, p.y, p.z); o.rotation.set(0, p.r, 0); o.scale.setScalar(p.s); o.updateMatrix(); m.setMatrixAt(i, o.matrix); }); m.count = list.length; m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); };
        fill(inst.current[0], veg.palms); fill(inst.current[1], veg.palms); fill(inst.current[2], veg.trees); fill(inst.current[3], veg.trees);
    }, []);
    useFrame(({ camera }) => {
        const d = Math.hypot(camera.position.x - ISLAND.cx, camera.position.z - ISLAND.cz);
        if (vegRef.current) vegRef.current.visible = d < (PHONE ? 330 : 430);
        if (nearRef.current) nearRef.current.visible = d < 260;
        const t = sim.t; FALLS_MAT.uniforms.uT.value = t; FALLS_MAT.uniforms.uDay.value = kit.tod.day.value; SPRAY_MAT.uniforms.uT.value = t;
        for (const w of waters) { const u = (w.material as THREE.ShaderMaterial).uniforms; u.uTime.value = t; u.uHero.value.set(sim.pos[0], sim.pos[1], sim.pos[2]); u.uDay.value = kit.tod.day.value; u.uHor.value.copy(kit.tod.fog).lerp(SKY_BLUE, 0.45).multiplyScalar(0.92); u.uSun.value.copy(kit.tod.sun); u.uZen.value.setRGB(0.30, 0.50, 0.78).multiplyScalar(0.12 + 0.88 * kit.tod.day.value); }
        if (beam.current) { const night = 1 - kit.tod.day.value; beam.current.rotation.y = t * 0.9; beamMat.opacity = 0.05 + 0.2 * night; beam.current.visible = night > 0.15; lampMat.color.setRGB(1, 0.95, 0.75).multiplyScalar(0.8 + 0.6 * night); }
    });
    return <group name="south-sea-island">
        <mesh geometry={terrain} material={terrainMat} frustumCulled={false} />
        <mesh geometry={lh.body} material={propMat} />
        <mesh geometry={lh.lamp} material={lampMat} onUpdate={(o) => o.layers.enable(SELECTIVE_BLOOM_LAYER)} />
        <mesh ref={beam} geometry={beamGeo} material={beamMat} position={[LIGHTHOUSE.x, lh.lampY, LIGHTHOUSE.z]} frustumCulled={false} />
        <mesh geometry={shacks} material={propMat} />
        <mesh geometry={dock} material={propMat} />
        <group ref={vegRef}>
            <instancedMesh ref={(m) => { inst.current[0] = m; }} args={[geos.p.trunk, mats.palmTrunk, 40]} frustumCulled={false} />
            <instancedMesh ref={(m) => { inst.current[1] = m; }} args={[PHONE ? geos.p.lo : geos.p.leaves, mats.palmLeaf, 40]} frustumCulled={false} />
            <instancedMesh ref={(m) => { inst.current[2] = m; }} args={[geos.t.trunk, mats.trunk, 64]} frustumCulled={false} />
            <instancedMesh ref={(m) => { inst.current[3] = m; }} args={[geos.t.leaves, mats.leaf, 64]} frustumCulled={false} />
        </group>
        <group ref={nearRef}>
            {waters.map((w, i) => <primitive key={i} object={w} />)}
            <mesh geometry={falls} material={FALLS_MAT} renderOrder={3} frustumCulled={false} />
            <points geometry={spray} material={SPRAY_MAT} renderOrder={4} frustumCulled={false} />
        </group>
    </group>;
}
function distToFalls(x: number, z: number) {
    const dx = FALLS.x1 - FALLS.x0, dz = FALLS.z1 - FALLS.z0, l2 = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((x - FALLS.x0) * dx + (z - FALLS.z0) * dz) / l2));
    return Math.hypot(x - (FALLS.x0 + dx * t), z - (FALLS.z0 + dz * t));
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
const BCARS = Array.from({ length: 14 }, (_, i) => ({ dir: i % 2 ? 1 : -1, off: (i * 131) % 800, sp: 11 + (i * 7) % 8, c: ['#e94f37', '#f6f7eb', '#393e41', '#3f88c5', '#ffba08', '#44bba4', '#8338ec'][i % 7] }));
function Bridge({ sim, kit }: { sim: Sim; kit: SouthSeaKit }) {
    const deck = useMemo(bridgeDeckGeo, []), struct = useMemo(bridgeStructGeo, []), cables = useMemo(cableGeo, []), heads = useMemo(lampHeadGeo, []);
    const mat = useMemo(() => { const m = new THREE.MeshLambertMaterial({ vertexColors: true }); m.onBeforeCompile = hazeShader(kit.tod); return m; }, []);
    const lampMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffe7a8' }), []);
    const carGeo = useMemo(() => { const b = new THREE.BoxGeometry(2.0, 1.1, 4.4); b.translate(0, 0.75, 0); const t = new THREE.BoxGeometry(1.7, 0.7, 2.2); t.translate(0, 1.6, -0.3); return merged([colorize(b, '#ffffff'), colorize(t, '#d8dde3')]); }, []);
    const carMat = useMemo(() => { const m = new THREE.MeshLambertMaterial({ vertexColors: true }); m.onBeforeCompile = hazeShader(kit.tod); return m; }, []);
    const cars = useRef<THREE.InstancedMesh>(null!), o = useMemo(() => new THREE.Object3D(), []);
    useEffect(() => { const m = cars.current; if (!m) return; const c = new THREE.Color(); BCARS.forEach((b, i) => m.setColorAt(i, c.set(b.c))); if (m.instanceColor) m.instanceColor.needsUpdate = true; }, []);
    useFrame(({ camera }) => {
        const night = 1 - kit.tod.day.value; lampMat.color.setRGB(1, 0.91, 0.66).multiplyScalar(0.35 + 0.9 * night);
        const m = cars.current; if (!m) return;
        const near = Math.abs(camera.position.x - BRIDGE.x) < 400 && camera.position.z < BRIDGE.z0 + 300 && camera.position.z > BRIDGE.z1 - 300; m.visible = near; if (!near) return;
        BCARS.forEach((b, i) => { const span = BRIDGE_L - 40, u = 20 + (((b.off + b.sp * sim.t * b.dir) % span) + span) % span, y = bridgeDeckU(u), y2 = bridgeDeckU(Math.min(BRIDGE_L, u + 2)); o.position.set(BRIDGE.x + b.dir * 2.4, y, BRIDGE.z0 - u); o.rotation.set(Math.atan2(y2 - y, 2) * -b.dir * -1, b.dir > 0 ? Math.PI : 0, 0); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
        m.instanceMatrix.needsUpdate = true;
    });
    return <group name="south-sea-bridge">
        <mesh geometry={deck} material={mat} frustumCulled={false} />
        <mesh geometry={struct} material={mat} frustumCulled={false} />
        <mesh geometry={cables} material={mat} frustumCulled={false} />
        <mesh geometry={heads} material={lampMat} onUpdate={(o2) => o2.layers.enable(SELECTIVE_BLOOM_LAYER)} frustumCulled={false} />
        <instancedMesh ref={cars} args={[carGeo, carMat, BCARS.length]} frustumCulled={false} />
    </group>;
}

export function SouthSea({ sim, kit }: { sim: Sim; kit: SouthSeaKit }) {
    return <group name="south-sea"><Island sim={sim} kit={kit} /><Bridge sim={sim} kit={kit} /></group>;
}
void islandPeakY;
