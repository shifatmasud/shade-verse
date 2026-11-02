import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SELECTIVE_BLOOM_LAYER } from './renderLayers';
import { worldBufferSize, worldTarget } from './heroHD';

const BLOOM_FS = `uniform sampler2D tBase; uniform sampler2D tGlow; uniform vec2 uBloomRes; varying vec2 vUv;
void main(){
  vec2 p=1.0/uBloomRes;
  vec3 b=texture2D(tGlow,vUv).rgb*0.20;
  b+=(texture2D(tGlow,vUv+vec2(p.x,0.0)).rgb+texture2D(tGlow,vUv-vec2(p.x,0.0)).rgb+texture2D(tGlow,vUv+vec2(0.0,p.y)).rgb+texture2D(tGlow,vUv-vec2(0.0,p.y)).rgb)*0.10;
  b+=(texture2D(tGlow,vUv+vec2(p.x,p.y)).rgb+texture2D(tGlow,vUv+vec2(-p.x,p.y)).rgb+texture2D(tGlow,vUv+vec2(p.x,-p.y)).rgb+texture2D(tGlow,vUv-vec2(p.x,p.y)).rgb)*0.05;
  b+=(texture2D(tGlow,vUv+vec2(p.x*2.0,0.0)).rgb+texture2D(tGlow,vUv-vec2(p.x*2.0,0.0)).rgb+texture2D(tGlow,vUv+vec2(0.0,p.y*2.0)).rgb+texture2D(tGlow,vUv-vec2(0.0,p.y*2.0)).rgb)*0.025;
  gl_FragColor=vec4(b*0.32,0.0);   /* added onto the frame by the blend unit (ONE, ONE): same result as base+b, without copying the whole frame first */
}`;

/* perf (Nov 2): the 13-tap blur runs once per quarter-res texel into blurT, then the full-size frame adds it with ONE bilinear tap (was 13 taps per full-size pixel) */
const ADD_FS = `uniform sampler2D tBlur; varying vec2 vUv; void main(){ gl_FragColor=vec4(texture2D(tBlur,vUv).rgb,0.0); }`;

export function SelectiveBloomPass() {
    const { gl, scene, camera } = useThree();
    const state = useMemo(() => {
        const base = new THREE.FramebufferTexture(4, 4);
        base.minFilter = base.magFilter = THREE.LinearFilter;
        const target = new THREE.WebGLRenderTarget(4, 4, {
            depthBuffer: true, stencilBuffer: false, samples: 0,
            minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat, type: THREE.UnsignedByteType,
        });
        target.texture.generateMipmaps = false;
        const material = new THREE.ShaderMaterial({
            uniforms: { tBase: { value: base }, tGlow: { value: target.texture }, uBloomRes: { value: new THREE.Vector2(4, 4) } },
            vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
            fragmentShader: BLOOM_FS, depthTest: false, depthWrite: false, toneMapped: false,
            transparent: true, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
        });
        material.blending = THREE.NoBlending; material.transparent = false;   // blur pass writes blurT directly
        const blurT = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false, stencilBuffer: false, samples: 0, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: THREE.UnsignedByteType });
        blurT.texture.generateMipmaps = false;
        const addMat = new THREE.ShaderMaterial({
            uniforms: { tBlur: { value: blurT.texture } },
            vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
            fragmentShader: ADD_FS, depthTest: false, depthWrite: false, toneMapped: false,
            transparent: true, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
        });
        const blurScene = new THREE.Scene();
        const bq = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material); bq.frustumCulled = false; blurScene.add(bq);
        const overlay = new THREE.Scene();
        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), addMat);
        quad.frustumCulled = false; overlay.add(quad);
        return {
            base, target, material, overlay, blurT, addMat, blurScene,
            camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
            size: new THREE.Vector2(),
            origin: new THREE.Vector2(0, 0),
        };
    }, []);

    useEffect(() => () => {
        state.base.dispose(); state.target.dispose(); state.material.dispose(); state.blurT.dispose(); state.addMat.dispose();
        (state.overlay.children[0] as THREE.Mesh).geometry.dispose();
    }, [state]);

    useFrame(() => {
        if ((window as any).__bench?.noBloom) return;   // ?debug&bench step only
        // Shifat 11:07 AM: glow pass always on, day and night ('always glow mode')
        const oldMask = camera.layers.mask;
        const oldBackground = scene.background;
        const oldTarget = gl.getRenderTarget();
        try {
            worldBufferSize(gl, state.size);
            const out = worldTarget(gl);   // hero HD pass: bloom works on the world RT at the world's own size
            const width = Math.max(2, Math.floor(state.size.x / 4));
            const height = Math.max(2, Math.floor(state.size.y / 4));
            if (state.base.image.width !== state.size.x || state.base.image.height !== state.size.y) {
                state.base.dispose();
                state.base.image = { width: state.size.x, height: state.size.y } as any;
            }
            if (state.target.width !== width || state.target.height !== height) {
                state.target.setSize(width, height); state.blurT.setSize(width, height);
                state.material.uniforms.uBloomRes.value.set(width, height);
            }

            // Preserve the already-rendered outline/FXAA frame and render only explicitly tagged lights.
            gl.setRenderTarget(out);
            /* Shifat 11:41 PM phone perf: no full-frame copy any more - the glow is blended straight onto the frame */
            scene.background = null;
            camera.layers.set(SELECTIVE_BLOOM_LAYER);
            gl.setRenderTarget(state.target);
            gl.clear(true, true, true);
            gl.render(scene, camera);
            gl.setRenderTarget(state.blurT); gl.render(state.blurScene, state.camera);
            gl.setRenderTarget(out);
            camera.layers.mask = oldMask;
            scene.background = oldBackground;
            { const ac = gl.autoClear; gl.autoClear = false; gl.render(state.overlay, state.camera); gl.autoClear = ac; }   // blend onto the frame, never clear it
        } finally {
            camera.layers.mask = oldMask;
            scene.background = oldBackground;
            gl.setRenderTarget(oldTarget);
        }
    }, 2);

    return null;
}
