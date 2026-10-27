// Original procedural character generator: SDF anatomy -> surface nets mesh -> skin weights. No external assets.
import fs from 'fs';
const out = process.argv[2] || 'src/hero.json';
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const P = []; // primitives
const rc = (a, b, r0, r1, sz = 1) => P.push({ t: 'rc', a, b, r0, r1, sz });
const el = (c, r) => P.push({ t: 'el', c, r });
const sp = (c, r) => P.push({ t: 'el', c, r: [r, r, r] });
const mir = (f) => { f(1); f(-1); };
el([0, 1.02, 0], [0.2, 0.14, 0.14]);
rc([0, 1.05, 0], [0, 1.3, 0], 0.15, 0.17, 0.85);
el([0, 1.5, 0.01], [0.27, 0.22, 0.17]);
mir((s) => { sp([s * 0.1, 1.52, 0.1], 0.1); sp([s * 0.3, 1.62, 0], 0.088); });
rc([0, 1.66, 0], [0, 1.78, 0], 0.07, 0.065);
el([0, 1.96, 0.01], [0.115, 0.15, 0.13]); sp([0, 1.86, 0.06], 0.08);
mir((s) => {
    rc([s * 0.31, 1.6, 0], [s * 0.4, 1.28, 0], 0.078, 0.058); rc([s * 0.4, 1.28, 0], [s * 0.44, 1.0, 0.05], 0.06, 0.045); sp([s * 0.41, 1.2, 0.02], 0.062);
    el([s * 0.45, 0.93, 0.06], [0.05, 0.075, 0.04]);
    rc([s * 0.12, 1.0, 0], [s * 0.14, 0.56, 0.02], 0.118, 0.07); sp([s * 0.13, 0.85, 0.04], 0.095);
    rc([s * 0.14, 0.56, 0.02], [s * 0.13, 0.12, -0.01], 0.068, 0.045); sp([s * 0.14, 0.45, -0.035], 0.062);
    rc([s * 0.13, 0.075, -0.01], [s * 0.13, 0.06, 0.17], 0.056, 0.05);
});
// fingers: hard-union among themselves (so they stay separate), then blended into the hand
const FG = (c, d, rr) => P.push({ t: 'fg', c, d, rr });
mir((s) => {
    const hx = s * 0.452, hy = 0.9, hz = 0.06;
    [[-0.026, 0.0, 0.082], [-0.009, 0.0, 0.098], [0.009, 0.0, 0.094], [0.026, 0.0, 0.078]].forEach(([ox, oz, len], i) => FG([hx + s * ox, hy - 0.02, hz + 0.006 + oz], [0, -len, 0.012 * (i === 3 ? 0.4 : 0.8)], 0.0135 - i * 0.0004));
    FG([hx - s * 0.04, hy + 0.01, hz + 0.02], [-s * 0.01, -0.05, 0.035], 0.0155); // thumb
});
const K = 0.045;
const smin = (a, b) => { const h = Math.max(K - Math.abs(a - b), 0) / K; return Math.min(a, b) - h * h * K * 0.25; };
function sdf(x, y, z) {
    let d = 1e9, df = 1e9;
    for (const q of P) {
        let v;
        if (q.t === 'fg') { const ba = q.d, pa = [x - q.c[0], y - q.c[1], z - q.c[2]]; const h = Math.max(0, Math.min(1, dot(pa, ba) / dot(ba, ba))); const w = Math.hypot(pa[0] - ba[0] * h, pa[1] - ba[1] * h, pa[2] - ba[2] * h) - q.rr * (1 - 0.35 * h); df = Math.min(df, w); continue; }
        if (q.t === 'el') {
            const px = (x - q.c[0]) / q.r[0], py = (y - q.c[1]) / q.r[1], pz = (z - q.c[2]) / q.r[2];
            const k0 = Math.hypot(px, py, pz); v = (k0 - 1) * Math.min(q.r[0], q.r[1], q.r[2]);
        } else {
            const zz = q.sz !== 1 ? (z / q.sz) : z;
            const ba = sub(q.b, q.a), pa = [x - q.a[0], y - q.a[1], zz - q.a[2]];
            const h = Math.max(0, Math.min(1, dot(pa, ba) / dot(ba, ba)));
            v = Math.hypot(pa[0] - ba[0] * h, pa[1] - ba[1] * h, pa[2] - ba[2] * h) - (q.r0 + (q.r1 - q.r0) * h);
            if (q.sz !== 1) v *= q.sz;
        }
        d = smin(d, v);
    }
    d = smin(d, df);
    return d;
}
const R = 0.016, X0 = -0.62, Y0 = -0.03, Z0 = -0.3, NX = Math.ceil(1.24 / R), NY = Math.ceil(2.25 / R), NZ = Math.ceil(0.68 / R);
const idx3 = (i, j, k) => (i * (NY + 1) + j) * (NZ + 1) + k;
const val = new Float32Array((NX + 1) * (NY + 1) * (NZ + 1));
for (let i = 0; i <= NX; i++) for (let j = 0; j <= NY; j++) for (let k = 0; k <= NZ; k++) val[idx3(i, j, k)] = sdf(X0 + i * R, Y0 + j * R, Z0 + k * R);
const cellV = new Int32Array(NX * NY * NZ).fill(-1);
const verts = [];
const cid = (i, j, k) => (i * NY + j) * NZ + k;
const CORN = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
const EDG = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) for (let k = 0; k < NZ; k++) {
    const v = CORN.map((c) => val[idx3(i + c[0], j + c[1], k + c[2])]);
    let neg = 0; for (const a of v) if (a < 0) neg++;
    if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of EDG) {
        if ((v[a] < 0) === (v[b] < 0)) continue;
        const t = v[a] / (v[a] - v[b]);
        sx += CORN[a][0] + (CORN[b][0] - CORN[a][0]) * t; sy += CORN[a][1] + (CORN[b][1] - CORN[a][1]) * t; sz += CORN[a][2] + (CORN[b][2] - CORN[a][2]) * t; n++;
    }
    cellV[cid(i, j, k)] = verts.length; verts.push([X0 + (i + sx / n) * R, Y0 + (j + sy / n) * R, Z0 + (k + sz / n) * R]);
}
const tris = [];
const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) tris.push(a, c, b, a, d, c); else tris.push(a, b, c, a, c, d); };
for (let i = 1; i < NX; i++) for (let j = 1; j < NY; j++) for (let k = 1; k < NZ; k++) {
    const s0 = val[idx3(i, j, k)] < 0;
    // x-edge
    if (s0 !== (val[idx3(i + 1, j, k)] < 0)) quad(cellV[cid(i, j - 1, k - 1)], cellV[cid(i, j, k - 1)], cellV[cid(i, j, k)], cellV[cid(i, j - 1, k)], s0);
    if (s0 !== (val[idx3(i, j + 1, k)] < 0)) quad(cellV[cid(i - 1, j, k - 1)], cellV[cid(i - 1, j, k)], cellV[cid(i, j, k)], cellV[cid(i, j, k - 1)], s0);
    if (s0 !== (val[idx3(i, j, k + 1)] < 0)) quad(cellV[cid(i - 1, j - 1, k)], cellV[cid(i, j - 1, k)], cellV[cid(i, j, k)], cellV[cid(i - 1, j, k)], s0);
}
// normals by gradient; fix winding to match
const grad = (p) => { const e = 0.004; const g = [sdf(p[0] + e, p[1], p[2]) - sdf(p[0] - e, p[1], p[2]), sdf(p[0], p[1] + e, p[2]) - sdf(p[0], p[1] - e, p[2]), sdf(p[0], p[1], p[2] + e) - sdf(p[0], p[1], p[2] - e)]; const l = Math.hypot(...g) || 1; return [g[0] / l, g[1] / l, g[2] / l]; };
const nrm = verts.map(grad);
let flipped = 0;
for (let t = 0; t < tris.length; t += 3) {
    const a = verts[tris[t]], b = verts[tris[t + 1]], c = verts[tris[t + 2]];
    const u = sub(b, a), w = sub(c, a); const fn = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const gn = [nrm[tris[t]][0] + nrm[tris[t + 1]][0] + nrm[tris[t + 2]][0], nrm[tris[t]][1] + nrm[tris[t + 1]][1] + nrm[tris[t + 2]][1], nrm[tris[t]][2] + nrm[tris[t + 1]][2] + nrm[tris[t + 2]][2]];
    if (dot(fn, gn) < 0) { const tmp = tris[t + 1]; tris[t + 1] = tris[t + 2]; tris[t + 2] = tmp; flipped++; }
}
// bones
const B = [
    ['hips', -1, [0, 1.0, 0], [0, 1.0, 0], [0, 1.1, 0]], ['spine', 0, [0, 1.1, 0], [0, 1.1, 0], [0, 1.35, 0]], ['chest', 1, [0, 1.35, 0], [0, 1.35, 0], [0, 1.7, 0]],
    ['neck', 2, [0, 1.7, 0], [0, 1.7, 0], [0, 1.82, 0]], ['head', 3, [0, 1.82, 0], [0, 1.82, 0], [0, 2.12, 0]],
];
const add = (n, par, h, t) => B.push([n, par, h, h, t]);
const side = (s, nm) => {
    const base = B.length; const i0 = B.findIndex((b) => b[0] === 'chest');
    add('uarmR'.replace('R', nm), i0, [s * 0.31, 1.6, 0], [s * 0.4, 1.28, 0]); add('farm' + nm, base, [s * 0.4, 1.28, 0], [s * 0.44, 1.0, 0.05]); add('hand' + nm, base + 1, [s * 0.44, 1.0, 0.05], [s * 0.46, 0.86, 0.06]);
    add('thigh' + nm, 0, [s * 0.12, 1.0, 0], [s * 0.14, 0.56, 0.02]); add('shin' + nm, base + 3, [s * 0.14, 0.56, 0.02], [s * 0.13, 0.1, -0.01]); add('foot' + nm, base + 4, [s * 0.13, 0.1, -0.01], [s * 0.13, 0.05, 0.17]);
};
side(-1, 'R'); side(1, 'L'); // R = negative x? (matches old rig: legR at +x). Fix below.
// old hero: legR at x=+0.11. swap labels so R is +x
for (const b of B) { if (b[0].endsWith('R')) b[0] = b[0].slice(0, -1) + '#'; }
for (const b of B) { if (b[0].endsWith('L')) b[0] = b[0].slice(0, -1) + 'R'; }
for (const b of B) { if (b[0].endsWith('#')) b[0] = b[0].slice(0, -1) + 'L'; }
const segd = (p, a, b) => { const ba = sub(b, a), pa = sub(p, a); const h = Math.max(0, Math.min(1, dot(pa, ba) / (dot(ba, ba) || 1))); return Math.hypot(pa[0] - ba[0] * h, pa[1] - ba[1] * h, pa[2] - ba[2] * h); };
const skinI = [], skinW = [];
for (const p of verts) {
    const ds = B.map((b, i) => {
        let d = segd(p, b[3], b[4]);
        const nm = b[0];
        if (/^(uarm|farm|hand)/.test(nm) && Math.abs(p[0]) < 0.2 && p[1] < 1.6) d += 1; // arms don't grab the torso
        if (/^(thigh|shin|foot)/.test(nm) && p[1] > 1.08) d += 1;
        if (nm === 'head' && p[1] < 1.8) d += 0.3;
        return [d, i];
    }).sort((a, b) => a[0] - b[0]).slice(0, 4);
    let ws = ds.map((q) => 1 / Math.pow(q[0] + 0.012, 3)); const sum = ws.reduce((a, b) => a + b, 0); ws = ws.map((w) => w / sum);
    skinI.push(...ds.map((q) => q[1])); skinW.push(...ws);
}
// colors
const SUIT = [0.1, 0.22, 0.72], DARK = [0.05, 0.08, 0.28], GOLD = [0.95, 0.72, 0.2], PIPE = [0.45, 0.88, 1.0], MASK = [0.92, 0.92, 0.98], EYE = [2.6, 2.8, 3.2], GLOVE = [0.05, 0.06, 0.12], BOOT = [0.07, 0.09, 0.2];
const colorOf = (p, n) => {
    const [x, y, z] = p, ax = Math.abs(x);
    // head
    if (y > 1.74) {
        if (z > 0.07 && y > 1.84 && y < 2.08 && ax < 0.108) {
            const u = ax - 0.058, v = y - 1.985, c = Math.cos(0.45), s = Math.sin(0.45);
            const ur = u * c + v * s, vr = -u * s + v * c;
            if (Math.abs(ur) < 0.05 && Math.abs(vr) < 0.021) return EYE;
            if (Math.abs(ur) < 0.06 && Math.abs(vr) < 0.03) return [0.02, 0.03, 0.1]; // lens rim
            return y > 1.93 ? [0.08, 0.15, 0.55] : [0.1, 0.2, 0.66];
        }
        if (y < 1.88 && z > 0.02) return [0.09, 0.17, 0.6];
        return DARK;
    }
    if (y > 1.66) return DARK; // neck
    // hands / gloves
    if (y < 1.04 && ax > 0.33) return GLOVE;
    // forearm bracer
    if (ax > 0.33 && y < 1.2 && y >= 1.04) return GOLD;
    // boots
    if (y < 0.3 && ax < 0.3) return y > 0.26 ? GOLD : (z > 0.1 && y < 0.1 ? DARK : BOOT);
    // knee guard
    if (ax < 0.3 && y > 0.5 && y < 0.64 && z > 0.03) return GOLD;
    // shoulder guards
    if (y > 1.54 && ax > 0.22 && ax < 0.42 && n[1] > 0.1) return GOLD;
    // belt
    if (y > 1.0 && y < 1.07 && ax < 0.3) return GOLD;
    // chest emblem
    if (z > 0.1 && Math.hypot(x, y - 1.46) < 0.036) return PIPE;
    // chest V
    if (z > 0.08 && y > 1.38 && y < 1.62 && Math.abs(ax - (1.62 - y) * 0.9) < 0.018) return PIPE;
    // side piping: torso sides, arms outer, legs outer
    if (y > 1.08 && y < 1.55 && ax > 0.2 && ax < 0.27 && Math.abs(z) < 0.1) return PIPE;
    if (ax > 0.3 && y > 1.0 && Math.abs(z) < 0.014 && n[0] * Math.sign(x) > 0.5) return PIPE; // clean thin stripe down the outer arm
    if (ax < 0.3 && y < 1.0 && y > 0.3 && Math.abs(z) < 0.014 && n[0] * Math.sign(x) > 0.5) return PIPE;
    // darker lower body suit
    const web = (b) => { const a = Math.atan2(x, z) * 0.16 * 6.2832 / 6.2832; const l1 = Math.abs(((y * 9) % 1 + 1) % 1 - 0.5), l2 = Math.abs(((Math.atan2(x, z) * 9 / 3.1416) % 1 + 1) % 1 - 0.5); const e = Math.min(l1, l2); return e < 0.07 ? [b[0] * 0.62, b[1] * 0.66, b[2] * 0.8] : b; };
    if (y < 1.0) return [0.08, 0.17, 0.58]; // fine weave is done in the fragment shader
    return SUIT;
};
const pos = [], nor = [], col = [];
verts.forEach((v, i) => { pos.push(+v[0].toFixed(4), +v[1].toFixed(4), +v[2].toFixed(4)); nor.push(+nrm[i][0].toFixed(3), +nrm[i][1].toFixed(3), +nrm[i][2].toFixed(3)); col.push(...colorOf(v, nrm[i])); });
// color smoothing: average over mesh neighbours so region borders are soft instead of jagged
{
    const nv = verts.length, nb = Array.from({ length: nv }, () => new Set());
    for (let i = 0; i < tris.length; i += 3) { const a = tris[i], b = tris[i + 1], c = tris[i + 2]; nb[a].add(b); nb[a].add(c); nb[b].add(a); nb[b].add(c); nb[c].add(a); nb[c].add(b); }
    let cur = []; for (let i = 0; i < nv; i++) cur.push([col[i * 3], col[i * 3 + 1], col[i * 3 + 2]]);
    for (let it = 0; it < 1; it++) {
        const nx = cur.map((c, i) => { const ns = [...nb[i]]; if (!ns.length) return c; const m = [0, 0, 0]; for (const j of ns) for (let k = 0; k < 3; k++) m[k] += cur[j][k]; return c.map((v, k) => v * 0.55 + (m[k] / ns.length) * 0.45); });
        cur = nx;
    }
    col.length = 0; cur.forEach((c) => col.push(...c));
}
fs.writeFileSync(out, JSON.stringify({ pos, nor, col: col.map((c) => +c.toFixed(3)), si: skinI, sw: skinW.map((w) => +w.toFixed(3)), idx: tris, bones: B.map((b) => ({ n: b[0], p: b[1], h: b[2] })) }));
console.log('verts', verts.length, 'tris', tris.length / 3, 'flipped', flipped, 'bones', B.length, 'bytes', fs.statSync(out).size);
