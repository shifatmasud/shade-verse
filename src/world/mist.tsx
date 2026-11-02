import * as THREE from 'three';
import { useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { TOD, WEATHER } from './env';
import { WATER_Y } from '../sim';

/* Dawn mist (Nov 2, real photos 'Early morning mist over Long Lake', 'Early morning mist over Loch Cluanie'): soft drifting banks of mist lying
   on the water when the sun is low - three stacked see-through layers just above the sea, patchy fbm, lit warm by the low sun, faded near the
   camera so it never sits on the lens. Same on every device (3 draws, one noise per pixel layer). */
const MIST_VS = `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const MIST_FS = `uniform float uT; uniform float uK; uniform float uLay; uniform vec3 uCol; uniform vec3 uSunV; varying vec3 vW;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * vn(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
void main(){
  vec2 q = vW.xz * 0.012 + vec2(uT * 0.006, uT * 0.002) + uLay * 3.1;
  float n = fbm(q + 0.6 * vec2(fbm(q * 0.7 + 4.0), fbm(q * 0.7 - 2.0)));
  float bank = smoothstep(0.42, 0.78, n);
  float d = length(cameraPosition - vW);
  float a = uK * (0.2 + 0.8 * bank) * (0.55 - uLay * 0.12) * smoothstep(25.0, 320.0, d) * (1.0 - smoothstep(1100.0, 1450.0, d));   /* thin near, a white bank toward the far shore like the photos */
  vec3 vd = normalize(vW - cameraPosition); float fs = pow(max(dot(vd, normalize(uSunV)), 0.0), 6.0);
  vec3 c = uCol * (1.0 + 0.6 * fs);
  gl_FragColor = vec4(c, a); }`;

const _w = new THREE.Color(0.96, 0.92, 0.88);
export function Mist() {
    const { camera } = useThree();
    const L = useMemo(() => [0.7, 2.6, 5.2].map((y, i) => {
        const mat = new THREE.ShaderMaterial({ vertexShader: MIST_VS, fragmentShader: MIST_FS, transparent: true, depthWrite: false, fog: false,
            uniforms: { uT: { value: 0 }, uK: { value: 0 }, uLay: { value: i }, uCol: { value: new THREE.Color() }, uSunV: TOD.sunU } });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), mat); m.position.y = WATER_Y + y; m.renderOrder = 30;   /* after the sea (transparent, would paint over a depth-less layer) */ m.frustumCulled = false; m.name = 'mist';
        return m;
    }), []);
    const col = useMemo(() => new THREE.Color(), []);
    useFrame((st) => {
        const day = TOD.day.value, warm = TOD.warm.value;
        let k = warm * Math.min(1, day * 2.5) * (1 - WEATHER.rain.value);
        if ((import.meta as any).env?.VITE_DBG && (window as any).__mistPin != null) k = (window as any).__mistPin;
        col.copy(TOD.fog).lerp(_w, 0.65).multiplyScalar(0.7 + 0.3 * day);
        for (const m of L) { const u = (m.material as THREE.ShaderMaterial).uniforms; u.uT.value = st.clock.elapsedTime; u.uK.value = k; u.uCol.value.copy(col);
            m.visible = k > 0.01; m.position.x = Math.round(camera.position.x / 50) * 50; m.position.z = Math.round(camera.position.z / 50) * 50; }
    });
    return <>{L.map((m, i) => <primitive key={i} object={m} />)}</>;
}
