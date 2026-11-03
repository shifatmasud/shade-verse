
import puppeteer from 'puppeteer-core';
const port = process.argv[2], out = process.argv[3], tag = process.argv[4];
const b = await puppeteer.launch({ executablePath: process.env.CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width: 915, height: 412 });
const errors = []; p.on('pageerror', e => errors.push(String(e)));
await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await p.waitForFunction(() => !!window.__game, { timeout: 120000 });
for (let i = 0; i < 90; i++) { const ok = await p.evaluate(() => { if (window.__game.sim.mode !== 'play') window.__game.start(); return !!window.__scene && window.__game.sim.mode === 'play'; }); if (ok) break; await new Promise(r => setTimeout(r, 2000)); }
await new Promise(r => setTimeout(r, 3000));
await p.evaluate(() => { const { sim, input } = window.__game; window.__ghostDisableCombat = true; const pp = sim.pos; sim.yaw = 0; sim.ang = 0;
  const E = sim.enemies.filter(e => !e.boss); E.forEach((e, i) => { if (i > 2) { e.x = pp[0] + 80 + i * 3; e.z = pp[2] + 80; } });
  const off = [[0, 7], [-4, 9], [4.5, 8]]; E.slice(0, 3).forEach((e, i) => { e.x = pp[0] + off[i][0]; e.z = pp[2] + off[i][1]; e.y = pp[1] - 1; e.hp = 60; e.down = 0; e.atk = 0; e.kb = [0, 0]; e.vy = 0; e.ly = 0; });
  window.__camOv = [pp[0] + 7, pp[1] + 4, pp[2] - 2.5, pp[0], pp[1] + 0.5, pp[2] + 4]; window.__ts = 0.3; input.specialQ = true; });
for (const [nm, th] of [['gather', 1.2], ['grip', 0.5], ['discharge', 0.12]]) {
  const t0 = Date.now(); while (Date.now() - t0 < 90000) { const v = await p.evaluate(() => window.__game.sim.snareT); if (v > 0 && v <= th) break; await new Promise(r => setTimeout(r, 30)); }
  await p.evaluate(() => { window.__ts = 0.02; }); await p.screenshot({ path: `${out}/${tag}_shock_${nm}.png` }); await p.evaluate(() => { window.__ts = 0.3; });
}
await new Promise(r => setTimeout(r, 3000));
console.log('state', JSON.stringify(await p.evaluate(() => window.__game.sim.enemies.filter(e => !e.boss).slice(0, 3).map(e => [e.hp, +(e.ly || 0).toFixed(1)]))));
console.log('ERRORS', errors.length, JSON.stringify(errors.slice(0, 3)));
await b.close();
