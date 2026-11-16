import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const port = process.argv[2] || '5175';
const outDir = path.resolve(process.argv[3] || 'evidence/performance-review/final/long-spray');
fs.mkdirSync(outDir, { recursive: true });
const browser = await puppeteer.launch({
    executablePath: process.env.CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await page.setUserAgent('Mozilla/5.0 (Linux; Android 10; SM-M025F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36');
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

try {
    await page.goto(`http://127.0.0.1:${port}/?debug&sprayLifetime=1`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => !!window.__game, { timeout: 120000 });
    await page.evaluate(() => window.__game.start());
    await page.waitForFunction(() => window.__game.sim.mode === 'play' && !!window.__gpuSplash && !!window.__gl, { timeout: 180000, polling: 250 });
    const setup = await page.evaluate(async () => {
        const { FALLS, FALL_LANDING, POOL } = await import('/src/seaWorld.ts');
        const { splBurst, SK } = await import('/src/water/splash.ts');
        const sim = window.__game.sim, gs = window.__gpuSplash;
        window.__skipWaterfallSpray = true;
        const ux = -FALLS.dx, uz = -FALLS.dz;
        const bx = POOL.cx + ux * FALL_LANDING, bz = POOL.cz + uz * FALL_LANDING;
        const cx = bx + FALLS.dx * 22, cz = bz + FALLS.dz * 22, cy = POOL.y + 9;
        sim.pos = [0, 2, 0]; sim.vel = [0, 0, 0]; sim.swim = false; sim.dive = false; sim.web = false;
        window.__camOv = [cx, cy, cz, FALLS.x, (FALLS.top + POOL.y) * 0.5, FALLS.z];
        const t0 = sim.t;
        const beforePasses = gs.debugPasses;
        splBurst(SK.SPRAY, bx, POOL.y, bz, 8000, 1.05, 1, FALLS.dx, FALLS.dz, POOL.y);
        gs.update(1 / 30, t0, 480);
        return { t0, beforePasses, deadline: gs.liveUntil, deadlineDelta: gs.liveUntil - t0, pointsVisible: gs.points.visible, ok: gs.ok, waterfall: { x: FALLS.x, z: FALLS.z, top: FALLS.top }, pool: { x: POOL.cx, y: POOL.y, z: POOL.cz }, burst: { kind: 'SPRAY', particles: 8000 } };
    });
    if (!setup.ok || !setup.pointsVisible || Math.abs(setup.deadlineDelta - 4.6) > 1e-6) throw new Error(`Waterfall spray did not establish its 4.6-second active window: ${JSON.stringify(setup)}`);
    const advanceGpu = async (steps, finalT) => page.evaluate(({ steps, finalT }) => {
        const gs = window.__gpuSplash;
        for (let i = 0; i < steps; i++) gs.update(1 / 30, finalT - (steps - i - 1) / 30, 480);
        return { visible: gs.points.visible, liveUntil: gs.liveUntil, passCount: gs.debugPasses, simT: window.__game.sim.t };
    }, { steps, finalT });

    const at28 = await advanceGpu(84, setup.t0 + 2.8333333333);
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({ path: path.join(outDir, 'waterfall-spray-2.8s.png') });
    const at42 = await advanceGpu(42, setup.t0 + 4.2333333333);
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({ path: path.join(outDir, 'waterfall-spray-4.2s.png') });
    const afterExpiry = await page.evaluate((t) => {
        const gs = window.__gpuSplash;
        const beforePasses = gs.debugPasses;
        window.__game.sim.t = t;
        gs.update(1 / 30, t, 480);
        return { visible: gs.points.visible, passCount: gs.debugPasses, beforePasses, expectedDeadline: gs.liveUntil, testT: t };
    }, setup.t0 + 4.8);
    await new Promise((r) => setTimeout(r, 500));
    const afterIdleWait = await page.evaluate(() => ({ passCount: window.__gpuSplash.debugPasses, visible: window.__gpuSplash.points.visible }));
    await page.screenshot({ path: path.join(outDir, 'waterfall-spray-expired.png') });
    const report = {
        environment: 'Sandbox Chromium with SwiftShader; deterministic GPU splash lifecycle and visual captures, not device performance evidence.',
        test: 'Single waterfall SK.SPRAY burst, natural emitter suppressed in debug mode; GPU simulation advanced at 30 steps per simulated second.',
        setup,
        at2_8s: at28,
        at4_2s: at42,
        afterExpiry,
        after500msIdle: afterIdleWait,
        lateTailPassesContinued: at42.passCount > at28.passCount,
        inactivePassesStayedFlat: afterIdleWait.passCount === afterExpiry.passCount,
        pageErrors: errors,
        files: ['waterfall-spray-2.8s.png', 'waterfall-spray-4.2s.png', 'waterfall-spray-expired.png'],
    };
    if (!at28.visible || !at42.visible || !(at42.liveUntil > setup.t0 + 4.2) || !report.lateTailPassesContinued) throw new Error(`Long spray stopped before its late lifetime: ${JSON.stringify(report)}`);
    if (afterExpiry.visible || afterExpiry.passCount !== afterExpiry.beforePasses || !report.inactivePassesStayedFlat) throw new Error(`Inactive splash work did not stop after the last possible spray particle: ${JSON.stringify(report)}`);
    if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
    fs.writeFileSync(path.join(outDir, 'waterfall-spray-metrics.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
} finally {
    await browser.close();
}
