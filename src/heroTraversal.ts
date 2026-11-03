import * as THREE from 'three';
import { buildings, parkH } from './sim';

/* Hero traversal body motion (Shifat Nov 2 1:47 PM: "Learn animations from this", Ultimate Spider-Man PS2 night swinging; notes in files/anim_ref/notes.md).
   Procedural layer on top of the existing rig: it only moves the body (poseRoot pitch/roll + bones). Physics, inputs, timings and hitboxes are untouched.
   SWING (reference 11.2-12.6 s, 20.0-20.9 s, 21.6-22.7 s): the body hangs from the line hand and pendulums with the rope, lagging it (spring), so right after
   the attach it is still laid out along the velocity; legs trail back on the down-swing and whip forward with knees up on the up-swing, torso leaning back. */

type TV = { on: boolean; w: number; p: number; pv: number; r: number; rv: number; lg: number; lgv: number; bw: number; fl: number; flT: number; flD: number; flP0: number; flV0: number; flE: number; tk: number; ya: number; fw: number; wg: boolean; lOn: number; lt: number; li: number; lh: number; lU: number; flDir: number; sp: number; spW: number; rl: number; rlv: number; hs: number; lc: number };
const tv = (rig: any): TV => rig.__tv || (rig.__tv = rig.root.userData.__tv = { on: false, w: 0, p: 0, pv: 0, r: 0, rv: 0, lg: 0, lgv: 0, bw: 0, fl: 0, flT: 0, flD: 0.62, flP0: 0, flV0: 0, flE: 0.3, tk: 0, ya: 0, fw: 0, wg: true, lOn: 0, lt: 0, li: 0, lh: 0, flDir: -1, sp: 0, spW: 0, rl: 0, rlv: 0, hs: 0, lc: 0 });
const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
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

function free(sim: any) {
    return !sim.ground && !sim.swim && !sim.wall && !sim.glideOn && !sim.mv && !sim.flip && !sim.slam && !((sim.snareT || 0) > 0);
}
function swinging(sim: any) { return !!sim.web && free(sim); }
/* RELEASE FLIP (ref 12.0-12.8 s, 24.3-25.8 s): letting go on the rise carries the swing's rotation on into a tucked backflip, inverted ~0.25 s after the release,
   upright again by ~0.6 s. Low releases (not rising) go straight to the air pose. A new web, a landing, a wall, glide or any combat move takes over at once. */
const FLIP_DUR = 0.62;
/* FREEFALL (ref 13.1-13.7 s, 16.4-16.8 s, 22.8-23.4 s): falling turns the body belly-down into a skydiver frog: arms wide with the forearms up,
   knees bent and apart, back arched, head up; it banks into turns and has a slow bob/roll. Weight grows with the fall speed (4 -> 14 m/s). */
// feet height above the roof/street under the hero (roof boxes + park ground; a sea/island miss only means the spread holds a little longer)
function clearance(x: number, y: number, z: number) {
    let g = Math.max(0, parkH(x, z));
    for (let i = 0; i < buildings.length; i++) { const b = buildings[i]; if (b.h > g && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) g = b.h; }
    return y - 1 - g;
}
// unwinds to feet-first in the last ~0.35 s before touchdown, so a landing never arrives belly-first (short hops stay upright)
const fallW = (sim: any) => {
    if (sim.web || !free(sim) || sim.vel[1] > -4) return 0;
    const w = sstep((-sim.vel[1] - 4) / 10); if (w <= 0) return 0;
    const tti = clearance(sim.pos[0], sim.pos[1], sim.pos[2]) / -sim.vel[1];
    return w * sstep((tti - 0.15) / 0.25);
};

