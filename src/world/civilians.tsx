import { CELL, PARK, PED_VOICE, WATER_Z, buildings, world, type Sim } from '../sim';
import * as THREE from 'three';
import { EYE_BLUE, coatRobot, robotGeo, robotMat } from '../robotgeo';
import { TOD } from './env';
import { useMemo, useRef } from 'react';
import { shadowGeo, shadowMat } from '../shadowbot';
import { withPedestrianHands } from '../pedestrianHands';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { attachInk, syncInk } from '../ink';
import { useFrame } from '@react-three/fiber';
import { BOT_SC } from './scale';

const DBG = !!(import.meta as any).env.VITE_DBG;   // test hooks only in instrumented builds

// Wind streak lines around the hero and the city's pedestrians (street robots + air traffic riders).
// Original tapered gust ribbons, reference: Ashar's wind-particle loop/swirl tutorial.
export function WindLines({ sim }: { sim: Sim }) {
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
export function Civilians({sim}:{sim:Sim}){
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
        PED_VOICE.d=1e9;if(DBG)(window as any).__air=[];
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
            const ty=i%5,hov=0;if(dd<PED_VOICE.d){PED_VOICE.d=dd;PED_VOICE.x=x;PED_VOICE.y=hov;PED_VOICE.z=z;PED_VOICE.t=performance.now();}
            if(DBG)(window as any).__pl.push([i,x,z,fade]);o.position.set(x,hov,z);o.rotation.set(0,rot,0);o.scale.setScalar(BOT_SC*fade);o.updateMatrix();if(Math.hypot(x-hx,z-hz)<nr)refs.current[ty].setMatrixAt(cnt[ty]++,o.matrix);else refsF.current[ty].setMatrixAt(cf[ty]++,o.matrix);
        };
        for(let i=0;i<nP;i++)place(i,false);
        for(let i=0;i<nA;i++)place(i+1000,true);
        for(let i=0;i<PED_TYPES.length;i++){refs.current[i].count=cnt[i];syncInk(refs.current[i]);refs.current[i].instanceMatrix.needsUpdate=true;refsF.current[i].count=cf[i];syncInk(refsF.current[i]);refsF.current[i].instanceMatrix.needsUpdate=true;}if(DBG)(window as any).__ped=cnt.slice();});
    return <group>{set.map((p,i)=><instancedMesh key={i} ref={m=>{if(m&&refs.current[i]!==m){refs.current[i]=m;attachInk(m)}}} args={[p.geo,p.mat,PED_CAP]} frustumCulled={false}/>)}{far.map((p,i)=><instancedMesh key={'f'+i} ref={m=>{if(m&&refsF.current[i]!==m){refsF.current[i]=m;m.userData.far=true;attachInk(m)}}} args={[p.geo,p.mat,PED_CAP]} frustumCulled={false}/>)}</group>;
}
