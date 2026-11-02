
import { createSim, stepSim, input, buildings } from '../src/sim';
const ev: any = new Proxy({}, { get: () => () => {} });
function reset(s: any) { for (const k of ['jumpQ','swingQ','grabQ','swing','jumpHeld','jumpReleased','shotQ','meleeQ','specialQ','attackQ','dodgeQ']) (input as any)[k] = false; input.keys = {}; input.mx = input.my = 0; }
function mk() { const s: any = createSim(); s.mode = 'play'; s.hp = 100; s.time = 999; return s; }
// pick a tall interior building
const bs = (buildings as any[]).map((b, i) => ({ b, i })).filter(o => o.b.h > 40 && o.b.x1 - o.b.x0 > 8).sort((a, b) => Math.hypot(a.b.x0, a.b.z0) - Math.hypot(b.b.x0, b.b.z0));
const { b, i } = bs[0];
function onWall() { const s = mk(); const z = (b.z0 + b.z1) / 2; s.pos = [b.x0 - 0.45, b.h * 0.5, z]; s.vel = [0, 0, 0]; s.ground = false; s.wall = [-1, 0]; s.wallB = i; s.yaw = Math.PI / 2; /* camera facing +x = into wall */ reset(s); for (let k = 0; k < 10; k++) stepSim(s, 1 / 60, ev); return s; }
function onRoof() { const s = mk(); s.pos = [(b.x0 + b.x1) / 2, b.h + 1.0, (b.z0 + b.z1) / 2]; s.vel = [0, 0, 0]; s.ground = true; s.wall = null; s.yaw = 0.3; reset(s); for (let k = 0; k < 20; k++) stepSim(s, 1 / 60, ev); return s; }
const tallest = (buildings as any[]).map((b, i) => ({ b, i })).filter(o => !o.b.ob && o.b.x1 - o.b.x0 > 8).sort((a, b) => b.b.h - a.b.h)[0];
function onTop() { const s = mk(); const B = tallest.b; s.pos = [(B.x0 + B.x1) / 2, B.h + 1.0, (B.z0 + B.z1) / 2]; s.vel = [0, 0, 0]; s.ground = true; s.wall = null; s.yaw = 0.3; reset(s); for (let k = 0; k < 20; k++) stepSim(s, 1 / 60, ev); return s; }
const st = (s: any) => ({ p: s.pos.map((x: number) => +x.toFixed(1)), v: s.vel.map((x: number) => +x.toFixed(1)), wall: !!s.wall, web: s.web, ground: s.ground, glide: !!s.glideOn, gf: !!s.grappleFlight, spring: +s.spring.toFixed?.(2) });
function run(name: string, s: any, fire: (s: any, k: number) => void, n = 60) {
  const s0 = st(s); const y0 = s.yaw; let maxY = s.pos[1], sawWeb = false, sawGlide = false, sawGF = false, minDist = 99;
  for (let k = 0; k < n; k++) { fire(s, k); stepSim(s, 1 / 60, ev); maxY = Math.max(maxY, s.pos[1]); sawWeb ||= s.web; sawGlide ||= !!s.glideOn; sawGF ||= !!s.grappleFlight || s.spring > 0; }
  console.log(name, JSON.stringify({ start: s0, end: st(s), dy: +(maxY - s0.p[1]).toFixed(1), awayX: +(s0.p[0] - s.pos[0]).toFixed(1), moved: +Math.hypot(s.pos[0]-s0.p[0], s.pos[2]-s0.p[2]).toFixed(1), yaw: +(s.yaw - y0).toFixed(2), anchorReal: s.anchorReal, sawWeb, sawGlide, sawGF }));
}
console.log('bld', i, b.x0, b.x1, b.z0, b.z1, b.h);
run('wall-idle', onWall(), () => {});
run('wall-spring', onWall(), (s, k) => { if (k === 0) input.grabQ = true; });
run('wall-swing', onWall(), (s, k) => { input.swing = true; if (k === 0) input.swingQ = true; });
run('wall-jumphold', onWall(), (s, k) => { input.jumpHeld = true; if (k === 0) input.jumpQ = true; }, 90);
run('wall-jumptap', onWall(), (s, k) => { if (k === 0) { input.jumpQ = true; input.jumpHeld = true; } if (k === 3) { input.jumpHeld = false; input.jumpReleased = true; } });
run('roof-idle', onRoof(), () => {});
run('roof-spring', onRoof(), (s, k) => { if (k === 0) input.grabQ = true; });
run('roof-swing', onRoof(), (s, k) => { input.swing = true; if (k === 0) input.swingQ = true; }, 90);

run('top-idle', onTop(), () => {});
run('top-spring', onTop(), (s, k) => { if (k === 0) input.grabQ = true; });
run('top-swing', onTop(), (s, k) => { input.swing = true; if (k === 0) input.swingQ = true; }, 120);
for (const yw of [0, 1.5, 3, 4.5]) run('roof-swing-yaw' + yw, (() => { const s = onRoof(); s.yaw = yw; return s; })(), (s, k) => { input.swing = true; if (k === 0) input.swingQ = true; }, 120);
for (const yw of [0, 1.5, 3, 4.5]) run('top-swing-yaw' + yw, (() => { const s = onTop(); s.yaw = yw; return s; })(), (s, k) => { input.swing = true; if (k === 0) input.swingQ = true; }, 120);
run('wall-swing-sideyaw', (() => { const s = onWall(); s.yaw = 0.4; return s; })(), (s, k) => { input.swing = true; if (k === 0) input.swingQ = true; });
run('wall-jumphold-fly', onWall(), (s, k) => { input.jumpHeld = true; if (k === 0) input.jumpQ = true; }, 150);

{ const s = onWall(); input.grabQ = true; for (let k = 0; k < 40; k++) { stepSim(s, 1/60, ev); if (k % 4 === 0) console.log('WS', k, s.pos.map((x: number) => x.toFixed(1)).join(','), s.vel.map((x: number) => x.toFixed(1)).join(','), 'anc', s.anchor.map((x: number) => x.toFixed(1)).join(','), JSON.stringify((s.anchor as any).roof), s.wall, s.spring.toFixed(2)); } }
{ const s = onWall(); for (let k = 0; k < 40; k++) { input.swing = true; if (k === 0) input.swingQ = true; stepSim(s, 1/60, ev); if (k % 4 === 0) console.log('WW', k, s.pos.map((x: number) => x.toFixed(1)).join(','), s.vel.map((x: number) => x.toFixed(1)).join(','), 'anc', s.anchor.map((x: number) => x.toFixed(1)).join(','), s.wall, s.web, s.rope.toFixed(1)); } }
