import * as THREE from 'three';

// A small shared impact ring-buffer. Uniform array is shared by every authored
// water material; CPU writes are allocation-free after module initialization.
export const RIPPLE_SLOTS = 16;
export const RIPPLE_UNIFORMS = { value: Array.from({ length: RIPPLE_SLOTS }, () => new THREE.Vector4(0, 0, -1000, 0)) };
let head = 0;
export function spawnWaterRipple(x: number, z: number, time: number, strength = 1) {
    RIPPLE_UNIFORMS.value[head].set(x, z, time, THREE.MathUtils.clamp(strength, 0.08, 2.5));
    head = (head + 1) % RIPPLE_SLOTS;
}
export const WATER_RIPPLES_GLSL = `
uniform vec4 uRip[16];
vec2 waterRippleSlope(vec2 xz, float t){ vec2 outS=vec2(0.0);
 for(int i=0;i<16;i++){ vec4 r=uRip[i]; float age=t-r.z; if(age<0.0||age>3.2) continue;
  vec2 d=xz-r.xy; float dist=length(d); float phase=(dist-age*6.0)*6.2831853;
  float env=exp(-age*1.15)*exp(-max(dist-age*6.0,0.0)*0.11)*r.w;
  outS += (d/max(dist,0.04))*cos(phase)*env*0.11;
 } return outS; }
`;
