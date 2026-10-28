import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BOSS_ARENA } from './sim';
import { SELECTIVE_BLOOM_LAYER } from './renderLayers';

const DBG = !!(import.meta as any).env.VITE_DBG;

export function BossArenaMarker() {
    const root = useRef<THREE.Group>(null!);
    const beam = useRef<THREE.Mesh>(null!);
    const core = useRef<THREE.Mesh>(null!);
    const ring = useRef<THREE.Mesh>(null!);

    useFrame(({ clock }) => {
        const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 2.4);
        if (beam.current) (beam.current.material as THREE.MeshBasicMaterial).opacity = 0.54 + pulse * 0.2;
        if (core.current) {
            (core.current.material as THREE.MeshBasicMaterial).opacity = 0.72 + pulse * 0.24;
            core.current.scale.setScalar(0.92 + pulse * 0.12);
        }
        if (ring.current) (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.42 + pulse * 0.23;
        if (DBG) (window as any).__bossArenaMarker = root.current;
    });

    return <group ref={root} position={[BOSS_ARENA.x, BOSS_ARENA.y, BOSS_ARENA.z]} userData={{ bossArena: true }} frustumCulled={false}>
        <mesh ref={beam} onUpdate={(o) => o.layers.enable(SELECTIVE_BLOOM_LAYER)} position={[0, 42, 0]} frustumCulled={false}>
            <cylinderGeometry args={[3.5, 3.5, 84, 12, 1, true]} />
            <meshBasicMaterial color="#ed001f" transparent opacity={0.66} blending={THREE.NormalBlending} depthWrite={false} side={THREE.DoubleSide} fog={false} />
        </mesh>
        <mesh ref={core} onUpdate={(o) => o.layers.enable(SELECTIVE_BLOOM_LAYER)} position={[0, 83, 0]} frustumCulled={false}>
            <icosahedronGeometry args={[2.1, 1]} />
            <meshBasicMaterial color="#fff1f4" transparent opacity={0.86} blending={THREE.AdditiveBlending} depthWrite={false} fog={false} />
        </mesh>
        <mesh ref={ring} onUpdate={(o) => o.layers.enable(SELECTIVE_BLOOM_LAYER)} position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false}>
            <ringGeometry args={[7.4, 7.95, 48]} />
            <meshBasicMaterial color="#d40020" transparent opacity={0.72} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} fog={false} />
        </mesh>
        <mesh onUpdate={(o) => o.layers.enable(SELECTIVE_BLOOM_LAYER)} position={[0, 1.7, 0]} rotation={[Math.PI / 2, 0, 0]} frustumCulled={false}>
            <torusGeometry args={[5.6, 0.11, 6, 32]} />
            <meshBasicMaterial color="#d40020" transparent opacity={0.78} blending={THREE.AdditiveBlending} depthWrite={false} fog={false} />
        </mesh>
    </group>;
}
