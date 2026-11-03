// Single source of truth for the sea's wave field (Shifat 10:23 'codebase scalability & maintainability').
// The GLSL used by the sea shader (wh height / wg gradient) and the CPU height used by swimming + boats (waveSumJS)
// are both generated from these two tables, so they can never drift apart. Values are kept as the exact literal
// text the shader always used, so the generated GLSL is byte-identical to the hand-written version it replaced.

/** Long swells: [kx, kz, speed, amplitude]. */
export const LONG_WAVES: string[][] = [
    ['0.008', '0.005', '0.32', '0.78'],
    ['-0.012', '0.009', '0.42', '0.42'],
    ['0.033', '-0.023', '0.72', '0.12'],
    ['0.076', '0.054', '0.98', '0.035'],
];

/** Wind-wave trains at golden-angle directions, each with a slow envelope and a phase warp (never tiles):
 *  [envBase, envAmp, envKx, envKz, envPhase, envSpeed, kx, kz, warpAmp, warpKx, warpKz, warpPhase, speed, amplitude].
 *  The first 4 are the physics trains (also in waveSumJS); the last 5 are short visual chop (GLSL only, skippable via WG_CHOP). */
/* Spectrum pass (Shifat 3:23 PM): every train now moves at the deep-water dispersion speed w = sqrt(g k) (was ~half: slow-motion sea), and the
   5 visual chop trains have a real wind-sea steepness (k*A ~ 0.06-0.08, saturation range of the JONSWAP/Phillips spectrum) instead of ~0.02. */
export const GOLDEN_WAVES: string[][] = [
    ['0.55', '0.45', '-0.0018', '0.00583', '0.0', '0.03', '0.1464', '0.04529', '1.3', '-0.00317', '0.01025', '0.0 * 2.3', '1.2261', '0.26'],
    ['0.55', '0.45', '-0.00261', '-0.00551', '1.7', '0.03', '-0.19587', '0.0926', '1.3', '-0.00648', '-0.01371', '1.7 * 2.3', '1.4579', '0.18'],
    ['0.55', '0.45', '0.00565', '0.00231', '3.4', '0.03', '0.10942', '-0.26808', '1.3', '0.01877', '0.00766', '3.4 * 2.3', '1.6854', '0.12'],
    ['0.55', '0.45', '-0.00572', '0.00212', '5.1', '0.03', '0.13366', '0.36156', '1.3', '-0.02531', '0.00936', '5.1 * 2.3', '1.9446', '0.08'],
    ['0.5', '0.5', '0.0038', '-0.00738', '6.8', '0.04', '-0.45426', '-0.23365', '1.1', '0.01168', '-0.02271', '6.8', '2.2386', '0.150'],
    ['0.5', '0.5', '0.00219', '0.00801', '8.5', '0.04', '0.6967', '-0.19024', '1.1', '0.00951', '0.03483', '8.5', '2.6617', '0.096'],
    ['0.5', '0.5', '-0.00702', '-0.00443', '10.2', '0.04', '-0.54941', '0.87127', '1.1', '-0.04356', '-0.02747', '10.2', '3.1788', '0.060'],
    ['0.5', '0.5', '0.00817', '-0.00148', '11.9', '0.04', '-0.25427', '-1.40518', '1.1', '0.07026', '-0.01271', '11.9', '3.7428', '0.039'],
    ['0.5', '0.5', '-0.00502', '0.00661', '13.6', '0.04', '1.51557', '1.1525', '1.1', '-0.05763', '0.07578', '13.6', '4.3218', '0.027'],
];
export const PHYSICS_TRAINS = 4;

const SWELL_K = "float swellK(vec2 p){ return (1.0 + 1.3 * smoothstep(-300.0, -750.0, p.y)) * mix(0.22, 1.0, smoothstep(105.0, 215.0, length(p - vec2(-160.0, -820.0)))); }   // bigger swell offshore (greater ocean), calm around the island so waves lap its beach";
const HEAD_NOTE = "  // Shifat 3:17/3:30 AM 'waves must never tile' (+ phase warp: crests bend, never straight parallel rows): 4 wind-wave trains at golden-angle directions (irrational ratios, so crests never re-align), deep-water\n  // dispersion speeds, and each train's height modulated by its own slow envelope across the sea - the same trick AAA FFT oceans use to hide the tile.";
const CHOP_NOTE = "    /* 5 short chop trains (12-3 m, golden-angle, warped, own envelopes): visual only, too small to matter to the swim physics */";

