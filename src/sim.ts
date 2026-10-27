// Pure game simulation: city generation + swing physics. No rendering code here.
export type V3 = [number, number, number];
export interface Bld { x0: number; x1: number; z0: number; z1: number; h: number }

export const CELL = 40, N = 15, HALF = (N * CELL) / 2;
export const FOG: V3 = [0.86, 0.52, 0.5];
const G = 27;
export const JUMP_V = 16;
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
    const data: number[] = [];
    const idx: number[] = [];
    const box = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, col: V3, seed: number, skipBottom = true) => {
        for (let fi = 0; fi < 6; fi++) {
            if (skipBottom && fi === 5) continue;
            const f = FACES[fi], base = data.length / 10, n = f[0];
            for (let i = 1; i < 5; i++) { const p = f[i]; data.push(cx + p[0] * sx, cy + p[1] * sy, cz + p[2] * sz, n[0], n[1], n[2], col[0], col[1], col[2], seed); }
            idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
    };
    const mi = (N - 1) / 2;
    for (let i = 0; i < N; i++) for (let j = 2; j < N; j++) {
        const cx = (i - mi) * CELL, cz = (j - mi) * CELL;
        const dc = Math.hypot(cx, cz) / HALF;
        const w = 20 + rnd() * 8, d = 20 + rnd() * 8;
        let h = 28 + rnd() * 50 + (1 - dc) * 40 * rnd();
        if (rnd() < 0.12) h = 18 + rnd() * 10;
        if (rnd() < 0.08) h += 40;
        if (i === mi && j === mi) h = 30;
        else if (Math.abs(i - mi) <= 1 && Math.abs(j - mi) <= 1) h = 40 + rnd() * 15;
        blds.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, h });
        const tint = rnd();
        const pal: V3[] = [[0.78, 0.5, 0.45], [0.62, 0.5, 0.6], [0.85, 0.68, 0.52], [0.45, 0.5, 0.68], [0.7, 0.4, 0.4]];
        const col: V3 = pal[Math.floor(((i * 7 + j * 3) % 5 + tint * 1.5) % 5)];
        // stepped tower: base + slimmer top section for silhouette variety
        if (h > 40 && rnd() < 0.75) {
            const hb = h * 0.72;
            box(cx, hb / 2, cz, w / 2, hb / 2, d / 2, col, rnd());
            box(cx, hb + (h - hb) / 2, cz, w / 2 - 3, (h - hb) / 2, d / 2 - 3, col, rnd());
            // ledge so the upper section is not a hover: (collision uses the full box, fine)
            box(cx, hb + 0.4, cz, w / 2 + 0.6, 0.4, d / 2 + 0.6, [0.3, 0.28, 0.4], 0.5);
        } else box(cx, h / 2, cz, w / 2, h / 2, d / 2, col, rnd());
        const neon: V3[] = [[1.0, 0.2, 0.6], [0.2, 0.9, 1.0], [1.0, 0.6, 0.15], [0.6, 0.4, 1.0]];
        if (h > 34 && rnd() < 0.55) {
            const nc = neon[Math.floor(rnd() * 4)], py = h * (0.35 + rnd() * 0.3);
            if (rnd() < 0.5) { box(cx + (rnd() - 0.5) * (w - 12), py, cz - d / 2 - 0.3, 5 + rnd() * 3, 2.5 + rnd() * 2, 0.3, nc, 2.0); }
            else { box(cx + w / 2 + 0.3, py, cz + (rnd() - 0.5) * (d - 12), 0.3, 2.5 + rnd() * 2, 5 + rnd() * 3, nc, 2.0); }
        }
        if (rnd() < 0.4) { const nc = neon[Math.floor(rnd() * 4)]; box(cx, h + 0.15, cz, w / 2 + 0.2, 0.15, 0.2, nc, 2.0); }
        // skyline variety: crown tiers and spires on tall towers, window-band trim ledges
        if (h > 62) {
            // crown block in a roof corner, away from the landing/beacon centre; also a real collision box so it is solid and landable
            const ch = 8 + rnd() * 4, hx = 3, hz = 3, ccx = cx - w * 0.34, ccz = cz - d * 0.34;
            box(ccx, h + ch / 2, ccz, hx, ch / 2, hz, col, rnd());
            box(ccx, h + ch + 0.3, ccz, hx + 0.4, 0.3, hz + 0.4, [0.3, 0.28, 0.4], 0.5);
            blds.push({ x0: ccx - hx - 0.4, x1: ccx + hx + 0.4, z0: ccz - hz - 0.4, z1: ccz + hz + 0.4, h: h + ch + 0.6 }); // collision covers the ledge lip
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
    }
    const g = HALF + 200, base = data.length / 10;
    for (const p of [[-g, g], [g, g], [g, WATER_Z], [-g, WATER_Z]]) data.push(p[0], 0, p[1], 0, 1, 0, 0.16, 0.15, 0.2, 0.5);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    return { blds, data: new Float32Array(data), idx: new Uint32Array(idx) };
}
export const world = buildWorld();
const blds = world.blds;

