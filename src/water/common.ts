// Shared look for EVERY water body (Shifat 4:43 PM: 'All water bodies must have same visual properties'): the sea, the island lagoon + pools,
// the rivers and the park pond all include this one GLSL chunk, so FFT ripples, rain rings and water tint stay consistent. Needs `uniform sampler2D uNrm;` bound to WATER_NRM (the FFT tile).
export const WATER_COMMON_GLSL = `
// FFT ripple detail (public/waterfft.png: RG = slopes at t0, BA = 1.9 s later, cross-faded with the variance kept), ~22 m tile; returns the slope in [-1,1]
// frame-by-frame sim (Shifat 5:05 AM): one 22 m tile read as a repeating diagonal pattern at 30-150 m. A 2nd read, rotated ~41 deg at an
// irrational 0.618 scale and drifting the other way, is blended in: the two never line up, so the sea shows no repeat (1 extra fetch).
vec2 fftSlope(vec2 xz, float t){ vec4 c = texture2D(uNrm, xz * 0.045 + vec2(0.011, 0.006) * t); vec2 q = mat2(0.755, -0.656, 0.656, 0.755) * xz * 0.0278 + vec2(-0.007, 0.009) * t; vec4 c2 = texture2D(uNrm, q);
  float wt = 0.5 + 0.5 * sin(t * 0.83), wr = inversesqrt(wt * wt + (1.0 - wt) * (1.0 - wt)); vec2 s1 = (mix(c.rg, c.ba, wt) - 0.5) * wr * 2.0, s2 = mat2(0.755, 0.656, -0.656, 0.755) * ((mix(c2.ba, c2.rg, wt) - 0.5) * wr * 2.0);
  return (s1 * 0.8 + s2 * 0.6) * 0.8; }
// reflections of cities / islands / trees: soft, subtle, leaning to the water's own blue (Shifat 3:49 PM)
// Rain (Shifat Oct 31 5:42 PM): raindrop impact rings on every water body, scaled by the shared uRain uniform (src/world/env.ts WEATHER.rain).
// Two jittered 0.9 m / 1.3 m cell grids, each cell one drop: an expanding ring that fades as it spreads. Returns a slope like fftSlope.
uniform float uRain;
uniform float uBow;
uniform float uAur;   // aurora on/off per night (WEATHER.aur, src/world/weather.tsx)   // rainbow envelope (WEATHER.bow, src/world/weather.tsx)
uniform float uFlash;
uniform vec3 uFd;
float waterHash21(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float rainHash(vec2 c){ return waterHash21(c); }
vec2 rainRing(vec2 xz, float t, float cs, float sp){ vec2 q = xz / cs, id = floor(q); float h = rainHash(id), h2 = rainHash(id + 17.3);
  vec2 l = fract(q) - 0.5 - (vec2(h, h2) - 0.5) * 0.5; float age = fract(t * sp + h * 7.0), r = age * 0.42, d = length(l), x = d - r;
  float ring = sin(x * 13.0) * exp(-x * x * 45.0) * (1.0 - age) * (1.0 - age); return l / max(d, 1e-3) * ring; }
vec2 rainSlope(vec2 xz, float t){ float px = length(fwidth(xz)); return (rainRing(xz, t, 1.3, 1.3) + rainRing(xz + 3.7, t, 1.9, 1.05)) * 1.0 * (1.0 - smoothstep(0.05, 0.16, px)); }   /* Nov 2 (real ref 'Reeds and Rain'): rings bolder and kept to a coarser pixel footprint so they read from game camera height */   /* rings thinner than a pixel alias into dark specks: faded out by pixel footprint */
// Shared optical terms: dielectric water Fresnel (n=1.333) and a restrained forward-scattering lobe.
float waterFresnel(float cosTheta){ float f0=0.02037; float x=1.0-clamp(cosTheta,0.0,1.0); return f0+(1.0-f0)*x*x*x*x*x; }
vec3 waterSSS(vec3 V, vec3 N, vec3 sunDir, float crest, float dayK){ float forward=pow(clamp(dot(V,normalize(-sunDir+N*0.45)),0.0,1.0),3.5); return vec3(0.035,0.30,0.27)*forward*clamp(crest,0.0,1.0)*dayK; }
vec3 reflTint(vec3 c, vec3 base){ return mix(c, dot(c, vec3(0.3, 0.5, 0.2)) * vec3(0.6, 0.8, 1.05) + base * 0.25, 0.7); }
// ray vs capsule (hero bodies), shared by every water body
float capHitP(vec3 ro, vec3 rd, vec3 pa, vec3 pb, float ra){ vec3 ba = pb - pa, oa = ro - pa; float baba = dot(ba, ba), bard = dot(ba, rd), baoa = dot(ba, oa), rdoa = dot(rd, oa), oaoa = dot(oa, oa);
  float a = baba - bard * bard, b = baba * rdoa - baoa * bard, c = baba * oaoa - baoa * baoa - ra * ra * baba, h = b * b - a * c; if (h < 0.0 || baba < 1e-4) return -1.0;
  float t = (-b - sqrt(h)) / a, y = baoa + t * bard; if (y > 0.0 && y < baba) return t;
  vec3 oc = y <= 0.0 ? oa : ro - pb; b = dot(rd, oc); c = dot(oc, oc) - ra * ra; h = b * b - c; return h > 0.0 ? -b - sqrt(h) : -1.0; }
#define WATER_REFL_W 0.5
#define WATER_FFT_K 0.125
`;

import * as THREE from 'three';
/* Shifat 11:26 PM 'Remove outline pass from waters': a water material keeps its normal colour blend but stamps the world target's ALPHA to 0.6
   (alpha = dst * 0.6; opaque dst is 1), which the outline pass reads as the 'never inked' class. Works for any drawn water fragment. */
export function noInk<T extends THREE.Material>(m: T, premult = false): T {
  m.blending = THREE.CustomBlending; m.blendEquation = THREE.AddEquation; m.blendEquationAlpha = THREE.AddEquation;
  m.blendSrc = premult ? THREE.OneFactor : THREE.SrcAlphaFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.ConstantAlphaFactor; (m as any).blendAlpha = 0.6; return m;
}
