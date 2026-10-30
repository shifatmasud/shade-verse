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
