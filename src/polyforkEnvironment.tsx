import { worldBufferSize } from './heroHD';
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { QUALITY, QK, LOWQ } from './quality';
import {
    buildings, world, PARK, parkH, PARK_POND, PARK_POND_Y, PARK_BRIDGE,
    bridgeSurfaceAt, isLegacyCityCore, LAKE_SHORE, BEACH_DIR, type Sim,
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


// env-iter1 sand zone: grass -> dry sand -> wet sand -> lakebed, computed per pixel from the same shape as sim.sandWeight
// (crisp, noisy edge independent of the terrain grid; no textures). Refs: real lake beaches (Lake Tahoe Sand Harbor,
// Lake Wanaka) and stylised beaches (Zelda: BotW Lurelin, Genshin Liyue coast) cited in the iteration report.
const SAND_GLSL = `
float sHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float sNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(sHash(i),sHash(i+vec2(1,0)),f.x),mix(sHash(i+vec2(0,1)),sHash(i+vec2(1,1)),f.x),f.y);}
`;
function sandShader(sh: any) {
    sh.vertexShader = 'varying vec3 vSandW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSandW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'varying vec3 vSandW;\n' + SAND_GLSL + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
    {
        vec2 dp = vSandW.xz - vec2(${PARK_POND.cx.toFixed(2)}, ${PARK_POND.cz.toFixed(2)}); float d = length(dp);
        if (d < 46.0) {
            float da = atan(dp.y, dp.x) - (${BEACH_DIR.toFixed(5)}); da = atan(sin(da), cos(da));
            float wide = 1.0 - smoothstep(0.0, 1.15, abs(da));
            float shoreR = ${(PARK_POND.rx * LAKE_SHORE).toFixed(3)};
            float edge = shoreR + 2.4 + 11.0 * wide + 0.9 * sin(vSandW.x * 0.37 + vSandW.z * 0.21) + 0.6 * sin(vSandW.x * 0.83 - vSandW.z * 0.67);
            float n1 = sNoise(vSandW.xz * 0.9), n2 = sNoise(vSandW.xz * 3.7), n3 = sNoise(vSandW.xz * 17.0);
            float sw = 1.0 - smoothstep(edge - 1.4, edge + 0.4, d + (n1 - 0.5) * 1.6);
            float wetk = 1.0 - smoothstep(shoreR + 0.1, shoreR + 2.0 + n1, d);
            float ripple = 0.5 + 0.5 * sin(d * 2.4 + n2 * 2.5 + n1 * 3.0);
            vec3 dry = mix(vec3(0.70, 0.56, 0.34), vec3(0.82, 0.68, 0.44), n1) * (0.93 + 0.1 * ripple * wide);
            vec3 wet = vec3(0.42, 0.35, 0.23);
            vec3 sandC = mix(dry, wet, wetk);
            sandC = mix(sandC, vec3(0.36, 0.34, 0.22), 1.0 - smoothstep(shoreR - 4.0, shoreR - 0.2, d));
            sandC *= 0.9 + 0.12 * n2 + 0.1 * (n3 - 0.5);
            float grassEdge = sw * (1.0 - sw) * 4.0;
            diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 - 0.18 * grassEdge), sandC, sw);
        }
    }`).replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.a = 0.375;');   // env-iter3: park-ground class for the outline pass (grass blades do not ink against it)
}
// env-iter3: the trail joins the park-ground outline class too, so blades standing in front of it are not inked one by one
function landTag(sh: any) { sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.a = 0.375;'); }

export function ParkGround() {
    const cx = (PARK.x0 + PARK.x1) * 0.5, cz = (PARK.z0 + PARK.z1) * 0.5;
    const terrain = useMemo(() => {
        const floor = new THREE.PlaneGeometry(PARK.x1 - PARK.x0, PARK.z1 - PARK.z0, 144, 144);
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
            <meshLambertMaterial color="#ffffff" vertexColors onBeforeCompile={sandShader} />
        </mesh>
        <mesh position={[cx, 0.09, cz]} geometry={terrain.path} frustumCulled={false}>
            <meshLambertMaterial color="#b89865" onBeforeCompile={landTag} />
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

// env-iter1 lake (Shifat's direction, Oct 29): hybrid reflections/refraction.
// - Hero: analytic ray trace of a 3-sphere proxy against the reflected and refracted view rays (no extra pass).
// - Everything else: short screen-space reflection march + one distorted screen-space refraction sample, read from a low-res
//   opaque scene copy (colour + depth) that is only re-rendered while the lake is on screen. Quarter-res / 7 steps on auto,
//   half-res / 16 steps on high, none on ?q=low or when the adaptive scaler is struggling (then: analytic sky reflection +
//   depth-based absorption with alpha so the real lakebed shows through).
// - Always: Schlick Fresnel with F0 = ((1.33-1)/(1.33+1))^2 ~ 0.02, refract(v, n, 1/1.33), animated ripple normals,
//   depth colour gradient, shoreline blend (transmission -> 1 as depth -> 0).
// Refs: three.js transmission pass approach; Morgan McGuire & Mara, "Efficient GPU Screen-Space Ray Tracing" (JCGT 2014);
//   Inigo Quilez sphere intersection; Schlick 1994.
const LAKE_VS = `uniform float uTime; varying vec3 vWorld; varying vec3 vNormal; varying float vHeight; varying vec4 vScreen; varying vec3 vView;
void main(){vec4 w=modelMatrix*vec4(position,1.0);float a1=w.x*0.11+w.z*0.08+uTime*0.42,a2=w.x*0.21-w.z*0.16-uTime*0.31;float h=0.09*sin(a1)+0.035*sin(a2);
vec2 g=vec2(0.0099*cos(a1)+0.00735*cos(a2),0.0072*cos(a1)-0.0056*cos(a2));w.y+=h;vWorld=w.xyz;vHeight=h;vNormal=normalize(vec3(-g.x,1.0,-g.y));
vec4 mv=viewMatrix*w;vView=mv.xyz;vScreen=projectionMatrix*mv;gl_Position=vScreen;}`;
const LAKE_FS = `#include <packing>
uniform float uTime; uniform sampler2D tScene; uniform sampler2D tDepth; uniform float uUseScene; uniform float uSteps; uniform float uNear; uniform float uFar;
uniform mat4 uProj; uniform vec2 uPondCenter; uniform float uPondR; uniform float uShore; uniform vec3 uHero; uniform vec3 uHor; uniform vec3 uZen; uniform vec3 uSun; uniform float uDay;
varying vec3 vWorld; varying vec3 vNormal; varying float vHeight; varying vec4 vScreen; varying vec3 vView;
float sceneZ(vec2 uv){return perspectiveDepthToViewZ(texture2D(tDepth,uv).x,uNear,uFar);}
float sph(vec3 ro,vec3 rd,vec4 s){vec3 oc=ro-s.xyz;float b=dot(oc,rd);float h=b*b-dot(oc,oc)+s.w*s.w;if(h<0.0)return 1e5;float t=-b-sqrt(h);return t>0.0?t:1e5;}
float hero(vec3 ro,vec3 rd,out vec3 n){vec4 s0=vec4(uHero+vec3(0.0,0.1,0.0),0.36),s1=vec4(uHero+vec3(0.0,0.66,0.0),0.19),s2=vec4(uHero+vec3(0.0,-0.5,0.0),0.27);
float t0=sph(ro,rd,s0),t1=sph(ro,rd,s1),t2=sph(ro,rd,s2);float t=min(t0,min(t1,t2));vec4 s=t==t0?s0:(t==t1?s1:s2);n=normalize(ro+rd*t-s.xyz);return t;}
vec3 heroCol(vec3 n){return vec3(0.025,0.022,0.04)+vec3(0.10,0.09,0.16)*max(n.y,0.0)*uDay+vec3(0.18,0.10,0.32)*pow(1.0-abs(n.y),3.0)*0.35;}
vec3 sky(vec3 R){float h=max(R.y,0.0);vec3 c=mix(uHor,uZen,pow(h,0.5));c=mix(c,vec3(0.06,0.11,0.07)*(0.2+0.8*uDay),(1.0-smoothstep(0.02,0.16,h))*0.85);float s=max(dot(R,uSun),0.0);return c+vec3(1.0,0.88,0.66)*(pow(s,600.0)*3.5+pow(s,10.0)*0.12)*uDay;}
vec2 rip(vec2 p,vec2 d,float f,float sp,float a){float ph=dot(p,d)*f+uTime*sp;return d*(cos(ph)*a*f);}
void main(){
 vec3 V=normalize(cameraPosition-vWorld);bool below=!gl_FrontFacing;float dist=length(cameraPosition-vWorld);
 float rf=1.0-smoothstep(22.0,75.0,dist);vec2 p=vWorld.xz;
 vec2 g=rip(p,vec2(0.80,0.60),1.9,1.35,0.020)+rip(p,vec2(-0.55,0.83),2.7,-1.7,0.013)+rip(p,vec2(0.97,-0.24),4.3,2.3,0.006)+rip(p,vec2(-0.2,-0.98),6.1,-2.9,0.0035);
 vec3 N=normalize(vNormal+vec3(-g.x,0.0,-g.y)*rf);if(below)N=-N;
 float ci=clamp(dot(N,V),0.0,1.0);float F=0.02+0.98*pow(1.0-ci,5.0);
 vec3 R=reflect(-V,N);vec3 Td=refract(-V,N,below?1.33:1.0/1.33);
 float radial=length(vWorld.xz-uPondCenter)/uPondR;float bedDepth=3.25*(1.0-smoothstep(uShore-0.32,uShore,radial))+0.02*(1.0-smoothstep(uShore-0.04,uShore,radial));
 float shallow=1.0-smoothstep(0.15,2.2,bedDepth);
 vec2 suv=vScreen.xy/vScreen.w*0.5+0.5;float wz=vView.z;
 // reflection
 vec3 refl=sky(R);float reflDist=1e5;
  if(uUseScene>0.5&&!below){vec3 Rv=normalize((viewMatrix*vec4(R,0.0)).xyz);float tp=0.0;
  for(int i=0;i<16;i++){if(float(i)>=uSteps)break;float k=(float(i)+1.0)/uSteps;float t=90.0*k*k;vec3 Q=vView+Rv*t;vec4 c=uProj*vec4(Q,1.0);if(c.w<=0.0)break;vec2 uv=c.xy/c.w*0.5+0.5;
   if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0)break;float sz=sceneZ(uv);if(Q.z<sz&&Q.z>sz-(t-tp)*1.2-0.6&&sz>-uFar*0.98){
    if(uSteps>12.0){float a0=tp,a1=t;for(int j=0;j<4;j++){float m=0.5*(a0+a1);vec3 M=vView+Rv*m;vec4 cm=uProj*vec4(M,1.0);vec2 um=cm.xy/cm.w*0.5+0.5;if(M.z<sceneZ(um)){a1=m;uv=um;}else a0=m;}}
    float e=smoothstep(0.0,0.1,uv.x)*(1.0-smoothstep(0.9,1.0,uv.x))*(1.0-smoothstep(0.82,1.0,uv.y))*smoothstep(0.0,0.08,uv.y);refl=mix(refl,texture2D(tScene,uv).rgb,e);reflDist=t;break;}
   tp=t;}}
 vec3 hn;float ht=hero(vWorld,R,hn);if(ht<min(reflDist,60.0))refl=heroCol(hn);
 // refraction / transmission
 vec3 deepCol=mix(vec3(0.010,0.07,0.13),vec3(0.03,0.20,0.22),shallow)*mix(0.25,1.0,uDay);vec3 absorb=vec3(0.80,0.30,0.20);
 vec3 trans;float alpha=1.0;
 if(uUseScene>0.5&&!below){float dd=max(wz-sceneZ(suv),0.0);vec3 Nv=(viewMatrix*vec4(N,0.0)).xyz;vec2 uv2=suv+Nv.xy*0.05*clamp(dd*0.5,0.0,1.0);
  float sz2=sceneZ(uv2);if(sz2>wz){uv2=suv;sz2=sceneZ(suv);}float th=clamp(wz-sz2,0.0,12.0)*1.15;vec3 T=exp(-absorb*th);
  vec3 behind=texture2D(tScene,uv2).rgb;vec3 hn2;if(hero(vWorld,Td,hn2)<th+0.5)behind=mix(behind,heroCol(hn2),0.85);trans=behind*T+deepCol*(1.0-T);}
 else{float th=bedDepth/max(abs(Td.y),0.25);vec3 T=exp(-absorb*th);float Ts=clamp(dot(T,vec3(0.2,0.4,0.4)),0.0,1.0);
  vec3 hn2;float hk=hero(vWorld,Td,hn2)<th+0.5?0.85:0.0;trans=mix(deepCol*(1.0-T)/max(1.0-Ts,0.05),heroCol(hn2),hk);alpha=max(1.0-Ts*(1.0-hk),0.0);}
 float f=below?max(F,0.12):F;vec3 col=mix(trans,refl,f);
 if(alpha<1.0){col=(refl*f+trans*(1.0-f)*alpha)/max(f+(1.0-f)*alpha,0.001);alpha=f+(1.0-f)*alpha;}
 if(below){float haze=1.0-exp(-dist*0.045);col=mix(col,vec3(0.035,0.23,0.30),haze*0.72);alpha=1.0;}
 col=mix(col,vec3(0.86,0.96,0.92),smoothstep(0.12,0.18,vHeight)*0.10);
 gl_FragColor=vec4(col,alpha);
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

