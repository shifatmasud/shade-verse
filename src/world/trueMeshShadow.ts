import * as THREE from 'three';

const LEAF_TRIANGLES = 4;
const TRI_TEXTURE_WIDTH = 256;
const BVH_TEXTURE_WIDTH = 256;

type BvhNode = {
    left: number;
    right: number;
    triStart: number;
    triCount: number;
    min: THREE.Vector3;
    max: THREE.Vector3;
};

export type TrueMeshShadowView = {
    triangleTexture: THREE.DataTexture;
    bvhTexture: THREE.DataTexture;
    triangleTextureSize: THREE.Vector2;
    bvhTextureSize: THREE.Vector2;
    boundsMin: THREE.Vector3;
    boundsMax: THREE.Vector3;
    enabled: boolean;
    nodeCount: number;
};

type TrueMeshShadowState = {
    mesh: THREE.SkinnedMesh;
    sourceIndices: Uint32Array;
    triangleOrder: Uint32Array;
    nodes: BvhNode[];
    vertexWorld: Float32Array;
    triangleData: Float32Array;
    bvhData: Float32Array;
    triangleTexture: THREE.DataTexture;
    bvhTexture: THREE.DataTexture;
    triangleTextureSize: THREE.Vector2;
    bvhTextureSize: THREE.Vector2;
    boundsMin: THREE.Vector3;
    boundsMax: THREE.Vector3;
    enabled: boolean;
    triangleCount: number;
    nodeCount: number;
};

let active: TrueMeshShadowState | null = null;
const _vertex = new THREE.Vector3();
const _centroidMin = new THREE.Vector3();
const _centroidMax = new THREE.Vector3();

function textureLayout(texels: number, width: number) {
    return { width, height: Math.max(1, Math.ceil(texels / width)) };
}

function makeFloatTexture(data: Float32Array, width: number, height: number) {
    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.NoColorSpace;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;
    return texture;
}

function createState(mesh: THREE.SkinnedMesh): TrueMeshShadowState {
    const position = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const index = mesh.geometry.index;
    const triangleCount = Math.floor((index?.count ?? position.count) / 3);
    if (!triangleCount) throw new Error('Shadow mesh has no triangles');

    const sourceIndices = new Uint32Array(triangleCount * 3);
    const centroids = new Float32Array(triangleCount * 3);
    const readIndex = (i: number) => index ? index.getX(i) : i;
    for (let tri = 0; tri < triangleCount; tri++) {
        let cx = 0, cy = 0, cz = 0;
        for (let corner = 0; corner < 3; corner++) {
            const vi = readIndex(tri * 3 + corner);
            sourceIndices[tri * 3 + corner] = vi;
            cx += position.getX(vi); cy += position.getY(vi); cz += position.getZ(vi);
        }
        centroids[tri * 3] = cx / 3; centroids[tri * 3 + 1] = cy / 3; centroids[tri * 3 + 2] = cz / 3;
    }

    const nodes: BvhNode[] = [];
    const order: number[] = [];
    const build = (triangles: number[]): number => {
        const nodeIndex = nodes.length;
        const node: BvhNode = { left: -1, right: -1, triStart: -1, triCount: 0, min: new THREE.Vector3(), max: new THREE.Vector3() };
        nodes.push(node);
        if (triangles.length <= LEAF_TRIANGLES) {
            node.triStart = order.length;
            node.triCount = triangles.length;
            order.push(...triangles);
            return nodeIndex;
        }
        _centroidMin.set(Infinity, Infinity, Infinity);
        _centroidMax.set(-Infinity, -Infinity, -Infinity);
        for (const tri of triangles) {
            const o = tri * 3;
            _centroidMin.min(_vertex.set(centroids[o], centroids[o + 1], centroids[o + 2]));
            _centroidMax.max(_vertex.set(centroids[o], centroids[o + 1], centroids[o + 2]));
        }
        const span = _centroidMax.sub(_centroidMin);
        const axis = span.x >= span.y && span.x >= span.z ? 0 : span.y >= span.z ? 1 : 2;
        triangles.sort((a, b) => centroids[a * 3 + axis] - centroids[b * 3 + axis]);
        const middle = triangles.length >> 1;
        node.left = build(triangles.slice(0, middle));
        node.right = build(triangles.slice(middle));
        return nodeIndex;
    };
    build(Array.from({ length: triangleCount }, (_, i) => i));

    const triTex = textureLayout(triangleCount * 3, TRI_TEXTURE_WIDTH);
    const bvhTex = textureLayout(nodes.length * 2, BVH_TEXTURE_WIDTH);
    const triangleData = new Float32Array(triTex.width * triTex.height * 4);
    const bvhData = new Float32Array(bvhTex.width * bvhTex.height * 4);
    return {
        mesh, sourceIndices, triangleOrder: Uint32Array.from(order), nodes,
        vertexWorld: new Float32Array(position.count * 3), triangleData, bvhData,
        triangleTexture: makeFloatTexture(triangleData, triTex.width, triTex.height),
        bvhTexture: makeFloatTexture(bvhData, bvhTex.width, bvhTex.height),
        triangleTextureSize: new THREE.Vector2(triTex.width, triTex.height),
        bvhTextureSize: new THREE.Vector2(bvhTex.width, bvhTex.height),
        boundsMin: new THREE.Vector3(), boundsMax: new THREE.Vector3(), enabled: false, triangleCount, nodeCount: nodes.length,
    };
}

