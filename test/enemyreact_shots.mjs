// Enemy hit-reaction frames (Nov 3). Usage: node test/enemyreact_shots.mjs <port> <outdir> [v1]
// Lands synthetic blows on one bot with the stun values / hitDir / knockback / hit-stop the sim writes for each move (sim.ts), so every
// blow is framed identically from the side; the render path (src/enemyReact.ts) is the real one. v1 = window.__enemyReactV1 (Nov 2 reaction).
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
await p.evaluate((mode) => { window.__enemyReactV1 = mode === 'v1'; window.__game.start(); }, mode);
await p.waitForFunction(() => window.__game.sim.mode === 'play' && window.__game.sim.t > 1.5, { timeout: 180000, polling: 250 });
await new Promise(r => setTimeout(r, 500));
const raf = (n) => p.evaluate((n) => new Promise(res => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const BLOWS = { shot: [0.5, 0, 26, 0], jab: [0.32, 1, 6, 0.055], cross: [0.32, 2, 9, 0.06], fin: [0.55, 3, 16, 0.06], shock: [0.75, 0, 14, 0.06], slam: [0.6, 4, 12, 0.06] };
const list = (process.env.BLOWS || 'jab,fin,shock,slam').split(',');
const TIMES = (process.env.TIMES || '0.03,0.1,0.18,0.3,0.5').split(',').map(Number);

if (process.env.BOSS) {
  // boss: same synthetic blows on the giant boss, camera from its side; frames at the flinch peak (subtle read)
  const binfo = [];
  for (const name of ['none', 'fin', 'slam']) {
    await p.evaluate((name) => { const s = window.__game.sim, B = s.enemies.find(e => e.boss && !e.mini); window.__ts = 0; if (!B) return;
      B.hit = 0; B.atk = 0; B.down = 0; B.__hr = undefined; B.hp = 99; s.pos = [B.x, B.y, B.z - 9]; window.__bossT0 = performance.now();
      window.__camOv = [B.x + 26, B.y + 9, B.z, B.x, B.y + 7, B.z]; }, name);
    await p.evaluate(() => { window.__ts = 0.3; }); await raf(4);
    if (name !== 'none') { const [hit, dir] = BLOWS[name]; await p.evaluate((hit, dir) => { const s = window.__game.sim, B = s.enemies.find(e => e.boss && !e.mini); B.hit = hit; B.hitDir = dir; s.hitStop = 0.06; window.__ts = 0; }, hit, dir); await raf(1); }
    for (let guard = 0; guard < 300 && name !== 'none'; guard++) {
      const done = await p.evaluate(() => { const B = window.__game.sim.enemies.find(e => e.boss && !e.mini), st = B && B.__hr; const t = st ? st.t : 0; if (t >= 0.17) { window.__ts = 0; return true; } window.__ts = Math.min(0.5, Math.max(0.01, (0.17 - t) / 0.1)); return false; });
      if (done) break; await raf(1);
    }
    await p.evaluate(() => { window.__ts = 0; }); await raf(3);
    binfo.push(await p.evaluate((name) => { const B = window.__game.sim.enemies.find(e => e.boss && !e.mini), st = B && B.__hr; return { name, found: !!B, t: st && +st.t.toFixed(3), a: st && +st.a.toFixed(3), hit: B && +B.hit.toFixed(2) }; }, name));
    await p.screenshot({ path: `${outdir}/boss_${name}.png`, clip: { x: 120, y: 0, width: 400, height: 360 } });
  }
  fs.writeFileSync(`${outdir}/boss.json`, JSON.stringify({ binfo, errs }, null, 1));
  console.log(JSON.stringify({ binfo, errs: errs.length })); await b.close(); process.exit(0);
}
const info = [];
for (const name of list) {
  const [hit, dir, kb, stop] = BLOWS[name];
  await p.evaluate(() => {
    const g = window.__game, s = g.sim, I = g.input; window.__ts = 0; window.__ghostDisableCombat = true;
    s.enemies.forEach((e, i) => { if (i > 0) { e.down = 1e5; e.atk = 0; e.x = -900; e.z = -900; } });
    I.keys.w = I.keys.a = I.keys.s = I.keys.d = false; I.swing = false; I.swingQ = false; I.jumpQ = false;
    const q = window.__spawn || (window.__spawn = [...s.pos]); s.pos = [q[0], q[1], q[2]]; s.vel = [0, 0, 0]; s.web = false; s.wall = null; s.swim = false; s.glideOn = false; s.ground = true; s.ang = 0; s.mv = null; s.hp = 100;
    const A = window.__ghostActor; if (A) { A.pos = [q[0] - 30, q[1], q[2] - 30]; A.vel = [0, 0, 0]; }
    const e = s.enemies[0]; e.kind = 0; e.boss = false; e.x = q[0]; e.y = q[1]; e.z = q[2] + 2.4; e.hp = 99; e.down = 0; e.atk = -50; e.hit = 0; e.kb = [0, 0]; e.ang = Math.PI; e.born = s.t - 5; e.air = false; e.ly = 0; e.vy = 0; e.slam = 0; e.hitDir = 0; e.__hr = undefined; e.__hr1 = undefined;
    e.roof = { x0: q[0] - 40, x1: q[0] + 40, z0: q[2] - 40, z1: q[2] + 40 };
  });
  await p.evaluate(() => { window.__ts = 0.5; }); await raf(4);   // settle a few frames un-hit
  await p.evaluate((hit, dir, kb, stop) => { const s = window.__game.sim, e = s.enemies[0]; window.__ts = 0; e.hit = hit; e.hitDir = dir; e.kb = [0, kb]; e.atk = 0; e.hp = 99; s.hitStop = stop; }, hit, dir, kb, stop);
  await raf(1);
  for (let i = 0; i < TIMES.length; i++) {
    const tgt = TIMES[i];
    for (let guard = 0; guard < 400; guard++) {
      const done = await p.evaluate((tgt) => { const e = window.__game.sim.enemies[0], st = e.__hr || e.__hr1; const t = st ? st.t : 0; e.atk = Math.min(e.atk, 0);
        if (t >= tgt - 1e-3) { window.__ts = 0; return true; } window.__ts = Math.min(0.5, Math.max(0.01, (tgt - t) / 0.1)); return false; }, tgt);
      if (done) break; await raf(1);
    }
    await p.evaluate(() => { window.__ts = 0; const s = window.__game.sim, e = s.enemies[0], q = s.pos; const cz = (q[2] + e.z) / 2 + 0.6; window.__camOv = [e.x + 4.1, q[1] + 1.0, cz, e.x, q[1] + 0.6, cz]; });
    await p.evaluate(() => { window.__ts = 0; }); await raf(3);
    info.push(await p.evaluate((name) => { const s = window.__game.sim, e = s.enemies[0], st = e.__hr || e.__hr1; return { name, t: st && +st.t.toFixed(3), a: st && +st.a.toFixed(3), y: st && +(st.y || 0).toFixed(3), hit: +e.hit.toFixed(2), ez: +e.z.toFixed(2) }; }, name));
    await p.screenshot({ path: `${outdir}/${name}_${i}.png`, clip: { x: 170, y: 40, width: 300, height: 280 } });
  }
}
fs.writeFileSync(`${outdir}/info.json`, JSON.stringify({ info, errs }, null, 1));
console.log(JSON.stringify({ errs: errs.length, first: errs.slice(0, 3) }));
await b.close();
