import { WATERLINE, UWP } from '../world/env';

/* Shifat Nov 15 8:06 PM 'underwater dive scene must look same when looked from air water split water line': every water-medium shader
   used to ask 'is the CAMERA under water?' (smoothstep(-3, -1.2, cameraPosition.y)), so the split lens - camera at the surface - drew the
   under half with the from-above look. lensAir(w) asks it per pixel instead: with the split on, the pixel's side of the drawn waterline;
   otherwise the dive flag from Scene (UWP.x), else the old camera-height ramp. 1 = this fragment is seen from air, 0 = from inside the water. */
export const WL_GLSL = `uniform vec4 uWL; uniform vec4 uWLq[7];
float wlAt(int i){ vec4 v = uWLq[i / 4]; int c = i - (i / 4) * 4; return c == 0 ? v.x : (c == 1 ? v.y : (c == 2 ? v.z : v.w)); }
float wlY(float x){ float f = clamp(x * 12.0 + 12.0, 0.0, 23.999); int i = int(f); float t = f - float(i);
  float p0 = wlAt(max(i - 1, 0)), p1 = wlAt(i), p2 = wlAt(i + 1), p3 = wlAt(min(i + 2, 24));
  return p1 + 0.5 * t * (p2 - p0 + t * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3 + t * (3.0 * (p1 - p2) + p3 - p0))); }   /* Catmull-Rom through the 25 solved columns. The meniscus ripple is no longer added here in screen space (it slid with the camera heading): it is part of each column's world-space surface height, see wlRipple in updateWaterline (Shifat Nov 6 10:51 PM 'camera movements must not affect water line waves') */
`;
export const LENS_GLSL = WL_GLSL + `uniform mat4 projectionMatrix; uniform vec4 uLensP;
float lensAir(vec3 w){ if (uWL.w > 0.5) { vec4 c = projectionMatrix * (viewMatrix * vec4(w, 1.0)); vec2 sn = c.xy / max(c.w, 1e-4); return sn.y > wlY(sn.x) ? 1.0 : 0.0; }
  return uLensP.x > 0.5 ? 0.0 : smoothstep(-3.0, -1.2, cameraPosition.y); }
`;
/** uniforms LENS_GLSL reads (shared references, updated by Scene each frame) */
export const lensU = () => ({ uWL: { value: WATERLINE.v }, uWLq: { value: WATERLINE.q }, uLensP: { value: UWP.v } });
