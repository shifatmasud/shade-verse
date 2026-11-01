import { shadowFloorAt } from '../sim';
import React, { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { HERO_REFL } from '../caustics';
import { TOD, UW, WEATHER } from './env';

/* Weather (Shifat Oct 31 5:42 PM: 'sunny & rainy weather; rain mustn't have outline pass & must raindrop impact visual', refs: Ghost of
   Tsushima / Spider-Man PS4 rain). One draw call: N thin camera-facing streaks in a box that follows the camera, all motion on the GPU.
   transparent + depthWrite false, so the outline pass (which inks depth edges) never sees it; impacts are rings in the water shaders
   (src/water/common.ts rainSlope) driven by the same WEATHER.rain uniform. Same count on every device (Adreno 506 budget: 1 draw, thin quads). */
const N = 3000, BOX = 26;
const RAIN_VS = `
uniform float uT, uRain, uUnder; attribute vec3 aSeed; varying float vA; varying vec2 vC;
void main(){
  vec3 uCam = -(transpose(mat3(viewMatrix)) * viewMatrix[3].xyz);   // eye of the view actually drawing (some passes reuse a camera whose position uniform lags)
  vec3 s = aSeed * ${BOX.toFixed(1)};
  float fall = 15.0 + aSeed.x * 4.0;
  vec3 l = mod(s - vec3(0.0, uT * fall, 0.0) - uCam + ${(BOX / 2).toFixed(1)}, ${BOX.toFixed(1)}) - ${(BOX / 2).toFixed(1)};   // wrapped offset from the eye
  vec3 wp = uCam + l;
  vec3 ax = normalize(vec3(0.16, -1.0, 0.07));            // light wind slant
  vec3 vd = normalize(wp - uCam);
  vec3 rt = normalize(cross(ax, vd));
  float d = length(wp - uCam);
  float len = 1.2 + 0.7 * aSeed.z, wid = 0.018 + 0.0024 * d;   // widen with distance so far streaks stay ~1 px instead of shimmering
  wp += rt * position.x * wid + ax * position.y * len;
  vC = position.xy * 2.0;
  vA = (1.0 - uUnder) * uRain * smoothstep(0.6, 2.5, d) * (1.0 - smoothstep(${(BOX * 0.38).toFixed(1)}, ${(BOX * 0.5).toFixed(1)}, d));
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const RAIN_FS = `
uniform float uDay; varying float vA; varying vec2 vC;
void main(){
  float a = vA * (1.0 - vC.x * vC.x) * smoothstep(-1.0, -0.2, vC.y) * (0.55 + 0.45 * smoothstep(1.0, 0.0, vC.y)) * 0.42;
  if (a < 0.003) discard;
  gl_FragColor = vec4(mix(vec3(0.42, 0.47, 0.55), vec3(0.9, 0.93, 0.98), uDay), a);
}`;

function rainGeo() {
    const pos = new Float32Array(N * 4 * 3), seed = new Float32Array(N * 4 * 3), idx = new Uint32Array(N * 6);
    let r = 12345; const rnd = () => { r ^= r << 13; r ^= r >>> 17; r ^= r << 5; return (r >>> 0) / 4294967296; };
    const cx = [-0.5, 0.5, 0.5, -0.5], cy = [-0.5, -0.5, 0.5, 0.5];
    for (let i = 0; i < N; i++) {
        const a = rnd(), b = rnd(), c = rnd();
        for (let k = 0; k < 4; k++) { const j = (i * 4 + k) * 3; pos[j] = cx[k]; pos[j + 1] = cy[k]; pos[j + 2] = 0; seed[j] = a; seed[j + 1] = b; seed[j + 2] = c; }
        idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6); return g;
}


// Ground rain splashes (promised Oct 31 7:07 PM): tiny expanding impact rings + a bead of spray on the ground around the hero while it rains.
// GPU only: each of SPL_N flat quads re-rolls its spot every life cycle from a hash of (seed, cycle); one draw call.
const SPL_N = 70;
const SPL_VS = `
attribute vec3 aSeed; uniform float uT; uniform vec4 uHero; uniform float uG; varying vec2 vQ; varying float vPh;
float h1(float n){ return fract(sin(n) * 43758.5453); }
void main(){
  float P = 0.45 + aSeed.y * 0.35, tt = uT + aSeed.x * P * 7.0, cyc = floor(tt / P); vPh = fract(tt / P);
  float a = h1(cyc * 12.9898 + aSeed.x * 78.233) * 6.2832, rr = 1.2 + sqrt(h1(cyc * 4.1414 + aSeed.z * 17.17)) * 9.0;
  vec3 wp = vec3(uHero.x + cos(a) * rr, uG + 0.05, uHero.z + sin(a) * rr);
  float s = 0.12 + 0.4 * vPh;
  wp.xz += position.xy * s * 2.0; vQ = position.xy * 2.0;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const SPL_FS = `
uniform float uRain; uniform float uDay; uniform float uOn; varying vec2 vQ; varying float vPh;
void main(){
  float d = length(vQ), ring = smoothstep(0.18, 0.0, abs(d - 0.75)) * (1.0 - vPh * vPh), dot_ = smoothstep(0.35, 0.0, d) * smoothstep(0.35, 0.0, vPh);
  float a = (ring * 0.62 + dot_ * 0.55) * uRain * uOn;
  if (a < 0.004) discard;
  gl_FragColor = vec4(mix(vec3(0.5, 0.55, 0.62), vec3(0.92, 0.95, 1.0), uDay), a);
}`;
function splashGeo() {
    const pos = new Float32Array(SPL_N * 12), seed = new Float32Array(SPL_N * 12), idx = new Uint32Array(SPL_N * 6);
    let r = 777; const rnd = () => { r ^= r << 13; r ^= r >>> 17; r ^= r << 5; return (r >>> 0) / 4294967296; };
    const cx = [-0.5, 0.5, 0.5, -0.5], cy = [-0.5, -0.5, 0.5, 0.5];
    for (let i = 0; i < SPL_N; i++) { const a = rnd(), b = rnd(), c = rnd(); for (let k = 0; k < 4; k++) { const j = (i * 4 + k) * 3; pos[j] = cx[k]; pos[j + 1] = cy[k]; seed[j] = a; seed[j + 1] = b; seed[j + 2] = c; } idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6); return g;
}

const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('rain') : null;
if (q === '1') WEATHER.force = 1; else if (q === '0') WEATHER.force = 0;
const CYCLE = 260, RAIN_FROM = 0.62;   // ~100 s of rain every ~4.3 min, eased in/out over ~8 s

export function Weather() {
    const { mesh, mat, smesh, smat } = useMemo(() => {
        const mat = new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uRain: WEATHER.rain, uDay: TOD.day, uUnder: { value: 0 } }, vertexShader: RAIN_VS, fragmentShader: RAIN_FS, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(rainGeo(), mat); mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.name = 'rain';   // the camera actually drawing this pass
        const smat = new THREE.ShaderMaterial({ uniforms: { uT: mat.uniforms.uT, uRain: WEATHER.rain, uDay: TOD.day, uHero: { value: HERO_REFL.shadow }, uG: { value: 0 }, uOn: { value: 0 } }, vertexShader: SPL_VS, fragmentShader: SPL_FS, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide });
        const smesh = new THREE.Mesh(splashGeo(), smat); smesh.frustumCulled = false; smesh.renderOrder = 5; smesh.name = 'rain-splash';
        return { mesh, mat, smesh, smat };
    }, []);
    const gy = React.useRef({ y: 0, last: 0, t: 0 });
    useFrame((st, dt) => {
        const t = st.clock.elapsedTime, ph = (t / CYCLE) % 1;
        const target = WEATHER.force >= 0 ? WEATHER.force : (ph > RAIN_FROM ? 1 : 0);
        const r = WEATHER.rain; r.value += (target - r.value) * Math.min(1, dt / 8 * 3);
        if (WEATHER.force >= 0 && Math.abs(r.value - target) < 0.02) r.value = target;
        mat.uniforms.uT.value = t; mat.uniforms.uUnder.value = (UW as any).on ? 1 : 0;
        mesh.visible = r.value > 0.01;
        { // ground level under the hero (Shifat 9:56 PM: rings were floating in the sky while gliding - the old 'stopped moving vertically' guess took the
            // glide altitude for the ground). Now the real surface under the hero; none over open water (the sea draws its own rings).
            const h = HERO_REFL.shadow, g = gy.current; const fl = shadowFloorAt(h.x, h.y, h.z); g.y = fl ?? -1;
            const on = (UW as any).on || fl === null || h.y - fl > 7 ? 0 : 1;   // not underwater, not over open water, not high above the ground
            smat.uniforms.uG.value = g.y; smat.uniforms.uOn.value += (on - smat.uniforms.uOn.value) * Math.min(1, dt * 4);
            smesh.visible = mesh.visible && smat.uniforms.uOn.value > 0.02;
        }
        if ((import.meta as any).env?.VITE_DBG) { (window as any).__weather = WEATHER; (window as any).__spl = { g: gy.current.y, on: smat.uniforms.uOn.value, vis: smesh.visible, h: HERO_REFL.shadow.toArray() }; }
    });
    return <><primitive object={mesh} /><primitive object={smesh} /></>;
}