function whLong(w: string[]) { return `  h += sin(dot(p, vec2(${w[0]}, ${w[1]})) + t * ${w[2]}) * ${w[3]};`; }
function wgLong(w: string[]) { return `  g += cos(dot(p, vec2(${w[0]}, ${w[1]})) + t * ${w[2]}) * ${w[3]} * vec2(${w[0]}, ${w[1]});`; }
function env(w: string[]) { return `m = ${w[0]} + ${w[1]} * sin(dot(p, vec2(${w[2]}, ${w[3]})) + ${w[4]} + t * ${w[5]});`; }
function arg(w: string[]) { return `dot(p, vec2(${w[6]}, ${w[7]})) + ${w[8]} * sin(dot(p, vec2(${w[9]}, ${w[10]})) + ${w[11]}) + t * ${w[12]}`; }
function whGold(w: string[]) { return `    ${env(w)} h += sin(${arg(w)}) * ${w[13]} * m;`; }
function wgGold(w: string[]) { return `    ${env(w)} g += cos(${arg(w)}) * ${w[13]} * m * vec2(${w[6]}, ${w[7]});`; }

/** GLSL: swellK(), wh() height and wg() gradient. Define WG_CHOP (bool expr) before including to skip the chop trains in wg. */
export const WAVES_GLSL = [
    '', SWELL_K,
    'float wh(vec2 p, float t){', '  float h = 0.0;', ...LONG_WAVES.map(whLong), HEAD_NOTE, '  { float m;',
    ...GOLDEN_WAVES.slice(0, PHYSICS_TRAINS).map(whGold), CHOP_NOTE, ...GOLDEN_WAVES.slice(PHYSICS_TRAINS).map(whGold),
    '  }', '  return h * swellK(p);', '}',
    '#ifndef WG_CHOP', '#define WG_CHOP true', '#endif',
    'vec2 wg(vec2 p, float t){', '  vec2 g = vec2(0.0);', ...LONG_WAVES.map(wgLong), '  { float m;',
    ...GOLDEN_WAVES.slice(0, PHYSICS_TRAINS).map(wgGold), '    if (WG_CHOP) {   /* 5 short chop trains (12-3 m) */', ...GOLDEN_WAVES.slice(PHYSICS_TRAINS).map(wgGold), '    }',
    '  }', '  return g * swellK(p);', '}'].join('\n');

const NL = LONG_WAVES.map(w => w.map(Number));
const NG = GOLDEN_WAVES.slice(0, PHYSICS_TRAINS).map(w => w.map((v, i) => i === 11 ? v.split('*').reduce((a, b) => a * Number(b), 1) : Number(v)));
/** CPU wave height before the swell factor: the 4 long swells + the 4 physics trains (same maths and summation order as wh()). */
export function waveSumJS(x: number, z: number, t: number) {
    let s = 0;
    for (const w of NL) s += Math.sin(x * w[0] + z * w[1] + t * w[2]) * w[3];
    for (const w of NG) s += Math.sin(x * w[6] + z * w[7] + w[8] * Math.sin(x * w[9] + z * w[10] + w[11]) + t * w[12]) * w[13] * (w[0] + w[1] * Math.sin(x * w[2] + z * w[3] + w[4] + t * w[5]));
    return s;
}


/* Gerstner (Shifat 3:23 PM 'realistic yet highly optimized waves: study fft, gerstner, spectrum'): the swell + physics trains also move the
   surface sideways toward each crest (x = x0 - Q*A*dir*cos), so crests come out sharp and troughs broad and flat like real sea, instead of
   round sine humps. Only trains longer than the vertex grid (>= 16 m) displace; the fragment shader gets the matching Jacobian term J so the
   lighting sharpens at the crests too (normal = (-gx, 1 - J, -gz)). Q = steepness share per train (sum of Q*k*A stays < 1: no loops). */
