
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const port = process.argv[2] || '4330', out = process.argv[3], tag = process.argv[4] || 'kick';
fs.mkdirSync(out, { recursive: true });
const b = await puppeteer.launch({ executablePath: process.env.CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width: 915, height: 412, deviceScaleFactor: 1 });
const errors = []; p.on('pageerror', e => errors.push(String(e)));
await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await p.waitForFunction(() => !!window.__game, { timeout: 120000 });
for (let i = 0; i < 90; i++) { const ok = await p.evaluate(() => { if (window.__game.sim.mode !== 'play') window.__game.start(); return !!window.__scene && window.__game.sim.mode === 'play'; }); if (ok) break; await new Promise(r => setTimeout(r, 2000)); }
await new Promise(r => setTimeout(r, 2500));
const HIT = { 3: 0.24, 6: 0.32 };
for (const id of [3, 6]) {
  await p.evaluate((id) => {
    const { sim } = window.__game; window.__ghostDisableCombat = true; const pp = sim.pos; sim.yaw = 0; sim.ang = 0;
    const E = sim.enemies.filter(e => !e.boss); E.forEach((e, i) => { if (i > 0) { e.x = pp[0] + 60 + i * 3; e.z = pp[2] + 60; } });
    const e = E[0]; e.x = pp[0]; e.z = pp[2] + 2.0; e.y = pp[1] - 1; e.hp = 60; e.down = 0; e.hit = 0; e.atk = 0; e.kb = [0, 0]; e.vy = 0; e.ly = 0; e.kind = 0;
    window.__camOv = [pp[0] + 4.4, pp[1] + 0.6, pp[2] + 1.0, pp[0], pp[1] + 0.3, pp[2] + 1.0];
    window.__ts = 0.05; sim.mv = { id, t: 0, e, hit: false, d0: 2, spin: id === 3 ? 1 : 0 };
  }, id);
  const H = HIT[id];
  for (const [nm, tt] of [['c', H * 0.6], ['h', H + 0.004]]) {
    const t0 = Date.now(); let ok = false;
    while (Date.now() - t0 < 60000) { const mt = await p.evaluate(() => { const m = window.__game.sim.mv; return m ? [m.id, m.t] : null; }); if (mt && mt[1] >= tt) { ok = true; break; } if (!mt) break; await new Promise(r => setTimeout(r, 15)); }
    await p.evaluate(() => { window.__ts = 0; }); await new Promise(r => setTimeout(r, 250));
    const info = await p.evaluate(() => { const r = window.__rig, s = window.__game.sim, v = (n) => { const m = r.b[n].matrixWorld.elements; return [+(m[12]).toFixed(2), +(m[13]).toFixed(2), +(m[14]).toFixed(2)]; };
      const g = s.pos[1] - 1, e = s.enemies.filter(e => !e.boss)[0];
      return { t: s.mv && +s.mv.t.toFixed(3), ground: +g.toFixed(2), footR: v('footR'), footL: v('footL'), head: v('head'), hips: v('hips'), handR: v('handR'), eBody: +(e.y + (e.ly || 0)).toFixed(2), kind: e.kind }; });
    const rel = (q) => +(q[1] - info.ground).toFixed(2);
    console.log(id, nm, ok, JSON.stringify(info), 'footR_h', rel(info.footR), 'head_h', rel(info.head), 'hips_h', rel(info.hips));
    await p.screenshot({ path: `${out}/${tag}_m${id}_${nm}.png` });
    await p.evaluate(() => { window.__ts = 0.05; });
  }
  await p.evaluate(() => { window.__ts = 1; }); await new Promise(r => setTimeout(r, 1500));
}
console.log('ERRORS', errors.length, JSON.stringify(errors.slice(0, 3)));
await b.close();
