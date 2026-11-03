import { SKYFX_GLSL, SKYFX2_GLSL, CLOUD_GLSL } from '../shaders/skyFx';
import { GRID_TRACE_GLSL, GRID_UNIFORMS_GLSL } from './gridRefl';
// Sea surface shader for the ocean + lakes (waterMat in Scene.tsx).
// WAVES is the shared GLSL wave field (height wh / gradient wg), generated in ./waves.ts from the same table as the
// CPU waveH() in Scene.tsx (swimming + boats), so the two cannot drift apart.
import { CAUSTIC_GLSL } from '../caustics';
import { WAVES_GLSL, GERSTNER_GLSL, WAVES_V_GLSL, WAVES_VDJ_GLSL, WGHJ_GLSL } from './waves';
import { OCEAN_N, OCEAN_WARP, OCEAN_HALF } from './seabed';
import { WATER_COMMON_GLSL } from './common';
import { WL_GLSL, WL_D } from './waterline';

/** Shared GLSL wave field, generated from the single wave table in ./waves.ts (also drives the CPU waveH). */
export const WAVES = WAVES_GLSL;

/** Ocean vertex shader: camera-following warped grid displaced by the wave field. */
export const OCEAN_VERT = '#define WG_CHOP gChop\nbool gChop = true;\n' + WAVES + GERSTNER_GLSL + WAVES_V_GLSL + WAVES_VDJ_GLSL + `varying vec4 vGj; uniform float uTime; uniform vec4 uHeroA, uHeroB; uniform vec3 uHw; uniform vec2 uBench; varying vec2 vP0; varying vec3 vW; varying vec3 vView; varying vec4 vScreen; varying vec3 vHw; void main(){ vHw = uHw;   /* the wave height at each hero is the same for every pixel: evaluated per vertex (~30k) instead of per pixel (~1M on phone) */ vec3 p = position; vec4 w = modelMatrix * vec4(p, 1.0); ${'vec2 la = abs(position.xz) / ' + OCEAN_HALF.toFixed(1) + '; vec2 sa = ' + (OCEAN_WARP * OCEAN_HALF * 2 / OCEAN_N).toFixed(4) + ' * pow(max(la, vec2(1e-4)), vec2(' + ((OCEAN_WARP - 1) / OCEAN_WARP).toFixed(4) + ')); float sp = max(sa.x, sa.y);'}   /* local grid spacing (m) of the warped sheet: waves shorter than ~2 cells fade (see whV) */ w.z = min(w.z, -222.0); gChop = sp < 2.5; vec3 gj; float hh; vec3 hd = whdgjV(w.xz, uTime, sp, gj, hh); if (uBench.x > 0.5) hd = vec3(0.0); float h = hd.x; w.y += h; vP0 = w.xz; vGj = vec4(gj, hh);   /* perf item 10: one pass for whdV + wghj (same values, ~half the vertex trig) */   /* Nov 1 phone data: the sea's per-pixel shading is ~95% of its cost on the phone - the wave gradient / Jacobian / height (13 wave trains of trig) now run per vertex (~30k) and are interpolated, not per pixel (~200k+) */ w.xz += hd.yz * smoothstep(-222.0, -232.0, w.z);   /* one pass: height + sideways push share each train's trig */   /* Gerstner: sideways toward the crests (none right at the sea wall) */ vW = w.xyz; vec4 vv = viewMatrix * w; vView = vv.xyz; gl_Position = projectionMatrix * vv; vScreen = gl_Position; }`.replace('vec3 p = position; vec4 w = modelMatrix * vec4(p, 1.0);', 'vec4 w = modelMatrix * vec4(position, 1.0);');

