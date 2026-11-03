
const puppeteer = require('/home/user/tab/work/shade-verse/node_modules/puppeteer-core');
(async()=>{const b=await puppeteer.launch({executablePath:process.env.HOME+'/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,200))});
await p.setViewport({width:915,height:412,deviceScaleFactor:1.75,isMobile:true,hasTouch:true});
await p.goto('https://shade-verse-preview.vercel.app/',{waitUntil:'load',timeout:60000});await new Promise(r=>setTimeout(r,15000));
await p.screenshot({path:'/tmp/live_ph.png'});const t=await p.evaluate(()=>document.querySelector('.tname')&&document.querySelector('.tname').textContent);
await p.tap('.overlay.title').catch(e=>errs.push('tap '+e.message));await new Promise(r=>setTimeout(r,8000));
const ico=await p.evaluate(()=>document.querySelectorAll('.ico').length);await p.screenshot({path:'/tmp/live_ph2.png'});
console.log(JSON.stringify({title:t,icoButtonsOnPhone:ico,errs}));await b.close();})();