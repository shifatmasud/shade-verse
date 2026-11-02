
// Combat frame-strip harness (combat feel pass, Nov 2). Usage: node test/combatshots_harness.mjs <port> <outdir> <scen: melee|hurt|shot|slam> [ghost]
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const [port, outdir, scen = 'melee'] = process.argv.slice(2);
fs.mkdirSync(outdir, { recursive: true });
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width: 640, height: 360, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction(() => !!window.__game, { timeout: 120000 });
await new Promise(r => setTimeout(r, 1500));
await p.evaluate(() => window.__game.start());
await p.waitForFunction(() => window.__game.sim.mode === 'play' && window.__game.sim.t > 1.5, { timeout: 180000, polling: 250 });
await new Promise(r => setTimeout(r, 500));
const raf = (n) => p.evaluate((n) => new Promise(res => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
// park the hero on the street with one bot in front of him
const S = await p.evaluate((scen) => {
  const g = window.__game, s = g.sim, I = g.input;
  window.__ts = 0; if (scen !== 'melee' && scen !== 'react') window.__ghostDisableCombat = true;   // keep Ghost's own fight out of the hurt/shot frames
  s.enemies.forEach((e, i) => { if (i > 0) { e.down = 1e5; e.atk = 0; e.x = -900; e.z = -900; } });
  I.keys.w = I.keys.a = I.keys.s = I.keys.d = false; I.swing = false; I.swingQ = false; I.jumpQ = false;
  const q = window.__spawn || (window.__spawn = [...s.pos]); s.pos = [q[0], q[1], q[2]]; s.vel = [0, 0, 0]; s.web = false; s.wall = null; s.swim = false; s.glideOn = false; s.ground = true; s.ang = 0; s.yaw = 0; s.mv = null; s.flip = null; s.hp = 100; s.dodgeT = 0; s.atkT = 0;
  const e = s.enemies[0]; e.kind = 0; e.boss = false; e.x = q[0]; e.y = q[1]; e.z = q[2] + (scen === 'shot' ? 9 : 2.4); e.hp = 99; e.down = 0; e.atk = scen === 'hurt' ? 0.12 : -50; e.hit = 0; e.kb = [0, 0]; e.ang = Math.PI; e.born = s.t - 5; e.air = false; e.roof = { x0: q[0] - 30, x1: q[0] + 30, z0: q[2] - 30, z1: q[2] + 30 }; e.ly = 0; e.vy = 0;
  if (scen === 'shot') s.aimE = e;
  return { t0: s.t };
}, scen);
const plan = {
  melee: { taps: [0.0, 0.2, 0.42], times: [0.05, 0.09, 0.13, 0.2, 0.3, 0.45, 0.6, 0.8] },
  react: { taps: [0.0], times: [0.09, 0.105, 0.12, 0.14, 0.17, 0.22, 0.3, 0.42] },
  hurt:  { taps: [], times: [0.1, 0.14, 0.18, 0.24, 0.32, 0.42, 0.55, 0.75] },
  shot:  { taps: [0.0], shot: true, times: [0.01, 0.04, 0.08, 0.12, 0.18, 0.26, 0.36, 0.5] },
}[scen];
let tapI = 0; const info = [];
for (let i = 0; i < plan.times.length; i++) {
  const target = S.t0 + plan.times[i];
  for (let guard = 0; guard < 600; guard++) {
    const st = await p.evaluate((target, t0, taps, tapI, shot) => {
      const g = window.__game, s = g.sim, e = s.enemies[0];
      if (e.atk < -1 && e.atk > -60) e.atk = -50;   // keep the bot from winding up again
      let ti = tapI; if (ti < taps.length && s.t - t0 >= taps[ti]) { g.input.attackQ = true; if (shot) { g.input.shotQ = true; s.aimE = e; } else g.input.meleeQ = true; ti++; }
      if (s.t >= target - 1e-4) { window.__ts = 0; return [true, ti]; }
      window.__ts = Math.min(0.3, Math.max(0.02, (target - s.t) / 0.1)); return [false, ti];
    }, target, S.t0, plan.taps, tapI, !!plan.shot);
    tapI = st[1]; if (st[0]) break; await raf(1);
  }
  await p.evaluate(() => { window.__ts = 0; });
  await p.evaluate(() => { const s = window.__game.sim, q = s.pos, e = s.enemies[0]; const cx = (q[0] + e.x) / 2, cz = (q[2] + Math.min(e.z, q[2] + 4)) / 2; window.__camOv = [cx + 7.5, q[1] + 1.4, cz - 0.6, cx, q[1] + 0.5, cz]; });
  await raf(3);
  const st = await p.evaluate(() => { const s = window.__game.sim, e = s.enemies[0]; return { t: +s.t.toFixed(3), mv: s.mv ? s.mv.id : null, anim: window.__shadowAnimation?.action, hit: +e.hit.toFixed(2), ez: +e.z.toFixed(2), hurtT: +s.hurtT.toFixed(2), hp: s.hp, ehp: e.hp }; });
  info.push(st);
  await p.screenshot({ path: `${outdir}/${scen}_${i}.png`, clip: { x: 170, y: 30, width: 300, height: 270 } });
}
fs.writeFileSync(`${outdir}/${scen}_info.json`, JSON.stringify({ info, errs }, null, 1));
console.log(JSON.stringify({ errs: errs.length, first: errs.slice(0, 3), info }));
await b.close();
