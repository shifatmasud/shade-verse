import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: 'new', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width:390, height:780, hasTouch:true, isMobile:true });
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('http://localhost:4173/',{waitUntil:'load'}); await new Promise(r=>setTimeout(r,1500));
await p.evaluate(()=>window.__game.start()); await new Promise(r=>setTimeout(r,600));
const R=await p.evaluate(async()=>{const g=window.__game,s=g.sim,w=(ms)=>new Promise(r=>setTimeout(r,ms)); const out={};
 s.enemies.forEach(o=>{o.x=-300;o.z=-300;o.roof=undefined;});
 const roofB=window.__game.sim.enemies; // spawn a roof enemy by hand: use first building under spawn
 const e=s.enemies[0]; e.roof={x0:s.pos[0]-10,x1:s.pos[0]+10,z0:s.pos[2]-10,z1:s.pos[2]+10}; e.x=s.pos[0]+2.5; e.z=s.pos[2]; e.y=s.pos[1]; e.hp=3; e.down=0; e.hit=0; e.atk=0; s.ang=Math.PI/2; await w(400);
 out.roofStand=s.ground; const k0=s.kos; for(let i=0;i<3;i++){ g.input.attackQ=true; await w(450);} out.roofKO=s.kos-k0;
 // roof enemy stays inside its roof bounds when chasing from afar
 const f=s.enemies[1]; f.roof={x0:s.pos[0]+20,x1:s.pos[0]+40,z0:s.pos[2]-10,z1:s.pos[2]+10}; f.x=s.pos[0]+22; f.z=s.pos[2]; f.y=s.pos[1]; f.hp=3; f.down=0; await w(1500); out.insideRoof=f.x>=f.roof.x0&&f.x<=f.roof.x1&&f.z>=f.roof.z0&&f.z<=f.roof.z1;
 return out;});
console.log(JSON.stringify(R),'errors',JSON.stringify(errs));
const ok=R.roofStand&&R.roofKO===1&&R.insideRoof&&errs.length===0; console.log(ok?'ROOF PASS':'ROOF FAIL'); await b.close(); process.exit(ok?0:1);
