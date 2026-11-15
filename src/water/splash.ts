// Water splash particles (Nov 15 2026, Shifat: 'wave impact should be particle based realistic').
// Pure data, no imports (combatFx and the sim may queue into it without import cycles); src/water/WaterFX.tsx steps and draws it.
// Real splash anatomy (high-speed photos of a body entering water): a crown sheet that breaks into droplets thrown up and out on ballistic arcs,
// a central Worthington jet that rises a moment later and breaks into drops, fine mist that hangs and drifts, and every drop that falls back
// raises its own small ring (fed into the height-field by WaterFX). One instanced point draw for all of it.

export const SPL_MAX = 720, SF = 10;   // floats per particle: 0-2 pos, 3-5 vel, 6 age, 7 life, 8 size, 9 kind (0 drop, 1 mist)
export const spl = new Float32Array(SPL_MAX * SF);
export const splPool = { n: 0 };

export function splEmit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, kind = 0) {
    let i = splPool.n;
    if (i >= SPL_MAX) { let oa = -1; for (let k = 0; k < SPL_MAX; k++) { const f = spl[k * SF + 6] / spl[k * SF + 7]; if (f > oa) { oa = f; i = k; } } } else splPool.n++;
    const o = i * SF; spl[o] = x; spl[o + 1] = y; spl[o + 2] = z; spl[o + 3] = vx; spl[o + 4] = vy; spl[o + 5] = vz; spl[o + 6] = 0; spl[o + 7] = life; spl[o + 8] = size; spl[o + 9] = kind;
}

/** Hits that may land on water (combat FX, objects): x, y, z, strength. WaterFX keeps the ones that are actually at a water surface. */
export const waterHits: number[] = [];
export function queueWaterHit(x: number, y: number, z: number, strength = 1) { if (waterHits.length < 64 * 4) waterHits.push(x, y, z, strength); }
