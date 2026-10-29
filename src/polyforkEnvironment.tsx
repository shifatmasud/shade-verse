import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import {
    buildings, world, PARK, parkH, PARK_POND, PARK_POND_Y, PARK_BRIDGE,
    bridgeSurfaceAt, isLegacyCityCore, type Sim,
} from './sim';

const DBG = !!(import.meta as any).env.VITE_DBG;
const urlFor = (id: string) => `/polyfork/${id}.glb`;

type Asset = { id: string; title: string; url: string };
type Part = { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[] };
type Model = { id: string; dimensions: THREE.Vector3; parts: Part[] };
type Placement = { x: number; y: number; z: number; sx: number; sy: number; sz: number; yaw: number };

const CITY_ASSETS: Asset[] = [
    { id: 'brick-church-6cf1af', title: 'Brick Church', url: urlFor('brick-church-6cf1af') },
    { id: 'brownstone-row-house-e58392', title: 'Brownstone Row House', url: urlFor('brownstone-row-house-e58392') },
    { id: 'corner-shop-db18e2', title: 'Corner Shop', url: urlFor('corner-shop-db18e2') },
    { id: 'street-diner-bb174e', title: 'Street Diner', url: urlFor('street-diner-bb174e') },
    { id: 'fire-station-a7346f', title: 'Fire Station', url: urlFor('fire-station-a7346f') },
    { id: 'cast-iron-loft-d05908', title: 'Cast-Iron Loft', url: urlFor('cast-iron-loft-d05908') },
    { id: 'movie-theater-8c710a', title: 'Movie Theater', url: urlFor('movie-theater-8c710a') },
    { id: 'office-tower-8d148a', title: 'Office Tower', url: urlFor('office-tower-8d148a') },
    { id: 'parking-garage-e1b981', title: 'Parking Garage', url: urlFor('parking-garage-e1b981') },
    { id: 'subway-entrance-c05ada', title: 'Subway Entrance', url: urlFor('subway-entrance-c05ada') },
    { id: 'brick-tenement-5257e9', title: 'Brick Tenement', url: urlFor('brick-tenement-5257e9') },
    { id: 'narrow-walk-up-71d077', title: 'Narrow Walk-Up', url: urlFor('narrow-walk-up-71d077') },
    { id: 'monolith-office-tower-422420', title: 'Monolith Office Tower', url: urlFor('monolith-office-tower-422420') },
    { id: 'vertical-farm-tower-77d887', title: 'Vertical Farm Tower', url: urlFor('vertical-farm-tower-77d887') },
    { id: 'capsule-residential-tower-80300b', title: 'Capsule Residential Tower', url: urlFor('capsule-residential-tower-80300b') },
];

const TREE_ASSETS: Asset[] = [
    { id: 'street-tree-0d33f3', title: 'Street Tree', url: urlFor('street-tree-0d33f3') },
    { id: 'palm-tree-a307da', title: 'Palm Tree', url: urlFor('palm-tree-a307da') },
    { id: 'tall-pine-tree-ab4108', title: 'Tall Pine', url: urlFor('tall-pine-tree-ab4108') },
    { id: 'young-pine-0d7695', title: 'Young Pine', url: urlFor('young-pine-0d7695') },
    { id: 'broadleaf-oak-997c22', title: 'Broadleaf Oak', url: urlFor('broadleaf-oak-997c22') },
    { id: 'birch-tree-181b33', title: 'Birch', url: urlFor('birch-tree-181b33') },
    { id: 'maple-tree-65fa12', title: 'Maple', url: urlFor('maple-tree-65fa12') },
    { id: 'cherry-blossom-tree-3f7ab7', title: 'Cherry Blossom', url: urlFor('cherry-blossom-tree-3f7ab7') },
    { id: 'cherry-tree-a710a9', title: 'Cherry Tree', url: urlFor('cherry-tree-a710a9') },
    { id: 'round-bush-cd2ac0', title: 'Round Bush', url: urlFor('round-bush-cd2ac0') },
];

const BRIDGE_ASSET: Asset = {
    id: 'creek-footbridge-d35cf7', title: 'Creek Footbridge', url: urlFor('creek-footbridge-d35cf7'),
};
const WATER_ASSET: Asset = {
    id: 'water-blob-f266b8', title: 'Water Blob', url: urlFor('water-blob-f266b8'),
};

function prepareModel(id: string, gltf: GLTF): Model {
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root);
    const dimensions = bounds.getSize(new THREE.Vector3());
    const centre = bounds.getCenter(new THREE.Vector3());
    const normalize = new THREE.Matrix4().makeTranslation(-centre.x, -bounds.min.y, -centre.z);
    const parts: Part[] = [];
    root.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh || !mesh.geometry) return;
        const geometry = mesh.geometry.clone();
        geometry.applyMatrix4(mesh.matrixWorld);
        geometry.applyMatrix4(normalize);
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        const material = Array.isArray(mesh.material)
            ? mesh.material.map((m) => m.clone())
            : mesh.material.clone();
        parts.push({ geometry, material });
    });
    return { id, dimensions, parts };
}

