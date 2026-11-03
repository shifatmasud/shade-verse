import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:915,height:412,deviceScaleFactor:1.75,isMobile:true,hasTouch:true});
const w=ms=>new Promise(r=>setTimeout(r,ms));
await p.goto('http://127.0.0.1:4311/',{waitUntil:'load'}); await w(3000); await p.evaluate(()=>window.__game.start()); await w(2000);
for(const [n,pos] of JSON.parse(process.env.SPOTS)){
 await p.evaluate((pos)=>{const s=window.__game.sim;s.pos=pos;s.vel=[0,0,0]},pos); await w(8000);
 const r=await p.evaluate(()=>new Promise(res=>{const gl=window.__gl; const info=gl.info; info.autoReset=false; info.reset(); requestAnimationFrame(()=>requestAnimationFrame(()=>{const o={calls:info.render.calls,tris:info.render.triangles,points:info.render.points,lines:info.render.lines}; info.autoReset=true; res(o)}))}));
 // per-object triangles of the frame
 const top=await p.evaluate(()=>{const L=[]; const cam=window.__scene.children.find(c=>c.isCamera); window.__scene.traverse(o=>{if(!(o.isMesh)||!o.visible)return; let vis=true,q=o; while(q){if(!q.visible)vis=false;q=q.parent} if(!vis)return; const g=o.geometry; let t=(g.index?g.index.count:g.attributes.position.count)/3; if(o.isInstancedMesh)t*=o.count; let n=o.name,qq=o,path=[]; while(qq){if(qq.name)path.push(qq.name);qq=qq.parent} L.push([Math.round(t),o.isInstancedMesh?('inst'+o.count):'', (o.material&&(o.material.type))||'', path.slice(0,3).join('<')||'?', o.frustumCulled])}); return L.sort((a,b)=>b[0]-a[0]).slice(0,25)});
 console.log(JSON.stringify({n,r,top}));}
await b.close();