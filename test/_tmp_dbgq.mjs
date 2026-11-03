
import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const p=await b.newPage(); await p.setViewport({width:915,height:412,deviceScaleFactor:1.75,isMobile:true,hasTouch:true});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto(process.argv[2],{waitUntil:'load'}); await new Promise(r=>setTimeout(r,12000));
console.log(JSON.stringify(await p.evaluate(()=>({st:window.__dbgStats, hud:[...document.querySelectorAll('div')].map(d=>d.textContent).filter(t=>/fps/.test(t)).slice(-1)}))), errs.slice(0,3));
await b.close();
