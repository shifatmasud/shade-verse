import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});const p=await b.newPage();await p.setViewport({width:915,height:412,isMobile:true,hasTouch:true,deviceScaleFactor:1.75});
const w=ms=>new Promise(r=>setTimeout(r,ms));
await p.goto('http://127.0.0.1:'+process.env.PORT+'/?q=low');await w(3000);await p.evaluate(()=>window.__game.start());
for(let i=0;i<120&&(await p.evaluate(()=>window.__game.sim.mode))!=='play';i++) await w(500); await w(3000);
const r=await p.evaluate(()=>{const out=[];window.__scene.traverse(o=>{if(!o.isMesh||o.isInstancedMesh)return;const g=o.geometry;const tri=(g.index?g.index.count:g.attributes.position.count)/3;if(tri<15000)return;const m=o.material;out.push([tri,o.frustumCulled,o.name,o.parent&&o.parent.name,Object.keys(m.uniforms||{}).slice(0,12).join(','),(m.vertexShader||'').slice(0,200), Object.keys(g.attributes).join(','), g.drawRange.count]);});return out;});
for(const e of r) console.log(JSON.stringify(e)); await b.close();