import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Sim } from './sim';

const DBG = !!(import.meta as any).env.VITE_DBG;
// The hero root is 1.5; 7.5 gives this actor an exact 5x root-scale ratio.
const HERO_SCALE = 1.5;
const BOSS_SCALE = HERO_SCALE * 5;

type Shape = {
    geometry: THREE.BufferGeometry;
    position: [number, number, number];
    scale: [number, number, number];
    color: string;
};
function sphere(position: Shape['position'], scale: Shape['scale'], color: string, detail = 10): Shape {
    return { geometry: new THREE.SphereGeometry(1, detail, Math.max(6, detail - 2)), position, scale, color };
}
function capsule(position: Shape['position'], radius: number, length: number, color: string): Shape {
    return { geometry: new THREE.CapsuleGeometry(radius, length, 3, 8), position, scale: [1, 1, 1], color };
}
function merged(shapes: Shape[]): THREE.BufferGeometry {
    const pieces = shapes.map(({ geometry, position, scale, color }) => {
        geometry.scale(...scale);
        geometry.translate(...position);
        const c = new THREE.Color(color), colors = new Float32Array(geometry.attributes.position.count * 3);
        for (let i = 0; i < geometry.attributes.position.count; i++) c.toArray(colors, i * 3);
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.computeVertexNormals();
        return geometry;
    });
    const result = mergeGeometries(pieces, false);
    pieces.forEach((g) => g.dispose());
    if (!result) throw new Error('Could not merge giant-boss geometry');
    result.computeBoundingSphere();
    return result;
}

