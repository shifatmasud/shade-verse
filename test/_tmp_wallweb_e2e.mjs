
import puppeteer from 'puppeteer-core';
const PORT = process.argv[2] || '4350';
const b = await puppeteer.launch({ executablePath: process.env.CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const w = ms => new Promise(r => setTimeout(r, ms));
const errs = [];
async function open(mobile) {
  const p = await b.newPage();
  p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error' || /shader|THREE\.WebGL/i.test(m.text())) errs.push('console ' + m.text().slice(0, 200)); });
  if (mobile) { await p.setViewport({ width: 915, height: 412, hasTouch: true, isMobile: true, deviceScaleFactor: 1 }); }
  else await p.setViewport({ width: 960, height: 540 });
  await p.goto('http://127.0.0.1:' + PORT + '/' + (mobile ? '?q=low' : ''), { waitUntil: 'load' }); await w(2500);
  await p.evaluate(() => window.__game.start()); for (let i = 0; i < 120; i++) { if (await p.evaluate(() => window.__game.sim.mode) === 'play') break; await w(500); } await w(1500);
  return p;
}
const place = (p, where) => p.evaluate((where) => {
  const g = window.__game, s = g.sim, B = g.buildings;
  const list = B.map((b, i) => ({ b, i })).filter(o => !o.b.ob && o.b.x1 - o.b.x0 > 8);
  if (where === 'wall') { const o = list.filter(o => o.b.h > 40).sort((a, c) => Math.hypot(a.b.x0, a.b.z0) - Math.hypot(c.b.x0, c.b.z0))[0]; s.pos = [o.b.x0 - 0.45, o.b.h * 0.5, (o.b.z0 + o.b.z1) / 2]; s.vel = [0, 0, 0]; s.ground = false; s.web = false; s.wall = [-1, 0]; s.wallB = o.i; s.yaw = Math.PI / 2; s.lastDrag = s.t; }
  else { const o = where === 'roof' ? list.filter(o => o.b.h > 40).sort((a, c) => Math.hypot(a.b.x0, a.b.z0) - Math.hypot(c.b.x0, c.b.z0))[0] : list.sort((a, c) => c.b.h - a.b.h)[0]; s.pos = [(o.b.x0 + o.b.x1) / 2, o.b.h + 1, (o.b.z0 + o.b.z1) / 2]; s.vel = [0, 0, 0]; s.ground = true; s.web = false; s.wall = null; s.yaw = 0.3; }
  s.hp = 100; s.time = 999; s.spring = 0; s.grappleFlight = false; s.glideMode = false;
  return { pos: s.pos.slice(), wall: !!s.wall, ground: s.ground };
}, where);
// sample the sim for ms after the input
const watch = (p, ms) => p.evaluate(async (ms) => {
  const s = window.__game.sim, p0 = s.pos.slice(), st0 = s.t, out = { wall0: !!s.wall, sawSpring: false, sawWeb: false, sawGlide: false, sawFlightBoost: false, leftWall: false, leftRoof: false, maxUp: 0, maxMove: 0 };
  const t0 = performance.now();
  while (s.t - st0 < ms / 1000 && performance.now() - t0 < 30000) { await new Promise(r => requestAnimationFrame(r));
    out.sawSpring ||= s.spring > 0 || !!s.grappleFlight; out.sawWeb ||= s.web; out.sawGlide ||= !!s.glideOn; out.sawFlightBoost ||= !!s.flightBoost; out.leftWall ||= !s.wall; out.leftRoof ||= !s.ground;
    out.maxUp = Math.max(out.maxUp, s.pos[1] - p0[1]); out.maxMove = Math.max(out.maxMove, Math.hypot(s.pos[0] - p0[0], s.pos[2] - p0[2])); }
  out.maxUp = +out.maxUp.toFixed(1); out.maxMove = +out.maxMove.toFixed(1); out.wallEnd = !!s.wall; out.yaw = +s.yaw.toFixed(2); out.simSec = +(s.t - st0).toFixed(2); out.realSec = +((performance.now() - t0) / 1000).toFixed(1); return out;
}, ms);
const results = [];
const rec = (name, r, ok) => { results.push({ name, ok, ...r }); console.log(ok ? 'PASS' : 'FAIL', name, JSON.stringify(r)); };
// ---- mobile: merged web button (tap = spring, hold = swing), jump button (hold = flight)
{
  const p = await open(true);
  const cdp = await p.target().createCDPSession();
  const btn = async (sel, ms, watchMs) => { const r = await p.$eval(sel, e => { const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; });
    const tp = [{ x: r[0], y: r[1], id: 3 }];
    const wp = watch(p, watchMs);
    if (ms < 200) { const a = cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp }), c = cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await a; await c; return wp; }   // tap: both queued back to back (a slow software-GL frame must not turn it into a hold)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp }); const out = ms === Infinity ? await wp : (await w(ms), null); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    return out || wp; };
  for (const where of ['wall', 'roof', 'top']) {
    await place(p, where); await w(400); let r = await btn('.ico.swing', 60, 1200); rec('mobile ' + where + ' tap->spring', r, r.sawSpring && (where === 'wall' ? r.leftWall : r.leftRoof) && r.maxMove > 3);
    await place(p, where); await w(400); r = await btn('.ico.swing', 900, 1200); rec('mobile ' + where + ' hold->swing', r, r.sawWeb && (where === 'wall' ? r.leftWall : r.leftRoof) && r.maxMove > 3);
  }
  await place(p, 'wall'); await w(400); let r = await btn('.ico.jump', Infinity, 1500); rec('mobile wall hold-jump->flight', r, r.leftWall && r.sawGlide && r.sawFlightBoost && r.maxUp > 8);
  await p.screenshot({ path: '/tmp/wallweb_mobile.png' });
  await p.close();
}
// ---- desktop: L tap/hold, right mouse tap/hold, I/Space hold
{
  const p = await open(false);
  const key = async (code, ms, watchMs) => { const wp = watch(p, watchMs); if (ms < 200) { await p.keyboard.press(code); return wp; } await p.keyboard.down(code); if (ms === Infinity) { const r = await wp; await p.keyboard.up(code); return r; } await w(ms); await p.keyboard.up(code); return wp; };
  for (const where of ['wall', 'roof', 'top']) {
    await place(p, where); await w(400); let r = await key('KeyL', 60, 1200); rec('desktop ' + where + ' L tap->spring', r, r.sawSpring && (where === 'wall' ? r.leftWall : r.leftRoof) && r.maxMove > 3);
    await place(p, where); await w(400); r = await key('KeyL', 900, 1200); rec('desktop ' + where + ' L hold->swing', r, r.sawWeb && (where === 'wall' ? r.leftWall : r.leftRoof) && r.maxMove > 3);
  }
  for (const k of ['KeyI', 'Space']) { await place(p, 'wall'); await w(400); const r = await key(k, Infinity, 1500); rec('desktop wall hold ' + k + '->flight', r, r.leftWall && r.sawGlide && r.sawFlightBoost && r.maxUp > 8); }
  await place(p, 'wall'); await w(400); { await p.mouse.move(480, 270); await p.mouse.down({ button: 'right' }); const wp = watch(p, 1200); await w(60); await p.mouse.up({ button: 'right' }); const r = await wp; rec('desktop wall right-click tap->spring', r, r.sawSpring && r.leftWall); }
  await p.close();
}
console.log('ERRORS', errs.length, JSON.stringify(errs.slice(0, 8)));
console.log('SUMMARY', results.filter(r => r.ok).length + '/' + results.length);
await b.close();
