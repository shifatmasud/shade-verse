import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: 'new', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width:390, height:780, hasTouch:true, isMobile:true });
const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
await p.goto('http://localhost:4173/',{waitUntil:'load'}); await new Promise(r=>setTimeout(r,1500));
await p.evaluate(()=>window.__game.start());
const res = await p.evaluate(async()=>{ const g=window.__game,s=g.sim; const log=[];
 for(let i=0;i<700;i++){ await new Promise(r=>setTimeout(r,100)); if(s.mode!=='play')break;
  let nb=null,nd=1e9; for(const o of s.orbs){const d=Math.hypot(o[0]-s.pos[0],o[2]-s.pos[2]); if(d<nd){nd=d;nb=o;}}
  const want=Math.atan2(nb[0]-s.pos[0],nb[2]-s.pos[2]); let da=Math.atan2(Math.sin(want-s.yaw),Math.cos(want-s.yaw)); s.yaw+=da*0.15; s.lastDrag=s.t;
  g.input.keys['w']=s.ground;
  if(s.ground&&i%5==0) g.input.jumpQ=true;
  if(!s.web&&!s.ground&&s.vel[1]<3&&s.pos[1]>22){g.input.swingQ=true;g.input.swing=true;}
  else if(s.web&&s.webT>1.2&&(s.vel[1]>2||s.pos[1]>nb[1]+6)) g.input.swing=false;
  if(i%100==0) log.push([s.pos.map(Math.round).join(','),s.score,Math.round(g.perf.fps),Math.round(s.time)]); }
 return {log,score:s.score,swings:s.swings,max:Math.round(s.maxSpeed),mode:s.mode}; });
console.log(JSON.stringify(res)); console.log('errors',JSON.stringify(errs.slice(0,3)));
await p.screenshot({path:'/tmp/bot-end.png'}); await b.close();
