
import { launch } from './_tmp_rec_lib.mjs';
import fs from 'node:fs';
const txt = fs.readFileSync(new URL('./_tmp_rec2.mjs', import.meta.url), 'utf8');
const HELPERS = txt.slice(txt.indexOf('const HELPERS = `') + 17, txt.indexOf('`;\n\n// Inputs'));
const { browser, page, cdp, errors } = await launch(1280, 720, 'http://127.0.0.1:4330/');
try {
  await page.evaluate(HELPERS);
  const setup = { pos: [-8, 1, -60], ang: Math.PI / 2, enemies: [[0, 6, 99]], ghostOff: true, cam: { t: 'mid', off: [0.5, 1.6, -5.5], ly: 1.6, k: 0.3 } };
  await page.evaluate((c) => window.__rec.place(c), setup); for (let i = 0; i < 30; i++) await page.evaluate(() => window.__rec.step(1000 / 60));
  await page.evaluate((c) => window.__rec.place(c), setup); for (let i = 0; i < 6; i++) await page.evaluate(() => window.__rec.step(1000 / 60));
  await page.evaluate(() => { const e = window.__game.sim.enemies[0]; e.ly = 3; e.vy = 5; });
  for (let i = 0; i < 6; i++) await page.evaluate(() => window.__rec.step(1000 / 60));
  await page.evaluate(`Object.assign(__game.input, { attackQ: true, shotQ: true })`);
  let n = 0, mode = '';
  for (let f = 0; f < 40; f++) { const cw = await page.evaluate(() => { window.__rec.step(1000 / 60); const s = window.__game.sim; return s.cWeb ? s.cWeb.mode : ''; }); if (cw) { n++; mode = cw; if (n === 5) { const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 }); fs.writeFileSync('/home/user/tab/files/combat_build/web_yank_after.jpg', Buffer.from(r.data, 'base64')); } } }
  console.log(JSON.stringify({ yankFrames: n, mode, errors: errors.filter(e => !/tickMusic/.test(e)) }));
} finally { await browser.close(); }
