import React, { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import heroData from './hero.json';
import clipIdle from './clips/idle.json';
import clipJump from './clips/jump.json';
import clipWall from './clips/climbing_wall.json';
import clipPunch from './clips/punch.json';
import clipSwim from './clips/swimming.json';
import clipRun from './clips/run.json';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { world, buildings, WATER_Z, WATER_Y, SEABED, HALF, FOG, stepSim, stepBeacon, resetSim, input, type Sim, type Events } from './sim';

const CITY_VS = `attribute vec3 aCol;attribute float aSeed;
varying vec3 vPos;varying vec3 vNor;varying vec3 vCol;varying float vSeed;
void main(){vPos=position;vNor=normal;vCol=aCol;vSeed=aSeed;gl_Position=projectionMatrix*viewMatrix*vec4(position,1.0);}`;
const CITY_FS = `varying vec3 vPos;varying vec3 vNor;varying vec3 vCol;varying float vSeed;
uniform vec3 uFog;uniform float uTime;
void main(){
 vec3 n=normalize(vNor);
 vec3 L=normalize(vec3(-0.45,0.75,0.35));
 float d=max(dot(n,L),0.0);
 vec3 lit=vec3(0.5,0.4,0.5)+vec3(1.0,0.7,0.45)*d*0.85;
 vec3 col=vCol*lit;
 if(abs(n.y)<0.5&&vPos.y>0.01&&vSeed<1.5){
  float u=abs(n.x)>0.5?vPos.z:vPos.x;float v=vPos.y;
  vec2 c=vec2(u/2.4,v/3.4);vec2 f=fract(c);vec2 id=floor(c);
  vec2 fwd=fwidth(c);float fa=clamp(max(fwd.x,fwd.y)*1.5,0.0,0.5);
  float w=smoothstep(0.22-fa,0.22+fa+0.001,f.x)*(1.0-smoothstep(0.78-fa,0.78+fa+0.001,f.x))*smoothstep(0.26-fa,0.26+fa+0.001,f.y)*(1.0-smoothstep(0.74-fa,0.74+fa+0.001,f.y))*step(4.0,v);
  vec2 hh=fract((id+floor(vSeed*2048.0+0.5)/2048.0*41.0)*vec2(0.1031,0.1030));hh+=dot(hh,hh.yx+33.33);float h=fract((hh.x+hh.y)*hh.x);
  float on=step(0.52,h);
  float onA=mix(on,0.5,smoothstep(0.25,0.5,max(fwd.x,fwd.y)));
  vec3 wc=mix(vec3(0.16,0.22,0.32)*(0.6+0.8*f.y),vec3(1.0,0.8,0.42)*(0.75+0.5*h),onA);
  col*=0.82+0.18*step(0.12,f.y);col*=1.0-0.22*step(f.y,0.08)-0.12*step(f.x,0.06);
  col=mix(col,wc+vec3(0.12,0.1,0.2)*(1.0-onA)*d,w);
 }
 if(vSeed>1.5){col=vCol*1.25;}
 if(vPos.y<0.01){
  col=vec3(0.13,0.12,0.17);
  float fx=abs(mod(vPos.x,40.0)-20.0);float fz=abs(mod(vPos.z,40.0)-20.0);
  float dash=step(2.0,mod(vPos.z,4.0));float dash2=step(2.0,mod(vPos.x,4.0));
  col+=vec3(0.7,0.6,0.25)*(step(fx,0.2)*dash+step(fz,0.2)*dash2);
 }
 float q=length(vPos-cameraPosition)*0.0058;float fog=1.0-exp(-q*q*1.4);
 gl_FragColor=vec4(mix(col,uFog,clamp(fog,0.0,1.0)),1.0);
}`;
const SKY_VS = `varying vec3 vDir;void main(){vDir=normalize(position);gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.0);}`;
const SKY_FS = `varying vec3 vDir;uniform vec3 uHor;
void main(){
 float t=clamp(vDir.y*1.6,0.0,1.0);
 vec3 top=vec3(0.12,0.3,0.5);vec3 mid=vec3(0.72,0.36,0.42);
 vec3 c=mix(uHor,mid,smoothstep(0.0,0.25,t));c=mix(c,top,smoothstep(0.2,0.9,t));
 vec3 sun=normalize(vec3(-0.55,0.22,0.8));float g=max(dot(normalize(vDir),sun),0.0);
 c+=vec3(1.0,0.55,0.3)*(pow(g,24.0)*0.6+pow(g,220.0)*1.2);
 vec2 st=floor(vDir.xz/(abs(vDir.y)+0.2)*90.0);float r=fract(sin(dot(st,vec2(12.9898,78.233)))*43758.5);
 c+=vec3(1.0)*step(0.9965,r)*smoothstep(0.35,0.7,t)*0.8;
 gl_FragColor=vec4(c,1.0);
}`;

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
    const mat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: CITY_VS, fragmentShader: CITY_FS, uniforms: { uFog: { value: new THREE.Color(FOG[0], FOG[1], FOG[2]) }, uTime: { value: 0 } } }), []);
    return <mesh geometry={geo} material={mat} frustumCulled={false} />;
}

