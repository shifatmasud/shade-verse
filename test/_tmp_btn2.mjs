
import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:915,height:412,hasTouch:true,isMobile:true,deviceScaleFactor:1});
const cdp=await p.target().createCDPSession(); await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5}); await cdp.send('Emulation.setEmitTouchEventsForMouse',{enabled:true,configuration:'mobile'});
const PORT=process.argv[2]||'4311'; await p.goto('http://127.0.0.1:'+PORT+'/?q=low',{waitUntil:'load'}); await new Promise(r=>setTimeout(r,2500));
await p.evaluate(()=>window.__game.start()); for(let i=0;i<120;i++){ if(await p.evaluate(()=>window.__game.sim.mode)==='play') break; await new Promise(r=>setTimeout(r,500)); } await new Promise(r=>setTimeout(r,1500));
console.log('mode',await p.evaluate(()=>window.__game&&window.__game.sim.mode), await p.evaluate(()=>document.querySelectorAll('button').length));
await p.evaluate(()=>{const i=window.__game.input; window.__log=[]; for(const k of ['shotQ','specialQ','grabQ','swingQ','swing']){let v=i[k];Object.defineProperty(i,k,{get(){return v},set(x){if(x&&!v)window.__log.push(k);v=x;},configurable:true});}});
const tap=async(sel,ms)=>{const r=await p.$eval(sel,e=>{const b=e.getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2]}).catch(()=>null); if(!r){console.log('missing',sel);return;}
 await p.evaluate(()=>window.__log=[]);
 await p.evaluate(([x,y,sel])=>{const e=document.querySelector(sel);e.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:7,clientX:x,clientY:y,pointerType:'touch'}));},[...r,sel]);
 await new Promise(r=>setTimeout(r,ms));
 await p.evaluate(([x,y,sel])=>{const e=document.querySelector(sel);e.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:7,clientX:x,clientY:y,pointerType:'touch'}));},[...r,sel]);
 await new Promise(r=>setTimeout(r,100)); console.log(sel,ms,'ms ->',JSON.stringify(await p.evaluate(()=>window.__log)));};
await tap('.ico.special',60); await tap('.ico.special',500); await tap('.ico.swing',60); await tap('.ico.swing',600);
// melee: tap = combo on press (unchanged), hold = Charged Slam
await p.evaluate(()=>{const s=window.__game.sim; const e=s.enemies.find(e=>!e.boss); e.x=s.pos[0]; e.z=s.pos[2]+2.2; e.y=s.pos[1]-1; e.hp=50; e.down=0; e.atk=0; s.yaw=0; s.ang=0; window.__mlog=[]; const i=window.__game.input; let v=i.meleeQ; Object.defineProperty(i,'meleeQ',{get(){return v},set(x){if(x&&!v)window.__mlog.push('meleeQ');v=x;},configurable:true});});
const mtap=async(ms)=>{const r=await p.$eval('.ico.melee',e=>{const b=e.getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2]});
 await p.evaluate(()=>{window.__mlog=[]; window.__sawSlam=false; window.__sawMv=0; window.__st=[]; window.__mt=setInterval(()=>{const s=window.__game.sim; if(s.slam) window.__sawSlam=true; if(s.mv) window.__sawMv=s.mv.id; if(window.__st.length<12 && (performance.now()%100)<6) window.__st.push([s.ground?1:0,s.wall?1:0,s.web?1:0,s.swim?1:0,+(s.landHard||0).toFixed(2),window.__game.input.meleeHeld?1:0, s.mv?s.mv.id:0, s.snareT>0?1:0, +s.pos[1].toFixed(1)]);},5);});
 await p.evaluate(([x,y])=>{document.querySelector('.ico.melee').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:9,clientX:x,clientY:y,pointerType:'touch'}));},r);
 await new Promise(r=>setTimeout(r,ms));
 await p.evaluate(([x,y])=>{document.querySelector('.ico.melee').dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:9,clientX:x,clientY:y,pointerType:'touch'}));},r);
 await new Promise(r=>setTimeout(r,ms>300?6000:1500));
 console.log('.ico.melee',ms,'ms ->',JSON.stringify(await p.evaluate(()=>{clearInterval(window.__mt); return {log:window.__mlog, mv:window.__sawMv, slam:window.__sawSlam, held:window.__game.input.meleeHeld, st:window.__st};})));};
await mtap(60); await mtap(4000);
console.log('buttons:',JSON.stringify(await p.$$eval('.ico',es=>es.map(e=>e.className))));
await b.close();
