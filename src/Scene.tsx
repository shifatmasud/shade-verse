import { Lilies } from './world/lilies';
import { hitFeelCamera, hitFeelFov } from './hitFeel';
import { ContactShadows, StaticShadows } from './world/contactShadows';
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { traversalBones, traversalRoot } from './heroTraversal';
import { landFeel } from './landFeel';
import { enemyReact } from './enemyReact';
import { heroHurtBones } from './heroHurt';
import { shotRecoilBones } from './heroRecoil';
import { meleeBody, slamBody, slamBodyReset, supportLegIK } from './heroMelee';
import gsap from 'gsap';
import heroData from './hero.json';
import baseTexUrl from './basetex';
import { trimTexture, SHADOW_TRIM } from './heroTrim';
import clipIdle from './clips/idle.json';
import clipJump from './clips/jump.json';
import clipWall from './clips/climbing_wall.json';
import clipPunch from './clips/punch.json';
import clipSwim from './clips/swimming.json';
import clipRun from './clips/run.json';
import { GiantBoss } from './GiantBoss';
import { Weather } from './world/weather';
import { Mist } from './world/mist';
import { BossArenaMarker } from './BossArenaMarker';
import { poolAt, HBOSS } from './seaWorld';
import { attachInk, syncInk } from './ink';
import { buildings, WATER_Z, parkH, WATER_Y, SEABED, seabedAt, HALF, FOG, isLakeWater, waterSurfaceAt, stepSim, stepBeacon, resetSim, MOVES, SNARE, enemyBodyOffset, simTimeScale, getCompanionSim, type Sim, type Events } from './sim';
import { CombatFX, registerFxHero } from './CombatFX';
import { ParkGround, PolyforkBuildings, PolyforkLakeBridge } from './polyforkEnvironment';
import { RoofProps } from './RoofProps';
import { StreetProps } from './StreetProps';
import { OCC } from './occlude';
import { QK, HQ, AA_FXAA } from './quality';
import { SelectiveBloomPass } from './SelectiveBloomPass';
import { SouthSea } from './SouthSea';
import { islandH } from './seaWorld'
import { TOD, UWF, UW } from './world/env';
import { seabedMat, wallMat, oceanGeo, seabedGeo } from './water/seabed';
import { waterMat } from './water/oceanMaterial';
import { OceanFollow, ReflectionIllusion, OceanSlices } from './water/OceanPasses';
import { Boats, Gulls, Fish, MarineSnow, Whale } from './world/sealife';
import { Jellies } from './world/jellies';
import { buildEnemy, PlasmaFx, EnemyDeathFx, EnemyShotsFx } from './world/enemies';
import { DayNight } from './world/dayNight';
import { FarPropGate, CityGate, HarborGate } from './world/gates';
import { HERO_SC, BOT_SC } from './world/scale';
import { WindLines, Civilians } from './world/civilians';
import { FlyingCars } from './world/flyingCars';
import { Underwater } from './world/underwater';
import { waveAtWater, waterRenderY } from './water/waveHeight';
import { Forest, Meadow, parkBushGeo, parkGrassOnCompile, tuftGeo } from './world/forest';
import { treeGeo, palmFrondTex, palmTrunkTex, palmGeo, palmFrondShader, trunkWindShader, leafWindShader } from './world/trees';
import { FxaaPass, HeroHDPass, OutlinePass, OUTLINE_STATE } from './render/passes'
import { WATERLINE } from './world/env';
import { updateWaterline } from './water/waterline';
import { cullInstances, viewFrustum } from './render/instCull';
export { SHARPEN, FXAA_STATE, OUTLINE_STATE } from './render/passes';
import { City, TenementBlock, Sky } from './world/cityScenery';
import { HD, applyRatio, registerHero, HERO_WATER } from './heroHD';
import { SELECTIVE_BLOOM_LAYER } from './renderLayers';



const DBG = !!(import.meta as any).env.VITE_DBG;   // test hooks only in instrumented builds

const tmp = new THREE.Object3D();

const SOUTH_SEA_KIT = { tod: TOD, palmGeo, treeGeo, tuftGeo, parkBushGeo, parkGrassOnCompile, palmTrunkTex, palmFrondTex, palmFrondShader, trunkWindShader, leafWindShader };   // South Sea island reuses the park's palm + broadleaf species
// ===== combat choreography poses (procedural layer on the existing rig; model untouched) =====
// Key poses read from real stills: Muybridge "Two men boxing" (1887) jab/cross shoulder turn + rear-heel pivot;
// Taekwondo 540 hook + capoeira armada (chamber, counter-lean, extended hook leg); Spider-Man 2 combat (launcher, air spike, web pull/yank).
type PoseK = Record<string, [number, number, number]>;
const CP_BONES = ['hips', 'spine', 'chest', 'head', 'uarmL', 'farmL', 'uarmR', 'farmR', 'thighL', 'shinL', 'thighR', 'shinR'];
const GUARD: PoseK = { hips: [0, 0.12, 0], spine: [0.12, 0, 0], chest: [0, 0.1, 0], head: [-0.08, -0.1, 0], uarmL: [-1.05, 0, 0.32], farmL: [-1.95, 0, 0], uarmR: [-0.85, 0, -0.38], farmR: [-2.05, 0, 0], thighL: [-0.38, 0, -0.06], shinL: [0.32, 0, 0], thighR: [0.28, 0, 0.06], shinR: [0.42, 0, 0] };
const P = (o: PoseK): PoseK => ({ ...GUARD, ...o });
const POSES: Record<number, [number, PoseK][]> = {
    1: [[0, GUARD], [0.17, P({ hips: [0, -0.06, 0], spine: [0.18, 0, 0], chest: [0, -0.24, 0], uarmL: [-0.8, 0, 0.5], farmL: [-2.25, 0, 0], head: [-0.1, -0.05, 0] })], [0.33, P({ hips: [0, 0.28, 0], spine: [0.2, 0, 0], chest: [0, 0.42, 0], uarmL: [-1.55, 0, 0.14], farmL: [-0.08, 0, 0], head: [-0.05, -0.3, 0] })], [0.42, P({ hips: [0, 0.33, 0], spine: [0.22, 0, 0], chest: [0, 0.5, 0], uarmL: [-1.63, 0, 0.1], farmL: [0.0, 0, 0], head: [-0.05, -0.34, 0] })], [0.6, P({ hips: [0, 0.2, 0], chest: [0, 0.26, 0], uarmL: [-1.4, 0, 0.22], farmL: [-0.7, 0, 0] })], [1, GUARD]],   // anticipation (shoulder back, hip counter-twist) -> strike -> 5% overshoot -> recoil
    2: [[0, P({ chest: [0, 0.3, 0] })], [0.18, P({ hips: [0, 0.16, 0], spine: [0.06, 0, 0], chest: [0, 0.5, 0], uarmR: [-0.7, 0, -0.5], farmR: [-2.25, 0, 0], thighR: [0.38, 0, 0.06], shinR: [0.5, 0, 0], head: [-0.1, -0.15, 0] })], [0.34, P({ hips: [0, -0.38, 0], chest: [0, -0.62, 0], spine: [0.22, 0, 0], uarmR: [-1.58, 0, -0.12], farmR: [-0.06, 0, 0], uarmL: [-0.9, 0, 0.5], thighR: [0.12, 0, 0.04], shinR: [0.62, 0, 0], head: [-0.05, 0.35, 0] })], [0.43, P({ hips: [0, -0.46, 0], chest: [0, -0.74, 0], spine: [0.27, 0, 0], uarmR: [-1.66, 0, -0.06], farmR: [0.0, 0, 0], uarmL: [-0.85, 0, 0.55], thighR: [0.1, 0, 0.04], shinR: [0.7, 0, 0], head: [-0.05, 0.4, 0] })], [0.64, P({ hips: [0, -0.3, 0], chest: [0, -0.45, 0], uarmR: [-1.4, 0, -0.2], farmR: [-0.6, 0, 0] })], [1, GUARD]],   // weight back + rear shoulder cocked -> cross with 25 deg torso twist -> overshoot -> recoil
    3: [[0, P({ hips: [0, 0.3, 0], chest: [0, 0.45, 0] })], [0.1, P({ hips: [0, 0.4, 0], spine: [0.28, 0, 0], chest: [0, 0.6, 0], thighL: [-0.55, 0, 0], shinL: [0.8, 0, 0], thighR: [-0.2, 0, 0], shinR: [0.7, 0, 0], uarmL: [-1.2, 0, 0.7], farmL: [-2.0, 0, 0], uarmR: [-1.0, 0, -0.7], farmR: [-2.1, 0, 0] })], [0.3, P({ hips: [0, -0.2, 0.55], spine: [0.15, 0, 0.1], chest: [0, -0.2, 0], head: [0, 0.3, -0.35], thighR: [-1.95, 0, 0.45], shinR: [2.35, 0, 0], thighL: [-0.1, 0, -0.55], shinL: [0.22, 0, 0], uarmL: [-1.15, 0, 0.75], farmL: [-2.0, 0, 0], uarmR: [-0.95, 0, -0.6], farmR: [-2.1, 0, 0] })], [0.5, P({ hips: [0, 0, 1.3], spine: [0.05, 0, 0.12], chest: [0, 0, 0.05], head: [0, 0.2, -0.9], thighR: [-0.12, 0, 0.3], shinR: [0.04, 0, 0], thighL: [-0.08, 0, -1.3], shinL: [0.2, 0, 0], uarmL: [-1.15, 0, 0.75], farmL: [-2.0, 0, 0], uarmR: [-0.95, 0, -0.6], farmR: [-2.1, 0, 0] })], [0.6, P({ hips: [0, 0, 1.34], spine: [0.05, 0, 0.12], chest: [0, 0, 0.05], head: [0, 0.2, -0.92], thighR: [-0.14, 0, 0.33], shinR: [0.02, 0, 0], thighL: [-0.08, 0, -1.34], shinL: [0.2, 0, 0], uarmL: [-1.15, 0, 0.75], farmL: [-2.0, 0, 0], uarmR: [-0.95, 0, -0.6], farmR: [-2.1, 0, 0] })], [0.74, P({ hips: [0, 0, 0.6], spine: [0.1, 0, 0.1], head: [0, 0.1, -0.4], thighR: [-1.7, 0, 0.6], shinR: [2.2, 0, 0], thighL: [-0.1, 0, -0.6], shinL: [0.22, 0, 0], uarmL: [-1.15, 0, 0.75], farmL: [-2.0, 0, 0], uarmR: [-0.95, 0, -0.6], farmR: [-2.1, 0, 0] })], [0.88, P({ hips: [0, 0, 0.1], thighR: [-0.5, 0, 0.1], shinR: [0.8, 0, 0], thighL: [-0.15, 0, -0.1], shinL: [0.3, 0, 0] })], [1, GUARD]],   // spin hook kick from real reference (Shifat Nov 2 3:38 PM 'Kick still looks shit'; ref: taekwondo spin hook kick slow-motion breakdown): coil -> CHAMBER (knee folded tight to the chest, foot tucked, pelvis starts to tip) -> EXTENSION (the pelvis tips ~75 deg with the kicking leg nearly in line with it, so head - hip - kicking foot are one straight line at waist-chest height - the bf40661 kicking leg Shifat approved Nov 2 4:05 PM; the support leg is nearly straight (~11 deg knee) and vertical under the hip (35b310f), and the hip corrective bones in buildRig round the support-side hip/groin so it does not crease); arms in guard; head turned to the target) -> RE-CHAMBER (knee folds back before the foot comes down) -> set down -> guard. Was: pelvis tilted toward the kicking leg with a counter-bent spine, so the hips kinked and the butt stuck out
    4: [[0, P({ spine: [0.35, 0, 0], thighL: [-0.85, 0, 0], shinL: [1.3, 0, 0], thighR: [-0.25, 0, 0], shinR: [1.2, 0, 0], uarmR: [0.35, 0, 0.1], farmR: [-1.3, 0, 0] })], [0.2, P({ spine: [0.55, 0, 0], chest: [0, 0.3, 0], thighL: [-1.15, 0, 0], shinL: [1.75, 0, 0], thighR: [-0.5, 0, 0], shinR: [1.6, 0, 0], uarmR: [0.6, 0, 0.15], farmR: [-1.5, 0, 0], uarmL: [-1.2, 0, 0.5], farmL: [-1.8, 0, 0] })], [0.38, P({ spine: [-0.28, 0, 0], chest: [0, -0.4, 0], uarmR: [-3.05, 0, -0.08], farmR: [-0.25, 0, 0], uarmL: [-0.4, 0, -0.6], farmL: [-1.2, 0, 0], thighL: [-1.6, 0, 0], shinL: [1.8, 0, 0], thighR: [0.2, 0, 0], shinR: [0.1, 0, 0], head: [-0.4, 0, 0] })], [0.7, P({ spine: [-0.15, 0, 0], uarmR: [-2.4, 0, -0.3], farmR: [-0.9, 0, 0], thighL: [-1.1, 0, 0], shinL: [1.6, 0, 0] })], [1, P({ thighL: [-0.6, 0, 0], shinL: [1.0, 0, 0], thighR: [-0.2, 0, 0], shinR: [0.8, 0, 0] })]],
    5: [[0, P({ thighL: [-1.4, 0, 0], shinL: [2.1, 0, 0], thighR: [-1.3, 0, 0], shinR: [2.0, 0, 0], spine: [0.35, 0, 0] })], [0.3, P({ hips: [0.25, 0, 0], thighR: [-1.9, 0, 0.1], shinR: [1.9, 0, 0], thighL: [-1.2, 0, 0], shinL: [2.0, 0, 0], uarmL: [-0.6, 0, -0.9], uarmR: [-0.6, 0, 0.9] })], [0.52, P({ hips: [0.55, 0, 0], spine: [0.2, 0, 0], thighR: [-1.25, 0, 0.05], shinR: [0.05, 0, 0], thighL: [-0.6, 0, 0], shinL: [1.9, 0, 0], uarmL: [-0.3, 0, -1.25], farmL: [-0.3, 0, 0], uarmR: [-0.2, 0, 1.25], farmR: [-0.3, 0, 0], head: [-0.4, 0, 0] })], [0.8, P({ hips: [0.2, 0, 0], thighR: [-0.9, 0, 0], shinR: [1.2, 0, 0], thighL: [-0.7, 0, 0], shinL: [1.4, 0, 0] })], [1, P({ thighL: [-0.5, 0, 0], shinL: [0.9, 0, 0], thighR: [-0.3, 0, 0], shinR: [0.7, 0, 0] })]],
    6: [[0, P({ uarmR: [-1.6, 0, -0.05], farmR: [-0.05, 0, 0], chest: [0, -0.35, 0] })], [0.22, P({ uarmR: [-1.55, 0, -0.1], farmR: [-0.1, 0, 0], uarmL: [-1.5, 0, 0.1], farmL: [-0.1, 0, 0], spine: [0.1, 0, 0] })], [0.4, P({ uarmR: [0.25, 0, 0.1], farmR: [-1.6, 0, 0], uarmL: [0.2, 0, -0.1], farmL: [-1.6, 0, 0], spine: [-0.2, 0, 0], thighR: [-1.3, 0, 0], shinR: [1.8, 0, 0] })], [0.55, P({ hips: [0, 0, 0], spine: [-0.4, 0, 0], thighR: [-2.35, 0, 0.1], shinR: [0.05, 0, 0], thighL: [0.6, 0, 0], shinL: [1.8, 0, 0], uarmR: [0.6, 0, 0.3], farmR: [-0.5, 0, 0], uarmL: [0.5, 0, -0.3], farmL: [-0.5, 0, 0] })], [0.8, P({ thighR: [-1.6, 0, 0], shinR: [0.9, 0, 0] })], [1, GUARD]],
    7: [[0, P({ uarmR: [-1.75, 0, -0.1], farmR: [-0.05, 0, 0], uarmL: [-1.7, 0, 0.1], farmL: [-0.05, 0, 0], spine: [0.15, 0, 0] })], [0.25, P({ uarmR: [-1.9, 0, -0.1], farmR: [-0.1, 0, 0], uarmL: [-1.85, 0, 0.1], farmL: [-0.1, 0, 0], spine: [0.1, 0, 0] })], [0.42, P({ uarmR: [0.45, 0, 0.15], farmR: [-1.4, 0, 0], uarmL: [0.45, 0, -0.15], farmL: [-1.4, 0, 0], spine: [-0.38, 0, 0], hips: [0, -0.2, 0], thighL: [-0.6, 0, 0], shinL: [0.6, 0, 0], thighR: [0.45, 0, 0], shinR: [0.4, 0, 0], head: [0.2, 0, 0] })], [0.75, P({ uarmR: [0.2, 0, 0.1], farmR: [-1.6, 0, 0], uarmL: [0.2, 0, -0.1], farmL: [-1.6, 0, 0], spine: [-0.15, 0, 0] })], [1, GUARD]],
};
if (DBG) (window as any).__POSES = POSES;   // test hook (pose tuning)
export type CombatPoseState = { w: number; c: Float32Array; t: Float32Array };
export function createCombatPoseState(): CombatPoseState { return { w: 0, c: new Float32Array(CP_BONES.length * 3), t: new Float32Array(CP_BONES.length * 3) }; }
const _cp: CombatPoseState = createCombatPoseState();
const cstep = (x: number) => x * x * (3 - 2 * x);
function samplePose(keys: [number, PoseK][], u: number, out: Float32Array) {
    let k = 0; while (k < keys.length - 2 && u > keys[k + 1][0]) k++;
    const [u0, A] = keys[k], [u1, B] = keys[k + 1], f = cstep(Math.max(0, Math.min(1, (u - u0) / Math.max(1e-4, u1 - u0))));
    CP_BONES.forEach((n, i) => { const a = A[n], b = B[n]; for (let j = 0; j < 3; j++) out[i * 3 + j] = a[j] + (b[j] - a[j]) * f; });
}
/* Dodge flip visual clock (Nov 3 tuck audit). The dodge flip lasts 0.5 s, but a dodge from the ground is only airborne ~0.23 s (7.5 m/s up at G 60,
   down at G_FALL 80), so on the old 0.5 s clock the hero touched down at ~46% of the flip, nearly upside down, and finished the turn on the floor
   (sat on the butt / inverted on the ground). The rotation and tuck now run on the airborne window, so the flip is upright again with the legs
   opening right at touchdown; the rest of the dodge is the guard pose. Visual only: flip timing, dodge i-frames, velocity and controls unchanged. */
