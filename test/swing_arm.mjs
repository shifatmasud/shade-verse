// Swing free-arm check (Nov 3, Shifat 8:07/8:08 PM): Shadow + Ghost (mirroring) web swing, side + 3/4, start / bottom / top / release,
// and the free (non-web) hand measured EVERY frame: world height vs the waist (spine bone), body-frame height vs the waist, upper-arm angle off the body.
// Usage: CHROME=<path> node test/swing_arm.mjs <port> <outdir> [hand 1|2] [moments comma list]
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const [port, outdir, handArg, momArg] = process.argv.slice(2);
const HAND = +(handArg || 1), MOMS = (momArg || 'start,bottom,top,release').split(',');
fs.mkdirSync(outdir, { recursive: true });
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', headless: 'new', protocolTimeout: 900000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width: 640, height: 360, deviceScaleFactor: 1 });
const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction(() => !!window.__game, { timeout: 120000 });
await new Promise(r => setTimeout(r, 1500));
await p.evaluate(() => window.__game.start());
await p.waitForFunction(() => window.__game.sim.mode === 'play' && window.__game.sim.t > 1.5 && !!window.__ghostActor, { timeout: 180000, polling: 250 });
await new Promise(r => setTimeout(r, 500));
await p.addStyleTag({ content: '#root *, body > div * { visibility: hidden !important; } #root canvas, body > div canvas, canvas { visibility: visible !important; }' });
const raf = (n) => p.evaluate((n) => new Promise(res => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
async function until(src, maxFrames = 1500, tsMax = 0.5) {
  for (let i = 0; i < maxFrames; i++) {
    const r = await p.evaluate((src, tsMax) => { window.__pin && window.__pin(); const rem = (0, eval)(src)(); if (rem == null) { window.__ts = 0; return 'fail'; } if (rem <= 0) { window.__ts = 0; return 'ok'; } window.__ts = Math.min(tsMax, Math.max(0.02, rem / 0.15)); return 'go'; }, src, tsMax);
    if (r !== 'go') return r; await raf(1);
  }
  await p.evaluate(() => { window.__ts = 0; }); return 'timeout';
}
await p.evaluate((HAND) => {
  const g = window.__game, s = g.sim, I = g.input, A = window.__ghostActor, q = [...s.pos];
  I.keys.w = I.keys.a = I.keys.s = I.keys.d = false; I.jumpQ = false; I.attackQ = false; I.meleeQ = false;
  s.enemies.forEach((e, i) => { e.down = 0; e.atk = -50; e.hp = 99; e.x = q[0] + 400 + i * 4; e.z = q[2] + 400; e.kb = [0, 0]; e.vy = 0; e.ly = 0; });
  window.__ghostDisableCombat = true;
  s.vel = [0, 0, 0]; s.ang = 0; s.yaw = 0; s.mv = null; s.flip = null; s.land = 0; s.landHard = 0; s.spring = 0; s.shotT = 0; s.atkT = 0; s.glideOn = false; s.wall = null; s.swim = false;
  s.pos[1] += 14; s.ground = false; s.anchor = [s.pos[0], s.pos[1] + 16, s.pos[2] + 7]; s.rope = Math.hypot(16, 7); s.web = true; s.webT = 0.3; s.swings = HAND; s.vel = [0, -6, 6]; I.swing = true; I.swingQ = false;
  window.__t0 = s.t; window.__AM = {}; window.__track = true;
  const V = (o) => { const v = new o.position.constructor(); o.getWorldPosition(v); return v; };
  const meas = (R, who) => {
    if (!R || !R.b) return null; const T = R.__tv || R.root.userData.__tv || {}; const side = T.fs ? (T.fs < 0 ? 'L' : 'R') : (s.swings % 2 === 1 ? 'L' : 'R');
    R.root.updateMatrixWorld(true);
    const hand = V(R.b['hand' + side]), waist = V(R.b.spine), hips = V(R.b.hips), chest = V(R.b.chest), ua = V(R.b['uarm' + side]), fa = V(R.b['farm' + side]);
    const up = chest.clone().sub(hips).normalize(), arm = fa.clone().sub(ua).normalize();
    const sc = hips.distanceTo(chest) || 1;   // normalise by the hero's own torso length (Ghost is 0.93)
    return { side, world: +((hand.y - waist.y) / sc).toFixed(3), body: +(hand.clone().sub(waist).dot(up) / sc).toFixed(3), ang: +(Math.acos(Math.max(-1, Math.min(1, -arm.dot(up)))) * 57.3).toFixed(1), fl: !!T.fl, tk: +(T.tk || 0).toFixed(2), rw: T.rw == null ? null : +(+T.rw).toFixed(2), bw: +(T.bw || 0).toFixed(2) };
  };
  window.__meas = meas;
  window.__pin = () => {   // called once per rendered frame (from until(), after the frame's pose update)
    if (!window.__track) return;
    for (const [who, R] of [['S', window.__rig], ['G', window.__ghostRig]]) { const m = meas(R, who); if (!m) continue; const T = R.__tv || R.root.userData.__tv || {};
      const TS = window.__rig.__tv || {}, TT = (R.__tv || R.root.userData.__tv) ? T : TS;   // Ghost's traversal state sits on a copy of her rig the page doesn't expose; on mirrored frames she is driven by Shadow's sim, so her free side and swing state are Shadow's
      const act = (TT.bw || 0) > 0.05 || !!TT.fl || (TT.rw || 0) > 0.05; if (!act) continue;   // this hero is in its swing / release flip pose
      const ph0 = window.__ph || 'swing', ph = ph0 === 'release' && !TT.fl && (TT.rt || 0) >= 0.2 ? 'afterflip' : ph0, key = who + ':' + ph;
      const M = window.__AM[key] || (window.__AM[key] = { body: -9, world: -9, worldNoFlip: -9, ang: 0, n: 0, flipFrames: 0 });
      if (ph0 === 'release') (window.__TR || (window.__TR = [])).push([who, +(window.__game.sim.t - window.__tr).toFixed(3), m.body, m.fl ? 1 : 0, +(TT.rw || 0).toFixed(2), +(TT.tk || 0).toFixed(2), +(TT.bw || 0).toFixed(2), +(TT.rt || 0).toFixed(2), window.__game.sim.ground ? 1 : 0]);
      M.n++; if (m.fl) M.flipFrames++; if (m.body > M.body) M.body = m.body; if (m.world > M.world) M.world = m.world; if (!m.fl && m.world > M.worldNoFlip) M.worldNoFlip = m.world; if (m.ang > M.ang) M.ang = m.ang;
      const side = m.side === 'L' ? 'R' : 'L', ln = V(R.b['hand' + side]), wst = V(R.b.spine), hp = V(R.b.hips), ch = V(R.b.chest), lb = ln.sub(wst).dot(ch.clone().sub(hp).normalize()) / (hp.distanceTo(ch) || 1); M.lineMin = Math.min(M.lineMin ?? 9, +lb.toFixed(3)); }
  };
}, HAND);
const shots = [];
async function shoot(mom) {
  const st = await p.evaluate(() => { const s = window.__game.sim; return { t: +(s.t - window.__t0).toFixed(3), vy: +s.vel[1].toFixed(2), web: s.web, S: window.__meas(window.__rig, 'S'), G: window.__meas(window.__ghostRig, 'G') }; });
  for (const who of ['S', 'G']) {
    await p.evaluate((who) => { window.__rig.root.visible = who === 'S'; window.__ghostRig.root.visible = who === 'G'; }, who);
    for (const view of ['side', 'q34']) {
      await p.evaluate((who, view) => { const R = who === 'S' ? window.__rig : window.__ghostRig, m = R.b.hips.matrixWorld.elements, c = [m[12], m[13], m[14]];
        const sideV = who === 'S' ? [1, 0] : [-1, 0], v = view === 'side' ? sideV : [sideV[0] * 0.71, 0.71], d = 5.0;
        window.__camOv = [c[0] + v[0] * d, c[1] + 0.35, c[2] + v[1] * d, c[0], c[1] + 0.1, c[2]]; }, who, view);
      await raf(8);
      const f = `${outdir}/${mom}_${who}_${view}.png`; await p.screenshot({ path: f, clip: { x: 200, y: 30, width: 240, height: 300 } }); shots.push({ mom, who, view, f });
    }
  }
  await p.evaluate(() => { window.__rig.root.visible = true; window.__ghostRig.root.visible = true; });
  console.log(mom, JSON.stringify(st)); return st;
}
const log = {};
const want = (m) => MOMS.includes(m);
await p.evaluate(() => { window.__ph = 'start'; });
let r = await until(`() => { const s = window.__game.sim; if (!s.web) return null; return 0.15 - (s.t - window.__t0); }`, 800, 0.15);
if (want('start')) log.start = { r, ...(await shoot('start')) };
await p.evaluate(() => { window.__ph = 'downswing'; });
r = await until(`() => { const s = window.__game.sim; if (!s.web) return null; return s.vel[1] >= 0 ? 0 : Math.min(0.1, -s.vel[1] / 30); }`, 800, 0.15);
if (want('bottom')) log.bottom = { r, ...(await shoot('bottom')) };
await p.evaluate(() => { window.__ph = 'upswing'; });
if (want('top')) {
  r = await until(`() => { const s = window.__game.sim; if (!s.web) return null; if (s.vel[1] > 1.5) window.__rose = 1; return window.__rose && s.vel[1] <= 0.3 ? 0 : 0.05; }`, 1200, 0.15);
  log.top = { r, ...(await shoot('top')) };
  // swing back down and up again for the release on the rise
  r = await until(`() => { const s = window.__game.sim; if (!s.web) return null; return s.vel[1] < -1 ? 0 : 0.05; }`, 1200, 0.15);
  r = await until(`() => { const s = window.__game.sim; if (!s.web) return null; return s.vel[1] >= 0 ? 0 : Math.min(0.1, -s.vel[1] / 30); }`, 1200, 0.15);
}
r = await until(`() => { const s = window.__game.sim; if (!s.web) return null; return s.vel[1] >= 4 ? 0 : 0.03; }`, 1200, 0.15);
await p.evaluate(() => { window.__ph = 'release'; window.__released = true; window.__game.input.swing = false; window.__tr = window.__game.sim.t; });
r = await until(`() => { const s = window.__game.sim; return 0.15 - (s.t - window.__tr); }`, 800, 0.15);
if (want('release')) log.release = { r, ...(await shoot('release')) };
r = await until(`() => { const s = window.__game.sim; if (s.ground) return 0; return 0.9 - (s.t - window.__tr); }`, 1500, 0.15);   // track the whole release flip
const AM = await p.evaluate(() => window.__AM);
const TR = await p.evaluate(() => window.__TR || []);
const res = { hand: HAND, log, AM, TR, shots, errs };
fs.writeFileSync(`${outdir}/swing_arm.json`, JSON.stringify(res, null, 1));
console.log('AM', JSON.stringify(AM));
console.log('errors', errs.length, errs.slice(0, 5).join('\n'));
await b.close(); process.exit(0);
