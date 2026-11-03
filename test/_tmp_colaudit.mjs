import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:915,height:412,hasTouch:true,isMobile:true});
const w=ms=>new Promise(r=>setTimeout(r,ms)); await p.goto('http://127.0.0.1:4311/',{waitUntil:'load'}); await w(2500); await p.evaluate(()=>window.__game.start()); await w(3000);
const out=[];
for (const pos of JSON.parse(process.env.SPOTS)) {
 await p.evaluate((pos)=>{const s=window.__game.sim; s.pos=pos.slice(); s.vel=[0,0,0];},pos); await w(6000);
 const r=await p.evaluate(()=>{ const sc=window.__scene, B=window.__game.buildings; const res={}; let bb=null, m=null;
  const inside=(x,y,z)=>B.some(b=>x>b.x0-0.3&&x<b.x1+0.3&&z>b.z0-0.3&&z<b.z1+0.3&&y<b.h+0.3&&y>(b.y0??0)-0.3);
  const test=(box,name)=>{ const sx=box.max.x-box.min.x, sy=box.max.y-box.min.y, sz=box.max.z-box.min.z; if (sy<1.6||Math.max(sx,sz)<1.5||Math.max(sx,sz)>200) return;
    const cx=(box.min.x+box.max.x)/2, cz=(box.min.z+box.max.z)/2, cy=box.min.y+Math.min(sy*0.4,3);
    if (!inside(cx,cy,cz)) { const k=name; (res[k]=res[k]||{n:0,ex:[]}); res[k].n++; if(res[k].ex.length<3) res[k].ex.push([cx|0,cy|0,cz|0,sx|0,sy|0,sz|0]); } };
  sc.traverseVisible(o=>{ if(o.isMesh&&!m){ m=new o.matrixWorld.constructor(); o.geometry.computeBoundingBox(); bb=o.geometry.boundingBox.clone(); } if(!o.isMesh||o.material.transparent) return; let q=o,nm=''; while(q&&!nm){nm=q.name;q=q.parent;} nm=(nm||'?')+':'+o.geometry.type;
    if(o.isInstancedMesh){ if(!o.geometry.boundingBox)o.geometry.computeBoundingBox(); for(let i=0;i<Math.min(o.count,400);i++){ o.getMatrixAt(i,m); bb.copy(o.geometry.boundingBox).applyMatrix4(m).applyMatrix4(o.matrixWorld); test(bb,nm+'[inst]'); } }
    else { if(!o.geometry.boundingBox)o.geometry.computeBoundingBox(); bb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); test(bb,nm); } });
  return res; });
 out.push([pos,r]);
}
console.log(JSON.stringify(out)); await b.close();