export const GERSTNER_Q = 0.9;
function kn(w: string[], a: number, b: number) { const x = Number(w[a]), z = Number(w[b]), l = Math.hypot(x, z); return [x / l, z / l, l]; }
function wdLong(w: string[]) { const [dx, dz] = kn(w, 0, 1); return `  d -= cos(dot(p, vec2(${w[0]}, ${w[1]})) + t * ${w[2]}) * ${w[3]} * vec2(${dx.toFixed(5)}, ${dz.toFixed(5)});`; }
function wdGold(w: string[]) { const [dx, dz] = kn(w, 6, 7); return `    ${env(w)} d -= cos(${arg(w)}) * ${w[13]} * m * vec2(${dx.toFixed(5)}, ${dz.toFixed(5)});`; }
function wjLong(w: string[]) { const [, , k] = kn(w, 0, 1); return `  { float a = dot(p, vec2(${w[0]}, ${w[1]})) + t * ${w[2]}; g += cos(a) * ${w[3]} * vec2(${w[0]}, ${w[1]}); j += sin(a) * ${(Number(w[3]) * k).toFixed(5)}; }`; }
function wjGold(w: string[]) { const [, , k] = kn(w, 6, 7); return `    ${env(w)} { float a = ${arg(w)}; g += cos(a) * ${w[13]} * m * vec2(${w[6]}, ${w[7]}); j += sin(a) * ${(Number(w[13]) * k).toFixed(5)} * m; }`; }
/** GLSL: wdisp() horizontal Gerstner displacement (vertex) and wgj() = (gradient.xy, Jacobian J) for the fragment normal. Needs WAVES_GLSL first. */
export const GERSTNER_GLSL = [
    '', `#define GQ ${GERSTNER_Q.toFixed(2)}`,
    'vec2 wdisp(vec2 p, float t){', '  vec2 d = vec2(0.0);', ...LONG_WAVES.map(wdLong), '  { float m;',
    ...GOLDEN_WAVES.slice(0, PHYSICS_TRAINS).map(wdGold), '  }', '  return d * (GQ * swellK(p));', '}',
    'vec3 wgj(vec2 p, float t){', '  vec2 g = vec2(0.0); float j = 0.0;', ...LONG_WAVES.map(wjLong), '  { float m;',
    ...GOLDEN_WAVES.slice(0, PHYSICS_TRAINS).map(wjGold), '    if (WG_CHOP) {', ...GOLDEN_WAVES.slice(PHYSICS_TRAINS).map(wjGold), '    }',
    '  }', '  float s = swellK(p); return vec3(g * s, j * GQ * s);', '}'].join('\n');


/* Sea sim (Shifat 4:40 AM 'sea is glitching'): the camera-following sheet snaps every OCEAN_SNAP m, and its warped grid is coarse away from the
   camera (~4 m at 20 m, ~9 m at 100 m). Wave trains shorter than ~2 grid cells were point-sampled by the vertices, so each snap resampled them
   differently = visible jumps ("swimming" waves). The vertex versions below fade each train out where the local grid can't carry it
   (Nyquist: k * spacing < pi); the per-pixel normals still draw all the detail, so the look stays. */
function aa(k: number) { return `smoothstep(${(0.9 * Math.PI / k).toFixed(3)}, ${(0.45 * Math.PI / k).toFixed(3)}, sp)`; }
function kOf(w: string[], a: number, b: number) { return Math.hypot(Number(w[a]), Number(w[b])); }
function whLongV(w: string[]) { return `  h += sin(dot(p, vec2(${w[0]}, ${w[1]})) + t * ${w[2]}) * ${w[3]} * ${aa(kOf(w, 0, 1))};`; }
function whGoldV(w: string[]) { return `    ${env(w)} h += sin(${arg(w)}) * ${w[13]} * m * ${aa(kOf(w, 6, 7))};`; }
function wdLongV(w: string[]) { const [dx, dz, k] = kn(w, 0, 1); return `  d -= cos(dot(p, vec2(${w[0]}, ${w[1]})) + t * ${w[2]}) * ${w[3]} * ${aa(k)} * vec2(${dx.toFixed(5)}, ${dz.toFixed(5)});`; }
function wdGoldV(w: string[]) { const [dx, dz, k] = kn(w, 6, 7); return `    ${env(w)} d -= cos(${arg(w)}) * ${w[13]} * m * ${aa(k)} * vec2(${dx.toFixed(5)}, ${dz.toFixed(5)});`; }
/** GLSL (vertex only): whV / wdispV = wh / wdisp with each train faded by the local grid spacing sp (metres). Needs WAVES_GLSL first. */
export const WAVES_V_GLSL = [
    '', 'float whV(vec2 p, float t, float sp){', '  float h = 0.0;', ...LONG_WAVES.map(whLongV), '  { float m;', ...GOLDEN_WAVES.map(whGoldV), '  }', '  return h * swellK(p);', '}',
    'vec2 wdispV(vec2 p, float t, float sp){', '  vec2 d = vec2(0.0);', ...LONG_WAVES.map(wdLongV), '  { float m;', ...GOLDEN_WAVES.slice(0, PHYSICS_TRAINS).map(wdGoldV), '  }', '  return d * (GQ * swellK(p));', '}'].join('\n');