/** after applyHeroRootPose has set the plain lean/bank: swing pitch/roll from the rope, blended in, pivot-compensated */
export function traversalRoot(sim: any, rig: any, dt: number, scale: number) {
    const T = tv(rig), pr = rig.poseRoot as THREE.Group, root = rig.root as THREE.Group;
    const h = Math.min(dt, 0.1), sw = swinging(sim);
    const lean0 = pr.rotation.x, bank0 = pr.rotation.z;
    T.fw = 0;
    if (T.fl && (sw || !free(sim))) { T.fl = 0; T.p = wrapPi(T.p); T.pv = cl(T.pv, -8, 8); }   // interrupted: hand the current angle on, no pop
    if (!sw && T.on && !sim.web && free(sim) && !(sim.spring > 0) && sim.vel[1] > 3 && Math.hypot(sim.vel[0], sim.vel[1], sim.vel[2]) > 10) {   // released on the rise
        T.fl = 1; T.flT = 0; T.flD = FLIP_DUR; T.flP0 = T.p; T.flV0 = cl(T.pv, -9, 0); T.flE = lean0 - Math.PI * 2; T.flDir = -1;
    }
    // spring release: the pull's momentum rolls on into a front tuck flip when it lets go still rising fast (ref 25.2-25.9 s, 21.8-21.9 s)
    if (T.sp > 0 && !(sim.spring > 0) && free(sim) && !sim.web && sim.vel[1] > 3) {
        T.fl = 1; T.flT = 0; T.flD = FLIP_DUR; T.flP0 = T.p; T.flV0 = cl(T.pv, 0, 9); T.flE = lean0 + Math.PI * 2; T.flDir = 1;
    }
    T.sp = sim.spring > 0 && free(sim) ? 1 : 0;
    if (T.fl) {
        T.flT += h; const u = Math.min(1, T.flT / T.flD), D = T.flD;
        // cubic Hermite from the release angle/spin to one full turn back, ending at rest on the air lean
        const u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2;
        const np = h00 * T.flP0 + h10 * T.flV0 * D + h01 * T.flE;
        T.pv = (np - T.p) / Math.max(h, 1e-4); T.p = np; T.r += (0 - T.r) * Math.min(1, h * 6); T.w = 1; T.on = false;
        if (u >= 1) { T.fl = 0; T.p = wrapPi(T.p); T.pv = 0; }
    } else if (sw) {
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
    } else if (sim.spring > 0 && free(sim)) {
        // WEB SPRING yank: the body snaps into line with the pull, head leading (stiff spring = a snap, small overshoot)
        const v = sim.vel, vf = v[0] * Math.sin(sim.ang) + v[2] * Math.cos(sim.ang);
        const u = 0.4 - sim.spring, tp = u < 0.05 ? lean0 + 0.25 : cl(Math.atan2(vf, Math.max(-2, v[1])), -0.4, 1.45);
        if (T.w < 0.05) { T.p = lean0; T.pv = 0; }
        [T.p, T.pv] = spring(T.p, T.pv, tp, 170, 17, h);
        [T.r, T.rv] = spring(T.r, T.rv, 0, 40, 12, h);
        T.w += (1 - T.w) * Math.min(1, h * 20); T.on = false;
    } else if ((T.fw = fallW(sim)) > 0.01) {
        T.on = false; const fw = T.fw;
        [T.p, T.pv] = spring(T.p, T.pv, lean0 + 0.95 + Math.sin(sim.t * 2.6) * 0.05, 30, 9, h);
        const yr = wrapPi(sim.ang - T.ya) / Math.max(h, 1e-3);
        [T.r, T.rv] = spring(T.r, T.rv, cl(-yr * 0.35, -0.45, 0.45) + Math.sin(sim.t * 1.7) * 0.05, 20, 8, h);
        T.w += (fw - T.w) * Math.min(1, h * 6);
    } else {
        T.on = false;
        T.p += (lean0 - T.p) * Math.min(1, h * 7);
        T.w += (0 - T.w) * Math.min(1, h * 7);
        if (T.w < 0.002) T.w = 0;
    }
    T.ya = sim.ang;
    {   // yank stretch along the body (volume kept), ~0.15 s right after the line goes taut
        const u = sim.spring > 0 && free(sim) ? 0.4 - sim.spring : 1, s = 1 + 0.09 * Math.max(0, Math.sin(cl((u - 0.05) / 0.17, 0, 1) * Math.PI));
        if (s !== 1 || pr.scale.y !== 1) { const sx = 1 / Math.sqrt(s); pr.scale.set(sx, s, sx); }
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
    if (T.bw < 0.003) { T.bw = 0; T.lg = 0; T.lgv = 0; } else swingBones(sim, rig, T, h, sw);
    fallBones(sim, rig, T, h);
    springBones(sim, rig, T, h);
    flipBones(sim, rig, T, h);
    landBones(sim, rig, T, h);
    runLean(sim, rig, T, h);
}
/* RUN LEAN (ref 0.0-2.5 s, 8.0-9.0 s): the torso leans into the run, more with speed (up to ~17 deg at full sprint), a little extra while
   speeding up and a lean back when braking; the head stays level. Added after the run clip has scaled the base lean, about the feet. */
function runLean(sim: any, rig: any, T: TV, h: number) {
    const v = sim.vel, hs = Math.hypot(v[0], v[2]), acc = (hs - T.hs) / Math.max(h, 1e-3); T.hs = hs;
    const on = sim.ground && !sim.swim && !sim.wall && !sim.web && !sim.mv && !sim.flip && !sim.slam && !((sim.snareT || 0) > 0) && !(sim.atkT > 0);
    const tgt = on ? 0.3 * sstep((hs - 3) / 13) + cl(acc * 0.012, -0.18, 0.15) : 0;
    [T.rl, T.rlv] = spring(T.rl, T.rlv, tgt, 40, 11, h);
    if (Math.abs(T.rl) < 0.002) return;
    const pr = rig.poseRoot as THREE.Group; pr.rotation.x += T.rl;
    rig.b.head.rotation.x -= T.rl * 0.6;
}
/* WEB SPRING (ref 21.6-21.9 s, 25.9-26.2 s): the hands already reach the anchor (existing aim). The body coils for the first few frames
   (knees in, chest curled = anticipation), then the yank snaps it out along the pull: legs straight and trailing together, back arched, head up into it.
   Arms are left to the aim. */
function springBones(sim: any, rig: any, T: TV, h: number) {
    const B = rig.b, on = sim.spring > 0 && free(sim);
    T.spW += ((on ? 1 : 0) - T.spW) * Math.min(1, h * (on ? 30 : 8));
    const k = T.spW * (1 - T.tk); if (k < 0.01) return;
    const u = on ? 0.4 - sim.spring : 0.4, c = 1 - sstep((u - 0.03) / 0.07);   // coil -> extend
    setB(B.thighR, -1.05 * c + 0.28 * (1 - c), 0, 0.06, k); setB(B.thighL, -0.9 * c + 0.36 * (1 - c), 0, -0.06, k);
    setB(B.shinR, 1.7 * c + 0.18 * (1 - c), 0, 0, k); setB(B.shinL, 1.75 * c + 0.3 * (1 - c), 0, 0, k);
    setB(B.spine, 0.35 * c - 0.18 * (1 - c), 0, 0, k); setB(B.chest, 0.15 * c - 0.1 * (1 - c), 0, 0, k); setB(B.head, -0.1 * c - 0.35 * (1 - c), 0, 0, k);
}
/* LANDING (ref 4.1-4.9 s, 7.8 s, 13.8-14.0 s): touchdown drops into a crouch for a few frames: knees bend, hips sink, chest folds over, head up.
   A hard landing (sim.landHard) is the low superhero landing: front knee up, back knee down, one hand planted, the other arm out behind;
   held ~0.2 s, then it pushes back up (0.55 s total).
   Nov 3 (landing feel, "make landings read"): a normal one is now WEIGHTED by the impact (sim.land = fall speed / 30): a small hop is a
   tiny knee dip (~0.2 s), a big drop a deep crouch held a beat longer with the arms out to the sides for balance (~0.38 s).
   FEET PLANTED: the root sink used to follow sim.land (which decays in land/3 s) while the knees followed this pose's own envelope, so a
   small hop bent the knees with no sink and the feet hovered ~0.2 m over the floor. The sink and the whole-body pitch are now driven by
   the same envelope as the knees, and after posing the root is moved so the lowest ankle (or a kneeling knee) sits exactly on the floor.
   The feet stay flat (the ankle takes back the shin's lean) and the hips sink straight down between the heels: no butt pushed back.
   Purely visual and never holds the hero: the sim already lets them act; any move, shot, dodge, web or running off blends it out fast. */
const _fa = new THREE.Vector3(), _fb = new THREE.Vector3(), _sc = new THREE.Vector3();
function landBones(sim: any, rig: any, T: TV, h: number) {
    const B = rig.b, root = rig.root as THREE.Group, pr = rig.poseRoot as THREE.Group;
    T.lc = 0;
    if (sim.ground && !T.wg && sim.land > 0.08 && !sim.swim && !sim.wall) { T.lOn = 1; T.lt = 0; T.li = sim.land; T.lh = (sim.landHard || 0) > 0 ? 1 : 0; T.lU = 1; }
    T.wg = !!sim.ground;
    // this landing owns the body sink + pitch (Scene.tsx applyHeroRootPose adds them from sim.land; undone here, re-applied on the pose envelope)
    if (T.lU && (sim.slam || sim.swim || !(sim.land > 0))) T.lU = 0;
    if (T.lU) { root.position.y += sim.land * 0.5; pr.rotation.x -= sim.land * 0.5; }
    if (!T.lOn) return;
    if (!sim.ground || sim.swim || sim.web || sim.mv || sim.flip || sim.slam || (sim.snareT || 0) > 0) { T.lOn = 0; return; }
    const hd = T.lh, li = cl(T.li, 0, 1);
    const dur = hd ? 0.55 : 0.2 + 0.18 * li, hold = hd ? 0.22 : 0.02 + 0.08 * li;
    // acting again (shot, dodge, attack wind-up, running off): the crouch lets go at once and blends out over ~0.1 s
    const act = sim.shotT > 0 || sim.dodgeT > 0 || sim.atkT > 0 || sim.spring > 0 || Math.hypot(sim.vel[0], sim.vel[2]) > 3.5;
    T.lt += act ? h * 2.5 : h; if (act && T.lt < hold) T.lt = hold;
    if (T.lt >= dur) { T.lOn = 0; return; }
    const e = sstep(T.lt / 0.045) * (1 - sstep((T.lt - hold) / (dur - hold)));
    // depth scales the shape (small hop = slight knee give, big drop = deep crouch); the weight is the envelope, so at its peak the crouch
    // fully owns the legs instead of half-mixing with the airborne pose that is still blending out
    const d = hd ? 1 : 0.12 + 0.6 * sstep((li - 0.2) / 0.65), k = e;   // hop (li ~0.25) 0.13, standing jump (~0.8) 0.64, biggest soft drop 0.7
    if (k < 0.005) return;
    if (hd) { superheroBones(rig, T, k); return; }
    const m = (a: number, b: number) => a + (b - a) * hd;   // soft -> hard pose
    const big = hd ? 0 : sstep((li - 0.6) / 0.27);           // big soft drops: arms out for balance (a standing jump half way)
    const P = m(0.16 * d, 0.34) * k; pr.rotation.x += P;       // whole-body lean over the feet (the knees do the rest)
    // clean columns: the pelvis is levelled (no forward tilt = no butt pushed back) and each soft leg folds so the ankle stays under the hip:
    // thigh forward by a, knee bent by 2a, measured from the body's actual pitch, so the shin leans forward exactly as much as the thigh
    setB(B.hips, 0, 0, 0, k);
    const hp = pr.rotation.x, aR = 1.0 * d, aL = 0.94 * d;
    setB(B.thighR, m(-(aR + hp), -1.55), 0, m(0.1 * d, 0.1), k); setB(B.shinR, m(2 * aR * 0.97 + 0.04, 2.05), 0, 0, k);
    setB(B.thighL, m(-(aL + hp), -0.25), 0, m(-0.1 * d, -0.15), k); setB(B.shinL, m(2 * aL * 0.97 + 0.04, 2.35), 0, 0, k);
    setB(B.spine, m(0.3 * d, 0.55), 0, 0, k); setB(B.chest, m(0.12 * d, 0.25), 0, 0, k); setB(B.head, m(-0.3 * d, -0.75), 0, 0, k);   // superhero: chin up, eyes forward
    setB(B.uarmR, m((-0.6 + 0.3 * big) * d, -0.55), 0, m(0.12 + (0.18 + 0.75 * big) * d, 0.12), k); setB(B.farmR, m(-0.25 - 0.25 * d + 0.2 * big, -0.15), 0, m(0.3 * big, 0), k);
    setB(B.uarmL, m((-0.6 + 0.3 * big) * d, 0.75), 0, m(-0.12 - (0.18 + 0.75 * big) * d, -0.75), k); setB(B.farmL, m(-0.25 - 0.25 * d + 0.2 * big, -0.4), 0, m(-0.3 * big, 0), k);
    // flat feet: the ankle takes back the shin's world lean (whole-body pitch + hips + thigh + knee), so the soles stay on the floor
    // (the planted front foot on a superhero landing too; its kneeling back foot keeps its toes down)
    const hx = pr.rotation.x + (B.hips ? B.hips.rotation.x : 0);
    if (B.footR) B.footR.rotation.x += (-(hx + B.thighR.rotation.x + B.shinR.rotation.x) * 0.92 - B.footR.rotation.x) * k;
    if (B.footL && !hd) B.footL.rotation.x += (-(hx + B.thighL.rotation.x + B.shinL.rotation.x) * 0.92 - B.footL.rotation.x) * k;
    // plant: lowest ankle on the floor (standing ankle height), or a kneeling knee on it
    root.updateMatrixWorld(true);
    const s = (_sc.setFromMatrixScale(B.thighR.matrixWorld).x + _sc.y + _sc.z) / 3 || 1, gy = root.position.y, ank = ((rig.ankleY ?? 0.055) as number) * s;
    let lift = -1e9;
    for (const sd of ['R', 'L']) {
        const ft = B['foot' + sd], sh = B['shin' + sd];
        if (ft) { ft.getWorldPosition(_fa); lift = Math.max(lift, gy + ank - _fa.y); }
        if (sh) { sh.getWorldPosition(_fb); lift = Math.max(lift, gy + 0.05 * s - _fb.y); }
    }
    if (lift > -1e8) root.position.y += lift * sstep(k / 0.12);
}
/* SUPERHERO LANDING (Nov 3, "clean classic superhero landing"; refs: the Iron Man / Spider-Man three-point landing):
   front (right) knee up with its shin plumb and the foot flat, back (left) knee on the floor with the shin lying back along it, toes down,
   the left fist planted on the floor beside the front foot, the right arm out behind for balance, back straight, chest up, head up looking ahead.
   Posed in WORLD space (aim at targets) so it reads the same on Shadow and on Ghost (0.93 scale) whatever the bone axes are; the envelope k
   rises over 45 ms, holds, then blends the whole pose out so the hero rises out of it. The cape (Shadow) is lifted by the impact and settles
   back down over the hold (T.lc, read by Scene.tsx's cape chain). Purely visual: no timing, input or physics change. */
const _sf = new THREE.Vector3(), _sr = new THREE.Vector3(), _sh = new THREE.Vector3(), _sk = new THREE.Vector3(), _st = new THREE.Vector3(), _sa = new THREE.Vector3(), _sb = new THREE.Vector3();
const _rq = new THREE.Quaternion(), _wq = new THREE.Quaternion(), _xq = new THREE.Quaternion(), _ax = new THREE.Vector3(1, 0, 0);
// turn a bone so its WORLD orientation is the root's (upright, facing ahead) pitched by `pitch` about the body's side axis
function setWorldPitch(b: THREE.Object3D | undefined, root: THREE.Object3D, pitch: number, w: number) {
    if (!b || !b.parent) return;
    root.getWorldQuaternion(_rq); _xq.setFromAxisAngle(_ax, pitch); _rq.multiply(_xq);
    b.parent.getWorldQuaternion(_wq); _wq.invert().multiply(_rq);
    b.quaternion.slerp(_wq, w); b.updateMatrixWorld(true);
}
function superheroBones(rig: any, T: TV, k: number) {
    const B = rig.b, root = rig.root as THREE.Group, pr = rig.poseRoot as THREE.Group;
    // torso: the lean comes from the hips with a straight back (no hunch), chest lifted
    pr.rotation.x += 0.72 * k;
    setB(B.hips, 0, 0, 0, k); setB(B.spine, 0.04, 0, 0.17, k); setB(B.chest, -0.14, 0, 0.05, k);   // + a lean toward the planted fist
    root.updateMatrixWorld(true);
    const s = (_sc.setFromMatrixScale(B.thighR.matrixWorld).x + _sc.y + _sc.z) / 3 || 1, gy = root.position.y, ank = ((rig.ankleY ?? 0.055) as number) * s;
    const re = root.matrixWorld.elements;
    _sf.set(re[8], 0, re[10]).normalize(); _sr.set(re[0], 0, re[2]).normalize();   // body forward / right (level)
    const Lt = B.thighR.getWorldPosition(_sa).distanceTo(B.shinR.getWorldPosition(_sb)), Ls = _sb.distanceTo(B.footR.getWorldPosition(_sk));
    // front leg (right): thigh level straight ahead (knee a touch out), shin plumb
    B.thighR.getWorldPosition(_sh);
    _st.copy(_sh).addScaledVector(_sf, Lt).addScaledVector(_sr, 0.12 * Lt).addScaledVector(_sk.set(0, 1, 0), 0.42 * Lt);   // knee a little above the hip: a deep, low stance
    aim(B.thighR, B.shinR, _st, k); root.updateMatrixWorld(true);
    B.shinR.getWorldPosition(_sa); _st.copy(_sa).addScaledVector(_sf, 0.02 * Ls); _st.y -= Ls;
    aim(B.shinR, B.footR, _st, k); root.updateMatrixWorld(true);
    setWorldPitch(B.footR, root, 0, k);   // flat on the floor
    // back leg (left): knee down on the floor level with the front sole, the thigh dropping from the hip, shin flat back along the floor
    B.footR.getWorldPosition(_sa); const floorY = _sa.y - ank, kneeY = floorY + 0.06 * s;
    B.thighL.getWorldPosition(_sh); const dy = Math.min(0.97 * Lt, Math.max(0.2 * Lt, _sh.y - kneeY)), dz = Math.sqrt(Lt * Lt - dy * dy);
    _st.copy(_sh).addScaledVector(_sf, -dz).addScaledVector(_sr, -0.06 * Lt); _st.y = _sh.y - dy;
    aim(B.thighL, B.shinL, _st, k); root.updateMatrixWorld(true);
    B.shinL.getWorldPosition(_sa); _st.copy(_sa).addScaledVector(_sf, -Ls); _st.y += 0.1 * Ls;
    aim(B.shinL, B.footL, _st, k); root.updateMatrixWorld(true);
    setWorldPitch(B.footL, root, 1.25, k);   // toes tucked down onto the floor
    // plant: the kneeling knee / front sole on the floor
    let lift = -1e9;
    for (const sd of ['R', 'L']) {
        const ft = B['foot' + sd], sh = B['shin' + sd];
        if (ft) { ft.getWorldPosition(_fa); lift = Math.max(lift, gy + ank - _fa.y); }
        if (sh) { sh.getWorldPosition(_fb); lift = Math.max(lift, gy + 0.05 * s - _fb.y); }
    }
    if (lift > -1e8) { root.position.y += lift * sstep(k / 0.12); root.updateMatrixWorld(true); }
    // arms: left fist planted on the floor beside the front foot, right arm swept back and out for balance
    B.uarmL.getWorldPosition(_sh);
    _st.copy(_sh).addScaledVector(_sf, 0.22 * Lt).addScaledVector(_sr, -0.12 * Lt); _st.y = gy + 0.07 * s;
    aim(B.uarmL, B.farmL, _st, k); root.updateMatrixWorld(true); aim(B.farmL, B.handL, _st, k); root.updateMatrixWorld(true);
    B.uarmR.getWorldPosition(_sh);
    _st.copy(_sh).addScaledVector(_sf, -0.75).addScaledVector(_sr, 0.75).add(_sk.set(0, -0.05, 0));
    aim(B.uarmR, B.farmR, _st, k); root.updateMatrixWorld(true);
    B.farmR.getWorldPosition(_sh); _st.copy(_sh).addScaledVector(_sf, -0.7).addScaledVector(_sr, 0.55).add(_sk.set(0, 0.22, 0));
    aim(B.farmR, B.handR, _st, k); root.updateMatrixWorld(true);
    // head up, eyes ahead (a touch down at the street), neck carrying part of it so it reads as a proud chin, not a cranked neck
    setWorldPitch(B.neck, root, 0.2, k * 0.6); setWorldPitch(B.head, root, 0.12, k);
    // cape: the impact throws it up behind, then it settles down over the back during the hold
    T.lc = k * (0.12 + 0.3 * (1 - sstep(T.lt / 0.3)));
}
function fallBones(sim: any, rig: any, T: TV, h: number) {
    const B = rig.b, k = T.fw * (1 - T.tk) * (1 - T.bw) * sstep(T.w * 1.5);   // limbs open as the body tips over, together
    if (k < 0.01) return;
    const t = sim.t, wob = Math.sin(t * 3.1) * 0.06;
    setB(B.uarmR, 0.1, 0, 1.45 + wob, k); setB(B.farmR, -0.2, 0, 0.95, k);
    setB(B.uarmL, 0.1, 0, -1.45 + wob, k); setB(B.farmL, -0.2, 0, -0.95, k);
    setB(B.thighR, -0.35, 0, 0.32, k); setB(B.thighL, -0.3, 0, -0.32, k);
    setB(B.shinR, 1.25 + wob, 0, 0, k); setB(B.shinL, 1.3 - wob, 0, 0, k);
    setB(B.spine, -0.25, 0, 0, k); setB(B.chest, -0.12, 0, 0, k); setB(B.head, -0.5, 0, 0, k); setB(B.hips, 0, 0, 0, k);
}
function flipBones(sim: any, rig: any, T: TV, h: number) {
    const B = rig.b;
    // tuck: knees to chest, arms wrapped in by ~20% of the flip, opens again over the last third (ref 12.3-12.8 s)
    const u = T.fl ? Math.min(1, T.flT / T.flD) : 1, tgt = T.fl ? sstep(u / 0.22) * (1 - sstep((u - 0.62) / 0.33)) : 0;
    T.tk += (tgt - T.tk) * Math.min(1, h * 22);
    if (!free(sim)) T.tk = 0;
    const k = T.tk; if (k < 0.01) return;
    setB(B.thighR, -1.75, 0, 0.12, k); setB(B.thighL, -1.65, 0, -0.12, k);
    setB(B.shinR, 2.25, 0, 0, k); setB(B.shinL, 2.2, 0, 0, k);
    setB(B.spine, 0.5, 0, 0, k); setB(B.chest, 0.25, 0, 0, k); setB(B.head, 0.35, 0, 0, k);
    setB(B.uarmR, -1.25, 0, -0.55, k); setB(B.farmR, -1.9, 0, 0, k); setB(B.uarmL, -1.25, 0, 0.55, k); setB(B.farmL, -1.9, 0, 0, k);
}
function swingBones(sim: any, rig: any, T: TV, h: number, sw: boolean) {
    const B = rig.b;
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
    // arms: line hand reaches the anchor; the free arm holds its pose out to the side until the release (both hands, ref 12.0-12.5 s)
    const rLine = sim.swings % 2 === 1, line = rLine ? 'R' : 'L', free = rLine ? 'L' : 'R', so = rLine ? -1 : 1;
    setB(B['uarm' + line], -2.6, 0, 0, w); setB(B['farm' + line], -0.15, 0, 0, w);
    /* FREE ARM LOCK (Shifat Nov 2 9:32 PM "non swinging hand sometimes move above this pose", 9:34 PM "Until Release resting hand must lock on this pose"):
       from the attach until the release the arm not on the web holds the old swing pose (upper arm out to the side and a little forward, soft elbow,
       hand at chest-to-waist height away from the body), fixed relative to the torso: it no longer drifts with the arc (was eased in/down with the legs
       on the rise) and is no longer pulled up toward the web line on the rise (was up to +0.75 torso lengths above the waist). It settles in on the swing
       blend (reaches the full pose once the blend passes 0.92). From the release moment on nothing changes (Shifat 9:39 PM "Release pose is perfect
       already"): the arm hands off into the release flip and the fall exactly as before. */
    if (sw) { const lw = Math.min(1, w / 0.92); setB(B['uarm' + free], 0.35, 0, so * 0.95, lw); setB(B['farm' + free], -0.6, 0, 0, lw); }
    else { setB(B['uarm' + free], 0.35 - fwd * 0.4, 0, so * (0.95 - fwd * 0.3), w); setB(B['farm' + free], -0.6, 0, 0, w); }   // from the release on: exactly the old hand-off into the release flip (Shifat 9:39 PM: release pose locked)
    if (!sim.web) return;
    rig.root.updateWorldMatrix(true, true);
    _tg.set(sim.anchor[0], sim.anchor[1], sim.anchor[2]);
    aim(B['uarm' + line], B['farm' + line], _tg, w); rig.root.updateWorldMatrix(true, true);
    aim(B['farm' + line], B['hand' + line], _tg, w);
}
