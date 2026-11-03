
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const port = process.argv[2] || '4330', out = process.argv[3] || '/home/user/tab/files/combat_build', tag = process.argv[4] || 'hit';
fs.mkdirSync(out, { recursive: true });
const b = await puppeteer.launch({ executablePath: process.env.CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width: 915, height: 412, deviceScaleFactor: 1 });
const errors = []; p.on('pageerror', e => errors.push(String(e))); p.on('console', m => { const t = m.text(); if ((m.type() === 'error' || /shader|WebGLProgram/i.test(t)) && !/KHR_parallel/.test(t)) errors.push(t); });
await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await p.waitForFunction(() => !!window.__game, { timeout: 120000 });
for (let i = 0; i < 90; i++) { const ok = await p.evaluate(() => { if (window.__game.sim.mode !== 'play') window.__game.start(); return !!window.__scene && window.__game.sim.mode === 'play'; }); if (ok) break; await new Promise(r => setTimeout(r, 2000)); }
await new Promise(r => setTimeout(r, 2500));
const place = (d) => p.evaluate((d) => {
  const { sim } = window.__game; window.__ghostDisableCombat = true; const pp = sim.pos; sim.yaw = 0; sim.ang = 0;
  const E = sim.enemies.filter(e => !e.boss); E.forEach((e, i) => { if (i > 0) { e.x = pp[0] + 60 + i * 3; e.z = pp[2] + 60; } });
  const e = E[0]; e.x = pp[0]; e.z = pp[2] + d; e.y = pp[1] - 1; e.hp = 60; e.down = 0; e.hit = 0; e.atk = 0; e.kb = [0, 0]; e.vy = 0; e.ly = 0;
  window.__camOv = [pp[0] + 4.2, pp[1] + 1.6, pp[2] + d * 0.5 - 0.4, pp[0], pp[1] + 0.7, pp[2] + d * 0.5];
}, d);
const snap = async (name, n, ts) => { await p.evaluate((ts) => { window.__ts = ts; }, ts); for (let k = 0; k < n; k++) await p.screenshot({ path: `${out}/${tag}_${name}_${k}.png` }); await p.evaluate(() => { window.__ts = 1; }); };
const waitFor = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(fn)) return true; await new Promise(r => setTimeout(r, 30)); } return false; };
await place(2.4); await new Promise(r => setTimeout(r, 600));
await p.screenshot({ path: `${out}/${tag}_before.png` });
// 3 combo hits: wait for each hit frame, then capture a few slowed frames
for (const h of [1, 2, 3]) {
  await place(2.4);
  await p.evaluate(() => { window.__ts = 0.25; const i = window.__game.input; i.meleeQ = true; i.attackQ = true; });
  const ok = await waitFor(() => { const m = window.__game.sim.mv; return !!m && m.hit; }, 60000);
  console.log('hit', h, ok, JSON.stringify(await p.evaluate(() => { const s = window.__game.sim; return { id: s.mv && s.mv.id, fx: [window.__combatFx.pool.addN, window.__combatFx.pool.alphaN], trails: window.__combatFx.trails.map(t => t.n) }; })));
  await snap('p' + h, 3, 0.06);
  await waitFor(() => !window.__game.sim.mv, 60000); await p.evaluate(() => { window.__game.sim.chainT = 0.8; });
}
// web shot
await place(9); await new Promise(r => setTimeout(r, 300));
await p.evaluate(() => { window.__ts = 0.3; const i = window.__game.input; i.shotQ = true; i.attackQ = true; });
const okShot = await waitFor(() => window.__combatFx.pool.alphaN > 0 && window.__game.sim.plasma.length === 0, 60000); console.log('shot', okShot);
await snap('shot', 3, 0.05);
// Shock
await place(4); await new Promise(r => setTimeout(r, 300));
await p.evaluate(() => { window.__ts = 0.3; window.__game.input.specialQ = true; });
const okShock = await waitFor(() => { const s = window.__game.sim; return s.snareT > 0 && s.snareT <= 0.15; }, 90000); console.log('shock', okShock);
await snap('shock', 3, 0.05);
console.log('ERRORS', errors.length, JSON.stringify(errors.slice(0, 5)));
await b.close();
