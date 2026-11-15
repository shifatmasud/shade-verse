import * as THREE from 'three';

/* Shifat Nov 15 2026 'a fake ring ripple is visible when floating instead of actual wave displacement ring ripple, and when swimming it should turn
   into a wave wake trail instead of ring ripples. Wave impact should be particle based realistic.'
   Interactive water: a small GPU height-field (2D wave equation) that follows the hero. Bodies in the water (the floating / swimming hero) push the
   surface down by their submerged footprint; only the CHANGE of that footprint is written each step, so a still body leaves calm water, a treading
   body sends out real rings, and a moving body leaves a V wake behind it (a moving disturbance faster than the ripple speed: Mach-cone wake, the
   same reason a boat leaves one). Impacts (entries, hits, landing spray) dig a crater that rebounds into a ring train.
   Every water shader (sea, island water, park lake) reads the same texture: vertex height where its grid can carry it, per-pixel slope for the
   lighting (reflection / refraction / Fresnel bend on real waves, not a decal), and a faint churn foam where the water is broken.
   Cost: one 192x192 half-float pass per 60 Hz step (~37k pixels), only while something is disturbing the water (idle = zero passes). */

export const IX_RES = 192, IX_SIZE = 38.4, IX_TEXEL = IX_SIZE / IX_RES;   // 0.2 m texels over 38 m round the hero
const STEP = 1 / 60, MAX_STEPS = 4, IMP_SLOTS = 16, BODY_SLOTS = 4;
const RIPPLE_SPEED = 1.2;   // m/s: deep-water ripples of ~0.5-1 m wavelength travel at ~0.9-1.25 m/s (a swimmer at 2-5 m/s outruns them -> V wake)
const C2 = Math.pow(RIPPLE_SPEED * STEP / IX_TEXEL, 2), DAMP = 0.993, FOAM_DECAY = 0.982, IDLE_AFTER = 7;

/** Shared uniforms: spread into every water material (same objects, so one update reaches them all). */
/** Shifat 4:38 PM 'Wake trail & ring ripples waves must be visible in normals of water surface. Now not visible.' Real 1-3 cm ripples are
 *  drowned by the FFT chop + gust roughness in the lighting, so the height-field's slope is lit at this gain (geometry keeps the true height). */
export const IX_NORMAL_GAIN = 3.2;
export const IX_UNIFORMS = { uIxTex: { value: null as THREE.Texture | null }, uIxB: { value: new THREE.Vector4(0, 0, IX_SIZE, IX_TEXEL) }, uIxOn: { value: 0 }, uIxGain: { value: IX_NORMAL_GAIN } };

/** GLSL (vertex + fragment): ixHeight (m), ixSlope (gradient dh/dx, dh/dz like wg/fftSlope), ixFoam (0..1). All exactly 0 outside the sim square. */
export const IX_GLSL = `
uniform sampler2D uIxTex; uniform vec4 uIxB; uniform float uIxOn, uIxGain;
vec2 ixUV(vec2 xz){ return (xz - uIxB.xy) / uIxB.z; }
float ixEdge(vec2 uv){ vec2 q = min(uv, 1.0 - uv); return uIxOn * smoothstep(0.0, 0.06, min(q.x, q.y)); }
float ixHeight(vec2 xz){ vec2 uv = ixUV(xz); float m = ixEdge(uv); return m > 0.0 ? texture2D(uIxTex, uv).r * m : 0.0; }
vec2 ixSlope(vec2 xz){ vec2 uv = ixUV(xz); float m = ixEdge(uv); if (m <= 0.0) return vec2(0.0); float e = uIxB.w / uIxB.z;
  float hx = texture2D(uIxTex, uv + vec2(e, 0.0)).r - texture2D(uIxTex, uv - vec2(e, 0.0)).r, hz = texture2D(uIxTex, uv + vec2(0.0, e)).r - texture2D(uIxTex, uv - vec2(0.0, e)).r;
  return vec2(hx, hz) * (m * uIxGain / (2.0 * uIxB.w)); }
float ixFoam(vec2 xz){ vec2 uv = ixUV(xz); float m = ixEdge(uv); return m > 0.0 ? texture2D(uIxTex, uv).b * m : 0.0; }
`;