export function GiantBoss({ sim }: { sim: Sim }) {
    const root = useRef<THREE.Group>(null!);
    const torso = useRef<THREE.Group>(null!);
    const head = useRef<THREE.Group>(null!);
    const armL = useRef<THREE.Group>(null!);
    const armR = useRef<THREE.Group>(null!);
    const legL = useRef<THREE.Group>(null!);
    const legR = useRef<THREE.Group>(null!);
    const geometry = useMemo(() => ({
        torso: merged([
            sphere([0, -0.35, 0], [0.35, 0.22, 0.25], '#c4cbd1'),
            sphere([0, 0.20, 0], [0.47, 0.38, 0.30], '#e9edf0', 12),
            sphere([0, -0.12, 0.02], [0.31, 0.34, 0.23], '#f2f4f6'),
            sphere([-0.23, 0.18, 0.21], [0.25, 0.18, 0.13], '#f7f8f9'),
            sphere([0.23, 0.18, 0.21], [0.25, 0.18, 0.13], '#f7f8f9'),
            ...[0, 1, 2].flatMap((row) => [-1, 1].map((side) => sphere([side * (0.10 + row * 0.018), -0.01 - row * 0.105, 0.225], [0.095, 0.064, 0.045], '#e5e9ed', 8))),
            sphere([0, 0.54, 0], [0.14, 0.18, 0.14], '#d2d7dc'),
        ]),
        head: merged([sphere([0, 0, 0], [0.24, 0.27, 0.21], '#f5f6f7', 12)]),
        eyes: merged([
            sphere([-0.095, 0.04, 0.27], [0.07, 0.05, 0.04], '#ff1535', 8),
            sphere([0.095, 0.04, 0.27], [0.07, 0.05, 0.04], '#ff1535', 8),
        ]),
        arm: merged([
            sphere([0.01, 0.03, 0], [0.29, 0.26, 0.27], '#f2f4f6'),
            capsule([0.015, -0.19, 0], 0.18, 0.22, '#e3e7ea'),
            capsule([0.012, -0.53, 0], 0.145, 0.19, '#f4f5f6'),
            sphere([0.014, -0.74, 0.025], [0.15, 0.16, 0.16], '#e9edf0'),
        ]),
        leg: merged([
            capsule([0, -0.13, 0], 0.16, 0.18, '#e9edf0'),
            capsule([0, -0.38, 0], 0.135, 0.17, '#f3f5f6'),
            sphere([0, -0.495, 0.10], [0.18, 0.12, 0.25], '#c8ced4'),
        ]),
    }), []);
    const skin = useMemo(() => new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true }), []);
    const eyeMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff1535', toneMapped: false }), []);
    const state = useRef({ x: 0, z: 0, phase: 0, ready: false });

    useEffect(() => () => {
        Object.values(geometry).forEach((g) => g.dispose());
        skin.dispose(); eyeMaterial.dispose();
    }, [geometry, skin, eyeMaterial]);

    useFrame((_, rawDt) => {
        const dt = Math.max(0.001, Math.min(0.05, rawDt));
        const boss = sim.enemies.find((e) => e.boss);
        if (!boss || sim.mode !== 'play') { root.current.visible = false; return; }
        if (DBG) (window as any).__giantBossRoot = root.current;
        const motion = state.current;
        const speed = motion.ready ? Math.hypot(boss.x - motion.x, boss.z - motion.z) / dt : 0;
        motion.x = boss.x; motion.z = boss.z; motion.ready = true;
        const moving = Math.max(0, Math.min(1, speed / 1.8));
        motion.phase += dt * (1.45 + Math.min(1.1, speed * 0.65));
        const stride = Math.sin(motion.phase);
        const attackT = boss.atk > 0 ? Math.max(0, Math.min(1, 1 - boss.atk / 1.3)) : 0;
        const hit = boss.hit > 0 ? Math.min(0.06, boss.hit * 0.04) : 0;
        const fall = boss.down > 0 ? Math.max(0, Math.min(1, (3 - boss.down) / 0.55)) : 0;

        root.current.visible = true;
        root.current.position.set(boss.x, boss.y + ((boss as any).ly || 0), boss.z);
        root.current.rotation.set(-fall * 0.18, boss.ang, fall * 0.76);
        root.current.scale.setScalar(BOSS_SCALE * Math.max(0.002, 1 - fall * 0.78));
        torso.current.position.y = 0.93 + Math.abs(stride) * 0.026 * moving + Math.sin(sim.t * 1.35) * 0.008;
        torso.current.rotation.set(0.025 + Math.sin(sim.t * 1.1) * 0.012, 0, Math.sin(motion.phase * 0.5) * 0.018 * moving);
        head.current.rotation.x = -0.025 + Math.sin(motion.phase - 0.5) * 0.025 * moving;
        legL.current.rotation.x = stride * 0.25 * moving;
        legR.current.rotation.x = -stride * 0.25 * moving;
        armL.current.rotation.x = -stride * 0.13 * moving;
        armR.current.rotation.x = stride * 0.13 * moving;
        if (boss.atk > 0) {
            const lift = attackT < 0.55 ? attackT / 0.55 : 1 - (attackT - 0.55) / 0.45;
            armR.current.rotation.x = attackT < 0.55 ? 0.64 * lift : 0.64 - 1.68 * (1 - lift);
            torso.current.rotation.x = attackT < 0.55 ? 0.08 + lift * 0.12 : 0.2 - (1 - lift) * 0.38;
        }
        skin.color.setRGB(1 + hit, 1 + hit, 1 + hit);
    });

    return <group ref={root} visible={false} frustumCulled={false} userData={{ giantBoss: true }}>
        <group ref={torso} position={[0, 0.93, 0]}><mesh geometry={geometry.torso} material={skin} /></group>
        <group ref={head} position={[0, 1.68, 0]}>
            <mesh geometry={geometry.head} material={skin} />
            <mesh geometry={geometry.eyes} material={eyeMaterial} />
        </group>
        <group ref={armL} position={[-0.49, 1.29, 0]} rotation={[0, 0, 0.025]}><mesh geometry={geometry.arm} material={skin} /></group>
        <group ref={armR} position={[0.49, 1.29, 0]} rotation={[0, 0, -0.025]}><mesh geometry={geometry.arm} material={skin} /></group>
        <group ref={legL} position={[-0.20, 0.60, 0]}><mesh geometry={geometry.leg} material={skin} /></group>
        <group ref={legR} position={[0.20, 0.60, 0]}><mesh geometry={geometry.leg} material={skin} /></group>
    </group>;
}