const FLIP_AIR = 0.46;
const flipAirU = (fl: { t: number; dur: number }) => Math.min(1, fl.t / (fl.dur * FLIP_AIR));
// Charged Slam poses (Shifat Nov 2: hold melee = charge, release = leap + slam; ref Miles' Venom Smash, files/combat_refs)
const SLAM_POSE: PoseK[] = [
    P({ spine: [0.38, 0, 0], chest: [0, 0.45, 0], hips: [0, 0.25, 0], uarmR: [0.55, 0, -0.3], farmR: [-1.7, 0, 0], uarmL: [-1.25, 0, 0.45], farmL: [-1.5, 0, 0], thighL: [-0.95, 0, -0.08], shinL: [1.35, 0, 0], thighR: [-0.25, 0, 0.1], shinR: [1.2, 0, 0], head: [-0.25, -0.3, 0] }),   // 0 charge: crouched, fist drawn back
    P({ spine: [0.55, 0, 0], chest: [0, 0.3, 0], uarmR: [0.7, 0, -0.25], farmR: [-1.8, 0, 0], uarmL: [0.5, 0, 0.25], farmL: [-1.6, 0, 0], thighL: [-1.25, 0, -0.1], shinL: [1.9, 0, 0], thighR: [-1.1, 0, 0.1], shinR: [1.8, 0, 0], head: [-0.35, 0, 0] }),   // 1 crouch: deep squash before the leap
    P({ spine: [-0.3, 0, 0], chest: [0, 0, 0], uarmR: [-2.95, 0, -0.25], farmR: [-0.45, 0, 0], uarmL: [-2.95, 0, 0.25], farmL: [-0.45, 0, 0], thighL: [-1.45, 0, 0], shinL: [2.0, 0, 0], thighR: [-1.2, 0, 0], shinR: [1.9, 0, 0], head: [0.25, 0, 0] }),   // 2/3 rise + hang: both fists overhead, knees tucked
    P({ spine: [0.55, 0, 0], chest: [0, 0, 0], uarmR: [-0.75, 0, -0.12], farmR: [-0.15, 0, 0], uarmL: [-0.75, 0, 0.12], farmL: [-0.15, 0, 0], thighL: [0.25, 0, 0], shinL: [0.5, 0, 0], thighR: [0.35, 0, 0], shinR: [0.6, 0, 0], head: [-0.45, 0, 0] }),   // 4 dive: double-fist hammer down, legs trail
    P({ spine: [0.45, 0, 0], chest: [0, 0.2, 0], uarmR: [-0.55, 0, -0.05], farmR: [-0.1, 0, 0], uarmL: [-0.6, 0, 0.7], farmL: [-0.9, 0, 0], thighL: [-1.55, 0, 0], shinL: [1.65, 0, 0], thighR: [0.35, 0, 0], shinR: [1.95, 0, 0], head: [-0.5, 0, 0] }),   // 5 impact/recovery: kneel, fist planted
    P({ spine: [-0.5, 0, 0], chest: [0, 0, 0], uarmR: [-3.15, 0, -0.2], farmR: [-1.35, 0, 0], uarmL: [-3.15, 0, 0.2], farmL: [-1.35, 0, 0], thighL: [-1.0, 0, 0], shinL: [1.7, 0, 0], thighR: [-0.55, 0, 0], shinR: [1.5, 0, 0], head: [0.35, 0, 0] }),   // 5 apex (combat feel pass): the hammer wind-up - back arched, both fists cocked behind the head, eyes down on the target
];
const SLAM_KEY = [0, 1, 2, 5, 3, 4];   // ph3 (hang at the apex) has its own hammer wind-up pose now; was the rise pose held
const STRETCH_BONES = ['farmL', 'farmR', 'shinR'];
const STRETCH_LIMB: Record<number, string> = { 1: 'farmL', 2: 'farmR', 3: 'shinR', 4: 'farmR', 5: 'shinR', 6: 'shinR', 7: 'farmR' };
const SQUASH: Record<number, [number, number]> = { 1: [0.03, 0.03], 2: [0.04, 0.04], 3: [0.08, 0.06], 4: [0.14, 0.12], 5: [0, 0.1], 6: [0.05, 0.08], 7: [0.06, 0.05] };   // [anticipation squash, release stretch] of the body height
export function combatPose(sim: any, rig: any, h: THREE.Object3D, dt: number, state: CombatPoseState = _cp) {
    const sl = sim.slam, mv = sl ? null : sim.mv, fl = sl ? null : sim.flip, act = !!mv || !!fl || !!sl;
    for (const n of STRETCH_BONES) { const b = rig.b[n] as THREE.Bone; if (b && b.scale.y !== 1) b.scale.set(1, 1, 1); }   // undo last frame's smear stretch
    const bones = CP_BONES.map((n) => rig.b[n] as THREE.Bone);
    if (state.w < 0.02 && !act) { bones.forEach((b, i) => { state.c[i * 3] = b.rotation.x; state.c[i * 3 + 1] = b.rotation.y; state.c[i * 3 + 2] = b.rotation.z; }); state.w = 0; return; }
    state.w += ((act ? 1 : 0) - state.w) * Math.min(1, dt * (act ? 16 : 7));   // ease in fast, settle out slower: momentum, no snap
    if (sl) {
        const K = SLAM_POSE[SLAM_KEY[sl.ph] ?? 0]; CP_BONES.forEach((n, i) => { const a = K[n]; state.t[i * 3] = a[0]; state.t[i * 3 + 1] = a[1]; state.t[i * 3 + 2] = a[2]; });
        if (sl.ph === 0) { const tr = 0.04 * sl.c * Math.sin(sim.t * 70); state.t[6 * 3] += tr; state.t[1 * 3] += tr * 0.5; }   // charge tremble grows with the charge
        if (sl.ph === 0) { state.t[1 * 3] += 0.18 * sl.c; state.t[6 * 3] += 0.35 * sl.c; }   // the wind-up deepens with the charge: chest folds over, the fist draws further back
        if (sl.ph === 5 && sl.t > 0.12) { const u = cstep(Math.min(1, (sl.t - 0.12) / 0.23)); CP_BONES.forEach((n, i) => { const a = SLAM_POSE[4][n], g = GUARD[n]; for (let j = 0; j < 3; j++) state.t[i * 3 + j] = a[j] + (g[j] - a[j]) * u; }); }   // hold the impact ~0.12 s, then rise to guard
    }
    else if (mv) { const M = MOVES[mv.id]; samplePose(POSES[mv.id], Math.min(1, mv.t / M.dur), state.t); }
    else if (fl) { const u = flipAirU(fl), tuck = Math.sin(Math.min(1, u * 1.1) * Math.PI); samplePose([[0, GUARD], [1, P({ thighL: [-1.7, 0, 0], shinL: [2.2, 0, 0], thighR: [-1.6, 0, 0], shinR: [2.2, 0, 0], uarmL: [-1.2, 0, 0.6], farmL: [-1.8, 0, 0], uarmR: [-1.2, 0, -0.6], farmR: [-1.8, 0, 0], spine: [0.45, 0, 0] })]], fl.ax === 'x' ? tuck : tuck * 0.35, state.t);
        if (fl.ax === 'z') { const s0 = state.t; s0[4 * 3 + 2] = -1.5 * tuck; s0[6 * 3 + 2] = 1.5 * tuck; s0[8 * 3 + 2] = -0.5 * tuck; s0[10 * 3 + 2] = 0.5 * tuck; } }
    else { bones.forEach((b, i) => { state.t[i * 3] = b.rotation.x; state.t[i * 3 + 1] = b.rotation.y; state.t[i * 3 + 2] = b.rotation.z; }); }
    const snap = !!mv && mv.t > MOVES[mv.id].hit * 0.55 && mv.t < MOVES[mv.id].hit + 0.03;   // the strike itself: limbs reach the hit pose ON the hit frame instead of trailing ~50 ms behind it
    const k = Math.min(1, dt * (sl && (sl.ph === 4 || sl.ph === 5) ? 40 : snap ? 60 : 24));   // per-bone follow (the slam's hammer-down snaps faster): chained moves blend through each other instead of popping
    for (let i = 0; i < state.t.length; i++) state.c[i] += (state.t[i] - state.c[i]) * k;
    const w = state.w;
    bones.forEach((b, i) => { b.rotation.x += (state.c[i * 3] - b.rotation.x) * w; b.rotation.y += (state.c[i * 3 + 1] - b.rotation.y) * w; b.rotation.z += (state.c[i * 3 + 2] - b.rotation.z) * w; });
    // whole-body turns, not smoothed (continuous 0..2pi): spin hook kick, flips/cartwheels around the hips
    if (mv && mv.id === 3) { const u = Math.min(1, mv.t / MOVES[3].dur), sp = cstep(Math.max(0, Math.min(1, (u - 0.08) / 0.72))); h.rotation.y += sp * Math.PI * 2; }
    if (mv && mv.id === 5) { const u = Math.min(1, mv.t / MOVES[5].dur); rig.b.hips.rotation.x += cstep(Math.min(1, u / 0.5)) * 0.6 * (1 - cstep(Math.max(0, (u - 0.6) / 0.4))); }
    if (fl) { const u = flipAirU(fl), a = cstep(u) * Math.PI * 2 * fl.dir; if (fl.ax === 'x') rig.b.hips.rotation.x += a; else rig.b.hips.rotation.z += a; }
    if (mv && mv.id === 3) { const u = mv.t / MOVES[3].dur; supportLegIK(rig, 'L', w * cstep(Math.max(0, Math.min(1, (u - 0.24) / 0.14))) * (1 - cstep(Math.max(0, Math.min(1, (u - 0.76) / 0.12))))); }   // spin hook kick: planted support leg by IK (src/heroMelee.ts)
    meleeBody(sim, rig, h, dt, w, MOVES);   // whole-body weight: wind-up, lunge, sit into the hit, rear-heel pivot, recover (src/heroMelee.ts)
    // smear stretch on the striking limb for ~2 frames around the hit, and body squash (anticipation) -> stretch (release) per move
    if (mv) {
        const M = MOVES[mv.id], dh = mv.t - M.hit, sw = Math.max(0, 1 - Math.abs(dh) / 0.045), lb = rig.b[STRETCH_LIMB[mv.id]] as THREE.Bone | undefined;
        if (lb && sw > 0) lb.scale.set(1 - 0.08 * sw, 1 + 0.28 * sw, 1 - 0.08 * sw);
        const [A, B] = SQUASH[mv.id] || [0, 0], hu = M.hit;
        const sy = mv.t < hu ? 1 - A * cstep(Math.min(1, mv.t / (hu * 0.7))) + (A + B) * cstep(Math.max(0, (mv.t - hu * 0.7) / (hu * 0.3))) : 1 + B * (1 - cstep(Math.min(1, dh / 0.22)));
        if (Math.abs(sy - 1) > 0.002) { const s0 = h.scale.x, sxz = 1 / Math.sqrt(sy); h.scale.set(s0 * sxz, s0 * sy, s0 * sxz); }
    }
    if (sl) slamBody(sim, rig, dt, w); else slamBodyReset(rig);   // slam root pitch + hips drop (src/heroMelee.ts)
    if (sl) {   // squash on the crouch / impact, stretch on the dive (volume kept: xz = 1/sqrt(y))
        const sy = sl.ph === 1 ? 0.85 : sl.ph === 0 ? 1 - 0.06 * sl.c : sl.ph === 4 ? 1.25 : sl.ph === 5 ? 0.82 + 0.18 * cstep(Math.min(1, sl.t / 0.25)) : 1;
        if (sy !== 1) { const s0 = h.scale.x, sxz = 1 / Math.sqrt(sy); h.scale.set(s0 * sxz, s0 * sy, s0 * sxz); }
    }
}
export const SNARE_PULSE_SEGMENTS = 2;
export const SNARE_RING_SEGMENTS = 16;
export const SHADOW_SNARE_COLOR = '#a855f7';
export function writeSnarePulse(a: THREE.BufferAttribute, start: number, hx: number, hy: number, hz: number, tx: number, ty: number, tz: number, progress: number, seed: number) {
    const p = Math.max(0, Math.min(1, progress)), span = 0.11, t0 = Math.max(0, p - span), t1 = Math.min(1, p + span), tm = (t0 + t1) * 0.5;
    const dx = tx - hx, dy = ty - hy, dz = tz - hz, side = Math.hypot(dx, dz) || 1, jitter = Math.sin(seed + p * 18) * 0.18;
    const ox = -dz / side * jitter, oz = dx / side * jitter;
    const x0 = hx + dx * t0, y0 = hy + dy * t0, z0 = hz + dz * t0;
    const xm = hx + dx * tm + ox, ym = hy + dy * tm + Math.cos(seed + p * 14) * 0.12, zm = hz + dz * tm + oz;
    const x1 = hx + dx * t1, y1 = hy + dy * t1, z1 = hz + dz * t1;
    a.setXYZ(start * 2, x0, y0, z0); a.setXYZ(start * 2 + 1, xm, ym, zm);
    a.setXYZ((start + 1) * 2, xm, ym, zm); a.setXYZ((start + 1) * 2 + 1, x1, y1, z1);
    return start + SNARE_PULSE_SEGMENTS;
}
export function writeSnareRing(a: THREE.BufferAttribute, start: number, x: number, y: number, z: number, radius: number) {
    for (let i = 0; i < SNARE_RING_SEGMENTS; i++) { const a0 = i / SNARE_RING_SEGMENTS * Math.PI * 2, a1 = (i + 1) / SNARE_RING_SEGMENTS * Math.PI * 2, o = (start + i) * 2; a.setXYZ(o, x + Math.cos(a0) * radius, y, z + Math.sin(a0) * radius); a.setXYZ(o + 1, x + Math.cos(a1) * radius, y, z + Math.sin(a1) * radius); }
    return start + SNARE_RING_SEGMENTS;
}
export function SnareLines({ sim }: { sim: Sim }) {
    const ref = useRef<THREE.LineSegments>(null!), shockRef = useRef<THREE.LineSegments>(null!);
    const lineMat = useRef<THREE.LineBasicMaterial>(null!), shockMat = useRef<THREE.LineBasicMaterial>(null!);
    const geo = useMemo(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SNARE.MAX_TARGETS * 2 + 2) * 2 * 3), 3)); return g; }, []);
    const shockGeo = useMemo(() => { const cap = SNARE.MAX_TARGETS * 2 * SNARE_PULSE_SEGMENTS + SNARE.MAX_TARGETS * SNARE_RING_SEGMENTS, g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cap * 2 * 3), 3)); return g; }, []);
    useFrame(() => {
        const sa = sim as any, a = geo.attributes.position as THREE.BufferAttribute, sh = shockGeo.attributes.position as THREE.BufferAttribute;
        const sn = sa.snareT || 0, hw = sa.handW as number[][] | undefined, targets = (sa.snareList || []) as Sim['enemies']; let n = 0, pn = 0, rn = 0, shockProgress = 0;
        for (let i = 0; i < Math.min(SNARE.MAX_TARGETS, targets.length); i++) {
            const e = targets[i]; if (e.down > 0) continue; const ty = e.y + ((e as any).ly || 0) + enemyBodyOffset(e);
            for (let sd = 0; sd < 2; sd++) {
                const hp = hw ? hw[sd] : [sim.pos[0], sim.pos[1] + 1.5, sim.pos[2]], o = n * 2; a.setXYZ(o, hp[0], hp[1], hp[2]); a.setXYZ(o + 1, e.x, ty, e.z); n++;
                if (sn > SNARE.IMPACT && sn <= SNARE.SHOCK_START) { const p = 1 - (sn - SNARE.IMPACT) / (SNARE.SHOCK_START - SNARE.IMPACT); shockProgress = p; pn = writeSnarePulse(sh, pn, hp[0], hp[1], hp[2], e.x, ty, e.z, p, i * 3.1 + sd * 1.7); }
            }
            /* Nov 2: no solid rings (Shifat) - the expanding Shock impact ring per bot is gone; spark burst + arcs + glow come from combatFx */
        }
        // web-pull / yank strand: drawn by CombatFX as a thick comic ink line (the 1 px GL line here was invisible)
        geo.setDrawRange(0, n * 2); a.needsUpdate = true; ref.current.visible = n > 0;
        shockGeo.setDrawRange(0, (pn + rn) * 2); sh.needsUpdate = true; shockRef.current.visible = false;   // Nov 2: crisp 1 px GL pulse lines off (no hard edges); CombatFX draws soft glowing tethers
        if (lineMat.current) { lineMat.current.color.set(sn > 0 ? SHADOW_SNARE_COLOR : '#ffffff'); lineMat.current.opacity = sn > 0 ? 0.98 : 0.86; }
        if (shockMat.current) shockMat.current.color.set(sn > 0 ? SHADOW_SNARE_COLOR : '#ffffff');
        if (DBG) (window as any).__shadowSnareFx = { webLines: n, pulseSegments: pn, ringSegments: rn, pulseProgress: shockProgress, snareColor: sn > 0 ? SHADOW_SNARE_COLOR : null, strandColor: lineMat.current?.color.getHexString(), shockColor: shockMat.current?.color.getHexString() };
    });
    return <>
        <lineSegments ref={ref} geometry={geo} frustumCulled={false}><lineBasicMaterial ref={lineMat} color="#ffffff" transparent opacity={0.86} depthTest={false} depthWrite={false} /></lineSegments>
        <lineSegments ref={shockRef} geometry={shockGeo} frustumCulled={false}><lineBasicMaterial ref={shockMat} color="#ffffff" transparent opacity={0.98} depthTest={false} depthWrite={false} /></lineSegments>
    </>;
}
const Y = new THREE.Vector3(0, 1, 0);

