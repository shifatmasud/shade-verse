
import puppeteer from 'puppeteer-core';
const port=process.argv[2], zoneArg=process.argv[3]||'street';
const Z={street:[0,2,0],lake:[202,3,104],ocean:[0,2,-215],rooftop:[0,80,0]}[zoneArg];
const b = await puppeteer.launch({ executablePath: process.env.CHROME, headless: 'new', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage();
await p.setUserAgent('Mozilla/5.0 (Linux; Android 11; SM-M025F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36'); await p.setViewport({ width:760, height:360, deviceScaleFactor:2, hasTouch:true, isMobile:true });
await p.goto(`http://127.0.0.1:${port}/`,{waitUntil:'load',timeout:120000});
await p.waitForFunction(()=>!!window.__game,{timeout:120000}); await new Promise(r=>setTimeout(r,1000));
await p.evaluate(()=>window.__game.start());
await p.waitForFunction(()=>window.__game.sim.mode==='play'&&!!window.__gl,{timeout:180000,polling:250});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
await p.evaluate((Z)=>{const s=window.__game.sim; s.pos=[...Z]; s.vel=[0,0,0];},Z);
await sleep(3000);
await p.evaluate(()=>{ const gl=window.__gl, ctx=gl.getContext(); const orig=gl.render; window.__pf={on:false,ms:0,n:0,sh:0};
  gl.render=function(sc,cam){ const P=window.__pf; if(!P.on||cam.isOrthographicCamera||cam.layers.mask!==1) return orig.call(this,sc,cam);
    const px=new Uint8Array(4); ctx.readPixels(0,0,1,1,ctx.RGBA,ctx.UNSIGNED_BYTE,px); const a=performance.now(); orig.call(this,sc,cam); ctx.readPixels(0,0,1,1,ctx.RGBA,ctx.UNSIGNED_BYTE,px); P.ms+=performance.now()-a; P.n++; window.__scene=sc; };
  window.__pf.on=true; });
await sleep(1500);
const meas=async(ms=4000)=>{ await p.evaluate(()=>{const P=window.__pf;P.ms=0;P.n=0;}); await sleep(ms); return p.evaluate(()=>{const P=window.__pf; return +(P.ms/Math.max(1,P.n)).toFixed(1);}); };
const out={};
out.base=await meas();
await p.evaluate(()=>{window.__gl.shadowMap.autoUpdate=false;}); out.noShadowUpdate=await meas(); await p.evaluate(()=>{window.__gl.shadowMap.autoUpdate=true; window.__gl.shadowMap.needsUpdate=true;});

out.objects=await p.evaluate(()=>{let n=0,m=0,v=0; window.__scene.traverse(o=>{n++; if(o.isMesh)m++; if(o.visible)v++;}); return {n,m,v};});
await p.evaluate(()=>{window.__hid=window.__scene.children.filter(c=>c.visible); window.__hid.forEach(c=>c.visible=false);}); out.allHidden=await meas();
await p.evaluate(()=>{window.__hid.forEach(c=>c.visible=true); window.__scene.autoUpdate=false; window.__scene.matrixWorldAutoUpdate=false;}); out.noMatrixUpdate=await meas();
await p.evaluate(()=>{window.__scene.autoUpdate=true; window.__scene.matrixWorldAutoUpdate=true;});
// CPU-only: render with a 1x1 viewport scissor -> mostly JS + vertex
console.log(JSON.stringify({zone:zoneArg,...out})); await b.close();
