import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { buildings, type Sim } from './sim';

const DBG = !!(import.meta as any).env.VITE_DBG;
const _target = new THREE.Vector3();
const _delta = new THREE.Vector3();
const TAU = Math.PI * 2;

function makeGhost() {
    const root = new THREE.Group();
    root.name = 'ghost-companion';
    root.visible = false;
    root.scale.setScalar(1.28);

    const suit = new THREE.MeshLambertMaterial({ color: '#edf3f7', emissive: '#a8c6d7', emissiveIntensity: 0.08 });
    const plate = new THREE.MeshLambertMaterial({ color: '#f9fbff' });
    const flex = new THREE.MeshLambertMaterial({ color: '#192433' });
    const trim = new THREE.MeshLambertMaterial({ color: '#26384b' });
    const visor = new THREE.MeshLambertMaterial({ color: '#09131f', emissive: '#101e2b', emissiveIntensity: 0.35 });
    const cyan = new THREE.MeshBasicMaterial({ color: '#62efff', toneMapped: false });
    const veil = new THREE.MeshLambertMaterial({ color: '#b9f6ff', transparent: true, opacity: 0.68, side: THREE.DoubleSide, depthWrite: false });
    const mat = { suit, plate, flex, trim, visor, cyan, veil };

    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, material: THREE.Material, p: [number, number, number], s?: [number, number, number]) => {
        const mesh = new THREE.Mesh(geo, material);
        mesh.position.set(...p);
        if (s) mesh.scale.set(...s);
        mesh.frustumCulled = false;
        parent.add(mesh);
        return mesh;
    };
    const sphere = (parent: THREE.Object3D, material: THREE.Material, p: [number, number, number], s: [number, number, number]) =>
        add(parent, new THREE.SphereGeometry(1, 10, 7), material, p, s);
    const capsule = (parent: THREE.Object3D, material: THREE.Material, radius: number, length: number, p: [number, number, number]) =>
        add(parent, new THREE.CapsuleGeometry(radius, length, 3, 8), material, p);

    const body = new THREE.Group();
    root.add(body);
    const torso = new THREE.Group();
    torso.position.y = 0.91;
    body.add(torso);

    // Original narrow-waist, athletic silhouette; white shell plates sit over a dark flexible suit.
    capsule(torso, flex, 0.23, 0.48, [0, 0.30, 0]);
    sphere(torso, suit, [0, 0.33, 0], [0.255, 0.38, 0.18]);
    sphere(torso, plate, [0, 0.48, 0.105], [0.265, 0.28, 0.105]);
    add(torso, new THREE.BoxGeometry(0.055, 0.24, 0.025), cyan, [0, 0.48, 0.214]);
    capsule(torso, plate, 0.19, 0.08, [0, 0.71, 0]);
    sphere(torso, flex, [0, 0.12, 0], [0.255, 0.16, 0.18]);
    sphere(torso, plate, [0, 0.12, 0.03], [0.255, 0.16, 0.19]);

    // Masked helmet and narrow cyan lenses: no hair, logos, mouth, or copied costume motifs.
    const head = new THREE.Group();
    head.position.set(0, 0.90, 0);
    torso.add(head);
    sphere(head, plate, [0, 0, 0], [0.17, 0.215, 0.16]);
    add(head, new THREE.BoxGeometry(0.245, 0.085, 0.055), visor, [0, -0.008, 0.135]);
    add(head, new THREE.BoxGeometry(0.075, 0.025, 0.018), cyan, [-0.052, -0.005, 0.166]);
    add(head, new THREE.BoxGeometry(0.075, 0.025, 0.018), cyan, [0.052, -0.005, 0.166]);
    const crest = add(head, new THREE.BoxGeometry(0.085, 0.025, 0.18), trim, [0, 0.175, -0.01]);
    crest.rotation.x = -0.2;
    sphere(torso, cyan, [0, 0.31, 0.225], [0.075, 0.095, 0.025]);

    const arms: THREE.Group[] = [];
    for (const side of [-1, 1]) {
        sphere(torso, plate, [side * 0.30, 0.52, 0], [0.16, 0.15, 0.16]);
        const arm = new THREE.Group();
        arm.position.set(side * 0.34, 0.51, 0);
        torso.add(arm);
        capsule(arm, suit, 0.095, 0.26, [0, -0.16, 0]);
        sphere(arm, flex, [0, -0.31, 0], [0.105, 0.085, 0.105]);
        const forearm = new THREE.Group();
        forearm.position.y = -0.33;
        arm.add(forearm);
        capsule(forearm, plate, 0.09, 0.25, [0, -0.15, 0]);
        capsule(forearm, trim, 0.094, 0.035, [0, -0.04, 0]);
        sphere(forearm, flex, [0, -0.31, 0.025], [0.075, 0.08, 0.09]);
        (arm as any).forearm = forearm;
        arms.push(arm);
    }

    const legs: THREE.Group[] = [];
    for (const side of [-1, 1]) {
        const leg = new THREE.Group();
        leg.position.set(side * 0.145, 0.76, 0);
        body.add(leg);
        capsule(leg, suit, 0.12, 0.34, [0, -0.19, 0]);
        sphere(leg, plate, [0, -0.39, 0.015], [0.125, 0.105, 0.13]);
        const shin = new THREE.Group();
        shin.position.y = -0.42;
        leg.add(shin);
        capsule(shin, plate, 0.105, 0.32, [0, -0.17, 0]);
        capsule(shin, flex, 0.108, 0.045, [0, -0.02, 0]);
        add(shin, new THREE.BoxGeometry(0.22, 0.13, 0.32), suit, [0, -0.35, 0.055]);
        (leg as any).shin = shin;
        legs.push(leg);
    }

    // A compact translucent back-veil gives Ghost a distinct trailing silhouette without adding effects or controls.
    const veilL = add(torso, new THREE.PlaneGeometry(0.22, 0.62), veil, [-0.095, 0.05, -0.17]);
    const veilR = add(torso, new THREE.PlaneGeometry(0.22, 0.62), veil, [0.095, 0.05, -0.17]);
    veilL.rotation.x = -0.16; veilR.rotation.x = -0.16;

    return { root, body, torso, arms, legs, veilL, veilR, materials: Object.values(mat) };
}

