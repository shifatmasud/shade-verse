import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});const p=await b.newPage();
await p.setViewport({width:915,height:412,isMobile:true,hasTouch:true,deviceScaleFactor:1.75});
await p.evaluateOnNewDocument(()=>{window.__perfPin=1});
await p.goto('http://127.0.0.1:4311/?q=low&debug');await new Promise(r=>setTimeout(r,2500));await p.evaluate(()=>window.__game.start());
for(const [n,pos] of JSON.parse(process.env.SPOTS)){await p.evaluate((pos)=>{const s=window.__game.sim;s.pos=pos;s.vel=[0,0,0]},pos);await new Promise(r=>setTimeout(r,14000));
console.log(n, JSON.stringify(await p.evaluate(()=>{const out=[];const top=o=>{let t='',q=o;while(q){if(q.name)t=q.name;q=q.parent}return t};
window.__scene.traverseVisible(o=>{if(!o.isMesh&&!o.isPoints)return;if(!o.layers.test({mask:1}))return;const g=o.geometry;const tri=(g.index?g.index.count:g.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);const bs=g.boundingSphere||(g.computeBoundingSphere(),g.boundingSphere);out.push([Math.round(tri),top(o)||'?',o.name||o.parent?.name||'',o.material.type,o.frustumCulled?1:0,o.isInstancedMesh?o.count:0,Math.round(bs.radius),Object.keys(o.material.uniforms||{}).slice(0,3).join('/')])});
out.sort((a,b)=>b[0]-a[0]);return out.slice(0,14)})));}
await b.close();