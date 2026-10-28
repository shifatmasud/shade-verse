import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import heroData from './hero.json';
import baseTexUrl from './basetex';
import { BOSS_BODY_OFFSET, BOSS_ROOT_SCALE, BOSS_SCALE_FACTOR, SHADOW_ROOT_SCALE } from './bossConfig';
import type { Sim } from './sim';

const DBG = !!(import.meta as any).env.VITE_DBG;
const SOURCE_HERO = JSON.parse(JSON.stringify(heroData)) as any;

type BossRig = {
    root: THREE.Group;
    body: THREE.SkinnedMesh;
    bones: THREE.Bone[];
    byName: Record<string, THREE.Bone>;
    geometry: THREE.BufferGeometry;
    skin: THREE.MeshLambertMaterial;
    outline: THREE.MeshBasicMaterial;
    muscleGeometry: THREE.SphereGeometry;
    muscleMaterial: THREE.MeshLambertMaterial;
    muscleOutline: THREE.MeshLambertMaterial;
};

function smoothstep(a: number, b: number, x: number) {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
}

function muscularShadowGeometry(data: any) {
    const positions = new Float32Array(data.pos);
    for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i], y = positions[i + 1], z = positions[i + 2];
        const ax = Math.abs(x);
        const torso = smoothstep(0.88, 1.10, y) * (1 - smoothstep(1.62, 1.78, y)) * (1 - smoothstep(0.28, 0.40, ax));
        const chest = Math.exp(-Math.pow((y - 1.42) / 0.23, 2));
        const shoulders = Math.exp(-Math.pow((y - 1.58) / 0.25, 2));
        const arms = smoothstep(0.25, 0.35, ax) * smoothstep(0.82, 1.02, y) * (1 - smoothstep(1.63, 1.76, y));
        const thighs = smoothstep(0.08, 0.16, ax) * smoothstep(0.22, 0.34, y) * (1 - smoothstep(0.78, 0.96, y));

        // Keep Shadow's mesh and joints, with a pronounced athletic chest, shoulders, and limbs.
        positions[i] = x * (1 + torso * (0.14 + chest * 0.12) + arms * (0.18 + shoulders * 0.12) + thighs * 0.14);
        positions[i + 2] = z * (1 + arms * 0.25 + thighs * 0.16) + (z > 0 ? torso * chest * 0.09 : 0);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uv, 2));
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(data.si, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(data.sw, 4));
    geometry.setIndex(data.idx);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.userData.muscleProfile = { torsoWidth: 1.26, upperArmBulk: 1.30, thighBulk: 1.14 };
    return geometry;
}

function whiteRedShadowMaterial() {
    const material = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#101010', emissiveIntensity: 0.08 });
    new THREE.TextureLoader().load(baseTexUrl, (source) => {
        const image = source.image as HTMLImageElement;
        const canvas = document.createElement('canvas');
        canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) { source.dispose(); return; }
        ctx.drawImage(image, 0, 0);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = pixels.data;
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
            const lens = b > g * 1.55 && r > g * 1.18 && b > r * 1.12 && b > 72;
            if (lens) {
                const shade = 0.84 + 0.16 * (luminance / 255);
                data[i] = 255 * shade; data[i + 1] = 20 * shade; data[i + 2] = 32 * shade;
            } else {
                const shade = 0.78 + 0.22 * (luminance / 255);
                data[i] = 250 * shade; data[i + 1] = 252 * shade; data[i + 2] = 255 * shade;
            }
        }
        ctx.putImageData(pixels, 0, 0);
        const painted = new THREE.CanvasTexture(canvas);
        painted.flipY = false; painted.colorSpace = THREE.SRGBColorSpace; painted.anisotropy = 2;
        material.map = painted; material.needsUpdate = true;
        source.dispose();
    });
    return material;
}

