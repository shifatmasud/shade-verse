
import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage(); await p.setViewport({width:915,height:412,isMobile:true,hasTouch:true,deviceScaleFactor:1.75});
await p.goto(process.argv[2]); await new Promise(r=>setTimeout(r,3000)); await p.evaluate(()=>{window.__game.start()}); await new Promise(r=>setTimeout(r,5000));
const r=await p.evaluate(()=>{const rows=[];window.__scene.traverse(o=>{if(o.isInstancedMesh&&o.name.startsWith('polyfork')){const m=Array.isArray(o.material)?o.material[0]:o.material;rows.push([m.uuid.slice(0,6),m.name,o.name.slice(9,40),m.type,m.map?(m.map.image?m.map.image.width+'x'+m.map.image.height:'map'):'-',(m.color?m.color.getHexString():''),m.vertexColors,m.transparent,o.geometry.attributes.uv?1:0,o.geometry.attributes.color?1:0])}});return rows});
console.log(JSON.stringify(r)); await b.close();
