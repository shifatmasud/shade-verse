
const puppeteer=require('puppeteer-core');
(async()=>{const b=await puppeteer.launch({executablePath:process.env.CH,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage();await p.emulate({viewport:{width:915,height:412,deviceScaleFactor:1.75,isMobile:true,hasTouch:true,isLandscape:true},userAgent:'Mozilla/5.0 (Linux; Android 12; SM-A125F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'});
const errs=[];p.on('console',m=>{if(m.type()=='error'||m.type()=='warning')errs.push(m.type()+': '+m.text().slice(0,300))});p.on('pageerror',e=>errs.push('PAGE '+e.message.slice(0,400)));p.on('requestfailed',r=>errs.push('REQFAIL '+r.url()));
await p.goto('http://127.0.0.1:4340/?t='+Date.now(),{waitUntil:'domcontentloaded',timeout:60000});
for(const t of [8]){await new Promise(r=>setTimeout(r,t==5?5000:t==15?10000:15000));await p.screenshot({path:'/tmp/fixLb_'+t+'.png'});}
console.log(JSON.stringify(errs.slice(0,30),null,1));
const s=await p.evaluate(()=>[...document.querySelectorAll('script[src]')].map(x=>x.src).join(' '));console.log(s);
await b.close();})();
