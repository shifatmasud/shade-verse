/**
 * Ghost's body, shared by the game (src/Ghost.tsx) and the first screen's build-time hero bake (tools/title/heroBake.ts), so the
 * title Ghost is always exactly the in-game Ghost. Moved here verbatim from Ghost.tsx (pass 2, 7cb1d5f); no behaviour change.
 */
import heroData from './hero.json';

/** Ghost's rig draws at this fraction of Shadow's scale (Shifat Nov 2 4:20 PM: "Reduce her height"); visual only */
export const GHOST_HEIGHT = 0.93;

/* Ghost's heroine build (Shifat Nov 2 3:50 PM: "Ghosts body need to be feminine like our illustrations too"). Rest-pose vertex reshape only:
   Shadow's mesh, UVs, skin weights and bones are reused untouched, so every animation, the ink outline (rebuilt normals) and the hitboxes
   stay as they were. Torso: defined waist, fuller hips, narrower upper chest, a soft bust. Limbs: each vertex is slimmed radially around
   the bone segments it is skinned to, blended by its own skin weights (smooth across joints): slimmer arms and hands, thighs slim toward
   the knee (hips keep their width), slimmer calves. Shoulders: arm-skinned vertices sit 6 cm further in and the upper chest edge narrows,
   so the shoulder flaps stay but scale with the frame. Head/hood a touch smaller. */
const FEM_LIMB: Record<string, number> = { uarmL: 0.66, uarmR: 0.66, farmL: 0.70, farmR: 0.70, handL: 0.78, handR: 0.78, thighL: 0.84, thighR: 0.84, shinL: 0.78, shinR: 0.78, footL: 0.90, footR: 0.90, head: 0.90, neck: 0.88 };
const FEM_ARMS = new Set(['uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR']);
export function feminineHeroData() {
    const d = JSON.parse(JSON.stringify(heroData)) as any;
    const p: number[] = d.pos, si: number[] = d.si, sw: number[] = d.sw, bones: { n: string; p: number; h: number[] }[] = d.bones;
    const gauss = (y: number, center: number, width: number) => Math.exp(-(((y - center) / width) ** 2));
    const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const child: number[] = bones.map(() => -1);
    bones.forEach((b, i) => { if (b.p >= 0 && child[b.p] < 0) child[b.p] = i; });
    const q = [0, 0, 0], r = [0, 0, 0];
    for (let v = 0, i = 0; i < p.length; v++, i += 3) {
        const x = p[i], y = p[i + 1], z = p[i + 2];
        // torso (pass 2, Shifat Nov 2 4:20 PM: stronger hourglass, a bit more bust)
        const torsoWeight = Math.max(0, 1 - Math.abs(x) / 0.34);
        const hip = 1 + 0.24 * gauss(y, 0.93, 0.15);
        const waist = 1 - 0.36 * gauss(y, 1.18, 0.13);
        const chest = 1 - 0.15 * gauss(y, 1.52, 0.16);
        const factor = 1 + ((y < 1.06 ? hip : y < 1.36 ? waist : chest) - 1) * torsoWeight;
        const depth = 1 - 0.14 * gauss(y, 1.18, 0.12) * torsoWeight;   // the waist narrows front-to-back too, so the hourglass reads in 3/4 and side
        q[0] = x * factor; q[1] = y; q[2] = z * depth;
        if (z > 0 && Math.abs(x) < 0.27) {   // bust: two soft rounded forms, fuller lower edge, fading out at the sides and into the collar
            const lobe = Math.exp(-(((Math.abs(x) - 0.095) / 0.09) ** 2)) * Math.exp(-(((y - 1.415) / (y < 1.415 ? 0.06 : 0.095)) ** 2));
            q[2] += 0.095 * lobe * torsoWeight * sstep(0.0, 0.08, z); q[1] += 0.015 * lobe;
        }
        if (z < 0 && y < 1.06 && y > 0.75 && Math.abs(x) < 0.3) q[2] -= 0.035 * gauss(y, 0.9, 0.1) * sstep(-0.02, -0.1, z) * torsoWeight;   // a touch more seat
        // limbs, blended by skin weight
        let ox = 0, oy = 0, oz = 0, wsum = 0, armW = 0;
        for (let k = 0; k < 4; k++) {
            const w = sw[v * 4 + k]; if (w <= 0) continue;
            const bi = si[v * 4 + k], b = bones[bi], s = FEM_LIMB[b.n];
            r[0] = q[0]; r[1] = q[1]; r[2] = q[2];
            if (FEM_ARMS.has(b.n)) armW += w;
            if (s !== undefined) {
                const h0 = b.h, c = child[bi];
                if (c >= 0 && b.n !== 'head' && b.n !== 'neck') {
                    const h1 = bones[c].h, ax = h1[0] - h0[0], ay = h1[1] - h0[1], az = h1[2] - h0[2], L = Math.hypot(ax, ay, az);
                    const ux = ax / L, uy = ay / L, uz = az / L, vx = q[0] - h0[0], vy = q[1] - h0[1], vz = q[2] - h0[2];
                    const t = vx * ux + vy * uy + vz * uz;
                    const ss = b.n.startsWith('thigh') ? 1 - (1 - s) * sstep(0, 0.55, t / L) : s;
                    r[0] = h0[0] + ux * t + (vx - ux * t) * ss; r[1] = h0[1] + uy * t + (vy - uy * t) * ss; r[2] = h0[2] + uz * t + (vz - uz * t) * ss;
                } else {
                    const cx = b.n === 'head' || b.n === 'neck' ? 0 : h0[0], cy = b.n === 'head' || b.n === 'neck' ? 1.72 : h0[1], cz = b.n === 'head' || b.n === 'neck' ? 0 : h0[2];
                    r[0] = cx + (q[0] - cx) * s; r[1] = cy + (q[1] - cy) * s; r[2] = cz + (q[2] - cz) * s;
                }
            }
            ox += r[0] * w; oy += r[1] * w; oz += r[2] * w; wsum += w;
        }
        if (wsum > 0) { ox /= wsum; oy /= wsum; oz /= wsum; armW /= wsum; } else { ox = q[0]; oy = q[1]; oz = q[2]; }
        // narrower shoulders; the angular shoulder flaps stay but are smaller and slimmer (pivot at the top of the arm)
        if (armW > 0.3 && y > 1.38) {
            const s = 1 - 0.34 * sstep(1.38, 1.5, y) * armW, px = Math.sign(ox) * 0.26, py = 1.48;
            ox = px + (ox - px) * s; oy = py + (oy - py) * s; oz *= 1 - 0.12 * sstep(1.38, 1.5, y) * armW;
        }
        ox -= Math.sign(ox) * 0.075 * armW;
        ox *= 1 - 0.24 * sstep(1.38, 1.55, oy) * (1 - armW) * sstep(0.10, 0.30, Math.abs(ox));
        if (oy > 1.5 && armW < 0.5) ox *= 1 - 0.12 * sstep(1.5, 1.62, oy) * sstep(0.12, 0.26, Math.abs(ox));   // hood edges over the shoulders follow the slimmer frame
        p[i] = ox; p[i + 1] = oy; p[i + 2] = oz;
    }
    d.rebuildNormals = true;
    return d;
}
