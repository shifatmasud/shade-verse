import { IX_GLSL, IX_UNIFORMS, ixImpulse } from './interaction';

/* Nov 15 2026: the 16-slot analytic ring buffer (normals-only rings painted over the water) is replaced by the interactive height-field in
   ./interaction.ts. These names are kept so every water shader that already includes WATER_RIPPLES_GLSL / calls waterRippleSlope() and binds
   RIPPLE_UNIFORMS now reads the real simulated surface instead. */
/** Uniforms to spread into a water material (uIxTex, uIxB, uIxOn). */
export const RIPPLE_UNIFORMS = IX_UNIFORMS;
/** Legacy entry point: a small impact at (x, z). */
export function spawnWaterRipple(x: number, z: number, _time: number, strength = 1) { ixImpulse(x, z, -0.05 * Math.min(2.5, Math.max(0.08, strength)), 0.35); }
export const WATER_RIPPLES_GLSL = IX_GLSL + `
vec2 waterRippleSlope(vec2 xz, float t){ return ixSlope(xz); }
`;
