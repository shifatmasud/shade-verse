// Shared final color treatment for the world compositor and native-resolution hero pass.
// Inputs remain display-encoded; TOD uniforms are shared with the existing day/night system.
export const FILM_GRADE_GLSL = `
uniform float uGradeDay;
uniform float uGradeWarm;
vec3 shadeRgbToHsv(vec3 c) {
  vec4 K = vec4(0.0, -0.33333333, 0.66666667, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 applyShadeFilmGrade(vec3 source, float skyMask, float greenReceiver) {
  vec3 c = max(source, vec3(0.0));
  float day = clamp(uGradeDay, 0.0, 1.0);
  float warm = clamp(uGradeWarm, 0.0, 1.0) * day;
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float shadows = 1.0 - smoothstep(0.12, 0.58, luma);
  float highlights = smoothstep(0.42, 0.92, luma);
  vec3 coolShadow = mix(vec3(0.86, 0.91, 1.18), vec3(0.97, 0.92, 1.12), day);
  vec3 warmHighlight = mix(vec3(1.04, 1.025, 0.97), vec3(1.10, 1.045, 0.92), warm);
  c *= mix(vec3(1.0), coolShadow, shadows * mix(0.18, 0.24, day));
  c *= mix(vec3(1.0), warmHighlight, highlights * 0.20);
  float gradedLuma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(gradedLuma), c, mix(0.96, 1.035, day));
  c = (c - vec3(0.18)) * mix(1.02, 1.035, day) + vec3(0.18);
  vec3 skyTone = mix(vec3(0.86, 0.94, 1.16), vec3(0.91, 1.03, 1.12), day);
  skyTone = mix(skyTone, vec3(1.04, 0.98, 0.87), warm * 0.34);
  c *= mix(vec3(1.0), skyTone, skyMask * 0.32);

  // A restrained sage palette for green-dominant foliage, grass, and flowers.
  // Water pixels and glow-tagged pixels are excluded by greenReceiver in the world pass.
  vec3 hsv = shadeRgbToHsv(c);
  float greenHue = smoothstep(0.16, 0.23, hsv.x) * (1.0 - smoothstep(0.42, 0.49, hsv.x));
  float greenSat = smoothstep(0.06, 0.15, hsv.y);
  float greenMask = greenHue * greenSat * clamp(greenReceiver, 0.0, 1.0);
  float greenLuma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec3 sageNight = greenLuma * vec3(0.88, 1.02, 1.10);
  vec3 sageDay = greenLuma * vec3(1.00, 1.05, 0.92);
  vec3 sage = mix(sageNight, sageDay, day);
  vec3 warmSage = greenLuma * vec3(1.05, 1.04, 0.88);
  sage = mix(sage, warmSage, warm * 0.35);
  c = mix(c, sage, greenMask * mix(0.28, 0.22, day));
  return clamp(c, vec3(0.0), vec3(1.0));
}
`;
