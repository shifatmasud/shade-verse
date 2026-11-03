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
    3: { L: 0.06, D: -0.03, lean: 0, A: 0.25, twist: 0, heel: 0, lead: 0, hold: 0.06 },
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
