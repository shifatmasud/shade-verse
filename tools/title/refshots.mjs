
// Real game reference shots for the first screen's panel art (Shifat Nov 2 5:43 PM "Use real shots from game", then 6:03 PM "Or just ai
// generated image as close to real 3d as possible"): runs the real game (vite dev, VITE_DBG=1) in headless Chrome, pauses it, hides
// the HUD, stages each hero from ./poses.ts in the world with ./shot.ts and grabs 4 layers per shot: all / world / matte on black /
// matte on white (alpha = 1 - (white - black)). The hero-on-matte and world layers were the image references for the AI panel renders.
//   node tools/title/refshots.mjs tools/title/refshots.json <outDir>
import { openGame, sleep } from './gamePage.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export async function layoutQuads() {   // the frames' corners from src/title/layout.ts (one source of truth)
  const { createServer } = await import('vite');
  const sv = await createServer({ root, logLevel: 'error', server: { middlewareMode: true } });
  try { const m = await sv.ssrLoadModule('/src/title/layout.ts'); return Object.fromEntries(m.ART.panels.map((p) => [p.id, p.quad])); } finally { await sv.close(); }
}
export async function captureShots(cands, S, dir) {
  const { p, close } = await openGame(640, 640);
  const res = [];
  try {
    await p.evaluate(() => { window.__ts = 0; window.__hq = true; });
    await p.evaluate(async () => { window.__shot = await import('/tools/title/shot.ts'); window.__poses = await import('/tools/title/poses.ts'); });
    for (const c of cands) {
      const spec = await p.evaluate((id) => window.__poses.HEROES.find((h) => h.id === id), c.id);
      const w = Math.round((spec.box[2] - spec.box[0]) * S), h = Math.round((spec.box[3] - spec.box[1]) * S);
      await p.setViewport({ width: w, height: h }); await sleep(1500);
      await p.evaluate(async (c) => { const spec = window.__poses.HEROES.find((h) => h.id === c.id); await window.__shot.stage(spec, c); }, c);
      const out = { name: c.name, id: c.id, w, h, box: spec.box };
      for (const [m, col] of [['all', 0], ['world', 0], ['matte', 0x000000], ['matteW', 0xffffff]]) {
        await p.evaluate((m, col) => window.__shot.mode(m === 'matteW' ? 'matte' : m, col), m, col);
        await sleep(m === 'all' ? 3000 : 1800);
        const f = `${dir}/${c.name}_${m}.png`; await p.screenshot({ path: f }); out[m] = f;
      }
      out.hand = await p.evaluate(() => window.__shot.handScreen());
      await p.evaluate(() => window.__shot.mode('all'));
      res.push(out); console.log('captured', c.name);
    }
  } finally { await close(); }
  return res;
}
if (process.argv[1].endsWith('refshots.mjs')) {
  const [candFile, dir] = process.argv.slice(2);
  const r = await captureShots(JSON.parse(readFileSync(candFile, 'utf8')), 1.5, dir);
  writeFileSync(dir + '/cap.json', JSON.stringify(r, null, 1));
}
