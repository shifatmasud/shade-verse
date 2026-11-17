import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';

const root = process.cwd();
const source = fs.readFileSync(path.join(root, 'src/render/foliageLod.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } }).outputText
    .replace(/from ["']three["']/g, `from ${JSON.stringify(pathToFileURL(path.join(root, 'node_modules/three/build/three.module.js')).href)}`);
const lod = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function makeSnapshot(points) {
    const matrices = new Float32Array(points.length * 16), colors = new Float32Array(points.length * 3);
    points.forEach((p, i) => {
        const m = new THREE.Matrix4().makeTranslation(p.x, 0, p.z);
        m.toArray(matrices, i * 16);
        colors.set([0.2 + i * 0.1, 0.4, 0.6], i * 3);
    });
    return { count: points.length, matrices, colors, visible: new Int32Array(points.length), visibleCount: -1 };
}
function meshFor(n) {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), n);
    for (let i = 0; i < n; i++) mesh.setColorAt(i, new THREE.Color(0.5, 0.7, 0.9));
    mesh.count = n;
    return mesh;
}
function ids(mesh) {
    const a = mesh.instanceMatrix.array;
    return Array.from({ length: mesh.count }, (_, i) => Math.round(a[i * 16 + 12]));
}

// Camera panning through and back across the 8–12 px band should not toggle the same tree repeatedly.
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
camera.updateProjectionMatrix(); camera.updateMatrixWorld();
const pan = makeSnapshot([{ x: 1, z: -20 }]), state = new Uint8Array(1);
const center = new THREE.Vector3(), radius = 1;
lod.updateCanopyLodState(pan, camera, 300, center, radius, state);
assert.equal(state[0], 1, 'enters high above 12 px');
pan.matrices[14] = -25;
lod.updateCanopyLodState(pan, camera, 300, center, radius, state);
assert.equal(state[0], 1, 'stays high inside the hysteresis band');
pan.matrices[14] = -34;
lod.updateCanopyLodState(pan, camera, 300, center, radius, state);
assert.equal(state[0], 0, 'exits high below 8 px');
pan.matrices[14] = -26;
lod.updateCanopyLodState(pan, camera, 300, center, radius, state);
assert.equal(state[0], 0, 'stays low while returning through the band');
pan.matrices[14] = -20;
lod.updateCanopyLodState(pan, camera, 300, center, radius, state);
assert.equal(state[0], 1, 're-enters high above 12 px');

// Main camera sees one source instance. Shadow packing must still include all three offscreen/onscreen casters.
const snapshot = makeSnapshot([{ x: 1, z: -10 }, { x: 2, z: -20 }, { x: 3, z: -30 }]);
snapshot.visible[0] = 0; snapshot.visibleCount = 1;
const choices = new Uint8Array([1, 0, 1]);
const mainHigh = meshFor(3), mainLow = meshFor(3);
assert.equal(lod.packCanopyLod(mainHigh, snapshot, choices, true, true), 1);
assert.equal(lod.packCanopyLod(mainLow, snapshot, choices, false, true), 0);
assert.deepEqual(ids(mainHigh), [1]);

// Lake-copy render uses the same main view's eligible list and high/low split.
const lakeHigh = meshFor(3), lakeLow = meshFor(3);
assert.equal(lod.packCanopyLod(lakeHigh, snapshot, choices, true, true), mainHigh.count);
assert.equal(lod.packCanopyLod(lakeLow, snapshot, choices, false, true), mainLow.count);
assert.deepEqual(ids(lakeHigh), ids(mainHigh));
assert.deepEqual(ids(lakeLow), ids(mainLow));

const shadowHigh = meshFor(3), shadowLow = meshFor(3);
assert.equal(lod.packCanopyLod(shadowHigh, snapshot, choices, true, false), 2);
assert.equal(lod.packCanopyLod(shadowLow, snapshot, choices, false, false), 1);
assert.deepEqual([...ids(shadowHigh), ...ids(shadowLow)].sort(), [1, 2, 3], 'shadow pass retains every source canopy, including main-view-offscreen instances');

// Across representative threshold positions, switching the detail mesh never drops or duplicates a canopy.
for (const z of [-20, -25, -34, -26, -20]) {
    pan.matrices[14] = z;
    lod.updateCanopyLodState(pan, camera, 300, center, radius, state);
    const hi = meshFor(3), loMesh = meshFor(3), panningChoices = new Uint8Array([state[0], 0, 1]);
    lod.packCanopyLod(hi, snapshot, panningChoices, true, false);
    lod.packCanopyLod(loMesh, snapshot, panningChoices, false, false);
    assert.equal(hi.count + loMesh.count, snapshot.count, `all canopies remain represented at z=${z}`);
    assert.deepEqual([...ids(hi), ...ids(loMesh)].sort(), [1, 2, 3]);
}

console.log('foliage_lod: PASS — threshold hysteresis, full shadow sources, lake-copy parity, and canopy continuity');
