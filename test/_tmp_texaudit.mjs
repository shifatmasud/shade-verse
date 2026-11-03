import puppeteer from 'puppeteer-core';
// texture audit (perf item 13): every texture referenced by a scene material (+ uniforms): size, mipmaps, anisotropy, filters, format
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});const p=await b.newPage();await p.setViewport({width:915,height:412,isMobile:true,hasTouch:true,deviceScaleFactor:1.75});
const w=ms=>new Promise(r=>setTimeout(r,ms));
await p.goto('http://127.0.0.1:'+process.env.PORT+'/'+(process.env.QS||'?q=low'));await w(3000);await p.evaluate(()=>window.__game.start());
for(let i=0;i<120&&(await p.evaluate(()=>window.__game.sim.mode))!=='play';i++) await w(500); await w(5000);
const r=await p.evaluate(()=>{const seen=new Map(); const add=(t,where)=>{ if(!t||!t.isTexture||seen.has(t.uuid)) return; const im=t.image||{}; const W=im.width||(im.data&&im.data.width)||0, H=im.height||(im.data&&im.data.height)||0; seen.set(t.uuid,[t.name||'',W,H,t.generateMipmaps?1:0,t.anisotropy,t.minFilter,t.magFilter,t.format,t.type,t.isRenderTargetTexture?1:0,t.isCubeTexture?1:0,t.isDataTexture?1:0,where]); };
  window.__scene.traverse(o=>{ const ms=Array.isArray(o.material)?o.material:(o.material?[o.material]:[]); for(const m of ms){ for(const k in m){ const v=m[k]; if(v&&v.isTexture) add(v,(o.name||o.type)+'.'+k);} if(m.uniforms) for(const k in m.uniforms){ const v=m.uniforms[k]&&m.uniforms[k].value; if(v&&v.isTexture) add(v,(o.name||o.type)+'.u.'+k); if(Array.isArray(v)) v.forEach(x=>x&&x.isTexture&&add(x,(o.name||o.type)+'.u.'+k)); } } });
  const gl=window.__gl; return {info:gl.info.memory, maxAniso:gl.capabilities.getMaxAnisotropy(), list:[...seen.values()].sort((a,b)=>b[1]*b[2]-a[1]*a[2])};});
console.log(JSON.stringify({info:r.info,maxAniso:r.maxAniso,n:r.list.length})); for(const e of r.list.slice(0,60)) console.log(JSON.stringify(e));
await b.close();