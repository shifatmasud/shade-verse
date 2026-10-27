import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: 'new', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width:390, height:780, hasTouch:true, isMobile:true });
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('http://localhost:4173/',{waitUntil:'load'}); await new Promise(r=>setTimeout(r,1500));
await p.evaluate(()=>window.__game.start()); await new Promise(r=>setTimeout(r,600));
const R=await p.evaluate(async()=>{const g=window.__game,s=g.sim,B=g.buildings,w=(ms)=>new Promise(r=>setTimeout(r,ms)); const out={n:B.length};
 const overlap=(a,b)=>a!==b&&a.x0<b.x1&&a.x1>b.x0&&a.z0<b.z1&&a.z1>b.z0;
 const crowns=B.filter(c=>c.host!==undefined);
 out.crowns=crowns.length; out.hostsOk=crowns.every(c=>B[c.host]&&B[c.host].h<c.h);
 // spawn spot (centre+4,-4) and beacon (centre) must not be inside a crown footprint
 let bad=0; for(const o of B){ const cx=(o.x0+o.x1)/2, cz=(o.z0+o.z1)/2; for(const c of crowns){ if(c===o) continue; for(const [x,z] of [[cx+4,cz-4],[cx,cz]]) if(x>c.x0&&x<c.x1&&z>c.z0&&z<c.z1&&c.x0>=o.x0&&c.x1<=o.x1&&c.z0>=o.z0&&c.z1<=o.z1) bad++; } }
 out.badCentres=bad;
 // beacons over 40 respawns: inside any other taller building at that y?
 let bb=0; for(let i=0;i<40;i++){ s.beaconN++; window.__game.sim.beacon; }
 // land on a crowned roof and walk into crown
 const c=crowns[0]; const o=B[c.host];
 s.enemies.forEach(e=>{e.x=-300;e.z=-300;e.roof=undefined;});
 s.pos=[(c.x0+c.x1)/2+9,o.h+1,(c.z0+c.z1)/2]; s.vel=[0,0,0]; s.yaw=-Math.PI/2; s.ang=s.yaw; s.ground=true; await w(400);
 g.input.keys['w']=true; await w(1500); g.input.keys['w']=false;
 out.crownX=[c.x0,c.x1]; out.px=+s.pos[0].toFixed(2); out.py=+s.pos[1].toFixed(2); out.roofY=o.h;
 out.notInside=!(s.pos[0]>c.x0&&s.pos[0]<c.x1&&s.pos[2]>c.z0&&s.pos[2]<c.z1&&s.pos[1]<c.h+0.5);
 return out;});
console.log(JSON.stringify(R),'errors',JSON.stringify(errs));
const ok=R.hostsOk&&R.badCentres===0&&R.notInside&&errs.length===0; console.log(ok?'CROWN PASS':'CROWN FAIL'); await b.close(); process.exit(ok?0:1);
