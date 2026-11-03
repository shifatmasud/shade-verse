
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const port = process.argv[2] || '4330', out = process.argv[3], tag = process.argv[4] || 'pose';
fs.mkdirSync(out, { recursive: true });
const b = await puppeteer.launch({ executablePath: process.env.CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width: 640, height: 360, deviceScaleFactor: 1 });
const errors = []; p.on('pageerror', e => errors.push(String(e)));
await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await p.waitForFunction(() => !!window.__game, { timeout: 120000 });
for (let i = 0; i < 90; i++) { const ok = await p.evaluate(() => { if (window.__game.sim.mode !== 'play') window.__game.start(); return !!window.__scene && window.__game.sim.mode === 'play'; }); if (ok) break; await new Promise(r => setTimeout(r, 2000)); }
await new Promise(r => setTimeout(r, 2500));
const MOVES = { 1: 0.10, 2: 0.11, 3: 0.24, 4: 0.20 };
for (const id of [1, 2, 3, 4]) {
  await p.evaluate((id) => {
    const { sim } = window.__game; window.__ghostDisableCombat = true; const pp = sim.pos; sim.yaw = 0; sim.ang = 0;
    const E = sim.enemies.filter(e => !e.boss); E.forEach((e, i) => { if (i > 0) { e.x = pp[0] + 60 + i * 3; e.z = pp[2] + 60; } });
    const e = E[0]; e.x = pp[0]; e.z = pp[2] + 2.0; e.y = pp[1] - 1; e.hp = 60; e.down = 0; e.hit = 0; e.atk = 0; e.kb = [0, 0]; e.vy = 0; e.ly = 0;
    window.__camOv = [pp[0] + 3.6, pp[1] + 0.9, pp[2] + 1.1, pp[0], pp[1] + 0.3, pp[2] + 1.1];
    sim.chain = id - 1; sim.chainT = 0.8; sim.mv = null; window.__ts = 0.04; const i = window.__game.input; i.meleeQ = true; i.attackQ = true;
  }, id);
  const H = MOVES[id], targets = [['a', H * 0.62], ['h', H + 0.005], ['o', H + 0.05]];
  for (const [nm, tt] of targets) {
    const t0 = Date.now(); let ok = false;
    while (Date.now() - t0 < 60000) { const mt = await p.evaluate(() => { const m = window.__game.sim.mv; return m ? [m.id, m.t] : null; }); if (mt && mt[0] === id && mt[1] >= tt) { ok = true; break; } await new Promise(r => setTimeout(r, 20)); }
    await p.evaluate(() => { window.__ts = 0; }); await p.screenshot({ path: `${out}/${tag}_m${id}_${nm}.png` }); await p.evaluate(() => { window.__ts = 0.04; });
    if (!ok) console.log('miss', id, nm);
  }
  await p.evaluate(() => { window.__ts = 1; }); await new Promise(r => setTimeout(r, 1500));
}
console.log('ERRORS', errors.length, JSON.stringify(errors.slice(0, 3)));
await b.close();
