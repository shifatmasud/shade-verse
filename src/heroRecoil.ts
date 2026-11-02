import * as THREE from 'three';

/* Web-shot recoil (combat feel pass, Nov 2). Bones only, layered after every other pose. Was: the arms swung onto the target and the bolt
   left with no reaction in the body, so a shot read as pointing, not firing. Now, on the frame a shot fires (sim.shotT set, unchanged):
   the aimed arms kick up and back (muzzle climb), the forearms snap, and the chest and head rock back, on a stiff under-damped spring
   (peak ~45 ms after the shot, settled in ~0.2 s), then the existing aim takes them back onto the target. Rapid taps stack, capped.
   No input, timing, aim, projectile, hitbox or cooldown change: nothing here is read by the sim. Both heroes. */
type RC = { s: number; r: number; rv: number };
function spring(x: number, v: number, tgt: number, k: number, c: number, dt: number): [number, number] {
    const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
    for (let i = 0; i < n; i++) { v += (k * (tgt - x) - c * v) * h; x += v * h; }
    return [x, v];
}
const add = (b: THREE.Bone | undefined, x: number, z: number) => { if (b) { b.rotation.x += x; b.rotation.z += z; } };
export function shotRecoilBones(sim: any, rig: any, dt: number) {
    const R: RC = rig.__rc || (rig.__rc = { s: 0, r: 0, rv: 0 });
    const st = sim.shotT || 0, h = Math.min(dt, 0.1);
    if (st > R.s + 0.1) R.rv = Math.min(50, R.rv + 40);   // a shot left this frame
    R.s = st;
    [R.r, R.rv] = spring(R.r, R.rv, 0, 520, 30, h);
    const r = Math.max(-0.4, Math.min(1.2, R.r));
    if (Math.abs(r) < 0.003 && Math.abs(R.rv) < 0.05) return;
    const B = rig.b;
    add(B.uarmR, -0.32 * r, 0.06 * r); add(B.uarmL, -0.32 * r, -0.06 * r);   // muzzle climb
    add(B.farmR, -0.22 * r, 0); add(B.farmL, -0.22 * r, 0);
    add(B.chest, -0.12 * r, 0); add(B.spine, -0.07 * r, 0); add(B.head, -0.08 * r, 0);
}
