
const puppeteer = require('/home/user/tab/work/shade-verse/node_modules/puppeteer-core');
const fs = require('fs');
const a = JSON.parse(process.argv[2]);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
    headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const logs = [];
  try {
    for (const s of a.shots) {
      const p = await b.newPage();
      p.on('console', m => { if (logs.length < 80 && m.type() !== 'warning') logs.push(s.out + ' ' + m.type() + ': ' + m.text().slice(0, 200)); });
      p.on('pageerror', e => logs.push(s.out + ' pageerror: ' + e.message));
      await p.setViewport({ width: s.w, height: s.h, deviceScaleFactor: s.dpr || 1, isMobile: !!s.mobile, hasTouch: !!s.mobile });
      await p.goto(a.url + (s.q || ''), { waitUntil: 'load', timeout: 90000 });
      await p.waitForFunction(() => window.__game, { timeout: 90000 });
      if (!s.noStart) await p.evaluate(() => window.__game.start());
      if (s.cam) await p.evaluate(c => { window.__camOv = c; }, s.cam);
      if (s.eval) { try { logs.push(s.out + ' eval ' + JSON.stringify(await p.evaluate(s.eval))); } catch (e) { logs.push('evalerr ' + e.message); } }
      await p.waitForFunction(() => window.__polyforkLake && window.__polyforkVegReady !== false, { timeout: 120000 }).catch(() => logs.push(s.out + ' lake not ready'));
      await sleep(s.wait || 8000);
      await p.screenshot({ path: s.out, type: 'png' });
      if (s.eval2) { try { logs.push(s.out + ' eval2 ' + JSON.stringify(await p.evaluate(s.eval2))); } catch (e) { logs.push('evalerr ' + e.message); } }
      await p.close();
    }
  } catch (e) { logs.push('ERR ' + e.message); }
  fs.writeFileSync(a.log, logs.join('\n'));
  await b.close();
})();
