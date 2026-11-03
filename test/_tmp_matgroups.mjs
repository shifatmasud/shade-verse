import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:915,height:412,deviceScaleFactor:1,hasTouch:true,isMobile:true});
const w=ms=>new Promise(r=>setTimeout(r,ms));
await p.goto('http://127.0.0.1:4311/?q=low',{waitUntil:'load'}); await w(2500); await p.evaluate(()=>window.__game.start()); await w(2500);
for (const [n,pos] of JSON.parse(process.env.SPOTS)) {
 await p.evaluate((pos)=>{const s=window.__game.sim; s.pos=pos.slice(); s.vel=[0,0,0];},pos); await w(12000);
 const r=await p.evaluate(()=>{ const T=window.THREE_||null; const sc=window.__scene, cam=window.__camera||sc.userData.cam; const g={}; let tot=0;
  sc.traverseVisible(o=>{ if(!o.isMesh&&!o.isPoints&&!o.isLine) return; tot++; const m=Array.isArray(o.material)?o.material[0]:o.material; const k=(m.type||'')+':'+m.uuid.slice(0,6);
   (g[k]=g[k]||{n:0,inst:0,names:new Set()}); g[k].n++; if(o.isInstancedMesh) g[k].inst++; let q=o, nm=''; while(q&&!nm){nm=q.name;q=q.parent;} g[k].names.add(nm||'?'); });
  return {tot, groups:Object.entries(g).filter(([k,v])=>v.n>=3).map(([k,v])=>[k,v.n,v.inst,[...v.names].slice(0,4).join('|')]).sort((a,b)=>b[1]-a[1]).slice(0,20)}; });
 console.log(n, JSON.stringify(r));
}
await b.close();