import { PINE_URL, LEAVES_URL } from './texdata'
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import heroData from './hero.json';
import baseTexUrl from './basetex';
import clipIdle from './clips/idle.json';
import clipJump from './clips/jump.json';
import clipWall from './clips/climbing_wall.json';
import clipPunch from './clips/punch.json';
import clipSwim from './clips/swimming.json';
import clipRun from './clips/run.json';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { world, buildings, WATER_Z, CELL, PARK, parkH, WATER_Y, SEABED, HALF, FOG, stepSim, stepBeacon, resetSim, input, type Sim, type Events } from './sim';

// time of day: one shared state object, materials hold references to its uniform objects and the DayNight component updates them in place
const TOD = { sun: new THREE.Vector3(-0.55, 0.22, 0.8).normalize(), sunU: null as any, day: { value: 1 }, warm: { value: 1 }, noon: { value: 0 }, fog: new THREE.Color(FOG[0], FOG[1], FOG[2]), sky: new THREE.Color('#c4dcef') };
TOD.sunU = { value: TOD.sun };

const DBG = !!(import.meta as any).env.VITE_DBG;   // test hooks only in instrumented builds
const CITY_VS = `attribute vec3 aCol;attribute float aSeed;
varying vec3 vPos;varying vec3 vNor;varying vec3 vCol;varying float vSeed;
void main(){vPos=position;vNor=normal;vCol=aCol;vSeed=aSeed;gl_Position=projectionMatrix*viewMatrix*vec4(position,1.0);}`;
const CITY_FS = `varying vec3 vPos;varying vec3 vNor;varying vec3 vCol;varying float vSeed;
uniform vec3 uFog;uniform float uTime;uniform vec3 uSunV;uniform float uDay;uniform float uNoon;
void main(){
 vec3 n=normalize(vNor);
 vec3 L=normalize(mix(-uSunV,uSunV,step(0.0,uSunV.y))*vec3(1.0,1.0,1.0)+vec3(0.0,0.35,0.0));
 float d=max(dot(n,L),0.0);
 vec3 lit=mix(vec3(0.2,0.24,0.42)+vec3(0.5,0.6,0.95)*d*0.3,vec3(0.62,0.6,0.64)+vec3(1.0,0.84,0.62)*d*0.8*(1.0-0.45*uNoon),uDay);
 vec3 col=vCol*lit;
 if(abs(n.y)<0.5&&vPos.y>0.01&&vSeed<1.5){
  float u=abs(n.x)>0.5?vPos.z:vPos.x;float v=vPos.y;
  vec2 c=vec2(u/2.4,v/3.4);vec2 f=fract(c);vec2 id=floor(c);
  vec2 fwd=fwidth(c);float fa=clamp(max(fwd.x,fwd.y)*1.5,0.0,0.5);
  float w=smoothstep(0.22-fa,0.22+fa+0.001,f.x)*(1.0-smoothstep(0.78-fa,0.78+fa+0.001,f.x))*smoothstep(0.26-fa,0.26+fa+0.001,f.y)*(1.0-smoothstep(0.74-fa,0.74+fa+0.001,f.y))*step(4.0,v);
  vec2 hh=fract((id+floor(vSeed*2048.0+0.5)/2048.0*41.0)*vec2(0.1031,0.1030));hh+=dot(hh,hh.yx+33.33);float h=fract((hh.x+hh.y)*hh.x);
  float on=step(mix(0.3,0.62,uDay),h);
  float onA=mix(on,0.5,smoothstep(0.25,0.5,max(fwd.x,fwd.y)));
  vec3 wc=mix(vec3(0.27,0.38,0.52)*(0.6+0.8*f.y),vec3(0.95,0.74,0.46)*(0.55+0.45*h)*(1.0+0.9*(1.0-uDay)),onA);
  col*=0.82+0.18*step(0.12,f.y);col*=1.0-0.22*step(f.y,0.08)-0.12*step(f.x,0.06);
  col=mix(col,wc+vec3(0.12,0.1,0.2)*(1.0-onA)*d,w);
 }
 if(vSeed>1.5){col=vCol*1.25;}
 if(vPos.y<0.01&&vPos.x>100.0&&vPos.x<260.0&&vPos.z>20.0&&vPos.z<180.0)discard;   // valley: the park floor mesh replaces the street slab here
 if(vPos.y<0.01){
  col=vec3(0.26,0.27,0.31);
  float fx=abs(mod(vPos.x,40.0)-20.0);float fz=abs(mod(vPos.z,40.0)-20.0);
  float dash=step(2.0,mod(vPos.z,4.0));float dash2=step(2.0,mod(vPos.x,4.0));
  col+=vec3(0.85,0.78,0.5)*(step(fx,0.2)*dash+step(fz,0.2)*dash2);
 }
 float q=length(vPos-cameraPosition)*0.0058;float fog=1.0-exp(-q*q*1.4);
 gl_FragColor=vec4(mix(col,uFog,clamp(fog,0.0,1.0)),1.0);
}`;
const SKY_VS = `varying vec3 vDir;void main(){vDir=normalize(position);gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.0);}`;
const SKY_FS = `varying vec3 vDir;uniform vec3 uHor;uniform float uT;uniform vec3 uSunV;uniform float uDay;uniform float uWarm;
void main(){
 float t=clamp(vDir.y*1.6,0.0,1.0);
 vec3 top=mix(vec3(0.16,0.42,0.9),vec3(0.24,0.5,0.86),uWarm);vec3 mid=mix(vec3(0.6,0.8,0.96),vec3(0.96,0.72,0.68),uWarm);
 vec3 c=mix(uHor,mid,smoothstep(0.0,0.25,t));c=mix(c,top,smoothstep(0.2,0.9,t));
 vec3 sun=uSunV;float g=max(dot(normalize(vDir),sun),0.0);
 c+=mix(vec3(1.0,0.95,0.85),vec3(1.0,0.78,0.5),uWarm)*(pow(g,24.0)*0.45+pow(g,220.0)*0.9);
 c=mix(c,vec3(1.0,0.93,0.75)*1.6,smoothstep(0.9975,0.9992,g));
 c+=vec3(1.0,0.7,0.45)*0.28*uWarm*exp(-abs(vDir.y)*9.0)*(0.4+0.6*max(dot(normalize(vec3(vDir.x,0.0,vDir.z)),normalize(vec3(sun.x,0.0,sun.z))),0.0));
 {float ci=sin(vDir.x/(vDir.y+0.25)*3.0+uT*0.01)*0.5+0.5;c=mix(c,vec3(1.0,0.75,0.7),smoothstep(0.55,0.8,t)*smoothstep(0.7,1.0,ci)*0.18);}
 {vec2 st=floor(vDir.xz/(abs(vDir.y)+0.2)*90.0);float r=fract(sin(dot(st,vec2(12.9898,78.233)))*43758.5);
 c+=vec3(1.0)*step(0.9965,r)*smoothstep(0.55,0.9,t)*0.5;}
 // golden-hour cloud deck: 4-octave value noise on a projected plane, lit warm toward the sun, dark undersides
 if(vDir.y>0.02){
  vec2 cp=vDir.xz/(vDir.y+0.12)*1.6+vec2(uT*0.004,0.0);
  float f=0.0,a=0.5;vec2 q=cp;
  for(int i=0;i<4;i++){vec2 ip=floor(q),fp=fract(q);fp=fp*fp*(3.0-2.0*fp);
   float n=mix(mix(fract(sin(dot(ip,vec2(127.1,311.7)))*43758.5),fract(sin(dot(ip+vec2(1,0),vec2(127.1,311.7)))*43758.5),fp.x),mix(fract(sin(dot(ip+vec2(0,1),vec2(127.1,311.7)))*43758.5),fract(sin(dot(ip+vec2(1,1),vec2(127.1,311.7)))*43758.5),fp.x),fp.y);
   f+=n*a;a*=0.5;q=q*2.03+vec2(3.1,1.7);}
  float cov=smoothstep(0.5,0.78,f)*smoothstep(0.02,0.22,vDir.y);
  float sl=pow(max(dot(normalize(vDir),sun),0.0),3.0);
  vec3 cc=mix(vec3(0.42,0.3,0.42),vec3(1.0,0.72,0.58),0.35+0.65*sl);
  cc+=vec3(1.0,0.6,0.35)*pow(g,8.0)*0.4*(1.0-f);
  c=mix(c,cc,cov*0.85);
 }
 {vec3 dn=normalize(vDir);vec3 nc=mix(vec3(0.07,0.08,0.19),vec3(0.012,0.02,0.07),smoothstep(0.0,0.6,dn.y));
  vec2 sq=floor(dn.xz/(abs(dn.y)+0.2)*140.0);float rr=fract(sin(dot(sq,vec2(12.9898,78.233)))*43758.5);nc+=vec3(0.9,0.95,1.0)*step(0.992,rr)*smoothstep(0.05,0.4,dn.y)*0.8;
  float mg=max(dot(dn,-sun),0.0);nc+=vec3(0.75,0.85,1.0)*(pow(mg,60.0)*0.25)+vec3(0.95,0.97,1.0)*smoothstep(0.9988,0.9994,mg)*1.2;
  c=mix(nc,c,uDay);}
 gl_FragColor=vec4(c,1.0);
}`;

const DN_DUR = 300, DN_PH0 = Math.asin(0.22 / 0.95);
const _c1 = new THREE.Color(), _c2 = new THREE.Color(), _cn = new THREE.Color(0.035, 0.055, 0.13), _cnoon = new THREE.Color(0.76, 0.84, 0.93), _cwarm = new THREE.Color(FOG[0], FOG[1], FOG[2]);
const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function DayNight() {
    const { scene } = useThree();
    const ls = useRef<{ h: THREE.HemisphereLight; a: THREE.DirectionalLight; b: THREE.DirectionalLight } | null>(null);
    useFrame((st) => {
        if (!ls.current) { const h = scene.getObjectByName('hemi'), a = scene.getObjectByName('sun1'), b = scene.getObjectByName('sun2'); if (!h || !a || !b) return; ls.current = { h: h as THREE.HemisphereLight, a: a as THREE.DirectionalLight, b: b as THREE.DirectionalLight }; }
        let ph = DN_PH0 + (st.clock.elapsedTime / DN_DUR) * Math.PI * 2; if (DBG && (window as any).__todPh !== undefined) ph = (window as any).__todPh;
        TOD.sun.set(-0.5, Math.sin(ph) * 0.95, Math.cos(ph) * 0.85 + 0.3).normalize();
        const sy = TOD.sun.y, day = sstep(-0.12, 0.3, sy), warm = 1 - sstep(0.25, 0.7, sy);
        if (DBG) (window as any).__tod = { sy, day, warm, fog: TOD.fog.toArray() }; TOD.day.value = day; TOD.warm.value = warm; TOD.noon.value = sstep(0.3, 0.95, sy);
        _c1.copy(_cnoon).lerp(_cwarm, warm).lerp(_cn, 1 - day); TOD.fog.copy(_c1); TOD.sky.copy(_c1).lerp(_c2.set('#c4dcef'), 0.3 * day);
        if (!UW.on) (scene.background as THREE.Color).copy(_c1);
        UWF.value.set('#176e8c').multiplyScalar(0.2 + 0.8 * day);
        { const wu = waterMat.uniforms, k = 0.16 + 0.84 * day; wu.uDeep.value.set('#0a6f92').multiplyScalar(k); wu.uShallow.value.set('#2fa8c4').multiplyScalar(k); }   // water body colour follows the light level (sky reflection already follows TOD.sky)
        const { h, a, b } = ls.current;
        h.color.set('#d4e4ff').lerp(_c2.set('#3a4c8c'), 1 - day); h.intensity = 0.5 + 0.75 * day;
        const up = sy > 0;
        a.position.set(TOD.sun.x * 70 * (up ? 1 : -1), Math.abs(TOD.sun.y) * 70 + 8, TOD.sun.z * 70 * (up ? 1 : -1));
        a.color.set('#fff6ea').lerp(_c2.set('#ffd2a0'), warm).lerp(_c2.set('#ff9a5a'), sstep(0.0, 0.2, 0.2 - sy) * day * 0.7).lerp(_c2.set('#8fb0ff'), 1 - day); a.intensity = 0.5 + 1.3 * day * (1 - 0.4 * TOD.noon.value);
        b.intensity = 0.25 + 0.55 * day;
    });
    return null;
}

