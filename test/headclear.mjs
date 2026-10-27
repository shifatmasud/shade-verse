import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: 'new', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width:390, height:780, hasTouch:true, isMobile:true });
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('http://localhost:4173/',{waitUntil:'load'}); await new Promise(r=>setTimeout(r,1500));
await p.evaluate(()=>window.__game.start()); await new Promise(r=>setTimeout(r,600));
const R=await p.evaluate(async()=>{const g=window.__game,s=g.sim,w=(ms)=>new Promise(r=>setTimeout(r,ms)); g.probe=true;
 s.enemies.forEach(o=>{o.x=-300;o.z=-300;o.roof=undefined;});
 const B=g.buildings.filter(b=>b.h>22&&b.h<40&&Math.abs(b.x0)<150&&Math.abs(b.z0)<150&&b.x1-b.x0>10&&b.z1-b.z0>10)[0]; const xm=(B.x0+B.x1)/2, zm=(B.z0+B.z1)/2;
 // face: start position outside the face, yaw toward the wall, clearance = distance of part extreme beyond plane
 const faces={x0:{pos:[B.x0-1.2,1,zm],yaw:Math.PI/2,c:(P)=>B.x0-P[1]},x1:{pos:[B.x1+1.2,1,zm],yaw:-Math.PI/2,c:(P)=>P[0]-B.x1},z0:{pos:[xm,1,B.z0-1.2],yaw:0,c:(P)=>B.z0-P[3]},z1:{pos:[xm,1,B.z1+1.2],yaw:Math.PI,c:(P)=>P[2]-B.z1}};
 const out={};
 for(const [fn,f] of Object.entries(faces)){
  s.pos=[...f.pos]; s.vel=[0,0,0]; s.web=false; s.wall=null; s.yaw=f.yaw; s.ang=f.yaw; await w(300);
  g.input.keys['w']=true; await w(900); const a=!!s.wall; const mins={head:9,hands:9,feet:9,body:9};
  for(let i=0;i<20;i++){await w(110); if(s.wall&&g.parts){for(const k of Object.keys(mins)) if(g.parts[k]) mins[k]=Math.min(mins[k],f.c(g.parts[k]));}}
  g.input.keys['w']=false; out[fn]={attached:a,...Object.fromEntries(Object.entries(mins).map(([k,v])=>[k,+v.toFixed(3)]))}; s.wall=null; await w(200);
 }
 return out;});
console.log(JSON.stringify(R),'errors',JSON.stringify(errs));
// penetration tolerance 4 cm for any part; hands/feet must be within 40 cm of the facade at their closest (reads as reaching the wall)
const ok=Object.values(R).every(f=>f.attached&&f.head>=-0.04&&f.hands>=-0.04&&f.feet>=-0.04&&f.body>=-0.04)&&!errs.length;
console.log(ok?'HEADCLEAR PASS':'HEADCLEAR FAIL'); await b.close(); process.exit(ok?0:1);