function InstancedAsset({ prefix, model, placements }: { prefix: string; model: Model; placements: Placement[] }) {
    const refs = useRef<(THREE.InstancedMesh | null)[]>([]);
    useEffect(() => {
        const object = new THREE.Object3D();
        refs.current.forEach((mesh, partIndex) => {
            if (!mesh) return;
            for (let i = 0; i < placements.length; i++) {
                const p = placements[i];
                object.position.set(p.x, p.y, p.z);
                object.rotation.set(0, p.yaw, 0);
                object.scale.set(p.sx, p.sy, p.sz);
                object.updateMatrix();
                mesh.setMatrixAt(i, object.matrix);
            }
            mesh.count = placements.length;
            mesh.instanceMatrix.needsUpdate = true;
            mesh.computeBoundingSphere();
            mesh.name = `${prefix}-${model.id}-part-${partIndex}`;
            mesh.userData.polyforkId = model.id;
            mesh.userData.polyforkInstances = placements.length;
        });
    }, [model.id, model.parts.length, placements, prefix]);
    if (!placements.length) return null;
    return <group name={`${prefix}-${model.id}`}>
        {model.parts.map((part, index) => <instancedMesh
            key={index}
            ref={(mesh) => { refs.current[index] = mesh; }}
            args={[part.geometry, part.material, placements.length]}
            frustumCulled
            dispose={null}
        />)}
    </group>;
}

function hash01(x: number, z: number) {
    const v = Math.sin(x * 127.1 + z * 311.7 + 19.19) * 43758.5453;
    return v - Math.floor(v);
}

function isPondClearance(x: number, z: number, margin = 0) {
    const dx = (x - PARK_POND.cx) / (PARK_POND.rx + margin);
    const dz = (z - PARK_POND.cz) / (PARK_POND.rz + margin);
    return dx * dx + dz * dz < 1;
}

function chooseBuildingAsset(b: (typeof buildings)[number], index: number): Asset {
    const h = hash01((b.x0 + b.x1) * 0.5, (b.z0 + b.z1) * 0.5 + index * 0.01);
    const tall = CITY_ASSETS.filter((a) => [
        'monolith-office-tower-422420', 'vertical-farm-tower-77d887',
        'capsule-residential-tower-80300b', 'office-tower-8d148a',
    ].includes(a.id));
    const mid = CITY_ASSETS.filter((a) => [
        'brick-church-6cf1af', 'cast-iron-loft-d05908', 'movie-theater-8c710a',
        'parking-garage-e1b981', 'brick-tenement-5257e9', 'office-tower-8d148a',
    ].includes(a.id));
    const low = CITY_ASSETS.filter((a) => [
        'brownstone-row-house-e58392', 'corner-shop-db18e2', 'street-diner-bb174e',
        'fire-station-a7346f', 'narrow-walk-up-71d077',
        'brick-church-6cf1af', 'movie-theater-8c710a',
    ].includes(a.id));
    const pool = b.h > 49 ? tall : b.h > 31 ? mid : low;
    return pool[Math.floor(h * pool.length) % pool.length];
}

export function PolyforkBuildings() {
    const gltfs = useLoader(GLTFLoader, CITY_ASSETS.map((asset) => asset.url)) as GLTF[];
    const models = useMemo(() => CITY_ASSETS.map((asset, i) => prepareModel(asset.id, gltfs[i])), [gltfs]);
    const byId = useMemo(() => new Map(models.map((model) => [model.id, model])), [models]);
    const buckets = useMemo(() => {
        const result = new Map<string, Placement[]>();
        CITY_ASSETS.forEach((asset) => result.set(asset.id, []));
        const rendered = buildings.filter((b) => {
            if (b.host !== undefined) return false;
            const x = (b.x0 + b.x1) * 0.5, z = (b.z0 + b.z1) * 0.5;
            if (isLegacyCityCore(x, z)) return false;
            // This 6-home outer block is already the authored Polyfork tenement prototype.
            return !(x >= -251 && x <= -229 && z >= 69 && z <= 92);
        });
        rendered.forEach((b, i) => {
            const asset = chooseBuildingAsset(b, i), model = byId.get(asset.id)!;
            const w = b.x1 - b.x0, d = b.z1 - b.z0;
            const sx = w / Math.max(0.01, model.dimensions.x);
            const sy = b.h / Math.max(0.01, model.dimensions.y);
            const sz = d / Math.max(0.01, model.dimensions.z);
            const x = (b.x0 + b.x1) * 0.5, z = (b.z0 + b.z1) * 0.5;
            result.get(asset.id)!.push({ x, y: 0, z, sx, sy, sz, yaw: hash01(x, z) > 0.5 ? Math.PI : 0 });
        });
        const subway = [
            { x: 140, y: -4.1, z: -100, sx: 0.82, sy: 0.9, sz: 0.82, yaw: 0 },
            { x: -140, y: -4.1, z: 100, sx: 0.82, sy: 0.9, sz: 0.82, yaw: Math.PI },
            { x: 220, y: -4.1, z: -180, sx: 0.82, sy: 0.9, sz: 0.82, yaw: Math.PI / 2 },
            { x: -220, y: -4.1, z: -100, sx: 0.82, sy: 0.9, sz: 0.82, yaw: -Math.PI / 2 },
        ];
        return { groups: result, count: rendered.length, subway };
    }, [byId]);

    useEffect(() => {
        if (DBG) (window as any).__polyforkBuildings = {
            count: buckets.count,
            models: CITY_ASSETS.map((a) => a.id),
            instancesByModel: Object.fromEntries([...buckets.groups].map(([id, ps]) => [id, ps.length])),
            legacyCore: 'procedural center, Polyfork outer district',
            undergroundEntrances: buckets.subway.map((p) => ({ x: p.x, y: p.y, z: p.z })),
        };
    }, [buckets]);

    return <group name="polyfork-city-buildings">
        {CITY_ASSETS.map((asset) => {
            const model = byId.get(asset.id)!;
            const placements = buckets.groups.get(asset.id)!;
            return <InstancedAsset key={asset.id} prefix="polyfork-building" model={model} placements={placements} />;
        })}
        <InstancedAsset prefix="polyfork-underground-subway" model={byId.get('subway-entrance-c05ada')!} placements={buckets.subway} />
    </group>;
}

