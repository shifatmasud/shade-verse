
import { buildings, WATER_Y } from '../src/sim';
const k={}; for (const b of buildings){ const key=(b.kind||'none')+(b.host!==undefined?'+host':'')+((b.h-WATER_Y)<3?'+low':''); k[key]=(k[key]||0)+1; }
console.log(JSON.stringify(k)); 
const s=buildings.filter(b=>b.kind==='solid'); const zs=s.map(b=>Math.round((b.z0+b.z1)/2)); console.log('solid z range',Math.min(...zs),Math.max(...zs), 'x', Math.min(...s.map(b=>b.x0)), Math.max(...s.map(b=>b.x1)));
