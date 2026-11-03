import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.emulate({viewport:{width:915,height:412,deviceScaleFactor:1,isMobile:true,hasTouch:true,isLandscape:true},userAgent:'Mozilla/5.0 (Linux; Android 11; SM-A107F) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'});
const w=ms=>new Promise(r=>setTimeout(r,ms)); await p.goto('http://127.0.0.1:4311/?debug',{waitUntil:'load'}); await w(2500); await p.evaluate(()=>window.__game.start()); await w(2500);
const spots=JSON.parse(process.env.SPOTS);
for (const [n,x,y,z] of spots){ await p.evaluate((x,y,z)=>{const s=window.__game.sim; s.pos=[x,y,z]; s.vel=[0,0,0];},x,y,z); await w(12000);
 const r=await p.evaluate(()=>{const sc=window.__scene, cam=window.__cam||null; const g={}; const fr=new (sc.constructor.__THREE||Object)();
  let tot=0; sc.traverse(o=>{ if(!(o.isMesh||o.isPoints||o.isLine)) return; let v=true,q=o; while(q){ if(!q.visible){v=false;break;} q=q.parent;} if(!v) return;
   let top='',q2=o; while(q2){ if(q2.name) top=q2.name; q2=q2.parent;} const k=top||('_'+(o.material&&o.material.type)); const gg=o.geometry; let t=gg.index?gg.index.count/3:(gg.attributes.position?gg.attributes.position.count/3:0); if(o.isInstancedMesh) t*=o.count; if(o.isPoints) t=0; if(o.geometry.drawRange&&o.geometry.drawRange.count!==Infinity) t=Math.min(t,o.geometry.drawRange.count/3*(o.isInstancedMesh?o.count:1)); const kk=k+'|'+(o.name||o.geometry.type)+'|'+(o.isInstancedMesh?o.count:''); g[kk]=(g[kk]||0)+Math.round(t); tot++; });
  return JSON.stringify({stats:window.__dbgStats, tot, g:Object.entries(g).sort((a,b)=>b[1]-a[1]).slice(0,25)}); });
 console.log(n, r); }
await b.close();