/** Ocean fragment shader: refraction + Beer-Lambert, mirror/SSR reflection, caustics, foam, glitter, haze, Snell window. */
export const OCEAN_FRAG = '#include <packing>\n#define WG_CHOP gChop\nbool gChop = true;\n' + WAVES + GERSTNER_GLSL + WGHJ_GLSL + `varying vec2 vP0; varying vec4 vGj; uniform vec2 uBench; uniform float uDay; uniform float uTime; uniform vec3 uSun, uSky, uDeep, uShallow, uUWF; uniform float uSkyT; ${SKYFX_GLSL}${SKYFX2_GLSL}${CLOUD_GLSL} varying vec3 vW; varying vec3 vView; varying vec4 vScreen; varying vec3 vHw;
    ${CAUSTIC_GLSL}
    uniform sampler2D uNrm; uniform float uDet2; uniform samplerCube tProbe; uniform float uUseRefl; ${GRID_UNIFORMS_GLSL} uniform sampler2D tMir; uniform mat4 uMirM; uniform float uMir; uniform vec2 uMirPx; uniform sampler2D uHf; uniform vec4 uHfB; uniform float uHF; uniform vec4 uArMin[24]; uniform vec4 uArMax[24]; uniform vec3 uArCol[24]; uniform vec4 uArIsle[3]; uniform sampler2D tImp0; uniform sampler2D tImp1; uniform sampler2D tImp2; uniform vec4 uImpP[3]; uniform vec2 uSceneTx; uniform float uFogK;
    ${WATER_COMMON_GLSL}
    #define WATER_LVL -1.0
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
    /* the analytic air trace (map grid of buildings + bridge deck spans, then the isles), shared by the sea reflection and the
       underwater Snell window. Returns colour + soft coverage; nb = the face normal of the first hit. */
${GRID_TRACE_GLSL}
    vec4 airTrace(vec3 ro, vec3 hd, out vec3 nb, float ik) {
          vec3 ih = 1.0 / hd; float tb = 1e5; vec3 cb = vec3(0.0); nb = vec3(0.0, 1.0, 0.0); float bh = 0.0;
          float cov = 0.0; vec3 acc = vec3(0.0); gridTrace(ro, hd, tb, nb, acc, cov);
          if (cov > 0.01) cb = acc / cov;
          vec3 hi = normalize(vec3(hd.x, hd.y * ik, hd.z));   /* isles climb less squashed than the city: the 2x stretch smeared the island as a long green streak toward the camera */
          for (int i = 0; i < 3; i++) {   /* isles: the dome only bounds the ray; inside it the real island height (the sea-bed map, which carries the
             coastline and low slopes; it clips at +10 m, so the dome takes over above that) is marched in 8 soft steps */
            if (cov > 0.97) break;
            vec4 I = uArIsle[i]; vec3 sc = vec3(I.z, I.w, I.z); vec3 o = (ro - vec3(I.x, 0.0, I.y)) / sc, d = hi / sc; float A = dot(d, d), B = dot(o, d), C = dot(o, o) - 1.0, D = B * B - A * C;
            if (D > 0.0) { float sq = sqrt(D); float t0 = max((-B - sq) / A, 0.5), t1 = min((-B + sq) / A, tb);
              if (t1 > t0) { float dt = (t1 - t0) / 8.0; float t = t0 + dt * 0.5;
                for (int s = 0; s < 8; s++) { vec3 p = ro + hi * t; vec2 q = (p.xz - I.xy) / I.z; float dh = I.w * sqrt(max(0.0, 1.0 - dot(q, q)));
                  float by = i == 2 ? I.w * pow(max(0.0, 1.0 - length(q - vec2(-0.13, -0.1)) * 1.1), 1.3) : bedY(p.xz);   /* the berg: one peaked mass, not a flat dome */ float h = i == 2 ? by : by > 9.0 ? dh : min(dh, by); if (i == 1) h = max(min(by, 9.0), I.w * smoothstep(0.92, 0.6, length(q)) * (0.55 + 0.45 * abs(sin(p.x * 0.23 + sin(p.z * 0.11) * 2.0) * sin(p.z * 0.19 + 1.3))));   /* farm: canopy plateau over its low ground */ float sf = (i == 2 ? 4.5 : 3.0) + t * 0.05;
                  float k = smoothstep(-sf, sf, h - p.y) * (1.0 - cov);
                  if (k > 0.01) { vec3 col = i == 2 ? vec3(0.74, 0.86, 0.94) : mix(vec3(0.85, 0.8, 0.62), vec3(0.16, 0.42, 0.2), smoothstep(1.5, 5.0, i == 1 ? p.y * 2.0 : h));
                    if (tb > 9e4) { tb = t; nb = normalize(vec3(q.x, 0.6, q.y)); bh = -1.0; }
                    acc += k * col; cov += k; if (cov > 0.97) break; }
                  t += dt; }
              } }
          }
          if (cov > 0.01) cb = acc / cov;
          return vec4(cb, cov);
    }
    float oceanZ(vec2 uv){ return perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }
    vec3 sceneCol(vec2 uv){   /* Shifat 3:30 PM 'same on all devices': one 2-tap soft read everywhere (phone was 1 tap, desktop 4) */
      vec2 o = uSceneTx * vec2(0.7, 0.45); vec3 c = texture2D(tScene, uv + o).rgb + texture2D(tScene, uv - o).rgb; return linearToOutputTexel(vec4(c * 0.5, 1.0)).rgb; }   /* rotated-grid 4-tap: the low-res scene copy no longer shows fish/whales/boats under the water as pixel blocks */
    ${WL_GLSL}
    bool gSplit = false, gAir = true;
    /* Shifat's Adreno 506 phone drew the sea as solid blue from above (the underwater look): gl_FrontFacing is unreliable on that GPU, so the
       side of the surface is decided by the camera height against the live wave at the camera, and the hardware flag only within 0.4 m of it */
    bool seaFF(){ if (gSplit) return gAir; float dc = cameraPosition.y - vHw.z; return dc > 0.4 ? true : (dc < -0.4 ? false : gl_FrontFacing); }   /* split lens: the side is the pixel's side of the line (a kept fragment is always seen from that side) */
    void main(){
      if (uBench.y > 0.5 && uBench.y < 1.5) { gl_FragColor = vec4(uDeep, 0.95); return; }   /* ?debug&bench step: sea shading off */

      if (uWL.w > 0.5) { vec3 fD = cross(dFdx(vW), dFdy(vW)); vec2 sn = vScreen.xy / vScreen.w; gSplit = true; gAir = sn.y > wlY(sn.x);   /* split lens (src/water/waterline.ts): a pixel above the line starts in air and sees only the top of the sea, below it starts under water and sees only the wavy underside */
        /* fD: this fragment's real triangle (read first in the branch, before any discard: derivatives need the whole 2x2 quad) */
        float vz = -vView.z; if (vz < ${WL_D.toFixed(2)}) discard;   /* sea between the camera and the lens plane is inside the lens: it never draws */
        bool top = (dot(fD, cameraPosition - vW) < 0.0 ? -fD.y : fD.y) > 0.0;   /* seen from above = the camera is on the up side of its triangle; from the triangle itself, not gl_FrontFacing (wrong in render targets on some phone GPUs) */
        if (gAir ? (!top || vz < uWL.y) : top) discard; }   /* above the line: only sea top beyond the line's reach (the far sea when the lens rides high); below it: only the underside, so no wave ever pokes into the air half */
      gChop = length(cameraPosition - vW) < 120.0;   /* every device: past 120 m the 3-12 m chop is sub-pixel shimmer, so its 5 trains are skipped (phone was 90 m, desktop 160 m) */
      float wD0 = length(cameraPosition - vW); bool farS = wD0 > 260.0;   /* Shifat 4:30 PM: far sea flat & smooth for speed - past 260 m no wave/ripple maths, faded from 200 m */
      float hW0 = vGj.w; vec3 gj = farS ? vec3(0.0) : vGj.xyz * (1.0 - smoothstep(200.0, 260.0, wD0));   /* gradient, Jacobian and height in one pass */ vec2 gW = gj.xy; gChop = true;   /* Gerstner: gradient + crest Jacobian at the undisplaced point */ vec2 g = gW + vec2(sin(vW.x * 0.9 + uTime * 3.0), cos(vW.z * 0.8 + uTime * 2.4)) * 0.02;
      g += vec2(cos(dot(vW.xz, vec2(0.7, 0.4)) + uTime * 2.1), cos(dot(vW.xz, vec2(-0.35, 0.8)) - uTime * 1.7)) * 0.035 + vec2(cos(dot(vW.xz, vec2(1.7, -1.1)) + uTime * 3.3), cos(dot(vW.xz, vec2(-1.3, 1.6)) - uTime * 2.7))* 0.018;
      g = mix(g, gW, smoothstep(15.0, 70.0, length(cameraPosition.xz - vW.xz)));
      // AAA-style micro detail (Sea of Thieves / Uncharted use scrolling normal maps over the big waves): two layers of a tileable ripple normal
      // map drifting in different directions; mipmaps + a distance fade stop far-field shimmer. Above the surface only.
      float wDist = length(cameraPosition - vW);
      if (seaFF() && !farS) { vec2 wq = vW.xz + 9.0 * vec2(sin(vW.z * 0.013 + uTime * 0.02), cos(vW.x * 0.011 - uTime * 0.017));   /* slow domain warp: the ripple tile never lines up into a grid */
        // texture bombing (Quilez 'texture no-tile' v3): a low-frequency variation value picks which randomly offset copy of the ripple map each patch
        // uses and blends neighbours, so the 22 m tile never shows as a repeat
        float kk = texture2D(uCaus, wq * 0.0031 + 0.37).r * 0.6 + 0.4 * (0.5 + 0.5 * sin(wq.x * 0.0071 + sin(wq.y * 0.0053) * 2.0));
        float lv = kk * 8.0, fv = fract(lv), ia = floor(lv); vec2 uv1 = wq * 0.045 + vec2(0.011, 0.006) * uTime;
        vec4 ca4 = texture2D(uNrm, uv1 + sin(vec2(3.0, 7.0) * ia)), cb4 = texture2D(uNrm, uv1 + sin(vec2(3.0, 7.0) * (ia + 1.0)));
        /* FFT detail (Shifat 3:23/3:30 PM 'fft ... ultra fast, same on all devices'): public/waterfft.png is a real Tessendorf/Phillips FFT sea baked offline,
           RG = slopes at time 0, BA = the same sea 1.9 s later; one fetch carries both and the shader cross-fades them (variance kept), so the ripples
           evolve instead of sliding as a frozen picture. One layer on every device (phone = desktop). */
        float wt = 0.5 + 0.5 * sin(uTime * 0.83), wr = inversesqrt(wt * wt + (1.0 - wt) * (1.0 - wt));
        vec2 ca = (mix(ca4.rg, ca4.ba, wt) - 0.5) * wr + 0.5, cb = (mix(cb4.rg, cb4.ba, wt) - 0.5) * wr + 0.5;
        vec2 d1 = mix(ca, cb, smoothstep(0.2, 0.8, fv - 0.1 * (ca.x - cb.x + ca.y - cb.y))) * 2.0 - 1.0, d2 = vec2(0.0); 
        g += (d1 * 0.125 + d2) * mix(1.0, 0.12, smoothstep(30.0, 220.0, wDist)); }   /* far away the waves carry the shape; a tiled ripple there would read as a pattern */
      /* far-sea variation (Shifat 3:23 PM 'fbm'): wind gust patches - a very low-frequency noise (one fetch of the caustic tile's blurred
         mips) roughens some stretches and leaves others glassy, so the open sea never reads as one uniform sheet. Same on every device. */
      vec4 gq = texture2D(uCaus, vW.xz * 0.0013 + vec2(0.003, 0.0017) * uTime);
      float gust = gq.r;
      g *= mix(0.55, 1.45, smoothstep(0.25, 0.75, gust));
      /* Shifat 5:32 PM 'breaking up the far sea': a second, much larger scale from the SAME fetch (the tile's other channel, domain-warped by the
         first) - slow colour patches over hundreds of metres (deeper blue vs. greener, like current lines / cloud shade on real ocean). */
      float swPatch = smoothstep(0.3, 0.7, texture2D(uCaus, vW.xz * 0.00042 + (gq.rg - 0.5) * 0.08 - vec2(0.0011, 0.0006) * uTime).g);
      float rainK = 0.0; if (uRain > 0.01) { vec2 rsl = rainSlope(vW.xz, uTime) * uRain * (1.0 - smoothstep(15.0, 110.0, length(cameraPosition - vW))); g += rsl * 3.0; rainK = length(rsl); }   /* raindrop impact rings */
      vec3 n = normalize(vec3(-g.x, 1.0 - gj.z, -g.y));
      vec3 v = normalize(cameraPosition - vW);
      if (uBench.y > 1.5 && uBench.y < 2.5) { gl_FragColor = vec4(n * 0.5 + 0.5, 0.95); return; }   /* telemetry stage bench */
      bool below = !seaFF();
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
      float bedA = 0.0, bedShore = 0.0;
      if (uBench.y > 2.5 && uBench.y < 3.5) { gl_FragColor = vec4(body, 0.95); return; }   /* telemetry stage bench */   // how much of this pixel is the traced seabed (drives opacity below)
      vec2 bq = bedUV(vW.xz);
      float bY0 = bedY(vW.xz);   /* Nov 1: the bed height under this pixel, read once (was read 4 times) */
      if (!below && uUseScene < 0.5 && vW.z < -222.0 && vW.y - bY0 < 15.0) {   /* Nov 1: bedA is 0 past 9 m of water at the hit, so the trace only matters where the bed is < ~15 m down (margin for slopes the bent ray reaches) - was 40 m */   /* Shifat 9:16 AM phone fps: deep water (bed > 40 m down) shows no bed anyway (bedA = 0 past 34 m), so most of the open sea skips the whole refraction trace */   /* whole open sea, not just the island square */
        // Snell: td is the refracted ray (air 1.0 -> water 1.333). Fixed-point march to where it meets the bed: t = (surface - bed(xz(t))) / -td.y
        float sy = -td.y; sy = max(sy, 0.08); float t0 = max(vW.y - bY0, 0.0) / sy, t1 = t0;
        t1 = max(vW.y - bedY(vW.xz + td.xz * t1), 0.0) / sy; t1 = max(vW.y - bedY(vW.xz + td.xz * t1), 0.0) / sy; t1 = mix(t0, t1, 0.85);
        vec2 hx = vW.xz + td.xz * t1; vec4 bs = texture2D(uBed, bedUV(hx)); float be = bedEdge(hx), byh = mix(seaBed(hx), bs.r * 40.0 - 30.0, be); float dep = max(vW.y - byh, 0.0);
        float nn1 = 0.5 * sin(hx.x * 0.031 + sin(hx.y * 0.019) * 2.1) * sin(hx.y * 0.027 + sin(hx.x * 0.023) * 1.7); bs.g = mix(clamp((byh + 16.0 + nn1 * 4.0) / 9.0, 0.0, 1.0), bs.g, be); bs.b = mix(0.5 + 0.5 * nn1, bs.b, be);
        // bed albedo: white tropical sand shallow, darker rock / weed deeper, with soft ripple marks
        vec3 alb = mix(vec3(0.30, 0.34, 0.26), vec3(0.93, 0.87, 0.70), bs.g) * (0.86 + 0.14 * bs.b) * (0.93 + 0.07 * sin(hx.x * 1.7 + sin(hx.y * 0.9) * 2.0));
        // caustics: the wavy surface focuses sunlight into moving bright webs on the bed (two scrolling cell layers, min = sharp lines)
        vec3 causC = causRGB(hx * 0.5, uTime * 0.8) * 1.6 * exp(-dep * 0.28) * uDay * (1.0 - smoothstep(25.0, 90.0, length(cameraPosition - vW)));   // real caustic network (faded with depth / distance)
        float sunK = mix(0.25, 1.0, uDay) * (0.75 + 0.25 * max(uSun.y, 0.0));
        vec3 bedL = alb * sunK * (0.82 + causC);
        // Beer-Lambert along the real path: down to the bed along the sunlight (~depth) and back up along the refracted view ray (t1); red dies first
        vec3 Tb = exp(-vec3(0.17, 0.040, 0.026) * (t1 + dep * 0.6));
        vec3 scat = mix(vec3(0.06, 0.52, 0.58), uDeep * 0.85, smoothstep(4.0, 24.0, dep)) * mix(0.25, 1.0, uDay);
        vec3 seen = bedL * Tb + scat * (1.0 - Tb);
        bedA = 1.0 - smoothstep(3.0, 9.0, dep);   /* Shifat 3:39 AM 'sea near shore doesn't need to show what's underneath the land': only the shallow band shows the bed */ bedShore = smoothstep(0.1, 1.1, vW.y - bY0);   // at the waterline let the real beach mesh show through so there is no seam
        body = mix(body, seen, bedA);
      }
      vec3 r = reflect(-v, n);
      vec3 refl = mix(uSky, vec3(0.2, 0.34, 0.6), smoothstep(0.0, 0.45, r.y)) + vec3(1.0, 0.55, 0.3) * 0.25 * pow(max(dot(normalize(r), uSun), 0.0), 6.0);
      vec3 nGlow = vec3(0.0); vec3 nGW = vec3(0.0); vec3 skR = vec3(0.0); float skA = 0.0;   // bright mirrored lights (neon, windows, lamps): at night they streak across the water regardless of Fresnel, like real harbor reflections
      float fdE = max(length(cameraPosition - vW) - 35.0, 0.0) * uFogK;
      if (uUseRefl > 0.5 && !below && fdE < 1.9) {   // mirrored island / city / bridge shapes (skipped where the fog has swallowed them), rippled by the surface normal (more distortion with distance to the plane)
        /* reflection probe (Shifat 4:30 PM 'cheap techniques?' + 4:57 PM 'super blurry ok'): the rippled reflection ray looks up a tiny cubemap of the
           city / island / bridge, heavily mip-blurred; tinted toward the water's blue and laid in subtly (shared look, src/water/common.ts).
           One blurry fetch for the body + one sharper fetch for the night neon. No mirror render at all. */
        vec3 rd = normalize(vec3(r.x + n.x * 0.2, max(r.y, 0.02), r.z + n.z * 0.2));
        /* reflection ILLUSION (Shifat Oct 31 12:58): no probe render - one lookup in the CPU-projected skyline ring (azimuth -> silhouette top + colour).
           The ripple normal smears the elevation test into soft vertical streaks, like real harbour water at dusk. */
        /* Shifat Nov 1 11:13 'reflection moves with the camera, feels wrong': the ring was looked up by direction alone (as if every silhouette were at infinity),
           so the mirrored city slid along with the camera. Now each pixel follows ITS OWN reflected ray to the silhouette's real distance (row 1 of the ring)
           and looks the ring up from there; the top elevation is re-scaled to this pixel's distance. Reflections stay fixed to the world. */
        /* Shifat Nov 1 4:39 PM "Ring reflection code, delete it": the skyline-ring lookup is gone; the analytic raytrace below is the sea reflection */
        if (uHF > 5.5) {   /* ANALYTIC RAYTRACE, EVERY BUILDING (src/water/gridRefl.ts, Shifat 3:57 PM): the rippled reflected ray walks the map grid (2D DDA)
             and is tested exactly against the boxes of each cell it crosses (nearest hit), plus the 3 isle domes. Lit by the face it hit, windows
             on the walls (lit warm at night), softer with distance. The ray's climb is halved: mirrored shapes stretch ~2x downward. */
          vec3 ro = vec3(vW.x, 0.0, vW.z), hd = normalize(vec3(rd.x, rd.y * 0.38, rd.z)), nb; vec4 at = airTrace(ro, hd, nb, 1.8); vec3 cb = at.rgb; float cov = at.a; nGW = gGlow;


          float ah = cov; vec3 sunD = normalize(uSun); float lam = 0.75 + 0.35 * max(dot(nb, sunD), 0.0);
          vec3 acol = cb * lam * mix(0.3, 1.0, uDay);
          skR = mix(acol, reflTint(acol, refl), 0.5); skA = ah * 0.95; nGlow = cb * 0.3 * ah;
          /* the sailboats in the mirror (Shifat 7:50 PM 'many reflections missing'): exact ray/capsule hits on each boat's hull, mast and sail, true mirror height */
          for (int i = 0; i < 5; i++) { vec4 B = uBoat[i]; vec2 dB = vW.xz - B.xy; if (dot(dB, dB) > 90000.0 || below) continue;
            vec3 fw = vec3(sin(B.z), 0.0, cos(B.z)), c0 = vec3(B.x, 0.3, B.y), rr = normalize(vec3(rd.x, max(rd.y, 0.02), rd.z));
            float th = capHitP(ro, rr, c0 - fw * 4.6, c0 + fw * 4.2, 1.7);
            float ts = capHitP(ro, rr, c0 + vec3(0.0, 2.4, 0.0) - fw * 1.3, c0 + vec3(0.0, 10.3, 0.0) + fw * 0.95, 0.9);
            float tH = th > 0.0 ? th : 1e5, tS = ts > 0.0 ? ts : 1e5, tt = min(tH, tS);
            float soft = 1.0; if (tt > 1e4) {   /* soft halo: a fatter capsule at reduced weight, so boats blur like the rest of the mirror (Shifat 9:17 PM) */
              float th2 = capHitP(ro, rr, c0 - fw * 5.4, c0 + fw * 5.0, 2.9), ts2 = capHitP(ro, rr, c0 + vec3(0.0, 2.0, 0.0) - fw * 1.3, c0 + vec3(0.0, 11.0, 0.0) + fw * 0.95, 1.9);
              if (th2 > 0.0) { tH = th2; tt = th2; soft = 0.45; } else if (ts2 > 0.0) { tS = ts2; tt = ts2; soft = 0.45; } }
            if (tt < 1e4) { vec3 bcol = (tH < tS ? vec3(0.78, 0.8, 0.82) : vec3(0.9, 0.9, 0.88)) * (0.75 + 0.3 * max(dot(normalize(uSun), vec3(0.0, 1.0, 0.0)), 0.0)) * mix(0.25, 1.0, uDay);
              float kb = (1.0 - smoothstep(150.0, 300.0, length(dB))) * soft;
              skR = mix(skR, mix(bcol, reflTint(bcol, refl), 0.4), kb); skA = mix(skA, 0.95, kb); } }
          /* Shifat 8:59 PM 'reflections should be darker blue tinted': water darkens what it mirrors and tints it toward its own deep blue */
          skR = mix(skR * vec3(0.5, 0.62, 0.78), vec3(0.04, 0.12, 0.2), 0.25);
        }
      }
      float heroSee = 0.0; float hwA = vHw.x, hwB = vHw.y;   // the live wave surface at each hero
      bool camUp = cameraPosition.y > vW.y;   /* Shifat 6:06 PM: a camera under the sea never sees the analytic hero (the real body is right there) - this was the dark pill floating above the swimmer */
      if (!below && camUp) {   // Shifat 5:05 AM: analytic ray-traced REFRACTION of the heroes - the bent (Snell) ray under the surface is tested against
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
        /* Shifat Oct 31 12:44 'water mist gets transparent around heroes while swimming': a soft clear pocket of water around a hero at the
           surface (or just under it), so legs and torso read through the water; fades out over ~1-2.6 m so there is no window edge. */
        float pkA = uHeroA.w > 0.5 && uHeroA.y < hwA + 0.4 && uHeroA.y > hwA - 3.5 ? 1.0 - smoothstep(0.9, 2.6, length(vW.xz - uHeroA.xz)) : 0.0;
        float pkB = uHeroB.w > 0.5 && uHeroB.y < hwB + 0.4 && uHeroB.y > hwB - 3.5 ? 1.0 - smoothstep(0.8, 2.3, length(vW.xz - uHeroB.xz)) : 0.0;
        heroSee = max(heroSee, max(pkA, pkB) * 0.8);
        /* #3 (Shifat 2:53 PM): the real heroes now draw through the water from the hero pass (src/heroHD.ts HERO_WATER), so the analytic capsule stand-in is off */
        if (false) { vec3 Th = exp(-vec3(0.45, 0.07, 0.02) * rt * 1.6); body = mix(body, rc * mix(0.35, 1.0, uDay) * (0.55 + 0.45 * uDay) * Th + body * (1.0 - Th) * 0.6, 0.9); }
      }
      float heroK = 0.0; vec3 heroC = vec3(0.0);
      if (!below && camUp && r.y > 0.0) {
        vec3 hc = vec3(0.0); float hk = 0.0, tA = -1.0, tB = -1.0;
        if (uHeroA.w > 0.5 && length(uHeroA.xz - vW.xz) < 40.0 && uHeroA.y + 1.55 > hwA) tA = capH(vW, r, vec3(uHeroA.x, max(uHeroA.y + 0.25, hwA), uHeroA.z), uHeroA.xyz + vec3(0.0, 1.55, 0.0), 0.34, uHeroDA);   /* only the part above the surface reflects (Shifat 5:12) */
        if (uHeroB.w > 0.5 && length(uHeroB.xz - vW.xz) < 40.0 && uHeroB.y + 1.5 > hwB) tB = capHit(vW, r, vec3(uHeroB.x, max(uHeroB.y + 0.25, hwB), uHeroB.z), uHeroB.xyz + vec3(0.0, 1.5, 0.0), 0.3);
        // Shifat 4:26 PM 'fix reflection of heroes on water, looks wrong': the solid hard-edged pill is now a soft, rippled, sea-tinted reflection that
        // matches the subtle blurry city mirror - a second, fatter capsule gives a feathered edge, the colour leans to the water's blue, and it fades with distance.
        float sA = (tA > 0.0) ? 1.0 : 0.0, sB = (tB > 0.0) ? 1.0 : 0.0;
        if (uHeroA.w > 0.5 && sA < 0.5 && length(uHeroA.xz - vW.xz) < 40.0 && uHeroA.y + 1.55 > hwA && capH(vW, r, vec3(uHeroA.x, max(uHeroA.y + 0.15, hwA), uHeroA.z), uHeroA.xyz + vec3(0.0, 1.7, 0.0), 0.55, uHeroDA) > 0.0) sA = 0.45;
        if (uHeroB.w > 0.5 && sB < 0.5 && length(uHeroB.xz - vW.xz) < 40.0 && uHeroB.y + 1.5 > hwB && capHit(vW, r, vec3(uHeroB.x, max(uHeroB.y + 0.15, hwB), uHeroB.z), uHeroB.xyz + vec3(0.0, 1.65, 0.0), 0.5) > 0.0) sB = 0.45;
        sA = heroSoftK(tA, sA > 0.0 ? 1.0 : -1.0); sB = heroSoftK(tB, sB > 0.0 ? 1.0 : -1.0);
        if (sA > 0.0) { hc = vec3(0.09, 0.11, 0.21); hk = sA; }   // Shadow's dark suit
        if (sB > 0.0 && (sA < 0.5 || tB < tA)) { hc = vec3(0.78, 0.82, 0.92); hk = sB; }   // Ghost's pale suit
        hc = heroReflCol(hc, refl, uDay); hk = heroReflW(hk, length(cameraPosition - vW));   /* shared water look (src/water/common.ts) */
        refl = mix(refl, hc, hk); heroK = hk; heroC = hc;
      }
      vec3 col = mix(body, refl, fr);
      col *= mix(vec3(1.0), mix(vec3(0.86, 0.95, 1.06), vec3(1.06, 1.05, 0.94), swPatch), smoothstep(40.0, 200.0, length(cameraPosition - vW)) * (below ? 0.0 : 1.0));   /* far-sea colour patches */
      { // boat wakes (Kelvin pattern, ref: Sea of Thieves / AC4 ship wakes): two foam arms at the 19.5 deg Kelvin angle + a churned centre trail and a bow wave,
        // laced by the caustic-cell network so it breaks up like real wake foam; fades over ~70 m. Up to 5 boats, early-out by distance.
        float wk = 0.0;
        for (int i = 0; i < 5; i++) { vec4 b = uBoat[i]; vec2 d = vW.xz - b.xy; if (dot(d, d) > 6400.0 || below) continue;
          vec2 fw = vec2(sin(b.z), cos(b.z)); float s = dot(d, fw), l = dot(d, vec2(fw.y, -fw.x)), bk = -s;
          float fade = (1.0 - smoothstep(-7.0, -4.5, s)) * (1.0 - smoothstep(8.0, 75.0, bk)) * clamp(b.w * 0.6, 0.0, 1.0);
          float arm = abs(abs(l) - max(bk - 5.0, 0.0) * 0.354 - 1.6), aw = 1.6 + max(bk, 0.0) * 0.14;   /* Shifat Nov 1 2:14 PM 'wake trail harsh, blur soft it': wider, fainter arms that diffuse as they age */
          float trail = exp(-l * l / (6.0 + max(bk, 0.0) * 0.4)) * (1.0 - smoothstep(3.0, 45.0, bk));
          float bow = exp(-pow(length(vec2(l * 0.8, s - 6.0)) - 2.8, 2.0) * 1.5) * smoothstep(2.0, 6.5, s);
          wk = max(wk, (exp(-arm * arm / aw) * 0.55 + trail * 0.45) * fade + bow * 0.45); }
        if (wk > 0.01) { float lace = texture2D(uCaus, vW.xz * 0.23 + vec2(uTime * 0.01, 0.0)).r + 0.5 * texture2D(uCaus, vW.xz * 0.61).g;
          col = mix(col, vec3(0.95, 0.98, 1.0) * mix(0.35, 1.0, uDay), clamp(wk * smoothstep(0.05, 1.2, lace * 0.8 + wk * 0.35), 0.0, 1.0) * 0.6);
          n = normalize(n + vec3(texture2D(uCaus, vW.xz * 0.23 + 0.5).r - texture2D(uCaus, vW.xz * 0.23).r, 0.0, texture2D(uCaus, vW.xz * 0.37 + 0.3).b - texture2D(uCaus, vW.xz * 0.37 + 0.8).b) * smoothstep(0.01, 0.3, wk) * 0.4);   /* zero-mean bend that fades in with the foam: the old (lace - 0.75) tilted the whole Kelvin wedge one way, so its Fresnel / clarity flipped at the wk > 0.01 edge -> a hard-edged clear-water box behind boats (Shifat Nov 1 2:14 PM screenshot) */   /* churned wake water: the bent normal breaks the sun glitter into scattered sparkles along the arms and trail */
          col *= 1.0 - 0.07 * exp(-pow(abs(wk - 0.2) * 3.0, 2.0)); }   /* faint troughs just outside the foam give the wake relief */
      }
      col = mix(col, heroC, heroK * (max(fr, 0.32) - fr) * 0.5);   /* the hero blocks the bright sky it would otherwise mirror: a readable silhouette even at low Fresnel (seen on real calm water) */
      if (uBench.y > 3.5 && uBench.y < 4.5) { gl_FragColor = vec4(col, 0.95); return; }   /* telemetry stage bench */
      col += max(nGlow - 0.22, 0.0) * vec3(0.5, 0.64, 0.9) * 1.6 * (1.0 - uDay) * (1.0 - fr);   /* Shifat 10:24 PM: night reflections get the same darker blue tint */
      col += nGW * vec3(0.55, 0.68, 0.95) * 1.55 * smoothstep(15.0, 60.0, length(cameraPosition.xz - vW.xz)) * (1.0 - uDay) * (1.0 - 0.5 * fr);   /* the city's night light, mirrored soft (coverage-weighted, no threshold: no hard edges) */
      // Sun glitter path: Blinn-Phong on the detailed normal, sharp up close and wider with distance so the sparkles stretch into a path toward a low
      // sun; warm orange at sunset, white at noon. Added after the day/night dimming so it stays bright.
      vec3 sunC = mix(vec3(1.0, 0.42, 0.16), vec3(1.0, 0.93, 0.82), smoothstep(0.02, 0.35, uSun.y));
      float lowSun = (1.0 - smoothstep(0.06, 0.4, uSun.y)) * smoothstep(-0.05, 0.03, uSun.y);   /* RDR2 / Sea of Thieves sunset: a broad golden glitter road on the sea toward a low sun, not a thin strip */
      float ndh = max(dot(n, normalize(uSun + v)), 0.0), shin = mix(1800.0, 40.0, pow(smoothstep(8.0, 380.0, wDist), 0.6)) * (1.0 - 0.7 * lowSun), rs = max(dot(r, uSun), 0.0);
      float gl0 = pow(ndh, shin) * shin * (0.0075 + 0.012 * lowSun); gl0 = (0.55 + 0.6 * lowSun) * (1.0 - exp(-0.7 * gl0)) * mix(0.25, 1.0, smoothstep(6.0, 90.0, wDist));   /* frame-by-frame sim (Shifat 5:05 AM): the near glint saturated into flat white blobs (peak ~5 clamped at 2.2) - now sharper and softly compressed: sparkles, not foam-like patches */
      vec3 sunSpec = sunC * min(gl0 + pow(rs, 40.0) * 0.3 + pow(rs, 8.0) * 0.12 * (1.0 - smoothstep(0.1, 0.5, uSun.y)), 2.2) * smoothstep(-0.05, 0.04, uSun.y);   // + a broad warm sheen when the sun is low
      float hW = farS ? wh(vP0, uTime) : hW0;   /* evaluated once per pixel (was twice) */
      col += vec3(0.1, 0.45, 0.5) * smoothstep(0.1, 1.0, hW) * 0.25 * (1.0 - fr) * (1.0 - smoothstep(60.0, 180.0, wDist));   /* Nov 1: the crest tint followed the wave height at the UNDISPLACED point, which the coarse far grid maps through big triangles; its sharp threshold drew blocky staircases on the sea from the air. Softer ramp, and faded past 60-180 m where the crests are sub-pixel anyway */
      // Whitecaps (ref: Sea of Thieves / AC Black Flag): foam where the wind-wave crests peak, broken into lacy cells by the caustic network
      // (same thin-line structure as real crest foam), drifting with the wave; thin streaks trail behind. One extra fetch; fades with distance.
      float crest = 0.0;   /* Shifat 4:30 AM 'Hate foams': open-sea whitecaps + crest foam removed (also 3 texture reads less per sea pixel) */
      float sd = -222.0 - vW.z; float sf = smoothstep(24.0, 0.0, sd) * (0.5 + 0.5 * sin(sd * 1.3 - uTime * 1.8 + sin(vW.x * 0.4) * 2.0));
      col = mix(col, vec3(1.0, 0.97, 0.92), clamp(sf, 0.0, 1.0) * step(0.0, sd) * 0.15);
      if (uBench.y > 4.5 && uBench.y < 5.5) { gl_FragColor = vec4(col, 0.95); return; }   /* telemetry stage bench */
      float aOut = mix(0.82, 1.0, max(fr, 0.0)); aOut = mix(aOut, 1.0, bedA * bedShore);
      { // South Sea 2b (real tropical refs: Maldives / Bora Bora): turquoise shallows around the island's white sand + a foam line at the shore
        vec2 iq = vW.xz - vec2(-160.0, -820.0); float ia = atan(iq.y, iq.x); float irr = length(iq) / (92.0 * (1.0 + 0.13 * sin(2.0 * ia + 3.16) + 0.085 * sin(3.0 * ia + 5.06) + 0.05 * sin(5.0 * ia + 0.83) + 0.03 * sin(8.0 * ia + 4.71) + 0.018 * sin(13.0 * ia + 2.25)));   // = seaWorld coastK
        { vec2 fq = vW.xz - vec2(392.0, -585.0); float fa = atan(fq.y, fq.x); float frr = length(fq) / (98.0 * (1.0 + 0.09 * sin(3.0 * fa + 0.7) + 0.05 * sin(5.0 * fa + 2.1) + 0.03 * sin(9.0 * fa + 4.0)));   // = seaWorld farmRR (Farm Isle)
          if (frr < irr) { irr = frr; iq = fq; ia = fa; } }
        { vec2 cq = vW.xz - vec2(-440.0, -500.0); float ca = atan(cq.y, cq.x); float crr = length(cq) / (62.0 * (1.0 + 0.11 * sin(2.0 * ca + 1.9) + 0.07 * sin(5.0 * ca + 0.4) + 0.04 * sin(11.0 * ca + 2.7))) * 1.04;   // = seaWorld iceRR (Ice Isle; glacial milky shallows)
          if (crr < irr) { irr = crr; iq = cq; ia = ca; } }
        if (irr < 1.6 && !below) {
          float sh = 1.0 - smoothstep(0.93, 1.5, irr);
          vec3 tq = mix(vec3(0.11, 0.64, 0.68), vec3(0.52, 0.94, 0.86), 1.0 - smoothstep(0.92, 1.18, irr)) * mix(0.25, 1.0, uDay);
          col = mix(col, mix(tq, col, fr * 0.45), sh * 0.92 * (1.0 - bedA * 0.8));
          /* Shifat 8:35 PM: the FBM caustic-cell layers drawn ON the surface read as a fake caustic texture -> removed (seabed caustics stay, seen through the water) */
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
        { float rl = clamp(0.5 + (n.x - n.z) * 2.2, 0.0, 1.0);   /* Shifat 8:57 PM 'surface from below has caustic patterns': the underside shimmer now comes from the real wave normals (was 2 caustic-cell texture reads) */
          under *= 1.0 + (rl * 0.5 - 0.25) * uDay * (1.0 - smoothstep(25.0, 90.0, length(cameraPosition - vW))); }
        vec3 tr = refract(-v, n, 1.3310), tg = refract(-v, n, 1.3330), tb = refract(-v, n, 1.3375);
        bool tir = dot(tg, tg) < 0.0001;
        vec3 zc = vec3(0.55, 0.76, 0.96) * mix(0.12, 1.0, uDay);   /* AAA Snell window: a bright sky disc overhead (was a dull dark-blue zenith) with the sun blazing through it */
        vec3 sr = mix(uSky, zc, smoothstep(0.0, 0.45, tr.y)), sg = mix(uSky, zc, smoothstep(0.0, 0.45, tg.y)), sb = mix(uSky, zc, smoothstep(0.0, 0.45, tb.y));
        vec3 win = vec3(sr.r, sg.g, sb.b);
        if (!tir) {   /* Shifat 2:36 PM 'water surface when underwater must show what's in the air': the skyline ring (city, bridge, island) inside Snell's window, refracted (squeezed toward the window rim) and wobbling with the surface - one fetch */
          vec3 tn = normalize(tg), nbw; vec4 aw = airTrace(vec3(vW.x, 0.0, vW.z), tn, nbw, 1.0);   /* Nov 1 4:39 PM ring deleted: the same analytic air trace as the reflection, along the refracted ray */
          win = mix(win, aw.rgb * mix(0.3, 0.5, uDay), aw.a * 0.9); }   // seen from below against the bright sky disc, the shore reads as a darker silhouette band at the rim
        if (!tir) win += vec3(1.0, 0.95, 0.82) * (pow(max(dot(normalize(tg), uSun), 0.0), 220.0) * 3.0 + pow(max(dot(normalize(tg), uSun), 0.0), 12.0) * 0.25) * uDay;
        // A narrow rough-surface critical-angle transition avoids a binary colour/alpha rim.
        float critical = smoothstep(0.84, 1.04, s2);
        /* Shifat 10:38-10:48 PM: from below the surface shows what's in the air, semi-transparent, no visible edges (refs: Wikimedia Snell's window photos -
           a bright soft sky disc overhead, the air seen wavy and blurred through it, outside it a darker teal mirror of the water, soft rim) */
        { float crit2 = smoothstep(0.62, 1.12, s2);
          vec3 td = normalize(-v + n * vec3(0.18, 0.0, 0.18)); td.y = max(td.y, 0.02); td = normalize(td);
          vec3 aw2 = mix(uSky, zc, smoothstep(0.0, 0.45, td.y));
          vec3 nbw2; vec4 at2 = airTrace(vec3(vW.x, 0.0, vW.z), td, nbw2, 1.0); aw2 = mix(aw2, mix(aw2, at2.rgb * mix(0.3, 0.6, uDay), 0.55), at2.a * 0.6);
          aw2 += vec3(1.0, 0.95, 0.82) * (pow(max(dot(td, uSun), 0.0), 60.0) * 0.9 + pow(max(dot(td, uSun), 0.0), 8.0) * 0.2) * uDay;
          /* outside Snell's window: total internal reflection mirrors the underwater world (real refs /tmp/uwr: the pool floor/lane lines seen mirrored in the
             surface beyond the bright disc) - reflected ray traced down to the seabed, sand + caustic pattern, fogged by the path length, wobbling with the waves, soft */
          vec3 mrr = reflect(-v, normalize(mix(vec3(0.0, -1.0, 0.0), n, 0.6))); mrr.y = min(mrr.y, -0.08);
          float mbd = max(vW.y - bedY(vW.xz), 0.5), mt = mbd / -mrr.y; vec2 mh = vW.xz + mrr.xz * mt;
          float mtd = max(vW.y - bedY(mh), 0.5); mt = mtd / -mrr.y; mh = vW.xz + mrr.xz * mt;
          float mca = texture2D(uCaus, mh * 0.09 + uTime * 0.01).r * 0.6 + texture2D(uCaus, mh * 0.21 - uTime * 0.013).g * 0.4;
          vec3 mfl = vec3(0.62, 0.6, 0.46) * mix(0.1, 1.0, uDay) * (0.75 + 0.6 * mca * uDay);
          vec3 mirr = mix(mfl * vec3(0.6, 0.9, 0.95) * 1.3, under, 1.0 - exp(-(mt + mtd) * 0.022));
          vec3 outside = mix(under * 0.9, mirr, 0.95);
          col = mix(mix(aw2, under, 0.22 + 0.5 * clamp(fr, 0.0, 1.0)), outside, crit2);
          aOut = mix(0.6, 0.86, crit2); }
      }
      // Shifat 4:33 AM: distance exp-squared fog - clear near the player, then rolls in fast, hiding low-res reflections/far detail and the
      // horizon edge of big water bodies (and lets the far shading/mirror work stop early). Phones fog a little closer.
      if (uBench.y > 5.5 && uBench.y < 6.5) { gl_FragColor = vec4(col, 0.95); return; }   /* telemetry stage bench */
      float fd = max(length(cameraPosition - vW) - 35.0, 0.0) * uFogK; float haze = max(1.0 - exp(-fd * fd), 1.0 - exp(-length(cameraPosition - vW) * 0.0035));
      if (below) col = mix(col, mix(uUWF, uWaterDisplay, 0.65) * (1.0 + 0.9 * pow(1.0 - clamp(abs(v.y), 0.0, 1.0), 2.5)), smoothstep(45.0, 190.0, length(cameraPosition - vW)));   /* Shifat Nov 1 'one world': far off, the underside takes exactly the sea wall's junction colour (seabed.ts), so surface, wall and bed meet at the horizon with no band */
      if (below) col += uWaterDisplay * 0.9 * pow(1.0 - clamp(abs(v.y), 0.0, 1.0), 2.5) * (1.0 - smoothstep(45.0, 190.0, length(cameraPosition - vW)));   // soft light band toward the horizon, dark overhead (ref: Abzu key art vertical gradient)
      col = mix(col, uSky, haze * (below ? 0.0 : 0.75));
      if (!below) {
        col *= mix(0.3, 1.0, uDay);
        { float dR = length(cameraPosition - vW), hzW = min(0.93, 1.0 - exp(-dR * 0.0021));   // same haze the reflected buildings themselves get (HAZE_K)
          col = mix(col, mix(skR * mix(0.75, 1.0, uDay), uSky * mix(0.3, 1.0, uDay), hzW), skA * clamp(fr * 1.0 + 0.05, 0.0, 0.45)); }   /* Nov 2 real-photo A/B: island/city mirror was too dark vs real shallows -> fainter */   // physical Fresnel weight (strong at grazing, faint looking down)
        col += sunSpec * (1.0 - haze * 0.5);
        // Stylised cool night-sky lobe, not scene reflections or a physical moon model.
        col += vec3(0.18, 0.26, 0.38) * (1.0-uDay) * pow(max(dot(r, normalize(vec3(-0.3, 0.6, -0.5))), 0.0), 12.0);
        // Night read from above (Shifat 2:29 PM screenshots: flat black): a broad dim moon-sky sheen across the ripples plus a sparse moon glint path.
        { vec3 md = normalize(vec3(-0.3, 0.6, -0.5)); float mr = max(dot(r, md), 0.0); float nt = (1.0 - uDay) * (1.0 - smoothstep(-80.0, -40.0, vW.x) * (1.0 - smoothstep(-760.0, -720.0, vW.z)));   /* Neon Harbor night look stays untouched */
          vec3 mm = -uSun; float mup = smoothstep(-0.02, 0.1, mm.y), mq = max(dot(r, mm), 0.0);   /* Shifat Nov 2 8:40 PM moon photo: a soft moonlight glitter path under the REAL moon (was a fixed stylised direction) - the sun glitter recipe above (Blinn-Phong on the detailed normal, sharp near, stretched far), cool and dim */
          float ndm = max(dot(n, normalize(mm + v)), 0.0), shinM = mix(1400.0, 50.0, pow(smoothstep(8.0, 380.0, wDist), 0.6)), glM = pow(ndm, shinM) * shinM * 0.008; glM = (1.0 - exp(-0.7 * glM)) * mix(0.3, 1.0, smoothstep(6.0, 90.0, wDist));
          col += nt * (vec3(0.035, 0.06, 0.10) * pow(mr, 3.0) + (vec3(0.62, 0.7, 0.86) * glM * 0.8 + vec3(0.3, 0.36, 0.45) * pow(mq, 40.0) * 0.35) * mup * (1.0 - haze)); }
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
      float dCam = length(cameraPosition - vW); float nearK = (1.0 - smoothstep(30.0, 140.0, dCam)) * (1.0 - fr) * step(-222.0, -vW.z) * (1.0 - step(below ? 1.0 : 0.0, 0.5) * 0.0);
      float aAbove = mix(nearClear, 0.3, heroSee * (1.0 - fr * 0.5)); aAbove = min(aAbove, mix(1.0, 0.5, nearK));
      /* Shifat 12:57 AM 'the actual sea gets hidden until I swim': clear water - looking down near you the surface is mostly see-through (the
         seagrass, fish and seabed below show like the underwater view); grazing angles and distance keep the reflective surface */
      aAbove = min(aAbove, mix(mix(0.22, 1.0, fr * fr), 1.0, smoothstep(40.0, 150.0, dCam)));
      { float bdS = vW.y - bY0; aAbove = mix(aAbove, 1.0, smoothstep(3.0, 9.0, bdS) * (1.0 - smoothstep(45.0, 70.0, bdS))); }   /* Shifat 3:39 AM: near shore the sea no longer shows the land under it - see-through only in the shallow band and over open deep water */
      // soft shorelines (AAA depth fade): where the sea is only a few cm deep over terrain - inlets, coarse terrain edges - it thins to nothing
      // instead of ending in a hard polygon edge; uses the depth of the scene copy the refraction already makes (no extra pass)
      if (uUseScene > 0.5 && !below) { vec2 suvF = vScreen.xy / vScreen.w * 0.5 + 0.5; float thr = vView.z - oceanZ(suvF), thk = thr < -2.5 ? 9.0 : max(thr, 0.0); aAbove *= smoothstep(0.0, 0.9, thk);   /* thr < 0: the low-res copy has an occluder (tree/hero) in front at this pixel - not shallow water, keep it solid (fixes dark blocks along tree silhouettes) */ col = mix(vec3(1.0, 0.99, 0.96) * mix(0.35, 1.0, uDay), col, smoothstep(0.05, 0.6, thk) * 0.6 + 0.4); }
      if (!below && uDay < 0.95) {   /* Shifat 10:37 PM 'reflection must' (ref: Wikimedia 'Aurora Borealis above Bear Lake, Alaska'): the aurora mirrored in the sea - soft, smeared by the ripples, strong where the curtain's bright hem sits low */
        vec3 rm = reflect(-v, normalize(mix(vec3(0.0, 1.0, 0.0), n, 0.45))); rm.y = abs(rm.y);
        float rk = (1.0 - smoothstep(300.0, 900.0, length(cameraPosition - vW)));
        col += ((uAur > 0.002 ? auroraSky(rm, uSkyT, 4.0) * uAur : vec3(0.0)) + moonSky(rm, uSun) * 0.8 + starsLite(rm) * 0.7) * (1.0 - uDay) * mix(0.5, 0.95, fr) * vec3(0.8, 0.95, 1.0) * rk; }
      if (!below && uDay > 0.05) {   /* Shifat 12:14 AM 'Must reflect': the cumulus mirrored in the sea - ripple-smeared, darker and blue-tinted like all reflections, stronger at grazing angles */
        vec3 rc = reflect(-v, normalize(mix(vec3(0.0, 1.0, 0.0), n, 0.5))); rc.y = abs(rc.y);
        vec4 cr = cloudSky(normalize(rc), uSun, uSkyT, 0.0, 0.0, uSky);
        float ck = cr.a * mix(0.55, 0.95, fr) * uDay * (1.0 - smoothstep(400.0, 1400.0, length(cameraPosition - vW)));
        col = mix(col, cr.rgb * vec3(0.78, 0.88, 0.98), ck); }
      if (!below && uRain > 0.01) col = mix(col, dot(col, vec3(0.3, 0.55, 0.15)) * vec3(0.82, 0.9, 1.0), uRain * 0.45);   /* storm sea goes slate grey like the real photos */
      if (!below && rainK > 0.0) col = mix(col * mix(1.0, 0.82, uRain), vec3(0.75, 0.82, 0.9) * mix(0.25, 1.0, uDay), clamp(rainK * 0.6, 0.0, 0.22));   /* rain: darker glassy water, ring crests catch the grey sky */
      if (!below && uFlash > 0.002) { vec3 rm3 = reflect(-v, normalize(mix(vec3(0.0, 1.0, 0.0), n, 0.6))); rm3.y = abs(rm3.y); col += lightningSky(rm3, uFd, uFlash) * mix(0.15, 0.4, fr) + vec3(0.6, 0.66, 0.8) * uFlash * 0.03; }   /* lightning glows in the sea, soft */
      if (!below && uBow > 0.02 && uDay > 0.05) { vec3 rm2 = reflect(-v, normalize(mix(vec3(0.0, 1.0, 0.0), n, 0.45))); rm2.y = abs(rm2.y); col += rainbowSky(rm2, uSun, uBow, uDay) * mix(0.35, 0.8, fr); }   /* rainbow mirrored too */
      gl_FragColor = vec4(col, below ? aOut : aAbove);
    }`;
