
import { launch } from './_tmp_rec_lib.mjs';
import fs from 'node:fs';
const txt = fs.readFileSync(new URL('./_tmp_rec2.mjs', import.meta.url), 'utf8');
const HELPERS = txt.slice(txt.indexOf('const HELPERS = `') + 17, txt.indexOf('`;\n\n// Inputs'));
const BASE = [-8, 1, -60]; const R90 = Math.PI / 2;
const url = process.argv[2] || 'http://127.0.0.1:4330/';
const tapM = `Object.assign(__game.input, { attackQ: true, meleeQ: true })`;
const out = {};
async function run(u, fn) { const { browser, page, cdp, errors } = await launch(1280, 720, u); try { await page.evaluate(HELPERS); await fn(page, cdp); } finally { out[u + ':errors'] = errors.filter(e => !/tickMusic/.test(e)).slice(0, 5); out[u + ':musicErr'] = errors.filter(e => /tickMusic/.test(e)).length; await browser.close(); } }
const place = async (page, setup) => { await page.evaluate((c) => window.__rec.place(c), setup); for (let i = 0; i < 30; i++) await page.evaluate(() => window.__rec.step(1000 / 60)); await page.evaluate((c) => window.__rec.place(c), setup); await page.evaluate(() => { window.__combatFx.pool.addN = 0; window.__combatFx.pool.alphaN = 0; }); };
const shot = async (cdp, n) => { const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 }); fs.writeFileSync(`/home/user/tab/files/combat_build/${n}.jpg`, Buffer.from(r.data, 'base64')); };
// melee 3 hits: max live particles + reticle visibility during combo
async function combo(page, tag) {
  await place(page, { pos: BASE, ang: R90, enemies: [[0, 2.4, 99]], ghostOff: true, cam: { t: 'mid', off: [3.9, 1.5, 1.6], ly: 1.0 } });
  let maxA = 0, maxB = 0, retDuring = 0, retBefore = null;
  for (let f = 0; f < 4; f++) await page.evaluate(() => window.__rec.step(1000 / 60));
  retBefore = await page.evaluate(() => window.__retVis);
  for (let f = 0; f < 120; f++) { if (f === 2 || f === 20 || f === 38) await page.evaluate(tapM); const st = await page.evaluate(() => { window.__rec.step(1000 / 60); const s = window.__game.sim; return [window.__combatFx.pool.addN, window.__combatFx.pool.alphaN, !!(s.mv || s.chainT > 0), window.__retVis, window.__combatFx.low]; }); maxA = Math.max(maxA, st[0]); maxB = Math.max(maxB, st[1]); if (st[2] && st[3]) retDuring++; out[tag + ':low'] = st[4]; }
  out[tag + ':maxAdd'] = maxA; out[tag + ':maxAlpha'] = maxB; out[tag + ':retVisibleFramesDuringMelee'] = retDuring; out[tag + ':retVisBeforeMelee'] = retBefore;
}
async function slamCount(page, tag) {
  await place(page, { pos: BASE, ang: R90, enemies: [[0, 3, 99], [2.5, 2.5, 99], [-2.6, 3.2, 99], [1.2, 5, 99]], ghostOff: true, cam: { t: 'hero', off: [-5.5, 2.8, 3.5], ly: 1.0, k: 0.12 } });
  let maxA = 0, maxB = 0;
  for (let f = 0; f < 170; f++) { if (f === 8) await page.evaluate(`Object.assign(__game.input, { attackQ: true, meleeQ: true, meleeHeld: true, meleeAt: performance.now() })`); if (f === 80) await page.evaluate(`__game.input.meleeHeld = false`); const st = await page.evaluate(() => { window.__rec.step(1000 / 60); return [window.__combatFx.pool.addN, window.__combatFx.pool.alphaN]; }); maxA = Math.max(maxA, st[0]); maxB = Math.max(maxB, st[1]); }
  out[tag + ':slamMaxAdd'] = maxA; out[tag + ':slamMaxAlpha'] = maxB;
}
await run(url, async (page, cdp) => {
  await combo(page, 'desk'); await slamCount(page, 'desk');
  // web pull strand
  await place(page, { pos: BASE, ang: R90, enemies: [[0, 11, 99]], ghostOff: true, cam: { t: 'mid', off: [-6.5, 2.0, 0.5], ly: 0.9, k: 0.2 } });
  let pullFrames = 0;
  for (let f = 0; f < 60; f++) { if (f === 4) await page.evaluate(tapM); const cw = await page.evaluate(() => { window.__rec.step(1000 / 60); const s = window.__game.sim; return s.cWeb ? +s.cWeb.t.toFixed(3) : -1; }); if (cw >= 0) { pullFrames++; if (pullFrames === 4 || pullFrames === 9) await shot(cdp, `web_pull_after_${pullFrames}`); } }
  out.pullStrandFrames = pullFrames;
  // yank: launcher > aerial > shot (yank)
  await place(page, { pos: BASE, ang: R90, enemies: [[0, 2.4, 99]], ghostOff: true, cam: { t: 'mid', off: [4.4, 1.8, 1.0], ly: 1.4 } });
  let yankFrames = 0;
  const tapS = `Object.assign(__game.input, { attackQ: true, shotQ: true })`;
  for (let f = 0; f < 130; f++) { if ([8, 24, 40, 60].includes(f)) await page.evaluate(tapM); if (f === 84 || f === 110) await page.evaluate(tapS); const cw = await page.evaluate(() => { window.__rec.step(1000 / 60); const s = window.__game.sim; return s.cWeb ? s.cWeb.mode : ''; }); if (cw) { yankFrames++; if (yankFrames === 5) await shot(cdp, `web_${cw}_after_5`); } }
  out.yankStrandFrames = yankFrames;
  // Ghost slam -> world slow-mo
  await place(page, { pos: BASE, ang: R90, enemies: [[-3, 6, 99], [2, 9, 99], [-2, 12, 99]], ghostOff: false, passive: false, cam: { t: 'ghostmid', off: [-6.5, 2.6, -2], ly: 0.9, k: 0.1 } });
  await page.evaluate(() => { const gp = window.__ghostState; });
  let ghostSlams = 0, slowSeen = 0, minTs = 1, last = 0;
  for (let f = 0; f < 600; f++) { const st = await page.evaluate(() => { window.__rec.step(1000 / 60); const s = window.__game.sim; const gs = window.__getGhostSim ? window.__getGhostSim() : null; return [s.tsNow || 1, s.slowT || 0, (s.mv || s.slam) ? 1 : 0]; }); if (st[1] > 0 && !st[2]) slowSeen++; minTs = Math.min(minTs, st[0]); }
  out.ghost_slowFrames_whileShadowIdle = slowSeen; out.ghost_minWorldTimeScale = +minTs.toFixed(3);
});
await run(url + '?q=low', async (page) => { await combo(page, 'low'); await slamCount(page, 'low'); });
console.log(JSON.stringify(out, null, 1));
