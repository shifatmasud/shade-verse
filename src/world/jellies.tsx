import * as THREE from 'three';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { WATER_Y, WATER_Z } from '../sim';
import { QUALITY } from '../quality';
import { TOD } from './env';

/* Jellyfish (Shifat Nov 1 10:52 AM 'Add jellies too like my portfolio'): the portfolio's dive-stage jelly, ported.
   Same bell (scalloped hem + inner bell), 8 filaments + 4 oral arms, the same pulse (quick contraction, slow release) and the
   same soft lavender glow (#C084FC -> #F0ABFC, margin #FBCFE8). Here they live in world space: a few cells in a box that wraps
   around the camera, drifting slowly, only in the water (additive glow, no depth write, no outline). */
export function jellyGeometry(segW: number, segH: number, filSeg: number) {
  const pos: number[] = [], f: number[] = [], idx: number[] = []
  // bell
  for (let iy = 0; iy <= segH; iy++) {
    const th = (iy / segH) * (Math.PI / 2) * 1.12
    for (let ix = 0; ix <= segW; ix++) {
      const ph = (ix / segW) * Math.PI * 2
      // W27 R6.58 (scorer-r655 #3: the lower lip read as a straight cut / bright ring): the hem is scalloped, eight soft
      // lobes that dip and flare a touch over the last quarter of the bell, so the outline is a rounded hem, not an ellipse
      const t = iy / segH, sc = Math.pow(Math.max(0, (t - 0.72) / 0.28), 2), lobe = 0.5 - 0.5 * Math.cos(8 * ph)
      const r = Math.sin(th) * (1 + 0.035 * sc * Math.cos(8 * ph)), y = Math.cos(th) - 0.07 * sc * lobe
      pos.push(r * Math.cos(ph), y, r * Math.sin(ph)); f.push(0, t, 0)
    }
  }
  for (let iy = 0; iy < segH; iy++) for (let ix = 0; ix < segW; ix++) {
    const a = iy * (segW + 1) + ix, b = a + segW + 1
    idx.push(a, b, a + 1, b, b + 1, a + 1)
  }
  const strip = (x: number, y: number, z: number, kind: number) => {
    const base = pos.length / 3
    for (let j = 0; j <= filSeg; j++) for (const sd of [-1, 1]) { pos.push(x, y, z); f.push(kind, j / filSeg, sd) }
    for (let j = 0; j < filSeg; j++) { const a = base + j * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3) }
  }
  // W25 R6.50 (scorer-r647 #3 "hairline tentacles, no inner body"): an inner bell (the manubrium/stomach) inside each of the
  // same four jellies: a smaller, flatter dome hung under the apex (kind 3), faint, with a lit margin. No new objects.
  {
    const base = pos.length / 3, ih = Math.max(4, segH >> 1)
    for (let iy = 0; iy <= ih; iy++) {
      const th = (iy / ih) * (Math.PI / 2) * 1.05
      for (let ix = 0; ix <= segW; ix++) {
        const ph = (ix / segW) * Math.PI * 2
        pos.push(Math.sin(th) * Math.cos(ph) * 0.5, Math.cos(th) * 0.42 + 0.22, Math.sin(th) * Math.sin(ph) * 0.5); f.push(3, iy / ih, 0)
      }
    }
    for (let iy = 0; iy < ih; iy++) for (let ix = 0; ix < segW; ix++) {
      const a = base + iy * (segW + 1) + ix, b = a + segW + 1
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + 0.2; strip(Math.cos(a) * 0.9, -0.02, Math.sin(a) * 0.9, 1) }
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.6; strip(Math.cos(a) * 0.16, 0.1, Math.sin(a) * 0.16, 2) }
  const g = new THREE.InstancedBufferGeometry()
  g.setIndex(idx)
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('aF', new THREE.Float32BufferAttribute(f, 3))
  return g
}


