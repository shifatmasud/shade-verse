
import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage(); await p.setViewport({width:1366,height:768,deviceScaleFactor:1});
await p.goto(process.argv[2]); await new Promise(r=>setTimeout(r,3000)); await p.evaluate(()=>{window.__perfPin=1;window.__game.start()});
await new Promise(r=>setTimeout(r,2000));
const D=JSON.parse(process.env.D||'{}');
await p.evaluate((D)=>{const s=window.__game.sim; const e=s.enemies.find(e=>e.boss&&(D.mini?e.mini:!e.mini)); s.pos=[e.x+40,e.y+5,e.z+40]; s.vel=[0,0,0]; window.__camOv=[e.x+35,e.y+12,e.z+35,e.x,e.y+8,e.z]; if(D.tod!=null&&window.__setTod)window.__setTod(D.tod);},D);
await new Promise(r=>setTimeout(r,6000));
const info=await p.evaluate((D)=>{const T=window.__THREE||null; let head=null; const R=D.mini?(()=>{let r=null; window.__scene.traverse(o=>{if(!r&&o.userData&&o.userData.giantBoss&&o!==window.__giantBossRoot)r=o}); return r||window.__giantBossRoot})():window.__giantBossRoot; R.traverse(o=>{if(!head&&/head/i.test(o.name)&&o.isBone)head=o}); if(!head) R.traverse(o=>{if(!head&&/head/i.test(o.name))head=o});
 const m=head.matrixWorld.elements; const hp=[m[12],m[13],m[14]]; const r=R.matrixWorld.elements; const fz=[r[8],r[9],r[10]]; const l=Math.hypot(fz[0],fz[2]); const f=[fz[0]/l,fz[2]/l];
 const d=D.dist||4, up=D.up||0.3; window.__camOv=[hp[0]+f[0]*d+ (D.side||0)*f[1], hp[1]+up, hp[2]+f[1]*d-(D.side||0)*f[0], hp[0],hp[1]+(D.look||0.15),hp[2]]; return {name:head.name,hp,f}},D);
await p.evaluate((D)=>{if(D.hide&&window.__bossArenaMarker)window.__bossArenaMarker.visible=false},D); await new Promise(r=>setTimeout(r,4000));
await p.screenshot({path:process.argv[3]}); console.log(JSON.stringify(info)); await b.close();
