import puppeteer from 'puppeteer-core'; import fs from 'fs';
// In-page A/B for a DBG toggle (window[FLAG]=1 turns the optimisation OFF): same page, same frozen frame, interleaved timing + identical-frame shots.
// SPOTS=[[name,[x,y,z]],...] FLAG=__noInstCull OUT=/tmp/ab9
const FLAG=process.env.FLAG, OUT=process.env.OUT||'/tmp/ab';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});const p=await b.newPage();await p.setViewport({width:915,height:412,isMobile:true,hasTouch:true,deviceScaleFactor:1.75});
const errs=[]; p.on('pageerror',e=>errs.push('PAGE '+String(e))); p.on('console',m=>{if(m.type()==='error'||/shader|GL_INVALID/i.test(m.text()))errs.push(m.type()+' '+m.text())});
await p.evaluateOnNewDocument(()=>{window.__perfPin=1;window.__dc=0;window.__tri=0;for(const C of [WebGL2RenderingContext,WebGLRenderingContext]){const P=C.prototype;
  const o1=P.drawElements;P.drawElements=function(m,c,t,f){window.__dc++;window.__tri+=c/3;return o1.apply(this,arguments)};
  const o2=P.drawArrays;P.drawArrays=function(m,f,c){window.__dc++;window.__tri+=c/3;return o2.apply(this,arguments)};
  const o3=P.drawElementsInstanced;if(o3)P.drawElementsInstanced=function(m,c,t,f,n){window.__dc++;window.__tri+=c/3*n;return o3.apply(this,arguments)};
  const o4=P.drawArraysInstanced;if(o4)P.drawArraysInstanced=function(m,f,c,n){window.__dc++;window.__tri+=c/3*n;return o4.apply(this,arguments)};}});
const w=ms=>new Promise(r=>setTimeout(r,ms));
await p.goto('http://127.0.0.1:'+process.env.PORT+'/'+(process.env.QS||'?q=low'));await w(3000);await p.evaluate(()=>window.__game.start());
for(let i=0;i<120&&(await p.evaluate(()=>window.__game.sim.mode))!=='play';i++) await w(500); await w(4000);
const NF=+(process.env.NF||16), R=+(process.env.REPS||3); const res={};
const meas=()=>p.evaluate(async(NF)=>{const d0=window.__dc,t0r=window.__tri;let f=0;const t0=performance.now();await new Promise(r=>{function k(){f++;if(f<NF)requestAnimationFrame(k);else r()}requestAnimationFrame(k)});return {ms:(performance.now()-t0)/NF,dc:(window.__dc-d0)/NF,tri:(window.__tri-t0r)/NF}},NF);
for(const [n,pos,yaw] of JSON.parse(process.env.SPOTS)){
  await p.evaluate((pos,yaw)=>{const s=window.__game.sim; delete window.__camOv; window.__ts=1; s.pos=pos.slice(); s.vel=[0,0,0]; if(yaw!=null) s.yaw=yaw;},pos,yaw); await w(9000);
  await p.evaluate(()=>{window.__ts=0;}); await w(2500);
  const A=[],B=[];
  for(let r=0;r<R;r++){ for(const off of [1,0]){ await p.evaluate((F,off)=>{window[F]=off;},FLAG,off); await w(1200); if(r===0) await p.screenshot({path:`${OUT}_${n}_${off?'off':'on'}.png`}); const m=await meas(); (off?A:B).push(m); } }
  const med=(L,k)=>{const v=L.map(x=>x[k]).sort((a,b)=>a-b);return +v[Math.floor(v.length/2)].toFixed(1)};
  res[n]={off_ms:med(A,'ms'),on_ms:med(B,'ms'),off_tri:Math.round(med(A,'tri')),on_tri:Math.round(med(B,'tri')),off_dc:med(A,'dc'),on_dc:med(B,'dc'),offAll:A.map(x=>+x.ms.toFixed(0)),onAll:B.map(x=>+x.ms.toFixed(0))};
  console.error(n, JSON.stringify(res[n]));
}
console.log(JSON.stringify(res)); fs.writeFileSync(OUT+'_errs.txt',errs.join('\n')); await b.close();
