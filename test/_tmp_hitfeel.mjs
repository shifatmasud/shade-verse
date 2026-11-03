
// Hit feel recorder (Nov 3). node test/_tmp_hitfeel.mjs <port> <outdir> <off 0|1> [frames]
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const [port, outdir, offArg = '0', nfArg = '150'] = process.argv.slice(2);
const OFF = offArg === '1', NF = +nfArg;
fs.mkdirSync(outdir, { recursive: true });
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
const p = await b.newPage(); await p.setViewport({ width: 640, height: 360, deviceScaleFactor: 1 });
const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction(() => !!window.__game, { timeout: 120000 });
await new Promise(r => setTimeout(r, 1500));
await p.evaluate((OFF) => { window.__hitFeelOff = OFF; window.__game.start(); }, OFF);
await p.waitForFunction(() => window.__game.sim.mode === 'play' && window.__game.sim.t > 1.5, { timeout: 180000, polling: 250 });
await new Promise(r => setTimeout(r, 500));
const raf = (n) => p.evaluate((n) => new Promise(res => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
await p.evaluate(() => {
  const g = window.__game, s = g.sim, I = g.input;
  s.enemies.forEach((e, i) => { if (i > 0) { e.down = 1e5; e.atk = 0; e.x = -900; e.z = -900; } });
  I.keys.w = I.keys.a = I.keys.s = I.keys.d = false; I.swing = false; I.swingQ = false; I.jumpQ = false;
  const q = [...s.pos]; window.__q = q; s.vel = [0, 0, 0]; s.web = false; s.wall = null; s.swim = false; s.glideOn = false; s.ground = true; s.ang = 0; s.yaw = 0;
  const e = s.enemies[0]; e.kind = 0; e.boss = false; e.x = q[0]; e.y = q[1]; e.z = q[2] + 2.6; e.hp = 99; e.down = 0; e.atk = -50; e.hit = 0; e.kb = [0, 0];
  const A = window.__ghostActor; if (A) { A.pos = [q[0] + 2.4, q[1], q[2] + 3.4]; A.vel = [0, 0, 0]; }
  window.__ts = 1 / 3;
});
await raf(20);
await p.evaluate(() => { window.__ts = 0; });
await raf(2);
const log = [];
for (let i = 0; i < NF; i++) {
  log.push(await p.evaluate((i) => {
    const g = window.__game, s = g.sim, I = g.input, e = s.enemies[0], A = window.__ghostActor;
    e.hp = 99; e.atk = -50; e.down = 0; s.hp = 100;
    if (Math.hypot(e.x - s.pos[0], e.z - s.pos[2]) > 9) { e.x = s.pos[0] + Math.sin(s.ang) * 2.6; e.z = s.pos[2] + Math.cos(s.ang) * 2.6; e.kb = [0, 0]; }
    if (i < 110 && i % 2 === 0) { I.attackQ = true; I.meleeQ = true; }
    const K = (window.__hfKicks || []).map(k => [k.who, +k.t.toFixed(3), +k.w.toFixed(2)]);
    return { i, t: +s.t.toFixed(3), c: s.combo, gc: A ? A.combo : -1, mv: s.mv ? [s.mv.id, +s.mv.t.toFixed(2)] : null, hs: +((s.hitStop || 0) * 1000).toFixed(0), K };
  }, i));
  await p.evaluate(() => new Promise(res => { window.__ts = 1 / 3; requestAnimationFrame(() => { window.__ts = 0; res(); }); }));
  await p.screenshot({ path: `${outdir}/f_${String(i).padStart(3, '0')}.jpg`, type: 'jpeg', quality: 72 });
}
fs.writeFileSync(`${outdir}/log.json`, JSON.stringify({ errs, log }));
console.log(JSON.stringify({ errs: errs.length, first: errs.slice(0, 3) }));
await b.close(); process.exit(0);
