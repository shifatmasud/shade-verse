
import puppeteer from 'puppeteer-core';
const [PORT,OUT]=process.argv.slice(2);
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage(); await p.setViewport({width:915,height:412});
const errors=[]; p.on('pageerror',e=>errors.push('PAGE '+String(e).slice(0,200))); p.on('console',m=>{ if(m.type()==='error'||/shader/i.test(m.text())) errors.push(m.text().slice(0,200)); });
await p.goto('http://127.0.0.1:'+PORT+'/',{waitUntil:'load'}); await p.waitForFunction(()=>!!window.__game,{timeout:120000});
for(let i=0;i<120;i++){ if(await p.evaluate(()=>{ if(window.__game.sim.mode!=='play') window.__game.start(); return window.__game.sim.mode})==='play') break; await new Promise(r=>setTimeout(r,1000)); }
await new Promise(r=>setTimeout(r,3000));
const spots=[['street',[20,1,20]],['street2',[20,1,60]]];
let k=0;
for(const [nm,pp] of spots){
 await p.evaluate((pp)=>{ const {sim}=window.__game; window.__ghostDisableCombat=true; sim.pos=[...pp]; sim.vel=[0,0,0]; sim.yaw=0; sim.ang=0; sim.ground=true; sim.web=false; sim.wall=null;
  const E=sim.enemies.filter(e=>!e.boss); E.forEach((e,i)=>{ if(i>0){ e.x=pp[0]+90+i*3; e.z=pp[2]+90; e.down=1000; } });
  const e=E[0]; e.x=pp[0]; e.z=pp[2]+7; e.y=pp[1]-1; e.hp=999; e.down=0; e.atk=0; e.kb=[0,0]; e.vy=0; e.spd=0; window.__E=e;
  window.__camOv=[pp[0]+1.2,pp[1]+2.4,pp[2]+1.5, pp[0],pp[1]+1.6,pp[2]+7]; window.__ts=0.05; }, pp);
 await new Promise(r=>setTimeout(r,2500));
 await p.evaluate((pp)=>{ const {sim}=window.__game; const e=sim.aimE||window.__E; window.__E=e; const y=e.y+2.2; window.__camOv=[e.x+0.6,y+0.4,e.z-3.6, e.x,y,e.z]; },pp);
 await new Promise(r=>setTimeout(r,1200));
 const vis=await p.evaluate(()=>window.__retVis);
 await p.screenshot({path:`${OUT}/ret_${nm}.png`, clip:{x:307,y:56,width:300,height:300}});
 console.log(nm,'retVis',vis);
}
console.log('ERRORS',errors.length,JSON.stringify(errors.slice(0,5)));
await b.close();
