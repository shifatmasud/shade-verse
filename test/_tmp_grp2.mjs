
import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage(); await p.setViewport({width:915,height:412,isMobile:true,hasTouch:true,deviceScaleFactor:1.75});
await p.evaluateOnNewDocument(()=>{window.__acc={};window.__cur='?';for(const C of [WebGL2RenderingContext]){const P=C.prototype;
 const add=(n,inst)=>{const a=window.__acc[window.__cur]||(window.__acc[window.__cur]={calls:0,tris:0});a.calls++;a.tris+=n*(inst||1)/3;};
 const de=P.drawElements;P.drawElements=function(m,c,t,o){add(c);return de.apply(this,arguments)};
 const da=P.drawArrays;P.drawArrays=function(m,f,c){add(c);return da.apply(this,arguments)};
 const dei=P.drawElementsInstanced;P.drawElementsInstanced=function(m,c,t,o,i){add(c,i);return dei.apply(this,arguments)};
 const dai=P.drawArraysInstanced;P.drawArraysInstanced=function(m,f,c,i){add(c,i);return dai.apply(this,arguments)};}});
await p.goto(process.argv[2]); await new Promise(r=>setTimeout(r,3000)); await p.evaluate(()=>window.__game.start());
await new Promise(r=>setTimeout(r,2000));
await p.evaluate((pos)=>{const s=window.__game.sim; setInterval(()=>{s.pos=pos;s.vel=[0,0,0]},100)}, JSON.parse(process.env.POS));
await new Promise(r=>setTimeout(r,12000));
await p.evaluate(()=>{const sc=window.__scene; sc.traverse(o=>{ if(!(o.isMesh||o.isPoints||o.isLine)) return; let top='',q=o; while(q){ if(q.name) {top=q.name;break;} q=q.parent;}
  const m=Array.isArray(o.material)?o.material[0]:o.material; const key=(top||'-')+'|'+(o.name||'')+'|'+(m&&(m.name||m.type))+'|'+(o.isInstancedMesh?'I'+o.count:'')+'|'+(o.geometry.index?o.geometry.index.count/3:o.geometry.attributes.position.count/3);
  const ob=o.onBeforeRender; o.onBeforeRender=function(){window.__cur=key; if(ob) return ob.apply(this,arguments)}; o.onAfterRender=function(){window.__cur='?'}; });});
await new Promise(r=>setTimeout(r,500));
const fr=await p.evaluate(async()=>{window.__acc={}; let f=0; await new Promise(r=>{function k(){f++; if(f<4) requestAnimationFrame(k); else r()} requestAnimationFrame(k)}); return f});
const v=await p.evaluate(()=>window.__acc); console.log(JSON.stringify(v)); await b.close();
