
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const [,, url, outDir, tag] = process.argv;
const CH='/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const sizes=[
 ['640x260',640,260,2.6,true],['740x300',740,300,2.6,true],['800x340',800,340,2.25,true],['923x360',923,360,2.6,true],
 ['915x412',915,412,2.6,true],['360x740',360,740,2,true],['412x915',412,915,2.6,true],['820x1180',820,1180,2,true],['1180x820',1180,820,2,true],
 ['1366x768',1366,768,1,false],['1920x1080',1920,1080,1,false],['1024x500',1024,500,1,false]];
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const browser=await puppeteer.launch({executablePath:CH,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const res={}; let errs=[];
for(const [name,w,h,dpr,mob] of sizes){ if(only&&!only.includes(name)) continue;
 const page=await browser.newPage();
 page.on('pageerror',e=>errs.push(name+': '+e.message));
 await page.emulate({viewport:{width:w,height:h,deviceScaleFactor:dpr,isMobile:mob,hasTouch:mob,isLandscape:w>h},userAgent: mob?'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'});
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
 await new Promise(r=>setTimeout(r,3500));
 const info=await page.evaluate(()=>{const q=s=>[...document.querySelectorAll(s)].filter(e=>{const cs=getComputedStyle(e);return cs.display!=='none'&&cs.visibility!=='hidden'&&+cs.opacity>0.05}).map(e=>{const r=e.getBoundingClientRect();return {s,x:Math.round(r.left),y:Math.round(r.top),r:Math.round(r.right),b:Math.round(r.bottom)}});
  const items=['.tmark','.tname','.otext','.overlay.title .go','.tprompt','.tmaps','.tby'].flatMap(q);
  const chrome=['.hud .chip','.mute'].flatMap(q).filter(o=>o.r>o.x&&o.b>o.y);
  const ov=document.querySelector('.overlay.title'); const st=document.querySelector('.stage');
  return {vw:innerWidth,vh:innerHeight,items,chrome,ovH:ov&&ov.getBoundingClientRect().height,stH:st&&st.getBoundingClientRect().height,scroll:ov&&(ov.scrollHeight-ov.clientHeight)};});
 const probs=[]; const all=[...info.items];
 for(const a of info.items){ if(a.x<0||a.y<0||a.r>info.vw||a.b>info.vh) probs.push('cut '+a.s+JSON.stringify(a));
   for(const c of info.chrome) if(a.x<c.r&&a.r>c.x&&a.y<c.b&&a.b>c.y) probs.push('overlaps '+a.s+' with '+c.s);}
 for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){const a=all[i],b=all[j]; if(a.x<b.r&&a.r>b.x&&a.y<b.b&&a.b>b.y) probs.push('overlap '+a.s+' & '+b.s);}
 if(info.scroll>0) probs.push('scroll '+info.scroll);
 res[name]={...info,probs};
 await page.screenshot({path:`${outDir}/${tag}_${name}.png`});
 await page.close();}
await browser.close();
fs.writeFileSync(`${outDir}/${tag}.json`,JSON.stringify({res,errs},null,1));
for(const k in res) console.log(tag,k,'stage',res[k].stH,'vh',res[k].vh,res[k].probs.join(' | ')||'OK');
console.log('pageerrors',errs.length, errs.slice(0,5).join('\n'));
