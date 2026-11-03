import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:915,height:412,hasTouch:true,isMobile:true});
const w=ms=>new Promise(r=>setTimeout(r,ms)); await p.goto('http://127.0.0.1:4311/',{waitUntil:'load'}); await w(2500); await p.evaluate(()=>window.__game.start()); await w(4000);
const n=await p.evaluate(()=>window.__game.buildings.filter(b=>b.kind==='solid'&&b.x1-b.x0<1.5).length);
const t=await p.evaluate(()=>window.__treePts[5]);
const r=await p.evaluate(async(t)=>{const s=window.__game.sim; const y0=s.pos[1]; s.pos=[t.x,s.pos[1]+0,t.z+3]; let min=9; const t0=performance.now(); while(performance.now()-t0<2000){ s.vel=[0,s.vel[1],-10]; await new Promise(r=>setTimeout(r,30)); min=Math.min(min,s.pos[2]-t.z);} return min;},t);
console.log(JSON.stringify({trunks:n, minDz:r}));
await b.close();