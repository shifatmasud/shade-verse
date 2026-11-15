// Water splash particles (Nov 15 2026, Shifat: 'wave impact should be particle based realistic'; 4:38 PM: 'All water bubble, particles sizes are too big.
// Make them super tiny & many (use gpgpu techniques)').
// Pure data, no imports (combatFx and the sim may queue into it without import cycles). Emitters only queue BURSTS here (where, what kind, how many);
// src/water/gpuSplash.ts spawns and simulates every particle on the GPU (ping-pong float textures), so a dive throws thousands of millimetre drops
// for the cost of one 128x128 pass.

/** Particle kinds (the GPU spawn + physics + look switch on these). */
export const SK = { CROWN: 0, JET: 1, MIST: 2, STROKE: 3, SHEET: 4, DRIP: 5, BUBBLE: 6, FOAM: 7, RAIN: 8, SPRAY: 9 } as const;
export type Burst = { k: number; x: number; y: number; z: number; n: number; e: number; s: number; dx: number; dz: number; wy: number };
export const bursts: Burst[] = [];
/** Queue a burst: kind, position, count, energy (0.15..1.8), body size (m), direction / carried velocity (dx, dz), water level there (wy). */
export function splBurst(k: number, x: number, y: number, z: number, n: number, e = 1, s = 0.5, dx = 0, dz = 0, wy = y) {
    if (n < 1 || bursts.length > 96) return; bursts.push({ k, x, y, z, n: Math.round(n), e, s, dx, dz, wy });
}

/** Hits that may land on water (combat FX, objects): x, y, z, strength. WaterFX keeps the ones that are actually at a water surface. */
export const waterHits: number[] = [];
export function queueWaterHit(x: number, y: number, z: number, strength = 1) { if (waterHits.length < 64 * 4) waterHits.push(x, y, z, strength); }
