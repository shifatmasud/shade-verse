import * as THREE from 'three';

const LEAF_TRIANGLES = 4;
const TRI_TEXTURE_WIDTH = 256;
const BVH_TEXTURE_WIDTH = 256;
const MAX_DISTANCE = 56;
const MAX_TRIANGLES = 120_000;

export type CharacterShadowPose =
    | { kind: 'shadowbot'; time: { value: number }; rate: number; pedestrian?: boolean }
    | { kind: 'robot'; time: { value: number }; speed: number; pivots: number[][]; signs: number[] };

type BvhNode = { left: number; right: number; triStart: number; triCount: number; min: THREE.Vector3; max: THREE.Vector3 };
type LocalTemplate = { geometry: THREE.BufferGeometry; sourceIndices: Uint32Array; triangleOrder: Uint32Array; nodes: BvhNode[]; triangleCount: number; vertexCount: number };
type ActorSource = {
    key: string; geometry: THREE.BufferGeometry; matrix: THREE.Matrix4; pose?: CharacterShadowPose; mesh?: THREE.Mesh;
    instanceIndex: number; phaseX: number; phaseZ: number; still: number; priority: number; distanceSq: number;
};
type ActorState = ActorSource & { template: LocalTemplate; vertexOffset: number; triangleOffset: number; nodeOffset: number };
type InstanceSnapshot = { mesh: THREE.InstancedMesh; count: number; matrices: Float32Array; still: Float32Array };
type PedestrianSources = { ground: THREE.BufferGeometry[]; drone: THREE.BufferGeometry; transforms: number[]; groundPose?: CharacterShadowPose; dronePose?: CharacterShadowPose };

type CharacterMeshShadowState = {
    signature: string; actors: ActorState[]; nodes: BvhNode[]; sourceIndices: Uint32Array; vertexWorld: Float32Array;
    triangleData: Float32Array; bvhData: Float32Array; topNodeCount: number;
    triangleTexture: THREE.DataTexture; bvhTexture: THREE.DataTexture; triangleTextureSize: THREE.Vector2; bvhTextureSize: THREE.Vector2;
    boundsMin: THREE.Vector3; boundsMax: THREE.Vector3; enabled: boolean; nodeCount: number; triangleCount: number; actorCount: number;
};

export type CharacterMeshShadowView = Pick<CharacterMeshShadowState, 'triangleTexture' | 'bvhTexture' | 'triangleTextureSize' | 'bvhTextureSize' | 'boundsMin' | 'boundsMax' | 'enabled' | 'nodeCount' | 'triangleCount' | 'actorCount'>;

const registeredCasters = new Set<THREE.Mesh>();
const instanceSnapshots = new Map<string, InstanceSnapshot>();
const templateCache = new Map<string, LocalTemplate>();
let pedestrianSources: PedestrianSources | null = null;
let active: CharacterMeshShadowState | null = null;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _centroidMin = new THREE.Vector3(), _centroidMax = new THREE.Vector3();
const _instance = new THREE.Matrix4(), _world = new THREE.Matrix4(), _q = new THREE.Quaternion(), _pos = new THREE.Vector3(), _scale = new THREE.Vector3();

function textureLayout(texels: number, width: number) { return { width, height: Math.max(1, Math.ceil(texels / width)) }; }
function makeFloatTexture(data: Float32Array, width: number, height: number) {
    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
    texture.minFilter = THREE.NearestFilter; texture.magFilter = THREE.NearestFilter; texture.generateMipmaps = false;
    texture.colorSpace = THREE.NoColorSpace; texture.unpackAlignment = 1; texture.needsUpdate = true; return texture;
}
function blankNode(): BvhNode { return { left: -1, right: -1, triStart: -1, triCount: 0, min: new THREE.Vector3(), max: new THREE.Vector3() }; }

