import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:915,height:412,hasTouch:true,isMobile:true});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
const w=ms=>new Promise(r=>setTimeout(r,ms)); await p.goto(process.argv[2]||'http://127.0.0.1:4311/',{waitUntil:'load'}); await w(2500);
await p.evaluate(()=>window.__game.start()); await w(2500);
const list=await p.evaluate(()=>window.__game.buildings.map((b,i)=>[i,b.kind,b.x0,b.x1,b.z0,b.z1,b.y0??0,b.h,b.ob||null]).filter(r=>r[1]==='solid'));
const pick=list.filter((_,i)=>i%Math.max(1,Math.floor(list.length/40))===0);
let fail=[];
for (const [i,k,x0,x1,z0,z1,y0,h,ob] of pick) {
  const cx=ob?ob[0]:(x0+x1)/2, cz=ob?ob[1]:(z0+z1)/2, cy=Math.max(y0+1.0,Math.min(h-1.2,(y0+h)/2)), thin=(x1-x0<1.5||z1-z0<1.5);
  // approach from outside along x at mid height and push in
  // walk into it from outside (+z side) at mid height, pushing toward the centre for 1.2 s; it must never reach the centre line
  const alongX=(x1-x0)<(z1-z0), ez=(alongX?(x1-x0):(z1-z0))/2+1.5;   // approach across the thin side
  const r=await p.evaluate(async(cx,cy,cz,ez,ax)=>{const s=window.__game.sim; s.pos=ax?[cx+ez,cy,cz]:[cx,cy,cz+ez]; s.web=false; s.swim=false; s.glideOn=false; let minD=1e9; const t0=performance.now();
     while(performance.now()-t0<1500){ s.vel=ax?[-12,0,0]:[0,0,-12]; s.pos[1]=cy; await new Promise(r=>setTimeout(r,30)); minD=Math.min(minD,ax?s.pos[0]-cx:s.pos[2]-cz); } return minD;},cx,cy,cz,ez,alongX);
  if (r < 0.05) fail.push([i,cx.toFixed(0),cz.toFixed(0),y0.toFixed(1),h.toFixed(1),r.toFixed(2)]);
}
console.log(JSON.stringify({solids:list.length, tested:pick.length, fail:fail.slice(0,10), errs:errs.slice(0,2)}));
console.log(fail.length===0&&!errs.length?'COLLISION PASS':'COLLISION FAIL'); await b.close(); process.exit(fail.length?1:0);