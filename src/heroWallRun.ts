import * as THREE from 'three';
import { buildings } from './sim';

/*
 * Wall-run body pose (Shifat, Nov 17: the reference frame + the 10-keyframe contact sheet; Nov 18: "study the
 * real images & videos first" - the legs folded up like a frog, so the stride is modelled on a real sprint).
 *
 * What the pose has to read on screen:
 *   - the body is a long diagonal into the facade: hips held well off the wall, torso tipped in, so the wall-side
 *     shoulder (not the hip) grazes it. The hip has to keep its distance or the legs have nowhere to extend to;
 *   - the legs run in the TILTED SAGITTAL plane of that diagonal - a forward/back scissor along the run tangent,
 *     never folded sideways under the pelvis. Knees hinge forward along the run (pole on the tangent), so the
 *     knee cap leads the stride instead of jutting out of the wall;
 *   - the wall-side leg strides on the facade (sole on the surface, foot travelling from ahead of the hip to
 *     well behind it), the other leg swings long and free on the balancing side;
 *   - the pelvis and chest counter-twist a little through the stride (a runner's axial rotation, not a passive
 *     sideways lean), and the wall-side palm stays planted ahead of the shoulder with the elbow bent.
 *
 * Two things make the contacts actually land on the wall:
 *   - `sitOnWall` shifts the body along the wall normal until its wall-side HIP sits at `BODY.hipClear` from the
 *     facade. The scene pushes the skinned hull out of walls; without this the body is shoved clear of the wall
 *     by that correction and every "planted" limb hangs beside it.
 *   - the hand and foot targets are taken from the shoulder and hip themselves (not from the physics centre), so
 *     they follow the body that is drawn rather than the collision proxy.
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

/** The pose's total sideways lean, in radians: the root diagonal plus the spine chain. 0.775 rad = 44.4 deg. */
export const WALLRUN_LEAN = BODY.roll + 2 * BODY.spineRoll + BODY.chestRoll;

/**
 * The stride, leg by leg. A wall-runner's two legs do different jobs at the same instant, so each has its own
 * gait instead of one cycle in mirror: the wall-side leg pushes long and straight down the wall (its foot stays
 * behind the hip through the stance), while the free leg drives forward with a lifted knee. That is the scissor
 * the chase camera has to read - two legs at different heights and different angles, never a pair of parallel
 * shins under the pelvis.
 */
interface LegGait {
    front: number;      // metres the foot reaches ahead of the hip at touchdown
    back: number;       // metres behind the hip at toe-off
    drop: number;       // metres below the hip through the stance
    stanceDrop: number; // the hip settles over the planted foot mid-stance
    heelUp: number;     // the heel lifts toward toe-off
    flightUp: number;   // how high the swing foot comes up under the hip
    flightOut: number;  // how far off the facade the swing foot travels
    base: number;       // this leg's own standing distance from the facade
    stance: number;     // share of the cycle this leg is in contact
}

/** Wall-side leg: the long pushing leg. It travels along the wall and stays behind the hip. */
const WALL_LEG: LegGait = {
    front: 0.26, back: 0.64, drop: 1.06, stanceDrop: 0.06, heelUp: 0.14,
    flightUp: 0.50, flightOut: 0.20, base: 0.20, stance: 0.52,
} as const;

/** Free leg: the driving leg. Knee comes up in front, then swings long behind at the push-off. */
const FREE_LEG: LegGait = {
    front: 0.72, back: 0.34, drop: 1.22, stanceDrop: 0.04, heelUp: 0.12,
    flightUp: 0.74, flightOut: 0.30, base: 0.58, stance: 0.44,
} as const;

const GAIT = {
    rate: 0.95,        // cycles per second of clip time (the run is ~1.6x faster now, so the stride keeps up)
    wallGap: 0.18,     // the ankle rides this far off the facade so the sole and toes land on it
} as const;

/** Wall-side hand: reaching across the gap toward the facade ahead of and above the shoulder, elbow bent. */
const WALL_ARM = {
    lead: 0.14,        // metres ahead along the run: the ref. brace arm reaches out sideways, barely ahead
    rise: 0.02,        // metres above the shoulder: on the 45 deg diagonal the shoulder is already high
    swing: 0.12,       // stride sway along the run
    gap: 0.09,         // wrist stands off the surface so the palm and fingers land ON it, not through it
    reach: 0.80,       // fraction of arm length the target is kept inside - the 45 deg body cannot plant the palm
} as const;

/** Free arm: counter-swing on the balancing side, elbow bent. */
const FREE_ARM = {
    swing: 0.62,       // +/- swing along the run (rad at the shoulder)
    out: 0.52,         // stays well out from the ribs so the free arm reads on the open side
    elbow: -1.35,      // bent ~77 deg, tucked back for balance (the reference's free arm)
} as const;

const _handAxis = new THREE.Vector3(0, 0, 1);   // the hand's long axis (fingers)
const _soleAxis = new THREE.Vector3(0, 1, 0);   // the foot's up axis; its sole faces the opposite way

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

/** Smoothstep, for the swing half of the stride (the foot accelerates off the wall and eases into touchdown). */
function smooth(x: number): number { return x * x * (3 - 2 * x); }

/**
 * One leg of the stride, in the plane defined by the run tangent and world up.
 * `phase` 0 = touchdown ahead of the hip; through the stance the foot travels back under and past the hip; then
 * the swing carries it up, forward and off the facade again. `out` is where the foot goes and how far off the
 * wall it travels.
 */
