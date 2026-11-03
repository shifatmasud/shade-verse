import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:915,height:412,deviceScaleFactor:1.75,isMobile:true,hasTouch:true});
const w=ms=>new Promise(r=>setTimeout(r,ms));
await p.goto('http://127.0.0.1:4311/?q=low&tel',{waitUntil:'load'}); await w(3000); await p.evaluate(()=>window.__game.start()); await w(2000);
await p.evaluate(()=>{const s=window.__game.sim;s.pos=[-75,17,-694];s.vel=[0,0,0]}); await w(6000);
const keys=()=>p.evaluate(()=>{const R=window.__renderer||window.__gl;if(!R)return Object.keys(window).filter(k=>k.startsWith('__'));return R.info.programs.map(x=>x.name+'#'+x.id+'|'+x.usedTimes+'|'+x.cacheKey.slice(0,60))});
const a=await keys(); await w(4000); const b2=await keys(); console.log(JSON.stringify({na:a.length,nb:b2.length,added:Array.isArray(a)?b2.filter(x=>!a.some(y=>y.split('|')[0]===x.split('|')[0])).slice(0,20):a})); await b.close();