import tenementData from './polyfork-tenement.json';
import { PINE_URL, LEAVES_URL } from './texdata'
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import heroData from './hero.json';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import baseTexUrl from './basetex';
import clipIdle from './clips/idle.json';
import clipJump from './clips/jump.json';
import clipWall from './clips/climbing_wall.json';
import clipPunch from './clips/punch.json';
import clipSwim from './clips/swimming.json';
import clipRun from './clips/run.json';
import { shadowGeo, shadowMat } from './shadowbot';
import { withPedestrianHands } from './pedestrianHands';
import { GiantBoss } from './GiantBoss';
import { BossArenaMarker } from './BossArenaMarker';
import { BOSS_BODY_OFFSET } from './bossConfig';
import { attachInk, syncInk } from './ink';
import { robotGeo, robotMat, armorRobot, armorCompanion, armorDrone, coatRobot, EYE_BLUE, EYE_RED } from './robotgeo';
import { world, buildings, WATER_Z, CELL, PARK, PARK_POND, PARK_POND_Y, bridgeSurfaceAt, parkH, sandWeight, BEACH_DIR, LAKE_SHORE, WATER_Y, SEABED, SEA, seabedAt, HALF, FOG, isLakeWater, lakeWaveH, waterSurfaceAt, stepSim, stepBeacon, resetSim, input, MOVES, SNARE, enemyBodyOffset, enemyPalm, ESHOT, CARS, CAR_N, CAR_SCALE, carAt, type Unibeam, type Sim, type Events } from './sim';
import { ParkGround, PolyforkBuildings, PolyforkLakeBridge } from './polyforkEnvironment';
import { QUALITY, QK, HQ, AA_FXAA } from './quality';
import { SelectiveBloomPass } from './SelectiveBloomPass';
import { HD, applyRatio, worldBufferSize, worldTarget, registerHero, createHeroComposite } from './heroHD';
import { SELECTIVE_BLOOM_LAYER } from './renderLayers';

// time of day: one shared state object, materials hold references to its uniform objects and the DayNight component updates them in place
const TOD = { sun: new THREE.Vector3(-0.55, 0.22, 0.8).normalize(), sunU: null as any, day: { value: 1 }, warm: { value: 1 }, noon: { value: 0 }, fog: new THREE.Color(FOG[0], FOG[1], FOG[2]), sky: new THREE.Color('#c4dcef') };
TOD.sunU = { value: TOD.sun };

