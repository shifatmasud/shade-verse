import * as THREE from 'three';

/*
 * SLINGSHOT - the two-hand web pull (trigger: tap web / RMB / Shift; runs on `sim.spring`).
 *
 * References (Shifat, Nov 18 - his exact visual target):
 *   - Spider-Man 2 slingshot coil, rear view: the spine is dead centre, the hips are low, both knees are tucked
 *     up and mirrored, both fists hold their own line, and nothing of the body leans off the pull axis;
 *   - the same move through the launch: the body stretches out ALONG the pull line, back arched, head up into it,
 *     legs trailing together with the toes pointed, both arms locked on the anchor.
 *
 * What the pose has to get right, and what used to break it:
 *   - CENTRED. The whole body is built from mirrored numbers only: hips, spine and chest carry pitch and nothing
 *     else (no roll, no twist), and both legs get the same angles with opposite lateral splay. The old pose shared
 *     its look with the frozen mid-frame of the stock air clip, whose hips are rolled 11 degrees and whose spine is
 *     twisted 15 - that is the sideways lean. The scene now keeps that clip off the body for the whole pull.
 *   - BOTH FISTS ON THE LINE. The aim used to be applied before the torso and limb layers, which then rotated the
 *     shoulders out from under it (measured 45-75 degrees off, and asymmetric between the two arms). `aimHandsOnLine`
 *     is the LAST thing that writes an arm bone, so the upper arm and the forearm of each side point at the anchor.
 *   - ANTICIPATION, THEN THE YANK. A held coil for the first ~90 ms (knees up, chest curled, fists high) that
 *     releases into the extension along the line.
 *   - NO SNAP AT THE END. The pose keeps a weight of its own that eases out over `EXIT` after the pull, instead of
 *     handing the body straight to the air pose (which used to read as falling upwards).
 */

/** Timing of the move, in seconds. `DUR` matches the countdown `sim.ts` starts on `sim.spring`. */
export const SLINGSHOT = {
    DUR: 0.4,        // sim.spring counts down from here
    COIL: 0.09,      // the anticipation beat is held this long after the trigger
    STRETCH: 0.22,   // ...and the body is fully extended along the line by here
    EXIT: 0.5,       // the pose hands over to the air pose over this long after the pull ends
    AIM_IN: 0.05,    // the fists reach the line over the first frames of the pull
    TETHER_IN: 0.09, // the two lines shoot out over this long (Scene.tsx draws them)
} as const;

/** The parts of the rig this pose drives. */
export interface SlingshotRig {
    root: THREE.Object3D;
    b: Record<string, THREE.Bone>;
}

/** The body at full coil and at full stretch, in radians. Every value mirrors to the other side unchanged. */
const COIL = {
    hipFlex: -1.02,  // knee driven up in front of the hip
    kneeBend: 1.62,  // shin folded back (~85 deg at the knee)
    ankle: -0.26,    // toes down
    kneeOut: 0.20,   // knees apart, the braced squat of the reference
    pelvis: -0.06,   // pelvis tucked under
    spine: 0.26,     // chest curled over the line
    chest: 0.13,
    head: -0.04,     // eyes already up the line
} as const;

const STRETCH = {
    hipFlex: 0.28,   // legs trailing behind the pull
    kneeBend: 0.16,  // nearly straight
    ankle: -0.42,    // toes pointed
    kneeOut: 0.05,   // legs together
    pelvis: 0.06,
    spine: -0.15,    // back arched into the pull
    chest: -0.07,
    head: -0.30,     // head up toward the anchor
} as const;

type SlingshotState = { w: number };
const state = (rig: any): SlingshotState => rig.__slingshot || (rig.__slingshot = { w: 0 });

const cl = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const sstep = (x: number) => { x = cl(x, 0, 1); return x * x * (3 - 2 * x); };

const _t = new THREE.Vector3(), _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3();
const _dir = new THREE.Vector3(), _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _pqi = new THREE.Quaternion(), _id = new THREE.Quaternion();

/** Turn a bone so its segment (bone -> child) points at a world target, blended in by `w`. */
function aimBone(bone: THREE.Bone, child: THREE.Object3D, target: THREE.Vector3, w: number) {
    bone.getWorldPosition(_p0); child.getWorldPosition(_p1); _p1.sub(_p0).normalize(); _dir.copy(target).sub(_p0).normalize();
    _q.setFromUnitVectors(_p1, _dir); if (w < 1) _q.slerp(_id, 1 - w);
    bone.parent!.getWorldQuaternion(_pq); _pqi.copy(_pq).invert();
    bone.quaternion.premultiply(_pqi.multiply(_q).multiply(_pq));   // world rotation -> this bone's local space
}