function getTemplate(geometry: THREE.BufferGeometry): LocalTemplate {
    const cached = templateCache.get(geometry.uuid); if (cached) return cached;
    const position = geometry.getAttribute('position') as THREE.BufferAttribute, index = geometry.index;
    const triangleCount = Math.floor((index?.count ?? position.count) / 3);
    if (!triangleCount) throw new Error('Character shadow geometry has no triangles');
    const sourceIndices = new Uint32Array(triangleCount * 3), centroids = new Float32Array(triangleCount * 3);
    const readIndex = (i: number) => index ? index.getX(i) : i;
    for (let tri = 0; tri < triangleCount; tri++) {
        let cx = 0, cy = 0, cz = 0;
        for (let corner = 0; corner < 3; corner++) { const vi = readIndex(tri * 3 + corner); sourceIndices[tri * 3 + corner] = vi; cx += position.getX(vi); cy += position.getY(vi); cz += position.getZ(vi); }
        centroids[tri * 3] = cx / 3; centroids[tri * 3 + 1] = cy / 3; centroids[tri * 3 + 2] = cz / 3;
    }
    const nodes: BvhNode[] = [], order: number[] = [];
    const build = (triangles: number[]): number => {
        const nodeIndex = nodes.length, node = blankNode(); nodes.push(node);
        if (triangles.length <= LEAF_TRIANGLES) { node.triStart = order.length; node.triCount = triangles.length; order.push(...triangles); return nodeIndex; }
        _centroidMin.set(Infinity, Infinity, Infinity); _centroidMax.set(-Infinity, -Infinity, -Infinity);
        for (const tri of triangles) { const o = tri * 3; _centroidMin.min(_v.set(centroids[o], centroids[o + 1], centroids[o + 2])); _centroidMax.max(_v.set(centroids[o], centroids[o + 1], centroids[o + 2])); }
        const span = _centroidMax.sub(_centroidMin), axis = span.x >= span.y && span.x >= span.z ? 0 : span.y >= span.z ? 1 : 2;
        triangles.sort((a, b) => centroids[a * 3 + axis] - centroids[b * 3 + axis]);
        const middle = triangles.length >> 1; node.left = build(triangles.slice(0, middle)); node.right = build(triangles.slice(middle)); return nodeIndex;
    };
    build(Array.from({ length: triangleCount }, (_, i) => i));
    const template = { geometry, sourceIndices, triangleOrder: Uint32Array.from(order), nodes, triangleCount, vertexCount: position.count };
    if (templateCache.size > 80) templateCache.clear(); templateCache.set(geometry.uuid, template); return template;
}

export function registerCharacterShadowMesh(mesh: THREE.Mesh) {
    return registerCharacterShadowMeshes([mesh]);
}

export function registerCharacterShadowMeshes(meshes: THREE.Mesh[]) {
    for (const mesh of meshes) registeredCasters.add(mesh);
    return () => { for (const mesh of meshes) registeredCasters.delete(mesh); };
}

export function registerPedestrianShadowSources(ground: THREE.BufferGeometry[], drone: THREE.BufferGeometry, transforms: number[], groundPose?: CharacterShadowPose, dronePose?: CharacterShadowPose) {
    const entry = { ground, drone, transforms, groundPose, dronePose }; pedestrianSources = entry;
    return () => { if (pedestrianSources === entry) pedestrianSources = null; };
}

/** Snapshot all enemy instances before the renderer's frustum-cull pass packs their matrices. */
export function captureCharacterShadowInstances(mesh: THREE.InstancedMesh, count: number) {
    if (!mesh.userData.characterShadow) return;
    let snap = instanceSnapshots.get(mesh.uuid); const n = Math.max(0, Math.min(count, mesh.instanceMatrix.count));
    if (!snap || snap.mesh !== mesh) { snap = { mesh, count: 0, matrices: new Float32Array(n * 16), still: new Float32Array(n) }; instanceSnapshots.set(mesh.uuid, snap); }
    if (snap.matrices.length < n * 16) snap.matrices = new Float32Array(n * 16);
    if (snap.still.length < n) snap.still = new Float32Array(n);
    snap.count = n; snap.matrices.set((mesh.instanceMatrix.array as Float32Array).subarray(0, n * 16), 0);
    const still = mesh.geometry.getAttribute('aStill') as THREE.BufferAttribute | undefined;
    for (let i = 0; i < n; i++) snap.still[i] = still?.getX(i) ?? 0;
}