const N = (QUALITY as any).coarse ? 5 : 8, BOX = new THREE.Vector3(70, 14, 70);
const JELLY_VS = `
attribute vec3 aF; attribute vec4 aSeed; attribute vec4 aSeed2;
uniform float uT; uniform vec3 uCam, uBox;
varying float vA, vKind, vT, vHue, vPulse, vSide; varying vec3 vN, vV;
mat3 rotAxis(vec3 k, float a){ k = normalize(k); float c = cos(a), s = sin(a), o = 1.0 - c;
  return mat3(c + k.x*k.x*o, k.y*k.x*o + k.z*s, k.z*k.x*o - k.y*s, k.x*k.y*o - k.z*s, c + k.y*k.y*o, k.z*k.y*o + k.x*s, k.x*k.z*o + k.y*s, k.y*k.z*o - k.x*s, c + k.z*k.z*o); }
void main(){
  float t = uT, ph = aSeed2.x * 37.0, cyc = t * (0.42 + aSeed2.x * 0.3) + ph;
  float pulse = pow(0.5 + 0.5 * sin(cyc * 6.2832), 3.0);
  vec3 drift = vec3(sin(t * 0.03 + ph) * 6.0, 0.0, cos(t * 0.025 + ph * 1.3) * 6.0) + vec3(0.0, 0.6 * sin(cyc * 6.2832 - 1.2), 0.0);
  vec2 f = fract(aSeed.xz + (drift.xz - uCam.xz) / uBox.xz); vec2 e = 0.5 - abs(f - 0.5); float edge = min(e.x, e.y);
  vec3 c = vec3(uCam.x + (f.x - 0.5) * uBox.x, ${(WATER_Y).toFixed(2)} - 3.0 - aSeed.y * uBox.y + drift.y, uCam.z + (f.y - 0.5) * uBox.z);
  vec3 p = position, n;
  if (aF.x < 0.5 || aF.x > 2.5) { float r = aF.y; p.xz *= 1.0 - 0.24 * pulse * r * r; p.y *= 0.7 + 0.18 * pulse; n = normalize(vec3(p.x, p.y * 1.5, p.z)); }
  else { float v = aF.y, len = aF.x < 1.5 ? 3.2 : 1.1; p.xz *= 1.0 - 0.24 * pulse; p.y -= v * len * (1.0 - 0.12 * pulse);
    p.x += 0.24 * v * sin(v * 3.4 - t * 1.1 + ph + position.z * 4.0); p.z += 0.24 * v * cos(v * 2.9 - t * 0.9 + ph + position.x * 4.0); n = vec3(0.0, 0.0, 1.0); }
  mat3 R = rotAxis(vec3(aSeed2.y, 0.0, aSeed2.z) + vec3(1e-4), length(aSeed2.yz)); p = R * p; n = R * n;
  float sz = 0.55 + aSeed.w * 0.9;
  vec4 mv = viewMatrix * vec4(c + p * sz, 1.0);
  if (aF.x > 0.5 && aF.x < 2.5) { float hw = sz * (aF.x < 1.5 ? 0.024 : 0.065) * (1.0 - 0.8 * aF.y); float hwMin = 1.5 * max(-mv.z, 1e-3) / 400.0; mv.x += aF.z * max(hw, hwMin); }
  gl_Position = projectionMatrix * mv;
  float dist = length(c - uCam);
  vA = smoothstep(0.0, 0.08, edge) * (1.0 - smoothstep(45.0, 120.0, dist)) * smoothstep(1.2, 3.0, dist) * (1.0 - smoothstep(-3.0, -1.2, uCam.y));
  vN = normalize(mat3(viewMatrix) * n); vV = normalize(-mv.xyz); vKind = aF.x; vT = aF.y; vHue = aSeed2.w; vPulse = pulse; vSide = aF.z;
}`;
const JELLY_FS = `
uniform float uT, uDay; varying float vA, vKind, vT, vHue, vPulse, vSide; varying vec3 vN, vV;
void main(){
  vec3 col; float glow = 0.55 + 0.45 * vPulse; vec3 lum = vec3(0.80, 0.50, 0.99);
  if (vKind < 0.5) { float fr = 1.0 - abs(dot(normalize(vN), vV)); vec3 film = 0.5 + 0.5 * cos(6.2832 * (fr * 1.4 + vHue + vec3(0.0, 0.33, 0.67)));
    col = mix(vec3(0.74, 0.44, 0.98), film, 0.1) * (0.03 + 0.95 * pow(fr, 2.2));
    float band = smoothstep(0.6, 0.86, vT) * (1.0 - smoothstep(0.86, 1.0, vT));
    col += vec3(0.984, 0.812, 0.91) * band * 0.44; col += vec3(0.78, 0.46, 0.98) * 0.07 * (1.0 - vT) * (0.4 + 0.6 * fr);
    col += lum * glow * (1.45 * band + 0.2 * (1.0 - smoothstep(0.0, 0.4, vT)));
    col *= 1.0 - smoothstep(0.86, 1.0, vT); }
  else if (vKind > 2.5) { float fr = 1.0 - abs(dot(normalize(vN), vV)); col = vec3(0.86, 0.56, 0.98) * (0.03 + 0.05 * (1.0 - vT) + 0.24 * pow(fr, 1.6));
    float band = smoothstep(0.5, 0.82, vT) * (1.0 - smoothstep(0.82, 1.0, vT)); col += lum * glow * 0.5 * band; col *= 1.0 - smoothstep(0.8, 1.0, vT); }
  else { col = vec3(0.86, 0.56, 0.98) * (1.0 - vT) * (vKind < 1.5 ? 0.45 : 0.28); float run = 0.5 + 0.5 * sin(vT * 9.0 - uT * 2.2 + vHue * 6.2832);
    col += lum * glow * (1.0 - vT) * (1.0 - vT) * (vKind < 1.5 ? 1.1 : 0.7) * (0.6 + 0.4 * run); col *= 1.0 - smoothstep(0.25, 1.0, abs(vSide)); }
  gl_FragColor = vec4(col * vec3(1.2, 0.62, 1.05) * vA * 0.85 * mix(1.15, 0.9, uDay), 1.0);   /* added over teal water the lavender washes to white: push the red/blue so it stays the portfolio's pink-purple */   /* bioluminescence reads a touch brighter at night */
}`;
export function Jellies() {
    const ref = useRef<THREE.Mesh>(null!);
    const geo = useMemo(() => { const g = jellyGeometry(18, 8, 12); const s = new Float32Array(N * 4), s2 = new Float32Array(N * 4);
        for (let i = 0; i < N; i++) { const h = (k: number) => { const x = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
            s.set([h(1), h(2) * 0.8, h(3), h(4)], i * 4); s2.set([h(5), (h(6) - 0.5) * 0.5, (h(7) - 0.5) * 0.5, h(8)], i * 4); }
        g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(s, 4)); g.setAttribute('aSeed2', new THREE.InstancedBufferAttribute(s2, 4)); g.instanceCount = N; return g; }, []);
    const mat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: JELLY_VS, fragmentShader: JELLY_FS, uniforms: { uT: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: BOX }, uDay: TOD.day },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }), []);
    useFrame(({ camera, clock }) => { const m = ref.current; if (!m) return; m.visible = camera.position.y < WATER_Y - 0.6 && camera.position.z < WATER_Z; mat.uniforms.uT.value = clock.elapsedTime; mat.uniforms.uCam.value.copy(camera.position); });
    return <mesh ref={ref} geometry={geo} material={mat} frustumCulled={false} renderOrder={16} userData={{ noRefl: true }} />;
}
