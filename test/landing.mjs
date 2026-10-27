import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome-stable',headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();await p.setViewport({width:390,height:780,hasTouch:true,isMobile:true});const errs=[];p.on('pageerror',e=>errs.push(String(e)));
await p.goto('http://localhost:4173/',{waitUntil:'load'});await new Promise(r=>setTimeout(r,1500));
await p.evaluate(()=>{window.__dbgGround=1;window.__game.start()});await new Promise(r=>setTimeout(r,600));
const R=await p.evaluate(async()=>{const g=window.__game,s=g.sim,w=(ms)=>new Promise(r=>setTimeout(r,ms));s.enemies.forEach(o=>{o.x=-300;o.z=-300;o.roof=undefined;});
const out={};
for(const [name,h] of [['drop6',7],['drop26',27]]){s.pos=[20,h,-150];s.vel=[0,0,0];const a=[];let landed=false;for(let i=0;i<60;i++){await w(40);const q=window.__gc;a.push([+s.pos[1].toFixed(2),s.ground,+(window.__gc2??-9).toFixed(3),+(s.land||0).toFixed(2)]);}out[name]=a;await w(800)}
return out});
for(const k in R){const a=R[k].filter(x=>x[1]);console.log(k,'grounded samples',a.length,'foot-min(plant measured, before land crouch)',JSON.stringify(a.slice(0,8)))}
console.log('errs',errs);await b.close();
