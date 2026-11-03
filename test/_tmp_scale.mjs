
import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage(); await p.setViewport({width:915,height:412,isMobile:true,hasTouch:true,deviceScaleFactor:1.75});
await p.goto(process.argv[2]); await new Promise(r=>setTimeout(r,3000)); await p.evaluate(()=>window.__game.start());
const out=[]; for(let i=0;i<8;i++){ await new Promise(r=>setTimeout(r,2500)); out.push(await p.evaluate(()=>[+window.__game.perf.scale.toFixed(2), Math.round(window.__game.perf.fps)])); }
console.log(JSON.stringify(out)); await b.close();
