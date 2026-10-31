import { HD, createHeroComposite, worldBufferSize, worldTarget } from '../heroHD';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { world } from '../sim';
import { FXAA_FS, FXAA_SHARP_FS, OUT_FS } from '../shaders/post';
import { useEffect, useMemo } from 'react';

const DBG = !!(import.meta as any).env.VITE_DBG;   // test hooks only in instrumented builds

// Post-processing passes: FXAA + sharpen, the hero HD composite and the screen-space outline.
// optional post AA (FXAA, one fullscreen pass): can be switched on/off at runtime from measured frame time, unlike MSAA which is fixed at context creation
const _v0 = new THREE.Vector2(0, 0);
// env-iter3 near-field sharpen (Shifat Oct 29: "sharpen what's closer to view & keep same res what's not"). Same FXAA pass as above,
// then a clamped unsharp mask on the world image (contrast-adaptive in the spirit of AMD FidelityFX CAS: limited to the local
// min/max so it cannot halo, and backed off on hard geometric edges so FXAA's smoothing survives). Its strength comes from the
// world depth: full within ~6 m of the camera, gone by ~28 m, never on the sky. One extra depth fetch + ~20 ALU per world pixel.
// Heroes are redrawn afterwards at native resolution by the (locked) hero HD pass, so this only ever shows on the world.
export const SHARPEN = { amount: 0.7 };
export const FXAA_STATE = { on: false };
export function FxaaPass({ enabled }: { enabled: boolean }) {
    const { gl, scene, camera } = useThree();
    const st = useMemo(() => {
        const ft = new THREE.FramebufferTexture(4, 4); ft.minFilter = ft.magFilter = THREE.LinearFilter;   // copy of the already display-encoded frame, so mixed custom/lit materials keep their exact colours
        const mat = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: ft }, uRes: { value: new THREE.Vector2(4, 4) } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: FXAA_FS, depthTest: false, depthWrite: false });
        const qs = new THREE.Scene(), q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); q.frustumCulled = false; qs.add(q);
        return { ft, mat, qs, qc: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), sz: new THREE.Vector2(), ema: 16, hold: 0 };
    }, []);
    useFrame((state, dt) => {
        const rd = Math.min(0.25, dt) * 1000; st.ema += (rd - st.ema) * 0.05; st.hold -= dt;
        if (st.hold <= 0) { const want = (DBG && (window as any).__fxaa !== undefined) ? !!(window as any).__fxaa : enabled && (FXAA_STATE.on ? st.ema < 21 : st.ema < 15); if (want !== FXAA_STATE.on) { FXAA_STATE.on = want; st.hold = 2; } }   // hysteresis: on under 15 ms, off over 21 ms, at most one switch per 2 s
        if (!FXAA_STATE.on) { gl.render(scene, camera); return; }
        gl.getDrawingBufferSize(st.sz);
        if (st.ft.image.width !== st.sz.x || st.ft.image.height !== st.sz.y) { st.ft.dispose(); st.ft.image = { width: st.sz.x, height: st.sz.y } as any; st.mat.uniforms.uRes.value.copy(st.sz); }
        gl.render(scene, camera); gl.copyFramebufferToTexture(st.ft, _v0); gl.render(st.qs, st.qc);
    }, 1);
    return null;
}

export const OUTLINE_STATE = { on: true };
if (!OUTLINE_STATE.on) HD.enabled = false;   // the hero HD pass reuses the outline pass's world depth

// Heroes at native resolution over the world (see heroHD.ts); runs after outline (1) and bloom (2).
export function HeroHDPass() {
    const { gl, scene, camera } = useThree();
    const c = useMemo(() => createHeroComposite(), []);
    useEffect(() => () => c.dispose(), [c]);
    useFrame(() => c.render(gl, scene, camera), 3);
    return null;
}
export function OutlinePass() {
    const { gl, scene, camera } = useThree();
    const st = useMemo(() => {
        const rt = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: true, samples: 0 }); (rt as any).isXRRenderTarget = true;   // makes three apply the renderer's tone mapping and output encoding inside the target, so colours match direct-to-screen rendering
        rt.depthTexture = new THREE.DepthTexture(4, 4); rt.depthTexture.type = THREE.UnsignedIntType;
        rt.texture.minFilter = rt.texture.magFilter = THREE.NearestFilter; rt.texture.colorSpace = THREE.SRGBColorSpace;
        const mat = new THREE.ShaderMaterial({ uniforms: { tColor: { value: rt.texture }, tDepth: { value: rt.depthTexture }, uRes: { value: new THREE.Vector2(4, 4) }, uNear: { value: 0.5 }, uFar: { value: 700 }, uTh: { value: 1.0 }, uOn: { value: 1 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: OUT_FS, depthTest: false, depthWrite: false, toneMapped: false });
        const qs = new THREE.Scene(), q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); q.frustumCulled = false; qs.add(q);
        const ft = new THREE.FramebufferTexture(4, 4); ft.minFilter = ft.magFilter = THREE.LinearFilter;
        const fm = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: ft }, uRes: { value: new THREE.Vector2(4, 4) }, tDepth: { value: rt.depthTexture }, uNear: { value: 0.5 }, uFar: { value: 700 }, uSharp: { value: SHARPEN.amount }, uFx: { value: 0 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: FXAA_SHARP_FS, depthTest: false, depthWrite: false, toneMapped: false });
        const fs = new THREE.Scene(), fq = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fm); fq.frustumCulled = false; fs.add(fq);
        return { rt, mat, qs, qc: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), sz: new THREE.Vector2(), ft, fm, fs };
    }, []);
    useFrame(() => {
        worldBufferSize(gl, st.sz);
        if (st.rt.width !== st.sz.x || st.rt.height !== st.sz.y) { st.rt.setSize(st.sz.x, st.sz.y); st.mat.uniforms.uRes.value.copy(st.sz); }
        const cam = camera as THREE.PerspectiveCamera; st.mat.uniforms.uNear.value = cam.near; st.mat.uniforms.uFar.value = cam.far; st.fm.uniforms.uNear.value = cam.near; st.fm.uniforms.uFar.value = cam.far; st.fm.uniforms.uSharp.value = DBG && (window as any).__sharp !== undefined ? (window as any).__sharp : SHARPEN.amount;
        st.mat.uniforms.uTh.value = 1.0; st.fm.uniforms.uFx.value = DBG && (window as any).__fx !== undefined ? (window as any).__fx : 0;
        st.mat.uniforms.uOn.value = (DBG && (window as any).__noOutline) ? 0 : 1;
        if (st.ft.image.width !== st.sz.x || st.ft.image.height !== st.sz.y) { st.ft.dispose(); st.ft.image = { width: st.sz.x, height: st.sz.y } as any; st.fm.uniforms.uRes.value.copy(st.sz); }
        const out = worldTarget(gl); HD.depth = st.rt.depthTexture;   // hero HD pass: the world's final frame goes to the world RT, same size as before
        gl.setRenderTarget(st.rt); gl.render(scene, camera); gl.setRenderTarget(out); gl.render(st.qs, st.qc); gl.copyFramebufferToTexture(st.ft, _v0); gl.render(st.fs, st.qc);
    }, 1);
    return null;
}