export function ParkGround() {
    const cx = (PARK.x0 + PARK.x1) * 0.5, cz = (PARK.z0 + PARK.z1) * 0.5;
    const terrain = useMemo(() => {
        const floor = new THREE.PlaneGeometry(PARK.x1 - PARK.x0, PARK.z1 - PARK.z0, 80, 80);
        floor.rotateX(-Math.PI / 2);
        const pa = floor.attributes.position;
        const colours = new Float32Array(pa.count * 3);
        const base = new THREE.Color('#63805b'), light = new THREE.Color('#7c9469'), dark = new THREE.Color('#506b4b'), color = new THREE.Color();
        for (let i = 0; i < pa.count; i++) {
            const x = cx + pa.getX(i), z = cz + pa.getZ(i);
            pa.setY(i, parkH(x, z));
            const n = Math.sin(x * 0.045 + 1) * Math.cos(z * 0.06) + 0.5 * Math.sin(x * 0.11 + z * 0.07 + 2);
            const q = Math.max(-1, Math.min(1, n * 1.1)) * 0.7;
            if (q >= 0) color.copy(base).lerp(light, q); else color.copy(base).lerp(dark, -q);
            colours.set([color.r, color.g, color.b], i * 3);
        }
        floor.setAttribute('color', new THREE.BufferAttribute(colours, 3));
        floor.computeVertexNormals();
        const path = new THREE.PlaneGeometry(8, 190, 2, 90);
        path.rotateX(-Math.PI / 2); path.rotateY(Math.atan(0.6));
        const pp = path.attributes.position;
        for (let i = 0; i < pp.count; i++) pp.setY(i, parkH(cx + pp.getX(i), cz + pp.getZ(i)) + 0.04);
        const src = path.getIndex()!, kept: number[] = [];
        for (let i = 0; i < src.count; i += 3) {
            const a = src.getX(i), b = src.getX(i + 1), c = src.getX(i + 2);
            const x = cx + (pp.getX(a) + pp.getX(b) + pp.getX(c)) / 3;
            const z = cz + (pp.getZ(a) + pp.getZ(b) + pp.getZ(c)) / 3;
            if (!isPondClearance(x, z, 0.6)) kept.push(a, b, c);
        }
        path.setIndex(kept);
        path.computeVertexNormals();
        return { floor, path };
    }, [cx, cz]);
    return <group name="park-ground">
        <mesh position={[cx, 0.05, cz]} geometry={terrain.floor} frustumCulled={false}>
            <meshLambertMaterial color="#ffffff" vertexColors />
        </mesh>
        <mesh position={[cx, 0.09, cz]} geometry={terrain.path} frustumCulled={false}>
            <meshLambertMaterial color="#b89865" />
        </mesh>
    </group>;
}

