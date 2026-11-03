import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:915,height:412,deviceScaleFactor:1.75,isMobile:true,hasTouch:true});
const w=ms=>new Promise(r=>setTimeout(r,ms));
await p.goto('http://127.0.0.1:4311/?q=low&tel',{waitUntil:'load'}); await w(3000); await p.evaluate(()=>window.__game.start()); await w(2000);
await p.evaluate(()=>{const s=window.__game.sim;s.pos=[-75,17,-694];s.vel=[0,0,0]}); await w(6000);
await w(25000); console.log(JSON.stringify(await p.evaluate(()=>window.__tel&&[window.__tel.frame,window.__tel.whole]))); await b.close();