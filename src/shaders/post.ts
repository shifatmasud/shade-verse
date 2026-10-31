// Post-processing: FXAA (plus sharpened variant) and the ink outline pass. Moved verbatim from Scene.tsx.
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
export const FXAA_SHARP_FS = FXAA_FS.replace('uniform vec2 uRes;', 'uniform vec2 uRes; uniform sampler2D tDepth; uniform float uNear; uniform float uFar; uniform float uSharp; uniform float uUp;')
    .replace('  gl_FragColor = vec4(col, 1.0);\n}', `  float sd = texture2D(tDepth, vUv).x;
  float szn = sd * 2.0 - 1.0, sz = (2.0 * uNear * uFar) / (uFar + uNear - szn * (uFar - uNear));
  float sk = uSharp * (1.0 - smoothstep(6.0, 28.0, sz)) * step(sd, 0.99999) * (1.0 - smoothstep(0.14, 0.38, lMax - lMin));
  sk = max(sk, uUp * step(sd, 0.99999) * (1.0 - smoothstep(0.14, 0.38, lMax - lMin)));   /* Shifat 6:46 PM 'everything except hero looks low quality': when the world buffer is upscaled to the screen (phone auto-res), pre-sharpen it at every distance in proportion to the upscale, clamped to the local min/max so no halos */
  if (sk > 0.002) {
    vec3 sMin = min(cM, min(min(cNW, cNE), min(cSW, cSE))), sMax = max(cM, max(max(cNW, cNE), max(cSW, cSE)));
    col = clamp(col + (col - 0.25 * (cNW + cNE + cSW + cSE)) * sk, sMin, sMax);
  }
  gl_FragColor = vec4(col, 1.0);
}`);
export const OUT_FS = `uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 uRes; uniform float uNear; uniform float uFar; uniform float uTh; uniform float uOn; varying vec2 vUv;
float vz(vec2 uv){ float d = texture2D(tDepth, uv).x; float zn = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - zn * (uFar - uNear)); }
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
  gl_FragColor = vec4(mix(c, vec3(0.04, 0.05, 0.10), k * 0.85), 1.0);
}`;
