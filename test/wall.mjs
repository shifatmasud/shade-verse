import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: 'new', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width:390, height:780, hasTouch:true, isMobile:true });
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('http://localhost:4173/',{waitUntil:'load'}); await new Promise(r=>setTimeout(r,1500));
await p.evaluate(()=>window.__game.start()); await new Promise(r=>setTimeout(r,600));
const R=await p.evaluate(async()=>{const g=window.__game,s=g.sim,w=(ms)=>new Promise(r=>setTimeout(r,ms)); const out={};
 s.enemies.forEach(o=>{o.x=-300;o.z=-300;o.roof=undefined;});
 const B=g.buildings.filter(b=>b.h>18&&b.h<34&&Math.abs(b.x0)<150&&Math.abs(b.z0)<150)[0];
 const zm=(B.z0+B.z1)/2;
 const face=async(yaw)=>{s.yaw=yaw;s.ang=yaw;};
 // street, face +x into west wall
 s.pos=[B.x0-1.2,1,zm]; s.vel=[0,0,0]; s.web=false; s.wall=null; face(Math.PI/2); await w(300);
 out.startGround=s.ground;
 g.input.keys['w']=true; await w(900); out.attached=!!s.wall; out.yClimb=+s.pos[1].toFixed(1); out.climbing=s.pos[1]>3;
 // wall run lateral
 g.input.keys['w']=false; g.input.keys['d']=true; const z0=s.pos[2]; await w(500); g.input.keys['d']=false; out.latMoved=+Math.abs(s.pos[2]-z0).toFixed(1); out.stillOnWall=!!s.wall;
 // wall jump
 const y1=s.pos[1]; g.input.jumpQ=true; await w(300); out.wallJumpOff=!s.wall; out.wallJumpAway=+(B.x0-s.pos[0]).toFixed(1); out.wallJumpVy=+s.vel[1].toFixed(1);
 // land back
 for(let i=0;i<80;i++){await w(50); if(s.ground)break;}
 // climb to top and vault
 s.pos=[B.x0-1.2,1,zm]; s.vel=[0,0,0]; s.wall=null; s.vaulted=0; face(Math.PI/2); await w(300);
 g.input.keys['w']=true; let top=false; for(let i=0;i<80;i++){await w(100); if(s.vaulted>0){top=true;break;}} g.input.keys['w']=false; await w(300);
 out.vaulted=top; out.onRoof=s.ground&&Math.abs(s.pos[1]-(B.h+1))<0.2; out.roofInside=s.pos[0]>B.x0&&s.pos[0]<B.x1;
 // detach pulling back
 s.pos=[B.x0-1.2,1,zm]; s.vel=[0,0,0]; s.wall=null; face(Math.PI/2); await w(200); g.input.keys['w']=true; await w(700); g.input.keys['w']=false; g.input.keys['s']=true; await w(300); g.input.keys['s']=false; out.detached=!s.wall;
 // wall -> swing
 s.pos=[B.x0-1.2,1,zm]; s.vel=[0,0,0]; s.wall=null; face(Math.PI/2); await w(200); g.input.keys['w']=true; await w(900); g.input.keys['w']=false; g.input.swingQ=true; g.input.swing=true; await w(600); out.wallToSwing=s.web&&!s.wall; g.input.swing=false;
 // higher jump
 s.pos=[B.x0-30,1,-200]; s.vel=[0,0,0]; s.wall=null; s.web=false; await w(500); const y0=s.pos[1]; g.input.jumpQ=true; let ap=y0; for(let i=0;i<40;i++){await w(40); ap=Math.max(ap,s.pos[1]);} out.jumpApex=+(ap-y0).toFixed(1);
 return out;});
console.log(JSON.stringify(R),'errors',JSON.stringify(errs));
const ok=R.attached&&R.climbing&&R.latMoved>2&&R.stillOnWall&&R.wallJumpOff&&R.wallJumpAway>1&&R.wallJumpVy>3&&R.vaulted&&R.onRoof&&R.roofInside&&R.detached&&R.wallToSwing&&R.jumpApex>3.5&&errs.length===0;
console.log(ok?'WALL PASS':'WALL FAIL'); await b.close(); process.exit(ok?0:1);
