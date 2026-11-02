import * as THREE from 'three';

/* Hero traversal body motion (Shifat Nov 2 1:47 PM: "Learn animations from this", Ultimate Spider-Man PS2 night swinging; notes in files/anim_ref/notes.md).
   Procedural layer on top of the existing rig: it only moves the body (poseRoot pitch/roll + bones). Physics, inputs, timings and hitboxes are untouched.
   SWING (reference 11.2-12.6 s, 20.0-20.9 s, 21.6-22.7 s): the body hangs from the line hand and pendulums with the rope, lagging it (spring), so right after
   the attach it is still laid out along the velocity; legs trail back on the down-swing and whip forward with knees up on the up-swing, torso leaning back. */

type TV = { on: boolean; w: number; p: number; pv: number; r: number; rv: number; lg: number; lgv: number; bw: number };
const tv = (rig: any): TV => rig.__tv || (rig.__tv = { on: false, w: 0, p: 0, pv: 0, r: 0, rv: 0, lg: 0, lgv: 0, bw: 0 });
const cl = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const sstep = (x: number) => { x = cl(x, 0, 1); return x * x * (3 - 2 * x); };
// damped spring, sub-stepped so the 100 ms frame cap stays stable
function spring(x: number, v: number, tgt: number, k: number, c: number, dt: number): [number, number] {
    const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
    for (let i = 0; i < n; i++) { v += (k * (tgt - x) - c * v) * h; x += v * h; }
    return [x, v];
}
const PIVOT_Y = 1.3;   // rotate the body about the chest (where it hangs from the arms), not the feet
const _e0 = new THREE.Euler(0, 0, 0, 'ZXY'), _v0 = new THREE.Vector3(), _v1 = new THREE.Vector3();

function swinging(sim: any) {
    return !!sim.web && !sim.ground && !sim.swim && !sim.wall && !sim.glideOn && !sim.mv && !sim.flip && !sim.slam && !((sim.snareT || 0) > 0);
}

/** after applyHeroRootPose has set the plain lean/bank: swing pitch/roll from the rope, blended in, pivot-compensated */
export function traversalRoot(sim: any, rig: any, dt: number, scale: number) {
    const T = tv(rig), pr = rig.poseRoot as THREE.Group, root = rig.root as THREE.Group;
    const h = Math.min(dt, 0.1), sw = swinging(sim);
    const lean0 = pr.rotation.x, bank0 = pr.rotation.z;
    if (sw) {
        const a = sim.anchor, q = sim.pos, ang = sim.ang;
        const dx = a[0] - q[0], dy = a[1] - q[1], dz = a[2] - q[2], l = Math.hypot(dx, dy, dz) || 1;
        const fx = Math.sin(ang), fz = Math.cos(ang);
        const nf = (dx * fx + dz * fz) / l, nr = (dx * fz - dz * fx) / l, nu = dy / l;
        const tp = cl(Math.atan2(nf, Math.max(0.05, nu)), -1.2, 1.35);           // top of the body toward the anchor
        const tr = cl(-Math.atan2(nr, Math.max(0.25, nu)) * 0.7, -0.55, 0.55);    // hang toward the anchor sideways too
        if (!T.on) { T.on = true; if (T.w < 0.05) { T.p = lean0; T.r = bank0; T.pv = 0; T.rv = 0; } }
        [T.p, T.pv] = spring(T.p, T.pv, tp, 42, 7.5, h);   // ~6.5 rad/s, under-damped: lags the rope and overshoots a little (follow-through)
        [T.r, T.rv] = spring(T.r, T.rv, tr, 30, 8, h);
        T.w += (1 - T.w) * Math.min(1, h * 14);
    } else {
        T.on = false;
        T.w += (0 - T.w) * Math.min(1, h * 7);
        if (T.w < 0.002) T.w = 0;
    }
    const w = T.w;
    if (w <= 0) return;
    _e0.set(lean0, 0, bank0, 'ZXY'); _v0.set(0, PIVOT_Y, 0).applyEuler(_e0);
    pr.rotation.x = lean0 + (T.p - lean0) * w; pr.rotation.z = bank0 + (T.r - bank0) * w;
    _v1.set(0, PIVOT_Y, 0).applyEuler(pr.rotation);
    _v0.sub(_v1).multiplyScalar(scale).applyAxisAngle(THREE.Object3D.DEFAULT_UP, root.rotation.y);
    root.position.add(_v0);
}

