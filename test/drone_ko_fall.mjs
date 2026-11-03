// Hover-drone KO frames (Nov 3 stability fix): a kind-2 drone hovering 3 m above the hero's feet takes a killing finisher; frames at fixed
// sim times after the KO, side view. Usage: node test/drone_ko_fall.mjs <port> <outdir> [old]   old = window.__koNoDrop (the mid-air KO) in the same DBG build
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
await p.evaluate((mode) => { window.__koNoDrop = mode === 'old'; window.__game.start(); }, mode);
await p.waitForFunction(() => window.__game.sim.mode === 'play' && window.__game.sim.t > 1.5, { timeout: 180000, polling: 250 });
await new Promise(r => setTimeout(r, 500));
const raf = (n) => p.evaluate((n) => new Promise(res => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const TIMES = (process.env.TIMES || '0,0.2,0.4,0.6,0.85,1.6,2.6').split(',').map(Number);
const H = +(process.env.H || 3);
await p.evaluate((H) => {
  const g = window.__game, s = g.sim, I = g.input; window.__ts = 0; window.__ghostDisableCombat = true;
  s.enemies.forEach((e, i) => { if (i > 0) { e.down = 1e5; e.atk = 0; e.x = -900; e.z = -900; } });
  I.keys.w = I.keys.a = I.keys.s = I.keys.d = false; I.swing = false; I.swingQ = false; I.jumpQ = false;
  const q = window.__spawn || (window.__spawn = [...s.pos]); s.pos = [q[0], q[1], q[2]]; s.vel = [0, 0, 0]; s.web = false; s.wall = null; s.swim = false; s.glideOn = false; s.ground = true; s.ang = 0; s.mv = null; s.hp = 100;
  const A = window.__ghostActor; if (A) { A.pos = [q[0] - 30, q[1], q[2] - 30]; A.vel = [0, 0, 0]; }
  const e = s.enemies[0]; e.kind = 2; e.boss = false; e.x = q[0]; e.y = q[1] + H; e.z = q[2] + 2.4; e.hp = 99; e.down = 0; e.atk = -50; e.hit = 0; e.kb = [0, 0]; e.ang = Math.PI; e.born = s.t - 5; e.air = true; e.roof = undefined; e.ly = 0; e.vy = 0; e.slam = 0; e.hitDir = 0; e.__hr = undefined; e.__hr1 = undefined;
}, H);
await p.evaluate(() => { window.__ts = 0.5; }); await raf(4);
await p.evaluate(() => { const s = window.__game.sim, e = s.enemies[0]; window.__ts = 0; e.hit = 0.55; e.hitDir = 3; e.kb = [0, 16]; e.atk = 0; e.hp = 0; e.down = 3; e.koCol = s.fxCol ?? 0xa855f7; s.hitStop = 0.06; });
await raf(1);
const info = [];
for (let i = 0; i < TIMES.length; i++) {
  const tgt = TIMES[i];
  for (let guard = 0; guard < 600; guard++) {
    const done = await p.evaluate((tgt) => { const e = window.__game.sim.enemies[0]; const t = 3 - e.down;
      if (t >= tgt - 2e-3 || e.down <= 0) { window.__ts = 0; return true; } window.__ts = Math.min(0.5, Math.max(0.01, (tgt - t) / 0.1)); return false; }, tgt);
    if (done) break; await raf(1);
  }
  // fixed side camera framing the hero's feet up to the drone's start height
  await p.evaluate((H) => { window.__ts = 0; const s = window.__game.sim, q = window.__spawn, cz = q[2] + 2.9; window.__camOv = [q[0] + 7.5, q[1] + H * 0.5 + 0.4, cz, q[0], q[1] + H * 0.5, cz]; }, H);
  await raf(3);
  info.push(await p.evaluate(() => { const s = window.__game.sim, e = s.enemies[0], st = e.__hr; return { t: +(3 - e.down).toFixed(3), kt: st && st.kt != null ? +st.kt.toFixed(3) : null, ey: +e.y.toFixed(2), feet: +window.__spawn[1].toFixed(2), kh: st && st.kh != null ? +st.kh.toFixed(2) : null, kfl: st && st.kfl != null ? +st.kfl.toFixed(3) : null }; }));
  await p.screenshot({ path: `${outdir}/ko_${i}.png`, clip: { x: 200, y: 20, width: 240, height: 320 } });
}
fs.writeFileSync(`${outdir}/info.json`, JSON.stringify({ info, errs }, null, 1));
console.log(JSON.stringify({ info, errs: errs.length, first: errs.slice(0, 3) }));
await b.close();
