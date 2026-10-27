import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: 'new', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width:390, height:780, hasTouch:true, isMobile:true });
const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,200))});
await p.goto('http://localhost:4173/',{waitUntil:'load'}); await new Promise(r=>setTimeout(r,1500));
await p.evaluate(()=>window.__game.start()); await new Promise(r=>setTimeout(r,600));
const out=process.argv[2];
await p.evaluate(async()=>{const g=window.__game,s=g.sim,w=(ms)=>new Promise(r=>setTimeout(r,ms));
 s.enemies.forEach(o=>{o.x=-300;o.z=-300;o.roof=undefined;});
 s.pos=[20,1,-212]; s.vel=[0,0,0]; s.yaw=Math.PI; s.ang=Math.PI; s.wall=null; await w(300);
 g.input.keys['w']=true; for(let i=0;i<60&&!s.swim;i++) await w(100); await w(1500); g.input.keys['w']=false;});
await p.screenshot({path:out+'-surface.png'});
// split: lower the camera pitch so it sits at the waterline
await p.evaluate(async()=>{const g=window.__game,s=g.sim,w=(ms)=>new Promise(r=>setTimeout(r,ms)); await w(600);});
const info=await p.evaluate(()=>{const u=document.getElementById('uw');return {cam:window.__cam,clip:u.style.clipPath,op:u.style.opacity,split:u.dataset.split}});
await p.screenshot({path:out+'-split.png'});
console.log(JSON.stringify(info),'errors',JSON.stringify(errs)); await b.close();
