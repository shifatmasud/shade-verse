import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:915,height:412,deviceScaleFactor:1.75,isMobile:true,hasTouch:true});
const w=ms=>new Promise(r=>setTimeout(r,ms));
await p.goto('http://127.0.0.1:4311/?q=low',{waitUntil:'load'}); await w(3000); await p.evaluate(()=>window.__game.start()); await w(2000);
await p.evaluate(()=>{const s=window.__game.sim;s.pos=[-75,17,-694];s.vel=[0,0,0]}); await w(6000);

await w(26000);
const before=await p.evaluate(()=>window.__gl.info.programs.filter(q=>q.cacheKey.endsWith('farm-p')||q.cacheKey.endsWith('farm-g')).map(q=>q.cacheKey));
await p.evaluate(()=>{window.__fly=setInterval(()=>{const s=window.__game.sim;s.pos=[s.pos[0]+4,17,s.pos[2]+3];},100)}); await w(30000);
const after=await p.evaluate(()=>window.__gl.info.programs.filter(q=>q.cacheKey.endsWith('farm-p')||q.cacheKey.endsWith('farm-g')).map(q=>q.cacheKey));
console.log(JSON.stringify({before,after})); await b.close();