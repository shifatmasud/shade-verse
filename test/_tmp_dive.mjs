
import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage(); await p.setViewport({width:915,height:412,isMobile:true,hasTouch:true,deviceScaleFactor:1.75});
await p.goto(process.argv[2]); await new Promise(r=>setTimeout(r,3000)); await p.evaluate(()=>window.__game.start());
await new Promise(r=>setTimeout(r,2000));
const keys=await p.evaluate(()=>Object.keys(window.__game));
await p.evaluate(()=>{const s=window.__game.sim; s.pos=[0,-1,-500]; s.vel=[0,0,0];});
await new Promise(r=>setTimeout(r,3000));
const a=await p.evaluate(()=>{const s=window.__game.sim; s.dive=true; return [s.swim,s.dive,s.pos[1]]});
await new Promise(r=>setTimeout(r,3000));
const b1=await p.evaluate(()=>{const s=window.__game.sim; return [s.swim,s.dive,s.pos[1],s.hp]});
await p.keyboard.down('Space'); const ys=[];
for(let i=0;i<10;i++){ await new Promise(r=>setTimeout(r,400)); ys.push(await p.evaluate(()=>{const s=window.__game.sim; return [s.swim,s.dive,+s.pos[1].toFixed(1),s.glideOn]}));}
await p.keyboard.up('Space');
console.log(JSON.stringify({keys,a,b1,ys})); await b.close();
