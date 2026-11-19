import * as THREE from 'three';
import { buildings } from './sim';

const DBG = !!(import.meta as any).env.VITE_DBG;   // stills harness only: a DEBUG build can sweep the wrist roll

/*
 * Wall-run body pose (Shifat, Nov 19: "see this" - the Unreal mannequin wall-run, `downloads/wr-opt-c2.png`).
 *
 * What the pose has to read on screen:
 *   - the body is one ~45 deg diagonal out of the facade: the planted foot on the wall, then hips, torso and head
 *     carried up and out over open air (the cyan mark he drew on his own still);
 *   - the LOWER BODY is the game's own running clip, not a hand-built stride: the `run` clip keeps playing and this
 *     pose only rolls the whole body onto that diagonal, so the legs cycle in exactly the sprint he already runs -
 *     the tilted plane puts the wall-side foot down on the facade and swings the outer leg out into open air;
 *   - the wall-side arm reaches out and a little up toward the facade with an open hand, clearly in the gap between
 *     the torso and the wall (his mannequin reference); the outer arm pumps at the elbow beside the ribs;
 *   - the pelvis and chest counter-twist a little through the stride (a runner's axial rotation, not a passive
 *     sideways lean).
 *
 * `BODY.hipClear` is what makes the diagonal work: the roll points the body's own "down" 45 deg into the facade, so
 * the hip has to stand off far enough that the running legs reach the wall surface instead of through it. The scene
 * pushes the skinned hull out of walls, so a body sitting too close would be shoved clear of the wall every frame.
 */

/** The parts of the rig this pose drives. */
export interface WallRunRig {
    root: THREE.Object3D;
    poseRoot: THREE.Object3D;
    b: Record<string, THREE.Bone>;
}

/** Body targets: radians for rotations, metres for lengths. */
const BODY = {
    // Shifat Nov 19, the cyan line on his still: the whole body is one ~45 deg diagonal off the facade - planted foot on
    // the wall, hips, torso and head carried out over open air. The lean is split between the pose root (the long
    // diagonal) and the spine chain (the runner's stretch), so it reads as a body axis, not a bent neck.
    roll: 0.60,        // 34 deg, outward, away from the facade (pose root)
    pitch: 0.10,       // forward lean along the run
    hipClear: 0.95,    // metres the hip keeps outside the facade - the hips ride the diagonal, so they sit closer than
                       // the upright brace pose did; the torso above them is what travels out
    spineRoll: 0.06,   // hips + spine, 3.4 deg each
    chestRoll: 0.055,  // chest, 3.2 deg - the three together add ~10 deg to the root's 34 deg
    twist: 0.14,       // pelvis / chest counter-twist through the stride
    headUp: 0.26,      // keeps the eyes up the wall instead of at the masonry
} as const;

/** The run clip's cycle rate in cycles per second of clip time (20 frames at 30 fps). */
const RUN_CLIP_RATE = 30 / 20;

/** The wall-side boot is planted this far off the facade when the running cycle would push it closer. */
const FOOT_PLANT = { gap: 0.12 } as const;

/** The pose's total sideways lean, in radians: the root diagonal plus the spine chain. 0.775 rad = 44.4 deg. */
export const WALLRUN_LEAN = BODY.roll + 2 * BODY.spineRoll + BODY.chestRoll;

/*
 * Arms, from Shifat's mannequin reference (`attachments/2026-11-19/...11204139...jpg`): the wall-side arm reaches out
 * toward the facade and slightly up, hand open, held in the gap between the torso and the wall where it reads in
 * silhouette from behind; the outer arm is bent at the elbow beside the ribs, pumping with the stride.
 *
 * Both are posed by world-space targets measured from the shoulder, so the direction of the arm follows where the
 * hand goes rather than how a shoulder rotation happens to compose with the 45 deg body roll.
 */

/** Wall-side arm: reaching out toward the facade and a little up, soft elbow, open hand in the wall gap. */
const WALL_ARM = {
    in: 0.80,          // metres of the shoulder's stand-off it reaches back toward the facade: the hand stays ~0.45 m
                       // off the wall, out in the gap where it is visible from behind (and clear of clipping)
    rise: 0.30,        // metres above the shoulder - "out and slightly up", the hand at about head height
    lead: 0.18,        // metres ahead along the run: the arm reaches slightly forward, not straight out to the side
    swing: 0.06,       // stride sway along the run
    roll: 0.0,         // wrist roll about the forearm, turning the open palm toward the facade
    reach: 0.99,       // full arm length is offered; the bend comes from the resting distance
} as const;

