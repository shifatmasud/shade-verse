
// Real dodge strip (Nov 3): a real ground dodge (dodgeQ, no stick = backflip), the hero's own flip clock, side view at fixed steps; usage: node test/dodgeflip_strip.mjs <port> <outdir> [S|G]
import puppeteer from 'puppeteer-core'; import fs from 'fs';
const [port, outdir, who = 'S'] = process.argv.slice(2); fs.mkdirSync(outdir, { recursive: true });
const b = await puppeteer.launch({ executablePath: process.env.CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width: 640, height: 360 });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 120000 }); await p.waitForFunction(() => !!window.__game, { timeout: 120000 });
await new Promise(r => setTimeout(r, 1500)); await p.evaluate(() => window.__game.start());
await p.waitForFunction(() => window.__game.sim.mode === 'play' && window.__game.sim.t > 1.5 && !!window.__ghostActor, { timeout: 180000, polling: 250 });
await p.addStyleTag({ content: '#root *, body > div * { visibility: hidden !important; } #root canvas, body > div canvas, canvas { visibility: visible !important; }' });
const raf = (n) => p.evaluate((n) => new Promise(res => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
await p.evaluate(() => { const s = window.__game.sim; window.__q = [...s.pos]; s.enemies.forEach((e, i) => { e.x = s.pos[0] + 200 + i * 4; e.z = s.pos[2] + 200; e.atk = -50; }); window.__ghostDisableCombat = true; });
await p.evaluate(() => { window.__ts = 1; }); await raf(40);
const O = who === 'S' ? 'window.__game.sim' : 'window.__ghostActor';
// trigger: Shadow's real dodge input; Ghost: her own controls path is AI-only, so start her flip exactly as sim.ts does for a back dodge (v back 18, up 7.5)
await p.evaluate((who) => { const s = window.__game.sim, A = window.__ghostActor; window.__ts = 0.0005;
  if (who === 'S') { s.ang = 0; s.yaw = 0; window.__game.input.dodgeQ = true; }
  else { const fx = Math.sin(A.ang), fz = Math.cos(A.ang); A.dodgeT = 0.38; A.vel = [-fx * 18, 7.5, -fz * 18]; A.ground = false; A.flip = { t: 0, dur: 0.5, ax: 'x', dir: -1 }; }
  window.__side = null; }, who);
for (let i = 0; i < 40; i++) { if (await p.evaluate((O) => !!(0, eval)(O).flip, O)) break; await raf(1); }   // the sim turns dodgeQ into a flip on its next step
const steps = [0.12, 0.24, 0.36, 0.46, 0.6, 0.8]; const log = [];
for (const u of steps) {
  for (let i = 0; i < 1200; i++) { const r = await p.evaluate((O, u) => { const o = (0, eval)(O); const f = o.flip; if (!f) { window.__ts = 0; return 'gone'; } const rem = u - f.t / f.dur; if (rem <= 0) { window.__ts = 0; return 'ok'; } window.__ts = Math.min(0.2, Math.max(0.01, rem * 0.5 / 0.15)); return 'go'; }, O, u); if (r !== 'go') break; await raf(1); }
  const st = await p.evaluate((O, who) => { const o = (0, eval)(O), R = who === 'S' ? window.__rig : window.__ghostRig; const m = R.b.hips.matrixWorld.elements; const hd = R.b.head.matrixWorld.elements;
    if (!window.__side) window.__side = [o.pos[0], o.pos[2]];
    const a = o.ang || 0, fx = Math.sin(a), fz = Math.cos(a), sx = fz, sz = -fx; const c = [m[12], o.pos[1] - 0.2, m[14]];
    window.__camOv = [c[0] + sx * 6, c[1] + 0.3, c[2] + sz * 6, c[0], c[1], c[2]];
    return { u: o.flip ? +(o.flip.t / o.flip.dur).toFixed(2) : null, ground: o.ground, vy: +o.vel[1].toFixed(1), y: +o.pos[1].toFixed(2), hipsY: +m[13].toFixed(2), headY: +hd[13].toFixed(2), land: +(o.land || 0).toFixed(2) }; }, O, who);
  await raf(6); const f = `${outdir}/${who}_${Math.round(u * 100)}.png`; await p.screenshot({ path: f, clip: { x: 170, y: 30, width: 300, height: 300 } }); log.push({ ...st, f }); console.log(JSON.stringify(st));
}
fs.writeFileSync(`${outdir}/strip_${who}.json`, JSON.stringify({ log, errs }, null, 1)); console.log('ERRORS', errs.length); await b.close(); process.exit(0);