function floorAt(x: number, z: number) {
    let y = 0;
    for (const b of buildings) {
        if (x > b.x0 + 0.25 && x < b.x1 - 0.25 && z > b.z0 + 0.25 && z < b.z1 - 0.25 && b.h > y) y = b.h;
    }
    return y;
}

export function GhostCompanion({ sim }: { sim: Sim }) {
    const model = useMemo(makeGhost, []);
    const state = useRef({ ready: false, last: new THREE.Vector3(), speed: 0, yaw: 0, floorAt: 0, floorX: 1e9, floorZ: 1e9, floorT: -1 });

    useFrame((_, rawDt) => {
        const dt = Math.min(0.05, rawDt);
        const { root, body, torso, arms, legs, veilL, veilR } = model;
        const st = state.current;
        if (sim.mode !== 'play') {
            root.visible = false;
            st.ready = false;
            if (DBG) (window as any).__ghostState = { visible: false, mode: sim.mode };
            return;
        }
        root.visible = true;

        // Keep Ghost beside Shadow from the first gameplay frame, with a short rear-quarter follow gap.
        // This is presentation-only: no input, collision, targeting, or melee changes.
        const fx = Math.sin(sim.ang), fz = Math.cos(sim.ang), rx = -fz, rz = fx;
        const tx = sim.pos[0] - fx * 0.55 + rx * 1.45;
        const tz = sim.pos[2] - fz * 0.55 + rz * 1.45;
        const airborne = !sim.ground && !sim.wall && !sim.swim;
        let ty: number;
        if (sim.ground && !sim.web && !sim.wall && !sim.swim) {
            if (sim.t - st.floorT > 0.3 || Math.hypot(tx - st.floorX, tz - st.floorZ) > 2.0) {
                st.floorAt = floorAt(tx, tz); st.floorX = tx; st.floorZ = tz; st.floorT = sim.t;
            }
            ty = st.floorAt;
        } else {
            ty = sim.pos[1] - (airborne ? 1.25 : 1.0);
        }
        _target.set(tx, ty, tz);
        // Reset/respawn discontinuities are not a normal follow path; avoid showing a long rubber-band chase from stale state.
        if (!st.ready || root.position.distanceTo(_target) > 42) {
            root.position.copy(_target);
            st.last.copy(root.position);
            st.yaw = sim.ang;
            st.speed = 0;
            st.ready = true;
        }

        const beforeX = root.position.x, beforeY = root.position.y, beforeZ = root.position.z;
        _delta.copy(_target).sub(root.position);
        const distance = _delta.length();
        const leaderSpeed = Math.hypot(sim.vel[0], sim.vel[1], sim.vel[2]);
        const maxSpeed = THREE.MathUtils.clamp(leaderSpeed * 1.22 + 7, 9, 56);
        if (distance > 0.5) root.position.addScaledVector(_delta, Math.min(1, maxSpeed * dt / distance));
        const moved = Math.hypot(root.position.x - beforeX, root.position.y - beforeY, root.position.z - beforeZ);
        st.speed = dt > 0 ? moved / dt : 0;

        const moveYaw = st.speed > 0.35 ? Math.atan2(root.position.x - beforeX, root.position.z - beforeZ) : sim.ang;
        let yawDelta = ((moveYaw - st.yaw + Math.PI * 3) % TAU) - Math.PI;
        st.yaw += yawDelta * (1 - Math.exp(-dt * 7));
        root.rotation.y = st.yaw;

        const run = THREE.MathUtils.smoothstep(st.speed, 0.45, 5.0);
        const cycle = sim.t * (6 + Math.min(7, st.speed * 0.32));
        const flightPose = sim.web || sim.glideOn || sim.wall || airborne;
        const swing = Math.sin(cycle) * 0.58 * run;
        legs[0].rotation.x = flightPose ? 0.34 + Math.sin(cycle) * 0.12 : swing;
        legs[1].rotation.x = flightPose ? 0.24 - Math.sin(cycle) * 0.1 : -swing;
        (legs[0] as any).shin.rotation.x = Math.max(0, legs[0].rotation.x) * 0.65;
        (legs[1] as any).shin.rotation.x = Math.max(0, legs[1].rotation.x) * 0.65;
        arms[0].rotation.x = flightPose ? -0.36 : -swing * 0.56;
        arms[1].rotation.x = flightPose ? -0.36 : swing * 0.56;
        arms[0].rotation.z = flightPose ? -0.78 : 0;
        arms[1].rotation.z = flightPose ? 0.78 : 0;
        (arms[0] as any).forearm.rotation.x = flightPose ? -0.24 : -0.18;
        (arms[1] as any).forearm.rotation.x = flightPose ? -0.24 : -0.18;
        body.position.y = Math.sin(cycle * 2) * 0.035 * run + (flightPose ? 0.02 : 0);
        torso.rotation.x = flightPose ? 0.24 : -Math.min(0.16, st.speed * 0.008);
        torso.rotation.z = Math.sin(cycle) * 0.035 * run;
        veilL.rotation.z = -0.16 + Math.sin(sim.t * 7) * 0.12 * (0.3 + run);
        veilR.rotation.z = 0.16 - Math.sin(sim.t * 7 + 0.8) * 0.12 * (0.3 + run);

        if (DBG) (window as any).__ghostState = {
            visible: root.visible,
            position: root.position.toArray(),
            target: _target.toArray(),
            speed: st.speed,
            leaderDistance: Math.hypot(root.position.x - sim.pos[0], root.position.y - (sim.pos[1] - 1), root.position.z - sim.pos[2]),
            mode: sim.mode,
        };
    });

    return <primitive object={model.root} dispose={null} />;
}