function isVisible(object: THREE.Object3D) { for (let p: THREE.Object3D | null = object; p; p = p.parent) if (!p.visible) return false; return true; }
function addRegisteredActors(out: ActorSource[], camera: THREE.Camera) {
    for (const mesh of registeredCasters) {
        if (!mesh.parent || !isVisible(mesh)) continue;
        mesh.updateWorldMatrix(true, false);
        let giantBoss = false; for (let parent: THREE.Object3D | null = mesh; parent; parent = parent.parent) if (parent.userData.giantBoss) { giantBoss = true; break; }
        mesh.getWorldPosition(_pos); const distanceSq = _pos.distanceToSquared(camera.position), maxDistance = giantBoss ? 260 : MAX_DISTANCE;
        if (distanceSq > maxDistance * maxDistance) continue;
        out.push({ key: `mesh:${mesh.uuid}`, geometry: mesh.geometry, matrix: mesh.matrixWorld.clone(), mesh, instanceIndex: -1, phaseX: 0, phaseZ: 0, still: 0, priority: giantBoss ? 1 : 0, distanceSq });
    }
}
function addPedestrianActors(out: ActorSource[], camera: THREE.Camera) {
    const src = pedestrianSources; if (!src) return;
    for (let i = 0; i + 5 < src.transforms.length; i += 6) {
        const type = src.transforms[i], x = src.transforms[i + 1], y = src.transforms[i + 2], z = src.transforms[i + 3], rot = src.transforms[i + 4], scale = src.transforms[i + 5];
        _pos.set(x, y, z); const distanceSq = _pos.distanceToSquared(camera.position); if (distanceSq > MAX_DISTANCE * MAX_DISTANCE) continue;
        _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rot); _world.compose(_pos, _q, _scale.setScalar(scale));
        const drone = type === 5;
        const geometry = drone ? src.drone : (src.ground[type] ?? src.ground[0]);
        if (!geometry) continue;
        out.push({ key: `ped:${i / 6}:${type}`, geometry, matrix: _world.clone(), pose: drone ? src.dronePose : src.groundPose, instanceIndex: -1, phaseX: x, phaseZ: z, still: 0, priority: drone ? 3 : 4, distanceSq });
    }
}
function addInstancedActors(out: ActorSource[], scene: THREE.Scene, camera: THREE.Camera) {
    scene.traverse((object) => {
        const mesh = object as THREE.InstancedMesh, meta = mesh.userData?.characterShadow as { geometry?: THREE.BufferGeometry; pose?: CharacterShadowPose; priority?: number } | undefined;
        if (!(mesh as any).isInstancedMesh || !meta || !isVisible(mesh)) return;
        const snap = instanceSnapshots.get(mesh.uuid); if (!snap || snap.count === 0) return;
        const geometry = meta.geometry ?? mesh.geometry; mesh.updateWorldMatrix(true, false);
        for (let i = 0; i < snap.count; i++) {
            _instance.fromArray(snap.matrices, i * 16); _world.multiplyMatrices(mesh.matrixWorld, _instance); _pos.setFromMatrixPosition(_world);
            const distanceSq = _pos.distanceToSquared(camera.position); if (distanceSq > MAX_DISTANCE * MAX_DISTANCE) continue;
            out.push({ key: `inst:${mesh.uuid}:${i}`, geometry, matrix: _world.clone(), pose: meta.pose, instanceIndex: i, phaseX: _instance.elements[12], phaseZ: _instance.elements[14], still: snap.still[i], priority: meta.priority ?? 2, distanceSq });
        }
    });
}
function collectActors(scene: THREE.Scene, camera: THREE.Camera) {
    const actors: ActorSource[] = []; addRegisteredActors(actors, camera); addPedestrianActors(actors, camera); addInstancedActors(actors, scene, camera);
    // Preserve nearby heroes/enemies first; only distant low-priority crowd instances are trimmed if the GPU texture budget is reached.
    actors.sort((a, b) => a.priority - b.priority || a.distanceSq - b.distanceSq);
    let budget = MAX_TRIANGLES; const kept: ActorSource[] = [];
    for (const actor of actors) { const template = getTemplate(actor.geometry); if (template.triangleCount > budget) continue; kept.push(actor); budget -= template.triangleCount; }
    kept.sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key));
    return kept;
}

