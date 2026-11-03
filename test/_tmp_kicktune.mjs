
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const port = process.argv[2] || '4330', out = process.argv[3], variants = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
fs.mkdirSync(out, { recursive: true });
const b = await puppeteer.launch({ executablePath: process.env.CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width: 640, height: 360, deviceScaleFactor: 1 });
const errors = []; p.on('pageerror', e => errors.push(String(e)));
await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await p.waitForFunction(() => !!window.__game, { timeout: 120000 });
for (let i = 0; i < 90; i++) { const ok = await p.evaluate(() => { if (window.__game.sim.mode !== 'play') window.__game.start(); return !!window.__scene && window.__game.sim.mode === 'play'; }); if (ok) break; await new Promise(r => setTimeout(r, 2000)); }
await new Promise(r => setTimeout(r, 2500));
const HIT = { 3: 0.24, 5: 0.26, 6: 0.32 };
const orig = await p.evaluate(() => JSON.stringify(window.__POSES));
for (const v of variants) {
  const id = v.id;
  await p.evaluate((orig, v) => { const P = JSON.parse(orig); for (const k of Object.keys(P)) window.__POSES[k] = P[k]; if (v.keys) window.__POSES[v.id] = v.keys; for (const [ki, patch] of (v.patch || [])) Object.assign(window.__POSES[v.id][ki][1], patch); }, orig, v);
  await p.evaluate((id) => {
    const { sim } = window.__game; window.__ghostDisableCombat = true; const pp = sim.pos; sim.yaw = 0; sim.ang = 0; sim.mv = null;
    const E = sim.enemies.filter(e => !e.boss); E.forEach((e, i) => { if (i > 0) { e.x = pp[0] + 60 + i * 3; e.z = pp[2] + 60; } });
    const e = E[0]; e.x = pp[0]; e.z = pp[2] + 2.0; e.y = pp[1] - 1; e.hp = 600; e.down = 0; e.hit = 0; e.atk = 0; e.kb = [0, 0]; e.vy = 0; e.ly = 0;
    window.__camOv = [pp[0] + 4.6, pp[1] + 0.7, pp[2] + 1.0, pp[0], pp[1] + 0.4, pp[2] + 1.0];
    window.__ts = 0.05; sim.mv = { id, t: 0, e, hit: false, d0: 2, spin: id === 3 ? 1 : 0 };
  }, id);
  const H = HIT[id], res = [];
  for (const [nm, tt] of (v.at || [['h', H + 0.004]])) {
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) { const mt = await p.evaluate(() => { const m = window.__game.sim.mv; return m ? m.t : null; }); if (mt == null || mt >= tt) break; await new Promise(r => setTimeout(r, 15)); }
    await p.evaluate(() => { window.__ts = 0; }); await new Promise(r => setTimeout(r, 200));
    const info = await p.evaluate(() => { const r = window.__rig, s = window.__game.sim, v = (n) => { const m = r.b[n].matrixWorld.elements; return [m[12], m[13], m[14]]; };
      const fl = v('footL'), fr = v('footR'), hd = v('head'), hp = v('hips'), e = s.enemies.filter(e => !e.boss)[0];
      return { t: s.mv ? +s.mv.t.toFixed(3) : -1, fR: +(fr[1] - fl[1]).toFixed(2), head: +(hd[1] - fl[1]).toFixed(2), hips: +(hp[1] - fl[1]).toFixed(2), fRy: +fr[1].toFixed(2), flY: +fl[1].toFixed(2), dxz: +Math.hypot(fr[0] - e.x, fr[2] - e.z).toFixed(2), eY: +e.y.toFixed(2) }; });
    res.push([nm, info]);
    await p.screenshot({ path: `${out}/${v.name}_${nm}.png` });
    await p.evaluate(() => { window.__ts = 0.05; });
  }
  console.log(v.name, JSON.stringify(res));
  await p.evaluate(() => { window.__ts = 1; }); await new Promise(r => setTimeout(r, 1200));
}
console.log('ERRORS', errors.length, JSON.stringify(errors.slice(0, 3)));
await b.close();