// optional post AA (FXAA, one fullscreen pass): can be switched on/off at runtime from measured frame time, unlike MSAA which is fixed at context creation
const _v0 = new THREE.Vector2(0, 0);
const FXAA_FS = `uniform sampler2D tDiffuse; uniform vec2 uRes; varying vec2 vUv;
float lum(vec3 c){ return dot(sqrt(max(c, 0.0)), vec3(0.299, 0.587, 0.114)); }
void main(){
  vec2 px = 1.0 / uRes;
  vec3 cM = texture2D(tDiffuse, vUv).rgb;
  vec3 cNW = texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * px).rgb, cNE = texture2D(tDiffuse, vUv + vec2(1.0, -1.0) * px).rgb;
  vec3 cSW = texture2D(tDiffuse, vUv + vec2(-1.0, 1.0) * px).rgb, cSE = texture2D(tDiffuse, vUv + vec2(1.0, 1.0) * px).rgb;
  float lM = lum(cM), lNW = lum(cNW), lNE = lum(cNE), lSW = lum(cSW), lSE = lum(cSE);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float dr = max((lNW + lNE + lSW + lSE) * 0.25 * 0.125, 1.0 / 128.0);
  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + dr);
  dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * px;
  vec3 a = 0.5 * (texture2D(tDiffuse, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tDiffuse, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(tDiffuse, vUv + dir * -0.5).rgb + texture2D(tDiffuse, vUv + dir * 0.5).rgb);
  float lb = lum(b);
  vec3 col = (lb < lMin || lb > lMax) ? a : b;
  gl_FragColor = vec4(col, 1.0);
}`;
export const FXAA_STATE = { on: false };
function FxaaPass({ enabled }: { enabled: boolean }) {
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

function City() {
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

function Sky() {
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

const tmp = new THREE.Object3D();

// forest park: leafy trees. Reference study: Poly Haven CC0 scanned trees (island_tree_01 leaf atlas, jacaranda bark) - AAA-style alpha-cut leaf cards on a branching trunk; geometry here is my own, low card count for weak devices
const LEAF_BOX = [[14,18,151,526],[166,18,348,404],[708,18,838,426],[367,30,497,373],[527,48,667,374],[219,588,366,1024],[430,615,578,1024],[15,642,189,1024]];
type TreeSpec = { kind: 'broad' | 'umbrella' | 'poplar' | 'pine' | 'spruce'; seed: number };
const PINE_BOX = [[30, 40, 230, 460]];
// broadleaf families share the scanned leaf atlas; each has its own trunk/branch structure and crown shape
function treeGeo(kind: 'broad' | 'umbrella' | 'poplar', seed: number, leafN: number, scaleMul = 1) {
    let r = seed; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
    const trunkP: THREE.BufferGeometry[] = [], leafP: THREE.BufferGeometry[] = [];
    const shape = { broad: { H: 7.5, R: 4.4, sx: 1, sy: 0.85, sz: 1, nb: 6, cyk: 0.35, ls: 1 }, umbrella: { H: 5.2, R: 5.2, sx: 1.5, sy: 0.32, sz: 1.5, nb: 7, cyk: 0.2, ls: 0.62 }, poplar: { H: 5.5, R: 6.2, sx: 0.34, sy: 1, sz: 0.34, nb: 4, cyk: 0.55, ls: 0.8 } }[kind];
    const H = shape.H * (0.9 + rnd() * 0.25), R = shape.R * (0.9 + rnd() * 0.2);
    const tg = new THREE.CylinderGeometry(kind === 'poplar' ? 0.22 : 0.28, kind === 'poplar' ? 0.4 : 0.5, H, 7, 1, true); tg.translate(0, H / 2, 0); trunkP.push(tg);
    const cy = H + R * shape.cyk * (kind === 'poplar' ? 0.7 : 1); const ctr: THREE.Vector3[] = [];
    for (let i = 0; i < shape.nb; i++) { const ang = rnd() * 6.28; const len = R * (0.7 + rnd() * 0.4) * (kind === 'poplar' ? 0.25 : 1); const bg = new THREE.CylinderGeometry(0.06, 0.16, len, 5, 1, true); bg.translate(0, len / 2, 0); bg.rotateZ(kind === 'umbrella' ? 1.0 + rnd() * 0.3 : 0.7 + rnd() * 0.5); bg.rotateY(ang); bg.translate(0, H * (0.55 + rnd() * 0.3), 0); trunkP.push(bg); ctr.push(new THREE.Vector3(Math.cos(ang) * R * 0.55 * shape.sx, cy + (rnd() - 0.4) * R * 0.5 * shape.sy, Math.sin(ang) * R * 0.55 * shape.sz)); }
    ctr.push(new THREE.Vector3(0, cy + R * 0.3 * shape.sy, 0));
    for (let i = 0; i < leafN; i++) {
        const c = ctr[Math.floor(rnd() * ctr.length)]; const bx = LEAF_BOX[Math.floor(rnd() * 8)];
        const u = new THREE.Vector3(rnd() - 0.5, (rnd() - 0.5) * 0.8, rnd() - 0.5).normalize().multiplyScalar(R * 0.62 * Math.cbrt(rnd())); u.x *= shape.sx; u.y *= shape.sy; u.z *= shape.sz;
        const w = (bx[2] - bx[0]) / 1024, h = (bx[3] - bx[1]) / 1024, sc = 4.0 * scaleMul * shape.ls * (0.7 + rnd() * 0.6);
        const g = new THREE.PlaneGeometry(w * sc, h * sc); g.translate(0, h * sc / 2, 0);
        const uv = g.attributes.uv; for (let k = 0; k < 4; k++) uv.setXY(k, bx[0] / 1024 + uv.getX(k) * w, 1 - bx[3] / 1024 + uv.getY(k) * h);
        const e = new THREE.Euler((rnd() - 0.5) * 2.2 + 0.5, rnd() * 6.28, (rnd() - 0.5) * 1.2);
        g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(e)); g.translate(c.x + u.x, c.y + u.y, c.z + u.z);
        const col = new Float32Array(12), shade = 0.8 + 0.3 * ((u.y / R + 0.6)); for (let k = 0; k < 4; k++) { col[k * 3] = shade; col[k * 3 + 1] = shade; col[k * 3 + 2] = shade * 0.95; } g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        leafP.push(g);
    }
    return { trunk: mergeGeometries(trunkP, false)!, leaves: mergeGeometries(leafP, false)! };
}
// conifers: whorled branches carrying scanned pine needle sprays (Poly Haven pine_tree_01 twig). pine = tall bare trunk, open crown; spruce = full conical, drooping branches
const _q = new THREE.Quaternion(), _Y = new THREE.Vector3(0, 1, 0);
function coniferGeo(kind: 'pine' | 'spruce', seed: number, bpw: number, cpb: number, cardMul: number) {
    let r = seed; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
    const trunkP: THREE.BufferGeometry[] = [], leafP: THREE.BufferGeometry[] = [];
    const pine = kind === 'pine'; const H = (pine ? 12 : 10.5) * (0.9 + rnd() * 0.2), W = pine ? 9 : 14;
    const tg = new THREE.CylinderGeometry(pine ? 0.16 : 0.12, pine ? 0.42 : 0.4, H, 7, 1, true); tg.translate(0, H / 2, 0); trunkP.push(tg);
    const bx = PINE_BOX[0], w = (bx[2] - bx[0]) / 1024, h = (bx[3] - bx[1]) / 1024;
    const card = (pos: THREE.Vector3, dir: THREE.Vector3, len: number, shade: number) => {
        for (let pl = 0; pl < 2; pl++) {
            const g = new THREE.PlaneGeometry(len * (w / h) * 1.15, len); g.translate(0, len * 0.5, 0);
            const uv = g.attributes.uv; for (let k = 0; k < 4; k++) uv.setXY(k, bx[0] / 1024 + uv.getX(k) * w, 1 - bx[3] / 1024 + uv.getY(k) * h);
            _q.setFromUnitVectors(_Y, dir); const roll = rnd() * 6.28 + pl * 1.5708;
            g.applyMatrix4(new THREE.Matrix4().makeRotationY(roll)); g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(_q)); g.translate(pos.x, pos.y, pos.z);
            const col = new Float32Array(12); for (let k = 0; k < 4; k++) { col[k * 3] = shade; col[k * 3 + 1] = shade; col[k * 3 + 2] = shade; } g.setAttribute('color', new THREE.BufferAttribute(col, 3)); leafP.push(g);
        }
    };
    for (let i = 0; i < W; i++) {
        const f = i / (W - 1), y = pine ? H * (0.5 + 0.48 * f) : H * (0.12 + 0.86 * f);
        const Lb = pine ? 3.4 * (1 - 0.55 * f) + 0.5 : 4.2 * (1 - f) + 0.5;
        const el = pine ? -0.05 + 0.45 * f : -0.4 + 0.3 * f; const off = rnd() * 6.28;
        for (let b = 0; b < bpw; b++) {
            const ang = off + (b / bpw) * 6.28 + (rnd() - 0.5) * 0.5; const dir = new THREE.Vector3(Math.cos(ang), el + (rnd() - 0.5) * 0.2, Math.sin(ang)).normalize();
            const L = Lb * (0.8 + rnd() * 0.4);
            if (pine) { const bg = new THREE.CylinderGeometry(0.03, 0.09, L, 4, 1, true); bg.translate(0, L / 2, 0); _q.setFromUnitVectors(_Y, dir); bg.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(_q)); bg.translate(0, y, 0); trunkP.push(bg); }
            for (let c = 0; c < cpb; c++) {
                const t = 0.3 + 0.7 * (c + 1) / cpb; const p = new THREE.Vector3(0, y, 0).addScaledVector(dir, L * t);
                const cd = dir.clone(); cd.y += pine ? 0.25 : 0.1 - 0.5 * t; cd.x += (rnd() - 0.5) * 0.5; cd.z += (rnd() - 0.5) * 0.5; cd.normalize();
                card(p, cd, (pine ? 2.6 : 2.1) * cardMul * (0.8 + rnd() * 0.4), (pine ? 0.9 : 0.62) + 0.3 * f);
            }
        }
    }
    for (let k = 0; k < 3; k++) card(new THREE.Vector3(0, H * 0.96, 0), new THREE.Vector3((rnd() - 0.5) * 0.3, 1, (rnd() - 0.5) * 0.3).normalize(), 2.0 * cardMul, 0.95);
    return { trunk: mergeGeometries(trunkP, false)!, leaves: mergeGeometries(leafP, false)! };
}
const TREE_TYPES: { kind: TreeSpec['kind']; seed: number }[] = [{ kind: 'broad', seed: 11 }, { kind: 'pine', seed: 31 }, { kind: 'spruce', seed: 57 }, { kind: 'umbrella', seed: 77 }, { kind: 'poplar', seed: 1234 }, { kind: 'pine', seed: 99 }];
const TREE_PATTERN = [0, 1, 2, 0, 5, 3, 1, 2, 4, 0, 1, 5, 2, 3, 0, 4, 1, 2, 5, 0];

