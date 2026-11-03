import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:915,height:412});
await p.goto('http://127.0.0.1:4311/?q=low',{waitUntil:'load'}); await new Promise(r=>setTimeout(r,2000));
await p.evaluate(()=>window.__game.start()); await new Promise(r=>setTimeout(r,6000));
await p.evaluate(()=>{const s=window.__game.sim; s.pos=[-60,-0.6,-640]; s.vel=[0,0,0]; window.__ringForce=1; window.__camOv=[-55,2.6,-636,-60,-1.0,-641]; window.__todPh=1.4;});
await new Promise(r=>setTimeout(r,5000));
console.log(JSON.stringify(await p.evaluate(()=>{const r=window.__ring; const s=window.__game.sim; return {has:!!r, vis:r&&r.visible, pos:r&&r.position.toArray(), sc:r&&r.children.map(c=>c.scale.x), op:r&&r.children.map(c=>c.material.uniforms?c.material.uniforms.opacity.value:c.material.opacity), simpos:s.pos, swim:s.swim};})));
await p.screenshot({path:'/tmp/rg.png'}); await b.close();