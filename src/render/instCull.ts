import * as THREE from 'three';
/* Perf item 9 (Shifat Nov 2 2:48 AM 'plan a long list of opportunities for optimization'): crowd / drone / bot instances that are outside the camera
   view are packed out of the draw (their vertex shaders - walk / rotor animation, ink hull - used to run for every instance around the hero, ~60 %
   of them behind or beside the camera). Exact test: each instance's bounding sphere (scaled, padded for the vertex animation) against the camera
   frustum of THIS frame, so nothing on screen is ever dropped. DBG: window.__noInstCull = 1 turns it off (A/B harness). */
const _fr = new THREE.Frustum(), _pv = new THREE.Matrix4(), _s = new THREE.Sphere();
const DBG = !!(import.meta as any).env.VITE_DBG;
/** The camera frustum as drawn this frame (call after the camera has been placed). */
export function viewFrustum(camera: THREE.Camera) {
    camera.updateMatrixWorld(); _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); return _fr.setFromProjectionMatrix(_pv);
}
export type InstanceSnapshot = { count: number; matrices: Float32Array; colors: Float32Array | null; visible: Int32Array; visibleCount: number };
/** Save the unculled instance data so a later camera turn can restore anything that becomes visible. */
export function captureInstanceSnapshot(mesh: THREE.InstancedMesh, count = mesh.count): InstanceSnapshot {
    const n = Math.max(0, Math.min(count, mesh.instanceMatrix.count));
    const matrices = new Float32Array(n * 16);
    matrices.set((mesh.instanceMatrix.array as Float32Array).subarray(0, n * 16));
    const colors = mesh.instanceColor ? new Float32Array(n * 3) : null;
    if (colors && mesh.instanceColor) colors.set((mesh.instanceColor.array as Float32Array).subarray(0, n * 3));
    return { count: n, matrices, colors, visible: new Int32Array(n), visibleCount: -1 };
}
/** Pack visible instances from the immutable snapshot; never culls the source, so camera turns can reveal them again. */
export function cullInstanceSnapshot(mesh: THREE.InstancedMesh, snapshot: InstanceSnapshot, fr: THREE.Frustum, pad = 1) {
    if (!snapshot.count) { mesh.count = 0; snapshot.visibleCount = 0; return 0; }
    const g = mesh.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); const bs = g.boundingSphere!, c = bs.center;
    const dst = mesh.instanceMatrix.array as Float32Array, dstColor = mesh.instanceColor?.array as Float32Array | undefined;
    let w = 0, changed = snapshot.visibleCount < 0 || mesh.count !== snapshot.visibleCount;
    for (let i = 0; i < snapshot.count; i++) {
        const o = i * 16, a = snapshot.matrices;
        const sc = Math.sqrt(Math.max(a[o] * a[o] + a[o + 1] * a[o + 1] + a[o + 2] * a[o + 2], a[o + 4] * a[o + 4] + a[o + 5] * a[o + 5] + a[o + 6] * a[o + 6], a[o + 8] * a[o + 8] + a[o + 9] * a[o + 9] + a[o + 10] * a[o + 10]));
        _s.center.set(a[o] * c.x + a[o + 4] * c.y + a[o + 8] * c.z + a[o + 12], a[o + 1] * c.x + a[o + 5] * c.y + a[o + 9] * c.z + a[o + 13], a[o + 2] * c.x + a[o + 6] * c.y + a[o + 10] * c.z + a[o + 14]);
        _s.radius = bs.radius * sc + pad;
        if (!fr.intersectsSphere(_s)) continue;
        if (snapshot.visible[w] !== i) changed = true;
        snapshot.visible[w] = i;
        dst.set(a.subarray(o, o + 16), w * 16);
        if (dstColor && snapshot.colors) dstColor.set(snapshot.colors.subarray(i * 3, i * 3 + 3), w * 3);
        w++;
    }
    if (snapshot.visibleCount !== w) changed = true;
    if (changed) {
        mesh.count = w; mesh.instanceMatrix.needsUpdate = true;
        if (dstColor && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    snapshot.visibleCount = w;
    return w;
}
/** Packs the instances of m whose bounding sphere meets the frustum to the front (matrix + colour) and cuts m.count to them. */
export function cullInstances(m: THREE.InstancedMesh, fr: THREE.Frustum, grow = 1.3, pad = 1) {
    if (DBG && (window as any).__noInstCull) return;
    const g = m.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); const bs = g.boundingSphere!, c = bs.center;
    const a = m.instanceMatrix.array as Float32Array, col = m.instanceColor ? (m.instanceColor.array as Float32Array) : null, n = m.count; let w = 0;
    const sa = g.getAttribute('aStill') as THREE.InstancedBufferAttribute | undefined, still = sa && (sa as any).isInstancedBufferAttribute ? (sa.array as Float32Array) : null;   // per-instance KO limpness (enemies) travels with its instance
    for (let i = 0; i < n; i++) {
        const o = i * 16, sc = Math.sqrt(Math.max(a[o] * a[o] + a[o + 1] * a[o + 1] + a[o + 2] * a[o + 2], a[o + 4] * a[o + 4] + a[o + 5] * a[o + 5] + a[o + 6] * a[o + 6], a[o + 8] * a[o + 8] + a[o + 9] * a[o + 9] + a[o + 10] * a[o + 10]));
        _s.center.set(a[o] * c.x + a[o + 4] * c.y + a[o + 8] * c.z + a[o + 12], a[o + 1] * c.x + a[o + 5] * c.y + a[o + 9] * c.z + a[o + 13], a[o + 2] * c.x + a[o + 6] * c.y + a[o + 10] * c.z + a[o + 14]);
        _s.radius = bs.radius * sc * grow + pad;
        if (!fr.intersectsSphere(_s)) continue;
        if (w !== i) { a.copyWithin(w * 16, o, o + 16); if (col) col.copyWithin(w * 3, i * 3, i * 3 + 3); if (still) still[w] = still[i]; }
        w++;
    }
    m.count = w;
}
