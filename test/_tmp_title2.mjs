import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:915,height:412,deviceScaleFactor:1.75,isMobile:true,hasTouch:true});
const t0=Date.now(); await p.goto('http://127.0.0.1:4311/?q=low',{waitUntil:'load'}); await new Promise(r=>setTimeout(r,2500));
console.log('canvas', await p.evaluate(()=>document.querySelectorAll('canvas').length), 'ms', Date.now()-t0);
console.log(await p.evaluate(()=>[[450,15],[450,60],[450,400],[450,200]].map(([x,y])=>[...document.querySelectorAll('*')].filter(e=>{const r=e.getBoundingClientRect(); return r.top<=y&&r.bottom>=y&&r.left<=x&&r.right>=x && getComputedStyle(e).pointerEvents==='none';}).slice(0,6).map(e=>e.tagName+'.'+(e.className&&e.className.baseVal===undefined?e.className:'')+'#'+getComputedStyle(e).backgroundColor+'/'+getComputedStyle(e).backgroundImage.slice(0,60)).join(' | ')).join('\n')));
await p.screenshot({path:'/tmp/title.png'}); await b.close();