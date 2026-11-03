// Phone touch-control check (Nov 2): node test/phone-controls.mjs http://127.0.0.1:<port>/ /tmp/out  (VITE_DBG build). Tap / hold / slide-off / cancel / two fingers on one button / stick + button; prints input writes per case. On a slow software-GL box CDP touch timing stretches quick taps past HOLD_MS.

import puppeteer from 'puppeteer-core';
const URL = process.argv[2], OUT = process.argv[3];
const CH = '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const b = await puppeteer.launch({ executablePath: CH, headless: 'new', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage(); const errs = [];
p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
await p.setViewport({ width: 844, height: 390, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
const cdp = await p.target().createCDPSession();
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await p.goto(URL + '?q=low', { waitUntil: 'load' }); await new Promise(r => setTimeout(r, 2000));
await p.evaluate(() => window.__game.start());
for (let i = 0; i < 180; i++) { if (await p.evaluate(() => window.__game.sim.mode) === 'play') break; await new Promise(r => setTimeout(r, 500)); }
await new Promise(r => setTimeout(r, 2500));
// show every button (context-gated ones too) and instrument input writes
await p.evaluate(() => {
  const I = window.__game.input; window.__log = []; window.__vib = [];
  try { navigator.vibrate = (ms) => { window.__vib.push(ms); return true; }; } catch (e) {}
  for (const k of ['grabQ','swingQ','shotQ','specialQ','meleeQ','jumpQ','swing','meleeHeld','jumpHeld']) {
    let v = I[k]; Object.defineProperty(I, k, { get() { return v; }, set(n) { if (n !== v || (n === true && k.endsWith('Q'))) window.__log.push([k, n, Math.round(performance.now())]); v = n; }, configurable: true, enumerable: true });
  }
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const unoff = () => p.evaluate(() => document.querySelectorAll('.ico.off').forEach(e => e.classList.remove('off')));
await unoff(); setInterval(() => { unoff().catch(() => {}); }, 80);
await sleep(500);
const ctr = async (sel) => p.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width }; }, sel);
const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
const clear = () => p.evaluate(() => { window.__log = []; window.__vib = []; });
const log = () => p.evaluate(() => ({ log: window.__log, vib: window.__vib, swing: window.__game.input.swing, meleeHeld: window.__game.input.meleeHeld, jumpHeld: window.__game.input.jumpHeld, mx: window.__game.input.mx, cls: [...document.querySelectorAll('.ico')].map(e => e.className) }));
const S = { swing: await ctr('.ico.swing'), shock: await ctr('.ico.special'), melee: await ctr('.ico.melee'), jump: await ctr('.ico.jump') };
const res = {};
const summarise = (l) => { const c = {}; for (const [k, v] of l.log) if (v === true) c[k] = (c[k] || 0) + 1; return { trues: c, stuck: { swing: l.swing, meleeHeld: l.meleeHeld, jumpHeld: l.jumpHeld }, vib: l.vib.length, cls: l.cls }; };
for (const [n, c] of Object.entries(S)) { await clear(); await T('touchStart', [[c.x, c.y, 1]]); await sleep(60); await T('touchEnd', []); await sleep(300); res['tap_' + n] = summarise(await log()); }
// holds with a screenshot mid-hold
for (const n of ['swing','shock','melee']) { const c = S[n]; await clear(); await T('touchStart', [[c.x, c.y, 1]]); await sleep(120); if (n === 'shock') await p.screenshot({ path: OUT + '_charge.png' }); await sleep(380); const mid = await log(); if (n === 'melee') await p.screenshot({ path: OUT + '_held.png' }); await T('touchEnd', []); await sleep(300); res['hold_' + n] = { mid: { swing: mid.swing, meleeHeld: mid.meleeHeld, cls: mid.cls }, after: summarise(await log()) }; }
// slide-off: press, slide to screen centre, release
for (const n of ['swing','shock','melee','jump']) { const c = S[n]; await clear(); await T('touchStart', [[c.x, c.y, 1]]); await sleep(60); for (let i = 1; i <= 6; i++) { await T('touchMove', [[c.x - i * 60, c.y - i * 20, 1]]); await sleep(30); } await sleep(400); await T('touchEnd', []); await sleep(300); res['slide_' + n] = summarise(await log()); }
// touchcancel mid-hold (e.g. an OS gesture)
for (const n of ['swing','melee','jump']) { const c = S[n]; await clear(); await T('touchStart', [[c.x, c.y, 1]]); await sleep(400); await T('touchCancel', []); await sleep(300); res['cancel_' + n] = summarise(await log()); }
// two fingers on the same button
for (const n of ['melee','swing','shock']) { const c = S[n]; await clear(); await T('touchStart', [[c.x, c.y, 1]]); await sleep(40); await T('touchStart', [[c.x, c.y, 1], [c.x + 8, c.y + 6, 2]]); await sleep(60); await T('touchEnd', [[c.x, c.y, 1]]); await sleep(60); await T('touchEnd', []); await sleep(300); res['twofinger_' + n] = summarise(await log()); }
// two thumbs: stick (left) + jump, then stick + swing hold; screenshot with both down
{ await clear(); const sx = 150, sy = 300; await T('touchStart', [[sx, sy, 1]]); await sleep(50); await T('touchMove', [[sx + 40, sy - 20, 1]]); await sleep(50);
  await T('touchStart', [[sx + 40, sy - 20, 1], [S.swing.x, S.swing.y, 2]]); await sleep(420); await T('touchMove', [[sx + 45, sy - 25, 1], [S.swing.x, S.swing.y, 2]]); await sleep(80);
  await p.screenshot({ path: OUT + '_twothumb.png' }); const mid = await log();
  await T('touchEnd', [[S.swing.x, S.swing.y, 2]]); await sleep(60); const mid2 = await log(); await T('touchEnd', []); await sleep(300);
  res.twothumb = { mid: { mx: mid.mx, swing: mid.swing }, afterThumbUp: { mx: mid2.mx, swing: mid2.swing }, after: summarise(await log()), mxAfter: (await log()).mx }; }
await p.screenshot({ path: OUT + '_idle.png' });
const lp = await p.evaluate(() => { const s = getComputedStyle(document.querySelector('.stage')); const i = getComputedStyle(document.querySelector('.ico.melee')); return { stageTouch: s.touchAction, callout: s.webkitTouchCallout, userSelect: s.userSelect, icoSel: i.userSelect }; });
res.css = lp; res.errors = errs;
for (const [k, v] of Object.entries(res)) { const vv = JSON.parse(JSON.stringify(v)); if (vv.cls) delete vv.cls; if (vv.after && vv.after.cls) delete vv.after.cls; console.log(k, JSON.stringify(vv)); }
await b.close(); process.exit(0);
