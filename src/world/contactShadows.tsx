// Soft contact shadows (Shifat Oct 31 9:24 PM: 'Can we use soft diffused shadows?'). The game has no shadow maps (a second render of the
// city is the phone's 6 fps problem), so like mobile AAA titles every character gets a soft gaussian shadow on whatever it stands over:
// street, park, roofs, bridge deck, island, harbor. It widens and fades with height, so it reads as diffused sky-light occlusion.
// Budget: 1 instanced draw call, 0 extra passes. Colour-only blend: the alpha classes the ink pass reads are left untouched.
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { PED_SHADOWS } from './civilians';
import { buildings, getCompanionSim, shadowFloorAt, TRUNKS, type Sim } from '../sim';

const N = 64, MAX_H = 22, MAX_D = 70;
const VS = `attribute float aK; varying vec2 vUv; varying float vK; void main(){ vUv = uv; vK = aK; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`;
// Shifat 9:39 PM 'still too strong, blur & fade more': tint .80/.85/.94, quad x3.8, gaussian 1.7.
// Shifat 9:36 PM 'too harsh & too black, more blurry, ambient colour, more faded': a multiply by a sky-blue tint (the ground keeps its own
// colour, only shaded the way skylight occlusion does), a wide low gaussian, about half the strength.
const FS = `uniform vec3 uTint; varying vec2 vUv; varying float vK; void main(){ vec2 d = vUv - 0.5; float r2 = dot(d, d) * 4.0; float a = (exp(-r2 * 1.7) - exp(-1.7)) / (1.0 - exp(-1.7)); if (a <= 0.0) discard; gl_FragColor = vec4(mix(vec3(1.0), uTint, a * vK), 1.0); }`;