/* Shifat 11:44 PM 'sea wave math is the cause': the vertex shader ran every train twice (whV for height, wdispV for the sideways Gerstner push, each
   recomputing the same envelope and phase), and the pixel shader did the same with wh() + wgj(). These merged versions compute each train's
   envelope + phase once and give both results: identical numbers, about half the trig. A train the local grid can't carry (its Nyquist fade
   is exactly 0 at this vertex's spacing sp) is skipped outright instead of computed and multiplied by 0 - most far vertices skip most trains. */
function whdLongV(w: string[]) { const [dx, dz, k] = kn(w, 0, 1); return `  if (sp < ${(0.9 * Math.PI / k).toFixed(3)}) { float a = dot(p, vec2(${w[0]}, ${w[1]})) + t * ${w[2]}; float f = ${w[3]} * ${aa(k)}; h += sin(a) * f; d -= cos(a) * f * vec2(${dx.toFixed(5)}, ${dz.toFixed(5)}); }`; }
function whdGoldV(w: string[]) { const [dx, dz, k] = kn(w, 6, 7); return `    if (sp < ${(0.9 * Math.PI / k).toFixed(3)}) { ${env(w)} float a = ${arg(w)}; float f = ${w[13]} * m * ${aa(k)}; h += sin(a) * f; d -= cos(a) * f * vec2(${dx.toFixed(5)}, ${dz.toFixed(5)}); }`; }
/** GLSL (vertex only): whdV = vec3(whV, wdispV) in one pass. Needs WAVES_GLSL + GERSTNER_GLSL (GQ) first. */
export const WAVES_VD_GLSL = [
    '', 'vec3 whdV(vec2 p, float t, float sp){', '  float h = 0.0; vec2 d = vec2(0.0);', ...LONG_WAVES.map(whdLongV), '  { float m;',
    ...GOLDEN_WAVES.slice(0, PHYSICS_TRAINS).map(whdGoldV), ...GOLDEN_WAVES.slice(PHYSICS_TRAINS).map((w) => `    if (sp < ${(0.9 * Math.PI / kOf(w, 6, 7)).toFixed(3)}) {${whGoldV(w).trim()} }`), '  }',
    '  float s = swellK(p); return vec3(h * s, d * (GQ * s));', '}'].join('\n');
function whjLong(w: string[]) { const [, , k] = kn(w, 0, 1); return `  { float a = dot(p, vec2(${w[0]}, ${w[1]})) + t * ${w[2]}; float sa = sin(a); g += cos(a) * ${w[3]} * vec2(${w[0]}, ${w[1]}); j += sa * ${(Number(w[3]) * k).toFixed(5)}; h += sa * ${w[3]}; }`; }
function whjGold(w: string[]) { const [, , k] = kn(w, 6, 7); return `    ${env(w)} { float a = ${arg(w)}; float sa = sin(a); g += cos(a) * ${w[13]} * m * vec2(${w[6]}, ${w[7]}); j += sa * ${(Number(w[13]) * k).toFixed(5)} * m; h += sa * ${w[13]} * m; }`; }
/* Perf item 10 (sea vertex cost): the sea's vertex shader ran every train twice per vertex - whdV() (faded height + Gerstner push) and then
   wghj() (gradient, Jacobian, unfaded height for the pixel normals) - each recomputing the same envelope, phase, sin and cos at the same point.
   whdgjV() gives both results from one envelope + phase + sin/cos per train: same terms, same accumulation order, same values. */
