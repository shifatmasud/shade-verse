
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: process.env.CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width: 915, height: 412 });
const errors = []; p.on('pageerror', e => errors.push(String(e)));
await p.goto(`http://127.0.0.1:${process.argv[2]}/`, { waitUntil: 'load' });
await p.waitForFunction(() => !!window.__game, { timeout: 120000 });
for (let i = 0; i < 90; i++) { const ok = await p.evaluate(() => { if (window.__game.sim.mode !== 'play') window.__game.start(); return !!window.__scene && window.__game.sim.mode === 'play'; }); if (ok) break; await new Promise(r => setTimeout(r, 2000)); }
await new Promise(r => setTimeout(r, 2000));
console.log(await p.evaluate(() => Object.keys(window.__scene || {}).slice(0, 30).join(',')));
const cam = () => p.evaluate(() => { const c = window.__camObj; return c ? { fov: +c.fov.toFixed(2), q: c.quaternion.toArray().map(v => +v.toFixed(4)), pos: c.position.toArray().map(v => +v.toFixed(3)) } : null; });
console.log('calm', JSON.stringify(await cam()));
await p.evaluate(() => { window.__game.sim.shake = 1; });
const qs = []; for (let i = 0; i < 4; i++) { await p.evaluate(() => { window.__game.sim.shake = 1; }); await new Promise(r => setTimeout(r, 900)); qs.push(await cam()); }
console.log('shake', JSON.stringify(qs));
await p.evaluate(() => { const s = window.__game.sim; s.shake = 0; s.fovK = -6; s.fovKT = 0; });
const fs = []; for (let i = 0; i < 8; i++) { await new Promise(r => setTimeout(r, 250)); const c = await cam(); fs.push(c && c.fov); }
console.log('fov punch', JSON.stringify(fs));
console.log('ERRORS', JSON.stringify(errors));
await b.close();
