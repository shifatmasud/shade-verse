// Soft contact shadows (Shifat Oct 31 9:24 PM: 'Can we use soft diffused shadows?'). The game has no shadow maps (a second render of the
// city is the phone's 6 fps problem), so like mobile AAA titles every character gets a soft gaussian shadow on whatever it stands over:
// street, park, roofs, bridge deck, island, harbor. It widens and fades with height, so it reads as diffused sky-light occlusion.
// Budget: 1 instanced draw call, 0 extra passes. Colour-only blend: the alpha classes the ink pass reads are left untouched.
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { PED_SHADOWS } from './civilians';
import { getCompanionSim, shadowFloorAt, type Sim } from '../sim';

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
