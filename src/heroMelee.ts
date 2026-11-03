import * as THREE from 'three';

/* Melee whole-body drive (combat feel pass, Shifat Nov 2 2:58 PM "Hero combat animation?"). Layered on the keyed combo poses (Scene.tsx POSES),
   which already turn the shoulders and arms; this adds what the poses could not: the body's weight. Body only: the sim's move clock, hit frame,
   reach, hitbox, damage and input buffering are untouched; the root offset is visual (collision stays at the sim position).
   One drive curve per move, d(t): wind-up -A (weight back, load), a fast snap to +1 on the hit frame (weight onto the front foot, lunge,
   sit into it), a short hold, then recover to 0 by the end of the move. Low-passed so chained moves flow instead of popping.
   Per hit (reads different on purpose):
   - 1 jab: lead step, quick, light: lunge 0.2 m, lean 0.17 rad, shoulders +0.2 rad into it, a slight rear-heel lift.
   - 2 cross: the big one: lunge 0.34 m, lean 0.26 rad, hips sink 10 cm, rear knee drives in and the rear heel comes up (pivot), shoulders turn hard.
   - 3 spin hook kick: crouch to load, then a small rise (7 cm) off the floor through the kick, counter-lean away.
   - 4 launcher: deep load, then rises up with the uppercut.
   - 6 web pull: lean into it; 7 web yank: weight thrown back, pulling. 5 (air spike) is left to its pose. */
type Drive = { L: number; D: number; lean: number; A: number; twist: number; heel: number; lead: number; hold: number };
const DRIVE: Record<number, Drive> = {
    1: { L: 0.2, D: 0.05, lean: 0.17, A: 0.45, twist: 0.2, heel: 0.35, lead: 0.16, hold: 0.03 },
    2: { L: 0.34, D: 0.1, lean: 0.26, A: 0.6, twist: -0.3, heel: 1, lead: 0.1, hold: 0.04 },
    3: { L: 0.06, D: 0, lean: 0, A: 0.25, twist: 0, heel: 0, lead: 0, hold: 0.06 },
    4: { L: 0.1, D: -0.08, lean: -0.1, A: 0.7, twist: 0, heel: 0, lead: 0, hold: 0.05 },
    6: { L: 0.12, D: 0.04, lean: 0.12, A: 0.4, twist: 0, heel: 0.5, lead: 0.1, hold: 0.04 },
    7: { L: -0.12, D: 0.05, lean: -0.14, A: 0.4, twist: 0, heel: 0, lead: 0, hold: 0.06 },
};
const ss = (x: number) => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };
function driveCurve(t: number, hit: number, dur: number, A: number, hold: number) {
    const pre = hit * 0.62;
    if (t < pre) return -A * ss(t / pre);
    if (t < hit) return -A + (1 + A) * ss((t - pre) / (hit - pre));
    if (t < hit + hold) return 1;
    return 1 - ss((t - hit - hold) / Math.max(0.05, dur * 0.95 - hit - hold));
}
/** called from combatPose after the keyed pose is applied (w = the combat pose weight) */
export function meleeBody(sim: any, rig: any, h: THREE.Object3D, dt: number, w: number, MOVES: Record<number, { dur: number; hit: number }>) {
    const st = rig.__md || (rig.__md = { d: 0, id: 0, sw: 1 }), mv = sim.mv, P = mv ? DRIVE[mv.id] : undefined;
    const tgt = mv && P ? driveCurve(mv.t, MOVES[mv.id].hit, MOVES[mv.id].dur, P.A, P.hold) : 0;
    if (mv && P && st.id !== mv.id) { st.id = mv.id; st.sw = 0; }   // a new move in the chain
    st.sw = Math.min(1, st.sw + dt / 0.06);
    // tracks the curve exactly (the snap lands ON the hit frame); only a chain switch or a move end blends (~60 ms) so nothing pops
    if (mv && P && st.sw >= 1) st.d = tgt; else st.d += (tgt - st.d) * Math.min(1, dt * 30);
    const D = DRIVE[st.id]; if (!D || Math.abs(st.d) < 0.004) return;
    const d = st.d * w, dp = Math.max(0, d), B = rig.b;
    const fx = Math.sin(sim.ang || 0), fz = Math.cos(sim.ang || 0);
    h.position.x += fx * D.L * d; h.position.z += fz * D.L * d;                       // weight shift / lunge (visual)
    if (B.hips) B.hips.position.y -= D.D * (d > 0 ? d : -d * 0.6);                    // sit into the strike (or load before a hop)
    if (B.spine) B.spine.rotation.x += D.lean * d;                                     // lean back on the wind-up, into the hit
    if (B.chest) B.chest.rotation.y += D.twist * d;                                    // shoulders cock further, then drive through
    if (D.heel && B.thighR && B.shinR) { B.thighR.rotation.x -= 0.22 * D.heel * dp; B.shinR.rotation.x += 0.5 * D.heel * dp; }   // rear knee in, heel up: the pivot
    if (D.lead && B.thighL) B.thighL.rotation.x -= D.lead * dp;                        // lead foot steps out
}

