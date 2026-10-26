import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: 'new', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width:390, height:780, hasTouch:true, isMobile:true });
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('http://localhost:4173/',{waitUntil:'load'}); await new Promise(r=>setTimeout(r,1500));
await p.evaluate(()=>window.__game.start()); await new Promise(r=>setTimeout(r,600));
const R=await p.evaluate(async()=>{const s=window.__game.sim; const out={}; const base=[...s.pos];
 const read=()=>{const el=document.getElementById('bmark'); const m=/translate\(([-\d.]+)px,\s*([-\d.]+)px\) rotate\(([-\d.]+)deg\)/.exec(el.style.transform||''); return m?{x:+m[1]+20,y:+m[2]+20,rot:((+m[3])%360+360)%360}:null;};
 for(const [name,dx,dz] of [['toward',0,100],['away',0,-100],['left',100,0],['right',-100,0]]){ s.beacon=[base[0]+dx,base[1]+10,base[2]+dz]; await new Promise(r=>setTimeout(r,450)); s.pos=[...base]; s.vel=[0,0,0]; out[name]=read(); }
 return out;});
console.log(JSON.stringify(R),'errors',JSON.stringify(errs));
const W=390,H=780; const t=R.toward,a=R.away,l=R.left,r=R.right;
const ok = t&&a&&l&&r && Math.abs(t.x-W/2)<60 && a.y>H*0.75 && a.rot>150&&a.rot<210 && ((l.x<40&&r.x>W-40)||(l.x>W-40&&r.x<40)) && errs.length===0;
console.log(ok?'MARKER PASS':'MARKER FAIL'); await b.close(); process.exit(ok?0:1);