function vdjLong(w: string[]) { const [dx, dz, k] = kn(w, 0, 1); return `  { float a = dot(p, vec2(${w[0]}, ${w[1]})) + t * ${w[2]}; float sa = sin(a), ca = cos(a); g += ca * ${w[3]} * vec2(${w[0]}, ${w[1]}); j += sa * ${(Number(w[3]) * k).toFixed(5)}; hj += sa * ${w[3]}; if (sp < ${(0.9 * Math.PI / k).toFixed(3)}) { float f = ${w[3]} * ${aa(k)}; h += sa * f; d -= ca * f * vec2(${dx.toFixed(5)}, ${dz.toFixed(5)}); } }`; }
function vdjGold(w: string[]) { const [dx, dz, k] = kn(w, 6, 7); return `    ${env(w)} { float a = ${arg(w)}; float sa = sin(a), ca = cos(a); g += ca * ${w[13]} * m * vec2(${w[6]}, ${w[7]}); j += sa * ${(Number(w[13]) * k).toFixed(5)} * m; hj += sa * ${w[13]} * m; if (sp < ${(0.9 * Math.PI / k).toFixed(3)}) { float f = ${w[13]} * m * ${aa(k)}; h += sa * f; d -= ca * f * vec2(${dx.toFixed(5)}, ${dz.toFixed(5)}); } }`; }
function vdjChop(w: string[]) { const [, , k] = kn(w, 6, 7); return `    ${env(w)} { float a = ${arg(w)}; float sa = sin(a); if (WG_CHOP) { g += cos(a) * ${w[13]} * m * vec2(${w[6]}, ${w[7]}); j += sa * ${(Number(w[13]) * k).toFixed(5)} * m; } hj += sa * ${w[13]} * m; if (sp < ${(0.9 * Math.PI / k).toFixed(3)}) h += sa * ${w[13]} * m * ${aa(k)}; }`; }
/** GLSL (vertex only): whdgjV = whdV() (returned) + wghj() (out gj, hOut) in one pass. Needs WAVES_GLSL + GERSTNER_GLSL (GQ) first; WG_CHOP as in wghj. */
export const WAVES_VDJ_GLSL = [
    '', 'vec3 whdgjV(vec2 p, float t, float sp, out vec3 gjOut, out float hOut){', '  float h = 0.0, hj = 0.0, j = 0.0; vec2 d = vec2(0.0), g = vec2(0.0);', ...LONG_WAVES.map(vdjLong), '  { float m;',
    ...GOLDEN_WAVES.slice(0, PHYSICS_TRAINS).map(vdjGold), ...GOLDEN_WAVES.slice(PHYSICS_TRAINS).map(vdjChop), '  }',
    '  float s = swellK(p); hOut = hj * s; gjOut = vec3(g * s, j * GQ * s); return vec3(h * s, d * (GQ * s));', '}'].join('\n');
/** GLSL (fragment): wghj = wgj() plus the wave height wh() in the same pass (out h). Chop trains skipped by WG_CHOP still add their height. */
export const WGHJ_GLSL = [
    '', 'vec3 wghj(vec2 p, float t, out float hOut){', '  vec2 g = vec2(0.0); float j = 0.0, h = 0.0;', ...LONG_WAVES.map(whjLong), '  { float m;',
    ...GOLDEN_WAVES.slice(0, PHYSICS_TRAINS).map(whjGold), '    if (WG_CHOP) {', ...GOLDEN_WAVES.slice(PHYSICS_TRAINS).map(whjGold), '    } else {',
    ...GOLDEN_WAVES.slice(PHYSICS_TRAINS).map(whGold), '    }', '  }', '  float s = swellK(p); hOut = h * s; return vec3(g * s, j * GQ * s);', '}'].join('\n');


/* Waterline (Shifat Nov 2 10:44 AM 'water line must not bleed underwater or wave to air'): the exact surface the sea MESH draws, on the CPU, so the
   half-underwater lens line is cut on the same waves the sea shows (waveSumJS above has no chop and no sideways Gerstner push: it sat up to
   ~0.4 m off the drawn surface, which let waves poke into the air half). Same tables, same per-train grid fades and skips as whdV(). */
