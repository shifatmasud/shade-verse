
import puppeteer from 'puppeteer-core'; import fs from 'fs';
const CH=process.env.CHROME, out=process.argv[2], URL=process.argv[3]||'http://127.0.0.1:4311/';
const CAM=JSON.parse(process.env.CAM), T=+process.env.T, VARS=JSON.parse(process.env.VARS);
const b=await puppeteer.launch({executablePath:CH,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:915,height:412,deviceScaleFactor:1,hasTouch:true,isMobile:true});
const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
const w=ms=>new Promise(r=>setTimeout(r,ms));
const frames=n=>p.evaluate(n=>new Promise(r=>{let k=0;const f=()=>{if(++k>=n)r();else requestAnimationFrame(f)};requestAnimationFrame(f)}),n);
await p.goto(URL,{waitUntil:'load'}); await w(3000); await p.evaluate(()=>window.__game.start()); await w(4000);
await p.evaluate((c,t)=>{window.__perfPin=1; window.__ts=0; window.__todPh=1.4; window.__camOv=c; window.__game.sim.t=t;
  window.__sea=null; window.__scene.traverse(o=>{ if(o.material&&o.material.uniforms&&o.material.uniforms.tProbe) window.__sea=o; });
  const s=window.__sea; window.__ovr={}; s.onBeforeRender=()=>{ for(const k in window.__ovr){ if(k==='boatFar'){ s.material.uniforms.uBoat.value.forEach(v=>v.set(1e5,0,1e5,0)); continue; } if(k==='sunAway'){ s.material.uniforms.uSun.value.set(0,1,0); continue; } if(k==='heroFar'){ ['uHeroA','uHeroB'].forEach(n=>s.material.uniforms[n].value.set(1e5,-999,1e5,0)); continue; } const u=s.material.uniforms[k]; if(u) u.value=window.__ovr[k]; } };},CAM,T);
await w(9000);
for(const [nm,ov] of VARS){ await p.evaluate((ov,t)=>{window.__ovr=ov; window.__game.sim.t=t;},ov,T); await frames(3); await p.screenshot({path:`${out}_${nm}.png`}); }
fs.writeFileSync(`${out}_errs.txt`,errs.slice(0,20).join('\n')); await b.close();
