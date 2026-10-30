import * as THREE from 'three';
/* Upgrade #5 (Oct 29 plan "street camera gets blocked by robots up close"): robots and pedestrians that stand between the camera and
   the hero, or right against the lens, dissolve with a screen-door dither so the hero is never hidden. Shader-only (no sorting, no
   transparency cost), works on instanced meshes. Heroes are untouched. */
export const OCC = { uOccHero: { value: new THREE.Vector3(0, -999, 0) } };
export function occludeFade(sh: any) {
    sh.uniforms.uOccHero = OCC.uOccHero;
    sh.vertexShader = 'varying vec3 vOccW;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
    { vec4 op = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
    op = instanceMatrix * op;
    #endif
    vOccW = (modelMatrix * op).xyz; }`);
    sh.fragmentShader = 'varying vec3 vOccW; uniform vec3 uOccHero;\n' + sh.fragmentShader.replace('void main() {', `void main() {
    { vec3 oc = cameraPosition, oh = uOccHero, seg = oh - oc; float L2 = max(dot(seg, seg), 1e-3);
      float t = clamp(dot(vOccW - oc, seg) / L2, 0.0, 1.0); float dseg = length(vOccW - (oc + seg * t));
      float behind = 1.0 - smoothstep(0.78, 0.95, t);   // only between the lens and the hero, not past the hero
      float f = max((1.0 - smoothstep(1.15, 1.6, dseg)) * behind, 1.0 - smoothstep(1.8, 2.6, length(vOccW - oc)));
      if (f > 0.45) discard;   /* clean cut instead of a dither: the outline pass inked every dither hole as black speckle */ }`);
}