const STEP_FS = `precision highp float;
uniform sampler2D uPrev; uniform vec2 uShift; uniform float uC2, uDamp, uFoamK, uRes, uTexel;
uniform vec4 uImp[${IMP_SLOTS}]; uniform vec4 uBody[${BODY_SLOTS}]; uniform vec4 uBodyP[${BODY_SLOTS}]; uniform vec4 uBodyF[${BODY_SLOTS}];
varying vec2 vUv;
vec3 S(vec2 uv){ uv += uShift; if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec3(0.0); return texture2D(uPrev, uv).rgb; }
float G(vec2 d, float r){ return exp(-dot(d, d) / (r * r)); }
void main(){
  float e = 1.0 / uRes; vec3 c = S(vUv);
  float hxp = S(vUv + vec2(e, 0.0)).r, hxm = S(vUv - vec2(e, 0.0)).r, hzp = S(vUv + vec2(0.0, e)).r, hzm = S(vUv - vec2(0.0, e)).r;
  float dg = S(vUv + vec2(e, e)).r + S(vUv - vec2(e, e)).r + S(vUv + vec2(e, -e)).r + S(vUv + vec2(-e, e)).r;
  float lap = (4.0 * (hxp + hxm + hzp + hzm) + dg - 20.0 * c.r) / 6.0;   /* 9-point Laplacian: rings stay round, not diamond-shaped */
  float h = c.r + (c.r - c.g) * uDamp + uC2 * lap, p = c.r;
  float foam = c.b * uFoamK;
  for (int i = 0; i < ${BODY_SLOTS}; i++) {   /* bodies: write only the change of the submerged footprint (pure displacement: h and prev move together) */
    vec4 B = uBody[i], P = uBodyP[i]; if (B.z <= 0.0) continue;
    float db = B.w * G(vUv - B.xy, B.z) - P.w * G(vUv - P.xy, P.z); h -= db; p -= db;
    foam = max(foam, uBodyF[i].x * G((vUv - B.xy) * vec2(1.0), B.z * 1.5) * (0.6 + 0.4 * uBodyF[i].y));
  }
  for (int i = 0; i < ${IMP_SLOTS}; i++) {   /* impacts: crater (negative) or rebound jet (positive), also pure displacement */
    vec4 I = uImp[i]; if (I.z <= 0.0) continue; float k = I.w * G(vUv - I.xy, I.z); h += k; p += k; foam = max(foam, min(1.0, abs(k) * 7.0));
  }
  float sl = length(vec2(hxp - hxm, hzp - hzm)) / (2.0 * uTexel);   /* steep, broken water (bow wave, crater rim) churns white */
  foam = max(foam, smoothstep(0.22, 0.6, sl) * 0.7);
  float sb = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)), k = smoothstep(0.0, 0.08, sb);   /* sponge border: waves die before the edge, nothing reflects back */
  gl_FragColor = vec4(h * k, p * k, clamp(foam, 0.0, 1.0) * k, 1.0);
}`;

type Imp = { x: number; z: number; r: number; a: number; at: number };
const imps: Imp[] = [];
const bodies = Array.from({ length: BODY_SLOTS }, () => ({ on: false, x: 0, z: 0, r: 0.45, d: 0, foam: 0, px: 0, pz: 0, pr: 0.45, pd: 0, had: false }));
let lastActive = -1e9, now = 0;

/** Dig an impact into the water at world (x, z): amount in metres (negative = crater, positive = jet), radius in metres, optional delay (s). */
export function ixImpulse(x: number, z: number, amount: number, radius: number, delay = 0) {
    if (imps.length > 96) return;
    imps.push({ x, z, r: Math.max(radius, IX_TEXEL * 1.1), a: amount, at: now + delay });
}
/** A body floating in the water this frame (slot 0 = hero). depth = how far it presses the surface down (m), foam = churn 0..1. off -> slot cleared. */
export function ixBody(slot: number, on: boolean, x = 0, z = 0, depth = 0, radius = 0.45, foam = 0) {
    const b = bodies[slot]; if (!b) return;
    if (!on) { if (b.on) { b.on = false; b.had = false; } return; }
    b.on = true; b.x = x; b.z = z; b.d = depth; b.r = radius; b.foam = foam;
}

