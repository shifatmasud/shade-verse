/**
 * Ghost's body, shared by the game (src/Ghost.tsx) and the first screen's build-time hero bake (tools/title/heroBake.ts), so the
 * title Ghost is always exactly the in-game Ghost. Moved here from Ghost.tsx (pass 2, 7cb1d5f); shoulders/arms/hands back to Shadow's own (Nov 2, 4:54 PM).
 */
import heroData from './hero.json';

/** Ghost's rig draws at this fraction of Shadow's scale (Shifat Nov 2 4:20 PM: "Reduce her height"); visual only */
export const GHOST_HEIGHT = 0.93;

/* Ghost's heroine build (Shifat Nov 2 3:50 PM: "Ghosts body need to be feminine like our illustrations too"). Rest-pose vertex reshape only:
   Shadow's mesh, UVs, skin weights and bones are reused untouched, so every animation, the ink outline (rebuilt normals) and the hitboxes
   stay as they were. Torso: defined waist, narrower upper chest, a soft bust; no hip flare. Legs: each vertex is slimmed radially around
   the bone segments it is skinned to, blended by its own skin weights (smooth across joints): thighs follow Shadow's straight hip-to-knee
   line a touch narrower (about 0.93 at the hip easing to 0.84 toward the knee; Shifat Nov 2 5:18 PM on the hip flare: "They are too thick.
   Look at shadow. His ones thighs looks great"), slimmer calves. Head/hood a touch smaller. Shoulders, shoulder flaps, arms and hands are Shadow's own (no pull-in, no flap shrink,
   no arm/hand slimming), as on the first screen before the pass-2 body: Shifat Nov 2 4:53 PM "Old shoulder, hand looked better", 4:54 PM "Same" (in game too). */
const FEM_LIMB: Record<string, number> = { thighL: 0.84, thighR: 0.84, shinL: 0.78, shinR: 0.78, footL: 0.90, footR: 0.90, head: 0.90, neck: 0.88 };
/* Reference-driven anatomy (Shifat Nov 2 5:54-5:55 PM, sending a female body model: "Or use it as reference and modify ghosts current body mesh
   (not clothes)"). The A-pose mesh of "Female Body (A-Pose & T-Pose) Free" by Leafar (CC-BY-4.0, credited in CREDITS.md; not shipped) was scaled to
   her height (crotch, knee and shoulder land within 2 cm of hers, so leg length is untouched) and to her 2d8c41e hip width, then measured in
   cross-sections front and side (tools/body_ref/measure_ref.py). What it changed, against 2d8c41e: */
