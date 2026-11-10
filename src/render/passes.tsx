import { WATERLINE, UW, WEATHER } from '../world/env';
import { HD, HERO_WATER, createHeroComposite, worldBufferSize, worldTarget } from '../heroHD';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { FXAA_FS, FXAA_SHARP_FS, OUT_FS, CLOUD_SHADOW_FS } from '../shaders/post';
import { SKY_T } from '../shaders/skyFx';
import { useEffect, useMemo } from 'react';
import { waterMat } from '../water/oceanMaterial';
import { noInk } from '../water/common';
import { renderManualShadowMap } from '../world/shadowMap';
import { updateTrueMeshShadow } from '../world/trueMeshShadow';

const DBG = !!(import.meta as any).env.VITE_DBG;   // test hooks only in instrumented builds

// Post-processing passes: FXAA + sharpen, the hero HD composite and the screen-space outline.
// optional post AA (FXAA, one fullscreen pass): can be switched on/off at runtime from measured frame time, unlike MSAA which is fixed at context creation
const _v0 = new THREE.Vector2(0, 0);
const _heroShadowLightPos = new THREE.Vector3();
const _heroShadowLightTarget = new THREE.Vector3();
const _heroShadowLightDir = new THREE.Vector3(0, 1, 0);
const CLOUD_SHADOW_SIZE = 256, CLOUD_SHADOW_RANGE = 8.0;
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

// Sea at 1 dpr (Shifat 4:31 AM 'ocean & underwater, full sea can be drawn at 1 dpr'; the rest of the world stays 1.5). The sea's per-pixel shader
// is the heaviest in the game, so it gets its own target at CSS resolution: (1) world without the sea and without transparent things,
// (2) sea target: depth pre-filled from the world (farthest of the 4 covered texels, so the sea is drawn under every occluder edge), then the
// sea mesh alone, (3) composite over the world at full res with a per-pixel depth test (crisp edges at full res), (4) the transparent things
// (foam, particles, glass, rays...) on top, depth-tested against world + sea - the same order they had before. Measured headless phone
// (pinned, open sea): sea 1.5 dpr ~350 ms -> 1 dpr ~180 ms of the frame.
export const SEA_LAYER = 9, LATE_LAYER = 10;
const FSQ_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
function fsq(mat: THREE.Material) { const s = new THREE.Scene(), q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); q.frustumCulled = false; s.add(q); return s; }
function makeSeaPass() {
    const rt = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: true, samples: 0 }); (rt as any).isXRRenderTarget = true;   // same colour pipeline as the world target
    rt.depthTexture = new THREE.DepthTexture(4, 4); rt.depthTexture.type = THREE.UnsignedIntType;
    rt.texture.minFilter = rt.texture.magFilter = THREE.LinearFilter; rt.texture.colorSpace = THREE.SRGBColorSpace;
    const pre = new THREE.ShaderMaterial({ uniforms: { tD: { value: null }, uTx: { value: new THREE.Vector2() } }, vertexShader: FSQ_VS,
        fragmentShader: 'uniform sampler2D tD; uniform vec2 uTx; varying vec2 vUv; void main(){ float d = max(max(texture2D(tD, vUv - uTx).r, texture2D(tD, vUv + vec2(uTx.x, -uTx.y)).r), max(texture2D(tD, vUv + vec2(-uTx.x, uTx.y)).r, texture2D(tD, vUv + uTx).r)); gl_FragDepth = d; gl_FragColor = vec4(0.0); }',
        depthTest: true, depthFunc: THREE.AlwaysDepth, depthWrite: true, colorWrite: false, toneMapped: false });
    const comp = new THREE.ShaderMaterial({ uniforms: { tC: { value: rt.texture }, tD: { value: rt.depthTexture } }, vertexShader: FSQ_VS,
        fragmentShader: 'uniform sampler2D tC; uniform sampler2D tD; varying vec2 vUv; void main(){ vec4 c = texture2D(tC, vUv); if (c.a < 0.002) discard; gl_FragDepth = texture2D(tD, vUv).r; gl_FragColor = c; }',
        depthTest: true, depthFunc: THREE.LessEqualDepth, depthWrite: true, transparent: true, toneMapped: false,
        });
    noInk(comp, true);   // sea pixels are never inked (Shifat 11:26 PM)
    return { rt, pre, comp, preS: fsq(pre), compS: fsq(comp), css: new THREE.Vector2(), cc: new THREE.Color(), n: 0, moved: new Set<THREE.Object3D>() };
}
// every 30 frames: the sea goes on its own layer, transparent things (except heroes) move to the late layer, lights see all layers
function sortLayers(scene: THREE.Scene, sp: ReturnType<typeof makeSeaPass>) {
    scene.traverse((o: any) => {
        if (o.isLight) { o.layers.enable(LATE_LAYER); o.layers.enable(SEA_LAYER); return; }
        if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
        if (o.material === waterMat) { if (o.layers.mask !== (1 << SEA_LAYER)) o.layers.set(SEA_LAYER); return; }
        if (sp.moved.has(o) || (o.layers.mask & (1 << 2))) return;   // already moved / hero (HD layer 2)
        const m = o.material, tr = Array.isArray(m) ? m.some((x: any) => x && x.transparent) : !!(m && m.transparent);
        if (tr && o.layers.isEnabled(0)) { o.layers.disable(0); o.layers.enable(LATE_LAYER); sp.moved.add(o); }
    });
}

