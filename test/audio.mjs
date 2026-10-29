// Basic audio regression (sound-pass engine): no context before the first gesture, wind bed rises with speed, mute silences the master.
// The full sound check is test/sound.mjs.
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome-stable', headless: 'new', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage(); await p.setViewport({ width:844, height:390, hasTouch:true, isMobile:true });
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto(process.argv[2] || 'http://localhost:4173/',{waitUntil:'load'}); await new Promise(r=>setTimeout(r,1500));
const before = await p.evaluate(()=>!!(window.__audio&&window.__audio.ctx()));
await p.evaluate(()=>window.__game.start()); await new Promise(r=>setTimeout(r,2500));
const r=await p.evaluate(async()=>{const A=window.__audio,E=A.engine,c=A.ctx(); const wind=()=>E.activeBeds().wind||0; const s=window.__game.sim; s.vel=[0,0,0]; s.ground=true; await new Promise(r=>setTimeout(r,1200)); const out={created:!!c,state:c&&c.state,windSlow:wind()};
 s.vel=[0,0,45]; s.ground=false; await new Promise(r=>setTimeout(r,300)); out.windFast=wind();
 document.querySelector('.chip.orbs')?.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})); await new Promise(r=>setTimeout(r,500)); out.muted=A.muted(); out.masterMuted=E.master.gain.value; return out;});
console.log('before start ctx exists:',before, JSON.stringify(r),'errors',JSON.stringify(errs));
const ok = before===false && r.created && r.windFast>r.windSlow && r.muted && r.masterMuted<0.01 && errs.length===0;
console.log(ok?'AUDIO PASS':'AUDIO FAIL'); await b.close(); process.exit(ok?0:1);