export function registerTrueMeshShadow(mesh: THREE.SkinnedMesh) {
    if (active) { active.triangleTexture.dispose(); active.bvhTexture.dispose(); }
    active = createState(mesh);
    return () => {
        if (active?.mesh !== mesh) return;
        active.triangleTexture.dispose(); active.bvhTexture.dispose(); active = null;
    };
}

function refresh(state: TrueMeshShadowState) {
    const { mesh } = state;
    let visible = true;
    for (let node: THREE.Object3D | null = mesh; node; node = node.parent) if (!node.visible) { visible = false; break; }
    state.enabled = visible && mesh.geometry.getAttribute('position') !== undefined;
    if (!state.enabled) return;

    // The pass calls this after Scene's pose update and matrix-world update.
    mesh.updateWorldMatrix(true, false);
    mesh.skeleton.update();
    const position = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i++) {
        mesh.getVertexPosition(i, _vertex);
        _vertex.applyMatrix4(mesh.matrixWorld);
        const o = i * 3;
        state.vertexWorld[o] = _vertex.x; state.vertexWorld[o + 1] = _vertex.y; state.vertexWorld[o + 2] = _vertex.z;
    }

    // Store the actual deformed world-space triangles in BVH leaf order.
    const { triangleData, triangleOrder, sourceIndices } = state;
    for (let ordered = 0; ordered < triangleOrder.length; ordered++) {
        const sourceTri = triangleOrder[ordered];
        for (let corner = 0; corner < 3; corner++) {
            const vi = sourceIndices[sourceTri * 3 + corner], src = vi * 3, dst = (ordered * 3 + corner) * 4;
            triangleData[dst] = state.vertexWorld[src];
            triangleData[dst + 1] = state.vertexWorld[src + 1];
            triangleData[dst + 2] = state.vertexWorld[src + 2];
            triangleData[dst + 3] = 0;
        }
    }

    const refit = (nodeIndex: number): BvhNode => {
        const node = state.nodes[nodeIndex];
        node.min.set(Infinity, Infinity, Infinity); node.max.set(-Infinity, -Infinity, -Infinity);
        if (node.triCount > 0) {
            for (let tri = node.triStart; tri < node.triStart + node.triCount; tri++) {
                const first = tri * 12;
                for (let corner = 0; corner < 3; corner++) {
                    const o = first + corner * 4;
                    _vertex.set(triangleData[o], triangleData[o + 1], triangleData[o + 2]);
                    node.min.min(_vertex); node.max.max(_vertex);
                }
            }
        } else {
            const left = refit(node.left), right = refit(node.right);
            node.min.copy(left.min).min(right.min); node.max.copy(left.max).max(right.max);
        }
        return node;
    };
    refit(0);

    const bvhData = state.bvhData;
    for (let i = 0; i < state.nodes.length; i++) {
        const node = state.nodes[i], o = i * 8, leaf = node.triCount > 0;
        bvhData[o] = node.min.x; bvhData[o + 1] = node.min.y; bvhData[o + 2] = node.min.z; bvhData[o + 3] = leaf ? node.triStart : node.left;
        bvhData[o + 4] = node.max.x; bvhData[o + 5] = node.max.y; bvhData[o + 6] = node.max.z; bvhData[o + 7] = leaf ? -node.triCount : node.right;
    }
    state.boundsMin.copy(state.nodes[0].min); state.boundsMax.copy(state.nodes[0].max);
    state.triangleTexture.needsUpdate = true;
    state.bvhTexture.needsUpdate = true;
}

export function updateTrueMeshShadow(): TrueMeshShadowView | null {
    if (!active) return null;
    refresh(active);
    return active;
}
