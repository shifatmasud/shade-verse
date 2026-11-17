import * as THREE from 'three';
import { buildings } from './sim';

/*
 * Wall-run body pose (Shifat, Nov 17: the reference frame + the 10-keyframe contact sheet).
 *
 * What the pose has to read on screen:
 *   - the torso tips into the facade and the body hugs the wall instead of hovering beside it;
 *   - the wall-side palm is planted flat on the facade just ahead of and below the shoulder, elbow bent;
 *   - the wall-side foot plants on the facade under the hip and strides along the wall;
 *   - the free arm swings out to the balancing side;
 *   - the trailing leg is left behind, extended back and off the wall.
 *
 * Two things make the contacts actually land on the wall:
 *   - `sitOnWall` shifts the body along the wall normal until its wall-side shoulder grazes the facade.
 *     The scene pushes the skinned hull out of walls; without this the body is shoved ~0.5 m clear of the
 *     wall by that correction and every "planted" limb hangs beside it, which is the bug this fixes.
 *   - the hand and foot targets are taken from the shoulder and hip themselves (not from the physics
 *     centre), so they follow the body that is drawn rather than the collision proxy.
 */

/** The parts of the rig this pose drives. */
export interface WallRunRig {
    root: THREE.Object3D;
    poseRoot: THREE.Object3D;
    b: Record<string, THREE.Bone>;
}

/** Body targets: radians for rotations, metres for lengths. */
const BODY = {
    roll: 0.16,        // how far the torso tips into the wall
    pitch: 0.07,       // forward lean along the run
    clear: 0.20,       // metres the wall-side shoulder keeps outside the facade
    spineRoll: 0.03,   // the tip carries on up the spine
    chestRoll: 0.05,   // the shoulder leads the hip
    headUp: 0.16,      // keeps the eyes up instead of staring at the wall
} as const;

/** Wall-side hand: planted on the facade, just ahead of the shoulder, elbow bent. */
const WALL_ARM = {
    drop: 0.12,        // metres below the shoulder
    lead: 0.26,        // metres ahead along the run
    swing: 0.10,       // stride sway along the run
    gap: 0.07,         // stands the hand a little proud of the surface so the mesh does not cut in
    reach: 0.94,       // fraction of arm length the target is kept inside
} as const;

/** Wall-side foot: planted under the hip and striding along the wall. */
const WALL_LEG = {
    drop: 0.52,        // metres below the hip
    lead: 0.05,        // base position along the run
    stride: 0.30,      // +/- stride travel along the run
    lift: 0.12,        // stride rise and fall
    gap: 0.06,
    reach: 0.94,
} as const;

/** Trailing leg: left behind, extended back and off the wall on the balancing side. */
const TRAIL_LEG = {
    drop: 0.74,
    back: 0.44,        // metres behind the hip along the run
    out: 0.30,         // metres away from the facade
    lift: 0.10,
    reach: 0.94,
} as const;

/** Free arm keyed through the stride: out to the balancing side, swinging against the wall-side leg. */
const FREE_ARM_KEYS = [
    { upperX: 0.26, upperZ: 0.72, foreX: -0.50 },
    { upperX: 0.04, upperZ: 0.86, foreX: -0.38 },
    { upperX: -0.16, upperZ: 0.96, foreX: -0.30 },
    { upperX: 0.12, upperZ: 0.80, foreX: -0.46 },
] as const;

const STRIDE_RATE = 0.55;   // stride cycles per second of clip time

/** The facade the hero runs on: out-of-wall normal, run tangent and the surface coordinate. */
interface WallFrame {
    normal: THREE.Vector3;    // unit, pointing out of the wall
    tangent: THREE.Vector3;   // unit, horizontal, along the wall
    travel: number;           // +1 / -1, which way along the tangent the hero runs
    surface: number | null;   // facade coordinate on the normal axis
    axis: 0 | 2;              // 0 = an x-facing wall, 2 = a z-facing wall
    sign: number;             // which side of the box the facade is on
}

