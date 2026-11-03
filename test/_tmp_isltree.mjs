
import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage(); await p.setViewport({width:1280,height:720});
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,300))});
await p.goto(process.argv[2]); await new Promise(r=>setTimeout(r,3000)); await p.evaluate(()=>window.__game.start()); await new Promise(r=>setTimeout(r,3000));
const r=await p.evaluate(()=>{const out={};window.__scene.traverse(o=>{if(o.isInstancedMesh&&o.material&&o.material.customProgramCacheKey){let k='';try{k=o.material.customProgramCacheKey()}catch(e){};if(k&&k.startsWith('isl')){const a=o.instanceMatrix.array;out[k+'_'+o.uuid.slice(0,4)]={n:o.count,vis:o.visible,first:[a[12],a[13],a[14]].map(v=>+v.toFixed(1)),tris:(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3};}}});return out});
console.log(JSON.stringify(r)); console.log(JSON.stringify(errs)); await b.close();
