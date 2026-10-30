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
export const GOLDEN_WAVES: string[][] = [
    ['0.55', '0.45', '-0.0018', '0.00583', '0.0', '0.03', '0.1464', '0.04529', '1.3', '-0.00317', '0.01025', '0.0 * 2.3', '0.6744', '0.26'],
    ['0.55', '0.45', '-0.00261', '-0.00551', '1.7', '0.03', '-0.19587', '0.0926', '1.3', '-0.00648', '-0.01371', '1.7 * 2.3', '0.8018', '0.18'],
    ['0.55', '0.45', '0.00565', '0.00231', '3.4', '0.03', '0.10942', '-0.26808', '1.3', '0.01877', '0.00766', '3.4 * 2.3', '0.927', '0.12'],
    ['0.55', '0.45', '-0.00572', '0.00212', '5.1', '0.03', '0.13366', '0.36156', '1.3', '-0.02531', '0.00936', '5.1 * 2.3', '1.0695', '0.08'],
    ['0.5', '0.5', '0.0038', '-0.00738', '6.8', '0.04', '-0.45426', '-0.23365', '1.1', '0.01168', '-0.02271', '6.8', '1.2312', '0.05'],
    ['0.5', '0.5', '0.00219', '0.00801', '8.5', '0.04', '0.6967', '-0.19024', '1.1', '0.00951', '0.03483', '8.5', '1.464', '0.032'],
    ['0.5', '0.5', '-0.00702', '-0.00443', '10.2', '0.04', '-0.54941', '0.87127', '1.1', '-0.04356', '-0.02747', '10.2', '1.7483', '0.02'],
    ['0.5', '0.5', '0.00817', '-0.00148', '11.9', '0.04', '-0.25427', '-1.40518', '1.1', '0.07026', '-0.01271', '11.9', '2.0585', '0.013'],
    ['0.5', '0.5', '-0.00502', '0.00661', '13.6', '0.04', '1.51557', '1.1525', '1.1', '-0.05763', '0.07578', '13.6', '2.377', '0.009'],
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