/** Reads the wall the hero is on out of the sim state. */
export function wallFrame(sim: any): WallFrame {
    const n = sim.wall as [number, number] | null;
    const normal = new THREE.Vector3(n ? n[0] : -1, 0, n ? n[1] : 0);
    if (normal.lengthSq() < 1e-6) normal.set(-1, 0, 0);
    normal.normalize();
    const tangent = new THREE.Vector3(-normal.z, 0, normal.x);
    const travel = Math.sign(sim.vel[0] * tangent.x + sim.vel[2] * tangent.z) || 1;
    const axis: 0 | 2 = Math.abs(normal.x) > 0.5 ? 0 : 2;
    const sign = (axis === 0 ? normal.x : normal.z) < 0 ? -1 : 1;
    const b = buildings[sim.wallB];
    const surface = b ? (axis === 0 ? (sign < 0 ? b.x0 : b.x1) : (sign < 0 ? b.z0 : b.z1)) : null;
    return { normal, tangent, travel, surface, axis, sign };
}

/** Metres a world point sits outside the facade (positive = clear of the wall). */
function clearance(frame: WallFrame, p: THREE.Vector3): number {
    if (frame.surface === null) return 0;
    return (p.getComponent(frame.axis) - frame.surface) * frame.sign;
}

/** Copies a world point onto the facade. */
function ontoWall(frame: WallFrame, p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    out.copy(p);
    if (frame.surface !== null) out.setComponent(frame.axis, frame.surface);
    return out;
}

/** World position of a bone (null when the rig does not have it). */
function boneWorld(bone: THREE.Bone | undefined, out: THREE.Vector3): THREE.Vector3 | null {
    if (!bone) return null;
    return bone.getWorldPosition(out);
}

/** Blend one local rotation axis of a bone toward a target angle. */
function blend(bone: THREE.Bone | undefined, axis: 'x' | 'y' | 'z', target: number, weight: number): void {
    if (!bone) return;
    bone.rotation[axis] += (target - bone.rotation[axis]) * weight;
}

const _identityQ = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _bend = new THREE.Vector3();
const _wrist = new THREE.Vector3();
const _joint = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _end = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _worldQ = new THREE.Quaternion();
const _parentQ = new THREE.Quaternion();
const _localQ = new THREE.Quaternion();
const _deltaQ = new THREE.Quaternion();
const _shoulder = new THREE.Vector3();
const _hip = new THREE.Vector3();
const _target = new THREE.Vector3();
const _trail = new THREE.Vector3();
const _scratch = new THREE.Vector3();

/** Turns a bone so the direction bone -> child points at `target` (world space). */
function aimBone(bone: THREE.Bone | undefined, child: THREE.Bone | undefined, target: THREE.Vector3, weight: number, root: THREE.Object3D): void {
    if (!bone || !child) return;
    bone.getWorldPosition(_from);
    child.getWorldPosition(_to);
    _to.sub(_from);
    _dir.copy(target).sub(_from);
    if (_to.lengthSq() < 1e-8 || _dir.lengthSq() < 1e-8) return;
    _to.normalize();
    _dir.normalize();
    _deltaQ.setFromUnitVectors(_to, _dir);
    if (weight < 1) _deltaQ.slerp(_identityQ, 1 - weight);
    bone.parent!.getWorldQuaternion(_parentQ);
    bone.quaternion.premultiply(_parentQ.clone().invert().multiply(_deltaQ).multiply(_parentQ));
    root.updateWorldMatrix(true, true);
}

/**
 * Two-bone IK: puts `end` on `target` with the middle joint on the side `pole` points to.
 * The target is first pulled inside the limb's reach, so a contact can never stretch the rig.
 */
