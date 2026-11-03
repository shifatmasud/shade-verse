import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:915,height:412,deviceScaleFactor:1.75,isMobile:true,hasTouch:true});
const w=ms=>new Promise(r=>setTimeout(r,ms));
await p.goto('http://127.0.0.1:4311/',{waitUntil:'load'}); await w(3000); await p.evaluate(()=>window.__game.start()); await w(2000);
for(const [n,pos] of JSON.parse(process.env.SPOTS)){
 await p.evaluate((pos)=>{const s=window.__game.sim;s.pos=pos;s.vel=[0,0,0]},pos); await w(8000);
 const r=await p.evaluate(()=>new Promise(res=>{const gl=window.__gl; const info=gl.info; info.autoReset=false; info.reset(); requestAnimationFrame(()=>requestAnimationFrame(()=>{const o={calls:info.render.calls,tris:info.render.triangles,points:info.render.points,lines:info.render.lines}; info.autoReset=true; res(o)}))}));
 // per-object triangles of the frame
 const top=await p.evaluate(()=>{const L=[]; window.__scene.traverse(o=>{if(!o.isInstancedMesh||!o.visible)return; const g=o.geometry; const t=(g.index?g.index.count:g.attributes.position.count)/3*o.count; if(t<9000)return; const m=o.material; const bb=new (g.attributes.position.array.constructor===Float32Array?Object:Object)(); g.computeBoundingBox(); const b=g.boundingBox; const mat=new o.matrix.constructor(); const pos=[]; for(let i=0;i<Math.min(3,o.count);i++){o.getMatrixAt(i,mat); pos.push([Math.round(mat.elements[12]),Math.round(mat.elements[13]),Math.round(mat.elements[14]),+mat.elements[0].toFixed(2)])} L.push([Math.round(t),o.count,m.type,m.transparent,m.opacity,m.vertexColors,[b.min.x,b.min.y,b.min.z,b.max.x,b.max.y,b.max.z].map(v=>+v.toFixed(1)),pos,o.parent&&o.parent.type,(o.parent&&o.parent.parent&&o.parent.parent.name)])}); return L.sort((a,b)=>b[0]-a[0])});
 console.log(JSON.stringify({n,r,top}));}
await b.close();