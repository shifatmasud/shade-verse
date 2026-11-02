import * as THREE from 'three';
import { getCompanionSim } from './sim';

/* Bot hit reaction (combat feel pass, Nov 2). Render-only: reads e.hit / e.kb that the sim already writes, changes nothing the sim reads
   (no hitbox, damage, knockback or stun change).
   Was: the bot snapped to a fixed tilt about the world X axis (so some hits tipped it TOWARD the hero) and held a flat white for the whole stun.
   Now, on each new hit:
   - FLINCH: an angular kick tips the bot away from the blow (the sim's own knockback direction) on an under-damped spring (~2.6 Hz, one overshoot),
     settling on the old stun lean, so it rocks back and wobbles upright instead of popping.
   - JOLT: a quick squash (volume kept) that springs back with a little jiggle.
   - HIT-STOP SHAKE: while the game is frozen on the hit (sim hitStop, unchanged), the victim vibrates a few cm along the blow, the way
     fighting games sell the impact during the freeze.
   - FLASH: a white-hot pop held through the hit-stop freeze, then cooling in ~50 ms that cools into a soft glow of the striking hero's colour (Shadow purple / Ghost pink, sim fxCol)
     for the rest of the stun. */
type HR = { h: number; t: number; pt: number; ux: number; uz: number; a: number; av: number; s: number; sv: number; amp: number; r: number; g: number; b: number };
const _q = new THREE.Quaternion(), _ax = new THREE.Vector3(), _c = new THREE.Color();
const PURPLE = 0xa855f7;
function spring(x: number, v: number, tgt: number, k: number, c: number, dt: number): [number, number] {
    const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
    for (let i = 0; i < n; i++) { v += (k * (tgt - x) - c * v) * h; x += v * h; }
    return [x, v];
}
export type ReactOut = { q: THREE.Quaternion; sy: number; sxz: number; jx: number; jz: number; r: number; g: number; b: number; hot: boolean };
const out: ReactOut = { q: new THREE.Quaternion(), sy: 1, sxz: 1, jx: 0, jz: 0, r: 1, g: 1, b: 1, hot: false };
/** per bot, per frame. hold = the old stun lean amount (radians) the flinch settles on while e.hit lasts */
export function enemyReact(e: any, sim: any, dt: number, hold: number): ReactOut {
    let st: HR = e.__hr;
    if (!st) st = e.__hr = { h: 0, t: 9, pt: 9, ux: 0, uz: 1, a: 0, av: 0, s: 0, sv: 0, amp: 0, r: 1, g: 1, b: 1 };
    const hit = e.hit || 0;
    if (hit > st.h + 0.05 && e.down <= 0) {   // a new blow (stun went UP): continuous holds (Shock gather, web yank) do not re-trigger
        const kx = e.kb ? e.kb[0] : 0, kz = e.kb ? e.kb[1] : 0, kl = Math.hypot(kx, kz);
        // the striking hero: whichever of Shadow / Ghost is nearer the bot
        const cs = getCompanionSim() as any; let hs = sim;
        if (cs && cs.pos && Math.hypot(cs.pos[0] - e.x, cs.pos[2] - e.z) < Math.hypot(sim.pos[0] - e.x, sim.pos[2] - e.z)) hs = cs;
        if (kl > 0.5) { st.ux = kx / kl; st.uz = kz / kl; }
        else { const dx = e.x - hs.pos[0], dz = e.z - hs.pos[2], d = Math.hypot(dx, dz); if (d > 0.01) { st.ux = dx / d; st.uz = dz / d; } }
        const amp = Math.min(1, 0.3 + hit * 1.2);   // light jab (0.32) ~0.68, heavy / finisher (0.55+) ~0.96-1
        st.amp = amp; st.t = 0; st.pt = 0;
        st.av += 8 * amp;           // rad/s kick away from the blow (jab peaks ~0.3 rad past the stun lean, finisher ~0.5)
        st.sv -= 6 * amp;           // squash
        _c.setHex(hs.fxCol ?? PURPLE); st.r = _c.r; st.g = _c.g; st.b = _c.b;
    }
    st.h = hit; st.t += dt;
    const cs2 = getCompanionSim() as any, frozen = ((sim.hitStop || 0) > 0 || ((cs2 && cs2.hitStop) || 0) > 0) && st.t < 0.2;
    if (!frozen) {
        st.pt += dt;   // the white pop holds through the freeze, then cools
        [st.a, st.av] = spring(st.a, st.av, e.down > 0 ? 0 : hold, 260, 14, dt);
        [st.s, st.sv] = spring(st.s, st.sv, 0, 420, 16, dt);
    }
    const a = Math.max(-0.9, Math.min(0.9, st.a)), s = Math.max(-0.3, Math.min(0.25, st.s));
    _ax.set(st.uz, 0, -st.ux); out.q.setFromAxisAngle(_ax, a);   // up x away: positive angle tips the top away from the blow
    out.sy = 1 + s; out.sxz = 1 / Math.sqrt(out.sy);
    if (frozen) { const j = Math.sin(st.t * 190) * 0.06 * st.amp * Math.max(0, 1 - st.t / 0.2); out.jx = st.ux * j; out.jz = st.uz * j; } else { out.jx = 0; out.jz = 0; }
    // flash: white-hot pop, then the hero's colour as a soft glow for the rest of the stun
    const pop = st.pt < 0.4 ? Math.exp(-st.pt / 0.05) * st.amp : 0, glow = Math.min(1, hit / 0.3) * 0.6;
    out.hot = hit > 0 || pop > 0.01;
    out.r = 1 + 2.2 * pop + glow * (st.r * 1.6 - 0.25); out.g = 1 + 2.2 * pop + glow * (st.g * 1.6 - 0.25); out.b = 1 + 2.2 * pop + glow * (st.b * 1.6 - 0.25);
    return out;
}
