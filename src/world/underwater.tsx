import { SELECTIVE_BLOOM_LAYER } from '../renderLayers';
import { PARK_POND_Y, WATER_Y, WATER_Z, isLakeWater, seabedAt, waterSurfaceAt, type Sim } from '../sim';
import * as THREE from 'three';
import { QUALITY } from '../quality';
import { TOD, WATERLINE } from './env';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { waterRenderY } from '../water/waveHeight';
import { WL_GLSL } from '../water/waterline';
const DBG = !!(import.meta as any).env.VITE_DBG;   // QA hooks only in instrumented builds

// Underwater life (user must-haves 10:29): kelp forest, jellyfish, tiny bubbles, god rays, current drift. Reference cues (viewed underwater shots): cyan light band near the surface, light shafts, sandy floor, haze to teal. All procedural approximations, small instance counts.
const UW_FOG = 'vec3(0.09, 0.43, 0.55)';
const kelpMat = new THREE.ShaderMaterial({   /* Shifat Nov 1 10:53 AM 'kelps should look like my portfolio ones': the portfolio's giant kelp - a thin stipe with long
    leaves alternating up it (cut in the fragment from one ribbon strip), twisting so they catch the light, olive-amber, glowing gold-green when the sun is behind them */
    uniforms: { uTime: { value: 0 }, uDay: TOD.day, uSun: TOD.sunU },
    vertexShader: `uniform float uTime; varying vec3 vW; varying float vH; varying vec2 vUv; varying float vHt; varying vec3 vN; varying float vWd;
    void main(){ vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); float sy = length(instanceMatrix[1].xyz), sx = length(instanceMatrix[0].xyz);
      float y = clamp(position.y / 6.0, 0.0, 1.0), H = 6.0 * sy, h = y * H, ph = ip.x * 0.37 + ip.z * 0.21;
      float tw = ph * 3.0 + h * 0.32 + 0.35 * sin(uTime * 0.4 + ph + h * 0.5); vec3 side = vec3(cos(tw), 0.0, sin(tw));
      vec3 p = side * position.x * sx + vec3(0.0, h, 0.0);
      float bendK = pow(y, 1.6), sway = sin(uTime * 0.55 + ph - h * 0.28) * 0.62 + sin(uTime * 1.13 + ph * 1.7 - h * 0.61) * 0.24, crs = sin(uTime * 0.43 + ph * 2.3 - h * 0.22);
      p.x += (0.35 + sway) * 0.38 * H * bendK * 0.42; p.z += (0.2 + crs * 0.55) * 0.38 * H * bendK * 0.32;
      vec4 w = modelMatrix * vec4(ip.xyz + p, 1.0); vW = w.xyz; vH = y; vUv = vec2(position.x / 0.8, y); vHt = H; vWd = sx * 1.6; vN = normalize(cross(side, vec3(0.0, 1.0, 0.0)));
      gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `varying vec3 vW; varying float vH; varying vec2 vUv; varying float vHt; varying vec3 vN; varying float vWd; uniform float uDay; uniform vec3 uSun;
    void main(){ float y = vUv.y, x = vUv.x, h = y * vHt, W = vWd * 0.5; vec2 pw = vec2(x * W, h); float aa = fwidth(pw.x) * 1.3 + 1e-3;
      float st = 0.03 * (1.0 - y * 0.5) + aa * 0.5; float a = smoothstep(st + aa, st, abs(pw.x)) * (1.0 - smoothstep(0.93, 1.0, y)); float leaf = 0.85;
      float sp = 0.34, Lf = 0.78, k0 = floor(h / sp);
      for (int j = 0; j < 3; j++) { float k = k0 - float(j); if (k < 2.0) break; float s = mod(k, 2.0) < 1.0 ? 1.0 : -1.0; float ang = 0.42 + 0.12 * sin(k * 3.7);
        vec2 dir = vec2(s * sin(ang), cos(ang)); vec2 rel = pw - vec2(0.0, k * sp); float al = dot(rel, dir), pe = dot(rel, vec2(dir.y, -dir.x));
        float Lk = Lf * (0.75 + 0.25 * sin(k * 1.3)) * (1.0 - 0.4 * smoothstep(0.85, 1.0, y)); Lk = min(Lk, max(0.0, (vHt - k * sp) / max(dir.y, 0.2) - 0.04)); Lk = min(Lk, max(0.0, (W - 0.05) / max(abs(dir.x), 0.2)));
        float u = clamp(al / max(Lk, 1e-3), 0.0, 1.0); float hw = 0.12 * pow(sin(3.14159 * u), 0.65) * (1.0 + 0.18 * sin(al * 38.0)) + aa * 0.6;   /* a touch broader than the portfolio's (seen from much farther here) and never thinner than ~a pixel, so far leaves stay leaves, not grass */
        float inl = smoothstep(hw + aa, hw - aa, abs(pe)) * step(0.0, al) * step(al, Lk); if (inl > a) { a = inl; leaf = 1.0 - abs(pe) / max(hw, 1e-3) * 0.6; } }
      if (a < 0.5) discard;
      vec3 V = normalize(vW - cameraPosition); vec3 N = vN * (dot(vN, V) > 0.0 ? -1.0 : 1.0); vec3 toSun = normalize(uSun);
      vec3 alb = mix(vec3(0.20, 0.16, 0.06), vec3(0.42, 0.34, 0.11), leaf) * (0.9 + 0.1 * sin(h * 23.0));
      float dep = max(-1.0 - vW.y, 0.0); vec3 sunAt = exp(-vec3(0.45, 0.07, 0.02) * dep * 0.12); float ndl = abs(dot(N, toSun));
      float back = pow(max(dot(V, toSun), 0.0), 2.0), rimK = 1.0 - leaf; vec3 glowC = vec3(0.66, 0.80, 0.34);
      vec3 col = alb * (sunAt * ndl * 0.8 + 0.35) * (0.75 + 0.25 * rimK) + sunAt * glowC * (back * (0.5 + 0.9 * rimK) + 0.05) * mix(alb * 2.0, glowC, 0.45) + pow(1.0 - abs(dot(N, V)), 2.5) * sunAt * glowC * 0.22 * (0.3 + back);
      float d = length(vW - cameraPosition); float kA = smoothstep(-3.0, -1.2, cameraPosition.y); float wf = mix(1.0, clamp((-1.0 - vW.y) / max(cameraPosition.y - vW.y, 0.01), 0.0, 1.0), kA); float dw = d * wf, k = mix(1.0, 3.5, kA);   /* seen from above: only the underwater part of the sight line absorbs, and more strongly (light goes down and back up) */
      col = col * exp(-vec3(0.45, 0.07, 0.02) * dw * 0.12 * k) + ${UW_FOG} * 0.75 * (1.0 - exp(-dw * 0.028 * k)); col *= mix(0.12, 1.0, uDay) * mix(1.0, mix(1.0, 0.62, vH), kA); gl_FragColor = vec4(col, 1.0); }`,
    side: THREE.DoubleSide,
});
// God rays (Shifat Oct 29 "godrays can be better, ref real images"): long soft shafts from the surface, slanted along the sun,
// several stripes per sheet flickering with the waves above, brightest just under the surface and fading with depth.
// Sheets are cylindrical billboards placed around the camera, so the fan converges in perspective like real underwater light.
const _rayAx = new THREE.Vector3();
const RAY_N = QUALITY.coarse || QUALITY.weakGpu ? 14 : 26, RAY_LEN = 42;
const rayMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSurf: { value: -1 }, uDay: TOD.day, uWL: { value: WATERLINE.v }, uWLq: { value: WATERLINE.q } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vU; varying float vY; varying vec4 vS; void main(){ vU = uv; vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vY = w.y; gl_Position = projectionMatrix * viewMatrix * w; vS = gl_Position; }',
    fragmentShader: `varying vec2 vU; varying float vY; varying vec4 vS; uniform float uTime, uSurf, uDay;
      ${WL_GLSL}
      float h(float x){ return fract(sin(x * 127.1) * 43758.5453); }
      void main(){
        if (uWL.w > 0.5 && vS.y / vS.w > wlY(vS.x / vS.w)) discard;   /* half-underwater lens: shafts start at the flat sea level, so in a trough their tops stood in the air half - never above the line */
        float x = vU.x, t = uTime;
        float s = 0.0; for (int k = 0; k < 4; k++) { float fk = float(k), c = 0.15 + 0.7 * h(fk + floor(t * 0.05 + fk) * 3.1); float w = 0.12 + 0.14 * h(fk * 7.0 + 1.0), dx = (x - c - 0.04 * sin(t * 0.35 + fk * 2.1)) / w;
          s += exp(-dx * dx * 1.0) * (0.55 + 0.45 * sin(t * (0.9 + fk * 0.37) + fk * 4.0)); }   /* Shifat 8:43 PM 'more blurry god rays': gaussian shaft profile (was a hard-edged band), wider, and the sheets feed the bloom pass */
        float edge = smoothstep(0.0, 0.3, x) * (1.0 - smoothstep(0.7, 1.0, x));   /* Shifat 11:07 PM 'godrays (soft blurred)': wider gaussians + soft sheet edges */
        float depth = uSurf - vY; float fade = exp(-max(depth, 0.0) * 0.055) * smoothstep(0.0, 5.0, depth);
        float a = s * edge * fade * mix(0.6, 1.0, uDay * uDay) * 0.36;   /* Shifat Nov 1 11:16 AM 'underwater must always have god rays, even at night, because of the moon': night keeps clear moonbeams (~60%) */
        gl_FragColor = vec4(mix(vec3(0.55, 0.7, 1.0), vec3(0.62, 0.93, 1.0), uDay) * a, a);   /* moonlight: cooler, silver-blue */
      }`,
});
// Shifat Oct 29 "water bubble must be randomized particle emission": round glints with a per-particle size (aSize) and rgba fade.
const bubbleMat = new THREE.PointsMaterial({color:'#dff8ff',size:0.42,sizeAttenuation:true,transparent:true,opacity:0.9,depthWrite:false,vertexColors:true});
bubbleMat.onBeforeCompile = (shader) => {
    shader.vertexShader = 'attribute float aSize;\n' + shader.vertexShader.replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nfloat br=length(gl_PointCoord-0.5);if(br>0.5)discard;').replace('#include <opaque_fragment>', '/* real vent bubbles (Eifuku ref): clear centre, bright silvery rim, small specular highlight up-left, soft edge */ float hl=1.0-smoothstep(0.0,0.12,length(gl_PointCoord-vec2(0.36,0.32))); diffuseColor.rgb+=hl*0.6; diffuseColor.a*=(1.0-smoothstep(0.36,0.5,br))*(0.22+0.78*smoothstep(0.24,0.42,br))+hl*0.7;\n#include <opaque_fragment>');
};
bubbleMat.customProgramCacheKey = () => 'round-bubble-emitter-v4';
// Pooled randomized bubble emitter: one Points draw, fixed typed arrays, no per-frame allocation. Each particle gets a random
// size, rise speed, wobble (amplitude/frequency/phase), sideways drift and lifetime; it fades in, rises (speeding up slightly as it
// grows, like a real bubble), and pops/fades just under the real wave-displaced surface at its own x/z. Emitters: seabed vents at
// random spots around the camera, plus a stream off the hero while moving/diving (rate scales with speed).
const BUB_N = QUALITY.coarse || QUALITY.weakGpu ? 260 : 520;
export function Underwater({ sim }: { sim: Sim }) {
    const kelp = useRef<THREE.InstancedMesh>(null!), bub = useRef<THREE.Points>(null!), rays = useRef<THREE.Group>(null!), rayInst = useRef<THREE.InstancedMesh>(null!);
    const rayGeo = useMemo(() => { const g = new THREE.PlaneGeometry(1, RAY_LEN, 1, 1); g.translate(0, -RAY_LEN / 2, 0); return g; }, []);
    const rayS = useMemo(() => Array.from({ length: 26 }, (_, i) => ({ a: i * 2.399, r: 3 + ((i * 37) % 26), w: 2.5 + ((i * 13) % 6), ph: i * 1.7 })), []), rayO = useMemo(() => new THREE.Object3D(), []);
    const kGeo = useMemo(() => { const g = new THREE.PlaneGeometry(0.8, 6, 1, 12); g.translate(0, 3, 0); return g; }, []);
    const bGeo = useMemo(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BUB_N * 3).fill(-9999), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(BUB_N * 4).fill(1), 4)); g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(BUB_N).fill(1), 1)); return g; }, []);
    // particle state (pooled): base x/z, y, rise speed, age, life, wobble amp/freq/phase, drift x/z, size; alive when age < life
    const B = useMemo(() => ({ x: new Float32Array(BUB_N), y: new Float32Array(BUB_N), z: new Float32Array(BUB_N), v: new Float32Array(BUB_N), age: new Float32Array(BUB_N).fill(1), life: new Float32Array(BUB_N).fill(0), wa: new Float32Array(BUB_N), wf: new Float32Array(BUB_N), wp: new Float32Array(BUB_N), dx: new Float32Array(BUB_N), dz: new Float32Array(BUB_N), sz: new Float32Array(BUB_N), acc: 0, heroAcc: 0, next: 0, lastT: -1 }), []);
    /* Shifat 11:07 PM 'full seabed must have kelps': a kelp forest that follows the camera over the WHOLE sea floor (was one strip by the city shore).
       Ref: Wikimedia 'Kelp forest and sardines, San Clemente Island' - tall stipes rising toward the light, clumped, fading into blue haze.
       Stable per 8 m cell (hash), rebuilt only when the camera crosses a cell; only on 3-34 m deep floor (kelp needs light). */
    const kc = useMemo(() => ({ cx: 1e9, cz: 1e9 }), []), ko = useMemo(() => new THREE.Object3D(), []);
    const placeKelp = (px: number, pz: number) => {
        const C = 8, R = 10, gx = Math.floor(px / C), gz = Math.floor(pz / C); if (gx === kc.cx && gz === kc.cz) return; kc.cx = gx; kc.cz = gz;
        let n = 0; const hz = (a: number, b: number, s: number) => { const v = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
        for (let ix = -R; ix < R; ix++) for (let iz = -R; iz < R; iz++) {
            const cx = gx + ix, cz = gz + iz; const clump = hz(Math.floor(cx / 3), Math.floor(cz / 3), 9.1); if (clump < 0.35) continue;   // forests come in clumps with open sand between
            const m = 1 + Math.floor(hz(cx, cz, 1.3) * 4);
            for (let k = 0; k < m && n < 1400; k++) {
                const x = (cx + hz(cx, cz, k + 2.1)) * C, z = (cz + hz(cx, cz, k + 5.7)) * C; if (z > WATER_Z - 4) continue; const bed = seabedAt(x, z); if (bed > -3 || bed < -34) continue;
                const d = -bed, kk = 0.6 + hz(cx, cz, k + 8.3) * 1.1; ko.position.set(x, bed, z); ko.rotation.set(0, hz(cx, cz, k + 3.3) * 3.14, 0);
                ko.scale.set(kk * (0.5 + hz(cx, cz, k + 4.4) * 0.6), Math.max(d * (0.82 + hz(cx, cz, k + 6.6) * 0.16) - 0.6, 1.5) / 6   /* real giant kelp (ref /tmp/uwr/kelp.jpg): stipes rise to just under the surface, forming tall columns */, kk); ko.updateMatrix(); kelp.current.setMatrixAt(n++, ko.matrix);
            }
        }
        kelp.current.count = n; kelp.current.instanceMatrix.needsUpdate = true;
    };
    useFrame((st) => {
        const t = sim.t, hx = sim.pos[0], hy = sim.pos[1], hz = sim.pos[2], inBay = hz < WATER_Z + 6, inLake = isLakeWater(hx, hz), inWater = inBay || inLake, surfaceY = inLake ? waterSurfaceAt(hx, hz, t) : WATER_Y, under = inWater && st.camera.position.y < surfaceY + 1.5 && sim.mode === 'play';
        kelpMat.uniforms.uTime.value = t; rayMat.uniforms.uTime.value = t;
        kelp.current.visible = inBay && sim.mode === 'play' && st.camera.position.y < surfaceY + 14; if (kelp.current.visible) placeKelp(st.camera.position.x, st.camera.position.z);   /* Shifat 12:57 AM: the underwater world must show from above too (was: only with the lens under) */   /* Shifat Oct 31 2:29 PM night screenshot: seen from above through the clear water the blades read as rain streaks over the whole sea - only drawn when the lens is at/below the surface */ const cu = under && st.camera.position.y < surfaceY - 0.05 && st.camera.position.y < waterRenderY(st.camera.position.x, st.camera.position.z, t) - 0.05; bub.current.visible = cu; rays.current.visible = cu;   // env-iter3: also below the real (wave-displaced) sea surface, not just the flat sea level   // shafts and bubbles only once the camera is really below either water surface
        if (!inWater) return;
        if (under) {
            const pa = bub.current.geometry.attributes.position as THREE.BufferAttribute, ca = bub.current.geometry.attributes.color as THREE.BufferAttribute, za = bub.current.geometry.attributes.aSize as THREE.BufferAttribute;
            const dt = B.lastT < 0 ? 0.016 : Math.min(0.1, Math.max(0, t - B.lastT)); B.lastT = t;
            const floor = inLake ? PARK_POND_Y - 3.6 : seabedAt(st.camera.position.x, st.camera.position.z) + 0.4, cx = st.camera.position.x, cz = st.camera.position.z, cur = Math.sin(t * 0.3) * 0.25;
            const spawn = (x: number, y: number, z: number, small: boolean) => {
                if (inLake && !isLakeWater(x, z)) return;
                let k = -1; for (let j = 0; j < BUB_N; j++) { const q = (B.next + j) % BUB_N; if (B.age[q] >= B.life[q]) { k = q; break; } }
                if (k < 0) return; B.next = (k + 1) % BUB_N;
                const r = Math.random();
                B.x[k] = x; B.y[k] = y; B.z[k] = z; B.age[k] = 0; B.life[k] = small ? 2.5 + Math.random() * 5.5 : 45;   /* real bubbles rise all the way and pop at the surface */
                B.sz[k] = small ? 0.35 + r * 0.6 : 0.45 + r * r * 1.6; B.v[k] = 0.35 + B.sz[k] * 0.45 + Math.random() * 0.35;
                B.wa[k] = 0.03 + Math.random() * 0.12; B.wf[k] = 2 + Math.random() * 5; B.wp[k] = Math.random() * 6.283;
                B.dx[k] = (Math.random() - 0.5) * 0.25; B.dz[k] = (Math.random() - 0.5) * 0.25;
            };
            // seabed vents: Poisson-ish random emission in a 13 m disc around the camera, sometimes in little bursts
            B.acc += dt * (BUB_N * 0.035);
            while (B.acc >= 1) { B.acc -= 1; const a = Math.random() * 6.283, rr = 1.5 + Math.sqrt(Math.random()) * 11.5, x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr, burst = Math.random() < 0.18 ? 2 + Math.floor(Math.random() * 4) : 1; for (let q = 0; q < burst; q++) spawn(x + (Math.random() - 0.5) * 0.3, floor + Math.random() * 0.4, z + (Math.random() - 0.5) * 0.3, burst > 1); }
            /* vent columns (real ref: Wikimedia 'Eifuku chimneys bubbles' - round silvery bubbles of mixed sizes streaming up from fixed spots on the floor):
               fixed vents hashed on a 10 m grid around the camera (about 1 in 4 cells), each a steady stream */
            { const VC = 10, gx0 = Math.floor(cx / VC), gz0 = Math.floor(cz / VC), hh = (a: number, b: number, s: number) => { const v = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
              for (let ix = -2; ix <= 2; ix++) for (let iz = -2; iz <= 2; iz++) { const gx = gx0 + ix, gz = gz0 + iz; if (hh(gx, gz, 3.3) > 0.27) continue;
                const vx = (gx + hh(gx, gz, 1.1)) * VC, vz = (gz + hh(gx, gz, 2.2)) * VC; if (vz > WATER_Z - 4) continue; const vb = inLake ? floor : seabedAt(vx, vz); if (vb > -2) continue;
                if (Math.random() < dt * (1.4 + hh(gx, gz, 4.4) * 1.6)) spawn(vx + (Math.random() - 0.5) * 0.25, vb + 0.15, vz + (Math.random() - 0.5) * 0.25, false); } }
            // hero stream: more bubbles the faster you swim, extra on a dive
            const hv = Math.hypot(sim.vel[0], sim.vel[1], sim.vel[2]);
            if (hy < surfaceY - 0.3) { B.heroAcc += dt * (hv * 2.2 + (sim.dive ? 10 : 0) + 0.6); while (B.heroAcc >= 1) { B.heroAcc -= 1; spawn(hx + (Math.random() - 0.5) * 0.6, hy + 0.6 + Math.random() * 0.8, hz + (Math.random() - 0.5) * 0.6, true); } }
            for (let i = 0; i < BUB_N; i++) {
                if (B.age[i] >= B.life[i]) { pa.setXYZ(i, 0, -9999, 0); ca.setW(i, 0); continue; }
                B.age[i] += dt; B.v[i] = Math.min(B.v[i] + dt * 0.08, 1.6); B.y[i] += B.v[i] * dt; B.x[i] += (B.dx[i] + cur) * dt; B.z[i] += B.dz[i] * dt;
                const w = Math.sin(B.age[i] * B.wf[i] + B.wp[i]) * B.wa[i], bx = B.x[i] + w, bz = B.z[i] + Math.cos(B.age[i] * B.wf[i] * 0.8 + B.wp[i]) * B.wa[i] * 0.7;
                const top = waterRenderY(bx, bz, t) - 0.1;
                if (B.y[i] >= top) { B.age[i] = B.life[i]; pa.setXYZ(i, 0, -9999, 0); ca.setW(i, 0); continue; }   // pop just under the real swell
                const fin = Math.min(1, B.age[i] / 0.35), fout = Math.min(1, (B.life[i] - B.age[i]) / 0.6, (top - B.y[i]) / 0.35);
                pa.setXYZ(i, bx, B.y[i], bz); ca.setW(i, fin * Math.max(0, fout)); za.setX(i, B.sz[i] * (1 + 0.15 * Math.min(1, B.age[i] / 3)));
            }
            za.needsUpdate = true; if (DBG) (window as any).__bub = B.age.reduce((s: number, a: number, i: number) => s + (a < B.life[i] ? 1 : 0), 0);
            pa.needsUpdate = true; ca.needsUpdate = true; bub.current.geometry.computeBoundingSphere();
            rays.current.position.set(0, 0, 0); rays.current.rotation.y = 0; rayMat.uniforms.uSurf.value = surfaceY;
            { const cam = st.camera, cx = cam.position.x, cz = cam.position.z, sun = TOD.sunU.value as THREE.Vector3, tilt = Math.min(0.5, Math.hypot(sun.x, sun.z) * 0.45), sa = Math.atan2(sun.x, sun.z), m = rayInst.current;
              for (let i = 0; i < RAY_N; i++) { const q = rayS[i], a = q.a + Math.sin(t * 0.03 + q.ph) * 0.3, x = cx + Math.cos(a) * q.r, z = cz + Math.sin(a) * q.r;
                rayO.position.set(x, surfaceY + 0.05, z); rayO.rotation.set(0, 0, 0); rayO.rotateY(Math.atan2(cx - x, cz - z)); rayO.rotateOnWorldAxis(_rayAx.set(Math.cos(sa), 0, -Math.sin(sa)), -tilt); rayO.scale.set(q.w * (0.8 + 0.2 * Math.sin(t * 0.4 + q.ph)), 1, 1); rayO.updateMatrix(); m.setMatrixAt(i, rayO.matrix); }
              m.instanceMatrix.needsUpdate = true; }
        }
    });
    return <group>
        <instancedMesh ref={kelp} args={[kGeo, kelpMat, 1400]} frustumCulled={false} />
        <points ref={bub} geometry={bGeo} frustumCulled={false}><primitive object={bubbleMat} attach="material" /></points>
        <group ref={rays}><instancedMesh ref={rayInst} args={[rayGeo, rayMat, RAY_N]} frustumCulled={false} onUpdate={(o) => o.layers.enable(SELECTIVE_BLOOM_LAYER)} /></group>
    </group>;
}

