// Ice Isle igloos (Shifat Oct 31 10:42 PM: '3 custom igloo models based on real image refs, all angles').
// Built from how real Inuit igloos are made (refs: Inuit snow-block construction guides, timelapse builds, stock photos of block domes):
//  - catenary dome (taller than a hemisphere), blocks cut ~0.9 m long x 0.4 m high, laid in ONE rising spiral (not stacked rings),
//    blocks lean inward and shrink toward the top; a key block caps the crown with a small vent hole
//  - low entrance tunnel (blocks in an arch) dug below floor level, facing away from the wind; snow banked round the base
//  - a clear freshwater-ice slab set in the wall as a window
// Three variants: 0 classic dome + tunnel + ice window, 1 family double dome (main + side room) linked by a short tunnel,
// 2 small hunter's igloo with a big ice window and a curved windbreak wall. All flat-shaded vertex colours; glass = lit glow mesh.
import * as THREE from 'three';

const SNOW = [new THREE.Color('#f4f8fc'), new THREE.Color('#e6eef6'), new THREE.Color('#dbe7f2'), new THREE.Color('#eef3f8')];
const SEAM = new THREE.Color('#8ea7bf'), BANK = new THREE.Color('#e9f0f7');
let _s = 1; const rnd = () => (_s = (_s * 16807) % 2147483647) / 2147483647;

