
import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:915,height:412,hasTouch:true,isMobile:true,deviceScaleFactor:1});
const cdp=await p.target().createCDPSession(); await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5}); await cdp.send('Emulation.setEmitTouchEventsForMouse',{enabled:true,configuration:'mobile'});
await p.goto('http://127.0.0.1:4311/?q=low',{waitUntil:'load'}); await new Promise(r=>setTimeout(r,2500));
await p.evaluate(()=>window.__game.start()); for(let i=0;i<120;i++){ if(await p.evaluate(()=>window.__game.sim.mode)==='play') break; await new Promise(r=>setTimeout(r,500)); } await new Promise(r=>setTimeout(r,1500));
console.log('mode',await p.evaluate(()=>window.__game&&window.__game.sim.mode), await p.evaluate(()=>document.querySelectorAll('button').length));
await p.screenshot({path:'/home/user/tab/files/hud_now.png'}); await b.close();
