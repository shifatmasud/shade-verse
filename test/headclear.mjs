import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: 'new', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width:390, height:780, hasTouch:true, isMobile:true });
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('http://localhost:4173/',{waitUntil:'load'}); await new Promise(r=>setTimeout(r,1500));
await p.evaluate(()=>window.__game.start()); await new Promise(r=>setTimeout(r,600));
const R=await p.evaluate(async()=>{const g=window.__game,s=g.sim,w=(ms)=>new Promise(r=>setTimeout(r,ms)); g.probe=true;
 s.enemies.forEach(o=>{o.x=-300;o.z=-300;o.roof=undefined;});
 const B=g.buildings.filter(b=>b.h>18&&b.h<34&&Math.abs(b.x0)<150&&Math.abs(b.z0)<150)[0]; const zm=(B.z0+B.z1)/2;
 s.pos=[B.x0-1.2,1,zm]; s.vel=[0,0,0]; s.web=false; s.wall=null; s.yaw=Math.PI/2; s.ang=Math.PI/2; await w(300);
 g.input.keys['w']=true; await w(900); const out={attached:!!s.wall,clear:[]};
 for(let i=0;i<12;i++){await w(120); if(s.wall&&g.headBox) out.clear.push(+(B.x0-g.headBox[1]).toFixed(3));}
 g.input.keys['w']=false; out.minClear=Math.min(...out.clear); out.n=out.clear.length; return out;});
console.log(JSON.stringify(R),'errors',JSON.stringify(errs));
const ok=R.attached&&R.n>=6&&R.minClear>=0.02&&!errs.length; console.log(ok?'HEADCLEAR PASS':'HEADCLEAR FAIL'); await b.close(); process.exit(ok?0:1);
