// Landing feel strip (Nov 3): Shadow + Ghost landing from a small hop .. a very high drop, side view, direct triggers.
// Usage: CHROME=<path> node test/landing_feel.mjs <port> <outdir>
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const [port, outdir, only] = process.argv.slice(2);   // only: comma list of row names
fs.mkdirSync(outdir, { recursive: true });
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width: 640, height: 360, deviceScaleFactor: 1 });
const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction(() => !!window.__game, { timeout: 120000 });
await new Promise(r => setTimeout(r, 1500));
await p.evaluate(() => window.__game.start());
await p.waitForFunction(() => window.__game.sim.mode === 'play' && window.__game.sim.t > 1.5 && !!window.__ghostActor, { timeout: 180000, polling: 250 });
await new Promise(r => setTimeout(r, 500));
await p.addStyleTag({ content: '#root *, body > div * { visibility: hidden !important; } #root canvas, body > div canvas, canvas { visibility: visible !important; }' });   // HUD/captions off: the pose is the subject
const raf = (n) => p.evaluate((n) => new Promise(res => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
await p.evaluate(() => {
  const g = window.__game, s = g.sim; window.__spawn = window.__spawn || [...s.pos];
  window.__BK = {
    park(enemiesAway = true) {
      const s = window.__game.sim, I = window.__game.input, A = window.__ghostActor, q = window.__spawn;
      I.keys.w = I.keys.a = I.keys.s = I.keys.d = false; I.swing = false; I.swingQ = false; I.jumpQ = false; I.meleeHeld = false; I.slamHeld = false; I.attackQ = false; I.meleeQ = false;
      s.pos = [q[0], q[1], q[2]]; s.vel = [0, 0, 0]; s.web = false; s.wall = null; s.swim = false; s.glideOn = false; s.ground = true; s.ang = 0; s.yaw = 0; s.mv = null; s.flip = null; s.slam = null; s.hp = 100; s.dodgeT = 0; s.atkT = 0; s.hurtT = 0; s.land = 0; s.landHard = 0; s.spring = 0; s.shotT = 0;
      if (enemiesAway) s.enemies.forEach((e, i) => { e.down = 0; e.atk = -50; e.hp = 99; e.x = q[0] + 200 + i * 4; e.z = q[2] + 200; e.kb = [0, 0]; e.vy = 0; e.ly = 0; });
      const fx = Math.sin(s.ang), fz = Math.cos(s.ang), rx = -fz, rz = fx;
      A.pos = [q[0] - fx * 1.45 + rx * 2.6, q[1], q[2] - fz * 1.45 + rz * 2.6]; A.vel = [0, 0, 0]; A.ang = 0; A.yaw = 0; A.ground = true; A.web = false; A.wall = null; A.mv = null; A.flip = null; A.slam = null; A.hurtT = 0; A.land = 0; A.landHard = 0; A.atkT = 0; A.shotT = 0; A.glideOn = false;
      window.__ghostDisableCombat = true;
    },
    cam(who, view) {
      const s = window.__game.sim, A = window.__ghostActor, o = who === 'S' ? s : A, q = o.pos, a = o.ang || 0, fx = Math.sin(a), fz = Math.cos(a);
      const v = view === 'side' ? (who === 'S' ? [fz, -fx] : [-fz, fx]) : [fx, fz], d = 5.2;   // side: Shadow from his left, Ghost from her right, so the partner (2.6 m to his right) never stands between camera and subject
      if (window.__camHips) { const R = who === 'S' ? window.__rig : window.__ghostRig, m = R.b.hips.matrixWorld.elements, c = [m[12], m[13], m[14]], dd = 5.6;   // airborne rows: frame the rendered hips, not the sim position
        window.__camOv = [c[0] + v[0] * dd, c[1] + 0.25, c[2] + v[1] * dd, c[0], c[1] + 0.05, c[2]]; return; }
      window.__camOv = [q[0] + v[0] * d, q[1] + 0.2, q[2] + v[1] * d, q[0], q[1] - 0.05, q[2]];
    },
  };
  window.__pin = null; const loop = () => { if (window.__pin) try { window.__pin(); } catch (e) {} requestAnimationFrame(loop); }; requestAnimationFrame(loop);
});
// until(fnSrc): fn returns remaining game-seconds (<=0 = there); time scale follows the remainder so the target is hit closely
async function until(src, maxFrames = 1500, tsMax = 0.6) {
  for (let i = 0; i < maxFrames; i++) {
    const r = await p.evaluate((src, tsMax) => { const rem = (0, eval)(src)(); if (rem == null) { window.__ts = 0; return 'fail'; } if (rem <= 0) { window.__ts = 0; return 'ok'; } window.__ts = Math.min(tsMax, Math.max(0.02, rem / 0.15)); return 'go'; }, src, tsMax);
    if (r !== 'go') return r; await raf(1);
  }
  await p.evaluate(() => { window.__ts = 0; }); return 'timeout';
}

const park = (away = true) => p.evaluate((away) => window.__BK.park(away), away);
const settle = async () => { await p.evaluate(() => { window.__ts = 1; }); await raf(4); for (let i = 0; i < 60; i++) { const a = await p.evaluate(() => window.__ghostState?.action); if (a !== 'transport') break; await raf(2); } await raf(2); };
const settleG = async () => { await settle(); for (let i = 0; i < 80; i++) { await raf(2); const ok = await p.evaluate(() => { const A = window.__ghostActor; return A.ground && Math.hypot(A.vel[0], A.vel[2]) < 0.2 && !A.mv; }); if (ok && i > 6) break; } };

const out = [];
await p.evaluate(() => { window.__BK.cam = function (who) { const s = window.__game.sim, A = window.__ghostActor, o = who === 'S' ? s : A, q = o.pos, a = o.ang || 0, fx = Math.sin(a), fz = Math.cos(a);
  const v = who === 'S' ? [fz, -fx] : [-fz, fx], d = 6.2; window.__camOv = [q[0] + v[0] * d + fx * 0.6, q[1] + 0.1, q[2] + v[1] * d + fz * 0.6, q[0] + fx * 0.6, q[1] - 0.25, q[2] + fz * 0.6]; }; });
const ROWS = [['hop', -8], ['jump', 0], ['drop', -17], ['high', -25], ['superhero', -32]];   // hop: 0.3 m step-off; jump: a real standing jump (JUMP_V), landing on its own
const MOM = [['deep', 0.07], ['rise', 0.2]];
for (const [row, vy] of ROWS.filter(r => !only || only.split(',').includes(r[0]))) for (const who of ['S', 'G']) {
  await park(); await settleG();
  await p.evaluate(() => { window.__game.sim.enemies.forEach(e => { e.x += 400; e.z += 400; }); });
  await p.evaluate((who) => window.__BK.cam(who), who);
  if (row === 'jump') { if (who === 'G') continue; await p.evaluate(() => { window.__tg = null; window.__air = 0; window.__game.input.jumpQ = true; window.__ts = 1; }); await raf(4); }
  else { await p.evaluate((who, vy, up) => { const o = who === 'S' ? window.__game.sim : window.__ghostActor; o.pos[1] += up; o.ground = false; o.vel = [0, vy, 0]; window.__tg = null; window.__air = 0; window.__ts = 0.0005; }, who, vy, row === 'hop' ? 0.3 : 1.2); await raf(3); }
  for (const [mom, after] of MOM) {
    const r = await until(`() => { const o = ${who === 'S' ? 'window.__game.sim' : 'window.__ghostActor'}; if (!o.ground) window.__air = 1; if (o.ground && window.__air && window.__tg == null) { window.__tg = o.land; window.__tgT = o.t; } if (window.__tg == null) return 0.05; return ${after} - (o.t - window.__tgT); }`, 600, 0.2);
    if (who === 'G') await p.evaluate(() => { const s = window.__game.sim; window.__sSave = [...s.pos]; s.pos[0] += 7; });
    await p.evaluate((who) => window.__BK.cam(who), who); await raf(4);
    const st = await p.evaluate((who) => { const o = who === 'S' ? window.__game.sim : window.__ghostActor; return { land: +(o.land || 0).toFixed(2), tg: window.__tg, hard: +(o.landHard || 0).toFixed(2), ground: o.ground, y: +o.pos[1].toFixed(2), dip: window.__landDip ?? null, rig: (() => { const R = who === 'S' ? window.__rig : window.__ghostRig; if (!R) return null; const T = R.__tv || {}; const f = (x) => +(+x).toFixed(2); return { pr: f(R.poseRoot.rotation.x), Tp: f(T.p), Tw: f(T.w), rl: f(T.rl), lOn: T.lOn, lt: f(T.lt), spine: f(R.b.spine.rotation.x), thR: f(R.b.thighR.rotation.x), shR: f(R.b.shinR.rotation.x), ftR: f(R.b.footR ? R.b.footR.rotation.x : 0), hipsX: f(R.b.hips.rotation.x) }; })() }; }, who);
    const f = `${outdir}/${row}_${who}_${mom}.png`; await p.screenshot({ path: f, clip: { x: 190, y: 40, width: 260, height: 300 } });
    if (who === 'G') await p.evaluate(() => { const s = window.__game.sim; s.pos = window.__sSave; });
    console.log(row, who, mom, r, JSON.stringify(st)); out.push({ row, who, mom, r, ...st });
  }
}
fs.writeFileSync(`${outdir}/log_${only || 'all'}.json`, JSON.stringify({ out, errs }, null, 1));
console.log('errors', errs.length, errs.slice(0, 5).join('\n'));
await b.close();
