import * as THREE from 'three';
// Shifat 2:28 AM Oct 30 "study real clean caustic patterns": a physically made caustic tile (public/caustics.png) - a million light rays
// refracted through a tileable rippled surface (n 1.333) and splatted onto the floor, which gives the clean cellular network of thin
// bright lines seen in real pools and shallow seas. Animated the standard way: two copies drifting apart, min() keeps the lines thin,
// and a tiny per-channel offset gives the faint rainbow fringe of real caustics.
export const CAUSTIC_TEX = new THREE.TextureLoader().load('/caustics.png', (t) => { t.needsUpdate = true; });
CAUSTIC_TEX.wrapS = CAUSTIC_TEX.wrapT = THREE.RepeatWrapping; CAUSTIC_TEX.minFilter = THREE.LinearMipmapLinearFilter; CAUSTIC_TEX.magFilter = THREE.LinearFilter;
CAUSTIC_TEX.colorSpace = THREE.NoColorSpace;
export const CAUSTIC_GLSL = `uniform sampler2D uCaus;
vec3 causRGB(vec2 xz, float t){
  vec2 a = xz * 0.21 + vec2(0.023, 0.011) * t, b = mat2(0.81, -0.59, 0.59, 0.81) * xz * 0.26 + vec2(-0.017, 0.021) * t;
  float l2 = texture2D(uCaus, b).r; vec2 o = vec2(0.0035, 0.0021);
  return vec3(min(texture2D(uCaus, a + o).r, l2), min(texture2D(uCaus, a).r, l2), min(texture2D(uCaus, a - o).r, l2));
}`;
// Tileable ripple normal map (public/waternormal.png): gradient of ~45 random integer-wavenumber waves, RG = slope. Scrolled in two layers for micro detail.
// Shifat 3:23 PM: replaced by an offline FFT ocean tile (public/waterfft.png, RG = slopes at t0, BA = 1.9 s later). Old map kept in public/ for reference.
export const WATER_NRM = new THREE.TextureLoader().load('/waterfft.png', (t) => { t.needsUpdate = true; });
WATER_NRM.wrapS = WATER_NRM.wrapT = THREE.RepeatWrapping; WATER_NRM.minFilter = THREE.LinearMipmapLinearFilter; WATER_NRM.magFilter = THREE.LinearFilter; WATER_NRM.colorSpace = THREE.NoColorSpace; WATER_NRM.anisotropy = 4;

// Hero positions for the analytic reflection trace (xyz = feet, w = 1 when present). Shadow is set by Scene, Ghost by Ghost.tsx.
export const HERO_REFL = { shadow: new THREE.Vector4(0, -999, 0, 0), ghost: new THREE.Vector4(0, -999, 0, 0), shadowDir: new THREE.Vector4(0, 0, 1, 0) };   // shadowDir: facing xz, w = 1 while swimming (body lies flat)
