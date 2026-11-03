import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.emulate({viewport:{width:915,height:412,deviceScaleFactor:1,isMobile:true,hasTouch:true,isLandscape:true},userAgent:'Mozilla/5.0 (Linux; Android 11; SM-A107F) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'});
const w=ms=>new Promise(r=>setTimeout(r,ms)); await p.goto('http://127.0.0.1:4311/?debug',{waitUntil:'load'}); await w(2500); await p.evaluate(()=>window.__game.start()); await w(2500);
const spots=JSON.parse(process.env.SPOTS);
for (const [n,x,y,z] of spots){ await p.evaluate((x,y,z)=>{const s=window.__game.sim; s.pos=[x,y,z]; s.vel=[0,0,0];},x,y,z); await w(12000);
 const r=await p.evaluate(()=>{const out=[]; window.__scene.traverse(o=>{ if(!o.isMesh) return; let v=true,q=o; while(q){ if(!q.visible){v=false;break;} q=q.parent;} if(!v) return; const gg=o.geometry; const t=(gg.index?gg.index.count:gg.attributes.position.count)/3*(o.isInstancedMesh?o.count:1); if(t>20000){ const chain=[]; let q3=o; while(q3){ chain.push(q3.name||q3.type); q3=q3.parent;} gg.computeBoundingSphere&&!gg.boundingSphere&&gg.computeBoundingSphere(); out.push([Math.round(t), chain.slice(0,4).join('<'), o.material.type, gg.boundingSphere?[Math.round(gg.boundingSphere.center.x),Math.round(gg.boundingSphere.center.z),Math.round(gg.boundingSphere.radius)]:0, o.frustumCulled]); }}); return JSON.stringify(out.sort((a,b)=>b[0]-a[0])); });
 const r_old=await p.evaluate(()=>{const sc=window.__scene, cam=window.__cam||null; const g={}; const fr=new (sc.constructor.__THREE||Object)();
  let tot=0; sc.traverse(o=>{ if(!(o.isMesh||o.isPoints||o.isLine)) return; let v=true,q=o; while(q){ if(!q.visible){v=false;break;} q=q.parent;} if(!v) return;
   let top='',q2=o; while(q2){ if(q2.name) top=q2.name; q2=q2.parent;} const k=top||('_'+(o.material&&o.material.type)); g[k]=(g[k]||0)+(Array.isArray(o.material)?o.material.length:1); tot++; });
  return JSON.stringify({stats:window.__dbgStats, tot, g:Object.entries(g).sort((a,b)=>b[1]-a[1]).slice(0,25)}); });
 console.log(n, r); }
await b.close();