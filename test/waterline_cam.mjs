
import puppeteer from 'puppeteer-core'; import fs from 'fs';
const CH=process.env.CHROME, url=process.argv[2], out=process.argv[3], PH=!!process.env.PHONE;
const b=await puppeteer.launch({executablePath:CH,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage(); await p.setViewport(PH?{width:844,height:390,deviceScaleFactor:1,hasTouch:true,isMobile:true}:{width:960,height:540,deviceScaleFactor:1});
const errs=[]; p.on('pageerror',e=>errs.push('PAGE '+String(e))); p.on('console',m=>{if(m.type()==='error')errs.push(m.type()+' '+m.text())});
const w=ms=>new Promise(r=>setTimeout(r,ms));
await p.goto(url,{waitUntil:'load'}); await w(3000);
await p.evaluate(()=>window.__game.start()); for(let i=0;i<120&&(await p.evaluate(()=>window.__game.sim.mode))!=='play';i++) await w(500); await w(1500);
const X0=+(process.env.X0||30), Z0=+(process.env.Z0||-262), T0=+(process.env.T0||40), TOD=+(process.env.TOD||0.35), OFF=+(process.env.OFF||0.04);
await p.evaluate((X0,Z0,T0,TOD)=>{const s=window.__game.sim; s.t=T0; window.__ts=0; s.pos=[X0,-1.3,Z0+8]; s.vel=[0,0,0]; s.swim=true; s.dive=false; s.web=false; window.__todPh=TOD; s.enemies.forEach(o=>{if(!o.boss){o.x=-280;o.z=280;}}); window.__camOv=[X0,-1,Z0,X0,-1,Z0-10];},X0,Z0,T0,TOD);
await w(2500);
// find the surface under the lens: dy = cam.y - surface
let cy=-1; for(let i=0;i<4;i++){ const dy=await p.evaluate(()=>window.__wl?window.__wl[1]:null); if(dy==null){await w(800);continue;} cy=cy-dy+OFF; await p.evaluate((X0,Z0,cy)=>{window.__camOv=[X0,cy,Z0,X0,cy,Z0-10];},X0,Z0,cy); await w(1200); }
console.log('cy',cy, await p.evaluate(()=>window.__wl&&window.__wl[1]));
const MOVE=process.env.MOVE||'pan', N=+(process.env.N||40), CAP=JSON.parse(process.env.CAP||'[8,16,24,32]');
const res=await p.evaluate((X0,Z0,cy,MOVE,N,CAP)=>new Promise(done=>{
  const cvs=[...document.querySelectorAll('canvas')].sort((a,b)=>b.width*b.height-a.width*a.height)[0];
  const pose=(i)=>{ const u=i/(N-1); let yaw=0,pit=0,x=X0,z=Z0,y=cy;
    if(MOVE==='pan'){ yaw=(-35+70*u)*Math.PI/180; pit=(6*Math.sin(u*Math.PI*3))*Math.PI/180; }
    else if(MOVE==='tilt'){ pit=(-14+28*Math.abs(Math.sin(u*Math.PI*1.5)))*Math.PI/180; yaw=10*Math.sin(u*6.28)*Math.PI/180; }
    else if(MOVE==='dolly'){ z=Z0-u*12; x=X0+3*Math.sin(u*6.28); yaw=8*Math.sin(u*9)*Math.PI/180; }
    const dx=-Math.sin(yaw)*Math.cos(pit), dz=-Math.cos(yaw)*Math.cos(pit), dyv=Math.sin(pit);
    return [x,y,z,x+10*dx,y+10*dyv,z+10*dz]; };
  let i=-3; const shots={}, lines=[];
  // static reference: converged line at each captured pose
  const run=()=>{ requestAnimationFrame(()=>{
      if(i>=0){ lines.push(window.__wl?window.__wl[0].slice():null);
        if(CAP.includes(i)){ const c=document.createElement('canvas'); c.width=cvs.width; c.height=cvs.height; c.getContext('2d').drawImage(cvs,0,0); shots[i]=c.toDataURL('image/png'); } }
      i++; if(i>=N){ done({shots,lines}); return; }
      window.__camOv=pose(Math.max(0,i)); run(); }); };
  window.__camOv=pose(0); run();
}),X0,Z0,cy,MOVE,N,CAP);
for(const k of Object.keys(res.shots)){ fs.writeFileSync(`${out}_m${k}.png`, Buffer.from(res.shots[k].split(',')[1],'base64')); }
// static references at the captured poses (held still several frames)
const stat={};
for(const k of CAP){ const st=await p.evaluate((X0,Z0,cy,MOVE,N,k)=>new Promise(done=>{
  const u=k/(N-1); let yaw=0,pit=0,x=X0,z=Z0,y=cy;
  if(MOVE==='pan'){ yaw=(-35+70*u)*Math.PI/180; pit=(6*Math.sin(u*Math.PI*3))*Math.PI/180; }
  else if(MOVE==='tilt'){ pit=(-14+28*Math.abs(Math.sin(u*Math.PI*1.5)))*Math.PI/180; yaw=10*Math.sin(u*6.28)*Math.PI/180; }
  else if(MOVE==='dolly'){ z=Z0-u*12; x=X0+3*Math.sin(u*6.28); yaw=8*Math.sin(u*9)*Math.PI/180; }
  const dx=-Math.sin(yaw)*Math.cos(pit), dz=-Math.cos(yaw)*Math.cos(pit), dyv=Math.sin(pit);
  window.__camOv=[x,y,z,x+10*dx,y+10*dyv,z+10*dz]; let f=0; const cvs=[...document.querySelectorAll('canvas')].sort((a,b)=>b.width*b.height-a.width*a.height)[0];
  const r=()=>requestAnimationFrame(()=>{ if(++f<4) return r(); const c=document.createElement('canvas'); c.width=cvs.width; c.height=cvs.height; c.getContext('2d').drawImage(cvs,0,0); done({img:c.toDataURL('image/png'), wl:window.__wl[0].slice()}); }); r(); }),X0,Z0,cy,MOVE,N,k);
  fs.writeFileSync(`${out}_s${k}.png`, Buffer.from(st.img.split(',')[1],'base64')); stat[k]=st.wl; }
const perf=await p.evaluate(()=>new Promise(done=>{ const fr=n=>new Promise(r=>{let f=0;const g=()=>requestAnimationFrame(()=>{if(++f<n)g();else r();});g();});
  (async()=>{ await fr(4); const a={ms:window.__wlMs,ev:window.__wlEv,wl:window.__wl&&window.__wl[0].slice()}; window.__wlNoSkip=true; await fr(4); const b={ms:window.__wlMs,ev:window.__wlEv,wl:window.__wl&&window.__wl[0].slice()}; window.__wlNoSkip=false; done({a,b}); })(); }));
if(perf.a.ev!=null) console.log('PERF skip: ev',perf.a.ev,'ms',perf.a.ms&&perf.a.ms.toFixed(3),'| noSkip: ev',perf.b.ev,'ms',perf.b.ms&&perf.b.ms.toFixed(3),'| maxdiff', Math.max(...perf.a.wl.map((v,j)=>Math.abs(v-perf.b.wl[j]))));
// metrics: zigzag (alternating error) during motion, and max deviation from the static line at captured poses
const zig=l=>{ if(!l) return null; let s=0; for(let k=1;k<l.length-1;k++) s+=Math.abs(l[k]-(l[k-1]+l[k+1])/2); return s/(l.length-2); };
const zm=res.lines.filter(Boolean).map(zig); const zs=Object.values(stat).map(zig);
const dev=CAP.map(k=>{ const a=res.lines[k], s=stat[k]; if(!a||!s) return null; return Math.max(...a.map((v,j)=>Math.abs(v-s[j]))); });
console.log(JSON.stringify({move:MOVE, zigMotionMean:(zm.reduce((a,b)=>a+b,0)/zm.length).toFixed(4), zigMotionMax:Math.max(...zm).toFixed(4), zigStatic:zs.map(v=>v.toFixed(4)), devFromStatic:dev.map(v=>v&&v.toFixed(4))}));
fs.writeFileSync(`${out}_lines.json`, JSON.stringify({lines:res.lines, stat}));
fs.writeFileSync(`${out}_errs.txt`,errs.slice(0,40).join('\n')); console.log('ERRS',errs.length, errs.slice(0,3).join(' | '));
await b.close();