// Underwater life (user must-haves 10:29): kelp forest, jellyfish, tiny bubbles, god rays, current drift. Reference cues (viewed underwater shots): cyan light band near the surface, light shafts, sandy floor, haze to teal. All procedural approximations, small instance counts.
const UW_FOG = 'vec3(0.09, 0.43, 0.55)';
const kelpMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `uniform float uTime; varying vec3 vW; varying float vH;
    void main(){ vec3 p = position; float h = clamp(p.y / 6.0, 0.0, 1.0); vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float cur = sin(uTime * 0.7 + ip.x * 0.15 + ip.z * 0.1 + p.y * 0.5) * 0.7 + sin(uTime * 0.4 + p.y * 0.9) * 0.2;
      p.x += cur * h * h; p.z += cos(uTime * 0.6 + ip.z * 0.2 + p.y * 0.4) * 0.35 * h * h;
      vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0); vW = w.xyz; vH = h; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `varying vec3 vW; varying float vH;
    void main(){ vec3 col = mix(vec3(0.12, 0.30, 0.16), vec3(0.42, 0.62, 0.22), vH); float d = length(vW - cameraPosition); col = col * exp(-vec3(0.45, 0.07, 0.02) * d * 0.5) + ${UW_FOG} * (1.0 - exp(-d * 0.028)); gl_FragColor = vec4(col, 1.0); }`,
    side: THREE.DoubleSide,
});
const rayMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec2 vU; uniform float uTime; void main(){ float width = mix(0.16,0.32,1.0-vU.y); float edge = 1.0-smoothstep(width*0.25,width,abs(vU.x-0.5)); float endFade = smoothstep(0.0,0.20,vU.y)*(1.0-smoothstep(0.82,1.0,vU.y)); float a = edge * endFade * pow(vU.y, 1.2) * (0.55 + 0.45 * sin(uTime * 0.8 + vU.y * 3.0 + vU.x * 5.0)); gl_FragColor = vec4(vec3(0.6, 0.95, 1.0) * a * 0.5, a * 0.5); }',
});
// Round bubble glints, same point count and size as before; no texture fetch.
const bubbleMat = new THREE.PointsMaterial({color:'#dff8ff',size:0.09,sizeAttenuation:true,transparent:true,opacity:0.7,depthWrite:false});
bubbleMat.onBeforeCompile = (shader) => { shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nfloat br=length(gl_PointCoord-0.5);if(br>0.5)discard;').replace('#include <opaque_fragment>', 'diffuseColor.a*=(1.0-smoothstep(0.32,0.5,br))*(0.32+0.68*smoothstep(0.22,0.40,br));\n#include <opaque_fragment>'); };
bubbleMat.customProgramCacheKey = () => 'round-bubble-v1';
const jellyMat = new THREE.MeshBasicMaterial({ color: '#c9a4ff', transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
function Underwater({ sim }: { sim: Sim }) {
    const kelp = useRef<THREE.InstancedMesh>(null!), jel = useRef<THREE.InstancedMesh>(null!), bub = useRef<THREE.Points>(null!), rays = useRef<THREE.Group>(null!);
    const kGeo = useMemo(() => { const g = new THREE.PlaneGeometry(0.5, 6, 1, 6); g.translate(0, 3, 0); return g; }, []);
    const jGeo = useMemo(() => { const bell = new THREE.SphereGeometry(0.55, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.55), tens: THREE.BufferGeometry[] = []; for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283, c = new THREE.PlaneGeometry(0.05, 1.3 + (i % 3) * 0.3, 1, 4); c.translate(0, -0.65 - (i % 3) * 0.15, 0); c.rotateY(a); c.translate(Math.cos(a) * 0.3, 0.0, Math.sin(a) * 0.3); tens.push(c); } return mergeGeometries([bell, ...tens], false)!; }, []);
    const bGeo = useMemo(() => { const n = 140, p = new Float32Array(n * 3); let r = 5; const rn = () => (r = (r * 16807) % 2147483647) / 2147483647; for (let i = 0; i < n * 3; i++) p[i] = rn(); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); return g; }, []);
    const jp = useMemo(() => { let r = 11; const rn = () => (r = (r * 16807) % 2147483647) / 2147483647; return Array.from({ length: 12 }, () => ({ x: 20 + (rn() - 0.5) * 120, z: WATER_Z - 14 - rn() * 50, y: -3 - rn() * 4.5, ph: rn() * 6.28, s: 0.8 + rn() })); }, []);
    useEffect(() => {
        let r = 3; const rn = () => (r = (r * 16807) % 2147483647) / 2147483647; const o = new THREE.Object3D();
        for (let i = 0; i < 1400; i++) { const cx = (rn() - 0.5) * 2 * (HALF - 20), cz = WATER_Z - 6 - rn() * 110, k = 0.6 + rn() * 1.1; o.position.set(cx, SEABED, cz); o.rotation.set(0, rn() * 3.14, 0); o.scale.set(k * (0.5 + rn() * 0.6), 0.45 + rn() * 1.0, k); o.updateMatrix(); kelp.current.setMatrixAt(i, o.matrix); }
        kelp.current.instanceMatrix.needsUpdate = true;
    }, []);
    const pt = useMemo(() => ({ c: new THREE.Object3D() }), []);
    useFrame((st) => {
        const t = sim.t, hx = sim.pos[0], hy = sim.pos[1], hz = sim.pos[2], inBay = hz < WATER_Z + 6, under = inBay && st.camera.position.y < WATER_Y + 1.5 && sim.mode === 'play';
        kelpMat.uniforms.uTime.value = t; rayMat.uniforms.uTime.value = t;
        kelp.current.visible = inBay; jel.current.visible = inBay; const cu = under && st.camera.position.y < WATER_Y - 0.05; bub.current.visible = cu; rays.current.visible = cu;   // shafts and bubbles only once the camera is really below the surface (they showed as thin dark dashes at the horizon just above water)
        if (!inBay) return;
        for (let i = 0; i < jp.length; i++) { const j = jp[i], pul = Math.sin(t * 2.2 + j.ph); pt.c.position.set(j.x + Math.sin(t * 0.15 + j.ph) * 6, j.y + Math.sin(t * 0.3 + j.ph) * 1.2, j.z + Math.cos(t * 0.12 + j.ph) * 5); pt.c.scale.set(j.s * (1 + pul * 0.12), j.s * (1 - pul * 0.18), j.s * (1 + pul * 0.12)); pt.c.rotation.set(0, 0, 0); pt.c.updateMatrix(); jel.current.setMatrixAt(i, pt.c.matrix); }
        jel.current.instanceMatrix.needsUpdate = true;
        if (under) {
            const pa = bub.current.geometry.attributes.position as THREE.BufferAttribute, B = 7;   // bubbles: unit-box seeds wrapped around the hero, rising with a current drift
            const cur = Math.sin(t * 0.3) * 0.5;
            for (let i = 0; i < pa.count; i++) { const sx = (i * 0.618) % 1, sz = (i * 0.382 + 0.2) % 1, sp = 0.5 + ((i * 0.137) % 1) * 0.9; const ry = ((((i * 0.29) % 1) + t * 0.06 * sp) % 1); pa.setXYZ(i, hx + (sx - 0.5) * B * 2 + cur * ry * 4, WATER_Y - 6 + ry * 6 + Math.min(0, hy + 4) * 0.0, hz + (sz - 0.5) * B * 2 + Math.sin(t * 0.8 + i) * 0.1); }
            pa.needsUpdate = true; bub.current.geometry.computeBoundingSphere();
            rays.current.position.set(hx, WATER_Y + 0.1, hz); rays.current.rotation.y = 0;
        }
    });
    return <group>
        <instancedMesh ref={kelp} args={[kGeo, kelpMat, 1400]} frustumCulled={false} />
        <instancedMesh ref={jel} args={[jGeo, jellyMat, 12]} renderOrder={-1} frustumCulled={false} />
        <points ref={bub} geometry={bGeo} frustumCulled={false}><primitive object={bubbleMat} attach="material" /></points>
        <group ref={rays}>{Array.from({ length: 8 }, (_, i) => <mesh key={i} position={[(i - 3.5) * 3.2, -6, ((i * 7) % 5) * 2 - 4]} rotation={[0, i * 0.4, 0.22]} material={rayMat}><planeGeometry args={[2.4 + (i % 3), 12]} /></mesh>)}</group>
    </group>;
}

function Forest({ sim }: { sim: Sim }) {
    const lo = useRef<THREE.InstancedMesh[]>([]), last = useRef([1e9, 1e9]);
    const grass = useRef<THREE.Mesh>(null!), tr = useRef<THREE.InstancedMesh[]>([]), lf = useRef<THREE.InstancedMesh[]>([]), bush = useRef<THREE.InstancedMesh>(null!);
    const [leafTex, barkTex, pineTex, pbarkTex] = useMemo(() => { const l = new THREE.TextureLoader(); const mk = (u: string, rep = false) => { const t = l.load(u); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 3); } return t; }; const ink = (u: string) => {   // leaf card with a thin dark ink rim: original alpha dilated by r px, rim painted dark (cel silhouette ink, ref: Kyle Agnew toon grassland); drawn once at load, no runtime cost
            const cv = document.createElement('canvas'); cv.width = cv.height = 512; const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
            const im = new Image(); im.onload = () => { const c = cv.getContext('2d')!, tc = document.createElement('canvas'); tc.width = tc.height = 512; const x = tc.getContext('2d')!; x.drawImage(im, 0, 0, 512, 512); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#0b1a0e'; x.fillRect(0, 0, 512, 512);
                for (let k = 0; k < 12; k++) { const an = k / 12 * 6.2832; c.drawImage(tc, Math.cos(an) * INK_R, Math.sin(an) * INK_R); } c.drawImage(im, 0, 0, 512, 512); t.needsUpdate = true; }; im.src = u; return t; };
        return [ink(LEAVES_URL), mk('/bark.jpg', true), ink(PINE_URL), mk('/pinebark.jpg', true)]; }, []);
    const geos = useMemo(() => TREE_TYPES.map(({ kind, seed }) => {
        const con = kind === 'pine' || kind === 'spruce';
        const hi = con ? coniferGeo(kind, seed, kind === 'pine' ? 5 : 6, 3, 1) : treeGeo(kind as any, seed, kind === 'broad' ? 420 : 340, 1.35);
        const lw = con ? coniferGeo(kind, seed, 3, 2, 1.6).leaves : treeGeo(kind as any, seed, 110, 2.1).leaves;
        return { trunk: hi.trunk, leaves: hi.leaves, lo: lw, con };
    }), []);
    const pts = useMemo(() => { let r = 7; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647; const a: { x: number; z: number; s: number; c: number; v: number }[] = []; for (let i = 0; i < 600 && a.length < 130; i++) { const px = PARK.x0 + 6 + rnd() * (PARK.x1 - PARK.x0 - 12), pz = PARK.z0 + 6 + rnd() * (PARK.z1 - PARK.z0 - 12), cxm = (PARK.x0 + PARK.x1) / 2, czm = (PARK.z0 + PARK.z1) / 2; if (Math.hypot(px - cxm, pz - czm) < 54 || Math.abs((px - cxm) - (pz - czm) * 0.6) < 6) continue; if (rnd() < 0.2) continue; a.push({ x: px, z: pz, s: 0.8 + rnd() * 0.5, c: rnd(), v: TREE_PATTERN[a.length % TREE_PATTERN.length] }); }
        return a; }, []);
    const NT = TREE_TYPES.length;
    const place = (hx: number, hz: number) => {
        const o = new THREE.Object3D(), col = new THREE.Color(); const ct = Array(NT).fill(0), ch = Array(NT).fill(0), cl = Array(NT).fill(0);
        pts.forEach((p) => { const d = Math.hypot(p.x - hx, p.z - hz); if (d > 230) return; o.rotation.set(0, p.c * 6.28, 0); o.position.set(p.x, 0.05 + parkH(p.x, p.z), p.z); o.scale.set(p.s, p.s * (0.9 + p.c * 0.25), p.s); o.updateMatrix(); const v = p.v; { const q = (Math.sin(p.x * 0.37 + p.z * 0.21) + 1) * 0.5, w = (p.c * 7.3) % 1; col.setHSL(geos[v].con ? 0.31 + (w - 0.5) * 0.06 : 0.12 + q * 0.2 + w * 0.05, geos[v].con ? 0.28 : 0.45 + w * 0.2, 0.62 + ((p.c * 3.1) % 1) * 0.38); } tr.current[v].setMatrixAt(ct[v]++, o.matrix); const M = d < 45 ? lf.current[v] : lo.current[v], k = d < 45 ? ch : cl; M.setMatrixAt(k[v], o.matrix); M.setColorAt(k[v]++, col); });
        for (let v = 0; v < NT; v++) { tr.current[v].count = ct[v]; lf.current[v].count = ch[v]; lo.current[v].count = cl[v]; [tr.current[v], lf.current[v], lo.current[v]].forEach((m) => { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); }); }
    };
    useFrame(() => { const hx = sim.pos[0], hz = sim.pos[2]; if (Math.hypot(hx - last.current[0], hz - last.current[1]) > 6) { last.current = [hx, hz]; place(hx, hz); } });
    useEffect(() => {
        const o = new THREE.Object3D(), col = new THREE.Color(); place(1e5, 1e5); last.current = [1e9, 1e9];
        for (let i = 0; i < 70; i++) { const p = pts[i % pts.length], k = 0.8 + p.c; o.rotation.set(0, p.c * 9, 0); o.position.set(p.x + 3 + (i % 5), 0.6 * k + parkH(p.x + 3 + (i % 5), p.z + 2), p.z + 2); o.scale.set(k * (0.8 + (i % 3) * 0.25), k * (0.55 + (i % 4) * 0.12), k * (0.8 + ((i + 1) % 3) * 0.25)); o.updateMatrix(); bush.current.setMatrixAt(i, o.matrix); bush.current.setColorAt(i, col.setHSL(0.17 + ((p.c * 5.7) % 1) * 0.25, 0.4 + ((p.c * 2.3) % 1) * 0.3, 0.22 + ((p.c * 9.1) % 1) * 0.28)); }
        bush.current.instanceMatrix.needsUpdate = true; bush.current.instanceColor!.needsUpdate = true;
    }, [pts]);
    const cx = (PARK.x0 + PARK.x1) / 2, cz = (PARK.z0 + PARK.z1) / 2;
    useFrame(() => { const gm2 = grass.current && (grass.current.material as THREE.MeshLambertMaterial); if (gm2) { const nn2 = 1 - TOD.day.value; gm2.color.setRGB(1 - 0.35 * nn2, 1 - 0.12 * nn2, 1 + 0.35 * nn2); gm2.emissive.setRGB(0.0, 0.002 * nn2, 0.006 * nn2); } });   // night: cool the ground tone to match the cool tufts
    const terrain = useMemo(() => {   // displaced grids following parkH, in world-aligned coordinates around (cx, cz)
        const mk = (w: number, h: number, sw: number, sh: number, yaw: number, lift: number) => { const g = new THREE.PlaneGeometry(w, h, sw, sh); g.rotateX(-Math.PI / 2); g.rotateY(yaw); const pa = g.attributes.position; for (let i = 0; i < pa.count; i++) pa.setY(i, parkH(cx + pa.getX(i), cz + pa.getZ(i)) + lift); g.computeVertexNormals(); return g; };
        const fl = mk(PARK.x1 - PARK.x0, PARK.z1 - PARK.z0, 80, 80, 0, 0);
        { // flat 3-tone meadow fills (light / mid / dark patches, hue drifts yellow on the light ones), as in the toon-grassland refs; vertex colours, no extra cost
            const pa = fl.attributes.position, ca = new Float32Array(pa.count * 3), c0 = new THREE.Color('#63805b'), cl = new THREE.Color('#7c9469'), cd = new THREE.Color('#506b4b'), tc = new THREE.Color();
            for (let i = 0; i < pa.count; i++) { const x = cx + pa.getX(i), z = cz + pa.getZ(i), n = Math.sin(x * 0.045 + 1) * Math.cos(z * 0.06) + 0.5 * Math.sin(x * 0.11 + z * 0.07 + 2), t = Math.max(-1, Math.min(1, n * 1.1)) * 0.7, q = Math.round(t * 8) / 8; if (q >= 0) tc.copy(c0).lerp(cl, q); else tc.copy(c0).lerp(cd, -q); ca[i * 3] = tc.r; ca[i * 3 + 1] = tc.g; ca[i * 3 + 2] = tc.b; }
            fl.setAttribute('color', new THREE.BufferAttribute(ca, 3));
        }
        return { floor: fl, path: mk(8, 190, 2, 90, Math.atan(0.6), 0.04) };
    }, []);
    return <group>
        <mesh ref={grass} position={[cx, 0.05, cz]} geometry={terrain.floor}><meshLambertMaterial color="#ffffff" vertexColors /></mesh>
        <mesh position={[cx, 0.09, cz]} geometry={terrain.path}><meshLambertMaterial color="#b89865" /></mesh>
        {geos.map((g, v) => <group key={v}>
            <instancedMesh ref={(m) => { if (m) tr.current[v] = m; }} args={[g.trunk, undefined, 70]} frustumCulled={false}><meshLambertMaterial map={g.con ? pbarkTex : barkTex} emissive="#4a3a2c" side={THREE.DoubleSide} /></instancedMesh>
            <instancedMesh ref={(m) => { if (m) lo.current[v] = m; }} args={[g.lo, undefined, 70]}><meshLambertMaterial map={g.con ? pineTex : leafTex} vertexColors emissive="#2b4a22" alphaTest={0.5} side={THREE.DoubleSide} /></instancedMesh>
            <instancedMesh ref={(m) => { if (m) lf.current[v] = m; }} args={[g.leaves, undefined, 70]}><meshLambertMaterial map={g.con ? pineTex : leafTex} vertexColors emissive="#2b4a22" alphaTest={0.5} side={THREE.DoubleSide} /></instancedMesh>
        </group>)}
        <instancedMesh ref={bush} args={[undefined, undefined, 70]} frustumCulled={false}><icosahedronGeometry args={[1.2, 1]} /><meshLambertMaterial color="#ffffff" /></instancedMesh>
    </group>;
}


// park floor: no flat green between tufts - value noise plus fine blade streaks in world space, so the gaps read as grass undergrowth (ref: BotW grassland ground mottling)
const floorGrass = (sh: any) => {
    sh.vertexShader = 'varying vec2 vFx;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vFx = (modelMatrix * vec4(position, 1.0)).xz;');
    sh.uniforms.uDayG = TOD.day; sh.fragmentShader = 'varying vec2 vFx; uniform float uDayG;\nfloat fh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\nfloat fn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(fh(i), fh(i + vec2(1.0, 0.0)), f.x), mix(fh(i + vec2(0.0, 1.0)), fh(i + vec2(1.0, 1.0)), f.x), f.y); }\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n float m1 = sin(vFx.x * 0.21) * sin(vFx.y * 0.17), m2 = sin(vFx.x * 1.1 + vFx.y * 0.8) * sin(vFx.y * 1.3 - vFx.x * 0.4); diffuseColor.rgb *= 0.88 + 0.07 * m1 + 0.04 * m2; diffuseColor.rgb *= mix(vec3(0.66, 0.9, 1.1), vec3(1.0), uDayG); ');
};
// meadow: long grass tufts + subtle flowers + fireflies. Reference study: instanced blade-cluster grass with wind sway in the vertex shader (common real-time approach, e.g. GDC "Ghost of Tsushima" grass talk, three.js instanced grass guides); blade shapes, colours and placement are mine
const INK_R = 2;
const GR_POOL = (() => { let r = 4242; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647; const cx = (PARK.x0 + PARK.x1) / 2, cz = (PARK.z0 + PARK.z1) / 2; const a: number[] = []; for (let i = 0; i < 26000; i++) { const x = PARK.x0 + 3 + rnd() * (PARK.x1 - PARK.x0 - 6), z = PARK.z0 + 3 + rnd() * (PARK.z1 - PARK.z0 - 6); if (Math.abs((x - cx) - (z - cz) * 0.6) < 6.5 || Math.hypot(x - cx, z - cz) < 4) continue; a.push(x, z, rnd(), rnd()); } return a; })();
function tuftGeo() {
    const pos: number[] = [], col: number[] = []; let r = 5; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
    for (let b = 0; b < 7; b++) {
        const a = rnd() * 6.28, ox = (rnd() - 0.5) * 0.35, oz = (rnd() - 0.5) * 0.35, h = 0.8 + rnd() * 0.7, w = 0.05 + rnd() * 0.03, lean = (0.15 + rnd() * 0.45) * h;
        const dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx;
        // two-segment blade: base quad to mid, then a tip
        const mid = [ox + dx * lean * 0.25, h * 0.55, oz + dz * lean * 0.25], tip = [ox + dx * lean, h, oz + dz * lean];
        const v = [[ox - px * w, 0, oz - pz * w], [ox + px * w, 0, oz + pz * w], [mid[0] - px * w * 0.6, mid[1], mid[2] - pz * w * 0.6], [mid[0] + px * w * 0.6, mid[1], mid[2] + pz * w * 0.6], tip];
        for (const t of [[0, 1, 2], [1, 3, 2], [2, 3, 4]]) t.forEach((i) => { pos.push(...v[i]); const k = v[i][1] / h; col.push(0.34 + 0.36 * k, 0.47 + 0.31 * k, 0.29 + 0.19 * k); });
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
}
const FL_COL = ['#8a5cf0', '#4f7cff', '#e03a4a', '#ff7fb8'];
function Meadow({ sim }: { sim: Sim }) {
    const gr = useRef<THREE.InstancedMesh>(null!), fl = useRef<THREE.InstancedMesh>(null!), ff = useRef<THREE.Points>(null!), last = useRef([1e9, 1e9]), uni = useRef({ uTime: { value: 0 }, uHero: { value: new THREE.Vector3() }, uCam: { value: new THREE.Vector3() } }), fu = useRef({ uTime: { value: 0 } });
    useFrame((st) => { uni.current.uHero.value.set(sim.pos[0], sim.pos[1], sim.pos[2]); uni.current.uCam.value.copy(st.camera.position); const m = gr.current && (gr.current.material as THREE.MeshLambertMaterial); if (m) m.emissive.set('#1c3410').multiplyScalar(0.12 + 0.88 * TOD.day.value); });   // tuft self-light follows the day level so grass does not glow at night
    const geo = useMemo(tuftGeo, []);
    const flGeo = useMemo(() => { const g = new THREE.CircleGeometry(0.17, 7); g.rotateX(-Math.PI / 2.4); g.translate(0, 0.62, 0); const st = new THREE.PlaneGeometry(0.02, 0.62); st.translate(0, 0.31, 0); return mergeGeometries([g, st], false)!; }, []);
    const ffGeo = useMemo(() => { const n = 90, p = new Float32Array(n * 3), ph = new Float32Array(n); let r = 99; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647; for (let i = 0; i < n; i++) { p[i * 3] = PARK.x0 + 10 + rnd() * (PARK.x1 - PARK.x0 - 20); p[i * 3 + 2] = PARK.z0 + 10 + rnd() * (PARK.z1 - PARK.z0 - 20); p[i * 3 + 1] = 0.8 + rnd() * 5 + parkH(p[i * 3], p[i * 3 + 2]); ph[i] = rnd() * 6.28; } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('ph', new THREE.BufferAttribute(ph, 1)); return g; }, []);
    const place = (hx: number, hz: number) => {
        const o = new THREE.Object3D(), col = new THREE.Color(); let gi = 0, fi = 0;
        for (let i = 0; i < GR_POOL.length && gi < 6500; i += 4) {
            const x = GR_POOL[i], z = GR_POOL[i + 1]; if (Math.hypot(x - hx, z - hz) > 70) continue;
            o.position.set(x, 0.05 + parkH(x, z), z); o.rotation.set(0, GR_POOL[i + 2] * 6.28, 0); const cl = Math.sin(x * 0.11 + 1.3) * Math.cos(z * 0.09), sc = (1.0 + GR_POOL[i + 3] * 0.7) * (1 + 0.4 * cl) * (1 + 0.04 * Math.max(0, -parkH(x, z)));   o.scale.set(sc, sc, sc); o.updateMatrix(); gr.current.setMatrixAt(gi, o.matrix); gr.current.setColorAt(gi++, col.setHSL(0.22 + GR_POOL[i + 3] * 0.1 - 0.045 * cl + 0.03 * Math.sin(x * 0.045 + z * 0.06), 0.30 + 0.06 * cl, 0.34 + GR_POOL[i + 2] * 0.10 + 0.065 * cl));
            if (GR_POOL[i + 2] < 0.12 && fi < 420) { o.position.set(x + 0.2, 0.05 + parkH(x + 0.2, z), z); o.scale.setScalar(0.8 + GR_POOL[i + 3] * 0.6); o.updateMatrix(); fl.current.setMatrixAt(fi, o.matrix); fl.current.setColorAt(fi++, col.set(FL_COL[Math.floor(GR_POOL[i + 3] * 4) % 4])); }
        }
        gr.current.count = gi; fl.current.count = fi; [gr.current, fl.current].forEach((m) => { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); });
    };
    useFrame((st) => { uni.current.uTime.value = fu.current.uTime.value = st.clock.elapsedTime; const hx = sim.pos[0], hz = sim.pos[2]; if (Math.hypot(hx - last.current[0], hz - last.current[1]) > 8) { last.current = [hx, hz]; place(hx, hz); } });
    const onGrass = (sh: any) => { sh.uniforms.uTime = uni.current.uTime; sh.uniforms.uHero = uni.current.uHero; sh.uniforms.uCam = uni.current.uCam; sh.vertexShader = 'uniform float uTime; uniform vec3 uHero; uniform vec3 uCam;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n float hh = position.y; transformed.y *= mix(0.4, 1.0, smoothstep(0.9, 3.8, length(instanceMatrix[3].xz - uHero.xz))) * mix(0.3, 1.0, smoothstep(1.5, 5.5, length(instanceMatrix[3].xz - uCam.xz))); float wv = sin(uTime * 0.9 + instanceMatrix[3].x * 0.07 + instanceMatrix[3].z * 0.045) * 0.5 + 0.5; transformed.x += (sin(uTime * 1.5 + instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.22) * 0.1 + wv * 0.38) * hh * hh; transformed.y -= wv * 0.12 * hh * hh; transformed.z += cos(uTime * 1.2 + instanceMatrix[3].z * 0.3) * 0.1 * hh * hh; vHt = clamp(position.y / 0.9, 0.0, 1.0);').replace('void main() {', 'varying float vHt;\nvoid main() {');
        // grass optics (ref: BotW grassland, blades dark at the root and sun-lit translucent yellow-green at the tips): base occlusion, bright backlit tips, soft sheen
        sh.uniforms.uDayG = TOD.day; sh.fragmentShader = 'varying float vHt; uniform float uDayG;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight *= mix(0.8, 1.15, vHt); outgoingLight *= mix(vec3(0.62, 0.86, 1.12), vec3(1.0), uDayG); outgoingLight += mix(vec3(0.05, 0.11, 0.2), vec3(0.25, 0.32, 0.17), uDayG) * vHt * vHt * 0.32;\n#include <opaque_fragment>'); };   // night: tips glow cool blue-grey, not yellow (ref: moonlit meadow)
    return <group>
        <instancedMesh ref={gr} args={[geo, undefined, 6500]} frustumCulled={true}><meshLambertMaterial vertexColors emissive="#1c3410" side={THREE.DoubleSide} onBeforeCompile={onGrass} /></instancedMesh>
        <instancedMesh ref={fl} args={[flGeo, undefined, 420]}><meshLambertMaterial emissive="#555555" side={THREE.DoubleSide} /></instancedMesh>
        <points ref={ff} geometry={ffGeo} frustumCulled={false}><shaderMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending} uniforms={fu.current} vertexShader={`uniform float uTime; attribute float ph; varying float vA; void main(){ vec3 p = position; p.x += sin(uTime*0.4+ph*3.0)*2.5; p.z += cos(uTime*0.35+ph*2.0)*2.5; p.y += sin(uTime*0.7+ph)*0.8; vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv; vA = 0.35+0.65*pow(0.5+0.5*sin(uTime*1.6+ph*5.0),2.0); gl_PointSize = clamp(38.0/(-mv.z), 2.0, 9.0); }`} fragmentShader={`varying float vA; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,d); gl_FragColor = vec4(1.0,0.86,0.25,1.0)*a*a*vA*1.6; }`} /></points>
    </group>;
}

function SnareLines({ sim }: { sim: Sim }) {
    const ref = useRef<THREE.LineSegments>(null!);
    const geo = useMemo(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 2 * 2 * 3), 3)); return g; }, []);
    useFrame(() => { const sa = sim as any, a = geo.attributes.position as THREE.BufferAttribute; let n = 0;
        if (sa.snareT > 0.45) { const hw = sa.handW as number[][] | undefined; (sa.snareList as any[]).forEach((e, i) => { if (e.down > 0 || i > 3) return; for (let sd = 0; sd < 2; sd++) { const o = n * 2, hp = hw ? hw[sd] : [sim.pos[0], sim.pos[1] + 1.5, sim.pos[2]]; a.setXYZ(o, hp[0], hp[1], hp[2]); a.setXYZ(o + 1, e.x, e.y + [1.2, -0.3, 0.67, 1.2][e.kind ?? 0], e.z); n++; } }); }
        geo.setDrawRange(0, n * 2); a.needsUpdate = true; ref.current.visible = n > 0; });
    return <lineSegments ref={ref} geometry={geo} frustumCulled={false}><lineBasicMaterial color="#ffffff" transparent opacity={0.95} /></lineSegments>;
}
// flying cars: instanced, lane traffic above the streets (decor only, no collision)
const CAR_N = 36;
function carGeo() {
    const parts: THREE.BufferGeometry[] = [];
    const add = (g: THREE.BufferGeometry, c: number[], x: number, y: number, z: number) => { g.translate(x, y, z); const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g.index ? g.toNonIndexed() : g); };
    // reference: Kenney Car Kit (CC0) silhouettes - chunky body, tinted cabin, light pods; hover pods instead of wheels
    add(new THREE.BoxGeometry(2.0, 0.65, 4.4), [0.9, 0.9, 0.9], 0, 0, 0); add(new THREE.BoxGeometry(1.7, 0.6, 2.2), [0.12, 0.16, 0.22], 0, 0.6, -0.3);
    add(new THREE.BoxGeometry(1.5, 0.12, 1.9), [0.9, 0.9, 0.9], 0, 0.95, -0.3);
    add(new THREE.BoxGeometry(1.6, 0.14, 0.12), [1.5, 1.4, 1.0], 0, 0.05, 2.22); add(new THREE.BoxGeometry(1.6, 0.14, 0.12), [1.6, 0.2, 0.2], 0, 0.05, -2.22);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.CylinderGeometry(0.42, 0.42, 0.16, 8), [0.15, 0.15, 0.18], sx * 1.0, -0.4, sz * 1.4), add(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 8), [0.3, 2.0, 2.6], sx * 1.0, -0.5, sz * 1.4);
    return mergeGeometries(parts, false)!;
}
function FlyingCars() {
    const ref = useRef<THREE.InstancedMesh>(null!);
    const geo = useMemo(carGeo, []);
    const cars = useMemo(() => Array.from({ length: CAR_N }, (_, i) => ({ axis: i % 2, lane: ((i * 7) % 15) - 7, y: 34 + (i * 13) % 40, sp: (12 + (i * 5) % 14) * (i % 4 < 2 ? 1 : -1), off: (i * 97) % 600 })), []);
    useFrame((st) => {
        const t = st.clock.elapsedTime, m = ref.current; if (!m) return;
        cars.forEach((c, i) => {
            const u = ((c.off + t * c.sp) % 640 + 640) % 640 - 320, l = c.lane * CELL + CELL / 2;
            if (c.axis === 0) { tmp.position.set(l, c.y + Math.sin(t + i) * 0.6, u); tmp.rotation.set(0, c.sp > 0 ? 0 : Math.PI, 0); }
            else { tmp.position.set(u, c.y + Math.sin(t + i) * 0.6, l); tmp.rotation.set(0, c.sp > 0 ? Math.PI / 2 : -Math.PI / 2, 0); }
            tmp.scale.setScalar(2.4); tmp.updateMatrix(); m.setMatrixAt(i, tmp.matrix);
        });
        m.instanceMatrix.needsUpdate = true;
    });
    useEffect(() => { const pal = ['#e5483a', '#f2b632', '#3aa66a', '#3f6fd8', '#f07a2a', '#8e5bd6']; cars.forEach((_, i) => ref.current.setColorAt(i, new THREE.Color(pal[i % 6]))); ref.current.instanceColor!.needsUpdate = true; }, [cars]);
    return <instancedMesh ref={ref} args={[undefined, undefined, CAR_N]} geometry={geo} frustumCulled={false}><meshBasicMaterial vertexColors toneMapped={false} /></instancedMesh>;
}
const Y = new THREE.Vector3(0, 1, 0);

const _gq = new THREE.Quaternion(), _gz = new THREE.Vector3(0, 0, 1), _hp = new THREE.Vector3(), _fp = new THREE.Vector3(), _wd2 = new THREE.Vector3();

const _aq = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3(), _d1 = new THREE.Vector3();
// two-hand aim: point a bone's segment (bone -> child) at a world target (rotation in world space, applied to the local quaternion)
function aimBone(bone: THREE.Bone, child: THREE.Object3D, target: THREE.Vector3, w: number) {
    bone.getWorldPosition(_p1); child.getWorldPosition(_p2); _p2.sub(_p1).normalize(); _d1.copy(target).sub(_p1).normalize();
    _aq.setFromUnitVectors(_p2, _d1); if (w < 1) _aq.slerp(_id, 1 - w); _aq.invert().invert();
    bone.parent!.getWorldQuaternion(_pq); bone.quaternion.premultiply(_pq.clone().invert().multiply(_aq).multiply(_pq));
}
const _id = new THREE.Quaternion(), _tg = new THREE.Vector3();
export interface SceneProps { sim: Sim; ev: Events; coarse: boolean; fx: { fov: number; shake: number }; perf: { scale: number; fps: number; speed: number } }



const _wv = new THREE.Vector3(), _wv2 = new THREE.Vector3();
function buildRig() {
    const d: any = heroData;
    if (!d._capeRig && !(DBG && (window as any).__noCapeRig)) {   // user-approved (9:53) hidden cape rig: 3 extra bones + re-weighted cape vertices only. Rest pose is unchanged (new bones sit at identity under chest), mesh/UV/texture untouched.
        d._capeRig = true;
        const base = d.bones.length; d.bones.push({ n: 'cape1', p: 2, h: [0, 1.58, -0.13] }, { n: 'cape2', p: base, h: [0, 1.4, -0.15] }, { n: 'cape3', p: base + 1, h: [0, 1.27, -0.17] });
        const ids = [2, base, base + 1, base + 2], P = d.pos; let cnt = 0;
        for (let i = 0; i < P.length / 3; i++) {
            const y = P[i * 3 + 1], z = P[i * 3 + 2]; if (!(z < -0.12 && y > 1.15 && y < 1.7)) continue;
            const u = Math.max(0, Math.min(2.999, (1.58 - y) / 0.38 * 3)), k = Math.floor(u), f = u - k;
            d.si[i * 4] = ids[k]; d.si[i * 4 + 1] = ids[k + 1]; d.si[i * 4 + 2] = 0; d.si[i * 4 + 3] = 0;
            d.sw[i * 4] = 1 - f; d.sw[i * 4 + 1] = f; d.sw[i * 4 + 2] = 0; d.sw[i * 4 + 3] = 0; cnt++;
        }
        if (DBG) (window as any).__capeVerts = cnt;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(d.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(d.col, 3));
    if (d.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(d.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(d.sw, 4));
    g.setIndex(d.idx);
    const bones: THREE.Bone[] = [], byName: Record<string, THREE.Bone> = {};
    d.bones.forEach((b: any, i: number) => {
        const bone = new THREE.Bone(); bone.name = b.n; bones.push(bone); byName[b.n] = bone;
        const par = b.p >= 0 ? d.bones[b.p].h : [0, 0, 0];
        bone.position.set(b.h[0] - par[0], b.h[1] - par[1], b.h[2] - par[2]);
        if (b.p >= 0) bones[b.p].add(bone);
    });
    let mat: THREE.MeshLambertMaterial;
    if (d.uv) {
        const tex = new THREE.TextureLoader().load(baseTexUrl); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 2;
        mat = new THREE.MeshLambertMaterial({ map: tex, emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: 0.45 });
    } else mat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color('#1a2a66'), emissiveIntensity: 0.18 });
    // procedural suit weave in the fragment shader (object-space lattice, screen-AA'd), so fine detail doesn't depend on vertex density
    if (!d.uv) mat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;').replace('#include <color_fragment>', `#include <color_fragment>
        if (vColor.r < 0.2 && vColor.b > 0.4) {
            float ang = atan(vObj.x, vObj.z) * 4.2;
            vec2 q = vec2(ang, vObj.y * 16.0);
            vec2 w = fwidth(q) * 1.5;
            float lx = smoothstep(0.455 - w.x, 0.455, abs(fract(q.x) - 0.5));
            float ly = smoothstep(0.455 - w.y, 0.455, abs(fract(q.y) - 0.5));
            float line = max(lx, ly);
            diffuseColor.rgb *= 1.0 - 0.38 * line * clamp(1.0 - 2.0 * (w.x + w.y), 0.0, 1.0);
            diffuseColor.rgb *= 1.0 + 0.08 * sin(vObj.y * 90.0 + vObj.x * 40.0);
        }`);
    };
    const mesh = new THREE.SkinnedMesh(g, mat); mesh.frustumCulled = false;
    const root = new THREE.Group(); root.add(mesh); mesh.add(bones[0]);
    root.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));
    // cel-style ink outline: inverted hull sharing the geometry and skeleton, pushed out along the skinned normal (ref: Wind Waker character edge ink)
    { const om = new THREE.MeshBasicMaterial({ color: '#0a0d1a', side: THREE.BackSide }); om.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', 'transformed += normalize(objectNormal) * 0.014;\n#include <project_vertex>'); }; const ol = new THREE.SkinnedMesh(g, om); ol.frustumCulled = false; ol.bind(mesh.skeleton, mesh.bindMatrix); root.add(ol); }
    // candidate extreme vertices (chosen per dominant bone in many bone-local directions), kept with their full skin blend so wall contact uses real skinned positions
    const hull: { p: THREE.Vector3; bi: number[]; bw: number[]; foot?: boolean }[] = [];
    {
        const inv = mesh.skeleton.boneInverses, pa = g.attributes.position, si = d.si, sw = d.sw, v = new THREE.Vector3();
        const dirs: THREE.Vector3[] = []; for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) if (x || y || z) dirs.push(new THREE.Vector3(x, y, z).normalize());
        const best = bones.map(() => dirs.map(() => ({ s: -1e9, i: -1 })));
        for (let i = 0; i < pa.count; i++) {
            let bi = si[i * 4], bw = sw[i * 4]; for (let j = 1; j < 4; j++) if (sw[i * 4 + j] > bw) { bw = sw[i * 4 + j]; bi = si[i * 4 + j]; }
            v.set(pa.getX(i), pa.getY(i), pa.getZ(i)).applyMatrix4(inv[bi]);
            dirs.forEach((dr, k2) => { const sc = v.dot(dr); if (sc > best[bi][k2].s) { best[bi][k2].s = sc; best[bi][k2].i = i; } });
        }
        const seen = new Set<number>();
        // exact coverage for the limbs that touch the wall: every vertex dominated by a hand or foot bone
        for (let i = 0; i < pa.count; i++) {
            let bi = si[i * 4], bw = sw[i * 4]; for (let j = 1; j < 4; j++) if (sw[i * 4 + j] > bw) { bw = sw[i * 4 + j]; bi = si[i * 4 + j]; }
            if (/^(hand|foot)/.test(bones[bi].name)) { seen.add(i); hull.push({ p: new THREE.Vector3(pa.getX(i), pa.getY(i), pa.getZ(i)), bi: [0, 1, 2, 3].map((k) => si[i * 4 + k]), bw: [0, 1, 2, 3].map((k) => sw[i * 4 + k]), foot: /^foot/.test(bones[bi].name) }); }
        }
        best.forEach((arr) => arr.forEach((e) => { if (e.i >= 0 && !seen.has(e.i)) { seen.add(e.i); hull.push({ p: new THREE.Vector3(pa.getX(e.i), pa.getY(e.i), pa.getZ(e.i)), bi: [0, 1, 2, 3].map((k) => si[e.i * 4 + k]), bw: [0, 1, 2, 3].map((k) => sw[e.i * 4 + k]) }); } }));
    }
    const skel = mesh.skeleton;
    return { root, b: byName, bones, hull, skel, hipsY: byName.hips.position.y };
}


// Mixamo-derived clips, retargeted offline (tools/fbx2clip.mjs) onto the generated rig
type Clip = { fps: number; n: number; bones: string[]; q: number[]; hy: number[] };
const CLIPS: Record<string, Clip> = { idle: clipIdle as any, jump: clipJump as any, wall: clipWall as any, punch: clipPunch as any, swim: clipSwim as any, run: clipRun as any };
const _wd = new THREE.Vector3(), _wp = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
function sampleClip(c: Clip, t: number, loop: boolean, bones: THREE.Bone[], w: number) {
    let f = t * c.fps; if (loop) f = ((f % c.n) + c.n) % c.n; else f = Math.max(0, Math.min(c.n - 1, f));
    const i0 = Math.floor(f), i1 = loop ? (i0 + 1) % c.n : Math.min(c.n - 1, i0 + 1), k = f - i0, nb = c.bones.length;
    for (let b = 0; b < nb; b++) {
        _qa.fromArray(c.q, (i0 * nb + b) * 4); _qb.fromArray(c.q, (i1 * nb + b) * 4); _qa.slerp(_qb, k);
        bones[b].quaternion.slerp(_qa, w);
    }
}



// seabed: sand with animated caustic light lines, fading into teal haze with distance (reference: two underwater game shots - sandy floor with web-like caustic lines, cyan fading to deeper teal)
const UWF = { value: new THREE.Color('#176e8c') }, UW = { on: false };   // underwater far colour (seabed haze = background, so the seabed plane has no visible far edge) and flag
const mkSea = (xy: boolean) => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFog: UWF },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `varying vec3 vW; uniform float uTime; uniform vec3 uFog;
    float cau(vec2 p){ vec2 q = p; float v = 0.0; for (int i = 0; i < 3; i++) { q += vec2(sin(q.y * 1.3 + uTime * 0.7), cos(q.x * 1.1 + uTime * 0.6)) * 0.55; v += 1.0 - abs(sin(q.x * 0.9) + sin(q.y * 0.9)) * 0.5; } return pow(clamp(v / 3.0, 0.0, 1.0), 5.0); }
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main(){ vec3 fogDisplay=linearToOutputTexel(vec4(uFog,1.0)).rgb; vec3 fogUsed=mix(uFog,fogDisplay,0.65*(1.0-smoothstep(-2.0,-1.0,cameraPosition.y))); vec2 p = ${xy ? 'vW.xy' : 'vW.xz'} * 0.9; float c = cau(p) + 0.6 * cau(p * 1.7 + 3.0);
      vec3 sand = mix(vec3(0.46, 0.62, 0.58), vec3(0.58, 0.70, 0.62), h(floor(${xy ? 'vW.xy' : 'vW.xz'} * 3.0)) * 0.6);
      vec3 col = sand * 0.7 + vec3(0.75, 0.95, 0.9) * c * 0.55;
      float d = length(vW - cameraPosition); vec3 Tb = exp(-vec3(0.45, 0.07, 0.02) * d * 0.5); col = col * Tb; float fg = 1.0 - exp(-d * 0.045 * 1.6); ${xy ? 'fg = fg * 0.8;' : ''} col = col * (1.0 - 0.4 * fg) + fogUsed * fg * 0.9; ${xy ? 'col = mix(col, fogUsed, smoothstep(-6.0, -0.6, vW.y));' : ''}
      gl_FragColor = vec4(col, 1.0); }`,
});
const seabedMat = mkSea(false), wallMat = mkSea(true);
// Water: sum-of-sines height field, fresnel sky mix, sun glitter, crest foam, distance haze (informed by public ocean-shader write-ups, see docs/REFERENCES.md)
const WAVES = `
float wh(vec2 p, float t){
  float h = 0.0;
  h += sin(dot(p, vec2(0.021, 0.013)) + t * 0.55) * 0.55;
  h += sin(dot(p, vec2(-0.033, 0.027)) + t * 0.8) * 0.3;
  h += sin(dot(p, vec2(0.11, -0.07)) + t * 1.6) * 0.1;
  h += sin(dot(p, vec2(0.23, 0.19)) + t * 2.4) * 0.05;
  return h;
}
vec2 wg(vec2 p, float t){
  vec2 g = vec2(0.0);
  g += cos(dot(p, vec2(0.021, 0.013)) + t * 0.55) * 0.55 * vec2(0.021, 0.013);
  g += cos(dot(p, vec2(-0.033, 0.027)) + t * 0.8) * 0.3 * vec2(-0.033, 0.027);
  g += cos(dot(p, vec2(0.11, -0.07)) + t * 1.6) * 0.1 * vec2(0.11, -0.07);
  g += cos(dot(p, vec2(0.23, 0.19)) + t * 2.4) * 0.05 * vec2(0.23, 0.19);
  return g;
}`;
function waveH(x: number, z: number, t: number) {
    return Math.sin(x * 0.021 + z * 0.013 + t * 0.55) * 0.55 + Math.sin(-x * 0.033 + z * 0.027 + t * 0.8) * 0.3 + Math.sin(x * 0.11 - z * 0.07 + t * 1.6) * 0.1 + Math.sin(x * 0.23 + z * 0.19 + t * 2.4) * 0.05;
}
const waterMat = new THREE.ShaderMaterial({
    transparent: true, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uUWF: UWF, uDay: TOD.day, uSun: TOD.sunU, uSky: { value: TOD.sky }, uDeep: { value: new THREE.Color('#0a6f92') }, uShallow: { value: new THREE.Color('#2fa8c4') } },
    vertexShader: WAVES + `uniform float uTime; varying vec3 vW; void main(){ vec3 p = position; vec4 w = modelMatrix * vec4(p, 1.0); float h = wh(w.xz, uTime); w.y += h; vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`.replace('vec3 p = position; vec4 w = modelMatrix * vec4(p, 1.0);', 'vec4 w = modelMatrix * vec4(position, 1.0);'),
    fragmentShader: WAVES + `uniform float uDay; uniform float uTime; uniform vec3 uSun, uSky, uDeep, uShallow, uUWF; varying vec3 vW;
    void main(){
      vec2 g = wg(vW.xz, uTime) + vec2(sin(vW.x * 0.9 + uTime * 3.0), cos(vW.z * 0.8 + uTime * 2.4)) * 0.02;
      g += vec2(cos(dot(vW.xz, vec2(0.7, 0.4)) + uTime * 2.1), cos(dot(vW.xz, vec2(-0.35, 0.8)) - uTime * 1.7)) * 0.035 + vec2(cos(dot(vW.xz, vec2(1.7, -1.1)) + uTime * 3.3), cos(dot(vW.xz, vec2(-1.3, 1.6)) - uTime * 2.7))* 0.018;
      g = mix(g, wg(vW.xz, uTime), smoothstep(15.0, 70.0, length(cameraPosition.xz - vW.xz)));
      vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
      vec3 v = normalize(cameraPosition - vW);
      bool below = !gl_FrontFacing;
      if (below) n = -n;
      // exact unpolarised Fresnel for n_air = 1.0, n_water = 1.333 (replaces the Schlick approximation); total internal reflection gives fr = 1
      float ci = clamp(dot(n, v), 0.0, 1.0), ni = below ? 1.333 : 1.0, nt = below ? 1.0 : 1.333, s2 = (ni / nt) * (ni / nt) * (1.0 - ci * ci);
      float fr = 1.0; if (s2 < 1.0) { float ct = sqrt(1.0 - s2), rs = (ni * ci - nt * ct) / (ni * ci + nt * ct), rp = (ni * ct - nt * ci) / (ni * ct + nt * ci); fr = 0.5 * (rs * rs + rp * rp); }
      float depthMix = clamp(length(cameraPosition.xz - vW.xz) / 120.0, 0.0, 1.0);
      // Beer-Lambert: light entering the water travels (depth / cos theta_t) through it before the sand returns it, with per-channel absorption (red dies first)
      vec3 td = refract(-v, n, 1.0 / 1.333); float path = 9.0 / max(abs(td.y), 0.12);
      vec3 absorb = vec3(0.45, 0.07, 0.02), Tw = exp(-absorb * path);
      vec3 body = vec3(0.62, 0.72, 0.62) * 0.9 * Tw + mix(uShallow, uDeep, depthMix * 0.7) * (1.0 - exp(-0.02 * path)) * 0.9;
      vec3 r = reflect(-v, n);
      vec3 refl = mix(uSky, vec3(0.2, 0.34, 0.6), smoothstep(0.0, 0.45, r.y)) + vec3(1.0, 0.55, 0.3) * 0.25 * pow(max(dot(normalize(r), uSun), 0.0), 6.0);
      vec3 col = mix(body, refl, fr);
      col += vec3(1.0, 0.85, 0.7) * (pow(max(dot(r, uSun), 0.0), 220.0) * 1.6 + pow(max(dot(r, uSun), 0.0), 40.0) * 0.35);
      col += vec3(0.1, 0.45, 0.5) * smoothstep(0.3, 0.8, wh(vW.xz, uTime)) * 0.25 * (1.0 - fr);
      float crest = smoothstep(0.62, 0.9, wh(vW.xz, uTime) + sin(vW.x * 0.7) * sin(vW.z * 0.6) * 0.08);
      col = mix(col, vec3(1.0), crest * 0.55);
      float sd = -222.0 - vW.z; float sf = smoothstep(24.0, 0.0, sd) * (0.5 + 0.5 * sin(sd * 1.3 - uTime * 1.8 + sin(vW.x * 0.4) * 2.0));
      col = mix(col, vec3(1.0, 0.97, 0.92), clamp(sf, 0.0, 1.0) * step(0.0, sd) * 0.85);
      float aOut = mix(0.82, 1.0, max(fr, 0.0));
      vec3 uWaterDisplay=mix(uUWF,linearToOutputTexel(vec4(uUWF,1.0)).rgb,0.65*(1.0-smoothstep(-2.0,-1.0,cameraPosition.y)));
      if (below) {
        // Snell's window: refract view ray water -> air with a slightly different index per colour channel (dispersion); beyond the critical angle (48.6 deg) total internal reflection shows the water, not the sky
        vec3 under = mix(uDeep, uShallow, 0.35 + 0.4 * pow(max(dot(-n, v), 0.0), 2.0));
        vec3 tr = refract(-v, n, 1.3310), tg = refract(-v, n, 1.3330), tb = refract(-v, n, 1.3375);
        bool tir = dot(tg, tg) < 0.0001;
        vec3 sr = mix(uSky, vec3(0.2, 0.34, 0.6), smoothstep(0.0, 0.45, tr.y)), sg = mix(uSky, vec3(0.2, 0.34, 0.6), smoothstep(0.0, 0.45, tg.y)), sb = mix(uSky, vec3(0.2, 0.34, 0.6), smoothstep(0.0, 0.45, tb.y));
        vec3 win = vec3(sr.r, sg.g, sb.b);
        // A narrow rough-surface critical-angle transition avoids a binary colour/alpha rim.
        float critical = smoothstep(0.84, 1.04, s2);
        col = mix(mix(win, under, clamp(fr, 0.0, 1.0)), under, critical);
        aOut = mix(0.45, 0.96, max(fr, critical));
      }
      float haze = 1.0 - exp(-length(cameraPosition - vW) * 0.006);
      if (below) col = mix(col, uWaterDisplay, 1.0 - exp(-length(cameraPosition - vW) * 0.045 * 1.6));
      if (below) col += uWaterDisplay * 0.9 * pow(1.0 - clamp(abs(v.y), 0.0, 1.0), 2.5);   // soft light band toward the horizon, dark overhead (ref: Abzu key art vertical gradient)
      col = mix(col, uSky, haze * (below ? 0.0 : 0.75));
      if (!below) col *= mix(0.3, 1.0, uDay);
      // A near-waterline camera can sit inside a displaced crest while viewing its top face.
      // Fade only that nearby top-face sheet so the swimmer remains readable through the split.
      // This is a local transparency approximation, not scene-colour refraction.
      float waterline = 1.0 - smoothstep(0.35, 1.4, abs(cameraPosition.y - wh(cameraPosition.xz, uTime)));
      float nearClear = mix(1.0, smoothstep(1.0, 16.0, length(cameraPosition - vW)), waterline);
      float splitBlend = (1.0 - smoothstep(0.8, 1.4, -1.0 - cameraPosition.y)) * (1.0 - smoothstep(0.4, 4.0, length(cameraPosition - vW)));
      if (below) { col = mix(col, linearToOutputTexel(vec4(uUWF, 1.0)).rgb, splitBlend); aOut = mix(aOut, 1.0, splitBlend); }
      gl_FragColor = vec4(col, below ? aOut : mix(0.82, 1.0, max(fr, haze)) * nearClear);
    }`,
});

function buildEnemyGeo(kind: number): THREE.BufferGeometry {
    // four simple robot bots (palette: white/gray/black/red): 0 pawn (round head, white/red), 1 crawler (gray box, four legs), 2 wasp drone (hovering, red/black), 3 coil (stacked white/gray)
    const parts: THREE.BufferGeometry[] = [];
    const add = (g: THREE.BufferGeometry, col: [number, number, number], x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
        const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
        let gg = g.clone(); gg.applyMatrix4(m);
        const n = gg.attributes.position.count, a = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { a[i * 3] = col[0]; a[i * 3 + 1] = col[1]; a[i * 3 + 2] = col[2]; }
        gg.setAttribute('color', new THREE.BufferAttribute(a, 3)); gg.deleteAttribute('uv'); if (gg.index) gg = gg.toNonIndexed(); parts.push(gg);
    };
    const f = -0.85, B = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);
    type C = [number, number, number];
    // Reference-informed (visual reference only, no geometry copied): Quaternius "Animated Robot" (round head, two big dark eyes, colour-blocked body) and "Easy Enemy Pack" (spider, wasp, snake, frog archetypes).
    // Each bot is a few plain shapes with one main colour and a clear silhouette.
    if (kind === 1) { // crawler robot (spider reference): steel box body, four angled legs, one red visor strip
        const body: C = [0.55, 0.55, 0.57], leg: C = [0.07, 0.07, 0.08], eye: C = [3, 0.25, 0.25];
        add(B(0.8, 0.45, 0.7), body, 0, f + 0.8, 0); add(B(0.62, 0.1, 0.05), eye, 0, f + 0.88, 0.72);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(B(0.1, 0.95, 0.1), leg, sx * 0.7, f + 0.5, sz * 0.45, sz * 0.5, 0, sx * -0.55);
    } else if (kind === 2) { // wasp drone (wasp reference): striped body, two flat wings, hovers
        const yel: C = [0.85, 0.12, 0.12], blk: C = [0.07, 0.07, 0.08], wing: C = [0.85, 0.85, 0.88], h = f + 1.3;
        add(new THREE.CylinderGeometry(0.3, 0.3, 0.3, 8), yel, 0, h, 0.35, Math.PI / 2, 0, 0); add(new THREE.CylinderGeometry(0.32, 0.32, 0.2, 8), blk, 0, h, 0.05, Math.PI / 2, 0, 0);
        add(new THREE.CylinderGeometry(0.26, 0.2, 0.3, 8), yel, 0, h, -0.2, Math.PI / 2, 0, 0); add(new THREE.ConeGeometry(0.2, 0.4, 6), blk, 0, h, -0.55, -Math.PI / 2, 0, 0);
        for (const sx of [-1, 1]) add(B(0.8, 0.03, 0.3), wing, sx * 0.55, h + 0.3, 0.1, 0, sx * 0.3, sx * 0.25);
        add(new THREE.SphereGeometry(0.2, 7, 5), blk, 0, h, 0.62); add(new THREE.SphereGeometry(0.1, 6, 5), [3, 0.3, 0.3] as C, 0, h, 0.8);
    } else if (kind === 3) { // coil (snake reference): stacked tapered column, bright head with one big eye
        const g1: C = [0.92, 0.92, 0.94], g2: C = [0.4, 0.4, 0.43], eye: C = [3, 0.25, 0.25];
        add(new THREE.CylinderGeometry(0.5, 0.62, 0.4, 7), g2, 0, f + 0.2, 0); add(new THREE.CylinderGeometry(0.4, 0.5, 0.45, 7), g1, 0.05, f + 0.62, 0); add(new THREE.CylinderGeometry(0.3, 0.4, 0.5, 7), g2, 0, f + 1.08, 0);
        add(new THREE.SphereGeometry(0.34, 8, 6), g1, 0, f + 1.55, 0.05, 0, 0, 0, 1, 0.9, 1.2); add(B(0.4, 0.09, 0.06), eye, 0, f + 1.62, 0.36); add(B(0.04, 0.4, 0.04), g2, 0.15, f + 1.95, 0);
    } else { // pawn (robot reference): round dome head with two big dark eyes, block body, orange
        const body: C = [0.93, 0.93, 0.95], dark: C = [0.07, 0.07, 0.08], cream: C = [0.8, 0.12, 0.12], glow: C = [3, 0.25, 0.25];
        add(new THREE.SphereGeometry(0.46, 9, 7), body, 0, f + 1.75, 0, 0, 0, 0, 1.1, 0.9, 1); add(new THREE.CylinderGeometry(0.34, 0.26, 0.9, 6), body, 0, f + 1.0, 0);
        for (const sx of [-1, 1]) { add(new THREE.SphereGeometry(0.15, 6, 5), dark, sx * 0.2, f + 1.8, 0.4); add(B(0.26, 0.05, 0.06), dark, sx * 0.2, f + 2.0, 0.42, 0, 0, sx * -0.25); add(B(0.2, 0.55, 0.2), cream, sx * 0.4, f + 0.35, 0.05); }
        add(B(0.5, 0.08, 0.05), glow, 0, f + 1.0, 0.27);
    }
    return mergeGeometries(parts, false)!;
}


export function Scene({ sim, ev, coarse, fx, perf }: SceneProps) {
    const { gl, camera } = useThree();
    const hero = useRef<THREE.Group>(null!), armR = useRef<THREE.Group>(null!), armL = useRef<THREE.Group>(null!), legR = useRef<THREE.Group>(null!), legL = useRef<THREE.Group>(null!), cape = useRef<THREE.Mesh>(null!);
    const web = useRef<THREE.Mesh>(null!), webB = useRef<THREE.Mesh>(null!), arrow = useRef<THREE.Mesh>(null!), cores = useRef<THREE.InstancedMesh>(null!), glows = useRef<THREE.InstancedMesh>(null!);
    const cam = useRef(new THREE.Vector3()), look = useRef(new THREE.Vector3()), adapt = useRef(0), ema = useRef(16), curScale = useRef(perf.scale);
    const suit = useMemo(() => new THREE.MeshLambertMaterial({ color: '#2d56d0' }), []);
    const ink = useMemo(() => new THREE.MeshBasicMaterial({ color: '#06070f', side: THREE.BackSide }), []);
    const white = useMemo(() => new THREE.MeshLambertMaterial({ color: '#f1f4ff' }), []);
    const hair = useMemo(() => new THREE.MeshLambertMaterial({ color: '#e8ecff' }), []);
    const lens = useMemo(() => { const sh = new THREE.Shape(); sh.moveTo(-0.075, 0.015); sh.lineTo(0.085, 0.045); sh.lineTo(0.065, -0.015); sh.lineTo(-0.055, -0.04); sh.closePath(); return new THREE.ShapeGeometry(sh); }, []);
    const tail1 = useMemo(() => new THREE.PlaneGeometry(0.16, 0.95).translate(0, -0.475, 0), []);
    const tail2 = useMemo(() => new THREE.PlaneGeometry(0.12, 0.7).translate(0, -0.35, 0), []);
    const stripe = useMemo(() => new THREE.MeshBasicMaterial({ color: '#5ff2ff' }), []);
    const gold = useMemo(() => new THREE.MeshLambertMaterial({ color: '#f2c038' }), []);
    const dark = useMemo(() => new THREE.MeshLambertMaterial({ color: '#232a4a' }), []);
    const red = useMemo(() => new THREE.MeshLambertMaterial({ color: '#d9344f', side: THREE.DoubleSide }), []);
    const bv = useMemo(() => new THREE.Vector3(), []);
    const bv2 = useMemo(() => new THREE.Vector3(), []);
    const waterRef = useRef<THREE.Mesh>(null!), ringRef = useRef<THREE.Mesh>(null!);
    const wakeRef = useRef<THREE.Mesh>(null!); const ringFlow = useRef(0);
    const wakeTrail = useRef<{x:number,z:number,t:number}[]>([]); const wakeStrength = useRef(0);
    const wakeGeo = useMemo(() => { const g = new THREE.BufferGeometry(), pa = new Float32Array(2 * 25 * 2 * 3), uv = new Float32Array(2 * 25 * 2 * 2), ix: number[] = []; for (let side = 0; side < 2; side++) for (let j = 0; j <= 24; j++) { const n = side * 50 + j * 2; uv[n*2] = uv[(n+1)*2] = j/24; uv[n*2+1] = 0; uv[(n+1)*2+1] = 1; if (j < 24) ix.push(n,n+1,n+2,n+1,n+3,n+2); } g.setAttribute('position', new THREE.BufferAttribute(pa, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(ix); return g; }, []);
    const wakeMat = useMemo(() => new THREE.ShaderMaterial({transparent:true, depthWrite:false, side:THREE.DoubleSide, uniforms:{uA:{value:0}}, vertexShader:'varying vec2 vU; void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'varying vec2 vU; uniform float uA; void main(){float soft=sin(vU.y*3.14159);float trail=pow(1.0-vU.x,1.5)*smoothstep(0.0,0.12,vU.x); gl_FragColor=vec4(0.82,0.96,1.0,soft*trail*uA);}' }), []);
 const splashRef = useRef<THREE.Group>(null!), splashSt = useRef({ prev: false, t0: -9 });
    const rig = useMemo(() => {
        const r = buildRig();
        const redM = new THREE.MeshLambertMaterial({ color: '#d4162e', side: THREE.DoubleSide });
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.11, 0.06, 10), redM); ring.position.set(0, 0.04, 0); r.b.neck.add(ring);
        const t1 = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.8).translate(0, -0.4, 0), redM); t1.position.set(0, 0.38, -0.1); r.b.chest.add(t1);
        const t2 = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.55).translate(0, -0.275, 0), redM); t2.position.set(0.07, 0.36, -0.1); t2.rotation.set(0.1, 0, 0.14); r.b.chest.add(t2);
        ring.visible = false; t1.visible = false; t2.visible = false;   // model has its own cloth; legacy red scarf removed
        legR.current = r.b.thighR as any; legL.current = r.b.thighL as any; armR.current = r.b.uarmR as any; armL.current = r.b.uarmL as any; cape.current = t1 as any;
        if (DBG) (window as any).__rig = r; return r;
    }, []);
    const clipSt = useRef({ key: '', t: 0, w: 0 });
    const lastWall = useRef<{ n: number[]; b: number } | null>(null), wallCorr = useRef(0), groundCorr = useRef(0), groundMin = useRef({ key: '', v: 1e9 }), tp0 = useMemo(() => new THREE.Vector3(), []);
    const enemyGeos = useMemo(() => [0, 1, 2, 3].map(buildEnemyGeo), []);
    const enMeshes = useRef<THREE.InstancedMesh[]>([]);
    const ecol = useMemo(() => new THREE.Color(), []);
    const beaconRef = useRef<THREE.Mesh>(null!);
    const eye = useMemo(() => new THREE.MeshBasicMaterial({ color: '#8ffcff', side: THREE.DoubleSide }), []);
    const visor = useMemo(() => new THREE.MeshBasicMaterial({ color: '#0b0c18' }), []);

    useFrame((state, rawDt) => {
        const dt = Math.min(0.05, rawDt);
        sim.t += dt;
        // adaptive resolution (device-friendly)
        const rd = Math.min(0.25, rawDt); ema.current += (rd * 1000 - ema.current) * 0.05; perf.fps = 1000 / ema.current; adapt.current += rd;
        { const want = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2) * curScale.current; if (Math.abs(gl.getPixelRatio() - want) > 0.01) gl.setPixelRatio(want); }
        if (adapt.current > 0.8) {
            adapt.current = 0; let ns = curScale.current;
            if (ema.current > 24 && ns > 0.45) ns -= 0.1; else if (ema.current > 16 && ns > 1) ns = Math.max(1, ns - 0.05); else if (ema.current < 12.5 && ns >= 1 && ns < 1.34 && coarse) ns += 0.05; else if (ema.current < 18 && ns < 1) ns += 0.05;   // high tier: only on touch devices running well under budget (<12.5 ms), reversible by the same >24 ms downshift
            if (Math.abs(ns - curScale.current) > 0.01) { curScale.current = ns; perf.scale = ns; gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2) * ns); }
        }
        if (sim.mode === 'play') {
            for (let i = 0; i < 2; i++) stepSim(sim, dt / 2, ev);
            stepBeacon(sim, ev);
            sim.time += dt;
        } else sim.yaw += dt * 0.15;
        const p = sim.pos, v = sim.vel;
        const speed = Math.hypot(v[0], v[1], v[2]); perf.speed = speed;
        // camera
        const cy = Math.cos(sim.pitch), sy = Math.sin(sim.pitch);
        const dbgD = DBG ? (window as any).__camDist as number | undefined : undefined; if (DBG && (window as any).__hq) { curScale.current = 1; perf.scale = 1; }
        let dist = dbgD ?? (sim.web ? 11.5 : sim.wall ? 7 : 8.5);
        const fxd = Math.sin(sim.yaw) * cy, fzd = Math.cos(sim.yaw) * cy;
        for (; !dbgD && dist > (sim.wall ? 5 : 6); dist -= 1) {
            const ex = p[0] - fxd * dist, ey = p[1] + 1.5 + sy * dist, ez = p[2] - fzd * dist;
            let hit = false;
            for (const b of buildings) if (ex > b.x0 - 3 && ex < b.x1 + 3 && ez > b.z0 - 3 && ez < b.z1 + 3 && ey < b.h + 3) { hit = true; break; }
            if (!hit) break;
        }
        const wsh = sim.wall ? 3.6 : 0, wnx = sim.wall ? -sim.wall[1] : 0, wnz = sim.wall ? sim.wall[0] : 0; // wall: 3/4 view from beside the hero
        const tx = p[0] - fxd * dist + wnx * wsh, ty = sim.swim ? (sim.dive ? Math.min(WATER_Y - 1.5, p[1] + 1.2 + sy * dist) : WATER_Y + 0.7) : Math.max(2 + Math.min(0, parkH(p[0], p[2])), p[1] + 1.5 + sy * dist), tz = p[2] - fzd * dist + wnz * wsh;
        if (sim.mode === 'menu' || sim.mode === 'over') { cam.current.set(tx, ty, tz); } else cam.current.lerp(new THREE.Vector3(tx, ty, tz), 1 - Math.pow(0.001, dt));
        { // push smoothed camera out of buildings (post-lerp)
            const q = cam.current;
            for (const b of buildings) if (q.x > b.x0 - 2 && q.x < b.x1 + 2 && q.z > b.z0 - 2 && q.z < b.z1 + 2 && q.y < b.h + 2) {
                if (!(tx > b.x0 - 2 && tx < b.x1 + 2 && tz > b.z0 - 2 && tz < b.z1 + 2 && ty < b.h + 2)) { q.set(tx, ty, tz); continue; }
                const dx0 = q.x - (b.x0 - 2), dx1 = b.x1 + 2 - q.x, dz0 = q.z - (b.z0 - 2), dz1 = b.z1 + 2 - q.z, dy = b.h + 2 - q.y, m = Math.min(dx0, dx1, dz0, dz1, dy);
                if (m === dy) q.y = b.h + 2; else if (m === dx0) q.x = b.x0 - 2; else if (m === dx1) q.x = b.x1 + 2; else if (m === dz0) q.z = b.z0 - 2; else q.z = b.z1 + 2;
            }
        }
        { // Keep the smoothed chase arm outside the solid quay and above inland ground.
            // If the sightline enters the shore wall below its top, shorten on the water side.
            const q = cam.current, edge = WATER_Z - 0.9, ly = sim.swim ? p[1] + 0.7 : p[1] + 1.5;
            if (p[2] < edge && q.z > edge) {
                const f = (edge - p[2]) / (q.z - p[2]);
                const iy = ly + (q.y - ly) * f;
                if (iy < 0.7) { q.x = p[0] + (q.x - p[0]) * f; q.y = iy; q.z = edge; }
            }
            if (q.z >= WATER_Z) q.y = Math.max(q.y, 1.3 + Math.min(0, parkH(q.x, q.z)));
        }
        camera.position.copy(cam.current); if (DBG) (window as any).__cam = [cam.current.x, cam.current.y, cam.current.z, dist];
        look.current.set(p[0], sim.swim ? p[1] + 0.7 : p[1] + 1.5, p[2]);
        const ov = DBG ? (window as any).__camOv : null; if (ov) { camera.position.set(ov[0], ov[1], ov[2]); look.current.set(ov[3], ov[4], ov[5]); }
        camera.lookAt(look.current);
        const cp = camera as THREE.PerspectiveCamera;
        const targetFov = 62 + Math.min(14, speed * 0.25) + fx.fov;
        if (Math.abs(cp.fov - targetFov) > 0.05) { cp.fov += (targetFov - cp.fov) * Math.min(1, dt * 6); cp.updateProjectionMatrix(); }
        {   // water: animate, and split view (waterline across the screen when the camera is at the surface)
            waterMat.uniforms.uTime.value = sim.t; seabedMat.uniforms.uTime.value = sim.t; wallMat.uniforms.uTime.value = sim.t;
            const uw = document.getElementById('uw');
            const inBay = camera.position.z < WATER_Z + 2;
            const dy = camera.position.y - WATER_Y; const under = inBay && dy < 0; UW.on = under; if (under) (state.scene.background as THREE.Color).copy(UWF.value); if (DBG) (window as any).__scene = state.scene;
            if (uw) {
                if (inBay && dy < 1.2 && dy > -2.2) {
                    // project the waterline a little ahead of the camera to find where the surface cuts the screen
                    camera.getWorldDirection(_wd); const hx = _wd.x, hz = _wd.z, hl = Math.hypot(hx, hz) || 1;
                    const ax = camera.position.x + hx / hl * 11, az = camera.position.z + hz / hl * 11; _wp.set(ax, WATER_Y + waveH(ax, az, sim.t), az).project(camera);
                    const yPct = Math.max(0, Math.min(100, (1 - (_wp.y * 0.5 + 0.5)) * 100));
                    { const mk = `linear-gradient(180deg, transparent ${Math.max(0, yPct - 3)}%, #000 ${Math.min(100, yPct + 7)}%)`; uw.style.maskImage = mk; (uw.style as any).webkitMaskImage = mk; } uw.style.opacity = '1'; uw.dataset.split = '1';   // waterline tint edge fades over about 10% of the screen instead of a hard clip
                } else { uw.style.maskImage = 'none'; (uw.style as any).webkitMaskImage = 'none'; uw.style.opacity = under ? '1' : '0'; uw.dataset.split = '0'; }
            }
        }
        // hero
        const h = hero.current;
        for (const bn of rig.bones) bn.rotation.set(0, 0, 0);
        h.position.set(p[0], p[1] - 1.0, p[2]);
        h.rotation.set(0, sim.ang + (((sim as any).snareT > 0 && (sim as any).snareT < 0.45) ? (1 - (sim as any).snareT / 0.45) * Math.PI * 2 : 0), 0); h.scale.setScalar(1.5);
        const wl = !!sim.wall;
        if (wl) { h.position.x += Math.sin(sim.ang) * 0.2; h.position.z += Math.cos(sim.ang) * 0.2; }
        const sw2 = sim.swim;
        { const sg = splashRef.current, st2 = splashSt.current; if (sg) { if (sim.swim && !st2.prev && p[1] > -3) st2.t0 = sim.t; st2.prev = sim.swim; const age = sim.t - st2.t0, on = age >= 0 && age < 0.8; sg.visible = on; if (on) { const wy = WATER_Y + waveH(p[0], p[2], sim.t), k = age / 0.8, rise = Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.5); sg.position.set(p[0], wy, p[2]); sg.children.forEach((c, i) => { const m = c as THREE.Mesh, a2 = (i / 9) * 6.283, tilt = 0.25 + 0.2 * ((i * 7) % 3), h = (0.9 + 0.5 * ((i * 5) % 4) / 3) * rise * (1 - 0.35 * k); m.position.set(Math.cos(a2) * 0.35 * (1 + k), h * 0.5, Math.sin(a2) * 0.35 * (1 + k)); m.rotation.set(Math.sin(a2) * tilt, 0, -Math.cos(a2) * tilt); m.scale.set(1 - 0.5 * k, Math.max(0.01, h), 1 - 0.5 * k); (m.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - k * k); }); } } }   // entry splash: crown of white shards on water entry (ref: stylized splash, spiky white crown over a foam skirt)
        { // original curved two-arm wake: short position history keeps the trail behind a turning swimmer
            const m = wakeRef.current, sp = Math.hypot(v[0],v[2]), surface = sim.swim && !sim.dive && p[1]>-2.1;
            const target = surface && sp>0.6 ? Math.min(0.58,sp*0.10) : 0;
            wakeStrength.current += (target-wakeStrength.current)*Math.min(1,dt*(target>0?6:3));
            const trail = wakeTrail.current;
            if(!surface || trail.length && Math.hypot(p[0]-trail[0].x,p[2]-trail[0].z)>12) trail.length=0;
            if(surface && (!trail.length || sim.t-trail[0].t>0.07)){
                // A hard reversal must start a new ribbon rather than join opposing arms across a cusp.
                if(trail.length>3){const a=trail[0],b=trail[3],ox=a.x-b.x,oz=a.z-b.z,ol=Math.hypot(ox,oz);if(ol>0.15&&sp>1.0&&(v[0]*ox+v[2]*oz)/(sp*ol)<0.20){trail.length=0;wakeStrength.current*=0.35;}}
                trail.unshift({x:p[0],z:p[2],t:sim.t});if(trail.length>28)trail.pop();}
            if(m){m.visible=surface && wakeStrength.current>0.015 && trail.length>2;if(m.visible){const pa=wakeGeo.attributes.position as THREE.BufferAttribute;
                for(let side=0;side<2;side++)for(let j=0;j<=24;j++){const t=j/24,sgn=side?1:-1,fi=t*(trail.length-1),ii=Math.floor(fi),ff=fi-ii,a=trail[ii],b=trail[Math.min(ii+1,trail.length-1)],prev=trail[Math.max(0,ii-1)],next=trail[Math.min(trail.length-1,ii+1)];
                    let dx=prev.x-next.x,dz=prev.z-next.z;const ln=Math.hypot(dx,dz);if(ln>0.02){dx/=ln;dz/=ln;}else{dx=Math.sin(sim.ang);dz=Math.cos(sim.ang);}
                    const cx=a.x+(b.x-a.x)*ff-dx*0.8,cz=a.z+(b.z-a.z)*ff-dz*0.8,spread=0.55+t*1.7,width=0.06+t*0.16;
                    for(let k=0;k<2;k++){const off=sgn*(spread+(k?width:-width)),x=cx-dz*off,z=cz+dx*off;pa.setXYZ(side*50+j*2+k,x,WATER_Y+waveH(x,z,sim.t)+0.055,z);}}
                pa.needsUpdate=true;wakeMat.uniforms.uA.value=wakeStrength.current;}}
        }
        { const sp=Math.hypot(v[0],v[2]); ringFlow.current+=(THREE.MathUtils.smoothstep(sp,0.5,3.5)-ringFlow.current)*Math.min(1,dt*4); const rg = ringRef.current as unknown as THREE.Group; if (rg) { const on = sim.swim && p[1] > -2.6; rg.visible = on; if (on) { const wy = WATER_Y + waveH(p[0], p[2], sim.t); rg.position.set(p[0] - Math.sin(sim.ang) * 0.9, wy + 0.04, p[2] - Math.cos(sim.ang) * 0.9); rg.children.forEach((c, i) => { const ph = (sim.t * 0.7 + i / 3) % 1, m = c as THREE.Mesh; m.scale.setScalar(1.0 + ph * 5.5); (m.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - 0.70 * ringFlow.current) * (1 - ph) * (1 - ph); }); } } }   // waterline cue: expanding foam ring where the body cuts the surface
        if (sw2) { { const kw = Math.max(0, Math.min(1, (p[1] + 3) / 2.3)), wv = waveH(p[0], p[2], sim.t) * kw, sa2 = sim as any; sa2.swW = (sa2.swW === undefined ? wv : sa2.swW + (wv - sa2.swW) * Math.min(1, dt * 10)); h.position.y = p[1] - 1.7 + sa2.swW; } h.position.x -= Math.sin(sim.ang) * (sim.dive ? 0.6 : 1.3); h.position.z -= Math.cos(sim.ang) * (sim.dive ? 0.6 : 1.3); }
        const sa0 = sim as any; sa0.gB = (sa0.gB || 0) + ((sim.glideOn ? 1 : 0) - (sa0.gB || 0)) * Math.min(1, dt * 3.5);   // glide pose blend (slow in, quick out)
        const lean = (sw2 ? (sim.dive ? 1.9 : 1.45) : wl ? 0.18 : sim.web ? 0.5 : sim.ground ? 0.12 : 0.3) * (1 - sa0.gB * 0.8) + sa0.gB * 1.12;
        h.children[0].rotation.x = lean;
        { const c0 = h.children[0], sb = sim as any; c0.rotation.order = 'ZXY'; const yr = sb.bYaw === undefined ? 0 : ((sim.yaw - sb.bYaw + Math.PI * 3) % (Math.PI * 2) - Math.PI) / Math.max(dt, 1e-3); sb.bYaw = sim.yaw; sb.bR = (sb.bR || 0) + (Math.max(-0.5, Math.min(0.5, -yr * 0.9)) * sa0.gB - (sb.bR || 0)) * Math.min(1, dt * 4); c0.rotation.z = sb.bR; }   // glide banking: roll into the turn, eased
        if (sa0.gB > 0.01) { const lc = 0.9 * sa0.gB; h.position.x -= Math.sin(sim.ang) * Math.sin(lean) * lc; h.position.z -= Math.cos(sim.ang) * Math.sin(lean) * lc; h.position.y += (1 - Math.cos(lean)) * lc * 0.6; }
        const hs = Math.hypot(v[0], v[2]);
        const sw = sim.ground ? Math.sin(sim.runPhase * 3) * 0.9 * Math.min(1, hs / 6) : 0.25;
        legR.current.rotation.x = sw; legL.current.rotation.x = -sw;
        armL.current.rotation.x = -sw * 0.8;
        if (sw2) { const cs = Math.sin(sim.runPhase * 2.4); legR.current.rotation.x = cs * 0.5; legL.current.rotation.x = -cs * 0.5; armL.current.rotation.x = -2.6 + cs * 1.2; }
        if (wl) { const cw = Math.sin(sim.runPhase * 2.2); legR.current.rotation.x = -0.9 + cw * 0.5; legL.current.rotation.x = -0.9 - cw * 0.5; armL.current.rotation.x = -2.5 - cw * 0.35; }
        armR.current.rotation.x = sw2 ? -2.6 - Math.sin(sim.runPhase * 2.4) * 1.2 : wl ? -2.5 + Math.sin(sim.runPhase * 2.2) * 0.35 : sim.web ? (sim.swings % 2 === 1 ? -2.7 : -0.5) : sim.atkT > 0 ? -1.5 - Math.sin((0.32 - sim.atkT) * 10) * 0.6 : sw * 0.8;
        if (sim.web && !sw2 && !wl) armL.current.rotation.x = sim.swings % 2 === 0 ? -2.7 : -0.5;
        
        if ((sim as any).kick && sim.atkT > 0 && sim.shotT <= 0) { const kp = Math.sin((1 - sim.atkT / 0.32) * Math.PI); legR.current.rotation.x = -1.7 * kp; legL.current.rotation.x = 0.15; armR.current.rotation.x = -0.8; armL.current.rotation.x = -1.2; }
        if (sim.glideOn && !((sim as any).snareT > 0)) { armR.current.rotation.x = -0.1; armL.current.rotation.x = -0.1; armR.current.rotation.z = 1.3; armL.current.rotation.z = -1.3; const gt = Math.sin(sim.t * 5) * 0.05; legR.current.rotation.x = 0.12 + gt; legL.current.rotation.x = 0.06 - gt; }
        if ((sim as any).snareT > 0 && (sim as any).snareT < 0.45) { legR.current.rotation.x = -1.5; legL.current.rotation.x = 0.2; armR.current.rotation.x = -0.6; armL.current.rotation.x = -1.4; }
        { const tR = legR.current.rotation.x, tL = legL.current.rotation.x, tuck = sim.ground || sim.glideOn ? 0 : 0.35; rig.b.shinR.rotation.x = Math.max(0, tR) * 0.9 + 0.08 + tuck; rig.b.shinL.rotation.x = Math.max(0, tL) * 0.9 + 0.08 + tuck; rig.b.farmR.rotation.x = -0.35 + Math.min(0, armR.current.rotation.x + 1.2) * 0.2; rig.b.farmL.rotation.x = -0.35 + Math.min(0, armL.current.rotation.x + 1.2) * 0.2; rig.b.head.rotation.x = -(h.children[0].rotation.x) * 0.5; rig.b.spine.rotation.x = Math.sin(sim.runPhase * 3) * 0.04 * (sim.ground ? 1 : 0); }
        {   // clip layer: pick a Mixamo-derived clip for the state, crossfade by weight
            const ck = (((sim as any).snareT > 0 && (sim as any).snareT < 0.45) || (sim.glideOn && (sim as any).gB > 0.3)) ? '' : sim.swim ? 'swim' : sim.wall ? 'wall' : sim.atkT > 0 && sim.shotT <= 0 ? ((sim as any).kick ? '' : 'punch') : (!sim.ground && !sim.web) ? 'jump' : (sim.ground && hs < 0.6 && !sim.dive) ? 'idle' : (sim.ground && !sim.web) ? 'run' : '';
            const cs = clipSt.current;
            if (ck !== cs.key) { cs.key = ck || cs.key; }
            cs.w += ((ck ? 1 : 0) - cs.w) * Math.min(1, dt * 10);
            if (ck) {
                const c = CLIPS[ck];
                if (ck === 'wall') cs.t += dt * Math.min(1.6, speed / 3);
                else if (ck === 'swim') cs.t += dt * (0.6 + Math.min(1.2, speed / 8));
                else if (ck === 'punch') cs.t = 0.10 + (0.32 - sim.atkT) * 2.0;  // clip frames: fist reaches 0.67 m forward at clip t 0.233 s, holds to ~0.55 s; so arrival ~0.10 s after input
                else if (ck === 'jump') cs.t = (c.n / c.fps) * 0.5;
                else if (ck === 'run') cs.t += dt * Math.max(0.5, Math.min(2, hs / 5.5));
                else cs.t += dt;
            }
            if (cs.key === 'swim' || cs.key === 'wall') h.children[0].rotation.x *= 1 - cs.w * 0.9; else if (cs.key === 'run') h.children[0].rotation.x *= 1 - cs.w * 0.7;
            if (cs.w > 0.02 && (cs.key === 'run' || cs.key === 'idle') && CLIPS[cs.key].hy) { const c = CLIPS[cs.key], fi = Math.floor(((cs.t * c.fps) % c.n + c.n) % c.n); rig.b.hips.position.y = rig.hipsY + (c.hy[fi] - 1) * (cs.key === 'idle' ? 0.3 : 0.6) * cs.w; } else rig.b.hips.position.y = rig.hipsY;
            if (cs.w > 0.02 && CLIPS[cs.key]) sampleClip(CLIPS[cs.key], cs.t, cs.key === 'wall' || cs.key === 'swim' || cs.key === 'idle' || cs.key === 'run', rig.bones, cs.w);
            if (false as boolean) { _gq.setFromAxisAngle(_gz, 1.45); rig.b.uarmL.quaternion.premultiply(_gq); _gq.setFromAxisAngle(_gz, -1.45); rig.b.uarmR.quaternion.premultiply(_gq); }
            if (sim.shotT > 0 || sim.spring > 0) { // both arms aimed at the web target (shot: the enemy, spring: the anchor), blended in/out
                const tg = sim.shotT > 0 ? sim.shotTgt : sim.anchor, wt = Math.min(1, (sim.shotT > 0 ? sim.shotT : sim.spring) / 0.12);
                rig.root.updateWorldMatrix(true, true); _tg.set(tg[0], tg[1], tg[2]);
                for (const s2 of ['L', 'R']) { aimBone(rig.b['uarm' + s2], rig.b['farm' + s2], _tg, wt); rig.root.updateWorldMatrix(true, true); aimBone(rig.b['farm' + s2], rig.b['hand' + s2], _tg, wt); rig.root.updateWorldMatrix(true, true); }
            }
        }
        if (!sim.swim && sim.ground && !wl && (clipSt.current.key === 'run' || clipSt.current.key === 'idle')) {   // plant the lowest foot vertex on the street (measured from the skinned mesh, replaces the fixed run drop)
            h.updateMatrixWorld(true);
            let mn = 1e9;
            for (const e of rig.hull) { if (!e.foot) continue; tp0.set(0, 0, 0); for (let k = 0; k < 4; k++) { if (e.bw[k] <= 0) continue; _wv2.copy(e.p).applyMatrix4(rig.skel.boneInverses[e.bi[k]]).applyMatrix4(rig.skel.bones[e.bi[k]].matrixWorld); tp0.addScaledVector(_wv2, e.bw[k]); } if (tp0.y < mn) mn = tp0.y; }
            {   // plant from the lowest foot point seen over the clip cycle (stance), so the airborne phase of the stride is kept; smoothed, not per frame
                const gm = groundMin.current, ck2 = clipSt.current.key;
                const gBd = ((sim as any).gB || 0) > 0.03;   // glide body shift distorts foot heights: don't collect while it decays, re-collect fresh after
                if (gBd) gm.key = '';
                const fresh = gm.key !== ck2;
                if (fresh) { gm.key = ck2; gm.v = 1e9; }
                if (!gBd && mn < gm.v) gm.v = mn;
                const wg = gm.v > 1e8 ? groundCorr.current : Math.max(-0.4, Math.min(0.4, 0.02 + parkH(sim.pos[0], sim.pos[2]) - gm.v));
                if (fresh && !gBd) groundCorr.current = wg; else groundCorr.current += (wg - groundCorr.current) * Math.min(1, dt * 8);
            }
            if (DBG && (window as any).__dbgGround) (window as any).__gc = { mn, corr: groundCorr.current };
        } else { groundMin.current.key = ''; groundCorr.current += (0 - groundCorr.current) * Math.min(1, dt * 10); }
        h.position.y += groundCorr.current;
        h.position.y -= sim.land * 0.5; h.children[0].rotation.x += sim.land * 0.5 + (sim.dodgeT > 0 ? 0.6 : 0);
        if (!sim.swim && sim.ground && !wl) {   // landing crouch must never bury the feet: raise only, never pull down
            h.updateMatrixWorld(true);
            let mn2 = 1e9;
            for (const e of rig.hull) { if (!e.foot) continue; tp0.set(0, 0, 0); for (let k = 0; k < 4; k++) { if (e.bw[k] <= 0) continue; _wv2.copy(e.p).applyMatrix4(rig.skel.boneInverses[e.bi[k]]).applyMatrix4(rig.skel.bones[e.bi[k]].matrixWorld); tp0.addScaledVector(_wv2, e.bw[k]); } if (tp0.y < mn2) mn2 = tp0.y; }
            { const gr = parkH(sim.pos[0], sim.pos[2]); if (mn2 < gr) h.position.y += gr + 0.02 - mn2; }
            if (DBG && (window as any).__dbgGround) (window as any).__gc2 = mn2 < 0.0 ? 0.02 : mn2;
        }
        if (sim.wall && sim.wallB >= 0) lastWall.current = { n: [sim.wall[0], sim.wall[1]], b: sim.wallB };
        const wnX = sim.wall ? sim.wall : (sim.wallT > 0 && lastWall.current ? lastWall.current.n : null), wbX = sim.wall ? sim.wallB : (lastWall.current ? lastWall.current.b : -1);   // after a wall jump keep the push-out against the wall just left
        if (wnX && wbX >= 0) {   // keep the whole skinned body (head, hands, feet) at the facade: shift along the wall normal by the deepest extreme point
            const bd = buildings[wbX], n = wnX as number[], fx = -n[0], fz = -n[1];
            const pl = fx !== 0 ? (n[0] < 0 ? bd.x0 : bd.x1) : (n[1] < 0 ? bd.z0 : bd.z1), tp = _wv;
            h.updateMatrixWorld(true);
            let md = -1e9;
            for (const e of rig.hull) { tp.set(0, 0, 0); for (let k = 0; k < 4; k++) { if (e.bw[k] <= 0) continue; _wv2.copy(e.p).applyMatrix4(rig.skel.boneInverses[e.bi[k]]).applyMatrix4(rig.skel.bones[e.bi[k]].matrixWorld); tp.addScaledVector(_wv2, e.bw[k]); } const dd = fx !== 0 ? (tp.x - pl) * fx : (tp.z - pl) * fz; if (dd > md) md = dd; }
            const want = Math.max(-1.2, Math.min(1.2, -(md + 0.03)));
            if (want < wallCorr.current) wallCorr.current = want; else wallCorr.current += (want - wallCorr.current) * Math.min(1, dt * 14);   // push out instantly, ease back in
        } else wallCorr.current += (0 - wallCorr.current) * Math.min(1, dt * (sim.wallT > 0 ? 3 : 10));   // after a wall jump keep the push-out until the exit velocity clears the hull
        if (Math.abs(wallCorr.current) > 1e-4 && wnX) { const n = wnX; h.position.x -= n[0] * wallCorr.current; h.position.z -= n[1] * wallCorr.current; }
        { const gp = DBG ? (window as any).__game : null; if (gp && gp.probe) { h.updateMatrixWorld(true); const m = rig.root.children[0] as THREE.SkinnedMesh; m.skeleton.update(); const pa = m.geometry.attributes.position, si = m.geometry.attributes.skinIndex, swt = m.geometry.attributes.skinWeight, hv = new THREE.Vector3(); const grp = (n: string) => /^head|^neck/.test(n) ? 'head' : /^hand/.test(n) ? 'hands' : /^foot/.test(n) ? 'feet' : 'body'; const parts: Record<string, number[]> = {}; for (let i = 0; i < pa.count; i++) { let bi = si.getX(i), bw = swt.getX(i); for (let k = 1; k < 4; k++) { const w2 = swt.getComponent(i, k); if (w2 > bw) { bw = w2; bi = si.getComponent(i, k); } } const gname = grp(m.skeleton.bones[bi].name); const P = parts[gname] || (parts[gname] = [1e9, -1e9, 1e9, -1e9]); m.getVertexPosition(i, hv); hv.applyMatrix4(m.matrixWorld); P[0] = Math.min(P[0], hv.x); P[1] = Math.max(P[1], hv.x); P[2] = Math.min(P[2], hv.z); P[3] = Math.max(P[3], hv.z); } gp.parts = parts; } }
        cape.current.rotation.x = 0.25 + Math.min(1.0, speed / 38) + Math.sin(sim.t * 14) * 0.05 * Math.min(1, speed / 20);
        { // hidden cape chain: trail back with speed, flare and flutter in the glide
            const c1 = rig.b.cape1, c2 = rig.b.cape2, c3 = rig.b.cape3;
            if (c1) {
                const sp = Math.min(1, speed / 30), gl = sim.glideOn ? 1 : 0, ph = sim.t * (gl ? 9 : 6);
                const tx = gl ? 0.0   /* glide: cape lies back along the body (was 0.55, which stood the cape up behind the neck) */ : sp * 0.35, fl = gl ? 0.12 : 0.04 * sp;
                const lerp = Math.min(1, dt * 8), cs2: number[] = (sim as any).cpS || ((sim as any).cpS = [0, 0, 0, 0, 0]);   // state kept outside the bones (bones are reset every frame)
                cs2[0] += (tx + Math.sin(ph) * fl - cs2[0]) * lerp;
                cs2[1] += (tx * 0.9 + Math.sin(ph - 0.9) * fl * 1.3 - cs2[1]) * lerp;
                cs2[2] += (tx * 0.7 + Math.sin(ph - 1.8) * fl * 1.6 - cs2[2]) * lerp;
                cs2[3] += (Math.sin(ph * 0.7) * (gl ? 0.2 : 0.05 * sp) - cs2[3]) * lerp;
                cs2[4] += (Math.sin(ph * 0.7 - 1) * (gl ? 0.3 : 0.07 * sp) - cs2[4]) * lerp;
                c1.rotation.x = cs2[0]; c2.rotation.x = cs2[1]; c3.rotation.x = cs2[2]; c2.rotation.z = cs2[3]; c3.rotation.z = cs2[4];
            }
        }
        if ((sim as any).snareT > 0.4) { const sa = sim as any; if (!sa.handW) sa.handW = [[0, 0, 0], [0, 0, 0]]; h.updateMatrixWorld(true); [rig.b.handL, rig.b.handR].forEach((b: any, i: number) => { b.getWorldPosition(_hp); sa.handW[i][0] = _hp.x; sa.handW[i][1] = _hp.y; sa.handW[i][2] = _hp.z; }); }
        // web
        { // two web lines, each from an actual animated hand (world position), shot out to the anchor over ~0.14 s
            const wl2 = web.current, wr2 = webB.current, side = sim.swings % 2; // swing: alternate hands (odd = right); spring-shot jump and web-shot attack: both hands together
            const mode = sim.shotT > 0 ? 2 : sim.spring > 0 ? 1 : sim.web ? 0 : -1;
            const both = mode > 0;
            wl2.visible = mode >= 0 && (both || side === 0); wr2.visible = mode >= 0 && (both || side === 1);
            if (mode >= 0) {
                rig.root.updateWorldMatrix(true, true);
                const tgt = mode === 2 ? sim.shotTgt : sim.anchor;
                const grow = mode === 2 ? Math.min(1, Math.max(0.05, (0.3 - sim.shotT) / 0.1)) : mode === 1 ? Math.max(0.05, sim.spring / 0.4) : Math.min(1, Math.max(0.05, sim.webT / 0.14));
                const ws = [wl2, wr2], hb = [rig.b.handL, rig.b.handR], fb = [rig.b.farmL, rig.b.farmR];
                for (let i = both ? 0 : side; i <= (both ? 1 : side); i++) {
                    hb[i].getWorldPosition(_hp); fb[i].getWorldPosition(_fp); _hp.addScaledVector(_wd2.copy(_hp).sub(_fp).normalize(), 0.08);
                    const dx = tgt[0] - _hp.x, dy = tgt[1] - _hp.y, dz = tgt[2] - _hp.z, l = Math.hypot(dx, dy, dz) || 1, ll = l * grow;
                    ws[i].position.set(_hp.x + dx / l * ll / 2, _hp.y + dy / l * ll / 2, _hp.z + dz / l * ll / 2);
                    ws[i].quaternion.setFromUnitVectors(Y, _wd2.set(dx / l, dy / l, dz / l));
                    ws[i].scale.set(1, ll, 1);
                    if (DBG) { (window as any)['__webO' + i] = [_hp.x, _hp.y, _hp.z]; (window as any).__webMode = mode; }
                }
            }
        }
        { const bm = beaconRef.current; bm.position.set(sim.beacon[0], sim.beacon[1] + 45, sim.beacon[2]); bm.scale.set(1 + 0.08 * Math.sin(sim.t * 3), 1, 1 + 0.08 * Math.sin(sim.t * 3)); }
        { // edge-aware beacon marker (DOM, no React state)
            const el = document.getElementById('bmark');
            if (el) {
                bv.set(sim.beacon[0], sim.beacon[1] + 6, sim.beacon[2]);
                camera.updateMatrixWorld();
                bv2.copy(bv).applyMatrix4(camera.matrixWorldInverse);
                const behind = bv2.z > -0.1; // camera looks down -z in view space
                let x: number, y: number;
                if (behind) { const l = Math.hypot(bv2.x, bv2.y); if (l < 0.01) { x = 0; y = -1; } else { x = bv2.x / l; y = bv2.y / l; } }
                else { bv.project(camera); x = bv.x; y = bv.y; }
                const m = Math.max(Math.abs(x) / 0.82, Math.abs(y) / 0.8, 1);
                const onScreen = !behind && m <= 1;
                x = x / (onScreen ? 1 : m); y = y / (onScreen ? 1 : m);
                el.style.transform = 'translate(' + (((x + 1) / 2) * window.innerWidth - 20).toFixed(0) + 'px,' + (((1 - y) / 2) * window.innerHeight - 20).toFixed(0) + 'px) rotate(' + (onScreen ? 180 : Math.atan2(-y, x) * 57.3 + 90).toFixed(0) + 'deg)';
                el.style.opacity = sim.mode === 'play' ? '1' : '0';
            }
        }
        { // enemies (instanced, one mesh per bot kind)
            const n = sim.enemies.length, cnt = [0, 0, 0, 0];
            for (let i = 0; i < n; i++) {
                const e = sim.enemies[i], k = e.kind || 0, m = enMeshes.current[k]; if (!m) continue;
                const fall = e.down > 0 ? Math.min(1, (3 - e.down) * 5) : 0, bob = k === 2 ? Math.sin(sim.t * 2.5 + i) * 0.08 : 0;
                tmp.position.set(e.x, e.y + 0.06 - fall * 0.6 + bob, e.z); tmp.rotation.set(fall * -1.4, e.ang, 0); tmp.scale.set(1.25, 1.25, 1.25); tmp.updateMatrix();
                m.setMatrixAt(cnt[k], tmp.matrix);
                if (e.hit > 0) ecol.setRGB(2.6, 2.6, 2.6); else if (e.atk > 0) ecol.setRGB(1.8, 0.5 + Math.sin(sim.t * 30) * 0.2, 0.4); else ecol.setRGB(1, 1, 1);
                m.setColorAt(cnt[k], ecol); cnt[k]++;
            }
            for (let k = 0; k < 4; k++) { const m = enMeshes.current[k]; if (!m) continue; m.count = cnt[k]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
        }
        // orbs
        const t = sim.t;
        let nb = -1, nd = 1e9;
        for (let i = 0; i < sim.orbs.length; i++) {
            const o = sim.orbs[i], by = o[1] + Math.sin(t * 2 + o[0]) * 0.6;
            tmp.position.set(o[0], by, o[2]); tmp.rotation.set(t * 1.2, t * 1.5, 0); tmp.scale.setScalar(1); tmp.updateMatrix();
            cores.current.setMatrixAt(i, tmp.matrix);
            tmp.rotation.set(0, 0, 0); tmp.scale.setScalar(1 + 0.12 * Math.sin(t * 5 + i)); tmp.updateMatrix(); glows.current.setMatrixAt(i, tmp.matrix);
            const d = Math.hypot(o[0] - p[0], o[1] - p[1], o[2] - p[2]); if (d < nd) { nd = d; nb = i; }
        }
        cores.current.instanceMatrix.needsUpdate = true; glows.current.instanceMatrix.needsUpdate = true;
        arrow.current.visible = false;   // user 10:01 "Remove navigator arrows"
        if (nb >= 0) {
            const o = sim.orbs[nb], a = Math.atan2(o[0] - p[0], o[2] - p[2]);
            arrow.current.position.set(p[0] + Math.sin(a) * 3, p[1] + 3.2, p[2] + Math.cos(a) * 3);
            arrow.current.rotation.set(Math.PI / 2, 0, 0); arrow.current.rotation.order = 'YXZ'; arrow.current.rotation.y = a;
        }
    });

    return <>
        <mesh ref={beaconRef} frustumCulled={false}><cylinderGeometry args={[4, 4, 90, 12, 1, true]} /><meshBasicMaterial color="#5ff2ff" transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} fog={false} /></mesh>
        <color attach="background" args={[FOG[0], FOG[1], FOG[2]]} />
        <hemisphereLight name="hemi" args={['#d4e4ff', '#8a9a6a', 1.25]} />
        <directionalLight name="sun1" position={[-30, 60, 20]} intensity={1.8} color="#ffdcae" />
        <directionalLight name="sun2" position={[20, 30, -40]} intensity={0.8} color="#a8caff" />
        <DayNight />
        <FxaaPass enabled={coarse} />
        <Sky />
        <City />
        <FlyingCars />
        <Forest sim={sim} /><Meadow sim={sim} /><SnareLines sim={sim} /><Underwater sim={sim} />
        <group ref={hero}>
            <group>
                <primitive object={rig.root} />
            </group>
        </group>
        <mesh ref={web} visible={false}><cylinderGeometry args={[0.035, 0.035, 1, 5]} /><meshBasicMaterial color="#f4f4ff" /></mesh>
        <mesh ref={webB} visible={false}><cylinderGeometry args={[0.035, 0.035, 1, 5]} /><meshBasicMaterial color="#f4f4ff" /></mesh>
        <mesh ref={arrow}><coneGeometry args={[0.35, 1.1, 8]} /><meshBasicMaterial color="#ffd54a" /></mesh>
        <mesh ref={wakeRef} geometry={wakeGeo} material={wakeMat} visible={false} frustumCulled={false} />
        <group ref={splashRef} visible={false}>{[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => <mesh key={i} frustumCulled={false}><coneGeometry args={[0.13, 1, 5]} /><meshBasicMaterial color="#f4fdff" transparent opacity={0.9} depthWrite={false} /></mesh>)}</group>
        <group ref={ringRef as any} visible={false}>{[0, 1, 2].map((i) => <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false}><ringGeometry args={[1.0, 1.09, 48]} /><meshBasicMaterial color="#eefbff" transparent opacity={0.4} depthWrite={false} /></mesh>)}</group>
        <mesh position={[0, WATER_Y, (WATER_Z - HALF - 500) / 2]} rotation={[-Math.PI / 2, 0, 0]} ref={waterRef} material={waterMat} frustumCulled={false}><planeGeometry args={[2 * (HALF + 500), WATER_Z + HALF + 500, 160, 80]} /></mesh>
        <mesh position={[0, SEABED, (WATER_Z - HALF - 500) / 2]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[2 * (HALF + 500), WATER_Z + HALF + 500]} /><primitive object={seabedMat} attach="material" /></mesh>
        <mesh position={[0, (SEABED) / 2, WATER_Z - 0.3]}><boxGeometry args={[2 * (HALF + 200), -SEABED, 0.6]} /><primitive object={wallMat} attach="material" /></mesh>
        {enemyGeos.map((g, k) => <instancedMesh key={k} ref={(r) => { if (r) enMeshes.current[k] = r; }} args={[undefined, undefined, 16]} frustumCulled={false} geometry={g}><meshLambertMaterial color="#ffffff" vertexColors /></instancedMesh>)}
        <instancedMesh ref={cores} args={[undefined, undefined, 18]} frustumCulled={false}><icosahedronGeometry args={[1.3, 1]} /><meshBasicMaterial color="#ffd23f" /></instancedMesh>
        <instancedMesh ref={glows} args={[undefined, undefined, 18]} frustumCulled={false}><sphereGeometry args={[3.0, 10, 8]} /><meshBasicMaterial color="#ffb347" transparent opacity={0.22} blending={THREE.AdditiveBlending} depthWrite={false} /></instancedMesh>
    </>;
}
export { gsap, resetSim };
