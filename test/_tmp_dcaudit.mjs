import puppeteer from 'puppeteer-core';
// draw-call audit (perf item 15): objects three actually renders per frame (wraps renderer.renderBufferDirect), grouped by material
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});const p=await b.newPage();await p.setViewport({width:915,height:412,isMobile:true,hasTouch:true,deviceScaleFactor:1.75});
await p.evaluateOnNewDocument(()=>{window.__perfPin=1;});
const w=ms=>new Promise(r=>setTimeout(r,ms));
await p.evaluateOnNewDocument((v)=>{window.__noSkipEmpty=v;}, +(process.env.NSE||0));
await p.goto('http://127.0.0.1:'+process.env.PORT+'/?q=low');await w(3000);await p.evaluate(()=>window.__game.start());
for(let i=0;i<120&&(await p.evaluate(()=>window.__game.sim.mode))!=='play';i++) await w(500); await w(3000);
await p.evaluate(()=>{window.__noSkipEmpty=+(window.__NSE||0); const gl=window.__gl; const o=gl.renderBufferDirect.bind(gl); window.__rb=null; gl.renderBufferDirect=function(cam,scene,geo,mat,obj,group){ if(window.__rb){ let path=[]; let q=obj; for(let k=0;k<3&&q;k++){path.push(q.name||q.type); q=q.parent;} const _t=performance.now(); const _r=o(cam,scene,geo,mat,obj,group); const _dt=performance.now()-_t; window.__rb.push([_dt,mat.uuid.slice(0,6), mat.type, path.join('<'), (geo.index?geo.index.count:geo.attributes.position.count)/3|0, obj.isInstancedMesh?obj.count:1]); return _r;} return o(cam,scene,geo,mat,obj,group); };});
for(const [n,pos] of JSON.parse(process.env.SPOTS)){
  await p.evaluate((pos)=>{const s=window.__game.sim; s.pos=pos; s.vel=[0,0,0];},pos); await w(9000);
  const r=await p.evaluate(async()=>{window.__rb=[]; await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); const L=window.__rb; window.__rb=null; return L;});
  // r covers ~1-2 frames; group by material
  r.forEach(e=>e.shift&&0); const ZT=r.filter(e=>e[5]===0).reduce((a,e)=>a+e[0],0), AT=r.reduce((a,e)=>a+e[0],0); console.log('rbd ms (2 frames): all',AT.toFixed(2),'zero-instance',ZT.toFixed(2)); const g={}; for(const e of r){ const k=e[1]+' '+e[2]; (g[k]=g[k]||{n:0,tris:0,paths:new Set()}); g[k].n++; g[k].tris+=e[3]*e[4]; g[k].paths.add(e[2]); }
  const arr=Object.entries(g).sort((a,b)=>b[1].n-a[1].n);
  console.log('== '+n+' calls(~2 frames) '+r.length+' materials '+arr.length+' zero-instance calls '+r.filter(e=>e[5]===0).length);
  for(const [k,v] of arr.slice(0,25)) console.log(String(v.n).padStart(4), k, 'tris', v.tris, [...v.paths].slice(0,3).join(' | '));
}
await b.close();