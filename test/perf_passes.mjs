
import puppeteer from 'puppeteer-core';
const port=process.argv[2], mode=process.argv[3]||'phone';
const b = await puppeteer.launch({ executablePath: process.env.CHROME, headless: 'new', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage();
if (mode==='phone') { await p.setUserAgent('Mozilla/5.0 (Linux; Android 11; SM-M025F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36'); await p.setViewport({ width:760, height:360, deviceScaleFactor:2, hasTouch:true, isMobile:true }); }
else await p.setViewport({ width:1280, height:720, deviceScaleFactor:1 });
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto(`http://127.0.0.1:${port}/`,{waitUntil:'load',timeout:120000});
await p.waitForFunction(()=>!!window.__game,{timeout:120000}); await new Promise(r=>setTimeout(r,1000));
await p.evaluate(()=>window.__game.start());
await p.waitForFunction(()=>window.__game.sim.mode==='play'&&!!window.__gl,{timeout:180000,polling:250});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
await sleep(3000);
// instrument: wrap the renderer's render + time each call with finish()
await p.evaluate(()=>{ const gl=window.__gl, ctx=gl.getContext(); const orig=gl.render;
  window.__pf={on:false,rows:[],frame:[]};
  gl.render=function(sc,cam){ const P=window.__pf; if(!P.on) return orig.call(this,sc,cam);
    const rt=gl.getRenderTarget(); const px=new Uint8Array(16); const sync=()=>{ try{ ctx.readPixels(0,0,1,1,ctx.RGBA,ctx.UNSIGNED_BYTE,px);}catch(e){} }; sync(); const a=performance.now();
    orig.call(this,sc,cam); sync(); const ms=performance.now()-a;
    const key=(sc.name||sc.type)+'#'+sc.children.length+(cam.isOrthographicCamera?'o':'p')+'|L'+cam.layers.mask+'|'+(rt?(rt.width+'x'+rt.height):'screen');
    P.rows.push([key,ms,gl.info.render.calls,gl.info.render.triangles]); };
  const raf=()=>{ const P=window.__pf; if(P.on) P.frame.push(performance.now()); requestAnimationFrame(raf); }; requestAnimationFrame(raf);
});
const zones=[['street',0,2,0],['rooftop',0,80,0],['ocean',0,2,-215],['lake',202,3,104]];
const res={};
for (const [n,x,y,z] of zones) {
  await p.evaluate((x,y,z)=>{const s=window.__game.sim; s.pos=[x,y,z]; s.vel=[0,0,0]; s.web=false;},x,y,z);
  await sleep(2500);
  await p.evaluate(()=>{const P=window.__pf; P.rows=[]; P.frame=[]; P.on=true; window.__gl.info.autoReset=true;});
  await sleep(8000);
  const r=await p.evaluate(()=>{const P=window.__pf; P.on=false; const f=P.frame; const nf=f.length-1; const ft=nf>0?(f[f.length-1]-f[0])/nf:0;
    const agg={}; for(const [k,ms,c,t] of P.rows){ const A=agg[k]||(agg[k]={ms:0,n:0,c:0,t:0}); A.ms+=ms; A.n++; A.c+=c; A.t+=t; }
    for (const k in agg){ const A=agg[k]; A.ms=+(A.ms/Math.max(1,nf)).toFixed(1); A.c=Math.round(A.c/A.n); A.t=Math.round(A.t/A.n); A.n=+(A.n/Math.max(1,nf)).toFixed(2);} return {nf, frameMs:+ft.toFixed(1), passes:agg};});
  res[n]=r; console.log(n, JSON.stringify(r));
}
console.log('errors',errs.length, errs.slice(0,2).join('|')); await b.close();