function createState(actors: ActorSource[]): CharacterMeshShadowState {
    const actorStates: ActorState[] = []; let totalVertices = 0, totalTriangles = 0, localNodes = 0;
    const templates = actors.map((actor) => getTemplate(actor.geometry)), topNodeCount = Math.max(0, actors.length - 1);
    for (let i = 0; i < actors.length; i++) {
        const template = templates[i]; actorStates.push({ ...actors[i], template, vertexOffset: totalVertices, triangleOffset: totalTriangles, nodeOffset: topNodeCount + localNodes });
        totalVertices += template.vertexCount; totalTriangles += template.triangleCount; localNodes += template.nodes.length;
    }
    const totalNodes = topNodeCount + localNodes, triTex = textureLayout(totalTriangles * 3, TRI_TEXTURE_WIDTH), bvhTex = textureLayout(totalNodes * 2, BVH_TEXTURE_WIDTH);
    const sourceIndices = new Uint32Array(totalTriangles * 3), nodes = Array.from({ length: totalNodes }, blankNode);
    for (const actor of actorStates) {
        const t = actor.template;
        for (let ordered = 0; ordered < t.triangleCount; ordered++) {
            const sourceTri = t.triangleOrder[ordered], dst = (actor.triangleOffset + ordered) * 3;
            for (let corner = 0; corner < 3; corner++) sourceIndices[dst + corner] = actor.vertexOffset + t.sourceIndices[sourceTri * 3 + corner];
        }
        for (let i = 0; i < t.nodes.length; i++) {
            const src = t.nodes[i], dst = nodes[actor.nodeOffset + i];
            dst.triCount = src.triCount; dst.triStart = src.triCount > 0 ? actor.triangleOffset + src.triStart : -1;
            dst.left = src.left >= 0 ? actor.nodeOffset + src.left : -1; dst.right = src.right >= 0 ? actor.nodeOffset + src.right : -1;
        }
    }
    const triangleData = new Float32Array(triTex.width * triTex.height * 4), bvhData = new Float32Array(bvhTex.width * bvhTex.height * 4);
    return {
        signature: actors.map((a) => `${a.key}:${a.geometry.uuid}`).join('|'), actors: actorStates, nodes, sourceIndices,
        vertexWorld: new Float32Array(totalVertices * 3), triangleData, bvhData, topNodeCount,
        triangleTexture: makeFloatTexture(triangleData, triTex.width, triTex.height), bvhTexture: makeFloatTexture(bvhData, bvhTex.width, bvhTex.height),
        triangleTextureSize: new THREE.Vector2(triTex.width, triTex.height), bvhTextureSize: new THREE.Vector2(bvhTex.width, bvhTex.height),
        boundsMin: new THREE.Vector3(), boundsMax: new THREE.Vector3(), enabled: false, nodeCount: totalNodes, triangleCount: totalTriangles, actorCount: actors.length,
    };
}