const _skyBlue = new THREE.Color(0.42, 0.6, 0.78);
export type LakeTod = { fog: THREE.Color; sky: THREE.Color; sun: THREE.Vector3; day: { value: number } };
export function PolyforkLakeBridge({ sim, perf, tod }: { sim: Sim; perf?: { scale: number }; tod?: LakeTod }) {
    const [bridgeGLTF] = useLoader(GLTFLoader, [BRIDGE_ASSET.url]) as GLTF[];
    const bridgeModel = useMemo(() => prepareModel(BRIDGE_ASSET.id, bridgeGLTF), [bridgeGLTF]);
    // circular lake sheet (polar grid so vertex waves have interior detail), unit diameter in XZ; its rim sits under the sandy bank.
    const waterGeometry = useMemo(() => { const g = new THREE.RingGeometry(0.0001, 0.5, 96, 14); g.rotateX(-Math.PI / 2); return g; }, []);
    const { gl, scene, camera } = useThree();
    const copyFrame = useRef(0), copies = useRef(0);
    // low-res opaque scene copy (colour + depth) for SSR + screen-space refraction; never allocated on ?q=low.
    const copyTarget = useMemo(() => {
        if (LOWQ) return null;
        const t = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: true, stencilBuffer: false, samples: 0, type: THREE.UnsignedByteType });
        t.depthTexture = new THREE.DepthTexture(4, 4); t.depthTexture.type = THREE.UnsignedIntType;
        t.texture.minFilter = t.texture.magFilter = THREE.LinearFilter; t.texture.generateMipmaps = false;
        return t;
    }, []);
    const water = useMemo(() => {
        const material = new THREE.ShaderMaterial({
            vertexShader: LAKE_VS, fragmentShader: LAKE_FS,
            uniforms: {
                uTime: { value: 0 }, tScene: { value: copyTarget ? copyTarget.texture : null }, tDepth: { value: copyTarget ? copyTarget.depthTexture : null },
                uUseScene: { value: 0 }, uSteps: { value: QK.lakeSteps }, uNear: { value: 0.1 }, uFar: { value: 1000 }, uProj: { value: new THREE.Matrix4() },
                uPondCenter: { value: new THREE.Vector2(PARK_POND.cx, PARK_POND.cz) }, uPondR: { value: PARK_POND.rx }, uShore: { value: LAKE_SHORE },
                uHero: { value: new THREE.Vector3(0, -999, 0) }, uHor: { value: new THREE.Color('#bcd3df') }, uZen: { value: new THREE.Color('#5b8fc4') },
                uSun: { value: new THREE.Vector3(-0.36, 0.82, 0.44).normalize() }, uDay: { value: 1 },
            },
            side: THREE.DoubleSide, transparent: true, depthWrite: true, toneMapped: false,
        });
        const mesh = new THREE.Mesh(waterGeometry, material);
        mesh.name = 'polyfork-water-blob-lake'; mesh.renderOrder = 2; mesh.frustumCulled = false;
        mesh.position.set(PARK_POND.cx, PARK_POND_Y, PARK_POND.cz); mesh.scale.set(PARK_POND.rx * 2, 1, PARK_POND.rz * 2);
        mesh.userData.polyforkId = WATER_ASSET.id;
        return mesh;
    }, [waterGeometry, copyTarget]);
    const frustum = useMemo(() => new THREE.Frustum(), []), projView = useMemo(() => new THREE.Matrix4(), []);
    const lakeSphere = useMemo(() => new THREE.Sphere(new THREE.Vector3(PARK_POND.cx, PARK_POND_Y, PARK_POND.cz), PARK_POND.rx + 1), []);
    const bufSize = useMemo(() => new THREE.Vector2(), []);
    const causticsGeometry = useMemo(() => new THREE.CircleGeometry(1, 64), []);
    const causticsMaterial = useMemo(() => new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uWaterY: { value: PARK_POND_Y } },
        vertexShader: LAKE_CAUSTICS_VS, fragmentShader: LAKE_CAUSTICS_FS,
        transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }), []);
    const shoreGeo = useMemo(() => shorelineFoamGeometry(PARK_POND.rx * LAKE_SHORE, PARK_POND.rz * LAKE_SHORE), []);
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
        const t = sim.t, u = water.material.uniforms;
        u.uTime.value = t;
        shoreMaterial.uniforms.uTime.value = t;
        contactMaterial.uniforms.uTime.value = t;
        causticsMaterial.uniforms.uTime.value = t;
        u.uHero.value.set(sim.pos[0], sim.pos[1], sim.pos[2]);
        if (tod) {
            const d = tod.day.value; u.uDay.value = d; u.uHor.value.copy(tod.fog).lerp(_skyBlue, 0.45).multiplyScalar(0.92);
            u.uZen.value.setRGB(0.30, 0.50, 0.78).multiplyScalar(0.12 + 0.88 * d).lerp(tod.sky, 0.25 * d); u.uSun.value.copy(tod.sun);
        }
        const cam = camera as THREE.PerspectiveCamera;
        u.uProj.value.copy(cam.projectionMatrix); u.uNear.value = cam.near; u.uFar.value = cam.far;
        // scene copy: only while the lake is on screen and close enough to matter; adaptive when the frame budget is tight.
        const scale = perf ? perf.scale : 1;
        projView.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); frustum.setFromProjectionMatrix(projView);
        const visible = frustum.intersectsSphere(lakeSphere) && cam.position.distanceTo(lakeSphere.center) < 170;
        const struggling = scale <= 0.5, everyOther = scale <= 0.6;
        copyFrame.current++;
        const wantCopy = !!copyTarget && visible && !struggling && (!everyOther || copyFrame.current % 2 === 0);
        if (copyTarget && visible && !struggling) {
            if (wantCopy) {
                worldBufferSize(gl, bufSize);   // world size (hero HD pass keeps the canvas at native)
                const w = Math.max(160, Math.round(bufSize.x * QK.lakeCopyScale)), h = Math.max(90, Math.round(bufSize.y * QK.lakeCopyScale));
                if (copyTarget.width !== w || copyTarget.height !== h) copyTarget.setSize(w, h);
                const previousTarget = gl.getRenderTarget(), previousAutoClear = gl.autoClear, previousShadows = gl.shadowMap.autoUpdate;
                try {
                    water.visible = false; gl.shadowMap.autoUpdate = false; gl.autoClear = true;
                    gl.setRenderTarget(copyTarget); gl.clear(true, true, true); gl.render(scene, camera);
                } finally {
                    gl.setRenderTarget(previousTarget); gl.autoClear = previousAutoClear; gl.shadowMap.autoUpdate = previousShadows; water.visible = true;
                }
                copies.current++;
            }
            u.uUseScene.value = 1;
        } else u.uUseScene.value = 0;
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
            tier: QUALITY.tier, gpu: QUALITY.gpu, copyScale: QK.lakeCopyScale, ssrSteps: QK.lakeSteps, copies, water,
            reflection: copyTarget ? 'SSR from low-res scene copy + analytic hero + sky' : 'analytic sky + analytic hero', refraction: copyTarget ? 'screen-space single sample' : 'depth absorption + alpha',
            waterTriangles: waterGeometry.index ? waterGeometry.index.count / 3 : waterGeometry.getAttribute('position').count / 3,
            bridgeModules: bridgePlacements.length, contactFoamPatches: contacts.length, bridgeDeckY: PARK_BRIDGE.deckY,
            bridgeCenter: [PARK_BRIDGE.x, PARK_BRIDGE.z], bridgeAxis: [PARK_BRIDGE.axisX, PARK_BRIDGE.axisZ],
            bridgeHalfLength: PARK_BRIDGE.halfLength, bridgeHalfWidth: PARK_BRIDGE.halfWidth, bridgeRampLength: PARK_BRIDGE.rampLength,
        };
        if (DBG) (window as any).__bridgeSurfaceAt = bridgeSurfaceAt;
    }, [bridgePlacements.length, contacts.length, waterGeometry, copyTarget, water]);

    return <group name="polyfork-lake-and-bridge">
        <primitive object={water} dispose={null} />
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
