import puppeteer from 'puppeteer-core';
const desk=process.env.DESK==='1';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});const p=await b.newPage();
await p.setViewport(desk?{width:1366,height:768}:{width:915,height:412,isMobile:true,hasTouch:true,deviceScaleFactor:1.75});
await p.evaluateOnNewDocument(()=>{window.__perfPin=1});
await p.goto('http://127.0.0.1:4311/?'+(desk?'':'q=low&')+'debug');await new Promise(r=>setTimeout(r,2500));await p.evaluate(()=>window.__game.start());
for(const [n,pos] of JSON.parse(process.env.SPOTS)){await p.evaluate((pos)=>{const s=window.__game.sim;s.pos=pos;s.vel=[0,0,0]},pos);await new Promise(r=>setTimeout(r,15000));
console.log(n, JSON.stringify(await p.evaluate(()=>window.__dbgStats)));}
await b.close();