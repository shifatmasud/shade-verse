// Pure game simulation: city generation + swing physics. No rendering code here.
export type V3 = [number, number, number];
export interface Bld { x0: number; x1: number; z0: number; z1: number; h: number }

export const CELL = 40, N = 15, HALF = (N * CELL) / 2;
export const FOG: V3 = [0.86, 0.52, 0.5];
const G = 27;

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
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const cx = (i - mi) * CELL, cz = (j - mi) * CELL;
        const dc = Math.hypot(cx, cz) / HALF;
        const w = 20 + rnd() * 8, d = 20 + rnd() * 8;
        let h = 28 + rnd() * 50 + (1 - dc) * 40 * rnd();
        if (rnd() < 0.12) h = 18 + rnd() * 10;
        if (rnd() < 0.08) h += 40;
        if (i === mi && j === mi) h = 30;
        else if (Math.abs(i - mi) <= 1 && Math.abs(j - mi) <= 1) h = Math.min(h, 24 + rnd() * 16);
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
    for (const p of [[-g, g], [g, g], [g, -g], [-g, -g]]) data.push(p[0], 0, p[1], 0, 1, 0, 0.16, 0.15, 0.2, 0.5);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    return { blds, data: new Float32Array(data), idx: new Uint32Array(idx) };
}
export const world = buildWorld();
const blds = world.blds;

export interface Sim {
    mode: 'menu' | 'play' | 'over';
    pos: V3; vel: V3; ground: boolean; web: boolean; anchor: V3; rope: number;
    yaw: number; pitch: number; ang: number; score: number; time: number; best: number;
    orbs: V3[]; t: number; runPhase: number; lastDrag: number; safe: V3; maxSpeed: number; swings: number; webT: number;
}
export interface Input { mx: number; my: number; swing: boolean; keys: Record<string, boolean>; jumpQ: boolean; swingQ: boolean }
export interface Events { orb: () => void; fall: () => void; attach: () => void; release: () => void; jump: () => void }

export const input: Input = { mx: 0, my: 0, swing: false, keys: {}, jumpQ: false, swingQ: false };

export function createSim(): Sim {
    let best = 0;
    try { best = parseInt(localStorage.getItem('webswinger3d-best') || '0', 10) || 0; } catch (e) { /* ignore */ }
    const s: Sim = { mode: 'menu', pos: [0, 0, 0], vel: [0, 0, 0], ground: true, web: false, anchor: [0, 0, 0], rope: 20, yaw: 0, pitch: 0.28, ang: 0, score: 0, time: 75, best, orbs: [], t: 0, runPhase: 0, lastDrag: -10, safe: [0, 0, 0], maxSpeed: 0, swings: 0, webT: 0 };
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
export function resetSim(s: Sim) {
    const b = blds.reduce((best, c) => Math.hypot(c.x0, c.z0) < Math.hypot(best.x0, best.z0) ? c : best, blds[0]);
    s.pos = [(b.x0 + b.x1) / 2 + 4, b.h + 1, (b.z0 + b.z1) / 2 - 4]; s.vel = [0, 0, 0]; s.web = false; s.ground = true; s.safe = [...s.pos] as V3;
    s.score = 0; s.time = 75; s.yaw = 0; s.swings = 0; s.maxSpeed = 0; s.ang = 0;
    s.orbs = []; for (let i = 0; i < 18; i++) s.orbs.push(newOrb(s));
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

function collide(s: Sim, prevY: number) {
    const p = s.pos, v = s.vel; s.ground = false;
    const hw = 0.5, hh = 1.0;
    for (const b of blds) {
        if (p[0] + hw <= b.x0 || p[0] - hw >= b.x1 || p[2] + hw <= b.z0 || p[2] - hw >= b.z1 || p[1] - hh >= b.h || p[1] + hh <= 0) continue;
        if (prevY - hh >= b.h - 0.6 && v[1] <= 0.5) { p[1] = b.h + hh; if (v[1] < 0) v[1] = 0; s.ground = true; s.safe = [p[0], p[1], p[2]]; continue; }
        const l = p[0] + hw - b.x0, r = b.x1 - (p[0] - hw), f = p[2] + hw - b.z0, k = b.z1 - (p[2] - hw), m = Math.min(l, r, f, k);
        if (m === l) { p[0] -= l; if (v[0] > 0) v[0] *= -0.1; } else if (m === r) { p[0] += r; if (v[0] < 0) v[0] *= -0.1; }
        else if (m === f) { p[2] -= f; if (v[2] > 0) v[2] *= -0.1; } else { p[2] += k; if (v[2] < 0) v[2] *= -0.1; }
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
    const wx = fx * my + rx * mx, wz = fz * my + rz * mx;

    if (input.swingQ && !s.web) {
        s.anchor = findAnchor(s); s.web = true; s.webT = 0; s.rope = Math.max(12, len(sub(s.anchor, p))); s.swings++;
        const d = norm(sub(s.anchor, p)); v[0] += d[0] * 6; v[1] += d[1] * 4; v[2] += d[2] * 6; s.ground = false; ev.attach();
    }
    input.swingQ = false;
    if (!swingHeld && s.web) { s.web = false; v[1] += 3; ev.release(); }
    if (input.jumpQ) {
        input.jumpQ = false;
        if (s.ground) { v[1] = 11.5; s.ground = false; ev.jump(); }
        else if (s.web) { s.web = false; v[1] += 8; ev.jump(); }
    }
    const prevY = p[1];
    if (s.ground) {
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
        if (l > s.rope) {
            const n: V3 = [d[0] / l, d[1] / l, d[2] / l];
            p[0] = a[0] + n[0] * s.rope; p[1] = a[1] + n[1] * s.rope; p[2] = a[2] + n[2] * s.rope;
            const vn = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
            if (vn > 0) { v[0] -= n[0] * vn; v[1] -= n[1] * vn; v[2] -= n[2] * vn; }
        }
    }
    collide(s, prevY);
    if (s.ground && s.web) s.web = false;
    if (p[1] - 1 < 0.2) {
        s.time = Math.max(0, s.time - 4); ev.fall();
        p[0] = s.safe[0]; p[1] = s.safe[1] + 0.5; p[2] = s.safe[2]; v[0] = v[1] = v[2] = 0; s.web = false;
    }
    const sp = len(v); if (sp > s.maxSpeed) s.maxSpeed = sp;
    const hs = Math.hypot(v[0], v[2]);
    if (hs > 1.5) { let da = Math.atan2(v[0], v[2]) - s.ang; da = Math.atan2(Math.sin(da), Math.cos(da)); s.ang += da * Math.min(1, dt * 12); }
    if (s.ground) s.runPhase += hs * dt * 0.9;
    if (s.t - s.lastDrag > 1.2 && hs > 8 && !s.ground) {
        let da = Math.atan2(v[0], v[2]) - s.yaw; da = Math.atan2(Math.sin(da), Math.cos(da)); s.yaw += da * Math.min(1, dt * 1.6);
    }
    for (let i = 0; i < s.orbs.length; i++) {
        const o = s.orbs[i];
        if (Math.hypot(o[0] - p[0], o[1] - p[1], o[2] - p[2]) < 5.5) { s.score++; s.time = Math.min(99, s.time + 3); s.orbs[i] = newOrb(s); ev.orb(); }
    }
}
export const buildings = blds;
