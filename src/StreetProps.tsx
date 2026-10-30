import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { buildings, parkH } from './sim';

/* Oct 30, 12:05 AM sweep: city streets were bare asphalt. Cheap street furniture on the pavement strip just outside every
   city building: lamp posts (warm heads that glow at night), benches, bins, hydrants and bollards. Six instanced meshes for the
   whole city, Lambert, no textures. Walk-through (no collision) so movement is unchanged. */
type P = { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number };
const DBG = !!(import.meta as any).env.VITE_DBG;
function h01(a: number, b: number) { const s = Math.sin(a * 91.7 + b * 247.3) * 43758.5453; return s - Math.floor(s); }
function inside(x: number, z: number, pad: number) {
    for (const b of buildings as any[]) if (x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad && (b.y0 ?? 0) < 3) return true;
    return false;
}
function Inst({ list, geo, mat }: { list: P[]; geo: THREE.BufferGeometry; mat: THREE.Material }) {
    const ref = useRef<THREE.InstancedMesh>(null!);
    useEffect(() => {
        if (!ref.current) return;
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
        list.forEach((it, i) => { e.set(0, it.ry, 0); q.setFromEuler(e); m.compose(p.set(it.x, it.y, it.z), q, s.set(it.sx, it.sy, it.sz)); ref.current.setMatrixAt(i, m); });
        ref.current.instanceMatrix.needsUpdate = true; ref.current.computeBoundingSphere();
    }, [list]);
    if (!list.length) return null;
    return <instancedMesh ref={ref} args={[geo, mat, list.length]} castShadow={false} receiveShadow={false} />;
}
export const STREET_GLOW = { value: 0 };
export function StreetProps() {
    const d = useMemo(() => {
        const pole: P[] = [], head: P[] = [], bench: P[] = [], bin: P[] = [], hyd: P[] = [], boll: P[] = [];
        const add = (l: P[], x: number, y: number, z: number, sx: number, sy: number, sz: number, ry: number) => l.push({ x, y, z, sx, sy, sz, ry });
        (buildings as any[]).forEach((b, bi) => {
            if (b.host !== undefined || b.sea || (b.y0 ?? 0) > 1 || b.h < 6) return;
            const w = b.x1 - b.x0, dd = b.z1 - b.z0; if (w < 8 || dd < 8 || w > 160 || dd > 160) return;
            const edges: [number, number, number, number, number, number][] = [   // x0,z0,x1,z1, outward nx,nz
                [b.x0, b.z0, b.x1, b.z0, 0, -1], [b.x0, b.z1, b.x1, b.z1, 0, 1], [b.x0, b.z0, b.x0, b.z1, -1, 0], [b.x1, b.z0, b.x1, b.z1, 1, 0]];
            edges.forEach(([x0, z0, x1, z1, nx, nz], ei) => {
                const L = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(L / 4.5), ry = Math.atan2(nx, nz);
                for (let k = 1; k < n; k++) {
                    const t = k / n, r = h01(bi * 7.3 + ei, k * 1.91), off = r < 0.3 ? 4.8 : 3.0;   /* the drawn facades sit ~1.5 m outside the collision boxes */   // lamps at the kerb, the rest by the wall
                    const x = x0 + (x1 - x0) * t + nx * off, z = z0 + (z1 - z0) * t + nz * off;
                    if (inside(x, z, 0.6)) continue;
                    const y = parkH(x, z);
                    if (!Number.isFinite(y) || y > 2.5) continue;
                    if (r < 0.3) { { add(pole, x, y + 2.6, z, 1, 1, 1, ry); add(head, x - nx * 0.7, y + 5.15, z - nz * 0.7, 1, 1, 1, ry); } }
                    else if (r < 0.48) add(bench, x, y + 0.25, z, 1, 1, 1, ry);
                    else if (r < 0.62) add(bin, x, y + 0.5, z, 1, 1, 1, 0);
                    else if (r < 0.7) add(hyd, x, y + 0.4, z, 1, 1, 1, 0);
                    else { for (const s of [-1.2, 0, 1.2]) add(boll, x + nz * s, y + 0.45, z - nx * s, 1, 1, 1, 0); }
                }
            });
        });
        if (DBG) (window as any).__streetProps = { near: [...pole, ...bench, ...bin].filter((p) => p.x > 5 && p.x < 40 && p.z > 10 && p.z < 70).slice(0, 10).map((p) => [p.x.toFixed(1), p.y.toFixed(1), p.z.toFixed(1)]), nb: (buildings as any[]).length, pole: pole.length, bench: bench.length, bin: bin.length, hyd: hyd.length, boll: boll.length };
        return { pole, head, bench, bin, hyd, boll };
    }, []);
    const g = useMemo(() => {
        const bench = new THREE.BoxGeometry(1.8, 0.12, 0.5); bench.translate(0, 0.2, 0);
        const back = new THREE.BoxGeometry(1.8, 0.5, 0.08); back.translate(0, 0.5, -0.22);
        const legs = new THREE.BoxGeometry(0.1, 0.45, 0.45); const l1 = legs.clone().translate(-0.75, -0.02, 0), l2 = legs.clone().translate(0.75, -0.02, 0);
        const merge = (gs: THREE.BufferGeometry[]) => { const ps: number[] = [], ns: number[] = []; for (const q of gs) { const a = q.toNonIndexed(); ps.push(...(a.getAttribute('position').array as any)); ns.push(...(a.getAttribute('normal').array as any)); } const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(ps, 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(ns, 3)); return o; };
        const hydB = new THREE.CylinderGeometry(0.16, 0.2, 0.7, 8), hydT = new THREE.SphereGeometry(0.17, 8, 6); hydT.translate(0, 0.36, 0); const hydS = new THREE.CylinderGeometry(0.07, 0.07, 0.5, 6); hydS.rotateZ(Math.PI / 2); hydS.translate(0, 0.12, 0);
        return {
            pole: new THREE.CylinderGeometry(0.07, 0.1, 5.2, 6), head: new THREE.BoxGeometry(0.35, 0.16, 1.6),
            bench: merge([bench, back, l1, l2]), bin: new THREE.CylinderGeometry(0.3, 0.26, 1.0, 10), hyd: merge([hydB, hydT, hydS]), boll: new THREE.CylinderGeometry(0.1, 0.12, 0.9, 6),
        };
    }, []);
    const m = useMemo(() => ({
        pole: new THREE.MeshLambertMaterial({ color: '#3a3f47' }), head: new THREE.MeshBasicMaterial({ color: '#ffe2a8' }),
        bench: new THREE.MeshLambertMaterial({ color: '#8a5a3a' }), bin: new THREE.MeshLambertMaterial({ color: '#2f5a44' }),
        hyd: new THREE.MeshLambertMaterial({ color: '#c8332b' }), boll: new THREE.MeshLambertMaterial({ color: '#d8d4cc' }),
    }), []);
    return <group name="street-props">
        <Inst list={d.pole} geo={g.pole} mat={m.pole} /><Inst list={d.head} geo={g.head} mat={m.head} />
        <Inst list={d.bench} geo={g.bench} mat={m.bench} /><Inst list={d.bin} geo={g.bin} mat={m.bin} />
        <Inst list={d.hyd} geo={g.hyd} mat={m.hyd} /><Inst list={d.boll} geo={g.boll} mat={m.boll} />
    </group>;
}
