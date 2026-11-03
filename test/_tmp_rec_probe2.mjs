
import { launch } from './_tmp_rec_lib.mjs';
import fs from 'node:fs';
const txt = fs.readFileSync(new URL('./_tmp_rec2.mjs', import.meta.url), 'utf8');
const HELPERS = txt.slice(txt.indexOf('const HELPERS = `') + 17, txt.indexOf('`;\n\n// Inputs'));
const BASE = [-8, 1, -60]; const R90 = Math.PI / 2;
const { browser, page, cdp, errors } = await launch(1280, 720, process.argv[2] || 'http://localhost:4320/');
try {
  await page.evaluate(HELPERS);
  const setup = { pos: BASE, ang: R90, enemies: [[0, 14, 99]], ghostOff: true, cam: { t: 'ots', off: [-2.6, 2.1, -3.6], ly: 0.6 } };
  await page.evaluate((c) => window.__rec.place(c), setup);
  for (let i = 0; i < 60; i++) await page.evaluate(() => window.__rec.step(1000 / 60));
  await page.evaluate((c) => window.__rec.place(c), setup);
  for (let i = 0; i < 12; i++) await page.evaluate(() => window.__rec.step(1000 / 60));
  const shot = async (n) => { const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 }); fs.writeFileSync(`/tmp/probe_${n}.jpg`, Buffer.from(r.data, 'base64')); };
  await shot('a');
  const info = await page.evaluate(() => {
    const out = []; const sc = window.__scene; const cam = window.__camObj; const THREE_V = cam.position.constructor;
    const p = window.__game.sim.pos;
    sc.traverse(o => { if (!o.visible || !o.isMesh) return; const m = o.material; if (!m || !m.transparent) return;
      o.updateWorldMatrix(true, false); const e = o.matrixWorld.elements; const d = Math.hypot(e[12] - p[0], e[14] - p[2]);
      out.push({ name: o.name, type: o.type, geo: o.geometry && o.geometry.type, mat: m.type, op: m.opacity, d: +d.toFixed(1), pos: [e[12].toFixed(1), e[13].toFixed(1), e[14].toFixed(1)], ro: o.renderOrder, inst: o.geometry && o.geometry.instanceCount });
    });
    return out.filter(x => x.d < 30).slice(0, 80);
  });
  console.log(JSON.stringify(info));
  await page.evaluate(() => { const f = window.__combatFx.st; f.add.visible = f.alpha.visible = f.rib.visible = false; window.__fxHide = 1; });
  for (let i = 0; i < 1; i++) await page.evaluate(() => window.__rec.step(1000 / 60));
  await shot('b');
  console.log('errors', errors.length);
} finally { await browser.close(); }
