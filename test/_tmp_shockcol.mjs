
import puppeteer from 'puppeteer-core';
const port = process.argv[2], out = process.argv[3];
const b = await puppeteer.launch({ executablePath: process.env.CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width: 915, height: 412 });
const errors = []; p.on('pageerror', e => errors.push(String(e))); p.on('console', m => { if (m.type() === 'error' || /shader/i.test(m.text())) errors.push(m.text().slice(0, 200)); });
await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await p.waitForFunction(() => !!window.__game, { timeout: 120000 });
for (let i = 0; i < 90; i++) { const ok = await p.evaluate(() => { if (window.__game.sim.mode !== 'play') window.__game.start(); return !!window.__ghostSim && window.__game.sim.mode === 'play'; }); if (ok) break; await new Promise(r => setTimeout(r, 2000)); }
await new Promise(r => setTimeout(r, 3000));
const setup = (who) => p.evaluate((who) => { const { sim, input } = window.__game, g = window.__ghostSim; window.__ghostDisableCombat = true;
  sim.pos = [20, 1, 20]; sim.vel = [0, 0, 0]; sim.yaw = 0; sim.ang = 0; sim.ground = true; sim.web = false; sim.wall = null; sim.snareT = 0;
  const c = who === 'shadow' ? sim : g; if (who === 'ghost') { sim.pos = [6, 1, 14]; g.pos = [17.4, 1, 18.5]; g.vel = [0, 0, 0]; g.ground = true; g.web = false; g.wall = null; g.ang = 0; g.yaw = 0; g.snareT = 0; g.snareCd = 0; g.enemies = sim.enemies; }
  const pp = c.pos, E = sim.enemies.filter(e => !e.boss); E.forEach((e, i) => { if (i > 2) { e.x = pp[0] + 80 + i * 3; e.z = pp[2] + 80; e.down = 1000; } });
  const off = [[0, 7], [-4, 9], [4.5, 8]]; E.slice(0, 3).forEach((e, i) => { e.x = pp[0] + off[i][0]; e.z = pp[2] + off[i][1]; e.y = pp[1] - 1; e.hp = 60; e.down = 0; e.atk = 0; e.kb = [0, 0]; e.vy = 0; e.ly = 0; });
  window.__camOv = [pp[0] + 4.2, pp[1] + 2.2, pp[2] - 1.2, pp[0], pp[1] + 0.3, pp[2] + 4.5]; window.__ts = 0.3;
  if (who === 'shadow') input.specialQ = true; else window.__ghostForceSpecial = true; }, who);
for (const who of ['shadow', 'ghost']) {
  if (who === 'ghost') { await p.evaluate(() => { window.__ts = 1; }); await new Promise(r => setTimeout(r, 2500)); }
  await setup(who);
  for (const [nm, th] of [['grip', 0.45], ['discharge', 0.1]]) {
    const t0 = Date.now(); while (Date.now() - t0 < 90000) { const v = await p.evaluate((who) => (who === 'shadow' ? window.__game.sim : window.__ghostSim).snareT, who); if (v > 0 && v <= th) break; await new Promise(r => setTimeout(r, 30)); }
    await p.evaluate(() => { window.__ts = 0.02; }); await p.screenshot({ path: `${out}/${who}_${nm}.png` }); await p.evaluate(() => { window.__ts = 0.3; });
  }
}
console.log('ERRORS', errors.length, JSON.stringify(errors.slice(0, 5)));
await b.close();
