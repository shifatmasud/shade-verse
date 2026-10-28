import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: 'new', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width:390, height:780, hasTouch:true, isMobile:true });
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('http://localhost:4173/',{waitUntil:'load'}); await p.waitForFunction(()=>!!window.__game,{timeout:15000}); await new Promise(r=>setTimeout(r,1000));
await p.evaluate(()=>window.__game.start()); await new Promise(r=>setTimeout(r,600));
const R=await p.evaluate(async()=>{const g=window.__game,s=g.sim,w=(ms)=>new Promise(r=>setTimeout(r,ms)); const out={};
 // street spawn: pick a street point clear of buildings
 const place=()=>{ s.pos=[20,1,20]; s.vel=[0,0,0]; s.web=false; s.ang=0; };
 place(); await w(300); out.streetGround=s.ground; out.streetY=+s.pos[1].toFixed(2);
 // 1) punch kills enemy: 3 hits -> KO, score +2
 const e=s.enemies[0]; e.x=20; e.z=22.2; e.y=1; e.hp=3; e.down=0; e.atk=0; e.hit=0; s.enemies.forEach((o,i)=>{if(i>0){o.x=-300;o.z=-300;}});
 const sc0=s.score,k0=s.kos; for(let i=0;i<3;i++){ g.input.attackQ=true; await w(420); }
 out.koDelta=s.kos-k0; out.scoreDelta=s.score-sc0; out.enemyDown=e.down>0;
 // 2) enemy attack hurts when not dodging
 s.enemies.forEach((o,i)=>{if(i!==1){o.x=-300;o.z=-300;o.down=0;}}); const f=s.enemies[1]; f.x=20; f.z=22; f.y=1; f.hp=3; f.down=0; f.atk=0; f.hit=0; s.hp=100; s.dodgeT=0; s.pos=[20,1,20]; s.vel=[0,0,0]; await w(1700); out.hpAfterHit=Math.round(s.hp);
 // 3) dodge avoids the attack
 f.x=20; f.z=22; f.atk=0; f.hit=0; s.hp=100; s.lastHit=s.t; await w(500); g.input.dodgeQ=true; await w(250); out.dodgeT=+s.dodgeT.toFixed(2); s.dodgeT=0.5; await w(900); out.hpAfterDodgeWindow=Math.round(s.hp); 
 // 4) landing: drop from height onto street -> hard landing stun & hp loss, grounded
 s.enemies.forEach(o=>{o.x=-300;o.z=-300;}); s.pos=[20,60,20]; s.vel=[0,0,0]; s.ground=false; s.hp=100; let hard=0; for(let i=0;i<200;i++){ await w(50); if(s.landHard>0) hard=Math.max(hard,s.landHard); if(s.ground&&s.pos[1]<=1.01&&i>3)break; }
 out.landGround=s.ground; out.landHard=+hard.toFixed(2); out.hpAfterLand=Math.round(s.hp);
 // 5) soft landing from small hop causes no stun
 s.pos=[20,5,20]; s.vel=[0,0,0]; s.ground=false; s.hp=100; s.landHard=0; await w(900); out.softStun=s.landHard; out.softHp=Math.round(s.hp);
 // 6) KO respawn: hp<=0 resets hp and mode stays play
 s.lastHit=-99; s.hp=0; await w(250); out.hpReset=Math.round(s.hp); out.respawned=Math.hypot(s.pos[0]-s.safe[0],s.pos[2]-s.safe[2])<2; out.mode=s.mode; return out;});
console.log(JSON.stringify(R),'errors',JSON.stringify(errs));
const ok = R.streetGround && R.koDelta===1 && R.scoreDelta===2 && R.hpAfterHit<100 && R.hpAfterDodgeWindow===100 && R.landGround && R.landHard>0 && R.hpAfterLand<100 && R.softStun===0 && R.softHp===100 && R.hpReset===100 && R.respawned && R.mode==='play' && errs.length===0;
console.log(ok?'COMBAT PASS':'COMBAT FAIL'); await b.close(); process.exit(ok?0:1);