const _q = new THREE.Quaternion(), _eb = new THREE.Euler();
function setB(b: THREE.Bone | undefined, x: number, y: number, z: number, w: number) {
    if (!b) return; _eb.set(x, y, z); _q.setFromEuler(_eb); b.quaternion.slerp(_q, w);
}
const _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3(), _d = new THREE.Vector3(), _aq = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _pqi = new THREE.Quaternion(), _id = new THREE.Quaternion();
function aim(bone: THREE.Bone, child: THREE.Object3D, target: THREE.Vector3, w: number) {
    bone.getWorldPosition(_p1); child.getWorldPosition(_p2); _p2.sub(_p1).normalize(); _d.copy(target).sub(_p1).normalize();
    _aq.setFromUnitVectors(_p2, _d); if (w < 1) _aq.slerp(_id, 1 - w);
    bone.parent!.getWorldQuaternion(_pq); _pqi.copy(_pq).invert();
    bone.quaternion.premultiply(_pqi.multiply(_aq).multiply(_pq));
}
const _tg = new THREE.Vector3();

/** last bone pass before combatPose: swing body pose (bones only) */
export function traversalBones(sim: any, rig: any, dt: number) {
    const T = tv(rig), B = rig.b, h = Math.min(dt, 0.1), sw = swinging(sim);
    T.bw += ((sw ? 1 : 0) - T.bw) * Math.min(1, h * (sw ? 14 : 8));
    if (T.bw < 0.003) { T.bw = 0; T.lg = 0; T.lgv = 0; return; }
    const v = sim.vel, up = cl(v[1] / 9, -1, 1);
    // legs: trail back while dropping into the swing, whip forward (knees up) as it rises past the bottom; the spring adds the lag + overshoot
    const lt = up > 0 ? -1.4 * sstep(up) : 0.8 * sstep(-up);
    if (sw) [T.lg, T.lgv] = spring(T.lg, T.lgv, lt, 70, 9, h);
    const w = T.bw, lg = T.lg, fwd = Math.max(0, -lg) / 1.4, back = Math.max(0, lg) / 0.8;
    setB(B.thighR, lg - 0.06, 0, 0.06, w); setB(B.thighL, lg + 0.1, 0, -0.06, w);
    setB(B.shinR, 0.22 + fwd * 1.25 + back * 0.25, 0, 0, w); setB(B.shinL, 0.3 + fwd * 1.1 + back * 0.35, 0, 0, w);
    setB(B.spine, -0.16 + fwd * 0.42, 0, 0, w); setB(B.chest, -0.08 + fwd * 0.2, 0, 0, w);
    setB(B.hips, 0, 0, 0, w);
    const pr = rig.poseRoot as THREE.Group;
    setB(B.head, cl(-pr.rotation.x * 0.55, -0.7, 0.7) + 0.12, 0, 0, w);
    // arms: line hand reaches the anchor; the free arm balances out to the side and comes up to the line on the rise (both hands, ref 12.0-12.5 s)
    const rLine = sim.swings % 2 === 1, line = rLine ? 'R' : 'L', free = rLine ? 'L' : 'R', so = rLine ? -1 : 1;
    setB(B['uarm' + line], -2.6, 0, 0, w); setB(B['farm' + line], -0.15, 0, 0, w);
    setB(B['uarm' + free], 0.35 - fwd * 0.4, 0, so * (0.95 - fwd * 0.3), w); setB(B['farm' + free], -0.6, 0, 0, w);
    if (!sim.web) return;
    rig.root.updateWorldMatrix(true, true);
    _tg.set(sim.anchor[0], sim.anchor[1], sim.anchor[2]);
    aim(B['uarm' + line], B['farm' + line], _tg, w); rig.root.updateWorldMatrix(true, true);
    aim(B['farm' + line], B['hand' + line], _tg, w);
    const rf = w * 0.75 * sstep(up * 1.4);
    if (rf > 0.02) { rig.root.updateWorldMatrix(true, true); aim(B['uarm' + free], B['farm' + free], _tg, rf); rig.root.updateWorldMatrix(true, true); aim(B['farm' + free], B['hand' + free], _tg, rf); }
}
