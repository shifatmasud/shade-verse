import puppeteer from 'puppeteer-core';
const [,, w=390, h=780, out='/tmp/shot.png', mode='phone'] = process.argv;
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: 'new', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage();
await p.setViewport({ width:+w, height:+h, deviceScaleFactor:1, hasTouch: mode==='phone', isMobile: mode==='phone' });
const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
await p.goto('http://localhost:4173/', { waitUntil:'load' });
await new Promise(r=>setTimeout(r,2500));
await p.screenshot({ path: out.replace('.png','-menu.png') });
await p.evaluate(()=>window.__game.start());
await new Promise(r=>setTimeout(r,800));
setTimeout(()=>p.screenshot({path:out.replace('.png','-early.png')}).catch(()=>{}),1500);
const res = await p.evaluate(async()=>{ const g=window.__game, s=g.sim; g.input.keys['w']=true; const log=[]; let t0=performance.now();
 for(let i=0;i<300;i++){ await new Promise(r=>setTimeout(r,100)); if(s.mode!=='play')break;
  if(!s.web && !s.ground && s.vel[1]<2 && s.pos[1]>25) { g.input.swingQ=true; g.input.swing=true; }
  else if(s.web && (s.webT>1.4 && s.vel[1]>3)) { g.input.swing=false; }
  g.input.keys['w']=true; if(s.ground && i%6==0) g.input.jumpQ=true; if(s.web) {g.input.keys['w']=false;}
  if(i==12) window.__mid=1; if(i%40==0) log.push([s.pos.map(Math.round).join(','),s.web?'W':'-',s.score,Math.round(g.perf.fps),g.perf.scale.toFixed(2)]); }
 return {log, score:s.score, swings:s.swings, max:Math.round(s.maxSpeed), time:Math.round(s.time), gl2:window.__gl2}; });
console.log(JSON.stringify(res)); console.log('errors', JSON.stringify(errs.slice(0,5)));
await p.screenshot({ path: out });
await b.close();
