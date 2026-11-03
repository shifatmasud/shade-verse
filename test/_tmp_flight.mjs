
import puppeteer from 'puppeteer-core'; import fs from 'fs';
// Frame-by-frame flight (Shifat 5:05 AM): city -> sea -> Neon Harbor -> island, phone viewport, deterministic: game time advances
// exactly 1/30 s per captured frame (the waves animate as at 30 fps), camera on a smooth path. Frames -> mp4 + diff analysis.
const CH=process.env.CHROME, out=process.argv[2]||'/tmp/fl/f', URL=process.argv[3]||'http://127.0.0.1:4311/';
const N=+(process.env.N||300), TOD=+(process.env.TOD||1.4);
// waypoints: [camx,camy,camz, lookx,looky,lookz]
const WP=JSON.parse(process.env.WP||JSON.stringify([
 [0,40,-120, 0,0,-420], [0,22,-380, 40,0,-700], [60,18,-640, 150,0,-980], [150,22,-900, 150,-1,-1080],
 [60,20,-1000, -120,0,-860], [-40,16,-880, -160,0,-820], [-120,14,-700, -160,0,-820], [-260,12,-760, -160,-2,-840]]));
const b=await puppeteer.launch({executablePath:CH,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:915,height:412,deviceScaleFactor:1,hasTouch:true,isMobile:true});
const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
const w=ms=>new Promise(r=>setTimeout(r,ms));
const frames=n=>p.evaluate(n=>new Promise(r=>{let k=0;const f=()=>{if(++k>=n)r();else requestAnimationFrame(f)};requestAnimationFrame(f)}),n);
await p.goto(URL,{waitUntil:'load'}); await w(3000); await p.evaluate(()=>window.__game.start()); await w(4000);
const cr=(a,b,c,d,t)=>0.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
const at=u=>{ const s=u*(WP.length-1), i=Math.min(WP.length-2,Math.floor(s)), t=s-i; const P=k=>WP[Math.max(0,Math.min(WP.length-1,k))];
  return P(0).map((_,j)=>cr(P(i-1)[j],P(i)[j],P(i+1)[j],P(i+2)[j],t)); };
await p.evaluate((tod)=>{window.__perfPin=1; window.__ts=0; window.__todPh=tod; window.__game.sim.t=50;},TOD);
await p.evaluate(a=>{window.__camOv=a},at(0)); await w(8000);
const log=[];
for(let i=0;i<N;i++){ const c=at(i/(N-1));
  const t0=Date.now(); await p.evaluate((c,i)=>{window.__camOv=c; window.__game.sim.t=50+i/30;},c,i); await frames(2);
  await p.screenshot({path:`${out}_${String(i).padStart(4,'0')}.png`}); log.push([i,Date.now()-t0,c.map(v=>+v.toFixed(1))]);
  if(i%25===0) fs.writeFileSync(`${out}_log.json`,JSON.stringify(log)); }
fs.writeFileSync(`${out}_log.json`,JSON.stringify(log)); fs.writeFileSync(`${out}_errs.txt`,errs.slice(0,30).join('\n')); fs.writeFileSync(`${out}_done`,'1');
await b.close();
