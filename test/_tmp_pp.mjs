import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:915,height:412,deviceScaleFactor:1.75,isMobile:true,hasTouch:true});
const w=ms=>new Promise(r=>setTimeout(r,ms));
await p.goto('http://127.0.0.1:4311/?q=low&tel',{waitUntil:'load'}); await w(3000); await p.evaluate(()=>window.__game.start()); await w(2000);
await p.evaluate(()=>{const s=window.__game.sim;s.pos=[-75,17,-694];s.vel=[0,0,0]}); await w(6000);
await p.evaluate(()=>{const c=document.querySelector('canvas').getContext('webgl2');const o=c.getProgramParameter.bind(c);window.__pp={n:0,st:{}};c.getProgramParameter=(a,b)=>{window.__pp.n++;const s=(new Error().stack||'').split('\n').slice(2,7).map(x=>x.trim().slice(0,90)).join(' | ');window.__pp.st[s]=(window.__pp.st[s]||0)+1;return o(a,b)};});
await w(4000); console.log(JSON.stringify(await p.evaluate(()=>({n:window.__pp.n,top:Object.entries(window.__pp.st).sort((a,b)=>b[1]-a[1]).slice(0,4)})))); await b.close();