export interface Enemy { roof?: { x0: number; x1: number; z0: number; z1: number }; x: number; y: number; z: number; hp: number; atk: number; hit: number; kb: [number, number]; ang: number; down: number }
export interface Sim {
    mode: 'menu' | 'play' | 'over';
    pos: V3; vel: V3; ground: boolean; web: boolean; anchor: V3; rope: number;
    yaw: number; pitch: number; ang: number; score: number; time: number; best: number;
    hp: number; hurtT: number; atkT: number; dodgeT: number; combo: number; comboT: number; kos: number; land: number; landHard: number; enemies: Enemy[]; lastHit: number;
    orbs: V3[]; beacon: V3; beaconN: number; t: number; runPhase: number; lastDrag: number; safe: V3; maxSpeed: number; swings: number; webT: number;
    swim: boolean; dive: boolean; wall: [number, number] | null; wallB: number; wallT: number; vaulted: number;
}
export interface Input { attackQ: boolean; dodgeQ: boolean; mx: number; my: number; swing: boolean; keys: Record<string, boolean>; jumpQ: boolean; swingQ: boolean }
export interface Events { orb: () => void; fall: () => void; attach: () => void; release: () => void; jump: () => void; hit: () => void; hurt: () => void; ko: () => void; land: (hard: boolean) => void }

export const input: Input = { attackQ: false, dodgeQ: false, mx: 0, my: 0, swing: false, keys: {}, jumpQ: false, swingQ: false };