export class WaterInteraction {
    private rt: THREE.WebGLRenderTarget[]; private cur = 0; private scene = new THREE.Scene(); private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    private mat: THREE.ShaderMaterial; private acc = 0; private cx = 0; private cz = 0; private placed = false; private live = false; readonly ok: boolean;
    constructor(private gl: THREE.WebGLRenderer) {
        const ext = gl.extensions;
        this.ok = !!(gl.capabilities.isWebGL2 && (ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float')));
        const mk = () => new THREE.WebGLRenderTarget(IX_RES, IX_RES, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
        this.rt = [mk(), mk()];
        const v4 = (n: number) => Array.from({ length: n }, () => new THREE.Vector4());
        this.mat = new THREE.ShaderMaterial({
            uniforms: { uPrev: { value: null }, uShift: { value: new THREE.Vector2() }, uC2: { value: C2 }, uDamp: { value: DAMP }, uFoamK: { value: FOAM_DECAY }, uRes: { value: IX_RES }, uTexel: { value: IX_TEXEL },
                uImp: { value: v4(IMP_SLOTS) }, uBody: { value: v4(BODY_SLOTS) }, uBodyP: { value: v4(BODY_SLOTS) }, uBodyF: { value: v4(BODY_SLOTS) } },
            vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: STEP_FS,
            depthTest: false, depthWrite: false, toneMapped: false,
        });
        const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat); q.frustumCulled = false; this.scene.add(q);
    }
    private clear() { const prev = this.gl.getRenderTarget(), cc = this.gl.getClearColor(new THREE.Color()), ca = this.gl.getClearAlpha();
        this.gl.setClearColor(0x000000, 0); for (const t of this.rt) { this.gl.setRenderTarget(t); this.gl.clear(true, false, false); } this.gl.setRenderTarget(prev); this.gl.setClearColor(cc, ca); }
    /** Step the sim (fixed 60 Hz) centred on (fx, fz). t = game time (s). */
    update(dt: number, t: number, fx: number, fz: number) {
        now = t;
        const busy = bodies.some((b) => b.on) || imps.length > 0;
        if (busy) lastActive = t;
        if (!this.ok || t - lastActive > IDLE_AFTER) { if (this.live) { this.live = false; IX_UNIFORMS.uIxOn.value = 0; } this.acc = 0; return; }
        if (!this.live) { this.clear(); this.live = true; this.placed = false; for (const b of bodies) b.had = false; }
        const half = IX_SIZE / 2;
        const nx = Math.round((fx - half) / IX_TEXEL) * IX_TEXEL, nz = Math.round((fz - half) / IX_TEXEL) * IX_TEXEL;
        if (!this.placed) { this.cx = nx; this.cz = nz; this.placed = true; }
        this.acc = Math.min(this.acc + Math.max(0, dt), STEP * MAX_STEPS);
        const u = this.mat.uniforms, prevRT = this.gl.getRenderTarget(), ac = this.gl.autoClear; this.gl.autoClear = false;
        while (this.acc >= STEP) {
            this.acc -= STEP;
            // recentre by whole texels: the step samples the old field shifted so the water stays put in the world
            const sx = (nx - this.cx) / IX_SIZE, sz = (nz - this.cz) / IX_SIZE; (u.uShift.value as THREE.Vector2).set(sx, sz); this.cx = nx; this.cz = nz;
            const toU = (x: number) => (x - this.cx) / IX_SIZE, toV = (z: number) => (z - this.cz) / IX_SIZE;
            for (let i = 0; i < BODY_SLOTS; i++) {
                const b = bodies[i], B = u.uBody.value[i] as THREE.Vector4, P = u.uBodyP.value[i] as THREE.Vector4, Fo = u.uBodyF.value[i] as THREE.Vector4;
                if (!b.on) { B.set(0, 0, 0, 0); P.set(0, 0, 0, 0); Fo.set(0, 0, 0, 0); continue; }
                if (!b.had) { b.px = b.x; b.pz = b.z; b.pr = b.r; b.pd = 0; b.had = true; }   /* first contact: the whole footprint is new = it lands as an impact */
                B.set(toU(b.x), toV(b.z), b.r / IX_SIZE, b.d); P.set(toU(b.px), toV(b.pz), b.pr / IX_SIZE, b.pd); Fo.set(b.foam, Math.random(), 0, 0);
                b.px = b.x; b.pz = b.z; b.pr = b.r; b.pd = b.d;
            }
            let k = 0;
            for (let i = 0; i < imps.length && k < IMP_SLOTS; i++) { const m = imps[i]; if (m.at > t) continue; (u.uImp.value[k++] as THREE.Vector4).set(toU(m.x), toV(m.z), m.r / IX_SIZE, m.a); imps.splice(i--, 1); }
            for (; k < IMP_SLOTS; k++) (u.uImp.value[k] as THREE.Vector4).set(0, 0, 0, 0);
            u.uPrev.value = this.rt[this.cur].texture; this.cur ^= 1;
            this.gl.setRenderTarget(this.rt[this.cur]); this.gl.render(this.scene, this.cam);
        }
        this.gl.setRenderTarget(prevRT); this.gl.autoClear = ac;
        IX_UNIFORMS.uIxTex.value = this.rt[this.cur].texture; IX_UNIFORMS.uIxB.value.set(this.cx, this.cz, IX_SIZE, IX_TEXEL); IX_UNIFORMS.uIxOn.value = 1;
    }
    dispose() { this.rt.forEach((t) => t.dispose()); this.mat.dispose(); }
}
