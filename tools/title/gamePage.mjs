
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
process.env.VITE_DBG = '1';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export async function openGame(w, h, dpr = 1) {
  const server = await createServer({ root, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
  await server.listen();
  const port = server.httpServer.address().port;
  const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', headless: 'new', protocolTimeout: 900000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage();
  p.on('pageerror', (e) => console.error('pageerror', e.message)); p.on('console', (m) => { if (m.text().startsWith('ground')) console.log(m.text()); });
  await p.setViewport({ width: w, height: h, deviceScaleFactor: dpr });
  await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 300000 });
  await p.waitForFunction(() => window.__game, { timeout: 300000 });
  await p.evaluate(() => window.__game.start());
  await p.waitForFunction(() => window.__scene && window.__camObj && window.__game.sim.mode !== 'menu' && !document.querySelector('.sv-bl'), { timeout: 600000, polling: 500 });
  await new Promise(r => setTimeout(r, 2500));
  // hide every DOM layer but the game canvas (HUD, touch pads, debug text)
  await p.evaluate(() => { const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0]; cv.dataset.svShot = '1';
    const st = document.createElement('style'); st.textContent = 'body * { visibility: hidden !important; } canvas[data-sv-shot] { visibility: visible !important; }'; document.head.appendChild(st); });
  const close = async () => { await b.close(); await server.close(); };
  return { p, b, close };
}
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
