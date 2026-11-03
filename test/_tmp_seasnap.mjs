
import puppeteer from 'puppeteer-core'; import fs from 'fs';
// Sea snap-invariance test: the sea sheet follows the camera in OCEAN_SNAP steps. Shifting it by whole snaps must not change the image
// (waves are anchored in world space). Any difference = what the player sees as a pop each time the sheet snaps while flying.
const CH=process.env.CHROME, out=process.argv[2]||'/tmp/snap', URL=process.argv[3]||'http://127.0.0.1:4311/';
const CAMS=JSON.parse(process.env.CAMS||'[[0,22,-560,0,-2,-760],[-300,8,-700,-300,-3,-900],[100,60,-500,140,-10,-900],[0,3,-600,40,0,-800]]');
const b=await puppeteer.launch({executablePath:CH,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:915,height:412,deviceScaleFactor:1,hasTouch:true,isMobile:true});
const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
const w=ms=>new Promise(r=>setTimeout(r,ms));
const frames=n=>p.evaluate(n=>new Promise(r=>{let k=0;const f=()=>{if(++k>=n)r();else requestAnimationFrame(f)};requestAnimationFrame(f)}),n);
await p.goto(URL,{waitUntil:'load'}); await w(3000); await p.evaluate(()=>window.__game.start()); await w(4000);
await p.evaluate(()=>{window.__perfPin=1; window.__ts=0; window.__todPh=0.3;});
for(let i=0;i<CAMS.length;i++){ await p.evaluate(a=>{window.__camOv=a; window.__seaSnapOff=0},CAMS[i]); await w(6000); await frames(3);
  for(const [nm,so] of [['0',0],['8',8],['0b',0]]){ await p.evaluate(s=>{window.__seaSnapOff=s; window.__game.sim.t=100;},so); await frames(2); await p.evaluate(()=>{window.__game.sim.t=100}); await frames(2); await p.screenshot({path:`${out}_c${i}_s${nm}.png`}); } }
fs.writeFileSync(`${out}_errs.txt`,errs.slice(0,20).join('\n')); await b.close();
