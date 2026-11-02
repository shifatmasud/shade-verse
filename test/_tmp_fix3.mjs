
import puppeteer from 'puppeteer-core';
const [PORT,OUT,MODE]=process.argv.slice(2);
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage(); await p.setViewport({width:915,height:412});
const errors=[]; p.on('pageerror',e=>errors.push('PAGE '+String(e).slice(0,200))); p.on('console',m=>{ if(m.type()==='error'||/shader/i.test(m.text())) errors.push(m.text().slice(0,200)); });
await p.goto('http://127.0.0.1:'+PORT+'/',{waitUntil:'load'}); await p.waitForFunction(()=>!!window.__game,{timeout:120000});
for(let i=0;i<120;i++){ if(await p.evaluate(()=>{ if(window.__game.sim.mode!=='play') window.__game.start(); return window.__game.sim.mode})==='play') break; await new Promise(r=>setTimeout(r,1000)); }
await new Promise(r=>setTimeout(r,3000));
const W=ms=>new Promise(r=>setTimeout(r,ms));
// visual: KO the same enemy twice, as each hero (koCol set the way the sim sets it), frames at 3 ages
for(const who of ['shadow','ghost']){
 await p.evaluate((who)=>{ const {sim}=window.__game; window.__ghostDisableCombat=true; const pp=[20,1,20]; sim.pos=[pp[0]-1,pp[1],pp[2]-16]; sim.vel=[0,0,0]; sim.ground=true; sim.web=false; sim.wall=null;
  const E=sim.enemies.filter(e=>!e.boss); E.forEach((e,i)=>{ if(i>0){ e.x=pp[0]+90+i*3; e.z=pp[2]+90; e.down=1000; } });
  const e=E[0]; e.x=pp[0]+1; e.z=pp[2]+8; e.y=pp[1]-1; e.hp=999; e.down=0; e.atk=0; e.kb=[0,0]; e.vy=0; window.__E=e; if(window.__ghostSim){ window.__ghostSim.pos=[pp[0]-3,1,pp[2]-18]; }
  window.__camOv=[pp[0]+1,pp[1]+3.4,pp[2]+4.3, pp[0]+1,pp[1]+0.2,pp[2]+8]; window.__ts=1; },who);
 await W(2500);
 if(MODE==='after') await p.evaluate(()=>{window.__KOCOL=1}); await p.evaluate((who)=>{ const {sim}=window.__game, e=window.__E; e.x=21; e.z=28; e.y=0; e.hp=0; e.down=3; const col= who==='ghost'?0xff1a96:0xa855f7; e.koCol=col; const blast={ x:e.x, y:e.y+1, z:e.z, t:0, r:5.5 }; if(window.__KOCOL) blast.col=col; sim.blasts.push(blast); window.__ts=0.25; },who);
 for(const [k,ms] of [['a',350],['b',900],['c',1700]]){ await W(ms); await p.evaluate(()=>{window.__ts=0.0001}); await p.screenshot({path:`${OUT}/ko_${who}_${k}.png`,clip:{x:257,y:31,width:400,height:350}}); await p.evaluate(()=>{window.__ts=0.25}); }
 await p.evaluate(()=>{window.__ts=4}); await W(1500);
}

// real path: who landed the KO sets the colour (sim heroCol -> enemy.koCol)
const real=await p.evaluate(async()=>{ const W=ms=>new Promise(r=>setTimeout(r,ms)); const {sim,input}=window.__game, g=window.__ghostSim; window.__ts=1; delete window.__camOv;
 const E=sim.enemies.filter(e=>!e.boss); const out={};
 // Shadow: snare discharge KO
 sim.pos=[20,1,20]; sim.vel=[0,0,0]; sim.ground=true; sim.web=false; sim.wall=null; sim.snareT=0; sim.snareCd=0; window.__ghostDisableCombat=true; if(g){ g.pos=[-60,1,-60]; }
 E.forEach((e,i)=>{ e.x=60+i*3; e.z=90; e.down=1000; }); const a=E[1]; a.x=21; a.z=22.5; a.y=0; a.hp=1; a.down=0; a.atk=0; a.kb=[0,0]; delete a.koCol;
 input.specialQ=true; for(let i=0;i<80&&!(a.down>0);i++) await W(100); out.shadow={down:a.down>0, koCol:a.koCol};
 // Ghost: her own special KO
 if(g){ window.__ghostDisableCombat=true; a.down=1000; sim.pos=[6,1,14]; g.pos=[17.4,1,18.5]; g.vel=[0,0,0]; g.ground=true; g.web=false; g.wall=null; g.ang=0; g.yaw=0; g.snareT=0; g.snareCd=0; g.enemies=sim.enemies;
  const b2=E[2]; b2.x=17.4; b2.z=25.5; b2.y=0; b2.hp=1; b2.down=0; b2.atk=0; b2.kb=[0,0]; delete b2.koCol; window.__ghostForceSpecial=true;
  for(let i=0;i<200&&!(b2.down>0);i++){ if(i%40===0){ window.__ghostForceSpecial=true; } await W(100); } out.gs={snareT:g.snareT, d:Math.hypot(b2.x-g.pos[0],b2.z-g.pos[2])}; out.ghost={down:b2.down>0, koCol:b2.koCol}; }
 return out; });
console.log('REAL',JSON.stringify(real));
console.log('ERRORS',errors.length,JSON.stringify(errors.slice(0,5)));
await b.close();
