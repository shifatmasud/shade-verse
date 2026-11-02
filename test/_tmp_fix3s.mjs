
import puppeteer from 'puppeteer-core';
const [PORT,OUT,MODE]=process.argv.slice(2);
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage(); await p.setViewport({width:915,height:412});
const errors=[]; p.on('pageerror',e=>errors.push('PAGE '+String(e).slice(0,200))); p.on('console',m=>{ if(m.type()==='error'||/shader/i.test(m.text())) errors.push(m.text().slice(0,300)); });
await p.goto('http://127.0.0.1:'+PORT+'/',{waitUntil:'load'}); await p.waitForFunction(()=>!!window.__game,{timeout:120000});
for(let i=0;i<120;i++){ if(await p.evaluate(()=>{ if(window.__game.sim.mode!=='play') window.__game.start(); return window.__game.sim.mode})==='play') break; await new Promise(r=>setTimeout(r,1000)); }
await new Promise(r=>setTimeout(r,3000));
const W=ms=>new Promise(r=>setTimeout(r,ms));
const AGES=[0.03,0.12,0.25,0.45,0.75,1.2];
await p.evaluate(()=>{ const {sim}=window.__game; window.__ghostDisableCombat=true; const pp=[20,1,20]; sim.pos=[pp[0]-1,pp[1],pp[2]-16]; sim.vel=[0,0,0]; sim.ground=true; sim.web=false; sim.wall=null;
  const E=sim.enemies.filter(e=>!e.boss); const keep=E.find(e=>e.kind===0)||E[0]; E.forEach((e,i)=>{ if(e!==keep){ e.x=pp[0]+90+i*3; e.z=pp[2]+90; e.down=1000; } });
  const e=E.find(e=>e.kind===0)||E[0]; e.x=21; e.z=28; e.y=0; e.hp=999; e.down=0; e.atk=0; e.kb=[0,0]; e.vy=0; window.__E=e; if(window.__ghostSim){ window.__ghostSim.pos=[pp[0]-3,1,pp[2]-18]; }
  window.__camOv=[21,3.0,23.8, 21,1.3,28]; window.__ts=1; });
await W(2500);
await p.evaluate((MODE)=>{ const {sim}=window.__game, e=window.__E; e.x=21; e.z=28; e.y=0; window.__ts=0.00001; e.hp=0; e.down=3; e.koCol=0xa855f7;
  if(MODE==='before'){ window.__B={ x:e.x, y:e.y+1, z:e.z, t:0, r:5.5 }; sim.blasts.push(window.__B); } },MODE);
await W(900); const t0=await p.evaluate(()=>window.__game.sim.t);
let k=0;
for(const age of AGES){ await p.evaluate(([t0,age])=>{ const s=window.__game.sim; s.t=t0+age; if(window.__B){ window.__B.t=age; if(!s.blasts.includes(window.__B)&&age<0.85) s.blasts.push(window.__B); } },[t0,age]); await W(1300);
  await p.screenshot({path:`${OUT}/f${k++}.png`,clip:{x:257,y:21,width:400,height:350}}); }
console.log('ERRORS',errors.length,JSON.stringify(errors.slice(0,5)));
await b.close();
