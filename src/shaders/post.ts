// Post-processing: FXAA (plus sharpened variant) and the ink outline pass. Moved verbatim from Scene.tsx.
import { WL_GLSL } from '../water/waterline';
export const FXAA_FS = `uniform sampler2D tDiffuse; uniform vec2 uRes; varying vec2 vUv;
float lum(vec3 c){ return dot(sqrt(max(c, 0.0)), vec3(0.299, 0.587, 0.114)); }
void main(){
  vec2 px = 1.0 / uRes;
  vec3 cM = texture2D(tDiffuse, vUv).rgb;
  vec3 cNW = texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * px).rgb, cNE = texture2D(tDiffuse, vUv + vec2(1.0, -1.0) * px).rgb;
  vec3 cSW = texture2D(tDiffuse, vUv + vec2(-1.0, 1.0) * px).rgb, cSE = texture2D(tDiffuse, vUv + vec2(1.0, 1.0) * px).rgb;
  float lM = lum(cM), lNW = lum(cNW), lNE = lum(cNE), lSW = lum(cSW), lSE = lum(cSE);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float dr = max((lNW + lNE + lSW + lSE) * 0.25 * 0.125, 1.0 / 128.0);
  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + dr);
  dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * px;
  vec3 a = 0.5 * (texture2D(tDiffuse, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tDiffuse, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(tDiffuse, vUv + dir * -0.5).rgb + texture2D(tDiffuse, vUv + dir * 0.5).rgb);
  float lb = lum(b);
  vec3 col = (lb < lMin || lb > lMax) ? a : b;
  gl_FragColor = vec4(col, 1.0);
}`;
export const FXAA_SHARP_FS = FXAA_FS.replace('uniform vec2 uRes;', 'uniform vec2 uRes; uniform sampler2D tDepth; uniform float uNear; uniform float uFar; uniform float uSharp;')
    .replace('  gl_FragColor = vec4(col, 1.0);\n}', `  float sd = texture2D(tDepth, vUv).x;
  float szn = sd * 2.0 - 1.0, sz = (2.0 * uNear * uFar) / (uFar + uNear - szn * (uFar - uNear));
  float sk = uSharp * (1.0 - smoothstep(6.0, 28.0, sz)) * step(sd, 0.99999) * (1.0 - smoothstep(0.14, 0.38, lMax - lMin));
  if (sk > 0.002) {
    vec3 sMin = min(cM, min(min(cNW, cNE), min(cSW, cSE))), sMax = max(cM, max(max(cNW, cNE), max(cSW, cSE)));
    col = clamp(col + (col - 0.25 * (cNW + cNE + cSW + cSE)) * sk, sMin, sMax);
  }
  gl_FragColor = vec4(col, 1.0);
}`);
export const OUT_FS = `uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tShadowMap; uniform sampler2D tHeroTriangles; uniform sampler2D tHeroBvh; uniform vec2 uRes; uniform vec2 uShadowTexel; uniform vec2 uHeroTriangleTexSize; uniform vec2 uHeroBvhTexSize; uniform float uNear; uniform float uFar; uniform float uTh; uniform float uOn; uniform float uShadowOn; uniform float uShadowBias; uniform float uShadowStrength; uniform float uShadowWaterStrength; uniform float uHeroBvhNodeCount; uniform float uHeroTraceOn; uniform float uHeroTraceStrength; uniform float uHeroTraceWaterStrength; uniform float uCineMood; uniform float uHeroTraceDebug; uniform mat4 uShadowMatrix; uniform mat4 uInvProjection; uniform mat4 uInvView; uniform vec3 uUwC; uniform vec3 uHeroBoundsMin; uniform vec3 uHeroBoundsMax; uniform vec3 uHeroRayDir; varying vec2 vUv;
${WL_GLSL}   /* the same line the sea is cut on (src/water/waterline.ts): solved on the drawn waves incl. chop, no fake ripples - the tint can't drift off the cut */
float vz(vec2 uv){ float d = texture2D(tDepth, uv).x; float zn = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - zn * (uFar - uNear)); }
vec3 worldAt(vec2 uv, float d){ vec4 q = uInvProjection * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); q /= q.w; q = uInvView * q; return q.xyz / q.w; }
float shadowVisibility(vec3 wp){ vec4 q = uShadowMatrix * vec4(wp, 1.0); if (q.w <= 0.0) return 1.0; vec3 p = q.xyz / q.w; if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z < 0.0 || p.z > 1.0) return 1.0; float v = 0.0, total = 0.0; for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){ float wx = x == 0 ? 2.0 : 1.0, wy = y == 0 ? 2.0 : 1.0, w = wx * wy; vec2 o = vec2(float(x), float(y)) * uShadowTexel * 1.5; float d = texture2D(tShadowMap, p.xy + o).x; v += step(p.z - uShadowBias, d) * w; total += w; } return v / total; }
vec4 heroBvhTexel(int index){ float i = float(index); vec2 uv = (vec2(mod(i, uHeroBvhTexSize.x), floor(i / uHeroBvhTexSize.x)) + 0.5) / uHeroBvhTexSize; return texture2D(tHeroBvh, uv); }
vec3 heroTriangleVertex(int triangle, int corner){ int index = triangle * 3 + corner; float i = float(index); vec2 uv = (vec2(mod(i, uHeroTriangleTexSize.x), floor(i / uHeroTriangleTexSize.x)) + 0.5) / uHeroTriangleTexSize; return texture2D(tHeroTriangles, uv).xyz; }
float inverseRayComponent(float d){ return (d < 0.0 ? -1.0 : 1.0) / max(abs(d), 1e-7); }
bool heroRayBox(vec3 ro, vec3 rd, vec3 boxMin, vec3 boxMax, out float nearT){ vec3 inv = vec3(inverseRayComponent(rd.x), inverseRayComponent(rd.y), inverseRayComponent(rd.z)); vec3 a = (boxMin - ro) * inv, b = (boxMax - ro) * inv; vec3 lo = min(a, b), hi = max(a, b); nearT = max(max(max(lo.x, lo.y), lo.z), 0.0); float farT = min(min(hi.x, hi.y), hi.z); return farT >= nearT && farT > 0.0 && nearT < 1000.0; }
float heroRayTriangle(vec3 ro, vec3 rd, vec3 a, vec3 b, vec3 c){ vec3 e1 = b - a, e2 = c - a, p = cross(rd, e2); float det = dot(e1, p); if (abs(det) < 1e-8) return -1.0; float invDet = 1.0 / det; vec3 s = ro - a; float u = dot(s, p) * invDet; if (u < 0.0 || u > 1.0) return -1.0; vec3 q = cross(s, e1); float v = dot(rd, q) * invDet; if (v < 0.0 || u + v > 1.0) return -1.0; float t = dot(e2, q) * invDet; return t > 0.025 && t < 1000.0 ? t : -1.0; }
float analyticHeroShadow(vec3 wp){ if (uHeroTraceOn < 0.5 || uHeroBvhNodeCount < 1.0) return 0.0; vec3 rd = normalize(uHeroRayDir), ro = wp + normalize(uHeroRayDir) * 0.02; float rootT; if (!heroRayBox(ro, rd, uHeroBoundsMin, uHeroBoundsMax, rootT)) return 0.0; int stack[32]; int stackSize = 1, visited = 0; stack[0] = 0; while (stackSize > 0 && visited < int(uHeroBvhNodeCount)) { int node = stack[--stackSize]; visited++; vec4 lo = heroBvhTexel(node * 2), hi = heroBvhTexel(node * 2 + 1); if (hi.w < 0.0) { int start = int(lo.w + 0.5), count = int(-hi.w + 0.5); for (int j = 0; j < 4; j++) { if (j >= count) break; int tri = start + j; float t = heroRayTriangle(ro, rd, heroTriangleVertex(tri, 0), heroTriangleVertex(tri, 1), heroTriangleVertex(tri, 2)); if (t > 0.0) return 1.0; } } else { int left = int(lo.w + 0.5), right = int(hi.w + 0.5); vec4 l0 = heroBvhTexel(left * 2), l1 = heroBvhTexel(left * 2 + 1), r0 = heroBvhTexel(right * 2), r1 = heroBvhTexel(right * 2 + 1); float lt, rt; bool lh = heroRayBox(ro, rd, l0.xyz, l1.xyz, lt), rh = heroRayBox(ro, rd, r0.xyz, r1.xyz, rt); if (lh && rh) { if (lt < rt) { if (stackSize < 30) stack[stackSize++] = right; if (stackSize < 31) stack[stackSize++] = left; } else { if (stackSize < 30) stack[stackSize++] = left; if (stackSize < 31) stack[stackSize++] = right; } } else if (lh && stackSize < 31) stack[stackSize++] = left; else if (rh && stackSize < 31) stack[stackSize++] = right; } } return 0.0; }
void main(){
  vec4 c4 = texture2D(tColor, vUv); vec3 c = c4.rgb;
  // alpha classes: >= 0.75 ordinary surfaces; 0.5 band = glowing lights (never inked); env-iter3: 0.25 = grass blades/flowers, 0.375 = park ground
  float lightMask = 1.0 - step(0.45, c4.a) * (1.0 - step(0.75, c4.a)) - (1.0 - step(0.75, c4.a)) * step(c4.a, 0.18);
  vec2 px = uTh / uRes;
  float z = vz(vUv);
  vec2 ox = vec2(px.x, 0.0), oy = vec2(0.0, px.y);
  float zx1 = vz(vUv + ox), zx2 = vz(vUv - ox), zy1 = vz(vUv + oy), zy2 = vz(vUv - oy);
  float e = max(max(zx1 - z, zx2 - z), max(zy1 - z, zy2 - z)) / z;   // one-sided: only the nearer pixel of a depth step is inked, so the line stays 1px and sits inside the near silhouette
  if (abs(c4.a - 0.25) < 0.06) {   // env-iter3 (Shifat: "grass blades must not get outline solo, whole grass lands get outline as one"): a blade pixel only inks against what is neither grass nor park ground, so blade-on-blade and blade-on-ground steps vanish and only the meadow's outer silhouette remains
    vec4 an = vec4(texture2D(tColor, vUv + ox).a, texture2D(tColor, vUv - ox).a, texture2D(tColor, vUv + oy).a, texture2D(tColor, vUv - oy).a);
    vec4 land = step(an, vec4(0.43)) * step(vec4(0.19), an);   // neighbour is grass (0.25) or ground (0.375)
    e = max(max((zx1 - z) * (1.0 - land.x), (zx2 - z) * (1.0 - land.y)), max((zy1 - z) * (1.0 - land.z), (zy2 - z) * (1.0 - land.w))) / z;
  }
  float k = smoothstep(0.12, 0.30, e) * (1.0 - smoothstep(22.0, 55.0, z)) * uOn * lightMask;
  c = mix(c, vec3(0.04, 0.05, 0.10), k * 0.85);
  float waterReceiver = 1.0 - step(0.035, abs(c4.a - 0.6)); float shadowReceiver = max(lightMask, waterReceiver);
  float moodLit = 1.0, heroHit = 0.0;
  if (uShadowOn > 0.5 && shadowReceiver > 0.5) { float d = texture2D(tDepth, vUv).x; if (d < 0.99999) { vec3 wp = worldAt(vUv, d); float vis = shadowVisibility(wp); vec3 shade = mix(vec3(0.62, 0.68, 0.82), vec3(1.0), vis); float strength = mix(uShadowStrength, uShadowStrength * uShadowWaterStrength, waterReceiver); c *= mix(vec3(1.0), shade, strength); float hit = analyticHeroShadow(wp); heroHit = hit; float heroStrength = uHeroTraceStrength * lightMask + uHeroTraceWaterStrength * waterReceiver; c *= mix(vec3(1.0), vec3(0.56, 0.63, 0.80), hit * heroStrength); moodLit = clamp(vis - hit * 0.75, 0.0, 1.0); } }
  if (uHeroTraceDebug > 0.001 && lightMask > 0.5) c = mix(c, vec3(0.0, 1.0, 1.0), clamp(heroHit * uHeroTraceDebug, 0.0, 1.0));
  if (uCineMood > 0.001 && lightMask > 0.5) { vec3 coolGrade = vec3(0.90, 0.95, 1.12), warmGrade = vec3(1.07, 1.025, 0.94); vec3 grade = mix(coolGrade, warmGrade, moodLit); c *= mix(vec3(1.0), grade, uCineMood * 0.42); }
  if (uWL.w > 0.5) {   // Shifat Oct 31 12:27: half-in/half-out lens. Below the wave line the frame gets the same underwater look as diving (fog colour toward the line, teal light falloff below), with a thin meniscus on the line.
    vec2 sn = vUv * 2.0 - 1.0; float wd = sn.y - wlY(sn.x);
    float un = smoothstep(0.004, -0.004, wd);
    if (un > 0.0) {
      float below = clamp(-wd, 0.0, 2.0);
      // true underworld (the sea surface discards below the line): same linear fog as diving (55 -> 190 m) plus the dive light wash
      vec3 fogc = uUwC * vec3(0.85, 1.38, 1.18) * mix(1.2, 0.85, smoothstep(0.0, 1.6, below));
      vec3 cu = mix(c, c * vec3(0.55, 0.88, 0.95) + fogc * 0.18, 0.35 + 0.4 * smoothstep(0.0, 1.2, below));   /* Shifat Nov 1 'one world': just under the line it looks like the first metre of a dive, deeper down like the dive itself */
      cu = mix(cu, fogc, smoothstep(55.0, 190.0, z));   /* same fog law as diving (was 12 -> 150 m: the split half read murkier than the dive) */
      c = mix(c, cu, un);
    }
    /* Shifat 10:51 PM: white blurry wavy intersection line (ref: Wikimedia 'Blacktip reef sharks at Moorea 2025' split shot - a soft bright
       white-cyan meniscus right on the line, a faint glow just above it, and a darker blue band just below where the underside mirrors the deep) */
    float lb = max(dot(uUwC, vec3(0.3, 0.5, 0.2)) * 3.0, 0.25);   // follows day/night through the underwater colour
    c = mix(c, c * vec3(0.55, 0.7, 0.85), (1.0 - smoothstep(0.0, 0.05, -wd)) * step(wd, 0.0) * 0.4);
    c += vec3(0.85, 0.95, 1.0) * min(lb, 1.0) * (exp(-wd * wd / 0.00004) * 0.65 + exp(-(wd - 0.006) * (wd - 0.006) / 0.0004) * 0.12);
  }
  gl_FragColor = vec4(c, 1.0);
}`;
