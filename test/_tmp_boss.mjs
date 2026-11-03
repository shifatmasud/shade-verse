
import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage(); await p.setViewport({width:915,height:412,isMobile:true,hasTouch:true,deviceScaleFactor:1.75});
await p.goto(process.argv[2]); await new Promise(r=>setTimeout(r,3000)); await p.evaluate(()=>window.__game.start());
await new Promise(r=>setTimeout(r,2000));
const bp=await p.evaluate(()=>{const s=window.__game.sim; const e=s.enemies.find(e=>e.boss&&!e.mini); s.pos=[e.x+30,e.y+5,e.z+30]; s.vel=[0,0,0]; window.__camOv=[e.x+35,e.y+12,e.z+35,e.x,e.y+8,e.z]; return [e.x,e.y,e.z]});
await new Promise(r=>setTimeout(r,9000));
const n=await p.evaluate(()=>{let k=0; window.__giantBossRoot&&window.__giantBossRoot.traverse(o=>{if(o.isMesh&&o.visible)k++}); return [window.__giantBossRoot&&window.__giantBossRoot.visible,k]});
await p.screenshot({path:process.argv[3]}); console.log(JSON.stringify({bp,n})); await b.close();
