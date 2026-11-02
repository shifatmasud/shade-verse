
import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:915,height:412,hasTouch:true,isMobile:true,deviceScaleFactor:1});
const cdp=await p.target().createCDPSession(); await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5}); await cdp.send('Emulation.setEmitTouchEventsForMouse',{enabled:true,configuration:'mobile'});
await p.goto('http://127.0.0.1:4311/?q=low',{waitUntil:'load'}); await new Promise(r=>setTimeout(r,2500));
await p.evaluate(()=>window.__game.start()); for(let i=0;i<120;i++){ if(await p.evaluate(()=>window.__game.sim.mode)==='play') break; await new Promise(r=>setTimeout(r,500)); } await new Promise(r=>setTimeout(r,1500));
console.log('mode',await p.evaluate(()=>window.__game&&window.__game.sim.mode), await p.evaluate(()=>document.querySelectorAll('button').length));
await p.evaluate(()=>{const i=window.__game.input; window.__log=[]; for(const k of ['shotQ','specialQ','grabQ','swingQ','swing']){let v=i[k];Object.defineProperty(i,k,{get(){return v},set(x){if(x&&!v)window.__log.push(k);v=x;},configurable:true});}});
const tap=async(sel,ms)=>{const r=await p.$eval(sel,e=>{const b=e.getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2]}).catch(()=>null); if(!r){console.log('missing',sel);return;}
 await p.evaluate(()=>window.__log=[]);
 await p.evaluate(([x,y,sel])=>{const e=document.querySelector(sel);e.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:7,clientX:x,clientY:y,pointerType:'touch'}));},[...r,sel]);
 await new Promise(r=>setTimeout(r,ms));
 await p.evaluate(([x,y,sel])=>{const e=document.querySelector(sel);e.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:7,clientX:x,clientY:y,pointerType:'touch'}));},[...r,sel]);
 await new Promise(r=>setTimeout(r,100)); console.log(sel,ms,'ms ->',JSON.stringify(await p.evaluate(()=>window.__log)));};
await tap('.ico.special',60); await tap('.ico.special',500); await tap('.ico.swing',60); await tap('.ico.swing',600);
console.log('buttons:',JSON.stringify(await p.$$eval('.ico',es=>es.map(e=>e.className))));
await b.close();
