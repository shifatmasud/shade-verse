
import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:1280,height:720});
const w=ms=>new Promise(r=>setTimeout(r,ms));
await p.goto('http://127.0.0.1:4311/',{waitUntil:'load'}); await w(3000);
await p.evaluate(()=>window.__game.start()); await w(3000);
await p.evaluate(()=>{const s=window.__game.sim;s.pos=[-154,8,-876];s.vel=[0,0,0];window.__camOv=[-145,16,-866,-156,6,-880];window.__todPh=1.4});
await w(1500);
const r=await p.evaluate(()=>{const sc=window.__scene;const out=[];if(!sc)return 'noscene';sc.traverse(o=>{if(!o.visible)return; if(o.isLine||o.isLineSegments||o.type.includes('Line')){out.push([o.type,o.name,o.geometry?.attributes?.position?.count,o.material?.color?.getHexString?.(),o.parent?.type]);}});return out;});
console.log(JSON.stringify(r));
const r2=await p.evaluate(()=>{const sc=window.__scene;const out=[];sc.traverse(o=>{if(o.isMesh&&o.visible&&o.material&&o.material.color&&o.material.color.getHex()<0x222222){const g=o.geometry;g.computeBoundingSphere&&!g.boundingSphere&&g.computeBoundingSphere();out.push([o.name,o.type,g.attributes.position.count,o.material.type,o.material.color.getHexString()])}});return out.slice(0,40)});
console.log(JSON.stringify(r2));
await b.close();
