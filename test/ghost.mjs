import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
await import('node:fs/promises').then(({ mkdir }) => mkdir('art/ghost', { recursive: true }));
const cases = [
    ['desktop', 1365, 768, false],
    ['mobile-landscape', 844, 390, true],
];
let passed = true;
for (const [name, width, height, mobile] of cases) {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 1800));
    await page.evaluate(() => window.__game.start());
    await new Promise((r) => setTimeout(r, 500));
    await page.evaluate(() => {
        const s = window.__game.sim;
        s.pos = [20, 52, -170]; s.vel = [0, 2, 20]; s.yaw = 0; s.ang = 0; s.ground = false;
    });
    await new Promise((r) => setTimeout(r, 250));
    await page.evaluate(() => { window.__game.input.swingQ = true; window.__game.input.swing = true; });
    await new Promise((r) => setTimeout(r, 2200));
    const before = await page.evaluate(() => window.__ghostState);
    await page.screenshot({ path: `art/ghost/shot-after-ghost-${name}.png` });
    await page.evaluate(() => { window.__game.sim.pos[0] += 8; });
    await new Promise((r) => setTimeout(r, 600));
    const after = await page.evaluate(() => window.__ghostState);
    const followDelta = Math.hypot(after.position[0] - before.position[0], after.position[1] - before.position[1], after.position[2] - before.position[2]);
    const ok = before?.visible === true && Number.isFinite(before.speed) && before.leaderDistance < 15 && after?.visible === true && after.leaderDistance < 15 && followDelta > 1 && errors.length === 0;
    console.log(name, JSON.stringify({ ok, before, after, followDelta: +followDelta.toFixed(2), errors }));
    passed = passed && ok;
    await page.close();
}
await browser.close();
console.log(passed ? 'GHOST PASS' : 'GHOST FAIL');
process.exit(passed ? 0 : 1);