export function createSim(): Sim {
    let best = 0;
    try { best = parseInt(localStorage.getItem('webswinger3d-best') || '0', 10) || 0; } catch (e) { /* ignore */ }
    const s: Sim = { mode: 'menu', pos: [0, 0, 0], vel: [0, 0, 0], ground: true, web: false, anchor: [0, 0, 0], rope: 20, yaw: 0, pitch: 0.28, ang: 0, score: 0, time: 75, best, hp: 100, hurtT: 0, atkT: 0, dodgeT: 0, combo: 0, comboT: 0, kos: 0, land: 0, landHard: 0, enemies: [], lastHit: -9, orbs: [], beacon: [0, 0, 0], beaconN: 0, t: 0, runPhase: 0, lastDrag: -10, safe: [0, 0, 0], maxSpeed: 0, swings: 0, webT: 0, swim: false, dive: false, wall: null, wallB: -1, wallT: 0, vaulted: 0 };
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
function spawnEnemy(s: Sim): Enemy {
    if (Math.random() < 0.4) {
        const cand = blds.filter((b) => { const d = Math.hypot((b.x0 + b.x1) / 2 - s.pos[0], (b.z0 + b.z1) / 2 - s.pos[2]); return b.x1 - b.x0 > 10 && d > 30 && d < 150 && b.h < 60; });
        if (cand.length) { const b = cand[Math.floor(Math.random() * cand.length)]; return { roof: { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 }, x: (b.x0 + b.x1) / 2 + (Math.random() - 0.5) * 6, y: b.h + 1, z: (b.z0 + b.z1) / 2 + (Math.random() - 0.5) * 6, hp: 3, atk: 0, hit: 0, kb: [0, 0], ang: 0, down: 0 }; }
    }
    for (let k = 0; k < 60; k++) {
        const x = (Math.floor(Math.random() * (N - 1)) - (N - 2) / 2) * CELL + (Math.random() < 0.5 ? -CELL / 2 + 0 : CELL / 2 - 0), z = (Math.random() - 0.5) * 2 * (HALF - 40);
        if (z < WATER_Z + 8) continue;
        const sx = Math.round((x - CELL / 2) / CELL) * CELL + CELL / 2;
        if (Math.hypot(sx - s.pos[0], z - s.pos[2]) < 18) continue;
        let inside = false;
        for (const b of blds) if (sx > b.x0 - 1 && sx < b.x1 + 1 && z > b.z0 - 1 && z < b.z1 + 1) { inside = true; break; }
        if (!inside) return { x: sx, y: 1, z, hp: 3, atk: 0, hit: 0, kb: [0, 0], ang: 0, down: 0 };
    }
    return { x: 20, y: 1, z: 20, hp: 3, atk: 0, hit: 0, kb: [0, 0], ang: 0, down: 0 };
}
export function resetSim(s: Sim) {
    const b = blds.reduce((best, c) => Math.hypot(c.x0, c.z0) < Math.hypot(best.x0, best.z0) ? c : best, blds[0]);
    s.pos = [(b.x0 + b.x1) / 2 + 4, b.h + 1, (b.z0 + b.z1) / 2 - 4]; s.vel = [0, 0, 0]; s.web = false; s.ground = true; s.safe = [...s.pos] as V3;
    s.score = 0; s.time = 0; s.yaw = 0; s.swings = 0; s.maxSpeed = 0; s.ang = 0;
    s.orbs = []; for (let i = 0; i < 18; i++) s.orbs.push(newOrb(s));
    s.beaconN = 0; s.beacon = newBeacon(s);
    s.wall = null; s.swim = false; s.dive = false; s.wallT = 0; s.vaulted = 0; s.hp = 100; s.hurtT = 0; s.atkT = 0; s.dodgeT = 0; s.combo = 0; s.comboT = 0; s.kos = 0; s.land = 0; s.landHard = 0;
    s.enemies = []; for (let i = 0; i < 10; i++) s.enemies.push(spawnEnemy(s));
}

function findAnchor(s: Sim): V3 {
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
    return best || [p[0] + fx * 24, p[1] + 26, p[2] + fz * 24];
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

export function stepSim(s: Sim, dt: number, ev: Events) {
    const p = s.pos, v = s.vel, k = input.keys;
    let mx = input.mx + ((k['d'] ? 1 : 0) - (k['a'] ? 1 : 0)), my = input.my + ((k['w'] ? 1 : 0) - (k['s'] ? 1 : 0));
    const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
    const turn = (k['arrowleft'] ? 1 : 0) - (k['arrowright'] ? 1 : 0);
    if (turn) { s.yaw += turn * 2.0 * dt; s.lastDrag = s.t; }
    if (k['arrowup']) s.pitch = Math.max(0.05, s.pitch - dt); if (k['arrowdown']) s.pitch = Math.min(1.0, s.pitch + dt);
    const swingHeld = input.swing || k['shift'] || k['f'];
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), rx = -fz, rz = fx;
    const stunned = s.landHard > 0;
    const wx = stunned ? 0 : fx * my + rx * mx, wz = stunned ? 0 : fz * my + rz * mx;

    if (input.swingQ && !s.web) {
        s.anchor = findAnchor(s); s.web = true; s.webT = 0; s.rope = Math.max(12, len(sub(s.anchor, p))); s.swings++;
        const d = norm(sub(s.anchor, p)); v[0] += d[0] * 6; v[1] += d[1] * 4; v[2] += d[2] * 6; s.ground = false; s.wall = null; ev.attach();
    }
    input.swingQ = false;
    if (!swingHeld && s.web) { s.web = false; v[1] += 3; ev.release(); }
    if (input.jumpQ) {
        input.jumpQ = false;
        if (s.swim) { if (s.dive) s.dive = false; else if (p[2] > WATER_Z - 3) { p[1] = 1; p[2] = WATER_Z + 1.3; v[0] = v[1] = v[2] = 0; s.swim = false; s.ground = true; ev.jump(); } else { v[1] = 9; s.swim = false; ev.jump(); } }
        else
        if (s.wall) { const n = s.wall; v[0] = n[0] * 11; v[2] = n[1] * 11; v[1] = 15; s.wall = null; s.wallT = 0.25; s.ground = false; ev.jump(); }
        else if (s.ground) { v[1] = JUMP_V; s.ground = false; ev.jump(); }
        else if (s.web) { s.web = false; v[1] += 8; ev.jump(); }
    }
    const prevY = p[1];
    const wasGround = s.ground, landVy = v[1];
    if (s.landHard > 0) s.landHard -= dt;
    s.wallT = Math.max(0, s.wallT - dt);
    if (!s.web) { const zone = p[2] < WATER_Z; if (zone && p[1] < WATER_Y + 0.9) s.swim = true; else if (!zone || p[1] > WATER_Y + 1.4) { s.swim = false; s.dive = false; } } else { s.swim = false; s.dive = false; }
    if (s.swim) { s.wall = null; s.ground = false; if (input.dodgeQ) { input.dodgeQ = false; s.dive = !s.dive; } }
    if (s.wall && s.t - s.lastDrag > 0.8) s.pitch += (0.3 - s.pitch) * Math.min(1, dt * 3);
    if (s.swim) {
        const sp = s.dive ? 5 : 6.5, a = Math.min(1, dt * 4);
        v[0] += (wx * sp - v[0]) * a; v[2] += (wz * sp - v[2]) * a;
        const target = s.dive ? -5 : WATER_Y + 0.25;
        v[1] += ((target - p[1]) * 3 - v[1]) * Math.min(1, dt * 5);
        s.runPhase += Math.hypot(v[0], v[2]) * dt * 0.8;
        if (p[2] > WATER_Z - 1.2 && wz > 0.3 && p[1] > WATER_Y - 2.5) { p[1] = 1; p[2] = WATER_Z + 1.3; v[0] = v[1] = v[2] = 0; s.swim = false; s.dive = false; s.ground = true; }
    } else if (s.wall && !s.web) {
        const n = s.wall, tx = -n[1], tz = n[0];
        const push = -(wx * n[0] + wz * n[1]), lat = wx * tx + wz * tz;
        if (push < -0.3) { s.wall = null; s.wallT = 0.2; v[0] = n[0] * 3; v[2] = n[1] * 3; v[1] = 0; }
        else {
            const up = push > 0.3 ? push * 9 : 0;
            v[0] = tx * lat * 11 - n[0] * 2; v[2] = tz * lat * 11 - n[1] * 2; v[1] += (up - v[1]) * Math.min(1, dt * 12);
            s.runPhase += (Math.abs(up) + Math.abs(lat) * 11) * dt * 0.6;
        }
    } else if (s.ground && !s.web) {
        const a = Math.min(1, dt * 10); v[0] += (wx * 11 - v[0]) * a; v[2] += (wz * 11 - v[2]) * a; v[1] = 0;
    } else {
        v[1] -= G * dt;
        const air = s.web ? 12 : 7; v[0] += wx * air * dt; v[2] += wz * air * dt;
        if (s.web) { const hs0 = Math.hypot(v[0], v[2]); const px = hs0 > 2 ? v[0] / hs0 : fx, pz = hs0 > 2 ? v[2] / hs0 : fz; const boost = hs0 < 34 ? 14 : 0; v[0] += px * boost * dt; v[2] += pz * boost * dt; }
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
    collide(s, prevY);
    if (hitN && !s.web && !s.ground && s.wallT <= 0 && !stunned) {
        const push = -(wx * hitN[0] + wz * hitN[1]);
        if (s.wall || push > 0.5) { if (!s.wall) { s.vaulted = 0; } s.wall = hitN; s.wallB = hitB; }
    } else if (hitN && !s.web && s.ground && p[1] > 1.2) { /* standing on a roof, touching wall: no attach */ s.wall = null; }
    else if (hitN && !s.web && s.wallT <= 0 && !stunned && p[1] <= 1.05 && -(wx * hitN[0] + wz * hitN[1]) > 0.5) { s.wall = hitN; s.wallB = hitB; v[1] = 0.1; p[1] = 1.06; }
    else if (!hitN) s.wall = null;
    if (s.wall && s.wallB >= 0) { const b = blds[s.wallB]; if (p[1] - 1.0 >= b.h - 0.5) { const n = s.wall; p[1] = b.h + 1.02; p[0] -= n[0] * 1.1; p[2] -= n[1] * 1.1; v[0] = v[1] = v[2] = 0; s.wall = null; s.vaulted++; s.ground = true; s.safe = [p[0], p[1], p[2]]; } }
    if (s.ground && s.web && p[1] > 1.2) s.web = false;
    if (s.swim && p[1] < SEABED + 1) { p[1] = SEABED + 1; if (v[1] < 0) v[1] = 0; }
    if (p[1] <= 1.0005 && p[2] >= WATER_Z && !s.swim) { // street level: walkable
        if (!s.ground) { s.ground = true; }
        p[1] = 1.0; if (v[1] < 0) v[1] = 0;
    }
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
    stepCombat(s, dt, ev);
    if (s.t - s.lastDrag > 1.2 && hs > 8 && !s.ground && !s.wall) {
        let da = Math.atan2(v[0], v[2]) - s.yaw; da = Math.atan2(Math.sin(da), Math.cos(da)); s.yaw += da * Math.min(1, dt * 1.6);
    }
    for (let i = 0; i < s.orbs.length; i++) {
        const o = s.orbs[i];
        if (Math.hypot(o[0] - p[0], o[1] - p[1], o[2] - p[2]) < 5.5) { s.score++; s.orbs[i] = newOrb(s); ev.orb(); }
    }
}
export const buildings = blds;
const insideB = (x: number, z: number) => { for (const b of blds) if (x > b.x0 - 0.6 && x < b.x1 + 0.6 && z > b.z0 - 0.6 && z < b.z1 + 0.6) return true; return false; };
const inRoof = (e: Enemy, x: number, z: number) => !!e.roof && x > e.roof.x0 + 1 && x < e.roof.x1 - 1 && z > e.roof.z0 + 1 && z < e.roof.z1 - 1;
function stepCombat(s: Sim, dt: number, ev: Events) {
    const p = s.pos, v = s.vel;
    if (s.hp <= 0) { s.hp = 100; p[0] = s.safe[0]; p[1] = s.safe[1] + 0.5; p[2] = s.safe[2]; v[0] = v[1] = v[2] = 0; s.web = false; ev.fall(); }
    s.atkT = Math.max(0, s.atkT - dt); s.dodgeT = Math.max(0, s.dodgeT - dt); s.hurtT = Math.max(0, s.hurtT - dt); s.comboT = Math.max(0, s.comboT - dt);
    if (s.comboT === 0) s.combo = 0;
    if (s.hp > 0 && s.t - s.lastHit > 5 && s.hp < 100) s.hp = Math.min(100, s.hp + 6 * dt);
    const fa = s.ang, fx = Math.sin(fa), fz = Math.cos(fa);
    if (input.dodgeQ) {
        input.dodgeQ = false;
        if (s.dodgeT <= 0 && !s.web) { s.dodgeT = 0.38; const mx = input.mx + ((input.keys['d'] ? 1 : 0) - (input.keys['a'] ? 1 : 0)), my = input.my + ((input.keys['w'] ? 1 : 0) - (input.keys['s'] ? 1 : 0)); const yx = Math.sin(s.yaw), yz = Math.cos(s.yaw); let dx = yx * my - yz * mx, dz = yz * my + yx * mx; const dl = Math.hypot(dx, dz); if (dl < 0.1) { dx = -fx; dz = -fz; } else { dx /= dl; dz /= dl; } v[0] = dx * 18; v[2] = dz * 18; }
    }
    if (input.attackQ) {
        input.attackQ = false;
        if (s.atkT <= 0) {
            s.atkT = 0.32; let hitAny = false;
            for (const e of s.enemies) {
                if (e.down > 0) continue;
                const dx = e.x - p[0], dz = e.z - p[2], d = Math.hypot(dx, dz);
                if (d < 3.6 && Math.abs(e.y - p[1]) < 3.5 && (d < 1.2 || (dx * fx + dz * fz) / (d || 1) > -0.1)) {
                    e.hp -= 1; e.hit = 0.25; e.kb = [dx / (d || 1) * 9, dz / (d || 1) * 9]; hitAny = true; s.combo++; s.comboT = 1.2;
                    if (e.hp <= 0) { e.down = 3; s.kos++; s.score += 2; ev.ko(); }
                }
            }
            if (hitAny) ev.hit();
        }
    }
    for (let i = 0; i < s.enemies.length; i++) {
        const e = s.enemies[i];
        if (e.down > 0) { e.down -= dt; if (e.down <= 0) s.enemies[i] = spawnEnemy(s); continue; }
        e.hit = Math.max(0, e.hit - dt);
        const kx = e.kb[0] * dt, kz = e.kb[1] * dt; if (Math.abs(kx) + Math.abs(kz) > 0.001 && (e.roof ? inRoof(e, e.x + kx, e.z + kz) : !insideB(e.x + kx, e.z + kz))) { e.x += kx; e.z += kz; } e.kb[0] *= 0.85; e.kb[1] *= 0.85;
        const dx = p[0] - e.x, dz = p[2] - e.z, d = Math.hypot(dx, dz), dy = Math.abs(p[1] - e.y);
        if (d < 26 && dy < 5 && e.hit <= 0) {
            e.ang = Math.atan2(dx, dz);
            if (d > 2.0 && e.atk <= 0) { const sp = 4.2 * dt, nx = e.x + dx / d * sp, nz = e.z + dz / d * sp; if (e.roof ? inRoof(e, nx, e.z) : !insideB(nx, e.z)) e.x = nx; if (e.roof ? inRoof(e, e.x, nz) : !insideB(e.x, nz)) e.z = nz; }
            if (d <= 2.4 && e.atk <= 0) e.atk = 0.7; // telegraph
        }
        if (e.atk > 0) {
            e.atk -= dt;
            if (e.atk <= 0) {
                const dd = Math.hypot(p[0] - e.x, p[2] - e.z);
                if (dd < 2.9 && Math.abs(p[1] - e.y) < 3 && s.dodgeT <= 0) { s.hp -= 12; s.hurtT = 0.3; s.lastHit = s.t; ev.hurt(); }
                e.atk = -1.2;
            }
        } else if (e.atk < 0) e.atk = Math.min(0, e.atk + dt);
    }
}
export function stepBeacon(s: Sim, ev: Events) {
    const p = s.pos, b = s.beacon;
    if (Math.hypot(b[0] - p[0], b[1] - p[1], b[2] - p[2]) < 8) { s.beaconN++; s.score += 5; s.beacon = newBeacon(s); ev.orb(); }
}
