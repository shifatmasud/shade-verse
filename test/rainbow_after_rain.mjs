
import puppeteer from 'puppeteer-core';
const port=process.argv[2];
const b = await puppeteer.launch({ executablePath: process.env.CHROME, headless: 'new', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width:640, height:300, deviceScaleFactor:1, hasTouch:true, isMobile:true });
const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text());});
await p.goto(`http://127.0.0.1:${port}/`,{waitUntil:'load',timeout:120000});
await p.waitForFunction(()=>!!window.__game,{timeout:120000}); await new Promise(r=>setTimeout(r,1000));
await p.evaluate(()=>window.__game.start());
await p.waitForFunction(()=>window.__game.sim.mode==='play'&&!!window.__weather,{timeout:180000,polling:250});
const w=ms=>new Promise(r=>setTimeout(r,ms));
const rd=()=>p.evaluate(()=>({rain:+window.__weather.rain.value.toFixed(3),bow:+window.__weather.bow.value.toFixed(3),day:window.__tod?+window.__tod.day.toFixed(3):null}));
const log=[];
log.push(['start',await rd()]);
await p.evaluate(()=>{window.__weather.force=1;}); await w(12000); log.push(['raining',await rd()]);
await p.evaluate(()=>{window.__weather.force=0;}); for(let i=0;i<6;i++){await w(3000); log.push(['after+'+(3*(i+1))+'s',await rd()]);}
console.log(JSON.stringify(log)); console.log('errors',errs.length, errs.slice(0,3).join(' | '));
await b.close();
