// Sea surface shader for the ocean + lakes (waterMat in Scene.tsx).
// WAVES is the shared GLSL wave field (height wh / gradient wg), generated in ./waves.ts from the same table as the
// CPU waveH() in Scene.tsx (swimming + boats), so the two cannot drift apart.
import { QUALITY, LOWQ } from '../quality';
import { CAUSTIC_GLSL } from '../caustics';
import { WAVES_GLSL } from './waves';

/** Shared GLSL wave field, generated from the single wave table in ./waves.ts (also drives the CPU waveH). */
export const WAVES = WAVES_GLSL;

/** Ocean vertex shader: camera-following warped grid displaced by the wave field. */
export const OCEAN_VERT = WAVES + `uniform float uTime; uniform vec4 uHeroA, uHeroB; varying vec3 vW; varying vec3 vView; varying vec4 vScreen; varying vec3 vHw; void main(){ vHw = vec3(wh(uHeroA.xz, uTime), wh(uHeroB.xz, uTime), wh(cameraPosition.xz, uTime));   /* the wave height at each hero is the same for every pixel: evaluated per vertex (~30k) instead of per pixel (~1M on phone) */ vec3 p = position; vec4 w = modelMatrix * vec4(p, 1.0); w.z = min(w.z, -222.0); float h = wh(w.xz, uTime); w.y += h; vW = w.xyz; vec4 vv = viewMatrix * w; vView = vv.xyz; gl_Position = projectionMatrix * vv; vScreen = gl_Position; }`.replace('vec3 p = position; vec4 w = modelMatrix * vec4(p, 1.0);', 'vec4 w = modelMatrix * vec4(position, 1.0);');

