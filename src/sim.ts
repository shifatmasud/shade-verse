// Pure game simulation: city generation + swing physics. No rendering code here.
import { BOSS_BODY_OFFSET, BOSS_HIT_HALF_HEIGHT, BOSS_HIT_RADIUS } from './bossConfig';
export type V3 = [number, number, number];
export interface Bld { x0: number; x1: number; z0: number; z1: number; h: number; host?: number }

export const CELL = 40, N = 15, HALF = (N * CELL) / 2;
export const FOG: V3 = [0.84, 0.77, 0.74];
const G = 27;
export const JUMP_V = 16;
export const PARK = { x0: 100, x1: 260, z0: 20, z1: 180 };
export const PARK_POND = { cx: 180, cz: 100, rx: 14, rz: 14 }; // circular lake (env-iter1)
// Valley topography remains unchanged outside the pond; the pond itself is a deeper bowl for swimming and underwater light.
function parkBaseH(x: number, z: number): number { const e = Math.min(x - PARK.x0, PARK.x1 - x, z - PARK.z0, PARK.z1 - z); if (e <= 0) return 0; const t = Math.min(1, e / 34), w = t * t * (3 - 2 * t); return w * (-5.0 + 1.4 * Math.sin(x * 0.06 + 1.0) * Math.cos(z * 0.05)); }
// env-iter1 lake profile: a real shelving shore. Water line at r=LAKE_SHORE (fraction of the radius), sandy bank rising above
// the water out to ~1.25r, then the valley takes over again. Keeps the old waterline height and the deep swimming bowl.
export const LAKE_SHORE = 0.93;
const sm = (a: number, b: number, v: number) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const POND_BASE = parkBaseH(PARK_POND.cx, PARK_POND.cz);
function pondProfile(r: number) { return 0.55 - 3.25 * sm(LAKE_SHORE, LAKE_SHORE - 0.32, r) + 0.4 * sm(LAKE_SHORE - 0.02, LAKE_SHORE + 0.42, r); }
export function parkH(x: number, z: number): number {
    const base = parkBaseH(x, z), r = Math.hypot((x - PARK_POND.cx) / PARK_POND.rx, (z - PARK_POND.cz) / PARK_POND.rz);
    if (r > 2.3) return base;
    const f = 1 - sm(1.25, 2.3, r);
    return base * (1 - f) + (POND_BASE + pondProfile(r)) * f;
}
// Beach: a sand fringe all round the lake, widening into a proper beach on the side facing away from the trail (shared with the ground shader).
export const BEACH_DIR = Math.atan2(-0.514, 0.857);
export function sandWeight(x: number, z: number) {
    const dx = x - PARK_POND.cx, dz = z - PARK_POND.cz, d = Math.hypot(dx, dz);
    let da = Math.atan2(dz, dx) - BEACH_DIR; da = Math.atan2(Math.sin(da), Math.cos(da));
    const wide = sm(1.15, 0.0, Math.abs(da));
    const edge = PARK_POND.rx * LAKE_SHORE + 2.4 + 11.0 * wide + 0.9 * Math.sin(x * 0.37 + z * 0.21) + 0.6 * Math.sin(x * 0.83 - z * 0.67);
    return 1 - sm(edge - 1.6, edge + 0.6, d);
}
export function isLegacyCityCore(x: number, z: number) { return Math.abs(x) <= 120 && Math.abs(z) <= 120; }
// Keep the old waterline and bridge elevation; only the lake bed is lowered.
export const PARK_POND_Y = parkBaseH(PARK_POND.cx, PARK_POND.cz) + 0.55;
const bridgeYaw = -Math.atan2(0.857, 0.514); // follows the existing diagonal park trail
export const PARK_BRIDGE = {
    x: PARK_POND.cx, z: PARK_POND.cz, yaw: bridgeYaw,
    axisX: Math.cos(bridgeYaw), axisZ: -Math.sin(bridgeYaw),
    modules: 8, halfLength: 16, halfWidth: 1.35, rampLength: 5, // env-iter1: deck clears the round shore (r=14), ramps land on the trail
    deckY: PARK_POND_Y + 0.95,
};
export function bridgeSurfaceAt(x: number, z: number): number | null {
    const dx = x - PARK_BRIDGE.x, dz = z - PARK_BRIDGE.z;
    const along = dx * PARK_BRIDGE.axisX + dz * PARK_BRIDGE.axisZ;
    const across = -dx * PARK_BRIDGE.axisZ + dz * PARK_BRIDGE.axisX;
    if (Math.abs(across) > PARK_BRIDGE.halfWidth) return null;
    const end = Math.abs(along) - PARK_BRIDGE.halfLength;
    if (end <= 0) return PARK_BRIDGE.deckY;
    if (end > PARK_BRIDGE.rampLength) return null;
    const t = end / PARK_BRIDGE.rampLength;
    return PARK_BRIDGE.deckY * (1 - t) + parkH(x, z) * t;
}
export function isLakeWater(x: number, z: number) {
    const dx = (x - PARK_POND.cx) / PARK_POND.rx, dz = (z - PARK_POND.cz) / PARK_POND.rz;
    return dx * dx + dz * dz < LAKE_SHORE * LAKE_SHORE && bridgeSurfaceAt(x, z) === null;
}
export function lakeWaveH(x: number, z: number, t: number) { return Math.sin(x * 0.11 + z * 0.08 + t * 0.42) * 0.09 + Math.sin(x * 0.21 - z * 0.16 - t * 0.31) * 0.035; }
export function waterSurfaceAt(x: number, z: number, t = 0) { return isLakeWater(x, z) ? PARK_POND_Y + lakeWaveH(x, z, t) : WATER_Y; }
export const WATER_Z = -222, WATER_Y = -1.0, SEABED = -10;

let seedv = 1337;
const rnd = () => { seedv = (seedv * 1664525 + 1013904223) % 4294967296; return seedv / 4294967296; };

const FACES: [V3, V3, V3, V3, V3][] = [
    [[0, 0, 1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
    [[0, 0, -1], [1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]],
    [[1, 0, 0], [1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]],
    [[-1, 0, 0], [-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]],
    [[0, 1, 0], [-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]],
    [[0, -1, 0], [-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]],
];

function buildWorld() {
    const blds: Bld[] = [];
    const streetBlds: Bld[] = [];
    const data: number[] = [];
    const idx: number[] = [];
    let hideProceduralBuildingVisuals = false;
    const box = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, col: V3, seed: number, skipBottom = true) => {
        for (let fi = 0; fi < 6; fi++) {
            if (skipBottom && fi === 5) continue;
            const f = FACES[fi], base = data.length / 10, n = f[0];
            for (let i = 1; i < 5; i++) { const p = f[i]; data.push(cx + p[0] * sx, cy + p[1] * sy, cz + p[2] * sz, n[0], n[1], n[2], col[0], col[1], col[2], hideProceduralBuildingVisuals ? 100 : seed); }
            idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
    };
    const mi = (N - 1) / 2;
    for (let i = 0; i < N; i++) for (let j = 2; j < N; j++) {
        const cx = (i - mi) * CELL, cz = (j - mi) * CELL;
        if (cx > PARK.x0 && cx < PARK.x1 && cz > PARK.z0 && cz < PARK.z1) continue; // forest park block
        hideProceduralBuildingVisuals = !isLegacyCityCore(cx, cz);
        const blockStart=[data.length,idx.length,blds.length];
        const dc = Math.hypot(cx, cz) / HALF;
        const w = 20 + rnd() * 8, d = 20 + rnd() * 8;
        let h = 28 + rnd() * 50 + (1 - dc) * 40 * rnd();
        if (rnd() < 0.12) h = 18 + rnd() * 10;
        if (rnd() < 0.08) h += 40;
        if (i === mi && j === mi) h = 30;
        else if (Math.abs(i - mi) <= 1 && Math.abs(j - mi) <= 1) h = 40 + rnd() * 15;
        blds.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, h });
        const tint = rnd();
        const pal: V3[] = [[0.93, 0.76, 0.64], [0.62, 0.77, 0.68], [0.6, 0.76, 0.92], [0.96, 0.86, 0.6], [0.74, 0.68, 0.9]];
        const col: V3 = pal[Math.floor(((i * 7 + j * 3) % 5 + tint * 1.5) % 5)];
        // stepped tower: base + slimmer top section for silhouette variety
        if (h > 40 && rnd() < 0.75) {
            const hb = h * 0.72;
            box(cx, hb / 2, cz, w / 2, hb / 2, d / 2, col, rnd());
            box(cx, hb + (h - hb) / 2, cz, w / 2 - 3, (h - hb) / 2, d / 2 - 3, col, rnd());
            // ledge so the upper section is not a hover: (collision uses the full box, fine)
            box(cx, hb + 0.4, cz, w / 2 + 0.6, 0.4, d / 2 + 0.6, [0.3, 0.28, 0.4], 0.5);
        } else box(cx, h / 2, cz, w / 2, h / 2, d / 2, col, rnd());
        const neon: V3[] = [[0.95, 0.6, 0.74], [0.55, 0.85, 0.95], [1.0, 0.78, 0.5], [0.72, 0.62, 0.95]];   // softened sign colours (calm palette)
        if (h > 34 && rnd() < 0.55) {
            const nc = neon[Math.floor(rnd() * 4)], py = h * (0.35 + rnd() * 0.3);
            if (rnd() < 0.5) { box(cx + (rnd() - 0.5) * (w - 12), py, cz - d / 2 - 0.3, 5 + rnd() * 3, 2.5 + rnd() * 2, 0.3, nc, 1.15); }
            else { box(cx + w / 2 + 0.3, py, cz + (rnd() - 0.5) * (d - 12), 0.3, 2.5 + rnd() * 2, 5 + rnd() * 3, nc, 1.15); }
        }
        if (rnd() < 0.4) { const nc = neon[Math.floor(rnd() * 4)]; box(cx, h + 0.15, cz, w / 2 + 0.2, 0.15, 0.2, nc, 1.15); }
        // skyline variety: crown tiers and spires on tall towers, window-band trim ledges
        if (h > 62) {
            // crown block in a roof corner, away from the landing/beacon centre; also a real collision box so it is solid and landable
            const ch = 8 + rnd() * 4, hx = 3, hz = 3, ccx = cx - w * 0.34, ccz = cz - d * 0.34;
            box(ccx, h + ch / 2, ccz, hx, ch / 2, hz, col, rnd());
            box(ccx, h + ch + 0.3, ccz, hx + 0.4, 0.3, hz + 0.4, [0.3, 0.28, 0.4], 0.5);
            blds.push({ x0: ccx - hx - 0.4, x1: ccx + hx + 0.4, z0: ccz - hz - 0.4, z1: ccz + hz + 0.4, h: h + ch + 0.6, host: blds.length - 1 }); // collision covers the ledge lip
        }
        for (let ly = 14; ly < h - 2; ly += 14) box(cx, ly, cz, w / 2 + 0.35, 0.3, d / 2 + 0.35, [0.3, 0.27, 0.36], 0.5);
        box(cx + w * 0.3, h + 3.2, cz + d * 0.3, 0.25, 0.25, 0.25, [1, 0.15, 0.1], 2.0);
        // water tank on legs + AC units + antenna mast (rooftop variety)
        if (rnd() < 0.5) { const tx = cx + (rnd() - 0.5) * (w - 8), tz2 = cz + (rnd() - 0.5) * (d - 8); box(tx, h + 2, tz2, 0.3, 2, 0.3, [0.3, 0.25, 0.25], 0.5); box(tx, h + 5, tz2, 2.1, 2.2, 2.1, [0.72, 0.45, 0.38], 0.5); box(tx, h + 7.4, tz2, 1.6, 0.3, 1.6, [0.4, 0.3, 0.3], 0.5); }
        for (let k = 0; k < 3; k++) if (rnd() < 0.6) box(cx + (rnd() - 0.5) * (w - 6), h + 0.8, cz + (rnd() - 0.5) * (d - 6), 1.2 + rnd(), 0.8, 1 + rnd(), [0.82, 0.84, 0.88], 0.5);
        if (rnd() < 0.5) { const ax = cx + (rnd() - 0.5) * w * 0.6; box(ax, h + 6, cz, 0.12, 6, 0.12, [0.3, 0.3, 0.35], 0.5); box(ax, h + 9, cz, 1.4, 0.1, 0.1, [0.3, 0.3, 0.35], 0.5); }
        const roofCol: V3 = [0.25, 0.25, 0.32];
        box(cx - w * 0.2, h + 0.7, cz + d * 0.15, 2.2, 0.7, 2.2, roofCol, 0.5);
        if (rnd() < 0.5) { box(cx + w * 0.25, h + 1.5, cz - d * 0.2, 0.4, 1.5, 0.4, [0.7, 0.2, 0.25], 0.5); }
        if (rnd() < 0.3) box(cx + w * 0.1, h + 0.25, cz - d * 0.1, w * 0.3, 0.25, d * 0.12, [0.9, 0.55, 0.3], 0.5); // roof glow strip
        // One six-home Polyfork block replaces an existing outer-city tower, preserving RNG for every other block.
        hideProceduralBuildingVisuals = false;
        streetBlds.push(...blds.slice(blockStart[2]).filter(b=>b.host===undefined));
        if(cx===-240 && cz===80){data.length=blockStart[0];idx.length=blockStart[1];blds.length=blockStart[2];for(let k=0;k<6;k++){const x=-249+(k%3)*9,z=72+Math.floor(k/3)*17;const host=blds.length;blds.push({x0:x-4,x1:x+4,z0:z-4,z1:z+4,h:18});
            for(const q of [[-4,-3.7,-4,4], [3.7,4,-4,4], [-3.7,3.7,-4,-3.7],[-3.7,3.7,3.65,4]]) blds.push({x0:x+q[0],x1:x+q[1],z0:z+q[2],z1:z+q[3],h:19,host});
            // Measured rooftop hatch bound, conservative enclosing height for small rooftop fittings.
            const rot=k>=3?-1:1;blds.push({x0:x+(rot>0?-2.08:.52),x1:x+(rot>0?-.52:2.08),z0:z+(rot>0?-1.57:.37),z1:z+(rot>0?-.37:1.57),h:18.8,host});
            blds.push({x0:x+(rot>0?2.16:-2.44),x1:x+(rot>0?2.44:-2.16),z0:z+(rot>0?-2.04:1.76),z1:z+(rot>0?-1.76:2.04),h:18.62,host});}}
    }
    const g = HALF + 200, base = data.length / 10;
    for (const p of [[-g, g], [g, g], [g, WATER_Z], [-g, WATER_Z]]) data.push(p[0], 0, p[1], 0, 1, 0, 0.16, 0.15, 0.2, 0.5);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    return { blds, streetBlds, data: new Float32Array(data), idx: new Uint32Array(idx) };
}
export const world = buildWorld();
const blds = world.blds;

