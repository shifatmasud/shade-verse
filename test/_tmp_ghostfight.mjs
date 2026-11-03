
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const port = process.argv[2], out = process.argv[3], tag = process.argv[4];
const b = await puppeteer.launch({ executablePath: process.env.CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width: 640, height: 360 });
const errors = []; p.on('pageerror', e => errors.push(String(e)));
await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await p.waitForFunction(() => !!window.__game, { timeout: 120000 });
for (let i = 0; i < 90; i++) { const ok = await p.evaluate(() => { if (window.__game.sim.mode !== 'play') window.__game.start(); return !!window.__scene && window.__game.sim.mode === 'play'; }); if (ok) break; await new Promise(r => setTimeout(r, 2000)); }
await new Promise(r => setTimeout(r, 4000));
// 3 bots next to Ghost's slot (right-behind the hero); hero idle; measure game-time damage
await p.evaluate(() => { const { sim } = window.__game; const pp = sim.pos; sim.yaw = 0; sim.ang = 0; sim.hp = 100;
  const E = sim.enemies.filter(e => !e.boss); E.forEach((e, i) => { if (i > 2) { e.x = pp[0] + 80 + i * 3; e.z = pp[2] + 80; } });
  const off = [[-3.5, 1.5], [-5, 2.5], [-4, 4]]; E.slice(0, 3).forEach((e, i) => { e.x = pp[0] + off[i][0]; e.z = pp[2] + off[i][1]; e.y = pp[1] - 1; e.hp = 99; e.down = 0; e.atk = 0; e.kb = [0, 0]; e.vy = 0; e.ly = 0; });
  window.__t0 = sim.time; window.__camOv = [pp[0] + 2, pp[1] + 4, pp[2] - 7, pp[0] - 3, pp[1], pp[2] + 2]; });
let shots = 0; const t0 = Date.now(); let last = null;
while (Date.now() - t0 < 300000) {
  const s = await p.evaluate(() => { const { sim } = window.__game; const g = window.__ghostActor; sim.hp = 100; const E = sim.enemies.filter(e => !e.boss).slice(0, 3); return { gt: +(sim.time - window.__t0).toFixed(2), dmg: E.reduce((a, e) => a + (99 - e.hp), 0), slams: g ? (g.slamN || 0) : -1, gy: g ? +(g.pos[1] - sim.pos[1]).toFixed(2) : null, gmv: g && g.mv ? g.mv.id : 0, gsl: g && g.slam ? g.slam.ph : -1, sep: g ? +Math.hypot(g.pos[0] - sim.pos[0], g.pos[2] - sim.pos[2]).toFixed(2) : null }; });
  last = s; if (shots < 6 && (s.gsl >= 0 || s.gmv)) { await p.screenshot({ path: `${out}/${tag}_${shots}.png` }); shots++; }
  if (s.gt >= 6) break; await new Promise(r => setTimeout(r, 200));
}
console.log('ghost6s', JSON.stringify(last));
console.log('ERRORS', errors.length, JSON.stringify(errors.slice(0, 3)));
await b.close();
