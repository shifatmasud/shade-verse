
// Web-shot VFX harness (Nov 2). Usage: node test/shotfx_harness.mjs <port> <outdir> <strip|close> [ghost]
// strip: 8 side-camera frames fire -> flight -> impact. close: frozen close-up of the bolt mid-flight (Shadow, or Ghost's own bolt with "ghost").
// Also counts WebGL draw calls per frame (window.__dc) and live combat-FX particles.
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const [port, outdir, scen = 'strip', who = 'shadow'] = process.argv.slice(2);
fs.mkdirSync(outdir, { recursive: true });
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width: 640, height: 360, deviceScaleFactor: 1, hasTouch: !process.env.DESK, isMobile: !process.env.DESK });   // default = phone tier (touch => combatFx LOW); DESK=1 = desktop tier
await p.evaluateOnNewDocument(() => {
  window.__dc = 0;
  for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) { if (!C) continue; for (const f of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) { const o = C.prototype[f]; if (!o) continue; C.prototype[f] = function (...a) { window.__dc++; return o.apply(this, a); }; } }
});
const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction(() => !!window.__game, { timeout: 120000 });
await new Promise(r => setTimeout(r, 1500));
await p.evaluate(() => window.__game.start());
await p.waitForFunction(() => window.__game.sim.mode === 'play' && window.__game.sim.t > 1.5, { timeout: 180000, polling: 250 });
await new Promise(r => setTimeout(r, 500));
const raf = (n) => p.evaluate((n) => new Promise(res => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const dcount = async () => { await raf(2); const a = await p.evaluate(() => window.__dc); await raf(6); const z = await p.evaluate(() => window.__dc); return +((z - a) / 6).toFixed(1); };
const DIST = scen === 'close' ? 30 : 11;
if (process.env.TOD) await p.evaluate((v) => { window.__todPh = +v; }, process.env.TOD);
const S = await p.evaluate((DIST) => {
  const g = window.__game, s = g.sim, I = g.input;
  window.__ts = 0; window.__ghostDisableCombat = true;
  s.enemies.forEach((e, i) => { if (i > 0) { e.down = 1e5; e.atk = 0; e.x = -900; e.z = -900; } });
  I.keys.w = I.keys.a = I.keys.s = I.keys.d = false; I.swing = false; I.swingQ = false; I.jumpQ = false;
  const q = window.__spawn || (window.__spawn = [...s.pos]); s.pos = [q[0], q[1], q[2]]; s.vel = [0, 0, 0]; s.web = false; s.wall = null; s.swim = false; s.glideOn = false; s.ground = true; s.ang = 0; s.yaw = 0; s.mv = null; s.flip = null; s.hp = 100; s.dodgeT = 0; s.atkT = 0;
  const e = s.enemies[0]; e.kind = 0; e.boss = false; e.x = q[0]; e.y = q[1]; e.z = q[2] + DIST; e.hp = 99; e.down = 0; e.atk = -50; e.hit = 0; e.kb = [0, 0]; e.ang = Math.PI; e.born = s.t - 5; e.air = false; e.roof = { x0: q[0] - 40, x1: q[0] + 40, z0: q[2] - 40, z1: q[2] + 40 }; e.ly = 0; e.vy = 0;
  s.aimE = e; return { t0: s.t };
}, DIST);
// advance sim time to target (fires at t0 when fire=true)
let fired = false;
const goto = async (target) => {
  for (let guard = 0; guard < 800; guard++) {
    const done = await p.evaluate((target, t0, fire, who) => {
      const g = window.__game, s = g.sim, e = s.enemies[0]; if (e.atk < -1 && e.atk > -60) e.atk = -50;
      if (fire) {
        if (who === 'ghost') { const G = window.__ghostSim; if (G) { const ox = s.pos[0] + 1.2, oy = s.pos[1] + 1.4, oz = s.pos[2] + 0.6, dx = e.x - ox, dy = e.y + 1 - oy, dz = e.z - oz, L = Math.hypot(dx, dy, dz); G.plasma.push({ x: ox, y: oy, z: oz, vx: dx / L * 55, vy: dy / L * 55, vz: dz / L * 55, t: 0, tgt: e }); G.shotT = 0.3; } }
        else { g.input.attackQ = true; g.input.shotQ = true; s.aimE = e; }
      }
      if (s.t >= target - 1e-4) { window.__ts = 0; return true; }
      window.__ts = Math.min(0.3, Math.max(0.01, (target - s.t) / 0.1)); return false;
    }, target, S.t0, !fired, who);
    fired = true; if (done) break; await raf(1);
  }
  await p.evaluate(() => { window.__ts = 0; });
};
const out = { info: [], dc: [], errs };
if (scen === 'strip') {
  const times = [0.012, 0.035, 0.07, 0.11, 0.15, 0.19, 0.25, 0.36];
  for (let i = 0; i < times.length; i++) {
    await goto(S.t0 + times[i]);
    await p.evaluate((DIST) => { const s = window.__game.sim, q = s.pos; const cz = q[2] + DIST / 2; window.__camOv = [q[0] + 7.2, q[1] + 1.5, cz - 0.4, q[0], q[1] + 1.1, cz]; }, DIST);
    await raf(3);
    const st = await p.evaluate(() => { const s = window.__game.sim, G = window.__ghostSim, f = window.__combatFx; return { t: +s.t.toFixed(3), bolts: s.plasma.length + (G ? G.plasma.length : 0), addN: f ? f.pool.addN : null, ehit: +s.enemies[0].hit.toFixed(2) }; });
    out.info.push(st); out.dc.push(await dcount());
    await p.screenshot({ path: `${outdir}/strip_${i}.png`, clip: { x: 80, y: 45, width: 480, height: 270 } });
  }
} else {
  await goto(S.t0 + 0.13);
  if (process.env.CLOSER) await p.evaluate((v) => { window.__closeR = +v; }, process.env.CLOSER);
  const bp = await p.evaluate((who) => { const s = window.__game.sim, P = who === 'ghost' ? window.__ghostSim.plasma : s.plasma; const b = P[0]; if (!b) return null; const sp = Math.hypot(b.vx, b.vy, b.vz); const dx = b.vx / sp, dz = b.vz / sp, R = +(window.__closeR || 2.2); window.__camOv = [b.x + dz * R - dx * 0.8, b.y + 1.1, b.z - dx * R - dz * 0.8, b.x - dx * 0.9, b.y - 0.15, b.z - dz * 0.9]; return [b.x, b.y, b.z]; }, who);
  await raf(3);
  const st = await p.evaluate(() => { const s = window.__game.sim, f = window.__combatFx; return { t: +s.t.toFixed(3), addN: f ? f.pool.addN : null }; });
  const pl = await p.evaluate(() => ({ sh: window.__game.sim.plasma.map(b => [b.x, b.y, b.z, b.t].map(v => +v.toFixed(2))), gh: (window.__ghostSim?.plasma || []).map(b => [b.x, b.y, b.z, b.t].map(v => +v.toFixed(2))), hero: window.__game.sim.pos.map(v => +v.toFixed(2)), cam: window.__camOv.map(v => +v.toFixed(2)) }));
  const shapes = await p.evaluate(() => { const g = window.__combatFx.st.add.geometry, B = g.attributes.iB.array, C = g.attributes.iC.array, A = g.attributes.iA.array, n = g.instanceCount; const o = {}; const ex = []; for (let i = 0; i < n; i++) { const k = B[i * 4 + 3]; o[k] = (o[k] || 0) + 1; if (ex.length < 40) ex.push([k, +A[i*4].toFixed(2), +A[i*4+1].toFixed(2), +A[i*4+2].toFixed(2), +A[i*4+3].toFixed(2), +C[i*4+3].toFixed(2)]); } return { n, o, ex }; });
  out.info.push({ ...st, bp, pl, shapes }); out.dc.push(await dcount());
  await p.screenshot({ path: `${outdir}/close_${who}.png` });
}
fs.writeFileSync(`${outdir}/${scen}_${who}_info.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ errs: errs.length, first: errs.slice(0, 3), info: out.info, dc: out.dc }));
await b.close();
