import * as THREE from 'three';
import { emit, SH_GLOW, SH_GPUFF, SH_DUST, LOW, tint } from './combatFx';

/* Landing feel, render-only (Nov 3 2026, "never stop" queue: make landings read). Reads what the sim already writes on a touchdown
   (sim.land = impact / 30, sim.landHard on a very high drop) and changes nothing the sim reads: controls, input timing, physics, hitboxes
   and when the hero can act again are untouched. The crouch itself lives in heroTraversal.ts landBones.
   - PUFF: a soft glowing light smear that spreads out along the ground from the feet in the hero's colour (Shadow purple, Ghost pink),
     scaled by the impact: a small hop is a faint breath at the feet, a big drop a wide glowing wash, a superhero landing adds a warm
     glow under the hero and a little soft dust. Only the existing soft additive sprites (one instanced draw, no new draw call), no rings,
     no sparks, no crisp particles (Shifat Nov 2: "only glowing blurry vfx", "no sharp edges", "No more solid rings").
   - CAMERA DIP: big drops only (a standing jump lands at ~24 m/s and does not dip; only the very top of the soft range, ~25-26 m/s, gives a hint,
     and a superhero landing over 26 m/s the full dip): the player's camera sinks a few cm and pitches down a hair on a quick ease
     (peak ~70 ms, settled by ~0.4 s), deeper for a superhero landing. Small hops and Ghost's landings never move the camera. */

type Seen = { g: boolean; land: number };
const seen = new WeakMap<object, Seen>();
const DBG = !!(import.meta as any).env.VITE_DBG;
/** test hook (instrumented builds only): window.__landFeelOff = true renders landings as before this pass (no puff, no dip) */
const off = () => DBG && !!(globalThis as any).__landFeelOff;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const sstep = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

/** fresh touchdown this frame? (the sim sets land on the frame it lands; it only decays after) */
function touchdown(s: any): number {
    let st = seen.get(s); if (!st) { st = { g: !!s.ground, land: s.land || 0 }; seen.set(s, st); return 0; }
    const land = s.land || 0, fresh = !!s.ground && land > st.land + 0.05 && !s.swim && !s.slam && !s.wall;
    st.g = !!s.ground; st.land = land;
    return fresh ? land : 0;
}

/** soft glowing puff at the feet; li = impact 0..1, hard = superhero landing */
export function landPuff(x: number, gy: number, z: number, li: number, hard: boolean, col: number) {
    const k = hard ? 1 : Math.min(1, li), y = gy + 0.04, light = tint(col, 0.55);
    emit(SH_GLOW, x, gy + 0.18, z, 0, 0, 0, 0.16 + 0.14 * k, 0.5 + 0.7 * k, 1.0 + 1.6 * k, col, 0.22 + 0.4 * k, 0, 0, 0.12, 2);   // glow at the feet
    if (hard) emit(SH_GPUFF, x, y, z, 0, 0, 0, 0.55, 1.2, 2.4, col, 0.32, 0, 0, 0.12, 2);   // warm hero-colour wash under a superhero landing
    // ground smear: soft light pushed out from under the feet, fronts end at ~R
    const R = 0.45 + 1.5 * k + (hard ? 0.6 : 0), n = Math.round((LOW ? 0.6 : 1) * (5 + 13 * k)), d = 5;
    for (let i = 0; i < n; i++) {
        const th = (i / n) * Math.PI * 2 + rnd(-0.2, 0.2), life = rnd(0.26, 0.36) + 0.14 * k, v0 = R * rnd(0.8, 1.05) * d / (1 - Math.exp(-d * life));
        emit(SH_GPUFF, x + Math.cos(th) * 0.18, y + 0.015 * (i & 3), z + Math.sin(th) * 0.18, Math.cos(th) * v0, 0, Math.sin(th) * v0, life,
            0.22 + 0.16 * k, 0.45 + 0.55 * k, i % 3 === 0 ? light : col, 0.28 + 0.42 * k, 0, d, 0.12, 1);
    }
    if (!LOW && k > 0.7) for (let i = 0; i < (hard ? 7 : 4); i++) {   // a little soft dust, tinted toward the hero colour, big drops only
        const th = rnd(0, Math.PI * 2), sp = rnd(1.5, 3.5) * k;
        emit(SH_DUST, x + Math.cos(th) * 0.35, gy + 0.15, z + Math.sin(th) * 0.35, Math.cos(th) * sp, rnd(0.3, 0.9), Math.sin(th) * sp, 0.55, 0.45, 1.3, tint(col, 0.7), 0.3, 0, 2.5);
    }
}

const dip = { t: 9, a: 0, p: 0 };
/** per frame, after the chase camera is placed: puffs for both heroes, dip for the player's camera */
export function landFeel(camera: THREE.Camera, sim: any, ghost: any, dt: number, camOn: boolean) {
    if (off()) return;
    for (let hi = 0; hi < 2; hi++) {   // both heroes, no per-frame array
        const s = hi ? ghost : sim;
        if (!s || !s.pos) continue;
        const li = touchdown(s); if (!li) continue;
        const hard = (s.landHard || 0) > 0;
        landPuff(s.pos[0], s.pos[1] - 1, s.pos[2], li, hard, (s.fxCol ?? 0xa855f7) as number);
        if (s === sim) { const big = sstep((li - 0.84) / 0.06); if (big > 0.05 || hard) { dip.t = 0; dip.a = hard ? 0.2 : 0.08 * big; dip.p = hard ? 1.6 : 0.8 * big; } }
    }
    if (dip.t > 0.6) { if (DBG) (globalThis as any).__landDip = 0; return; }
    dip.t += dt;
    const u = dip.t / 0.07, e = u * Math.exp(1 - u);   // 0 -> 1 at ~70 ms -> eased out by ~0.4 s
    if (DBG) (globalThis as any).__landDip = +(dip.a * e).toFixed(3);
    if (!camOn) return;
    camera.translateY(-dip.a * e); camera.rotateX(-dip.p * Math.PI / 180 * e);
}
