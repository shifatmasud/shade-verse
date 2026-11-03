
import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:process.env.CHROME,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const p=await b.newPage(); await p.setViewport({width:800,height:450}); await p.goto(process.argv[2]); await new Promise(r=>setTimeout(r,3000));
await p.evaluate(()=>window.__game.start()); await new Promise(r=>setTimeout(r,4000));
const o=await p.evaluate(()=>{const root=window.__giantBossRoot; const body=root.getObjectByName('giant-boss-shadow-body'); const sk=body.skeleton; const hi=sk.bones.findIndex(b=>b.name==='head'); const g=body.geometry, P=g.attributes.position, I=g.attributes.skinIndex, W=g.attributes.skinWeight; const inv=sk.boneInverses[hi];
 const mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9]; let n=0; const v=new (P.array.constructor===Float32Array?Object:Object)();
 for(let i=0;i<P.count;i++){ let w=0; for(let k=0;k<4;k++) if(I.getComponent(i,k)===hi) w+=W.getComponent(i,k); if(w<0.6) continue; n++;
   const x=P.getX(i),y=P.getY(i),z=P.getZ(i), e=inv.elements; const X=e[0]*x+e[4]*y+e[8]*z+e[12], Y=e[1]*x+e[5]*y+e[9]*z+e[13], Z=e[2]*x+e[6]*y+e[10]*z+e[14]; const a=[X,Y,Z]; for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],a[k]); mx[k]=Math.max(mx[k],a[k]);} }
 return {n,mn,mx};});
console.log(JSON.stringify(o)); await b.close();
