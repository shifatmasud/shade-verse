import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ISLAND, FARM, islandH } from '../seaWorld';
import { seabedAt, type Sim } from '../sim';
import { TOD } from './env';
import { waterRenderY } from '../water/waveHeight';

/* Shifat Nov 1 1:21 PM 'floating colorful water lilies with glow on them, only on sea': clusters of lily pads with lotus blooms in the calm
   shallows just off the island and Farm Isle beaches (never in pools, rivers or the park pond). They ride the swell (one height per cluster,
   so the pads stay flat together), and the blooms glow softly at dusk and night (the scene's bloom picks them up). Two instanced draws. */
const PAD_COLS = ['#2f7d3a', '#3c8f44', '#4a9a3a', '#2a6e3f', '#5aa64a'], FLOWER_COLS = ['#ff5fa8', '#ff8fd0', '#f4f0ff', '#ffd25a', '#b47cff', '#ff6f6f', '#7fe3ff'];
type Cl = { x: number; z: number; pads: [number, number, number, number][]; fl: [number, number, number, number][] };
function clusters(): Cl[] {
    let r = 1771; const rnd = () => { r ^= r << 13; r ^= r >>> 17; r ^= r << 5; return (r >>> 0) / 4294967296; };
    const out: Cl[] = [];
    for (const [I, n] of [[ISLAND, 30], [FARM, 18]] as [{ cx: number; cz: number; R: number }, number][]) {
        let tries = 0;
        while (out.filter((c) => Math.hypot(c.x - I.cx, c.z - I.cz) < I.R * 2).length < n && tries++ < 900) {
            const a = rnd() * Math.PI * 2, rr = I.R * (1.0 + rnd() * 0.55), x = I.cx + Math.cos(a) * rr, z = I.cz + Math.sin(a) * rr;
            const h = islandH(x, z), sb = seabedAt(x, z);
            if ((h !== null && h > -0.8) || sb < -9 || sb > -0.9) continue;   // just off the beach: water 0.9-9 m deep
            if (out.some((c) => Math.hypot(c.x - x, c.z - z) < 9)) continue;
            const pads: Cl['pads'] = [], fl: Cl['fl'] = [], np = 8 + Math.floor(rnd() * 7);
            for (let k = 0; k < np; k++) { const pa = rnd() * 6.283, pr = Math.sqrt(rnd()) * 4.5; pads.push([Math.cos(pa) * pr, Math.sin(pa) * pr, 0.7 + rnd() * 0.6, rnd() * 6.283]); }
            const nf = 2 + Math.floor(rnd() * 4);
            for (let k = 0; k < nf; k++) { const p = pads[Math.floor(rnd() * pads.length)]; fl.push([p[0] + (rnd() - 0.5) * 0.3, p[1] + (rnd() - 0.5) * 0.3, 1.4 + rnd() * 0.8, Math.floor(rnd() * FLOWER_COLS.length)]); }
            out.push({ x, z, pads, fl });
        }
    }
    return out;
}
function padGeo() {   // a flat disc with the lily notch, slightly cupped
    const g = new THREE.CircleGeometry(1, 14, 0.35, Math.PI * 2 - 0.7); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const d = Math.hypot(p.getX(i), p.getZ(i)); p.setY(i, d * d * 0.04); }
    g.computeVertexNormals(); return g;
}
function flowerGeo() {   // low-poly lotus: two rings of pointed petals around a small heart
    const parts: THREE.BufferGeometry[] = [];
    for (const [n, r, h, tilt, off] of [[7, 0.2, 0.2, 0.55, 0], [6, 0.13, 0.22, 0.25, 0.45]] as number[][]) {
        for (let i = 0; i < n; i++) { const c = new THREE.ConeGeometry(0.07, h, 3); c.translate(0, h / 2, 0); c.rotateX(tilt); c.translate(0, 0, r * 0.35); c.rotateY((i + off) / n * Math.PI * 2); parts.push(c.toNonIndexed()); }
    }
    const heart = new THREE.SphereGeometry(0.06, 5, 3); heart.translate(0, 0.08, 0); parts.push(heart.toNonIndexed());
    let n = 0; for (const p of parts) n += p.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
    for (const p of parts) { if (!p.attributes.normal) p.computeVertexNormals(); pos.set(p.attributes.position.array as Float32Array, o * 3); nor.set(p.attributes.normal.array as Float32Array, o * 3); o += p.attributes.position.count; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); return g;
}
export function Lilies({ sim }: { sim: Sim }) {
    const d = useMemo(() => {
        const cl = clusters(), nP = cl.reduce((s, c) => s + c.pads.length, 0), nF = cl.reduce((s, c) => s + c.fl.length, 0);
        const padMat = new THREE.MeshLambertMaterial({ vertexColors: false });
        const flMat = new THREE.MeshBasicMaterial({ toneMapped: false });   /* unlit + bright: reads as a glowing bloom at night, a vivid flower by day */
        const pads = new THREE.InstancedMesh(padGeo(), padMat, nP), fls = new THREE.InstancedMesh(flowerGeo(), flMat, nF);
        pads.name = 'lily-pads'; fls.name = 'lily-flowers'; pads.frustumCulled = fls.frustumCulled = false; pads.userData.noRefl = fls.userData.noRefl = true;
        const haloMat = new THREE.ShaderMaterial({ uniforms: { uG: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
            vertexShader: 'varying vec2 vU; varying vec3 vC; void main(){ vU = uv * 2.0 - 1.0; vC = instanceColor; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
            fragmentShader: 'uniform float uG; varying vec2 vU; varying vec3 vC; void main(){ float d = length(vU); float a = exp(-d * d * 4.0) * (1.0 - smoothstep(0.85, 1.0, d)) * uG; if (a < 0.003) discard; gl_FragColor = vec4(vC * a, 1.0); }' });   /* a soft pool of the bloom\'s colour on the water around it */
        const hg = new THREE.PlaneGeometry(1, 1); hg.rotateX(-Math.PI / 2);
        const halo = new THREE.InstancedMesh(hg, haloMat, nF); halo.name = 'lily-glow'; halo.frustumCulled = false; halo.userData.noRefl = true; halo.renderOrder = 4;
        const c = new THREE.Color(); let ip = 0, iF = 0;
        for (const k of cl) { for (const p of k.pads) pads.setColorAt(ip++, c.set(PAD_COLS[(ip * 7) % PAD_COLS.length])); for (const f of k.fl) { c.set(FLOWER_COLS[f[3]]); halo.setColorAt(iF, c); fls.setColorAt(iF++, c); } }
        return { cl, pads, fls, halo, base: fls.instanceColor!.array.slice() as Float32Array, m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(), v: new THREE.Vector3(), e: new THREE.Euler(), n: 0, glow: -1 };
    }, []);
    useFrame(({ camera }) => {
        if ((d.n++ & 1) === 1) return;   // every other frame is plenty for a slow bob
        const t = sim.t, { m, q, s, v, e } = d; let ip = 0, iF = 0;
        for (const k of d.cl) {
            const far = Math.hypot(k.x - camera.position.x, k.z - camera.position.z) > 420;
            const y = far ? -50 : waterRenderY(k.x, k.z, t) + 0.04;
            for (const p of k.pads) { e.set(0, p[3] + Math.sin(t * 0.3 + p[3]) * 0.05, 0); q.setFromEuler(e); s.set(p[2], 1, p[2]); v.set(k.x + p[0], y, k.z + p[1]); m.compose(v, q, s); d.pads.setMatrixAt(ip++, m); }
            for (const f of k.fl) { e.set(0, f[3] + t * 0.05, 0); q.setFromEuler(e); s.setScalar(f[2]); v.set(k.x + f[0], y + 0.03, k.z + f[1]); m.compose(v, q, s); d.fls.setMatrixAt(iF, m); s.setScalar(f[2] * 2.6); v.y = y + 0.06; m.compose(v, q, s); d.halo.setMatrixAt(iF++, m); }
        }
        d.pads.instanceMatrix.needsUpdate = true; d.fls.instanceMatrix.needsUpdate = true; d.halo.instanceMatrix.needsUpdate = true; (d.halo.material as THREE.ShaderMaterial).uniforms.uG.value = 0.08 + 0.75 * (1 - THREE.MathUtils.smoothstep(TOD.day.value, 0.35, 0.85)); d.halo.visible = true;
        const night = 1 - THREE.MathUtils.smoothstep(TOD.day.value, 0.35, 0.85), g = 1.0 + 2.2 * night;   // glow rises at dusk/night
        if (Math.abs(g - d.glow) > 0.01) { d.glow = g; const a = d.fls.instanceColor!.array as Float32Array; for (let i = 0; i < a.length; i++) a[i] = d.base[i] * g; d.fls.instanceColor!.needsUpdate = true; }
    });
    return <><primitive object={d.pads} /><primitive object={d.fls} /><primitive object={d.halo} /></>;
}
