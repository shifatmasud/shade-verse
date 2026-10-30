import React, { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { WATER_Y, WATER_Z, SEABED, HALF, SEA, type Sim } from '../sim';
import { QUALITY, QK, LOWQ } from '../quality';
import { ISLAND } from '../seaWorld';
import { HERO_REFL } from '../caustics';
import { worldBufferSize } from '../heroHD';
import { UW } from '../world/env';
import { OCEAN_SNAP } from './seabed';
import { waterMat } from './oceanMaterial';

// Per-frame drivers of the sea: the camera-following sheet, the mirror (reflection) pass and the screen-space scene copy for refraction.
const DBG = !!(import.meta as any).env.VITE_DBG;   // test hooks only in instrumented builds

export function OceanFollow({ waterRef }: { waterRef: React.MutableRefObject<THREE.Mesh | null> }) {
    useFrame(({ camera }) => { const w = waterRef.current; if (!w) return; w.position.set(Math.round(camera.position.x / OCEAN_SNAP) * OCEAN_SNAP, WATER_Y, Math.round(camera.position.z / OCEAN_SNAP) * OCEAN_SNAP); });
    return null;
}

// Ocean screen-space copy (same technique as the park lake): a low-res colour+depth copy of the scene without the sea, taken only
// while the sea is on screen and near enough to matter; skipped when the frame budget is tight.
const _oceanBox = new THREE.Box3(new THREE.Vector3(-HALF - 700, SEABED - 45, SEA.zMin - 600), new THREE.Vector3(HALF + 700, WATER_Y + 4, WATER_Z + 2));
// Shifat 2:58 AM "reflection when?": real mirrored reflections of the island (terrain, palms, trees, rocks, lighthouse, shacks, dock) in the sea.
// A Reflector-style virtual camera mirrored about the sea plane renders ONLY those opaque shapes (layer 7, ~15 draw calls, no grass/water/fx)
// into a small target (1/4 res desktop, 1/5 phone; phones every 2nd frame); the ocean shader samples it with wave distortion and Fresnel.
const REFL_LAYER = 7;
export function IslandReflection({ waterRef, sim, perf }: { waterRef: React.MutableRefObject<THREE.Mesh | null>; sim: Sim; perf: { scale: number } }) {
    const { gl, scene, camera } = useThree();
    const st = useMemo(() => ({ rt: new THREE.WebGLRenderTarget(4, 4, { type: rtType(gl) }), cam: new THREE.PerspectiveCamera(), n: 0, tagged: false, buf: new THREE.Vector2(),
        rot: new THREE.Matrix4(), cp: new THREE.Vector3(), la: new THREE.Vector3(), tg: new THREE.Vector3(), plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -WATER_Y + 0.05),
        bias: new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1), col: new THREE.Color(), pv: new THREE.Matrix4(), fr: new THREE.Frustum() }), []);
    useEffect(() => () => st.rt.dispose(), [st]);
    useFrame(() => {
        const u = waterMat.uniforms, cam = camera as THREE.PerspectiveCamera, w = waterRef.current;
        HERO_REFL.shadow.set(sim.pos[0], sim.pos[1], sim.pos[2], sim.mode === 'play' ? 1 : 0); u.uHeroA.value.copy(HERO_REFL.shadow); u.uHeroB.value.copy(HERO_REFL.ghost); HERO_REFL.shadowDir.set(Math.sin(sim.yaw), 0, Math.cos(sim.yaw), sim.swim && !sim.dive ? 1 : 0); u.uHeroDA.value.copy(HERO_REFL.shadowDir);   // analytic hero reflections (everywhere on the sea)
        const d = Math.hypot(cam.position.x - ISLAND.cx, cam.position.z - ISLAND.cz);
        // Shifat 3:39 AM "cities & bridges must reflect on water too": the mirror pass now runs near the island, along the city shore, and around the
        // east bridge / harbor; it replaces the screen-space march there (which could never show what is off-screen, like the tops of towers).
        const zone = d < 520 || cam.position.z > WATER_Z - 320 || (cam.position.x > -40 && cam.position.z < -760);
        st.pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); st.fr.setFromProjectionMatrix(st.pv);
        const ok = !!w && zone && cam.position.z < WATER_Z + 40 && cam.position.y > WATER_Y + 0.3 && cam.position.y < 110 && !(UW as any).on && st.fr.intersectsBox(_oceanBox);   /* only when the sea is actually in view */
        if (!ok) { u.uUseRefl.value = 0; return; }
        if (!st.tagged || st.n % 300 === 0) {   // (re)tag big opaque shapes - island, city blocks, bridges, harbor - plus lights (three culls lights by layer too)
            const sp = new THREE.Sphere(); let nT = 0;
            scene.traverse((o: any) => { if (o.isLight) { o.layers.enable(REFL_LAYER); return; } if (!o.isMesh || o.isPoints || o.isSkinnedMesh || o.layers.isEnabled(REFL_LAYER)) return;
                const m = Array.isArray(o.material) ? o.material[0] : o.material; if (!m || m.transparent || !m.depthTest || o === w || o.userData.noRefl || (o.isInstancedMesh && o.count > 3000)) return;   /* custom-shader city/blocks included; water, sky, fx excluded */
                const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); if (o.isInstancedMesh && g.boundingSphere!.radius < 1.2) return;   /* grass blades, flowers, small street props: sub-pixel in the low-res rippled mirror, so not re-drawn there */ sp.copy(g.boundingSphere!).applyMatrix4(o.matrixWorld); if (!o.isInstancedMesh && (sp.radius < 3.5 || sp.radius > 3000 || sp.center.y + sp.radius < WATER_Y + 0.5)) return; o.layers.enable(REFL_LAYER); nT++; });
            if (DBG) (window as any).__reflTagged = ((window as any).__reflTagged || 0) + nT;
            st.tagged = true;
        }
        st.n++;
        cam.getWorldDirection(st.tg); const steep = st.tg.y < -0.8;   /* looking almost straight down: Fresnel ~2%, the mirror is barely visible */
        const slow = perf.scale < 0.75 || steep;   /* adaptive: when the frame budget is tight (UHD 600 under load) the mirror drops to a third rate */
        if (st.n % (PHONE_REFL || slow ? 3 : 2) === 0 || u.uUseRefl.value === 0) {   /* the mirror is rippled anyway, so a frame of lag is invisible: half rate desktop, third rate phone */
            worldBufferSize(gl, st.buf);
            const k = PHONE_REFL ? 0.12 : (slow ? 0.15 : 0.22),   /* Shifat 4:15 AM: phone gets city too, at the lowest res (rippled mirror hides it) */ W = Math.max(96, Math.round(st.buf.x * k)), H = Math.max(48, Math.round(st.buf.y * k));
            if (st.rt.width !== W || st.rt.height !== H) st.rt.setSize(W, H); u.uReflSoft.value.set((PHONE_REFL ? 0.8 : 0.6) / W, (PHONE_REFL ? 0.8 : 0.6) / H);   /* desktop too: the adaptive-res mirror otherwise shows neon / hero reflections as blocky squares */
            // mirror the camera about y = WATER_Y (three.js Reflector maths)
            cam.updateMatrixWorld(); st.cp.setFromMatrixPosition(cam.matrixWorld); st.rot.extractRotation(cam.matrixWorld);
            st.la.set(0, 0, -1).applyMatrix4(st.rot).add(st.cp);
            const vc = st.cam; vc.position.set(st.cp.x, 2 * WATER_Y - st.cp.y, st.cp.z);
            st.tg.set(st.la.x, 2 * WATER_Y - st.la.y, st.la.z);
            vc.up.set(0, 1, 0).applyMatrix4(st.rot); vc.up.y = -vc.up.y; vc.lookAt(st.tg);
            vc.fov = cam.fov; vc.aspect = cam.aspect; vc.near = cam.near; vc.far = Math.min(cam.far, PHONE_REFL ? 420 : 620);   /* fog covers beyond this */ vc.updateProjectionMatrix(); vc.updateMatrixWorld();
            vc.layers.set(REFL_LAYER);
            const prev = gl.getRenderTarget(), ac = gl.autoClear, sh = gl.shadowMap.autoUpdate, cp = gl.clippingPlanes, cc = gl.getClearAlpha(); gl.getClearColor(st.col);
            try { gl.shadowMap.autoUpdate = false; gl.autoClear = true; gl.clippingPlanes = [st.plane]; gl.setClearColor(st.col, 0); gl.setRenderTarget(st.rt); gl.clear(true, true, true); gl.render(scene, vc); }
            finally { gl.setRenderTarget(prev); gl.autoClear = ac; gl.shadowMap.autoUpdate = sh; gl.clippingPlanes = cp; gl.setClearColor(st.col, cc); }
            u.uRefMat.value.multiplyMatrices(st.bias, vc.projectionMatrix).multiply(vc.matrixWorldInverse);
        }
        u.tRefl.value = st.rt.texture; u.uUseRefl.value = 1;
        if (DBG) (window as any).__refl = { n: st.n, w: st.rt.width };
    });
    return null;
}
const PHONE_REFL = QUALITY.coarse || LOWQ;
// Phone GPUs (Adreno 506 etc.) often cannot RENDER into half-float targets (no EXT_color_buffer_half_float / _float): the copy came out empty, so on
// Shifat's phone no reflections showed at all. Use half float only when the GPU can render to it, else plain 8-bit.
function rtType(gl: THREE.WebGLRenderer) { const e = gl.extensions; return (e.has('EXT_color_buffer_float') || e.has('EXT_color_buffer_half_float')) && !(QUALITY.coarse || LOWQ) ? THREE.HalfFloatType : THREE.UnsignedByteType; }
export function OceanScreenSpace({ sim, waterRef, perf }: { sim: Sim; waterRef: React.MutableRefObject<THREE.Mesh | null>; perf: { scale: number } }) {
    const { gl, scene, camera } = useThree();
    const target = useMemo(() => { const t = new THREE.WebGLRenderTarget(4, 4, { type: rtType(gl) }); t.depthTexture = new THREE.DepthTexture(4, 4); t.depthTexture.type = THREE.UnsignedIntType; return t; }, []);
    const st = useMemo(() => ({ fr: new THREE.Frustum(), pv: new THREE.Matrix4(), buf: new THREE.Vector2(), n: 0, copies: 0 }), []);
    useEffect(() => () => target.dispose(), [target]);
    useFrame(() => {
        const u = waterMat.uniforms, cam = camera as THREE.PerspectiveCamera, w = waterRef.current;
        u.uProj.value.copy(cam.projectionMatrix); u.uNear.value = cam.near; u.uFar.value = cam.far; u.uSteps.value = QK.lakeSteps;
        st.pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); st.fr.setFromProjectionMatrix(st.pv);
        const near = cam.position.z < WATER_Z + 170 && cam.position.y > WATER_Y - 0.5 && cam.position.y < 140, scale = perf.scale;
        const phoneFar = PHONE_REFL && cam.position.z < WATER_Z - 320;   /* Shifat 9:16 AM phone fps: the copy is a second full scene render; out at sea the bed is analytic and near water is see-through, so phones skip it there */
        const ok = !!w && near && !phoneFar && st.fr.intersectsBox(_oceanBox) && scale > 0.5 && !(UW as any).on;
        if (!ok) { u.uUseScene.value = 0; return; }
        st.n++;
        const farSea = cam.position.z < WATER_Z - 320;
        if ((scale > 0.6 && !PHONE_REFL && !farSea) || st.n % 2 === 0 || st.copies === 0) {   /* phones always, desktop out at open sea (Shifat 10:27 'go alternative'): half rate - one frame of lag under rippled water is invisible */
            worldBufferSize(gl, st.buf);
            const W = Math.max(160, Math.round(st.buf.x * QK.lakeCopyScale)), H = Math.max(90, Math.round(st.buf.y * QK.lakeCopyScale));
            if (target.width !== W || target.height !== H) target.setSize(W, H); u.uSceneTx.value.set(1 / W, 1 / H);
            const prev = gl.getRenderTarget(), ac = gl.autoClear, sh = gl.shadowMap.autoUpdate;
            try { w!.visible = false; gl.shadowMap.autoUpdate = false; gl.autoClear = true; gl.setRenderTarget(target); gl.clear(true, true, true); gl.render(scene, camera); }
            finally { gl.setRenderTarget(prev); gl.autoClear = ac; gl.shadowMap.autoUpdate = sh; w!.visible = true; }
            st.copies++;
        }
        u.tScene.value = target.texture; u.tDepth.value = target.depthTexture; u.uUseScene.value = 1;
        if (DBG) (window as any).__ocean = { copies: st.copies, on: 1 };
    });
    return null;
}