const DBG = !!(import.meta as any).env.VITE_DBG;   // test hooks only in instrumented builds
const HERO_SC = 1.5, BOT_SC = HERO_SC * 1.2;   // user: humanoid bots are 1.2x the hero (same hero.json mesh at the same native height, so scales compare directly)
const CITY_VS = `attribute vec3 aCol;attribute float aSeed;
varying vec3 vPos;varying vec3 vNor;varying vec3 vCol;varying float vSeed;
void main(){vPos=position;vNor=normal;vCol=aCol;vSeed=aSeed;gl_Position=projectionMatrix*viewMatrix*vec4(position,1.0);}`;
const CITY_FS = `varying vec3 vPos;varying vec3 vNor;varying vec3 vCol;varying float vSeed;
uniform vec3 uFog;uniform float uTime;uniform vec3 uSunV;uniform float uDay;uniform float uNoon;
void main(){
 if(vSeed>10.0)discard;
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
// env-iter3 near-field sharpen (Shifat Oct 29: "sharpen what's closer to view & keep same res what's not"). Same FXAA pass as above,
// then a clamped unsharp mask on the world image (contrast-adaptive in the spirit of AMD FidelityFX CAS: limited to the local
// min/max so it cannot halo, and backed off on hard geometric edges so FXAA's smoothing survives). Its strength comes from the
// world depth: full within ~6 m of the camera, gone by ~28 m, never on the sky. One extra depth fetch + ~20 ALU per world pixel.
// Heroes are redrawn afterwards at native resolution by the (locked) hero HD pass, so this only ever shows on the world.
const FXAA_SHARP_FS = FXAA_FS.replace('uniform vec2 uRes;', 'uniform vec2 uRes; uniform sampler2D tDepth; uniform float uNear; uniform float uFar; uniform float uSharp;')
    .replace('  gl_FragColor = vec4(col, 1.0);\n}', `  float sd = texture2D(tDepth, vUv).x;
  float szn = sd * 2.0 - 1.0, sz = (2.0 * uNear * uFar) / (uFar + uNear - szn * (uFar - uNear));
  float sk = uSharp * (1.0 - smoothstep(6.0, 28.0, sz)) * step(sd, 0.99999) * (1.0 - smoothstep(0.14, 0.38, lMax - lMin));
  if (sk > 0.002) {
    vec3 sMin = min(cM, min(min(cNW, cNE), min(cSW, cSE))), sMax = max(cM, max(max(cNW, cNE), max(cSW, cSE)));
    col = clamp(col + (col - 0.25 * (cNW + cNE + cSW + cSE)) * sk, sMin, sMax);
  }
  gl_FragColor = vec4(col, 1.0);
}`);
export const SHARPEN = { amount: 0.7 };
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

const OUT_FS = `uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 uRes; uniform float uNear; uniform float uFar; uniform float uTh; uniform float uOn; varying vec2 vUv;
float vz(vec2 uv){ float d = texture2D(tDepth, uv).x; float zn = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - zn * (uFar - uNear)); }
void main(){
  vec4 c4 = texture2D(tColor, vUv); vec3 c = c4.rgb;
  // alpha classes: >= 0.75 ordinary surfaces; 0.5 band = glowing lights (never inked); env-iter3: 0.25 = grass blades/flowers, 0.375 = park ground
  float lightMask = 1.0 - step(0.45, c4.a) * (1.0 - step(0.75, c4.a)) - (1.0 - step(0.75, c4.a)) * step(c4.a, 0.18);
  vec2 px = uTh / uRes;
  float z = vz(vUv);
  vec2 ox = vec2(px.x, 0.0), oy = vec2(0.0, px.y);
  float zx1 = vz(vUv + ox), zx2 = vz(vUv - ox), zy1 = vz(vUv + oy), zy2 = vz(vUv - oy);
  float e = max(max(zx1 - z, zx2 - z), max(zy1 - z, zy2 - z)) / z;   // one-sided: only the nearer pixel of a depth step is inked, so the line stays 1px and sits inside the near silhouette
  if (abs(c4.a - 0.25) < 0.06) {   // env-iter3 (Shifat: "grass blades must not get outline solo, whole grass lands get outline as one"): a blade pixel only inks against what is neither grass nor park ground, so blade-on-blade and blade-on-ground steps vanish and only the meadow's outer silhouette remains
    vec4 an = vec4(texture2D(tColor, vUv + ox).a, texture2D(tColor, vUv - ox).a, texture2D(tColor, vUv + oy).a, texture2D(tColor, vUv - oy).a);
    vec4 land = step(an, vec4(0.43)) * step(vec4(0.19), an);   // neighbour is grass (0.25) or ground (0.375)
    e = max(max((zx1 - z) * (1.0 - land.x), (zx2 - z) * (1.0 - land.y)), max((zy1 - z) * (1.0 - land.z), (zy2 - z) * (1.0 - land.w))) / z;
  }
  float k = smoothstep(0.12, 0.30, e) * (1.0 - smoothstep(22.0, 55.0, z)) * uOn * lightMask;
  gl_FragColor = vec4(mix(c, vec3(0.04, 0.05, 0.10), k * 0.85), 1.0);
}`;
export const OUTLINE_STATE = { on: true };
if (!OUTLINE_STATE.on) HD.enabled = false;   // the hero HD pass reuses the outline pass's world depth

// Heroes at native resolution over the world (see heroHD.ts); runs after outline (1) and bloom (2).
function HeroHDPass() {
    const { gl, scene, camera } = useThree();
    const c = useMemo(() => createHeroComposite(), []);
    useEffect(() => () => c.dispose(), [c]);
    useFrame(() => c.render(gl, scene, camera), 3);
    return null;
}
function OutlinePass() {
    const { gl, scene, camera } = useThree();
    const st = useMemo(() => {
        const rt = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: true, samples: 0 }); (rt as any).isXRRenderTarget = true;   // makes three apply the renderer's tone mapping and output encoding inside the target, so colours match direct-to-screen rendering
        rt.depthTexture = new THREE.DepthTexture(4, 4); rt.depthTexture.type = THREE.UnsignedIntType;
        rt.texture.minFilter = rt.texture.magFilter = THREE.NearestFilter; rt.texture.colorSpace = THREE.SRGBColorSpace;
        const mat = new THREE.ShaderMaterial({ uniforms: { tColor: { value: rt.texture }, tDepth: { value: rt.depthTexture }, uRes: { value: new THREE.Vector2(4, 4) }, uNear: { value: 0.5 }, uFar: { value: 700 }, uTh: { value: 1.0 }, uOn: { value: 1 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: OUT_FS, depthTest: false, depthWrite: false, toneMapped: false });
        const qs = new THREE.Scene(), q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); q.frustumCulled = false; qs.add(q);
        const ft = new THREE.FramebufferTexture(4, 4); ft.minFilter = ft.magFilter = THREE.LinearFilter;
        const fm = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: ft }, uRes: { value: new THREE.Vector2(4, 4) }, tDepth: { value: rt.depthTexture }, uNear: { value: 0.5 }, uFar: { value: 700 }, uSharp: { value: SHARPEN.amount } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: FXAA_SHARP_FS, depthTest: false, depthWrite: false, toneMapped: false });
        const fs = new THREE.Scene(), fq = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fm); fq.frustumCulled = false; fs.add(fq);
        return { rt, mat, qs, qc: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), sz: new THREE.Vector2(), ft, fm, fs };
    }, []);
    useFrame(() => {
        worldBufferSize(gl, st.sz);
        if (st.rt.width !== st.sz.x || st.rt.height !== st.sz.y) { st.rt.setSize(st.sz.x, st.sz.y); st.mat.uniforms.uRes.value.copy(st.sz); }
        const cam = camera as THREE.PerspectiveCamera; st.mat.uniforms.uNear.value = cam.near; st.mat.uniforms.uFar.value = cam.far; st.fm.uniforms.uNear.value = cam.near; st.fm.uniforms.uFar.value = cam.far; st.fm.uniforms.uSharp.value = DBG && (window as any).__sharp !== undefined ? (window as any).__sharp : SHARPEN.amount;
        st.mat.uniforms.uTh.value = 1.0;
        st.mat.uniforms.uOn.value = (DBG && (window as any).__noOutline) ? 0 : 1;
        if (st.ft.image.width !== st.sz.x || st.ft.image.height !== st.sz.y) { st.ft.dispose(); st.ft.image = { width: st.sz.x, height: st.sz.y } as any; st.fm.uniforms.uRes.value.copy(st.sz); }
        const out = worldTarget(gl); HD.depth = st.rt.depthTexture;   // hero HD pass: the world's final frame goes to the world RT, same size as before
        gl.setRenderTarget(st.rt); gl.render(scene, camera); gl.setRenderTarget(out); gl.render(st.qs, st.qc); gl.copyFramebufferToTexture(st.ft, _v0); gl.render(st.fs, st.qc);
    }, 1);
    return null;
}


// env-iter3 F: Iron Man-style enemy fire, render side. One instanced additive "glow" mesh carries every bolt core, bolt streak,
// palm-charge glow and boss chest-charge glow (2 draw calls total with the beam), fresnel-faded so each reads as a soft light.
// No real lights on any tier; tagged for the existing selective bloom.
const GLOW_VS = `varying vec3 vN; varying vec3 vV; varying vec3 vC;
void main(){ vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * mat3(instanceMatrix) * normal); vV = -mv.xyz;
#ifdef USE_INSTANCING_COLOR
vC = instanceColor;
#else
vC = vec3(1.0);
#endif
gl_Position = projectionMatrix * mv; }`;
const GLOW_FS = `uniform float uT; varying vec3 vN; varying vec3 vV; varying vec3 vC;
void main(){ float f = abs(dot(normalize(vN), normalize(vV))); float k = f * f * 1.5 + 0.12 * f; gl_FragColor = vec4(vC * k * (0.92 + 0.08 * sin(uT * 47.0 + gl_FragCoord.x * 0.05)), 1.0); }`;
const ES_GLOW_N = ESHOT.MAX * 2 + 64, ES_BEAM_N = 4;
function EnemyShotsFx({ sim }: { sim: Sim }) {
    const glow = useRef<THREE.InstancedMesh>(null!), beam = useRef<THREE.InstancedMesh>(null!);
    const mat = useMemo(() => new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 } }, vertexShader: GLOW_VS, fragmentShader: GLOW_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), []);
    const sGeo = useMemo(() => new THREE.SphereGeometry(1, 10, 8), []);
    const cGeo = useMemo(() => { const g = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true); g.translate(0, 0.5, 0); return g; }, []);
    const st = useMemo(() => ({ o: new THREE.Object3D(), c: new THREE.Color(), d: new THREE.Vector3(), q: new THREE.Quaternion(), Y: new THREE.Vector3(0, 1, 0) }), []);
    useEffect(() => { for (const m of [glow.current, beam.current]) { m.layers.enable(SELECTIVE_BLOOM_LAYER); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.setColorAt(0, st.c.set(0, 0, 0)); m.count = 0; } }, []);
    useFrame(() => {
        const { o, c, d, q, Y } = st, g = glow.current, bm = beam.current; mat.uniforms.uT.value = sim.t; let n = 0, nb = 0;
        const put = (x: number, y: number, z: number, sx: number, sy: number, sz: number, r: number, gg: number, b: number) => { if (n >= ES_GLOW_N) return; o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.updateMatrix(); g.setMatrixAt(n, o.matrix); g.setColorAt(n++, c.setRGB(r, gg, b)); };
        for (const b of sim.eshots || []) {
            if (b.dead > 0) { const k = 1 - b.dead / 0.25; o.quaternion.identity(); put(b.x, b.y, b.z, 0.5 + (1 - k) * 0.9, 0.5 + (1 - k) * 0.9, 0.5 + (1 - k) * 0.9, 0.9 * k, 0.95 * k, 1.0 * k); continue; }   // pop flash
            const sp = Math.hypot(b.vx, b.vy, b.vz) || 1; d.set(b.vx / sp, b.vy / sp, b.vz / sp);
            o.quaternion.identity(); put(b.x, b.y, b.z, b.boss ? 0.4 : 0.32, b.boss ? 0.4 : 0.32, b.boss ? 0.4 : 0.32, 1.0, 1.0, 1.0);   // white-hot core
            const L = Math.min(2.4, 0.25 + b.t * 16) * (b.boss ? 1.3 : 1);   // streak grows out of the palm, then a fixed light trail
            q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d); o.quaternion.copy(q);
            put(b.x - d.x * L * 0.5, b.y - d.y * L * 0.5, b.z - d.z * L * 0.5, 0.21, 0.21, L * 0.5, 0.35, 0.75, 1.0);
        }
        o.quaternion.identity();
        for (const e of sim.enemies) {
            if (e.down > 0) continue; const ea = e as any;
            if (ea.rpT > 0) {   // telegraph: the raised palm glows up over the charge
                const k = 1 - Math.min(1, ea.rpT / ESHOT.CHARGE), pal = enemyPalm(e), s0 = (e.boss ? 0.55 : 0.22) * (0.5 + k) * (1 + 0.15 * Math.sin(sim.t * 40));
                put(pal[0], pal[1], pal[2], s0, s0, s0, 0.9, 0.97, 1.0);
                put(pal[0], pal[1], pal[2], s0 * 2.4, s0 * 2.4, s0 * 2.4, 0.12 * k, 0.32 * k, 0.5 * k);
            }
            const u: Unibeam | undefined = ea.uni;
            if (u) {
                const k = u.phase === 'charge' ? Math.min(1, u.t / ESHOT.UNI_CHARGE) : 1, s0 = (0.5 + 1.1 * k) * (1 + 0.1 * Math.sin(sim.t * 33));
                put(u.ox, u.oy, u.oz, s0, s0, s0, 0.9, 0.97, 1.0); put(u.ox, u.oy, u.oz, s0 * 2.2, s0 * 2.2, s0 * 2.2, 0.15 * k, 0.35 * k, 0.6 * k);   // chest arc reactor charging
                if (u.phase === 'fire' && nb < ES_BEAM_N - 1) {
                    d.set(Math.sin(u.yaw) * Math.cos(u.pitch), Math.sin(u.pitch), Math.cos(u.yaw) * Math.cos(u.pitch)); q.setFromUnitVectors(Y, d);
                    const fade = Math.min(1, u.t / 0.12) * Math.min(1, (ESHOT.UNI_FIRE - u.t) / 0.2), w = 1 + 0.12 * Math.sin(sim.t * 60);
                    o.quaternion.copy(q); o.position.set(u.ox, u.oy, u.oz);
                    o.scale.set(ESHOT.UNI_R * 0.9 * w, ESHOT.UNI_LEN, ESHOT.UNI_R * 0.9 * w); o.updateMatrix(); bm.setMatrixAt(nb, o.matrix); bm.setColorAt(nb++, c.setRGB(0.25 * fade, 0.6 * fade, 1.0 * fade));
                    o.scale.set(ESHOT.UNI_R * 0.38, ESHOT.UNI_LEN, ESHOT.UNI_R * 0.38); o.updateMatrix(); bm.setMatrixAt(nb, o.matrix); bm.setColorAt(nb++, c.setRGB(0.95 * fade, 0.98 * fade, 1.0 * fade));
                    o.quaternion.identity();
                }
            }
        }
        g.count = n; bm.count = nb;
        g.instanceMatrix.needsUpdate = true; bm.instanceMatrix.needsUpdate = true; if (g.instanceColor) g.instanceColor.needsUpdate = true; if (bm.instanceColor) bm.instanceColor.needsUpdate = true;
        if (DBG) (window as any).__eshots = { bolts: (sim.eshots || []).length, glows: n, beams: nb };
    });
    return <group>
        <instancedMesh ref={glow} args={[sGeo, mat, ES_GLOW_N]} frustumCulled={false} renderOrder={5} />
        <instancedMesh ref={beam} args={[cGeo, mat, ES_BEAM_N]} frustumCulled={false} renderOrder={5} />
    </group>;
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

// Polyfork free game-embedding licence checked October 27, 2026; local peripheral-block prototype.
function TenementBlock(){
 const geo=useMemo(()=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(tenementData.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(tenementData.n,3));g.setAttribute('color',new THREE.Float32BufferAttribute(tenementData.c,3));return g;},[]);
 const mat=useMemo(()=>new THREE.ShaderMaterial({uniforms:{uBlockDay:TOD.day,uBlockFog:{value:TOD.fog}},vertexShader:`attribute vec3 color;varying vec3 vC;varying vec3 vN;varying float vD;void main(){vC=color;vN=mat3(modelMatrix)*mat3(instanceMatrix)*normal;vec4 wp=modelMatrix*instanceMatrix*vec4(position,1.0);vec4 mv=viewMatrix*wp;vD=length(mv.xyz);gl_Position=projectionMatrix*mv;}`,fragmentShader:`uniform float uBlockDay;uniform vec3 uBlockFog;varying vec3 vC;varying vec3 vN;varying float vD;void main(){float light=.40+.60*max(0.,dot(normalize(vN),normalize(vec3(-.5,1.,.3))));vec3 c=vC*light*(.22+.9*uBlockDay);float glass=1.-step(.012,distance(vC,vec3(.25415,.39157,.47932)));c+=vec3(1.,.584,.275)*.6*(1.-uBlockDay)*glass;float fog=1.-exp(-vD*vD*.000006);gl_FragColor=vec4(mix(c,uBlockFog,fog),1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>}`}),[]);
 const ref=useRef<THREE.InstancedMesh>(null!);useEffect(()=>{const o=new THREE.Object3D();for(let i=0;i<6;i++){o.position.set(-249+(i%3)*9,0,72+Math.floor(i/3)*17);o.rotation.set(0,Math.floor(i/3)?Math.PI:0,0);o.updateMatrix();ref.current.setMatrixAt(i,o.matrix);}ref.current.instanceMatrix.needsUpdate=true;ref.current.computeBoundingSphere();},[]);
 return <instancedMesh ref={ref} args={[geo,mat,6]}/>;
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

// env-iter3 natural trunks (Shifat Oct 29: "tree trunks look unnatural, fix; foliages are perfect"). One tube per trunk instead of a
// straight open cylinder: power-curve taper, a gentle seeded bend, a root flare with 5 buttress lobes fading up the first metre,
// slight bark irregularity, darker root-end vertex colour; the bark texture doubles as a bump map. Seeded by its OWN generator, so the
// leaf/canopy generator's random stream (and therefore every canopy) is exactly what it was.
type TubeOpt = { H: number; rBot: number; rTop: number; hSeg: number; rSeg: number; flare: number; lobes: number; bend: number; seed: number; path?: (t: number) => THREE.Vector3; radius?: (t: number) => number; vScale?: number };
function trunkTube(o: TubeOpt) {
    let r = o.seed * 7 + 13; const tr = () => (r = (r * 48271) % 2147483647) / 2147483647;
    const ph = tr() * 6.28, ph2 = tr() * 6.28, bx = (tr() - 0.5) * 2 * o.bend, bz = (tr() - 0.5) * 2 * o.bend;
    const path = o.path || ((t: number) => new THREE.Vector3(bx * Math.sin(Math.PI * t * 0.9) + bz * 0.3 * Math.sin(Math.PI * t * 1.7), o.H * t, bz * Math.sin(Math.PI * t * 0.8)));
    const rad = o.radius || ((t: number) => o.rTop + (o.rBot - o.rTop) * Math.pow(1 - t, 1.5));
    const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
    const T = new THREE.Vector3(), S1 = new THREE.Vector3(), S2 = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i <= o.hSeg; i++) {
        const t = Math.pow(i / o.hSeg, 1.5), c = path(t); T.copy(path(Math.min(1, t + 0.01))).sub(path(Math.max(0, t - 0.01))).normalize();
        S1.crossVectors(Z, T).normalize(); S2.crossVectors(T, S1).normalize();
        const hm = o.H * t, fl = Math.exp(-hm / 0.7), base = rad(t) * (1 + o.flare * fl);
        const tint = 0.8 + 0.2 * Math.min(1, hm / 1.4), tv = 1 + (tr() - 0.5) * 0.08;
        for (let j = 0; j <= o.rSeg; j++) {
            const a = (j / o.rSeg) * Math.PI * 2;
            const rr = base * (1 + o.lobes * fl * Math.sin(5 * a + ph) + 0.045 * Math.sin(3 * a + ph2 + hm * 0.9) + 0.03 * Math.sin(7 * a + hm * 2.3));
            const p = c.clone().addScaledVector(S1, Math.cos(a) * rr).addScaledVector(S2, Math.sin(a) * rr);
            pos.push(p.x, p.y, p.z); uv.push(j / o.rSeg, o.vScale ? hm / o.vScale : t);
            const k = tint * tv; col.push(k, k * 0.98, k * 0.95);
            if (i < o.hSeg && j < o.rSeg) { const a0 = i * (o.rSeg + 1) + j, a1 = a0 + o.rSeg + 1; idx.push(a0, a1, a0 + 1, a0 + 1, a1, a1 + 1); }
        }
    }
    // Shifat Oct 29 "weird tree trunk gape": the tube was open at the top, so the fork showed a hollow ring. Close it with a
    // low rounded cap (apex just above the last ring, along the trunk direction).
    { const top = o.hSeg * (o.rSeg + 1), cTop = path(1), Tt = path(1).sub(path(0.98)).normalize(), apex = pos.length / 3;
      const cap = cTop.addScaledVector(Tt, rad(1) * 0.6); pos.push(cap.x, cap.y, cap.z); uv.push(0.5, o.vScale ? (o.H + rad(1) * 0.6) / o.vScale : 1); col.push(0.82, 0.8, 0.78);
      for (let j = 0; j < o.rSeg; j++) idx.push(top + j, apex, top + j + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
    g.computeVertexNormals();
    { const n = g.attributes.normal as THREE.BufferAttribute, w = o.rSeg + 1; for (let i = 0; i <= o.hSeg; i++) { const a = i * w, b = a + o.rSeg; const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), l = Math.hypot(x, y, z) || 1; n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l); } }   // close the seam
    return { geo: g, at: (t: number) => path(t) };
}
/** Branch limb: tapered, 3 segments, curving up into the canopy, thicker collar where it leaves the trunk. Built along +Y. */
function limbGeo(rTop: number, rBot: number, len: number, rSeg: number) {
    const g = new THREE.CylinderGeometry(rTop, rBot, len, rSeg, 3, false); g.translate(0, len / 2, 0);   // closed ends (no hollow limb tips)
    const pa = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pa.count; i++) { const y = pa.getY(i), t = y / len, col = 1 + 0.35 * Math.max(0, 1 - t / 0.18); pa.setXYZ(i, pa.getX(i) * col + len * 0.16 * t * t, y, pa.getZ(i) * col); }
    g.computeVertexNormals();
    const c = new Float32Array(pa.count * 3).fill(1); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
}
const withColor = (g: THREE.BufferGeometry, k = 1) => { if (!g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(k), 3)); return g; };

// forest park: leafy trees. Reference study: Poly Haven CC0 scanned trees (island_tree_01 leaf atlas, jacaranda bark) - AAA-style alpha-cut leaf cards on a branching trunk; geometry here is my own, low card count for weak devices
const LEAF_BOX = [[14,18,151,526],[166,18,348,404],[708,18,838,426],[367,30,497,373],[527,48,667,374],[219,588,366,1024],[430,615,578,1024],[15,642,189,1024]];
type TreeSpec = { kind: 'broad' | 'umbrella' | 'poplar' | 'pine' | 'spruce' | 'cherry' | 'palm'; seed: number };
const PINE_BOX = [[30, 40, 230, 460]];
// broadleaf families share the scanned leaf atlas; each has its own trunk/branch structure and crown shape
function treeGeo(kind: 'broad' | 'umbrella' | 'poplar' | 'cherry', seed: number, leafN: number, scaleMul = 1) {
    let r = seed; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
    const trunkP: THREE.BufferGeometry[] = [], leafP: THREE.BufferGeometry[] = [];
    const shape = { broad: { H: 7.5, R: 4.4, sx: 1, sy: 0.85, sz: 1, nb: 6, cyk: 0.35, ls: 1 }, umbrella: { H: 5.2, R: 5.2, sx: 1.5, sy: 0.32, sz: 1.5, nb: 7, cyk: 0.2, ls: 0.62 }, poplar: { H: 5.5, R: 6.2, sx: 0.34, sy: 1, sz: 0.34, nb: 4, cyk: 0.55, ls: 0.8 }, cherry: { H: 3.9, R: 5.4, sx: 1.3, sy: 0.62, sz: 1.3, nb: 8, cyk: 0.28, ls: 0.46 } }[kind];
    const H = shape.H * (0.9 + rnd() * 0.25), R = shape.R * (0.9 + rnd() * 0.2);
    const tube = trunkTube({ H, rTop: kind === 'poplar' ? 0.22 : kind === 'broad' ? 0.42 : 0.28, rBot: kind === 'poplar' ? 0.4 : kind === 'broad' ? 0.78 : kind === 'cherry' ? 0.42 : 0.5, hSeg: 7, rSeg: 10, flare: kind === 'cherry' ? 0.45 : 0.38, lobes: 0.2, bend: kind === 'cherry' ? 0.3 : 0.2, seed }); trunkP.push(tube.geo);   // env-iter1: oak gets a thick flared trunk; env-iter3: natural tube
    const cy = H + R * shape.cyk * (kind === 'poplar' ? 0.7 : 1); const ctr: THREE.Vector3[] = [];
    for (let i = 0; i < shape.nb; i++) { const ang = rnd() * 6.28; const len = R * (0.7 + rnd() * 0.4) * (kind === 'poplar' ? 0.25 : 1); const bg = limbGeo(kind === 'broad' ? 0.08 : 0.05, kind === 'broad' ? 0.26 : 0.16, len, 5); bg.rotateZ(kind === 'umbrella' || kind === 'cherry' ? 0.95 + rnd() * 0.35 : 0.7 + rnd() * 0.5); bg.rotateY(ang); const hb = H * (0.55 + rnd() * 0.3), ba = tube.at(hb / H); bg.translate(ba.x, hb, ba.z); trunkP.push(bg); ctr.push(new THREE.Vector3(Math.cos(ang) * R * 0.55 * shape.sx, cy + (rnd() - 0.4) * R * 0.5 * shape.sy, Math.sin(ang) * R * 0.55 * shape.sz)); }
    ctr.push(new THREE.Vector3(0, cy + R * 0.3 * shape.sy, 0));
    // Shifat Oct 29 "foliage must make that trunk top not visible": two extra leaf clusters wrapped around the trunk's top and fork,
    // so the crown closes over where the trunk ends instead of floating above it.
    { const tt = tube.at(1); ctr.push(new THREE.Vector3(tt.x, H + R * 0.08, tt.z), new THREE.Vector3(tt.x, H - R * 0.12, tt.z)); }
    for (let i = 0; i < leafN; i++) {
        const c = ctr[Math.floor(rnd() * ctr.length)]; const bx = LEAF_BOX[Math.floor(rnd() * 8)];
        const u = new THREE.Vector3(rnd() - 0.5, (rnd() - 0.5) * 0.8, rnd() - 0.5).normalize().multiplyScalar(R * 0.48 * Math.cbrt(rnd())); u.x *= shape.sx; u.y *= shape.sy; u.z *= shape.sz;
        const w = (bx[2] - bx[0]) / 1024, h = (bx[3] - bx[1]) / 1024, sc = 4.0 * scaleMul * shape.ls * (0.7 + rnd() * 0.6);
        const g = new THREE.PlaneGeometry(w * sc, h * sc); g.translate(0, h * sc / 2, 0);
        const uv = g.attributes.uv; for (let k = 0; k < 4; k++) uv.setXY(k, bx[0] / 1024 + uv.getX(k) * w, 1 - bx[3] / 1024 + uv.getY(k) * h);
        const e = new THREE.Euler((rnd() - 0.5) * 2.2 + 0.5, rnd() * 6.28, (rnd() - 0.5) * 1.2);
        g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(e)); g.translate(c.x + u.x, c.y + u.y, c.z + u.z);
        const col = new Float32Array(12), shade = 0.8 + 0.3 * ((u.y / R + 0.6)); for (let k = 0; k < 4; k++) { col[k * 3] = shade; col[k * 3 + 1] = shade; col[k * 3 + 2] = shade * (0.90 + 0.08 * Math.sin(i * 1.7)); } g.setAttribute('color', new THREE.BufferAttribute(col, 3));
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
    const tube = trunkTube({ H, rTop: pine ? 0.1 : 0.08, rBot: pine ? 0.42 : 0.4, hSeg: 8, rSeg: 8, flare: 0.42, lobes: 0.18, bend: pine ? 0.22 : 0.08, seed }); trunkP.push(tube.geo);   // env-iter3: natural tube (was a straight 7-sided cylinder)
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
            if (pine) { const bg = withColor(new THREE.CylinderGeometry(0.03, 0.09, L, 4, 1, true)); bg.translate(0, L / 2, 0); _q.setFromUnitVectors(_Y, dir); bg.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(_q)); bg.translate(0, y, 0); trunkP.push(bg); }
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

// env-iter1 palm (coconut palm refs: Wikimedia Cocos nucifera photos cited in the report): curved ringed trunk from flared
// segments, a crown boot, three coconuts. env-iter3 fronds (Shifat Oct 29 "palm fronds look basic"): each frond is one arched,
// drooping strip folded into a shallow inverted V along its rib (left edge, rib, right edge x 9 segments = 36 tris), textured with
// a procedural pinnate leaflet alpha map (central rib + ~60 thin leaflet pairs) and alpha-tested, never alpha-blended. 18 living
// fronds in a golden-angle spiral (upper ones rise, lower ones droop), 4 browning hangers and 2 young spears: ~860 tris per palm
// (the old solid fronds were 720), 240 tris on the far LOD. Refs: Cocos nucifera crown photos (Wikimedia Commons) for the
// V-fold, leaflet angle and the ring of dead hanging fronds.
const PALM_TEX_W = 256, PALM_TEX_H = 512;
let _palmFrondTex: THREE.Texture | null = null, _palmTrunkTex: THREE.Texture | null = null;
function palmFrondTex() {
    if (_palmFrondTex) return _palmFrondTex;
    const W = PALM_TEX_W, H = PALM_TEX_H, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d')!; let r = 4242; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
    const Y = (v: number) => (1 - v) * H;   // v = 0 at the frond base (canvas bottom), 1 at the tip
    const N = 62;
    for (const s of [-1, 1]) for (let k = 0; k < N; k++) {
        const v0 = 0.1 + 0.87 * (k + rnd() * 0.6) / N, tip = Math.min(1, v0 + 0.06 + 0.03 * rnd());
        const reach = (0.86 + 0.13 * rnd()) * (W * 0.5 - 4);
        const x0 = W / 2 + s * 2, y0 = Y(v0), x2 = W / 2 + s * reach, y2 = Y(tip), x1 = W / 2 + s * reach * 0.45, y1 = Y(v0 + (tip - v0) * 0.85);
        const wb = 4.4 - 1.6 * v0, steps = 10, L: number[][] = [], R: number[][] = [];
        for (let i = 0; i <= steps; i++) {
            const t = i / steps, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
            const px = a * x0 + b * x1 + c * x2, py = a * y0 + b * y1 + c * y2;
            const dx = 2 * (1 - t) * (x1 - x0) + 2 * t * (x2 - x1), dy = 2 * (1 - t) * (y1 - y0) + 2 * t * (y2 - y1), dl = Math.hypot(dx, dy) || 1;
            const hw = 0.5 * wb * (1 - 0.85 * t) * (t < 0.15 ? 0.6 + t * 2.7 : 1);
            L.push([px - dy / dl * hw, py + dx / dl * hw]); R.push([px + dy / dl * hw, py - dx / dl * hw]);
        }
        const h = 80 + rnd() * 16, sat = 46 + rnd() * 14, li = 33 + rnd() * 8 + v0 * 7;
        const gr = g.createLinearGradient(x0, y0, x2, y2); gr.addColorStop(0, `hsl(${h},${sat}%,${li}%)`); gr.addColorStop(1, `hsl(${h - 14},${sat + 6}%,${li + 13}%)`);
        g.fillStyle = gr; g.beginPath(); g.moveTo(L[0][0], L[0][1]); for (const p of L) g.lineTo(p[0], p[1]); for (let i = R.length - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1]); g.closePath(); g.fill();
    }
    for (let i = 0; i < 40; i++) {   // the rib: a pale tapering midrib drawn over the leaflet roots
        const v0 = i / 40, v1 = (i + 1) / 40, w = 7 - 5.2 * v0;
        g.fillStyle = `rgb(${178 - 30 * v0},${170 - 18 * v0},${92 - 10 * v0})`; g.fillRect(W / 2 - w / 2, Y(v1), w, Y(v0) - Y(v1) + 1);
    }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = QK.anisotropy; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return (_palmFrondTex = t);
}
function palmTrunkTex() {
    if (_palmTrunkTex) return _palmTrunkTex;
    const W = 64, H = 256, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d')!;
    let r = 977; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
    g.fillStyle = 'rgb(226,216,200)'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(${90 + rnd() * 40},${80 + rnd() * 30},${64 + rnd() * 20},0.16)`; g.fillRect(rnd() * W, 0, 1 + rnd() * 2, H); }   // vertical fibre
    const n = 14;
    for (let k = 0; k < n; k++) {   // leaf-scar rings: dark groove with a lit lip above it, slightly wavy
        const y = (k + 0.5) * H / n;
        for (let x = 0; x < W; x += 2) { const w = Math.sin(x / W * 6.283 * 2 + k) * 1.4; g.fillStyle = 'rgba(120,102,84,0.55)'; g.fillRect(x, y + w, 2, 2.2); g.fillStyle = 'rgba(245,238,226,0.6)'; g.fillRect(x, y + w - 1.2, 2, 1.2); }
    }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = QK.anisotropy; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return (_palmTrunkTex = t);
}
type Frond = { ang: number; up: number; L: number; droop: number; W: number; fold: number; ph: number; c: number[] };
function palmFrondStrips(top: THREE.Vector3, fronds: Frond[], n: number) {
    const pos: number[] = [], col: number[] = [], uv: number[] = [], fr: number[] = [], idx: number[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    for (const f of fronds) {
        const dir = new THREE.Vector3(Math.cos(f.ang), 0, Math.sin(f.ang)), side = new THREE.Vector3(-dir.z, 0, dir.x);
        const rib = (t: number) => top.clone().addScaledVector(dir, 0.12 + f.L * t * Math.cos(f.up) * (1 - 0.12 * t)).addScaledVector(up, f.L * (Math.sin(f.up) * t - f.droop * t * t));
        const b = pos.length / 3;
        for (let i = 0; i <= n; i++) {
            const t = i / n, p = rib(t), w = f.W * (0.1 + 0.9 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + t * 1.0)), 0.55)) * (t < 0.1 ? t * 7 + 0.3 : 1);
            const fold = f.fold * (0.55 + 0.75 * t), cw = Math.cos(fold) * w, sw = Math.sin(fold) * w;
            const sh = 0.72 + 0.28 * t, cc = [f.c[0] * sh, f.c[1] * sh, f.c[2] * sh];
            for (const s of [-1, 0, 1]) {
                const q = p.clone().addScaledVector(side, s * cw).addScaledVector(up, -Math.abs(s) * sw);
                pos.push(q.x, q.y, q.z); col.push(...(s === 0 ? cc.map((x) => x * 1.05) : cc)); uv.push(0.5 + s * 0.5, t); fr.push(t, f.ph);
            }
            if (i < n) { const a = b + i * 3; idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); }
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('aFr', new THREE.Float32BufferAttribute(fr, 2)); geo.setIndex(idx);
    geo.computeVertexNormals();
    { const na = geo.attributes.normal as THREE.BufferAttribute; for (let i = 0; i < na.count; i++) na.setY(i, Math.abs(na.getY(i)) + 0.6); }   // fronds read lit from above on both faces
    return geo;
}
function palmGeo(seed: number) {
    let r = seed; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
    const trunkP: THREE.BufferGeometry[] = [];
    const H = 7.2 + rnd() * 1.4, lean = 0.9 + rnd() * 0.7;
    const at = (t: number) => new THREE.Vector3(lean * t * t * 1.15, H * t, 0.25 * Math.sin(t * 3.0));
    // env-iter3 trunk: one smooth curved tube (was 11 stacked flared cylinders with a sawtooth silhouette), swollen bulb at the
    // foot, gentle taper to the crown; the leaf-scar rings come from the ring texture (also its bump map).
    trunkP.push(trunkTube({ H, rTop: 0.17, rBot: 0.27, hSeg: 14, rSeg: 8, flare: 0.55, lobes: 0.1, bend: 0, seed, path: at, radius: (t) => (0.27 - 0.1 * t + 0.02 * Math.sin(t * 9.0)) * (1 - 0.35 * Math.max(0, (t - 0.8) / 0.2) ** 1.5), vScale: 2.2 }).geo);
    const top = at(1);
    const plain = (g: THREE.BufferGeometry, k: number) => { const uv = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5, 0.98); return withColor(g, k); };   // coconuts + crown boot: plain, no ring stripes
    for (let k = 0; k < 3; k++) { const c = new THREE.SphereGeometry(0.17, 6, 4); const a = k * 2.1 + 0.4; c.translate(top.x + Math.cos(a) * 0.22, top.y - 0.25, top.z + Math.sin(a) * 0.22); trunkP.push(plain(c, 0.85)); }
    { const c = new THREE.CylinderGeometry(0.0, 0.12, 1.1, 7, 3, true); c.translate(top.x + lean * 0.08, top.y + 0.5, top.z); trunkP.push(plain(c, 0.78)); }   // Shifat Oct 29: the trunk's top narrows to a pointed tip (the spear the fronds grow from), not a blunt end
    // frond layout (golden-angle spiral; seeded so hi and lo LOD share it)
    const live: Frond[] = [], dead: Frond[] = [], spear: Frond[] = [];
    for (let f = 0; f < 18; f++) {
        const tier = f / 17;   // 0 = top of the crown, 1 = lowest living frond
        live.push({ ang: f * 2.39996 + rnd() * 0.25, up: 0.95 - 1.05 * tier + (rnd() - 0.5) * 0.18, L: 3.7 + rnd() * 1.1 - 0.4 * (1 - tier), droop: 0.55 + 0.5 * tier + rnd() * 0.15, W: 0.62 + rnd() * 0.12, fold: 0.42 + rnd() * 0.18, ph: rnd(), c: [0.92 + rnd() * 0.08, 0.95 + rnd() * 0.05, 0.85] });
    }
    for (let f = 0; f < 4; f++) dead.push({ ang: f * 1.571 + 0.6 + rnd() * 0.5, up: -0.75 - rnd() * 0.3, L: 2.6 + rnd() * 0.6, droop: 0.15, W: 0.42, fold: 0.95, ph: rnd(), c: [1.05, 0.7, 0.36] });
    for (let f = 0; f < 2; f++) spear.push({ ang: f * 3.1 + rnd(), up: 1.35, L: 1.7 + rnd() * 0.4, droop: 0.1, W: 0.18, fold: 1.1, ph: rnd(), c: [0.95, 1.0, 0.72] });
    const leaves = palmFrondStrips(top, [...live, ...dead, ...spear], 9);
    const lo = palmFrondStrips(top, live.filter((_, i) => i % 3 !== 2), 5);
    const trunk = mergeGeometries(trunkP, false)!;
    return { trunk, leaves, lo };
}
// Cherry blossom recolour: same scanned leaf-card silhouettes, texel luminance remapped to a sakura pink ramp (refs: Wikimedia
// Prunus serrulata 'Kanzan' / Yoshino cherry photos cited in the report).
const cherryLeafShader = (sh: any) => {
    leafWindShader(sh);
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `vec4 sdc = texture2D(map, vMapUv); float lmc = dot(sdc.rgb, vec3(0.3, 0.59, 0.11));
    diffuseColor.rgb *= mix(vec3(0.62, 0.20, 0.33), vec3(1.0, 0.70, 0.82), smoothstep(0.02, 0.32, lmc)); diffuseColor.a *= sdc.a;`);
};
// Palm fronds: shared tree wind + a slow per-frond bob that grows toward the tip (aFr = [t along frond, frond phase]); the
// alpha boost keeps thin leaflets from dissolving in smaller mips under alphaTest (coverage-preserving trick, Ben Golus 2017).
const palmFrondShader = (sh: any) => {
    leafWindShader(sh);
    sh.vertexShader = 'attribute vec2 aFr;\n' + sh.vertexShader.replace('float flutter =', 'float flutter = 1.8 *').replace('transformed.z += windBend * 0.38;', `transformed.z += windBend * 0.38;
    float frs = sin(uTreeWindTime * 1.35 + windPhase * 2.0 + aFr.y * 6.283) * 0.6 + sin(uTreeWindTime * 2.3 + aFr.y * 17.0) * 0.25;
    transformed.y += frs * 0.16 * aFr.x * aFr.x; transformed.x += frs * 0.05 * aFr.x;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', `{ vec2 tsz = vMapUv * vec2(${PALM_TEX_W}.0, ${PALM_TEX_H}.0); vec2 ddx = dFdx(tsz), ddy = dFdy(tsz); float plod = 0.5 * log2(max(max(dot(ddx, ddx), dot(ddy, ddy)), 1e-6)); diffuseColor.a *= 1.0 + max(plod, 0.0) * 0.3; }
#include <alphatest_fragment>`);
};
// env-iter1: four species — 0 oak, 1/5 pine, 2 spruce (pine family, conical), 3 cherry blossom, 4 palm.
const TREE_TYPES: { kind: TreeSpec['kind']; seed: number }[] = [{ kind: 'broad', seed: 11 }, { kind: 'pine', seed: 31 }, { kind: 'spruce', seed: 57 }, { kind: 'cherry', seed: 77 }, { kind: 'palm', seed: 1234 }, { kind: 'pine', seed: 99 }];
const TREE_PATTERN = [0, 1, 2, 0, 5, 2, 1, 0, 2, 5, 0, 1, 2, 0, 3, 5, 1, 2, 0, 2];

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
// Shifat Oct 29 "water bubble must be randomized particle emission": round glints with a per-particle size (aSize) and rgba fade.
const bubbleMat = new THREE.PointsMaterial({color:'#dff8ff',size:0.11,sizeAttenuation:true,transparent:true,opacity:0.75,depthWrite:false,vertexColors:true});
bubbleMat.onBeforeCompile = (shader) => {
    shader.vertexShader = 'attribute float aSize;\n' + shader.vertexShader.replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nfloat br=length(gl_PointCoord-0.5);if(br>0.5)discard;').replace('#include <opaque_fragment>', 'diffuseColor.a*=(1.0-smoothstep(0.32,0.5,br))*(0.32+0.68*smoothstep(0.22,0.40,br));\n#include <opaque_fragment>');
};
bubbleMat.customProgramCacheKey = () => 'round-bubble-emitter-v3';
// Pooled randomized bubble emitter: one Points draw, fixed typed arrays, no per-frame allocation. Each particle gets a random
// size, rise speed, wobble (amplitude/frequency/phase), sideways drift and lifetime; it fades in, rises (speeding up slightly as it
// grows, like a real bubble), and pops/fades just under the real wave-displaced surface at its own x/z. Emitters: seabed vents at
// random spots around the camera, plus a stream off the hero while moving/diving (rate scales with speed).
const BUB_N = QUALITY.coarse || QUALITY.weakGpu ? 110 : 220;
function Underwater({ sim }: { sim: Sim }) {
    const kelp = useRef<THREE.InstancedMesh>(null!), bub = useRef<THREE.Points>(null!), rays = useRef<THREE.Group>(null!);
    const kGeo = useMemo(() => { const g = new THREE.PlaneGeometry(0.5, 6, 1, 6); g.translate(0, 3, 0); return g; }, []);
    const bGeo = useMemo(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BUB_N * 3).fill(-9999), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(BUB_N * 4).fill(1), 4)); g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(BUB_N).fill(1), 1)); return g; }, []);
    // particle state (pooled): base x/z, y, rise speed, age, life, wobble amp/freq/phase, drift x/z, size; alive when age < life
    const B = useMemo(() => ({ x: new Float32Array(BUB_N), y: new Float32Array(BUB_N), z: new Float32Array(BUB_N), v: new Float32Array(BUB_N), age: new Float32Array(BUB_N).fill(1), life: new Float32Array(BUB_N).fill(0), wa: new Float32Array(BUB_N), wf: new Float32Array(BUB_N), wp: new Float32Array(BUB_N), dx: new Float32Array(BUB_N), dz: new Float32Array(BUB_N), sz: new Float32Array(BUB_N), acc: 0, heroAcc: 0, next: 0, lastT: -1 }), []);
    useEffect(() => {
        let r = 3; const rn = () => (r = (r * 16807) % 2147483647) / 2147483647; const o = new THREE.Object3D();
        for (let i = 0; i < 1400; i++) { const cx = (rn() - 0.5) * 2 * (HALF - 20), cz = WATER_Z - 6 - rn() * 110, k = 0.6 + rn() * 1.1; o.position.set(cx, seabedAt(cx, cz), cz); o.rotation.set(0, rn() * 3.14, 0); o.scale.set(k * (0.5 + rn() * 0.6), 0.45 + rn() * 1.0, k); o.updateMatrix(); kelp.current.setMatrixAt(i, o.matrix); }
        kelp.current.instanceMatrix.needsUpdate = true;
    }, []);
    useFrame((st) => {
        const t = sim.t, hx = sim.pos[0], hy = sim.pos[1], hz = sim.pos[2], inBay = hz < WATER_Z + 6, inLake = isLakeWater(hx, hz), inWater = inBay || inLake, surfaceY = inLake ? waterSurfaceAt(hx, hz, t) : WATER_Y, under = inWater && st.camera.position.y < surfaceY + 1.5 && sim.mode === 'play';
        kelpMat.uniforms.uTime.value = t; rayMat.uniforms.uTime.value = t;
        kelp.current.visible = inBay; const cu = under && st.camera.position.y < surfaceY - 0.05 && st.camera.position.y < waterRenderY(st.camera.position.x, st.camera.position.z, t) - 0.05; bub.current.visible = cu; rays.current.visible = cu;   // env-iter3: also below the real (wave-displaced) sea surface, not just the flat sea level   // shafts and bubbles only once the camera is really below either water surface
        if (!inWater) return;
        if (under) {
            const pa = bub.current.geometry.attributes.position as THREE.BufferAttribute, ca = bub.current.geometry.attributes.color as THREE.BufferAttribute, za = bub.current.geometry.attributes.aSize as THREE.BufferAttribute;
            const dt = B.lastT < 0 ? 0.016 : Math.min(0.1, Math.max(0, t - B.lastT)); B.lastT = t;
            const floor = inLake ? PARK_POND_Y - 3.6 : seabedAt(st.camera.position.x, st.camera.position.z) + 0.4, cx = st.camera.position.x, cz = st.camera.position.z, cur = Math.sin(t * 0.3) * 0.25;
            const spawn = (x: number, y: number, z: number, small: boolean) => {
                if (inLake && !isLakeWater(x, z)) return;
                let k = -1; for (let j = 0; j < BUB_N; j++) { const q = (B.next + j) % BUB_N; if (B.age[q] >= B.life[q]) { k = q; break; } }
                if (k < 0) return; B.next = (k + 1) % BUB_N;
                const r = Math.random();
                B.x[k] = x; B.y[k] = y; B.z[k] = z; B.age[k] = 0; B.life[k] = 2.5 + Math.random() * 5.5;
                B.sz[k] = small ? 0.35 + r * 0.6 : 0.45 + r * r * 1.6; B.v[k] = 0.35 + B.sz[k] * 0.45 + Math.random() * 0.35;
                B.wa[k] = 0.03 + Math.random() * 0.12; B.wf[k] = 2 + Math.random() * 5; B.wp[k] = Math.random() * 6.283;
                B.dx[k] = (Math.random() - 0.5) * 0.25; B.dz[k] = (Math.random() - 0.5) * 0.25;
            };
            // seabed vents: Poisson-ish random emission in a 13 m disc around the camera, sometimes in little bursts
            B.acc += dt * (BUB_N * 0.11);
            while (B.acc >= 1) { B.acc -= 1; const a = Math.random() * 6.283, rr = 1.5 + Math.sqrt(Math.random()) * 11.5, x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr, burst = Math.random() < 0.18 ? 2 + Math.floor(Math.random() * 4) : 1; for (let q = 0; q < burst; q++) spawn(x + (Math.random() - 0.5) * 0.3, floor + Math.random() * 0.4, z + (Math.random() - 0.5) * 0.3, burst > 1); }
            // hero stream: more bubbles the faster you swim, extra on a dive
            const hv = Math.hypot(sim.vel[0], sim.vel[1], sim.vel[2]);
            if (hy < surfaceY - 0.3) { B.heroAcc += dt * (hv * 2.2 + (sim.dive ? 10 : 0) + 0.6); while (B.heroAcc >= 1) { B.heroAcc -= 1; spawn(hx + (Math.random() - 0.5) * 0.6, hy + 0.6 + Math.random() * 0.8, hz + (Math.random() - 0.5) * 0.6, true); } }
            for (let i = 0; i < BUB_N; i++) {
                if (B.age[i] >= B.life[i]) { pa.setXYZ(i, 0, -9999, 0); ca.setW(i, 0); continue; }
                B.age[i] += dt; B.v[i] = Math.min(B.v[i] + dt * 0.08, 1.6); B.y[i] += B.v[i] * dt; B.x[i] += (B.dx[i] + cur) * dt; B.z[i] += B.dz[i] * dt;
                const w = Math.sin(B.age[i] * B.wf[i] + B.wp[i]) * B.wa[i], bx = B.x[i] + w, bz = B.z[i] + Math.cos(B.age[i] * B.wf[i] * 0.8 + B.wp[i]) * B.wa[i] * 0.7;
                const top = waterRenderY(bx, bz, t) - 0.1;
                if (B.y[i] >= top) { B.age[i] = B.life[i]; pa.setXYZ(i, 0, -9999, 0); ca.setW(i, 0); continue; }   // pop just under the real swell
                const fin = Math.min(1, B.age[i] / 0.35), fout = Math.min(1, (B.life[i] - B.age[i]) / 0.6, (top - B.y[i]) / 0.35);
                pa.setXYZ(i, bx, B.y[i], bz); ca.setW(i, fin * Math.max(0, fout)); za.setX(i, B.sz[i] * (1 + 0.15 * Math.min(1, B.age[i] / 3)));
            }
            za.needsUpdate = true;
            pa.needsUpdate = true; ca.needsUpdate = true; bub.current.geometry.computeBoundingSphere();
            rays.current.position.set(hx, surfaceY + 0.1, hz); rays.current.rotation.y = 0;
        }
    });
    return <group>
        <instancedMesh ref={kelp} args={[kGeo, kelpMat, 1400]} frustumCulled={false} />
        <points ref={bub} geometry={bGeo} frustumCulled={false}><primitive object={bubbleMat} attach="material" /></points>
        <group ref={rays}>{Array.from({ length: 8 }, (_, i) => <mesh key={i} position={[(i - 3.5) * 3.2, -6, ((i * 7) % 5) * 2 - 4]} rotation={[0, i * 0.4, 0.22]} material={rayMat}><planeGeometry args={[2.4 + (i % 3), 12]} /></mesh>)}</group>
    </group>;
}

