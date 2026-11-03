
import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:640,height:360});
await p.goto('http://127.0.0.1:4311/',{waitUntil:'load'}); await new Promise(r=>setTimeout(r,2500));
await p.evaluate(()=>window.__game.start()); await new Promise(r=>setTimeout(r,2500));
const st=()=>p.evaluate(()=>{const s=window.__game.sim;return {t:+s.t.toFixed(2),y:+s.pos[1].toFixed(1),vy:+s.vel[1].toFixed(1),g:s.ground,gl:s.glideOn,fb:!!s.flightBoost,dbl:!!s.dblUsed,hs:+Math.hypot(s.vel[0],s.vel[2]).toFixed(1)}});
const waitT=async(dt)=>{const t0=await p.evaluate(()=>window.__game.sim.t);while((await p.evaluate(()=>window.__game.sim.t))<t0+dt) await new Promise(r=>setTimeout(r,30));};
const press=()=>p.evaluate(()=>{const i=window.__game.input;i.jumpQ=true;i.jumpHeld=true;});
const rel=()=>p.evaluate(()=>{const i=window.__game.input;i.jumpHeld=false;i.jumpReleased=true;});
const log=async(l)=>console.log(l,JSON.stringify(await st()));
await waitT(1); await log('ground');
await press(); await waitT(0.05); await rel(); await waitT(0.15); await log('after tap1');
await press(); await waitT(0.05); await rel(); await waitT(0.1); await log('after tap2 (dbl)');
await waitT(2.5); await log('landed?');
await press(); await waitT(0.5); await log('holding 0.5 (glide)'); await rel(); await waitT(0.3); await log('released (still glide)');
await press(); await waitT(0.8); await log('hold while glide (flight)'); await rel(); await waitT(0.2); await log('rel');
await press(); await waitT(0.05); await rel(); await waitT(0.1); await log('tap while glide (cancel+jump)');
await b.close();