/* Charged Slam body (combat feel pass, Shifat Nov 2 2:58 PM). Was: the impact frame read as a face-plant: the slam's forward fold plus the
   root's air lean and landing tip (up to ~0.5 rad) laid the body nearly flat, and with the hips held at standing height the bent knees lifted
   the feet off the ground. Now the slam owns the body's pitch (blended by the combat weight) and drops the hips into each crouch:
   charge = sinks deeper as it charges; crouch = loaded; rise = opening up; apex = arched back for the hammer (own pose in Scene.tsx);
   dive = pitched ~0.5 rad down onto the target; impact = upright-ish three-point superhero landing (front knee up, back knee down, fist planted,
   head up) with a deep compression that holds ~0.12 s, then rises to guard. Phases, timings, radius, damage and input are the sim's, unchanged. */
const SLAM_PITCH = [0.06, 0.16, -0.1, -0.22, 0.5, 0.12];
export function slamBody(sim: any, rig: any, dt: number, w: number) {
    const S = sim.slam; if (!S) return;
    const st = rig.__sb || (rig.__sb = { p: 0, ph: -1 }), pr = rig.poseRoot as THREE.Group, B = rig.b;
    if (st.ph < 0) st.p = pr.rotation.x;
    const tgt = SLAM_PITCH[S.ph] ?? 0;
    st.p += (tgt - st.p) * Math.min(1, dt * (S.ph >= 4 ? 30 : 14)); st.ph = S.ph;
    pr.rotation.x += (st.p - pr.rotation.x) * w;
    let drop = 0;
    if (S.ph === 0) drop = 0.08 + 0.14 * (S.c || 0);
    else if (S.ph === 1) drop = 0.32;
    else if (S.ph === 5) drop = 0.55 * (1 - ss((S.t - 0.12) / 0.23)) + 0.12 * Math.exp(-S.t / 0.06);   // the hit compresses past the pose, then holds and rises
    if (drop > 0 && B.hips) B.hips.position.y -= drop * w;
}
export function slamBodyReset(rig: any) { if (rig.__sb) rig.__sb.ph = -1; }

/* Support-leg IK for the spin hook kick (combat feel pass, Shifat Nov 2 4:19 PM on a9974b3: "Now the other leg has issues"). The keyed support
   thigh counter-rotates ~75 deg against the tipped pelvis in Euler angles, which swung the foot ~0.27 m sideways and put the knee hinge in the
   wrong plane (it read as bending backwards). This solves the support leg as a 2-bone IK in world space instead: the ankle is planted straight
   below the hip joint at ankle height, the knee bends ~9 deg toward the body's facing (never backwards, never hyperextended), and the hips are
   raised/lowered so that bend is exactly what fits. Blended in by w (0..1); the keyed pose stays underneath. */