// Wind reference: GPU Gems3 ch6, shared low-frequency bend plus smaller leaf motion.
// Root stays fixed; world-position phase spreads gusts without CPU instance updates.
const treeWindTime = { value: 0 };
const treeWind = (leaf: boolean) => (sh: any) => {
    sh.uniforms.uTreeWindTime = treeWindTime;
    sh.vertexShader = 'uniform float uTreeWindTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    vec2 windRoot = instanceMatrix[3].xz;
    float windPhase = windRoot.x * 0.035 + windRoot.y * 0.027;
    float windHeight = max(position.y, 0.0);
    float windBend = windHeight * windHeight * (sin(uTreeWindTime * 0.75 + windPhase) * 0.0024 + sin(uTreeWindTime * 1.17 + windPhase * 1.7) * 0.0009);
    transformed.x += windBend;
    transformed.z += windBend * 0.38;
    ${leaf ? 'float flutter = sin(uTreeWindTime * 3.2 + dot(position, vec3(1.9,2.3,1.4)) + windPhase) * min(windHeight, 1.0) * 0.024; transformed.x += flutter; transformed.z += flutter * 0.55;' : ''}
    `);
};
const trunkWindShader = treeWind(false), leafWindShader = treeWind(true);
function Forest({ sim, renderGround = true }: { sim: Sim; renderGround?: boolean }) {
    const lo = useRef<THREE.InstancedMesh[]>([]), last = useRef([1e9, 1e9]);
    const grass = useRef<THREE.Mesh>(null!), tr = useRef<THREE.InstancedMesh[]>([]), lf = useRef<THREE.InstancedMesh[]>([]), bush = useRef<THREE.InstancedMesh>(null!);
    const [leafTex, barkTex, pineTex, pbarkTex] = useMemo(() => { const l = new THREE.TextureLoader(); const mk = (u: string, rep = false) => { const t = l.load(u); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = QK.anisotropy; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 3); } return t; };
        return [mk('/spray145.png'), mk('/bark.jpg', true), mk(PINE_URL), mk('/pinebark.jpg', true)]; }, []);
    const geos = useMemo(() => TREE_TYPES.map(({ kind, seed }) => {
        const con = kind === 'pine' || kind === 'spruce';
        if (kind === 'palm') { const p = palmGeo(seed); return { trunk: p.trunk, leaves: p.leaves, lo: p.lo, con, kind }; }
        const hi = con ? coniferGeo(kind, seed, kind === 'pine' ? 5 : 6, 3, 1.12) : treeGeo(kind as any, seed, Math.round((kind === 'broad' ? 460 : kind === 'cherry' ? 560 : 340) * QK.foliage), 1.45);
        const lw = con ? coniferGeo(kind, seed, 3, 2, 1.6).leaves : treeGeo(kind as any, seed, Math.round((kind === 'cherry' ? 140 : 110) * (0.5 + 0.5 * QK.foliage)), 2.2).leaves;
        return { trunk: hi.trunk, leaves: hi.leaves, lo: lw, con, kind };
    }), []);
    const pts = useMemo(() => { let r = 7; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647; const a: { x: number; z: number; s: number; c: number; v: number }[] = []; for (let i = 0; i < 600 && a.length < 130; i++) { const px = PARK.x0 + 6 + rnd() * (PARK.x1 - PARK.x0 - 12), pz = PARK.z0 + 6 + rnd() * (PARK.z1 - PARK.z0 - 12), cxm = (PARK.x0 + PARK.x1) / 2, czm = (PARK.z0 + PARK.z1) / 2; if (Math.hypot(px - cxm, pz - czm) < 54 || Math.abs((px - cxm) - (pz - czm) * 0.6) < 6) continue; if (rnd() < 0.2) continue; a.push({ x: px, z: pz, s: 0.8 + rnd() * 0.5, c: rnd(), v: TREE_PATTERN[a.length % TREE_PATTERN.length] }); }
        // Small street-side clusters use the same families and LOD, clear of buildings and intersections.
        const street = world.streetBlds.map((b,i)=>({b,i,k:Math.sin((b.x0*13.37+b.z0*7.17))*43758.5453%1})).sort((a,b)=>a.k-b.k);
        for (let i = 0; i < street.length && a.length < 190; i++) {
            const b = street[i].b;
            const x = b.x1 + 2.5, z = (b.z0 + b.z1) / 2 + (Math.floor(i / 3) % 2 ? 4 : -4);
            if (z < WATER_Z + 8 || x > HALF - 4 || buildings.some(q => x > q.x0 - 1.3 && x < q.x1 + 1.3 && z > q.z0 - 1.3 && z < q.z1 + 1.3)) continue;
            a.push({ x, z, s: 0.62 + rnd() * 0.14, c: rnd(), v: [0, 3, 5][Math.floor(i / 3) % 3] });
        }
        // env-iter1 lakeside: cherry blossoms ring the lake on the trail-facing banks, palms stand on the beach sand.
        const nearTrail = (x: number, z: number, m: number) => Math.abs((x - PARK_POND.cx) - (z - PARK_POND.cz) * 0.6) < m || bridgeSurfaceAt(x, z) !== null;
        let nCh = 0, nPalm = 0;
        for (let i = 0; i < 500 && nCh < 18; i++) {
            const ang = rnd() * 6.283, rad = PARK_POND.rx + 4.5 + rnd() * 10, x = PARK_POND.cx + Math.cos(ang) * rad, z = PARK_POND.cz + Math.sin(ang) * rad;
            if (sandWeight(x, z) > 0.05 || nearTrail(x, z, 6.5) || a.some((p) => Math.hypot(p.x - x, p.z - z) < 5.2)) continue;
            a.push({ x, z, s: 0.82 + rnd() * 0.3, c: rnd(), v: 3 }); nCh++;
        }
        for (let i = 0; i < 500 && nPalm < 9; i++) {
            const ang = BEACH_DIR + (rnd() - 0.5) * 2.0, rad = PARK_POND.rx * LAKE_SHORE + 3 + rnd() * 11, x = PARK_POND.cx + Math.cos(ang) * rad, z = PARK_POND.cz + Math.sin(ang) * rad;
            if (sandWeight(x, z) < 0.9 || nearTrail(x, z, 5) || a.some((p) => Math.hypot(p.x - x, p.z - z) < 5.5)) continue;
            a.push({ x, z, s: 0.85 + rnd() * 0.3, c: rnd(), v: 4 }); nPalm++;
        }
        if (DBG) (window as any).__trees = a.map((p) => [p.x, parkH(p.x, p.z), p.z, p.v, p.s]);
        return a; }, []);
    const bushTex = useMemo(()=>{const t=new THREE.TextureLoader().load('/shrub134.png');t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=QK.anisotropy;return t;},[]);
    const bushGeo = useMemo(()=>{
        const gs:THREE.BufferGeometry[]=[];let r=73;const rnd=()=>(r=r*16807%2147483647)/2147483647;
        // Isolate scanned leaf silhouettes, excluding packed stem/bark atlas triangles.
        const boxes=[[224,0,357,184],[102,205,248,396],[360,195,482,372],[371,59,459,181]];
        for(let i=0;i<48;i++) {const bx=boxes[i%boxes.length],w=(bx[2]-bx[0])/512,h=(bx[3]-bx[1])/512;const len=0.5+rnd()*0.5;
            const g=new THREE.PlaneGeometry(len*w/h,len);g.translate(0,len/2,0);const uv=g.attributes.uv;for(let k=0;k<4;k++)uv.setXY(k,bx[0]/512+uv.getX(k)*w,1-bx[3]/512+uv.getY(k)*h);
            const a=i*2.39996,rad=0.1+0.6*Math.sqrt(rnd());g.rotateZ((rnd()-0.5)*1.3);g.rotateY(a);g.translate(Math.cos(a)*rad,0.02+rnd()*0.65,Math.sin(a)*rad);gs.push(g);
        }return mergeGeometries(gs,false)!;
    },[]);
    // falling cherry petals: one Points draw, positions looped in the vertex shader around the lakeside cherries.
    const petalU = useMemo(() => ({ uTime: { value: 0 }, uDayP: TOD.day }), []);
    const petalGeo = useMemo(() => {
        const ch = pts.filter((p) => p.v === 3 && Math.hypot(p.x - PARK_POND.cx, p.z - PARK_POND.cz) < 40), n = Math.min(26, ch.length) * 9;
        const P = new Float32Array(n * 3), ph = new Float32Array(n); let r = 31; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
        for (let i = 0; i < n; i++) { const t = ch[i % ch.length], a = rnd() * 6.28, d = rnd() * 4.5 * t.s; P[i * 3] = t.x + Math.cos(a) * d; P[i * 3 + 2] = t.z + Math.sin(a) * d; P[i * 3 + 1] = parkH(t.x, t.z) + 0.05; ph[i] = rnd(); }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('ph', new THREE.BufferAttribute(ph, 1)); return g;
    }, [pts]);
    if (DBG) (window as any).__treePts = pts;
    const NT = TREE_TYPES.length;
    const place = (hx: number, hz: number) => {
        const o = new THREE.Object3D(), col = new THREE.Color(); const ct = Array(NT).fill(0), ch = Array(NT).fill(0), cl = Array(NT).fill(0);
        pts.forEach((p) => { const d = Math.hypot(p.x - hx, p.z - hz); if (d > (p.x > PARK.x0 && p.x < PARK.x1 && p.z > PARK.z0 && p.z < PARK.z1 ? 230 : 140) || ct[p.v] >= 70) return; o.rotation.set(0, p.c * 6.28, 0); o.position.set(p.x, 0.05 + parkH(p.x, p.z), p.z); o.scale.set(p.s, p.s * (0.9 + p.c * 0.25), p.s); o.updateMatrix(); const v = p.v; { const q = (Math.sin(p.x * 0.37 + p.z * 0.21) + 1) * 0.5, w = (p.c * 7.3) % 1; if (geos[v].kind === 'cherry' || geos[v].kind === 'palm') col.setRGB(1, 1, 1).multiplyScalar(0.86 + w * 0.22); else col.setHSL(geos[v].con ? 0.31 + (w - 0.5) * 0.06 : 0.20 + q * 0.10 + w * 0.035, geos[v].con ? 0.28 : 0.45 + w * 0.2, 0.66 + ((p.c * 3.1) % 1) * 0.30); } tr.current[v].setMatrixAt(ct[v]++, o.matrix); const M = d < QK.leafLodDist ? lf.current[v] : lo.current[v], k = d < QK.leafLodDist ? ch : cl; M.setMatrixAt(k[v], o.matrix); M.setColorAt(k[v]++, col); });
        for (let v = 0; v < NT; v++) { tr.current[v].count = ct[v]; lf.current[v].count = ch[v]; lo.current[v].count = cl[v]; [tr.current[v], lf.current[v], lo.current[v]].forEach((m) => { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); if(m.boundingSphere) m.boundingSphere.radius += 0.7; }); }
    };
    useFrame((st) => { treeWindTime.value = DBG && (window as any).__windT !== undefined ? (window as any).__windT : st.clock.elapsedTime; if(bush.current) (bush.current.material as THREE.MeshLambertMaterial).emissive.set('#263c1c').multiplyScalar(0.12+0.88*TOD.day.value); for (let v = 0; v < NT; v++) { const a = lf.current[v], b = lo.current[v]; const em = geos[v].kind === 'cherry' ? '#6e3f50' : geos[v].kind === 'palm' ? '#2a3a14' : '#426439'; if(a) (a.material as THREE.MeshLambertMaterial).emissive.set(em).multiplyScalar(0.12 + 0.88 * TOD.day.value); if(b) (b.material as THREE.MeshLambertMaterial).emissive.set(em).multiplyScalar(0.12 + 0.88 * TOD.day.value); } petalU.uTime.value = st.clock.elapsedTime; const hx = sim.pos[0], hz = sim.pos[2]; if (Math.hypot(hx - last.current[0], hz - last.current[1]) > 6) { last.current = [hx, hz]; place(hx, hz); } });
    useEffect(() => {
        const o = new THREE.Object3D(), col = new THREE.Color(); place(1e5, 1e5); last.current = [1e9, 1e9];
        for (let i = 0; i < 70; i++) { const p = pts[i < 45 ? i % pts.length : Math.min(pts.length - 1, 130 + i - 45)], k = 0.8 + p.c; o.rotation.set(0, p.c * 9, 0); o.position.set(p.x + (i < 45 ? 3 + (i % 5) : 0), 0.02 + parkH(p.x + (i < 45 ? 3 + (i % 5) : 0), p.z + (i < 45 ? 2 : 0)), p.z + (i < 45 ? 2 : 0)); o.scale.set(k * (0.8 + (i % 3) * 0.25), k * (0.55 + (i % 4) * 0.12), k * (0.8 + ((i + 1) % 3) * 0.25)); o.updateMatrix(); bush.current.setMatrixAt(i, o.matrix); bush.current.setColorAt(i, col.setHSL(0.22 + ((p.c * 5.7) % 1) * 0.08, 0.18 + ((p.c * 2.3) % 1) * 0.12, 0.55 + ((p.c * 9.1) % 1) * 0.20)); }
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
        {renderGround && <mesh ref={grass} position={[cx, 0.05, cz]} geometry={terrain.floor}><meshLambertMaterial color="#ffffff" vertexColors /></mesh>}
        {renderGround && <mesh position={[cx, 0.09, cz]} geometry={terrain.path}><meshLambertMaterial color="#b89865" /></mesh>}
        {geos.map((g, v) => <group key={v}>
            <instancedMesh ref={(m) => { if (m) tr.current[v] = m; }} args={[g.trunk, undefined, 70]} frustumCulled={false}><meshLambertMaterial map={g.kind === 'palm' ? palmTrunkTex() : g.con ? pbarkTex : barkTex} bumpMap={g.kind === 'palm' ? palmTrunkTex() : g.con ? pbarkTex : barkTex} bumpScale={g.kind === 'palm' ? 1.6 : 2.2} vertexColors color={g.kind === 'palm' ? '#a89274' : g.kind === 'cherry' ? '#a5949a' : '#ffffff'} emissive={g.kind === 'palm' ? '#3a3024' : '#4a3a2c'} side={THREE.DoubleSide} onBeforeCompile={trunkWindShader} /></instancedMesh>
            {g.kind === 'palm' ? <>
                <instancedMesh ref={(m) => { if (m) lo.current[v] = m; }} args={[g.lo, undefined, 70]}><meshLambertMaterial map={palmFrondTex()} vertexColors emissive="#2a3a14" alphaTest={0.5} side={THREE.DoubleSide} onBeforeCompile={palmFrondShader} /></instancedMesh>
                <instancedMesh ref={(m) => { if (m) lf.current[v] = m; }} args={[g.leaves, undefined, 70]}><meshLambertMaterial map={palmFrondTex()} vertexColors emissive="#2a3a14" alphaTest={0.5} side={THREE.DoubleSide} onBeforeCompile={palmFrondShader} /></instancedMesh>
            </> : <>
                <instancedMesh ref={(m) => { if (m) lo.current[v] = m; }} args={[g.lo, undefined, 70]}><meshLambertMaterial map={g.con ? pineTex : leafTex} vertexColors emissive="#426439" alphaTest={0.5} side={THREE.DoubleSide} onBeforeCompile={g.kind === 'cherry' ? cherryLeafShader : leafWindShader} /></instancedMesh>
                <instancedMesh ref={(m) => { if (m) lf.current[v] = m; }} args={[g.leaves, undefined, 70]}><meshLambertMaterial map={g.con ? pineTex : leafTex} vertexColors emissive="#426439" alphaTest={0.5} side={THREE.DoubleSide} onBeforeCompile={g.kind === 'cherry' ? cherryLeafShader : leafWindShader} /></instancedMesh>
            </>}
        </group>)}
        <points geometry={petalGeo} frustumCulled={false}><shaderMaterial transparent depthWrite={false} uniforms={petalU} vertexShader={`uniform float uTime; attribute float ph; varying float vA; varying float vR; void main(){ float life = fract(uTime * 0.055 + ph); vec3 p = position; p.y += 4.6 * (1.0 - life); p.x += sin(uTime * 0.9 + ph * 40.0) * 0.6 + life * 2.2; p.z += cos(uTime * 0.7 + ph * 23.0) * 0.5; vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; vA = smoothstep(0.0, 0.08, life) * (1.0 - smoothstep(0.85, 1.0, life)); vR = uTime * 2.0 + ph * 30.0; gl_PointSize = clamp(55.0 / -mv.z, 1.5, 7.0); }`} fragmentShader={`uniform float uDayP; varying float vA; varying float vR; void main(){ vec2 q = gl_PointCoord - 0.5; float c = cos(vR), s = sin(vR); q = mat2(c, -s, s, c) * q; float e = length(q * vec2(1.0, 1.9)); if (e > 0.48) discard; gl_FragColor = vec4(mix(vec3(0.5, 0.33, 0.42), vec3(1.0, 0.78, 0.86), uDayP), vA * 0.95); }`} /></points>
        <instancedMesh ref={bush} args={[undefined, undefined, 70]} frustumCulled={false}><primitive object={bushGeo} attach="geometry" /><meshLambertMaterial map={bushTex} color="#dce1cd" emissive="#182510" alphaTest={0.5} side={THREE.DoubleSide} onBeforeCompile={leafWindShader} /></instancedMesh>
    </group>;
}

// park floor: no flat green between tufts - value noise plus fine blade streaks in world space, so the gaps read as grass undergrowth (ref: BotW grassland ground mottling)
const floorGrass = (sh: any) => {
    sh.vertexShader = 'varying vec2 vFx;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vFx = (modelMatrix * vec4(position, 1.0)).xz;');
    sh.uniforms.uDayG = TOD.day; sh.fragmentShader = 'varying vec2 vFx; uniform float uDayG;\nfloat fh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\nfloat fn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(fh(i), fh(i + vec2(1.0, 0.0)), f.x), mix(fh(i + vec2(0.0, 1.0)), fh(i + vec2(1.0, 1.0)), f.x), f.y); }\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n float m1 = sin(vFx.x * 0.21) * sin(vFx.y * 0.17), m2 = sin(vFx.x * 1.1 + vFx.y * 0.8) * sin(vFx.y * 1.3 - vFx.x * 0.4); diffuseColor.rgb *= 0.88 + 0.07 * m1 + 0.04 * m2; diffuseColor.rgb *= mix(vec3(0.66, 0.9, 1.1), vec3(1.0), uDayG); ');
};
// meadow: long grass tufts + subtle flowers + fireflies. Reference study: instanced blade-cluster grass with wind sway in the vertex shader (common real-time approach, e.g. GDC "Ghost of Tsushima" grass talk, three.js instanced grass guides); blade shapes, colours and placement are mine
const INK_R = 2;
const GR_POOL = (() => { let r = 4242; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647; const cx = (PARK.x0 + PARK.x1) / 2, cz = (PARK.z0 + PARK.z1) / 2; const a: number[] = []; for (let i = 0; i < 39000; i++) { const x = PARK.x0 + 3 + rnd() * (PARK.x1 - PARK.x0 - 6), z = PARK.z0 + 3 + rnd() * (PARK.z1 - PARK.z0 - 6); const pond = ((x - PARK_POND.cx) / (PARK_POND.rx + 1.5)) ** 2 + ((z - PARK_POND.cz) / (PARK_POND.rz + 1.5)) ** 2; if (Math.abs((x - cx) - (z - cz) * 0.6) < 6.5 || Math.hypot(x - cx, z - cz) < 4 || pond < 1.0 || bridgeSurfaceAt(x, z) !== null || sandWeight(x, z) > 0.35) continue; a.push(x, z, rnd(), rnd()); } return a; })();
function tuftGeo() {
    const pos: number[] = [], col: number[] = []; let r = 5; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
    for (let b = 0; b < 7; b++) {
        const a = rnd() * 6.28, ox = (rnd() - 0.5) * 0.35, oz = (rnd() - 0.5) * 0.35, h = 0.8 + rnd() * 0.7, w = 0.035 + rnd() * 0.025, lean = (0.3 + rnd() * 0.45) * h;
        const dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx;
        // Eight curved segments provide a smooth blade arc before the vertex shader adds the wind bend.
        const segments = 8;
        const point = (t: number, side: number) => {
            const curve = 0.14 * Math.sin(t * Math.PI) + 0.86 * t * t;
            const width = w * (1 - 0.9 * t) * side;
            return [ox + dx * lean * curve + px * width, h * t, oz + dz * lean * curve + pz * width];
        };
        const vertex = (v: number[]) => {
            pos.push(v[0], v[1], v[2]);
            const k = v[1] / h;
            col.push(0.34 + 0.36 * k, 0.47 + 0.31 * k, 0.29 + 0.19 * k);
        };
        for (let j = 0; j < segments; j++) {
            const t0 = j / segments, t1 = (j + 1) / segments;
            const left0 = point(t0, -1), right0 = point(t0, 1), left1 = point(t1, -1), right1 = point(t1, 1);
            [left0, right0, left1, right0, right1, left1].forEach(vertex);
        }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
}
// env-iter3: meadow flowers share the grass outline class (alpha 0.25), so they are part of the one meadow silhouette
const grassTag = (sh: any) => { sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.a = 0.25;'); };
const FL_COL = ['#8a5cf0', '#4f7cff', '#e03a4a', '#ff7fb8'];
function Meadow({ sim }: { sim: Sim }) {
    const gr = useRef<THREE.InstancedMesh>(null!), fl = useRef<THREE.InstancedMesh>(null!), ff = useRef<THREE.Points>(null!), last = useRef([1e9, 1e9]), uni = useRef({ uTime: { value: 0 }, uHero: { value: new THREE.Vector3() }, uCam: { value: new THREE.Vector3() } }), fu = useRef({ uTime: { value: 0 } });
    useFrame((st) => { if (ff.current && ff.current.layers.mask !== 3) ff.current.layers.enable(SELECTIVE_BLOOM_LAYER); uni.current.uHero.value.set(sim.pos[0], sim.pos[1], sim.pos[2]); uni.current.uCam.value.copy(st.camera.position); if (DBG && gr.current) (window as any).__polyforkGrass = { outlineMaskAlpha: gr.current.userData.outlineMaskAlpha, outlineMaskThreshold: gr.current.userData.outlineMaskThreshold, bladeSegments: 8 }; const m = gr.current && (gr.current.material as THREE.MeshLambertMaterial); if (m) m.emissive.set('#1c3410').multiplyScalar(0.12 + 0.88 * TOD.day.value); });   // tuft self-light follows the day level so grass does not glow at night
    const geo = useMemo(tuftGeo, []);
    const flGeo = useMemo(() => { const g = new THREE.CircleGeometry(0.17, 7); g.rotateX(-Math.PI / 2.4); g.translate(0, 0.62, 0); const st = new THREE.PlaneGeometry(0.02, 0.62); st.translate(0, 0.31, 0); return mergeGeometries([g, st], false)!; }, []);
    const ffGeo = useMemo(() => { const n = 90, p = new Float32Array(n * 3), ph = new Float32Array(n); let r = 99; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647; for (let i = 0; i < n; i++) { p[i * 3] = PARK.x0 + 10 + rnd() * (PARK.x1 - PARK.x0 - 20); p[i * 3 + 2] = PARK.z0 + 10 + rnd() * (PARK.z1 - PARK.z0 - 20); p[i * 3 + 1] = 0.8 + rnd() * 5 + parkH(p[i * 3], p[i * 3 + 2]); ph[i] = rnd() * 6.28; } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('ph', new THREE.BufferAttribute(ph, 1)); return g; }, []);
    const place = (hx: number, hz: number) => {
        const o = new THREE.Object3D(), col = new THREE.Color(); let gi = 0, fi = 0;
        for (let i = 0; i < GR_POOL.length && gi < QK.grass; i += 4) {
            const x = GR_POOL[i], z = GR_POOL[i + 1]; if (Math.hypot(x - hx, z - hz) > QK.grassRadius || bridgeSurfaceAt(x, z) !== null) continue;
            o.position.set(x, 0.05 + parkH(x, z), z); o.rotation.set(0, GR_POOL[i + 2] * 6.28, 0); const cl = Math.sin(x * 0.11 + 1.3) * Math.cos(z * 0.09), sc = (1.0 + GR_POOL[i + 3] * 0.7) * (1 + 0.4 * cl) * (1 + 0.04 * Math.max(0, -parkH(x, z)));   o.scale.set(sc, sc, sc); o.updateMatrix(); gr.current.setMatrixAt(gi, o.matrix); gr.current.setColorAt(gi++, col.setHSL(0.22 + GR_POOL[i + 3] * 0.1 - 0.045 * cl + 0.03 * Math.sin(x * 0.045 + z * 0.06), 0.30 + 0.06 * cl, 0.34 + GR_POOL[i + 2] * 0.10 + 0.065 * cl));
            if (GR_POOL[i + 2] < 0.12 && fi < 420) { o.position.set(x + 0.2, 0.05 + parkH(x + 0.2, z), z); o.scale.setScalar(0.8 + GR_POOL[i + 3] * 0.6); o.updateMatrix(); fl.current.setMatrixAt(fi, o.matrix); fl.current.setColorAt(fi++, col.set(FL_COL[Math.floor(GR_POOL[i + 3] * 4) % 4])); }
        }
        gr.current.count = gi; fl.current.count = fi; [gr.current, fl.current].forEach((m) => { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); if(m.boundingSphere) m.boundingSphere.radius += 0.7; });
    };
    useFrame((st) => { uni.current.uTime.value = fu.current.uTime.value = st.clock.elapsedTime; const hx = sim.pos[0], hz = sim.pos[2]; if (Math.hypot(hx - last.current[0], hz - last.current[1]) > 8) { last.current = [hx, hz]; place(hx, hz); } });
    const onGrass = (sh: any) => { sh.uniforms.uTime = uni.current.uTime; sh.uniforms.uHero = uni.current.uHero; sh.uniforms.uCam = uni.current.uCam; sh.vertexShader = 'uniform float uTime; uniform vec3 uHero; uniform vec3 uCam;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n float hh = position.y; transformed.y *= mix(0.4, 1.0, smoothstep(0.9, 3.8, length(instanceMatrix[3].xz - uHero.xz))) * mix(0.3, 1.0, smoothstep(1.5, 5.5, length(instanceMatrix[3].xz - uCam.xz))); float wv = sin(uTime * 0.9 + instanceMatrix[3].x * 0.07 + instanceMatrix[3].z * 0.045) * 0.5 + 0.5; transformed.x += (sin(uTime * 1.5 + instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.22) * 0.1 + wv * 0.38) * hh * hh; transformed.y -= wv * 0.12 * hh * hh; transformed.z += cos(uTime * 1.2 + instanceMatrix[3].z * 0.3) * 0.1 * hh * hh; vHt = clamp(position.y / 0.9, 0.0, 1.0);').replace('void main() {', 'varying float vHt;\nvoid main() {');
        // grass optics (ref: BotW grassland, blades dark at the root and sun-lit translucent yellow-green at the tips): base occlusion, bright backlit tips, soft sheen
        sh.uniforms.uDayG = TOD.day; sh.fragmentShader = 'varying float vHt; uniform float uDayG;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight *= mix(0.8, 1.15, vHt); outgoingLight *= mix(vec3(0.62, 0.86, 1.12), vec3(1.0), uDayG); outgoingLight += mix(vec3(0.05, 0.11, 0.2), vec3(0.25, 0.32, 0.17), uDayG) * vHt * vHt * 0.32; diffuseColor.a = 0.5;\n#include <opaque_fragment>\ngl_FragColor.a = 0.25;'); };   // env-iter3: OPAQUE forced alpha back to 1.0 after the old 0.5, so blades were inked one by one; 0.25 = grass class for the outline pass
    return <group>
        <instancedMesh ref={gr} name="polyfork-curved-grass-blades" userData={{ outlineMaskAlpha: 0.5, outlineMaskThreshold: 0.75 }} args={[geo, undefined, QK.grass]} frustumCulled={true}><meshLambertMaterial vertexColors emissive="#1c3410" side={THREE.DoubleSide} onBeforeCompile={onGrass} /></instancedMesh>
        <instancedMesh ref={fl} args={[flGeo, undefined, 420]}><meshLambertMaterial emissive="#555555" side={THREE.DoubleSide} onBeforeCompile={grassTag} /></instancedMesh>
        <points ref={ff} geometry={ffGeo} frustumCulled={false}><shaderMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending} uniforms={fu.current} vertexShader={`uniform float uTime; attribute float ph; varying float vA; varying vec3 vOrbCol; void main(){ vOrbCol=0.58+0.42*cos(ph+vec3(0.0,2.1,4.2)); vec3 p = position; p.x += sin(uTime*0.4+ph*3.0)*2.5; p.z += cos(uTime*0.35+ph*2.0)*2.5; p.y += sin(uTime*0.7+ph)*0.8; vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv; vA = 0.35+0.65*pow(0.5+0.5*sin(uTime*1.6+ph*5.0),2.0); gl_PointSize = clamp(38.0/(-mv.z), 2.0, 9.0); }`} fragmentShader={`varying float vA;varying vec3 vOrbCol;void main(){float d=length(gl_PointCoord-0.5);float a=smoothstep(0.5,0.0,d);gl_FragColor=vec4(vOrbCol*(0.7+0.3*a),a*a*vA);}`} /></points>
    </group>;
}

// Original tapered gust ribbons, reference: Ashar's wind-particle loop/swirl tutorial.
function WindLines({ sim }: { sim: Sim }) {
    const ref = useRef<THREE.Mesh>(null!);
    const geo = useMemo(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8*20*6*3),3)); g.setAttribute('aFade',new THREE.BufferAttribute(new Float32Array(8*20*6),1));return g; },[]);
    const un = useMemo(()=>({uDay:TOD.day}),[]);
    useFrame((st)=>{ref.current.visible=!sim.swim && sim.mode==='play';if(!ref.current.visible)return;
        const t=DBG && (window as any).__windT!==undefined?(window as any).__windT:st.clock.elapsedTime;
        const p=geo.attributes.position as THREE.BufferAttribute,a=geo.attributes.aFade as THREE.BufferAttribute;let n=0;
        for(let i=0;i<8;i++){const life=(t*.14+i*.173)%1,fade=Math.sin(life*Math.PI)*.3;
            const cx=sim.pos[0]+((i%4)-1.5)*11+(life-.5)*22,cy=sim.pos[1]+2+(i%3)*3.8,cz=sim.pos[2]+(Math.floor(i/4)-.5)*26;
            const point=(u:number,side:number)=>{const curve=Math.sin(u*4.2+i)*.65,ww=Math.sin(u*Math.PI)*.036;return [cx+(u-.5)*7,cy+curve+side*ww,cz+Math.sin(u*2.8+i)*1.5];};
            for(let j=0;j<20;j++){const u=j/20,v=(j+1)/20;for(const [q,sd] of [[u,-1],[u,1],[v,-1],[u,1],[v,1],[v,-1]]){const w=point(q,sd);p.setXYZ(n,w[0],w[1],w[2]);a.setX(n++,fade*Math.sin(q*Math.PI));}}
        }p.needsUpdate=true;a.needsUpdate=true;
    });
    return <mesh ref={ref} geometry={geo} frustumCulled={false}><shaderMaterial transparent depthWrite={false} side={THREE.DoubleSide} uniforms={un} vertexShader={`attribute float aFade;varying float vFade;void main(){vFade=aFade;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`} fragmentShader={`varying float vFade;uniform float uDay;void main(){gl_FragColor=vec4(mix(vec3(.42,.57,.73),vec3(.86,.93,.96),uDay),vFade);}`} /></mesh>;
}
// Robot pedestrians: Polyfork free robot models (non-human, non-animal, fully plated/covered, blue sensor visor, no mouth or nose). Instanced, per-type, GPU-animated.
const PED_TYPES = [   // 0-4 street peds: Shadow-body robots in five shell/accent palettes (blue eyes); 5 = quad drone, the only ped type that flies
    { model: 'shadow', shell: [0.62, 0.70, 0.74], coat: [0.10, 0.28, 0.38] }, { model: 'shadow', shell: [0.78, 0.72, 0.60], coat: [0.50, 0.30, 0.18] },
    { model: 'shadow', shell: [0.55, 0.62, 0.58], coat: [0.20, 0.34, 0.26] }, { model: 'shadow', shell: [0.82, 0.84, 0.88], coat: [0.20, 0.40, 0.80] },
    { model: 'shadow', shell: [0.80, 0.64, 0.50], coat: [0.70, 0.30, 0.10] }, { model: 'survey' }] as const;
const PED_NEAR = 16, PED_N = 380, AIR_N = 64, PED_CAP = PED_N + AIR_N;   // street crowd + airborne drones; counts are iteration choices, not user numbers
function Civilians({sim}:{sim:Sim}){
    const refs=useRef<THREE.InstancedMesh[]>([]);
    const time=useRef({value:0});
    const set=useMemo(()=>PED_TYPES.map((t:any)=>{
        if(t.model==='shadow')return {geo:withPedestrianHands(shadowGeo({shell:t.shell,accent:t.coat,eye:EYE_BLUE}),t.shell),mat:shadowMat(time.current,7,true)};
        const r=robotGeo({model:t.model,eye:EYE_BLUE,shell:t.shell,scale:t.model==='sdrone'?1.3:t.model==='survey'?1.0:t.model==='companion'?1.15:1,extras:t.coat?coatRobot(t.coat):undefined});
        return {geo:r.geo,mat:robotMat(r.parts,r.scale,time.current,t.model==='sdrone'?0:3.2)};
    }),[]);
    if(DBG)(window as any).__pedInfo=set.map((p:any)=>{p.geo.computeBoundingBox();const b=p.geo.boundingBox;return{tris:(p.geo.index?p.geo.index.count:p.geo.attributes.position.count)/3,verts:p.geo.attributes.position.count,size:[b.max.x-b.min.x,b.max.y-b.min.y,b.max.z-b.min.z].map((x:number)=>+x.toFixed(2)),minY:+b.min.y.toFixed(2),hands:p.geo.userData.pedestrianHands||null,materialKey:p.mat.customProgramCacheKey()}});
    // distant tier: a ~40-triangle box proxy per type (torso, head, blue visor band), used beyond PED_NEAR metres; the full 600-2700 triangle robots stay for the near field
    const far=useMemo(()=>PED_TYPES.map((t:any,ti:number)=>{
        const sh=new THREE.Color().setRGB(...(t.shell||[0.82,0.84,0.88]) as [number,number,number]),cc=new THREE.Color().setRGB(...(t.coat||t.shell||[0.82,0.84,0.88]) as [number,number,number]),blue=new THREE.Color().setRGB(...(EYE_BLUE as unknown as [number,number,number])),dark=sh.clone().multiplyScalar(0.55);
        const parts:THREE.BufferGeometry[]=[];
        const box=(w:number,h:number,d:number,x:number,y:number,z:number,c:THREE.Color)=>{const g=new THREE.BoxGeometry(w,h,d).toNonIndexed();g.translate(x,y,z);const n=g.attributes.position.count,col=new Float32Array(n*3);for(let i=0;i<n;i++){col[i*3]=c.r;col[i*3+1]=c.g;col[i*3+2]=c.b;}g.setAttribute('color',new THREE.BufferAttribute(col,3));g.deleteAttribute('uv');parts.push(g);};
        if(ti<5){box(0.5,0.75,0.32,0,1.05,0,cc);box(0.3,0.3,0.3,0,1.58,0,sh);box(0.26,0.07,0.04,0,1.6,0.16,blue);box(0.34,0.68,0.22,0,0.34,0,dark);}
        else if(ti===3){box(0.9,0.9,0.9,0,0.7,0,sh);box(0.7,0.12,0.04,0,0.95,0.46,blue);}
        else if(ti===5){box(0.5,0.18,0.5,0,0.3,0,sh);box(1.6,0.05,0.12,0,0.38,0,dark);box(0.12,0.05,1.6,0,0.38,0,dark);box(0.2,0.08,0.04,0,0.3,0.26,blue);}   // quad drone: body, two rotor arms, blue lens
        else {box(0.9,0.75,0.9,0,0.45,0,sh);box(0.8,0.1,0.04,0,0.6,0.46,blue);}
        const geo=mergeGeometries(parts,false)!;
        return {geo,mat:new THREE.MeshLambertMaterial({vertexColors:true,emissive:new THREE.Color('#1c2230'),emissiveIntensity:0.6})};
    }),[]);
    const refsF=useRef<THREE.InstancedMesh[]>([]);
    const o=useMemo(()=>new THREE.Object3D(),[]);
    const wrapS=(v:number,W:number)=>((v%W)+W+W/2)%W-W/2;
    const ln=useRef({a:[0,0],y:30,t:0}),ys=useRef<number[]>([]);
    useFrame(()=>{time.current.value=sim.t;const cnt=PED_TYPES.map(()=>0),cf=PED_TYPES.map(()=>0);
        const hx=sim.pos[0],hz=sim.pos[2],near=(v:number)=>Math.round((v-CELL/2)/CELL)*CELL+CELL/2,L=ln.current.a;
        // street line the crowd is centred on, with hysteresis so it only re-centres after the hero is well into the next block
        const ym=ln.current;{const dtt=Math.max(0,Math.min(0.1,sim.t-ym.t));ym.t=sim.t;ym.y+=(Math.max(14,sim.pos[1])-ym.y)*Math.min(1,dtt*0.6);}   // air traffic layers follow the hero's altitude (smoothed) so rooftops and flights see drones at their own height
        const nx=near(hx),nz=near(hz);if(Math.abs(hx-L[0])>CELL*0.75||L[0]===0)L[0]=nx;if(Math.abs(hz-L[1])>CELL*0.75||L[1]===0)L[1]=nz;
        const cfg:any=(DBG&&(window as any).__pedCfg)||{},nP=cfg.n??PED_N,nA=cfg.a??AIR_N,rG=cfg.rg??85,rA=cfg.ra??110,nr=cfg.near??PED_NEAR;
        if(DBG)(window as any).__air=[];
        if(DBG)(window as any).__pl=[];
        const place=(i:number,air:boolean)=>{
            const axis=i&1,hp=axis?hz:hx,NS=air?7:5,W2=NS*CELL,u0=Math.floor((((i>>1)*0.7548777)%1)*NS)*CELL+CELL/2,line=hp+wrapS(u0-hp,W2),over=air&&((i>>2)&1)===1,lat=over?(((i*37)%13)-6)*4:(((i*37)%9)-4)*0.85,dir=(i&2)?1:-1,Wd=air?260:180,c=axis?hx:hz,cc=axis?hz:hx;
            const sp=air?(3+((i*13)%7)*0.9):(0.9+((i*13)%7)*0.12),base=((((i>>1)*0.6180339)%1)*Wd),al=c+wrapS(base+dir*sim.t*sp-c,Wd);
            const x=axis?al:line+lat,z=axis?line+lat:al;void cc;
            const dd=Math.hypot(x-hx,z-hz),lim=air?rA:rG;if(dd>lim)return;const fz=1-Math.min(1,Math.max(0,(dd-(lim-18))/18)),fade=fz*fz*(3-2*fz);if(fade<0.03)return;   // streets are world-fixed (a ped never hops to another street near the hero) and the radius edge fades by scale instead of popping
            if(!air&&(z<WATER_Z+6||(x>PARK.x0-3&&x<PARK.x1+3&&z>PARK.z0-3&&z<PARK.z1+3)))return;   // ground peds keep off water and the park; drones fly over them
            const rot=axis?(dir>0?Math.PI/2:-Math.PI/2):(dir>0?0:Math.PI);
            if(air){const ty=5;let y=Math.max(8,ym.y+((i*29)%50)-22);
                if(over){   // over-block route: fly above the actual roofs under a +-45 m window ahead and behind, smoothed so it climbs before it reaches a taller tower
                    let wm=0;const ax0=axis?al-45:x-30,ax1=axis?al+45:x+30,az0=axis?z-30:al-45,az1=axis?z+30:al+45;
                    for(const b of buildings){if(b.x1>ax0&&b.x0<ax1&&b.z1>az0&&b.z0<az1&&b.h>wm)wm=b.h;}
                    const tgt=Math.max(y+12,wm+9),s0=ys.current,k0=i%AIR_N;if(!s0[k0])s0[k0]=tgt;s0[k0]+=(tgt-s0[k0])*Math.min(1,0.016*3);y=s0[k0];}
                y+=Math.sin(sim.t*1.3+i)*0.6;if(DBG)(window as any).__pl.push([i,x,z,fade]);if(DBG)((window as any).__air||((window as any).__air=[])).push([x,y,z,over?1:0]);o.position.set(x,y,z);o.rotation.set(0,rot,0);o.scale.setScalar((over?3.2:1.5)*fade);o.updateMatrix();if(Math.hypot(x-hx,y-sim.pos[1],z-hz)<nr*1.1)refs.current[ty].setMatrixAt(cnt[ty]++,o.matrix);else refsF.current[ty].setMatrixAt(cf[ty]++,o.matrix);return;}
            const ty=i%5,hov=0;
            if(DBG)(window as any).__pl.push([i,x,z,fade]);o.position.set(x,hov,z);o.rotation.set(0,rot,0);o.scale.setScalar(BOT_SC*fade);o.updateMatrix();if(Math.hypot(x-hx,z-hz)<nr)refs.current[ty].setMatrixAt(cnt[ty]++,o.matrix);else refsF.current[ty].setMatrixAt(cf[ty]++,o.matrix);
        };
        for(let i=0;i<nP;i++)place(i,false);
        for(let i=0;i<nA;i++)place(i+1000,true);
        for(let i=0;i<PED_TYPES.length;i++){refs.current[i].count=cnt[i];syncInk(refs.current[i]);refs.current[i].instanceMatrix.needsUpdate=true;refsF.current[i].count=cf[i];syncInk(refsF.current[i]);refsF.current[i].instanceMatrix.needsUpdate=true;}if(DBG)(window as any).__ped=cnt.slice();});
    return <group>{set.map((p,i)=><instancedMesh key={i} ref={m=>{if(m&&refs.current[i]!==m){refs.current[i]=m;attachInk(m)}}} args={[p.geo,p.mat,PED_CAP]} frustumCulled={false}/>)}{far.map((p,i)=><instancedMesh key={'f'+i} ref={m=>{if(m&&refsF.current[i]!==m){refsF.current[i]=m;m.userData.far=true;attachInk(m)}}} args={[p.geo,p.mat,PED_CAP]} frustumCulled={false}/>)}</group>;
}
// ===== combat choreography poses (procedural layer on the existing rig; model untouched) =====
// Key poses read from real stills: Muybridge "Two men boxing" (1887) jab/cross shoulder turn + rear-heel pivot;
// Taekwondo 540 hook + capoeira armada (chamber, counter-lean, extended hook leg); Spider-Man 2 combat (launcher, air spike, web pull/yank).
type PoseK = Record<string, [number, number, number]>;
const CP_BONES = ['hips', 'spine', 'chest', 'head', 'uarmL', 'farmL', 'uarmR', 'farmR', 'thighL', 'shinL', 'thighR', 'shinR'];
const GUARD: PoseK = { hips: [0, 0.12, 0], spine: [0.12, 0, 0], chest: [0, 0.1, 0], head: [-0.08, -0.1, 0], uarmL: [-1.05, 0, 0.32], farmL: [-1.95, 0, 0], uarmR: [-0.85, 0, -0.38], farmR: [-2.05, 0, 0], thighL: [-0.38, 0, -0.06], shinL: [0.32, 0, 0], thighR: [0.28, 0, 0.06], shinR: [0.42, 0, 0] };
const P = (o: PoseK): PoseK => ({ ...GUARD, ...o });
const POSES: Record<number, [number, PoseK][]> = {
    1: [[0, GUARD], [0.33, P({ hips: [0, 0.28, 0], chest: [0, 0.42, 0], uarmL: [-1.55, 0, 0.14], farmL: [-0.08, 0, 0], head: [-0.05, -0.3, 0] })], [0.55, P({ hips: [0, 0.22, 0], chest: [0, 0.3, 0], uarmL: [-1.45, 0, 0.2], farmL: [-0.5, 0, 0] })], [1, GUARD]],
    2: [[0, P({ chest: [0, 0.3, 0] })], [0.34, P({ hips: [0, -0.38, 0], chest: [0, -0.62, 0], spine: [0.22, 0, 0], uarmR: [-1.58, 0, -0.12], farmR: [-0.06, 0, 0], uarmL: [-0.9, 0, 0.5], thighR: [0.12, 0, 0.04], shinR: [0.62, 0, 0], head: [-0.05, 0.35, 0] })], [0.6, P({ hips: [0, -0.3, 0], chest: [0, -0.45, 0], uarmR: [-1.4, 0, -0.2], farmR: [-0.6, 0, 0] })], [1, GUARD]],
    3: [[0, P({ hips: [0, 0.3, 0], chest: [0, 0.45, 0] })], [0.22, P({ spine: [-0.1, 0, 0], thighR: [-1.2, 0, 0.35], shinR: [1.7, 0, 0], thighL: [-0.1, 0, 0], shinL: [0.25, 0, 0] })], [0.5, P({ hips: [0, 0, -0.42], spine: [-0.32, 0, 0.2], chest: [0, 0, 0.15], thighR: [-0.45, 0, 1.45], shinR: [0.06, 0, 0], thighL: [0.05, 0, -0.05], shinL: [0.18, 0, 0], uarmL: [-0.4, 0, -1.0], farmL: [-0.6, 0, 0], uarmR: [-0.3, 0, 0.9], farmR: [-0.8, 0, 0] })], [0.72, P({ thighR: [-0.9, 0, 0.5], shinR: [1.2, 0, 0], spine: [-0.1, 0, 0] })], [1, GUARD]],
    4: [[0, P({ spine: [0.35, 0, 0], thighL: [-0.85, 0, 0], shinL: [1.3, 0, 0], thighR: [-0.25, 0, 0], shinR: [1.2, 0, 0], uarmR: [0.35, 0, 0.1], farmR: [-1.3, 0, 0] })], [0.38, P({ spine: [-0.28, 0, 0], chest: [0, -0.4, 0], uarmR: [-2.95, 0, -0.15], farmR: [-0.25, 0, 0], uarmL: [-0.4, 0, -0.6], farmL: [-1.2, 0, 0], thighL: [-1.6, 0, 0], shinL: [1.8, 0, 0], thighR: [0.2, 0, 0], shinR: [0.1, 0, 0], head: [-0.4, 0, 0] })], [0.7, P({ spine: [-0.15, 0, 0], uarmR: [-2.4, 0, -0.3], farmR: [-0.9, 0, 0], thighL: [-1.1, 0, 0], shinL: [1.6, 0, 0] })], [1, P({ thighL: [-0.6, 0, 0], shinL: [1.0, 0, 0], thighR: [-0.2, 0, 0], shinR: [0.8, 0, 0] })]],
    5: [[0, P({ thighL: [-1.4, 0, 0], shinL: [2.1, 0, 0], thighR: [-1.3, 0, 0], shinR: [2.0, 0, 0], spine: [0.35, 0, 0] })], [0.3, P({ hips: [0.25, 0, 0], thighR: [-1.9, 0, 0.1], shinR: [1.9, 0, 0], thighL: [-1.2, 0, 0], shinL: [2.0, 0, 0], uarmL: [-0.6, 0, -0.9], uarmR: [-0.6, 0, 0.9] })], [0.52, P({ hips: [0.55, 0, 0], spine: [0.2, 0, 0], thighR: [-1.25, 0, 0.05], shinR: [0.05, 0, 0], thighL: [-0.6, 0, 0], shinL: [1.9, 0, 0], uarmL: [-0.3, 0, -1.25], farmL: [-0.3, 0, 0], uarmR: [-0.2, 0, 1.25], farmR: [-0.3, 0, 0], head: [-0.4, 0, 0] })], [0.8, P({ hips: [0.2, 0, 0], thighR: [-0.9, 0, 0], shinR: [1.2, 0, 0], thighL: [-0.7, 0, 0], shinL: [1.4, 0, 0] })], [1, P({ thighL: [-0.5, 0, 0], shinL: [0.9, 0, 0], thighR: [-0.3, 0, 0], shinR: [0.7, 0, 0] })]],
    6: [[0, P({ uarmR: [-1.6, 0, -0.05], farmR: [-0.05, 0, 0], chest: [0, -0.35, 0] })], [0.22, P({ uarmR: [-1.55, 0, -0.1], farmR: [-0.1, 0, 0], uarmL: [-1.5, 0, 0.1], farmL: [-0.1, 0, 0], spine: [0.1, 0, 0] })], [0.4, P({ uarmR: [0.25, 0, 0.1], farmR: [-1.6, 0, 0], uarmL: [0.2, 0, -0.1], farmL: [-1.6, 0, 0], spine: [-0.2, 0, 0], thighR: [-1.3, 0, 0], shinR: [1.8, 0, 0] })], [0.55, P({ hips: [0.12, 0, 0], spine: [-0.18, 0, 0], thighR: [-1.6, 0, 0], shinR: [0.05, 0, 0], thighL: [0.6, 0, 0], shinL: [1.8, 0, 0], uarmR: [0.6, 0, 0.3], farmR: [-0.5, 0, 0], uarmL: [0.5, 0, -0.3], farmL: [-0.5, 0, 0] })], [0.8, P({ thighR: [-0.8, 0, 0], shinR: [1.0, 0, 0] })], [1, GUARD]],
    7: [[0, P({ uarmR: [-1.75, 0, -0.1], farmR: [-0.05, 0, 0], uarmL: [-1.7, 0, 0.1], farmL: [-0.05, 0, 0], spine: [0.15, 0, 0] })], [0.25, P({ uarmR: [-1.9, 0, -0.1], farmR: [-0.1, 0, 0], uarmL: [-1.85, 0, 0.1], farmL: [-0.1, 0, 0], spine: [0.1, 0, 0] })], [0.42, P({ uarmR: [0.45, 0, 0.15], farmR: [-1.4, 0, 0], uarmL: [0.45, 0, -0.15], farmL: [-1.4, 0, 0], spine: [-0.38, 0, 0], hips: [0, -0.2, 0], thighL: [-0.6, 0, 0], shinL: [0.6, 0, 0], thighR: [0.45, 0, 0], shinR: [0.4, 0, 0], head: [0.2, 0, 0] })], [0.75, P({ uarmR: [0.2, 0, 0.1], farmR: [-1.6, 0, 0], uarmL: [0.2, 0, -0.1], farmL: [-1.6, 0, 0], spine: [-0.15, 0, 0] })], [1, GUARD]],
};
export type CombatPoseState = { w: number; c: Float32Array; t: Float32Array };
export function createCombatPoseState(): CombatPoseState { return { w: 0, c: new Float32Array(CP_BONES.length * 3), t: new Float32Array(CP_BONES.length * 3) }; }
const _cp: CombatPoseState = createCombatPoseState();
const cstep = (x: number) => x * x * (3 - 2 * x);
function samplePose(keys: [number, PoseK][], u: number, out: Float32Array) {
    let k = 0; while (k < keys.length - 2 && u > keys[k + 1][0]) k++;
    const [u0, A] = keys[k], [u1, B] = keys[k + 1], f = cstep(Math.max(0, Math.min(1, (u - u0) / Math.max(1e-4, u1 - u0))));
    CP_BONES.forEach((n, i) => { const a = A[n], b = B[n]; for (let j = 0; j < 3; j++) out[i * 3 + j] = a[j] + (b[j] - a[j]) * f; });
}
export function combatPose(sim: any, rig: any, h: THREE.Object3D, dt: number, state: CombatPoseState = _cp) {
    const mv = sim.mv, fl = sim.flip, act = !!mv || !!fl;
    const bones = CP_BONES.map((n) => rig.b[n] as THREE.Bone);
    if (state.w < 0.02 && !act) { bones.forEach((b, i) => { state.c[i * 3] = b.rotation.x; state.c[i * 3 + 1] = b.rotation.y; state.c[i * 3 + 2] = b.rotation.z; }); state.w = 0; return; }
    state.w += ((act ? 1 : 0) - state.w) * Math.min(1, dt * (act ? 16 : 7));   // ease in fast, settle out slower: momentum, no snap
    if (mv) { const M = MOVES[mv.id]; samplePose(POSES[mv.id], Math.min(1, mv.t / M.dur), state.t); }
    else if (fl) { const u = fl.t / fl.dur, tuck = Math.sin(Math.min(1, u * 1.15) * Math.PI); samplePose([[0, GUARD], [1, P({ thighL: [-1.7, 0, 0], shinL: [2.2, 0, 0], thighR: [-1.6, 0, 0], shinR: [2.2, 0, 0], uarmL: [-1.2, 0, 0.6], farmL: [-1.8, 0, 0], uarmR: [-1.2, 0, -0.6], farmR: [-1.8, 0, 0], spine: [0.45, 0, 0] })]], fl.ax === 'x' ? tuck : tuck * 0.35, state.t);
        if (fl.ax === 'z') { const s0 = state.t; s0[4 * 3 + 2] = -1.5 * tuck; s0[6 * 3 + 2] = 1.5 * tuck; s0[8 * 3 + 2] = -0.5 * tuck; s0[10 * 3 + 2] = 0.5 * tuck; } }
    else { bones.forEach((b, i) => { state.t[i * 3] = b.rotation.x; state.t[i * 3 + 1] = b.rotation.y; state.t[i * 3 + 2] = b.rotation.z; }); }
    const k = Math.min(1, dt * 24);   // per-bone follow: chained moves blend through each other instead of popping
    for (let i = 0; i < state.t.length; i++) state.c[i] += (state.t[i] - state.c[i]) * k;
    const w = state.w;
    bones.forEach((b, i) => { b.rotation.x += (state.c[i * 3] - b.rotation.x) * w; b.rotation.y += (state.c[i * 3 + 1] - b.rotation.y) * w; b.rotation.z += (state.c[i * 3 + 2] - b.rotation.z) * w; });
    // whole-body turns, not smoothed (continuous 0..2pi): spin hook kick, flips/cartwheels around the hips
    if (mv && mv.id === 3) { const u = Math.min(1, mv.t / MOVES[3].dur), sp = cstep(Math.max(0, Math.min(1, (u - 0.08) / 0.72))); h.rotation.y += sp * Math.PI * 2; }
    if (mv && mv.id === 5) { const u = Math.min(1, mv.t / MOVES[5].dur); rig.b.hips.rotation.x += cstep(Math.min(1, u / 0.5)) * 0.6 * (1 - cstep(Math.max(0, (u - 0.6) / 0.4))); }
    if (fl) { const u = Math.min(1, fl.t / fl.dur), a = cstep(u) * Math.PI * 2 * fl.dir; if (fl.ax === 'x') rig.b.hips.rotation.x += a; else rig.b.hips.rotation.z += a; }
}
export const SNARE_PULSE_SEGMENTS = 2;
export const SNARE_RING_SEGMENTS = 16;
export const SHADOW_SNARE_COLOR = '#a855f7';
export function writeSnarePulse(a: THREE.BufferAttribute, start: number, hx: number, hy: number, hz: number, tx: number, ty: number, tz: number, progress: number, seed: number) {
    const p = Math.max(0, Math.min(1, progress)), span = 0.11, t0 = Math.max(0, p - span), t1 = Math.min(1, p + span), tm = (t0 + t1) * 0.5;
    const dx = tx - hx, dy = ty - hy, dz = tz - hz, side = Math.hypot(dx, dz) || 1, jitter = Math.sin(seed + p * 18) * 0.18;
    const ox = -dz / side * jitter, oz = dx / side * jitter;
    const x0 = hx + dx * t0, y0 = hy + dy * t0, z0 = hz + dz * t0;
    const xm = hx + dx * tm + ox, ym = hy + dy * tm + Math.cos(seed + p * 14) * 0.12, zm = hz + dz * tm + oz;
    const x1 = hx + dx * t1, y1 = hy + dy * t1, z1 = hz + dz * t1;
    a.setXYZ(start * 2, x0, y0, z0); a.setXYZ(start * 2 + 1, xm, ym, zm);
    a.setXYZ((start + 1) * 2, xm, ym, zm); a.setXYZ((start + 1) * 2 + 1, x1, y1, z1);
    return start + SNARE_PULSE_SEGMENTS;
}
export function writeSnareRing(a: THREE.BufferAttribute, start: number, x: number, y: number, z: number, radius: number) {
    for (let i = 0; i < SNARE_RING_SEGMENTS; i++) { const a0 = i / SNARE_RING_SEGMENTS * Math.PI * 2, a1 = (i + 1) / SNARE_RING_SEGMENTS * Math.PI * 2, o = (start + i) * 2; a.setXYZ(o, x + Math.cos(a0) * radius, y, z + Math.sin(a0) * radius); a.setXYZ(o + 1, x + Math.cos(a1) * radius, y, z + Math.sin(a1) * radius); }
    return start + SNARE_RING_SEGMENTS;
}
export function SnareLines({ sim }: { sim: Sim }) {
    const ref = useRef<THREE.LineSegments>(null!), shockRef = useRef<THREE.LineSegments>(null!);
    const lineMat = useRef<THREE.LineBasicMaterial>(null!), shockMat = useRef<THREE.LineBasicMaterial>(null!);
    const geo = useMemo(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SNARE.MAX_TARGETS * 2 + 2) * 2 * 3), 3)); return g; }, []);
    const shockGeo = useMemo(() => { const cap = SNARE.MAX_TARGETS * 2 * SNARE_PULSE_SEGMENTS + SNARE.MAX_TARGETS * SNARE_RING_SEGMENTS, g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cap * 2 * 3), 3)); return g; }, []);
    useFrame(() => {
        const sa = sim as any, a = geo.attributes.position as THREE.BufferAttribute, sh = shockGeo.attributes.position as THREE.BufferAttribute;
        const sn = sa.snareT || 0, hw = sa.handW as number[][] | undefined, targets = (sa.snareList || []) as Sim['enemies']; let n = 0, pn = 0, rn = 0, shockProgress = 0;
        for (let i = 0; i < Math.min(SNARE.MAX_TARGETS, targets.length); i++) {
            const e = targets[i]; if (e.down > 0) continue; const ty = e.y + ((e as any).ly || 0) + enemyBodyOffset(e);
            for (let sd = 0; sd < 2; sd++) {
                const hp = hw ? hw[sd] : [sim.pos[0], sim.pos[1] + 1.5, sim.pos[2]], o = n * 2; a.setXYZ(o, hp[0], hp[1], hp[2]); a.setXYZ(o + 1, e.x, ty, e.z); n++;
                if (sn > SNARE.IMPACT && sn <= SNARE.SHOCK_START) { const p = 1 - (sn - SNARE.IMPACT) / (SNARE.SHOCK_START - SNARE.IMPACT); shockProgress = p; pn = writeSnarePulse(sh, pn, hp[0], hp[1], hp[2], e.x, ty, e.z, p, i * 3.1 + sd * 1.7); }
            }
            if (sn > 0 && sn <= SNARE.IMPACT) { const p = 1 - sn / SNARE.IMPACT; rn = writeSnareRing(sh, rn, e.x, ty, e.z, 0.35 + p * 1.75); }
        }
        { const cw = sa.cWeb; if (cw && cw.e && cw.e.down <= 0) { const e = cw.e, ty = e.y + (e.ly || 0) + enemyBodyOffset(e); for (let sd = cw.mode === 'yank' ? 0 : 1; sd < 2; sd++) { const o = n * 2, hp = hw ? hw[sd] : [sim.pos[0], sim.pos[1] + 1.5, sim.pos[2]]; a.setXYZ(o, hp[0], hp[1], hp[2]); a.setXYZ(o + 1, e.x, ty, e.z); n++; } } }
        geo.setDrawRange(0, n * 2); a.needsUpdate = true; ref.current.visible = n > 0;
        shockGeo.setDrawRange(0, (pn + rn) * 2); sh.needsUpdate = true; shockRef.current.visible = pn + rn > 0;
        if (lineMat.current) { lineMat.current.color.set(sn > 0 ? SHADOW_SNARE_COLOR : '#ffffff'); lineMat.current.opacity = sn > 0 ? 0.98 : 0.86; }
        if (shockMat.current) shockMat.current.color.set(sn > 0 ? SHADOW_SNARE_COLOR : '#ffffff');
        if (DBG) (window as any).__shadowSnareFx = { webLines: n, pulseSegments: pn, ringSegments: rn, pulseProgress: shockProgress, snareColor: sn > 0 ? SHADOW_SNARE_COLOR : null, strandColor: lineMat.current?.color.getHexString(), shockColor: shockMat.current?.color.getHexString() };
    });
    return <>
        <lineSegments ref={ref} geometry={geo} frustumCulled={false}><lineBasicMaterial ref={lineMat} color="#ffffff" transparent opacity={0.86} depthTest={false} depthWrite={false} /></lineSegments>
        <lineSegments ref={shockRef} geometry={shockGeo} frustumCulled={false}><lineBasicMaterial ref={shockMat} color="#ffffff" transparent opacity={0.98} depthTest={false} depthWrite={false} /></lineSegments>
    </>;
}
// flying cars: instanced lane traffic above the streets; motion comes from sim.carAt so collision and web anchors match what you see
function carGeo() {
    const parts: THREE.BufferGeometry[] = [];
    const add = (g: THREE.BufferGeometry, c: number[], x: number, y: number, z: number, al = 1) => { g.translate(x, y, z); const n = g.attributes.position.count, a = new Float32Array(n * 4); for (let i = 0; i < n; i++) { a[i * 4] = c[0]; a[i * 4 + 1] = c[1]; a[i * 4 + 2] = c[2]; a[i * 4 + 3] = al; } g.setAttribute('color', new THREE.BufferAttribute(a, 4)); parts.push(g.index ? g.toNonIndexed() : g); };
    // reference: Kenney Car Kit (CC0) silhouettes - chunky body, tinted cabin, light pods; hover pods instead of wheels
    add(new THREE.BoxGeometry(2.0, 0.65, 4.4), [0.9, 0.9, 0.9], 0, 0, 0); add(new THREE.BoxGeometry(1.7, 0.6, 2.2), [0.12, 0.16, 0.22], 0, 0.6, -0.3);
    add(new THREE.BoxGeometry(1.5, 0.12, 1.9), [0.9, 0.9, 0.9], 0, 0.95, -0.3);
    add(new THREE.BoxGeometry(1.6, 0.14, 0.12), [1.5, 1.4, 1.0], 0, 0.05, 2.22, 0.5); add(new THREE.BoxGeometry(1.6, 0.14, 0.12), [1.6, 0.2, 0.2], 0, 0.05, -2.22, 0.5);   // alpha 0.5 = light tag for the outline pass
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.CylinderGeometry(0.42, 0.42, 0.16, 8), [0.15, 0.15, 0.18], sx * 1.0, -0.4, sz * 1.4), add(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 8), [0.3, 2.0, 2.6], sx * 1.0, -0.5, sz * 1.4, 0.5);
    return mergeGeometries(parts, false)!;
}
function FlyingCars({ sim }: { sim: Sim }) {
    const ref = useRef<THREE.InstancedMesh>(null!);
    const geo = useMemo(carGeo, []);
    const cars = CARS; if (DBG) (window as any).__carAt = carAt;
    useFrame(() => {
        const t = sim.t, m = ref.current; if (!m) return;
        for (let i = 0; i < CAR_N; i++) {
            const c = carAt(i, t);
            tmp.position.set(c.x, c.y, c.z); tmp.rotation.set(0, CARS[i].axis === 0 ? (CARS[i].sp > 0 ? 0 : Math.PI) : (CARS[i].sp > 0 ? Math.PI / 2 : -Math.PI / 2), 0);
            tmp.scale.setScalar(CAR_SCALE); tmp.updateMatrix(); m.setMatrixAt(i, tmp.matrix); if (DBG && i === 0) (window as any).__car0 = [c.x, c.y, c.z, CARS[i].axis, CARS[i].sp];
        }
        m.instanceMatrix.needsUpdate = true;
    });
    useEffect(() => { const pal = ['#e5483a', '#f2b632', '#3aa66a', '#3f6fd8', '#f07a2a', '#8e5bd6']; cars.forEach((_, i) => ref.current.setColorAt(i, new THREE.Color(pal[i % 6]))); ref.current.instanceColor!.needsUpdate = true; }, [cars]);
    return <instancedMesh ref={ref} args={[undefined, undefined, CAR_N]} geometry={geo} frustumCulled={false}><meshBasicMaterial vertexColors toneMapped={false} transparent blending={THREE.NoBlending} /></instancedMesh>;
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
export type HeroClipState = { key: string; t: number; w: number };
export function createHeroClipState(): HeroClipState { return { key: '', t: 0, w: 0 }; }
export type HeroRootPoseState = { lean: number; glideBlend: number; bank: number; yaw: number; swimWave: number };
export type HeroAnimationFrame = { clipState: HeroClipState; poseState?: CombatPoseState; sourceClipState?: HeroClipState; poseDt?: number; glideBlend: number; publishState?: boolean };
export function applyHeroRootPose(sim: any, rig: any, dt: number, state: any, position: ArrayLike<number>, scale: number, sourcePose?: HeroRootPoseState, publishState = true) {
    const root = rig.root as THREE.Group, poseRoot = rig.poseRoot as THREE.Group, sa = sim as any;
    root.position.set(position[0], position[1] - 1, position[2]);
    root.scale.setScalar(scale);
    if (sim.wall) { root.position.x += Math.sin(sim.ang) * 0.2; root.position.z += Math.cos(sim.ang) * 0.2; }
    if (sourcePose) state.swW = sourcePose.swimWave;
    if (sim.swim) {
        if (!sourcePose) { const baseY = waterRenderY(position[0], position[2], sim.t) - waveAtWater(position[0], position[2], sim.t), kw = Math.max(0, Math.min(1, (position[1] - baseY + 2) / 2.3)), wv = waveAtWater(position[0], position[2], sim.t) * kw; state.swW = state.swW === undefined ? wv : state.swW + (wv - state.swW) * Math.min(1, dt * 10); }
        root.position.y = position[1] - 1.7 + (state.swW || 0); root.position.x -= Math.sin(sim.ang) * (sim.dive ? 0.6 : 1.3); root.position.z -= Math.cos(sim.ang) * (sim.dive ? 0.6 : 1.3);
    }
    const oldBlend = state.gB || 0;
    state.gB = sourcePose?.glideBlend ?? oldBlend + ((sim.glideOn ? 1 : 0) - oldBlend) * Math.min(1, dt * 3.5);
    const lean = sourcePose?.lean ?? ((sim.swim ? (sim.dive ? 1.9 : 1.45) : sim.wall ? 0.32 : sim.web ? 0.5 : sim.ground ? 0.12 : 0.3) * (1 - state.gB * 0.8) + state.gB * 1.12);
    root.rotation.set(0, sim.ang, 0);
    poseRoot.rotation.set(lean, 0, 0); poseRoot.rotation.order = 'ZXY';
    let bank = sourcePose?.bank;
    if (bank === undefined) {
        const yr = state.bYaw === undefined ? 0 : ((sim.yaw - state.bYaw + Math.PI * 3) % (Math.PI * 2) - Math.PI) / Math.max(dt, 1e-3);
        state.bYaw = sim.yaw; state.bR = (state.bR || 0) + (Math.max(-0.5, Math.min(0.5, -yr * 0.9)) * state.gB - (state.bR || 0)) * Math.min(1, dt * 4); bank = state.bR;
    } else { state.bYaw = sourcePose!.yaw; state.bR = bank; }
    poseRoot.rotation.z = bank;
    if (state.gB > 0.01) { const lc = 0.9 * state.gB; root.position.x -= Math.sin(sim.ang) * Math.sin(lean) * lc; root.position.z -= Math.cos(sim.ang) * Math.sin(lean) * lc; root.position.y += (1 - Math.cos(lean)) * lc * 0.6; }
    root.position.y -= sim.land * 0.5;
    poseRoot.rotation.x += sim.land * 0.5 + (sim.dodgeT > 0 && !sa.flip ? 0.6 : 0);
    const rootPose = { lean, glideBlend: state.gB, bank, yaw: sim.yaw, swimWave: state.swW || 0 };
    if (publishState) sa.__heroRootPoseState = rootPose;
    return rootPose;
}
export function animateHeroBones(sim: any, rig: any, dt: number, frame: HeroAnimationFrame) {
    const { clipState, poseState, sourceClipState, poseDt = dt, glideBlend, publishState = true } = frame;
    const h = rig.root, poseRoot = rig.poseRoot as THREE.Group, sa = sim as any, v = sim.vel;
    rig.bones.forEach((b: THREE.Bone) => b.rotation.set(0, 0, 0));
    const speed = Math.hypot(v[0], v[1], v[2]), hs = Math.hypot(v[0], v[2]);
    const legR = rig.b.thighR as THREE.Bone, legL = rig.b.thighL as THREE.Bone;
    const armR = rig.b.uarmR as THREE.Bone, armL = rig.b.uarmL as THREE.Bone;
    const sw = sim.ground ? Math.sin(sim.runPhase * 3) * 0.9 * Math.min(1, hs / 6) : 0.25;
    legR.rotation.x = sw; legL.rotation.x = -sw; armL.rotation.x = -sw * 0.8;
    if (sim.swim) { const cs = Math.sin(sim.runPhase * 2.4); legR.rotation.x = cs * 0.5; legL.rotation.x = -cs * 0.5; armL.rotation.x = -2.6 + cs * 1.2; }
    if (sim.wall) { const moving = Math.min(1, speed / 7), cw = Math.sin(sim.runPhase * 2.5) * moving; legR.rotation.x = -0.3 + cw * 1.05; legL.rotation.x = -0.3 - cw * 1.05; armL.rotation.x = -1.35 - cw * 0.8; }
    armR.rotation.x = sim.swim ? -2.6 - Math.sin(sim.runPhase * 2.4) * 1.2 : sim.wall ? -1.35 + Math.sin(sim.runPhase * 2.5) * 0.8 * Math.min(1, speed / 7) : sim.web ? (sim.swings % 2 === 1 ? -2.7 : -0.5) : sim.atkT > 0 ? -1.5 - Math.sin((0.32 - sim.atkT) * 10) * 0.6 : sw * 0.8;
    if (sim.web && !sim.swim && !sim.wall) armL.rotation.x = sim.swings % 2 === 0 ? -2.7 : -0.5;
    if (sa.kick && sim.atkT > 0 && sim.shotT <= 0) { const kp = Math.sin((1 - sim.atkT / 0.32) * Math.PI); legR.rotation.x = -1.7 * kp; legL.rotation.x = 0.15; armR.rotation.x = -0.8; armL.rotation.x = -1.2; }
    if (sim.glideOn && !(sa.snareT > 0)) { armR.rotation.x = -0.1; armL.rotation.x = -0.1; armR.rotation.z = 1.3; armL.rotation.z = -1.3; const gt = Math.sin(sim.t * 5) * 0.05; legR.rotation.x = 0.12 + gt; legL.rotation.x = 0.06 - gt; }
    const sn = sa.snareT || 0;
    if (sn > 0) {
        if (sn > SNARE.GATHER_END) { armR.rotation.x = -1.35; armL.rotation.x = -1.35; legR.rotation.x = -0.2; legL.rotation.x = 0.1; }
        else { const charge = sn <= SNARE.SHOCK_START ? Math.sin((SNARE.SHOCK_START - sn) * 18) * 0.035 : 0; armR.rotation.x = -1.22 - charge; armL.rotation.x = -1.22 - charge; armR.rotation.z = -0.2; armL.rotation.z = 0.2; legR.rotation.x = -0.2; legL.rotation.x = 0.1; }
    }
    { const tR = legR.rotation.x, tL = legL.rotation.x, tuck = sim.ground || sim.glideOn || sim.wall ? 0 : 0.35; rig.b.shinR.rotation.x = Math.max(0, tR) * 0.9 + 0.08 + tuck; rig.b.shinL.rotation.x = Math.max(0, tL) * 0.9 + 0.08 + tuck; rig.b.farmR.rotation.x = sn > 0 ? -0.9 : -0.35 + Math.min(0, armR.rotation.x + 1.2) * 0.2; rig.b.farmL.rotation.x = sn > 0 ? -0.9 : -0.35 + Math.min(0, armL.rotation.x + 1.2) * 0.2; rig.b.spine.rotation.x = Math.sin(sim.runPhase * 3) * 0.04 * (sim.ground ? 1 : 0); }
    const ck = (sa.mv || sa.flip || sn > 0 || (sim.glideOn && glideBlend > 0.3)) ? '' : sim.swim ? 'swim' : sim.wall ? 'wall' : sim.atkT > 0 && sim.shotT <= 0 ? (sa.kick ? '' : 'punch') : (!sim.ground && !sim.web) ? 'jump' : (sim.ground && hs < 0.6 && !sim.dive) ? 'idle' : (sim.ground && !sim.web) ? 'run' : '';
    const cs = clipState;
    if (sourceClipState) { cs.key = sourceClipState.key; cs.t = sourceClipState.t; cs.w = sourceClipState.w; }
    else {
        if (ck !== cs.key) cs.key = ck || cs.key;
        cs.w += ((ck ? 1 : 0) - cs.w) * Math.min(1, dt * 10);
        if (ck) {
            const c = CLIPS[ck];
            if (ck === 'wall') cs.t += dt * Math.min(1.6, speed / 3);
            else if (ck === 'swim') cs.t += dt * (0.6 + Math.min(1.2, speed / 8));
            else if (ck === 'punch') cs.t = 0.10 + (0.32 - sim.atkT) * 2.0;
            else if (ck === 'jump') cs.t = (c.n / c.fps) * 0.5;
            else if (ck === 'run') cs.t += dt * Math.max(0.5, Math.min(2, hs / 5.5));
            else cs.t += dt;
        }
    }
    if (cs.key === 'swim' || cs.key === 'wall') poseRoot.rotation.x *= 1 - cs.w * 0.9; else if (cs.key === 'run') poseRoot.rotation.x *= 1 - cs.w * 0.7;
    rig.b.head.rotation.x = -poseRoot.rotation.x * 0.5;
    if (cs.w > 0.02 && (cs.key === 'run' || cs.key === 'idle') && CLIPS[cs.key].hy) { const c = CLIPS[cs.key], fi = Math.floor(((cs.t * c.fps) % c.n + c.n) % c.n); rig.b.hips.position.y = rig.hipsY + (c.hy[fi] - 1) * (cs.key === 'idle' ? 0.3 : 0.6) * cs.w; } else rig.b.hips.position.y = rig.hipsY;
    if (cs.w > 0.02 && CLIPS[cs.key]) sampleClip(CLIPS[cs.key], cs.t, cs.key === 'wall' || cs.key === 'swim' || cs.key === 'idle' || cs.key === 'run', rig.bones, cs.w);
    if (sim.shotT > 0 || sim.spring > 0) { const tg = sim.shotT > 0 ? sim.shotTgt : sim.anchor, wt = Math.min(1, (sim.shotT > 0 ? sim.shotT : sim.spring) / 0.12); rig.root.updateWorldMatrix(true, true); _tg.set(tg[0], tg[1], tg[2]); for (const side of ['L', 'R']) { aimBone(rig.b['uarm' + side], rig.b['farm' + side], _tg, wt); rig.root.updateWorldMatrix(true, true); aimBone(rig.b['farm' + side], rig.b['hand' + side], _tg, wt); rig.root.updateWorldMatrix(true, true); } }
    const activePoseState = poseState ?? _cp;
    combatPose(sim, rig, h, poseDt, activePoseState);
    if (publishState && !sourceClipState) {
        sa.__heroClipState = { key: cs.key, t: cs.t, w: cs.w };
        const sharedPose = sa.__heroPoseState ?? (sa.__heroPoseState = { w: 0, c: new Float32Array(activePoseState.c.length), t: new Float32Array(activePoseState.t.length) });
        sharedPose.w = activePoseState.w; sharedPose.c.set(activePoseState.c); sharedPose.t.set(activePoseState.t);
    }
    const zip = sim.web && sim.webT < 1.6 && sim.anchor[1] - sim.pos[1] > 25 && Math.hypot(sim.anchor[0] - sim.pos[0], sim.anchor[1] - sim.pos[1], sim.anchor[2] - sim.pos[2]) < sim.rope - 0.5;
    const action = sn > 0 ? 'shadow-snare' : sa.mv ? `move-${sa.mv.id}` : sa.flip ? 'dodge-flip' : sim.shotT > 0 ? 'plasma-web-shot' : sim.spring > 0 ? 'web-spring-launch' : sim.web ? (zip ? 'street-zip-up' : 'web-swing') : sim.swim ? (sim.dive ? 'dive' : 'swim') : sim.wall ? 'wall-crawl' : sim.wallT > 0 ? 'wall-jump' : sim.glideOn ? (sa.flightBoost ? 'powered-flight' : 'glide') : !sim.ground ? (sa.glideBlocked || sa.flightTapCancel ? 'glide-cancel' : sa.leapT > 0 ? 'shore-exit-leap' : 'airborne') : sim.vaulted > 0 && sim.land > 0 ? 'rooftop-vault' : hs > 0.6 ? 'run' : 'idle';
    const snarePhase = sn <= 0 ? 'inactive' : sn > SNARE.GATHER_END ? 'gather' : sn > SNARE.SHOCK_START ? 'grip' : sn > SNARE.IMPACT ? 'shockwave' : 'discharge';
    return { key: ck || '', clipKey: cs.key, t: cs.t, weight: cs.w, frame: cs.key && CLIPS[cs.key] ? (cs.t * CLIPS[cs.key].fps) % CLIPS[cs.key].n : 0, poseWeight: activePoseState.w, action, moveId: sa.mv?.id ?? null, moveT: sa.mv?.t ?? 0, flip: sa.flip ? { t: sa.flip.t, dur: sa.flip.dur, ax: sa.flip.ax, dir: sa.flip.dir } : null, snareT: sn, snarePhase, gripHands: sn > 0 ? 2 : 0, snareTargets: (sa.snareList || []).length, shotT: sim.shotT, spring: sim.spring, aimedHands: sim.shotT > 0 || sim.spring > 0 ? 2 : 0, aimTarget: sim.shotT > 0 ? [...sim.shotTgt] : sim.spring > 0 ? [...sim.anchor] : null, web: sim.web, wall: !!sim.wall, swim: sim.swim, dive: sim.dive, glideOn: sim.glideOn };
}
export interface SceneProps { sim: Sim; ev: Events; coarse: boolean; fx: { fov: number; shake: number }; perf: { scale: number; fps: number; speed: number } }



const _wv = new THREE.Vector3(), _wv2 = new THREE.Vector3();
export function buildRig(data: any = heroData, materialOverride?: THREE.MeshLambertMaterial) {
    const d: any = data;
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
    if (d.rebuildNormals) g.computeVertexNormals();
    const bones: THREE.Bone[] = [], byName: Record<string, THREE.Bone> = {};
    d.bones.forEach((b: any, i: number) => {
        const bone = new THREE.Bone(); bone.name = b.n; bones.push(bone); byName[b.n] = bone;
        const par = b.p >= 0 ? d.bones[b.p].h : [0, 0, 0];
        bone.position.set(b.h[0] - par[0], b.h[1] - par[1], b.h[2] - par[2]);
        if (b.p >= 0) bones[b.p].add(bone);
    });
    let mat: THREE.MeshLambertMaterial;
    if (materialOverride) mat = materialOverride;
    else if (d.uv) {
        const tex = new THREE.TextureLoader().load(baseTexUrl); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16;   // hero-only path (bots/boss build their own); three clamps to the GPU max
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
    const root = new THREE.Group(), poseRoot = new THREE.Group(); root.add(poseRoot); poseRoot.add(mesh); mesh.add(bones[0]);
    root.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));
    // cel-style ink outline: inverted hull sharing the geometry and skeleton, pushed out along the skinned normal (ref: Wind Waker character edge ink)
    { const om = new THREE.MeshBasicMaterial({ color: '#0a0d1a', side: THREE.BackSide }); om.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', 'transformed += normalize(objectNormal) * 0.014;\n#include <project_vertex>'); }; const ol = new THREE.SkinnedMesh(g, om); ol.frustumCulled = false; ol.bind(mesh.skeleton, mesh.bindMatrix); poseRoot.add(ol); }
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
    return { root, poseRoot, b: byName, bones, hull, skel, hipsY: byName.hips.position.y };
}


// Mixamo-derived clips, retargeted offline (tools/fbx2clip.mjs) onto the generated rig
export type Clip = { fps: number; n: number; bones: string[]; q: number[]; hy: number[] };
export const CLIPS: Record<string, Clip> = { idle: clipIdle as any, jump: clipJump as any, wall: clipWall as any, punch: clipPunch as any, swim: clipSwim as any, run: clipRun as any };
const _wd = new THREE.Vector3(), _wp = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
export function sampleClip(c: Clip, t: number, loop: boolean, bones: THREE.Bone[], w: number) {
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
      ${xy ? `// Match grazing rays at the wall/surface junction without changing the deeper sand wall.
      vec3 ray=normalize(cameraPosition-vW);vec3 junction=fogUsed*(1.0+0.9*pow(1.0-clamp(abs(ray.y),0.0,1.0),2.5));
      col=mix(col,junction,smoothstep(-5.0,-0.6,vW.y));` : ''}
      gl_FragColor = vec4(col, 1.0); }`,
});
const seabedMat = mkSea(false), wallMat = mkSea(true);
// Water: sum-of-sines height field, fresnel sky mix, sun glitter, crest foam, distance haze (informed by public ocean-shader write-ups, see docs/REFERENCES.md)
const WAVES = `
float swellK(float z){ return 1.0 + 1.3 * smoothstep(-300.0, -750.0, z); }   // bigger swell offshore (greater ocean)
float wh(vec2 p, float t){
  float h = 0.0;
  h += sin(dot(p, vec2(0.008, 0.005)) + t * 0.32) * 0.78;
  h += sin(dot(p, vec2(-0.012, 0.009)) + t * 0.42) * 0.42;
  h += sin(dot(p, vec2(0.033, -0.023)) + t * 0.72) * 0.12;
  h += sin(dot(p, vec2(0.076, 0.054)) + t * 0.98) * 0.035;
  return h * swellK(p.y);
}
vec2 wg(vec2 p, float t){
  vec2 g = vec2(0.0);
  g += cos(dot(p, vec2(0.008, 0.005)) + t * 0.32) * 0.78 * vec2(0.008, 0.005);
  g += cos(dot(p, vec2(-0.012, 0.009)) + t * 0.42) * 0.42 * vec2(-0.012, 0.009);
  g += cos(dot(p, vec2(0.033, -0.023)) + t * 0.72) * 0.12 * vec2(0.033, -0.023);
  g += cos(dot(p, vec2(0.076, 0.054)) + t * 0.98) * 0.035 * vec2(0.076, 0.054);
  return g * swellK(p.y);
}`;
function waveH(x: number, z: number, t: number) {
    const zk = Math.max(0, Math.min(1, (z + 300) / -450)), sk = 1 + 1.3 * zk * zk * (3 - 2 * zk);
    return sk * (Math.sin(x * 0.008 + z * 0.005 + t * 0.32) * 0.78 + Math.sin(-x * 0.012 + z * 0.009 + t * 0.42) * 0.42 + Math.sin(x * 0.033 - z * 0.023 + t * 0.72) * 0.12 + Math.sin(x * 0.076 + z * 0.054 + t * 0.98) * 0.035);
}
function waveAtWater(x: number, z: number, t: number) { return isLakeWater(x, z) ? lakeWaveH(x, z, t) : waveH(x, z, t); }
function waterRenderY(x: number, z: number, t: number) { return isLakeWater(x, z) ? waterSurfaceAt(x, z, t) : WATER_Y + waveH(x, z, t); }
const waterMat = new THREE.ShaderMaterial({
    transparent: true, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uUWF: UWF, uDay: TOD.day, uSun: TOD.sunU, uSky: { value: TOD.sky }, uDeep: { value: new THREE.Color('#0a6f92') }, uShallow: { value: new THREE.Color('#2fa8c4') },
        // Shifat Oct 29 "ocean water can be upgraded like lake waters": same screen-space reflection + refraction the lake uses (OceanScreenSpace fills these)
        tScene: { value: null }, tDepth: { value: null }, uUseScene: { value: 0 }, uSteps: { value: 7 }, uNear: { value: 0.1 }, uFar: { value: 1000 }, uProj: { value: new THREE.Matrix4() } },
    vertexShader: WAVES + `uniform float uTime; varying vec3 vW; varying vec3 vView; varying vec4 vScreen; void main(){ vec3 p = position; vec4 w = modelMatrix * vec4(p, 1.0); w.z = min(w.z, -222.0); float h = wh(w.xz, uTime); w.y += h; vW = w.xyz; vec4 vv = viewMatrix * w; vView = vv.xyz; gl_Position = projectionMatrix * vv; vScreen = gl_Position; }`.replace('vec3 p = position; vec4 w = modelMatrix * vec4(p, 1.0);', 'vec4 w = modelMatrix * vec4(position, 1.0);'),
    fragmentShader: '#include <packing>\n' + WAVES + `uniform float uDay; uniform float uTime; uniform vec3 uSun, uSky, uDeep, uShallow, uUWF; varying vec3 vW; varying vec3 vView; varying vec4 vScreen;
    uniform sampler2D tScene; uniform sampler2D tDepth; uniform float uUseScene, uSteps, uNear, uFar; uniform mat4 uProj;
    float oceanZ(vec2 uv){ return perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }
    vec3 sceneCol(vec2 uv){ return linearToOutputTexel(vec4(texture2D(tScene, uv).rgb, 1.0)).rgb; }
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
      body = mix(body, uDeep * 0.5, smoothstep(-300.0, -800.0, vW.z) * 0.55);   // deep offshore water reads darker blue
      vec3 r = reflect(-v, n);
      vec3 refl = mix(uSky, vec3(0.2, 0.34, 0.6), smoothstep(0.0, 0.45, r.y)) + vec3(1.0, 0.55, 0.3) * 0.25 * pow(max(dot(normalize(r), uSun), 0.0), 6.0);
      if (uUseScene > 0.5 && !below) {
        vec2 suv = vScreen.xy / vScreen.w * 0.5 + 0.5; float wz = vView.z;
        // screen-space reflection: march the reflected ray through the low-res scene copy (palms, buildings, hero, boats show in the sea)
        vec3 Rv = normalize((viewMatrix * vec4(r, 0.0)).xyz); float tp = 0.0;
        for (int i = 0; i < 16; i++) { if (float(i) >= uSteps) break; float k = (float(i) + 1.0) / uSteps; float tt = 140.0 * k * k; vec3 Q = vView + Rv * tt; vec4 c = uProj * vec4(Q, 1.0); if (c.w <= 0.0) break; vec2 uv = c.xy / c.w * 0.5 + 0.5;
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break; float sz = oceanZ(uv);
          if (Q.z < sz && Q.z > sz - (tt - tp) * 1.2 - 0.8 && sz > -uFar * 0.98) { float e = smoothstep(0.0, 0.1, uv.x) * (1.0 - smoothstep(0.9, 1.0, uv.x)) * (1.0 - smoothstep(0.82, 1.0, uv.y)) * smoothstep(0.0, 0.08, uv.y); refl = mix(refl, sceneCol(uv), e * 0.92); break; }
          tp = tt; }
        // refraction: the real seabed / shore / swimmer behind the surface, absorbed by the water thickness (red dies first)
        float dd = max(wz - oceanZ(suv), 0.0); vec3 Nv = (viewMatrix * vec4(n, 0.0)).xyz; vec2 uv2 = suv + Nv.xy * 0.04 * clamp(dd * 0.3, 0.0, 1.0);
        float sz2 = oceanZ(uv2); if (sz2 > wz) { uv2 = suv; sz2 = oceanZ(suv); }
        float th = clamp(wz - sz2, 0.0, 60.0); vec3 Tr = exp(-vec3(0.30, 0.065, 0.04) * th);
        body = sceneCol(uv2) * Tr + body * (1.0 - Tr);
      }
      vec3 col = mix(body, refl, fr);
      col += vec3(1.0, 0.85, 0.7) * (pow(max(dot(r, uSun), 0.0), 220.0) * 1.6 + pow(max(dot(r, uSun), 0.0), 40.0) * 0.35);
      col += vec3(0.1, 0.45, 0.5) * smoothstep(0.3, 0.8, wh(vW.xz, uTime)) * 0.25 * (1.0 - fr);
      float crest = smoothstep(0.95, 1.22, wh(vW.xz, uTime) + sin(vW.x * 0.07) * sin(vW.z * 0.06) * 0.035);
      col = mix(col, vec3(1.0), crest * 0.11);
      float sd = -222.0 - vW.z; float sf = smoothstep(24.0, 0.0, sd) * (0.5 + 0.5 * sin(sd * 1.3 - uTime * 1.8 + sin(vW.x * 0.4) * 2.0));
      col = mix(col, vec3(1.0, 0.97, 0.92), clamp(sf, 0.0, 1.0) * step(0.0, sd) * 0.15);
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
      if (!below) {
        col *= mix(0.3, 1.0, uDay);
        // Stylised cool night-sky lobe, not scene reflections or a physical moon model.
        col += vec3(0.18, 0.26, 0.38) * (1.0-uDay) * pow(max(dot(r, normalize(vec3(-0.3, 0.6, -0.5))), 0.0), 12.0);
      }
      // A near-waterline camera can sit inside a displaced crest while viewing its top face.
      // Fade only that nearby top-face sheet so the swimmer remains readable through the split.
      // This is a local transparency approximation, not scene-colour refraction.
      float waterline = 1.0 - smoothstep(0.35, 1.4, abs(cameraPosition.y - wh(cameraPosition.xz, uTime)));
      float nearClear = mix(1.0, smoothstep(1.0, 16.0, length(cameraPosition - vW)), waterline);
      float splitBlend = (1.0 - smoothstep(0.8, 1.4, -1.0 - cameraPosition.y)) * (1.0 - smoothstep(0.4, 4.0, length(cameraPosition - vW)));
      if (below) { col = mix(col, linearToOutputTexel(vec4(uUWF, 1.0)).rgb, splitBlend); aOut = mix(aOut, 1.0, splitBlend); }
      // Shore junction: share the wall's ray scattering only at grazing angles near the solid shore.
      // Opaque coverage here prevents the hidden city underside from leaking through the join.
      if(below){float join=smoothstep(-230.0,-224.0,vW.z)*(1.0-smoothstep(0.20,0.65,abs(v.y)));
        vec3 junction=uWaterDisplay*(1.0+0.9*pow(1.0-clamp(abs(v.y),0.0,1.0),2.5));
        col=mix(col,junction,join);aOut=mix(aOut,1.0,join);}
      gl_FragColor = vec4(col, below ? aOut : nearClear);
    }`,
});



