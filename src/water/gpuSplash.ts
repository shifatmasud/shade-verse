import * as THREE from 'three';
import { bursts, SK } from './splash';
import { IX_GLSL, IX_UNIFORMS } from './interaction';
import { QUALITY } from '../quality';

/* Shifat Nov 15 2026 4:38 PM: 'All water bubble, particles sizes are too big. Make them super tiny & many (use gpgpu techniques).'
   GPGPU splash: every particle lives in three RGBA32F textures (MRT, ping-ponged): P = position + age, V = velocity, M = life, radius, kind, water level.
   One full-screen pass per frame spawns (bursts from ./splash.ts claim a ring range of particle slots; each slot hashes its own random launch),
   integrates (gravity, size-dependent air drag, bubble buoyancy + wobble, surface foam drift) and kills (drops that fall back into the water, bubbles
   that reach the surface). The draw is one THREE.Points of N vertices that fetch their state from the texture: no CPU per-particle work at all.
   Sizes are real: spray drops 0.4-4 mm radius, mist 0.1-0.6 mm, bubbles 0.1-0.7 mm; a sub-pixel drop keeps a 1 px dot with its alpha scaled by
   coverage, so thousands of them read as fine glittering spray instead of a few big balls. Desktop 256x256 = 65536, touch 160x160 = 25600 particles (4:56 PM: 'more more particles').
   Needs WebGL2 + EXT_color_buffer_float (all current desktop + phone GPUs); without it the splash is skipped and the ripples still run. */

export const GS_W = QUALITY.coarse || QUALITY.tier === 'low' ? 160 : 256, GS_N = GS_W * GS_W;   /* Shifat 4:56 PM 'more more particles in splash' */
const SLOTS = 24;

