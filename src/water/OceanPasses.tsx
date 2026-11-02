import { waveH } from './waveHeight';
import React, { useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { WATER_Y, WATER_Z, type Sim } from '../sim';
import { HERO_REFL } from '../caustics';
import { UW } from '../world/env';
import { OCEAN_SNAP, OCEAN_BINS } from './seabed';
import { waterMat } from './oceanMaterial';
import { bakeHeightRefl } from './heightRefl';
import { pickAnalytic } from './analyticRefl';
import { bakeGrid } from './gridRefl';
export const SSR_ON = typeof location !== 'undefined' && /[?&]ssr\b/.test(location.search);   // reflection batch C - Shifat 3:24 PM 'I permit for this test run' (a second scene render, test flag only)
/* Shifat Nov 1 3:57 PM chose the analytic raytrace ('lets go with this if performance good'); 4:07 PM 'believable like real sea, ultra fast' -> default. */
const AR_ON = typeof location === 'undefined' || !/[?&](hf|hfmix|imp)\b/.test(location.search);
const HF_ON = typeof location !== 'undefined' && /[?&]hf\b/.test(location.search), HF_MIX = typeof location !== 'undefined' && /[?&]hfmix\b/.test(location.search);   /* Shifat 3:11 PM 'none of these 4 looks okay': back to the ring by default; ?hf / ?hfmix keep the prototypes */   /* Shifat Nov 1 3:02 PM 'test multiple versions, then choose': version 4 (heightfield near + ring far) chosen; ?ring = old ring only, ?hf = heightfield only */   // heightfield-traced reflections prototype (Shifat Nov 1 2:50 PM)

// Per-frame drivers of the sea: the camera-following sheet, the mirror (reflection) pass and the screen-space scene copy for refraction.
const DBG = !!(import.meta as any).env.VITE_DBG;   // test hooks only in instrumented builds

export function OceanFollow({ waterRef }: { waterRef: React.MutableRefObject<THREE.Mesh | null> }) {
    useFrame(({ camera }) => { const w = waterRef.current; if (!w) return; const so = DBG ? ((window as any).__seaSnapOff || 0) : 0; w.position.set(Math.round(camera.position.x / OCEAN_SNAP) * OCEAN_SNAP + so, WATER_Y, Math.round(camera.position.z / OCEAN_SNAP) * OCEAN_SNAP + so); });   /* __seaSnapOff: sea sim test hook (shifts the sheet by whole snaps; a correct sea renders identically) */
    return null;
}


/* Draws only the sea slices inside the camera's horizontal view (plus margin); everything when looking steeply down or flying high,
   where the visible sea surrounds the camera. Three draws share one geometry: inner disc (always) + up to two angle ranges (wrap). */
export function OceanSlices({ waterRef, geo }: { waterRef: React.MutableRefObject<THREE.Mesh | null>; geo: THREE.BufferGeometry }) {
    const parts = useMemo(() => [0, 1].map(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', geo.attributes.position); g.setIndex(geo.index); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9); return g; }), [geo]);
    const meshes = useMemo(() => parts.map((g) => { const m = new THREE.Mesh(g, waterMat); m.frustumCulled = false; m.name = 'ocean-slice'; return m; }), [parts]);
    const st = useMemo(() => ({ dir: new THREE.Vector3(), added: false }), []);
    useFrame(({ camera, size }) => {
        const w = waterRef.current; if (!w) return;
        if (!st.added) { for (const m of meshes) w.add(m); st.added = true; }
        const ud = geo.userData as { inner: number; binStart: Int32Array }, B = OCEAN_BINS;
        const cam = camera as THREE.PerspectiveCamera; cam.getWorldDirection(st.dir);
        const pitch = Math.asin(THREE.MathUtils.clamp(st.dir.y, -1, 1)), high = cam.position.y - WATER_Y > 45;
        const off = DBG && (window as any).__seaAll;
        if (off || pitch < -0.45 || high || (UW as any).on) { w.geometry.setDrawRange(0, Infinity); meshes[0].visible = meshes[1].visible = false; return; }
        const hh = Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * (size.width / Math.max(1, size.height))) + 0.35 + Math.max(0, -pitch) * 0.6;   // half the horizontal view + margin (more when tilted down)
        if (hh >= Math.PI) { w.geometry.setDrawRange(0, Infinity); meshes[0].visible = meshes[1].visible = false; return; }
        const yaw = Math.atan2(st.dir.x, st.dir.z);   // same angle convention as the slices (atan2(x, z))
        const a0 = yaw - hh, a1 = yaw + hh, toBin = (a: number) => Math.floor(((a + Math.PI) / (Math.PI * 2)) * B);
        let b0 = toBin(a0), b1 = toBin(a1) + 1;
        w.geometry.setDrawRange(0, ud.inner);   // the main mesh draws the inner disc only
        const rng = (m: THREE.Mesh, s: number, e: number) => { s = Math.max(0, Math.min(B, s)); e = Math.max(0, Math.min(B, e)); m.visible = e > s; if (e > s) m.geometry.setDrawRange(ud.binStart[s], ud.binStart[e] - ud.binStart[s]); };
        if (b0 < 0) { rng(meshes[0], 0, b1); rng(meshes[1], b0 + B, B); }
        else if (b1 > B) { rng(meshes[0], b0, B); rng(meshes[1], 0, b1 - B); }
        else { rng(meshes[0], b0, b1); meshes[1].visible = false; }
    }, -1);
    return null;
}

// Ocean screen-space copy (same technique as the park lake): a low-res colour+depth copy of the scene without the sea, taken only
// while the sea is on screen and near enough to matter; skipped when the frame budget is tight.
export function ReflectionIllusion({ sim }: { sim: Sim }) {
    const { camera } = useThree();
    const st = useMemo(() => ({ at: new THREE.Vector3(1e9, 0, 0) }), []);
    useFrame(() => {
        const u = waterMat.uniforms, cam = camera as THREE.PerspectiveCamera;
        HERO_REFL.shadow.set(sim.pos[0], sim.pos[1], sim.pos[2], sim.mode === 'play' ? 1 : 0); u.uHeroA.value.copy(HERO_REFL.shadow); u.uHeroB.value.copy(HERO_REFL.ghost); HERO_REFL.shadowDir.set(Math.sin(sim.yaw), 0, Math.cos(sim.yaw), sim.swim && !sim.dive ? 1 : 0); u.uHeroDA.value.copy(HERO_REFL.shadowDir);
        { const t = u.uTime.value, a = HERO_REFL.shadow, b = HERO_REFL.ghost; u.uHw.value.set(waveH(a.x, a.z, t), waveH(b.x, b.z, t), waveH(cam.position.x, cam.position.z, t)); }
        if (SSR_ON) (waterMat.uniforms as any).uHF.value = 4; else if (AR_ON) { const G = bakeGrid(), uu = waterMat.uniforms as any; uu.uHF.value = 6; uu.uGrid.value = G.tex; uu.uGBox.value = G.box; uu.uGB.value.copy(G.b); uu.uGN.value.copy(G.n); } else if (HF_ON || HF_MIX || (window as any).__hf) { bakeHeightRefl(); (waterMat.uniforms as any).uHF.value = HF_MIX ? 2 : 1; } else (waterMat.uniforms as any).uHF.value = 0;
        if (cam.position.z < WATER_Z + 40 && Math.hypot(cam.position.x - st.at.x, cam.position.z - st.at.z) > 30) { st.at.copy(cam.position); if (AR_ON) pickAnalytic(cam.position.x, cam.position.z); }   // also under water: Snell's window shows the same skyline
        const ok = cam.position.z < WATER_Z + 40 && cam.position.y > WATER_Y + 0.3 && cam.position.y < 160 && !(UW as any).on;
        u.uUseRefl.value = ok && !SSR_ON ? 1 : 0;
    });
    return null;
}

/* FULL MIRROR test (Shifat Nov 1 3:35 PM 'Full scene in air must be reflected on water'; 2nd render allowed for this test 3:24 PM): the WHOLE scene above
   the sea (sky, clouds, city, isles, trees, bridge, boats, gulls) rendered mirrored under the water plane into a 1/4-res target every frame (oblique
   near plane = the sea, so nothing below leaks in); the sea projects it, rippled. Heroes stay out (their analytic reflection is untouched). Flag ?fm. */
