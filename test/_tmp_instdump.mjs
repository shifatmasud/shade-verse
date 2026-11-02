import puppeteer from 'puppeteer-core';
// lists visible InstancedMeshes by instanced triangle load (perf item 9) + __tel tris/calls. SPOTS=[[name,[x,y,z]],...]
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});const p=await b.newPage();await p.setViewport({width:915,height:412,isMobile:true,hasTouch:true,deviceScaleFactor:1.75});
await p.evaluateOnNewDocument(()=>{window.__perfPin=1;});
const w=ms=>new Promise(r=>setTimeout(r,ms));
await p.goto('http://127.0.0.1:'+process.env.PORT+'/'+(process.env.QS||'?q=low'));await w(3000);await p.evaluate(()=>window.__game.start());
for(let i=0;i<120&&(await p.evaluate(()=>window.__game.sim.mode))!=='play';i++) await w(500); await w(4000);
for(const [n,pos] of JSON.parse(process.env.SPOTS)){
  await p.evaluate((pos)=>{const s=window.__game.sim; s.pos=pos; s.vel=[0,0,0];},pos); await w(9000);
  const r=await p.evaluate(()=>{const out=[]; window.__scene.traverseVisible(o=>{ if(o.isInstancedMesh&&o.count>0){ const g=o.geometry; const tri=(g.index?g.index.count:g.attributes.position.count)/3; let path=[]; let q=o; for(let k=0;k<3&&q;k++){path.push((q.name||q.type)+(q.userData&&q.userData.kind?':'+q.userData.kind:'')); q=q.parent;} const mt=o.material||{}; const c=new window.__game.sim.constructor===undefined?null:null; const e=o.instanceMatrix.array; const cp=window.__tel.cam; const fx=e[12],fz=e[14]; out.push([Math.round(tri*o.count), o.count, Math.round(tri), o.frustumCulled?1:0, (mt.name||mt.type)||'', path.join('<'), Object.keys(o.geometry.attributes).join(','), [Math.round(fx),Math.round(e[13]),Math.round(fz)], String(mt.onBeforeCompile||'').replace(/\s+/g,' ').slice(0,90)]); } }); out.sort((a,b)=>b[0]-a[0]); return {tel:window.__tel, top:out.slice(0,18)};});
  console.log('== '+n, JSON.stringify({calls:r.tel.calls,tris:r.tel.tris,cam:r.tel.cam})); for(const e of r.top) console.log(JSON.stringify(e));
}
await b.close();