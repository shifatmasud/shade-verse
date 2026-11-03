import puppeteer from 'puppeteer-core';
// big meshes audit (perf item 14): visible meshes by tris with bounding radius, culling flag; plus how many of their tris are in view
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});const p=await b.newPage();await p.setViewport({width:915,height:412,isMobile:true,hasTouch:true,deviceScaleFactor:1.75});
await p.evaluateOnNewDocument(()=>{window.__perfPin=1;});
const w=ms=>new Promise(r=>setTimeout(r,ms));
await p.goto('http://127.0.0.1:'+process.env.PORT+'/'+(process.env.QS||'?q=low'));await w(3000);await p.evaluate(()=>window.__game.start());
for(let i=0;i<120&&(await p.evaluate(()=>window.__game.sim.mode))!=='play';i++) await w(500); await w(4000);
for(const [n,pos] of JSON.parse(process.env.SPOTS)){
  await p.evaluate((pos)=>{const s=window.__game.sim; s.pos=pos; s.vel=[0,0,0];},pos); await w(9000);
  const r=await p.evaluate(()=>{const cam=window.__camObj; cam.updateMatrixWorld(); const T=cam.constructor; const M=cam.projectionMatrix.clone().multiply(cam.matrixWorldInverse); const out=[]; const V=cam.position.clone();
    window.__scene.traverseVisible(o=>{ if(!o.isMesh||o.isInstancedMesh||!o.layers.test(cam.layers)&&false) return; const g=o.geometry; if(!g) return; const tri=(g.index?g.index.count:g.attributes.position.count)/3; if(tri<3000) return; if(!g.boundingSphere) g.computeBoundingSphere();
      const rad=g.boundingSphere.radius*o.matrixWorld.getMaxScaleOnAxis(); 
      // fraction of triangles with a vertex inside the frustum (sampled)
      const pa=g.attributes.position, idx=g.index; const v=V.clone(); let inF=0, ns=0; const step=Math.max(1,Math.floor(tri/400));
      for(let t=0;t<tri;t+=step){ ns++; let any=false; for(let k=0;k<3;k++){ const vi=idx?idx.getX(t*3+k):t*3+k; v.fromBufferAttribute(pa,vi).applyMatrix4(o.matrixWorld).applyMatrix4(M); if(Math.abs(v.x)<=1.1&&Math.abs(v.y)<=1.1&&v.z<=1&&v.z>=-1){any=true;break;} } if(any) inF++; }
      let path=[]; let q=o; for(let k=0;k<3&&q;k++){path.push(q.name||q.type); q=q.parent;}
      out.push([Math.round(tri), Math.round(rad), o.frustumCulled?1:0, +(inF/ns).toFixed(2), o.material&&o.material.type, path.join('<')]); });
    out.sort((a,b)=>b[0]-a[0]); return out;});
  console.log('== '+n); let tot=0, wasted=0; for(const e of r){ tot+=e[0]; wasted+=e[0]*(1-e[3]); } console.log('total big-mesh tris',tot,'outside view',Math.round(wasted)); for(const e of r.slice(0,22)) console.log(JSON.stringify(e));
}
await b.close();