const SIM_VS = 'out vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const SIM_FS = `precision highp float; precision highp int;
in vec2 vUv;
uniform sampler2D tP, tV, tM; uniform float uDt, uT, uW;
uniform vec4 uA[${SLOTS}], uB[${SLOTS}], uC[${SLOTS}];   /* A = pos.xyz, kind | B = first slot, count, energy, body size | C = dir.xz, water y, seed */
layout(location = 0) out vec4 oP; layout(location = 1) out vec4 oV; layout(location = 2) out vec4 oM;
uint hu(uint x){ x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
float hf(inout uint s){ s = hu(s); return float(s & 0xffffffu) / 16777216.0; }
const float TAU = 6.2831853;
void main(){
  ivec2 ic = ivec2(gl_FragCoord.xy); float idx = float(ic.y) * uW + float(ic.x), N = uW * uW;
  vec4 P = texelFetch(tP, ic, 0), V = texelFetch(tV, ic, 0), M = texelFetch(tM, ic, 0);
  for (int b = 0; b < ${SLOTS}; b++) {
    vec4 B = uB[b]; if (B.y < 0.5) continue;
    float d = mod(idx - B.x + N, N); if (d >= B.y) continue;
    vec4 A = uA[b], C = uC[b]; uint s = hu(uint(idx) * 747796405u + uint(C.w) * 2891336453u + 17u);
    float k = A.w, e = B.z, sz = B.w, h1 = hf(s), h2 = hf(s), h3 = hf(s), h4 = hf(s), h5 = hf(s), h6 = hf(s);
    float big = h6 * h6 * h6;   /* most drops are tiny, a few are a bit bigger (spray drop sizes are long-tailed) */
    vec3 p = A.xyz, v = vec3(0.0); float life = 1.0, r = 0.001;
    if (k < 0.5) {   /* crown: the sheet torn into drops thrown up and out on ballistic arcs */
      float a = h1 * TAU, rr = sz * 0.45 * (0.75 + 0.5 * h2), out_ = (0.5 + 2.1 * h3) * sqrt(e), up = (1.4 + 2.6 * e) * (0.45 + 0.75 * h4);
      p += vec3(cos(a) * rr, 0.03 + 0.08 * h5, sin(a) * rr); v = vec3(cos(a) * out_, up, sin(a) * out_); life = 1.0 + 0.9 * h5; r = 0.0005 + 0.0035 * big;
    } else if (k < 1.5) {   /* Worthington jet: a column from the centre, breaking into drops */
      float a = h1 * TAU, j = 0.09 * sqrt(h2); p += vec3(cos(a) * j, 0.02 + 0.3 * h5 * e, sin(a) * j); v = vec3(cos(a) * 0.5 * h3, (2.2 + 3.8 * e) * (0.65 + 0.4 * h4), sin(a) * 0.5 * h3);
      life = 1.1 + 0.8 * h5; r = 0.0006 + 0.004 * big;
    } else if (k < 2.5) {   /* mist: fine spray that hangs and drifts */
      float a = h1 * TAU, o = (0.1 + 0.6 * h2) * sz; p += vec3(cos(a) * o, 0.05 + 0.5 * h3, sin(a) * o);
      v = vec3(cos(a), 0.0, sin(a)) * (0.3 + 0.9 * h4) + vec3(0.0, (0.4 + 1.2 * h5) * e, 0.0); life = 0.7 + 1.0 * h6; r = 0.0001 + 0.0005 * h3;
    } else if (k < 3.5) {   /* swim stroke: an arm entry throws a fan of drops forward / up (dir = heading, e = speed factor) */
      vec2 f = C.xy, sd = vec2(-f.y, f.x); p += vec3(f.x * (h1 - 0.5) * 0.2 + sd.x * (h2 - 0.5) * 0.25, 0.03, f.y * (h1 - 0.5) * 0.2 + sd.y * (h2 - 0.5) * 0.25);
      v = vec3(f.x, 0.0, f.y) * (0.3 + 1.4 * h3) * e + vec3(sd.x, 0.0, sd.y) * (h4 - 0.5) * 0.9 + vec3(0.0, (0.7 + 1.6 * h5) * e, 0.0); life = 0.55 + 0.6 * h6; r = 0.0004 + 0.0028 * big;
    } else if (k < 4.5) {   /* surf / fast tow: sheets peeling off both sides (dir = carried velocity, e = side throw) */
      float side = h1 < 0.5 ? -1.0 : 1.0; vec2 f = normalize(C.xy + vec2(1e-4, 0.0)), sd = vec2(-f.y, f.x) * side; float o = 0.3 + 0.35 * h2;
      p += vec3(sd.x * o + f.x * (h3 - 0.4) * 0.6, 0.04, sd.y * o + f.y * (h3 - 0.4) * 0.6);
      v = vec3(sd.x, 0.0, sd.y) * (1.0 + 2.4 * h4) * e + vec3(C.x, 0.0, C.y) * 0.35 + vec3(0.0, 1.0 + 2.2 * h5, 0.0); life = 0.6 + 0.7 * h6; r = 0.0003 + 0.0026 * big;
    } else if (k < 5.5) {   /* drips off a body leaving the water (dir = body velocity) */
      p += vec3((h1 - 0.5) * 0.5, -0.6 + h2, (h3 - 0.5) * 0.5); v = vec3(C.x * 0.6, -0.5 - 0.5 * h4, C.y * 0.6); life = 1.2 + 0.4 * h5; r = 0.0008 + 0.0025 * big;
    } else if (k < 6.5) {   /* air bubbles dragged under by the entry / a diver: rise, wobble, pop at the surface */
      float a = h1 * TAU, o = sz * 0.5 * sqrt(h2); p += vec3(cos(a) * o, -0.15 - (0.3 + 1.2 * e) * h3 * sz * 2.0, sin(a) * o);
      v = vec3(cos(a) * 0.3 * h4, 0.1 + 0.4 * h5, sin(a) * 0.3 * h4); life = 1.6 + 1.8 * h6; r = 0.00005 + 0.00025 * big;   /* Shifat 4:56 PM 'tiny', 5:26 PM 'soo much little & tiny': 0.05-0.3 mm specks */
    } else if (k > 8.5) {   /* waterfall plunge spray (Nov 15 9:38 PM, refs Gullfoss / Seljalandsfoss / Akaka Falls): billions of sub-mm drops read as a
         rolling white cloud, not as dots, so each slot is a soft puff 0.3-1 m across thrown out of the plunge line (dir = downstream) and up, growing as it rises */
      float a = h1 * TAU; p += vec3(cos(a) * 0.6 * h2, 0.2 + 0.8 * h3, sin(a) * 0.6 * h2);
      v = vec3(C.x, 0.0, C.y) * (0.6 + 2.2 * h4) * e + vec3(cos(a), 0.0, sin(a)) * (0.4 + 1.2 * h5) + vec3(0.0, (1.2 + 3.2 * h6) * e, 0.0); life = 2.4 + 2.2 * h3; r = 0.15 + 0.35 * h5;
    } else if (k > 7.5) {   /* rain (6:00 PM, Worthington refs): each slot is its own drop impact scattered over a disc of radius sz: 85% crown beads
         (0.15-0.8 mm, thrown 1-8 cm up and a few cm out), 15% the stalk's top drop (straight up, 3-6 cm) */
      float a = h1 * TAU, o = sz * sqrt(h2), jet = step(0.85, h3); p += vec3(cos(a) * o, 0.005, sin(a) * o); float b = h4 * TAU;
      v = jet > 0.5 ? vec3(cos(b) * 0.05, 0.8 + 0.3 * h5, sin(b) * 0.05) : vec3(cos(b), 0.0, sin(b)) * (0.15 + 0.45 * h5) + vec3(0.0, 0.45 + 0.8 * h5, 0.0);
      life = 0.45; r = 0.00015 + 0.00065 * big;
    } else {   /* surface foam: millimetre bubbles left floating on the churned water, drifting out and popping */
      float a = h1 * TAU, o = sz * (0.3 + 1.1 * sqrt(h2)); p += vec3(cos(a) * o, 0.0, sin(a) * o); v = vec3(cos(a), 0.0, sin(a)) * (0.05 + 0.5 * h3 * e) + vec3(C.x, 0.0, C.y) * 0.15;
      life = 0.9 + 2.2 * h4; r = 0.0004 + 0.0016 * big;
    }
    P = vec4(p, 0.0); V = vec4(v, 0.0); M = vec4(life, r, k, C.z);
  }
  float k = M.z, wy = M.w;
  if (P.w < M.x) {
    vec3 p = P.xyz, v = V.xyz; float dt = uDt;
    if (k > 5.5 && k < 6.5) {   /* bubble: buoyancy against heavy drag, terminal ~0.25-0.35 m/s, helical wobble */
      v.y += (2.6 - 6.0 * v.y) * dt; v.xz *= exp(-3.0 * dt); float ph = uT * 9.0 + float(ic.x) * 1.7; v.xz += vec2(cos(ph), sin(ph)) * 0.35 * dt * 6.0;
      p += v * dt; if (p.y > wy - 0.02) P.w = M.x;
    } else if (k > 6.5 && k < 7.5) {   /* surface foam rides the surface (render adds the live height) */
      v *= exp(-1.6 * dt); p.xz += v.xz * dt; p.y = wy;
    } else if (k > 8.5) {   /* plunge spray cloud: carried by the air the falls drag down and push out, slowing, barely settling */
      v *= exp(-0.85 * dt); v.y -= 0.25 * dt; p += v * dt; p.y = max(p.y, wy + 0.1);
    } else if (k > 1.5 && k < 2.5) {   /* mist: almost weightless, strong drag */
      v *= exp(-2.6 * dt); v.y -= 0.35 * dt; p += v * dt;
    } else {   /* drops: gravity + quadratic-ish air drag that grows as the drop shrinks */
      float dr = 0.18 + 0.0009 / max(M.y, 2e-4); v *= exp(-dr * dt * (0.5 + 0.12 * length(v))); v.y -= 9.81 * dt; p += v * dt;
      if (v.y < 0.0 && p.y < wy) P.w = M.x;   /* fell back in: gone (its ring is raised by WaterFX) */
    }
    if (P.w < M.x) P = vec4(p, P.w + dt); V = vec4(v, 0.0);
  }
  oP = P; oV = V; oM = M;
}`;

const DRAW_VS = IX_GLSL + `uniform sampler2D tP, tM; uniform float uScale; attribute vec2 aRef; varying float vA; varying float vK; varying float vR;
void main(){ vec4 P = texture2D(tP, aRef), M = texture2D(tM, aRef);
  if (P.w >= M.x) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }
  vec3 p = P.xyz; float k = M.z; if (k > 6.5 && k < 7.5) p.y += ixHeight(p.xz) + 0.004;
  vec4 mv = modelViewMatrix * vec4(p, 1.0); float zr = -mv.z;
  /* Shifat 7:03 PM 'rain drops, crowns are under some layers of the water surface - RCA': the drops are depth-tested against the drawn sea, whose
     surface carries GPU-only height (FFT chop, interaction rings, 0.5-dpr sea depth on phones) that the CPU wave height they launch from lacks, so any
     drop within a few cm of the water was hidden. Above-water particles are now pulled toward the lens by up to 0.35 m (8% of range) for the depth test
     only, so they always sit on top of the water layers while islands, hulls and the hero still hide them. Bubbles keep their true depth. */
  if (k < 5.5 || k > 6.5) mv.xyz *= 1.0 - min(0.35, 0.08 * length(mv.xyz)) / max(length(mv.xyz), 0.05);
  gl_Position = projectionMatrix * mv;
  float ps = 2.0 * M.y * uScale / max(0.2, zr), age = P.w / M.x;
  if (k > 8.5) ps *= 1.0 + 1.6 * age;   /* spray puffs swell as they rise and thin */
  gl_PointSize = clamp(ps, 1.0, k > 8.5 ? 72.0 : k > 5.5 && k < 6.5 ? 1.5 : 18.0); vR = ps;
  float cov = clamp(ps * 1.4, 0.3, 1.0);   /* sub-pixel: keep a 1 px dot, alpha ~ its size (fine shimmer, not big balls) */
  float fade = k > 1.5 && k < 2.5 ? sin(min(1.0, age * 4.0) * 1.5708) * (1.0 - age) : k > 6.5 && k < 7.5 ? (1.0 - age) * smoothstep(0.0, 0.08, age) : k > 8.5 ? smoothstep(0.0, 0.15, age) * (1.0 - age) * (1.0 - age) : k > 7.5 ? 1.0 - age : 1.0 - age * age;
  vA = fade * cov; vK = k; }`;
const DRAW_FS = `uniform float uDay; uniform vec3 uSky; varying float vA; varying float vK; varying float vR;
void main(){ if (vA < 0.004) discard; vec2 q = gl_PointCoord * 2.0 - 1.0; float r = dot(q, q); if (r > 1.0) discard;
  vec3 lit = mix(vec3(0.30, 0.40, 0.46), vec3(0.96, 0.99, 1.0), 0.55 + 0.45 * uDay);
  float soft = vR < 2.5 ? 1.0 : 1.0 - smoothstep(0.6, 1.0, r);   /* tiny points: full dot; bigger: round edge */
  if (vK > 8.5) { gl_FragColor = vec4(lit, vA * 0.075 * exp(-3.2 * r)); return; }   /* 0.16 stacked to flat white (10:39 PM) */                          /* plunge spray cloud: soft gaussian puff */
  if (vK > 1.5 && vK < 2.5) { gl_FragColor = vec4(lit, vA * 0.35 * soft); return; }                        /* mist */
  if (vK > 5.5 && vK < 6.5) { float rim = vR < 3.0 ? 0.7 : smoothstep(0.35, 0.85, r); gl_FragColor = vec4(mix(uSky * 0.6, lit, 0.6) + 0.25, vA * 0.45 * soft); return; }   /* air bubble under water: bright rim */
  if (vK > 6.5 && vK < 7.5) { gl_FragColor = vec4(lit * 0.97, vA * 0.75 * soft); return; }                                /* surface foam bubble */
  float rim = vR < 3.0 ? 0.6 : smoothstep(0.4, 0.95, r), glint = vR < 3.0 ? 0.0 : smoothstep(0.2, 0.0, length(q - vec2(-0.3, 0.35)));
  vec3 c = mix(uSky * 0.8 + vec3(0.06, 0.1, 0.12), lit, 0.45 + 0.4 * rim) + glint * 0.6 * uDay;   /* water drop: sky-tinted lens, bright rim, glint */
  gl_FragColor = vec4(c, vA * (0.7 + 0.3 * rim) * soft); }`;

export class GpuSplash {
    readonly ok: boolean; readonly points: THREE.Points;
    private rt: THREE.WebGLRenderTarget[] = []; private cur = 0; private sim!: THREE.ShaderMaterial; private draw: THREE.ShaderMaterial;
    private scene = new THREE.Scene(); private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); private cursor = 0; private seed = 1; private liveUntil = -1;
    constructor(private gl: THREE.WebGLRenderer, day: { value: number }) {
        this.ok = !!(gl.capabilities.isWebGL2 && gl.extensions.has('EXT_color_buffer_float'));
        const g = new THREE.BufferGeometry(), ref = new Float32Array(GS_N * 2);
        for (let i = 0; i < GS_N; i++) { ref[i * 2] = ((i % GS_W) + 0.5) / GS_W; ref[i * 2 + 1] = (Math.floor(i / GS_W) + 0.5) / GS_W; }
        g.setAttribute('aRef', new THREE.BufferAttribute(ref, 2)); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(GS_N * 3), 3));
        this.draw = new THREE.ShaderMaterial({ uniforms: { tP: { value: null }, tM: { value: null }, uScale: { value: 400 }, uDay: day, uSky: { value: new THREE.Color('#9fc4d8') }, ...IX_UNIFORMS },
            vertexShader: DRAW_VS, fragmentShader: DRAW_FS, transparent: true, depthWrite: false, toneMapped: false });
        this.points = new THREE.Points(g, this.draw); this.points.frustumCulled = false; this.points.renderOrder = 6; this.points.visible = false;
        if (!this.ok) return;
        const mk = () => { const t = new THREE.WebGLRenderTarget(GS_W, GS_W, { count: 3, type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false }); return t; };
        this.rt = [mk(), mk()];
        const v4 = () => Array.from({ length: SLOTS }, () => new THREE.Vector4());
        this.sim = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: { tP: { value: null }, tV: { value: null }, tM: { value: null }, uDt: { value: 0 }, uT: { value: 0 }, uW: { value: GS_W }, uA: { value: v4() }, uB: { value: v4() }, uC: { value: v4() } },
            vertexShader: SIM_VS, fragmentShader: SIM_FS, depthTest: false, depthWrite: false, toneMapped: false });
        const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.sim); q.frustumCulled = false; this.scene.add(q);
        const prev = gl.getRenderTarget(), cc = gl.getClearColor(new THREE.Color()), ca = gl.getClearAlpha(); gl.setClearColor(0x000000, 0);
        for (const t of this.rt) { gl.setRenderTarget(t); gl.clear(true, false, false); } gl.setRenderTarget(prev); gl.setClearColor(cc, ca);   /* age 0, life 0 = dead */
    }
    /** Spawn queued bursts and step every particle. dt in s, t = game time, scale = pixels per metre at 1 m. */
    update(dt: number, t: number, scale: number) {
        if (!this.ok) { bursts.length = 0; return; }
        const u = this.sim.uniforms; let k = 0;
        while (bursts.length && k < SLOTS) {
            const b = bursts.shift()!, n = Math.min(b.n, GS_N >> 1);
            (u.uA.value[k] as THREE.Vector4).set(b.x, b.y, b.z, b.k); (u.uB.value[k] as THREE.Vector4).set(this.cursor, n, b.e, b.s); (u.uC.value[k] as THREE.Vector4).set(b.dx, b.dz, b.wy, this.seed++ & 0xffffff);
            this.cursor = (this.cursor + n) % GS_N; k++;
            this.liveUntil = Math.max(this.liveUntil, t + (b.k === SK.BUBBLE || b.k === SK.FOAM ? 4 : b.k === SK.RAIN ? 0.6 : 2.2));
        }
        for (; k < SLOTS; k++) (u.uB.value[k] as THREE.Vector4).set(0, 0, 0, 0);
        const live = t < this.liveUntil; this.points.visible = live; if (!live) return;   /* nothing alive: no pass, no draw */
        const src = this.rt[this.cur], dst = this.rt[this.cur ^ 1];
        u.tP.value = src.textures[0]; u.tV.value = src.textures[1]; u.tM.value = src.textures[2]; u.uDt.value = Math.min(1 / 30, Math.max(0, dt)); u.uT.value = t;
        const prev = this.gl.getRenderTarget(), ac = this.gl.autoClear; this.gl.autoClear = false;
        this.gl.setRenderTarget(dst); this.gl.render(this.scene, this.cam); this.gl.setRenderTarget(prev); this.gl.autoClear = ac; this.cur ^= 1;
        this.draw.uniforms.tP.value = dst.textures[0]; this.draw.uniforms.tM.value = dst.textures[2]; this.draw.uniforms.uScale.value = scale;
    }
    dispose() { this.rt.forEach((t) => t.dispose()); this.sim?.dispose(); this.draw.dispose(); this.points.geometry.dispose(); }
}
