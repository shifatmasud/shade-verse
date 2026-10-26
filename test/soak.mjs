import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: 'new', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--js-flags=--expose-gc'] });
const p = await b.newPage(); await p.setViewport({ width:390, height:780, hasTouch:true, isMobile:true });
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('http://localhost:4173/',{waitUntil:'load'}); await new Promise(r=>setTimeout(r,1500));
await p.evaluate(()=>window.__game.start());
const T=Date.now(); const rows=[];
while(Date.now()-T<330000){
 await p.evaluate(async()=>{const g=window.__game,s=g.sim; for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,100)); if(!s.web&&!s.ground&&s.vel[1]<2&&s.pos[1]>25){g.input.swingQ=true;g.input.swing=true;} else if(s.web&&s.webT>1.4){g.input.swing=false;} g.input.keys['w']=true; if(s.ground&&i%6==0)g.input.jumpQ=true;}});
 const m=await p.evaluate(()=>{window.gc&&window.gc();return {heap:Math.round(performance.memory.usedJSHeapSize/1048576),fps:Math.round(window.__game.perf.fps),flight:Math.round(window.__game.sim.time),swings:window.__game.sim.swings,mode:window.__game.sim.mode}});
 rows.push({t:Math.round((Date.now()-T)/1000),...m}); }
console.log(JSON.stringify(rows)); console.log('errors',JSON.stringify(errs.slice(0,5))); await b.close();