const _hp = new THREE.Vector3(), _fp = new THREE.Vector3(), _wd2 = new THREE.Vector3();

const _aq = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3(), _d1 = new THREE.Vector3();
// two-hand aim: point a bone's segment (bone -> child) at a world target (rotation in world space, applied to the local quaternion)
function aimBone(bone: THREE.Bone, child: THREE.Object3D, target: THREE.Vector3, w: number) {
    bone.getWorldPosition(_p1); child.getWorldPosition(_p2); _p2.sub(_p1).normalize(); _d1.copy(target).sub(_p1).normalize();
    _aq.setFromUnitVectors(_p2, _d1); if (w < 1) _aq.slerp(_id, 1 - w); _aq.invert().invert();
    bone.parent!.getWorldQuaternion(_pq); bone.quaternion.premultiply(_pq.clone().invert().multiply(_aq).multiply(_pq));
}
const _id = new THREE.Quaternion(), _tg = new THREE.Vector3();
export type HeroClipState = { key: string; t: number; w: number };
export function createHeroClipState(): HeroClipState { return { key: '', t: 0, w: 0 }; }
export type HeroRootPoseState = { lean: number; glideBlend: number; bank: number; yaw: number; swimWave: number };
export type HeroAnimationFrame = { clipState: HeroClipState; poseState?: CombatPoseState; sourceClipState?: HeroClipState; poseDt?: number; glideBlend: number; publishState?: boolean };
export function applyHeroRootPose(sim: any, rig: any, dt: number, state: any, position: ArrayLike<number>, scale: number, sourcePose?: HeroRootPoseState, publishState = true) {
    const root = rig.root as THREE.Group, poseRoot = rig.poseRoot as THREE.Group, sa = sim as any;
    root.position.set(position[0], position[1] - 1, position[2]);
    root.scale.setScalar(scale);
    if (sim.land > 0.02 && !sim.swim) { const sy = 1 - 0.16 * sim.land, sxz = 1 / Math.sqrt(sy); root.scale.set(scale * sxz, scale * sy, scale * sxz); }   // landing squash (volume kept), decays with sim.land
    if (sim.wall) { root.position.x += Math.sin(sim.ang) * 0.2; root.position.z += Math.cos(sim.ang) * 0.2; }
    if (sourcePose) state.swW = sourcePose.swimWave;
    if (sim.swim) {
        if (!sourcePose) { const baseY = waterRenderY(position[0], position[2], sim.t) - waveAtWater(position[0], position[2], sim.t), kw = Math.max(0, Math.min(1, (position[1] - baseY + 2) / 2.3)), wv = waveAtWater(position[0], position[2], sim.t) * kw; state.swW = state.swW === undefined ? wv : state.swW + (wv - state.swW) * Math.min(1, dt * 10); }
        root.position.y = position[1] - 1.7 + (state.swW || 0); root.position.x -= Math.sin(sim.ang) * (sim.dive ? 0.6 : 1.3); root.position.z -= Math.cos(sim.ang) * (sim.dive ? 0.6 : 1.3);
    }
    const oldBlend = state.gB || 0;
    state.gB = sourcePose?.glideBlend ?? oldBlend + ((sim.glideOn ? 1 : 0) - oldBlend) * Math.min(1, dt * 3.5);
    const lean = sourcePose?.lean ?? ((sim.swim ? (sim.dive ? 1.9 : 1.45) : sim.wall ? 0.32 : sim.web ? 0.5 : sim.ground ? 0.12 : 0.3) * (1 - state.gB * 0.8) + state.gB * 1.12);
    root.rotation.set(0, sim.ang, 0);
    poseRoot.rotation.set(lean, 0, 0); poseRoot.rotation.order = 'ZXY';
    let bank = sourcePose?.bank;
    if (bank === undefined) {
        const yr = state.bYaw === undefined ? 0 : ((sim.yaw - state.bYaw + Math.PI * 3) % (Math.PI * 2) - Math.PI) / Math.max(dt, 1e-3);
        state.bYaw = sim.yaw; state.bR = (state.bR || 0) + (Math.max(-0.5, Math.min(0.5, -yr * 0.9)) * state.gB - (state.bR || 0)) * Math.min(1, dt * 4); bank = state.bR;
    } else { state.bYaw = sourcePose!.yaw; state.bR = bank; }
    poseRoot.rotation.z = bank;
    if (state.gB > 0.01) { const lc = 0.9 * state.gB; root.position.x -= Math.sin(sim.ang) * Math.sin(lean) * lc; root.position.z -= Math.cos(sim.ang) * Math.sin(lean) * lc; root.position.y += (1 - Math.cos(lean)) * lc * 0.6; }
    traversalRoot(sim, rig, dt, scale);   // swing pendulum body (heroTraversal.ts)
    root.position.y -= sim.land * 0.5;
    poseRoot.rotation.x += sim.land * 0.5 + (sim.dodgeT > 0 && !sa.flip ? 0.6 : 0);
    const rootPose = { lean, glideBlend: state.gB, bank, yaw: sim.yaw, swimWave: state.swW || 0 };
    if (publishState) sa.__heroRootPoseState = rootPose;
    return rootPose;
}
export function animateHeroBones(sim: any, rig: any, dt: number, frame: HeroAnimationFrame) {
    const { clipState, poseState, sourceClipState, poseDt = dt, glideBlend, publishState = true } = frame;
    const h = rig.root, poseRoot = rig.poseRoot as THREE.Group, sa = sim as any, v = sim.vel;
    rig.bones.forEach((b: THREE.Bone) => b.rotation.set(0, 0, 0));
    const speed = Math.hypot(v[0], v[1], v[2]), hs = Math.hypot(v[0], v[2]);
    const legR = rig.b.thighR as THREE.Bone, legL = rig.b.thighL as THREE.Bone;
    const armR = rig.b.uarmR as THREE.Bone, armL = rig.b.uarmL as THREE.Bone;
    const sw = sim.ground ? Math.sin(sim.runPhase * 3) * 0.9 * Math.min(1, hs / 6) : 0.25;
    legR.rotation.x = sw; legL.rotation.x = -sw; armL.rotation.x = -sw * 0.8;
    if (sim.swim) { const cs = Math.sin(sim.runPhase * 2.4); legR.rotation.x = cs * 0.5; legL.rotation.x = -cs * 0.5; armL.rotation.x = -2.6 + cs * 1.2; }
    if (sim.wall) { const moving = Math.min(1, speed / 7), cw = Math.sin(sim.runPhase * 2.5) * moving; legR.rotation.x = -0.3 + cw * 1.05; legL.rotation.x = -0.3 - cw * 1.05; armL.rotation.x = -1.35 - cw * 0.8; }
    armR.rotation.x = sim.swim ? -2.6 - Math.sin(sim.runPhase * 2.4) * 1.2 : sim.wall ? -1.35 + Math.sin(sim.runPhase * 2.5) * 0.8 * Math.min(1, speed / 7) : sim.web ? (sim.swings % 2 === 1 ? -2.7 : -0.5) : sim.atkT > 0 ? -1.5 - Math.sin((0.32 - sim.atkT) * 10) * 0.6 : sw * 0.8;
    if (sim.web && !sim.swim && !sim.wall) armL.rotation.x = sim.swings % 2 === 0 ? -2.7 : -0.5;
    if (sa.kick && sim.atkT > 0 && sim.shotT <= 0) { const kp = Math.sin((1 - sim.atkT / 0.32) * Math.PI); legR.rotation.x = -1.7 * kp; legL.rotation.x = 0.15; armR.rotation.x = -0.8; armL.rotation.x = -1.2; }
    if (sim.glideOn && !(sa.snareT > 0)) { armR.rotation.x = -0.1; armL.rotation.x = -0.1; armR.rotation.z = 1.3; armL.rotation.z = -1.3; const gt = Math.sin(sim.t * 5) * 0.05; legR.rotation.x = 0.12 + gt; legL.rotation.x = 0.06 - gt; }
    const sn = sa.snareT || 0;
    if (sn > 0) {
        if (sn > SNARE.GATHER_END) { armR.rotation.x = -1.35; armL.rotation.x = -1.35; legR.rotation.x = -0.2; legL.rotation.x = 0.1; }
        else { const charge = sn <= SNARE.SHOCK_START ? Math.sin((SNARE.SHOCK_START - sn) * 18) * 0.035 : 0; armR.rotation.x = -1.22 - charge; armL.rotation.x = -1.22 - charge; armR.rotation.z = -0.2; armL.rotation.z = 0.2; legR.rotation.x = -0.2; legL.rotation.x = 0.1; }
    }
    { const tR = legR.rotation.x, tL = legL.rotation.x, tuck = sim.ground || sim.glideOn || sim.wall ? 0 : 0.35; rig.b.shinR.rotation.x = Math.max(0, tR) * 0.9 + 0.08 + tuck; rig.b.shinL.rotation.x = Math.max(0, tL) * 0.9 + 0.08 + tuck; rig.b.farmR.rotation.x = sn > 0 ? -0.9 : -0.35 + Math.min(0, armR.rotation.x + 1.2) * 0.2; rig.b.farmL.rotation.x = sn > 0 ? -0.9 : -0.35 + Math.min(0, armL.rotation.x + 1.2) * 0.2; rig.b.spine.rotation.x = Math.sin(sim.runPhase * 3) * 0.04 * (sim.ground ? 1 : 0); }
    const ck = (sa.mv || sa.flip || sn > 0 || (sim.glideOn && glideBlend > 0.3)) ? '' : sim.swim ? 'swim' : sim.wall ? 'wall' : sim.atkT > 0 && sim.shotT <= 0 ? (sa.kick ? '' : 'punch') : (!sim.ground && !sim.web) ? 'jump' : (sim.ground && hs < 0.6 && !sim.dive) ? 'idle' : (sim.ground && !sim.web) ? 'run' : '';
    const cs = clipState;
    if (sourceClipState) { cs.key = sourceClipState.key; cs.t = sourceClipState.t; cs.w = sourceClipState.w; }
    else {
        if (ck !== cs.key) cs.key = ck || cs.key;
        cs.w += ((ck ? 1 : 0) - cs.w) * Math.min(1, dt * 10);
        if (ck) {
            const c = CLIPS[ck];
            if (ck === 'wall') cs.t += dt * Math.min(1.6, speed / 3);
            else if (ck === 'swim') cs.t += dt * (0.6 + Math.min(1.2, speed / 8));
            else if (ck === 'punch') cs.t = 0.10 + (0.32 - sim.atkT) * 2.0;
            else if (ck === 'jump') cs.t = (c.n / c.fps) * 0.5;
            else if (ck === 'run') cs.t += dt * Math.max(0.5, Math.min(2, hs / 5.5));
            else cs.t += dt;
        }
    }
    if (cs.key === 'swim' || cs.key === 'wall') poseRoot.rotation.x *= 1 - cs.w * 0.9; else if (cs.key === 'run') poseRoot.rotation.x *= 1 - cs.w * 0.7;
    rig.b.head.rotation.x = -poseRoot.rotation.x * 0.5;
    if (cs.w > 0.02 && (cs.key === 'run' || cs.key === 'idle') && CLIPS[cs.key].hy) { const c = CLIPS[cs.key], fi = Math.floor(((cs.t * c.fps) % c.n + c.n) % c.n); rig.b.hips.position.y = rig.hipsY + (c.hy[fi] - 1) * (cs.key === 'idle' ? 0.3 : 0.6) * cs.w; } else rig.b.hips.position.y = rig.hipsY;
    if (cs.w > 0.02 && CLIPS[cs.key]) sampleClip(CLIPS[cs.key], cs.t, cs.key === 'wall' || cs.key === 'swim' || cs.key === 'idle' || cs.key === 'run', rig.bones, cs.w);
    if (sim.shotT > 0 || sim.spring > 0) { const tg = sim.shotT > 0 ? sim.shotTgt : sim.anchor, wt = Math.min(1, (sim.shotT > 0 ? sim.shotT : sim.spring) / 0.12); rig.root.updateWorldMatrix(true, true); _tg.set(tg[0], tg[1], tg[2]); for (const side of ['L', 'R']) { aimBone(rig.b['uarm' + side], rig.b['farm' + side], _tg, wt); rig.root.updateWorldMatrix(true, true); aimBone(rig.b['farm' + side], rig.b['hand' + side], _tg, wt); rig.root.updateWorldMatrix(true, true); } }
    traversalBones(sim, rig, dt);
    const activePoseState = poseState ?? _cp;
    combatPose(sim, rig, h, poseDt, activePoseState);
    shotRecoilBones(sim, rig, dt);   // web-shot recoil on top of the aim (src/heroRecoil.ts)
    if (!sourceClipState) heroHurtBones(sim, rig, dt);   // hurt flinch on top of every pose (src/heroHurt.ts); not on Ghost's mirrored frames
    if (publishState && !sourceClipState) {
        sa.__heroClipState = { key: cs.key, t: cs.t, w: cs.w };
        const sharedPose = sa.__heroPoseState ?? (sa.__heroPoseState = { w: 0, c: new Float32Array(activePoseState.c.length), t: new Float32Array(activePoseState.t.length) });
        sharedPose.w = activePoseState.w; sharedPose.c.set(activePoseState.c); sharedPose.t.set(activePoseState.t);
    }
    for (const side of ['L', 'R']) { const hf = rig.b['hipFix' + side] as THREE.Bone | undefined, th = rig.b['thigh' + side] as THREE.Bone | undefined; if (hf && th) { hf.quaternion.identity().slerp(th.quaternion, 0.5); hf.scale.setScalar(1 + 0.14 * (rig._supW?.[side] ?? 0)); } } if (rig._supW) rig._supW.L = rig._supW.R = 0;   // + the support side's volume keeper: up to 14% fuller hip band while that leg carries the kick's tipped pelvis (supportLegIK), so the big hip angle does not pinch the upper thigh   // hip corrective follows its thigh at half the angle (buildRig)
    const zip = sim.web && sim.webT < 1.6 && sim.anchor[1] - sim.pos[1] > 25 && Math.hypot(sim.anchor[0] - sim.pos[0], sim.anchor[1] - sim.pos[1], sim.anchor[2] - sim.pos[2]) < sim.rope - 0.5;
    const action = sn > 0 ? 'shadow-snare' : sa.mv ? `move-${sa.mv.id}` : sa.flip ? 'dodge-flip' : sim.shotT > 0 ? 'plasma-web-shot' : sim.spring > 0 ? 'web-spring-launch' : sim.web ? (zip ? 'street-zip-up' : 'web-swing') : sim.swim ? (sim.dive ? 'dive' : 'swim') : sim.wall ? 'wall-crawl' : sim.wallT > 0 ? 'wall-jump' : sim.glideOn ? (sa.flightBoost ? 'powered-flight' : 'glide') : !sim.ground ? (sa.glideBlocked || sa.flightTapCancel ? 'glide-cancel' : sa.leapT > 0 ? 'shore-exit-leap' : 'airborne') : sim.vaulted > 0 && sim.land > 0 ? 'rooftop-vault' : hs > 0.6 ? 'run' : 'idle';
    const snarePhase = sn <= 0 ? 'inactive' : sn > SNARE.GATHER_END ? 'gather' : sn > SNARE.SHOCK_START ? 'grip' : sn > SNARE.IMPACT ? 'shockwave' : 'discharge';
    return { key: ck || '', clipKey: cs.key, t: cs.t, weight: cs.w, frame: cs.key && CLIPS[cs.key] ? (cs.t * CLIPS[cs.key].fps) % CLIPS[cs.key].n : 0, poseWeight: activePoseState.w, action, moveId: sa.mv?.id ?? null, moveT: sa.mv?.t ?? 0, flip: sa.flip ? { t: sa.flip.t, dur: sa.flip.dur, ax: sa.flip.ax, dir: sa.flip.dir } : null, snareT: sn, snarePhase, gripHands: sn > 0 ? 2 : 0, snareTargets: (sa.snareList || []).length, shotT: sim.shotT, spring: sim.spring, aimedHands: sim.shotT > 0 || sim.spring > 0 ? 2 : 0, aimTarget: sim.shotT > 0 ? [...sim.shotTgt] : sim.spring > 0 ? [...sim.anchor] : null, web: sim.web, wall: !!sim.wall, swim: sim.swim, dive: sim.dive, glideOn: sim.glideOn };
}
export interface SceneProps { sim: Sim; ev: Events; coarse: boolean; fx: { fov: number; shake: number }; perf: { scale: number; fps: number; speed: number } }