// Fixed rooftop arena on the central tower, distinct from the player's spawn roof.
const arenaRoof = blds.find((b) => b.host === undefined && Math.abs((b.x0 + b.x1) / 2 - 40) < 1 && Math.abs((b.z0 + b.z1) / 2) < 1);
if (!arenaRoof) throw new Error('Boss arena rooftop was not generated');
export const BOSS_ARENA = {
    x: (arenaRoof.x0 + arenaRoof.x1) / 2,
    y: arenaRoof.h + 1,
    z: (arenaRoof.z0 + arenaRoof.z1) / 2,
    roof: { x0: arenaRoof.x0, x1: arenaRoof.x1, z0: arenaRoof.z0, z1: arenaRoof.z1 },
};

export type BossFlightPhase = 'grounded' | 'takeoff' | 'hover' | 'propel' | 'landing';
export interface BossFlightState { phase: BossFlightPhase; phaseT: number; baseY: number; startX: number; startZ: number; targetX: number; targetZ: number; cycle: number }
const BOSS_FLIGHT = { groundWait: 3.2, takeoff: 0.95, hover: 1.15, propel: 1.8, landing: 0.9, altitude: 6.5, forward: 8.5, lateral: 4.5 };
export interface Enemy { roof?: { x0: number; x1: number; z0: number; z1: number }; x: number; y: number; z: number; hp: number; atk: number; hit: number; kb: [number, number]; ang: number; down: number; kind?: number; air?: boolean; born?: number; boss?: boolean; flight?: BossFlightState }
export interface Sim {
    mode: 'menu' | 'play' | 'over';
    pos: V3; vel: V3; ground: boolean; web: boolean; anchor: V3; rope: number;
    camHeld?: boolean; yaw: number; pitch: number; ang: number; score: number; time: number; best: number;
    hp: number; hurtT: number; atkT: number; dodgeT: number; combo: number; comboT: number; kos: number; land: number; landHard: number; enemies: Enemy[]; lastHit: number;
    orbs: V3[]; beacon: V3; beaconN: number; t: number; runPhase: number; lastDrag: number; safe: V3; maxSpeed: number; swings: number; webT: number; atkPend: number; shotE: Enemy | null; anchorReal: boolean; spring: number; shotT: number; shotTgt: V3; glideOn: boolean; airT: number;
    grappleFlight?: boolean; webDepartB?: number; swim: boolean; dive: boolean; wall: [number, number] | null; wallB: number; wallT: number; vaulted: number;
    plasma: Plasma[]; blasts: Blast[]; aimE: Enemy | null;
}
// plasma web shot: a visible bolt (plasma core wrapped in web strands) with gentle homing; blasts drive the shockwave VFX
export interface Plasma { x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number; tgt: Enemy | null }
export interface Blast { x: number; y: number; z: number; t: number; r: number }
export interface Input { jumpHeld?: boolean; jumpReleased?: boolean; jumpCancelled?: boolean; attackQ: boolean; dodgeQ: boolean; mx: number; my: number; swing: boolean; keys: Record<string, boolean>; jumpQ: boolean; swingQ: boolean; glide?: boolean; grabQ?: boolean; shotQ?: boolean; meleeQ?: boolean; specialQ?: boolean }
export interface Events { orb: () => void; fall: () => void; attach: () => void; release: () => void; jump: () => void; hit: () => void; hurt: () => void; ko: () => void; land: (hard: boolean) => void; blast?: (x: number, y: number, z: number) => void }

export const input: Input = { attackQ: false, dodgeQ: false, mx: 0, my: 0, swing: false, keys: {}, jumpQ: false, swingQ: false, glide: false };
let companionSim: Sim | null = null;
export function setCompanionSim(s: Sim | null) { companionSim = s; }

