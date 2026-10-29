import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RGB } from './shadowbot';

function colorPart(geometry: THREE.BufferGeometry, color: RGB, x: number, y: number, z: number, rz = 0) {
    if (rz) geometry.rotateZ(rz);
    geometry.translate(x, y, z);
    geometry.deleteAttribute('uv');
    const count = geometry.attributes.position.count, rgba = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
        rgba[i * 4] = color[0]; rgba[i * 4 + 1] = color[1]; rgba[i * 4 + 2] = color[2]; rgba[i * 4 + 3] = 1;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(rgba, 4));
    return geometry;
}

/** Adds a small, mirrored robotic glove to pedestrian geometry only; no player/enemy model is changed. */
export function withPedestrianHands(base: THREE.BufferGeometry, shell: RGB) {
    const dark: RGB = [shell[0] * 0.74, shell[1] * 0.74, shell[2] * 0.76];
    const pieces: THREE.BufferGeometry[] = [base];
    const centers: [number, number, number][] = [];

    for (const side of [-1, 1] as const) {
        const x = side * 0.44, y = 0.94, z = 0.075;
        centers.push([x, y, z]);
        pieces.push(colorPart(new THREE.BoxGeometry(0.14, 0.15, 0.12), shell, x, y, z));

        // Four short, rounded finger plates; their slight splay keeps the small hand silhouette readable.
        const fingerOffsets = [-0.045, -0.015, 0.015, 0.045];
        for (let i = 0; i < fingerOffsets.length; i++) {
            const spread = side * (i - 1.5) * 0.055;
            pieces.push(colorPart(new THREE.CapsuleGeometry(0.014, 0.045, 1, 4), dark, x + fingerOffsets[i], 0.84, 0.09, spread));
        }
        // A short thumb joins the outside edge of the palm rather than floating beside the wrist.
        pieces.push(colorPart(new THREE.CapsuleGeometry(0.015, 0.04, 1, 4), dark, x + side * 0.054, 0.91, 0.105, side * 0.72));
    }

    const beforeTriangles = base.index ? base.index.count / 3 : base.attributes.position.count / 3;
    const merged = mergeGeometries(pieces, false);
    if (!merged) throw new Error('Could not merge pedestrian hand geometry');
    const afterTriangles = merged.index ? merged.index.count / 3 : merged.attributes.position.count / 3;
    base.dispose();
    for (const piece of pieces.slice(1)) piece.dispose();
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    merged.userData.pedestrianHands = {
        centers,
        minY: 0.84 - (0.045 / 2 + 0.014),
        maxY: 0.94 + 0.15 / 2,
        fingersPerHand: 5,
        addedTriangles: afterTriangles - beforeTriangles,
    };
    return merged;
}