const NGA = GOLDEN_WAVES.map(w => w.map((v, i) => i === 11 ? v.split('*').reduce((a, b) => a * Number(b), 1) : Number(v)));
const NLD = LONG_WAVES.map(w => { const [dx, dz, k] = kn(w, 0, 1); return [...w.map(Number), dx, dz, 0.9 * Math.PI / k, 0.45 * Math.PI / k]; });
const NGD = NGA.map((w, i) => { const [dx, dz, k] = kn(GOLDEN_WAVES[i], 6, 7); return [...w, dx, dz, 0.9 * Math.PI / k, 0.45 * Math.PI / k]; });
const sst = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** swellK() of the shader. */
/** Upper bound of |waveMeshHJS| / swellKJS: every train at full strength in phase (the waterline solve skips view depths whose highest possible crest can't reach the line found so far). */
export const WAVE_HMAX = NLD.reduce((s, w) => s + Math.abs(w[3]), 0) + NGD.reduce((s, w) => s + Math.abs(w[13]) * (Math.abs(w[0]) + Math.abs(w[1])), 0);
export function swellKJS(x: number, z: number) { return (1 + 1.3 * sst(-300, -750, z)) * (0.22 + 0.78 * sst(105, 215, Math.hypot(x + 160, z + 820))); }
/** whdV() of the sea's vertex shader: out = [height, sideways x, sideways z] at the undisplaced point (x, z) for local grid spacing sp (m). */
export function waveMeshJS(x: number, z: number, t: number, sp: number, out: number[]) {
    let h = 0, dx = 0, dz = 0;
    for (const w of NLD) { if (sp >= w[6]) continue; const a = x * w[0] + z * w[1] + t * w[2], f = w[3] * sst(w[6], w[7], sp), c = Math.cos(a); h += Math.sin(a) * f; dx -= c * f * w[4]; dz -= c * f * w[5]; }
    for (let i = 0; i < NGD.length; i++) { const w = NGD[i]; if (sp >= w[16]) continue;
        const m = w[0] + w[1] * Math.sin(x * w[2] + z * w[3] + w[4] + t * w[5]), a = x * w[6] + z * w[7] + w[8] * Math.sin(x * w[9] + z * w[10] + w[11]) + t * w[12], f = w[13] * m * sst(w[16], w[17], sp);
        h += Math.sin(a) * f; if (i < PHYSICS_TRAINS) { const c = Math.cos(a); dx -= c * f * w[14]; dz -= c * f * w[15]; } }
    const s = swellKJS(x, z); out[0] = h * s; out[1] = dx * GERSTNER_Q * s; out[2] = dz * GERSTNER_Q * s; return out;
}
/* Perf (waterline re-measure, Nov 2): the two halves of waveMeshJS for the waterline solve, bit-identical to it (same terms, same order).
   The Gerstner inversion only needs the sideways push (the 5 chop trains never push: skipped, no sin for heights), the final height needs no cos. */
/** waveMeshJS()'s out[1], out[2] only. */
export function waveDispJS(x: number, z: number, t: number, sp: number, out: number[]) {
    let dx = 0, dz = 0;
    for (const w of NLD) { if (sp >= w[6]) continue; const a = x * w[0] + z * w[1] + t * w[2], f = w[3] * sst(w[6], w[7], sp), c = Math.cos(a); dx -= c * f * w[4]; dz -= c * f * w[5]; }
    for (let i = 0; i < PHYSICS_TRAINS; i++) { const w = NGD[i]; if (sp >= w[16]) continue;
        const m = w[0] + w[1] * Math.sin(x * w[2] + z * w[3] + w[4] + t * w[5]), a = x * w[6] + z * w[7] + w[8] * Math.sin(x * w[9] + z * w[10] + w[11]) + t * w[12], f = w[13] * m * sst(w[16], w[17], sp);
        const c = Math.cos(a); dx -= c * f * w[14]; dz -= c * f * w[15]; }
    const s = swellKJS(x, z); out[1] = dx * GERSTNER_Q * s; out[2] = dz * GERSTNER_Q * s; return out;
}
/** waveMeshJS()'s out[0] only. */
export function waveMeshHJS(x: number, z: number, t: number, sp: number) {
    let h = 0;
    for (const w of NLD) { if (sp >= w[6]) continue; const a = x * w[0] + z * w[1] + t * w[2], f = w[3] * sst(w[6], w[7], sp); h += Math.sin(a) * f; }
    for (let i = 0; i < NGD.length; i++) { const w = NGD[i]; if (sp >= w[16]) continue;
        const m = w[0] + w[1] * Math.sin(x * w[2] + z * w[3] + w[4] + t * w[5]), a = x * w[6] + z * w[7] + w[8] * Math.sin(x * w[9] + z * w[10] + w[11]) + t * w[12], f = w[13] * m * sst(w[16], w[17], sp);
        h += Math.sin(a) * f; }
    return h * swellKJS(x, z);
}