function Sky() {
    const ref = useRef<THREE.Mesh>(null!);
    const mat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, depthTest: false, uniforms: { uHor: { value: new THREE.Color(FOG[0], FOG[1], FOG[2]) } } }), []);
    useFrame(({ camera }) => { ref.current.position.copy(camera.position); });
    return <mesh ref={ref} material={mat} renderOrder={-10} frustumCulled={false}><sphereGeometry args={[400, 24, 12]} /></mesh>;
}

const tmp = new THREE.Object3D();
const Y = new THREE.Vector3(0, 1, 0);

export interface SceneProps { sim: Sim; ev: Events; coarse: boolean; fx: { fov: number; shake: number }; perf: { scale: number; fps: number; speed: number } }



function buildRig() {
    const d: any = heroData;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(d.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(d.col, 3));
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
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.SkinnedMesh(g, mat); mesh.frustumCulled = false;
    const root = new THREE.Group(); root.add(mesh); mesh.add(bones[0]);
    root.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));
    return { root, b: byName, bones, hipsY: byName.hips.position.y };
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
    uniforms: { uTime: { value: 0 }, uSun: { value: new THREE.Vector3(-0.55, 0.22, 0.8).normalize() }, uSky: { value: new THREE.Color('#e9908a') }, uDeep: { value: new THREE.Color('#06496b') }, uShallow: { value: new THREE.Color('#2fa8c4') } },
    vertexShader: WAVES + `uniform float uTime; varying vec3 vW; void main(){ vec3 p = position; vec4 w = modelMatrix * vec4(p, 1.0); float h = wh(w.xz, uTime); w.y += h; vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`.replace('vec3 p = position; vec4 w = modelMatrix * vec4(p, 1.0);', 'vec4 w = modelMatrix * vec4(position, 1.0);'),
    fragmentShader: WAVES + `uniform float uTime; uniform vec3 uSun, uSky, uDeep, uShallow; varying vec3 vW;
    void main(){
      vec2 g = wg(vW.xz, uTime) + vec2(sin(vW.x * 0.9 + uTime * 3.0), cos(vW.z * 0.8 + uTime * 2.4)) * 0.02;
      vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
      vec3 v = normalize(cameraPosition - vW);
      bool below = cameraPosition.y < vW.y;
      if (below) n = -n;
      float fr = 0.03 + 0.97 * pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 5.0);
      float depthMix = clamp(length(cameraPosition.xz - vW.xz) / 120.0, 0.0, 1.0);
      vec3 body = mix(uShallow, uDeep, depthMix * 0.7);
      vec3 col = mix(body, uSky, fr);
      vec3 r = reflect(-v, n);
      col += vec3(1.0, 0.85, 0.7) * pow(max(dot(r, uSun), 0.0), 220.0) * 1.6;
      float crest = smoothstep(0.62, 0.9, wh(vW.xz, uTime) + sin(vW.x * 0.7) * sin(vW.z * 0.6) * 0.08);
      col = mix(col, vec3(1.0), crest * 0.55);
      if (below) col = mix(uDeep, uShallow, 0.35 + 0.4 * pow(max(dot(-n, v), 0.0), 2.0));
      float haze = 1.0 - exp(-length(cameraPosition - vW) * 0.006);
      col = mix(col, uSky, haze * (below ? 0.0 : 0.75));
      gl_FragColor = vec4(col, below ? 0.55 : mix(0.82, 1.0, max(fr, haze)));
    }`,
});

