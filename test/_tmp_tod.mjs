
import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:640,height:360});
const w=ms=>new Promise(r=>setTimeout(r,ms));
await p.goto('http://127.0.0.1:4311/',{waitUntil:'load'}); await w(3000);
await p.evaluate(()=>window.__game.start()); await w(2500);
for(const t of [0.15,0.3,1.4]){ await p.evaluate((t)=>{window.__todPh=t},t); await w(800);
 const r=await p.evaluate(()=>{let o={};window.__scene.traverse(m=>{if(m.material&&m.material.uniforms&&m.material.uniforms.uBoat){const u=m.material.uniforms;o={day:u.uDay.value,sky:u.uSky.value.getHexString(),sun:[u.uSun.value.x,u.uSun.value.y,u.uSun.value.z].map(x=>+x.toFixed(2)),refl:u.uUseRefl.value}}});return o});
 console.log(t,JSON.stringify(r));}
await b.close();
