// Superhero landing + Ghost post-landing hips strip (Nov 3). Side + 3/4 views, direct triggers, each hero on its own clock.
// Usage: CHROME=<path> node test/superhero_landing.mjs <port> <outdir> [rows]
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const [port, outdir, only] = process.argv.slice(2);
fs.mkdirSync(outdir, { recursive: true });
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width: 960, height: 540, deviceScaleFactor: 1 });
const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction(() => !!window.__game, { timeout: 120000 });
await new Promise(r => setTimeout(r, 1500));
await p.evaluate(() => window.__game.start());
await p.waitForFunction(() => window.__game.sim.mode === 'play' && window.__game.sim.t > 1.5 && !!window.__ghostActor, { timeout: 180000, polling: 250 });
await new Promise(r => setTimeout(r, 500));
await p.addStyleTag({ content: '#root *, body > div * { visibility: hidden !important; } #root canvas, body > div canvas, canvas { visibility: visible !important; }' });
const raf = (n) => p.evaluate((n) => new Promise(res => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
await p.evaluate(() => {
  const s = window.__game.sim; window.__spawn = window.__spawn || [...s.pos];
  window.__BK = {
    park() {
      const s = window.__game.sim, I = window.__game.input, A = window.__ghostActor, q = window.__spawn;
      I.keys.w = I.keys.a = I.keys.s = I.keys.d = false; I.swing = false; I.swingQ = false; I.jumpQ = false; I.meleeHeld = false; I.slamHeld = false; I.attackQ = false; I.meleeQ = false;
      s.pos = [q[0], q[1], q[2]]; s.vel = [0, 0, 0]; s.web = false; s.wall = null; s.swim = false; s.glideOn = false; s.ground = true; s.ang = 0; s.yaw = 0; s.mv = null; s.flip = null; s.slam = null; s.hp = 100; s.dodgeT = 0; s.atkT = 0; s.hurtT = 0; s.land = 0; s.landHard = 0; s.spring = 0; s.shotT = 0;
      s.enemies.forEach((e, i) => { e.down = 0; e.atk = -50; e.hp = 99; e.x = q[0] + 400 + i * 4; e.z = q[2] + 400; e.kb = [0, 0]; e.vy = 0; e.ly = 0; });
      const fx = Math.sin(s.ang), fz = Math.cos(s.ang), rx = -fz, rz = fx;
      A.pos = [q[0] - fx * 1.45 + rx * 2.6, q[1], q[2] - fz * 1.45 + rz * 2.6]; A.vel = [0, 0, 0]; A.ang = 0; A.yaw = 0; A.ground = true; A.web = false; A.wall = null; A.mv = null; A.flip = null; A.slam = null; A.hurtT = 0; A.land = 0; A.landHard = 0; A.atkT = 0; A.shotT = 0; A.glideOn = false;
      window.__ghostDisableCombat = true; window.__ghostHold = true;
    },
    // view: side (hero's left for Shadow / right for Ghost) or q34 (front three-quarter from the same side)
    cam(who, view) {
      const s = window.__game.sim, A = window.__ghostActor, o = who === 'S' ? s : A, q = o.pos, a = o.ang || 0, fx = Math.sin(a), fz = Math.cos(a);
      const sd = who === 'S' ? [fz, -fx] : [-fz, fx]; const v = view === 'side' ? sd : [sd[0] * 0.72 + fx * 0.69, sd[1] * 0.72 + fz * 0.69];
      const sc = who === 'S' ? 1 : 0.93, d = 4.8 * sc; window.__camOv = [q[0] + v[0] * d, q[1] + 0.2, q[2] + v[1] * d, q[0] + fx * 0.3, q[1] - 0.45 * sc, q[2] + fz * 0.3];
    },
    // the partner steps 16 m ahead, out of the shot (Ghost is held by the DBG-only __ghostHold, so she does not follow)
    hide(who) { const s = window.__game.sim, A = window.__ghostActor, o = who === 'S' ? s : A; const fx = Math.sin(s.ang || 0), fz = Math.cos(s.ang || 0); o.pos[0] += fx * 16; o.pos[2] += fz * 16; o.vel = [0, 0, 0]; },
    show() {},
    metrics(who) {
      const R = who === 'S' ? window.__rig : window.__ghostRig; if (!R) return null; const T3 = R.root.constructor; R.root.updateMatrixWorld(true);
      const W = (b) => { const e = b.matrixWorld.elements; return [e[12], e[13], e[14]]; };
      const sub = (a, c) => [a[0] - c[0], a[1] - c[1], a[2] - c[2]], dot = (a, c) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
      const re = R.root.matrixWorld.elements, f = [re[8], re[9], re[10]], fl = Math.hypot(...f); f[0] /= fl; f[1] /= fl; f[2] /= fl;
      const up = [0, 1, 0], deg = (x) => +(x * 180 / Math.PI).toFixed(0);
      const ang = (v) => deg(Math.atan2(dot(v, f), dot(v, up)));   // lean forward of vertical (+ = forward)
      const B = R.b, he = B.hips.matrixWorld.elements, hu = [he[4], he[5], he[6]];
      const hips = W(B.hips), neck = W(B.neck || B.head), head = W(B.head), ftR = W(B.footR), ftL = W(B.footL), shR = W(B.shinR), shL = W(B.shinL), thR = W(B.thighR), thL = W(B.thighL);
      const hd = B.head.matrixWorld.elements, hf = [hd[8], hd[9], hd[10]]; const hfl = Math.hypot(...hf);
      const mid = [(ftR[0] + ftL[0]) / 2, 0, (ftR[2] + ftL[2]) / 2];
      return { pelvis: ang(hu), torso: ang(sub(neck, hips)), gaze: deg(Math.asin(hf[1] / hfl)), shinR: ang(sub(ftR, shR)), shinL: ang(sub(ftL, shL)), thighR: ang(sub(shR, thR)), thighL: ang(sub(shL, thL)),
        hipsBehindFeet: +(-dot(sub([hips[0], 0, hips[2]], mid), f)).toFixed(2), hipsY: +(hips[1] - R.root.position.y).toFixed(2), headY: +(head[1] - R.root.position.y).toFixed(2), kneeRy: +(shR[1] - R.root.position.y).toFixed(2), kneeLy: +(shL[1] - R.root.position.y).toFixed(2) };
    },
  };
});
await p.evaluate(() => { const loop = () => { const s = window.__game.sim, q = window.__spawn; s.enemies.forEach((e, i) => { e.x = q[0] + 400 + i * 4; e.z = q[2] + 400; e.atk = -50; }); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
async function until(src, maxFrames = 1500, tsMax = 0.6) {
  for (let i = 0; i < maxFrames; i++) {
    const r = await p.evaluate((src, tsMax) => { const rem = (0, eval)(src)(); if (rem == null) { window.__ts = 0; return 'fail'; } if (rem <= 0) { window.__ts = 0; return 'ok'; } window.__ts = Math.min(tsMax, Math.max(0.02, rem / 0.15)); return 'go'; }, src, tsMax);
    if (r !== 'go') return r; await raf(1);
  }
  await p.evaluate(() => { window.__ts = 0; }); return 'timeout';
}
const settle = async () => { await p.evaluate(() => { window.__ts = 1; }); await raf(4); for (let i = 0; i < 80; i++) { await raf(2); const ok = await p.evaluate(() => { const A = window.__ghostActor; return A.ground && Math.hypot(A.vel[0], A.vel[2]) < 0.2 && !A.mv && window.__ghostState?.action !== 'transport'; }); if (ok && i > 6) break; } };
// rows: [name, vy, up, moments, offset (Ghost lands this far off her slot -> she runs back)]
const SH = [0.04, 0.12, 0.22, 0.34, 0.46];
const ROWS = [['superhero', -32, 1.2, SH, 0], ['hop', -8, 0.3, [0.05, 0.12, 0.2], 0], ['big', -24, 1.2, [0.07, 0.2, 0.35, 0.6], 0], ['bigrun', -24, 1.2, [0.2, 0.35, 0.5, 0.8], 4]];
const out = [];
for (const [row, vy, upy, moms, off] of ROWS.filter(r => !only || only.split(',').includes(r[0]))) for (const who of ['S', 'G']) {
  if (row !== 'superhero' && who === 'S') continue;
  for (const view of ['side', 'q34']) {
    if (row !== 'superhero' && view === 'q34' && row !== 'big') continue;
    await p.evaluate(() => window.__BK.show()); await p.evaluate(() => window.__BK.park()); await settle();
    await p.evaluate((who) => window.__BK.hide(who === 'S' ? 'G' : 'S'), who);
    await p.evaluate((who, vy, up, off) => { const o = who === 'S' ? window.__game.sim : window.__ghostActor; o.pos[1] += up; if (off) o.pos[0] += off; o.ground = false; o.vel = [0, vy, 0]; window.__tg = null; window.__air = 0; window.__ts = 0.0005; }, who, vy, upy, off);
    await p.evaluate((who, view) => window.__BK.cam(who, view), who, view); await raf(3);
    for (const after of moms) {
      const r = await until(`() => { const o = ${who === 'S' ? 'window.__game.sim' : 'window.__ghostActor'}; if (!o.ground) window.__air = 1; if (o.ground && window.__air && window.__tg == null) { window.__tg = o.land; window.__tgT = o.t; window.__tgH = o.landHard; } if (window.__tg == null) return 0.05; return ${after} - (o.t - window.__tgT); }`, 600, 0.2);
      await p.evaluate((who, view) => window.__BK.cam(who, view), who, view); await raf(3);
      const st = await p.evaluate((who) => { const o = who === 'S' ? window.__game.sim : window.__ghostActor; const R = who === 'S' ? window.__rig : window.__ghostRig; const T = R.__tv || {};
        return { tg: +(window.__tg || 0).toFixed(2), hard: +(window.__tgH || 0).toFixed(2), land: +(o.land || 0).toFixed(2), lOn: T.lOn, lt: +(+T.lt || 0).toFixed(2), anim: (window.__ghostState || {}).animation?.clipKey, src: (window.__ghostState || {}).animation?.source, v: +Math.hypot(o.vel[0], o.vel[2]).toFixed(1), m: window.__BK.metrics(who) }; }, who);
      const f = `${outdir}/${row}_${who}_${view}_${String(after).replace('.', '')}.png`; await p.screenshot({ path: f, clip: { x: 230, y: 20, width: 500, height: 500 } });
      console.log(row, who, view, after, r, JSON.stringify(st)); out.push({ row, who, view, after, r, f, ...st });
    }
  }
}
// idle + run reference for Ghost (no landing): her normal pose, same metrics
for (const [nm, run] of [['idle', 0], ['run', 1]]) {
  await p.evaluate(() => window.__BK.show()); await p.evaluate(() => window.__BK.park()); await settle(); await p.evaluate(() => window.__BK.hide('S'));
  if (run) { await p.evaluate(() => { window.__ghostActor.pos[0] += 9; window.__ts = 1; }); await raf(12); }
  await p.evaluate(() => { window.__ts = 0; window.__BK.cam('G', 'side'); }); await raf(3);
  const st = await p.evaluate(() => ({ anim: (window.__ghostState || {}).animation?.clipKey, v: +Math.hypot(window.__ghostActor.vel[0], window.__ghostActor.vel[2]).toFixed(1), m: window.__BK.metrics('G') }));
  const f = `${outdir}/ref_G_${nm}.png`; await p.screenshot({ path: f, clip: { x: 230, y: 20, width: 500, height: 500 } });
  console.log('ref', nm, JSON.stringify(st)); out.push({ row: 'ref', who: 'G', view: nm, f, ...st });
}
fs.writeFileSync(`${outdir}/log_${only || 'all'}.json`, JSON.stringify({ out, errs }, null, 1));
console.log('errors', errs.length, errs.slice(0, 5).join('\n'));
await b.close();