/** Outer arm: sprint pump - bent elbow beside the ribs, hand swinging between the chest and the hip. */
const FREE_ARM = {
    down: 0.44,        // metres below the shoulder: the bent elbow keeps the hand at chest-to-waist height
    out: 0.24,         // metres away from the facade, clear of the ribs on the open side
    swing: 0.20,       // +/- metres of fore/aft pump along the run through the stride
    roll: 0.0,         // wrist roll about the forearm
    reach: 0.99,
} as const;

const _soleAxis = new THREE.Vector3(0, 1, 0);   // the foot's up axis; its sole faces the opposite way
const _handRollAxis = new THREE.Vector3(0, 0, 1);

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
const _shoulder2 = new THREE.Vector3();
const _armPole = new THREE.Vector3();
const _footPos = new THREE.Vector3();
const _hip = new THREE.Vector3();
const _hipFree = new THREE.Vector3();
const _target = new THREE.Vector3();
const _foot = new THREE.Vector3();
const _scratch = new THREE.Vector3();
const _scratch2 = new THREE.Vector3();

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
 * The middle joint is also held to a human hinge: it never overshoots past straight.
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
    const fwd = _scratch2.copy(frame.tangent).multiplyScalar(frame.travel);   // the way the hero is running

    // --- stride phase: the run clip's own cycle, so the arms pump with the legs it is playing --------
    // (the `run` clip is 20 frames at 30 fps, i.e. 1.5 cycles per second of clip time)
    const phase = ((clipTime * RUN_CLIP_RATE) % 1 + 1) % 1;
    const swing = Math.sin(phase * Math.PI * 2);          // -1..1 through the cycle, for the arms / twist

    // --- torso: the 45 deg diagonal, out over open air, twisted through the stride ------------------
    const poseRoot = rig.poseRoot;
    if (poseRoot) {
        poseRoot.rotation.z += (wallSide * BODY.roll - poseRoot.rotation.z) * weight;   // + = the top of the body falls AWAY from the facade
        poseRoot.rotation.x += (BODY.pitch - poseRoot.rotation.x) * weight;
    }
    blend(rig.b.hips, 'x', BODY.pitch * 0.45, weight);                          // the running clip's deep forward pitch is replaced
    blend(rig.b.spine, 'x', BODY.pitch * 0.5, weight);                          // by an upright back: a wall-runner is tall over the wall
    blend(rig.b.chest, 'x', BODY.pitch * 0.25, weight);
    blend(rig.b.hips, 'z', wallSide * BODY.spineRoll, weight);
    blend(rig.b.hips, 'y', wallSide * BODY.twist * swing, weight);          // pelvis leads with the stride
    blend(rig.b.spine, 'z', wallSide * BODY.spineRoll, weight);
    blend(rig.b.chest, 'z', wallSide * BODY.chestRoll, weight);
    blend(rig.b.chest, 'y', -wallSide * BODY.twist * 1.2 * swing, weight);  // chest counters the pelvis
    blend(rig.b.neck, 'x', -BODY.pitch * 0.5, weight);
    blend(rig.b.head, 'x', -BODY.pitch * 0.4 + BODY.headUp * 0.5, weight);
    blend(rig.b.head, 'y', wallSide * 0.16, weight);                        // eyes up the wall
    rig.root.updateWorldMatrix(true, true);

    // --- sit the body so its wall-side hip keeps its distance from the facade -------------------
    // The 45 deg roll points the body's own "down" into the facade, so this stand-off is what lets the running legs
    // reach the wall surface instead of through it (and keeps the scene's hull push-out at zero).
    if (boneWorld(rig.b.hips, _scratch)) {
        const err = BODY.hipClear - clearance(frame, _scratch);
        if (Math.abs(err) > 1e-3) {
            rig.root.position.addScaledVector(frame.normal, err * weight);
            rig.root.updateWorldMatrix(true, true);
        }
    }

    // --- wall-side arm: reaches out toward the facade and a little up, open hand in the wall gap ----
    if (boneWorld(rig.b['uarm' + wallSideName], _shoulder)) {
        _target.copy(_shoulder)
            .addScaledVector(frame.normal, -WALL_ARM.in)
            .addScaledVector(fwd, WALL_ARM.lead + WALL_ARM.swing * swing)
            .addScaledVector(_up, WALL_ARM.rise);
        // elbow hangs below the shoulder-to-hand line, so the forearm lifts out to the facade
        const pole = _armPole.copy(_up).multiplyScalar(-0.85).addScaledVector(fwd, -0.35).addScaledVector(frame.normal, 0.25);
        reachLimb(rig, 'uarm' + wallSideName, 'farm' + wallSideName, 'hand' + wallSideName, _target, pole, WALL_ARM.reach, weight);
        // the wrist bends of the run clip are taken out so the hand carries on along the forearm (no hooked claw)
        settleWrist(rig, 'hand' + wallSideName, DBG && typeof (globalThis as any).__wallRoll === 'number' ? (globalThis as any).__wallRoll : WALL_ARM.roll, weight);
    }

    // --- outer arm: sprint pump, bent at the elbow beside the ribs ---------------------------------
    if (boneWorld(rig.b['uarm' + freeSideName], _shoulder2)) {
        _target.copy(_shoulder2)
            .addScaledVector(frame.normal, FREE_ARM.out)
            .addScaledVector(fwd, FREE_ARM.swing * swing)
            .addScaledVector(_up, -FREE_ARM.down);
        // elbow breaks back and out: the arm reads as a pumping sprint arm, not a wing
        const pole = _armPole.copy(fwd).multiplyScalar(-0.9).addScaledVector(frame.normal, 0.35).addScaledVector(_up, -0.2);
        reachLimb(rig, 'uarm' + freeSideName, 'farm' + freeSideName, 'hand' + freeSideName, _target, pole, FREE_ARM.reach, weight);
        settleWrist(rig, 'hand' + freeSideName, DBG && typeof (globalThis as any).__freeRoll === 'number' ? (globalThis as any).__freeRoll : FREE_ARM.roll, weight);   // clean line through the wrist on the pumping arm too
    }

    // --- wall-side foot: the facade is its floor -------------------------------------------------
    // The run clip is a ground cycle and its ankle is dragged across the body's midline as it swings, which - on the 45 deg
    // diagonal - would carry the boot through the wall. Kept exactly as the clip has it everywhere else, the wall-side leg
    // is only re-aimed where the boot would come closer than `FOOT_PLANT.gap`: the sole lands on the facade on that beat of
    // the stride, which is the contact the reference shows. The ankle is also rolled so the sole, not the toe, is what
    // faces the wall.
    if (boneWorld(rig.b['foot' + wallSideName], _footPos)) {
        const gap = clearance(frame, _footPos);
        if (gap < FOOT_PLANT.gap) {
            _target.copy(_footPos).addScaledVector(frame.normal, FOOT_PLANT.gap - gap);   // same place along the run, out to the gap
            // knee hinges forward along the run, so the leg folds the way a runner's does under the body
            _armPole.copy(fwd).multiplyScalar(0.92).addScaledVector(frame.normal, 0.30).addScaledVector(_up, 0.10);
            reachLimb(rig, 'thigh' + wallSideName, 'shin' + wallSideName, 'foot' + wallSideName, _target, _armPole, 0.995, weight);
        }
        const near = THREE.MathUtils.clamp((0.42 - gap) / 0.24, 0, 1);
        if (near > 0.01) faceAxis(rig.b['foot' + wallSideName], _soleAxis, frame.normal, weight * near);   // sole to the wall
    }
}

