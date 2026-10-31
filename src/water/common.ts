// Shared look for EVERY water body (Shifat 4:43 PM: 'All water bodies must have same visual properties'): the sea, the island lagoon + pools,
// the rivers and the park pond all include this one GLSL chunk, so FFT ripple detail, the soft blue reflection tint and the hero reflection
// style are defined once and can never drift apart. Needs `uniform sampler2D uNrm;` bound to WATER_NRM (the FFT tile).
export const WATER_COMMON_GLSL = `
// FFT ripple detail (public/waterfft.png: RG = slopes at t0, BA = 1.9 s later, cross-faded with the variance kept), ~22 m tile; returns the slope in [-1,1]
vec2 fftSlope(vec2 xz, float t){ vec4 c = texture2D(uNrm, xz * 0.045 + vec2(0.011, 0.006) * t); float wt = 0.5 + 0.5 * sin(t * 0.83), wr = inversesqrt(wt * wt + (1.0 - wt) * (1.0 - wt)); return (mix(c.rg, c.ba, wt) - 0.5) * wr * 2.0; }
// reflections of cities / islands / trees: soft, subtle, leaning to the water's own blue (Shifat 3:49 PM)
vec3 reflTint(vec3 c, vec3 base){ return mix(c, dot(c, vec3(0.3, 0.5, 0.2)) * vec3(0.6, 0.8, 1.05) + base * 0.25, 0.7); }
// hero reflections (Shifat 4:26 PM): feathered (inner hit 1, outer fatter hit 0.45), sea-tinted, faded with distance - never a hard dark pill
float heroSoftK(float inner, float outer){ return inner > 0.0 ? 1.0 : (outer > 0.0 ? 0.45 : 0.0); }
vec3 heroReflCol(vec3 hc, vec3 base, float day){ return mix(hc * mix(0.35, 1.0, day), base * vec3(0.55, 0.7, 0.85), 0.45); }
float heroReflW(float k, float dist){ return k * 0.6 * (1.0 - smoothstep(10.0, 40.0, dist)); }
#define WATER_REFL_W 0.5
#define WATER_FFT_K 0.125
`;
