import puppeteer from 'puppeteer-core'; import fs from 'fs'; import { waveSumJS } from '/tmp/wv.mjs';
// pinned phone perf harness with optional frozen surface camera (perf item: waterline re-measure). SPOTS = [{n, pos, cam?, t?, off?, pitch?}]
const ISL={cx:-160,cz:-820}; const surf=(x,z,t)=>{const zk=Math.max(0,Math.min(1,(z+300)/-450)), ik=Math.max(0,Math.min(1,(Math.hypot(x-ISL.cx,z-ISL.cz)-105)/110)), sk=(1+1.3*zk*zk*(3-2*zk))*(0.22+0.78*ik*ik*(3-2*ik)); return -1+sk*waveSumJS(x,z,t);};
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});const p=await b.newPage();await p.setViewport({width:915,height:412,isMobile:true,hasTouch:true,deviceScaleFactor:1.75});
const errs=[]; p.on('pageerror',e=>errs.push('PAGE '+String(e))); p.on('console',m=>{if(m.type()==='error'||/shader|GL_INVALID/i.test(m.text()))errs.push(m.type()+' '+m.text())});
await p.evaluateOnNewDocument(()=>{window.__perfPin=1;window.__dc=0;for(const C of [WebGL2RenderingContext,WebGLRenderingContext]){const P=C.prototype;for(const f of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']){const o=P[f];if(!o)continue;P[f]=function(...a){window.__dc++;return o.apply(this,a)}}}});
const w=ms=>new Promise(r=>setTimeout(r,ms));
await p.goto('http://127.0.0.1:'+process.env.PORT+'/'+(process.env.QS||'?q=low'));await w(3000);await p.evaluate(()=>window.__game.start());
for(let i=0;i<120&&(await p.evaluate(()=>window.__game.sim.mode))!=='play';i++) await w(500); await w(6000);
const res={}; const REPS=+(process.env.REPS||3), NF=+(process.env.NF||20);
for(const sp of JSON.parse(process.env.SPOTS)){
  if(sp.cam){ const cy=surf(sp.cam[0],sp.cam[2],sp.t)+(sp.off||0); await p.evaluate((sp,cy)=>{const s=window.__game.sim; s.vel=[0,0,0]; s.t=sp.t; s.pos=sp.pos.slice(); s.swim=true; s.dive=false; window.__ts=0; const c=sp.cam.slice(); c[1]=cy; c[4]=cy+(sp.pitch||0); window.__camOv=c; s.enemies.forEach(o=>{if(!o.boss){o.x=-280;o.z=280;}});},sp,cy); }
  else { await p.evaluate((sp)=>{const s=window.__game.sim; delete window.__camOv; window.__ts=1; s.pos=sp.pos.slice(); s.vel=[0,0,0];},sp); await w(8000); await p.evaluate((sp)=>{window.__ts=0;},sp); }
  await w(+(process.env.SETTLE||6000));
  if(process.env.SHOT) await p.screenshot({path:process.env.SHOT+'_'+sp.n+'.png'});
  const ms=[]; let dc=0;
  for(let r=0;r<REPS;r++){ const o=await p.evaluate(async(NF)=>{const d0=window.__dc;let f=0;const t0=performance.now();await new Promise(r=>{function k(){f++;if(f<NF)requestAnimationFrame(k);else r()}requestAnimationFrame(k)});return {dc:Math.round((window.__dc-d0)/NF),ms:(performance.now()-t0)/NF}},NF); ms.push(o.ms); dc=o.dc; }
  ms.sort((a,b)=>a-b); res[sp.n]={ms:+ms[Math.floor(ms.length/2)].toFixed(1),all:ms.map(x=>+x.toFixed(1)),dc,wl:await p.evaluate(()=>window.__wl?window.__wl[1]:null)};
  console.error(sp.n, JSON.stringify(res[sp.n]));
}
console.log(JSON.stringify(res)); fs.writeFileSync((process.env.SHOT||'/tmp/pwl')+'_errs.txt', errs.join('\n')); console.error('ERRS',errs.length); await b.close();