/**
 * Takes the wrist bends back out of the hand (the run clip curls it for ground running, and on the IK'd forearm that
 * curl reads as a hooked, drooping claw), then rolls the palm about the forearm's own line - a wrist roll, never a
 * bend - so the open hand can be turned toward the facade while it keeps the forearm's line.
 */
function settleWrist(rig: WallRunRig, name: string, roll: number, weight: number): void {
    const hand = rig.b[name];
    const farm = rig.b['farm' + name.slice(-1)];
    if (!hand || !farm) return;
    hand.quaternion.slerp(_identityQ, weight);                 // hand straight on the forearm
    if (!roll) return;
    rig.root.updateWorldMatrix(true, true);
    farm.getWorldPosition(_wrist);
    hand.getWorldPosition(_end);
    _axis.copy(_end).sub(_wrist);                              // the forearm's line
    if (_axis.lengthSq() < 1e-8) return;
    _axis.normalize();
    hand.getWorldQuaternion(_worldQ);
    _deltaQ.setFromAxisAngle(_axis, roll * weight);
    _worldQ.premultiply(_deltaQ);
    hand.parent!.getWorldQuaternion(_parentQ);
    _localQ.copy(_parentQ).invert().multiply(_worldQ);
    hand.quaternion.copy(_localQ);
}