export function createSim(): Sim {
    let best = 0;
    try { best = parseInt(localStorage.getItem('webswinger3d-best') || '0', 10) || 0; } catch (e) { /* ignore */ }
    const s: Sim = { mode: 'menu', pos: [0, 0, 0], vel: [0, 0, 0], ground: true, web: false, atkPend: 0, shotE: null, anchorReal: false, spring: 0, shotT: 0, shotTgt: [0, 0, 0], glideOn: false, airT: 0, anchor: [0, 0, 0], rope: 20, yaw: 0, pitch: 0.28, ang: 0, score: 0, time: 75, best, hp: 100, hurtT: 0, atkT: 0, dodgeT: 0, combo: 0, comboT: 0, kos: 0, land: 0, landHard: 0, enemies: [], lastHit: -9, orbs: [], beacon: [0, 0, 0], beaconN: 0, t: 0, runPhase: 0, lastDrag: -10, safe: [0, 0, 0], maxSpeed: 0, swings: 0, webT: 0, swim: false, dive: false, wall: null, wallB: -1, wallT: 0, vaulted: 0, plasma: [], blasts: [], aimE: null };
    resetSim(s);
    return s;
}
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function newOrb(s: Sim): V3 {
    // orbs spawn 30-120 m from the player, at swingable heights, over streets or roofs
    for (let k = 0; k < 40; k++) {
        const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 90;
        const x = Math.max(-HALF + 10, Math.min(HALF - 10, s.pos[0] + Math.sin(a) * r)), z = Math.max(-HALF + 10, Math.min(HALF - 10, s.pos[2] + Math.cos(a) * r));
        const y = 28 + Math.random() * 40;
        let inside = false;
        for (const b of blds) if (x > b.x0 - 2 && x < b.x1 + 2 && z > b.z0 - 2 && z < b.z1 + 2 && y < b.h + 3) { inside = true; break; }
        if (!inside) return [x, y, z];
    }
    return [s.pos[0] + 40, 50, s.pos[2]];
}
function newBeacon(s: Sim): V3 {
    // beacon sits on the roof of a building 70-170 m away
    const cand = blds.filter((b) => { const d = Math.hypot((b.x0 + b.x1) / 2 - s.pos[0], (b.z0 + b.z1) / 2 - s.pos[2]); return b.x1 - b.x0 > 10 && d > 70 && d < 170; });
    const b = cand.length ? cand[Math.floor(Math.random() * cand.length)] : blds[Math.floor(Math.random() * blds.length)];
    return [(b.x0 + b.x1) / 2, b.h + 1.5, (b.z0 + b.z1) / 2];
}
function inPk(x: number, z: number) { return x > PARK.x0 && x < PARK.x1 && z > PARK.z0 && z < PARK.z1; }   // street enemies stay out of the sunken park
export const ENEMY_N = 26;   // was 10: user wants many enemies always in view (iteration choice, not a user number)
function spawnEnemy(s: Sim): Enemy {
    const kind = [0, 0, 1, 2, 2, 3][Math.floor(Math.random() * 6)];   // kind 2 = flying quad drone, kind 3 = Shadow-body heavy robot (the dome is retired)
    const e = spawnEnemy0(s, kind === 2); e.kind = kind; e.born = s.t;
    if (kind === 2) { e.air = true; e.roof = undefined; e.y = 6 + Math.random() * 26; }   // hover drones patrol the street canyons at altitude
    return e;
}
function spawnEnemy0(s: Sim, noRoof = false): Enemy {
    if (!noRoof && Math.random() < 0.4) {
        const cand = blds.filter((b) => { const d = Math.hypot((b.x0 + b.x1) / 2 - s.pos[0], (b.z0 + b.z1) / 2 - s.pos[2]); return b.x1 - b.x0 > 10 && d > 30 && d < 150 && b.h < 60; });
        if (cand.length) { const b = cand[Math.floor(Math.random() * cand.length)]; return { roof: { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 }, x: (b.x0 + b.x1) / 2 + (Math.random() - 0.5) * 6, y: b.h + 1, z: (b.z0 + b.z1) / 2 + (Math.random() - 0.5) * 6, hp: 3, atk: 0, hit: 0, kb: [0, 0], ang: 0, down: 0 }; }
    }
    for (let k = 0; k < 60; k++) {
        let x = (Math.floor(Math.random() * (N - 1)) - (N - 2) / 2) * CELL + (Math.random() < 0.5 ? -CELL / 2 + 0 : CELL / 2 - 0), z = (Math.random() - 0.5) * 2 * (HALF - 40);
        if (Math.random() < 0.8) { x = s.pos[0] + (Math.random() - 0.5) * 200; z = s.pos[2] + (Math.random() - 0.5) * 200; if (Math.hypot(x - s.pos[0], z - s.pos[2]) > 100) continue; }   // most spawns land within ~100 m of the hero so the street stays populated
        if (z < WATER_Z + 8) continue;
        if (x > PARK.x0 - 4 && x < PARK.x1 + 4 && z > PARK.z0 - 4 && z < PARK.z1 + 4) continue;   // the park is a sunken bowl: no street-level spawns there
        const sx = Math.round((x - CELL / 2) / CELL) * CELL + CELL / 2;
        if (Math.hypot(sx - s.pos[0], z - s.pos[2]) < 18) continue;
        let inside = false;
        for (const b of blds) if (sx > b.x0 - 1 && sx < b.x1 + 1 && z > b.z0 - 1 && z < b.z1 + 1) { inside = true; break; }
        if (!inside) return { x: sx, y: 1, z, hp: 3, atk: 0, hit: 0, kb: [0, 0], ang: 0, down: 0 };
    }
    return { x: 20, y: 1, z: 20, hp: 3, atk: 0, hit: 0, kb: [0, 0], ang: 0, down: 0 };
}
function spawnBoss(s: Sim): Enemy {
    const e = spawnEnemy0(s, true);
    e.x = BOSS_ARENA.x; e.y = BOSS_ARENA.y; e.z = BOSS_ARENA.z; e.roof = { ...BOSS_ARENA.roof };
    e.boss = true; e.kind = 0; e.hp = 24; e.atk = 0; e.hit = 0; e.kb = [0, 0]; e.ang = 0; e.down = 0; e.born = s.t;
    e.flight = { phase: 'grounded', phaseT: 0, baseY: e.y, startX: e.x, startZ: e.z, targetX: e.x, targetZ: e.z, cycle: 0 };
    return e;
}
export function resetSim(s: Sim) {
    const b = blds.reduce((best, c) => Math.hypot(c.x0, c.z0) < Math.hypot(best.x0, best.z0) ? c : best, blds[0]);
    s.pos = [(b.x0 + b.x1) / 2 + 4, b.h + 1, (b.z0 + b.z1) / 2 - 4]; s.vel = [0, 0, 0]; s.web = false; s.ground = true; s.safe = [...s.pos] as V3;
    s.camHeld = false; s.score = 0; s.time = 0; s.yaw = 0; s.swings = 0; s.maxSpeed = 0; s.ang = 0;
    s.orbs = []; for (let i = 0; i < 18; i++) s.orbs.push(newOrb(s));
    s.beaconN = 0; s.beacon = newBeacon(s);
    s.glideOn = false; s.airT = 0; (s as any).flightPress = undefined; (s as any).flightBoost = false; (s as any).flightTapCancel = false;
    input.jumpQ = false; input.jumpHeld = false; input.jumpReleased = false; input.jumpCancelled = false; input.keys[' '] = false;
    s.grappleFlight = false; (s as any).glideBlocked = false; s.webDepartB = undefined; s.wall = null; s.swim = false; s.dive = false; s.wallT = 0; s.vaulted = 0; s.hp = 100; s.hurtT = 0; s.atkT = 0; s.dodgeT = 0; s.combo = 0; s.comboT = 0; s.kos = 0; s.land = 0; s.landHard = 0;
    s.plasma = []; s.blasts = []; s.aimE = null; s.shotE = null; const sa = s as any; sa.snareCd = 0; sa.snareT = 0; sa.snareList = [];
    s.enemies = []; for (let i = 0; i < ENEMY_N; i++) s.enemies.push(spawnEnemy(s)); s.enemies.push(spawnBoss(s));
}

function findAnchor(s: Sim, strict = false): V3 {
    const p = s.pos, fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    let best: V3 | null = null, bs = 1e9;
    for (const b of blds) {
        const qx = Math.max(b.x0, Math.min(b.x1, p[0])), qz = Math.max(b.z0, Math.min(b.z1, p[2]));
        const dx = qx - p[0], dz = qz - p[2], dh = Math.hypot(dx, dz), dy = b.h - p[1];
        if (dy < 8 || dh < 10) continue;
        const dist = Math.hypot(dh, dy);
        if (dist < 16 || dist > 85) continue;
        const dot = (dx * fx + dz * fz) / dh;
        if (dot < 0.3) continue;
        const sc = Math.abs(dist - 40) + (1 - dot) * 50 + (dy > 75 ? 25 : 0);
        if (sc < bs) { bs = sc; const ox = -dx / dh, oz = -dz / dh; best = [qx + ox * 10, b.h + 3, qz + oz * 10]; }
    }
    if (strict && !best) return null as any; // spring-shot needs a real building anchor, never empty air
    return best || [p[0] + fx * 24, p[1] + 26, p[2] + fz * 24];
}


// PLASMA WEB SHOT targeting: nearest live enemy near the aim direction with clear line of sight.
// Aim assist: a wide cone around the camera heading picks the target; the reticle (Scene) shows it before firing.
export function pickPlasmaTarget(s: Sim): Enemy | null {
    const p = s.pos, fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    let best: Enemy | null = null, bs = 1e9;
    for (const e of s.enemies) {
        if (e.down > 0) continue;
        const dx = e.x - p[0], dz = e.z - p[2], d = Math.hypot(dx, dz), dy = Math.abs((e.boss ? targetY(e) : e.y) - p[1]);
        if (d < 2 || d > 42 || dy > 18) continue;
        const dot = (dx * fx + dz * fz) / d;
        if (dot < 0.35) continue;   // assist cone (~70 deg): not through buildings, not behind the hero
        if (!losClear(p[0], p[1] + 1.5, p[2], e.x, e.y + enemyBodyOffset(e), e.z)) continue;
        const sc = d * (0.4 + (1 - dot) * 8);   // strongly prefer what the camera points at, then nearer
        if (sc < bs) { bs = sc; best = e; }
    }
    return best;
}
const PLASMA_SPEED = 55, PLASMA_CAP = 3, BLAST_CAP = 6, BLAST_R = 8;
function spawnPlasma(s: Sim, tgt: Enemy) {
    if (s.plasma.length >= PLASMA_CAP) s.plasma.shift();   // cap concurrent bolts (low-end budget)
    const p = s.pos, ty = tgt.y + enemyBodyOffset(tgt);
    const ox = p[0] + Math.sin(s.yaw) * 0.6, oy = p[1] + 1.4, oz = p[2] + Math.cos(s.yaw) * 0.6;   // from the raised hands
    const d = norm([tgt.x - ox, ty - oy, tgt.z - oz]);
    s.plasma.push({ x: ox, y: oy, z: oz, vx: d[0] * PLASMA_SPEED, vy: d[1] * PLASMA_SPEED, vz: d[2] * PLASMA_SPEED, t: 0, tgt });
}
// visual-only death explosion: pooled blast at the bot's body, no damage, no chain reaction
function deathBlast(s: Sim, e: Enemy) {
    s.blasts.push({ x: e.x, y: e.y + enemyBodyOffset(e), z: e.z, t: 0, r: 5.5 });
    if (s.blasts.length > BLAST_CAP) s.blasts.shift();
}
function detonate(s: Sim, x: number, y: number, z: number, ev: Events) {
    s.blasts.push({ x, y, z, t: 0, r: BLAST_R });
    if (s.blasts.length > BLAST_CAP) s.blasts.shift();   // cap overlapping effects so repeated shots stay readable
    let any = false;
    for (const e of s.enemies) {
        if (e.down > 0) continue;
        const dx = e.x - x, dz = e.z - z, dy = (e.y + enemyBodyOffset(e)) - y, dh = Math.hypot(dx, dz);
        const d = Math.hypot(dh, dy);
        if (d > BLAST_R) continue;
        const k = 1 - d / BLAST_R;
        e.hp -= d < 2.5 ? 3 : 2;   // direct hit hits hardest
        e.hit = 0.5;
        const kk = 10 + 26 * k;   // radial knockback, strongest at the centre
        e.kb = [dx / (dh || 1) * kk, dz / (dh || 1) * kk];
        any = true; s.combo++; s.comboT = 1.2;
        if (e.hp <= 0) { e.down = 3; s.kos++; s.score += 2; ev.ko(); }
    }
    if (any) ev.hit();
    if (ev.blast) ev.blast(x, y, z);
}
// read-only HUD context: which actions would actually do something right now (same ranges the actions use)
export function actionCtx(s: Sim) {
    const p = s.pos, fx = Math.sin(s.yaw), fz = Math.cos(s.yaw); let melee = false, shot = false, snare = false;
    for (const e of s.enemies) { if (e.down > 0) continue; const dx = e.x - p[0], dz = e.z - p[2], d = Math.hypot(dx, dz), dy = Math.abs((e.boss ? targetY(e) : e.y) - p[1]);
        if (!e.boss && d < 3.6 && dy < 3.5 && (d < 1.2 || (dx * fx + dz * fz) / (d || 1) > -0.1)) melee = true;   // close strike
        if (!e.boss && !melee && d < 16 && dy < 4.5 && !s.swim && !s.wall && losClear(p[0], p[1] + 1.5, p[2], e.x, e.y + enemyBodyOffset(e), e.z)) melee = true;   // web-pull strike range
        if (d < 24 && dy < 14 && losClear(p[0], p[1] + 1.5, p[2], e.x, e.y + enemyBodyOffset(e), e.z)) snare = true; }
    shot = !!pickPlasmaTarget(s);   // web shot lights when the plasma auto-target has a lock
    const grab = !s.swim && !s.wall && s.spring <= 0 && findAnchor(s, true) !== null;
    return { grab, melee, shot, snare: snare && !((s as any).snareCd > 0) };
}
let hitN: [number, number] | null = null, hitB = -1;
function collide(s: Sim, prevY: number) {
    const p = s.pos, v = s.vel; s.ground = false; hitN = null; hitB = -1;
    const hw = 0.5, hh = 1.0;
    for (let bi = 0; bi < blds.length; bi++) {
        const b = blds[bi];
        if (p[0] + hw <= b.x0 || p[0] - hw >= b.x1 || p[2] + hw <= b.z0 || p[2] - hw >= b.z1 || p[1] - hh > b.h + 0.05 || p[1] + hh <= 0) continue;
        if (prevY - hh >= b.h - 0.6 && v[1] <= 0.5) { p[1] = b.h + hh; if (v[1] < 0) v[1] = 0; s.ground = true; s.safe = [p[0], p[1], p[2]]; continue; }
        const l = p[0] + hw - b.x0, r = b.x1 - (p[0] - hw), f = p[2] + hw - b.z0, k = b.z1 - (p[2] - hw), m = Math.min(l, r, f, k);
        hitB = bi;
        if (m === l) { p[0] -= l; if (v[0] > 0) v[0] *= -0.1; hitN = [-1, 0]; } else if (m === r) { p[0] += r; if (v[0] < 0) v[0] *= -0.1; hitN = [1, 0]; }
        else if (m === f) { p[2] -= f; if (v[2] > 0) v[2] *= -0.1; hitN = [0, -1]; } else { p[2] += k; if (v[2] < 0) v[2] *= -0.1; hitN = [0, 1]; }
    }
    const lim = HALF - 3;
    if (p[0] > lim) { p[0] = lim; v[0] = Math.min(v[0], 0); } if (p[0] < -lim) { p[0] = -lim; v[0] = Math.max(v[0], 0); }
    if (p[2] > lim) { p[2] = lim; v[2] = Math.min(v[2], 0); } if (p[2] < -lim) { p[2] = -lim; v[2] = Math.max(v[2], 0); }
}

