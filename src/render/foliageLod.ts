import * as THREE from 'three';
import type { InstanceSnapshot } from './instCull';

export const CANOPY_LOD_ENTER_PX = 12;
export const CANOPY_LOD_EXIT_PX = 8;

const _viewCenter = new THREE.Vector3();
const _projectedCenter = new THREE.Vector3();

/** A conservative projected canopy radius in the active render target's pixels. */
export function projectedCanopyRadiusPx(camera: THREE.Camera, center: THREE.Vector3, radius: number, viewportHeight: number) {
    if (!(viewportHeight > 0) || !(radius > 0)) return 0;
    _projectedCenter.copy(center).applyMatrix4(camera.matrixWorldInverse);
    const depth = -_projectedCenter.z;
    const focalPixels = viewportHeight * 0.5 * Math.abs(camera.projectionMatrix.elements[5]);
    if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
        const near = (camera as THREE.PerspectiveCamera).near;
        if (depth <= radius + near) return Infinity;
        return focalPixels * radius / Math.max(near, depth - radius);
    }
    return focalPixels * radius;
}

/** Keep a per-view choice stable in the 8–12 px transition band. 0 = low, 1 = high. */
export function updateCanopyLodState(
    snapshot: InstanceSnapshot,
    camera: THREE.Camera,
    viewportHeight: number,
    localCenter: THREE.Vector3,
    localRadius: number,
    state: Uint8Array,
    enterPx = CANOPY_LOD_ENTER_PX,
    exitPx = CANOPY_LOD_EXIT_PX,
) {
    camera.updateMatrixWorld();
    const src = snapshot.matrices;
    for (let i = 0; i < snapshot.count; i++) {
        const o = i * 16;
        const scale = Math.sqrt(Math.max(
            src[o] * src[o] + src[o + 1] * src[o + 1] + src[o + 2] * src[o + 2],
            src[o + 4] * src[o + 4] + src[o + 5] * src[o + 5] + src[o + 6] * src[o + 6],
            src[o + 8] * src[o + 8] + src[o + 9] * src[o + 9] + src[o + 10] * src[o + 10],
        ));
        _viewCenter.set(
            src[o] * localCenter.x + src[o + 4] * localCenter.y + src[o + 8] * localCenter.z + src[o + 12],
            src[o + 1] * localCenter.x + src[o + 5] * localCenter.y + src[o + 9] * localCenter.z + src[o + 13],
            src[o + 2] * localCenter.x + src[o + 6] * localCenter.y + src[o + 10] * localCenter.z + src[o + 14],
        );
        const px = projectedCanopyRadiusPx(camera, _viewCenter, localRadius * scale, viewportHeight);
        if (state[i]) { if (px < exitPx) state[i] = 0; }
        else if (px > enterPx) state[i] = 1;
    }
}

/** A downsampled reflection should filter full canopies, not swap to sparse foliage LODs. */
export function forceFullCanopyDetail(snapshot: InstanceSnapshot, state: Uint8Array) {
    state.fill(1, 0, Math.min(snapshot.count, state.length));
}

type PackedCanopyCache = { snapshot: InstanceSnapshot | null; indices: Int32Array; next: Int32Array; count: number };

/** Pack one quality variant. Main draws use the main-camera visible list; shadow draws
 * pass all source instances so offscreen casters are never lost. */
export function packCanopyLod(
    mesh: THREE.InstancedMesh,
    snapshot: InstanceSnapshot,
    state: Uint8Array,
    highDetail: boolean,
    visibleOnly: boolean,
) {
    const visible = visibleOnly && snapshot.visibleCount >= 0 ? snapshot.visible : null;
    const sourceCount = visible ? snapshot.visibleCount : snapshot.count;
    let cache = mesh.userData.__canopyLodCache as PackedCanopyCache | null | undefined;
    if (!cache || cache.indices.length < snapshot.count) {
        cache = { snapshot: null, indices: new Int32Array(snapshot.count), next: new Int32Array(snapshot.count), count: -1 };
        mesh.userData.__canopyLodCache = cache;
    }
    let write = 0;
    for (let j = 0; j < sourceCount; j++) {
        const index = visible ? visible[j] : j;
        if ((state[index] === 1) === highDetail) cache.next[write++] = index;
    }
    let changed = cache.snapshot !== snapshot || cache.count !== write || mesh.count !== write;
    if (!changed) for (let i = 0; i < write; i++) if (cache.indices[i] !== cache.next[i]) { changed = true; break; }
    if (changed) {
        const src = snapshot.matrices, colors = snapshot.colors;
        const dst = mesh.instanceMatrix.array as Float32Array;
        const dstColors = mesh.instanceColor?.array as Float32Array | undefined;
        for (let i = 0; i < write; i++) {
            const index = cache.next[i];
            dst.set(src.subarray(index * 16, index * 16 + 16), i * 16);
            if (dstColors && colors) dstColors.set(colors.subarray(index * 3, index * 3 + 3), i * 3);
        }
        mesh.count = write;
        mesh.instanceMatrix.needsUpdate = true;
        if (dstColors && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        cache.indices.set(cache.next.subarray(0, write));
        cache.snapshot = snapshot;
        cache.count = write;
    }
    return write;
}
