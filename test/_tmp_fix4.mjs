
import puppeteer from 'puppeteer-core';
const [PORT,REPS]=[process.argv[2],+(process.argv[3]||6)];
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const errors=[]; const res={};
for(const mode of ['desk','phone']){
 const p=await b.newPage(); p.on('pageerror',e=>errors.push('PAGE '+String(e).slice(0,200)));
 if(mode==='phone'){ await p.setViewport({width:915,height:412,hasTouch:true,isMobile:true,deviceScaleFactor:1}); } else await p.setViewport({width:915,height:412});
 await p.goto('http://127.0.0.1:'+PORT+'/'+(mode==='phone'?'?q=low':''),{waitUntil:'load'}); await p.waitForFunction(()=>!!window.__game,{timeout:120000});
 for(let i=0;i<120;i++){ if(await p.evaluate(()=>{ if(window.__game.sim.mode!=='play') window.__game.start(); return window.__game.sim.mode})==='play') break; await new Promise(r=>setTimeout(r,1000)); }
 await new Promise(r=>setTimeout(r,2500));
 await p.evaluate(()=>{const i=window.__game.input; window.__log=[]; for(const k of ['shotQ','specialQ','grabQ','swingQ']){let v=i[k];Object.defineProperty(i,k,{get(){return v},set(x){if(x&&!v)window.__log.push(k);v=x;},configurable:true});}});
 // hold durations straddling HOLD_MS (220) and well past it; elapsed is measured, not assumed
 const out=[];
 for(let r=0;r<REPS;r++) for(const [btn,ms] of [['R',60],['R',300],['R',450],['L',60],['L',300],['L',450]]){
  const o=await p.evaluate(async([mode,btn,ms])=>{ const I=window.__game.input; for(const k of ['shotQ','specialQ','grabQ','swingQ']) I[k]=false; window.__log=[]; const W=t=>new Promise(r=>setTimeout(r,t));
   let down,up;
   if(mode==='desk'){ const code=btn==='R'?'KeyL':'KeyJ'; down=()=>window.dispatchEvent(new KeyboardEvent('keydown',{code,key:code.slice(3).toLowerCase(),bubbles:true})); up=()=>window.dispatchEvent(new KeyboardEvent('keyup',{code,key:code.slice(3).toLowerCase(),bubbles:true})); }
   else { const e=document.querySelector(btn==='R'?'.ico.swing':'.ico.special'); const rc=e.getBoundingClientRect(); const ev={bubbles:true,pointerId:5,clientX:rc.x+rc.width/2,clientY:rc.y+rc.height/2,pointerType:'touch'}; down=()=>e.dispatchEvent(new PointerEvent('pointerdown',ev)); up=()=>e.dispatchEvent(new PointerEvent('pointerup',ev)); }
   // a long main-thread frame right after the press, like a hitch on a slow phone (what headless swiftshader does every frame)
   const t0=performance.now(); down(); await W(ms); const el=performance.now()-t0; up(); await W(400); window.__game.input.swing=false;
   return {btn,ms,el:Math.round(el),log:window.__log.slice()}; },[mode,btn,ms]);
  const hold=o.el>220, want=o.btn==='R'?(hold?'swingQ':'grabQ'):(hold?'specialQ':'shotQ'); o.ok=o.log.includes(want)&&!o.log.includes(o.btn==='R'?(hold?'grabQ':'swingQ'):(hold?'shotQ':'specialQ')); out.push(o);
  await new Promise(r=>setTimeout(r,300)); }
 const bad=out.filter(o=>!o.ok); res[mode]={n:out.length,bad:bad.length,badSamples:bad.slice(0,6)};
 await p.close();
}
console.log('HOLD',JSON.stringify(res)); console.log('ERRORS',errors.length,JSON.stringify(errors.slice(0,3)));
await b.close();
