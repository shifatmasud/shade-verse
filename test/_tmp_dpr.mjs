import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.emulate({viewport:{width:915,height:412,deviceScaleFactor:1.75,isMobile:true,hasTouch:true,isLandscape:true},userAgent:'Mozilla/5.0 (Linux; Android 11; SM-A107F) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'});
const w=ms=>new Promise(r=>setTimeout(r,ms)); await p.goto('http://127.0.0.1:4311/',{waitUntil:'load'}); await w(2500); await p.evaluate(()=>window.__game&&window.__game.start()); await w(20000);
console.log(await p.evaluate(()=>{const c=document.querySelector('canvas'); return JSON.stringify({cw:c.width, css:c.clientWidth, wr: window.__wr})}));
await b.close();