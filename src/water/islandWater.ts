// Island water materials (river strip, waterfall sheets + foam, lagoon/plunge pools). Moved verbatim from SouthSea.tsx.
import * as THREE from 'three';
import { CAUSTIC_TEX, CAUSTIC_GLSL, HERO_REFL } from '../caustics';
import { RIVERS, islandH, riverHW } from '../seaWorld';

export function fallsMat(speed: number, alpha: number, bright: number, dw = false) {
    return new THREE.ShaderMaterial({
        transparent: true, depthWrite: dw /* back sheet writes depth so the outline pass stops inking the cliff's contours through the falling water */, side: THREE.DoubleSide, uniforms: { uT: { value: 0 }, uDay: { value: 1 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `varying vec2 vUv; uniform float uT; uniform float uDay;
        float h(float x){ return fract(sin(x * 91.7) * 43758.5); }
        void main(){ float cols = 34.0; float col = floor(vUv.x * cols); float sp = (0.8 + h(col) * 0.7) * ${speed.toFixed(2)};
          float s = fract(vUv.y * (2.0 + h(col + 7.0) * 2.0) - uT * sp + h(col + 3.0));
          float streak = smoothstep(0.0, 0.18, s) * (1.0 - smoothstep(0.35, 1.0, s));
          float fine = 0.5 + 0.5 * sin(vUv.x * 210.0 + h(col) * 6.0);
          float edge = smoothstep(0.0, 0.2, vUv.x) * (1.0 - smoothstep(0.8, 1.0, vUv.x)) * smoothstep(0.0, 0.035, vUv.y);   // soft sides and a soft top lip
          float lip = 1.0 - smoothstep(0.0, 0.07, vUv.y), foam = smoothstep(0.78, 1.0, vUv.y);
          vec3 c = mix(vec3(0.42, 0.72, 0.82), vec3(0.97, 1.0, 1.0), clamp(streak * 0.75 * ${bright.toFixed(2)} + foam * 0.7 + lip * 0.5 + fine * 0.08, 0.0, 1.0)) * mix(0.32, 1.0, uDay);
          gl_FragColor = vec4(c, clamp((${alpha.toFixed(2)} + 0.45 * streak + 0.4 * foam + 0.3 * lip) * edge, 0.0, 1.0)); }`,
    });
}

export const FALLS_MATS = [fallsMat(0.55, 0.38, 0.6, true), fallsMat(0.85, 0.22, 0.9), fallsMat(1.25, 0.1, 1.2)];

export const FOAM_MAT = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uT: { value: 0 }, uDay: { value: 1 }, uCaus: { value: CAUSTIC_TEX } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    // Plunge-pool foam (ref: Ghost of Tsushima / RDR2 falls): a boiling white core, then lacy foam sheets carried outward by the
    // radial current - laced by the same caustic-cell network as the sea foam, irregular edge, no regular sine rings.
    fragmentShader: `varying vec2 vUv; uniform float uT; uniform float uDay; uniform sampler2D uCaus;
    void main(){ vec2 q = vUv - 0.5; float r = length(q) * 2.0, a0 = atan(q.y, q.x);
      float edge = 0.62 + 0.12 * sin(a0 * 3.0 + uT * 0.4) + 0.07 * sin(a0 * 7.0 - uT * 0.9);
      vec2 flow = q * (1.0 + fract(uT * 0.18) * 0.0); float t1 = fract(uT * 0.22), t2 = fract(uT * 0.22 + 0.5);
      vec2 dir = normalize(q + 1e-4);
      float l1 = texture2D(uCaus, q * 3.2 - dir * t1 * 0.9 + 0.13).r, l2 = texture2D(uCaus, q * 3.2 - dir * t2 * 0.9 + 0.57).r;
      float lace = mix(l1, l2, abs(t1 * 2.0 - 1.0)) + 0.6 * texture2D(uCaus, q * 7.7 + vec2(uT * 0.05, -uT * 0.07)).g;
      float core = 1.0 - smoothstep(0.0, 0.34, r);
      float sheet = (1.0 - smoothstep(edge - 0.25, edge, r)) * smoothstep(0.35, 0.95, lace + core * 0.8);
      float a = clamp(core * 0.9 + sheet * 0.85, 0.0, 1.0);
      gl_FragColor = vec4(vec3(0.96, 0.99, 1.0) * mix(0.35, 1.0, uDay), a); }`,
});

