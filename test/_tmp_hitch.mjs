
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: process.env.CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width: 640, height: 360 });
await p.goto(`http://127.0.0.1:${process.argv[2]}/?q=low`, { waitUntil: 'load' });
await p.waitForFunction(() => !!window.__game, { timeout: 120000 });
for (let i = 0; i < 90; i++) { const ok = await p.evaluate(() => { if (window.__game.sim.mode !== 'play') window.__game.start(); return !!window.__scene && window.__game.sim.mode === 'play'; }); if (ok) break; await new Promise(r => setTimeout(r, 2000)); }
await new Promise(r => setTimeout(r, 5000));
await p.evaluate(() => { window.__fd = []; let last = performance.now(); const f = (t) => { window.__fd.push(t - last); last = t; requestAnimationFrame(f); }; requestAnimationFrame(f); });
const hit = async () => { await p.evaluate(() => { const { sim, input } = window.__game; const pp = sim.pos; const e = sim.enemies.find(e => !e.boss); e.x = pp[0]; e.z = pp[2] + 2.2; e.y = pp[1] - 1; e.hp = 50; e.down = 0; e.atk = 0; sim.yaw = 0; sim.ang = 0; window.__fd = []; input.meleeQ = true; input.attackQ = true; }); await new Promise(r => setTimeout(r, 6000)); return p.evaluate(() => { const a = window.__fd.slice().sort((x, y) => y - x); return { n: window.__fd.length, max: a.slice(0, 3).map(v => Math.round(v)), med: Math.round(a[Math.floor(a.length / 2)]) }; }); };
console.log('first', JSON.stringify(await hit()));
console.log('second', JSON.stringify(await hit()));
console.log('third', JSON.stringify(await hit()));
await b.close();
