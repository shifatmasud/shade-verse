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
const baseUrl = process.env.TEST_URL || 'http://127.0.0.1:4173/';
let passed = true;
for (const [name, width, height, mobile] of cases) {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(baseUrl, { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 1800));
    await page.evaluate(() => window.__game.start());
    await page.waitForFunction(() => window.__ghostState?.mode === 'play' && window.__ghostState?.visible === true, { timeout: 5000 });
    const initial = await page.evaluate(() => window.__ghostState);
    const webgl = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        const gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
        if (!gl) return { webgl2: false, renderer: '', size: canvas ? [canvas.width, canvas.height] : null };
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return { webgl2: gl instanceof WebGL2RenderingContext, renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), size: [canvas.width, canvas.height] };
    });
    const noGhostActivationButton = !(await page.$("button[aria-label*='Ghost']"));
    const initialOk = initial?.visible === true && initial.mode === 'play' && initial.leaderDistance < 2.2 && noGhostActivationButton;
    const screenshot = await page.screenshot();
    const visual = await page.evaluate(async (pngBase64) => {
        const image = new Image(); image.src = `data:image/png;base64,${pngBase64}`; await image.decode();
        const sample = document.createElement('canvas'); sample.width = image.naturalWidth; sample.height = image.naturalHeight;
        const ctx = sample.getContext('2d'); ctx.drawImage(image, 0, 0);
        const x0 = Math.floor(sample.width * 0.32), x1 = Math.floor(sample.width * 0.68);
        const y0 = Math.floor(sample.height * 0.20), y1 = Math.floor(sample.height * 0.72);
        const data = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
        const colors = new Set(); let nonBlack = 0, sum = 0, sum2 = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            colors.add(`${r >> 4},${g >> 4},${b >> 4}`);
            if (Math.max(r, g, b) > 18) nonBlack++;
            const l = 0.2126 * r + 0.7152 * g + 0.0722 * b; sum += l; sum2 += l * l; count++;
        }
        const mean = sum / count;
        return { size: [image.naturalWidth, image.naturalHeight], crop: [x0, y0, x1, y1], colorBins: colors.size, nonBlackRatio: nonBlack / count, lumaStd: Math.sqrt(Math.max(0, sum2 / count - mean * mean)) };
    }, screenshot.toString('base64'));
    const swiftShaderOk = webgl.webgl2 && /swiftshader/i.test(webgl.renderer) && webgl.size?.[0] > 0 && webgl.size?.[1] > 0;
    const frameOk = visual.colorBins > 40 && visual.nonBlackRatio > 0.15 && visual.lumaStd > 6;
    const captureOk = swiftShaderOk && initialOk && frameOk && errors.length === 0;
    if (captureOk) await import('node:fs/promises').then(({ writeFile }) => writeFile(`art/ghost/shot-after-ghost-${name}.png`, screenshot));
    await new Promise((r) => setTimeout(r, 500));
    await page.evaluate(() => {
        const s = window.__game.sim;
        s.pos = [20, 52, -170]; s.vel = [0, 2, 20]; s.yaw = 0; s.ang = 0; s.ground = false;
    });
    await new Promise((r) => setTimeout(r, 250));
    await page.evaluate(() => { window.__game.input.swingQ = true; window.__game.input.swing = true; });
    await new Promise((r) => setTimeout(r, 2200));
    const before = await page.evaluate(() => window.__ghostState);
    await page.evaluate(() => { window.__game.sim.pos[0] += 8; });
    await new Promise((r) => setTimeout(r, 600));
    const after = await page.evaluate(() => window.__ghostState);
    const followDelta = Math.hypot(after.position[0] - before.position[0], after.position[1] - before.position[1], after.position[2] - before.position[2]);
    const ok = captureOk && before?.visible === true && Number.isFinite(before.speed) && before.leaderDistance < 15 && after?.visible === true && after.leaderDistance < 15 && followDelta > 1 && errors.length === 0;
    console.log(name, JSON.stringify({ ok, captureOk, initialOk, initial, webgl, visual, before, after, followDelta: +followDelta.toFixed(2), errors }));
    passed = passed && ok;
    await page.close();
}
await browser.close();
console.log(passed ? 'GHOST PASS' : 'GHOST FAIL');
process.exit(passed ? 0 : 1);
