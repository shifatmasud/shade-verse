import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const V=[['pp',390,844,3,1],['pl',844,390,3,1],['sp',360,640,2,1],['tp',768,1024,2,1],['tl',1024,768,2,1],['dk',1366,768,1,0],['uw',1920,800,1,0]];
for(const [n,w,h,d,m] of V){const p=await b.newPage(); await p.setViewport({width:w,height:h,deviceScaleFactor:d,isMobile:!!m,hasTouch:!!m});
await p.goto('http://127.0.0.1:4311/?q=low',{waitUntil:'load'}); await new Promise(r=>setTimeout(r,3500));
await p.screenshot({path:process.argv[2]+'_'+n+'.png'}); await p.close();}
await b.close();