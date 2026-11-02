import { addTrunkSolids } from '../sim';
// Farm Isle (Shifat Oct 31 5:48 PM: 'cozy farm village: white farmhouses with red gable roofs, red barn, windmill, big oaks + pines, muddy rutted
// roads with puddles, tall grass; only drones and flying cars, no animals or pedestrians'; 6:25 PM: 'Village should be a separate island on sea,
// from another side of city'). Ground = seaWorld farmRaw (the sim walks the same function). Budget (Adreno 506): ~9 draw calls, all static
// merged / instanced geometry; the only per-frame work is one rotation for the windmill sails.
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { seabedAt } from '../sim';
import { FARM, farmRaw, farmRR, FARM_HOUSES, FARM_BARN, FARM_SILO, FARM_MILL, farmGroundAt } from '../seaWorld';
import { QK } from '../quality';
import { coniferGeo } from './trees';
import { PINE_URL } from '../texdata';
import { type SouthSeaKit, PHONE, hazeShader, colorize, merged, rnd, setSeed } from './southSea/common';
import { GRASS_U } from './southSea/islandGeo';
import { tuftGeo } from './forest';

// layout in island-local metres (+z = toward the city)
const L = (x: number, z: number) => [FARM.cx + x, FARM.cz + z] as [number, number];
const ROADS: [number, number][][] = [
    [[2, 92], [-3, 66], [-6, 40], [-10, 12], [-22, -12], [-36, -30], [-48, -42]],   // jetty -> village green -> barn yard
    [[-10, 12], [6, 15], [20, 18], [32, 22]],                                       // up to the windmill knoll
    [[-10, 12], [-28, 10], [-48, 6], [-66, 0]],                                     // west lane
    [[-22, -12], [-6, -26], [10, -44], [18, -62]],                                  // south track to the fields
];
const HOUSES = FARM_HOUSES, BARN = FARM_BARN, SILO = FARM_SILO, MILL = FARM_MILL;   // layout lives in seaWorld (shared with the collision boxes)

function segDist(px: number, pz: number, a: [number, number], b: [number, number]) {
    const vx = b[0] - a[0], vz = b[1] - a[1], t = Math.max(0, Math.min(1, ((px - a[0]) * vx + (pz - a[1]) * vz) / (vx * vx + vz * vz)));
    return Math.hypot(px - a[0] - vx * t, pz - a[1] - vz * t);
}
export function farmRoadD(x: number, z: number) {   // world xz -> metres to the nearest road centreline
    const lx = x - FARM.cx, lz = z - FARM.cz; let d = 1e9;
    for (const r of ROADS) for (let i = 0; i < r.length - 1; i++) d = Math.min(d, segDist(lx, lz, r[i], r[i + 1]));
    return d;
}
const nearBuilding = (lx: number, lz: number, pad: number) => HOUSES.some((h) => Math.hypot(lx - h[0], lz - h[1]) < 7 * h[3] + pad) || Math.hypot(lx - BARN.x, lz - BARN.z) < 12 + pad || Math.hypot(lx - SILO.x, lz - SILO.z) < 4 + pad || Math.hypot(lx - MILL.x, lz - MILL.z) < 5 + pad;

