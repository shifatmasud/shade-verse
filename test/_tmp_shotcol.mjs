
import puppeteer from 'puppeteer-core';
const port = process.argv[2], out = process.argv[3];
const b = await puppeteer.launch({ executablePath: process.env.CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width: 915, height: 412 });
const errors = []; p.on('pageerror', e => errors.push(String(e))); p.on('console', m => { if (m.type() === 'error' || /shader/i.test(m.text())) errors.push(m.text().slice(0, 200)); });
await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await p.waitForFunction(() => !!window.__game, { timeout: 120000 });
for (let i = 0; i < 90; i++) { const ok = await p.evaluate(() => { if (window.__game.sim.mode !== 'play') window.__game.start(); return !!window.__ghostSim && window.__game.sim.mode === 'play'; }); if (ok) break; await new Promise(r => setTimeout(r, 2000)); }
await new Promise(r => setTimeout(r, 3000));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const setup = (who) => p.evaluate((who) => { const { sim } = window.__game, g = window.__ghostSim; window.__ghostDisableCombat = true;
  sim.pos = [20, 1, 20]; sim.vel = [0, 0, 0]; sim.yaw = 0; sim.ang = 0; sim.ground = true; sim.web = false; sim.wall = null;
  if (who === 'ghost') { sim.pos = [6, 1, 12]; g.pos = [20, 1, 20]; g.vel = [0, 0, 0]; g.ground = true; g.web = false; g.wall = null; g.ang = 0; g.yaw = 0; g.enemies = sim.enemies; }
  else { g.pos = [8, 1, 10]; }
  const c = who === 'shadow' ? sim : g, pp = c.pos, E = sim.enemies.filter(e => !e.boss);
  sim.enemies.forEach((e, i) => { if (e !== E[0]) { e.x = pp[0] - 120 - i * 3; e.z = pp[2] - 120; e.down = 1000; } });
  const e = E[0]; e.x = pp[0] + 1.5; e.z = pp[2] + 13; e.y = pp[1] - 1; e.hp = 600; e.down = 0; e.atk = 0; e.kb = [0, 0]; e.vy = 0; e.ly = 0;
  window.__camOv = [pp[0] + 8.5, pp[1] + 2.0, pp[2] + 6.0, pp[0] + 0.6, pp[1] + 0.9, pp[2] + 6.8]; window.__ts = 0.3; window.__tgt = e; }, who);
const fire = (who) => p.evaluate((who) => { const { sim } = window.__game, g = window.__ghostSim, c = who === 'shadow' ? sim : g, e = window.__tgt, pp = c.pos;
  const ox = pp[0], oy = pp[1] + 1.4, oz = pp[2] + 0.6, ty = e.y + 1, dx = e.x - ox, dy = ty - oy, dz = e.z - oz, L = Math.hypot(dx, dy, dz), S = 55;
  c.plasma.push({ x: ox, y: oy, z: oz, vx: dx / L * S, vy: dy / L * S, vz: dz / L * S, t: 0, tgt: e }); c.shotT = 0.3; c.shotTgt = [e.x, ty, e.z]; }, who);
for (const who of ['shadow', 'ghost']) {
  await setup(who); await sleep(1500);
  await p.evaluate(() => { window.__ts = 0.02; }); await sleep(300);
  await fire(who);
  const t0 = Date.now(); while (Date.now() - t0 < 30000) { const v = await p.evaluate((who) => { const c = who === 'shadow' ? window.__game.sim : window.__ghostSim; return c.plasma.length ? c.plasma[0].t : -1; }, who); if (v >= 0.1) break; await sleep(20); }
  await p.evaluate((who) => { window.__ts = 0.0; const c = who === 'shadow' ? window.__game.sim : window.__ghostSim, b = c.plasma[0]; if (b) window.__camOv = [b.x + 3.2, b.y + 0.5, b.z - 1.6, b.x - 0.3, b.y, b.z + 0.2]; }, who); await sleep(600); await p.screenshot({ path: `${out}/${who}_flight.png` });
  await p.evaluate((who) => { const c = who === 'shadow' ? window.__game.sim : window.__ghostSim, e = window.__tgt, pp = c.pos, dx = e.x - pp[0], dz = e.z - pp[2], L = Math.hypot(dx, dz), ix = e.x - dx / L * 2.0, iz = e.z - dz / L * 2.0, iy = e.y + 1.2;
    window.__camOv = [ix + 3.4, iy + 0.7, iz - 2.4, ix, iy - 0.1, iz]; }, who); await sleep(600);
  await p.evaluate(() => { window.__ts = 0.02; });
  const t1 = Date.now(); while (Date.now() - t1 < 30000) { const v = await p.evaluate((who) => { const c = who === 'shadow' ? window.__game.sim : window.__ghostSim; if (c.plasma[0]) window.__lastB = [c.plasma[0].x, c.plasma[0].y, c.plasma[0].z]; return c.plasma.length; }, who); if (v === 0) break; await sleep(10); }
  await p.evaluate(() => { window.__ts = 0.0; }); await sleep(500); await p.screenshot({ path: `${out}/${who}_impact.png` });
  await p.evaluate(() => { window.__ts = 0.3; });
}
console.log('ERRORS', errors.length, JSON.stringify(errors.slice(0, 5)));
await b.close();
