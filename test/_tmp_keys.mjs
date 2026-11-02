
import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:960,height:540});
await p.goto('http://127.0.0.1:4311/',{waitUntil:'load'}); await new Promise(r=>setTimeout(r,2500));
await p.evaluate(()=>window.__game.start()); for(let i=0;i<120;i++){ if(await p.evaluate(()=>window.__game.sim.mode)==='play') break; await new Promise(r=>setTimeout(r,500)); } await new Promise(r=>setTimeout(r,1500));
await p.evaluate(()=>{const i=window.__game.input; window.__log=[]; for(const k of ['shotQ','specialQ','grabQ','swingQ','swing','meleeQ','jumpQ']){let v=i[k];Object.defineProperty(i,k,{get(){return v},set(x){if(x&&!v)window.__log.push(k);v=x;},configurable:true});}});
const key=async(code,ms)=>{await p.evaluate(()=>window.__log=[]); await p.keyboard.down(code); await new Promise(r=>setTimeout(r,ms)); await p.keyboard.up(code); await new Promise(r=>setTimeout(r,120)); console.log(code,ms,'->',JSON.stringify(await p.evaluate(()=>window.__log)));};
for (const [c,ms] of [['KeyJ',60],['KeyJ',500],['KeyL',60],['KeyL',600],['KeyK',60],['ControlLeft',60],['KeyI',60],['KeyM',60],['Period',60],['AltLeft',60],['ShiftLeft',60]]) await key(c,ms);
await b.close();
