import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { HQ, QUALITY } from '../quality';
import { HD } from '../heroHD';
import type { Sim } from '../sim';
import { TOD } from './env';

// Genuine geometry-based depth shadows for the existing WebGL renderer (not ray tracing).
// This renderer owns its color/depth passes, so the shadow depth pass is rendered separately.
const MAP_SIZE = HQ ? 2560 : (QUALITY.coarse || QUALITY.weakGpu ? 2048 : 2304);
const HALF_EXTENT = 64;
const LIGHT_DISTANCE = 700;
const LIGHT_FAR = 1800;
const SCAN_EVERY = 60;
const CASTER_LAYER = 30;
const CASTER_BIT = 1 << CASTER_LAYER;
const DBG = !!(import.meta as any).env.VITE_DBG;

function materialCanCast(material: THREE.Material) {
    const m = material as THREE.Material & { alphaTest?: number; opacity?: number };
    if (!m.visible || m.depthWrite === false) return false;
    if (m.transparent && (m.alphaTest ?? 0) < 0.05 && (m.opacity ?? 1) < 0.98) return false;
    return true;
}

type ActiveShadowState = {
    sim: Sim;
    light: THREE.DirectionalLight;
    target: THREE.WebGLRenderTarget;
    casterMeshes: THREE.Mesh[];
    depthMaterials: Map<THREE.Material, THREE.MeshDepthMaterial>;
    oldMap: THREE.RenderTarget | null;
    oldCastShadow: boolean;
    oldAutoUpdate: boolean;
    oldMapSize: THREE.Vector2;
    oldCamera: { left: number; right: number; top: number; bottom: number; near: number; far: number; layerMask: number };
    oldLightPosition: THREE.Vector3;
    oldTargetPosition: THREE.Vector3;
    targetAdded: boolean;
};

let activeShadowState: ActiveShadowState | null = null;
const _clearRead = new THREE.Color();
const _clearSaved = new THREE.Color();
const _sunDir = new THREE.Vector3();

function belongsToRegisteredHero(object: THREE.Object3D) {
    for (let node: THREE.Object3D | null = object; node; node = node.parent) if (HD.roots.has(node)) return true;
    return false;
}

function makeDepthMaterial(source: THREE.Material, cache: Map<THREE.Material, THREE.MeshDepthMaterial>) {
    let depth = cache.get(source);
    if (!depth) {
        depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.BasicDepthPacking });
        cache.set(source, depth);
        const sourceHook = (source as any).onBeforeCompile as ((shader: any, renderer: THREE.WebGLRenderer) => void) | undefined;
        const hookText = sourceHook?.toString() ?? '';
        if (sourceHook && /uTreeWindTime|leafWindShader/.test(hookText)) {
            // The depth pass must bend the same instanced foliage as the visible custom material.
            depth.onBeforeCompile = (shader, renderer) => sourceHook.call(source, shader, renderer);
            const sourceKey = (source as any).customProgramCacheKey?.call(source) ?? hookText;
            depth.customProgramCacheKey = () => `shadow-wind:${sourceKey}`;
        }
    }
    const m = source as THREE.Material & {
        map?: THREE.Texture | null; alphaMap?: THREE.Texture | null; alphaTest?: number;
        shadowSide?: THREE.Side | null; wireframe?: boolean; clippingPlanes?: THREE.Plane[] | null;
        clipIntersection?: boolean; displacementMap?: THREE.Texture | null;
        displacementScale?: number; displacementBias?: number;
    };
    depth.visible = materialCanCast(source);
    depth.side = m.shadowSide ?? (source.side === THREE.FrontSide ? THREE.BackSide : source.side === THREE.BackSide ? THREE.FrontSide : THREE.DoubleSide);
    depth.map = m.map ?? null;
    depth.alphaMap = m.alphaMap ?? null;
    depth.alphaTest = m.alphaTest ?? 0;
    depth.wireframe = m.wireframe ?? false;
    depth.clippingPlanes = m.clippingPlanes ?? null;
    depth.clipIntersection = m.clipIntersection ?? false;
    depth.displacementMap = m.displacementMap ?? null;
    depth.displacementScale = m.displacementScale ?? 1;
    depth.displacementBias = m.displacementBias ?? 0;
    return depth;
}

