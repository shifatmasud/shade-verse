
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
await p.evaluate(()=>{ const gl=window.__gl, orig=gl.render; window.__rs=[]; gl.render=function(sc,cam){ if(!cam.isOrthographicCamera&&cam.layers.mask===1) window.__scene=sc; return orig.call(this,sc,cam); };
  window.__fr=[]; const raf=()=>{window.__fr.push(performance.now()); requestAnimationFrame(raf);}; requestAnimationFrame(raf); });
await sleep(1500);
const meas=async(ms=5000)=>{ await p.evaluate(()=>{window.__fr=[];}); await sleep(ms); return p.evaluate(()=>{const f=window.__fr; const d=[]; for(let i=1;i<f.length;i++) d.push(f[i]-f[i-1]); d.sort((a,b)=>a-b); return +d[Math.floor(d.length/2)].toFixed(1);}); };
const out={}; out.base=await meas();
const tog=async(name,on,off)=>{ await p.evaluate(on); out[name]=await meas(); await p.evaluate(off); };
await tog('worldHidden',()=>{window.__hid=window.__scene.children.filter(c=>c.visible); window.__hid.forEach(c=>c.visible=false);},()=>window.__hid.forEach(c=>c.visible=true));
await tog('noShadowMap',()=>{window.__gl.shadowMap.enabled=false;},()=>{window.__gl.shadowMap.enabled=true;});
await tog('simPaused',()=>{window.__ts=0;},()=>{window.__ts=undefined;});
const kids=await p.evaluate(()=>window.__scene.children.map((c,i)=>[i,c.name||c.type,c.visible]).filter(k=>k[2]));
console.log(JSON.stringify({zone:zoneArg,...out}));
for (const [i,name] of kids) { await p.evaluate((i)=>{window.__scene.children[i].visible=false;},i); const v=await meas(3000); await p.evaluate((i)=>{window.__scene.children[i].visible=true;},i); if(out.base-v>5) console.log(JSON.stringify([i,name,+(out.base-v).toFixed(1)])); }
await b.close();