export function ContactShadows({ sim }: { sim: Sim }) {
    const ref = useRef<THREE.InstancedMesh>(null!);
    const { geo, mat, k } = useMemo(() => {
        const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
        const k = new THREE.InstancedBufferAttribute(new Float32Array(N), 1); k.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aK', k);
        const mat = new THREE.ShaderMaterial({ uniforms: { uTint: { value: new THREE.Color(0.80, 0.85, 0.94) } }, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
            blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
        return { geo, mat, k };
    }, []);
    const o = useMemo(() => new THREE.Object3D(), []);
    useFrame(({ camera }) => {
        const m = ref.current; if (!m) return; let n = 0;
        const put = (x: number, feet: number, z: number, r: number, str: number, ground?: number) => {
            if (n >= N || Math.hypot(x - camera.position.x, z - camera.position.z) > MAX_D) return;
            const g = ground ?? shadowFloorAt(x, feet, z); if (g === null) return; const h = Math.max(0, feet - g); if (h > MAX_H) return;
            const t = h / MAX_H; o.position.set(x, g + 0.05, z); const s = r * 3.8 * (1 + t * 1.6); o.scale.set(s, 1, s); o.updateMatrix(); m.setMatrixAt(n, o.matrix);
            (k.array as Float32Array)[n] = str * (1 - t) * (1 - t) * (1 - Math.max(0, (Math.hypot(x - camera.position.x, z - camera.position.z) - MAX_D * 0.6) / (MAX_D * 0.4))); n++;
        };
        if (sim.mode !== 'menu' && !sim.swim) put(sim.pos[0], sim.pos[1] - 1.0, sim.pos[2], 0.9, 0.75);
        const c = getCompanionSim(); if (c && c.mode !== 'menu' && !c.swim) put(c.pos[0], c.pos[1] - 1.0, c.pos[2], 0.9, 0.75);
        for (const e of sim.enemies) { if (e.hp <= 0 && e.down > 2) continue; const r = e.boss ? 3.2 : e.kind === 3 ? 1.7 : 1.45; put(e.x, e.y, e.z, r, 0.7); }
        for (let i = 0; i + 2 < PED_SHADOWS.length; i += 3) put(PED_SHADOWS[i], PED_SHADOWS[i + 1], PED_SHADOWS[i + 2], 0.8, 0.6, PED_SHADOWS[i + 1]);   // peds walk the street: no floor query   // the street crowd
        m.count = n; m.instanceMatrix.needsUpdate = true; k.needsUpdate = true;
    });
    return <instancedMesh ref={ref} args={[geo, mat, N]} frustumCulled={false} renderOrder={1} />;
}

// Baked soft ground shade (Shifat 9:42 PM 'every other shadow must be like this'): the same faint cool multiply as the contact shadows,
// laid once around every building, house, igloo, shack, lighthouse, pier and tree. Rectangles fall off softly outside the footprint
// (the inside is hidden by the structure itself). 1 static instanced draw call, nothing per frame.
const SVS = `attribute vec3 aSz; varying vec2 vP; varying vec3 vSz; void main(){ vSz = aSz; vP = (uv - 0.5) * (aSz.xy + 2.0 * aSz.z); gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`;
const SFS = `uniform vec3 uTint; varying vec2 vP; varying vec3 vSz; void main(){ vec2 q = abs(vP) - 0.5 * vSz.xy; float o = length(max(q, 0.0)) / vSz.z; float a = exp(-o * o * 2.4) - exp(-2.4); if (a <= 0.0) discard; gl_FragColor = vec4(mix(vec3(1.0), uTint, a / (1.0 - exp(-2.4))), 1.0); }`;
export function StaticShadows() {
    const ref = useRef<THREE.InstancedMesh>(null!);
    const { geo, mat } = useMemo(() => {
        const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
        const mat = new THREE.ShaderMaterial({ uniforms: { uTint: { value: new THREE.Color(0.80, 0.85, 0.94) } }, vertexShader: SVS, fragmentShader: SFS, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
            blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
        return { geo, mat };
    }, []);
    const CAP = 2600;
    const built = useRef(-1);
    useFrame(() => {   // (re)build whenever new trees register (forest/islands mount lazily); cheap, rare
        const m = ref.current; if (!m) return; const key = buildings.length * 100000 + TRUNKS.length; if (key === built.current) return; built.current = key;
        const o = new THREE.Object3D(), sz = new Float32Array(CAP * 3); let n = 0;
        const add = (x: number, y: number, z: number, yaw: number, w: number, d: number, mg: number) => { if (n >= CAP) return; o.position.set(x, y + 0.04, z); o.rotation.set(0, yaw, 0); o.scale.set(w + 2 * mg, 1, d + 2 * mg); o.updateMatrix(); m.setMatrixAt(n, o.matrix); sz[n * 3] = w; sz[n * 3 + 1] = d; sz[n * 3 + 2] = mg; n++; };
        for (const b of buildings as any[]) {
            if (b.host !== undefined) continue;
            const kind = b.kind; if (b.sea && !(kind === 'solid' || kind === 'shack' || kind === 'light' || kind === 'tower')) continue;   // Neon Harbor stays as it is (its night look is locked)
            const w = b.ob ? b.ob[3] * 2 : b.x1 - b.x0, d = b.ob ? b.ob[4] * 2 : b.z1 - b.z0; if (Math.min(w, d) < 1.2 || b.h - (b.y0 ?? 0) < 2.5) continue;   // railings, beams, masts, trunks: skip
            const cx = b.ob ? b.ob[0] : (b.x0 + b.x1) / 2, cz = b.ob ? b.ob[1] : (b.z0 + b.z1) / 2;
            const g = b.sea ? shadowFloorAt(cx, (b.y0 ?? 0) + 3, cz) : (b.y0 ?? 0); if (g === null || g > b.h - 1) continue;
            add(cx, g, cz, b.ob ? b.ob[2] : 0, w, d, Math.min(6, 1.2 + 0.08 * Math.max(w, d)));
        }
        for (let i = 0; i + 3 < TRUNKS.length + 1; i += 4) { const c = TRUNKS[i + 3]; add(TRUNKS[i], TRUNKS[i + 1], TRUNKS[i + 2], 0, 0.4, 0.4, Math.max(1.5, c * 0.32)); }
        const at = new THREE.InstancedBufferAttribute(sz, 3); geo.setAttribute('aSz', at); m.count = n; m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere();
        if ((import.meta as any).env.VITE_DBG) (window as any).__staticShade = n;
    });
    return <instancedMesh ref={ref} args={[geo, mat, CAP]} frustumCulled={false} renderOrder={1} />;
}
