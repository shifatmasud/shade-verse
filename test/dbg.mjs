import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: 'new', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width:390, height:780, hasTouch:true, isMobile:true });
await p.goto('http://localhost:4173/',{waitUntil:'load'}); await new Promise(r=>setTimeout(r,1500));
await p.evaluate(()=>window.__game.start()); await new Promise(r=>setTimeout(r,600));
const R=await p.evaluate(async()=>{const g=window.__game,s=g.sim,w=(ms)=>new Promise(r=>setTimeout(r,ms)); const log=[];
 s.enemies.forEach(o=>{o.x=-300;o.z=-300;}); s.pos=[20,1,-100]; s.vel=[0,0,0]; s.ground=true; await w(300);
 g.input.jumpQ=true; await w(200); g.input.swingQ=true; g.input.swing=true;
 for(let i=0;i<14;i++){ await w(150); log.push([s.pos.map(x=>+x.toFixed(0)).join(','), s.vel.map(x=>+x.toFixed(0)).join(','), s.web?'W':'-', s.ground?'G':'a', s.anchor.map(x=>+x.toFixed(0)).join(','), +s.rope.toFixed(0)].join(' | ')); }
 return log;});
console.log(R.join('\n')); await b.close();
