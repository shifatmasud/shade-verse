
import puppeteer from 'puppeteer-core'; import fs from 'fs';
// Sea simulation (Shifat 4:40 AM): catches sea glitches without a phone.
// Pass 1 (pop test): time frozen, camera glides in small steps over the open sea; any frame-to-frame image jump far above the
//   smooth-parallax median = a pop (mesh snap, LOD switch, probe swap...). Pass 2 (timing): live time, same glide, rAF frame times.
const CH=process.env.CHROME, out=process.argv[2]||'/tmp/seasim', URL=process.argv[3]||'http://127.0.0.1:4311/';
const PH=process.env.PHONE!=='0', STEPS=+(process.env.STEPS||40), STEP=+(process.env.STEP||1.5);
const PATHS=JSON.parse(process.env.PATHS||'[[0,22,-560, 1,0, 0,-2,-760],[-300,8,-700, 0,-1, -300,-3,-900]]');
const b=await puppeteer.launch({executablePath:CH,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport(PH?{width:915,height:412,deviceScaleFactor:1,hasTouch:true,isMobile:true}:{width:1280,height:720,deviceScaleFactor:1});
const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
const w=ms=>new Promise(r=>setTimeout(r,ms));
const frames=n=>p.evaluate(n=>new Promise(r=>{let k=0;const f=()=>{if(++k>=n)r();else requestAnimationFrame(f)};requestAnimationFrame(f)}),n);
await p.goto(URL,{waitUntil:'load'}); await w(3000);
await p.evaluate(()=>window.__game.start()); await w(4000);
const res={paths:[]};
for(let pi=0;pi<PATHS.length;pi++){ const [x,y,z,dx,dz,lx,ly,lz]=PATHS[pi];
  await p.evaluate(()=>{window.__perfPin=1; window.__ts=0; window.__todPh=+(new URLSearchParams(location.search).get('tod')||0.3);});
  const setCam=i=>p.evaluate((a)=>{window.__camOv=a},[x+dx*STEP*i,y,z+dz*STEP*i,lx+dx*STEP*i,ly,lz+dz*STEP*i]);
  await setCam(0); await w(6000); await frames(3);
  for(let i=0;i<STEPS;i++){ await setCam(i); await frames(2); await p.screenshot({path:`${out}_p${pi}_${String(i).padStart(3,'0')}.png`}); }
  // timing pass: live time, glide 1.5 m per frame
  const t=await p.evaluate(([x,y,z,dx,dz,lx,ly,lz,N])=>new Promise(r=>{delete window.__ts; const ts=[]; let i=0, last=performance.now();
    const f=(now)=>{ ts.push(now-last); last=now; const s=i*1.5; window.__camOv=[x+dx*s,y,z+dz*s,lx+dx*s,ly,lz+dz*s]; if(++i<N) requestAnimationFrame(f); else r(ts.slice(2)); }; requestAnimationFrame(f);}),[x,y,z,dx,dz,lx,ly,lz,60]);
  res.paths.push({i:pi,ft:t});
}
fs.writeFileSync(`${out}_res.json`,JSON.stringify(res)); fs.writeFileSync(`${out}_errs.txt`,errs.slice(0,20).join('\n'));
await b.close();