const _H = new THREE.Vector3(), _F = new THREE.Vector3(), _K = new THREE.Vector3(), _u = new THREE.Vector3(), _p = new THREE.Vector3(), _x = new THREE.Vector3(), _t = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0), _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qt = new THREE.Quaternion(), _qs = new THREE.Quaternion(), _sv = new THREE.Vector3();
function frameQuat(dirL: THREE.Vector3, xL: THREE.Vector3, dirW: THREE.Vector3, xW: THREE.Vector3, out: THREE.Quaternion) {   // rotation taking (dirL, xL) onto (dirW, xW)
    const a = dirL.clone().normalize(), b = xL.clone().sub(a.clone().multiplyScalar(xL.dot(a))).normalize(), c = new THREE.Vector3().crossVectors(a, b);
    const A = dirW.clone().normalize(), Bv = xW.clone().sub(A.clone().multiplyScalar(xW.dot(A))).normalize(), C = new THREE.Vector3().crossVectors(A, Bv);
    _m1.makeBasis(a, b, c); _m2.makeBasis(A, Bv, C); _m2.multiply(_m1.transpose()); return out.setFromRotationMatrix(_m2);
}
export function supportLegIK(rig: any, side: 'L' | 'R', w: number, bendDeg = 9, turnOutDeg = 35) {
    const B = rig.b, th = B['thigh' + side] as THREE.Bone, sh = B['shin' + side] as THREE.Bone, ft = B['foot' + side] as THREE.Bone, hips = B.hips as THREE.Bone;
    if (!(w > 0.001) || !th || !sh || !ft || !hips || !rig.root) return;
    rig.root.updateMatrixWorld(true);
    const sc = _sv.setFromMatrixScale(th.matrixWorld), s = (sc.x + sc.y + sc.z) / 3 || 1;
    const Lt = sh.position.length() * s, Ls = ft.position.length() * s, ank = ((rig.ankleY ?? 0.055) as number) * s;   // ankle height over the rig root when standing (measured: the planted ankle sits 0.055 rig units up)
    const ground = rig.root.getWorldPosition(_t).y + ank;
    const bend = bendDeg * Math.PI / 180, D = Math.sqrt(Lt * Lt + Ls * Ls + 2 * Lt * Ls * Math.cos(bend));
    th.getWorldPosition(_H);
    const lift = (ground + D) - _H.y;                                    // raise / lower the hips so the planted leg has exactly the chosen bend
    hips.position.y += (lift / s) * w; rig.root.updateMatrixWorld(true); th.getWorldPosition(_H);
    _F.set(_H.x, ground, _H.z);
    const dd = Math.max(1e-4, Math.min(Lt + Ls - 1e-4, _H.distanceTo(_F)));
    _u.subVectors(_F, _H).normalize();
    _p.set(0, 0, 1).applyQuaternion(hips.getWorldQuaternion(_qp)); _p.y = 0; if (_p.lengthSq() < 1e-6) _p.set(0, 0, 1); _p.normalize();   // knee points the way the body faces
    _p.sub(_u.clone().multiplyScalar(_p.dot(_u))).normalize();
    { const o = _t.subVectors(_H, hips.getWorldPosition(_K)); o.sub(_u.clone().multiplyScalar(o.dot(_u))); if (o.lengthSq() > 1e-8) { o.normalize(); const ta = turnOutDeg * Math.PI / 180; _p.multiplyScalar(Math.cos(ta)).addScaledVector(o, Math.sin(ta)).normalize(); } }   // the support leg turns out (knee and toes away from the midline) like the reference photos: the foot pivots on the spin instead of pointing straight ahead (files/combat/support_leg_ref_study.jpg)
    const a = (Lt * Lt - Ls * Ls + dd * dd) / (2 * dd), b = Math.sqrt(Math.max(0, Lt * Lt - a * a));
    _K.copy(_H).addScaledVector(_u, a).addScaledVector(_p, b);
    _x.crossVectors(_up, _p).normalize();                                // knee hinge: the body's left-right, level
    const thW = frameQuat(sh.position, new THREE.Vector3(1, 0, 0), _t.subVectors(_K, _H), _x, new THREE.Quaternion());
    const shW = frameQuat(ft.position, new THREE.Vector3(1, 0, 0), new THREE.Vector3().subVectors(_F, _K), _x, new THREE.Quaternion());
    const par = hips.getWorldQuaternion(new THREE.Quaternion());
    _qt.copy(par).invert().multiply(thW); th.quaternion.slerp(_qt, w);
    th.updateMatrixWorld(true); const pt = th.getWorldQuaternion(new THREE.Quaternion());
    _qs.copy(pt).invert().multiply(shW); sh.quaternion.slerp(_qs, w);
    (rig._supW || (rig._supW = {}))[side] = w;   // the support-side hip corrective adds a little volume while the leg carries the tipped pelvis (Scene.tsx, hipFix)
}
