import * as THREE from 'three';
import { CARS, CAR_N, CAR_SCALE, PILOT, carAt, type Sim } from '../sim';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';

const DBG = !!(import.meta as any).env.VITE_DBG;   // test hooks only in instrumented builds

const tmp = new THREE.Object3D();

// Flying cars: shared car geometry + the instanced traffic loop (one car can be piloted).
// flying cars: instanced lane traffic above the streets; motion comes from sim.carAt so collision and web anchors match what you see
function carGeo() {
    const parts: THREE.BufferGeometry[] = [];
    const add = (g: THREE.BufferGeometry, c: number[], x: number, y: number, z: number, al = 1) => { g.translate(x, y, z); const n = g.attributes.position.count, a = new Float32Array(n * 4); for (let i = 0; i < n; i++) { a[i * 4] = c[0]; a[i * 4 + 1] = c[1]; a[i * 4 + 2] = c[2]; a[i * 4 + 3] = al; } g.setAttribute('color', new THREE.BufferAttribute(a, 4)); parts.push(g.index ? g.toNonIndexed() : g); };
    // reference: Kenney Car Kit (CC0) silhouettes - chunky body, tinted cabin, light pods; hover pods instead of wheels
    add(new THREE.BoxGeometry(2.0, 0.65, 4.4), [0.9, 0.9, 0.9], 0, 0, 0); add(new THREE.BoxGeometry(1.7, 0.6, 2.2), [0.12, 0.16, 0.22], 0, 0.6, -0.3);
    add(new THREE.BoxGeometry(1.5, 0.12, 1.9), [0.9, 0.9, 0.9], 0, 0.95, -0.3);
    add(new THREE.BoxGeometry(1.6, 0.14, 0.12), [1.5, 1.4, 1.0], 0, 0.05, 2.22, 0.5); add(new THREE.BoxGeometry(1.6, 0.14, 0.12), [1.6, 0.2, 0.2], 0, 0.05, -2.22, 0.5);   // alpha 0.5 = light tag for the outline pass
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.CylinderGeometry(0.42, 0.42, 0.16, 8), [0.15, 0.15, 0.18], sx * 1.0, -0.4, sz * 1.4), add(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 8), [0.3, 2.0, 2.6], sx * 1.0, -0.5, sz * 1.4, 0.5);
    return mergeGeometries(parts, false)!;
}
export function FlyingCars({ sim }: { sim: Sim }) {
    const ref = useRef<THREE.InstancedMesh>(null!);
    const geo = useMemo(carGeo, []);
    const cars = CARS; if (DBG) (window as any).__carAt = carAt;
    useFrame(() => {
        const t = sim.t, m = ref.current; if (!m) return;
        for (let i = 0; i < CAR_N; i++) {
            const c = carAt(i, t);
            tmp.position.set(c.x, c.y, c.z); tmp.rotation.set(PILOT.i === i && !PILOT.parked ? Math.max(-0.25, Math.min(0.25, -c.vy * 0.015)) : 0, c.yaw, 0);
            tmp.scale.setScalar(CAR_SCALE); tmp.updateMatrix(); m.setMatrixAt(i, tmp.matrix); if (DBG && i === 0) (window as any).__car0 = [c.x, c.y, c.z, CARS[i].axis, CARS[i].sp];
        }
        m.instanceMatrix.needsUpdate = true;
    });
    useEffect(() => { const pal = ['#e5483a', '#f2b632', '#3aa66a', '#3f6fd8', '#f07a2a', '#8e5bd6']; cars.forEach((_, i) => ref.current.setColorAt(i, new THREE.Color(pal[i % 6]))); ref.current.instanceColor!.needsUpdate = true; }, [cars]);
    return <instancedMesh ref={ref} args={[undefined, undefined, CAR_N]} geometry={geo} frustumCulled={false}><meshBasicMaterial vertexColors toneMapped={false} transparent blending={THREE.NoBlending} /></instancedMesh>;
}
