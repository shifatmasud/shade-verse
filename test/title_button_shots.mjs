
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const CH='/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const OUT='/tmp/tbtn/shots'; fs.mkdirSync(OUT,{recursive:true});
const NEW='http://127.0.0.1:4731/', BASE='http://127.0.0.1:4732/';
const browser=await puppeteer.launch({executablePath:CH,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const errs=[]; const log={};
const sizes=[['desk',1600,900,2,false],['phone',844,390,2,true]];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function open(url,[name,w,h,dpr,mob],reduced=false){
  const page=await browser.newPage();
  page.on('pageerror',e=>errs.push(name+' '+url+': '+e.message));
  page.on('console',m=>{ if(m.type()==='error') errs.push(name+' console: '+m.text()); });
  await page.emulate({viewport:{width:w,height:h,deviceScaleFactor:dpr,isMobile:mob,hasTouch:mob,isLandscape:true},userAgent: mob?'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'});
  if(reduced) await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await page.evaluateOnNewDocument(()=>{ const pn=performance.now.bind(performance); let base=0, at=0, k=1;
    window.__slow=(s)=>{ const t=pn(); base=base+(t-at)*k; at=t; k=s; };   // QA only: slow the page clock for mid-press frames
    at=pn(); base=at; performance.now=()=>base+(pn()-at)*k; });
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('.sv-play',{timeout:60000}); await sleep(3800);
  return page;
}
const freeze = p => p.evaluate(()=>{ for(const a of document.getAnimations()){ try{a.pause(); a.currentTime=3000;}catch(e){} } });
async function rect(page,sel,m){ return page.evaluate((sel,m)=>{const r=document.querySelector(sel).getBoundingClientRect();return {x:Math.max(0,r.left-m),y:Math.max(0,r.top-m),width:r.width+2*m,height:r.height+2*m,cx:r.left+r.width*0.5,cy:r.top+r.height*0.5,w:r.width,h:r.height}},sel,m); }
const inkR = (page,sel)=>page.evaluate(sel=>{const i=document.querySelector(sel+' > .ink');return i.style.clipPath+' | vis '+i.style.visibility+' | scale '+document.querySelector(sel).style.scale+' | filter '+(document.querySelector(sel).style.filter?'on':'off')},sel);
for(const sz of sizes){
  const [name]=sz;
  // full frames, both builds, animations frozen at the same moment
  for(const [tag,url] of [['new',NEW],['base',BASE]]){ const p=await open(url,sz); await freeze(p); await sleep(300); await p.screenshot({path:`${OUT}/${name}_full_${tag}.png`}); await p.close(); }
  const page=await open(NEW,sz);
  for(const [v,sel,m] of [['quiet','.sv-sound',16],['play','.sv-play',40]]){
    const R=await rect(page,sel,m); const clip={x:R.x,y:R.y,width:R.width,height:R.height};
    log[`${name}_${v}_rect`]=R;
    await page.screenshot({path:`${OUT}/${name}_${v}_0rest.png`,clip});
    const px=R.cx+R.w*0.22, py=R.cy+R.h*0.18;   // off-centre press point, so the flood visibly grows from it
    if(sz[4]){ await page.touchscreen.touchStart(px,py); }
    else { await page.mouse.move(px,py,{steps:2}); await page.mouse.down(); }
    await page.evaluate(()=>window.__slow(0.08));
    const full = v==='quiet' ? 45 : (sz[4]?100:78);
    for(let k=0;k<60;k++){ const m=(await inkR(page,sel)).match(/circle\(([\d.]+)px/); if(m && +m[1]>full*0.35) break; await sleep(25); }
    log[`${name}_${v}_mid`]=await inkR(page,sel);
    await page.screenshot({path:`${OUT}/${name}_${v}_1mid.png`,clip});
    await page.evaluate(()=>window.__slow(1));
    await sleep(700); log[`${name}_${v}_held`]=await inkR(page,sel);
    await page.screenshot({path:`${OUT}/${name}_${v}_2held.png`,clip});
    if(v==='quiet'){
      const before=await page.evaluate(()=>localStorage.getItem('sv-muted'));
      if(sz[4]) await page.touchscreen.touchEnd(); else await page.mouse.up();
      await sleep(80);
      const after=await page.evaluate(()=>({ls:localStorage.getItem('sv-muted'),aria:document.querySelector('.sv-sound').getAttribute('aria-pressed'),label:document.querySelector('.sv-sound').getAttribute('aria-label')}));
      log[`${name}_mute_toggle`]={before,after};
      // toggle back
      await page.click('.sv-sound'); await sleep(100);
      log[`${name}_mute_back`]=await page.evaluate(()=>localStorage.getItem('sv-muted'));
      if(!sz[4]){ await page.mouse.move(5,sz[2]-5); }
      await sleep(900); log[`${name}_quiet_after_release`]=await inkR(page,sel);
    } else {
      // release = the click: measure click -> title leaving
      await page.evaluate(()=>{ window.__clk=0; window.__leave=0; document.querySelector('.sv-play').addEventListener('click',()=>{window.__clk=performance.now()},{capture:true});
        new MutationObserver(()=>{ if(!window.__leave && document.querySelector('.sv-comic.leaving')) window.__leave=performance.now(); }).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']}); });
      if(sz[4]) await page.touchscreen.touchEnd(); else await page.mouse.up();
      await sleep(250);
      log[`${name}_play_click_to_leaving_ms`]=await page.evaluate(()=>window.__leave&&window.__clk? +(window.__leave-window.__clk).toFixed(1):'clk '+window.__clk+' leave '+window.__leave);
      await sleep(9000);
      log[`${name}_after_play`]=await page.evaluate(()=>({comic:!!document.querySelector('.sv-comic'),title:!!document.querySelector('.sv-title'),canvases:document.querySelectorAll('canvas').length,hud:!!document.querySelector('.hud')}));
    }
  }
  await page.close();
}
// reduced motion: flood is instant
{ const p=await open(NEW,sizes[1],true); const R=await rect(p,'.sv-play',40);
  await p.touchscreen.touchStart(R.cx,R.cy); await sleep(30); log.reduced_play_30ms=await inkR(p,'.sv-play');
  await p.screenshot({path:`${OUT}/reduced_play.png`,clip:{x:R.x,y:R.y,width:R.width,height:R.height}}); await p.touchscreen.touchEnd(); await p.close(); }
// Space = Play press (Shifat Nov 2 7:37 PM)
{ const p=await open(NEW,sizes[0]); const R=await rect(p,'.sv-play',40);
  await p.evaluate(()=>{ window.__starts=0; const t=()=>{ if(document.querySelector('.sv-comic.leaving')){ window.__leaveAt=performance.now(); } else requestAnimationFrame(t) }; requestAnimationFrame(t); });
  await p.addStyleTag({content:'.sv-comic.leaving{transition:none!important;opacity:1!important;visibility:visible!important}'});   // QA only: hold the title on screen for the frame
  await p.evaluate(()=>window.__slow(0.08));
  await p.keyboard.down('Space'); await sleep(250); log.space_ink=await inkR(p,'.sv-play');
  await p.screenshot({path:`${OUT}/space_play.png`,clip:{x:R.x,y:R.y,width:R.width,height:R.height}});
  await p.evaluate(()=>window.__slow(1)); await p.keyboard.up('Space'); await sleep(600);
  log.space_leaving=await p.evaluate(()=>!!document.querySelector('.sv-comic.leaving'));
  await sleep(8000); log.space_after=await p.evaluate(()=>({title:document.querySelector('.sv-title')?.className, hud:!!document.querySelector('.hud')}));
  await p.close(); }
console.log(JSON.stringify({errs,log},null,1));
await browser.close();