export const FLY = { swingCap: 46, swingBoost: 18, glideCap: 22, glideAcc: 14 };   // traversal tuning knobs
const FLY_SWING_CAP = 46, FLY_SWING_BOOST = 18, FLY_GLIDE_CAP = 22, FLY_GLIDE_ACC = 14;   // traversal tuning (was 34 / 14 / 14 / 10): user asked for faster flight
export interface StepOptions { updateEnemies?: boolean; }
export function stepSim(s: Sim, dt: number, ev: Events, controls: Input = input, options: StepOptions = {}) {
    const input = controls;
    if ((s as any).hitStop > 0) { (s as any).hitStop -= dt; if ((s as any).hitStop > 0) return; }
    const p = s.pos, v = s.vel, k = input.keys;
    let mx = input.mx + ((k['d'] ? 1 : 0) - (k['a'] ? 1 : 0)), my = input.my + ((k['w'] ? 1 : 0) - (k['s'] ? 1 : 0));
    const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
    const turn = (k['arrowleft'] ? 1 : 0) - (k['arrowright'] ? 1 : 0);
    if (turn) { s.yaw += turn * 2.0 * dt; s.lastDrag = s.t; }
    if (k['arrowup'] || k['arrowdown']) { s.pitch = Math.max(-1.15, Math.min(1.35, s.pitch + ((k['arrowdown'] ? 1 : 0) - (k['arrowup'] ? 1 : 0)) * dt)); s.lastDrag = s.t; }
    const swingHeld = input.swing || k['shift'] || k['f'];
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), rx = -fz, rz = fx;
    const stunned = s.landHard > 0;
    const wx = stunned ? 0 : fx * my + rx * mx, wz = stunned ? 0 : fz * my + rz * mx;

    if (input.swingQ && !s.web) {
        s.grappleFlight = false; s.webDepartB = s.wall ? s.wallB : undefined;
        { const sa = findAnchor(s, true); s.anchorReal = !!sa; s.anchor = sa || findAnchor(s); } s.web = true; s.webT = 0; s.rope = Math.max(12, len(sub(s.anchor, p))); s.swings++;
        const d = norm(sub(s.anchor, p)); v[0] += d[0] * 6; v[1] += d[1] * 4; v[2] += d[2] * 6; s.ground = false; s.wall = null; ev.attach();
    }
    input.swingQ = false;
    if (!swingHeld && s.web) { s.web = false; v[1] += 3; ev.release(); }
    let springAnchor: V3 | null = null;
    // web grab button: two-hand web to the nearest real building anchor, then the same spring travel as the spring jump
    if (input.grabQ) { input.grabQ = false; if (!s.swim && !s.wall && s.spring <= 0) springAnchor = findAnchor(s, true); }
    if (!springAnchor && input.jumpQ && !s.swim && !s.wall && (s.web || (swingHeld && !s.ground)) && s.spring <= 0) springAnchor = s.web ? (s.anchorReal ? s.anchor : null) : findAnchor(s, true);
    if (springAnchor) {
        // PROTOTYPE spring-shot jump (both hands): JUMP while the web is out, or JUMP while holding SWING in the air, springs toward the anchor
        input.jumpQ = false;
        s.anchor = springAnchor; s.grappleFlight = true;
        const d = norm(sub(s.anchor, p)); s.web = false; s.spring = 0.4; s.ground = false;
        v[0] = v[0] * 0.3 + d[0] * 24; v[1] = Math.max(v[1], 0) * 0.3 + d[1] * 24 + 7; v[2] = v[2] * 0.3 + d[2] * 24; ev.jump(); ev.attach();
    }
    if (input.jumpQ) {
        input.jumpQ = false; s.grappleFlight = false;
        if (s.swim) { s.dive = !s.dive; }   // jump on the surface dives (user message 10:18, WhatsApp); underwater it surfaces. Shore exit: swim into the shore (below).
        else
        if (s.wall) { const n = s.wall; v[0] = n[0] * 11; v[2] = n[1] * 11; v[1] = 15; s.wall = null; s.wallT = 0.25; s.ground = false; ev.jump(); }
        else if (s.ground) { v[1] = JUMP_V; s.ground = false; (s as any).flightPress = 0; (s as any).flightTapCancel = false; ev.jump(); }
        else if (s.web) { s.web = false; v[1] += 8; ev.jump(); }
        else if (!s.grappleFlight && s.spring <= 0) { (s as any).flightPress = 0; (s as any).flightTapCancel = true; }
        else if (!s.ground) { (s as any).glideBlocked = true; s.glideOn = false; ev.jump(); }   // mid-air JUMP cancels automatic glide for the rest of this flight
    }
    const gl = s as any;
    if (input.jumpCancelled) { input.jumpCancelled = false; gl.flightPress = undefined; }
    if (gl.flightPress !== undefined) {
        if (s.web || s.swim || s.wall || s.ground || s.grappleFlight || s.spring > 0) gl.flightPress = undefined;
        else {
            if (input.jumpHeld || k[' ']) gl.flightPress += dt;
            if (gl.flightPress >= 0.18) gl.glideBlocked = false;
            if (input.jumpReleased) {
                if (gl.flightPress < 0.18 && gl.flightTapCancel) { gl.glideBlocked = true; s.glideOn = false; ev.jump(); }
                gl.flightPress = undefined;
            }
        }
    }
    input.jumpReleased = false;
    gl.flightBoost = gl.flightPress !== undefined && gl.flightPress >= 0.18 && !!(input.jumpHeld || k[' ']);
    const prevY = p[1];
    s.spring = Math.max(0, s.spring - dt); s.shotT = Math.max(0, s.shotT - dt);
    s.airT = (!s.ground && !s.swim && !s.wall && !s.web) ? s.airT + dt : 0;
    // Auto-glide during free flight after the launch beat. Mid-air JUMP cancels until the next flight.
    if (s.ground || s.web || s.wall || s.swim || s.spring > 0) (s as any).glideBlocked = false;
    s.glideOn = !s.ground && !s.web && !s.wall && !s.swim && !s.grappleFlight && s.spring <= 0 &&
        (s.airT > 0.35 || gl.flightBoost) && !(s as any).glideBlocked;
    const wasGround = s.ground, landVy = v[1];
    if (s.landHard > 0) s.landHard -= dt;
    s.wallT = Math.max(0, s.wallT - dt);
    if (!s.web) { const ocean = p[2] < WATER_Z, lake = isLakeWater(p[0], p[2]), zone = ocean || lake, surface = waterSurfaceAt(p[0], p[2], s.t); (s as any).leapT = Math.max(0, ((s as any).leapT || 0) - dt); if (zone && p[1] < surface + 0.9 && !((s as any).leapT > 0)) s.swim = true; else if (!zone || p[1] > surface + 1.4) { s.swim = false; s.dive = false; } } else { s.swim = false; s.dive = false; }
    if (s.swim) { s.wall = null; s.ground = false; if (input.dodgeQ) { input.dodgeQ = false; s.dive = !s.dive; } }
    // Manual pitch is retained on walls; no forced leveling.
    if (s.swim) {
        const inLake = isLakeWater(p[0], p[2]), surface = waterSurfaceAt(p[0], p[2], s.t);
        const lakeDepth = inLake ? Math.max(1.2, surface - parkH(p[0], p[2]) - 1.05) : 5;
        const sp = s.dive ? (inLake ? 5.8 : 7) : (inLake ? 7.2 : 9.5), a = Math.min(1, dt * (inLake ? 3.2 : 4));
        const cur = s.dive ? Math.sin(s.t * 0.3) * 0.9 : 0;   // underwater current: gentle sideways drift while diving (same phase as the bubble drift)
        v[0] += (wx * sp + cur - v[0]) * a; v[2] += (wz * sp - v[2]) * a;
        const target = s.dive ? (inLake ? Math.max(parkH(p[0], p[2]) + 1.05, surface - lakeDepth) : -5) : surface + 0.25;
        v[1] += ((target - p[1]) * 3 - v[1]) * Math.min(1, dt * (inLake ? 5.5 : 5));
        s.runPhase += Math.hypot(v[0], v[2]) * dt * 0.8;
        if (p[2] > WATER_Z - 1.2 && wz > 0.3 && p[1] > WATER_Y - 2.5) { p[1] = 1; p[2] = WATER_Z + 1.3; v[0] = v[1] = v[2] = 0; s.swim = false; s.dive = false; s.ground = true; }
    } else if (s.wall && !s.web) {
        const n = s.wall, tx = -n[1], tz = n[0];
        const push = -(wx * n[0] + wz * n[1]), lat = wx * tx + wz * tz;
        if (push < -0.3) { s.wall = null; s.wallT = 0.2; v[0] = n[0] * 3; v[2] = n[1] * 3; v[1] = 0; }
        else {
            const up = push > 0.3 ? push * 16 : 0;
            v[0] = tx * lat * 18 - n[0] * 2; v[2] = tz * lat * 18 - n[1] * 2; v[1] += (up - v[1]) * Math.min(1, dt * 12);
            s.runPhase += (Math.abs(up) + Math.abs(lat) * 18) * dt * 0.52;
        }
    } else if (s.ground && !s.web) {
        const a = Math.min(1, dt * 10); v[0] += (wx * 15 - v[0]) * a; v[2] += (wz * 15 - v[2]) * a; v[1] = 0;
    } else {
        // Glide lift balances gravity during descent; keep ordinary gravity through the rising launch.
        if (s.glideOn && (s as any).flightBoost) v[1] += (8 - v[1]) * (1 - Math.exp(-3 * dt));
        else if (s.glideOn && v[1] <= 0) v[1] += (-4.2 - v[1]) * (1 - Math.exp(-6 * dt));
        else v[1] -= G * dt;
        const air = s.web ? 12 : 7; v[0] += wx * air * dt; v[2] += wz * air * dt;
        if (s.web) { const hs0 = Math.hypot(v[0], v[2]); const px = hs0 > 2 ? v[0] / hs0 : fx, pz = hs0 > 2 ? v[2] / hs0 : fz; const boost = hs0 < FLY_SWING_CAP ? FLY_SWING_BOOST : 0; v[0] += px * boost * dt; v[2] += pz * boost * dt; }
        if (!s.web) { const dr = Math.pow(0.992, dt * 60); v[0] *= dr; v[2] *= dr; }
    }
    p[0] += v[0] * dt; p[1] += v[1] * dt; p[2] += v[2] * dt;
    if (s.web) {
        s.webT += dt; s.rope = Math.max(10, s.rope - 1.5 * dt);
        const a = s.anchor, d = sub(p, a), l = len(d);
        if (a[1] - p[1] > 25 && l < s.rope - 0.5 && s.webT < 1.6) { // low start: reel the hero up toward the anchor (zip)
            const kk = 34 * dt; v[0] -= d[0] / l * kk; v[1] -= d[1] / l * kk; v[2] -= d[2] / l * kk; s.rope = Math.max(12, Math.min(s.rope, l + 3));
        }
        if (l > s.rope) {
            const n: V3 = [d[0] / l, d[1] / l, d[2] / l];
            p[0] = a[0] + n[0] * s.rope; p[1] = a[1] + n[1] * s.rope; p[2] = a[2] + n[2] * s.rope;
            const vn = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
            if (vn > 0) { v[0] -= n[0] * vn; v[1] -= n[1] * vn; v[2] -= n[2] * vn; }
        }
    }
    if (s.glideOn) { const hs = Math.hypot(v[0], v[2]); if (hs < FLY_GLIDE_CAP) { const fx2 = Math.sin(s.yaw), fz2 = Math.cos(s.yaw); v[0] += fx2 * FLY_GLIDE_ACC * dt; v[2] += fz2 * FLY_GLIDE_ACC * dt; } }

    collide(s, prevY);
    if (s.webDepartB !== undefined) { const b = blds[s.webDepartB]; if (!s.web || !b || p[0] < b.x0 - 1.2 || p[0] > b.x1 + 1.2 || p[2] < b.z0 - 1.2 || p[2] > b.z1 + 1.2 || p[1] - 1 > b.h + 0.2) s.webDepartB = undefined; }
    // Hero side-wall contact ends web travel and enters wall-running mode.
    // A distant anchor attaching is not contact; roofs remain normal landings.
    if (hitN && !s.ground && !s.swim && s.wallT <= 0 && !stunned && hitB !== s.webDepartB && (s.web || s.grappleFlight)) {
        const wasWeb = s.web; s.web = false; s.spring = 0; s.grappleFlight = false;
        s.glideOn = false; (s as any).glideLatch = false; s.airT = 0;
        s.wall = hitN; s.wallB = hitB; s.vaulted = 0;
        v[0] = -hitN[0] * 2; v[1] = 0; v[2] = -hitN[1] * 2;
        if (wasWeb) ev.release();
    }
    if (hitN && !s.web && !s.ground && s.wallT <= 0 && !stunned) {
        const push = -(wx * hitN[0] + wz * hitN[1]);
        if (s.wall || push > 0.5) { if (!s.wall) { s.vaulted = 0; } s.wall = hitN; s.wallB = hitB; }
    } else if (hitN && !s.web && s.ground && p[1] > 1.2) { /* standing on a roof, touching wall: no attach */ s.wall = null; }
    else if (hitN && !s.web && s.wallT <= 0 && !stunned && p[1] <= 1.05 && -(wx * hitN[0] + wz * hitN[1]) > 0.5) { s.wall = hitN; s.wallB = hitB; v[1] = 0.1; p[1] = 1.06; }
    else if (!hitN) s.wall = null;

    if (s.wall && s.wallB >= 0) { const b = blds[s.wallB]; if (p[1] - 1.0 >= b.h - 0.5) { const n = s.wall; p[1] = b.h + 1.02; p[0] -= n[0] * 1.1; p[2] -= n[1] * 1.1; v[0] = v[1] = v[2] = 0; s.wall = null; s.vaulted++; s.ground = true; s.safe = [p[0], p[1], p[2]]; } }
    if (s.ground && s.web && p[1] > 1.2) s.web = false;
    if (s.swim) { const floor = isLakeWater(p[0], p[2]) ? parkH(p[0], p[2]) + 1.05 : SEABED + 1; if (p[1] < floor) { p[1] = floor; if (v[1] < 0) v[1] = 0; } }
    const parkFloor = parkH(p[0], p[2]), bridgeFloor = bridgeSurfaceAt(p[0], p[2]);
    const gy = 1.0 + Math.max(parkFloor, bridgeFloor ?? -Infinity);
    if ((p[1] <= gy + 0.0005 || (gy < 1 && v[1] <= 0 && p[1] - gy < 0.35)) && p[2] >= WATER_Z && !s.swim) { // street level, valley floor, or the footbridge/ramp: snaps down gentle slopes
        if (!s.ground) { s.ground = true; }
        p[1] = gy; if (v[1] < 0) v[1] = 0;
    }
    if (s.ground || s.swim || s.wall || s.glideOn) s.grappleFlight = false;
    if (s.ground && !wasGround && landVy < -7) {
        const imp = -landVy; s.land = Math.min(1, imp / 30); const hard = imp > 26;
        s.landHard = hard ? 0.45 : 0;
        if (hard) { v[0] *= 0.35; v[2] *= 0.35; s.hp = Math.max(1, s.hp - (imp - 26) * 2); }
        ev.land(hard);
    }
    const sp = len(v); if (sp > s.maxSpeed) s.maxSpeed = sp;
    const hs = Math.hypot(v[0], v[2]);
    if (s.wall) { s.ang = Math.atan2(-s.wall[0], -s.wall[1]); } else if (hs > 1.5) { let da = Math.atan2(v[0], v[2]) - s.ang; da = Math.atan2(Math.sin(da), Math.cos(da)); s.ang += da * Math.min(1, dt * 12); }
    if (s.ground) s.runPhase += hs * dt * 0.9;
    s.land = Math.max(0, s.land - dt * 3);
    stepCombat(s, dt, ev, controls, options);
    // Gentle heading assist only during forward movement, never during manual look or at rest.
    if (!s.camHeld && s.t - s.lastDrag > 2.5 && hs > 2.5 && my > 0.2 && Math.abs(mx) < 0.15 && !s.wall) {
        let da = Math.atan2(v[0], v[2]) - s.yaw; da = Math.atan2(Math.sin(da), Math.cos(da)); s.yaw += Math.max(-0.6 * dt, Math.min(0.6 * dt, da * (1 - Math.exp(-0.7 * dt))));
    }
    for (let i = 0; i < s.orbs.length; i++) {
        const o = s.orbs[i];
        if (Math.hypot(o[0] - p[0], o[1] - p[1], o[2] - p[2]) < 5.5) { s.score++; s.orbs[i] = newOrb(s); ev.orb(); }
    }
}
export const buildings = blds;
const BODY_OFF = [0.8, 0.3, 1.05, 1.7];   // kind 3 torso height follows its 1.8 scale (1.2 at scale 1.25)
const BOSS_BODY_OFF = BOSS_BODY_OFFSET;
export const enemyBodyOffset = (e: Enemy) => e.boss ? BOSS_BODY_OFF : BODY_OFF[e.kind ?? 0];
const targetY = (e: Enemy) => e.y + enemyBodyOffset(e);
// Multi-Target Shock Web Attack only; regular melee move timing and tuning stay separate.
export const SNARE = { MAX_TARGETS: 5, RANGE: 24, VERTICAL_RANGE: 14, TOTAL: 1.65, GATHER_END: 0.9, SHOCK_START: 0.6, IMPACT: 0.15, HIT_RANGE: 5.5, GROUP_RADIUS: 2.4, PULL_SPEED: 30, DAMAGE: 3, KNOCKBACK: 18, HIT_STOP: 0.10, SHAKE: 0.34 } as const;
const losClear = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => { const dx = bx - ax, dy = by - ay, dz = bz - az; for (const b of blds) { let t0 = 0, t1 = 1; const lo = [b.x0, -1e9, b.z0], hi = [b.x1, b.h, b.z1], o = [ax, ay, az], d = [dx, dy, dz]; let ok = true; for (let k = 0; k < 3; k++) { if (Math.abs(d[k]) < 1e-9) { if (o[k] < lo[k] || o[k] > hi[k]) { ok = false; break; } } else { let ta = (lo[k] - o[k]) / d[k], tb = (hi[k] - o[k]) / d[k]; if (ta > tb) { const q = ta; ta = tb; tb = q; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) { ok = false; break; } } } if (ok) return false; } return true; };   // exact segment vs AABB (slab test)
const insideBA = (x: number, z: number, y: number) => { for (const b of blds) if (b.h + 2 > y && x > b.x0 - 0.6 && x < b.x1 + 0.6 && z > b.z0 - 0.6 && z < b.z1 + 0.6) return true; return false; };   // air units are only blocked by buildings taller than their altitude
const insideB = (x: number, z: number) => { for (const b of blds) if (x > b.x0 - 0.6 && x < b.x1 + 0.6 && z > b.z0 - 0.6 && z < b.z1 + 0.6) return true; return false; };
const inRoof = (e: Enemy, x: number, z: number) => !!e.roof && x > e.roof.x0 + 1 && x < e.roof.x1 - 1 && z > e.roof.z0 + 1 && z < e.roof.z1 - 1;
// ===== COMBAT CHOREOGRAPHY (v0.77) =====
// Move ids: 1 jab, 2 cross, 3 spin hook kick, 4 launcher (rising knee+uppercut), 5 aerial side-kick spike, 6 web-pull flying kick, 7 web-yank slam.
// Refs: Muybridge "Two men boxing" 1887 plate (jab/cross weight shift), Taekwondo 540 hook (spin kick chamber + lean),
// Capoeira armada (spin with torso counter-lean), Marvel's Spider-Man 2 combat (launch -> air follow-up, web pull/yank).
// Each move: dur (s), hit time, cancel time (buffered next move may start), stop distance for the gap-closing lunge.
export const MOVES: Record<number, { dur: number; hit: number; cancel: number; stop: number; dmg: number; kb: number; lift: number; shake: number; stopT: number; reach: number }> = {
    1: { dur: 0.30, hit: 0.10, cancel: 0.17, stop: 1.75, dmg: 1, kb: 6, lift: 0, shake: 0.10, stopT: 0.045, reach: 3.2 },
    2: { dur: 0.32, hit: 0.11, cancel: 0.19, stop: 1.75, dmg: 1, kb: 9, lift: 0, shake: 0.14, stopT: 0.05, reach: 3.0 },
    3: { dur: 0.48, hit: 0.24, cancel: 0.33, stop: 2.05, dmg: 1, kb: 16, lift: 2.5, shake: 0.24, stopT: 0.075, reach: 3.4 },
    4: { dur: 0.52, hit: 0.20, cancel: 0.30, stop: 1.65, dmg: 1, kb: 2, lift: 13.5, shake: 0.26, stopT: 0.08, reach: 3.2 },
    5: { dur: 0.50, hit: 0.26, cancel: 0.40, stop: 1.80, dmg: 2, kb: 7, lift: -24, shake: 0.30, stopT: 0.09, reach: 3.6 },
    6: { dur: 0.58, hit: 0.32, cancel: 0.42, stop: 1.90, dmg: 1, kb: 17, lift: 3, shake: 0.24, stopT: 0.07, reach: 3.6 },
    7: { dur: 0.52, hit: 0.20, cancel: 0.40, stop: 0, dmg: 0, kb: 0, lift: -28, shake: 0.18, stopT: 0.06, reach: 24 },
};
const bodyY = (e: Enemy) => e.y + ((e as any).ly || 0) + enemyBodyOffset(e);
function nearLifted(s: Sim, r: number, minLy = 1.2): Enemy | null {
    const p = s.pos; let best: Enemy | null = null, bd = r;
    for (const e of s.enemies) { if (e.down > 0 || e.boss || !(((e as any).ly || 0) > minLy)) continue; const d = Math.hypot(e.x - p[0], e.z - p[2]); if (d < bd && losClear(p[0], p[1] + 1.5, p[2], e.x, bodyY(e), e.z)) { bd = d; best = e; } }
    return best;
}
// pick the bot the chain should flow into: in front first, then nearest; returns [enemy, dist]
function comboTarget(s: Sim, r: number): [Enemy | null, number] {
    const p = s.pos, fx = Math.sin(s.ang), fz = Math.cos(s.ang); let best: Enemy | null = null, bs = 1e9, bdist = 0;
    for (const e of s.enemies) {
        if (e.down > 0 || e.boss) continue; const dx = e.x - p[0], dz = e.z - p[2], d = Math.hypot(dx, dz); if (d > r || Math.abs(bodyY(e) - p[1] - 0.5) > 4.5) continue;
        const front = (dx * fx + dz * fz) / (d || 1); const sc = d - front * 2.2; if (sc < bs) { bs = sc; best = e; bdist = d; }
    }
    return [best, bdist];
}
function comboStart(s: Sim, ev: Events, force: boolean): boolean {
    const sa = s as any;
    if (s.swim || s.wall || s.web) return false;
    // aerial follow-up: the bot we launched is still up -> leap after it
    const up = nearLifted(s, 9, sa.chain === 4 ? 0.3 : 1.2);
    if (up && (sa.chain === 4 || !s.ground)) { startMove(s, 5, up, ev); return true; }
    const [e, d] = comboTarget(s, 16);
    if (e && d > 5.8) { if (losClear(s.pos[0], s.pos[1] + 1.5, s.pos[2], e.x, bodyY(e), e.z)) { startMove(s, 6, e, ev); return true; } }
    if (e && d <= 5.8) { if (!s.ground) { startMove(s, 5, e, ev); return true; } sa.chain = ((sa.chainT > 0 ? sa.chain || 0 : 0) % 4) + 1; startMove(s, sa.chain, e, ev); return true; }
    if (force) { sa.chain = ((sa.chainT > 0 ? sa.chain || 0 : 0) % 2) + 1; startMove(s, s.ground ? sa.chain : 5, null, ev); return true; }   // whiff still reads as a strike
    return false;
}
function startMove(s: Sim, id: number, e: Enemy | null, ev: Events) {
    const sa = s as any, p = s.pos;
    sa.mv = { id, t: 0, e, hit: false, d0: e ? Math.hypot(e.x - p[0], e.z - p[2]) : 0, spin: id === 3 ? 1 : 0 };
    sa.mvQ = false; s.atkT = 0; s.shotT = 0; sa.kick = false; s.glideOn = false;
    if (id === 6 || id === 7) { sa.cWeb = { e, t: 0, mode: id === 6 ? 'pull' : 'yank' }; ev.attach(); }
    if (id === 5) {   // leap: reach the target's body height around the hit frame (hang-time juggle)
        const ty = e ? bodyY(e) + 0.4 : p[1] + 2.2; const dh = Math.max(1.2, Math.min(9, ty - p[1] + 0.6));
        s.vel[1] = Math.max(s.vel[1], Math.sqrt(2 * G * dh) * 0.92); s.ground = false;
    }
    if (id === 4) s.vel[1] = Math.max(s.vel[1], 5.5);   // launcher pops the hero off the ground a little
}
function stepMove(s: Sim, dt: number, ev: Events) {
    const sa = s as any, p = s.pos, v = s.vel;
    sa.chainT = Math.max(0, (sa.chainT || 0) - dt); sa.shake = Math.max(0, (sa.shake || 0) - dt * 1.6);
    if (sa.cWeb) { sa.cWeb.t += dt; if (sa.cWeb.t > 0.42 || !sa.cWeb.e || sa.cWeb.e.down > 0) sa.cWeb = null; }
    if (sa.flip) { sa.flip.t += dt; if (sa.flip.t >= sa.flip.dur) sa.flip = null; }
    const m = sa.mv; if (!m) return;
    const M = MOVES[m.id], e: Enemy | null = m.e && m.e.down <= 0 ? m.e : null;
    m.t += dt;
    // web pull: reel the bot in towards the hero for the first part of the move
    if (m.id === 6 && e && m.t < 0.26) { const dx = p[0] - e.x, dz = p[2] - e.z, d = Math.hypot(dx, dz); if (d > 2.6) { const st = Math.min(d - 2.6, 34 * dt), nx = e.x + dx / d * st, nz = e.z + dz / d * st; if (e.roof ? inRoof(e, nx, nz) : !insideB(nx, nz) && !inPk(nx, nz)) { e.x = nx; e.z = nz; } (e as any).ly = Math.max((e as any).ly || 0, 0.6 * Math.sin(Math.min(1, m.t / 0.26) * Math.PI)); } e.hit = Math.max(e.hit, 0.2); e.atk = 0; }
    // web yank: bot is held, then slammed down
    if (m.id === 7 && e) { e.hit = Math.max(e.hit, 0.2); e.atk = 0; if (m.t < M.hit) (e as any).vy = Math.max(((e as any).vy || 0), 1.5); }
    // face the target, smoothly
    if (e) { let da = Math.atan2(e.x - p[0], e.z - p[2]) - s.ang; da = Math.atan2(Math.sin(da), Math.cos(da)); s.ang += da * Math.min(1, dt * 22); }
    // gap-closing lunge: eased slide up to the hit frame (momentum carried, no teleport)
    if (e && M.stop > 0 && m.t < M.hit + 0.04) {
        const dx = e.x - p[0], dz = e.z - p[2], d = Math.hypot(dx, dz);
        if (d > M.stop) { const sp = Math.max(7, (m.d0 - M.stop) / Math.max(0.08, M.hit) * 1.25); const st = Math.min(d - M.stop, sp * dt); p[0] += dx / d * st; p[2] += dz / d * st; }
        if (m.id === 5) { const ty = bodyY(e) + 0.4; if (ty > p[1]) v[1] = Math.max(v[1], Math.min(16, (ty - p[1]) * 7)); }
    } else if (!e && m.t < M.hit && s.ground) { p[0] += Math.sin(s.ang) * 3.5 * dt; p[2] += Math.cos(s.ang) * 3.5 * dt; }   // whiff steps in
    if (s.ground) { const k = 1 - Math.min(1, dt * 12); v[0] *= k; v[2] *= k; }   // plant: strikes don't skate
    else if (m.id === 5 && m.t < M.hit + 0.1) v[1] = Math.max(v[1], -2);    // brief hang at the top of the aerial kick
    if (!m.hit && m.t >= M.hit) {
        m.hit = true;
        if (m.id === 7) { if (e) { const ea = e as any; ea.vy = M.lift; ea.slam = 1; const dx = p[0] - e.x, dz = p[2] - e.z, d = Math.hypot(dx, dz) || 1; e.kb = [dx / d * 9, dz / d * 9]; sa.shake = Math.max(sa.shake, M.shake); sa.hitStop = M.stopT; } }
        else {
            const fx = Math.sin(s.ang), fz = Math.cos(s.ang); let any = false;
            for (const o of s.enemies) {
                if (o.down > 0 || o.boss) continue; const dx = o.x - p[0], dz = o.z - p[2], d = Math.hypot(dx, dz), dy = bodyY(o) - (p[1] + 0.5);
                const reachOK = o === e ? d < M.reach + 0.8 : d < M.reach;
                if (!reachOK || Math.abs(dy) > (m.id === 5 ? 3.2 : 2.6) || (d > 1.2 && (dx * fx + dz * fz) / (d || 1) < (m.id === 3 ? -0.6 : -0.1))) continue;   // spin kick sweeps a wider arc
                const oa = o as any; o.hp -= M.dmg; o.hit = Math.max(o.hit, m.id >= 3 ? 0.55 : 0.32); o.atk = 0;
                const nx = d > 0.01 ? dx / d : fx, nz = d > 0.01 ? dz / d : fz; o.kb = [nx * M.kb, nz * M.kb];
                if (M.lift > 0) oa.vy = Math.max(oa.vy || 0, M.lift); else if (M.lift < 0) { oa.vy = M.lift; oa.slam = 1; }
                oa.hitDir = m.id; any = true; s.combo++; s.comboT = 1.4;
                if (o.hp <= 0) { o.down = 3; s.kos++; s.score += 2; ev.ko(); deathBlast(s, o); }
            }
            if (any) { ev.hit(); sa.hitStop = M.stopT; sa.shake = Math.max(sa.shake, M.shake); }
        }
    }
    if (sa.mvQ && m.t >= M.cancel) { sa.mv = null; sa.chainT = 0.9; if (!comboStart(s, ev, true)) sa.mv = null; return; }
    if (m.t >= M.dur) { sa.mv = null; sa.chainT = 0.75; }
}
// launched / slammed bots: vertical arc with juggle hang time, ground bounce + shake on slam
function enemyAir(s: Sim, e: Enemy, dt: number, ev: Events) {
    const ea = e as any; if (!(ea.ly > 0) && !(ea.vy > 0)) { ea.ly = 0; ea.vy = 0; return false; }
    const mainMove = (s as any).mv, ghostMove = companionSim && companionSim !== s ? (companionSim as any).mv : null;
    const juggled = (!!mainMove && mainMove.e === e && mainMove.id !== 7) || (!!ghostMove && ghostMove.e === e && ghostMove.id !== 7);
    if (juggled && ea.vy > 0) ea.vy *= 1 - Math.min(1, dt * 5);   // hang at the apex while the follow-up arrives
    ea.vy -= (juggled ? 9 : 26) * dt; ea.ly = (ea.ly || 0) + ea.vy * dt; ea.tumble = (ea.tumble || 0) + dt * (ea.slam ? 9 : 5);
    if (ea.ly <= 0) {
        const imp = -ea.vy; ea.ly = 0;
        if (imp > 9) {   // slam: bounce, damage once, camera kick
            ea.vy = imp * 0.22; if (ea.slam && e.down <= 0) { e.hp -= 1; e.hit = 0.6; if (e.hp <= 0) { e.down = 3; s.kos++; s.score += 2; ev.ko(); deathBlast(s, e); } ev.hit(); }
            ea.slam = 0; (s as any).shake = Math.max((s as any).shake || 0, Math.min(0.34, imp * 0.012)); if (ev.blast && imp > 20) ev.blast(e.x, e.y + 0.3, e.z);
        } else { ea.vy = 0; ea.tumble = 0; }
    }
    if (e.down <= 0) e.hit = Math.max(e.hit, 0.12);
    return true;
}
function bossRoofClamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function stepBossFlight(s: Sim, e: Enemy, dt: number, p: V3, engaged: boolean) {
    const flight = e.flight; if (!flight) return;
    const roof = e.roof ?? BOSS_ARENA.roof;
    const marginX = Math.min(1.5, Math.max(0, (roof.x1 - roof.x0) * 0.1));
    const marginZ = Math.min(1.5, Math.max(0, (roof.z1 - roof.z0) * 0.1));
    const minX = roof.x0 + marginX, maxX = roof.x1 - marginX, minZ = roof.z0 + marginZ, maxZ = roof.z1 - marginZ;
    const ease = (t: number) => t * t * (3 - 2 * t);
    if (flight.phase === 'grounded') {
        e.y = flight.baseY; flight.phaseT += dt;
        if (flight.phaseT >= BOSS_FLIGHT.groundWait && engaged && e.hit <= 0 && e.atk <= 0) {
            const dx = p[0] - e.x, dz = p[2] - e.z, d = Math.hypot(dx, dz) || 1;
            const ux = dx / d, uz = dz / d, side = flight.cycle % 2 === 0 ? 1 : -1;
            flight.startX = e.x; flight.startZ = e.z;
            flight.targetX = bossRoofClamp(e.x + ux * BOSS_FLIGHT.forward - uz * BOSS_FLIGHT.lateral * side, minX, maxX);
            flight.targetZ = bossRoofClamp(e.z + uz * BOSS_FLIGHT.forward + ux * BOSS_FLIGHT.lateral * side, minZ, maxZ);
            flight.cycle++; flight.phase = 'takeoff'; flight.phaseT = 0;
        }
        return;
    }
    flight.phaseT += dt;
    if (flight.phase === 'takeoff') {
        const t = Math.min(1, flight.phaseT / BOSS_FLIGHT.takeoff);
        e.y = flight.baseY + BOSS_FLIGHT.altitude * ease(t);
        if (t >= 1) { flight.phase = 'hover'; flight.phaseT = 0; }
    } else if (flight.phase === 'hover') {
        e.y = flight.baseY + BOSS_FLIGHT.altitude + Math.sin(flight.phaseT * 2.6) * 0.16;
        if (flight.phaseT >= BOSS_FLIGHT.hover) { flight.phase = 'propel'; flight.phaseT = 0; flight.startX = e.x; flight.startZ = e.z; }
    } else if (flight.phase === 'propel') {
        const t = Math.min(1, flight.phaseT / BOSS_FLIGHT.propel), k = ease(t);
        e.x = flight.startX + (flight.targetX - flight.startX) * k;
        e.z = flight.startZ + (flight.targetZ - flight.startZ) * k;
        e.y = flight.baseY + BOSS_FLIGHT.altitude + Math.sin(flight.phaseT * 2.6) * 0.12;
        if (t < 1) e.ang = Math.atan2(flight.targetX - flight.startX, flight.targetZ - flight.startZ);
        if (t >= 1) { flight.phase = 'landing'; flight.phaseT = 0; flight.startX = e.x; flight.startZ = e.z; }
    } else if (flight.phase === 'landing') {
        const t = Math.min(1, flight.phaseT / BOSS_FLIGHT.landing);
        e.y = flight.baseY + BOSS_FLIGHT.altitude * (1 - ease(t));
        if (t >= 1) { e.y = flight.baseY; flight.phase = 'grounded'; flight.phaseT = 0; }
    }
}
function stepCombat(s: Sim, dt: number, ev: Events, controls: Input = input, options: StepOptions = {}) {
    const input = controls;
    const p = s.pos, v = s.vel;
    s.aimE = pickPlasmaTarget(s);   // contextual lock indicator: what a web shot would hit right now
    if (s.hp <= 0) { s.hp = 100; p[0] = s.safe[0]; p[1] = s.safe[1] + 0.5; p[2] = s.safe[2]; v[0] = v[1] = v[2] = 0; s.web = false; ev.fall(); }
    s.atkT = Math.max(0, s.atkT - dt); s.dodgeT = Math.max(0, s.dodgeT - dt); s.hurtT = Math.max(0, s.hurtT - dt); s.comboT = Math.max(0, s.comboT - dt);
    if (s.comboT === 0) s.combo = 0;
    if (s.hp > 0 && s.t - s.lastHit > 5 && s.hp < 100) s.hp = Math.min(100, s.hp + 6 * dt);
    const fa = s.ang, fx = Math.sin(fa), fz = Math.cos(fa);
    if (input.dodgeQ) {
        input.dodgeQ = false;
        if (s.dodgeT <= 0 && !s.web) { s.dodgeT = 0.38; const mx = input.mx + ((input.keys['d'] ? 1 : 0) - (input.keys['a'] ? 1 : 0)), my = input.my + ((input.keys['w'] ? 1 : 0) - (input.keys['s'] ? 1 : 0)); const yx = Math.sin(s.yaw), yz = Math.cos(s.yaw); let dx = yx * my - yz * mx, dz = yz * my + yx * mx; const dl = Math.hypot(dx, dz); if (dl < 0.1) { dx = -fx; dz = -fz; } else { dx /= dl; dz /= dl; } v[0] = dx * 18; v[2] = dz * 18;
            { const sa = s as any, fw = dx * fx + dz * fz, sd = dx * fz - dz * fx; sa.mv = null; sa.mvQ = false; sa.flip = { t: 0, dur: 0.5, ax: Math.abs(fw) > 0.55 ? 'x' : 'z', dir: Math.abs(fw) > 0.55 ? (fw < 0 ? -1 : 1) : (sd > 0 ? 1 : -1) }; if (s.ground) { v[1] = 7.5; s.ground = false; } } }
    }
      if (input.attackQ) {
          input.attackQ = false; const fShot = !!input.shotQ, fMelee = !!input.meleeQ; input.shotQ = false; input.meleeQ = false;
          const sa = s as any;
          if (sa.mv) { if (!fShot) sa.mvQ = true; }   // buffered: the next move starts at this move's cancel point, so the chain flows
          else if (s.atkT <= 0) {
              // web-yank: a web shot at a bot that is airborne (launched) yanks it down into the street
              const lifted = fShot ? nearLifted(s, 22) : null;
              if (lifted) startMove(s, 7, lifted, ev);
              else if (fShot || !comboStart(s, ev, fMelee)) {
                  if (!fMelee) {
                      s.atkT = 0.32; s.shotE = null;
                      if (s.aimE) { s.shotT = 0.3; s.shotTgt = [s.aimE.x, s.aimE.y + enemyBodyOffset(s.aimE), s.aimE.z]; spawnPlasma(s, s.aimE); s.shotE = null; }
                  }
              }
          }
      }
      stepMove(s, dt, ev);
    // Each actor's simulator runs its own Multi-Target Shock Web Attack: gather, grip its bound web, discharge, then recover.
    { const sa = s as any; sa.snareCd = Math.max(0, (sa.snareCd || 0) - dt);
      if (controls.specialQ) { controls.specialQ = false; if (!(sa.snareCd > 0) && !(sa.snareT > 0) && !(s.landHard > 0) && !s.swim && !s.wall) { const L = s.enemies.filter((e) => e.down <= 0 && Math.hypot(e.x - p[0], e.z - p[2]) < 24 && Math.abs((e.boss ? targetY(e) : e.y) - p[1]) < 14 && losClear(p[0], p[1] + 1.5, p[2], e.x, e.y + enemyBodyOffset(e), e.z)).sort((a, b) => Math.hypot(a.x - p[0], a.z - p[2]) - Math.hypot(b.x - p[0], b.z - p[2])).slice(0, SNARE.MAX_TARGETS); if (L.length) { sa.snareList = L; sa.snareT = SNARE.TOTAL; sa.snareCd = 9; s.atkT = 0; s.shotT = 0; ev.attach(); } } }
      if (sa.snareT > 0) { const before = sa.snareT; sa.snareT = Math.max(0, sa.snareT - dt); const L = sa.snareList as Enemy[];
        if (sa.snareT > SNARE.IMPACT) { for (const e of L) { if (e.down > 0) continue; e.hit = Math.max(e.hit, 0.3); e.atk = 0; e.kb[0] = 0; e.kb[1] = 0;
          if (sa.snareT > SNARE.GATHER_END) { const dx = p[0] - e.x, dz = p[2] - e.z, d = Math.hypot(dx, dz); if (d > SNARE.GROUP_RADIUS) { const st = Math.min(d - SNARE.GROUP_RADIUS, SNARE.PULL_SPEED * dt), nx = e.x + dx / d * st, nz = e.z + dz / d * st; if ((e.roof ? inRoof(e, nx, nz) : !insideB(nx, nz) && !inPk(nx, nz)) && losClear(e.x, e.y + 0.5, e.z, nx, e.y + 0.5, nz)) { e.x = nx; e.z = nz; } } }
        } }
        if (before > SNARE.IMPACT && sa.snareT <= SNARE.IMPACT) { let any = false; for (const e of L) { if (e.down > 0) continue; const dx = e.x - p[0], dz = e.z - p[2], d = Math.hypot(dx, dz); if (d < 5.5 && losClear(p[0], p[1] + 1.5, p[2], e.x, e.y + enemyBodyOffset(e), e.z)) { e.hp -= 3; e.hit = 0.75; e.atk = 0; const nx = d > 0.01 ? dx / d : Math.sin(s.ang), nz = d > 0.01 ? dz / d : Math.cos(s.ang); e.kb = [nx * SNARE.KNOCKBACK, nz * SNARE.KNOCKBACK]; any = true; s.combo++; s.comboT = 1.2; if (e.hp <= 0) { e.down = 3; s.kos++; s.score += 2; ev.ko(); deathBlast(s, e); } } } if (any) { ev.hit(); sa.hitStop = SNARE.HIT_STOP; sa.shake = Math.max(sa.shake || 0, SNARE.SHAKE); } }
        if (sa.snareT <= 0) { sa.snareT = 0; sa.snareList = []; } }
    }
    if (options.updateEnemies !== false) {
    let atkN = 0; for (const e0 of s.enemies) if (e0.atk > 0) atkN++;
    for (let i = 0; i < s.enemies.length; i++) {
        const e = s.enemies[i], isBoss = !!e.boss;
        const sa = s as any, snareBound = e.down <= 0 && sa.snareT > SNARE.IMPACT && sa.snareList?.includes(e);
        const airb = snareBound ? false : enemyAir(s, e, dt, ev);
        if (e.down > 0) { e.down -= dt; if (e.down <= 0) { if (e.boss) { s.enemies.splice(i, 1); i--; } else s.enemies[i] = spawnEnemy(s); } continue; }
        if (snareBound) { e.atk = 0; e.kb[0] = 0; e.kb[1] = 0; continue; }
        e.hit = Math.max(0, e.hit - dt);
        if (airb) { const kx = e.kb[0] * dt, kz = e.kb[1] * dt; if (e.roof ? inRoof(e, e.x + kx, e.z + kz) : !insideB(e.x + kx, e.z + kz) && !inPk(e.x + kx, e.z + kz)) { e.x += kx; e.z += kz; } e.kb[0] *= 0.92; e.kb[1] *= 0.92; e.atk = 0; continue; }
        if (e.atk <= 0 && Math.hypot(e.x - p[0], e.z - p[2]) > 100) { s.enemies[i] = e.boss ? spawnBoss(s) : spawnEnemy(s); continue; }   // preserve boss type when re-placing far actors near the hero
        const kx = e.kb[0] * dt, kz = e.kb[1] * dt; if (Math.abs(kx) + Math.abs(kz) > 0.001 && (e.roof ? inRoof(e, e.x + kx, e.z + kz) : !insideB(e.x + kx, e.z + kz) && !inPk(e.x + kx, e.z + kz))) { e.x += kx; e.z += kz; } e.kb[0] *= 0.85; e.kb[1] *= 0.85;
        let dx = p[0] - e.x, dz = p[2] - e.z, d = Math.hypot(dx, dz), dy = Math.abs(p[1] - e.y);
        if (isBoss) {
            stepBossFlight(s, e, dt, p, d < 54 && dy < 18 && e.hit <= 0);
            dx = p[0] - e.x; dz = p[2] - e.z; d = Math.hypot(dx, dz); dy = Math.abs(p[1] - e.y);
        }
        if (d < (e.air ? 32 : isBoss ? 54 : 26) && (e.air || dy < (isBoss ? 18 : 5)) && e.hit <= 0) {
            e.ang = Math.atan2(dx, dz);
            if (e.air) e.y += Math.max(-5 * dt, Math.min(5 * dt, Math.max(2, p[1]) - e.y));   // drones descend/climb to the hero's height
            if (d > (isBoss ? 5.0 : 2.0) && e.atk <= 0 && (!isBoss || e.flight?.phase === 'grounded')) { const free = !!e.air && insideBA(e.x, e.z, e.y); const sp = (isBoss ? 1.65 : 4.2) * dt, nx = e.x + dx / d * sp, nz = e.z + dz / d * sp; if (e.roof ? inRoof(e, nx, e.z) : (free || !(e.air ? insideBA(nx, e.z, e.y) : insideB(nx, e.z))) && (e.air || !inPk(nx, e.z))) e.x = nx; if (e.roof ? inRoof(e, e.x, nz) : (free || !(e.air ? insideBA(e.x, nz, e.y) : insideB(e.x, nz))) && (e.air || !inPk(e.x, nz))) e.z = nz; }
            if (d <= (isBoss ? 5.3 : 2.4) && e.atk <= 0 && (!e.air || dy < 3) && (!isBoss || dy < 16) && atkN < (e.air ? 1 : 2) && ((s as any).windT ?? 0) <= s.t) { e.atk = isBoss ? 1.3 : 0.7 + (i % 3) * 0.12; atkN++; (s as any).windT = s.t + 0.45; } // telegraph; at most 2 enemies wind up at once (staggered, not one synchronized burst), drones wait to be at the hero's height
        }
        if (e.atk > 0) {
            e.atk -= dt;
            if (e.atk <= 0) {
                const dd = Math.hypot(p[0] - e.x, p[2] - e.z);
                if (dd < (isBoss ? 6.3 : 2.9) && Math.abs(p[1] - e.y) < (isBoss ? 18 : 3) && s.dodgeT <= 0) { s.hp -= isBoss ? 20 : 12; s.hurtT = 0.3; s.lastHit = s.t; ev.hurt(); }
                e.atk = isBoss ? -2.2 : -1.2;
            }
        } else if (e.atk < 0) e.atk = Math.min(0, e.atk + dt);
    }
    }
    // plasma bolts: gentle homing toward the locked enemy, detonate on enemy/building/ground or timeout
    for (let i = s.plasma.length - 1; i >= 0; i--) {
        const b = s.plasma[i]; b.t += dt;
        if (b.tgt && b.tgt.down <= 0) {
            const ty = b.tgt.y + enemyBodyOffset(b.tgt), d = norm([b.tgt.x - b.x, ty - b.y, b.tgt.z - b.z]);
            const sp = Math.hypot(b.vx, b.vy, b.vz), turn = Math.min(1, dt * 7);   // limited turn: tracks without wild curves
            b.vx += (d[0] * sp - b.vx) * turn; b.vy += (d[1] * sp - b.vy) * turn; b.vz += (d[2] * sp - b.vz) * turn;
        }
        const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt, nz = b.z + b.vz * dt;
        let boom = b.t > 1.4;
        if (!boom) for (const e of s.enemies) { if (e.down > 0) continue; if (Math.hypot(e.x - nx, e.z - nz) < (e.boss ? BOSS_HIT_RADIUS : 1.6) && Math.abs((e.y + enemyBodyOffset(e)) - ny) < (e.boss ? BOSS_HIT_HALF_HEIGHT : 2.4)) { boom = true; break; } }
        if (!boom) for (const bd of blds) { if (nx > bd.x0 && nx < bd.x1 && nz > bd.z0 && nz < bd.z1 && ny < bd.h) { boom = true; break; } }
        if (!boom) { const gy = nz < WATER_Z ? WATER_Y : 1.0 + parkH(nx, nz); if (ny <= gy - 0.85) boom = true; }
        if (boom) { detonate(s, nx, ny, nz, ev); s.plasma.splice(i, 1); } else { b.x = nx; b.y = ny; b.z = nz; }
    }
    for (let i = s.blasts.length - 1; i >= 0; i--) { s.blasts[i].t += dt; if (s.blasts[i].t > 0.85) s.blasts.splice(i, 1); }
}
export function stepBeacon(s: Sim, ev: Events) {
    const p = s.pos, b = s.beacon;
    if (Math.hypot(b[0] - p[0], b[1] - p[1], b[2] - p[2]) < 8) { s.beaconN++; s.score += 5; s.beacon = newBeacon(s); ev.orb(); }
}