function buildEnemyGeo(): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    const add = (g: THREE.BufferGeometry, col: [number, number, number], x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
        const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
        const gg = g.clone(); gg.applyMatrix4(m);
        const n = gg.attributes.position.count, a = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { a[i * 3] = col[0]; a[i * 3 + 1] = col[1]; a[i * 3 + 2] = col[2]; }
        gg.setAttribute('color', new THREE.BufferAttribute(a, 3)); gg.deleteAttribute('uv'); parts.push(gg);
    };
    const f = -0.85, suit: [number, number, number] = [0.42, 0.1, 0.16], dark: [number, number, number] = [0.09, 0.09, 0.14], mask: [number, number, number] = [0.92, 0.9, 0.95], eye: [number, number, number] = [3, 0.25, 0.3], sash: [number, number, number] = [0.95, 0.5, 0.15];
    for (const sx of [-1, 1]) {
        add(new THREE.CylinderGeometry(0.1, 0.075, 0.8, 6), dark, sx * 0.15, f + 0.45, 0);
        add(new THREE.BoxGeometry(0.2, 0.12, 0.34), [0.05, 0.05, 0.08], sx * 0.15, f + 0.06, 0.05);
        add(new THREE.CylinderGeometry(0.075, 0.06, 0.7, 6), suit, sx * 0.4, f + 1.2, 0, 0, 0, sx * -0.28);
        add(new THREE.SphereGeometry(0.1, 6, 5), dark, sx * 0.5, f + 0.88, 0.03);
        add(new THREE.SphereGeometry(0.14, 6, 5), dark, sx * 0.3, f + 1.55, 0, 0, 0, 0, 1.3, 0.8, 1);
    }
    add(new THREE.CylinderGeometry(0.3, 0.2, 0.75, 8), suit, 0, f + 1.15, 0);
    add(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 8), sash, 0, f + 0.8, 0);
    add(new THREE.BoxGeometry(0.1, 0.5, 0.04), sash, 0.1, f + 0.5, 0.2, 0, 0, 0.1);
    add(new THREE.SphereGeometry(0.28, 10, 8), dark, 0, f + 1.8, 0, 0, 0, 0, 1, 1.05, 1);
    add(new THREE.SphereGeometry(0.22, 10, 8), mask, 0, f + 1.77, 0.12, 0, 0, 0, 1, 1, 0.55);
    for (const sx of [-1, 1]) {
        add(new THREE.BoxGeometry(0.15, 0.04, 0.03), eye, sx * 0.09, f + 1.82, 0.285, 0, 0, sx * -0.4);
        add(new THREE.ConeGeometry(0.06, 0.32, 5), mask, sx * 0.15, f + 2.1, -0.02, 0, 0, sx * -0.35);
    }
    add(new THREE.BoxGeometry(0.2, 0.05, 0.03), dark, 0, f + 1.69, 0.29);
    add(new THREE.CylinderGeometry(0.23, 0.27, 0.12, 8), sash, 0, f + 1.58, 0);
    add(new THREE.BoxGeometry(0.14, 0.7, 0.03), sash, 0.05, f + 1.3, -0.3, 0.25, 0, 0.1);
    const g = mergeGeometries(parts, false)!; return g;
}

