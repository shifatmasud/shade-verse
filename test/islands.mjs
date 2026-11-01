// Island walk test: drop the hero onto every island + the pirate ship and check it lands and stands (not swimming / falling through).
import puppeteer from 'puppeteer-core';
const url = process.argv[2] || 'http://127.0.0.1:4311/';
const b = await puppeteer.launch({ executablePath: process.env.CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 915, height: 412, hasTouch: true, isMobile: true });
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(url, { waitUntil: 'load' }); await new Promise((r) => setTimeout(r, 2500));
await p.evaluate(() => window.__game.start()); await new Promise((r) => setTimeout(r, 2500));
const spots = { jungle: [-160, -820], farm: [392, -585], farmEdge: [330, -560], ice: [-440, -500], iceEdge: [-470, -520], ship: [-440, -1090], shipStern: [-490, -1090] };
const res = {}; let ok = true;
for (const [n, [x, z]] of Object.entries(spots)) {
  await p.evaluate((x, z) => { const s = window.__game.sim; s.pos[0] = x; s.pos[1] = 40; s.pos[2] = z; s.vel = [0, 0, 0]; s.web = false; s.swim = false; }, x, z);
  await new Promise((r) => setTimeout(r, 9000));
  const r = await p.evaluate(() => { const s = window.__game.sim; return { y: +s.pos[1].toFixed(2), swim: !!s.swim, ground: !!s.ground, vy: +s.vel[1].toFixed(2) }; });
  res[n] = r; if (r.swim || !r.ground || r.y < 1.5) ok = false;
}
console.log(JSON.stringify(res)); console.log(errs.slice(0, 3).join('\n'));
console.log(ok && !errs.length ? 'ISLANDS PASS' : 'ISLANDS FAIL'); await b.close(); process.exit(ok ? 0 : 1);