export function renderManualShadowMap(gl: THREE.WebGLRenderer, scene: THREE.Scene) {
    const state = activeShadowState;
    if (!state) return;
    const { light, target } = state;
    const shadow = light.shadow;
    const shadowCamera = shadow.camera as THREE.OrthographicCamera;

    // Keep Three.js's automatic shadow renderer out of the game's custom render-target pipeline.
    gl.shadowMap.enabled = false;
    light.castShadow = false;
    light.updateMatrixWorld(true);
    light.target.updateMatrixWorld(true);
    shadow.updateMatrices(light);
    shadowCamera.layers.set(CASTER_LAYER);
    target.depthTexture!.compareFunction = null;

    const oldTarget = gl.getRenderTarget();
    const oldAutoClear = gl.autoClear;
    const oldBackground = scene.background;
    const oldOverrideMaterial = scene.overrideMaterial;
    const oldClearAlpha = gl.getClearAlpha();
    _clearSaved.copy(gl.getClearColor(_clearRead));
    const originalMaterials: Array<[THREE.Mesh, THREE.Material | THREE.Material[], number]> = [];

    try {
        // Swap only the depth-pass materials; the original materials and scene state are restored below.
        for (const mesh of state.casterMeshes) {
            if (!mesh.visible || !mesh.parent) continue;
            // HeroHD retags character meshes every 30 frames. Temporarily add the shadow layer
            // for this depth draw only, then restore the exact layer mask before HeroHD renders.
            originalMaterials.push([mesh, mesh.material, mesh.layers.mask]);
            mesh.layers.mask |= CASTER_BIT;
            mesh.material = Array.isArray(mesh.material)
                ? mesh.material.map((m) => makeDepthMaterial(m, state.depthMaterials))
                : makeDepthMaterial(mesh.material, state.depthMaterials);
        }
        scene.background = null;
        scene.overrideMaterial = null;
        gl.autoClear = false;
        gl.setClearColor(0x000000, 0);
        gl.setRenderTarget(target);
        gl.clear(true, true, false);
        gl.render(scene, shadowCamera);
    } finally {
        for (const [mesh, material, mask] of originalMaterials) { mesh.material = material; mesh.layers.mask = mask; }
        scene.background = oldBackground;
        scene.overrideMaterial = oldOverrideMaterial;
        gl.autoClear = oldAutoClear;
        gl.setRenderTarget(oldTarget);
        gl.setClearColor(_clearSaved, oldClearAlpha);
    }

    if (DBG) (window as any).__shadowMapInfo = {
        enabled: true, casters: state.casterMeshes.length, size: MAP_SIZE, extent: HALF_EXTENT,
        method: 'manual-webgl-depth-shadow-map', rayTracing: false,
    };
}

