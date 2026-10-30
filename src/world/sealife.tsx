import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BOATS, BOAT_DECK, BOAT_HX, BOAT_HZ, BOAT_MAST, WATER_Y, WATER_Z, boatAt, seabedAt, type Sim } from '../sim';
import { QUALITY, QK, LOWQ } from '../quality';
import { TOD } from './env';
import { waterMat } from '../water/oceanMaterial';

// Sea life and traffic on the water: boats (with wake data for the sea shader), gulls, fish shoals, marine snow and the whale.

// South Sea step 1b: boats (solid + webbable mast, motion from sim.boatAt), gull flocks, fish schools near the swimmer, and a far whale.
function boatParts(kind: number) {
    const parts: THREE.BufferGeometry[] = []; const col = (g: THREE.BufferGeometry, c: string) => { const cc = new THREE.Color(c), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g.index ? g.toNonIndexed() : g); };
    // hull: box tapered to a bow in +z
    const hull = new THREE.BoxGeometry(BOAT_HX * 2, 2.6, BOAT_HZ * 2, 1, 1, 4); const hp = hull.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < hp.count; i++) { const z = hp.getZ(i), y = hp.getY(i), t = Math.max(0, z / BOAT_HZ); hp.setX(i, hp.getX(i) * (1 - 0.9 * t * t) * (y < 0 ? 0.78 : 1)); hp.setY(i, y + (y > 0 ? 0.35 * t : 0)); }
    hull.translate(0, 0.2, 0); hull.computeVertexNormals(); col(hull, kind ? '#f4efe6' : '#2b5f8a');
    const stripe = new THREE.BoxGeometry(BOAT_HX * 2.02, 0.22, BOAT_HZ * 1.6); stripe.translate(0, 0.95, -0.8); col(stripe, kind ? '#d9473b' : '#f2f2f2');
    const deck = new THREE.BoxGeometry(BOAT_HX * 1.8, 0.12, BOAT_HZ * 1.5); deck.translate(0, BOAT_DECK - 0.05, -0.6); col(deck, '#a8794e');
    const cabin = new THREE.BoxGeometry(2.6, 1.6, 3.2); cabin.translate(0, BOAT_DECK + 0.8, -2.2); col(cabin, '#f7f4ee');
    const mast = new THREE.CylinderGeometry(0.11, 0.15, BOAT_MAST - BOAT_DECK, 6); mast.translate(0, (BOAT_MAST + BOAT_DECK) / 2, 0.8); col(mast, '#d7d2c8');
    parts.forEach(g => g.deleteAttribute('uv'));
    const body = mergeGeometries(parts.map(g => { if (!g.attributes.normal) g.computeVertexNormals(); return g; }), false)!;
    const sail = new THREE.BufferGeometry(); sail.setAttribute('position', new THREE.Float32BufferAttribute([0, BOAT_DECK + 1.2, 1.0, 0, BOAT_MAST - 0.4, 0.95, 0, BOAT_DECK + 1.2, -3.6], 3)); sail.computeVertexNormals();
    return { body, sail };
}
export function Boats({ sim }: { sim: Sim }) {
    const geo = useMemo(() => [boatParts(0), boatParts(1)], []);
    const refs = useRef<THREE.Group[]>([]);
    useFrame(() => { const ub = waterMat.uniforms.uBoat.value as THREE.Vector4[]; for (let i = 0; i < BOATS.length; i++) { const b = boatAt(i, sim.t); if (i < 5) ub[i].set(b.x, b.z, b.yaw, Math.hypot(b.vx, b.vz)); const g = refs.current[i]; if (!g) continue; g.position.set(b.x, b.y, b.z); g.rotation.set(0, b.yaw, b.roll); } });   /* wakes follow each boat */
    return <group name="boats">{BOATS.map((b, i) => <group key={i} ref={(g) => { if (g) refs.current[i] = g; }}>
        <mesh geometry={geo[b.kind].body}><meshLambertMaterial vertexColors /></mesh>
        <mesh geometry={geo[b.kind].sail}><meshLambertMaterial color={b.kind ? '#ffd166' : '#fafafa'} side={THREE.DoubleSide} /></mesh>
    </group>)}</group>;
}
export function Gulls({ sim }: { sim: Sim }) {
    const N = 22, ref = useRef<THREE.InstancedMesh>(null!);
    const geo = useMemo(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-1.1, 0.25, 0, 0, 0, 0.25, 0, 0, -0.2, 0, 0, 0.25, 1.1, 0.25, 0, 0, 0, -0.2], 3)); g.computeVertexNormals(); return g; }, []);
    const fl = useMemo(() => Array.from({ length: N }, (_, i) => ({ cx: ((i * 53) % 9 - 4) * 80, cz: WATER_Z - 60 - ((i * 37) % 7) * 110, r: 18 + (i * 7) % 25, y: 22 + (i * 11) % 18, w: (0.25 + (i % 5) * 0.06) * (i % 2 ? 1 : -1), ph: i * 1.3 })), []);
    const o = useMemo(() => new THREE.Object3D(), []);
    useFrame(() => { const m = ref.current; if (!m) return; const t = sim.t; fl.forEach((f, i) => { const a = f.ph + t * f.w; o.position.set(f.cx + Math.cos(a) * f.r, f.y + Math.sin(t * 0.7 + i) * 1.5, f.cz + Math.sin(a) * f.r); o.rotation.set(0, Math.atan2(-Math.sin(a) * f.w, Math.cos(a) * f.w), Math.sin(t * 6 + i) * 0.35); const fl2 = 0.65 + 0.35 * Math.sin(t * 7 + i * 2); o.scale.set(1.1, fl2 * 1.1, 1.1); o.updateMatrix(); m.setMatrixAt(i, o.matrix); }); m.instanceMatrix.needsUpdate = true; });
    return <instancedMesh ref={ref} args={[geo, undefined, N]} frustumCulled={false}><meshLambertMaterial color="#f4f4f0" side={THREE.DoubleSide} /></instancedMesh>;
}
export function Fish({ sim }: { sim: Sim }) {
    const N = (QUALITY as any).tier === 'low' || QK.foliage < 1.5 ? 70 : 130, ref = useRef<THREE.InstancedMesh>(null!);
    const geo = useMemo(() => { const b = new THREE.ConeGeometry(0.26, 1.1, 5); b.rotateX(Math.PI / 2); const t = new THREE.ConeGeometry(0.22, 0.4, 3); t.rotateX(-Math.PI / 2); t.translate(0, 0, -0.66); return mergeGeometries([b.toNonIndexed(), t.toNonIndexed()], false)!; }, []);
    const fish = useMemo(() => Array.from({ length: 130 }, (_, i) => ({ s: i % 5, r: 1.5 + ((i * 37) % 20) / 6, yo: ((i * 13) % 9 - 4) * 0.35, ph: i * 2.39, w: 0.6 + ((i * 7) % 5) * 0.08 })), []);
    const schools = useMemo(() => Array.from({ length: 5 }, (_, k) => ({ x: 0, y: 0, z: 0, set: false, k })), []);
    const o = useMemo(() => new THREE.Object3D(), []), cols = useMemo(() => ['#f2a03d', '#6fc3df', '#e8e2c4', '#f06d6d', '#9be08a'].map(c => new THREE.Color(c)), []);
    useEffect(() => { const m = ref.current; for (let i = 0; i < N; i++) m.setColorAt(i, cols[fish[i].s]); m.instanceColor!.needsUpdate = true; }, [N]);
    useFrame(({ camera }) => {
        const m = ref.current; if (!m) return; const t = sim.t, hx = sim.pos[0], hy = sim.pos[1], hz = sim.pos[2];
        const show = hz < WATER_Z - 4 && camera.position.y < WATER_Y + 6 && seabedAt(hx, hz) < WATER_Y - 2; m.visible = show; if (!show) return;   // never on the island's land / shallows
        schools.forEach((sc, k) => { const a = t * 0.12 + k * 1.26, R = 6 + k * 2.5, tx = hx + Math.cos(a) * R, tz = hz + Math.sin(a) * R, fl = seabedAt(tx, tz) + 2, ty = Math.max(fl, Math.min(WATER_Y - 1.5, hy - 2 + Math.sin(t * 0.3 + k) * 3));
            if (!sc.set || Math.hypot(sc.x - hx, sc.z - hz) > 60) { sc.x = tx; sc.y = ty; sc.z = tz; sc.set = true; } else { sc.x += (tx - sc.x) * 0.01; sc.y += (ty - sc.y) * 0.01; sc.z += (tz - sc.z) * 0.01; }
            (sc as any).ok = seabedAt(sc.x, sc.z) < WATER_Y - 3.5; });   // Shifat's bug report: schools over the island's shallows/land are hidden
        for (let i = 0; i < N; i++) { const f = fish[i], sc = schools[f.s], a = f.ph + t * f.w, px = sc.x + Math.cos(a) * f.r, pz = sc.z + Math.sin(a) * f.r, py = sc.y + f.yo + Math.sin(t * 1.3 + i) * 0.2;
            if (!(sc as any).ok || py > WATER_Y - 0.6 || seabedAt(px, pz) > py - 0.4) { o.position.set(px, -500, pz); o.scale.setScalar(0); o.updateMatrix(); m.setMatrixAt(i, o.matrix); o.scale.setScalar(1); continue; }
            o.position.set(px, py, pz); o.rotation.set(0, Math.atan2(-Math.sin(a), Math.cos(a)) + Math.PI / 2 * 0 , Math.sin(t * 9 + i) * 0.15); o.lookAt(sc.x + Math.cos(a + 0.2) * f.r, py, sc.z + Math.sin(a + 0.2) * f.r); o.updateMatrix(); m.setMatrixAt(i, o.matrix); }
        m.count = N; m.instanceMatrix.needsUpdate = true;
    });
    return <instancedMesh ref={ref} args={[geo, undefined, 130]} frustumCulled={false} userData={{ noRefl: true }}><primitive object={fishMat} attach="material" /></instancedMesh>;
}
// fish seen through the sea get Beer-Lambert water colour by their path length in water (they read like paper cutouts on top of the surface before)
const fishMat = (() => { const m = new THREE.MeshLambertMaterial(); m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFW;').replace('#include <project_vertex>', '#include <project_vertex>\nvFW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFW;').replace('#include <dithering_fragment>', `#include <dithering_fragment>
      { float dep = max(${WATER_Y.toFixed(2)} - vFW.y, 0.0); float pl = dep + 0.22 * length(cameraPosition - vFW); vec3 T = exp(-vec3(0.46, 0.12, 0.075) * pl);
        gl_FragColor.rgb = gl_FragColor.rgb * T + vec3(0.02, 0.13, 0.18) * (1.0 - T); }`); };
    m.customProgramCacheKey = () => 'fishWater1'; return m; })();

// marine snow (AAA underwater: Subnautica / Sea of Thieves): drifting specks in a 24 m box wrapped around the camera, only while the camera is under the sea.
// One Points draw, positions wrapped in the vertex shader (no per-frame CPU), fades with distance; fewer specks on phones.
const SNOW_N = (QUALITY as any).coarse || LOWQ ? 220 : 700;
const SNOW_GEO = (() => { const g = new THREE.BufferGeometry(), p = new Float32Array(SNOW_N * 3); for (let i = 0; i < SNOW_N * 3; i++) p[i] = Math.random() * 24; g.setAttribute('position', new THREE.BufferAttribute(p, 3)); return g; })();
const SNOW_MAT = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uT: { value: 0 }, uDay: TOD.day },
    vertexShader: `uniform float uT; varying float vA; void main(){ vec3 p = position + vec3(uT * 0.15, -uT * 0.08, uT * 0.1);
      vec3 w = cameraPosition + mod(p - cameraPosition, 24.0) - 12.0; float d = length(w - cameraPosition);
      vA = (1.0 - smoothstep(4.0, 12.0, d)) * smoothstep(0.6, 1.5, d) * step(w.y, ${WATER_Y.toFixed(1)} - 0.3);
      vec4 mv = viewMatrix * vec4(w, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(110.0 / -mv.z, 1.5, 9.0); }`,
    fragmentShader: `uniform float uDay; varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float a = vA * (1.0 - smoothstep(0.2, 0.5, length(c))); if (a < 0.02) discard; gl_FragColor = vec4(vec3(0.75, 0.9, 0.95) * mix(0.2, 1.0, uDay), a * 0.8); }` });
export function MarineSnow() { const ref = useRef<THREE.Points>(null!);
    useFrame(({ camera, clock }) => { const p = ref.current; if (!p) return; p.visible = camera.position.y < WATER_Y - 0.3; SNOW_MAT.uniforms.uT.value = clock.elapsedTime; });
    return <points ref={ref} geometry={SNOW_GEO} material={SNOW_MAT} frustumCulled={false} userData={{ noRefl: true }} />; }
export function Whale({ sim }: { sim: Sim }) {
    const ref = useRef<THREE.Group>(null!), tail = useRef<THREE.Mesh>(null!);
    const body = useMemo(() => { const g = new THREE.SphereGeometry(1, 16, 10); g.scale(2.6, 2.2, 9); const p = g.attributes.position as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) { const z = p.getZ(i); if (z < 0) { const k = 1 + z / 14; p.setX(i, p.getX(i) * k); p.setY(i, p.getY(i) * k); } } g.computeVertexNormals(); return g; }, []);
    const fluke = useMemo(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -3.2, 0, -2.2, -1.2, 0, -1.2, 0, 0, 0, 3.2, 0, -2.2, 1.2, 0, -1.2], 3)); g.computeVertexNormals(); return g; }, []);
    useFrame(() => { const g = ref.current; if (!g) return; const t = sim.t, a = t * 0.02, cx = -60, cz = -820, R = 230; const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R * 0.6;
        const surf = Math.max(0, Math.sin(t * 0.09)); g.position.set(x, WATER_Y - 6 + surf * 5.2, z); g.rotation.set(-0.05 + Math.cos(t * 0.09) * 0.08, Math.atan2(-Math.sin(a) * R, Math.cos(a) * R * 0.6), 0);
        if (tail.current) tail.current.rotation.x = Math.sin(t * 1.4) * 0.35; });
    return <group ref={ref} name="whale"><mesh geometry={body}><meshLambertMaterial color="#3d5566" /></mesh><mesh ref={tail} geometry={fluke} position={[0, 0, -12]}><meshLambertMaterial color="#34495a" side={THREE.DoubleSide} /></mesh></group>;
}
