import puppeteer from 'puppeteer-core';
// per-useFrame CPU profile (perf item 9): wraps every R3F frame subscriber and times it. SPOTS=[[name,[x,y,z]],...]
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});const p=await b.newPage();await p.setViewport({width:915,height:412,isMobile:true,hasTouch:true,deviceScaleFactor:1.75});
await p.evaluateOnNewDocument(()=>{window.__perfPin=1;});
const w=ms=>new Promise(r=>setTimeout(r,ms));
await p.goto('http://127.0.0.1:'+process.env.PORT+'/'+(process.env.QS||'?q=low'));await w(3000);await p.evaluate(()=>window.__game.start());
for(let i=0;i<120&&(await p.evaluate(()=>window.__game.sim.mode))!=='play';i++) await w(500); await w(4000);
await p.evaluate(()=>{ let root=null; window.__scene.traverse(o=>{ if(!root&&o.__r3f&&o.__r3f.root) root=o.__r3f.root; }); window.__R=root; window.__acc=new Map(); window.__nf=0;
  setInterval(()=>{ const subs=root.getState().internal.subscribers; for(const s of subs){ const f=s.ref.current; if(f&&!f.__w){ const key=f.toString().replace(/\s+/g,' ').slice(0,160); const g=function(...a){const t=performance.now(); try{return f.apply(this,a)}finally{const e=window.__acc.get(key)||[0,s.priority]; e[0]+=performance.now()-t; window.__acc.set(key,e);}}; g.__w=1; s.ref.current=g; } } },100);
  const tick=()=>{window.__nf++; requestAnimationFrame(tick)}; requestAnimationFrame(tick); });
const out={};
for(const [n,pos] of JSON.parse(process.env.SPOTS)){
  await p.evaluate((pos)=>{const s=window.__game.sim; s.pos=pos; s.vel=[0,0,0];},pos); await w(+(process.env.SETTLE||9000));
  await p.evaluate(()=>{window.__acc.clear(); window.__nf=0; window.__t0=performance.now();}); await w(+(process.env.DUR||8000));
  const r=await p.evaluate(()=>{const nf=window.__nf, ft=(performance.now()-window.__t0)/nf; const arr=[...window.__acc.entries()].map(([k,v])=>[+(v[0]/nf).toFixed(3),v[1],k]).sort((a,b)=>b[0]-a[0]); return {nf, ft:+ft.toFixed(1), top:arr.slice(0,+(window.__TOPN||14))};});
  out[n]=r; console.log('== '+n+' frames '+r.nf+' frame ms '+r.ft); for(const e of r.top) console.log(String(e[0]).padStart(8), 'p'+e[1], e[2]);
}
await b.close();