export function ShadowMapSetup({ sim }: { sim: Sim }) {
    const { gl, scene } = useThree();
    const frame = useRef(0);
    const stateRef = useRef<ActiveShadowState | null>(null);
    const oldRenderer = useRef<{ enabled: boolean; type: THREE.ShadowMapType } | null>(null);

    useEffect(() => {
        oldRenderer.current = { enabled: gl.shadowMap.enabled, type: gl.shadowMap.type };
        gl.shadowMap.enabled = false;
        const light = scene.getObjectByName('sun1') as THREE.DirectionalLight | undefined;
        if (!light) return;

        const target = new THREE.WebGLRenderTarget(MAP_SIZE, MAP_SIZE, {
            format: THREE.RGBAFormat, type: THREE.UnsignedByteType,
            minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
            depthBuffer: true, stencilBuffer: false,
        });
        target.texture.colorSpace = THREE.NoColorSpace;
        target.texture.generateMipmaps = false;
        target.depthTexture = new THREE.DepthTexture(MAP_SIZE, MAP_SIZE, THREE.UnsignedIntType);
        target.depthTexture.format = THREE.DepthFormat;
        target.depthTexture.minFilter = THREE.NearestFilter;
        target.depthTexture.magFilter = THREE.NearestFilter;
        target.depthTexture.compareFunction = null;

        const shadow = light.shadow;
        const shadowCamera = shadow.camera as THREE.OrthographicCamera;
        const targetAdded = light.target.parent !== scene;
        if (targetAdded) scene.add(light.target);
        const state: ActiveShadowState = {
            sim, light, target, casterMeshes: [], depthMaterials: new Map(),
            oldMap: shadow.map, oldCastShadow: light.castShadow, oldAutoUpdate: shadow.autoUpdate,
            oldMapSize: shadow.mapSize.clone(),
            oldCamera: {
                left: shadowCamera.left, right: shadowCamera.right, top: shadowCamera.top, bottom: shadowCamera.bottom,
                near: shadowCamera.near, far: shadowCamera.far, layerMask: shadowCamera.layers.mask,
            },
            oldLightPosition: light.position.clone(), oldTargetPosition: light.target.position.clone(), targetAdded,
        };
        stateRef.current = state;
        activeShadowState = state;
        light.castShadow = false;
        shadow.map = target;
        shadow.autoUpdate = false;
        shadow.mapSize.set(MAP_SIZE, MAP_SIZE);

        return () => {
            for (const depthMaterial of state.depthMaterials.values()) depthMaterial.dispose();
            state.depthMaterials.clear();
            target.dispose();
            shadow.map = state.oldMap;
            shadow.autoUpdate = state.oldAutoUpdate;
            shadow.mapSize.copy(state.oldMapSize);
            shadowCamera.left = state.oldCamera.left; shadowCamera.right = state.oldCamera.right;
            shadowCamera.top = state.oldCamera.top; shadowCamera.bottom = state.oldCamera.bottom;
            shadowCamera.near = state.oldCamera.near; shadowCamera.far = state.oldCamera.far;
            shadowCamera.layers.mask = state.oldCamera.layerMask;
            shadowCamera.updateProjectionMatrix();
            light.position.copy(state.oldLightPosition); light.target.position.copy(state.oldTargetPosition);
            light.castShadow = state.oldCastShadow;
            if (state.targetAdded && light.target.parent === scene) scene.remove(light.target);
            if (activeShadowState === state) activeShadowState = null;
            stateRef.current = null;
            const old = oldRenderer.current;
            if (old) { gl.shadowMap.enabled = old.enabled; gl.shadowMap.type = old.type; }
        };
    }, [gl, scene, sim]);

    useFrame(() => {
        const state = stateRef.current;
        if (!state) return;
        const { light, sim } = state;
        const shadow = light.shadow;
        const shadowCamera = shadow.camera as THREE.OrthographicCamera;
        gl.shadowMap.enabled = false;
        light.castShadow = false;
        shadow.mapSize.set(MAP_SIZE, MAP_SIZE);
        shadowCamera.left = -HALF_EXTENT; shadowCamera.right = HALF_EXTENT;
        shadowCamera.top = HALF_EXTENT; shadowCamera.bottom = -HALF_EXTENT;
        shadowCamera.near = 0.1; shadowCamera.far = LIGHT_FAR;
        shadowCamera.updateProjectionMatrix();
        shadowCamera.layers.set(CASTER_LAYER);

        const target = light.target.position.set(sim.pos[0], sim.pos[1] - 0.5, sim.pos[2]);
        _sunDir.set(TOD.sun.x, TOD.sun.y, TOD.sun.z);
        if (_sunDir.y < 0) _sunDir.negate();
        _sunDir.normalize();
        light.position.copy(target).addScaledVector(_sunDir, LIGHT_DISTANCE);
        light.target.updateMatrixWorld(true);
        light.updateMatrixWorld(true);

        if (frame.current++ % SCAN_EVERY === 0) {
            const casters: THREE.Mesh[] = [];
            scene.traverse((object) => {
                const mesh = object as THREE.Mesh & { isMesh?: boolean; isInstancedMesh?: boolean; isBatchedMesh?: boolean };
                if (!(mesh.isMesh || mesh.isInstancedMesh || mesh.isBatchedMesh)) return;
                const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).filter(Boolean);
                const cast = mesh.visible && !mesh.userData?.noShadow && !belongsToRegisteredHero(mesh) && materials.some(materialCanCast);
                if (cast) casters.push(mesh);
            });
            state.casterMeshes = casters;
            if (DBG) (window as any).__shadowMapInfo = {
                enabled: true, casters: casters.length, size: MAP_SIZE, extent: HALF_EXTENT,
                method: 'manual-webgl-depth-shadow-map', rayTracing: false,
            };
        }
    }, 0);

    return null;
}
