
import puppeteer from 'puppeteer-core'; import fs from 'fs';
const b=await puppeteer.launch({executablePath:process.env.CHROME,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const p=await b.newPage(); await p.goto('http://127.0.0.1:4311/',{waitUntil:'domcontentloaded'}); await p.waitForFunction(()=>window.__svSynth,{timeout:60000});
const out=await p.evaluate(async(n)=>{const {RECIPES,renderRecipe}=window.__svSynth;const ab=await renderRecipe(n,RECIPES[n]);const d=ab.getChannelData(0);let mx=0,s=0;for(const v of d){mx=Math.max(mx,Math.abs(v));s+=v*v}return {sr:ab.sampleRate,data:Array.from(d.filter((_,i)=>i%1===0)),peak:mx,rms:Math.sqrt(s/d.length)}},process.argv[2]);
console.log(JSON.stringify({peak:out.peak,rms:out.rms,sr:out.sr}));
const buf=Buffer.alloc(44+out.data.length*2);buf.write('RIFF',0);buf.writeUInt32LE(36+out.data.length*2,4);buf.write('WAVEfmt ',8);buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);buf.writeUInt16LE(1,22);buf.writeUInt32LE(out.sr,24);buf.writeUInt32LE(out.sr*2,28);buf.writeUInt16LE(2,32);buf.writeUInt16LE(16,34);buf.write('data',36);buf.writeUInt32LE(out.data.length*2,40);
out.data.forEach((v,i)=>buf.writeInt16LE(Math.max(-32767,Math.min(32767,v*32767|0)),44+i*2));fs.writeFileSync('/tmp/'+process.argv[2]+'.wav',buf);await b.close();