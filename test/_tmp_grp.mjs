
import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage(); await p.setViewport({width:915,height:412,isMobile:true,hasTouch:true,deviceScaleFactor:1.75});
await p.goto(process.argv[2]); await new Promise(r=>setTimeout(r,3000)); await p.evaluate(()=>window.__game.start());
await new Promise(r=>setTimeout(r,2000));
await p.evaluate((pos)=>{const s=window.__game.sim; setInterval(()=>{s.pos=pos;s.vel=[0,0,0]},100)}, JSON.parse(process.env.POS));
await new Promise(r=>setTimeout(r,14000));
const v=await p.evaluate(()=>window.__dbgStats); console.log(JSON.stringify(v)); await b.close();