function gait(phase: number, leg: LegGait, out: { along: number; dy: number; dist: number }): void {
    const p = ((phase % 1) + 1) % 1;
    const contact = leg.stance;
    if (p < contact) {
        const u = p / contact;
        out.along = leg.front - (leg.front + leg.back) * u;
        out.dy = -leg.drop - leg.stanceDrop * Math.sin(Math.PI * u) + leg.heelUp * smooth(Math.max(0, (u - 0.7) / 0.3));
        out.dist = leg.base;
    } else {
        const u = (p - contact) / (1 - contact);
        const s = smooth(u);
        out.along = -leg.back + (leg.front + leg.back) * s;
        out.dy = -leg.drop + leg.flightUp * Math.sin(Math.PI * Math.min(1, u * 1.05)) - leg.heelUp * (1 - s);
        out.dist = leg.base + leg.flightOut * Math.sin(Math.PI * u);
    }
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

    // --- stride phase --------------------------------------------------------------------------
    const cyc = (clipTime * GAIT.rate) % 1;
    const phase = ((cyc % 1) + 1) % 1;
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
    // Keeps the scene's hull push-out at zero while leaving the legs room to extend (the whole point: a
    // shoulder welded to the facade folds both legs up under the pelvis).
    if (boneWorld(rig.b.hips, _scratch)) {
        const err = BODY.hipClear - clearance(frame, _scratch);
        if (Math.abs(err) > 1e-3) {
            rig.root.position.addScaledVector(frame.normal, err * weight);
            rig.root.updateWorldMatrix(true, true);
        }
    }

    // --- free / balancing arm: counter-swings the wall-side leg -------------------------------
    const freeSwing = -swing * FREE_ARM.swing;
    blend(rig.b['uarm' + freeSideName], 'x', freeSwing, weight);
    blend(rig.b['uarm' + freeSideName], 'z', -wallSide * (FREE_ARM.out + 0.25 * Math.cos(phase * Math.PI * 2)), weight);
    blend(rig.b['farm' + freeSideName], 'x', FREE_ARM.elbow, weight);

    // --- wall-side hand: palm on the facade ahead of and above the shoulder, elbow bent --------
    if (boneWorld(rig.b['uarm' + wallSideName], _shoulder)) {
        ontoWall(frame, _shoulder, _target);
        _target.y += WALL_ARM.rise + WALL_ARM.swing * 0.5 * swing;
        _target.addScaledVector(fwd, WALL_ARM.lead + WALL_ARM.swing * swing);
        _target.addScaledVector(frame.normal, WALL_ARM.gap);
        // elbow points down and back along the run, so the arm reads as a brace, not a wing
        const pole = _scratch.copy(_up).multiplyScalar(-0.75).addScaledVector(fwd, -0.25).addScaledVector(frame.normal, 0.60);   // elbow hangs out and down
        reachLimb(rig, 'uarm' + wallSideName, 'farm' + wallSideName, 'hand' + wallSideName, _target, pole, WALL_ARM.reach, weight);
        faceAxis(rig.b['hand' + wallSideName], _handAxis, frame.normal, weight);   // palm flat on the surface
    }

    // --- legs: the scissor, each leg on its own gait ------------------------------------------
    if (boneWorld(rig.b['thigh' + wallSideName], _hip)) {
        // wall-side leg: pushing long down the facade through its stance, then swinging through
        gait(phase, WALL_LEG, _gaitWall);
        ontoWall(frame, _hip, _target);
        _target.y += _gaitWall.dy;
        _target.addScaledVector(fwd, _gaitWall.along);
        _target.addScaledVector(frame.normal, GAIT.wallGap + (_gaitWall.dist - WALL_LEG.base));
        // knee hinges forward along the run, a touch out of the wall: the cap leads the stride
        _pole.copy(fwd).multiplyScalar(0.92).addScaledVector(frame.normal, 0.34).addScaledVector(_up, 0.12);
        reachLimb(rig, 'thigh' + wallSideName, 'shin' + wallSideName, 'foot' + wallSideName, _target, _pole, 0.98, weight);
        // sole stays on the facade while the foot is planted, and rolls off as it leaves the wall
        faceAxis(rig.b['foot' + wallSideName], _soleAxis, frame.normal, weight * (1 - Math.min(1, (_gaitWall.dist - WALL_LEG.base) / 0.12)));

        // free leg: the driving leg, half a cycle out of phase, knee up in front.
        // Its hip is the other one: targets measured from the wall-side hip would sit a hip-width too far off.
        gait(phase + 0.5, FREE_LEG, _gaitFree);
        const hipFree = boneWorld(rig.b['thigh' + freeSideName], _hipFree) ?? _hip;
        ontoWall(frame, hipFree, _foot);
        _foot.y += _gaitFree.dy;
        _foot.addScaledVector(fwd, _gaitFree.along);
        _foot.addScaledVector(frame.normal, _gaitFree.dist);
        _pole.copy(fwd).multiplyScalar(0.92).addScaledVector(frame.normal, 0.30).addScaledVector(_up, 0.10);
        reachLimb(rig, 'thigh' + freeSideName, 'shin' + freeSideName, 'foot' + freeSideName, _foot, _pole, 0.98, weight);
    }
}


const _gaitWall = { along: 0, dy: 0, dist: 0 };
const _gaitFree = { along: 0, dy: 0, dist: 0 };