const REF = {
    waistUpWidth: 0.19,  // waist stays narrow above the belt up to the lower ribs (ref waist is higher, rib cage narrow); below the belt unchanged
    waistEdge: 0.08,     // waist outline at the belt, 1.12-1.24 (hips below 1.08 untouched)
    flank: 0.12,         // extra pull-in of the flank silhouette at 1.23-1.32 (ref half-width ~15% under hers there)
    belly: 0.08,         // lower belly front depth (ref ~10% flatter)
    bust: 0.08, bustX: 0.085, bustY: 1.445,   // was 0.095 at x 0.095, y 1.415: ref apex is higher, a little closer in, less projection
    seat: 0.038, seatY: 1.04,                 // was 0.035 at y 0.90 (the glute fold): ref glute is fullest above the crotch, a rounder seat from side and back
    knee: 0.12,          // knee width (ref ~12% narrower side-to-side)
    kneeFront: 0.2,      // knee front sits flatter (ref knee depth ~25% under hers; the pads keep their shape, just less forward bulge)
    calfLow: 0.05,       // lower calf (ref ~8-13% fuller just above the boot)
};
export function feminineHeroData() {
    const d = JSON.parse(JSON.stringify(heroData)) as any;
    const p: number[] = d.pos, si: number[] = d.si, sw: number[] = d.sw, bones: { n: string; p: number; h: number[] }[] = d.bones;
    const arm: number[] = [];   // per-vertex skin weight on the arm bones (so the flank pull-in never touches arms, shoulders, flaps or hands)
    for (let v = 0; v < sw.length / 4; v++) { let a = 0, t = 0; for (let k = 0; k < 4; k++) { const w = sw[v * 4 + k]; t += w; if (/arm|hand/.test(bones[si[v * 4 + k]].n)) a += w; } arm.push(t > 0 ? Math.min(1, a / t * 1.6) : 0); }
    const gauss = (y: number, center: number, width: number) => Math.exp(-(((y - center) / width) ** 2));
    const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const child: number[] = bones.map(() => -1);
    bones.forEach((b, i) => { if (b.p >= 0 && child[b.p] < 0) child[b.p] = i; });
    const q = [0, 0, 0], r = [0, 0, 0];
    for (let v = 0, i = 0; i < p.length; v++, i += 3) {
        const x = p[i], y = p[i + 1], z = p[i + 2];
        // torso (pass 2, Shifat Nov 2 4:20 PM: stronger hourglass, a bit more bust)
        const torsoWeight = Math.max(0, 1 - Math.abs(x) / 0.34);
        // waist: same curve as 2d8c41e below the belt (hips/thighs never wider), but above it the waist runs on up to the ribs (ref: the natural
        // waist sits higher and the torso stays narrow up to the lower ribs, instead of flaring back out right above the belt)
        const waist = 1 - 0.36 * gauss(y, 1.18, y < 1.18 ? 0.13 : REF.waistUpWidth);
        const chest = 1 - 0.15 * gauss(y, 1.52, 0.16);
        const factor = 1 + ((y < 1.06 ? 1 : y < 1.18 ? waist : Math.min(waist, chest)) - 1) * torsoWeight;
        const depth = 1 - 0.14 * gauss(y, 1.18, 0.12) * torsoWeight;   // the waist narrows front-to-back too, so the hourglass reads in 3/4 and side
        q[0] = x * factor; q[1] = y; q[2] = z * depth;
        // flank above the belt, outer edge included (torsoWeight fades to nothing there): ref half-width at 1.26-1.32 is ~15% under Shadow's
        if (y > 1.17 && y < 1.4 && z > -0.13) q[0] *= 1 - REF.flank * sstep(1.17, 1.23, y) * (1 - sstep(1.3, 1.38, y)) * sstep(0.08, 0.17, Math.abs(x)) * (1 - arm[v]);
        // waist edge at the belt (torsoWeight barely reaches the outline there): ref waist-to-hip is 0.51, hers was 0.69; now ~0.63, hips untouched
        if (y > 1.1 && y < 1.26) q[0] *= 1 - REF.waistEdge * gauss(y, 1.18, 0.04) * sstep(0.09, 0.15, Math.abs(x)) * (1 - arm[v]);
        if (z > 0 && y > 0.98 && y < 1.16) q[2] *= 1 - REF.belly * gauss(y, 1.07, 0.05) * torsoWeight;   // flatter lower belly (ref front depth at 1.05-1.1 ~10% under hers)
        if (z > 0 && Math.abs(x) < 0.27) {   // bust: two soft rounded forms, fuller lower edge, fading out at the sides and into the collar; placed and sized from the ref
            const lobe = Math.exp(-(((Math.abs(x) - REF.bustX) / 0.09) ** 2)) * Math.exp(-(((y - REF.bustY) / (y < REF.bustY ? 0.065 : 0.095)) ** 2));
            q[2] += REF.bust * lobe * torsoWeight * sstep(0.0, 0.08, z); q[1] += 0.012 * lobe;
        }
        // seat: the glute's fullest point sits above the crotch (ref ~1.05, hero crotch ~0.97), not at the glute fold (was 0.9); athletic, modest
        if (z < 0 && y < 1.2 && y > 0.8 && Math.abs(x) < 0.3) q[2] -= REF.seat * gauss(y, REF.seatY, 0.085) * sstep(-0.02, -0.1, z) * torsoWeight;
        // limbs, blended by skin weight
        let ox = 0, oy = 0, oz = 0, wsum = 0;
        for (let k = 0; k < 4; k++) {
            const w = sw[v * 4 + k]; if (w <= 0) continue;
            const bi = si[v * 4 + k], b = bones[bi], s = FEM_LIMB[b.n];
            r[0] = q[0]; r[1] = q[1]; r[2] = q[2];
            if (s !== undefined) {
                const h0 = b.h, c = child[bi];
                if (c >= 0 && b.n !== 'head' && b.n !== 'neck') {
                    const h1 = bones[c].h, ax = h1[0] - h0[0], ay = h1[1] - h0[1], az = h1[2] - h0[2], L = Math.hypot(ax, ay, az);
                    const ux = ax / L, uy = ay / L, uz = az / L, vx = q[0] - h0[0], vy = q[1] - h0[1], vz = q[2] - h0[2];
                    const t = vx * ux + vy * uy + vz * uz;
                    const ss = b.n.startsWith('thigh') ? 1 - (1 - s) * (0.45 + 0.55 * sstep(0, 0.55, t / L)) : s;
                    const ax0 = h0[0] + ux * t, az0 = h0[2] + uz * t;
                    // knee narrower side-to-side (ref knee width ~12% under hers; the knee pads' front depth kept), lower calf a touch fuller
                    const kx = b.n.startsWith('thigh') || b.n.startsWith('shin') ? 1 - REF.knee * gauss(q[1], 0.535, 0.05) + REF.calfLow * gauss(q[1], 0.35, 0.05) : 1;
                    const kz = (b.n.startsWith('shin') ? 1 + REF.calfLow * gauss(q[1], 0.35, 0.05) : 1) * (vz - uz * t > 0 && (b.n.startsWith('thigh') || b.n.startsWith('shin')) ? 1 - REF.kneeFront * gauss(q[1], 0.62, 0.065) : 1);
                    r[0] = ax0 + (vx - ux * t) * ss * kx; r[1] = h0[1] + uy * t + (vy - uy * t) * ss; r[2] = az0 + (vz - uz * t) * ss * kz;
                } else {
                    const cx = b.n === 'head' || b.n === 'neck' ? 0 : h0[0], cy = b.n === 'head' || b.n === 'neck' ? 1.72 : h0[1], cz = b.n === 'head' || b.n === 'neck' ? 0 : h0[2];
                    r[0] = cx + (q[0] - cx) * s; r[1] = cy + (q[1] - cy) * s; r[2] = cz + (q[2] - cz) * s;
                }
            }
            ox += r[0] * w; oy += r[1] * w; oz += r[2] * w; wsum += w;
        }
        if (wsum > 0) { ox /= wsum; oy /= wsum; oz /= wsum; } else { ox = q[0]; oy = q[1]; oz = q[2]; }
        p[i] = ox; p[i + 1] = oy; p[i + 2] = oz;
    }
    d.rebuildNormals = true;
    return d;
}