function addMuscle(parent: THREE.Bone, name: string, position: [number, number, number], size: [number, number, number], geometry: THREE.SphereGeometry, material: THREE.MeshLambertMaterial, outline: THREE.MeshLambertMaterial) {
    const form = new THREE.Group(); form.name = name; form.position.set(...position); parent.add(form);
    const ink = new THREE.Mesh(geometry, outline); ink.name = `${name}-outline`; ink.scale.set(size[0] * 1.09, size[1] * 1.09, size[2] * 1.09);
    const muscle = new THREE.Mesh(geometry, material); muscle.name = name; muscle.scale.set(...size);
    form.add(ink, muscle);
}

function buildBossRig(): BossRig {
    const data = SOURCE_HERO;
    const geometry = muscularShadowGeometry(data);
    const skin = whiteRedShadowMaterial();
    const body = new THREE.SkinnedMesh(geometry, skin);
    body.name = 'giant-boss-shadow-body'; body.frustumCulled = false;
    body.userData.shadowBody = true;
    body.userData.muscularProfile = geometry.userData.muscleProfile;

    const bones: THREE.Bone[] = [], byName: Record<string, THREE.Bone> = {};
    data.bones.forEach((description: any, i: number) => {
        const bone = new THREE.Bone(); bone.name = description.n; bones.push(bone); byName[description.n] = bone;
        const parent = description.p >= 0 ? data.bones[description.p].h : [0, 0, 0];
        bone.position.set(description.h[0] - parent[0], description.h[1] - parent[1], description.h[2] - parent[2]);
        if (description.p >= 0) bones[description.p].add(bone);
    });
    body.add(bones[0]);

    const muscleGeometry = new THREE.SphereGeometry(1, 14, 10);
    const muscleMaterial = new THREE.MeshLambertMaterial({ color: '#f8f9fb', emissive: '#101010', emissiveIntensity: 0.06 });
    const outline = new THREE.MeshBasicMaterial({ color: '#0a0d1a', side: THREE.BackSide });
    outline.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', 'transformed += normalize(objectNormal) * 0.014;\n#include <project_vertex>');
    };
    outline.customProgramCacheKey = () => 'shadow-boss-outline-v1';
    const muscleOutline = new THREE.MeshLambertMaterial({ color: '#090a12', emissive: '#07080e', emissiveIntensity: 0.25, side: THREE.BackSide });
    muscleOutline.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', 'transformed += normalize(objectNormal) * 0.014;\n#include <project_vertex>');
    };
    muscleOutline.customProgramCacheKey = () => 'shadow-boss-muscle-outline-v1';

    for (const side of [-1, 1]) {
        const label = side < 0 ? 'left' : 'right';
        addMuscle(byName.chest, `boss-pec-${label}`, [side * 0.105, 0.045, 0.15], [0.12, 0.074, 0.052], muscleGeometry, muscleMaterial, muscleOutline);
        for (const [row, y] of [-0.12, -0.215, -0.31].entries()) {
            addMuscle(byName.chest, `boss-ab-${row}-${label}`, [side * 0.047, y, 0.142], [0.045, 0.036, 0.026], muscleGeometry, muscleMaterial, muscleOutline);
        }
        addMuscle(byName[side < 0 ? 'uarmL' : 'uarmR'], `boss-deltoid-${label}`, [0, 0.005, 0.035], [0.105, 0.09, 0.10], muscleGeometry, muscleMaterial, muscleOutline);
        addMuscle(byName[side < 0 ? 'uarmL' : 'uarmR'], `boss-bicep-${label}`, [0, -0.13, 0.065], [0.092, 0.14, 0.10], muscleGeometry, muscleMaterial, muscleOutline);
        addMuscle(byName[side < 0 ? 'thighL' : 'thighR'], `boss-quad-${label}`, [side * 0.045, -0.18, 0.035], [0.082, 0.17, 0.095], muscleGeometry, muscleMaterial, muscleOutline);
    }

    const root = new THREE.Group(); root.add(body); root.updateMatrixWorld(true);
    body.bind(new THREE.Skeleton(bones));
    const ink = new THREE.SkinnedMesh(geometry, outline);
    ink.name = 'giant-boss-shadow-outline'; ink.frustumCulled = false;
    root.add(ink); ink.bind(body.skeleton, body.bindMatrix);

    root.userData = { giantBoss: true, bodyModel: 'Shadow hero mesh', scaleFactor: BOSS_SCALE_FACTOR, shadowRootScale: SHADOW_ROOT_SCALE, bodyOffset: BOSS_BODY_OFFSET };
    return { root, body, bones, byName, geometry, skin, outline, muscleGeometry, muscleMaterial, muscleOutline };
}