// Greater ocean: a camera-following sea sheet whose grid is dense under the camera and coarse toward the horizon (one mesh, no extra
// draw calls). The vertex shader folds anything north of the shoreline onto it, so the sheet never covers land.
const OCEAN_HALF = 900, OCEAN_SNAP = 8;
function oceanGeo() {
    const n = 150, pos: number[] = [], idx: number[] = [];
    const warp = (u: number) => Math.sign(u) * Math.pow(Math.abs(u), 1.9) * OCEAN_HALF;
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) pos.push(warp(i / n * 2 - 1), 0, warp(j / n * 2 - 1));
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i, b = a + n + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g;
}
// Seabed with the real depth profile (shelf -> slope -> trench), shared with the swim floor in the sim.
function seabedGeo() {
    const nx = 110, nz = 150, x0 = -(HALF + 500), x1 = HALF + 500, z0 = WATER_Z + 1, z1 = SEA.zMin - 450, pos: number[] = [], idx: number[] = [];
    for (let j = 0; j <= nz; j++) { const tz = j / nz, z = z0 + (z1 - z0) * Math.pow(tz, 1.25); for (let i = 0; i <= nx; i++) { const x = x0 + (x1 - x0) * i / nx; pos.push(x, seabedAt(x, z), z); } }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + nx + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
const OCEAN_GEO = oceanGeo(), SEABED_GEO = seabedGeo();
function OceanFollow({ waterRef }: { waterRef: React.MutableRefObject<THREE.Mesh | null> }) {
    useFrame(({ camera }) => { const w = waterRef.current; if (!w) return; w.position.set(Math.round(camera.position.x / OCEAN_SNAP) * OCEAN_SNAP, WATER_Y, Math.round(camera.position.z / OCEAN_SNAP) * OCEAN_SNAP); });
    return null;
}
// Ocean screen-space copy (same technique as the park lake): a low-res colour+depth copy of the scene without the sea, taken only
// while the sea is on screen and near enough to matter; skipped when the frame budget is tight.
const _oceanBox = new THREE.Box3(new THREE.Vector3(-HALF - 700, SEABED - 45, SEA.zMin - 600), new THREE.Vector3(HALF + 700, WATER_Y + 4, WATER_Z + 2));
function OceanScreenSpace({ sim, waterRef, perf }: { sim: Sim; waterRef: React.MutableRefObject<THREE.Mesh | null>; perf: { scale: number } }) {
    const { gl, scene, camera } = useThree();
    const target = useMemo(() => { const t = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }); t.depthTexture = new THREE.DepthTexture(4, 4); t.depthTexture.type = THREE.UnsignedIntType; return t; }, []);
    const st = useMemo(() => ({ fr: new THREE.Frustum(), pv: new THREE.Matrix4(), buf: new THREE.Vector2(), n: 0, copies: 0 }), []);
    useEffect(() => () => target.dispose(), [target]);
    useFrame(() => {
        const u = waterMat.uniforms, cam = camera as THREE.PerspectiveCamera, w = waterRef.current;
        u.uProj.value.copy(cam.projectionMatrix); u.uNear.value = cam.near; u.uFar.value = cam.far; u.uSteps.value = QK.lakeSteps;
        st.pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); st.fr.setFromProjectionMatrix(st.pv);
        const near = cam.position.z < WATER_Z + 170 && cam.position.y > WATER_Y - 0.5 && cam.position.y < 140, scale = perf.scale;
        const ok = !!w && near && st.fr.intersectsBox(_oceanBox) && scale > 0.5 && !(UW as any).on;
        if (!ok) { u.uUseScene.value = 0; return; }
        st.n++;
        if (scale > 0.6 || st.n % 2 === 0 || st.copies === 0) {
            worldBufferSize(gl, st.buf);
            const W = Math.max(160, Math.round(st.buf.x * QK.lakeCopyScale)), H = Math.max(90, Math.round(st.buf.y * QK.lakeCopyScale));
            if (target.width !== W || target.height !== H) target.setSize(W, H);
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
// Enemies: heavily armoured robots, every sensor visor red (Polyfork free models, modified). 0 armoured trooper, 1 armoured walker, 2 hover drone, 3 armoured service drone.
const ENEMY_DEFS: any[] = [
    { model: 'robot', eye: EYE_RED, shell: [0.20, 0.21, 0.24], frame: [0.07, 0.07, 0.08], accent: [0.55, 0.07, 0.07], scale: 1.1, extras: armorRobot, dy: -0.85, spd: 5 },
    { model: 'companion', eye: EYE_RED, dark: [0.14, 0.14, 0.17], shell: [0.18, 0.18, 0.21], frame: [0.07, 0.07, 0.08], accent: [0.55, 0.07, 0.07], scale: 1.6, extras: armorCompanion, dy: -0.85, spd: 6 },
    { model: 'survey', eye: EYE_RED, shell: [0.20, 0.21, 0.24], frame: [0.07, 0.07, 0.08], accent: [0.55, 0.07, 0.07], scale: 1.7, extras: armorDrone, dy: 0.45, spd: 0 },
    { model: 'shadow', eye: EYE_RED, shell: [0.20, 0.21, 0.25], accent: [0.55, 0.07, 0.07], scale: 1.0, dy: 0, spd: 9 }];   // kind 3: Shadow-body heavy armoured robot (replaces the dome)
function buildEnemy(kind: number, time: { value: number }) {
    const d = ENEMY_DEFS[kind]; if (d.model === 'shadow') return { geo: shadowGeo({ shell: d.shell, accent: d.accent, eye: d.eye, heavy: true }), mat: shadowMat(time, d.spd) };
    const r = robotGeo(d); r.geo.translate(0, d.dy, 0);
    return { geo: r.geo, mat: robotMat(r.parts, r.scale, time, d.spd) };
}



// Plasma web shot: bright core wrapped in spinning web-strand rings, a huge impact shockwave
// (flash bubble + expanding ring + radial debris), and a small lock reticle over the auto-target.
// Everything is pooled (3 bolts, 4 blasts, 12 sparks each): zero per-frame allocation, additive only, no lights.
const _pz = new THREE.Vector3(0, 0, 1), _pv = new THREE.Vector3();
function PlasmaFx({ sim }: { sim: Sim }) {
    const { camera } = useThree();
    const proj = useRef<THREE.Group[]>([]);
    const blasts = useRef<{ g: THREE.Group; flash: THREE.Mesh; ring: THREE.Mesh; sparks: THREE.InstancedMesh; dir: Float32Array }[]>([]);
    const ret = useRef<THREE.Group>(null!);
    const o = useMemo(() => new THREE.Object3D(), []);
    useFrame(() => {
        for (let i = 0; i < 3; i++) {
            const g = proj.current[i]; if (!g) continue;
            const b = sim.plasma[i];
            g.visible = !!b;
            if (b) {
                g.position.set(b.x, b.y, b.z);
                _pv.set(b.vx, b.vy, b.vz).normalize();
                g.quaternion.setFromUnitVectors(_pz, _pv);
                (g.children[2] as THREE.Mesh).rotation.z = sim.t * 22;    // strand rings spin around the flight axis
                (g.children[3] as THREE.Mesh).rotation.z = -sim.t * 17;
                (g.children[4] as THREE.Mesh).rotation.z = sim.t * 27;
                const pu = 1 + Math.sin(sim.t * 31) * 0.12; g.children[0].scale.setScalar(pu);
            }
        }
        for (let i = 0; i < 6; i++) {
            const grp = blasts.current[i]; if (!grp) continue;
            const bl = sim.blasts[i], on = !!bl && bl.t < 0.85;
            grp.g.visible = !!on;
            if (on && bl) {
                const k = bl.t / 0.85;
                grp.g.position.set(bl.x, bl.y, bl.z);
                const fk = Math.min(1, bl.t / 0.2);
                grp.flash.scale.setScalar(0.5 + fk * bl.r * 0.55);
                (grp.flash.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.95 * (1 - bl.t / 0.28));
                grp.ring.quaternion.copy(camera.quaternion);
                grp.ring.scale.setScalar(0.6 + k * bl.r * 1.5);
                (grp.ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k) * (1 - k);
                for (let j = 0; j < 12; j++) {
                    const d = grp.dir, sp = (0.25 + k * bl.r * (0.75 + d[j * 4 + 3] * 0.5));
                    o.position.set(d[j * 4] * sp, d[j * 4 + 1] * sp + k * k * -3.5, d[j * 4 + 2] * sp);
                    o.scale.setScalar(Math.max(0.04, (1 - k) * 0.5));
                    o.rotation.set(sim.t * 9 + j, j * 1.7, 0); o.updateMatrix();
                    grp.sparks.setMatrixAt(j, o.matrix);
                }
                grp.sparks.instanceMatrix.needsUpdate = true;
            }
        }
        const e = sim.aimE;
        ret.current.visible = !!e && sim.mode === 'play';
        if (e) {
            ret.current.position.set(e.x, e.y + (e.boss ? BOSS_BODY_OFFSET : [0.8, 0.3, 1.05, 0.95][e.kind ?? 0]) + 1.05, e.z);
            ret.current.quaternion.copy(camera.quaternion);
            const s2 = 1 + Math.sin(sim.t * 6) * 0.09; ret.current.scale.setScalar(s2);
            ret.current.children[0].rotation.z = sim.t * 2.4;
        }
    });
    return <>
        {[0, 1, 2].map((i) => <group key={'p' + i} ref={(g) => { if (g) proj.current[i] = g; }} visible={false} frustumCulled={false}>
            <mesh frustumCulled={false}><sphereGeometry args={[0.3, 10, 8]} /><meshBasicMaterial color="#e8fdff" toneMapped={false} transparent opacity={0.5} blending={THREE.NoBlending} /></mesh>
            <mesh frustumCulled={false}><sphereGeometry args={[0.78, 10, 8]} /><meshBasicMaterial color="#5fd8ff" transparent opacity={0.38} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>
            {[0.42, 0.58, 0.5].map((r, j) => <mesh key={j} frustumCulled={false} position={[0, 0, (j - 1) * 0.55]}><torusGeometry args={[r, 0.035, 5, 14]} /><meshBasicMaterial color="#f4f8ff" transparent opacity={0.9} depthWrite={false} /></mesh>)}
        </group>)}
        {[0, 1, 2, 3, 4, 5].map((i) => <group key={'b' + i} ref={(g) => {
            if (g && !blasts.current[i]) {
                const flash = g.children[0] as THREE.Mesh, ring = g.children[1] as THREE.Mesh, sparks = g.children[2] as THREE.InstancedMesh;
                const dir = new Float32Array(12 * 4);
                for (let j = 0; j < 12; j++) { const a = (j / 12) * Math.PI * 2 + (j % 3) * 0.4, y = 0.15 + ((j * 7) % 5) * 0.16, l = Math.hypot(Math.cos(a), y, Math.sin(a)); dir[j * 4] = Math.cos(a) / l; dir[j * 4 + 1] = y / l; dir[j * 4 + 2] = Math.sin(a) / l; dir[j * 4 + 3] = ((j * 13) % 10) / 10; }
                blasts.current[i] = { g, flash, ring, sparks, dir };
            }
        }} visible={false}>
            <mesh frustumCulled={false}><sphereGeometry args={[1, 14, 10]} /><meshBasicMaterial color="#cfeeff" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>
            <mesh frustumCulled={false}><ringGeometry args={[0.82, 1, 40]} /><meshBasicMaterial color="#bfe9ff" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} /></mesh>
            <instancedMesh args={[undefined, undefined, 12]} frustumCulled={false}><coneGeometry args={[0.16, 0.6, 4]} /><meshBasicMaterial color="#ffd9a8" transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></instancedMesh>
        </group>)}
        <group ref={ret} visible={false} frustumCulled={false}>
            <mesh frustumCulled={false}><ringGeometry args={[0.5, 0.58, 4, 1]} /><meshBasicMaterial color="#8fe9ff" transparent opacity={0.85} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} /></mesh>
            <mesh frustumCulled={false}><circleGeometry args={[0.07, 8]} /><meshBasicMaterial color="#dffbff" transparent opacity={0.9} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} /></mesh>
        </group>
    </>;
}

