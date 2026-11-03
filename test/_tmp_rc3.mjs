
import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:1280,height:720});
const w=ms=>new Promise(r=>setTimeout(r,ms));
await p.goto('http://127.0.0.1:4311/',{waitUntil:'load'}); await w(3000);
await p.evaluate(()=>window.__game.start()); await w(3000);
await p.evaluate(()=>{const s=window.__game.sim;s.pos=[-148,17,-834];s.vel=[0,0,0];window.__camOv=[-148.0, 28, -864.0, -148, 17, -834];window.__todPh=1.4});
await w(2000);
await p.screenshot({path:'/tmp/rd0.png'});
const tags=[['river','vCalm'],['pool','uOut'],['sea','uBoat'],['beach','BEACH'],['foam','lz'],['falls','uDay'] ];
for(const [n,k] of tags){ const c=await p.evaluate((k)=>{let c=0;window.__scene.traverse(o=>{if(o.isMesh&&o.material&&o.material.fragmentShader&&o.material.fragmentShader.includes(k)){o.visible=false;c++}});return c},k); await w(600); await p.screenshot({path:'/tmp/rd_'+n+'.png'}); await p.evaluate((k)=>{window.__scene.traverse(o=>{if(o.isMesh&&o.material&&o.material.fragmentShader&&o.material.fragmentShader.includes(k)){o.visible=true}})},k); console.log(n,c);}
const r=await p.evaluate(()=>{const sc=window.__scene;let cam=null;sc.traverse(o=>{if(o.isPerspectiveCamera&&!cam)cam=o});const T=window.THREE||null;return {cam:!!cam,three:!!T, keys:Object.keys(window).filter(k=>k.startsWith('__')).join(',')}});
console.log(JSON.stringify(r));
await b.close();