export function createVegetationPlacements() {
    const trees: Record<string, Placement[]> = Object.fromEntries(TREE_ASSETS.slice(0, -1).map((a) => [a.id, []]));
    const bushes: Placement[] = [];
    const cx = (PARK.x0 + PARK.x1) * 0.5, cz = (PARK.z0 + PARK.z1) * 0.5;
    const parkCycle = [
        'broadleaf-oak-997c22', 'birch-tree-181b33', 'tall-pine-tree-ab4108',
        'maple-tree-65fa12', 'cherry-tree-a710a9', 'palm-tree-a307da',
        'young-pine-0d7695', 'street-tree-0d33f3', 'cherry-blossom-tree-3f7ab7',
    ];
    const parkPoints: { x: number; z: number; scale: number; yaw: number }[] = [];
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 900 && parkPoints.length < 130; i++) {
        const x = PARK.x0 + 6 + rnd() * (PARK.x1 - PARK.x0 - 12);
        const z = PARK.z0 + 6 + rnd() * (PARK.z1 - PARK.z0 - 12);
        if (Math.hypot(x - cx, z - cz) < 54 || Math.abs((x - cx) - (z - cz) * 0.6) < 6) continue;
        if (isPondClearance(x, z, 5) || bridgeSurfaceAt(x, z) !== null || rnd() < 0.2) continue;
        parkPoints.push({ x, z, scale: 1.05 + rnd() * 0.38, yaw: rnd() * Math.PI * 2 });
    }
    parkPoints.forEach((p, i) => {
        const id = parkCycle[i % parkCycle.length];
        const height = id === 'palm-tree-a307da' || id.includes('pine') ? 1.18 : 1.08;
        trees[id].push({ x: p.x, y: parkH(p.x, p.z) + 0.03, z: p.z, sx: p.scale, sy: p.scale * height * (0.95 + (i % 5) * 0.025), sz: p.scale, yaw: p.yaw });
    });

    // Balanced Polyfork tree rows on both sides of selected streets; the old street trees are not rendered.
    const street = world.streetBlds
        .map((b, i) => ({ b, i, k: hash01(b.x0 * 13.37, b.z0 * 7.17) }))
        .sort((a, b) => a.k - b.k);
    const sideCycle = ['street-tree-0d33f3', 'palm-tree-a307da', 'tall-pine-tree-ab4108', 'maple-tree-65fa12', 'broadleaf-oak-997c22', 'birch-tree-181b33', 'young-pine-0d7695'];
    let streetCount = 0;
    for (let i = 0; i < street.length && streetCount < 112; i++) {
        const b = street[i].b;
        for (const side of [1, -1]) {
            if (streetCount >= 112) break;
            const x = side > 0 ? b.x1 + 2.5 : b.x0 - 2.5;
            const z = (b.z0 + b.z1) * 0.5 + (Math.floor(i / 3) % 2 ? 4 : -4);
            if (z < -214 || x < -390 || x > 390 || bridgeSurfaceAt(x, z) !== null || isPondClearance(x, z, 4)) continue;
            if (buildings.some((q) => x > q.x0 - 1.4 && x < q.x1 + 1.4 && z > q.z0 - 1.4 && z < q.z1 + 1.4)) continue;
            const id = sideCycle[streetCount % sideCycle.length], s = 0.95 + hash01(x, z) * 0.3;
            const height = id === 'palm-tree-a307da' || id.includes('pine') ? 1.18 : 1.06;
            trees[id].push({ x, y: parkH(x, z) + 0.02, z, sx: s, sy: s * height, sz: s, yaw: hash01(z, x) * Math.PI * 2 });
            streetCount++;
        }
    }

    // A mixed Polyfork grove around the pond, with blossoms and the bridge approach kept prominent and clear.
    const axisX = PARK_BRIDGE.axisX, axisZ = PARK_BRIDGE.axisZ;
    const pondCycle = ['cherry-blossom-tree-3f7ab7', 'broadleaf-oak-997c22', 'cherry-tree-a710a9', 'tall-pine-tree-ab4108', 'cherry-blossom-tree-3f7ab7', 'palm-tree-a307da', 'cherry-blossom-tree-3f7ab7', 'maple-tree-65fa12'];
    for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2 + 0.08;
        const x = PARK_POND.cx + Math.cos(a) * (PARK_POND.rx + 5 + (i % 3) * 0.6);
        const z = PARK_POND.cz + Math.sin(a) * (PARK_POND.rz + 4 + (i % 4) * 0.5);
        const dx = x - PARK_BRIDGE.x, dz = z - PARK_BRIDGE.z;
        const along = dx * axisX + dz * axisZ, across = -dx * axisZ + dz * axisX;
        if (Math.abs(across) < 4.2 && Math.abs(along) < PARK_BRIDGE.halfLength + PARK_BRIDGE.rampLength + 2) continue;
        const id = pondCycle[i % pondCycle.length];
        const s = 1.05 + hash01(x, z) * 0.35;
        const height = id === 'palm-tree-a307da' || id.includes('pine') ? 1.2 : id === 'cherry-blossom-tree-3f7ab7' ? 1.13 : 1.08;
        trees[id].push({ x, y: parkH(x, z) + 0.03, z, sx: s, sy: s * height, sz: s, yaw: hash01(z, x) * Math.PI * 2 });
    }

    // Rebuilt low Polyfork shrubs replace the scanned atlas bushes across the park and side streets.
    const bushCandidates = parkPoints.filter((p) => !isPondClearance(p.x, p.z, 5) && bridgeSurfaceAt(p.x, p.z) === null);
    for (let i = 0; i < Math.min(54, bushCandidates.length); i++) {
        const p = bushCandidates[(i * 7) % bushCandidates.length];
        const x = p.x + (hash01(i, p.z) - 0.5) * 4.4, z = p.z + (hash01(p.x, i) - 0.5) * 4.4;
        if (Math.abs((x - cx) - (z - cz) * 0.6) < 4 || isPondClearance(x, z, 4) || bridgeSurfaceAt(x, z) !== null) continue;
        const s = 0.55 + hash01(x, z) * 0.55;
        bushes.push({ x, y: parkH(x, z) + 0.03, z, sx: s, sy: s, sz: s, yaw: hash01(z, x) * Math.PI * 2 });
    }
    const streetShrubs = street.slice(0, 42);
    streetShrubs.forEach(({ b }, i) => {
        const x = (b.x0 + b.x1) * 0.5 + (i % 2 ? 1 : -1) * (b.x1 - b.x0) * 0.52;
        const z = (b.z0 + b.z1) * 0.5 + (i % 3 - 1) * 2.2;
        if (buildings.some((q) => x > q.x0 - 1 && x < q.x1 + 1 && z > q.z0 - 1 && z < q.z1 + 1)) return;
        const s = 0.55 + hash01(x, z) * 0.38;
        bushes.push({ x, y: parkH(x, z) + 0.03, z, sx: s, sy: s, sz: s, yaw: hash01(z, x) * Math.PI * 2 });
    });
    return { trees, bushes };
}

export function PolyforkForest() {
    const gltfs = useLoader(GLTFLoader, TREE_ASSETS.map((asset) => asset.url)) as GLTF[];
    const models = useMemo(() => TREE_ASSETS.map((asset, i) => prepareModel(asset.id, gltfs[i])), [gltfs]);
    const byId = useMemo(() => new Map(models.map((model) => [model.id, model])), [models]);
    const placements = useMemo(createVegetationPlacements, []);
    const treeCount = useMemo(() => Object.values(placements.trees).reduce((n, list) => n + list.length, 0), [placements]);

    useEffect(() => {
        if (DBG) (window as any).__polyforkVegetation = {
            trees: treeCount,
            bushes: placements.bushes.length,
            species: TREE_ASSETS.map((a) => a.id),
            instancesBySpecies: Object.fromEntries(Object.entries(placements.trees).map(([id, ps]) => [id, ps.length])),
        };
    }, [placements, treeCount]);

    return <group name="polyfork-vegetation">
        {TREE_ASSETS.slice(0, -1).map((asset) => <InstancedAsset
            key={asset.id}
            prefix="polyfork-tree"
            model={byId.get(asset.id)!}
            placements={placements.trees[asset.id]}
        />)}
        <InstancedAsset
            prefix="polyfork-bush"
            model={byId.get('round-bush-cd2ac0')!}
            placements={placements.bushes}
        />
    </group>;
}

