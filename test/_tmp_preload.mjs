
import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:1280,height:720});
const req=[]; let phase='title'; p.on('request',r=>{const u=r.url(); if(!u.includes('__log')) req.push([phase,u.replace(/^https?:\/\/[^/]+/,'')]);});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
const w=ms=>new Promise(r=>setTimeout(r,ms));
await p.goto('http://127.0.0.1:'+process.env.PORT+'/',{waitUntil:'load'}); await w(2500);
phase='loading'; const t0=Date.now();
await p.evaluate(()=>document.querySelector('.overlay.title').click());
await w(1500); await p.screenshot({path:'/tmp/pl_loading.png'});
const txt=await p.evaluate(()=>document.querySelector('.tprompt')?.textContent);
let mode=''; for(let i=0;i<120;i++){ mode=await p.evaluate(()=>window.__game?.sim?.mode); if(mode==='play') break; await w(500);} 
const tPlay=Date.now()-t0; phase='play';
await w(15000); await p.screenshot({path:'/tmp/pl_play.png'});
console.log(JSON.stringify({txt,mode,tPlay,title:req.filter(r=>r[0]==='title').length,loading:req.filter(r=>r[0]==='loading').length,play:req.filter(r=>r[0]==='play').map(r=>r[1]),errs:errs.slice(0,5)}));
await b.close();
