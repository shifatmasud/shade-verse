
import puppeteer from 'puppeteer-core'; import fs from 'fs'; import { waveSumJS } from '/tmp/wv.mjs';
const ISL={cx:-160,cz:-820}; const surf=(x,z,t)=>{const zk=Math.max(0,Math.min(1,(z+300)/-450)), ik=Math.max(0,Math.min(1,(Math.hypot(x-ISL.cx,z-ISL.cz)-105)/110)), sk=(1+1.3*zk*zk*(3-2*zk))*(0.22+0.78*ik*ik*(3-2*ik)); return -1+sk*waveSumJS(x,z,t);};
const CH=process.env.CHROME, url=process.argv[2], out=process.argv[3], PH=!!process.env.PHONE;
const b=await puppeteer.launch({executablePath:CH,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage(); await p.setViewport(PH?{width:915,height:412,deviceScaleFactor:1,hasTouch:true,isMobile:true}:{width:1280,height:720,deviceScaleFactor:1});
const errs=[]; p.on('pageerror',e=>errs.push('PAGE '+String(e))); p.on('console',m=>{if(m.type()==='error'||/shader|GL_INVALID|ERROR/i.test(m.text()))errs.push(m.type()+' '+m.text())});
const w=ms=>new Promise(r=>setTimeout(r,ms));
await p.goto(url,{waitUntil:'load'}); await w(3000);
await p.evaluate(()=>window.__game.start()); for(let i=0;i<120&&(await p.evaluate(()=>window.__game.sim.mode))!=='play';i++) await w(500); await w(1500);
const shots=JSON.parse(fs.readFileSync(process.env.SHOTS,'utf8')); const res=[];
for(const sh of shots){
  if(sh.live){ await p.evaluate((sh)=>{const s=window.__game.sim; delete window.__camOv; window.__ts=sh.ts??1; s.t=sh.t; s.pos=sh.pos.slice(); s.vel=[0,0,0]; s.swim=true; s.dive=false; s.yaw=sh.yaw||0; window.__todPh=sh.tod??0.35; s.enemies.forEach(o=>{if(!o.boss){o.x=-280;o.z=280;}});},sh); await w(2500);
    for(let k=0;k<sh.k;k++){ if(sh.walk) await p.keyboard.down('KeyW'); await w(sh.gap||900); await p.evaluate(()=>{window.__ts=0}); await w(1200); await p.screenshot({path:`${out}_${sh.n}${k}.png`}); const wl=await p.evaluate(()=>[window.__wl, window.__game.sim.pos, window.__game.sim.swim]); console.log(sh.n+k, JSON.stringify(wl)); await p.evaluate((ts)=>{window.__ts=ts},sh.ts??1); }
    await p.keyboard.up('KeyW'); continue; }
  const set=async(cy)=>p.evaluate((sh,cy)=>{const s=window.__game.sim; s.vel=[0,0,0]; s.web=false; s.t=sh.t; window.__ts=0; s.pos=sh.pos.slice(); if(sh.hy!=null) s.pos[1]=sh.hy; s.swim=true; s.dive=false; s.yaw=sh.yaw||0;
    const c=sh.cam.slice(); c[1]=cy; c[4]=cy+sh.pitch; window.__camOv=c; window.__todPh=sh.tod??0.35; s.enemies.forEach(o=>{if(!o.boss){o.x=-280;o.z=280;}});},sh,cy);
  const cy=surf(sh.cam[0],sh.cam[2],sh.t)+sh.off; sh.hy=surf(sh.pos[0],sh.pos[2],sh.t)-0.3; await set(cy); await w(1500);
  await w(sh.wait||2000);
  await p.screenshot({path:`${out}_${sh.n}.png`}); const wl=await p.evaluate(()=>window.__wl); res.push([sh.n,cy,wl]); console.log(sh.n, cy.toFixed(3), JSON.stringify(wl));
}
fs.writeFileSync(`${out}_errs.txt`,errs.slice(0,40).join('\n')); console.log('ERRS',errs.length);
await b.close();