/**
 * Both fists locked on the pull line: each upper arm and forearm points at the anchor, so both arms lie on the
 * line and stay symmetric about the sagittal plane. Call this LAST in the frame - it must be the final write to an
 * arm bone, or whichever layer runs after it takes the arms off the line again.
 */
export function aimHandsOnLine(rig: SlingshotRig, target: ArrayLike<number>, weight = 1) {
    if (weight <= 0.001) return;
    rig.root.updateWorldMatrix(true, true);
    _t.set(target[0], target[1], target[2]);
    for (const side of ['L', 'R'] as const) {
        aimBone(rig.b['uarm' + side], rig.b['farm' + side], _t, weight); rig.root.updateWorldMatrix(true, true);
        aimBone(rig.b['farm' + side], rig.b['hand' + side], _t, weight); rig.root.updateWorldMatrix(true, true);
    }
}

/** Where the fists are relative to the anchor: the angle of each arm against the line (deg). */
export function aimError(rig: SlingshotRig, target: ArrayLike<number>) {
    rig.root.updateWorldMatrix(true, true);
    _t.set(target[0], target[1], target[2]);
    const read = (side: 'L' | 'R') => {
        const u = rig.b['uarm' + side].getWorldPosition(new THREE.Vector3());
        const f = rig.b['farm' + side].getWorldPosition(new THREE.Vector3());
        const h = rig.b['hand' + side].getWorldPosition(new THREE.Vector3());
        const off = (a: THREE.Vector3, b: THREE.Vector3) => {
            const d = new THREE.Vector3().subVectors(b, a).normalize();
            return Math.acos(cl(d.dot(new THREE.Vector3().subVectors(_t, a).normalize()), -1, 1)) * 180 / Math.PI;
        };
        return { uarm: off(u, f), farm: off(f, h), arm: off(u, h), gap: h.distanceTo(_t) };
    };
    return { L: read('L'), R: read('R') };
}

/**
 * How much of the slingshot owns the body this frame: 1 through the pull, easing out over `EXIT` after it, so the
 * launch pose is carried into the air instead of snapping to the freefall pose while the hero is still climbing.
 */
export function slingshotWeight(sim: any, rig: any, dt: number): number {
    const S = state(rig);
    const on = (sim.spring || 0) > 0 && !sim.ground && !sim.swim && !sim.wall;
    const k = on ? 45 : 3;   // in over a frame (the coil lands with the pull), out over ~1/3 s
    S.w += ((on ? 1 : 0) - S.w) * Math.min(1, dt * k);
    if (S.w < 0.002) S.w = 0;
    return S.w;
}

const _e = new THREE.Euler();
function setB(b: THREE.Bone | undefined, x: number, y: number, z: number, w: number) {
    if (!b || w <= 0) return;
    b.quaternion.slerp(_q.setFromEuler(_e.set(x, y, z)), w);
}

/**
 * The slingshot body: a held coil that releases into an extension along the pull line. Legs, pelvis, spine, chest
 * and head only - the arms belong to `aimHandsOnLine`.
 */
export function slingshotBones(sim: any, rig: SlingshotRig, weight: number) {
    if (weight <= 0.01) return;
    const B = rig.b, u = cl(SLINGSHOT.DUR - (sim.spring || 0), 0, SLINGSHOT.DUR);
    const c = 1 - sstep((u - SLINGSHOT.COIL) / (SLINGSHOT.STRETCH - SLINGSHOT.COIL));   // 1 = coil, 0 = stretched
    const at = (coil: number, stretch: number) => stretch + (coil - stretch) * c;
    const k = weight;
    for (const side of ['L', 'R'] as const) {
        const out = side === 'R' ? 1 : -1;   // mirrored lateral splay: the only left/right difference in the pose
        setB(B['thigh' + side], at(COIL.hipFlex, STRETCH.hipFlex), 0, out * at(COIL.kneeOut, STRETCH.kneeOut), k);
        setB(B['shin' + side], at(COIL.kneeBend, STRETCH.kneeBend), 0, 0, k);
        setB(B['foot' + side], at(COIL.ankle, STRETCH.ankle), 0, 0, k);
    }
    setB(B.hips, at(COIL.pelvis, STRETCH.pelvis), 0, 0, k);
    setB(B.spine, at(COIL.spine, STRETCH.spine), 0, 0, k);
    setB(B.chest, at(COIL.chest, STRETCH.chest), 0, 0, k);
    setB(B.head, at(COIL.head, STRETCH.head), 0, 0, k);
}
