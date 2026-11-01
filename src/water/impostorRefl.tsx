import * as THREE from 'three';
import { useEffect, useMemo } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { buildings, WATER_Y, WATER_Z } from '../sim';
import { BRIDGE, BRIDGE_L, HARBOR } from '../seaWorld';
import { waterMat } from './oceanMaterial';

/* REFLECTION IMPOSTORS (Shifat Nov 1 3:11 PM 'new batch of reflection methods', batch B): each big landmark is rendered ONCE at load from its real
   meshes into an elevation card (orthographic side view: real colours, windows, roofs). The sea intersects its reflected ray with the card's
   vertical plane and reads the card there - exact position and parallax, real art, no per-frame render. Cards: 0 city waterfront (plane z),
   1 bridge (plane x), 2 harbor north face (plane z). */
export const IMP_N = 3, IMP_HMAX = 140;
export const IMP_P = Array.from({ length: IMP_N }, () => new THREE.Vector4(0, 1e6, 0, 1));   // x: axis (0 = plane z = y, u along x; 1 = plane x = y, u along z), y: plane coord, z: u0, w: u size
export const IMP_TEX: (THREE.Texture | null)[] = [null, null, null];
export const IMP_ON = typeof location !== 'undefined' && /[?&]imp\b/.test(location.search);
type Card = { axis: number; plane: number; u0: number; u1: number; camAt: number; dir: number; depth: number };
function cards(): Card[] {
    let cx0 = 1e9, cx1 = -1e9;
    for (const b of buildings) { if (b.host !== undefined || b.z0 < WATER_Z || b.z0 > WATER_Z + 400) continue; cx0 = Math.min(cx0, b.x0); cx1 = Math.max(cx1, b.x1); }
    return [
        { axis: 0, plane: WATER_Z + 6, u0: Math.max(cx0, -1600), u1: Math.min(cx1, 1600), camAt: WATER_Z - 60, dir: 1, depth: 420 },   // city, seen from the sea (looking +z)
        { axis: 1, plane: BRIDGE.x, u0: BRIDGE.z0 - BRIDGE_L, u1: BRIDGE.z0, camAt: BRIDGE.x - 60, dir: 1, depth: 120 },               // bridge, seen from the west (looking +x)
        { axis: 0, plane: HARBOR.z1, u0: HARBOR.x0 - 20, u1: HARBOR.x1 + 20, camAt: HARBOR.z1 + 60, dir: -1, depth: 260 },            // harbor towers, seen from the north (looking -z)
    ];
}
export function ImpostorBake({ waterRef }: { waterRef: React.MutableRefObject<THREE.Mesh | null> }) {
    const { gl, scene } = useThree();
    const st = useMemo(() => ({ n: 0, done: false, rts: [] as THREE.WebGLRenderTarget[] }), []);
    useEffect(() => () => st.rts.forEach(r => r.dispose()), [st]);
    useFrame(() => {
        const u = waterMat.uniforms as any;
        if (!IMP_ON) return; if (u.uHF) u.uHF.value = 5;
        if (st.done || ++st.n < 20) return;   // let the world finish mounting first (~1.5 s)
        st.done = true;
        const prevRT = gl.getRenderTarget(), col = new THREE.Color(); gl.getClearColor(col); const ca = gl.getClearAlpha(), bg = scene.background, fog = scene.fog, w = waterRef.current, vis = w?.visible;
        scene.background = null; scene.fog = null; if (w) w.visible = false;
        /* the sky dome, clouds and other huge / see-through things are not landmarks: hidden for the bake so the cards are clear where there is sky */
        const hid: THREE.Object3D[] = [];
        scene.traverse((o: any) => { if (!o.visible || !(o.isMesh || o.isPoints || o.isSprite)) return; const g = o.geometry; if (g && !g.boundingSphere) g.computeBoundingSphere();
            const m = Array.isArray(o.material) ? o.material[0] : o.material; if (o.isPoints || o.isSprite || (g && g.boundingSphere && g.boundingSphere.radius > 1500 && !o.isInstancedMesh) || (m && ((m.transparent && !m.depthWrite) || m.side === THREE.BackSide || m.depthTest === false))) { o.visible = false; hid.push(o); } });
        cards().forEach((c, i) => {
            const span = c.u1 - c.u0, W = Math.min(2048, Math.max(256, Math.round(span / 1.2))), H = Math.round(W * IMP_HMAX / span * 2) ;
            const rt = new THREE.WebGLRenderTarget(W, Math.max(64, Math.min(1024, H)), { minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true }); st.rts.push(rt);
            const half = span / 2, mid = (c.u0 + c.u1) / 2;
            const cam = new THREE.OrthographicCamera(-half, half, IMP_HMAX, 0, 1, 60 + c.depth);
            if (c.axis === 0) { cam.position.set(mid, WATER_Y, c.camAt); cam.lookAt(mid, WATER_Y, c.camAt + c.dir); }
            else { cam.position.set(c.camAt, WATER_Y, mid); cam.lookAt(c.camAt + c.dir, WATER_Y, mid); }
            cam.updateMatrixWorld(); cam.updateProjectionMatrix();
            gl.setRenderTarget(rt); gl.setClearColor(0x000000, 0); gl.clear(); gl.render(scene, cam);
            IMP_TEX[i] = rt.texture;
            /* the card's u runs along the camera's right vector: +x for the city (looking +z the right is -x), so record the sign in w */
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion), sgn = c.axis === 0 ? Math.sign(right.x) : Math.sign(right.z);
            IMP_P[i].set(c.axis, c.plane, sgn > 0 ? c.u0 : c.u1, sgn * span);
        });
        hid.forEach(o => (o.visible = true)); gl.setRenderTarget(prevRT); gl.setClearColor(col, ca); scene.background = bg; scene.fog = fog; if (w) w.visible = vis!;
        u.tImp0.value = IMP_TEX[0]; u.tImp1.value = IMP_TEX[1]; u.tImp2.value = IMP_TEX[2];
        if ((window as any).__impDump === undefined) (window as any).__impDump = () => st.rts.map(rt => { const b = new Uint8Array(rt.width * rt.height * 4); gl.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, b); return { W: rt.width, H: rt.height, d: Array.from(b) }; });
    });
    return null;
}