function terrainGeo(nLod?: number) {
    const n = nLod ?? (PHONE ? 170 : 230), half = FARM.R * 1.72, pos: number[] = [], col: number[] = [], idx: number[] = [], ok: boolean[] = [];
    const c = new THREE.Color(), grass = new THREE.Color('#7fae4e'), grass2 = new THREE.Color('#9cc25a'), sand = new THREE.Color('#e6d6a8'), wet = new THREE.Color('#b8a47a');
    const mud = new THREE.Color('#6b5236'), rut = new THREE.Color('#4a3824'), wheat = new THREE.Color('#d9bc62'), plow = new THREE.Color('#8a6a44'), crop = new THREE.Color('#5f9a3c');
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
        const x = FARM.cx - half + (i / n) * 2 * half, z = FARM.cz - half + (j / n) * 2 * half, h = farmRaw(x, z), y = Math.max(h ?? -99, seabedAt(x, z) - 0.5);   /* Nov 1: the ground now runs down onto the sea floor instead of stopping in a stair-stepped cliff at -16 m (seen from under water) */
        const rr = farmRR(x, z), lx = x - FARM.cx, lz = z - FARM.cz, rd = farmRoadD(x, z);
        const nz = Math.sin(x * 0.19 + z * 0.07) * Math.sin(x * 0.05 - z * 0.23);
        c.copy(grass).lerp(grass2, 0.5 + 0.5 * nz);
        // fields: big rotated patches of wheat / plough / crop rows away from the village green
        const fu = lx * 0.8 + lz * 0.6, fv = -lx * 0.6 + lz * 0.8, cell = Math.floor(fu / 26) * 7 + Math.floor(fv / 22) * 13, kind = ((cell % 4) + 4) % 4;
        const inField = Math.hypot(lx + 12, lz - 8) > 34 && rr < 0.78, rows = 0.5 + 0.5 * Math.sin(fv * 2.4);
        if (inField && kind === 1) c.copy(wheat).lerp(grass2, 0.15 + 0.2 * rows);
        else if (inField && kind === 2) c.copy(plow).lerp(rut, 0.35 * rows);
        else if (inField && kind === 3) c.copy(crop).lerp(plow, 0.45 * (1 - rows));
        // muddy rutted road: wheel ruts 1.1 m either side of the centre line, grass verge fading in
        if (rd < 4.2) { const r2 = Math.abs(rd - 1.2); c.lerp(mud, 1 - THREE.MathUtils.smoothstep(rd, 3.0, 4.2)); if (r2 < 0.55) c.lerp(rut, 0.85 * (1 - r2 / 0.55)); c.lerp(rut, 0.25 * (0.5 + 0.5 * Math.sin(x * 1.7 + z * 0.9))); }
        if (rr > 0.8) c.lerp(sand, THREE.MathUtils.smoothstep(rr, 0.8, 0.88));
        if (y < -0.7) c.lerp(wet, 0.6);
        pos.push(x, y - (rd < 2.6 ? 0.06 : 0), z); col.push(c.r, c.g, c.b); ok.push(h !== null);
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const a = j * (n + 1) + i, b = a + 1, d = a + n + 1, e = d + 1;
        if (ok[a] || ok[b] || ok[d] || ok[e]) idx.push(a, d, b, b, d, e);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

function gable(w: number, rh: number, len: number) {   // triangular prism along z, base at y = 0
    const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, rh); s.lineTo(-w / 2, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false }); g.translate(0, 0, -len / 2); return g;
}
function place(g: THREE.BufferGeometry, color: string, x: number, y: number, z: number, yaw = 0, sx = 1, sy = 1, sz = 1) {
    const q = (g.index ? g.toNonIndexed() : g.clone()); q.scale(sx, sy, sz); q.rotateY(yaw); q.translate(x, y, z); colorize(q, color); return q;
}
const groundAt = farmGroundAt;

