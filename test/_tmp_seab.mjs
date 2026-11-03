
import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:915,height:412,deviceScaleFactor:1,hasTouch:true,isMobile:true});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
const w=ms=>new Promise(r=>setTimeout(r,ms));
await p.goto('http://127.0.0.1:4311/?q=low&tel',{waitUntil:'load'}); await w(3000);
await p.evaluate(()=>window.__game.start()); await w(3000);
await p.evaluate(()=>{const s=window.__game.sim; s.pos[0]=-150; s.pos[2]=-700; s.pos[1]=6;});
await w(50000);
console.log(await p.evaluate(()=>JSON.stringify({sea:(window.__tel||{}).sea, gpu:((window.__tel||{}).gpu||[]).slice(0,10)})));
console.log(errs.slice(0,3).join('\n')); await b.close();