/** Ocean fragment shader: refraction + Beer-Lambert, mirror/SSR reflection, caustics, foam, glitter, haze, Snell window. */
export const OCEAN_FRAG = '#include <packing>\n#define WG_CHOP gChop\nbool gChop = true;\n' + WAVES + `uniform float uDay; uniform float uTime; uniform vec3 uSun, uSky, uDeep, uShallow, uUWF; varying vec3 vW; varying vec3 vView; varying vec4 vScreen; varying vec3 vHw;
    ${CAUSTIC_GLSL}
    uniform sampler2D uNrm; uniform float uDet2; uniform sampler2D tRefl; uniform mat4 uRefMat; uniform float uUseRefl; uniform vec2 uReflSoft; uniform vec2 uSceneTx; uniform float uFogK;
    #define WATER_LVL -1.0
    ${(QUALITY.coarse || LOWQ) ? '#define PHONE_W' : ''}
    uniform vec4 uBoat[5]; uniform vec4 uHeroA, uHeroB, uHeroDA;
    // Shifat 3:10 AM "analytic raytrace heroes for reflection": exact ray/capsule intersection of each reflected view ray with the heroes' bodies
    float capHit(vec3 ro, vec3 rd, vec3 pa, vec3 pb, float ra){ vec3 ba = pb - pa, oa = ro - pa; float baba = dot(ba, ba), bard = dot(ba, rd), baoa = dot(ba, oa), rdoa = dot(rd, oa), oaoa = dot(oa, oa);
      float a = baba - bard * bard, b = baba * rdoa - baoa * bard, c = baba * oaoa - baoa * baoa - ra * ra * baba, h = b * b - a * c; if (h < 0.0) return -1.0;
      float t = (-b - sqrt(h)) / a, y = baoa + t * bard; if (y > 0.0 && y < baba) return t; vec3 oc = (y <= 0.0) ? oa : ro - pb; b = dot(rd, oc); c = dot(oc, oc) - ra * ra; h = b * b - c; return h > 0.0 ? -b - sqrt(h) : -1.0; }
       // swimming: the body lies flat along the facing direction, so the trace uses a horizontal capsule (no tall upright 'pill' under the swimmer)
       float capH(vec3 ro, vec3 rd, vec3 pa, vec3 pb, float ra, vec4 D){ if (D.w > 0.5) { vec3 c = vec3(uHeroA.x, uHeroA.y - 0.05, uHeroA.z), d = vec3(D.x, 0.0, D.z) * 0.8; return capHit(ro, rd, c - d, c + d, ra * 0.7); } return capHit(ro, rd, pa, pb, ra); }
    uniform sampler2D tScene; uniform sampler2D tDepth; uniform sampler2D uBed; uniform vec3 uBedC; uniform float uUseScene, uSteps, uNear, uFar; uniform mat4 uProj;
    vec2 bedUV(vec2 xz){ return (xz - uBedC.xy) / (2.0 * uBedC.z) + 0.5; }
    // open-sea bed = the sim's seabedAt profile (shelf -> slope -> trench + dunes); the baked island map blends into it at its edges (no square seam)
    float seaBed(vec2 xz){ float d = -222.0 - xz.y; float y = -10.0 - 16.0 * smoothstep(110.0, 300.0, d) - 24.0 * smoothstep(420.0, 600.0, d) + 22.0 * smoothstep(760.0, 930.0, d);
      return y + (sin(xz.x * 0.0173 + sin(xz.y * 0.0091) * 2.3) * sin(xz.y * 0.0137 + sin(xz.x * 0.0071) * 1.9)) * 1.6 * smoothstep(30.0, 200.0, d); }   /* warped, incommensurate: no repeating dune blotches */
    float bedEdge(vec2 xz){ vec2 q = bedUV(xz); return smoothstep(0.0, 0.12, min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y))); }
    float bedY(vec2 xz){ float e = bedEdge(xz); return mix(seaBed(xz), texture2D(uBed, bedUV(xz)).r * 40.0 - 30.0, e); }
    float oceanZ(vec2 uv){ return perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }
    vec3 sceneCol(vec2 uv){
    #ifdef PHONE_W
      return linearToOutputTexel(vec4(texture2D(tScene, uv).rgb, 1.0)).rgb;
    #endif
      vec2 o = uSceneTx * 0.7; vec3 c = texture2D(tScene, uv + vec2(o.x, o.y * 0.35)).rgb + texture2D(tScene, uv - vec2(o.x, o.y * 0.35)).rgb + texture2D(tScene, uv + vec2(-o.x * 0.35, o.y)).rgb + texture2D(tScene, uv - vec2(-o.x * 0.35, o.y)).rgb; return linearToOutputTexel(vec4(c * 0.25, 1.0)).rgb; }   /* rotated-grid 4-tap: the low-res scene copy no longer shows fish/whales/boats under the water as pixel blocks */
    void main(){
      
      #ifdef PHONE_W
      gChop = length(cameraPosition - vW) < 90.0;   /* phone: past 90 m the 3-12 m chop is sub-pixel (only shimmer), so its 5 wave trains are skipped */
      #else
      gChop = length(cameraPosition - vW) < 160.0;   /* desktop (Shifat 10:19 'help desktop too'): same skip, further out */
      #endif
      vec2 gW = wg(vW.xz, uTime); gChop = true; vec2 g = gW + vec2(sin(vW.x * 0.9 + uTime * 3.0), cos(vW.z * 0.8 + uTime * 2.4)) * 0.02;
      g += vec2(cos(dot(vW.xz, vec2(0.7, 0.4)) + uTime * 2.1), cos(dot(vW.xz, vec2(-0.35, 0.8)) - uTime * 1.7)) * 0.035 + vec2(cos(dot(vW.xz, vec2(1.7, -1.1)) + uTime * 3.3), cos(dot(vW.xz, vec2(-1.3, 1.6)) - uTime * 2.7))* 0.018;
      g = mix(g, gW, smoothstep(15.0, 70.0, length(cameraPosition.xz - vW.xz)));
      // AAA-style micro detail (Sea of Thieves / Uncharted use scrolling normal maps over the big waves): two layers of a tileable ripple normal
      // map drifting in different directions; mipmaps + a distance fade stop far-field shimmer. Above the surface only.
      float wDist = length(cameraPosition - vW);
      if (gl_FrontFacing) { vec2 wq = vW.xz + 9.0 * vec2(sin(vW.z * 0.013 + uTime * 0.02), cos(vW.x * 0.011 - uTime * 0.017));   /* slow domain warp: the ripple tile never lines up into a grid */
        // texture bombing (Quilez 'texture no-tile' v3): a low-frequency variation value picks which randomly offset copy of the ripple map each patch
        // uses and blends neighbours, so the 22 m tile never shows as a repeat
        float kk = texture2D(uCaus, wq * 0.0031 + 0.37).r * 0.6 + 0.4 * (0.5 + 0.5 * sin(wq.x * 0.0071 + sin(wq.y * 0.0053) * 2.0));
        float lv = kk * 8.0, fv = fract(lv), ia = floor(lv); vec2 uv1 = wq * 0.045 + vec2(0.011, 0.006) * uTime;
        vec2 ca = texture2D(uNrm, uv1 + sin(vec2(3.0, 7.0) * ia)).rg, cb = texture2D(uNrm, uv1 + sin(vec2(3.0, 7.0) * (ia + 1.0))).rg;
        vec2 d1 = mix(ca, cb, smoothstep(0.2, 0.8, fv - 0.1 * (ca.x - cb.x + ca.y - cb.y))) * 2.0 - 1.0, d2 = vec2(0.0); if (uDet2 > 0.5) { vec2 uv2b = mat2(0.743, -0.669, 0.669, 0.743) * wq * 0.1237 - vec2(0.008, -0.012) * uTime; float l2v = kk * 5.0 + 0.5, f2v = fract(l2v), i2v = floor(l2v);
          vec2 ea = texture2D(uNrm, uv2b + sin(vec2(5.0, 2.0) * i2v)).rg, eb = texture2D(uNrm, uv2b + sin(vec2(5.0, 2.0) * (i2v + 1.0))).rg; d2 = mix(ea, eb, smoothstep(0.2, 0.8, f2v)) * 2.0 - 1.0; }   /* phones: one layer */
        g += (d1 * 0.11 + d2 * 0.06) * mix(1.0, 0.12, smoothstep(30.0, 220.0, wDist)); }   /* far away the waves carry the shape; a tiled ripple there would read as a pattern */
      vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
      vec3 v = normalize(cameraPosition - vW);
      bool below = !gl_FrontFacing;
      if (below) n = -n;
      // exact unpolarised Fresnel for n_air = 1.0, n_water = 1.333 (replaces the Schlick approximation); total internal reflection gives fr = 1
      float ci = clamp(dot(n, v), 0.0, 1.0), ni = below ? 1.333 : 1.0, nt = below ? 1.0 : 1.333, s2 = (ni / nt) * (ni / nt) * (1.0 - ci * ci);
      float fr = 1.0; if (s2 < 1.0) { float ct = sqrt(1.0 - s2), rs = (ni * ci - nt * ct) / (ni * ci + nt * ct), rp = (ni * ct - nt * ci) / (ni * ct + nt * ci); fr = 0.5 * (rs * rs + rp * rp); }
      float depthMix = clamp(length(cameraPosition.xz - vW.xz) / 120.0, 0.0, 1.0);
      // Beer-Lambert: light entering the water travels (depth / cos theta_t) through it before the sand returns it, with per-channel absorption (red dies first)
      vec3 td = refract(-v, n, 1.0 / 1.333); float path = 9.0 / max(abs(td.y), 0.12);
      vec3 absorb = vec3(0.45, 0.07, 0.02), Tw = exp(-absorb * path);
      vec3 body = vec3(0.62, 0.72, 0.62) * 0.9 * Tw + mix(uShallow, uDeep, depthMix * 0.7) * (1.0 - exp(-0.02 * path)) * 0.9;
      body = mix(body, uDeep * 0.5, smoothstep(-300.0, -800.0, vW.z) * 0.55);   // deep offshore water reads darker blue
      float bedA = 0.0, bedShore = 0.0;   // how much of this pixel is the traced seabed (drives opacity below)
      vec2 bq = bedUV(vW.xz);
      if (!below && uUseScene < 0.5 && vW.z < -222.0 && vW.y - bedY(vW.xz) < 40.0) {   /* Shifat 9:16 AM phone fps: deep water (bed > 40 m down) shows no bed anyway (bedA = 0 past 34 m), so most of the open sea skips the whole refraction trace */   /* whole open sea, not just the island square */
        // Snell: td is the refracted ray (air 1.0 -> water 1.333). Fixed-point march to where it meets the bed: t = (surface - bed(xz(t))) / -td.y
        float sy = -td.y; sy = max(sy, 0.08); float t0 = max(vW.y - bedY(vW.xz), 0.0) / sy, t1 = t0;
        t1 = max(vW.y - bedY(vW.xz + td.xz * t1), 0.0) / sy; t1 = max(vW.y - bedY(vW.xz + td.xz * t1), 0.0) / sy; t1 = mix(t0, t1, 0.85);
        vec2 hx = vW.xz + td.xz * t1; vec4 bs = texture2D(uBed, bedUV(hx)); float be = bedEdge(hx), byh = bedY(hx); float dep = max(vW.y - byh, 0.0);
        float nn1 = 0.5 * sin(hx.x * 0.031 + sin(hx.y * 0.019) * 2.1) * sin(hx.y * 0.027 + sin(hx.x * 0.023) * 1.7); bs.g = mix(clamp((byh + 16.0 + nn1 * 4.0) / 9.0, 0.0, 1.0), bs.g, be); bs.b = mix(0.5 + 0.5 * nn1, bs.b, be);
        // bed albedo: white tropical sand shallow, darker rock / weed deeper, with soft ripple marks
        vec3 alb = mix(vec3(0.30, 0.34, 0.26), vec3(0.93, 0.87, 0.70), bs.g) * (0.86 + 0.14 * bs.b) * (0.93 + 0.07 * sin(hx.x * 1.7 + sin(hx.y * 0.9) * 2.0));
        // caustics: the wavy surface focuses sunlight into moving bright webs on the bed (two scrolling cell layers, min = sharp lines)
        vec3 causC = causRGB(hx * 0.5, uTime * 0.8) * 2.6 * exp(-dep * 0.10) * uDay * (1.0 - smoothstep(25.0, 90.0, length(cameraPosition - vW)));   // real caustic network (faded with depth / distance)
        float sunK = mix(0.25, 1.0, uDay) * (0.75 + 0.25 * max(uSun.y, 0.0));
        vec3 bedL = alb * sunK * (0.82 + causC);
        // Beer-Lambert along the real path: down to the bed along the sunlight (~depth) and back up along the refracted view ray (t1); red dies first
        vec3 Tb = exp(-vec3(0.17, 0.040, 0.026) * (t1 + dep * 0.6));
        vec3 scat = mix(vec3(0.06, 0.52, 0.58), uDeep * 0.85, smoothstep(4.0, 24.0, dep)) * mix(0.25, 1.0, uDay);
        vec3 seen = bedL * Tb + scat * (1.0 - Tb);
        bedA = 1.0 - smoothstep(18.0, 34.0, dep); bedShore = smoothstep(0.1, 1.1, vW.y - bedY(vW.xz));   // at the waterline let the real beach mesh show through so there is no seam
        body = mix(body, seen, bedA);
      }
      vec3 r = reflect(-v, n);
      vec3 refl = mix(uSky, vec3(0.2, 0.34, 0.6), smoothstep(0.0, 0.45, r.y)) + vec3(1.0, 0.55, 0.3) * 0.25 * pow(max(dot(normalize(r), uSun), 0.0), 6.0);
      if (uUseScene > 0.5 && !below) {
        vec2 suv = vScreen.xy / vScreen.w * 0.5 + 0.5; float wz = vView.z;
        // screen-space reflection: march the reflected ray through the low-res scene copy (palms, buildings, hero, boats show in the sea)
        vec3 Rv = normalize((viewMatrix * vec4(r, 0.0)).xyz); float tp = 0.0;
        for (int i = 0; i < 16; i++) { if (float(i) >= uSteps || uUseRefl > 0.5) break; float k = (float(i) + 1.0) / uSteps; float tt = 140.0 * k * k; vec3 Q = vView + Rv * tt; vec4 c = uProj * vec4(Q, 1.0); if (c.w <= 0.0) break; vec2 uv = c.xy / c.w * 0.5 + 0.5;
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break; float sz = oceanZ(uv);
          if (Q.z < sz && Q.z > sz - (tt - tp) * 1.2 - 0.8 && sz > -uFar * 0.98) { float e = smoothstep(0.0, 0.1, uv.x) * (1.0 - smoothstep(0.9, 1.0, uv.x)) * (1.0 - smoothstep(0.82, 1.0, uv.y)) * smoothstep(0.0, 0.08, uv.y); refl = mix(refl, sceneCol(uv), e * 0.92); break; }
          tp = tt; }
        // refraction: the real seabed / shore / swimmer behind the surface, absorbed by the water thickness (red dies first)
        float dd = max(wz - oceanZ(suv), 0.0); vec3 Nv = (viewMatrix * vec4(n, 0.0)).xyz; vec2 uv2 = suv + Nv.xy * 0.04 * clamp(dd * 0.3, 0.0, 1.0);
        float sz2 = oceanZ(uv2); if (sz2 > wz) { uv2 = suv; sz2 = oceanZ(suv); }
        float th = clamp(wz - sz2, 0.0, 60.0); vec3 Tr = exp(-vec3(0.30, 0.065, 0.04) * th);
        body = mix(sceneCol(uv2) * Tr + body * (1.0 - Tr), body, (1.0 - smoothstep(12.0, 32.0, length(cameraPosition - vW))) * 0.85);   /* near you the real fish/bed already show through (clear water); the low-res scene copy would only add blocky doubles */
      }
      vec3 nGlow = vec3(0.0);   // bright mirrored lights (neon, windows, lamps): at night they streak across the water regardless of Fresnel, like real harbor reflections
      float fdE = max(length(cameraPosition - vW) - 35.0, 0.0) * uFogK;
      if (uUseRefl > 0.5 && !below && fdE < 1.9) {   // mirrored island / city / bridge shapes (skipped where the fog has swallowed them), rippled by the surface normal (more distortion with distance to the plane)
        vec4 rc = uRefMat * vec4(vW.x, -1.0, vW.z, 1.0); vec2 ruv = rc.xy / rc.w + n.xz * 0.05;
        vec4 rs = texture2D(tRefl, clamp(ruv, 0.002, 0.998)); 
        #ifdef PHONE_W
        rs = (rs + texture2D(tRefl, clamp(ruv + uReflSoft, 0.002, 0.998))) * 0.5;   /* phone: 2 taps + bilinear, same softness at phone resolution */
        #else
        if (uReflSoft.x > 0.0) rs = (rs * 2.0 + texture2D(tRefl, clamp(ruv + uReflSoft, 0.002, 0.998)) + texture2D(tRefl, clamp(ruv - uReflSoft, 0.002, 0.998)) + texture2D(tRefl, clamp(ruv + vec2(uReflSoft.x, -uReflSoft.y), 0.002, 0.998)) + texture2D(tRefl, clamp(ruv - vec2(uReflSoft.x, -uReflSoft.y), 0.002, 0.998))) / 6.0;
        #endif
        /* desktop: soft 5-tap, reads smooth not pixelated */ refl = mix(refl, linearToOutputTexel(vec4(rs.rgb, 1.0)).rgb, rs.a * 0.92); nGlow = linearToOutputTexel(vec4(rs.rgb, 1.0)).rgb * rs.a;
      }
      float heroSee = 0.0; float hwA = vHw.x, hwB = vHw.y;   // the live wave surface at each hero
      if (!below) {   // Shifat 5:05 AM: analytic ray-traced REFRACTION of the heroes - the bent (Snell) ray under the surface is tested against
        // their capsules, so a swimming / diving hero is seen bent, tinted and absorbed through the water (red dies first), shifting with the waves.
        vec3 tdr = refract(-v, n, 1.0 / 1.333); float rA = -1.0, rB = -1.0;
        if (uHeroA.w > 0.5 && length(uHeroA.xz - vW.xz) < 30.0 && uHeroA.y + 0.25 < hwA) rA = capH(vW, tdr, uHeroA.xyz + vec3(0.0, 0.25, 0.0), vec3(uHeroA.x, min(uHeroA.y + 1.55, hwA), uHeroA.z), 0.34, uHeroDA);   /* only the submerged part refracts; flying = none */
        if (uHeroB.w > 0.5 && length(uHeroB.xz - vW.xz) < 30.0 && uHeroB.y + 0.25 < hwB) rB = capHit(vW, tdr, uHeroB.xyz + vec3(0.0, 0.25, 0.0), vec3(uHeroB.x, min(uHeroB.y + 1.5, hwB), uHeroB.z), 0.3);
        float rt = -1.0; vec3 rc = vec3(0.0);
        if (rA > 0.0) { rt = rA; rc = vec3(0.09, 0.11, 0.21); }
        if (rB > 0.0 && (rA < 0.0 || rB < rA)) { rt = rB; rc = vec3(0.78, 0.82, 0.92); }
        // Shifat 5:05: 'when swimming at some angles I can't see part of their bodies' - the surface is drawn opaque, so the submerged body was
        // hidden. Where the straight view ray hits a hero capsule below the surface, open the surface up (low alpha) so the real body shows
        // through, tinted by the water it is seen through.
        float sA = -1.0, sB = -1.0;
        if (uHeroA.w > 0.5 && length(uHeroA.xz - vW.xz) < 12.0 && uHeroA.y - 0.2 < hwA) sA = capH(vW, -v, uHeroA.xyz + vec3(0.0, -0.2, 0.0), vec3(uHeroA.x, min(uHeroA.y + 1.7, hwA + 0.3), uHeroA.z), 0.4, uHeroDA);
        if (uHeroB.w > 0.5 && length(uHeroB.xz - vW.xz) < 12.0 && uHeroB.y - 0.2 < hwB) sB = capHit(vW, -v, uHeroB.xyz + vec3(0.0, -0.2, 0.0), vec3(uHeroB.x, min(uHeroB.y + 1.65, hwB + 0.3), uHeroB.z), 0.36);
        float st = sA > 0.0 && (sB < 0.0 || sA < sB) ? sA : sB; if (st > 0.0 && st < 8.0) heroSee = exp(-st * 0.18) * 0.5;
        float sA2 = uHeroA.w > 0.5 && sA > 0.0 ? capH(vW, -v, uHeroA.xyz + vec3(0.0, 0.05, 0.0), uHeroA.xyz + vec3(0.0, 1.5, 0.0), 0.32, uHeroDA) : -1.0;
        float sB2 = uHeroB.w > 0.5 && sB > 0.0 ? capHit(vW, -v, uHeroB.xyz + vec3(0.0, 0.05, 0.0), uHeroB.xyz + vec3(0.0, 1.45, 0.0), 0.29) : -1.0;
        if (max(sA2, sB2) > 0.0) heroSee *= 2.0;   /* two nested capsules: soft edge, no hard window */
        if (rt > 0.0 && rt < 14.0) { vec3 Th = exp(-vec3(0.45, 0.07, 0.02) * rt * 1.6); body = mix(body, rc * mix(0.35, 1.0, uDay) * (0.55 + 0.45 * uDay) * Th + body * (1.0 - Th) * 0.6, 0.9); }
      }
      float heroK = 0.0; vec3 heroC = vec3(0.0);
      if (!below && r.y > 0.0) {
        vec3 hc = vec3(0.0); float hk = 0.0, tA = -1.0, tB = -1.0;
        if (uHeroA.w > 0.5 && length(uHeroA.xz - vW.xz) < 40.0 && uHeroA.y + 1.55 > hwA) tA = capH(vW, r, vec3(uHeroA.x, max(uHeroA.y + 0.25, hwA), uHeroA.z), uHeroA.xyz + vec3(0.0, 1.55, 0.0), 0.34, uHeroDA);   /* only the part above the surface reflects (Shifat 5:12) */
        if (uHeroB.w > 0.5 && length(uHeroB.xz - vW.xz) < 40.0 && uHeroB.y + 1.5 > hwB) tB = capHit(vW, r, vec3(uHeroB.x, max(uHeroB.y + 0.25, hwB), uHeroB.z), uHeroB.xyz + vec3(0.0, 1.5, 0.0), 0.3);
        if (tA > 0.0) { hc = vec3(0.09, 0.11, 0.21); hk = 1.0; }   // Shadow's dark suit
        if (tB > 0.0 && (tA < 0.0 || tB < tA)) { hc = vec3(0.78, 0.82, 0.92); hk = 1.0; }   // Ghost's pale suit
        refl = mix(refl, hc * mix(0.35, 1.0, uDay), hk * 0.9); heroK = hk; heroC = hc * mix(0.35, 1.0, uDay);
      }
      vec3 col = mix(body, refl, fr);
      { // boat wakes (Kelvin pattern, ref: Sea of Thieves / AC4 ship wakes): two foam arms at the 19.5 deg Kelvin angle + a churned centre trail and a bow wave,
        // laced by the caustic-cell network so it breaks up like real wake foam; fades over ~70 m. Up to 5 boats, early-out by distance.
        float wk = 0.0;
        for (int i = 0; i < 5; i++) { vec4 b = uBoat[i]; vec2 d = vW.xz - b.xy; if (dot(d, d) > 6400.0 || below) continue;
          vec2 fw = vec2(sin(b.z), cos(b.z)); float s = dot(d, fw), l = dot(d, vec2(fw.y, -fw.x)), bk = -s;
          float fade = (1.0 - smoothstep(-7.0, -4.5, s)) * (1.0 - smoothstep(8.0, 75.0, bk)) * clamp(b.w * 0.6, 0.0, 1.0);
          float arm = abs(abs(l) - max(bk - 5.0, 0.0) * 0.354 - 1.6), aw = 0.6 + max(bk, 0.0) * 0.06;
          float trail = exp(-l * l / (3.0 + max(bk, 0.0) * 0.18)) * (1.0 - smoothstep(3.0, 45.0, bk));
          float bow = exp(-pow(length(vec2(l * 0.8, s - 6.0)) - 2.8, 2.0) * 1.5) * smoothstep(2.0, 6.5, s);
          wk = max(wk, (exp(-arm * arm / aw) * 0.9 + trail * 0.75) * fade + bow * 0.7); }
        if (wk > 0.01) { float lace = texture2D(uCaus, vW.xz * 0.23 + vec2(uTime * 0.01, 0.0)).r + 0.5 * texture2D(uCaus, vW.xz * 0.61).g;
          col = mix(col, vec3(0.95, 0.98, 1.0) * mix(0.35, 1.0, uDay), clamp(wk * smoothstep(0.25, 0.85, lace * 0.8 + wk * 0.35), 0.0, 1.0) * 0.85);
          n = normalize(n + vec3(lace - 0.75, 0.0, texture2D(uCaus, vW.xz * 0.37 + 0.3).b - 0.5) * min(wk, 1.0) * 0.9);   /* churned wake water: the bent normal breaks the sun glitter into scattered sparkles along the arms and trail */
          col *= 1.0 - 0.18 * exp(-pow(abs(wk - 0.25) * 4.0, 2.0)); }   /* faint troughs just outside the foam give the wake relief */
      }
      col = mix(col, heroC, heroK * (max(fr, 0.32) - fr) * 0.9);   /* the hero blocks the bright sky it would otherwise mirror: a readable silhouette even at low Fresnel (seen on real calm water) */
      col += max(nGlow - 0.22, 0.0) * 1.6 * (1.0 - uDay) * (1.0 - fr);
      // Sun glitter path: Blinn-Phong on the detailed normal, sharp up close and wider with distance so the sparkles stretch into a path toward a low
      // sun; warm orange at sunset, white at noon. Added after the day/night dimming so it stays bright.
      vec3 sunC = mix(vec3(1.0, 0.42, 0.16), vec3(1.0, 0.93, 0.82), smoothstep(0.02, 0.35, uSun.y));
      float lowSun = (1.0 - smoothstep(0.06, 0.4, uSun.y)) * smoothstep(-0.05, 0.03, uSun.y);   /* RDR2 / Sea of Thieves sunset: a broad golden glitter road on the sea toward a low sun, not a thin strip */
      float ndh = max(dot(n, normalize(uSun + v)), 0.0), shin = mix(700.0, 40.0, smoothstep(15.0, 380.0, wDist)) * (1.0 - 0.7 * lowSun), rs = max(dot(r, uSun), 0.0);
      vec3 sunSpec = sunC * min(pow(ndh, shin) * shin * (0.0075 + 0.012 * lowSun) + pow(rs, 40.0) * 0.3 + pow(rs, 8.0) * 0.12 * (1.0 - smoothstep(0.1, 0.5, uSun.y)), 2.2) * smoothstep(-0.05, 0.04, uSun.y);   // + a broad warm sheen when the sun is low
      float hW = wh(vW.xz, uTime);   /* evaluated once per pixel (was twice) */
      col += vec3(0.1, 0.45, 0.5) * smoothstep(0.3, 0.8, hW) * 0.25 * (1.0 - fr);
      // Whitecaps (ref: Sea of Thieves / AC Black Flag): foam where the wind-wave crests peak, broken into lacy cells by the caustic network
      // (same thin-line structure as real crest foam), drifting with the wave; thin streaks trail behind. One extra fetch; fades with distance.
      float crest = 0.0;
      if (gl_FrontFacing) { float hh = hW / max(swellK(vW.xz), 0.05);
        /* bombed lace (no 6 m tile) + coarse breakup, and none in the sheltered harbor canals */
        float lk = (0.5 + 0.5 * sin(vW.x * 0.0213 + sin(vW.z * 0.0171) * 2.2)) * 6.0, lf = fract(lk), li = floor(lk); vec2 luv = vec2(dot(vW.xz, vec2(0.83, -0.56)) * 0.17, dot(vW.xz, vec2(0.56, 0.83)) * 0.42) + vec2(0.0, uTime * 0.02);   /* wind-stretched fine streaks, not big blotches (Shifat 4:49 AM) */
        float lace = mix(texture2D(uCaus, luv + sin(vec2(4.1, 9.3) * li)).r, texture2D(uCaus, luv * 0.93 + sin(vec2(4.1, 9.3) * (li + 1.0))).r, smoothstep(0.25, 0.75, lf));
        lace *= smoothstep(0.08, 0.35, texture2D(uCaus, vW.xz * 0.0137 + 0.61).g + 0.15) * (1.0 - step(10.0, vW.x) * step(vW.x, 290.0) * step(-1255.0, vW.z) * step(vW.z, -995.0));
        float gust = smoothstep(0.15, 0.75, sin(dot(vW.xz, vec2(0.0113, -0.0171)) + uTime * 0.07) * sin(dot(vW.xz, vec2(0.0191, 0.0067)) - uTime * 0.05) + 0.25 * sin(dot(vW.xz, vec2(-0.031, 0.024))));   /* wind gusts: breaks the regular crest grid into irregular patches */
        crest = smoothstep(1.02, 1.5, hh) * smoothstep(0.2, 0.55, lace) * gust * 0.8 * smoothstep(0.35, 0.75, swellK(vW.xz)) * (1.0 - smoothstep(90.0, 320.0, wDist));
        col = mix(col, vec3(0.97, 0.99, 1.0), crest * 0.6); }
      float sd = -222.0 - vW.z; float sf = smoothstep(24.0, 0.0, sd) * (0.5 + 0.5 * sin(sd * 1.3 - uTime * 1.8 + sin(vW.x * 0.4) * 2.0));
      col = mix(col, vec3(1.0, 0.97, 0.92), clamp(sf, 0.0, 1.0) * step(0.0, sd) * 0.15);
      float aOut = mix(0.82, 1.0, max(fr, 0.0)); aOut = mix(aOut, 1.0, bedA * bedShore);
      { // South Sea 2b (real tropical refs: Maldives / Bora Bora): turquoise shallows around the island's white sand + a foam line at the shore
        vec2 iq = vW.xz - vec2(-160.0, -820.0); float ia = atan(iq.y, iq.x); float irr = length(iq) / (92.0 * (1.0 + 0.13 * sin(2.0 * ia + 3.16) + 0.085 * sin(3.0 * ia + 5.06) + 0.05 * sin(5.0 * ia + 0.83) + 0.03 * sin(8.0 * ia + 4.71) + 0.018 * sin(13.0 * ia + 2.25)));   // = seaWorld coastK
        if (irr < 1.6 && !below) {
          float sh = 1.0 - smoothstep(0.93, 1.5, irr);
          vec3 tq = mix(vec3(0.07, 0.55, 0.62), vec3(0.42, 0.9, 0.84), 1.0 - smoothstep(0.92, 1.18, irr)) * mix(0.25, 1.0, uDay);
          col = mix(col, mix(tq, col, fr * 0.55), sh * 0.85 * (1.0 - bedA * 0.9));
          // shore foam (AAA swash zone, e.g. Sea of Thieves / Uncharted 4): driven by REAL water depth over the traced bed, not rings.
          // Each wave set runs up the beach as a front that travels with depth (surge), leaves a lacy sheet (caustic-cell lace) that thins as it
          // drains back, and the fronts are broken along the coast by low-frequency variation, so nothing repeats.
          float wd = vW.y - bedY(vW.xz), cv = texture2D(uCaus, vW.xz * 0.011 + 0.2).r;
          float ph = uTime * 0.18 + cv * 2.6 + sin(ia * 3.0) * 0.4, sw = fract(ph + wd * 0.45), swash = smoothstep(0.0, 0.12, sw) * (1.0 - smoothstep(0.12, 0.85, sw));
          float lace = texture2D(uCaus, vW.xz * 0.21 + vec2(uTime * 0.02, -uTime * 0.013)).r + 0.6 * texture2D(uCaus, vW.xz * 0.53 - uTime * 0.03).g;
          float zone = wd < 1.2 ? (1.0 - smoothstep(0.1, 1.2, wd)) * smoothstep(0.02, 0.12, length(vec2(bedY(vW.xz + vec2(1.5, 0.0)) - bedY(vW.xz - vec2(1.5, 0.0)), bedY(vW.xz + vec2(0.0, 1.5)) - bedY(vW.xz - vec2(0.0, 1.5)))) / 3.0) : 0.0, edge = smoothstep(-0.05, 0.06, wd) * (1.0 - smoothstep(0.1, 0.55, wd));
          float fo = zone * smoothstep(0.42, 0.85, lace * (0.5 + swash) * zone + swash * 0.55 * zone) + edge * (0.6 + 0.4 * swash);
          fo *= smoothstep(1.35, 1.0, irr);   /* swash only on a sloping beach band (bed gradient), not across wide shallow flats where it read as giant white blotches */
          col = mix(col, vec3(1.0, 0.99, 0.96) * mix(0.35, 1.0, uDay), clamp(fo, 0.0, 1.0) * 0.75);
          aOut = mix(aOut, 0.62, (1.0 - smoothstep(0.9, 1.08, irr)) * (1.0 - fo) * (1.0 - bedA));
        }
      }
      vec3 uWaterDisplay=mix(uUWF,linearToOutputTexel(vec4(uUWF,1.0)).rgb,0.65*(1.0-smoothstep(-2.0,-1.0,cameraPosition.y)));
      if (below) {
        // Snell's window: refract view ray water -> air with a slightly different index per colour channel (dispersion); beyond the critical angle (48.6 deg) total internal reflection shows the water, not the sky
        vec3 under = mix(uDeep, uShallow, 0.35 + 0.4 * pow(max(dot(-n, v), 0.0), 2.0));
        { float rl = texture2D(uCaus, vW.xz * 0.11 + vec2(uTime * 0.013, -uTime * 0.009)).g + 0.6 * texture2D(uCaus, vW.xz * 0.29 - uTime * 0.017).r;   /* AAA underside: the total-internal-reflection mirror shimmers with the rippled lit water instead of one flat sheet */
          under *= 1.0 + (rl * 0.55 - 0.3) * uDay * (1.0 - smoothstep(25.0, 90.0, length(cameraPosition - vW))); }
        vec3 tr = refract(-v, n, 1.3310), tg = refract(-v, n, 1.3330), tb = refract(-v, n, 1.3375);
        bool tir = dot(tg, tg) < 0.0001;
        vec3 zc = vec3(0.55, 0.76, 0.96) * mix(0.12, 1.0, uDay);   /* AAA Snell window: a bright sky disc overhead (was a dull dark-blue zenith) with the sun blazing through it */
        vec3 sr = mix(uSky, zc, smoothstep(0.0, 0.45, tr.y)), sg = mix(uSky, zc, smoothstep(0.0, 0.45, tg.y)), sb = mix(uSky, zc, smoothstep(0.0, 0.45, tb.y));
        vec3 win = vec3(sr.r, sg.g, sb.b);
        if (!tir) win += vec3(1.0, 0.95, 0.82) * (pow(max(dot(normalize(tg), uSun), 0.0), 220.0) * 3.0 + pow(max(dot(normalize(tg), uSun), 0.0), 12.0) * 0.25) * uDay;
        // A narrow rough-surface critical-angle transition avoids a binary colour/alpha rim.
        float critical = smoothstep(0.84, 1.04, s2);
        col = mix(mix(win, under, clamp(fr, 0.0, 1.0)), under, critical);
        aOut = mix(0.45, 0.96, max(fr, critical));
      }
      // Shifat 4:33 AM: distance exp-squared fog - clear near the player, then rolls in fast, hiding low-res reflections/far detail and the
      // horizon edge of big water bodies (and lets the far shading/mirror work stop early). Phones fog a little closer.
      float fd = max(length(cameraPosition - vW) - 35.0, 0.0) * uFogK; float haze = max(1.0 - exp(-fd * fd), 1.0 - exp(-length(cameraPosition - vW) * 0.0035));
      if (below) col = mix(col, uWaterDisplay, smoothstep(45.0, 190.0, length(cameraPosition - vW)));
      if (below) col += uWaterDisplay * 0.9 * pow(1.0 - clamp(abs(v.y), 0.0, 1.0), 2.5);   // soft light band toward the horizon, dark overhead (ref: Abzu key art vertical gradient)
      col = mix(col, uSky, haze * (below ? 0.0 : 0.75));
      if (!below) {
        col *= mix(0.3, 1.0, uDay);
        col += sunSpec * (1.0 - haze * 0.5);
        // Stylised cool night-sky lobe, not scene reflections or a physical moon model.
        col += vec3(0.18, 0.26, 0.38) * (1.0-uDay) * pow(max(dot(r, normalize(vec3(-0.3, 0.6, -0.5))), 0.0), 12.0);
      }
      // A near-waterline camera can sit inside a displaced crest while viewing its top face.
      // Fade only that nearby top-face sheet so the swimmer remains readable through the split.
      // This is a local transparency approximation, not scene-colour refraction.
      float waterline = 1.0 - smoothstep(0.35, 1.4, abs(cameraPosition.y - vHw.z));
      float nearClear = mix(1.0, smoothstep(1.0, 16.0, length(cameraPosition - vW)), waterline);
      float splitBlend = (1.0 - smoothstep(0.8, 1.4, -1.0 - cameraPosition.y)) * (1.0 - smoothstep(0.4, 4.0, length(cameraPosition - vW)));
      if (below) { col = mix(col, linearToOutputTexel(vec4(uUWF, 1.0)).rgb, splitBlend); aOut = mix(aOut, 1.0, splitBlend); }
      // Shore junction: share the wall's ray scattering only at grazing angles near the solid shore.
      // Opaque coverage here prevents the hidden city underside from leaking through the join.
      if(below){float join=smoothstep(-230.0,-224.0,vW.z)*(1.0-smoothstep(0.20,0.65,abs(v.y)));
        vec3 junction=uWaterDisplay*(1.0+0.9*pow(1.0-clamp(abs(v.y),0.0,1.0),2.5));
        col=mix(col,junction,join);aOut=mix(aOut,1.0,join);}
      // Shifat 5:36 picked "clear water near you": within ~30 m the surface turns partly see-through (more when looking down, less at grazing
      // angles where Fresnel reflection takes over), so fish, the swimmer and the real seabed show through everywhere close by, not only in a window.
      float dCam = length(cameraPosition - vW); float nearK = (1.0 - smoothstep(12.0, 32.0, dCam)) * (1.0 - fr) * step(-222.0, -vW.z) * (1.0 - step(below ? 1.0 : 0.0, 0.5) * 0.0);
      float aAbove = mix(nearClear, 0.3, heroSee * (1.0 - fr * 0.5)); aAbove = min(aAbove, mix(1.0, 0.5, nearK));
      // soft shorelines (AAA depth fade): where the sea is only a few cm deep over terrain - inlets, coarse terrain edges - it thins to nothing
      // instead of ending in a hard polygon edge; uses the depth of the scene copy the refraction already makes (no extra pass)
      if (uUseScene > 0.5 && !below) { vec2 suvF = vScreen.xy / vScreen.w * 0.5 + 0.5; float thr = vView.z - oceanZ(suvF), thk = thr < -2.5 ? 9.0 : max(thr, 0.0); aAbove *= smoothstep(0.0, 0.9, thk);   /* thr < 0: the low-res copy has an occluder (tree/hero) in front at this pixel - not shallow water, keep it solid (fixes dark blocks along tree silhouettes) */ col = mix(vec3(1.0, 0.99, 0.96) * mix(0.35, 1.0, uDay), col, smoothstep(0.05, 0.6, thk) * 0.6 + 0.4); }
      gl_FragColor = vec4(col, below ? aOut : aAbove);
    }`;