const _wv = new THREE.Vector3(), _wv2 = new THREE.Vector3();
export function buildRig(data: any = heroData, materialOverride?: THREE.MeshLambertMaterial) {
    const d: any = data;
    if (!d._capeRig && !(DBG && (window as any).__noCapeRig)) {   // user-approved (9:53) hidden cape rig: 3 extra bones + re-weighted cape vertices only. Rest pose is unchanged (new bones sit at identity under chest), mesh/UV/texture untouched.
        d._capeRig = true;
        const base = d.bones.length; d.bones.push({ n: 'cape1', p: 2, h: [0, 1.58, -0.13] }, { n: 'cape2', p: base, h: [0, 1.4, -0.15] }, { n: 'cape3', p: base + 1, h: [0, 1.27, -0.17] });
        const ids = [2, base, base + 1, base + 2], P = d.pos; let cnt = 0;
        for (let i = 0; i < P.length / 3; i++) {
            const y = P[i * 3 + 1], z = P[i * 3 + 2]; if (!(z < -0.12 && y > 1.15 && y < 1.7)) continue;
            const u = Math.max(0, Math.min(2.999, (1.58 - y) / 0.38 * 3)), k = Math.floor(u), f = u - k;
            d.si[i * 4] = ids[k]; d.si[i * 4 + 1] = ids[k + 1]; d.si[i * 4 + 2] = 0; d.si[i * 4 + 3] = 0;
            d.sw[i * 4] = 1 - f; d.sw[i * 4 + 1] = f; d.sw[i * 4 + 2] = 0; d.sw[i * 4 + 3] = 0; cnt++;
        }
        if (DBG) (window as any).__capeVerts = cnt;
    }
    const legH: Record<number, number[]> = {};
    {   // knee / ankle pivots onto the leg mesh (Shifat Nov 2 4:40 PM on the kick's support leg: "Its rig bones problem"). The leg mesh stands in a slight A-stance (knee centre ~0.20 out from the midline, ankle ~0.245) but the knee and ankle bones sat in a vertical line under the hip (0.14 / 0.13 out): the knee hinged about a point on the INNER surface of the knee and the ankle 11 cm inside the foot, so any knee bend or leg twist swung the shin around the wrong axis (the support leg's backward kink). Each joint is moved to the middle of its own mesh cross-section (measured here from the vertices, so Ghost's own body gets her own pivots; only the skeleton built here moves, the shared mesh data is not touched, so Ghost's body shaping reads the same bone lines as before); the hip pivot is unchanged. Rest pose unchanged (bind matrices follow the bones); rotations keep their meaning
        const P = d.pos, bi = (n: string) => d.bones.findIndex((b: any) => b.n === n);
        const mid = (y0: number, sgn: number, ids: number[], win: number) => {   // middle of the leg's cross-section at height y0 (vertices skinned mostly to these bones, on this side)
            let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, n = 0;
            for (let i = 0; i < P.length / 3; i++) {
                const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]; if (Math.abs(y - y0) > win || Math.sign(x || 1) !== sgn || Math.abs(x) > 0.42) continue;
                let w = 0; for (let j = 0; j < 4; j++) if (ids.includes(d.si[i * 4 + j])) w += d.sw[i * 4 + j]; if (w < 0.3) continue;
                x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); n++;
            }
            return n >= 6 ? [(x0 + x1) / 2, (z0 + z1) / 2] : null;
        };
        for (const side of ['L', 'R']) {
            const ti = bi('thigh' + side), si = bi('shin' + side), fi = bi('foot' + side); if (ti < 0 || si < 0 || fi < 0) continue;
            const sgn = Math.sign(d.bones[ti].h[0] || (side === 'L' ? -1 : 1)), K = d.bones[si].h, A = d.bones[fi].h;
            const k = mid(K[1], sgn, [ti, si], 0.03), a = mid(A[1] + 0.05, sgn, [si, fi], 0.03);   // the ankle is read just above the foot so the toes do not pull it forward
            if (k && Math.abs(k[0] - K[0]) < 0.12 && Math.abs(k[1] - K[2]) < 0.08) legH[si] = [k[0], K[1], k[1]];
            if (a && Math.abs(a[0] - A[0]) < 0.16 && Math.abs(a[1] - A[2]) < 0.08) legH[fi] = [a[0], A[1], a[1]];
        }
        if (DBG) ((window as any).__legPivots || ((window as any).__legPivots = [])).push(Object.values(legH).map((h) => h.map((v) => +v.toFixed(3))));
    }
    if (!d._hipRig) {   // hip corrective (combat feel pass, Shifat Nov 2 4:05 PM 'Edit bone if needed'): a half-angle helper bone at each hip joint (child of hips, identity at rest, so the rest pose is unchanged); the upper-thigh / groin skin is shared between the thigh and its helper, so a big hip angle (the kick's tipped pelvis over a vertical support leg) bends through a rounded band instead of creasing at the joint
        d._hipRig = true;
        const hi = d.bones.findIndex((b: any) => b.n === 'hips'), P = d.pos;
        for (const side of ['L', 'R']) {
            const ti = d.bones.findIndex((b: any) => b.n === 'thigh' + side); if (ti < 0 || hi < 0) continue;
            const J = d.bones[ti].h, ni = d.bones.length; d.bones.push({ n: 'hipFix' + side, p: hi, h: [J[0], J[1], J[2]] });
            for (let i = 0; i < P.length / 3; i++) {
                const x = P[i * 3], y = P[i * 3 + 1]; if (Math.abs(x) > 0.27 || y < J[1] - 0.26 || y > J[1] + 0.08 || Math.sign(x || 1) !== Math.sign(J[0])) continue;   // the hip / upper thigh band on this side (hands hang wider than 0.27)
                let k = -1; for (let j = 0; j < 4; j++) if (d.si[i * 4 + j] === ti && d.sw[i * 4 + j] > 0) k = j;
                let f = 0.5 * Math.max(0, Math.min(1, (y - (J[1] - 0.26)) / 0.2));
                if (k < 0 && y >= J[1] && Math.abs(x) > 0.04) { for (let j = 0; j < 4; j++) if (d.si[i * 4 + j] === hi && d.sw[i * 4 + j] > 0) k = j; f = 0.35 * Math.max(0, 1 - (y - J[1]) / 0.08); }   // the hip / buttock skin just above the joint follows a little too, so a big hip angle has no notch at the joint
                if (k < 0 || f <= 0) continue;
                let e = -1; for (let j = 0; j < 4; j++) if (d.sw[i * 4 + j] <= 0) { e = j; break; }
                if (e < 0) { e = 0; for (let j = 1; j < 4; j++) if (j !== k && (e === k || d.sw[i * 4 + j] < d.sw[i * 4 + e])) e = j; if (e === k) continue; const lost = d.sw[i * 4 + e]; d.sw[i * 4 + e] = 0; d.sw[i * 4 + k] += lost; }   // full slot table: fold the smallest weight into the thigh first
                const wt = d.sw[i * 4 + k]; d.sw[i * 4 + k] = wt * (1 - f); d.si[i * 4 + e] = ni; d.sw[i * 4 + e] = wt * f;
            }
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(d.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(d.col, 3));
    if (d.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(d.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(d.sw, 4));
    g.setIndex(d.idx);
    if (d.rebuildNormals) g.computeVertexNormals();
    const bones: THREE.Bone[] = [], byName: Record<string, THREE.Bone> = {};
    d.bones.forEach((b: any, i: number) => {
        const bone = new THREE.Bone(); bone.name = b.n; bones.push(bone); byName[b.n] = bone;
        const h = legH[i] || b.h, par = b.p >= 0 ? legH[b.p] || d.bones[b.p].h : [0, 0, 0];
        bone.position.set(h[0] - par[0], h[1] - par[1], h[2] - par[2]);
        if (b.p >= 0) bones[b.p].add(bone);
    });
    let mat: THREE.MeshLambertMaterial;
    if (materialOverride) mat = materialOverride;
    else if (d.uv) {
        const tex = trimTexture(baseTexUrl, SHADOW_TRIM, () => mat);   // hero-only path (bots/boss build their own); gold trim repainted Shadow purple (Shifat Nov 2)
        mat = new THREE.MeshLambertMaterial({ map: tex, emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: 0.45 });
    } else mat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color('#1a2a66'), emissiveIntensity: 0.18 });
    // procedural suit weave in the fragment shader (object-space lattice, screen-AA'd), so fine detail doesn't depend on vertex density
    if (!d.uv) mat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;').replace('#include <color_fragment>', `#include <color_fragment>
        if (vColor.r < 0.2 && vColor.b > 0.4) {
            float ang = atan(vObj.x, vObj.z) * 4.2;
            vec2 q = vec2(ang, vObj.y * 16.0);
            vec2 w = fwidth(q) * 1.5;
            float lx = smoothstep(0.455 - w.x, 0.455, abs(fract(q.x) - 0.5));
            float ly = smoothstep(0.455 - w.y, 0.455, abs(fract(q.y) - 0.5));
            float line = max(lx, ly);
            diffuseColor.rgb *= 1.0 - 0.38 * line * clamp(1.0 - 2.0 * (w.x + w.y), 0.0, 1.0);
            diffuseColor.rgb *= 1.0 + 0.08 * sin(vObj.y * 90.0 + vObj.x * 40.0);
        }`);
    };
    const mesh = new THREE.SkinnedMesh(g, mat); mesh.frustumCulled = false;
    const root = new THREE.Group(), poseRoot = new THREE.Group(); root.add(poseRoot); poseRoot.add(mesh); mesh.add(bones[0]);
    root.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));
    // cel-style ink outline: inverted hull sharing the geometry and skeleton, pushed out along the skinned normal (ref: Wind Waker character edge ink)
    { const om = new THREE.MeshBasicMaterial({ color: '#0a0d1a', side: THREE.BackSide }); om.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', 'transformed += normalize(objectNormal) * 0.014;\n#include <project_vertex>'); }; const ol = new THREE.SkinnedMesh(g, om); ol.frustumCulled = false; ol.bind(mesh.skeleton, mesh.bindMatrix); poseRoot.add(ol); }
    // candidate extreme vertices (chosen per dominant bone in many bone-local directions), kept with their full skin blend so wall contact uses real skinned positions
    const hull: { p: THREE.Vector3; bi: number[]; bw: number[]; foot?: boolean }[] = [];
    {
        const inv = mesh.skeleton.boneInverses, pa = g.attributes.position, si = d.si, sw = d.sw, v = new THREE.Vector3();
        const dirs: THREE.Vector3[] = []; for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) if (x || y || z) dirs.push(new THREE.Vector3(x, y, z).normalize());
        const best = bones.map(() => dirs.map(() => ({ s: -1e9, i: -1 })));
        for (let i = 0; i < pa.count; i++) {
            let bi = si[i * 4], bw = sw[i * 4]; for (let j = 1; j < 4; j++) if (sw[i * 4 + j] > bw) { bw = sw[i * 4 + j]; bi = si[i * 4 + j]; }
            v.set(pa.getX(i), pa.getY(i), pa.getZ(i)).applyMatrix4(inv[bi]);
            dirs.forEach((dr, k2) => { const sc = v.dot(dr); if (sc > best[bi][k2].s) { best[bi][k2].s = sc; best[bi][k2].i = i; } });
        }
        const seen = new Set<number>();
        // exact coverage for the limbs that touch the wall: every vertex dominated by a hand or foot bone
        for (let i = 0; i < pa.count; i++) {
            let bi = si[i * 4], bw = sw[i * 4]; for (let j = 1; j < 4; j++) if (sw[i * 4 + j] > bw) { bw = sw[i * 4 + j]; bi = si[i * 4 + j]; }
            if (/^(hand|foot)/.test(bones[bi].name)) { seen.add(i); hull.push({ p: new THREE.Vector3(pa.getX(i), pa.getY(i), pa.getZ(i)), bi: [0, 1, 2, 3].map((k) => si[i * 4 + k]), bw: [0, 1, 2, 3].map((k) => sw[i * 4 + k]), foot: /^foot/.test(bones[bi].name) }); }
        }
        best.forEach((arr) => arr.forEach((e) => { if (e.i >= 0 && !seen.has(e.i)) { seen.add(e.i); hull.push({ p: new THREE.Vector3(pa.getX(e.i), pa.getY(e.i), pa.getZ(e.i)), bi: [0, 1, 2, 3].map((k) => si[e.i * 4 + k]), bw: [0, 1, 2, 3].map((k) => sw[e.i * 4 + k]) }); } }));
    }
    const skel = mesh.skeleton;
    return { root, poseRoot, b: byName, bones, hull, skel, hipsY: byName.hips.position.y };
}


// Mixamo-derived clips, retargeted offline (tools/fbx2clip.mjs) onto the generated rig
export type Clip = { fps: number; n: number; bones: string[]; q: number[]; hy: number[] };
export const CLIPS: Record<string, Clip> = { idle: clipIdle as any, jump: clipJump as any, wall: clipWall as any, punch: clipPunch as any, swim: clipSwim as any, run: clipRun as any };
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
export function sampleClip(c: Clip, t: number, loop: boolean, bones: THREE.Bone[], w: number) {
    let f = t * c.fps; if (loop) f = ((f % c.n) + c.n) % c.n; else f = Math.max(0, Math.min(c.n - 1, f));
    const i0 = Math.floor(f), i1 = loop ? (i0 + 1) % c.n : Math.min(c.n - 1, i0 + 1), k = f - i0, nb = c.bones.length;
    for (let b = 0; b < nb; b++) {
        _qa.fromArray(c.q, (i0 * nb + b) * 4); _qb.fromArray(c.q, (i1 * nb + b) * 4); _qa.slerp(_qb, k);
        bones[b].quaternion.slerp(_qa, w);
    }
}



// Water: sum-of-sines height field, fresnel sky mix, sun glitter, crest foam, distance haze (informed by public ocean-shader write-ups, see docs/REFERENCES.md)

const _camNear: typeof buildings = [];
const OCEAN_GEO = oceanGeo(), SEABED_GEO = seabedGeo();


/* Shifat 3:33 AM: '6-7 fps over sea, 8-9 on land' -> on-device bisect. Only with ?debug in the URL (no effect otherwise):
   HUD gets draw calls, triangles and the CPU (JavaScript) ms per frame; ?debug&res=0.3 pins the world resolution, ?debug&nosea hides the sea,
   ?debug&noout turns the ink outline pass off - so a phone can tell GPU fill vs CPU vs a single pass. */
const DQ = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
const DQ_HIDE = (DQ.has('debug') && DQ.get('hide')) ? DQ.get('hide')!.split(',') : [];
const DQ_ON = DQ.has('debug'), DQ_BENCH = DQ_ON && DQ.has('bench'), DQ_RES = DQ_ON && DQ.get('res') ? Math.max(0.2, Math.min(2, +DQ.get('res')!)) : 0, DQ_NOSEA = DQ_ON && DQ.has('nosea');
if (DQ_ON && DQ.has('noout')) OUTLINE_STATE.on = false;

/* Shifat 11:22 PM: on-device bisect in ONE link. ?debug&bench: holds the view, switches one thing off at a time for 6 s each
   (3 s settle + 3 s measure, frame-time average), then shows a table: ms per frame and fps for each step, and the saving vs base. */
function Bench() {
    const scene = useThree((s) => s.scene);
    const st = useRef({ i: -1, t: 0, n: 0, acc: 0, last: 0, res: [] as [string, number][], hid: [] as THREE.Object3D[], el: null as HTMLDivElement | null }).current;
    const hideBy = (pred: (o: any) => boolean) => (on: boolean) => {
        if (!on) { for (const o of st.hid) o.visible = true; st.hid.length = 0; return; }
        scene.traverse((o: any) => { if ((o.isMesh || o.isPoints || o.isLine) && o.visible && pred(o)) { o.visible = false; st.hid.push(o); } });
    };
    const top = (o: any) => { let t = '', q = o; while (q) { if (q.name) t = q.name; q = q.parent; } return t; };
    const W = window as any;
    const steps = useMemo<[string, (on: boolean) => void][]>(() => [
        ['base', () => {}],
        ['no sea', hideBy((o) => o.material === waterMat)],
        ['sea flat (no wave math)', (on) => { waterMat.uniforms.uBench.value.x = on ? 1 : 0; }],
        ['sea plain colour', (on) => { waterMat.uniforms.uBench.value.y = on ? 1 : 0; }],
        ['no reflection probe', (on) => { W.__bench = { ...(W.__bench || {}), noProbe: on }; }],
        ['no ink outline', (on) => { OUTLINE_STATE.on = !on; }],
        ['no glow/bloom', (on) => { W.__bench = { ...(W.__bench || {}), noBloom: on }; }],
        ['no seabed', hideBy((o) => o.material === seabedMat)],
        ['no city', hideBy((o) => top(o).startsWith('polyfork-city') || top(o) === 'street-props' || top(o) === 'roof-props')],
        ['no islands', hideBy((o) => top(o) === 'south-sea')],
        ['no skinned (heroes/bots)', hideBy((o) => o.isSkinnedMesh)],
        ['no instanced (crowd/trees/props)', hideBy((o) => o.isInstancedMesh)],
        ['res x0.5', (on) => { W.__benchRes = on ? 0.5 : 0; }],
        ['base again', () => {}],
    ], []);
    useFrame(() => {
        if (!DQ_BENCH) return;
        const now = performance.now(), dt = st.last ? now - st.last : 16; st.last = now;
        if (st.i === -1) { if (now > 9000) { st.i = 0; st.t = now; } return; }   // let shaders compile + scene settle first
        if (st.i >= steps.length) return;
        if (st.t === now) steps[st.i][1](true);
        for (const o of st.hid) o.visible = false;   // components that re-show meshes every frame
        const el = now - st.t;
        if (el > 3000) { st.acc += dt; st.n++; }
        if (el > 6000) {
            const ms = st.acc / Math.max(1, st.n); st.res.push([steps[st.i][0], ms]); steps[st.i][1](false);
            st.i++; st.t = now + 0.001; st.acc = 0; st.n = 0;
            if (st.i < steps.length) { st.t = now; steps[st.i][1](true); }
            if (!st.el) { st.el = document.createElement('div'); st.el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999;background:rgba(0,0,0,.78);color:#fff;font:12px/1.35 monospace;padding:8px 10px;border-radius:8px;white-space:pre;pointer-events:none'; document.body.appendChild(st.el); }
            const b = st.res[0][1];
            st.el.textContent = 'BENCH ' + (st.i < steps.length ? '(' + st.i + '/' + steps.length + ' running: ' + steps[st.i][0] + ')' : 'DONE') + '\n' + st.res.map(([n, m]) => n.padEnd(34) + m.toFixed(1).padStart(6) + ' ms ' + (1000 / m).toFixed(1).padStart(5) + ' fps' + (n === 'base' ? '' : ((b - m) >= 0 ? '  -' : '  +') + Math.abs(b - m).toFixed(1) + ' ms')).join('\n');
        }
    }, -999);
    return null;
}

function DebugStats() {
    const gl = useThree((s) => s.gl), scene = useThree((s) => s.scene);
    const st = useRef({ t0: 0, end: 0, n: 0, cpu: 0, rs: 0, logic: 0, hid: [] as THREE.Object3D[] }).current;
    useEffect(() => {
        if (!DQ_ON) return;
        gl.info.autoReset = false;
        const orig = gl.render.bind(gl);
        (gl as any).render = (a: any, b: any) => { if (!st.rs) st.rs = performance.now(); orig(a, b); st.end = performance.now(); };   (window as any).__gl = gl;
        return () => { (gl as any).render = orig; gl.info.autoReset = true; };
    }, [gl]);
    useFrame(() => {
        if (!DQ_ON) return;
        const w = window as any;
        if (st.t0 && st.end > st.t0) { st.cpu += (st.end - st.t0 - st.cpu) * 0.1; if (st.rs > st.t0) st.logic += (st.rs - st.t0 - st.logic) * 0.1; }   /* logic = game/useFrame JS before the first render call; the rest of cpu = three.js render submission */
        w.__dbgStats = { calls: gl.info.render.calls, tris: gl.info.render.triangles, cpu: st.cpu, logic: st.logic, progs: gl.info.programs ? gl.info.programs.length : 0 }; st.rs = 0;
        gl.info.reset(); st.t0 = performance.now();
        for (const o of st.hid) o.visible = false;   // components that re-show their meshes every frame are hidden again each frame
        if ((DQ_NOSEA || DQ_HIDE.length) && (st.n++ % 60) === 0) { st.hid.length = 0; scene.traverse((o: any) => {
            if (!(o.isMesh || o.isPoints)) return;
            if (DQ_NOSEA && o.material === waterMat) { o.visible = false; st.hid.push(o); return; }
            let top = '', q = o; while (q) { if (q.name) top = q.name; q = q.parent; }
            const grp = o.material === waterMat ? 'ocean' : o.material === seabedMat ? 'seabed' : top.startsWith('polyfork-city') ? 'city' : top === 'street-props' || top === 'roof-props' ? 'props'
                : top === 'park-ground' ? 'park' : top === 'south-sea' ? 'island' : !top && o.material && o.material.type === 'MeshLambertMaterial' ? 'trees' : !top && o.material && o.material.type === 'ShaderMaterial' ? 'shader' : top;
            if (DQ_HIDE.includes(grp)) { o.visible = false; st.hid.push(o); }
        }); }
    }, -1000);
    return null;
}

/* Shifat 11:13 PM phone perf: the App HUD updates 10x a second (fps text, beacon distance); without memo every HUD tick re-rendered this whole
   3D tree through React (thousands of prop diffs on a slow phone CPU). Props here are stable refs, so the 3D tree now renders once. */
/* Shifat Nov 1 2:14 PM 'heroes ring ripple is harsh, study real images': a swimmer's ripples on real water are not thin white lines but broad, low-contrast
   swells - a soft bright crest catching the sky with a faint darker trough inside it, both feathered to nothing, widening and fading as they spread. */
function swimRingMat() {
    return new THREE.ShaderMaterial({
        uniforms: { opacity: { value: 0 } }, transparent: true, depthWrite: false,
        vertexShader: 'varying float vR; void main(){ vR = length(position.xy); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform float opacity; varying float vR; void main(){ float t = (vR - 0.55) / 0.9; float c0 = (t - 0.62) / 0.17, t0 = (t - 0.3) / 0.14; float crest = exp(-c0 * c0), trough = exp(-t0 * t0); float a = (crest * 0.55 + trough * 0.22) * opacity * smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.88, 1.0, t)); gl_FragColor = vec4(mix(vec3(0.05, 0.16, 0.24), vec3(0.93, 0.98, 1.0), crest / max(crest + trough, 1e-3)), a); }',
    });
}

export const Scene = React.memo(SceneImpl);
/* Shifat's phone (Adreno 506) froze each time a new area came into view: three builds a shader program the first time an object is drawn,
   and a big program costs that GPU hundreds of ms on the main thread. Every program is built up front instead - hidden objects are made
   visible for the compile call only (no frame is drawn in between) and restored at once. Nothing on screen changes. */
function ShaderWarmup() {
    const { gl, scene, camera } = useThree();
    useEffect(() => {
        const compileNow = (cam: THREE.Camera) => {
            const hidden: THREE.Object3D[] = [];
            scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
            try { void (gl as any).compileAsync(scene, cam).catch(() => {}); } catch { /* ignore */ } finally { for (const o of hidden) o.visible = false; }
        };
        /* the program key also carries the output target's colour space + tone mapping, which the passes set per render: compile from inside
           the next real render call, once for each distinct target state, so the keys match exactly what the frame will ask for */
        const run = () => {
            compileNow(camera);
            const r0 = gl.render, seen = new Set<string>(); let n = 0;
            gl.render = function (this: THREE.WebGLRenderer, s: THREE.Object3D, c: THREE.Camera) {
                const t = gl.getRenderTarget(), k = (t ? 'rt' + (t.texture.colorSpace || '') : 'canvas') + gl.toneMapping + gl.outputColorSpace;
                if (s === scene && !seen.has(k)) { seen.add(k); compileNow(c); }
                if (++n > 40) gl.render = r0;
                return r0.call(gl, s as any, c);
            } as any;
        };
        const ts = [1200].map((ms) => setTimeout(run, ms));   /* once, on the title screen; async (parallel compile) so the main thread is not held */
        return () => ts.forEach(clearTimeout);
    }, [gl, scene, camera]);
    return null;
}

const _camTgt = new THREE.Vector3();   /* per-frame scratch (no garbage each frame) */
function SceneImpl({ sim, ev, coarse, fx, perf }: SceneProps) {
    const { gl, camera } = useThree();
    const hero = useRef<THREE.Group>(null!), armR = useRef<THREE.Group>(null!), armL = useRef<THREE.Group>(null!), legR = useRef<THREE.Group>(null!), legL = useRef<THREE.Group>(null!), cape = useRef<THREE.Mesh>(null!);
    const web = useRef<THREE.Mesh>(null!), webB = useRef<THREE.Mesh>(null!), arrow = useRef<THREE.Mesh>(null!), cores = useRef<THREE.InstancedMesh>(null!), glows = useRef<THREE.InstancedMesh>(null!);
    const cam = useRef(new THREE.Vector3()), look = useRef(new THREE.Vector3()), adapt = useRef(0), ema = useRef(16), curScale = useRef(perf.scale), hyst = useRef({ s: 0, n: 0, down: -99 });
    const bv = useMemo(() => new THREE.Vector3(), []);
    const bv2 = useMemo(() => new THREE.Vector3(), []);
    const waterRef = useRef<THREE.Mesh>(null!), ringRef = useRef<THREE.Mesh>(null!);
    const wakeRef = useRef<THREE.Mesh>(null!); const ringFlow = useRef(0);
    const wakeTrail = useRef<{x:number,z:number,t:number}[]>([]); const wakeStrength = useRef(0); const wakeBorn = useRef(0);
    const wakeGeo = useMemo(() => { const g = new THREE.BufferGeometry(), pa = new Float32Array(2 * 25 * 2 * 3), uv = new Float32Array(2 * 25 * 2 * 2), ix: number[] = []; for (let side = 0; side < 2; side++) for (let j = 0; j <= 24; j++) { const n = side * 50 + j * 2; uv[n*2] = uv[(n+1)*2] = j/24; uv[n*2+1] = 0; uv[(n+1)*2+1] = 1; if (j < 24) ix.push(n,n+1,n+2,n+1,n+3,n+2); } g.setAttribute('position', new THREE.BufferAttribute(pa, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(ix); return g; }, []);
    const wakeMat = useMemo(() => new THREE.ShaderMaterial({transparent:true, depthWrite:false, side:THREE.DoubleSide, uniforms:{uA:{value:0}}, vertexShader:'varying vec2 vU; void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'varying vec2 vU; uniform float uA; void main(){float soft=sin(vU.y*3.14159);float trail=pow(1.0-vU.x,1.5)*smoothstep(0.0,0.12,vU.x); gl_FragColor=vec4(0.82,0.96,1.0,soft*trail*uA);}' }), []);
 const splashRef = useRef<THREE.Group>(null!), splashSt = useRef({ prev: false, t0: -9 });
    const rig = useMemo(() => {
        const r = buildRig();
        const redM = new THREE.MeshLambertMaterial({ color: '#d4162e', side: THREE.DoubleSide });
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.11, 0.06, 10), redM); ring.position.set(0, 0.04, 0); r.b.neck.add(ring);
        const t1 = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.8).translate(0, -0.4, 0), redM); t1.position.set(0, 0.38, -0.1); r.b.chest.add(t1);
        const t2 = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.55).translate(0, -0.275, 0), redM); t2.position.set(0.07, 0.36, -0.1); t2.rotation.set(0.1, 0, 0.14); r.b.chest.add(t2);
        ring.visible = false; t1.visible = false; t2.visible = false;   // model has its own cloth; legacy red scarf removed
        legR.current = r.b.thighR as any; legL.current = r.b.thighL as any; armR.current = r.b.uarmR as any; armL.current = r.b.uarmL as any; cape.current = t1 as any;
        if (DBG) (window as any).__rig = r; return r;
    }, []);
    useEffect(() => registerHero(rig.root), [rig]);   // Shadow joins the hero HD pass
    useEffect(() => registerFxHero(() => sim, rig, 0), [rig]);   // Shadow's limb trails + Slam fist glow (CombatFX)
    const clipSt = useRef(createHeroClipState()), poseSt = useRef(createCombatPoseState());
    const lastWall = useRef<{ n: number[]; b: number } | null>(null), wallCorr = useRef(0), groundCorr = useRef(0), groundMin = useRef({ key: '', v: 1e9 }), tp0 = useMemo(() => new THREE.Vector3(), []);
    const enemyTime = useRef({ value: 0 });
    const enemySet = useMemo(() => [0, 1, 2, 3].map((k) => buildEnemy(k, enemyTime.current)), []);
    const enMeshes = useRef<THREE.InstancedMesh[]>([]);
    const ecol = useMemo(() => new THREE.Color(), []);
    const beaconRef = useRef<THREE.Mesh>(null!);
    const fovBase = useRef(62);

    useFrame((state, rawDt) => {
        const dt = Math.min(0.1, rawDt) * (DBG && (window as any).__ts != null ? (window as any).__ts : 1);   /* Shifat 9:33 AM 'animation feels slow on ocean': the 50 ms cap made the whole game run in slow motion below 20 fps; now real time down to 10 fps */   // test hook: frame-exact stills
        sim.t += dt;
        // adaptive resolution (device-friendly)
        const rd = Math.min(0.25, rawDt); ema.current += (rd * 1000 - ema.current) * 0.05; perf.fps = 1000 / ema.current; adapt.current += rd;
        { applyRatio(gl, DQ_RES ? Math.min(window.devicePixelRatio || 1, QK.dprCap) * DQ_RES : QK.envDpr); }   /* fixed world dpr (Shifat Nov 2 2:17 AM) */
        { (window as any).__gl = gl; const tl = ((window as any).__tel ||= {}); tl.scale = Math.round(curScale.current * 100) / 100; tl.ms = Math.round(ema.current); tl.cam = [Math.round(state.camera.position.x), Math.round(state.camera.position.y), Math.round(state.camera.position.z)]; tl.mode = sim.mode; tl.swim = !!sim.swim; tl.calls = gl.info.render.calls; tl.tris = gl.info.render.triangles; }   /* device diagnostics (telemetry.ts) */   /* Shifat 10:13 PM 'phone environment dpr mustn't go below 1, no fps-based downscaling below 1' */   // world ratio unchanged; the canvas runs at native for the hero HD pass
        if (adapt.current > 0.8) {
            adapt.current = 0; let ns = curScale.current;
            /* Shifat 6:56 PM 'performance spikes near water': every scale step re-allocates the world/outline/copy render targets (a visible hitch), and the scaler
               used to bounce (down at >24 ms, up at <18 ms, checked every 0.8 s). Now a step needs the same verdict 2 checks in a row, and an up-step also waits 6 s after a down-step. */
            const sd = coarse ? (ema.current > 34 && ns > 0.65 ? -0.1 : ema.current < 22 && ns < Math.min(window.devicePixelRatio || 1, 2) - 0.01 ? 0.05 : 0)   /* Shifat Oct 31 7:45 PM 'everything feels too low res. Auto': touch devices now climb above 1 css px toward the screen's native sharpness (cap 2x) while holding 45+ fps, and step down below 30 fps (floor 0.6) */   /* Shifat 11:19 AM 'phone should lower res when frames go slow too': below 25 fps a touch device steps the world res down (floor 0.6), and back up once it holds 33+ fps; heroes stay native in the HD pass */
                : ema.current > 24 && ns > (coarse ? 0.8 / Math.min(window.devicePixelRatio || 1, QK.dprCap) + 0.01 : 0.6) ? -0.1  /* RCA Shifat 3:54 AM: ?debug&noout looked best because it drew the world at the phone's native res with the SAME 6-7 fps -> the phone is not fill-bound, so touch devices never drop below full res (floor 1) */ : ema.current > 16 && ns > 1 ? -0.05 : ema.current < 12.5 && ns >= 1 && ns < QK.maxScale && (coarse || HQ) ? 0.05 : ema.current < 18 && ns < 1 ? 0.05 : 0;
            const sg = Math.sign(sd); hyst.current.n = sg !== 0 && sg === hyst.current.s ? hyst.current.n + 1 : sg !== 0 ? 1 : 0; hyst.current.s = sg;
            if (sd !== 0 && hyst.current.n >= 2 && (sd < 0 || sim.t - hyst.current.down > 6)) { ns = sd < -0.06 ? ns - 0.1 : sd < 0 ? Math.max(1, ns - 0.05) : ns + 0.05; hyst.current.n = 0; if (sd < 0) hyst.current.down = sim.t; }   // supersample tier: touch devices or ?q=high desktops running well under budget (<12.5 ms), reversible by the same >24 ms downshift
            if (DBG && (window as any).__perfPin) ns = (window as any).__perfPin;
            if (DQ_BENCH) ns = (window as any).__benchRes || 1;   // bench holds the scaler (steps must compare like with like)
            if (DQ_RES) ns = DQ_RES;   // ?debug&res=x: hold the world resolution for an on-device fill-rate test   // screenshot harness only: hold the scaler so a software renderer does not drop tiers
            if (Math.abs(ns - curScale.current) > 0.01) { curScale.current = ns; perf.scale = ns; applyRatio(gl, (DQ_RES || (DQ_BENCH && ns < 1)) ? Math.min(window.devicePixelRatio || 1, QK.dprCap) * ns : QK.envDpr); }   /* Shifat Nov 1 2:14 PM: min res dpr 0.8 for faster fps (was 1) */   /* ?debug&res=x bypasses the dpr-1 floor (on-device fill-rate test only) */
        }
        if (sim.mode === 'play') {
            const gdt = dt * simTimeScale(sim, dt);   // finisher / Charged Slam slow-motion dip (1 outside it)
            { const n = Math.max(2, Math.ceil(gdt / 0.025)); for (let i = 0; i < n; i++) stepSim(sim, gdt / n, ev); }   // same <=25 ms physics steps as before
            stepBeacon(sim, ev);
            sim.time += gdt;
        } else sim.yaw += dt * 0.15;
        const p = sim.pos, v = sim.vel;
        const speed = Math.hypot(v[0], v[1], v[2]); perf.speed = speed;
        // camera
        const cy = Math.cos(sim.pitch), sy = Math.sin(sim.pitch);
        const dbgD = DBG ? (window as any).__camDist as number | undefined : undefined; if (DBG) (window as any).__wr = { world: HD.worldRatio, scale: curScale.current }; if (DBG && (window as any).__hq) { curScale.current = 1; perf.scale = 1; }
        let dist = dbgD ?? ((sim as any).riding ? 17 : sim.web ? 11.5 : sim.wall ? 7 : 8.5);   // flying a car: pull the camera back so the car doesn't fill the screen
        const fxd = Math.sin(sim.yaw) * cy, fzd = Math.cos(sim.yaw) * cy;
        /* Shifat 12:02 AM phone fps: the camera's three building checks scanned every building in the city several times a frame; only the
           ones within reach of the camera arm can matter, so they are gathered once (same results). */
        const camB = _camNear; camB.length = 0;
        { const rr = Math.max(dist, Math.hypot(cam.current.x - p[0], cam.current.z - p[2])) + 8; for (const b of buildings) if (p[0] > b.x0 - rr && p[0] < b.x1 + rr && p[2] > b.z0 - rr && p[2] < b.z1 + rr) camB.push(b); }
        for (; !dbgD && dist > (sim.wall ? 5 : 6); dist -= 1) {
            const ex = p[0] - fxd * dist, ey = p[1] + 1.5 + sy * dist, ez = p[2] - fzd * dist;
            let hit = false;
            for (const b of camB) if (ex > b.x0 - 3 && ex < b.x1 + 3 && ez > b.z0 - 3 && ez < b.z1 + 3 && ey < b.h + 3) { hit = true; break; }
            if (!hit) break;
        }
        const wsh = 0, wnx = sim.wall ? -sim.wall[1] : 0, wnz = sim.wall ? sim.wall[0] : 0; // Manual orbit has no forced wall-side offset
        const tx = p[0] - fxd * dist + wnx * wsh, ty = p[1] + (sim.swim ? 0.7 : 1.5) + sy * dist, tz = p[2] - fzd * dist + wnz * wsh;
        if (sim.mode === 'menu' || sim.mode === 'over') { cam.current.set(tx, ty, tz); } else cam.current.lerp(_camTgt.set(tx, ty, tz), 1 - Math.pow(0.001, dt));
        { // push smoothed camera out of buildings (post-lerp)
            const q = cam.current;
            for (const b of camB) if (q.x > b.x0 - 2 && q.x < b.x1 + 2 && q.z > b.z0 - 2 && q.z < b.z1 + 2 && q.y < b.h + 2) {
                if (!(tx > b.x0 - 2 && tx < b.x1 + 2 && tz > b.z0 - 2 && tz < b.z1 + 2 && ty < b.h + 2)) { q.set(tx, ty, tz); continue; }
                const dx0 = q.x - (b.x0 - 2), dx1 = b.x1 + 2 - q.x, dz0 = q.z - (b.z0 - 2), dz1 = b.z1 + 2 - q.z, dy = b.h + 2 - q.y, m = Math.min(dx0, dx1, dz0, dz1, dy);
                if (m === dy) q.y = b.h + 2; else if (m === dx0) q.x = b.x0 - 2; else if (m === dx1) q.x = b.x1 + 2; else if (m === dz0) q.z = b.z0 - 2; else q.z = b.z1 + 2;
            }
        }
        { // Keep the smoothed chase arm outside the solid quay and above inland ground.
            // If the sightline enters the shore wall below its top, shorten on the water side.
            const q = cam.current, edge = WATER_Z - 0.9, ly = sim.swim ? p[1] + 0.7 : p[1] + 1.5;
            if (p[2] < edge && q.z > edge) {
                const f = (edge - p[2]) / (q.z - p[2]);
                const iy = ly + (q.y - ly) * f;
                if (iy < 0.7) { q.x = p[0] + (q.x - p[0]) * f; q.y = iy; q.z = edge; }
            }

        }
        { // Orbit obstruction shortens the arm; it does not change the selected angles.
            const q=cam.current,ax=p[0],ay=p[1]+(sim.swim?.7:1.5),az=p[2];
            const dx=q.x-ax,dy=q.y-ay,dz=q.z-az;let safe=1;
            // Segment-vs-building slabs catch walls even when the endpoint is outside.
            for(const b of camB){let lo=0,hi=safe;const origin=[ax,ay,az],delta=[dx,dy,dz],mn=[b.x0-.35,-1000,b.z0-.35],mx=[b.x1+.35,b.h+.35,b.z1+.35];let hit=true;
                for(let k=0;k<3;k++){if(Math.abs(delta[k])<1e-7){if(origin[k]<mn[k]||origin[k]>mx[k]){hit=false;break;}}else{let a=(mn[k]-origin[k])/delta[k],c=(mx[k]-origin[k])/delta[k];if(a>c){const t=a;a=c;c=t;}lo=Math.max(lo,a);hi=Math.min(hi,c);if(lo>hi){hit=false;break;}}}
                if(hit&&lo>0)safe=Math.max(0,lo-.025);
            }
            for(let i=1;i<=32;i++){const f=safe*i/32,x=ax+dx*f,y=ay+dy*f,z=az+dz*f;const ihc=z<WATER_Z?islandH(x,z):null;const floor=z<WATER_Z?(ihc!==null?ihc:seabedAt(x,z)):Math.min(0,parkH(x,z));   /* 1:21 AM Shifat 'island lake camera bug': seabedAt ignores the carved lake/river/pool, so the arm hit 'ground' above the water and collapsed into the swimmer */if(y<floor+.35){safe=safe*(i-1)/32;break;}}
            if(safe<1)q.set(ax+dx*safe,ay+dy*safe,az+dz*safe);
        }
        camera.position.copy(cam.current); if (DBG) (window as any).__cam = [cam.current.x, cam.current.y, cam.current.z, dist];
        look.current.set(p[0], sim.swim ? p[1] + 0.7 : p[1] + 1.5, p[2]);
        OCC.uOccHero.value.set(p[0], p[1] + 1.0, p[2]);   // robots/peds between lens and hero dissolve (occlude.ts)
        const ov = DBG ? (window as any).__camOv : null; if (ov) { camera.position.set(ov[0], ov[1], ov[2]); look.current.set(ov[3], ov[4], ov[5]); }
        camera.lookAt(look.current);
        { const tr = Math.min(1, (sim as any).shake || 0); if (tr > 0.001 && (!ov || (window as any).__camOvShake)) {   // trauma^2 ROTATIONAL shake (recipe D2): yaw/pitch <= 1.2 deg, roll <= 2 deg, <= 3 cm of position; smooth summed sines (~9/13/21 Hz)
            const k = tr * tr, t = sim.t, D2R = Math.PI / 180;
            const n1 = Math.sin(t * 57.0) * 0.6 + Math.sin(t * 82.0 + 1.3) * 0.4, n2 = Math.sin(t * 61.0 + 2.1) * 0.6 + Math.sin(t * 131.0 + 0.4) * 0.4, n3 = Math.sin(t * 53.0 + 4.2) * 0.6 + Math.sin(t * 89.0 + 2.9) * 0.4;
            camera.rotateY(n1 * 1.2 * D2R * k); camera.rotateX(n2 * 1.2 * D2R * k); camera.rotateZ(n3 * 2.0 * D2R * k);
            camera.translateX(n2 * 0.03 * k); camera.translateY(n1 * 0.03 * k);
        } }
        hitFeelCamera(camera, sim, dt, !ov || !!(window as any).__camOvShake);   // impact kick along the blow + FOV pinch (src/hitFeel.ts)
        landFeel(camera, sim, getCompanionSim(), dt, !ov || !!(window as any).__camOvShake);   // landing puff (both heroes) + big-drop camera dip (src/landFeel.ts)
        const cp = camera as THREE.PerspectiveCamera;
        if (DBG) (window as any).__camObj = camera;   // test hook: hit-feel checks (shake rotation, fov punch)
        // Near-clip-aware waterline: retain the nearby underside instead of cutting a hole through it.
        // Restore the ordinary land frustum away from the bay surface to preserve depth precision.
        const nearWater = (camera.position.z < WATER_Z + 2 && Math.abs(camera.position.y - WATER_Y) < 1.5) || (isLakeWater(camera.position.x, camera.position.z) && Math.abs(camera.position.y - waterSurfaceAt(camera.position.x, camera.position.z, sim.t)) < 1.5);
        const nearTarget = nearWater ? 0.05 : 0.5;
        if (cp.near !== nearTarget) { cp.near = nearTarget; cp.updateProjectionMatrix(); }
        const targetFov = 62 + Math.min(14, speed * 0.25) + fx.fov;
        fovBase.current += (targetFov - fovBase.current) * Math.min(1, dt * 6);
        let punch = 0; { const sa = sim as any; if (sa.fovK) { sa.fovKT = (sa.fovKT || 0) + dt; const t = sa.fovKT, env = t < 0.05 ? t / 0.05 : Math.pow(Math.max(0, 1 - (t - 0.05) / 0.3), 3); punch = sa.fovK * env; if (t > 0.35) sa.fovK = 0; } if (sa.slam && sa.slam.ph === 0) punch += -2 * sa.slam.c; }   // punch-in (narrow): finisher -3, Slam -6, in 50 ms, out 300 ms; charging narrows -2
        const fovNow = fovBase.current + punch + hitFeelFov();
        if (Math.abs(cp.fov - fovNow) > 0.02) { cp.fov = fovNow; cp.updateProjectionMatrix(); }
        {   // water: animate, and split view (waterline across the screen when the camera is at the surface)
            waterMat.uniforms.uTime.value = sim.t; seabedMat.uniforms.uTime.value = sim.t; wallMat.uniforms.uTime.value = sim.t;
            {   // #3 submerged hero parts: water surface under the hero for the hero-pass water tint (src/heroHD.ts HERO_WATER)
                const hx = sim.pos[0], hz = sim.pos[2], inPool = hz < WATER_Z && poolAt(hx, hz), inZone = hz < WATER_Z || isLakeWater(hx, hz);
                HERO_WATER.uWL.value = inZone ? (inPool || isLakeWater(hx, hz) ? waterSurfaceAt(hx, hz, sim.t) : waterRenderY(hx, hz, sim.t)) : -1e4;
                HERO_WATER.uWC.value.copy(UWF.value).convertLinearToSRGB();   // the hero pass tints after the output colour-space conversion
            }
            const uw = document.getElementById('uw');
            if (uw) { const dq = Math.round(TOD.day.value * 20); if (uw.dataset.dq !== String(dq)) { uw.dataset.dq = String(dq); const d = dq / 20, k = 0.12 + 0.88 * d, c = (r: number, g: number, b: number, a: number) => `rgba(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)},${(a + (1 - d) * 0.25).toFixed(2)})`;
                uw.style.background = `linear-gradient(180deg, ${c(110, 215, 235, 0.24)}, ${c(30, 140, 175, 0.3)} 45%, ${c(8, 70, 105, 0.5)})`; } }   // underwater tint follows the light: the fixed bright-teal wash used to light up the night sea from inside
            const inBay = camera.position.z < WATER_Z + 2, inLake = isLakeWater(camera.position.x, camera.position.z), inWater = inBay || inLake;
            const surfaceY = inLake ? waterSurfaceAt(camera.position.x, camera.position.z, sim.t) : waterRenderY(camera.position.x, camera.position.z, sim.t); const dy = camera.position.y - surfaceY; const split = inWater && dy > -0.6 && dy < 0.9, under = inWater && dy <= -0.6 || (inWater && dy < 0 && !split);
   // env-iter3: ocean uses the real swell height (was the flat sea level, so troughs read as underwater)
            // Shifat Oct 29 "use underwater fogs inside ocean": these statements had slipped into the comment above, so the underwater
            // state never switched on. Now: underwater background + a scene fog that thickens with depth (deeper = darker, shorter view).
            UW.on = under; if (under) (state.scene.background as THREE.Color).copy(UWF.value); if (DBG) (window as any).__scene = state.scene;
            // Shifat Oct 29: "fog should only be visible at great distance, not close" -> linear fog: clear water near you, fog only far off.
            if (!(state.scene.fog instanceof THREE.Fog)) state.scene.fog = new THREE.Fog(UWF.value.getHex(), 1e4, 2e4);   // kept for the whole session (pushed out of reach above water) so entering water causes no shader recompiles
            { const fg = state.scene.fog as THREE.Fog; if (under) { const deep = Math.min(1, Math.max(0, -dy / 30)), ti = THREE.MathUtils.smoothstep(-dy, 0.6, 4.0);   /* Shifat Nov 1: one world, not a camera switch -> the water closes in gradually over the first metres of the dive */ fg.color.copy(UWF.value).multiplyScalar(1 - 0.3 * deep); fg.near = 8 - 4 * deep; fg.far = 150 - 40 * deep;   /* Shifat Nov 1 11:27 'underwater land looks bad, smooth it out': water haze now starts a few metres out (was 55 m), so submerged slopes melt into the blue instead of standing crisp and white */ void ti; (state.scene.background as THREE.Color).copy(fg.color); } else { fg.near = 1e4; fg.far = 2e4; } }
            {   // Shifat Oct 31 12:27 'air water split view': the lens straddles the surface. The post pass gives everything below the wave line the
                // underwater look (same fog colour as diving). Line = the silhouette of the drawn waves from the lens plane out (src/water/waterline.ts).
                WATERLINE.v.w = 0;
                if (split) {   // the top edge of the water as the lens sees it, cut on the exact drawn waves out to the far crests (src/water/waterline.ts)
                    updateWaterline(camera as THREE.PerspectiveCamera, sim.t, inLake ? (x: number, z: number) => waterSurfaceAt(x, z, sim.t) : null, dy); WATERLINE.col.copy(UWF.value);
                    if (DBG) (window as any).__wl = [WATERLINE.q.flatMap((v) => [v.x, v.y, v.z, v.w]).slice(0, 25).map((v) => +v.toFixed(3)), dy];
                }
            }
            if (uw) {   // full underwater wash only; the split is drawn by the post pass now
                if (uw.dataset.split !== '0' || uw.style.maskImage !== 'none') { uw.style.maskImage = 'none'; (uw.style as any).webkitMaskImage = 'none'; uw.dataset.split = '0'; }
                const op = under ? THREE.MathUtils.smoothstep(-dy, 0.6, 3.0).toFixed(2) : '0'; if (uw.style.opacity !== op) uw.style.opacity = op;   /* the blue wash deepens with depth instead of switching on */
            }
        }
        // hero
        const h = hero.current;
        const wl = !!sim.wall;
        { const sg = splashRef.current, st2 = splashSt.current; if (sg) { if (sim.swim && !st2.prev && p[1] > waterSurfaceAt(p[0], p[2], sim.t) - 2.0) st2.t0 = sim.t; st2.prev = sim.swim; const age = sim.t - st2.t0, on = age >= 0 && age < 0.8; sg.visible = on; if (on) { const wy = waterRenderY(p[0], p[2], sim.t), k = age / 0.8, rise = Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.5); sg.position.set(p[0], wy, p[2]); sg.children.forEach((c, i) => { const m = c as THREE.Mesh, a2 = (i / 9) * 6.283, tilt = 0.25 + 0.2 * ((i * 7) % 3), h = (0.9 + 0.5 * ((i * 5) % 4) / 3) * rise * (1 - 0.35 * k); m.position.set(Math.cos(a2) * 0.35 * (1 + k), h * 0.5, Math.sin(a2) * 0.35 * (1 + k)); m.rotation.set(Math.sin(a2) * tilt, 0, -Math.cos(a2) * tilt); m.scale.set(1 - 0.5 * k, Math.max(0.01, h), 1 - 0.5 * k); (m.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - k * k); }); } } }   // entry splash: crown of white shards on water entry (ref: stylized splash, spiky white crown over a foam skirt)
        { // original curved two-arm wake: short position history keeps the trail behind a turning swimmer
            const m = wakeRef.current, sp = Math.hypot(v[0],v[2]), surfaceY = waterSurfaceAt(p[0],p[2],sim.t), surface = sim.swim && !sim.dive && p[1] > surfaceY - 1.1;
            const target = surface && sp>0.6 ? Math.min(0.58,sp*0.10) : 0;
            wakeStrength.current += (target-wakeStrength.current)*Math.min(1,dt*(target>0?6:3));
            const trail = wakeTrail.current;
            if(!surface || trail.length && Math.hypot(p[0]-trail[0].x,p[2]-trail[0].z)>12) trail.length=0;
            if(surface && (!trail.length || sim.t-trail[0].t>0.07)){
                // A hard reversal must start a new ribbon rather than join opposing arms across a cusp.
                if(trail.length>3){const a=trail[0],b=trail[3],ox=a.x-b.x,oz=a.z-b.z,ol=Math.hypot(ox,oz);if(ol>0.15&&sp>1.0&&(v[0]*ox+v[2]*oz)/(sp*ol)<0.20){trail.length=0;wakeStrength.current*=0.35;}}
                if(!trail.length)wakeBorn.current=sim.t;trail.unshift({x:p[0],z:p[2],t:sim.t});if(trail.length>28)trail.pop();}
            if(m){m.visible=surface && wakeStrength.current>0.015 && trail.length>2;if(m.visible){const pa=wakeGeo.attributes.position as THREE.BufferAttribute;
                for(let side=0;side<2;side++)for(let j=0;j<=24;j++){const t=j/24,sgn=side?1:-1,fi=t*(trail.length-1),ii=Math.floor(fi),ff=fi-ii,a=trail[ii],b=trail[Math.min(ii+1,trail.length-1)],prev=trail[Math.max(0,ii-1)],next=trail[Math.min(trail.length-1,ii+1)];
                    let dx=prev.x-next.x,dz=prev.z-next.z;const ln=Math.hypot(dx,dz);if(ln>0.02){dx/=ln;dz/=ln;}else{dx=Math.sin(sim.ang);dz=Math.cos(sim.ang);}
                    const cx=a.x+(b.x-a.x)*ff-dx*0.8,cz=a.z+(b.z-a.z)*ff-dz*0.8,spread=0.55+t*1.7,width=0.06+t*0.16;
                    for(let k=0;k<2;k++){const off=sgn*(spread+(k?width:-width)),x=cx-dz*off,z=cz+dx*off;pa.setXYZ(side*50+j*2+k,x,waterRenderY(x,z,sim.t)+0.055,z);}}
                pa.needsUpdate=true;wakeMat.uniforms.uA.value=wakeStrength.current*THREE.MathUtils.smoothstep(sim.t-wakeBorn.current,0.1,0.65);}}
        }
        { const sp=Math.hypot(v[0],v[2]); ringFlow.current+=(THREE.MathUtils.smoothstep(sp,0.5,3.5)-ringFlow.current)*Math.min(1,dt*4); const rg = ringRef.current as unknown as THREE.Group; if (DBG) (window as any).__ring = rg; if (rg) { const surfaceY=waterSurfaceAt(p[0],p[2],sim.t), on = (sim.swim || (DBG && (window as any).__ringForce)) && p[1] > surfaceY - 1.6; rg.visible = on; if (on) { const wy = waterRenderY(p[0], p[2], sim.t); rg.position.set(p[0] - Math.sin(sim.ang) * 0.9, wy + 0.04, p[2] - Math.cos(sim.ang) * 0.9); rg.children.forEach((c, i) => { const ph = (sim.t * 0.7 + i / 3) % 1, m = c as THREE.Mesh; m.scale.setScalar(1.0 + ph * 5.5); ((m.material as THREE.ShaderMaterial).uniforms.opacity.value) = 0.6 * (1 - 0.70 * ringFlow.current) * (1 - ph) * (1 - ph); }); } } }   // waterline cue: expanding foam ring where the body cuts the surface
        const sa0 = sim as any;
        const rootPose = applyHeroRootPose(sim, rig, dt, sa0, p, HERO_SC);
        const lean = rootPose.lean, shadowBody = rig.poseRoot.children[0] as THREE.Object3D;
        const shadowAnimation = animateHeroBones(sim, rig, dt, { clipState: clipSt.current, poseState: poseSt.current, glideBlend: rootPose.glideBlend, publishState: true });
        if (DBG) { (window as any).__shadowAnimation = shadowAnimation; (window as any).__shadowSwimOrientation = { wrapperPitch: rig.poseRoot.rotation.x, bodyPitch: shadowBody.rotation.x, rootYaw: h.rotation.y, simYaw: sim.ang, lean, clipWeight: clipSt.current.w }; }
        if (!sim.swim && sim.ground && !wl && (clipSt.current.key === 'run' || clipSt.current.key === 'idle')) {   // plant the lowest foot vertex on the street (measured from the skinned mesh, replaces the fixed run drop)
            h.updateMatrixWorld(true);
            let mn = 1e9;
            for (const e of rig.hull) { if (!e.foot) continue; tp0.set(0, 0, 0); for (let k = 0; k < 4; k++) { if (e.bw[k] <= 0) continue; _wv2.copy(e.p).applyMatrix4(rig.skel.boneInverses[e.bi[k]]).applyMatrix4(rig.skel.bones[e.bi[k]].matrixWorld); tp0.addScaledVector(_wv2, e.bw[k]); } if (tp0.y < mn) mn = tp0.y; }
            {   // plant from the lowest foot point seen over the clip cycle (stance), so the airborne phase of the stride is kept; smoothed, not per frame
                const gm = groundMin.current, ck2 = clipSt.current.key;
                const gBd = ((sim as any).gB || 0) > 0.03;   // glide body shift distorts foot heights: don't collect while it decays, re-collect fresh after
                if (gBd) gm.key = '';
                const fresh = gm.key !== ck2;
                if (fresh) { gm.key = ck2; gm.v = 1e9; }
                if (!gBd && mn < gm.v) gm.v = mn;
                const wg = gm.v > 1e8 ? groundCorr.current : Math.max(-0.4, Math.min(0.4, 0.02 + (sim.pos[1] - 1.0) - gm.v));
                if (fresh && !gBd) groundCorr.current = wg; else groundCorr.current += (wg - groundCorr.current) * Math.min(1, dt * 8);
            }
            if (DBG && (window as any).__dbgGround) (window as any).__gc = { mn, corr: groundCorr.current };
        } else { groundMin.current.key = ''; groundCorr.current += (0 - groundCorr.current) * Math.min(1, dt * 10); }
        h.position.y += groundCorr.current;
        if (!sim.swim && sim.ground && !wl) {   // Guard the skinned contact hull (including hands/feet) against the actual street, valley or rooftop support. Raise only.
            h.updateMatrixWorld(true);
            let mn2 = 1e9;
            for (const e of rig.hull) { tp0.set(0, 0, 0); for (let k = 0; k < 4; k++) { if (e.bw[k] <= 0) continue; _wv2.copy(e.p).applyMatrix4(rig.skel.boneInverses[e.bi[k]]).applyMatrix4(rig.skel.bones[e.bi[k]].matrixWorld); tp0.addScaledVector(_wv2, e.bw[k]); } if (tp0.y < mn2) mn2 = tp0.y; }
            { const gr = sim.pos[1] - 1.0; if (mn2 < gr + 0.02) h.position.y += gr + 0.02 - mn2; }
            if (DBG && (window as any).__dbgGround) (window as any).__gc2 = mn2 < 0.0 ? 0.02 : mn2;
        }
        if (sim.wall && sim.wallB >= 0) lastWall.current = { n: [sim.wall[0], sim.wall[1]], b: sim.wallB };
        const wnX = sim.wall ? sim.wall : (sim.wallT > 0 && lastWall.current ? lastWall.current.n : null), wbX = sim.wall ? sim.wallB : (lastWall.current ? lastWall.current.b : -1);   // after a wall jump keep the push-out against the wall just left
        if (wnX && wbX >= 0) {   // keep the whole skinned body (head, hands, feet) at the facade: shift along the wall normal by the deepest extreme point
            const bd = buildings[wbX], n = wnX as number[], fx = -n[0], fz = -n[1];
            const pl = fx !== 0 ? (n[0] < 0 ? bd.x0 : bd.x1) : (n[1] < 0 ? bd.z0 : bd.z1), tp = _wv;
            h.updateMatrixWorld(true);
            let md = -1e9;
            for (const e of rig.hull) { tp.set(0, 0, 0); for (let k = 0; k < 4; k++) { if (e.bw[k] <= 0) continue; _wv2.copy(e.p).applyMatrix4(rig.skel.boneInverses[e.bi[k]]).applyMatrix4(rig.skel.bones[e.bi[k]].matrixWorld); tp.addScaledVector(_wv2, e.bw[k]); } const dd = fx !== 0 ? (tp.x - pl) * fx : (tp.z - pl) * fz; if (dd > md) md = dd; }
            const want = Math.max(-1.2, Math.min(1.2, -(md + 0.03)));
            if (want < wallCorr.current) wallCorr.current = want; else wallCorr.current += (want - wallCorr.current) * Math.min(1, dt * 14);   // push out instantly, ease back in
        } else wallCorr.current += (0 - wallCorr.current) * Math.min(1, dt * (sim.wallT > 0 ? 3 : 10));   // after a wall jump keep the push-out until the exit velocity clears the hull
        if (Math.abs(wallCorr.current) > 1e-4 && wnX) { const n = wnX; h.position.x -= n[0] * wallCorr.current; h.position.z -= n[1] * wallCorr.current; }
        { const gp = DBG ? (window as any).__game : null; if (gp && gp.probe) { h.updateMatrixWorld(true); const m = rig.poseRoot.children[0] as THREE.SkinnedMesh; m.skeleton.update(); const pa = m.geometry.attributes.position, si = m.geometry.attributes.skinIndex, swt = m.geometry.attributes.skinWeight, hv = new THREE.Vector3(); const grp = (n: string) => /^head|^neck/.test(n) ? 'head' : /^hand/.test(n) ? 'hands' : /^foot/.test(n) ? 'feet' : 'body'; const parts: Record<string, number[]> = {}; for (let i = 0; i < pa.count; i++) { let bi = si.getX(i), bw = swt.getX(i); for (let k = 1; k < 4; k++) { const w2 = swt.getComponent(i, k); if (w2 > bw) { bw = w2; bi = si.getComponent(i, k); } } const gname = grp(m.skeleton.bones[bi].name); const P = parts[gname] || (parts[gname] = [1e9, -1e9, 1e9, -1e9]); m.getVertexPosition(i, hv); hv.applyMatrix4(m.matrixWorld); P[0] = Math.min(P[0], hv.x); P[1] = Math.max(P[1], hv.x); P[2] = Math.min(P[2], hv.z); P[3] = Math.max(P[3], hv.z); } gp.parts = parts; } }
        cape.current.rotation.x = 0.25 + Math.min(1.0, speed / 38) + Math.sin(sim.t * 14) * 0.05 * Math.min(1, speed / 20);
        { // hidden cape chain: trail back with speed, flare and flutter in the glide
            const c1 = rig.b.cape1, c2 = rig.b.cape2, c3 = rig.b.cape3;
            if (c1) {
                const sp = Math.min(1, speed / 30), gl = sim.glideOn ? 1 : 0, ph = sim.t * (gl ? 9 : 6);
                const tx = gl ? 0.0   /* glide: cape lies back along the body (was 0.55, which stood the cape up behind the neck) */ : sp * 0.35, fl = gl ? 0.12 : 0.04 * sp;
                const lerp = Math.min(1, dt * 8), cs2: number[] = (sim as any).cpS || ((sim as any).cpS = [0, 0, 0, 0, 0]);   // state kept outside the bones (bones are reset every frame)
                const lc = (rig as any).__tv?.lc || 0;   // superhero landing: the impact throws the cape up behind, then it settles (heroTraversal.ts)
                cs2[0] += (tx + lc + Math.sin(ph) * fl - cs2[0]) * lerp;
                cs2[1] += (tx * 0.9 + lc * 0.5 + Math.sin(ph - 0.9) * fl * 1.3 - cs2[1]) * lerp;
                cs2[2] += (tx * 0.7 + Math.sin(ph - 1.8) * fl * 1.6 - cs2[2]) * lerp;
                cs2[3] += (Math.sin(ph * 0.7) * (gl ? 0.2 : 0.05 * sp) - cs2[3]) * lerp;
                cs2[4] += (Math.sin(ph * 0.7 - 1) * (gl ? 0.3 : 0.07 * sp) - cs2[4]) * lerp;
                c1.rotation.x = cs2[0]; c2.rotation.x = cs2[1]; c3.rotation.x = cs2[2]; c2.rotation.z = cs2[3]; c3.rotation.z = cs2[4];
            }
        }
        if ((sim as any).snareT > SNARE.IMPACT || (sim as any).cWeb) { const sa = sim as any; if (!sa.handW) sa.handW = [[0, 0, 0], [0, 0, 0]]; h.updateMatrixWorld(true); [rig.b.handL, rig.b.handR].forEach((b: any, i: number) => { b.getWorldPosition(_hp); sa.handW[i][0] = _hp.x; sa.handW[i][1] = _hp.y; sa.handW[i][2] = _hp.z; }); }
        // web
        { // two web lines, each from an actual animated hand (world position), shot out to the anchor over ~0.14 s
            const wl2 = web.current, wr2 = webB.current, side = sim.swings % 2; // swing: alternate hands (odd = right); spring-shot jump and web-shot attack: both hands together
            const mode = sim.spring > 0 ? 1 : sim.web ? 0 : -1;   // shot: the plasma bolt is the visual now (was mode 2 hand-to-target cylinders)
            const both = mode > 0;
            wl2.visible = mode >= 0 && (both || side === 0); wr2.visible = mode >= 0 && (both || side === 1);
            if (mode >= 0) {
                rig.root.updateWorldMatrix(true, true);
                const tgt = sim.anchor;
                const grow = mode === 1 ? Math.max(0.05, sim.spring / 0.4) : Math.min(1, Math.max(0.05, sim.webT / 0.14));
                const ws = [wl2, wr2], hb = [rig.b.handL, rig.b.handR], fb = [rig.b.farmL, rig.b.farmR];
                for (let i = both ? 0 : side; i <= (both ? 1 : side); i++) {
                    hb[i].getWorldPosition(_hp); fb[i].getWorldPosition(_fp); _hp.addScaledVector(_wd2.copy(_hp).sub(_fp).normalize(), 0.08);
                    const dx = tgt[0] - _hp.x, dy = tgt[1] - _hp.y, dz = tgt[2] - _hp.z, l = Math.hypot(dx, dy, dz) || 1, ll = l * grow;
                    ws[i].position.set(_hp.x + dx / l * ll / 2, _hp.y + dy / l * ll / 2, _hp.z + dz / l * ll / 2);
                    ws[i].quaternion.setFromUnitVectors(Y, _wd2.set(dx / l, dy / l, dz / l));
                    ws[i].scale.set(1, ll, 1);
                    if (DBG) { (window as any)['__webO' + i] = [_hp.x, _hp.y, _hp.z]; (window as any).__webMode = mode; }
                }
            }
        }
        { const bm = beaconRef.current; bm.position.set(sim.beacon[0], sim.beacon[1] + 45, sim.beacon[2]); bm.scale.set(1 + 0.08 * Math.sin(sim.t * 3), 1, 1 + 0.08 * Math.sin(sim.t * 3)); }
        { // edge-aware beacon marker (DOM, no React state)
            const el = document.getElementById('bmark');
            if (el) {
                bv.set(sim.beacon[0], sim.beacon[1] + 6, sim.beacon[2]);
                camera.updateMatrixWorld();
                bv2.copy(bv).applyMatrix4(camera.matrixWorldInverse);
                const behind = bv2.z > -0.1; // camera looks down -z in view space
                let x: number, y: number;
                if (behind) { const l = Math.hypot(bv2.x, bv2.y); if (l < 0.01) { x = 0; y = -1; } else { x = bv2.x / l; y = bv2.y / l; } }
                else { bv.project(camera); x = bv.x; y = bv.y; }
                const m = Math.max(Math.abs(x) / 0.82, Math.abs(y) / 0.8, 1);
                const onScreen = !behind && m <= 1;
                x = x / (onScreen ? 1 : m); y = y / (onScreen ? 1 : m);
                el.style.transform = 'translate(' + (((x + 1) / 2) * window.innerWidth - 20).toFixed(0) + 'px,' + (((1 - y) / 2) * window.innerHeight - 20).toFixed(0) + 'px) rotate(' + (onScreen ? 180 : Math.atan2(-y, x) * 57.3 + 90).toFixed(0) + 'deg)';
                el.style.opacity = sim.mode === 'play' ? '1' : '0';
            }
        }
        { // enemies (instanced, one mesh per bot kind)
            enemyTime.current.value = sim.t; const n = sim.enemies.length, cnt = [0, 0, 0, 0];
            for (let i = 0; i < n; i++) {
                const e = sim.enemies[i]; if (e.boss) continue; const k = e.kind || 0, m = enMeshes.current[k]; if (!m) continue;
                const ea = e as any, ly = ea.ly || 0, lean = e.down > 0 ? 0 : Math.min(1, e.hit / 0.35) * (ea.hitDir >= 3 ? 0.55 : 0.32), tum = ly > 0.05 ? Math.sin(Math.min(1, ly / 3) * 1.57) * (ea.slam ? -1.1 : 0.9) : 0;
                const rx = enemyReact(e, sim, dt, lean);
                const fall = e.down > 0 && !rx.ko ? Math.min(1, (3 - e.down) * 5) : 0, bob = k >= 2 && !rx.ko ? Math.sin(sim.t * 2.5 + i) * 0.12 : 0;   // a KO'd bot is posed by enemyReact (topple away from the blow + glowing dissolve)   // hit reaction: flinch away from the blow on a spring, squash jolt, hit-stop shake, white-hot pop cooling to the hero's colour (src/enemyReact.ts)
                tmp.position.set(e.x + rx.jx, e.y + 0.06 - fall * 0.6 + bob + ly + rx.jy, e.z + rx.jz); tmp.rotation.set(fall * -1.4 - tum, e.ang, 0); tmp.quaternion.premultiply(rx.q); { const bi = e.born === undefined ? 1 : Math.min(1, Math.max(0, (sim.t - e.born) / 0.6)), fo = e.down > 0 ? (rx.ko ? rx.ksc : Math.min(1, e.down / 0.5)) : 1, sc = (e.kind === 3 ? BOT_SC : 1.25) * Math.max(0.001, bi * bi * (3 - 2 * bi)) * Math.max(0.001, fo); tmp.scale.set(sc * rx.sxz, sc * rx.sy, sc * rx.sxz); }   // new or re-placed enemies grow in, KO'd ones shrink out, so nothing pops
                tmp.updateMatrix();
                m.setMatrixAt(cnt[k], tmp.matrix);
                { const sa = m.geometry.getAttribute('aStill') as THREE.InstancedBufferAttribute | undefined; if (sa) (sa.array as Float32Array)[cnt[k]] = rx.limp; }
                if (rx.hot) ecol.setRGB(rx.r, rx.g, rx.b); else if (e.atk > 0) ecol.setRGB(1.8, 0.5 + Math.sin(sim.t * 30) * 0.2, 0.4); else ecol.setRGB(1, 1, 1);
                m.setColorAt(cnt[k], ecol); cnt[k]++;
            }
            const efr = viewFrustum(camera);   // perf item 9: bots outside the view are packed out of the draw
            for (let k = 0; k < 4; k++) { const m = enMeshes.current[k]; if (!m) continue; m.count = cnt[k]; cullInstances(m, efr); syncInk(m); { const sa = m.geometry.getAttribute('aStill'); if (sa) sa.needsUpdate = true; } m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
        }
        // orbs
        const t = sim.t;
        let nb = -1, nd = 1e9;
        for (let i = 0; i < sim.orbs.length; i++) {
            const o = sim.orbs[i], by = o[1] + Math.sin(t * 2 + o[0]) * 0.6;
            tmp.position.set(o[0], by, o[2]); tmp.rotation.set(t * 1.2, t * 1.5, 0); tmp.scale.setScalar(1); tmp.updateMatrix();
            cores.current.setMatrixAt(i, tmp.matrix);
            tmp.rotation.set(0, 0, 0); tmp.scale.setScalar(1 + 0.12 * Math.sin(t * 5 + i)); tmp.updateMatrix(); glows.current.setMatrixAt(i, tmp.matrix);
            const d = Math.hypot(o[0] - p[0], o[1] - p[1], o[2] - p[2]); if (d < nd) { nd = d; nb = i; }
        }
        cores.current.instanceMatrix.needsUpdate = true; glows.current.instanceMatrix.needsUpdate = true;
        arrow.current.visible = false;   // user 10:01 "Remove navigator arrows"
        if (nb >= 0) {
            const o = sim.orbs[nb], a = Math.atan2(o[0] - p[0], o[2] - p[2]);
            arrow.current.position.set(p[0] + Math.sin(a) * 3, p[1] + 3.2, p[2] + Math.cos(a) * 3);
            arrow.current.rotation.set(Math.PI / 2, 0, 0); arrow.current.rotation.order = 'YXZ'; arrow.current.rotation.y = a;
        }
    });

    return <>
        <ShaderWarmup />
        <mesh ref={beaconRef} onUpdate={(o) => o.layers.enable(SELECTIVE_BLOOM_LAYER)}><cylinderGeometry args={[4, 4, 90, 12, 1, true]} /><meshBasicMaterial color="#5ff2ff" transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} fog={false} /></mesh>
        <color attach="background" args={[FOG[0], FOG[1], FOG[2]]} />
        {/* Shifat 11:27 PM phone perf: lights live on every layer. When a pass rendered only the sea / late / reflection layer it saw 0 lights,
            three bumped its lights version, and the next pass re-derived the shader program of every lit material (about a quarter of the
            phone's render CPU, every frame). Same lights, same look; transparents drawn in the late pass are now lit like the normal path. */}
        <hemisphereLight name="hemi" args={['#d4e4ff', '#8a9a6a', 1.25]} onUpdate={(o) => o.layers.enableAll()} />
        <directionalLight name="sun1" position={[-30, 60, 20]} intensity={1.8} color="#ffdcae" onUpdate={(o) => o.layers.enableAll()} />
        <directionalLight name="sun2" position={[20, 30, -40]} intensity={0.8} color="#a8caff" onUpdate={(o) => o.layers.enableAll()} />
        <DayNight />
        <Weather />
        <Mist />
        <DebugStats /><Bench />
        {OUTLINE_STATE.on ? <OutlinePass /> : <FxaaPass enabled={AA_FXAA} />}
        <SelectiveBloomPass />
        {OUTLINE_STATE.on && HD.enabled ? <HeroHDPass /> : null}
        <Sky />
        <HarborGate><RoofProps harborOnly /></HarborGate>
        <CityGate><City /><TenementBlock />
        <ParkGround />
        <React.Suspense fallback={null}>
            <PolyforkBuildings />
            <FarPropGate><RoofProps />
            <StreetProps tod={TOD} /></FarPropGate>
            <PolyforkLakeBridge sim={sim} perf={perf} tod={TOD} />
        </React.Suspense></CityGate>
        <FlyingCars sim={sim} />
        {/* Rebuild park and city trees with authored forms and foliage; never overlay Polyfork tree canopies. */}
        <CityGate><Forest sim={sim} renderGround={false} />
        <Meadow sim={sim} /></CityGate><WindLines sim={sim} /><Civilians sim={sim} /><SnareLines sim={sim} /><Underwater sim={sim} /><PlasmaFx sim={sim} /><CombatFX sim={sim} /><EnemyDeathFx sim={sim} /><EnemyShotsFx sim={sim} />
        <primitive object={rig.root} ref={hero} />
        <BossArenaMarker />
        <BossArenaMarker arena={HBOSS} />
        <GiantBoss sim={sim} />
        <GiantBoss sim={sim} mini />
        <mesh ref={web} visible={false}><cylinderGeometry args={[0.035, 0.035, 1, 5]} /><meshBasicMaterial color="#f4f4ff" /></mesh>
        <mesh ref={webB} visible={false}><cylinderGeometry args={[0.035, 0.035, 1, 5]} /><meshBasicMaterial color="#f4f4ff" /></mesh>
        <mesh ref={arrow}><coneGeometry args={[0.35, 1.1, 8]} /><meshBasicMaterial color="#ffd54a" /></mesh>
        <mesh ref={wakeRef} geometry={wakeGeo} material={wakeMat} visible={false} frustumCulled={false} />
        <group ref={splashRef} visible={false}>{[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => <mesh key={i} frustumCulled={false}><coneGeometry args={[0.13, 1, 5]} /><meshBasicMaterial color="#f4fdff" transparent opacity={0.9} depthWrite={false} /></mesh>)}</group>
        <group ref={ringRef as any} visible={false}>{[0, 1, 2].map((i) => <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false} renderOrder={5}><ringGeometry args={[0.55, 1.45, 48, 1]} /><primitive object={swimRingMat()} attach="material" /></mesh>)}</group>
        <mesh position={[0, WATER_Y, WATER_Z - 400]} ref={waterRef} material={waterMat} frustumCulled={false} geometry={OCEAN_GEO} />
        <OceanFollow waterRef={waterRef} /><OceanSlices waterRef={waterRef} geo={OCEAN_GEO} /><ReflectionIllusion sim={sim} />
        <ContactShadows sim={sim} /><StaticShadows /><Boats sim={sim} /><Gulls sim={sim} /><Fish sim={sim} /><Whale sim={sim} /><MarineSnow /><Jellies /><Lilies sim={sim} />
        <SouthSea sim={sim} kit={SOUTH_SEA_KIT} />
        {/* Shifat 9:33 AM 'No reflection. Lock it. Remove any second render.': OceanScreenSpace (scene copy) and the reflection probe are not mounted */}
        <mesh geometry={SEABED_GEO} frustumCulled={false}><primitive object={seabedMat} attach="material" /></mesh>
        <mesh position={[0, (SEABED) / 2, WATER_Z - 0.3]}><boxGeometry args={[2 * HALF, -SEABED, 0.6]} /><primitive object={wallMat} attach="material" /></mesh>
        {/* the 200 m wall extensions past the city run along open sea: top kept 0.4 m under the still-water line (at 0 m it read as a dark line on the horizon from the island) */}
        {[-1, 1].map((s) => <mesh key={s} position={[s * (HALF + 100), (SEABED + WATER_Y - 0.4) / 2, WATER_Z - 0.3]}><boxGeometry args={[200, WATER_Y - 0.4 - SEABED, 0.6]} /><primitive object={wallMat} attach="material" /></mesh>)}
        {enemySet.map((p, k) => <instancedMesh key={k} ref={(r) => { if (r && enMeshes.current[k] !== r) { enMeshes.current[k] = r; attachInk(r); } }} args={[p.geo, p.mat, 48]} frustumCulled={false} />)}
        <instancedMesh ref={cores} onUpdate={(o) => o.layers.enable(SELECTIVE_BLOOM_LAYER)} args={[undefined, undefined, 18]} frustumCulled={false}><icosahedronGeometry args={[1.3, 1]} /><meshBasicMaterial color="#ffd23f" transparent opacity={0.5} blending={THREE.NoBlending} /></instancedMesh>
        <instancedMesh ref={glows} onUpdate={(o) => o.layers.enable(SELECTIVE_BLOOM_LAYER)} args={[undefined, undefined, 18]} frustumCulled={false}><sphereGeometry args={[3.0, 10, 8]} /><meshBasicMaterial color="#ffb347" transparent opacity={0.22} blending={THREE.AdditiveBlending} depthWrite={false} /></instancedMesh>
    </>;
}
export { gsap, resetSim };
