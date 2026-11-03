
import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage(); await p.setViewport({width:915,height:412,isMobile:true,hasTouch:true,deviceScaleFactor:1.75});
await p.goto(process.argv[2]); await new Promise(r=>setTimeout(r,3000)); await p.evaluate(()=>{window.__game.start()}); await new Promise(r=>setTimeout(r,12000));
const r=await p.evaluate(()=>{let n=0,k=0;const g=window.__scene.getObjectByName('roof-props');g&&g.traverse(o=>{if(o.isInstancedMesh){n+=o.count;k++}});return [k,n]});
console.log(JSON.stringify(r)); await b.close();
