import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); await p.setViewport({width:915,height:412,deviceScaleFactor:1.75,isMobile:true,hasTouch:true});
const w=ms=>new Promise(r=>setTimeout(r,ms));
await p.goto('http://127.0.0.1:4311/?q=low',{waitUntil:'load'}); await w(3000); await p.evaluate(()=>window.__game.start()); await w(2000);
await p.evaluate(()=>{const s=window.__game.sim;s.pos=[-75,17,-694];s.vel=[0,0,0]}); await w(40000);
const c=await p.target().createCDPSession(); await c.send('Profiler.enable'); await c.send('Profiler.setSamplingInterval',{interval:200}); await c.send('Profiler.start');
await p.evaluate(()=>{window.__fly=setInterval(()=>{const s=window.__game.sim;s.pos=[s.pos[0]+3,17,s.pos[2]+2];},100)}); await w(8000);
const {profile}=await c.send('Profiler.stop'); const self=new Map(); const byId=new Map(profile.nodes.map(n=>[n.id,n]));
const dt=profile.timeDeltas; const cnt=new Map(); profile.samples.forEach((id,i)=>cnt.set(id,(cnt.get(id)||0)+(dt[i]||0)));
for(const [id,t] of cnt){const n=byId.get(id); const k=n.callFrame.functionName+' '+n.callFrame.url.split('/').pop()+':'+n.callFrame.lineNumber; self.set(k,(self.get(k)||0)+t)}
const tot=[...self.values()].reduce((a,b)=>a+b,0); console.log(JSON.stringify([...self].sort((a,b)=>b[1]-a[1]).slice(0,25).map(([k,t])=>[k,(t/tot*100).toFixed(1)])));
await b.close();