function colorGeo(g: THREE.BufferGeometry, c: THREE.Color) {
    const q = g.index ? g.toNonIndexed() : g; q.deleteAttribute('uv'); const n = q.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } q.setAttribute('color', new THREE.BufferAttribute(a, 3)); return q;
}
/* one snow block: a box bent onto the dome - corners placed on the catenary shell between angles a0..a1 and heights h0..h1 */
function block(prof: (h: number) => number, a0: number, a1: number, h0: number, h1: number, th: number, cx: number, cz: number, col: THREE.Color) {
    const P: number[][] = [];
    for (const h of [h0, h1]) for (const r of [prof(h), Math.max(0.05, prof(h) - th)]) for (const a of [a0, a1]) P.push([cx + Math.sin(a) * r, h, cz + Math.cos(a) * r]);
    // P index: h(0/1)*4 + inner(0/1)*2 + a(0/1)
    const quad = (i: number[], out: number[]) => { const [a, b, c, d] = i.map((k) => P[k]); out.push(...a, ...b, ...c, ...a, ...c, ...d); };
    const pos: number[] = [];
    quad([0, 1, 5, 4], pos); quad([2, 6, 7, 3], pos); quad([4, 5, 7, 6], pos); quad([0, 2, 3, 1], pos); quad([0, 4, 6, 2], pos); quad([1, 3, 7, 5], pos);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return colorGeo(g, col);
}
/* catenary igloo dome of radius R (height ~1.15 R), spiral block courses, inner seam shell, vent, banked base */
function dome(R: number, cx: number, cz: number, out: THREE.BufferGeometry[], skipA?: [number, number]) {
    const H = R * 1.15, prof = (h: number) => R * Math.sqrt(Math.max(0, 1 - Math.pow(h / H, 1.6)));   // catenary-like: steep walls, rounded crown
    const bh = 0.42 * (R / 2.4), th = 0.28 * (R / 2.4);
    let h = 0, a = 0;
    while (h < H * 0.9) {
        const r = prof(h + bh * 0.5); if (r < 0.35) break;
        const bl = Math.min(0.95 * (R / 2.4), r * 1.2), da = bl / r;
        const rise = bh * (da / (Math.PI * 2));   // one rising spiral: a full turn climbs one course
        const a1 = a + da * 0.97;
        const inGap = skipA && h < skipA[1] && ((((a + da * 0.5) - skipA[0]) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
        if (!(skipA && h < skipA[1] && Math.abs(inGap as number) < 0.45)) out.push(block(prof, a, a1, h, h + bh * 0.96, th, cx, cz, SNOW[(rnd() * 4) | 0]));
        a += da; h += rise;
    }
    // crown key block with vent hole (a ring), inner shell = seams
    const kr = prof(h) + 0.05; const key = new THREE.CylinderGeometry(kr * 0.55, kr, H - h + 0.05, 9, 1, true); key.translate(cx, h + (H - h) * 0.5, cz); out.push(colorGeo(key, SNOW[0]));
    const cap = new THREE.RingGeometry(0.12 * R / 2.4, kr * 0.56, 9); cap.rotateX(-Math.PI / 2); cap.translate(cx, H + 0.05, cz); out.push(colorGeo(cap, SNOW[1]));
    const inner = new THREE.SphereGeometry(R - th * 0.6, 16, 7, 0, Math.PI * 2, 0, Math.PI / 2); inner.scale(1, 1.13, 1); inner.translate(cx, 0, cz); out.push(colorGeo(inner, SEAM));
    const bank = new THREE.TorusGeometry(R + 0.12, 0.38 * R / 2.4, 4, 18); bank.rotateX(Math.PI / 2); bank.scale(1, 0.55, 1); bank.translate(cx, 0.05, cz); out.push(colorGeo(bank, BANK));
    return H;
}
/* arched block tunnel along +z from radius r0, length L, half-width w */
function tunnel(cx: number, cz: number, r0: number, L: number, w: number, out: THREE.BufferGeometry[], glass: THREE.BufferGeometry[]) {
    const prof = (h: number) => w * Math.sqrt(Math.max(0, 1 - (h / (w * 1.1)) ** 2));
    const n = Math.max(2, Math.round(L / 0.8));
    for (let i = 0; i < n; i++) {
        const z0 = cz + r0 + (i / n) * L, z1 = cz + r0 + ((i + 1) / n) * L;
        for (let k = 0; k < 5; k++) {
            const t0 = (k / 5) * Math.PI, t1 = ((k + 1) / 5) * Math.PI * 0.98, th = 0.22 * w;
            const pos: number[] = [], pts = (t: number, z: number, rr: number) => [cx + Math.cos(t) * rr, Math.sin(t) * rr * 1.1, z];
            const A = [pts(t0, z0, w), pts(t1, z0, w), pts(t1, z1, w), pts(t0, z1, w)], B = [pts(t0, z0, w - th), pts(t1, z0, w - th), pts(t1, z1, w - th), pts(t0, z1, w - th)];
            const q = (a: number[], b: number[], c: number[], d: number[]) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
            q(A[0], A[1], A[2], A[3]); q(B[3], B[2], B[1], B[0]); q(A[0], A[3], B[3], B[0]); q(A[1], B[1], B[2], A[2]); q(A[0], B[0], B[1], A[1]); q(A[3], A[2], B[2], B[3]);
            const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.push(colorGeo(g, SNOW[(rnd() * 4) | 0]));
        }
        void prof;
    }
    const door = new THREE.CircleGeometry(w * 0.8, 10, 0, Math.PI); door.scale(1, 1.1, 1); door.translate(cx, 0.02, cz + r0 + L - 0.05); glass.push(door);   // warm light at the far end of the tunnel
}
function iceWindow(cx: number, cz: number, R: number, ang: number, y: number, w: number, h: number, glass: THREE.BufferGeometry[]) {
    const H = R * 1.15, r = R * Math.sqrt(Math.max(0, 1 - Math.pow(y / H, 1.6))) + 0.03;
    const p = new THREE.PlaneGeometry(w, h); const tilt = Math.atan2(R, H) * (y / H) * 1.4;
    p.rotateX(-tilt); p.rotateY(ang); p.translate(cx + Math.sin(ang) * r, y, cz + Math.cos(ang) * r); glass.push(p);
}
export function iglooModel(kind: number): { body: THREE.BufferGeometry; glass: THREE.BufferGeometry } {
    _s = 1234 + kind * 77; const out: THREE.BufferGeometry[] = [], glass: THREE.BufferGeometry[] = [];
    if (kind === 0) {          // classic: dome + tunnel + ice window over the door
        const R = 2.4; dome(R, 0, 0, out, [0, 1.0]); tunnel(0, 0, R - 0.35, 1.9, 0.62, out, glass); iceWindow(0, 0, R, 0, 1.55, 0.55, 0.42, glass); iceWindow(0, 0, R, 1.9, 1.0, 0.45, 0.38, glass);
    } else if (kind === 1) {   // family: big dome + side room linked by a short passage, two windows
        const R = 2.9; dome(R, 0, 0, out, [0, 1.0]); tunnel(0, 0, R - 0.35, 2.1, 0.7, out, glass); dome(1.7, -3.9, -0.6, out); 
        const pass = new THREE.CylinderGeometry(0.62, 0.62, 1.6, 8, 1, true, 0, Math.PI); pass.rotateZ(Math.PI / 2); pass.rotateY(-0.15); pass.translate(-2.6, 0, -0.35); out.push(colorGeo(pass, SNOW[2]));
        iceWindow(0, 0, R, 0.0, 1.9, 0.6, 0.45, glass); iceWindow(0, 0, R, 2.3, 1.2, 0.5, 0.4, glass); iceWindow(-3.9, -0.6, 1.7, -1.8, 0.8, 0.4, 0.32, glass);
    } else {                   // hunter's: small dome, big ice window, curved windbreak wall behind
        const R = 1.8; dome(R, 0, 0, out, [0, 0.85]); tunnel(0, 0, R - 0.3, 1.2, 0.5, out, glass); iceWindow(0, 0, R, 0.0, 1.25, 0.7, 0.55, glass);
        for (let i = 0; i < 9; i++) { const a = Math.PI * 0.62 + (i / 8) * Math.PI * 0.76, r = R + 1.6, b = new THREE.BoxGeometry(0.85, 0.42, 0.3); b.translate(0, 0.21, 0); b.rotateY(a); b.translate(Math.sin(a) * r, 0, Math.cos(a) * r); out.push(colorGeo(b, SNOW[(rnd() * 4) | 0]));
            if (i % 2 === 0 && i < 8) { const b2 = new THREE.BoxGeometry(0.85, 0.42, 0.3); b2.translate(0, 0.63, 0); const a2 = a + 0.09; b2.rotateY(a2); b2.translate(Math.sin(a2) * r, 0, Math.cos(a2) * r); out.push(colorGeo(b2, SNOW[(rnd() * 4) | 0])); } }
    }
    const merge = (list: THREE.BufferGeometry[]) => { const pos: number[] = [], col: number[] = []; for (const g of list) { const q = g.index ? g.toNonIndexed() : g; const p = q.attributes.position.array; pos.push(...(p as any)); const c = q.attributes.color; if (c) col.push(...(c.array as any)); else for (let i = 0; i < p.length; i++) col.push(1); } const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); m.computeVertexNormals(); return m; };
    const gl = merge(glass); gl.deleteAttribute('color'); gl.deleteAttribute('normal'); return { body: merge(out), glass: gl };
}
/* footprint half-size (x, z) and height per kind, for collision */
