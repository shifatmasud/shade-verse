// Additive glow/rim shader. Moved verbatim from Scene.tsx.
export const GLOW_VS = `varying vec3 vN; varying vec3 vV; varying vec3 vC;
void main(){ vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * mat3(instanceMatrix) * normal); vV = -mv.xyz;
#ifdef USE_INSTANCING_COLOR
vC = instanceColor;
#else
vC = vec3(1.0);
#endif
gl_Position = projectionMatrix * mv; }`;
export const GLOW_FS = `uniform float uT; varying vec3 vN; varying vec3 vV; varying vec3 vC;
void main(){ float f = abs(dot(normalize(vN), normalize(vV))); float k = f * f * 1.5 + 0.12 * f; gl_FragColor = vec4(vC * k * (0.92 + 0.08 * sin(uT * 47.0 + gl_FragCoord.x * 0.05)), 1.0); }`;
