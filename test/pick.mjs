import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: 'new', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width:390, height:780, hasTouch:true, isMobile:true });
await p.goto('http://localhost:4173/',{waitUntil:'load'}); await new Promise(r=>setTimeout(r,1500));
await p.evaluate(()=>window.__game.start()); await new Promise(r=>setTimeout(r,500));
const r=await p.evaluate(async()=>{const s=window.__game.sim; const o=s.orbs[0]; const before=s.score; s.pos=[o[0],o[1],o[2]-3]; s.vel=[0,0,0]; await new Promise(r=>setTimeout(r,400)); return {before,after:s.score,time:s.time, minDist:Math.min(...s.orbs.map(q=>Math.hypot(q[0]-s.pos[0],q[2]-s.pos[2])))}});
console.log(JSON.stringify(r)); await p.screenshot({path:'/tmp/pick.png'}); await b.close();
