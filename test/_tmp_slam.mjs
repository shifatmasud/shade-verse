
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const port = process.argv[2] || '4330', out = process.argv[3] || '/home/user/tab/files/combat_build', tag = process.argv[4] || 'slam';
fs.mkdirSync(out, { recursive: true });
const b = await puppeteer.launch({ executablePath: process.env.CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width: 915, height: 412, deviceScaleFactor: 1 });
const errors = []; p.on('pageerror', e => errors.push(String(e))); p.on('console', m => { const t = m.text(); if (m.type() === 'error' || /shader|THREE\.WebGLProgram/i.test(t)) errors.push(t); });
await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await p.waitForFunction(() => !!window.__game, { timeout: 120000 });
for (let i = 0; i < 90; i++) { const ok = await p.evaluate(() => { if (window.__game.sim.mode !== 'play') window.__game.start(); return !!window.__scene && window.__game.sim.mode === 'play'; }); if (ok) break; await new Promise(r => setTimeout(r, 2000)); }
await new Promise(r => setTimeout(r, 2500));
const setup = () => p.evaluate(() => {
  const { sim } = window.__game; window.__ghostDisableCombat = true;
  const pp = sim.pos; sim.yaw = 0; sim.ang = 0;
  const E = sim.enemies.filter(e => !e.boss).slice(0, 3);
  const off = [[0, 3.2], [-2.6, 2.4], [2.8, 1.6]];
  E.forEach((e, i) => { e.x = pp[0] + off[i][0]; e.z = pp[2] + off[i][1]; e.y = pp[1] - 1 + 0; e.hp = 30; e.down = 0; e.hit = 0; e.atk = 0; e.kb = [0, 0]; e.vy = 0; e.ly = 0; });
  window.__camOv = [pp[0] + 5.5, pp[1] + 3.4, pp[2] + 9.5, pp[0], pp[1] + 0.8, pp[2] + 0.8];
  return { pos: [...pp], ground: sim.ground, ens: E.map(e => [e.x, e.y, e.z]) };
});
console.log('setup', JSON.stringify(await setup()));
await new Promise(r => setTimeout(r, 800));
await p.screenshot({ path: `${out}/${tag}_0_before.png` });
const st = () => p.evaluate(() => { const s = window.__game.sim, S = s.slam; return { ph: S ? S.ph : -1, c: S ? +S.c.toFixed(2) : 0, y: +s.pos[1].toFixed(2), g: s.ground, hs: +(s.hitStop || 0).toFixed(3), ts: +(s.tsNow || 1).toFixed(2), fx: window.__combatFx ? [window.__combatFx.pool.addN, window.__combatFx.pool.alphaN] : null, ens: s.enemies.filter(e => !e.boss).slice(0, 3).map(e => [+(e.ly || 0).toFixed(1), e.hp]) }; });
// hold melee (tap fires the combo on press; hold > 220 ms = charge)
await p.evaluate(() => { const i = window.__game.input; i.meleeQ = true; i.attackQ = true; i.meleeHeld = true; i.meleeAt = performance.now(); });
const waitFor = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await st(); if (fn(s)) return s; await new Promise(r => setTimeout(r, 150)); } return null; };
let s1 = await waitFor(s => s.ph === 0 && s.c >= 0.45, 120000); console.log('half', JSON.stringify(s1)); await p.screenshot({ path: `${out}/${tag}_1_charge_half.png` });
let s2 = await waitFor(s => s.ph === 0 && s.c >= 1, 120000); console.log('full', JSON.stringify(s2)); await p.screenshot({ path: `${out}/${tag}_2_charge_full.png` });
await p.evaluate(() => { window.__ts = 0.4; window.__game.input.meleeHeld = false; });
const log = []; let n = 0, impactSeen = false; const t0 = Date.now();
while (Date.now() - t0 < 240000) { const s = await st(); log.push(s); if (s.ph >= 1 || impactSeen) { if (n < 40) await p.screenshot({ path: `${out}/${tag}_3_rel_${String(n).padStart(2, '0')}_ph${s.ph}.png` }); n++; } if (s.ph === 4) await p.evaluate(() => { window.__ts = 0.1; }); if (s.ph === 5) impactSeen = true; if (impactSeen && s.ph === -1 && n > 30) break; if (n >= 40) break; }
await p.evaluate(() => { window.__ts = 1; });
console.log('log', JSON.stringify(log.map(s => [s.ph, s.y, s.hs, s.ts, s.fx && s.fx.join('/'), s.ens.map(e => e[0]).join(',')])));
console.log('final', JSON.stringify(await st()));
console.log('ERRORS', errors.length, JSON.stringify(errors.slice(0, 5)));
await b.close();