function buildingsGeo() {
    const P: THREE.BufferGeometry[] = [], Wn: THREE.BufferGeometry[] = [], box = new THREE.BoxGeometry(1, 1, 1);
    const off = (lx: number, lz: number, yaw: number, ax: number, az: number): [number, number] => [lx + ax * Math.cos(yaw) + az * Math.sin(yaw), lz - ax * Math.sin(yaw) + az * Math.cos(yaw)];
    for (const [lx, lz, yaw, s] of HOUSES) {
        const W = 6.6 * s, D = 9.0 * s, H = 7.6 * s, y0 = groundAt(lx, lz, 5 * s) - 0.8, [x, z] = L(lx, lz), wall = rnd() < 0.5 ? '#f4f1ea' : '#ece7dc';
        P.push(place(box, '#8c8478', x, y0 + 0.5, z, yaw, W + 0.3, 1, D + 0.3));                               // stone footing
        P.push(place(box, wall, x, y0 + 0.8 + H / 2, z, yaw, W, H, D));                                        // white walls
        P.push(place(gable(W + 0.9, 2.9 * s, D + 0.9), '#b8302a', x, y0 + 0.8 + H, z, yaw));                   // red gable roof
        P.push(place(gable(W - 0.2, 2.5 * s, D + 0.05), wall, x, y0 + 0.8 + H - 0.01, z, yaw));                // gable ends
        { const [cx, cz] = off(lx, lz, yaw, W * 0.22, D * 0.28); const [wx, wz] = L(cx, cz); P.push(place(box, '#9a5a44', wx, y0 + 0.8 + H + 2.4 * s, wz, yaw, 0.7, 2.2, 0.7)); }   // chimney
        { const [bx, bz] = L(lx, lz); P.push(place(box, '#d8d2c6', bx, y0 + 0.8 + H * 0.5, bz, yaw, W + 0.12, 0.22, D + 0.12)); }   // floor band between the two storeys
        for (const fl of [0.27, 0.73]) for (const sd of [-1, 1]) for (const k of [-1, 0, 1]) {   // two rows of windows (two storeys) on both long sides
            const [ox, oz] = off(lx, lz, yaw, sd * (W / 2 + 0.03), k * D * 0.3); const [wx, wz] = L(ox, oz), wy = y0 + 0.8 + H * fl;
            P.push(place(box, '#ffffff', wx, wy, wz, yaw, 0.08, 1.35, 1.15)); Wn.push(place(box, '#ffffff', wx + Math.cos(yaw) * sd * 0.02, wy, wz - Math.sin(yaw) * sd * 0.02, yaw, 0.08, 1.1, 0.9));
            P.push(place(box, '#3f5a3a', wx + Math.cos(yaw) * sd * 0.03, wy, wz - Math.sin(yaw) * sd * 0.03 + 0, yaw, 0.06, 1.25, 0.25));   // green shutter
        }
        { const [ox, oz] = off(lx, lz, yaw, 0, D / 2 + 0.03); const [wx, wz] = L(ox, oz); P.push(place(box, '#6a4630', wx, y0 + 0.8 + 1.1, wz, yaw, 1.2, 2.2, 0.08)); Wn.push(place(box, '#ffffff', wx + 1.7 * Math.cos(yaw), y0 + 0.8 + H * 0.27, wz - 1.7 * Math.sin(yaw), yaw, 1.0, 1.0, 0.08)); for (const q of [-1.7, 0, 1.7]) Wn.push(place(box, '#ffffff', wx + q * Math.cos(yaw), y0 + 0.8 + H * 0.73, wz - q * Math.sin(yaw), yaw, 1.0, 1.1, 0.08)); P.push(place(box, '#ffffff', wx, y0 + 0.8 + 2.35, wz, yaw, 1.8, 0.12, 0.5)); }
    }
    { // red barn (gambrel-ish: two stacked gables) + white trim + a hay door
        const { x: lx, z: lz, yaw } = BARN, [x, z] = L(lx, lz), y0 = groundAt(lx, lz, 9) - 0.6, W = 12, D = 17, H = 6;
        P.push(place(box, '#a3261f', x, y0 + H / 2, z, yaw, W, H, D));
        P.push(place(gable(W + 1, 3.2, D + 1), '#5a1f1a', x, y0 + H, z, yaw)); P.push(place(gable(W * 0.6, 2.6, D + 1), '#5a1f1a', x, y0 + H + 2.4, z, yaw));
        P.push(place(gable(W - 0.2, 3.0, D + 0.04), '#a3261f', x, y0 + H - 0.01, z, yaw));
        const fx = x + Math.sin(yaw) * (D / 2 + 0.05), fz = z + Math.cos(yaw) * (D / 2 + 0.05);
        P.push(place(box, '#f2eee4', fx, y0 + 2.3, fz, yaw, 4.6, 4.6, 0.1)); P.push(place(box, '#7a1c16', fx + Math.sin(yaw) * 0.04, y0 + 2.3, fz + Math.cos(yaw) * 0.04, yaw, 4.0, 4.0, 0.1));
        for (const d of [-1, 1]) { const q = place(box, '#f2eee4', 0, 0, 0, 0, 0.3, 5.4, 0.1); q.rotateZ(d * 0.78); q.rotateY(yaw); q.translate(fx + Math.sin(yaw) * 0.09, y0 + 2.3, fz + Math.cos(yaw) * 0.09); P.push(q); }
        P.push(place(box, '#f2eee4', fx + Math.sin(yaw) * 0.04, y0 + H + 1.2, fz + Math.cos(yaw) * 0.04, yaw, 2.2, 1.8, 0.1));
        const [sx, sz] = L(SILO.x, SILO.z), sy = groundAt(SILO.x, SILO.z, 3) - 0.5;
        P.push(place(new THREE.CylinderGeometry(2.6, 2.6, 13, 14, 1, true), '#c9ccd0', sx, sy + 6.5, sz)); P.push(place(new THREE.SphereGeometry(2.7, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#9aa0a6', sx, sy + 13, sz));
        for (let k = 0; k < 5; k++) P.push(place(new THREE.CylinderGeometry(2.64, 2.64, 0.12, 14, 1, true), '#8a9096', sx, sy + 1.5 + k * 2.5, sz));
    }
    { // windmill tower: tapered white body, dark cap, a balcony ring
        const [x, z] = L(MILL.x, MILL.z), y0 = groundAt(MILL.x, MILL.z, 3.5) - 0.5;
        P.push(place(new THREE.CylinderGeometry(2.1, 3.4, 13, 12), '#f3efe6', x, y0 + 6.5, z));
        P.push(place(new THREE.ConeGeometry(2.6, 3.4, 12), '#3b3a3e', x, y0 + 13 + 1.7, z));
        P.push(place(new THREE.CylinderGeometry(3.0, 3.0, 0.25, 16), '#5a4434', x, y0 + 8.5, z));
        P.push(place(box, '#5a4434', x + Math.sin(0.9) * 3.2, y0 + 1.1, z + Math.cos(0.9) * 3.2, 0.9, 1.2, 2.2, 0.1));
    }
    { // split-rail fences along the lane by the green
        for (const r of [ROADS[0], ROADS[2]]) for (let i = 0; i < r.length - 1; i++) {
            const a = r[i], b = r[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]), yaw = Math.atan2(b[0] - a[0], b[1] - a[1]), nx = Math.cos(yaw), nz = -Math.sin(yaw);
            for (let t = 2; t < len - 2; t += 3) {
                const lx = a[0] + (b[0] - a[0]) * t / len + nx * 3.8, lz = a[1] + (b[1] - a[1]) * t / len + nz * 3.8; if (nearBuilding(lx, lz, 1.5) || farmRR(FARM.cx + lx, FARM.cz + lz) > 0.8) continue;
                const [x, z] = L(lx, lz), y = farmRaw(x, z) ?? 0;
                P.push(place(box, '#8a6a4a', x, y + 0.55, z, yaw, 0.14, 1.1, 0.14)); P.push(place(box, '#9a7a56', x, y + 0.8, z + 0, yaw, 0.08, 0.1, 3.0)); P.push(place(box, '#9a7a56', x, y + 0.45, z, yaw, 0.08, 0.1, 3.0));
            }
        }
    }
    { // timber jetty on the city-facing shore
        const [x0, z0] = L(2, 86); for (let k = 0; k < 9; k++) { P.push(place(box, '#8a6e50', x0, -0.35, z0 + k * 2.2, 0, 3.2, 0.25, 2.0)); P.push(place(box, '#5a4636', x0 - 1.4, -1.5, z0 + k * 2.2, 0, 0.25, 2.4, 0.25)); P.push(place(box, '#5a4636', x0 + 1.4, -1.5, z0 + k * 2.2, 0, 0.25, 2.4, 0.25)); }
    }
    { // round hay bales in the wheat fields (Shifat 5:48 PM 'cozy farm')
        let n = 0; for (let t = 0; n < 14 && t < 600; t++) { const lx = (rnd() - 0.5) * 140, lz = (rnd() - 0.5) * 140, x = FARM.cx + lx, z = FARM.cz + lz, y = farmRaw(x, z); if (y === null || y < 0.8 || farmRR(x, z) > 0.74 || farmRoadD(x, z) < 6 || nearBuilding(lx, lz, 4)) continue; n++;
            const g = new THREE.CylinderGeometry(0.85, 0.85, 1.3, 12); g.rotateZ(Math.PI / 2); P.push(place(g, n % 3 ? '#d8b860' : '#c9a54c', x, y + 0.75, z, rnd() * 6.28)); }
    }
    return { geo: merged(P), win: merged(Wn) };
}
function sailsGeo() {   // 4 lattice sails around a hub, in the local XY plane (spin about z)
    const P: THREE.BufferGeometry[] = [], box = new THREE.BoxGeometry(1, 1, 1);
    for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2, rot = (g: THREE.BufferGeometry) => { g.rotateZ(a); return g; };
        P.push(rot(place(box, '#5a4434', 0, 5.2, 0, 0, 0.28, 10.4, 0.22)));
        P.push(rot(place(box, '#f0ebe0', 0.85, 6.3, 0.05, 0, 1.5, 7.6, 0.06)));
        for (let s = 0; s < 6; s++) P.push(rot(place(box, '#6a5442', 0.85, 2.9 + s * 1.36, 0.1, 0, 1.6, 0.08, 0.05)));
    }
    P.push(place(new THREE.CylinderGeometry(0.5, 0.5, 1.0, 10), '#3b3a3e', 0, 0, -0.3).rotateX(Math.PI / 2));
    return merged(P);
}
function puddleGeo() {
    const P: THREE.BufferGeometry[] = []; setSeed(808);
    for (const r of ROADS) for (let i = 0; i < r.length - 1; i++) {
        const a = r[i], b = r[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let t = 3; t < len; t += 6 + rnd() * 9) {
            const side = (rnd() - 0.5) * 2.2, yaw = Math.atan2(b[0] - a[0], b[1] - a[1]), lx = a[0] + (b[0] - a[0]) * t / len + Math.cos(yaw) * side, lz = a[1] + (b[1] - a[1]) * t / len - Math.sin(yaw) * side;
            const [x, z] = L(lx, lz), y = farmRaw(x, z); if (y === null || y < 0) continue;
            const g = new THREE.CircleGeometry(1, 12); const p = g.attributes.position as THREE.BufferAttribute;
            for (let k = 1; k < p.count; k++) { const s = 0.75 + 0.35 * Math.sin(k * 2.3 + t); p.setXY(k, p.getX(k) * s, p.getY(k) * s); }
            g.rotateX(-Math.PI / 2); g.scale(1.0 + rnd() * 1.4, 1, 0.6 + rnd() * 0.6); g.rotateY(yaw); g.translate(x, y - 0.0, z); P.push(g);
        }
    }
    return merged(P);
}

export function FarmIsle({ kit }: { kit: SouthSeaKit }) {
    const terrain = useMemo(() => terrainGeo(), []), terrainFar = useMemo(() => terrainGeo(56), []), bw = useMemo(() => { setSeed(4711); return buildingsGeo(); }, []), blds = bw.geo, sails = useMemo(sailsGeo, []), puddles = useMemo(puddleGeo, []);
    const tex = useMemo(() => { const l = new THREE.TextureLoader(); const mk = (u: string, rep = false) => { const t = l.load(u); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = QK.anisotropy; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 3); } return t; }; return { leaf: mk('/spray145.png'), bark: mk('/bark.jpg', true), pine: mk(PINE_URL), pbark: mk('/pinebark.jpg', true) }; }, []);
    const mats = useMemo(() => {
        const ck = (m: THREE.Material, k: string) => { (m as any).customProgramCacheKey = () => 'farm-' + k; return m; };
        return {
            ground: ck(Object.assign(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#16180f' }), { onBeforeCompile: hazeShader(kit.tod, undefined, true) }), 'g'),
            bld: ck(Object.assign(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#151311' }), { onBeforeCompile: hazeShader(kit.tod) }), 'b'),
            puddle: ck(Object.assign(new THREE.MeshPhongMaterial({ color: '#41505c', specular: '#c8d4e0', shininess: 120, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), { onBeforeCompile: hazeShader(kit.tod) }), 'p'),
            trunk: ck(Object.assign(new THREE.MeshLambertMaterial({ map: tex.bark, bumpMap: tex.bark, bumpScale: 2.2, vertexColors: true, emissive: '#4a3a2c', side: THREE.DoubleSide }), { onBeforeCompile: hazeShader(kit.tod, kit.trunkWindShader) }), 't'),
            leaf: ck(Object.assign(new THREE.MeshLambertMaterial({ map: tex.leaf, vertexColors: true, color: '#86c45e', emissive: '#284f20', alphaTest: 0.5, side: THREE.DoubleSide }), { onBeforeCompile: hazeShader(kit.tod, kit.leafWindShader) }), 'l'),
            pineTrunk: ck(Object.assign(new THREE.MeshLambertMaterial({ map: tex.pbark, bumpMap: tex.pbark, bumpScale: 2.2, vertexColors: true, emissive: '#4a3a2c', side: THREE.DoubleSide }), { onBeforeCompile: hazeShader(kit.tod, kit.trunkWindShader) }), 'pt'),
            pineLeaf: ck(Object.assign(new THREE.MeshLambertMaterial({ map: tex.pine, vertexColors: true, emissive: '#1f3a22', alphaTest: 0.5, side: THREE.DoubleSide }), { onBeforeCompile: hazeShader(kit.tod, kit.leafWindShader) }), 'pl'),
            win: new THREE.MeshBasicMaterial({ vertexColors: true, color: '#2c3a48', toneMapped: false }),
            grass: ck(Object.assign(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: '#1c3410' }), { onBeforeCompile: kit.parkGrassOnCompile(GRASS_U) }), 'gr'),
        };
    }, []);
    const geos = useMemo(() => ({ oak: kit.treeGeo('broad', 23, Math.round(420 * QK.foliage), 1.45), pine: PHONE ? coniferGeo('pine', 31, 3, 2, 1.6) : coniferGeo('pine', 31, 5, 3, 1.12), tuft: tuftGeo(PHONE ? 3 : 5) }), []);
    const placements = useMemo(() => {
        setSeed(9090); const oaks: number[][] = [], pines: number[][] = [], tufts: number[][] = [];
        const okSpot = (lx: number, lz: number, rd: number, pad: number) => { const x = FARM.cx + lx, z = FARM.cz + lz, y = farmRaw(x, z); if (y === null || y < 0.6) return null; if (farmRoadD(x, z) < rd || nearBuilding(lx, lz, pad)) return null; return y; };
        // big shade oaks (1.6-2x) by the houses and along the lanes
        for (let t = 0; oaks.length < 16 && t < 4000; t++) { const lx = (rnd() - 0.5) * 150, lz = (rnd() - 0.5) * 150; if (Math.hypot(lx + 14, lz - 4) > 62) continue; const y = okSpot(lx, lz, 6, 6); if (y === null || oaks.some((o) => Math.hypot(o[0] - lx, o[1] - lz) < 16)) continue; oaks.push([lx, y, lz, 1.6 + rnd() * 0.4, rnd() * 6.28]); }
        // pines as windbreaks round the rim
        for (let t = 0; pines.length < 30 && t < 6000; t++) { const a = rnd() * 6.283, r = FARM.R * (0.6 + rnd() * 0.18), lx = Math.cos(a) * r, lz = Math.sin(a) * r; if (lz > 50 && Math.abs(lx) < 20) continue; const y = okSpot(lx, lz, 5, 5); if (y === null || pines.some((o) => Math.hypot(o[0] - lx, o[1] - lz) < 7)) continue; pines.push([lx, y, lz, 0.9 + rnd() * 0.5, rnd() * 6.28]); }
        // tall grass: verges along the roads and field edges
        const NT = PHONE ? 2800 : 7200;   // Shifat 6:39 PM 'reuse more long grasses'
        for (let t = 0; tufts.length < NT && t < NT * 8; t++) { const lx = (rnd() - 0.5) * 170, lz = (rnd() - 0.5) * 170, x = FARM.cx + lx, z = FARM.cz + lz, y = farmRaw(x, z); if (y === null || y < 0.8 || farmRR(x, z) > 0.8) continue; const rd = farmRoadD(x, z); if (rd < 4.0 || nearBuilding(lx, lz, 1) || (rd > 12 && rnd() < 0.45)) continue; tufts.push([lx, y, lz, 1.1 + rnd() * 0.9, rnd() * 6.28]); }
        addTrunkSolids('farm-oaks', oaks.map((o) => ({ x: FARM.cx + o[0], y: o[1], z: FARM.cz + o[2], s: o[3] })), 0.4, 6.5); addTrunkSolids('farm-pines', pines.map((o) => ({ x: FARM.cx + o[0], y: o[1], z: FARM.cz + o[2], s: o[3] })), 0.35, 10);
        return { oaks, pines, tufts };
    }, []);
    const inst = (g: THREE.BufferGeometry, m: THREE.Material, list: number[][], tA: string, tB: string, sy = 1) => {
        const im = new THREE.InstancedMesh(g, m, list.length), o = new THREE.Object3D(), c = new THREE.Color(), cb = new THREE.Color(tB);
        list.forEach((p, i) => { o.position.set(FARM.cx + p[0], p[1] - 0.05, FARM.cz + p[2]); o.rotation.set(0, p[4], 0); o.scale.set(p[3], p[3] * sy, p[3]); o.updateMatrix(); im.setMatrixAt(i, o.matrix); im.setColorAt(i, c.set(tA).lerp(cb, (Math.sin(i * 12.9898) * 43758.5453) % 1 * 0.5 + 0.5)); });
        im.computeBoundingSphere(); return im;
    };
    const objs = useMemo(() => [
        inst(geos.oak.trunk, mats.trunk, placements.oaks, '#ffffff', '#d8cfc4'), inst(geos.oak.leaves, mats.leaf, placements.oaks, '#ffffff', '#c4e49a'),
        inst(geos.pine.trunk, mats.pineTrunk, placements.pines, '#ffffff', '#e0d8d0'), inst(geos.pine.leaves, mats.pineLeaf, placements.pines, '#6f9a84', '#5f8a62'),
        inst(geos.tuft, mats.grass, placements.tufts, '#e8f0c0', '#b8d078', 1.5),
    ], []);
    const sailRef = useRef<THREE.Mesh>(null!);
    const mill = useMemo(() => { const [x, z] = L(MILL.x, MILL.z), y0 = groundAt(MILL.x, MILL.z, 3.5) - 0.5, yaw = 0.9; return { x: x + Math.sin(yaw) * 2.7, y: y0 + 11.6, z: z + Math.cos(yaw) * 2.7, yaw }; }, []);
    const grpRef = useRef<THREE.Group>(null!);
    useFrame((st, dt) => {
        const c = st.camera.position, d = Math.hypot(c.x - FARM.cx, c.z - FARM.cz);
        if (grpRef.current) { grpRef.current.visible = d < 900; const tm = grpRef.current.children[0] as THREE.Mesh; tm.geometry = d > 380 ? terrainFar : terrain; }   // past the haze the island is invisible anyway; Shifat 10:22 PM 25 fps target: past 380 m a 1/3-res terrain (31.7k -> 3.5k tris), haze-small there
        { const near = d < 450, ch = grpRef.current ? grpRef.current.children : []; for (let i = 1; i < ch.length; i++) if (i !== 2) ch[i].visible = near; }   // far LOD (regression Oct 31 8:05 PM: +15 draw calls at the harbor): past 450 m only terrain + buildings, the rest is haze-small
        objs[4].visible = d < FARM.R + 160;                               // long grass only when close enough to read
        { const dy = kit.tod.day.value, w = mats.win.color, k = 1 - THREE.MathUtils.smoothstep(dy, 0.25, 0.75); w.setRGB(0.17 + (1.0 - 0.17) * k, 0.23 + (0.66 - 0.23) * k, 0.28 + (0.32 - 0.28) * k).multiplyScalar(1 + 0.6 * k); }   // windows: dark glass by day, warm lamplight at dusk/night
        if (sailRef.current && d < 500) sailRef.current.rotation.z -= Math.min(dt, 0.1) * 0.55;
    });
    return (
        <group name="farm-isle" ref={grpRef}>
            <mesh geometry={terrain} material={mats.ground} receiveShadow />
            <mesh geometry={puddles} material={mats.puddle} />
            <mesh geometry={blds} material={mats.bld} />
            <mesh geometry={bw.win} material={mats.win} />
            <group position={[mill.x, mill.y, mill.z]} rotation={[0, mill.yaw, 0]}><mesh ref={sailRef} geometry={sails} material={mats.bld} /></group>
            {objs.map((o, i) => <primitive key={i} object={o} />)}
        </group>
    );
}