function reachLimb(rig: WallRunRig, rootName: string, midName: string, endName: string, target: THREE.Vector3, pole: THREE.Vector3, reach: number, weight: number): void {
    const root = rig.b[rootName], mid = rig.b[midName], end = rig.b[endName];
    if (!root || !mid || !end) return;
    rig.root.updateWorldMatrix(true, true);
    root.getWorldPosition(_joint);
    mid.getWorldPosition(_mid);
    end.getWorldPosition(_end);
    const upper = _joint.distanceTo(_mid), lower = _mid.distanceTo(_end);
    _dir.copy(target).sub(_joint);
    let d = _dir.length();
    if (d < 1e-4) return;
    _dir.multiplyScalar(1 / d);
    d = THREE.MathUtils.clamp(d, Math.abs(upper - lower) + 0.01, (upper + lower) * reach);

    _pole.copy(pole).addScaledVector(_dir, -pole.dot(_dir));
    if (_pole.lengthSq() < 1e-5) _pole.copy(_up).addScaledVector(_dir, -_dir.y);
    _pole.normalize();

    // law of cosines: the middle joint sits `along` down the limb and `bend` off it toward the pole
    const along = (upper * upper - lower * lower + d * d) / (2 * d);
    const bend = Math.sqrt(Math.max(0, upper * upper - along * along));
    _bend.copy(_joint).addScaledVector(_dir, along).addScaledVector(_pole, bend);
    _wrist.copy(_joint).addScaledVector(_dir, d);

    aimBone(root, mid, _bend, weight, rig.root);
    aimBone(mid, end, _wrist, weight, rig.root);
}

/** Rotates a bone so one of its local axes points along a world direction (used for flat contacts). */
function faceAxis(bone: THREE.Bone | undefined, local: THREE.Vector3, world: THREE.Vector3, weight: number): void {
    const parent = bone?.parent;
    if (!bone || !parent) return;
    bone.getWorldQuaternion(_worldQ);
    _axis.copy(local).applyQuaternion(_worldQ).normalize();
    _deltaQ.setFromUnitVectors(_axis, world);
    _worldQ.premultiply(_deltaQ);
    parent.getWorldQuaternion(_parentQ);
    _localQ.copy(_parentQ).invert().multiply(_worldQ);
    bone.quaternion.slerp(_localQ, weight);
}

/**
 * Applies the wall-run pose on top of the running cycle.
 * `wallSide` is +1 when the facade is on the hero's right, -1 when it is on the left.
 */