// Enemy KO fire: a small, pooled world-space burst (hot core, tapered flame tongues,
// an expanding ground ring, and embers). It observes the existing down transition only.
const DEATH_FX_SLOTS = 6, DEATH_FX_FLAMES = 9, DEATH_FX_EMBERS = 12, DEATH_FX_LIFE = 1.05;
type DeathFxSlot = { x: number; y: number; z: number; born: number; active: boolean };
function EnemyDeathFx({ sim }: { sim: Sim }) {
    const slots = useRef<DeathFxSlot[]>(Array.from({ length: DEATH_FX_SLOTS }, () => ({ x: 0, y: 0, z: 0, born: -10, active: false })));
    const seenDown = useRef(new WeakMap<object, boolean>()), cursor = useRef(0), triggered = useRef(0);
    const core = useRef<THREE.InstancedMesh>(null!), flames = useRef<THREE.InstancedMesh>(null!), embers = useRef<THREE.InstancedMesh>(null!), rings = useRef<THREE.InstancedMesh>(null!);
    const assets = useMemo(() => ({
        coreGeo: new THREE.IcosahedronGeometry(0.62, 1), flameGeo: new THREE.ConeGeometry(0.24, 1.15, 5, 1), emberGeo: new THREE.ConeGeometry(0.055, 0.34, 4, 1), ringGeo: new THREE.TorusGeometry(0.62, 0.055, 5, 24),
        coreMat: new THREE.MeshStandardMaterial({ color: '#ff8a16', emissive: '#ff3c00', emissiveIntensity: 2.4, roughness: 0.85, metalness: 0, toneMapped: false }),
        flameMat: new THREE.MeshStandardMaterial({ color: '#ff7412', emissive: '#ff3b00', emissiveIntensity: 2.2, roughness: 0.8, metalness: 0, toneMapped: false }),
        emberMat: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
        ringMat: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    }), []);
    const obj = useMemo(() => new THREE.Object3D(), []), up = useMemo(() => new THREE.Vector3(0, 1, 0), []), dir = useMemo(() => new THREE.Vector3(), []), col = useMemo(() => new THREE.Color(), []);
    useFrame(() => {
        for (const e of sim.enemies) {
            const down = e.down > 0, wasDown = seenDown.current.get(e) || false;
            if (down && !wasDown) {
                const slot = slots.current[cursor.current++ % DEATH_FX_SLOTS], lift = (e as any).ly || 0;
                slot.x = e.x; slot.y = e.y + lift + enemyBodyOffset(e); slot.z = e.z; slot.born = sim.t; slot.active = true; triggered.current++;
            }
            seenDown.current.set(e, down);
        }
        let active = 0;
        for (let i = 0; i < DEATH_FX_SLOTS; i++) {
            const s = slots.current[i], age = sim.t - s.born, on = s.active && age >= 0 && age < DEATH_FX_LIFE;
            if (s.active && !on) s.active = false; if (on) active++;
            const t = on ? age / DEATH_FX_LIFE : 1, fade = Math.max(0, 1 - t), swell = Math.sin(Math.min(1, t * 1.7) * Math.PI * 0.5);
            obj.position.set(s.x, s.y, s.z); obj.rotation.set(t * 1.4, sim.t * 2.2 + i, t * 0.8);
            const coreScale = on ? (0.28 + 1.05 * swell) * Math.pow(fade, 0.72) : 0;
            obj.scale.setScalar(coreScale); obj.updateMatrix(); core.current.setMatrixAt(i, obj.matrix); core.current.setColorAt(i, col.setHSL(0.075 + t * 0.035, 1, 0.54 + fade * 0.12));
            obj.position.set(s.x, s.y - 0.72, s.z); obj.rotation.set(-Math.PI / 2, 0, 0); obj.scale.setScalar(on ? 0.18 + t * 1.6 : 0); obj.updateMatrix(); rings.current.setMatrixAt(i, obj.matrix); rings.current.setColorAt(i, col.setRGB(fade, fade * 0.34, fade * 0.035));
            for (let j = 0; j < DEATH_FX_FLAMES; j++) {
                const idx = i * DEATH_FX_FLAMES + j, a = j * 2.39996 + i * 0.53, lift = 0.42 + ((j * 7) % 5) * 0.12;
                dir.set(Math.cos(a) * 0.72, lift, Math.sin(a) * 0.72).normalize();
                const wobble = on ? Math.sin(sim.t * 17 + j * 2.1 + i) * 0.07 : 0, spread = on ? 0.28 + 1.1 * t : 0;
                obj.position.set(s.x + dir.x * spread, s.y + dir.y * (0.18 + 0.62 * t) + wobble, s.z + dir.z * spread);
                obj.quaternion.setFromUnitVectors(up, dir); obj.rotation.y += sim.t * 0.35 + j;
                const flicker = 0.78 + 0.22 * Math.sin(sim.t * 24 + j * 3.7 + i), flameFade = on ? fade * flicker : 0;
                obj.scale.set(0.62 * flameFade, (1.25 + 0.25 * swell) * flameFade, 0.62 * flameFade); obj.updateMatrix(); flames.current.setMatrixAt(idx, obj.matrix);
                flames.current.setColorAt(idx, col.setHSL((j % 3 === 0 ? 0.13 : 0.075) + 0.025 * t, 1, 0.48 + 0.12 * fade));
            }
            for (let j = 0; j < DEATH_FX_EMBERS; j++) {
                const idx = i * DEATH_FX_EMBERS + j, a = j * 2.39996 + i * 0.31, elev = 0.25 + ((j * 7) % 9) * 0.075, speed = 1.5 + ((j * 5) % 7) * 0.27;
                const vx = Math.cos(a) * Math.cos(elev) * speed, vz = Math.sin(a) * Math.cos(elev) * speed, vy = (0.65 + Math.sin(elev)) * speed;
                obj.position.set(s.x + vx * age, s.y + vy * age - 1.2 * age * age, s.z + vz * age); dir.set(vx, vy - 2.4 * age, vz).normalize();
                obj.quaternion.setFromUnitVectors(up, dir); const emberFade = on ? fade * (0.82 + 0.18 * Math.sin(sim.t * 31 + j)) : 0;
                obj.scale.set(emberFade, emberFade, emberFade); obj.updateMatrix(); embers.current.setMatrixAt(idx, obj.matrix); embers.current.setColorAt(idx, col.setRGB(emberFade, emberFade * 0.58, emberFade * 0.16));
            }
        }
        for (const m of [core.current, flames.current, embers.current, rings.current]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
        if (DBG && core.current) { core.current.userData.activeEffects = active; core.current.userData.triggeredTotal = triggered.current; }
    });
    const bloom = (o: THREE.Object3D) => o.layers.enable(SELECTIVE_BLOOM_LAYER);
    return <>
        <instancedMesh ref={core} name="enemy-death-core" onUpdate={bloom} args={[assets.coreGeo, assets.coreMat, DEATH_FX_SLOTS]} frustumCulled={false} />
        <instancedMesh ref={flames} name="enemy-death-flames" onUpdate={bloom} args={[assets.flameGeo, assets.flameMat, DEATH_FX_SLOTS * DEATH_FX_FLAMES]} frustumCulled={false} />
        <instancedMesh ref={embers} name="enemy-death-embers" onUpdate={bloom} args={[assets.emberGeo, assets.emberMat, DEATH_FX_SLOTS * DEATH_FX_EMBERS]} frustumCulled={false} />
        <instancedMesh ref={rings} name="enemy-death-ring" onUpdate={bloom} args={[assets.ringGeo, assets.ringMat, DEATH_FX_SLOTS]} frustumCulled={false} />
    </>;
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
    const stripe = useMemo(() => new THREE.MeshBasicMaterial({ color: '#5ff2ff', transparent: true, opacity: 0.5, blending: THREE.NoBlending }), []);
    const gold = useMemo(() => new THREE.MeshLambertMaterial({ color: '#f2c038' }), []);
    const dark = useMemo(() => new THREE.MeshLambertMaterial({ color: '#232a4a' }), []);
    const red = useMemo(() => new THREE.MeshLambertMaterial({ color: '#d9344f', side: THREE.DoubleSide }), []);
    const bv = useMemo(() => new THREE.Vector3(), []);
    const bv2 = useMemo(() => new THREE.Vector3(), []);
    const waterRef = useRef<THREE.Mesh>(null!), ringRef = useRef<THREE.Mesh>(null!);
    const wakeRef = useRef<THREE.Mesh>(null!); const ringFlow = useRef(0);
    const wakeTrail = useRef<{x:number,z:number,t:number}[]>([]); const wakeStrength = useRef(0); const wakeBorn = useRef(0);
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
    useEffect(() => registerHero(rig.root), [rig]);   // Shadow joins the hero HD pass
    const clipSt = useRef(createHeroClipState()), poseSt = useRef(createCombatPoseState());
    const lastWall = useRef<{ n: number[]; b: number } | null>(null), wallCorr = useRef(0), groundCorr = useRef(0), groundMin = useRef({ key: '', v: 1e9 }), tp0 = useMemo(() => new THREE.Vector3(), []);
    const enemyTime = useRef({ value: 0 });
    const enemySet = useMemo(() => [0, 1, 2, 3].map((k) => buildEnemy(k, enemyTime.current)), []);
    const enMeshes = useRef<THREE.InstancedMesh[]>([]);
    const ecol = useMemo(() => new THREE.Color(), []);
    const beaconRef = useRef<THREE.Mesh>(null!);
    const eye = useMemo(() => new THREE.MeshBasicMaterial({ color: '#8ffcff', side: THREE.DoubleSide, transparent: true, opacity: 0.5, blending: THREE.NoBlending }), []);
    const visor = useMemo(() => new THREE.MeshBasicMaterial({ color: '#0b0c18' }), []);

    useFrame((state, rawDt) => {
        const dt = Math.min(0.05, rawDt) * (DBG && (window as any).__ts != null ? (window as any).__ts : 1);   // test hook: frame-exact stills
        sim.t += dt;
        // adaptive resolution (device-friendly)
        const rd = Math.min(0.25, rawDt); ema.current += (rd * 1000 - ema.current) * 0.05; perf.fps = 1000 / ema.current; adapt.current += rd;
        { const want = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : QK.dprCap) * curScale.current; applyRatio(gl, want); }   // world ratio unchanged; the canvas runs at native for the hero HD pass
        if (adapt.current > 0.8) {
            adapt.current = 0; let ns = curScale.current;
            if (ema.current > 24 && ns > 0.45) ns -= 0.1; else if (ema.current > 16 && ns > 1) ns = Math.max(1, ns - 0.05); else if (ema.current < 12.5 && ns >= 1 && ns < QK.maxScale && (coarse || HQ)) ns += 0.05; else if (ema.current < 18 && ns < 1) ns += 0.05;   // supersample tier: touch devices or ?q=high desktops running well under budget (<12.5 ms), reversible by the same >24 ms downshift
            if (DBG && (window as any).__perfPin) ns = (window as any).__perfPin;   // screenshot harness only: hold the scaler so a software renderer does not drop tiers
            if (Math.abs(ns - curScale.current) > 0.01) { curScale.current = ns; perf.scale = ns; applyRatio(gl, Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : QK.dprCap) * ns); }
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
        const wsh = 0, wnx = sim.wall ? -sim.wall[1] : 0, wnz = sim.wall ? sim.wall[0] : 0; // Manual orbit has no forced wall-side offset
        const tx = p[0] - fxd * dist + wnx * wsh, ty = p[1] + (sim.swim ? 0.7 : 1.5) + sy * dist, tz = p[2] - fzd * dist + wnz * wsh;
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

        }
        { // Orbit obstruction shortens the arm; it does not change the selected angles.
            const q=cam.current,ax=p[0],ay=p[1]+(sim.swim?.7:1.5),az=p[2];
            const dx=q.x-ax,dy=q.y-ay,dz=q.z-az;let safe=1;
            // Segment-vs-building slabs catch walls even when the endpoint is outside.
            for(const b of buildings){let lo=0,hi=safe;const origin=[ax,ay,az],delta=[dx,dy,dz],mn=[b.x0-.35,-1000,b.z0-.35],mx=[b.x1+.35,b.h+.35,b.z1+.35];let hit=true;
                for(let k=0;k<3;k++){if(Math.abs(delta[k])<1e-7){if(origin[k]<mn[k]||origin[k]>mx[k]){hit=false;break;}}else{let a=(mn[k]-origin[k])/delta[k],c=(mx[k]-origin[k])/delta[k];if(a>c){const t=a;a=c;c=t;}lo=Math.max(lo,a);hi=Math.min(hi,c);if(lo>hi){hit=false;break;}}}
                if(hit&&lo>0)safe=Math.max(0,lo-.025);
            }
            for(let i=1;i<=32;i++){const f=safe*i/32,x=ax+dx*f,y=ay+dy*f,z=az+dz*f;const floor=z<WATER_Z?seabedAt(x,z):Math.min(0,parkH(x,z));if(y<floor+.35){safe=safe*(i-1)/32;break;}}
            if(safe<1)q.set(ax+dx*safe,ay+dy*safe,az+dz*safe);
        }
        camera.position.copy(cam.current); { const shk = (sim as any).shake || 0; if (shk > 0.001) { const a = shk * shk * 2.2, tt = sim.t * 61; camera.position.x += Math.sin(tt * 1.3) * a; camera.position.y += Math.sin(tt * 1.9 + 1.7) * a * 0.8; camera.position.z += Math.sin(tt * 1.1 + 4.1) * a; } } if (DBG) (window as any).__cam = [cam.current.x, cam.current.y, cam.current.z, dist];
        look.current.set(p[0], sim.swim ? p[1] + 0.7 : p[1] + 1.5, p[2]);
        const ov = DBG ? (window as any).__camOv : null; if (ov) { camera.position.set(ov[0], ov[1], ov[2]); look.current.set(ov[3], ov[4], ov[5]); }
        camera.lookAt(look.current);
        const cp = camera as THREE.PerspectiveCamera;
        // Near-clip-aware waterline: retain the nearby underside instead of cutting a hole through it.
        // Restore the ordinary land frustum away from the bay surface to preserve depth precision.
        const nearWater = (camera.position.z < WATER_Z + 2 && Math.abs(camera.position.y - WATER_Y) < 1.5) || (isLakeWater(camera.position.x, camera.position.z) && Math.abs(camera.position.y - waterSurfaceAt(camera.position.x, camera.position.z, sim.t)) < 1.5);
        const nearTarget = nearWater ? 0.05 : 0.5;
        if (cp.near !== nearTarget) { cp.near = nearTarget; cp.updateProjectionMatrix(); }
        const targetFov = 62 + Math.min(14, speed * 0.25) + fx.fov;
        if (Math.abs(cp.fov - targetFov) > 0.05) { cp.fov += (targetFov - cp.fov) * Math.min(1, dt * 6); cp.updateProjectionMatrix(); }
        {   // water: animate, and split view (waterline across the screen when the camera is at the surface)
            waterMat.uniforms.uTime.value = sim.t; seabedMat.uniforms.uTime.value = sim.t; wallMat.uniforms.uTime.value = sim.t;
            const uw = document.getElementById('uw');
            const inBay = camera.position.z < WATER_Z + 2, inLake = isLakeWater(camera.position.x, camera.position.z), inWater = inBay || inLake;
            const surfaceY = inLake ? waterSurfaceAt(camera.position.x, camera.position.z, sim.t) : waterRenderY(camera.position.x, camera.position.z, sim.t); const dy = camera.position.y - surfaceY; const under = inWater && dy < 0;   // env-iter3: ocean uses the real swell height (was the flat sea level, so troughs read as underwater)
            // Shifat Oct 29 "use underwater fogs inside ocean": these statements had slipped into the comment above, so the underwater
            // state never switched on. Now: underwater background + a scene fog that thickens with depth (deeper = darker, shorter view).
            UW.on = under; if (under) (state.scene.background as THREE.Color).copy(UWF.value); if (DBG) (window as any).__scene = state.scene;
            if (!(state.scene.fog instanceof THREE.FogExp2)) state.scene.fog = new THREE.FogExp2(UWF.value.getHex(), 0);   // kept for the whole session (density 0 above water) so entering water causes no shader recompiles
            { const fg = state.scene.fog as THREE.FogExp2; if (under) { const deep = Math.min(1, Math.max(0, -dy / 30)); fg.color.copy(UWF.value).multiplyScalar(1 - 0.55 * deep); fg.density = 0.035 + 0.04 * deep; (state.scene.background as THREE.Color).copy(fg.color); } else fg.density = 0; }
            if (uw) {
                if (inWater && dy < 1.2 && dy > -2.2) {
                    // project the waterline a little ahead of the camera to find where the surface cuts the screen
                    camera.getWorldDirection(_wd); const hx = _wd.x, hz = _wd.z, hl = Math.hypot(hx, hz) || 1;
                    const ax = camera.position.x + hx / hl * 11, az = camera.position.z + hz / hl * 11; _wp.set(ax, waterRenderY(ax, az, sim.t), az).project(camera);
                    const yPct = Math.max(0, Math.min(100, (1 - (_wp.y * 0.5 + 0.5)) * 100));
                    { const mk = `linear-gradient(180deg, transparent ${Math.max(0, yPct - 3)}%, #000 ${Math.min(100, yPct + 7)}%)`; uw.style.maskImage = mk; (uw.style as any).webkitMaskImage = mk; } uw.style.opacity = '1'; uw.dataset.split = '1';   // waterline tint edge fades over about 10% of the screen instead of a hard clip
                } else { uw.style.maskImage = 'none'; (uw.style as any).webkitMaskImage = 'none'; uw.style.opacity = under ? '1' : '0'; uw.dataset.split = '0'; }
            }
        }
        // hero
        const h = hero.current;
        const wl = !!sim.wall;
        { const sg = splashRef.current, st2 = splashSt.current; if (sg) { if (sim.swim && !st2.prev && p[1] > waterSurfaceAt(p[0], p[2], sim.t) - 2.0) st2.t0 = sim.t; st2.prev = sim.swim; const age = sim.t - st2.t0, on = age >= 0 && age < 0.8; sg.visible = on; if (on) { const wy = waterRenderY(p[0], p[2], sim.t), k = age / 0.8, rise = Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.5); sg.position.set(p[0], wy, p[2]); sg.children.forEach((c, i) => { const m = c as THREE.Mesh, a2 = (i / 9) * 6.283, tilt = 0.25 + 0.2 * ((i * 7) % 3), h = (0.9 + 0.5 * ((i * 5) % 4) / 3) * rise * (1 - 0.35 * k); m.position.set(Math.cos(a2) * 0.35 * (1 + k), h * 0.5, Math.sin(a2) * 0.35 * (1 + k)); m.rotation.set(Math.sin(a2) * tilt, 0, -Math.cos(a2) * tilt); m.scale.set(1 - 0.5 * k, Math.max(0.01, h), 1 - 0.5 * k); (m.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - k * k); }); } } }   // entry splash: crown of white shards on water entry (ref: stylized splash, spiky white crown over a foam skirt)
        { // original curved two-arm wake: short position history keeps the trail behind a turning swimmer
            const m = wakeRef.current, sp = Math.hypot(v[0],v[2]), surfaceY = waterSurfaceAt(p[0],p[2],sim.t), surface = sim.swim && !sim.dive && p[1] > surfaceY - 1.1;
            const target = surface && sp>0.6 ? Math.min(0.58,sp*0.10) : 0;
            wakeStrength.current += (target-wakeStrength.current)*Math.min(1,dt*(target>0?6:3));
            const trail = wakeTrail.current;
            if(!surface || trail.length && Math.hypot(p[0]-trail[0].x,p[2]-trail[0].z)>12) trail.length=0;
            if(surface && (!trail.length || sim.t-trail[0].t>0.07)){
                // A hard reversal must start a new ribbon rather than join opposing arms across a cusp.
                if(trail.length>3){const a=trail[0],b=trail[3],ox=a.x-b.x,oz=a.z-b.z,ol=Math.hypot(ox,oz);if(ol>0.15&&sp>1.0&&(v[0]*ox+v[2]*oz)/(sp*ol)<0.20){trail.length=0;wakeStrength.current*=0.35;}}
                if(!trail.length)wakeBorn.current=sim.t;trail.unshift({x:p[0],z:p[2],t:sim.t});if(trail.length>28)trail.pop();}
            if(m){m.visible=surface && wakeStrength.current>0.015 && trail.length>2;if(m.visible){const pa=wakeGeo.attributes.position as THREE.BufferAttribute;
                for(let side=0;side<2;side++)for(let j=0;j<=24;j++){const t=j/24,sgn=side?1:-1,fi=t*(trail.length-1),ii=Math.floor(fi),ff=fi-ii,a=trail[ii],b=trail[Math.min(ii+1,trail.length-1)],prev=trail[Math.max(0,ii-1)],next=trail[Math.min(trail.length-1,ii+1)];
                    let dx=prev.x-next.x,dz=prev.z-next.z;const ln=Math.hypot(dx,dz);if(ln>0.02){dx/=ln;dz/=ln;}else{dx=Math.sin(sim.ang);dz=Math.cos(sim.ang);}
                    const cx=a.x+(b.x-a.x)*ff-dx*0.8,cz=a.z+(b.z-a.z)*ff-dz*0.8,spread=0.55+t*1.7,width=0.06+t*0.16;
                    for(let k=0;k<2;k++){const off=sgn*(spread+(k?width:-width)),x=cx-dz*off,z=cz+dx*off;pa.setXYZ(side*50+j*2+k,x,waterRenderY(x,z,sim.t)+0.055,z);}}
                pa.needsUpdate=true;wakeMat.uniforms.uA.value=wakeStrength.current*THREE.MathUtils.smoothstep(sim.t-wakeBorn.current,0.1,0.65);}}
        }
        { const sp=Math.hypot(v[0],v[2]); ringFlow.current+=(THREE.MathUtils.smoothstep(sp,0.5,3.5)-ringFlow.current)*Math.min(1,dt*4); const rg = ringRef.current as unknown as THREE.Group; if (rg) { const surfaceY=waterSurfaceAt(p[0],p[2],sim.t), on = sim.swim && p[1] > surfaceY - 1.6; rg.visible = on; if (on) { const wy = waterRenderY(p[0], p[2], sim.t); rg.position.set(p[0] - Math.sin(sim.ang) * 0.9, wy + 0.04, p[2] - Math.cos(sim.ang) * 0.9); rg.children.forEach((c, i) => { const ph = (sim.t * 0.7 + i / 3) % 1, m = c as THREE.Mesh; m.scale.setScalar(1.0 + ph * 5.5); (m.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - 0.70 * ringFlow.current) * (1 - ph) * (1 - ph); }); } } }   // waterline cue: expanding foam ring where the body cuts the surface
        const sa0 = sim as any;
        const rootPose = applyHeroRootPose(sim, rig, dt, sa0, p, HERO_SC);
        const lean = rootPose.lean, shadowBody = rig.poseRoot.children[0] as THREE.Object3D;
        const shadowAnimation = animateHeroBones(sim, rig, dt, { clipState: clipSt.current, poseState: poseSt.current, glideBlend: rootPose.glideBlend, publishState: true });
        if (DBG) { (window as any).__shadowAnimation = shadowAnimation; (window as any).__shadowSwimOrientation = { wrapperPitch: rig.poseRoot.rotation.x, bodyPitch: shadowBody.rotation.x, rootYaw: h.rotation.y, simYaw: sim.ang, lean, clipWeight: clipSt.current.w }; }
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
                const wg = gm.v > 1e8 ? groundCorr.current : Math.max(-0.4, Math.min(0.4, 0.02 + (sim.pos[1] - 1.0) - gm.v));
                if (fresh && !gBd) groundCorr.current = wg; else groundCorr.current += (wg - groundCorr.current) * Math.min(1, dt * 8);
            }
            if (DBG && (window as any).__dbgGround) (window as any).__gc = { mn, corr: groundCorr.current };
        } else { groundMin.current.key = ''; groundCorr.current += (0 - groundCorr.current) * Math.min(1, dt * 10); }
        h.position.y += groundCorr.current;
        if (!sim.swim && sim.ground && !wl) {   // Guard the skinned contact hull (including hands/feet) against the actual street, valley or rooftop support. Raise only.
            h.updateMatrixWorld(true);
            let mn2 = 1e9;
            for (const e of rig.hull) { tp0.set(0, 0, 0); for (let k = 0; k < 4; k++) { if (e.bw[k] <= 0) continue; _wv2.copy(e.p).applyMatrix4(rig.skel.boneInverses[e.bi[k]]).applyMatrix4(rig.skel.bones[e.bi[k]].matrixWorld); tp0.addScaledVector(_wv2, e.bw[k]); } if (tp0.y < mn2) mn2 = tp0.y; }
            { const gr = sim.pos[1] - 1.0; if (mn2 < gr + 0.02) h.position.y += gr + 0.02 - mn2; }
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
        { const gp = DBG ? (window as any).__game : null; if (gp && gp.probe) { h.updateMatrixWorld(true); const m = rig.poseRoot.children[0] as THREE.SkinnedMesh; m.skeleton.update(); const pa = m.geometry.attributes.position, si = m.geometry.attributes.skinIndex, swt = m.geometry.attributes.skinWeight, hv = new THREE.Vector3(); const grp = (n: string) => /^head|^neck/.test(n) ? 'head' : /^hand/.test(n) ? 'hands' : /^foot/.test(n) ? 'feet' : 'body'; const parts: Record<string, number[]> = {}; for (let i = 0; i < pa.count; i++) { let bi = si.getX(i), bw = swt.getX(i); for (let k = 1; k < 4; k++) { const w2 = swt.getComponent(i, k); if (w2 > bw) { bw = w2; bi = si.getComponent(i, k); } } const gname = grp(m.skeleton.bones[bi].name); const P = parts[gname] || (parts[gname] = [1e9, -1e9, 1e9, -1e9]); m.getVertexPosition(i, hv); hv.applyMatrix4(m.matrixWorld); P[0] = Math.min(P[0], hv.x); P[1] = Math.max(P[1], hv.x); P[2] = Math.min(P[2], hv.z); P[3] = Math.max(P[3], hv.z); } gp.parts = parts; } }
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
        if ((sim as any).snareT > SNARE.IMPACT || (sim as any).cWeb) { const sa = sim as any; if (!sa.handW) sa.handW = [[0, 0, 0], [0, 0, 0]]; h.updateMatrixWorld(true); [rig.b.handL, rig.b.handR].forEach((b: any, i: number) => { b.getWorldPosition(_hp); sa.handW[i][0] = _hp.x; sa.handW[i][1] = _hp.y; sa.handW[i][2] = _hp.z; }); }
        // web
        { // two web lines, each from an actual animated hand (world position), shot out to the anchor over ~0.14 s
            const wl2 = web.current, wr2 = webB.current, side = sim.swings % 2; // swing: alternate hands (odd = right); spring-shot jump and web-shot attack: both hands together
            const mode = sim.spring > 0 ? 1 : sim.web ? 0 : -1;   // shot: the plasma bolt is the visual now (was mode 2 hand-to-target cylinders)
            const both = mode > 0;
            wl2.visible = mode >= 0 && (both || side === 0); wr2.visible = mode >= 0 && (both || side === 1);
            if (mode >= 0) {
                rig.root.updateWorldMatrix(true, true);
                const tgt = sim.anchor;
                const grow = mode === 1 ? Math.max(0.05, sim.spring / 0.4) : Math.min(1, Math.max(0.05, sim.webT / 0.14));
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
            enemyTime.current.value = sim.t; const n = sim.enemies.length, cnt = [0, 0, 0, 0];
            for (let i = 0; i < n; i++) {
                const e = sim.enemies[i]; if (e.boss) continue; const k = e.kind || 0, m = enMeshes.current[k]; if (!m) continue;
                const fall = e.down > 0 ? Math.min(1, (3 - e.down) * 5) : 0, bob = k >= 2 ? Math.sin(sim.t * 2.5 + i) * 0.12 : 0;
                const ea = e as any, ly = ea.ly || 0, lean = e.down > 0 ? 0 : Math.min(1, e.hit / 0.35) * (ea.hitDir >= 3 ? 0.55 : 0.32), tum = ly > 0.05 ? Math.sin(Math.min(1, ly / 3) * 1.57) * (ea.slam ? -1.1 : 0.9) : 0;
                tmp.position.set(e.x, e.y + 0.06 - fall * 0.6 + bob + ly, e.z); tmp.rotation.set(fall * -1.4 - lean - tum, e.ang, 0); { const bi = e.born === undefined ? 1 : Math.min(1, Math.max(0, (sim.t - e.born) / 0.6)), fo = e.down > 0 ? Math.min(1, e.down / 0.5) : 1, sc = (e.kind === 3 ? BOT_SC : 1.25) * Math.max(0.001, bi * bi * (3 - 2 * bi)) * Math.max(0.001, fo); tmp.scale.set(sc, sc, sc); }   // new or re-placed enemies grow in, KO'd ones shrink out, so nothing pops
                tmp.updateMatrix();
                m.setMatrixAt(cnt[k], tmp.matrix);
                if (e.hit > 0) ecol.setRGB(2.6, 2.6, 2.6); else if (e.atk > 0) ecol.setRGB(1.8, 0.5 + Math.sin(sim.t * 30) * 0.2, 0.4); else ecol.setRGB(1, 1, 1);
                m.setColorAt(cnt[k], ecol); cnt[k]++;
            }
            for (let k = 0; k < 4; k++) { const m = enMeshes.current[k]; if (!m) continue; m.count = cnt[k]; syncInk(m); m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
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
        <mesh ref={beaconRef} onUpdate={(o) => o.layers.enable(SELECTIVE_BLOOM_LAYER)} frustumCulled={false}><cylinderGeometry args={[4, 4, 90, 12, 1, true]} /><meshBasicMaterial color="#5ff2ff" transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} fog={false} /></mesh>
        <color attach="background" args={[FOG[0], FOG[1], FOG[2]]} />
        <hemisphereLight name="hemi" args={['#d4e4ff', '#8a9a6a', 1.25]} />
        <directionalLight name="sun1" position={[-30, 60, 20]} intensity={1.8} color="#ffdcae" />
        <directionalLight name="sun2" position={[20, 30, -40]} intensity={0.8} color="#a8caff" />
        <DayNight />
        {OUTLINE_STATE.on ? <OutlinePass /> : <FxaaPass enabled={AA_FXAA} />}
        <SelectiveBloomPass />
        {OUTLINE_STATE.on && HD.enabled ? <HeroHDPass /> : null}
        <Sky />
        <City /><TenementBlock />
        <ParkGround />
        <React.Suspense fallback={null}>
            <PolyforkBuildings />
            <PolyforkLakeBridge sim={sim} perf={perf} tod={TOD} />
        </React.Suspense>
        <FlyingCars sim={sim} />
        {/* Rebuild park and city trees with authored forms and foliage; never overlay Polyfork tree canopies. */}
        <Forest sim={sim} renderGround={false} />
        <Meadow sim={sim} /><WindLines sim={sim} /><Civilians sim={sim} /><SnareLines sim={sim} /><Underwater sim={sim} /><PlasmaFx sim={sim} /><EnemyDeathFx sim={sim} /><EnemyShotsFx sim={sim} />
        <primitive object={rig.root} ref={hero} />
        <BossArenaMarker />
        <GiantBoss sim={sim} />
        <mesh ref={web} visible={false}><cylinderGeometry args={[0.035, 0.035, 1, 5]} /><meshBasicMaterial color="#f4f4ff" /></mesh>
        <mesh ref={webB} visible={false}><cylinderGeometry args={[0.035, 0.035, 1, 5]} /><meshBasicMaterial color="#f4f4ff" /></mesh>
        <mesh ref={arrow}><coneGeometry args={[0.35, 1.1, 8]} /><meshBasicMaterial color="#ffd54a" /></mesh>
        <mesh ref={wakeRef} geometry={wakeGeo} material={wakeMat} visible={false} frustumCulled={false} />
        <group ref={splashRef} visible={false}>{[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => <mesh key={i} frustumCulled={false}><coneGeometry args={[0.13, 1, 5]} /><meshBasicMaterial color="#f4fdff" transparent opacity={0.9} depthWrite={false} /></mesh>)}</group>
        <group ref={ringRef as any} visible={false}>{[0, 1, 2].map((i) => <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false}><ringGeometry args={[1.0, 1.09, 48]} /><meshBasicMaterial color="#eefbff" transparent opacity={0.4} depthWrite={false} /></mesh>)}</group>
        <mesh position={[0, WATER_Y, WATER_Z - 400]} ref={waterRef} material={waterMat} frustumCulled={false} geometry={OCEAN_GEO} />
        <OceanFollow waterRef={waterRef} />
        <OceanScreenSpace sim={sim} waterRef={waterRef} perf={perf} />
        <mesh geometry={SEABED_GEO} frustumCulled={false}><primitive object={seabedMat} attach="material" /></mesh>
        <mesh position={[0, (SEABED) / 2, WATER_Z - 0.3]}><boxGeometry args={[2 * (HALF + 200), -SEABED, 0.6]} /><primitive object={wallMat} attach="material" /></mesh>
        {enemySet.map((p, k) => <instancedMesh key={k} ref={(r) => { if (r && enMeshes.current[k] !== r) { enMeshes.current[k] = r; attachInk(r); } }} args={[p.geo, p.mat, 48]} frustumCulled={false} />)}
        <instancedMesh ref={cores} onUpdate={(o) => o.layers.enable(SELECTIVE_BLOOM_LAYER)} args={[undefined, undefined, 18]} frustumCulled={false}><icosahedronGeometry args={[1.3, 1]} /><meshBasicMaterial color="#ffd23f" transparent opacity={0.5} blending={THREE.NoBlending} /></instancedMesh>
        <instancedMesh ref={glows} onUpdate={(o) => o.layers.enable(SELECTIVE_BLOOM_LAYER)} args={[undefined, undefined, 18]} frustumCulled={false}><sphereGeometry args={[3.0, 10, 8]} /><meshBasicMaterial color="#ffb347" transparent opacity={0.22} blending={THREE.AdditiveBlending} depthWrite={false} /></instancedMesh>
    </>;
}
export { gsap, resetSim };
