import puppeteer from 'puppeteer-core';
// lists visible transparent objects with triangle load and projected screen coverage (perf item 11). SPOTS=[[name,[x,y,z]],...]
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});const p=await b.newPage();await p.setViewport({width:915,height:412,isMobile:true,hasTouch:true,deviceScaleFactor:1.75});
await p.evaluateOnNewDocument(()=>{window.__perfPin=1;});
const w=ms=>new Promise(r=>setTimeout(r,ms));
await p.goto('http://127.0.0.1:'+process.env.PORT+'/'+(process.env.QS||'?q=low'));await w(3000);await p.evaluate(()=>window.__game.start());
for(let i=0;i<120&&(await p.evaluate(()=>window.__game.sim.mode))!=='play';i++) await w(500); await w(4000);
for(const [n,pos] of JSON.parse(process.env.SPOTS)){
  await p.evaluate((pos)=>{const s=window.__game.sim; s.pos=pos; s.vel=[0,0,0];},pos); await w(9000);
  const r=await p.evaluate(()=>{const cam=window.__camObj; const out=[]; const T=window.__scene.children[0].constructor; 
    window.__scene.traverseVisible(o=>{ const m=o.material; if(!(o.isMesh||o.isPoints||o.isSprite)||!m||Array.isArray(m)||!m.transparent) return; const g=o.geometry; let tri=g?((g.index?g.index.count:g.attributes.position.count)/3):2; if(o.isInstancedMesh) tri*=o.count; if(o.isPoints) tri=g.attributes.position.count;
      if(g&&!g.boundingSphere&&g.computeBoundingSphere) g.computeBoundingSphere(); let cov=-1; if(g&&g.boundingSphere&&cam&&!o.isInstancedMesh){ const c=g.boundingSphere.center.clone().applyMatrix4(o.matrixWorld); const rad=g.boundingSphere.radius*o.matrixWorld.getMaxScaleOnAxis(); const v=c.clone().applyMatrix4(cam.matrixWorldInverse); const d=-v.z; const f=1/Math.tan(cam.fov*Math.PI/360); cov = d<=rad? 1 : Math.min(1, Math.PI*(rad*f/d)**2/4/cam.aspect); }
      let path=[]; let q=o; for(let k=0;k<3&&q;k++){path.push(q.name||q.type); q=q.parent;}
      out.push([Math.round(tri), +cov.toFixed(3), m.type, m.blending, m.depthWrite?1:0, o.renderOrder, path.join('<'), (m.name||'')+(m.map?' map':'')]); });
    out.sort((a,b)=>b[1]-a[1]); return out;});
  console.log('== '+n+' '+r.length+' transparent'); for(const e of r.slice(0,+(process.env.TOPN||25))) console.log(JSON.stringify(e));
}
await b.close();