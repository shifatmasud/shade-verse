// Shared final color treatment for the world compositor and native-resolution hero pass.
// Kept in display-encoded space to match the existing post-processing targets.
export const FILM_GRADE_GLSL = `
vec3 applyShadeFilmGrade(vec3 source, float skyMask) {
  vec3 c = max(source, vec3(0.0));
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float shadows = 1.0 - smoothstep(0.12, 0.58, luma);
  float highlights = smoothstep(0.42, 0.92, luma);
  vec3 coolShadow = vec3(0.97, 0.92, 1.12);
  vec3 warmHighlight = vec3(1.10, 1.045, 0.92);
  c *= mix(vec3(1.0), coolShadow, shadows * 0.24);
  c *= mix(vec3(1.0), warmHighlight, highlights * 0.20);
  float gradedLuma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(gradedLuma), c, 1.035);
  c = (c - vec3(0.18)) * 1.035 + vec3(0.18);
  c *= mix(vec3(1.0), vec3(0.91, 1.03, 1.12), skyMask * 0.32);
  return clamp(c, vec3(0.0), vec3(1.0));
}
`;
