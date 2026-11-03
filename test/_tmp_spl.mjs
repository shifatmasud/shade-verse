import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); const w=ms=>new Promise(r=>setTimeout(r,ms)); await p.goto('http://127.0.0.1:4311/?rain=1',{waitUntil:'load'}); await w(2500); await p.evaluate(()=>window.__game.start()); await w(3000);
const out=[]; for (const [x,y,z] of [[0,30,-560],[10,1.2,10],[10,25,10]]) { await p.evaluate((x,y,z)=>{const s=window.__game.sim; s.pos=[x,y,z]; s.vel=[0,0,0];},x,y,z); await w(600); out.push(await p.evaluate(()=>JSON.stringify(window.__spl))); }
console.log(out.join('\n')); await b.close();