function smoothstep(a: number, b: number, x: number) { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function rotateX(source: THREE.Vector3, target: THREE.Vector3, cx: number, cy: number, cz: number, angle: number) {
    const s = Math.sin(angle), c = Math.cos(angle), x = source.x - cx, y = source.y - cy, z = source.z - cz;
    return target.set(cx + x, cy + y * c - z * s, cz + y * s + z * c);
}
function rotateY(source: THREE.Vector3, target: THREE.Vector3, cx: number, cy: number, cz: number, angle: number) {
    const s = Math.sin(angle), c = Math.cos(angle), x = source.x - cx, y = source.y - cy, z = source.z - cz;
    return target.set(cx + x * c + z * s, cy + y, cz - x * s + z * c);
}
function deformShadowBot(v: THREE.Vector3, actor: ActorState) {
    const pose = actor.pose; if (!pose || pose.kind !== 'shadowbot') return;
    const y = v.y, ax = Math.abs(v.x), sd = v.x < 0 ? -1 : 1, still = actor.still;
    let wl: number, wa: number;
    if (pose.pedestrian) {
        const armRegion = smoothstep(0.26, 0.34, ax) * (1 - smoothstep(1.66, 1.74, y));
        wl = (1 - smoothstep(0.92, 1.02, y)) * (1 - armRegion);
        wa = smoothstep(0.26, 0.34, ax) * smoothstep(0.76, 0.90, y) * (1 - smoothstep(1.66, 1.74, y));
    } else {
        wl = 1 - smoothstep(0.92, 1.02, y);
        wa = smoothstep(0.26, 0.34, ax) * smoothstep(0.9, 1.0, y) * (1 - smoothstep(1.66, 1.74, y));
    }
    wl *= 1 - still; wa *= 1 - still;
    const ph = pose.time.value * pose.rate + actor.phaseX * 0.37 + actor.phaseZ * 0.51;
    _v2.copy(v); rotateX(_v2, _v3, 0, 1.55, 0, Math.sin(ph) * 0.5 * sd); v.copy(_v2).lerp(_v3, wl);
    _v2.copy(v); rotateX(_v2, _v3, sd * 0.31, 1.55, 0, -Math.sin(ph) * 0.45 * sd); v.copy(_v2).lerp(_v3, wa);
    v.y += Math.abs(Math.sin(ph)) * 0.035 * (1 - still);
}
function deformRobot(v: THREE.Vector3, actor: ActorState, vertex: number) {
    const pose = actor.pose; if (!pose || pose.kind !== 'robot') return;
    const partAttr = actor.template.geometry.getAttribute('aPart') as THREE.BufferAttribute | undefined; if (!partAttr) return;
    const part = Math.round(partAttr.getX(vertex)); if (part <= 0) return;
    const pivot = pose.pivots[part]; if (!pivot) return;
    const px = pivot[0], py = pivot[1], pz = pivot[2], md = pivot[3], sgn = pose.signs[part] || 0, lv = 1 - actor.still;
    if (lv <= 0) return;
    const ph = pose.time.value * pose.speed + actor.phaseX * 0.37 + actor.phaseZ * 0.31;
    _v2.copy(v);
    if (md < 1.5) rotateX(_v2, _v3, px, py, pz, Math.sin(ph) * 0.6 * sgn * lv);
    else if (md < 2.5) rotateX(_v2, _v3, px, py, pz, Math.sin(ph) * 0.5 * sgn * lv);
    else rotateY(_v2, _v3, px, py, pz, (pose.time.value * 38 * sgn + part) * lv);
    v.copy(_v3);
}

function refitActorNode(state: CharacterMeshShadowState, actor: ActorState, nodeIndex: number): BvhNode {
    const node = state.nodes[nodeIndex]; node.min.set(Infinity, Infinity, Infinity); node.max.set(-Infinity, -Infinity, -Infinity);
    if (node.triCount > 0) {
        for (let tri = node.triStart; tri < node.triStart + node.triCount; tri++) { const first = tri * 12;
            for (let corner = 0; corner < 3; corner++) { const o = first + corner * 4; _v.set(state.triangleData[o], state.triangleData[o + 1], state.triangleData[o + 2]); node.min.min(_v); node.max.max(_v); }
        }
    } else { const left = refitActorNode(state, actor, node.left), right = refitActorNode(state, actor, node.right); node.min.copy(left.min).min(right.min); node.max.copy(left.max).max(right.max); }
    return node;
}
function buildTopTree(state: CharacterMeshShadowState) {
    if (state.actors.length === 1) return state.actors[0].nodeOffset;
    let cursor = 0;
    const make = (items: ActorState[]): number => {
        if (items.length === 1) return items[0].nodeOffset;
        _centroidMin.set(Infinity, Infinity, Infinity); _centroidMax.set(-Infinity, -Infinity, -Infinity);
        for (const a of items) { const n = state.nodes[a.nodeOffset]; _centroidMin.min(_v.set((n.min.x + n.max.x) * 0.5, (n.min.y + n.max.y) * 0.5, (n.min.z + n.max.z) * 0.5)); _centroidMax.max(_v.set((n.min.x + n.max.x) * 0.5, (n.min.y + n.max.y) * 0.5, (n.min.z + n.max.z) * 0.5)); }
        const span = _centroidMax.sub(_centroidMin), axis = span.x >= span.y && span.x >= span.z ? 'x' : span.y >= span.z ? 'y' : 'z';
        items.sort((a, b) => { const x = state.nodes[a.nodeOffset], y = state.nodes[b.nodeOffset]; return (x.min[axis] + x.max[axis]) - (y.min[axis] + y.max[axis]); });
        const middle = items.length >> 1, nodeIndex = cursor++, leftIndex = make(items.slice(0, middle)), rightIndex = make(items.slice(middle)), node = state.nodes[nodeIndex], left = state.nodes[leftIndex], right = state.nodes[rightIndex];
        node.left = leftIndex; node.right = rightIndex; node.triCount = 0; node.triStart = -1; node.min.copy(left.min).min(right.min); node.max.copy(left.max).max(right.max); return nodeIndex;
    };
    return make(state.actors.slice());
}

function refresh(state: CharacterMeshShadowState) {
    for (const actor of state.actors) {
        const geometry = actor.template.geometry, position = geometry.getAttribute('position') as THREE.BufferAttribute;
        if (actor.mesh) { actor.mesh.updateWorldMatrix(true, false); if ((actor.mesh as any).isSkinnedMesh) (actor.mesh as THREE.SkinnedMesh).skeleton.update(); }
        for (let i = 0; i < actor.template.vertexCount; i++) {
            if (actor.mesh) { actor.mesh.getVertexPosition(i, _v); _v.applyMatrix4(actor.mesh.matrixWorld); }
            else { _v.set(position.getX(i), position.getY(i), position.getZ(i)); if (actor.pose?.kind === 'shadowbot') deformShadowBot(_v, actor); else if (actor.pose?.kind === 'robot') deformRobot(_v, actor, i); _v.applyMatrix4(actor.matrix); }
            const o = (actor.vertexOffset + i) * 3; state.vertexWorld[o] = _v.x; state.vertexWorld[o + 1] = _v.y; state.vertexWorld[o + 2] = _v.z;
        }
        for (let i = 0; i < actor.template.triangleCount * 3; i++) {
            const v = state.sourceIndices[actor.triangleOffset * 3 + i], src = v * 3, dst = (actor.triangleOffset * 3 + i) * 4;
            state.triangleData[dst] = state.vertexWorld[src]; state.triangleData[dst + 1] = state.vertexWorld[src + 1]; state.triangleData[dst + 2] = state.vertexWorld[src + 2]; state.triangleData[dst + 3] = 0;
        }
        refitActorNode(state, actor, actor.nodeOffset);
    }
    const rootIndex = buildTopTree(state), root = state.nodes[rootIndex];
    for (let i = 0; i < state.nodes.length; i++) {
        const node = state.nodes[i], o = i * 8, leaf = node.triCount > 0;
        state.bvhData[o] = node.min.x; state.bvhData[o + 1] = node.min.y; state.bvhData[o + 2] = node.min.z; state.bvhData[o + 3] = leaf ? node.triStart : node.left;
        state.bvhData[o + 4] = node.max.x; state.bvhData[o + 5] = node.max.y; state.bvhData[o + 6] = node.max.z; state.bvhData[o + 7] = leaf ? -node.triCount : node.right;
    }
    state.boundsMin.copy(root.min); state.boundsMax.copy(root.max); state.enabled = state.triangleCount > 0;
    state.triangleTexture.needsUpdate = true; state.bvhTexture.needsUpdate = true;
}

export function updateCharacterMeshShadow(scene: THREE.Scene, camera: THREE.Camera): CharacterMeshShadowView | null {
    const actors = collectActors(scene, camera);
    if (!actors.length) {
        if (active) { active.triangleTexture.dispose(); active.bvhTexture.dispose(); active = null; }
        return null;
    }
    const signature = actors.map((a) => `${a.key}:${a.geometry.uuid}`).join('|');
    if (!active || active.signature !== signature) {
        if (active) { active.triangleTexture.dispose(); active.bvhTexture.dispose(); }
        active = createState(actors);
    } else for (let i = 0; i < actors.length; i++) Object.assign(active.actors[i], actors[i]);
    refresh(active);
    return active;
}
