
import puppeteer from 'puppeteer-core';
const PORT=process.argv[2];
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage(); await p.setViewport({width:915,height:412,hasTouch:true,isMobile:true,deviceScaleFactor:1});
const errors=[]; p.on('pageerror',e=>errors.push('PAGE '+String(e).slice(0,200))); p.on('console',m=>{ if(m.type()==='error'||/shader/i.test(m.text())) errors.push(m.text().slice(0,200)); });
await p.goto('http://127.0.0.1:'+PORT+'/?q=low',{waitUntil:'load'}); await p.waitForFunction(()=>!!window.__game,{timeout:120000});
for(let i=0;i<120;i++){ if(await p.evaluate(()=>{ if(window.__game.sim.mode!=='play') window.__game.start(); return window.__game.sim.mode})==='play') break; await new Promise(r=>setTimeout(r,1000)); }
await new Promise(r=>setTimeout(r,2000));
const n0=errors.length;
const res=await p.evaluate(async()=>{ const out=[]; const I=window.__game.input; const sel=['.ico.jump','.ico.swing','.ico.special','.ico.melee'];
 for(const s of sel){ const e=document.querySelector(s); if(!e){out.push(s+' missing');continue;} const r=e.getBoundingClientRect(); const o={bubbles:true,pointerId:41,clientX:r.x+r.width/2,clientY:r.y+r.height/2,pointerType:'touch'};
  // duplicate synthetic downs, then up
  e.dispatchEvent(new PointerEvent('pointerdown',o)); e.dispatchEvent(new PointerEvent('pointerdown',o)); if(s==='.ico.jump') out.push('jumpQ='+I.jumpQ+' held='+I.jumpHeld);
  await new Promise(r=>setTimeout(r,80)); e.dispatchEvent(new PointerEvent('pointerup',o)); if(s==='.ico.jump') out.push('after up held='+I.jumpHeld);
  await new Promise(r=>setTimeout(r,150)); }
 // synthetic pointerdown on the camera drag layer and the move pad area
 const els=[...document.querySelectorAll('div')].filter(d=>d.onpointerdown||d.getAttribute('class')); 
 return out; });
await new Promise(r=>setTimeout(r,1000));
// also real CDP touch taps on jump (trusted events)
const jr=await p.$eval('.ico.jump',e=>{const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]});
await p.touchscreen.tap(jr[0],jr[1]); await new Promise(r=>setTimeout(r,300)); await p.touchscreen.tap(jr[0],jr[1]);
// synthetic touches on left half (pad) and right half (camera drag)
await p.evaluate(()=>{ for(const [x,y] of [[120,300],[600,150]]){ const t=document.elementFromPoint(x,y); const o={bubbles:true,pointerId:77,clientX:x,clientY:y,pointerType:'touch'}; t.dispatchEvent(new PointerEvent('pointerdown',o)); t.dispatchEvent(new PointerEvent('pointerup',o)); } });
await new Promise(r=>setTimeout(r,1500));
console.log('RES',JSON.stringify(res)); console.log('ERRORS total',errors.length,'during taps',errors.length-n0,JSON.stringify(errors.slice(0,6)));
await b.close();