export function GiantBoss({ sim }: { sim: Sim }) {
    const rig = useMemo(buildBossRig, []);
    const root = rig.root;
    const state = useRef({ x: 0, z: 0, phase: 0, ready: false });

    useEffect(() => () => {
        rig.geometry.dispose(); rig.skin.map?.dispose(); rig.skin.dispose(); rig.outline.dispose();
        rig.muscleGeometry.dispose(); rig.muscleMaterial.dispose(); rig.muscleOutline.dispose();
    }, [rig]);

    useFrame((_, rawDt) => {
        const dt = Math.max(0.001, Math.min(0.05, rawDt));
        const boss = sim.enemies.find((e) => e.boss);
        if (!boss || sim.mode !== 'play') { root.visible = false; return; }
        if (DBG) (window as any).__giantBossRoot = root;

        const motion = state.current;
        const speed = motion.ready ? Math.hypot(boss.x - motion.x, boss.z - motion.z) / dt : 0;
        motion.x = boss.x; motion.z = boss.z; motion.ready = true;
        const moving = Math.max(0, Math.min(1, speed / 1.8));
        motion.phase += dt * (1.45 + Math.min(1.1, speed * 0.65));
        const stride = Math.sin(motion.phase);
        const attackT = boss.atk > 0 ? Math.max(0, Math.min(1, 1 - boss.atk / 1.3)) : 0;
        const hit = boss.hit > 0 ? Math.min(0.06, boss.hit * 0.04) : 0;
        const fall = boss.down > 0 ? Math.max(0, Math.min(1, (3 - boss.down) / 0.55)) : 0;
        const b = rig.byName;

        root.visible = true;
        root.position.set(boss.x, boss.y + ((boss as any).ly || 0), boss.z);
        root.rotation.set(-fall * 0.18, boss.ang, fall * 0.76);
        root.scale.setScalar(BOSS_ROOT_SCALE * Math.max(0.002, 1 - fall * 0.78));

        rig.bones.forEach((bone) => bone.rotation.set(0, 0, 0));
        b.thighL.rotation.x = stride * 0.22 * moving;
        b.thighR.rotation.x = -stride * 0.22 * moving;
        b.shinL.rotation.x = Math.max(0, -stride) * 0.28 * moving;
        b.shinR.rotation.x = Math.max(0, stride) * 0.28 * moving;
        b.uarmL.rotation.x = -stride * 0.12 * moving;
        b.uarmR.rotation.x = stride * 0.12 * moving;
        b.chest.rotation.x = 0.018 + Math.sin(sim.t * 1.1) * 0.012;
        b.chest.rotation.z = Math.sin(motion.phase * 0.5) * 0.018 * moving;
        b.head.rotation.x = -0.025 + Math.sin(motion.phase - 0.5) * 0.025 * moving;
        if (boss.atk > 0) {
            const lift = attackT < 0.55 ? attackT / 0.55 : 1 - (attackT - 0.55) / 0.45;
            b.uarmR.rotation.x = attackT < 0.55 ? 0.64 * lift : 0.64 - 1.68 * (1 - lift);
            b.farmR.rotation.x = -0.38 * lift;
            b.chest.rotation.x = attackT < 0.55 ? 0.08 + lift * 0.12 : 0.2 - (1 - lift) * 0.38;
        }
        rig.skin.color.setRGB(1 + hit, 1 + hit, 1 + hit);
    });

    return <primitive object={root} visible={false} frustumCulled={false} />;
}
