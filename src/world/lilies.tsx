import { Suspense, useMemo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { withMeshopt } from '../meshopt';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
const LILY_LOD = 140;
import { ISLAND, FARM, islandH } from '../seaWorld';
import { seabedAt, type Sim } from '../sim';
import { TOD } from './env';
import { waterRenderY } from '../water/waveHeight';

/* Shifat Nov 1 1:21 PM 'floating colorful water lilies with glow on them, only on sea' + 1:41 PM 'use polyfork for lilies'.
   Model: Polyfork 'Lily Pads' (lily-pads-b0c5d0, free, 592 tris, https://polyfork.dev/licensing): a floating patch of notched pads
   with two open water-lily blooms and a bud, baked into one geometry. One instanced draw for every patch; the blooms' vertices
   (their light petal colour in the model) take a per-patch colour - real Nymphaea come white, pink, magenta, yellow and blue-violet -
   and glow softly at dusk/night, with a matching pool of light on the water (one more instanced draw). Patches ride the swell. */
const BLOOM_COLS = ['#ff6fb0', '#ffffff', '#ffd23f', '#b98bff', '#ff4f7a', '#ffa3d9', '#7fd8ff', '#fff1a8'];
type Patch = { x: number; z: number; yaw: number; s: number; c: number };
function patches(): Patch[] {
    let r = 1771; const rnd = () => { r ^= r << 13; r ^= r >>> 17; r ^= r << 5; return (r >>> 0) / 4294967296; };
    const out: Patch[] = [];
    for (const [I, n] of [[ISLAND, 34], [FARM, 20]] as [{ cx: number; cz: number; R: number }, number][]) {
        let tries = 0, made = 0;
        while (made < n && tries++ < 1200) {
            const a = rnd() * Math.PI * 2, rr = I.R * (1.0 + rnd() * 0.55), x0 = I.cx + Math.cos(a) * rr, z0 = I.cz + Math.sin(a) * rr;
            const h = islandH(x0, z0), sb = seabedAt(x0, z0);
            if ((h !== null && h > -0.8) || sb < -9 || sb > -0.9) continue;   // just off the beach: water 0.9-9 m deep
            if (out.some((c) => Math.hypot(c.x - x0, c.z - z0) < 10)) continue;
            const np = 3 + Math.floor(rnd() * 4), c = Math.floor(rnd() * BLOOM_COLS.length);   // one colony = a few model patches around a centre, one bloom colour
            for (let k = 0; k < np; k++) { const pa = rnd() * 6.283, pr = Math.sqrt(rnd()) * 3.6; out.push({ x: x0 + Math.cos(pa) * pr, z: z0 + Math.sin(pa) * pr, yaw: rnd() * 6.283, s: 1.3 + rnd() * 0.7, c: (k === np - 1 && rnd() < 0.4) ? Math.floor(rnd() * BLOOM_COLS.length) : c }); }
            made++;
        }
    }
    return out;
}
function bake(g: GLTF) {   // all meshes -> one geometry (world transforms applied), plus aBloom = 1 on the petal vertices and the bloom centres
    g.scene.updateMatrixWorld(true);
    const P: number[] = [], N: number[] = [], C: number[] = [], B: number[] = [];
    const v = new THREE.Vector3(), nm = new THREE.Matrix3();
    g.scene.traverse((o) => {
        const m = o as THREE.Mesh; if (!m.isMesh) return;
        const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry; nm.getNormalMatrix(m.matrixWorld);
        const p = geo.attributes.position, n = geo.attributes.normal, c = geo.attributes.color;
        for (let i = 0; i < p.count; i++) {
            v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); P.push(v.x, v.y, v.z);
            v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); N.push(v.x, v.y, v.z);
            const r = c ? c.getX(i) : 0.3, gg = c ? c.getY(i) : 0.5, b = c ? c.getZ(i) : 0.3; C.push(r, gg, b);
            B.push(r > 0.55 && gg > 0.45 && (r + gg + b) > 1.55 ? 1 : (r > 0.55 && gg > 0.3 && b < 0.25 ? 0.6 : 0));   // light petals = 1, gold stamens = 0.6
        }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); geo.setAttribute('aBloom', new THREE.Float32BufferAttribute(B, 1));
    geo.computeBoundingBox(); const bb = geo.boundingBox!, cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
    geo.translate(-cx, -bb.min.y - 0.02, -cz);   // centred, pads at y 0 (= the water surface)
    // bloom centres: group petal vertices that lie within 0.3 m of each other
    const pos = geo.attributes.position, cen: { x: number; z: number; n: number }[] = [];
    for (let i = 0; i < pos.count; i++) { if (B[i] < 0.9) continue; const x = pos.getX(i), z = pos.getZ(i); const c = cen.find((q) => Math.hypot(q.x / q.n - x, q.z / q.n - z) < 0.3); if (c) { c.x += x; c.z += z; c.n++; } else cen.push({ x, z, n: 1 }); }
    return { geo, blooms: cen.filter((c) => c.n > 6).map((c) => [c.x / c.n, c.z / c.n] as [number, number]) };
}
function LiliesInner({ sim }: { sim: Sim }) {
    const [gl] = useLoader(GLTFLoader, ['/polyfork/lily-pads-b0c5d0.glb'], withMeshopt) as GLTF[];
    const d = useMemo(() => {
        const { geo, blooms } = bake(gl), ps = patches();
        const glow = { value: 0 };
        const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
        mat.onBeforeCompile = (s) => {   // bloom vertices take the patch colour (instanceColor) and an emissive glow at night
            s.uniforms.uGlow = glow;
            s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float aBloom; varying float vBloom;').replace('#include <color_vertex>', '#include <color_vertex>\n vBloom = aBloom;\n #ifdef USE_INSTANCING_COLOR\n vColor.rgb = mix(color.rgb, instanceColor * mix(0.75, 1.0, color.r), step(0.9, aBloom));\n #else\n #endif');
            s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uGlow; varying float vBloom;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor.rgb * step(0.5, vBloom) * uGlow;');
        };
        mat.customProgramCacheKey = () => 'lilyBloom1';
        const pads = new THREE.InstancedMesh(geo, mat, ps.length); pads.name = 'lily-pads'; pads.userData.noRefl = true;
        /* far LOD (perf, Shifat Nov 2 2:48 AM): past LILY_LOD m a patch is ~10 px - drawn as a soft green disc + its bloom dots (22 tris instead of 592) */
        const farGeo = (() => { if (!geo.boundingSphere) geo.computeBoundingSphere(); const R = geo.boundingSphere!.radius * 0.62, parts: THREE.BufferGeometry[] = [];
            const disc = (r: number, seg: number, y: number, x: number, z: number, c: [number, number, number], b: number) => { const g = new THREE.CircleGeometry(r, seg); g.rotateX(-Math.PI / 2); g.translate(x, y, z); const n = g.attributes.position.count; g.setAttribute('color', new THREE.Float32BufferAttribute(Array(n).fill(c).flat(), 3)); g.setAttribute('aBloom', new THREE.Float32BufferAttribute(Array(n).fill(b), 1)); g.deleteAttribute('uv'); return g; };
            parts.push(disc(R, 10, 0.02, 0, 0, [0.24, 0.42, 0.2], 0)); for (const [bx, bz] of blooms) parts.push(disc(0.24, 6, 0.14, bx, bz, [1, 1, 1], 1));
            return mergeGeometries(parts.map((g) => g.toNonIndexed()))!; })();
        const padsFar = new THREE.InstancedMesh(farGeo, mat, ps.length); padsFar.name = 'lily-pads-far'; padsFar.userData.noRefl = true;
        const nH = ps.length * blooms.length;
        const haloMat = new THREE.ShaderMaterial({ uniforms: { uG: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
            vertexShader: 'varying vec2 vU; varying vec3 vC; void main(){ vU = uv * 2.0 - 1.0; vC = instanceColor; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
            fragmentShader: 'uniform float uG; varying vec2 vU; varying vec3 vC; void main(){ float d = length(vU); float a = exp(-d * d * 4.0) * (1.0 - smoothstep(0.85, 1.0, d)) * uG; if (a < 0.003) discard; gl_FragColor = vec4(vC * a, 1.0); }' });
        const hg = new THREE.PlaneGeometry(1, 1); hg.rotateX(-Math.PI / 2);
        const halo = new THREE.InstancedMesh(hg, haloMat, Math.max(nH, 1)); halo.name = 'lily-glow'; halo.userData.noRefl = true; halo.renderOrder = 4;
        const c = new THREE.Color(); let ih = 0;
        ps.forEach((p, i) => { c.set(BLOOM_COLS[p.c]); pads.setColorAt(i, c); for (let k = 0; k < blooms.length; k++) halo.setColorAt(ih++, c); });
        return { slot: new Int32Array(ps.length).fill(-1), slotF: new Int32Array(ps.length).fill(-1), slotH: new Int32Array(ps.length).fill(-1), padsFar, cc: new THREE.Color(), colDirty: false, ps, blooms, pads, halo, glow, m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(), v: new THREE.Vector3(), e: new THREE.Euler(), n: 0 };
    }, [gl]);
    useFrame(({ camera }) => {
        if ((d.n++ & 1) === 1) return;   // every other frame is plenty for a slow bob
        const t = sim.t, { m, q, s, v, e } = d; let ih = 0, n = 0, np = 0, nf = 0;
        /* perf (Shifat Nov 2 2:17 AM): far patches are no longer drawn at all (were parked under the seabed but still 145k tris/frame everywhere in the world) -
           near patches are packed into the first slots and the instance count is cut to them; colours follow their patch */
        d.ps.forEach((p, i) => {
            const dd = Math.hypot(p.x - camera.position.x, p.z - camera.position.z); if (dd > 420) return;
            const y = waterRenderY(p.x, p.z, t) + 0.03, yaw = p.yaw + Math.sin(t * 0.25 + p.yaw * 3.0) * 0.06;
            e.set(0, yaw, 0); q.setFromEuler(e); s.setScalar(p.s); v.set(p.x, y, p.z); m.compose(v, q, s);
            if (dd > LILY_LOD) { d.padsFar.setMatrixAt(nf, m); if (d.slotF[nf] !== i) { d.slotF[nf] = i; d.cc.set(BLOOM_COLS[p.c]); d.padsFar.setColorAt(nf, d.cc); d.colDirty = true; } nf++; } else { d.pads.setMatrixAt(np, m); if (d.slot[np] !== i) { d.slot[np] = i; d.cc.set(BLOOM_COLS[p.c]); d.pads.setColorAt(np, d.cc); d.colDirty = true; } np++; }
            if (d.slotH[n] !== i) { d.slotH[n] = i; for (let k = 0; k < d.blooms.length; k++) d.halo.setColorAt(n * d.blooms.length + k, d.cc); d.colDirty = true; }
            const cy = Math.cos(yaw), sy = Math.sin(yaw);
            for (const [bx, bz] of d.blooms) { const wx = p.x + (bx * cy + bz * sy) * p.s, wz = p.z + (-bx * sy + bz * cy) * p.s; s.setScalar(p.s * 1.6); v.set(wx, y + 0.05, wz); m.compose(v, q, s); d.halo.setMatrixAt(ih++, m); }
            n++;
        });
        d.pads.count = np; d.padsFar.count = nf; d.halo.count = ih; d.pads.visible = np > 0; d.padsFar.visible = nf > 0; d.halo.visible = n > 0;
        if (np > 0) d.pads.computeBoundingSphere(); if (nf > 0) d.padsFar.computeBoundingSphere(); if (n > 0) d.halo.computeBoundingSphere();   /* frustum culling over the near patches only */   /* frustum culling over the near patches only */
        if (d.colDirty) { d.colDirty = false; if (d.pads.instanceColor) d.pads.instanceColor.needsUpdate = true; if (d.padsFar.instanceColor) d.padsFar.instanceColor.needsUpdate = true; if (d.halo.instanceColor) d.halo.instanceColor.needsUpdate = true; }
        d.pads.instanceMatrix.needsUpdate = true; d.padsFar.instanceMatrix.needsUpdate = true; d.halo.instanceMatrix.needsUpdate = true;
        const night = 1 - THREE.MathUtils.smoothstep(TOD.day.value, 0.35, 0.85);
        d.glow.value = 0.05 + 0.45 * night; (d.halo.material as THREE.ShaderMaterial).uniforms.uG.value = 0.03 + 0.3 * night;   /* Shifat Nov 1 8:03 PM 'Reduce bloom for lilies': ~40% of the old glow */
    });
    return <><primitive object={d.pads} /><primitive object={d.padsFar} /><primitive object={d.halo} /></>;
}
export function Lilies({ sim }: { sim: Sim }) { return <Suspense fallback={null}><LiliesInner sim={sim} /></Suspense>; }