/** Sea surface resolution in device-pixel ratio (Shifat Nov 1 7:50 PM: 0.5). */
export const SEA_DPR = 0.5;

function directShadowBalance(scene: THREE.Scene) {
    const lum = (c?: THREE.Color) => c ? 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b : 0;
    const sun = scene.getObjectByName('sun1') as THREE.DirectionalLight | undefined;
    const fill = scene.getObjectByName('sun2') as THREE.DirectionalLight | undefined;
    const hemi = scene.getObjectByName('hemi') as THREE.HemisphereLight | undefined;
    const direct = sun ? Math.max(0, sun.intensity) * lum(sun.color) : 0;
    const secondary = fill ? Math.max(0, fill.intensity) * lum(fill.color) : 0;
    const ambient = hemi ? Math.max(0, hemi.intensity) * (lum(hemi.color) + lum(hemi.groundColor)) * 0.5 : 0;
    const ratio = direct / Math.max(1e-4, direct + secondary + ambient * 0.45);
    return THREE.MathUtils.clamp(0.36 + 0.75 * ratio, 0.48, 0.82);
}

export function OutlinePass() {
    const { gl, scene, camera } = useThree();
    const st = useMemo(() => {
        const rt = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: true, samples: 0 }); (rt as any).isXRRenderTarget = true;   // makes three apply the renderer's tone mapping and output encoding inside the target, so colours match direct-to-screen rendering
        rt.depthTexture = new THREE.DepthTexture(4, 4); rt.depthTexture.type = THREE.UnsignedIntType;
        rt.texture.minFilter = rt.texture.magFilter = THREE.NearestFilter; rt.texture.colorSpace = THREE.SRGBColorSpace;
        const mat = new THREE.ShaderMaterial({ uniforms: { tColor: { value: rt.texture }, tDepth: { value: rt.depthTexture }, tShadowMap: { value: null }, tHeroTriangles: { value: null }, tHeroBvh: { value: null }, uShadowTexel: { value: new THREE.Vector2(1, 1) }, uHeroTriangleTexSize: { value: new THREE.Vector2(1, 1) }, uHeroBvhTexSize: { value: new THREE.Vector2(1, 1) }, uHeroBvhNodeCount: { value: 0 }, uHeroTraceOn: { value: 0 }, uHeroTraceStrength: { value: 0.68 }, uHeroTraceWaterStrength: { value: 0.14 }, uHeroTraceDebug: { value: 0 }, uHeroBoundsMin: { value: new THREE.Vector3() }, uHeroBoundsMax: { value: new THREE.Vector3() }, uHeroRayDir: { value: new THREE.Vector3(0, 1, 0) }, uShadowMatrix: { value: new THREE.Matrix4() }, uInvProjection: { value: new THREE.Matrix4() }, uInvView: { value: new THREE.Matrix4() }, uShadowOn: { value: 0 }, uShadowBias: { value: 0.00012 }, uShadowStrength: { value: 0.82 }, uShadowWaterStrength: { value: 0.34 }, uCineMood: { value: 0 }, uRes: { value: new THREE.Vector2(4, 4) }, uNear: { value: 0.5 }, uFar: { value: 700 }, uTh: { value: 1.0 }, uOn: { value: 1 }, uWL: { value: WATERLINE.v }, uWLq: { value: WATERLINE.q }, uUwC: { value: WATERLINE.col } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: OUT_FS, depthTest: false, depthWrite: false, toneMapped: false });
        const qs = new THREE.Scene(), q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); q.frustumCulled = false; qs.add(q);
        const r2 = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false, stencilBuffer: false, samples: 0, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: THREE.UnsignedByteType }); const ft = r2.texture;   /* outline result goes to its own target that FXAA reads (was: drawn to the frame, then the whole frame copied) */
        const fm = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: ft }, uRes: { value: new THREE.Vector2(4, 4) }, tDepth: { value: rt.depthTexture }, uNear: { value: 0.5 }, uFar: { value: 700 }, uSharp: { value: SHARPEN.amount } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: FXAA_SHARP_FS, depthTest: false, depthWrite: false, toneMapped: false });
        const fs = new THREE.Scene(), fq = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fm); fq.frustumCulled = false; fs.add(fq);
        const cloudRt = new THREE.WebGLRenderTarget(CLOUD_SHADOW_SIZE, CLOUD_SHADOW_SIZE, { depthBuffer: false, stencilBuffer: false, samples: 0, format: THREE.RGBAFormat, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
        cloudRt.texture.colorSpace = THREE.NoColorSpace; cloudRt.texture.generateMipmaps = false;
        const cloudMat = new THREE.ShaderMaterial({ uniforms: { uCloudTime: SKY_T, uCloudRain: WEATHER.rain, uCloudRange: { value: CLOUD_SHADOW_RANGE } }, vertexShader: FSQ_VS, fragmentShader: CLOUD_SHADOW_FS, depthTest: false, depthWrite: false, toneMapped: false });
        const cloudScene = fsq(cloudMat);
        Object.assign(mat.uniforms, { tCloudShadow: { value: cloudRt.texture }, uCloudStrength: { value: 1.0 }, uCloudAltitude: { value: 180 }, uCloudRange: { value: CLOUD_SHADOW_RANGE }, uCloudSunDir: { value: new THREE.Vector3(0, 1, 0) }, uCloudCamera: { value: new THREE.Vector3() } });
        return { rt, mat, qs, qc: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), sz: new THREE.Vector2(), r2, fm, fs, sea: makeSeaPass(), cloudRt, cloudMat, cloudScene };
    }, []);
    useEffect(() => { scene.matrixWorldAutoUpdate = false; return () => { scene.matrixWorldAutoUpdate = true; st.cloudRt.dispose(); st.cloudMat.dispose(); st.cloudScene.traverse((o: any) => { if (o.isMesh) o.geometry.dispose(); }); }; }, [scene, st]);
    useFrame(() => {
        /* Shifat 11:29 PM phone CPU: every gl.render() (world, sea split, glow, hero HD, probe) re-walked the whole scene graph to update
           world matrices. Now it is walked once per frame, here, before the first world render of the frame. */
        scene.updateMatrixWorld();
        const trueShadow = updateTrueMeshShadow();
        renderManualShadowMap(gl, scene);
        const prevTarget = gl.getRenderTarget(), prevAutoClear = gl.autoClear;
        try { gl.autoClear = true; gl.setRenderTarget(st.cloudRt); gl.render(st.cloudScene, st.qc); }
        finally { gl.setRenderTarget(prevTarget); gl.autoClear = prevAutoClear; }
        worldBufferSize(gl, st.sz);
        if (st.rt.width !== st.sz.x || st.rt.height !== st.sz.y) { st.rt.setSize(st.sz.x, st.sz.y); st.mat.uniforms.uRes.value.copy(st.sz); }
        const cam = camera as THREE.PerspectiveCamera; st.mat.uniforms.uNear.value = cam.near; st.mat.uniforms.uFar.value = cam.far; st.fm.uniforms.uNear.value = cam.near; st.fm.uniforms.uFar.value = cam.far; st.fm.uniforms.uSharp.value = DBG && (window as any).__sharp !== undefined ? (window as any).__sharp : SHARPEN.amount;
        st.mat.uniforms.uTh.value = 1.0;
        st.mat.uniforms.uOn.value = (DBG && (window as any).__noOutline) ? 0 : 1;
        if (st.r2.width !== st.sz.x || st.r2.height !== st.sz.y) { st.r2.setSize(st.sz.x, st.sz.y); st.fm.uniforms.uRes.value.copy(st.sz); }
        const out = worldTarget(gl); HD.depth = st.rt.depthTexture;   // hero HD pass: the world's final frame goes to the world RT, same size as before
        gl.setRenderTarget(st.rt);
        const sp = st.sea; gl.getSize(sp.css); const cy = camera.position.y, hk = (UW as any).on ? 1 : cy > 70 ? 0.35 : cy > 35 ? 0.5 : cy > 12 ? 0.75 : 1, high = hk < 1, sw = Math.round(Math.min(sp.css.x * SEA_DPR, high ? st.sz.x * hk : 1e9)), sh = Math.round(Math.min(sp.css.y * SEA_DPR, high ? st.sz.y * hk : 1e9));   /* Shifat Nov 1 7:50 PM 'Ocean is too slow now. Reduce sea surface dpr to 0.5': the sea always shades at 0.5 dpr, all devices */   /* resolution steps down with height (quantised, so the target is not resized every frame) */   /* Shifat 2:03 PM 'you can approximate': flying high, the sea's shading runs at half res (ripples are sub-pixel from there), composited at full res with a per-pixel depth test */
        if (sp.n++ % 30 === 0) sortLayers(scene, sp);
        const cam0 = camera.layers.mask;
        if (sw < st.sz.x * 0.95 && !(DBG && (window as any).__seaFull)) {
            if (sp.rt.width !== sw || sp.rt.height !== sh) sp.rt.setSize(sw, sh);
            const bg = scene.background, ac = gl.autoClear, cc = gl.getClearColor(sp.cc), ca = gl.getClearAlpha();
            camera.layers.set(0); gl.render(scene, camera);                                   // (1) world, no sea, no transparents
            gl.autoClear = false; scene.background = null;
            sp.pre.uniforms.tD.value = st.rt.depthTexture; sp.pre.uniforms.uTx.value.set(0.25 / sw, 0.25 / sh);
            gl.setRenderTarget(sp.rt); gl.setClearColor(0x000000, 0); gl.clear(true, true, false); gl.render(sp.preS, st.qc);   // (2) sea target: world depth
            camera.layers.set(SEA_LAYER); gl.render(scene, camera);                           //     + the sea at 1 dpr
            gl.setRenderTarget(st.rt); gl.render(sp.compS, st.qc);                            // (3) composite, per-pixel depth test at full res
            camera.layers.set(LATE_LAYER); gl.render(scene, camera);                          // (4) transparents on top
            camera.layers.mask = cam0; scene.background = bg; gl.autoClear = ac; gl.setClearColor(cc, ca);
        } else {
            camera.layers.mask = cam0 | (1 << SEA_LAYER) | (1 << LATE_LAYER); gl.render(scene, camera); camera.layers.mask = cam0;   // desktop at 1 dpr: one pass as before
        }
        const sun = scene.getObjectByName('sun1') as THREE.DirectionalLight | undefined;
        const shadowStrength = directShadowBalance(scene);
        const cinematicMood = DBG ? THREE.MathUtils.clamp(Number((window as any).__cinematicMood) || 0, 0, 1) : 0;
        st.mat.uniforms.uCineMood.value = cinematicMood; HERO_WATER.uHeroMood.value = cinematicMood;
        if (sun) { sun.getWorldPosition(_heroShadowLightPos); sun.target.getWorldPosition(_heroShadowLightTarget); _heroShadowLightDir.subVectors(_heroShadowLightPos, _heroShadowLightTarget).normalize(); }
        st.mat.uniforms.uCloudSunDir.value.copy(_heroShadowLightDir); camera.updateMatrixWorld(); camera.getWorldPosition(st.mat.uniforms.uCloudCamera.value);
        st.mat.uniforms.tHeroTriangles.value = trueShadow?.triangleTexture ?? null;
        st.mat.uniforms.tHeroBvh.value = trueShadow?.bvhTexture ?? null;
        st.mat.uniforms.uHeroTraceOn.value = trueShadow?.enabled ? 1 : 0;
        st.mat.uniforms.uHeroBvhNodeCount.value = trueShadow?.nodeCount ?? 0;
        st.mat.uniforms.uHeroRayDir.value.copy(_heroShadowLightDir);
        st.mat.uniforms.uHeroTraceStrength.value = shadowStrength * 0.84;
        st.mat.uniforms.uHeroTraceWaterStrength.value = shadowStrength * 0.18;
        st.mat.uniforms.uHeroTraceDebug.value = DBG ? THREE.MathUtils.clamp(Number((window as any).__heroTraceDebug) || 0, 0, 1) : 0;
        if (trueShadow) {
            st.mat.uniforms.uHeroTriangleTexSize.value.copy(trueShadow.triangleTextureSize);
            st.mat.uniforms.uHeroBvhTexSize.value.copy(trueShadow.bvhTextureSize);
            st.mat.uniforms.uHeroBoundsMin.value.copy(trueShadow.boundsMin);
            st.mat.uniforms.uHeroBoundsMax.value.copy(trueShadow.boundsMax);
        }
        if (DBG) (window as any).__heroShadowState = { method: 'posed-skinned-triangle-bvh-ray', enabled: !!trueShadow?.enabled, nodeCount: trueShadow?.nodeCount ?? 0, lightDir: _heroShadowLightDir.toArray() };
        const shadow = sun?.shadow;
        if (shadow?.map?.depthTexture) {
            st.mat.uniforms.tShadowMap.value = shadow.map.depthTexture;
            st.mat.uniforms.uShadowMatrix.value.copy(shadow.matrix);
            st.mat.uniforms.uInvProjection.value.copy(camera.projectionMatrixInverse);
            st.mat.uniforms.uInvView.value.copy(camera.matrixWorld);
            st.mat.uniforms.uShadowTexel.value.set(1 / shadow.map.width, 1 / shadow.map.height);
            st.mat.uniforms.uShadowOn.value = 1;
            st.mat.uniforms.uShadowBias.value = 0.00004;
            st.mat.uniforms.uShadowStrength.value = shadowStrength;
            HERO_WATER.tHeroShadow.value = shadow.map.depthTexture;
            HERO_WATER.uHeroShadowMatrix.value.copy(shadow.matrix);
            HERO_WATER.uHeroShadowTexel.value.set(1 / shadow.map.width, 1 / shadow.map.height);
            HERO_WATER.uHeroShadowBias.value = 0.00004;
            HERO_WATER.uHeroShadowStrength.value = shadowStrength * 0.86;
            HERO_WATER.uHeroShadowOn.value = 1;
        } else {
            st.mat.uniforms.uShadowOn.value = 0;
            HERO_WATER.uHeroShadowOn.value = 0;
        }
        gl.setRenderTarget(st.r2); gl.render(st.qs, st.qc); gl.setRenderTarget(out); gl.render(st.fs, st.qc);   /* Shifat 12:02 AM phone fps: no full-frame copy */
    }, 1);
    return null;
}
