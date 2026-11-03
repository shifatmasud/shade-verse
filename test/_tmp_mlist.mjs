
import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:915,height:412});
const w=ms=>new Promise(r=>setTimeout(r,ms));
await p.goto('http://127.0.0.1:4311/',{waitUntil:'load'}); await w(3000);
await p.evaluate(()=>window.__game.start()); await w(2000);
await p.evaluate(()=>{const s=window.__game.sim; s.pos[0]=-110; s.pos[2]=-740; s.pos[1]=2;}); await w(8000);
console.log(await p.evaluate(()=>{const out=[]; window.__scene.traverse(o=>{ if(!(o.isMesh)||!o.visible) return; const g=o.geometry; if(!g.boundingBox) g.computeBoundingBox(); const bb=g.boundingBox.clone().applyMatrix4(o.matrixWorld); const sx=bb.max.x-bb.min.x, sz=bb.max.z-bb.min.z, cx=(bb.max.x+bb.min.x)/2, cz=(bb.max.z+bb.min.z)/2; if (sx>60 && sx<3000 && Math.abs(cx+160)<400 && Math.abs(cz+820)<400) out.push([o.name||o.type, g.attributes.position.count, Math.round(sx), Math.round(sz), Math.round(cx), Math.round(cz), Math.round(bb.min.y), Math.round(bb.max.y), o.material&&o.material.type, !!(o.material&&o.material.transparent), o.renderOrder].join(' ')); }); return out.join('\n');}));
await b.close();