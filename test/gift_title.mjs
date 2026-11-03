import puppeteer from 'puppeteer-core';
import fs from 'fs';
// Shade Verse title GIFT check: sticker on the title (desktop + phone landscape), the 3D gift opening -> card, close, Play still starts.
const [,, url, out] = process.argv;
fs.mkdirSync(out, { recursive: true });
const CH = process.env.CHROME || '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: CH, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const sizes = [['desk', 1440, 900, 1, false], ['phone', 844, 390, 2, true]];
const report = {};
for (const [name, w, h, dpr, mob] of sizes) {
  if (only && !only.includes(name)) continue;
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const reqs = []; p.on('request', (r) => reqs.push(r.url().split('/').pop()));
  await p.emulate({ viewport: { width: w, height: h, deviceScaleFactor: dpr, isMobile: mob, hasTouch: mob, isLandscape: true }, userAgent: mob ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' : 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' });
  await p.goto(url, { waitUntil: 'load', timeout: 60000 });
  await sleep(5500);
  const r = {};
  r.giftChunkBeforeTap = reqs.some((u) => /GiftStage/.test(u));
  r.sticker = await p.evaluate(() => { const e = document.querySelector('.gift-sticker'); if (!e) return null; const q = e.getBoundingClientRect(); return { x: q.x, y: q.y, w: q.width, h: q.height, on: e.classList.contains('is-on') }; });
  await p.screenshot({ path: `${out}/${name}_title.png` });
  const s = r.sticker;
  const tap = async (x, y) => { if (mob) await p.touchscreen.tap(x, y); else await p.mouse.click(x, y); };
  await tap(s.x + s.w / 2, s.y + s.h / 2);
  const t0 = Date.now();
  await sleep(600); r.dialog = await p.evaluate(() => !!document.querySelector('.gift'));
  r.comicStillTitle = await p.evaluate(() => !document.querySelector('.sv-comic.leaving'));
  // wait for the stage to arrive and the box to rise
  for (let i = 0; i < 40; i++) { if (await p.evaluate(() => !!document.querySelector('.gift--ready'))) break; await sleep(250); }
  r.readyMs = Date.now() - t0;
  r.giftChunkAfterTap = reqs.some((u) => /GiftStage/.test(u));
  await sleep(1200); await p.screenshot({ path: `${out}/${name}_g1_box.png` });
  await sleep(1300); await p.screenshot({ path: `${out}/${name}_g2_box.png` });
  // tap the box (the portfolio: closed wrapped box, tap to open)
  const hit = await p.evaluate(() => { const e = document.querySelector('.gift__hit'); if (!e) return null; const q = e.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2, w: q.width }; });
  r.hit = hit;
  if (hit && hit.w > 4) await tap(hit.x, hit.y); else await tap(w / 2, h * 0.55);
  const t1 = Date.now();
  for (const [k, ms] of [['o1', 900], ['o2', 2200], ['o3', 3300], ['o4', 4300], ['o5', 5600], ['o6', 7600]]) { const d = ms - (Date.now() - t1); if (d > 0) await sleep(d); await p.screenshot({ path: `${out}/${name}_${k}.png` }); }
  // Space while the gift is open must not start the game (Space = Play on the title)
  await p.keyboard.press('Space'); await sleep(400);
  r.spaceInGiftKeptTitle = await p.evaluate(() => !!document.querySelector('.gift') && !document.querySelector('.sv-comic.leaving'));
  r.cta = await p.evaluate(() => { const a = document.querySelector('.gift__cta'); return a ? { href: a.href, on: a.classList.contains('is-on') } : null; });
  // close
  const cl = await p.evaluate(() => { const e = document.querySelector('.gift__close'); if (!e) return null; const q = e.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; });
  if (cl) await tap(cl.x, cl.y); else await p.keyboard.press('Escape');
  await sleep(1500);
  r.closed = await p.evaluate(() => !document.querySelector('.gift') && !document.documentElement.classList.contains('gift-open'));
  r.stillTitleAfterClose = await p.evaluate(() => !!document.querySelector('.sv-comic:not(.leaving)'));
  await p.screenshot({ path: `${out}/${name}_closed.png` });
  // Play
  const pl = await p.evaluate(() => { const e = document.querySelector('.sv-play'); const q = e.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; });
  if (mob) await tap(pl.x, pl.y); else await p.keyboard.press('Space');   // desktop: Space starts (Shifat 7:37 PM), phone: tap Play
  await sleep(1500);
  r.leftTitle = await p.evaluate(() => !document.querySelector('.sv-comic:not(.leaving)'));
  r.stickerGone = await p.evaluate(() => { const e = document.querySelector('.gift-sticker'); return !e || getComputedStyle(e).visibility === 'hidden' || !!e.closest('.leaving'); });
  await sleep(9000);
  r.gameCanvas = await p.evaluate(() => document.querySelectorAll('canvas').length);
  await p.screenshot({ path: `${out}/${name}_game.png` });
  r.errs = errs; report[name] = r;
  await p.close();
}
console.log(JSON.stringify(report, null, 1));
await b.close();
