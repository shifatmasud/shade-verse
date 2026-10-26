import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: 'new', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width:390, height:780, hasTouch:true, isMobile:true });
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('http://localhost:4173/',{waitUntil:'load'}); await new Promise(r=>setTimeout(r,1500));
await p.evaluate(()=>window.__game.start()); await new Promise(r=>setTimeout(r,600));
const R=await p.evaluate(async()=>{const g=window.__game,s=g.sim,w=(ms)=>new Promise(r=>setTimeout(r,ms)); const out={};
 s.enemies.forEach(o=>{o.x=-300;o.z=-300;});
 // RUN on street along +z
 s.pos=[20,1,-200]; s.vel=[0,0,0]; s.yaw=0; s.ang=0; s.web=false; await w(300); const z0=s.pos[2]; g.input.keys['w']=true; await w(1500); out.runSpeed=+Math.hypot(s.vel[0],s.vel[2]).toFixed(1); out.runDz=+(s.pos[2]-z0).toFixed(1); g.input.keys['w']=false; await w(500); out.stopSpeed=+Math.hypot(s.vel[0],s.vel[2]).toFixed(1);
 // JUMP
 s.pos=[20,1,-100]; s.vel=[0,0,0]; await w(300); const y0=s.pos[1]; g.input.jumpQ=true; let apex=y0, air=false; for(let i=0;i<40;i++){ await w(50); apex=Math.max(apex,s.pos[1]); if(!s.ground) air=true; } out.jumpApex=+(apex-y0).toFixed(1); out.jumpAirborne=air; for(let i=0;i<80;i++){ await w(50); if(s.ground) break; } out.jumpLanded=s.ground;
 // GROUND -> SWING -> RELEASE -> LAND (from a rooftop start)
 const b0=s.pos; s.pos=[20,1,-100]; s.vel=[0,0,0]; s.ground=true; await w(300);
 g.input.jumpQ=true; await w(250); out.airBeforeWeb=!s.ground; g.input.swingQ=true; g.input.swing=true; await w(1500); out.webAttached=s.web; out.swingSpeed=+Math.hypot(s.vel[0],s.vel[1],s.vel[2]).toFixed(1); out.swingsCount=s.swings;
 g.input.swing=false; await w(300); out.releasedWeb=!s.web; let landed=false; for(let i=0;i<300;i++){ await w(50); if(s.ground){landed=true;break;} } out.landedAfterRelease=landed; out.endState=[s.pos.map(x=>+x.toFixed(0)).join(','),s.vel.map(x=>+x.toFixed(0)).join(','),s.web,s.ground,s.mode].join(' '); out.hpAfter=Math.round(s.hp);
 return out;});
console.log(JSON.stringify(R),'errors',JSON.stringify(errs));
const ok = R.runSpeed>8 && R.runDz>8 && R.stopSpeed<3 && R.jumpApex>2.0 && R.jumpAirborne && R.jumpLanded && R.airBeforeWeb && R.webAttached && R.swingSpeed>R.runSpeed && R.releasedWeb && R.landedAfterRelease && errs.length===0;
console.log(ok?'MOTION PASS':'MOTION FAIL'); await b.close(); process.exit(ok?0:1);
