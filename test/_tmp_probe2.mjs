
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: process.env.CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width: 915, height: 412 });
const errors = []; p.on('pageerror', e => errors.push('PE '+String(e))); p.on('console', m => { if (m.type() === 'error' || m.type()==='warning') errors.push(m.type()+' '+m.text().slice(0,300)); });
await p.goto(`http://127.0.0.1:${process.argv[2]}/`, { waitUntil: 'load' });
for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 2000)); const s = await p.evaluate(() => [!!window.__game, !!window.__scene, window.__game && window.__game.sim.mode]); console.log(i, JSON.stringify(s)); if (s[0]) { await p.evaluate(() => window.__game.start()); } if (s[1] && s[2]==='play') break; }
console.log(JSON.stringify(errors.slice(0,8)));
await b.close();
