import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:915,height:412,deviceScaleFactor:1,isMobile:true,hasTouch:true});
await p.evaluateOnNewDocument(()=>{const C={};window.__glc=C;const P=WebGL2RenderingContext.prototype;for(const k of Object.getOwnPropertyNames(P)){const d=Object.getOwnPropertyDescriptor(P,k);if(!d||typeof d.value!=='function')continue;const f=d.value;P[k]=function(...a){C[k]=(C[k]||0)+1;return f.apply(this,a)}}});
const w=ms=>new Promise(r=>setTimeout(r,ms));
await p.goto('http://127.0.0.1:4311/?q=low',{waitUntil:'load'}); await w(3000); await p.evaluate(()=>window.__game.start()); await w(2000);
await p.evaluate(()=>{const s=window.__game.sim;s.pos=[60,-1,-700];s.vel=[0,0,0];window.__perfPin=1}); await w(9000);
for(const hide of [0,1]){ if(hide) await p.evaluate(()=>window.__scene.traverse(o=>{if(o.material&&o.material.uniforms&&o.material.uniforms.uBench)o.visible=false}));
 await w(2000); await p.evaluate(()=>{for(const k in window.__glc)window.__glc[k]=0; window.__f0=performance.now(); window.__fn=0; const f=()=>{window.__fn++; requestAnimationFrame(f)}; requestAnimationFrame(f)}); await w(4000);
 const r=await p.evaluate(()=>{const n=window.__fn; const o={}; for(const k in window.__glc) if(window.__glc[k]) o[k]=Math.round(window.__glc[k]/n*10)/10; return {n,o}}); console.log(JSON.stringify({hide,...r}));}
await b.close();