import * as THREE from 'three';

/* Hero hurt flinch (combat feel pass, Nov 2). Bones only, layered on top of every other pose (after combatPose), so a hit reads whatever
   the hero is doing. Was: a bot's punch or bolt took 12 HP and the body did nothing at all (only the HUD and sound knew).
   Now, on the frame sim.hurtT is set (the existing hurt path, unchanged):
   - the torso snaps away from the blow (direction from the nearest bot, which threw the punch / bolt) on an under-damped spring:
     spine and chest arch back for a hit from the front, curl and twist for a hit from the side;
   - the head lags the torso on a softer spring, so it whips and then settles (follow-through);
   - the arms fling up and out, the knees buckle a little and the hips drop, then everything springs back in ~0.35 s.
   No input, timing, i-frame, physics or hitbox change: nothing here is read by the sim. Mirrored frames (Ghost copying Shadow's traversal)
   are skipped, so only the hero who was hit flinches. */
type HH = { h: number; f: number; s: number; a: number; av: number; hd: number; hv: number };
function spring(x: number, v: number, tgt: number, k: number, c: number, dt: number): [number, number] {
    const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
    for (let i = 0; i < n; i++) { v += (k * (tgt - x) - c * v) * h; x += v * h; }
    return [x, v];
}
const add = (b: THREE.Bone | undefined, x: number, y: number, z: number) => { if (b) { b.rotation.x += x; b.rotation.y += y; b.rotation.z += z; } };
export function heroHurtBones(sim: any, rig: any, dt: number) {
    const H: HH = rig.__hh || (rig.__hh = { h: 0, f: -1, s: 0, a: 0, av: 0, hd: 0, hv: 0 });
    const ht = sim.hurtT || 0, h = Math.min(dt, 0.1);
    if (ht > H.h + 0.1) {   // hurt edge
        let bx = 0, bz = 0, bd = 12;   // the nearest live bot = where the hit came from
        const P = sim.pos, E = sim.enemies || [];
        for (const e of E) { if (e.down > 0) continue; const dx = P[0] - e.x, dz = P[2] - e.z, d = Math.hypot(dx, dz); if (d < bd) { bd = d; bx = dx; bz = dz; } }
        const fx = Math.sin(sim.ang || 0), fz = Math.cos(sim.ang || 0), l = Math.hypot(bx, bz);
        if (l > 0.01) { const ux = bx / l, uz = bz / l; H.f = ux * fx + uz * fz; H.s = ux * fz - uz * fx; } else { H.f = -1; H.s = 0; }   // push along/against facing; unknown = from the front
        H.av += 21; H.hv += 5;   // torso peaks ~1 (scaled per bone below) ~80 ms after the hit
    }
    H.h = ht;
    [H.a, H.av] = spring(H.a, H.av, 0, 170, 12, h);
    [H.hd, H.hv] = spring(H.hd, H.hv, H.a, 70, 7, h);   // the head follows the torso late and overshoots: the whip
    const a = H.a, hd = H.hd;
    if (Math.abs(a) < 0.004 && Math.abs(hd) < 0.004 && Math.abs(H.av) < 0.05) return;
    const B = rig.b, back = -H.f, side = H.s;   // back > 0: pushed backwards (hit from the front)
    // torso: arch away from a frontal hit (negative x = back), fold over a hit from behind; side hits curl sideways and twist
    add(B.spine, -0.38 * a * back, 0.18 * a * side, -0.22 * a * side);
    add(B.chest, -0.24 * a * back, 0.12 * a * side, -0.14 * a * side);
    add(B.head, -0.55 * hd * back, 0.1 * hd * side, -0.3 * hd * side);
    add(B.hips, -0.16 * a * back, 0, -0.06 * a * side);
    // arms fling up and out, forearms open
    add(B.uarmR, -0.45 * a, 0, 0.45 * a); add(B.uarmL, -0.45 * a, 0, -0.45 * a);
    add(B.farmR, -0.35 * a, 0, 0); add(B.farmL, -0.35 * a, 0, 0);
    // knees buckle, hips drop a touch (on the ground only)
    if (sim.ground) { add(B.thighR, -0.22 * a, 0, 0); add(B.thighL, -0.16 * a, 0, 0); add(B.shinR, 0.4 * a, 0, 0); add(B.shinL, 0.32 * a, 0, 0); if (B.hips) B.hips.position.y -= 0.08 * Math.max(0, a); }
}
