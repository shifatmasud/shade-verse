// KO frames (Nov 3): one bot takes a killing finisher from the side; frames at fixed sim times after the KO, side view.
// Usage: node test/enemy_ko_shots.mjs <port> <outdir> [old]   old = window.__enemyKoOld (pre-Nov 3 KO) in the same DBG build
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const [port, outdir, mode = 'new'] = process.argv.slice(2);
fs.mkdirSync(outdir, { recursive: true });
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width: 640, height: 360, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction(() => !!window.__game, { timeout: 120000 });
await new Promise(r => setTimeout(r, 1500));
await p.evaluate((mode, cv, kind) => { window.__enemyKoOld = mode === 'old'; window.__CV = cv; window.__KIND = kind; window.__game.start(); }, mode, process.env.CV ? process.env.CV.split(',').map(Number) : null, +(process.env.KIND || 0));
await p.waitForFunction(() => window.__game.sim.mode === 'play' && window.__game.sim.t > 1.5, { timeout: 180000, polling: 250 });
await new Promise(r => setTimeout(r, 500));
const raf = (n) => p.evaluate((n) => new Promise(res => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const TIMES = (process.env.TIMES || '0,0.12,0.24,0.36,0.46,1.2,2.2,2.5,2.75,2.92').split(',').map(Number);
await p.evaluate(() => {
  const g = window.__game, s = g.sim, I = g.input; window.__ts = 0; window.__ghostDisableCombat = true;
  s.enemies.forEach((e, i) => { if (i > 0) { e.down = 1e5; e.atk = 0; e.x = -900; e.z = -900; } });
  I.keys.w = I.keys.a = I.keys.s = I.keys.d = false; I.swing = false; I.swingQ = false; I.jumpQ = false;
  const q = window.__spawn || (window.__spawn = [...s.pos]); s.pos = [q[0], q[1], q[2]]; s.vel = [0, 0, 0]; s.web = false; s.wall = null; s.swim = false; s.glideOn = false; s.ground = true; s.ang = 0; s.mv = null; s.hp = 100;
  const A = window.__ghostActor; if (A) { A.pos = [q[0] - 30, q[1], q[2] - 30]; A.vel = [0, 0, 0]; }
  const e = s.enemies[0]; e.kind = window.__KIND || 0; e.boss = false; e.x = q[0]; e.y = q[1]; e.z = q[2] + 2.4; e.hp = 99; e.down = 0; e.atk = -50; e.hit = 0; e.kb = [0, 0]; e.ang = Math.PI; e.born = s.t - 5; e.air = false; e.ly = 0; e.vy = 0; e.slam = 0; e.hitDir = 0; e.__hr = undefined; e.__hr1 = undefined;
  e.roof = { x0: q[0] - 40, x1: q[0] + 40, z0: q[2] - 40, z1: q[2] + 40 };
});
await p.evaluate(() => { window.__ts = 0.5; }); await raf(4);
// killing finisher: stun 0.55 / hitDir 3 / knockback 16 away (+z) / hit-stop 0.06, hp to 0 and down = 3 on the same frame, as sim.ts does
await p.evaluate(() => { const s = window.__game.sim, e = s.enemies[0]; window.__ts = 0; e.hit = 0.55; e.hitDir = 3; e.kb = [0, 16]; e.atk = 0; e.hp = 0; e.down = 3; e.koCol = s.fxCol ?? 0xa855f7; s.hitStop = 0.06; window.__ko0 = s.t; });
await raf(1);
const info = [];
for (let i = 0; i < TIMES.length; i++) {
  const tgt = TIMES[i];
  for (let guard = 0; guard < 600; guard++) {
    const done = await p.evaluate((tgt) => { const e = window.__game.sim.enemies[0]; const t = 3 - e.down;
      if (t >= tgt - 2e-3 || e.down <= 0) { window.__ts = 0; return true; } window.__ts = Math.min(0.5, Math.max(0.01, (tgt - t) / 0.1)); return false; }, tgt);
    if (done) break; await raf(1);
  }
  await p.evaluate(() => { window.__ts = 0; const s = window.__game.sim, e = s.enemies[0], q = s.pos; const cz = e.z + 0.5, CV = window.__CV || [4.6, 1.1, 0]; window.__camOv = [e.x + CV[0], q[1] + CV[1], cz + CV[2], e.x, q[1] + 0.55, cz]; });
  await raf(3);
  info.push(await p.evaluate(() => { const s = window.__game.sim, e = s.enemies[0], st = e.__hr; return { t: +(3 - e.down).toFixed(3), down: +e.down.toFixed(3), kt: st && st.kt != null ? +st.kt.toFixed(3) : null, ez: +e.z.toFixed(2), ey: +e.y.toFixed(2) }; }));
  await p.screenshot({ path: `${outdir}/ko_${i}.png`, clip: { x: 170, y: 40, width: 300, height: 280 } });
}
fs.writeFileSync(`${outdir}/info.json`, JSON.stringify({ info, errs }, null, 1));
console.log(JSON.stringify({ info, errs: errs.length, first: errs.slice(0, 3) }));
await b.close();
