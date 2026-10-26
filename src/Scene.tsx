import React, { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import { world, buildings, FOG, stepSim, resetSim, input, type Sim, type Events } from './sim';

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
  float w=step(0.22,f.x)*step(f.x,0.78)*step(0.26,f.y)*step(f.y,0.74)*step(4.0,v);
  vec2 hh=fract((id+vSeed*41.0)*vec2(0.1031,0.1030));hh+=dot(hh,hh.yx+33.33);float h=fract((hh.x+hh.y)*hh.x);
  float on=step(0.52,h);
  vec3 wc=mix(vec3(0.16,0.22,0.32)*(0.6+0.8*f.y),vec3(1.0,0.8,0.42)*(0.75+0.5*h),on);
  col*=0.82+0.18*step(0.12,f.y);col*=1.0-0.22*step(f.y,0.08)-0.12*step(f.x,0.06);
  col=mix(col,wc+vec3(0.12,0.1,0.2)*(1.0-on)*d,w);
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

export function Scene({ sim, ev, coarse, fx, perf }: SceneProps) {
    const { gl, camera } = useThree();
    const hero = useRef<THREE.Group>(null!), armR = useRef<THREE.Group>(null!), armL = useRef<THREE.Group>(null!), legR = useRef<THREE.Group>(null!), legL = useRef<THREE.Group>(null!), cape = useRef<THREE.Mesh>(null!);
    const web = useRef<THREE.Mesh>(null!), arrow = useRef<THREE.Mesh>(null!), cores = useRef<THREE.InstancedMesh>(null!), glows = useRef<THREE.InstancedMesh>(null!);
    const cam = useRef(new THREE.Vector3()), look = useRef(new THREE.Vector3()), adapt = useRef(0), ema = useRef(16), curScale = useRef(perf.scale);
    const suit = useMemo(() => new THREE.MeshLambertMaterial({ color: '#12a0b4' }), []);
    const gold = useMemo(() => new THREE.MeshLambertMaterial({ color: '#f2c038' }), []);
    const dark = useMemo(() => new THREE.MeshLambertMaterial({ color: '#171a2c' }), []);
    const red = useMemo(() => new THREE.MeshLambertMaterial({ color: '#d9344f', side: THREE.DoubleSide }), []);
    const eye = useMemo(() => new THREE.MeshBasicMaterial({ color: '#7ffcff' }), []);
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
            sim.time += dt;
        } else sim.yaw += dt * 0.15;
        const p = sim.pos, v = sim.vel;
        const speed = Math.hypot(v[0], v[1], v[2]); perf.speed = speed;
        // camera
        const cy = Math.cos(sim.pitch), sy = Math.sin(sim.pitch);
        let dist = sim.web ? 15 : 11;
        const fxd = Math.sin(sim.yaw) * cy, fzd = Math.cos(sim.yaw) * cy;
        for (; dist > 6; dist -= 1) {
            const ex = p[0] - fxd * dist, ey = p[1] + 1.5 + sy * dist, ez = p[2] - fzd * dist;
            let hit = false;
            for (const b of buildings) if (ex > b.x0 - 3 && ex < b.x1 + 3 && ez > b.z0 - 3 && ez < b.z1 + 3 && ey < b.h + 3) { hit = true; break; }
            if (!hit) break;
        }
        const tx = p[0] - fxd * dist, ty = Math.max(2, p[1] + 1.5 + sy * dist), tz = p[2] - fzd * dist;
        if (sim.mode === 'menu' || sim.mode === 'over') { cam.current.set(tx, ty, tz); } else cam.current.lerp(new THREE.Vector3(tx, ty, tz), 1 - Math.pow(0.001, dt));
        { // push smoothed camera out of buildings (post-lerp)
            const q = cam.current;
            for (const b of buildings) if (q.x > b.x0 - 2 && q.x < b.x1 + 2 && q.z > b.z0 - 2 && q.z < b.z1 + 2 && q.y < b.h + 2) {
                const dx0 = q.x - (b.x0 - 2), dx1 = b.x1 + 2 - q.x, dz0 = q.z - (b.z0 - 2), dz1 = b.z1 + 2 - q.z, dy = b.h + 2 - q.y, m = Math.min(dx0, dx1, dz0, dz1, dy);
                if (m === dy) q.y = b.h + 2; else if (m === dx0) q.x = b.x0 - 2; else if (m === dx1) q.x = b.x1 + 2; else if (m === dz0) q.z = b.z0 - 2; else q.z = b.z1 + 2;
            }
        }
        camera.position.copy(cam.current);
        look.current.set(p[0], p[1] + 1.5, p[2]);
        camera.lookAt(look.current);
        const cp = camera as THREE.PerspectiveCamera;
        const targetFov = 62 + Math.min(14, speed * 0.25) + fx.fov;
        if (Math.abs(cp.fov - targetFov) > 0.05) { cp.fov += (targetFov - cp.fov) * Math.min(1, dt * 6); cp.updateProjectionMatrix(); }
        // hero
        const h = hero.current;
        h.position.set(p[0], p[1] - 1.0, p[2]);
        h.rotation.set(0, sim.ang, 0); h.scale.setScalar(1.15);
        const lean = sim.web ? 0.5 : sim.ground ? 0.12 : 0.3;
        h.children[0].rotation.x = lean;
        const hs = Math.hypot(v[0], v[2]);
        const sw = sim.ground ? Math.sin(sim.runPhase * 3) * 0.9 * Math.min(1, hs / 6) : 0.25;
        legR.current.rotation.x = sw; legL.current.rotation.x = -sw;
        armL.current.rotation.x = -sw * 0.8;
        armR.current.rotation.x = sim.web ? -2.7 : sw * 0.8;
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
        <color attach="background" args={[FOG[0], FOG[1], FOG[2]]} />
        <hemisphereLight args={['#b9a8ff', '#3a2748', 1.15]} />
        <directionalLight position={[-30, 60, 20]} intensity={1.8} color="#ffc89a" />
        <directionalLight position={[20, 30, -40]} intensity={0.9} color="#7aa8ff" />
        <Sky />
        <City />
        <group ref={hero}>
            <group>
                <mesh position={[0, 1.4, 0]} material={suit}><capsuleGeometry args={[0.32, 0.55, 4, 10]} /></mesh>
                <mesh position={[0, 1.55, 0.3]} material={gold}><boxGeometry args={[0.28, 0.28, 0.06]} /></mesh>
                <mesh position={[0, 2.15, 0]} material={gold}><sphereGeometry args={[0.28, 14, 10]} /></mesh>
                <mesh position={[0, 1.2, 0]} material={gold}><boxGeometry args={[0.7, 0.1, 0.4]} /></mesh>
                <mesh position={[-0.42, 1.78, 0]} material={gold}><sphereGeometry args={[0.17, 8, 6]} /></mesh>
                <mesh position={[0.42, 1.78, 0]} material={gold}><sphereGeometry args={[0.17, 8, 6]} /></mesh>
                <mesh position={[0, 1.74, 0]} material={red}><boxGeometry args={[0.7, 0.2, 0.42]} /></mesh>
                <mesh position={[-0.09, 2.2, 0.27]} material={eye}><boxGeometry args={[0.12, 0.05, 0.03]} /></mesh>
                <mesh position={[0.09, 2.2, 0.27]} material={eye}><boxGeometry args={[0.12, 0.05, 0.03]} /></mesh>
                <mesh position={[0, 2.17, 0.2]} material={visor}><boxGeometry args={[0.36, 0.14, 0.1]} /></mesh>
                <mesh ref={cape} position={[0, 1.9, -0.3]} material={red}><planeGeometry args={[0.8, 1.2]} /></mesh>
                <group ref={legR} position={[0.17, 0.95, 0]}><mesh position={[0, -0.45, 0]} material={dark}><capsuleGeometry args={[0.13, 0.55, 3, 8]} /></mesh></group>
                <group ref={legL} position={[-0.17, 0.95, 0]}><mesh position={[0, -0.45, 0]} material={dark}><capsuleGeometry args={[0.13, 0.55, 3, 8]} /></mesh></group>
                <group ref={armR} position={[0.45, 1.8, 0]}><mesh position={[0, -0.4, 0]} material={suit}><capsuleGeometry args={[0.1, 0.55, 3, 8]} /></mesh></group>
                <group ref={armL} position={[-0.45, 1.8, 0]}><mesh position={[0, -0.4, 0]} material={suit}><capsuleGeometry args={[0.1, 0.55, 3, 8]} /></mesh></group>
            </group>
        </group>
        <mesh ref={web} visible={false}><cylinderGeometry args={[0.05, 0.05, 1, 5]} /><meshBasicMaterial color="#f4f4ff" /></mesh>
        <mesh ref={arrow}><coneGeometry args={[0.35, 1.1, 8]} /><meshBasicMaterial color="#ffd54a" /></mesh>
        <instancedMesh ref={cores} args={[undefined, undefined, 18]} frustumCulled={false}><icosahedronGeometry args={[1.3, 1]} /><meshBasicMaterial color="#ffd23f" /></instancedMesh>
        <instancedMesh ref={glows} args={[undefined, undefined, 18]} frustumCulled={false}><sphereGeometry args={[3.0, 10, 8]} /><meshBasicMaterial color="#ffb347" transparent opacity={0.22} blending={THREE.AdditiveBlending} depthWrite={false} /></instancedMesh>
    </>;
}
export { gsap, resetSim };
