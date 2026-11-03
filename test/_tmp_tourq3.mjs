
import puppeteer from 'puppeteer-core'; import fs from 'fs';
const CH=process.env.CHROME, out=process.argv[2]||'/tmp/tour', PH=!!process.env.PHONE;
const b=await puppeteer.launch({executablePath:CH,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:915,height:412,deviceScaleFactor:1.75,hasTouch:true,isMobile:true});
const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
const w=ms=>new Promise(r=>setTimeout(r,ms));
await p.goto('http://127.0.0.1:'+process.env.PORT+'/'+(process.env.QS||''),{waitUntil:'load'}); await w(3000);
await p.screenshot({path:`${out}_title.png`});
await p.evaluate(()=>window.__game.start()); for(let i=0;i<120&&(await p.evaluate(()=>window.__game.sim.mode))!=='play';i++) await w(500); await w(1500);
await p.screenshot({path:`${out}_start.png`});
const info=await p.evaluate(()=>{const s=window.__game.sim;const bo=s.enemies.find(e=>e.boss);return {pos:s.pos,boss:bo?[bo.x,bo.y,bo.z]:null,n:s.enemies.length}});
fs.writeFileSync(`${out}_info.json`,JSON.stringify(info));
const shots=JSON.parse(fs.readFileSync(process.env.SHOTS,'utf8'));
for(const sh of shots){
  await p.evaluate((sh)=>{const s=window.__game.sim; s.vel=[0,0,0]; s.web=false; s.swim=false;
    if(sh.pos) s.pos=sh.pos.slice(); if(sh.yaw!==undefined) s.yaw=sh.yaw;
    if(sh.cam) window.__camOv=sh.cam; else delete window.__camOv;
    if(sh.tod!==undefined) window.__todPh=sh.tod; else delete window.__todPh;
    if(sh.clearE) s.enemies.forEach(o=>{if(!o.boss){o.x=-280;o.z=280;}});},sh);
  if(sh.pre) await p.evaluate(sh.pre);
  await w(sh.wait||3000);
  await p.screenshot({path:`${out}_${sh.n}.png`}); fs.writeFileSync(`${out}_${sh.n}.json`,JSON.stringify(await p.evaluate(()=>({pos:window.__game.sim.pos,swim:window.__game.sim.swim,dive:window.__game.sim.dive}))));
}
fs.writeFileSync(`${out}_errs.txt`,errs.slice(0,20).join('\n'));
await b.close();
