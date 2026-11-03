
import { islandH, FARM, ICE, ISLAND } from '../src/seaWorld'; import { WATER_Y, buildings } from '../src/sim';
for (const [nm,I] of [['isl',ISLAND],['farm',FARM],['ice',ICE]] as any) { let hm=0,rm=0; for (let j=-12;j<=12;j++) for (let i=-12;i<=12;i++){ const x=I.cx+i/12*I.R*1.3, z=I.cz+j/12*I.R*1.3, h=islandH(x,z); if(h==null||h<WATER_Y+0.3) continue; hm=Math.max(hm,h-WATER_Y); rm=Math.max(rm,Math.hypot(x-I.cx,z-I.cz)); }
 let bt=0, nb=0; for (const b of buildings as any[]) { const mx=(b.x0+b.x1)/2, mz=(b.z0+b.z1)/2; if (Math.hypot(mx-I.cx,mz-I.cz)<I.R*1.2){ nb++; bt=Math.max(bt,b.h-WATER_Y);} }
 console.log(nm, I.cx, I.cz, I.R, 'hm',hm.toFixed(1),'rm',rm.toFixed(0),'bldg',nb,'top',bt.toFixed(1)); }
