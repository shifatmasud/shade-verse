
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

const v=await p.evaluate(()=>{const out=[]; const cam=window.__cam; const sc=window.__scene; const V=sc.children[0].position.constructor; 
 let cp=null; sc.traverse(o=>{ if(o.isCamera && !cp) cp=o;});
 const want=['park-ground','south-sea-island']; sc.traverse(o=>{ if(!o.isMesh) return; let top='',q=o; while(q){ if(q.name){top=q.name;break;} q=q.parent;}
  const g=o.geometry; const n=g.index?g.index.count/3:g.attributes.position.count/3; if(n<20000 && !want.includes(top)) return; if(!g.boundingSphere) g.computeBoundingSphere(); const s=g.boundingSphere.clone().applyMatrix4(o.matrixWorld);
  out.push([top, o.material.type, n, s.center.toArray().map(Math.round), Math.round(s.radius), o.visible]); }); return {cam:JSON.stringify(window.__cam||null).slice(0,120), out};});
console.log(JSON.stringify(v)); await b.close();
