import puppeteer from 'puppeteer-core'; import fs from 'fs';
// regression stills (perf item 16): same spots/cameras for any build. args: url outPrefix [phone]
const url=process.argv[2], out=process.argv[3], PH=process.argv[4]==='phone';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});const p=await b.newPage();
await p.setViewport(PH?{width:915,height:412,isMobile:true,hasTouch:true,deviceScaleFactor:1.75}:{width:1280,height:720,deviceScaleFactor:1});
const errs=[]; p.on('pageerror',e=>errs.push('PAGE '+String(e))); p.on('console',m=>{if(m.type()==='error'||/shader|GL_INVALID/i.test(m.text()))errs.push(m.type()+' '+m.text())});
const w=ms=>new Promise(r=>setTimeout(r,ms));
await p.goto(url+(PH?'?q=low':''));await w(3500); await p.screenshot({path:out+'_title.png'});
await p.evaluate(()=>window.__game.start()); for(let i=0;i<120&&(await p.evaluate(()=>window.__game.sim.mode))!=='play';i++) await w(500); await w(3000);
const spots=[['street',[20,2,60]],['harbor',[150,20,-990]],['island',[-160,20,-731]],['ocean',[0,8,-650]],['swim',[6,-1,-488]],['under',null,[10,-6,-480,-20,2,-560]]];
for(const [n,pos,cam] of spots){
  await p.evaluate((pos,cam)=>{const s=window.__game.sim; delete window.__camOv; window.__ts=1; if(pos){s.pos=pos.slice(); s.vel=[0,0,0];} else { s.pos=[0,-6,-500]; s.vel=[0,0,0]; window.__camOv=cam; }},pos,cam);
  await w(9000); await p.screenshot({path:out+'_'+n+'.png'});
}
fs.writeFileSync(out+'_errs.txt',errs.join('\n')); console.log('ERRS',errs.filter(e=>!/KHR_parallel/.test(e)).length); await b.close();