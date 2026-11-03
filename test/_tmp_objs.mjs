
import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage(); await p.setViewport({width:915,height:412,isMobile:true,hasTouch:true,deviceScaleFactor:1.75});
await p.goto(process.argv[2]); await new Promise(r=>setTimeout(r,3000)); await p.evaluate(()=>{window.__game.start()});
await new Promise(r=>setTimeout(r,5000));
const r=await p.evaluate(()=>{const s=window.__scene;let tot=0;const rows=[];const cnt=o=>{let n=0;o.traverse(()=>n++);return n};
 const walk=(o,d,path)=>{for(const c of o.children){const n=cnt(c);if(d<2&&n>40)rows.push([path+'/'+(c.name||c.type),n]);if(d<1)walk(c,d+1,path+'/'+(c.name||c.type));}};
 walk(s,0,'');s.traverse(()=>tot++);return {tot,rows}});
console.log(JSON.stringify(r)); await b.close();
