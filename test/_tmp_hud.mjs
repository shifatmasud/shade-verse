import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:915,height:412,deviceScaleFactor:1.75,isMobile:true,hasTouch:true});
const w=ms=>new Promise(r=>setTimeout(r,ms));
await p.goto('http://127.0.0.1:4311/?q=low',{waitUntil:'load'}); await w(3000); await p.evaluate(()=>window.__game.start()); await w(2000);

const r=await p.evaluate(()=>{const out=[];for(const e of document.querySelectorAll('*')){const cs=getComputedStyle(e);const bf=cs.backdropFilter||cs.webkitBackdropFilter;const r=e.getBoundingClientRect();if(r.width<1||cs.visibility=='hidden'||cs.display=='none')continue;const f=cs.filter;const mb=cs.mixBlendMode;if((bf&&bf!='none')||(f&&f!='none')||(mb&&mb!='normal')||cs.opacity==='0')out.push([e.className&&e.className.baseVal!==undefined?e.className.baseVal:e.className,bf,f&&f.slice(0,40),mb,cs.opacity,Math.round(r.width)+'x'+Math.round(r.height)]);}return out;});
console.log(JSON.stringify(r)); await p.screenshot({path:'/tmp/hud_now.png'}); await b.close();