export function Scene({ sim, ev, coarse, fx, perf }: SceneProps) {
    const { gl, camera } = useThree();
    const hero = useRef<THREE.Group>(null!), armR = useRef<THREE.Group>(null!), armL = useRef<THREE.Group>(null!), legR = useRef<THREE.Group>(null!), legL = useRef<THREE.Group>(null!), cape = useRef<THREE.Mesh>(null!);
    const web = useRef<THREE.Mesh>(null!), arrow = useRef<THREE.Mesh>(null!), cores = useRef<THREE.InstancedMesh>(null!), glows = useRef<THREE.InstancedMesh>(null!);
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
    const waterRef = useRef<THREE.Mesh>(null!);
    const rig = useMemo(() => {
        const r = buildRig();
        const redM = new THREE.MeshLambertMaterial({ color: '#d4162e', side: THREE.DoubleSide });
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.11, 0.06, 10), redM); ring.position.set(0, 0.04, 0); r.b.neck.add(ring);
        const t1 = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.8).translate(0, -0.4, 0), redM); t1.position.set(0, 0.38, -0.1); r.b.chest.add(t1);
        const t2 = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.55).translate(0, -0.275, 0), redM); t2.position.set(0.07, 0.36, -0.1); t2.rotation.set(0.1, 0, 0.14); r.b.chest.add(t2);
        legR.current = r.b.thighR as any; legL.current = r.b.thighL as any; armR.current = r.b.uarmR as any; armL.current = r.b.uarmL as any; cape.current = t1 as any;
        return r;
    }, []);
    const clipSt = useRef({ key: '', t: 0, w: 0 });
    const enemyGeo = useMemo(() => buildEnemyGeo(), []);
    const enBody = useRef<THREE.InstancedMesh>(null!);
    const enHead = useRef<THREE.InstancedMesh>(null!);
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
            if (ema.current > 24 && ns > 0.45) ns -= 0.1; else if (ema.current < 18 && ns < 1) ns += 0.05;
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
        const dbgD = (window as any).__camDist as number | undefined; if ((window as any).__hq) { curScale.current = 1; perf.scale = 1; }
        let dist = dbgD ?? (sim.web ? 15 : sim.wall ? 7.5 : 11);
        const fxd = Math.sin(sim.yaw) * cy, fzd = Math.cos(sim.yaw) * cy;
        for (; !dbgD && dist > (sim.wall ? 5 : 6); dist -= 1) {
            const ex = p[0] - fxd * dist, ey = p[1] + 1.5 + sy * dist, ez = p[2] - fzd * dist;
            let hit = false;
            for (const b of buildings) if (ex > b.x0 - 3 && ex < b.x1 + 3 && ez > b.z0 - 3 && ez < b.z1 + 3 && ey < b.h + 3) { hit = true; break; }
            if (!hit) break;
        }
        const tx = p[0] - fxd * dist, ty = sim.swim ? (sim.dive ? Math.min(WATER_Y - 1.5, p[1] + 1.2 + sy * dist) : WATER_Y + 0.7) : Math.max(2, p[1] + 1.5 + sy * dist), tz = p[2] - fzd * dist;
        if (sim.mode === 'menu' || sim.mode === 'over') { cam.current.set(tx, ty, tz); } else cam.current.lerp(new THREE.Vector3(tx, ty, tz), 1 - Math.pow(0.001, dt));
        { // push smoothed camera out of buildings (post-lerp)
            const q = cam.current;
            for (const b of buildings) if (q.x > b.x0 - 2 && q.x < b.x1 + 2 && q.z > b.z0 - 2 && q.z < b.z1 + 2 && q.y < b.h + 2) {
                if (!(tx > b.x0 - 2 && tx < b.x1 + 2 && tz > b.z0 - 2 && tz < b.z1 + 2 && ty < b.h + 2)) { q.set(tx, ty, tz); continue; }
                const dx0 = q.x - (b.x0 - 2), dx1 = b.x1 + 2 - q.x, dz0 = q.z - (b.z0 - 2), dz1 = b.z1 + 2 - q.z, dy = b.h + 2 - q.y, m = Math.min(dx0, dx1, dz0, dz1, dy);
                if (m === dy) q.y = b.h + 2; else if (m === dx0) q.x = b.x0 - 2; else if (m === dx1) q.x = b.x1 + 2; else if (m === dz0) q.z = b.z0 - 2; else q.z = b.z1 + 2;
            }
        }
        camera.position.copy(cam.current); (window as any).__cam = [cam.current.x, cam.current.y, cam.current.z, dist];
        look.current.set(p[0], sim.swim ? p[1] + 0.7 : p[1] + 1.5, p[2]);
        camera.lookAt(look.current);
        const cp = camera as THREE.PerspectiveCamera;
        const targetFov = 62 + Math.min(14, speed * 0.25) + fx.fov;
        if (Math.abs(cp.fov - targetFov) > 0.05) { cp.fov += (targetFov - cp.fov) * Math.min(1, dt * 6); cp.updateProjectionMatrix(); }
        {   // water: animate, and split view (waterline across the screen when the camera is at the surface)
            waterMat.uniforms.uTime.value = sim.t;
            const uw = document.getElementById('uw');
            const inBay = camera.position.z < WATER_Z + 2;
            const dy = camera.position.y - WATER_Y; const under = inBay && dy < 0;
            if (uw) {
                if (inBay && dy < 1.2 && dy > -2.2) {
                    // project the waterline a little ahead of the camera to find where the surface cuts the screen
                    camera.getWorldDirection(_wd); const hx = _wd.x, hz = _wd.z, hl = Math.hypot(hx, hz) || 1;
                    const ax = camera.position.x + hx / hl * 11, az = camera.position.z + hz / hl * 11; _wp.set(ax, WATER_Y + waveH(ax, az, sim.t), az).project(camera);
                    const yPct = Math.max(0, Math.min(100, (1 - (_wp.y * 0.5 + 0.5)) * 100));
                    uw.style.clipPath = `inset(${yPct}% 0 0 0)`; uw.style.opacity = '1'; uw.dataset.split = '1';
                } else { uw.style.clipPath = 'none'; uw.style.opacity = under ? '1' : '0'; uw.dataset.split = '0'; }
            }
        }
        // hero
        const h = hero.current;
        for (const bn of rig.bones) bn.rotation.set(0, 0, 0);
        h.position.set(p[0], p[1] - 1.0, p[2]);
        h.rotation.set(0, sim.ang, 0); h.scale.setScalar(1.2);
        const wl = !!sim.wall;
        if (wl) { h.position.x += Math.sin(sim.ang) * 0.4; h.position.z += Math.cos(sim.ang) * 0.4; }
        const sw2 = sim.swim;
        if (sw2) { h.position.y = p[1] - 0.35; h.position.x -= Math.sin(sim.ang) * (sim.dive ? 0.6 : 1.3); h.position.z -= Math.cos(sim.ang) * (sim.dive ? 0.6 : 1.3); }
        const lean = sw2 ? (sim.dive ? 1.9 : 1.45) : wl ? 0.18 : sim.web ? 0.5 : sim.ground ? 0.12 : 0.3;
        h.children[0].rotation.x = lean;
        const hs = Math.hypot(v[0], v[2]);
        const sw = sim.ground ? Math.sin(sim.runPhase * 3) * 0.9 * Math.min(1, hs / 6) : 0.25;
        legR.current.rotation.x = sw; legL.current.rotation.x = -sw;
        armL.current.rotation.x = -sw * 0.8;
        if (sw2) { const cs = Math.sin(sim.runPhase * 2.4); legR.current.rotation.x = cs * 0.5; legL.current.rotation.x = -cs * 0.5; armL.current.rotation.x = -2.6 + cs * 1.2; }
        if (wl) { const cw = Math.sin(sim.runPhase * 2.2); legR.current.rotation.x = -0.9 + cw * 0.5; legL.current.rotation.x = -0.9 - cw * 0.5; armL.current.rotation.x = -2.5 - cw * 0.35; }
        armR.current.rotation.x = sw2 ? -2.6 - Math.sin(sim.runPhase * 2.4) * 1.2 : wl ? -2.5 + Math.sin(sim.runPhase * 2.2) * 0.35 : sim.web ? -2.7 : sim.atkT > 0 ? -1.5 - Math.sin((0.32 - sim.atkT) * 10) * 0.6 : sw * 0.8;
        { const tR = legR.current.rotation.x, tL = legL.current.rotation.x, tuck = sim.ground ? 0 : 0.35; rig.b.shinR.rotation.x = Math.max(0, tR) * 0.9 + 0.08 + tuck; rig.b.shinL.rotation.x = Math.max(0, tL) * 0.9 + 0.08 + tuck; rig.b.farmR.rotation.x = -0.35 + Math.min(0, armR.current.rotation.x + 1.2) * 0.2; rig.b.farmL.rotation.x = -0.35 + Math.min(0, armL.current.rotation.x + 1.2) * 0.2; rig.b.head.rotation.x = -(h.children[0].rotation.x) * 0.5; rig.b.spine.rotation.x = Math.sin(sim.runPhase * 3) * 0.04 * (sim.ground ? 1 : 0); }
        {   // clip layer: pick a Mixamo-derived clip for the state, crossfade by weight
            const ck = sim.swim ? 'swim' : sim.wall ? 'wall' : sim.atkT > 0 ? 'punch' : (!sim.ground && !sim.web) ? 'jump' : (sim.ground && hs < 0.6 && !sim.dive) ? 'idle' : (sim.ground && !sim.web) ? 'run' : '';
            const cs = clipSt.current;
            if (ck !== cs.key) { cs.key = ck || cs.key; }
            cs.w += ((ck ? 1 : 0) - cs.w) * Math.min(1, dt * 10);
            if (ck) {
                const c = CLIPS[ck];
                if (ck === 'wall') cs.t += dt * Math.min(1.6, speed / 3);
                else if (ck === 'swim') cs.t += dt * (0.6 + Math.min(1.2, speed / 8));
                else if (ck === 'punch') cs.t = ((0.32 - sim.atkT) / 0.32) * 0.7 * (c.n / c.fps);
                else if (ck === 'jump') cs.t = (c.n / c.fps) * 0.5;
                else if (ck === 'run') cs.t += dt * Math.max(0.5, Math.min(2, hs / 5.5));
                else cs.t += dt;
            }
            if (cs.key === 'swim' || cs.key === 'wall') h.children[0].rotation.x *= 1 - cs.w * 0.9; else if (cs.key === 'run') h.children[0].rotation.x *= 1 - cs.w * 0.7;
            if (cs.w > 0.02 && (cs.key === 'run' || cs.key === 'idle') && CLIPS[cs.key].hy) { const c = CLIPS[cs.key], fi = Math.floor(((cs.t * c.fps) % c.n + c.n) % c.n); rig.b.hips.position.y = rig.hipsY + (c.hy[fi] - 1) * 0.9 * cs.w; } else rig.b.hips.position.y = rig.hipsY;
            if (cs.w > 0.02 && CLIPS[cs.key]) sampleClip(CLIPS[cs.key], cs.t, cs.key === 'wall' || cs.key === 'swim' || cs.key === 'idle' || cs.key === 'run', rig.bones, cs.w);
        }
        h.position.y -= sim.land * 0.5; h.children[0].rotation.x += sim.land * 0.5 + (sim.dodgeT > 0 ? 0.6 : 0);
        cape.current.rotation.x = 0.25 + Math.min(1.0, speed / 38) + Math.sin(sim.t * 14) * 0.05 * Math.min(1, speed / 20);
        // web
        const w = web.current;
        w.visible = sim.web;
        if (sim.web) {
            const hx = p[0], hy = p[1] + 1.2, hz = p[2];
            const dx = sim.anchor[0] - hx, dy = sim.anchor[1] - hy, dz = sim.anchor[2] - hz, l = Math.hypot(dx, dy, dz) || 1;
            w.position.set(hx + dx / 2, hy + dy / 2, hz + dz / 2);
            w.quaternion.setFromUnitVectors(Y, new THREE.Vector3(dx / l, dy / l, dz / l));
            w.scale.set(1, l, 1);
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
        { // enemies (instanced)
            const n = sim.enemies.length;
            for (let i = 0; i < n; i++) {
                const e = sim.enemies[i];
                const fall = e.down > 0 ? Math.min(1, (3 - e.down) * 5) : 0;
                tmp.position.set(e.x, e.y + 0.06 - fall * 0.6, e.z); tmp.rotation.set(fall * -1.4, e.ang, 0); tmp.scale.set(1.25, 1.25, 1.25); tmp.updateMatrix();
                enBody.current.setMatrixAt(i, tmp.matrix);
                tmp.position.set(e.x + Math.sin(e.ang) * fall * 1.2, e.y + 1.0 - fall * 1.2, e.z + Math.cos(e.ang) * fall * 1.2); tmp.rotation.set(0, e.ang, 0); tmp.updateMatrix(); enHead.current.setMatrixAt(i, tmp.matrix);
                if (e.hit > 0) ecol.setRGB(2.6, 2.6, 2.6); else if (e.atk > 0) ecol.setRGB(1.8, 0.5 + Math.sin(sim.t * 30) * 0.2, 0.4); else ecol.setRGB(1, 1, 1);
                enBody.current.setColorAt(i, ecol);
            }
            enBody.current.count = n; enHead.current.count = 0;
            enBody.current.instanceMatrix.needsUpdate = true; enHead.current.instanceMatrix.needsUpdate = true;
            if (enBody.current.instanceColor) enBody.current.instanceColor.needsUpdate = true;
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
        arrow.current.visible = nb >= 0 && sim.mode === 'play';
        if (nb >= 0) {
            const o = sim.orbs[nb], a = Math.atan2(o[0] - p[0], o[2] - p[2]);
            arrow.current.position.set(p[0] + Math.sin(a) * 3, p[1] + 3.2, p[2] + Math.cos(a) * 3);
            arrow.current.rotation.set(Math.PI / 2, 0, 0); arrow.current.rotation.order = 'YXZ'; arrow.current.rotation.y = a;
        }
    });

    return <>
        <mesh ref={beaconRef} frustumCulled={false}><cylinderGeometry args={[4, 4, 90, 12, 1, true]} /><meshBasicMaterial color="#5ff2ff" transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} fog={false} /></mesh>
        <color attach="background" args={[FOG[0], FOG[1], FOG[2]]} />
        <hemisphereLight args={['#b9a8ff', '#3a2748', 1.15]} />
        <directionalLight position={[-30, 60, 20]} intensity={1.8} color="#ffc89a" />
        <directionalLight position={[20, 30, -40]} intensity={0.9} color="#7aa8ff" />
        <Sky />
        <City />
        <group ref={hero}>
            <group>
                <primitive object={rig.root} />
            </group>
        </group>
        <mesh ref={web} visible={false}><cylinderGeometry args={[0.05, 0.05, 1, 5]} /><meshBasicMaterial color="#f4f4ff" /></mesh>
        <mesh ref={arrow}><coneGeometry args={[0.35, 1.1, 8]} /><meshBasicMaterial color="#ffd54a" /></mesh>
        <mesh position={[0, WATER_Y, (WATER_Z - HALF - 500) / 2]} rotation={[-Math.PI / 2, 0, 0]} ref={waterRef} material={waterMat} frustumCulled={false}><planeGeometry args={[2 * (HALF + 500), WATER_Z + HALF + 500, 160, 80]} /></mesh>
        <mesh position={[0, SEABED, (WATER_Z - HALF - 500) / 2]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[2 * (HALF + 500), WATER_Z + HALF + 500]} /><meshLambertMaterial color="#1b4552" /></mesh>
        <mesh position={[0, (SEABED) / 2, WATER_Z - 0.3]}><boxGeometry args={[2 * (HALF + 200), -SEABED, 0.6]} /><meshLambertMaterial color="#6b5560" /></mesh>
        <instancedMesh ref={enBody} args={[undefined, undefined, 16]} frustumCulled={false} geometry={enemyGeo}><meshLambertMaterial color="#ffffff" vertexColors /></instancedMesh>
        <instancedMesh ref={enHead} args={[undefined, undefined, 16]} frustumCulled={false}><sphereGeometry args={[0.32, 8, 6]} /><meshLambertMaterial color="#d8a98a" /></instancedMesh>
        <instancedMesh ref={cores} args={[undefined, undefined, 18]} frustumCulled={false}><icosahedronGeometry args={[1.3, 1]} /><meshBasicMaterial color="#ffd23f" /></instancedMesh>
        <instancedMesh ref={glows} args={[undefined, undefined, 18]} frustumCulled={false}><sphereGeometry args={[3.0, 10, 8]} /><meshBasicMaterial color="#ffb347" transparent opacity={0.22} blending={THREE.AdditiveBlending} depthWrite={false} /></instancedMesh>
    </>;
}
export { gsap, resetSim };
