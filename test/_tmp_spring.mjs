import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:915,height:412,deviceScaleFactor:1.75,isMobile:true,hasTouch:true});
const w=ms=>new Promise(r=>setTimeout(r,ms));
await p.goto('http://127.0.0.1:4311/?q=low',{waitUntil:'load'}); await w(3000); await p.evaluate(()=>window.__game.start()); await w(2000);

const res=[];
for (const yaw of [0, 1.57, 3.14]) {
 const r=await p.evaluate(async(yaw)=>{const g=window.__game,s=g.sim; s.pos=[20,1,60]; s.vel=[0,0,0]; s.yaw=yaw; s.ground=true; s.web=false; s.wall=null; await new Promise(r=>setTimeout(r,800));
  const st=[s.pos.slice()]; g.input.grabQ=true; let t=0; while(t<30000){await new Promise(r=>setTimeout(r,100)); t+=100; if(t%2000==0) st.push(s.pos.map(v=>Math.round(v))); if(t>600 && (s.ground||s.wall)) break;}
  return {yaw, start:st[0].map(Math.round), end:s.pos.map(v=>Math.round(v*10)/10), ground:s.ground, wall:!!s.wall, path:st,roof:s.springRoof,blds:0};},yaw);
 res.push(r);}
console.log(JSON.stringify(res)); await b.close();