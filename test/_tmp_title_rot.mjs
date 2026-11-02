
import puppeteer from 'puppeteer-core';
const CH='/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const b=await puppeteer.launch({executablePath:CH,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage(); let errs=0; p.on('pageerror',()=>errs++);
const ua='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
await p.emulate({viewport:{width:412,height:915,deviceScaleFactor:2.6,isMobile:true,hasTouch:true},userAgent:ua});
await p.goto(process.argv[2],{waitUntil:'domcontentloaded'}); await new Promise(r=>setTimeout(r,2500));
for (const [w,h] of [[915,412],[740,300],[412,915],[640,260]]) {
 await p.setViewport({width:w,height:h,deviceScaleFactor:2.6,isMobile:true,hasTouch:true,isLandscape:w>h}); await new Promise(r=>setTimeout(r,900));
 const o=await p.evaluate(()=>{const g=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return [Math.round(r.top),Math.round(r.bottom)]};return {vh:innerHeight,app:getComputedStyle(document.documentElement).getPropertyValue('--app-h'),stage:g('.stage'),mark:g('.tmark'),go:g('.overlay.title .go'),prompt:g('.tprompt')}});
 console.log(w+'x'+h, JSON.stringify(o));
 await p.screenshot({path:`/tmp/ttlshots/rot_${w}x${h}.png`});
}
// mute tap on title must not start the game
await p.tap('.mute'); await new Promise(r=>setTimeout(r,800));
console.log('after mute tap: title still shown =', await p.evaluate(()=>!!document.querySelector('.overlay.title')), 'muteLabel', await p.evaluate(()=>document.querySelector('.mute')?.getAttribute('aria-label')));
console.log('errs',errs); await b.close();
