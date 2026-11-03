
import puppeteer from 'puppeteer-core';
export const VCLOCK = `(() => {
  const rp = performance.now.bind(performance);
  let manual = false, vt = 0, vt0 = 0, d0 = 0, id = 1; const q = []; const rDate = Date.now.bind(Date);
  Date.now = () => manual ? d0 + (vt - vt0) : rDate();
  const realRaf = window.requestAnimationFrame.bind(window), realCaf = window.cancelAnimationFrame.bind(window);
  performance.now = () => manual ? vt : rp();
  window.requestAnimationFrame = (cb) => { if (!manual) return realRaf(cb); const i = id++; q.push([i, cb]); return -i; };
  window.cancelAnimationFrame = (i) => { if (i < 0) { const k = q.findIndex(e => e[0] === -i); if (k >= 0) q.splice(k, 1); } else realCaf(i); };
  window.__vclock = { start() { vt = rp(); vt0 = vt; d0 = rDate(); manual = true; }, get manual() { return manual; }, tick(ms) { vt += ms; const cbs = q.splice(0); for (const [, cb] of cbs) { try { cb(vt); } catch (e) { console.error('raf cb', e && e.stack || e); } } return cbs.length; } };
})();`;
export async function launch(w = 1280, h = 720, url = 'http://localhost:4320/') {
  const browser = await puppeteer.launch({ executablePath: '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', headless: 'new', protocolTimeout: 120000,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--window-size=${w},${h}`] });
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.evaluateOnNewDocument(VCLOCK);
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!window.__game, { timeout: 60000 });
  await new Promise(r => setTimeout(r, 1500));
  await page.evaluate(() => window.__game.start());
  await page.waitForFunction(() => window.__game.sim.mode === 'play' && !!window.__scene, { timeout: 60000 });
  await new Promise(r => setTimeout(r, 2500));
  await page.evaluate(() => { window.__perfPin = 1; window.__vclock.start(); });
  await new Promise(r => setTimeout(r, 1500));
  const cdp = await page.target().createCDPSession();
  return { browser, page, cdp, errors };
}
