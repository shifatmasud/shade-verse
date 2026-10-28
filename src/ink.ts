import * as THREE from 'three';
// Comic ink outline for instanced models: an inverted hull sharing the mesh's instance matrices and its animation shader, pushed out along the normal.
// Thickness is set in world metres and grows slowly with camera distance, so near edges stay thin and far models do not turn into black blobs.
export function inkFrom(src: THREE.Material): THREE.MeshBasicMaterial {
    const m = new THREE.MeshBasicMaterial({ color: '#0a0d1a', side: THREE.BackSide });
    const prev = (src as any).onBeforeCompile as ((s: any, r: any) => void) | undefined;
    m.onBeforeCompile = (sh, rd) => {
        if (prev) prev(sh, rd);
        sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `{ float isc = max(length(instanceMatrix[0].xyz), 1e-4); vec3 wc = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float tw = clamp(0.012 + 0.0009 * distance(wc, cameraPosition), 0.012, 0.05); transformed += normalize(normal) * (tw / isc); }
        #include <project_vertex>`);
    };
    m.customProgramCacheKey = () => 'ink-' + ((src as any).customProgramCacheKey ? (src as any).customProgramCacheKey() : src.type) + (src as any).uuid;
    return m;
}
export function attachInk(m: THREE.InstancedMesh) {
    const h = new THREE.InstancedMesh(m.geometry, inkFrom(m.material as THREE.Material), m.instanceMatrix.count);
    h.instanceMatrix = m.instanceMatrix; h.frustumCulled = false; h.count = 0; m.add(h); return h;
}
export const INK_HULL = { on: false };
export const syncInk = (m: THREE.InstancedMesh) => { const h = m.children[0] as THREE.InstancedMesh | undefined; if (h && (h as any).isInstancedMesh) { h.count = m.count; const w = typeof window !== 'undefined' ? (window as any) : {}; h.visible = INK_HULL.on && !w.__noInk && !(m.userData.far && w.__noInkFar); } };