function subdividePositions(source: THREE.BufferGeometry, levels = 2) {
    const src = source.index ? source.toNonIndexed() : source;
    const attr = src.getAttribute('position');
    let triangles: number[][] = [];
    for (let i = 0; i < attr.count; i += 3) {
        triangles.push([
            attr.getX(i), attr.getY(i), attr.getZ(i),
            attr.getX(i + 1), attr.getY(i + 1), attr.getZ(i + 1),
            attr.getX(i + 2), attr.getY(i + 2), attr.getZ(i + 2),
        ]);
    }
    for (let level = 0; level < levels; level++) {
        const next: number[][] = [];
        const mid = (a: number[], b: number[]) => [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5];
        const push = (a: number[], b: number[], c: number[]) => next.push([...a, ...b, ...c]);
        for (const tri of triangles) {
            const a = tri.slice(0, 3), b = tri.slice(3, 6), c = tri.slice(6, 9);
            const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
            push(a, ab, ca); push(ab, b, bc); push(ca, bc, c); push(ab, bc, ca);
        }
        triangles = next;
    }
    const positions = new Float32Array(triangles.length * 9);
    triangles.forEach((tri, i) => positions.set(tri, i * 9));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    if (src !== source) src.dispose();
    return geometry;
}

function shorelineFoamGeometry(rx: number, rz: number) {
    const segments = 240, positions: number[] = [], uvs: number[] = [], indices: number[] = [];
    for (let i = 0; i <= segments; i++) {
        const u = i / segments, a = u * Math.PI * 2;
        const jitter = 1 + 0.018 * Math.sin(a * 9 + 0.7) + 0.012 * Math.sin(a * 17 + 1.9);
        for (const edge of [-1, 1]) {
            const w = edge * (0.23 + 0.04 * Math.sin(a * 11));
            positions.push(Math.cos(a) * (rx * jitter + w), 0, Math.sin(a) * (rz * jitter + w));
            uvs.push(u, edge > 0 ? 1 : 0);
        }
        if (i < segments) {
            const k = i * 2;
            indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    return geometry;
}

function rampGeometry(sign: -1 | 1) {
    const segments = 12, positions: number[] = [], indices: number[] = [];
    const px = -PARK_BRIDGE.axisZ, pz = PARK_BRIDGE.axisX;
    for (let i = 0; i <= segments; i++) {
        const t = PARK_BRIDGE.halfLength + (PARK_BRIDGE.rampLength * i / segments);
        const along = sign * t;
        const x = PARK_BRIDGE.x + PARK_BRIDGE.axisX * along, z = PARK_BRIDGE.z + PARK_BRIDGE.axisZ * along;
        const leftX = x - px * 1.15, leftZ = z - pz * 1.15;
        const rightX = x + px * 1.15, rightZ = z + pz * 1.15;
        const bridgeY = bridgeSurfaceAt(x, z) ?? parkH(x, z);
        positions.push(leftX, bridgeY + 0.025, leftZ, rightX, bridgeY + 0.025, rightZ);
        if (i < segments) {
            const k = i * 2;
            indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    return geometry;
}

const LAKE_VS = `uniform float uTime; uniform mat4 textureMatrix; varying vec3 vWorld; varying vec3 vNormal; varying float vHeight; varying vec4 vProjective; varying vec4 vScreen;
float wh(vec2 p,float t){return 0.09*sin(p.x*0.11+p.y*0.08+t*0.42)+0.035*sin(p.x*0.21-p.y*0.16-t*0.31);}
void main(){vec4 w=modelMatrix*vec4(position,1.0);float h=wh(w.xz,uTime);vec2 g=vec2(0.0099*cos(w.x*0.11+w.z*0.08+uTime*0.42)+0.00735*cos(w.x*0.21-w.z*0.16-uTime*0.31),0.0072*cos(w.x*0.11+w.z*0.08+uTime*0.42)-0.0056*cos(w.x*0.21-w.z*0.16-uTime*0.31));w.y+=h;vWorld=w.xyz;vHeight=h;vNormal=normalize(vec3(-g.x,1.0,-g.y));vProjective=textureMatrix*vec4(position,1.0);vScreen=projectionMatrix*viewMatrix*w;gl_Position=vScreen;}`;
const LAKE_FS = `uniform float uTime; uniform float uDebugReflect; uniform sampler2D tDiffuse; uniform sampler2D uRefraction; uniform vec3 color; uniform vec2 uPondCenter; uniform vec2 uPondRadii; varying vec3 vWorld; varying vec3 vNormal; varying float vHeight; varying vec4 vProjective; varying vec4 vScreen;
void main(){vec3 V=normalize(cameraPosition-vWorld);vec3 N=normalize(vNormal);bool below=!gl_FrontFacing;if(below)N=-N;float ci=clamp(abs(dot(N,V)),0.0,1.0);float fres=0.14+0.84*pow(1.0-ci,5.0);vec3 td=refract(-V,N,below?1.333:0.75019);vec2 screenUv=vScreen.xy/max(vScreen.w,0.0001)*0.5+0.5;vec2 bend=(N.xz+td.xz*0.08)*0.012;vec3 behind=texture2D(uRefraction,clamp(screenUv+bend,vec2(0.002),vec2(0.998))).rgb;vec4 ruv=vProjective;ruv.xy+=N.xz*0.012*ruv.w;vec3 reflected=texture2DProj(tDiffuse,ruv).rgb;if(uDebugReflect>0.5){gl_FragColor=vec4(reflected,1.0);return;}float radial=length((vWorld.xz-uPondCenter)/uPondRadii);float shallow=1.0-smoothstep(0.42,0.98,radial);float path=mix(3.7,0.28,shallow)/max(abs(td.y),0.22);vec3 transmittance=exp(-vec3(0.42,0.095,0.035)*path);vec3 bedTint=mix(vec3(0.045,0.16,0.19),vec3(0.34,0.43,0.35),shallow);vec3 transmitted=behind*transmittance+bedTint*(1.0-transmittance)*0.72;vec3 baseWater=mix(vec3(0.055,0.27,0.34),vec3(0.18,0.48,0.46),shallow);transmitted=mix(baseWater,transmitted,0.36);float broad=0.5+0.5*sin(vWorld.x*0.17+vWorld.z*0.11+uTime*0.38);transmitted+=vec3(0.025,0.075,0.065)*broad*(1.0-shallow);float f=below?max(fres,0.12):fres;vec3 col=mix(transmitted,reflected,f);vec3 R=reflect(-V,N);col+=vec3(1.0,0.89,0.67)*(pow(max(dot(R,normalize(vec3(-0.36,0.82,0.44))),0.0),96.0)*0.34+pow(max(dot(R,normalize(vec3(-0.36,0.82,0.44))),0.0),24.0)*0.05);if(below){float haze=1.0-exp(-length(cameraPosition-vWorld)*0.045);col=mix(col,vec3(0.035,0.23,0.30),haze*0.72);}float crest=smoothstep(0.12,0.18,vHeight)*0.12;col=mix(col,vec3(0.86,0.96,0.92),crest);gl_FragColor=vec4(col,1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
const LAKE_CAUSTICS_VS = `varying vec2 vUv; varying vec3 vWorld; void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.0);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;
const LAKE_CAUSTICS_FS = `uniform float uTime; uniform float uWaterY; varying vec2 vUv; varying vec3 vWorld;float c(vec2 p){vec2 q=p;float v=0.0;for(int i=0;i<3;i++){q+=vec2(sin(q.y*1.3+uTime*0.55),cos(q.x*1.15-uTime*0.48))*0.42;v+=1.0-abs(sin(q.x)+sin(q.y))*0.5;}return pow(clamp(v/3.0,0.0,1.0),5.0);}void main(){vec2 p=vWorld.xz*0.78;float k=c(p)+0.55*c(p*1.63+2.1);float edge=1.0-smoothstep(0.68,1.0,length((vUv-0.5)*2.0));float under=1.0-smoothstep(uWaterY-0.35,uWaterY+0.15,cameraPosition.y);float a=edge*under*clamp(k*0.42,0.0,0.58);vec3 sand=mix(vec3(0.34,0.46,0.37),vec3(0.77,0.87,0.65),clamp(k,0.0,1.0));gl_FragColor=vec4(sand,a);}`;

const FOAM_VS = `uniform float uTime; varying vec2 vUv; void main(){ vUv=uv; vec3 p=position; p.y+=0.016*sin(uv.x*35.0+uTime*1.3); gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); }`;
const FOAM_FS = `uniform float uTime; varying vec2 vUv; float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);} void main(){ float n=sin(vUv.x*151.0+uTime*1.8)*0.42+sin(vUv.x*67.0-uTime*1.1)*0.33+sin(vUv.x*311.0+vUv.y*6.0+uTime*2.7)*0.25; float fleck=smoothstep(-0.18,0.52,n+h(vec2(floor(vUv.x*85.0),floor(uTime*2.0)))*0.28); float edge=smoothstep(0.02,0.28,vUv.y)*(1.0-smoothstep(0.74,1.0,vUv.y)); float a=fleck*edge*(0.18+0.68*(0.5+0.5*sin(vUv.x*31.0-uTime*1.4))); gl_FragColor=vec4(vec3(0.83,0.95,0.92),a); }`;
const CONTACT_VS = `varying vec2 vUv; void main(){vUv=uv;vec4 w=modelMatrix*instanceMatrix*vec4(position,1.0);gl_Position=projectionMatrix*viewMatrix*w;}`;
const CONTACT_FS = `uniform float uTime; varying vec2 vUv; void main(){float r=length(vUv-0.5);float ring=smoothstep(0.30,0.42,r)*(1.0-smoothstep(0.14,0.25,r));float wave=0.58+0.42*sin(atan(vUv.y-0.5,vUv.x-0.5)*17.0+uTime*2.2);float fleck=smoothstep(0.12,0.6,sin(vUv.x*71.0+vUv.y*39.0+uTime*1.7)*0.5+0.5);gl_FragColor=vec4(0.86,0.97,0.94,ring*wave*fleck*0.72);}`;

function buildContactMatrices() {
    const matrices: THREE.Matrix4[] = [];
    const object = new THREE.Object3D();
    const perpX = -PARK_BRIDGE.axisZ, perpZ = PARK_BRIDGE.axisX;
    for (let i = 0; i <= PARK_BRIDGE.modules; i++) {
        const along = -PARK_BRIDGE.halfLength + i * (2 * PARK_BRIDGE.halfLength / PARK_BRIDGE.modules);
        const cx = PARK_BRIDGE.x + PARK_BRIDGE.axisX * along, cz = PARK_BRIDGE.z + PARK_BRIDGE.axisZ * along;
        for (const side of [-1, 1]) {
            object.position.set(cx + perpX * side * 0.72, PARK_POND_Y + 0.03, cz + perpZ * side * 0.72);
            object.rotation.set(-Math.PI / 2, 0, 0);
            object.scale.set(1.2, 0.78, 1);
            object.updateMatrix(); matrices.push(object.matrix.clone());
        }
    }
    return matrices;
}

export function PolyforkLakeBridge({ sim }: { sim: Sim }) {
    const [waterGLTF, bridgeGLTF] = useLoader(GLTFLoader, [WATER_ASSET.url, BRIDGE_ASSET.url]) as GLTF[];
    const waterModel = useMemo(() => prepareModel(WATER_ASSET.id, waterGLTF), [waterGLTF]);
    const bridgeModel = useMemo(() => prepareModel(BRIDGE_ASSET.id, bridgeGLTF), [bridgeGLTF]);
    const waterGeometry = useMemo(() => subdividePositions(waterModel.parts[0].geometry, 2), [waterModel]);
    const waterScale = useMemo<[number, number, number]>(() => [
        (PARK_POND.rx * 2) / Math.max(0.01, waterModel.dimensions.x),
        1,
        (PARK_POND.rz * 2) / Math.max(0.01, waterModel.dimensions.z),
    ], [waterModel]);
    const { gl, scene, camera } = useThree();
    const captureFrame = useRef(0), lakeClock = useRef(0), lastRefractionTime = useRef(-100), lastRefractionFrame = useRef(-100), lastReflectionTime = useRef(-100), lastReflectionFrame = useRef(-100);
    const refractionTarget = useMemo(() => new THREE.WebGLRenderTarget(256, 128, { depthBuffer: true, stencilBuffer: false, samples: 0 }), []);
    const reflector = useMemo(() => {
        const geometry = waterGeometry.clone();
        geometry.rotateX(Math.PI / 2); // Reflector's local normal is +Z; this rotation restores the original horizontal XZ sheet.
        const mirror = new Reflector(geometry, { textureWidth: 256, textureHeight: 128, clipBias: 0.003, multisample: 0, color: 0x799a98 });
        mirror.name = 'polyfork-water-blob-lake';
        mirror.position.set(PARK_POND.cx, PARK_POND_Y, PARK_POND.cz);
        mirror.rotation.x = -Math.PI / 2;
        mirror.scale.set(waterScale[0], waterScale[2], 1);
        mirror.userData.polyforkId = WATER_ASSET.id;
        const material = mirror.material as THREE.ShaderMaterial;
        material.vertexShader = LAKE_VS; material.fragmentShader = LAKE_FS;
        material.uniforms.uTime = { value: 0 }; material.uniforms.uDebugReflect = { value: 0 };
        material.uniforms.uRefraction = { value: refractionTarget.texture };
        material.uniforms.uPondCenter = { value: new THREE.Vector2(PARK_POND.cx, PARK_POND.cz) };
        material.uniforms.uPondRadii = { value: new THREE.Vector2(PARK_POND.rx, PARK_POND.rz) };
        material.side = THREE.DoubleSide; material.transparent = false; material.depthWrite = true; material.toneMapped = false; material.needsUpdate = true;
        const renderReflection = mirror.onBeforeRender;
        mirror.onBeforeRender = (renderer, renderScene, renderCamera, geometryArg, materialArg, group) => {
            if (lakeClock.current - lastReflectionTime.current < 0.5) return;
            renderReflection.call(mirror, renderer, renderScene, renderCamera, geometryArg, materialArg, group);
            lastReflectionTime.current = lakeClock.current; lastReflectionFrame.current = captureFrame.current;
        };
        return mirror;
    }, [waterGeometry, waterScale, refractionTarget]);
    const causticsGeometry = useMemo(() => new THREE.CircleGeometry(1, 64), []);
    const causticsMaterial = useMemo(() => new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uWaterY: { value: PARK_POND_Y } },
        vertexShader: LAKE_CAUSTICS_VS, fragmentShader: LAKE_CAUSTICS_FS,
        transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }), []);
    const shoreGeo = useMemo(() => shorelineFoamGeometry(PARK_POND.rx * 0.99, PARK_POND.rz * 0.99), []);
    const shoreMaterial = useMemo(() => new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } }, vertexShader: FOAM_VS, fragmentShader: FOAM_FS,
        transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }), []);
    const contactGeo = useMemo(() => new THREE.RingGeometry(0.2, 0.38, 18, 1), []);
    const contactMaterial = useMemo(() => new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } }, vertexShader: CONTACT_VS, fragmentShader: CONTACT_FS,
        transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }), []);
    const rampGeometries = useMemo(() => [rampGeometry(-1), rampGeometry(1)], []);
    const bridgePlacements = useMemo<Placement[]>(() => {
        const arr: Placement[] = [];
        for (let i = 0; i < PARK_BRIDGE.modules; i++) {
            const along = -PARK_BRIDGE.halfLength + (i + 0.5) * (2 * PARK_BRIDGE.halfLength / PARK_BRIDGE.modules);
            arr.push({
                x: PARK_BRIDGE.x + PARK_BRIDGE.axisX * along,
                y: PARK_POND_Y,
                z: PARK_BRIDGE.z + PARK_BRIDGE.axisZ * along,
                sx: 1, sy: 1, sz: 1, yaw: PARK_BRIDGE.yaw,
            });
        }
        return arr;
    }, []);
    const contacts = useMemo(buildContactMatrices, []);
    const contactRef = useRef<THREE.InstancedMesh>(null!);
    useFrame(() => {
        const t = sim.t;
        captureFrame.current++; lakeClock.current = t;
        (reflector.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
        shoreMaterial.uniforms.uTime.value = t;
        contactMaterial.uniforms.uTime.value = t;
        causticsMaterial.uniforms.uTime.value = t;
        if (Math.hypot(camera.position.x - PARK_POND.cx, camera.position.z - PARK_POND.cz) < 90 && t - lastRefractionTime.current >= 0.5) {
            const previousTarget = gl.getRenderTarget(), previousAutoClear = gl.autoClear;
            const previousXr = gl.xr.enabled, previousShadows = gl.shadowMap.autoUpdate, wasVisible = reflector.visible;
            try {
                reflector.visible = false; gl.xr.enabled = false; gl.shadowMap.autoUpdate = false; gl.autoClear = true;
                gl.setRenderTarget(refractionTarget); gl.clear(true, true, true); gl.render(scene, camera);
            } finally {
                gl.setRenderTarget(previousTarget); gl.autoClear = previousAutoClear;
                gl.xr.enabled = previousXr; gl.shadowMap.autoUpdate = previousShadows; reflector.visible = wasVisible;
            }
            lastRefractionTime.current = t; lastRefractionFrame.current = captureFrame.current;
        }
        if (contactRef.current && !contactRef.current.userData.matricesReady) {
            contacts.forEach((matrix, i) => contactRef.current.setMatrixAt(i, matrix));
            contactRef.current.count = contacts.length;
            contactRef.current.instanceMatrix.needsUpdate = true;
            contactRef.current.computeBoundingSphere();
            contactRef.current.userData.matricesReady = true;
        }
    });
    useEffect(() => {
        if (DBG) (window as any).__polyforkLake = {
            water: WATER_ASSET.id, bridge: BRIDGE_ASSET.id, reflection: '256x128 throttled planar scene capture', refraction: '256x128 distorted screen-space scene capture', caustics: 'animated lakebed shader', lakeDepth: 3.8,
            subdividedWaterTriangles: (waterGeometry.getAttribute('position').count / 3),
            bridgeModules: bridgePlacements.length,
            contactFoamPatches: contacts.length,
            bridgeDeckY: PARK_BRIDGE.deckY,
            bridgeCenter: [PARK_BRIDGE.x, PARK_BRIDGE.z],
            bridgeAxis: [PARK_BRIDGE.axisX, PARK_BRIDGE.axisZ],
            bridgeHalfLength: PARK_BRIDGE.halfLength,
            bridgeHalfWidth: PARK_BRIDGE.halfWidth,
            bridgeRampLength: PARK_BRIDGE.rampLength,
        };
        if (DBG) (window as any).__bridgeSurfaceAt = bridgeSurfaceAt;
        if (DBG) (window as any).__polyforkLakeSurface = reflector;
        if (DBG) (window as any).__polyforkLakeTargets = { renderer: gl, refraction: refractionTarget, reflection: reflector.getRenderTarget(), frame: captureFrame, reflectionFrame: lastReflectionFrame };
    }, [bridgePlacements.length, contacts.length, waterGeometry]);



    return <group name="polyfork-lake-and-bridge">
        <primitive object={reflector} dispose={null} />
        <mesh
            name="polyfork-lakebed-caustics"
            position={[PARK_POND.cx, parkH(PARK_POND.cx, PARK_POND.cz) + 0.08, PARK_POND.cz]}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={[PARK_POND.rx * 0.94, PARK_POND.rz * 0.94, 1]}
            geometry={causticsGeometry}
            material={causticsMaterial}
            frustumCulled={false}
        />
        <mesh
            name="polyfork-shore-intersection-foam"
            position={[PARK_POND.cx, PARK_POND_Y + 0.045, PARK_POND.cz]}
            geometry={shoreGeo}
            material={shoreMaterial}
            frustumCulled={false}
        />
        <group name="polyfork-creek-footbridge">
            {bridgeModel.parts.map((part, index) => <instancedMesh
                key={index}
                name={`polyfork-footbridge-${index}`}
                args={[part.geometry, part.material, bridgePlacements.length]}
                ref={(mesh) => {
                    if (!mesh) return;
                    const object = new THREE.Object3D();
                    bridgePlacements.forEach((p, i) => {
                        object.position.set(p.x, p.y, p.z);
                        object.rotation.set(0, p.yaw, 0); object.scale.set(p.sx, p.sy, p.sz); object.updateMatrix();
                        mesh.setMatrixAt(i, object.matrix);
                    });
                    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
                }}
                dispose={null}
            />)}
        </group>
        {rampGeometries.map((geometry, i) => <mesh key={i} name={`polyfork-bridge-approach-ramp-${i}`} geometry={geometry} frustumCulled={false}>
            <meshStandardMaterial color="#aa8b5c" roughness={0.95} metalness={0} />
        </mesh>)}
        <instancedMesh
            ref={contactRef}
            name="polyfork-bridge-object-intersection-foam"
            args={[contactGeo, contactMaterial, contacts.length]}
            frustumCulled={false}
            dispose={null}
        />
    </group>;
}
