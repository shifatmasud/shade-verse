import * as THREE from 'three';
import { useEffect, useMemo, useRef } from 'react';
import { world } from '../sim';
import { TOD, UW } from './env';
import { SKY_FS, SKY_VS } from '../shaders/sky';
import { CITY_FS, CITY_VS } from '../shaders/city';
import tenementData from '../polyfork-tenement.json';
import { useFrame } from '@react-three/fiber';

// City block mesh, the tenement block and the sky dome.
export function City() {
    const geo = useMemo(() => {
        const g = new THREE.BufferGeometry();
        const ib = new THREE.InterleavedBuffer(world.data, 10);
        g.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0));
        g.setAttribute('normal', new THREE.InterleavedBufferAttribute(ib, 3, 3));
        g.setAttribute('aCol', new THREE.InterleavedBufferAttribute(ib, 3, 6));
        g.setAttribute('aSeed', new THREE.InterleavedBufferAttribute(ib, 1, 9));
        g.setIndex(new THREE.BufferAttribute(world.idx, 1));
        return g;
    }, []);
    const mat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: CITY_VS, fragmentShader: CITY_FS, uniforms: { uFog: { value: TOD.fog }, uTime: { value: 0 }, uSunV: TOD.sunU, uDay: TOD.day, uNoon: TOD.noon } }), []);
    return <mesh geometry={geo} material={mat} frustumCulled={false} />;
}

// Polyfork free game-embedding licence checked October 27, 2026; local peripheral-block prototype.
export function TenementBlock(){
 const geo=useMemo(()=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(tenementData.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(tenementData.n,3));g.setAttribute('color',new THREE.Float32BufferAttribute(tenementData.c,3));return g;},[]);
 const mat=useMemo(()=>new THREE.ShaderMaterial({uniforms:{uBlockDay:TOD.day,uBlockFog:{value:TOD.fog}},vertexShader:`attribute vec3 color;varying vec3 vC;varying vec3 vN;varying float vD;void main(){vC=color;vN=mat3(modelMatrix)*mat3(instanceMatrix)*normal;vec4 wp=modelMatrix*instanceMatrix*vec4(position,1.0);vec4 mv=viewMatrix*wp;vD=length(mv.xyz);gl_Position=projectionMatrix*mv;}`,fragmentShader:`uniform float uBlockDay;uniform vec3 uBlockFog;varying vec3 vC;varying vec3 vN;varying float vD;void main(){float light=.40+.60*max(0.,dot(normalize(vN),normalize(vec3(-.5,1.,.3))));vec3 c=vC*light*(.22+.9*uBlockDay);float glass=1.-step(.012,distance(vC,vec3(.25415,.39157,.47932)));c+=vec3(1.,.584,.275)*.6*(1.-uBlockDay)*glass;float fog=1.-exp(-vD*vD*.000006);gl_FragColor=vec4(mix(c,uBlockFog,fog),1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>}`}),[]);
 const ref=useRef<THREE.InstancedMesh>(null!);useEffect(()=>{const o=new THREE.Object3D();for(let i=0;i<6;i++){o.position.set(-249+(i%3)*9,0,72+Math.floor(i/3)*17);o.rotation.set(0,Math.floor(i/3)?Math.PI:0,0);o.updateMatrix();ref.current.setMatrixAt(i,o.matrix);}ref.current.instanceMatrix.needsUpdate=true;ref.current.computeBoundingSphere();},[]);
 return <instancedMesh ref={ref} args={[geo,mat,6]}/>;
}

export function Sky() {
    const ref = useRef<THREE.Mesh>(null!);
    const mat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, depthTest: false, uniforms: { uHor: { value: TOD.fog }, uT: { value: 0 }, uSunV: TOD.sunU, uDay: TOD.day, uWarm: TOD.warm } }), []);
    useFrame((st) => { mat.uniforms.uT.value = st.clock.elapsedTime; });
    useFrame(({ camera }) => { ref.current.position.copy(camera.position); ref.current.visible = !UW.on; });
    return <mesh ref={ref} material={mat} renderOrder={-10} frustumCulled={false}><sphereGeometry args={[400, 24, 12]} /></mesh>;
}


// cel shading (peaceful cinematic): reference study - Ultimate Spider-Man's "Comic Inking" cel look (https://www.wsgf.org/dr/ultimate-spider-man), comics-inspired cel shading thesis (https://www.theseus.fi/bitstream/handle/10024/787699/Kahari_Roni.pdf), three.js toon banding guides. Lit materials get soft quantized light bands and a thin ink rim; sky/water shaders stay smooth. Own implementation.
THREE.ShaderChunk.opaque_fragment = THREE.ShaderChunk.opaque_fragment.replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );', `
#if defined(USE_LIGHTS) || defined(LAMBERT) || defined(STANDARD) || defined(PHONG)
{
    float cl = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
    float band = floor(cl * 4.0 + 0.5) / 4.0;
    float edge = smoothstep(0.0, 0.07, abs(fract(cl * 4.0 + 0.5) - 0.5)) ;
    vec3 banded = outgoingLight * (max(band, 0.06) / max(cl, 0.02));
    outgoingLight = mix(outgoingLight, banded, 0.78);
    float rimv = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
    outgoingLight *= 1.0 - 0.55 * smoothstep(0.78, 0.95, rimv);
}
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`);