// water blend: the river and pools now write depth (fragments under 3% alpha are discarded), so the outline pass sees one flat water
// surface meeting the bank instead of inking the carved channel's depth steps through the water (the dark lines in Shifat's shots).
// A small polygon offset keeps the river just behind the pools and the sea where they overlap, so those draw over it with no z-fight.
export const RIVER_MAT = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,   /* writing depth made the outline pass ink a black line along the strip's soft edge (sand + river mouth); the bed below already has depth */ polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2, side: THREE.DoubleSide, uniforms: { uT: { value: 0 }, uDay: { value: 1 }, uSky: { value: new THREE.Color('#bcd3df') }, uCaus: { value: CAUSTIC_TEX } },
    vertexShader: `attribute float aSlope; attribute float aFade; attribute float aCalm; attribute vec4 aAcr; varying vec4 vAcr; varying float vCalm; varying float vFade; varying vec2 vUv; varying float vSl; varying vec3 vW; void main(){ vAcr = aAcr; vUv = uv; vSl = aSlope; vFade = aFade; vCalm = aCalm; vec4 w = modelMatrix * vec4(position, 1.0); w.y += 0.04 * sin(uv.y * 1.3 - 0.0) ; vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `${CAUSTIC_GLSL}
    varying vec4 vAcr; varying float vCalm; varying float vFade; varying vec2 vUv; varying float vSl; varying vec3 vW; uniform float uT; uniform float uDay; uniform vec3 uSky;
    float n2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(n2(i), n2(i + vec2(1, 0)), f.x), mix(n2(i + vec2(0, 1)), n2(i + vec2(1, 1)), f.x), f.y); }
    void main(){ float sp = 1.6 + vSl * 40.0; vec2 f = vec2(vUv.x * 4.0, vUv.y * 0.55 - uT * sp);
      float streak = vn(f * vec2(3.0, 1.0)) * 0.6 + vn(f * vec2(9.0, 2.5) + 3.1) * 0.4;
      float bank = 1.0 - smoothstep(0.0, 0.2, min(vUv.x, 1.0 - vUv.x));
      // flow foam (Sea of Thieves / RDR2 rivers): thin lacy threads stretched along the current, not round blobs - the shared caustic web,
      // scrolled downstream at the flow speed in two layers, gated by the slow streak noise so it gathers in lanes and thickens on steep runs and banks
      vec2 fu = vec2(vUv.x * 1.6, vUv.y * 0.22 - uT * sp * 0.4); float lace = texture2D(uCaus, fu).r * 0.65 + texture2D(uCaus, fu * vec2(2.1, 1.7) + vec2(0.37, -uT * sp * 0.25)).g * 0.45;
      float lane = smoothstep(0.35, 0.75, streak);
      float white = clamp(smoothstep(0.55, 0.95, lace * (0.55 + 0.6 * lane)) * (0.45 + vSl * 9.0) + bank * 0.5 * smoothstep(0.5, 0.9, lace), 0.0, 1.0) * 0.85;
      vec3 V = normalize(cameraPosition - vW); float fr = 0.03 + 0.97 * pow(1.0 - max(V.y, 0.0), 5.0);
      vec3 body = mix(vec3(0.05, 0.42, 0.45), vec3(0.18, 0.66, 0.62), 0.5 + 0.5 * streak);
      { // Shifat 2:07 AM "transparency & refraction law": bend the view ray by Snell (1.333), march it across the channel's real depth profile
        // (centre depth baked per section, parabolic banks), Beer-Lambert over the path; the bed stays put while the streaks flow over it
        vec2 gq = vec2(vn(f * 2.0) - 0.5, vn(f * 2.0 + 7.3) - 0.5) * 0.12; vec3 nn = normalize(vec3(gq.x, 1.0, gq.y));
        vec3 td = refract(-V, nn, 1.0 / 1.333); float sy = max(-td.y, 0.12), u0 = vUv.x * 2.0 - 1.0, hw = max(vAcr.z, 0.5);
        float dU = dot(td.xz, vAcr.xy) / sy / hw; float u = u0, dep = vAcr.w * max(1.0 - u * u, 0.0);
        u = u0 + dU * dep; dep = vAcr.w * max(1.0 - u * u, 0.0); u = u0 + dU * dep; dep = vAcr.w * max(1.0 - u * u, 0.0);
        float t1 = dep / sy; vec2 hx = vW.xz + td.xz * t1;
        float peb = vn(hx * 2.3) * 0.6 + vn(hx * 6.1 + 2.0) * 0.4;
        vec3 alb = mix(vec3(0.62, 0.60, 0.48), vec3(0.93, 0.87, 0.70), smoothstep(3.0, 0.3, dep)) * (0.78 + 0.3 * peb);
        vec3 cs = causRGB(hx, uT * 1.8) * 1.9 * exp(-dep * 0.2) * uDay * (1.0 - smoothstep(20.0, 60.0, length(cameraPosition - vW)));   // faster drift: moving water
        vec3 Tb = exp(-vec3(0.17, 0.040, 0.026) * (t1 + dep * 0.6));   /* same water as the sea it runs into */
        vec3 seen = alb * (0.82 + cs) * Tb + vec3(0.06, 0.52, 0.58) * (1.0 - Tb);
        float sea = max(vCalm, 1.0 - smoothstep(-0.6, 1.2, vW.y));   /* reach that lies on the sea */
        body = mix(body, seen, 0.95 * (1.0 - sea));   /* toward the mouth the sea's own refraction takes over (no colour seam) */
      }
      white *= 1.0 - 0.95 * vCalm; body = mix(body, vec3(0.16, 0.62, 0.66), vCalm);   /* mouth: foam dies down and the colour turns to the shallow sea's, so river and ocean read as one surface */
      vec3 c = mix(mix(body, uSky, fr * 0.6), vec3(0.95, 0.99, 1.0), white) * mix(0.3, 1.0, uDay);
      float soft = smoothstep(0.0, 0.24, min(vUv.x, 1.0 - vUv.x));   // soft banks, no hard edge on the sand
      float sea2 = max(vCalm, 1.0 - smoothstep(-0.6, 1.2, vW.y)); float a = (mix(0.93, 0.0, smoothstep(0.0, 0.85, sea2)) + 0.5 * white) * soft * vFade;   /* Shifat 2:34 AM seam: the mouth fades to clear so only the flowing foam remains over the sea */ if (a < 0.03) discard;   /* traced bed drawn here, so the strip is near-opaque */
      gl_FragColor = vec4(c, a); }`,
});

// Lagoon + plunge pool water (Shifat's screenshot: the lake material read as a flat grey slab). Own shallow-water look: white-sand
// turquoise at the edge deepening to teal in the middle, soft transparent rim (no hard edge on the sand), ripples, sky fresnel, night-dim.
export function poolWaterMat(p: { cx: number; cz: number; r: number; rim: number; y: number }) {
    // water blend: where a river leaves or enters, the rim neither fades nor foams, so the pool flows straight into the river
    const outs: THREE.Vector3[] = [];
    for (const r of RIVERS) for (const e of [r.pts[0], r.pts[r.pts.length - 1]]) if (Math.hypot(e[0] - p.cx, e[1] - p.cz) < p.r * 1.3) outs.push(new THREE.Vector3(e[0], e[1], riverHW(r, e === r.pts[0] ? 0 : 1) * 1.38));
    while (outs.length < 3) outs.push(new THREE.Vector3(1e5, 1e5, 1));
    // Shifat 2:07 AM Oct 30 "water transparency & refraction law": a 64x64 bed map of the carved pool floor, so the shader can bend each view ray by
    // Snell's law (1.333), trace it to the real floor and absorb it by its true path length (3 fetches, no scene copy).
    const BN = 64, bh = p.r * 1.08, bd = new Uint8Array(BN * BN * 4);
    for (let j = 0; j < BN; j++) for (let i = 0; i < BN; i++) { const x = p.cx - bh + (i + 0.5) / BN * 2 * bh, z = p.cz - bh + (j + 0.5) / BN * 2 * bh, y = islandH(x, z) ?? (p.y - 6), dd = Math.max(0, Math.min(1, (p.y + 1 - y) / 12)), o = (j * BN + i) * 4; bd[o] = Math.round(dd * 255); bd[o + 1] = Math.round((0.5 + 0.5 * Math.sin(x * 0.9 + z * 0.6) * Math.sin(x * 0.37 - z * 0.71)) * 255); bd[o + 2] = 0; bd[o + 3] = 255; }
    const bedTex = new THREE.DataTexture(bd, BN, BN, THREE.RGBAFormat); bedTex.magFilter = bedTex.minFilter = THREE.LinearFilter; bedTex.wrapS = bedTex.wrapT = THREE.ClampToEdgeWrapping; bedTex.needsUpdate = true;
    return new THREE.ShaderMaterial({
        transparent: true, depthWrite: false /* the outline pass inked a dark arc where the pool surface met other water in depth */, side: THREE.DoubleSide,
        uniforms: { uT: { value: 0 }, uDay: { value: 1 }, uSky: { value: new THREE.Color('#bcd3df') }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uC: { value: new THREE.Vector2(p.cx, p.cz) }, uR: { value: p.r * p.rim }, uOut: { value: outs.slice(0, 3) }, uBed: { value: bedTex }, uCaus: { value: CAUSTIC_TEX }, uBB: { value: new THREE.Vector4(p.cx, p.cz, bh, p.y) }, uHeroA: { value: HERO_REFL.shadow }, uHeroB: { value: HERO_REFL.ghost }, uHeroDA: { value: HERO_REFL.shadowDir } },
        vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `varying vec3 vW; uniform float uT, uDay, uR; uniform vec3 uSky, uSun; uniform vec2 uC; uniform vec3 uOut[3]; uniform sampler2D uBed; uniform vec4 uBB; uniform vec4 uHeroA, uHeroB, uHeroDA;
        ${CAUSTIC_GLSL}
        float capHitP(vec3 ro, vec3 rd, vec3 pa, vec3 pb, float ra){ vec3 ba = pb - pa, oa = ro - pa; float baba = dot(ba, ba), bard = dot(ba, rd), baoa = dot(ba, oa), rdoa = dot(rd, oa), oaoa = dot(oa, oa);
          float a = baba - bard * bard, b = baba * rdoa - baoa * bard, c = baba * oaoa - baoa * baoa - ra * ra * baba, h = b * b - a * c; if (h < 0.0 || baba < 1e-4) return -1.0;
          float t = (-b - sqrt(h)) / a, y = baoa + t * bard; if (y > 0.0 && y < baba) return t;
          vec3 oc = y <= 0.0 ? oa : ro - pb; b = dot(rd, oc); c = dot(oc, oc) - ra * ra; h = b * b - c; return h > 0.0 ? -b - sqrt(h) : -1.0; }
        /* Shadow swimming lies flat along his facing (same as the sea); otherwise upright */
        float heroA(vec3 ro, vec3 rd, float y0, float y1){ if (uHeroDA.w > 0.5) { vec3 c = vec3(uHeroA.x, uHeroA.y - 0.05, uHeroA.z), d = vec3(uHeroDA.x, 0.0, uHeroDA.z) * 0.8; return capHitP(ro, rd, c - d, c + d, 0.24); }
          return capHitP(ro, rd, vec3(uHeroA.x, y0, uHeroA.z), vec3(uHeroA.x, y1, uHeroA.z), 0.34); }
        float bedD(vec2 xz){ return texture2D(uBed, (xz - uBB.xy) / (2.0 * uBB.z) + 0.5).r * 12.0 - 1.0; }   // depth of the floor below the surface
        void main(){ float rr = length(vW.xz - uC) / uR; if (rr > 1.0) discard;
          float og = 0.0; for (int i = 0; i < 3; i++) og = max(og, 1.0 - smoothstep(uOut[i].z * 0.5, uOut[i].z * 1.3, length(vW.xz - uOut[i].xy)));
          vec2 q = vW.xz; vec2 g = vec2(cos(q.x * 1.7 + uT * 1.3) * 0.5 + cos(q.x * 0.9 - q.y * 1.3 + uT * 0.9) * 0.4, cos(q.y * 1.9 - uT * 1.1) * 0.5 + cos(q.y * 0.7 + q.x * 1.1 + uT * 0.8) * 0.4) * 0.06;
          vec3 n = normalize(vec3(-g.x, 1.0, -g.y)); vec3 v = normalize(cameraPosition - vW); bool below = !gl_FrontFacing;
          float fr = 0.03 + 0.97 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
          float deep = smoothstep(1.0, 0.35, rr);
          vec3 body = mix(mix(vec3(0.52, 0.9, 0.84), vec3(0.04, 0.46, 0.52), deep), vec3(0.1, 0.53, 0.53), og * 0.7);   // matches the river body at an outlet
          float caus = dot(causRGB(q * 0.5, uT * 0.8), vec3(0.333)) * (1.0 - deep) * 0.6 * uDay;
          float traced = 0.0;
          if (!below) {
            // Snell refraction (air 1.0 -> water 1.333), fixed-point march to the carved floor, Beer-Lambert over the real path (red dies first)
            vec3 td = refract(-v, n, 1.0 / 1.333); float sy = max(-td.y, 0.1);
            float t1 = max(bedD(vW.xz), 0.0) / sy; t1 = max(bedD(vW.xz + td.xz * t1), 0.0) / sy; t1 = max(bedD(vW.xz + td.xz * t1), 0.0) / sy;
            vec2 hx = vW.xz + td.xz * t1; vec4 bs = texture2D(uBed, (hx - uBB.xy) / (2.0 * uBB.z) + 0.5); float dep = max(bs.r * 12.0 - 1.0, 0.0);
            vec3 alb = mix(vec3(0.55, 0.52, 0.40), vec3(0.92, 0.86, 0.70), smoothstep(5.5, 0.5, dep)) * (0.85 + 0.15 * bs.g);
            vec3 cs = causRGB(hx * 0.5, uT * 0.8) * 2.6 * exp(-dep * 0.10)   /* identical to the sea (scale, speed, gain, depth fade) */ * uDay * (1.0 - smoothstep(20.0, 70.0, length(cameraPosition - vW)));
            vec3 Tb = exp(-vec3(0.24, 0.055, 0.040) * (t1 + dep * 0.6));
            vec3 scat = mix(vec3(0.10, 0.55, 0.56), vec3(0.03, 0.36, 0.44), smoothstep(1.0, 7.0, dep));
            vec3 seen = alb * (0.74 + cs * 0.55 / (1.0 + cs * 0.55)) * Tb + scat * (1.0 - Tb);   /* soft-compressed: bright shallow sand no longer blows out into white blotches */
            traced = 1.0 - og * 0.6; body = mix(body, seen, traced); caus *= 1.0 - traced;
          }
          // Shifat 5:12 AM hero rule in the island pools: below the surface refracts and shows through, above it reflects (flying = reflection only)
          float see = 0.0; vec3 r = reflect(-v, n); float hk = 0.0; vec3 hc = vec3(0.0); float wy = uBB.w;
          if (!below) {
            vec3 tdh = refract(-v, n, 1.0 / 1.333);
            float rA = uHeroA.w > 0.5 && uHeroA.y + 0.25 < wy && length(uHeroA.xz - vW.xz) < 25.0 ? heroA(vW, tdh, uHeroA.y + 0.25, min(uHeroA.y + 1.55, wy)) : -1.0;
            float rB = uHeroB.w > 0.5 && uHeroB.y + 0.25 < wy && length(uHeroB.xz - vW.xz) < 25.0 ? capHitP(vW, tdh, uHeroB.xyz + vec3(0.0, 0.25, 0.0), vec3(uHeroB.x, min(uHeroB.y + 1.5, wy), uHeroB.z), 0.3) : -1.0;
            float rt = rA > 0.0 && (rB < 0.0 || rA < rB) ? rA : rB; if (rt > 0.0 && rt < 12.0) see = exp(-rt * 0.15);
            float qA = uHeroA.w > 0.5 && uHeroA.y + 1.55 > wy && length(uHeroA.xz - vW.xz) < 25.0 ? heroA(vW, r, max(uHeroA.y + 0.25, wy), uHeroA.y + 1.55) : -1.0;
            float qB = uHeroB.w > 0.5 && uHeroB.y + 1.5 > wy && length(uHeroB.xz - vW.xz) < 25.0 ? capHitP(vW, r, vec3(uHeroB.x, max(uHeroB.y + 0.25, wy), uHeroB.z), uHeroB.xyz + vec3(0.0, 1.5, 0.0), 0.3) : -1.0;
            if (qA > 0.0 && (qB < 0.0 || qA < qB)) { hk = 1.0; hc = vec3(0.09, 0.11, 0.21); } else if (qB > 0.0) { hk = 1.0; hc = vec3(0.78, 0.82, 0.92); }
          }
          float sp = pow(max(dot(r, uSun), 0.0), 120.0) * 1.4 * uDay * (1.0 - hk);
          vec3 col = mix(body + caus, mix(uSky, hc * mix(0.35, 1.0, uDay), hk * 0.7), below ? 0.1 : max(fr * 0.75, hk * 0.4)) + sp;
          float lz = texture2D(uCaus, q * 0.21 + vec2(uT * 0.012, -uT * 0.02)).r + 0.6 * texture2D(uCaus, q * 0.53 - uT * 0.03).g;   /* lacy swash, same language as the island shore */
          float ph = fract(uT * 0.16 + 0.4 * sin(atan(vW.z - uC.y, vW.x - uC.x) * 3.0) + 0.15 * lz), run = smoothstep(0.0, 0.15, ph) * (1.0 - smoothstep(0.15, 0.9, ph));
          float edgeFoam = smoothstep(0.84 - 0.06 * run, 0.97, rr) * smoothstep(0.45, 0.9, lz * (0.55 + run) + 0.25 * smoothstep(0.95, 0.99, rr)) * 0.75 * (1.0 - og);
          col = mix(col, vec3(0.97, 1.0, 1.0), edgeFoam) * mix(0.28, 1.0, uDay);
          float a = mix(0.42, 0.9, deep) * mix(1.0 - smoothstep(0.9, 1.0, rr), 1.0, og * 0.6) + fr * 0.2 * (1.0 - smoothstep(0.92, 1.0, rr));
          a = mix(a, 0.97 * (1.0 - smoothstep(0.93, 1.0, rr)) + fr * 0.03, traced * (1.0 - og * 0.5));   /* traced floor drawn here; only the rim fades to the real bank */
          a = min(a, mix(1.0, 0.6, see));   /* the submerged body shows through, mild */
          a = clamp(below ? 0.7 : a, 0.0, 1.0); if (a < 0.03) discard;
          gl_FragColor = vec4(col, a); }`,
    });
}