export function applyWallRunPose(sim: any, rig: WallRunRig, weight: number, wallSide: number, clipTime: number): void {
    if (weight <= 0 || !sim.wall) return;
    const frame = wallFrame(sim);
    const wallSideName = wallSide > 0 ? 'R' : 'L';
    const freeSideName = wallSide > 0 ? 'L' : 'R';

    // --- torso: tip into the facade ---------------------------------------------------------------
    const poseRoot = rig.poseRoot;
    if (poseRoot) {
        poseRoot.rotation.z += (-wallSide * BODY.roll - poseRoot.rotation.z) * weight;
        poseRoot.rotation.x += (BODY.pitch - poseRoot.rotation.x) * weight;
    }
    blend(rig.b.hips, 'z', -wallSide * BODY.spineRoll, weight);
    blend(rig.b.spine, 'z', -wallSide * BODY.spineRoll, weight);
    blend(rig.b.chest, 'z', -wallSide * BODY.chestRoll, weight);
    blend(rig.b.neck, 'x', -BODY.pitch * 0.4, weight);
    blend(rig.b.head, 'x', -BODY.pitch * 0.6 + BODY.headUp * 0.4, weight);
    rig.root.updateWorldMatrix(true, true);

    // --- sit the body so its wall-side shoulder grazes the facade ---------------------------------
    // Keeps the scene's hull push-out at zero, so the planted hand and foot stay on the wall
    // instead of being shoved away together with the body.
    if (boneWorld(rig.b['uarm' + wallSideName], _shoulder)) {
        const err = BODY.clear - clearance(frame, _shoulder);
        if (Math.abs(err) > 1e-3) {
            rig.root.position.addScaledVector(frame.normal, err * weight);
            rig.root.updateWorldMatrix(true, true);
        }
    }

    // --- stride phase ------------------------------------------------------------------------------
    const keys = FREE_ARM_KEYS;
    const phase = ((((clipTime * STRIDE_RATE) % 1) + 1) % 1) * keys.length;
    const i = Math.floor(phase);
    const a = keys[i], b = keys[(i + 1) % keys.length], f = phase - i;
    const mix = (k: 'upperX' | 'upperZ' | 'foreX') => a[k] + (b[k] - a[k]) * f;
    const cycle = phase / keys.length * Math.PI * 2;

    // --- free / balancing arm ----------------------------------------------------------------------
    blend(rig.b['uarm' + freeSideName], 'x', mix('upperX'), weight);
    blend(rig.b['uarm' + freeSideName], 'z', -wallSide * mix('upperZ'), weight);
    blend(rig.b['farm' + freeSideName], 'x', mix('foreX'), weight);

    // --- wall-side hand: palm flat on the facade, elbow bent ---------------------------------------
    const shoulder = boneWorld(rig.b['uarm' + wallSideName], _shoulder);
    if (shoulder) {
        ontoWall(frame, shoulder, _target);
        _target.y += -WALL_ARM.drop;
        _target.addScaledVector(frame.tangent, WALL_ARM.lead * frame.travel + WALL_ARM.swing * Math.sin(cycle));
        _target.addScaledVector(frame.normal, WALL_ARM.gap);
        const pole = _scratch.copy(frame.normal).multiplyScalar(0.55).addScaledVector(frame.tangent, -0.35 * frame.travel).addScaledVector(_up, 0.85);
        reachLimb(rig, 'uarm' + wallSideName, 'farm' + wallSideName, 'hand' + wallSideName, _target, pole, WALL_ARM.reach, weight);
        faceAxis(rig.b['hand' + wallSideName], _handAxis, frame.normal, weight);   // palm flat on the surface
    }

    // --- wall-side foot: planted under the hip and striding along the wall --------------------------
    const hip = boneWorld(rig.b['thigh' + wallSideName], _hip);
    if (hip) {
        ontoWall(frame, hip, _target);
        _target.y += -WALL_LEG.drop + WALL_LEG.lift * Math.sin(cycle);
        _target.addScaledVector(frame.tangent, frame.travel * (WALL_LEG.lead + WALL_LEG.stride * Math.cos(cycle)));
        _target.addScaledVector(frame.normal, WALL_LEG.gap);
        const pole = _scratch.copy(frame.normal).multiplyScalar(0.85).addScaledVector(frame.tangent, frame.travel * 0.35).addScaledVector(_up, 0.55);
        reachLimb(rig, 'thigh' + wallSideName, 'shin' + wallSideName, 'foot' + wallSideName, _target, pole, WALL_LEG.reach, weight);
        faceAxis(rig.b['foot' + wallSideName], _soleAxis, frame.normal, weight);
    }

    // --- trailing leg: left behind, extended back and off the wall -----------------------------------
    if (hip) {
        ontoWall(frame, hip, _trail);
        _trail.y += -TRAIL_LEG.drop + TRAIL_LEG.lift * Math.sin(cycle);
        _trail.addScaledVector(frame.tangent, -frame.travel * (TRAIL_LEG.back - 0.08 * Math.cos(cycle)));
        _trail.addScaledVector(frame.normal, TRAIL_LEG.out);
        const pole = _scratch.copy(frame.normal).multiplyScalar(0.25).addScaledVector(_up, 0.85).addScaledVector(frame.tangent, -frame.travel * 0.35);
        reachLimb(rig, 'thigh' + freeSideName, 'shin' + freeSideName, 'foot' + freeSideName, _trail, pole, TRAIL_LEG.reach, weight);
    }
}

const _handAxis = new THREE.Vector3(0, 0, 1);   // the hand's long axis (fingers)
const _soleAxis = new THREE.Vector3(0, 1, 0);   // the foot's up axis; its sole faces the opposite way
