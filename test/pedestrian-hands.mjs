import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const [url = 'http://localhost:4174/', screenshot = 'art/pedestrian-hands/shot-after-hands-mobile-landscape.png'] = process.argv.slice(2);
const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

try {
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game?.start && window.__pedInfo, { timeout: 30000 });
    await page.evaluate(() => window.__game.start());
    await page.evaluate(() => {
        const { sim, input } = window.__game;
        for (const key of Object.keys(input.keys)) input.keys[key] = false;
        input.mx = input.my = 0;
        input.swing = input.jumpHeld = false;
        sim.vel[0] = sim.vel[1] = sim.vel[2] = 0;
        sim.t = 0;
        window.__ts = 0;
        window.__pedCfg = { n: 1, a: 0, rg: 85, near: 100 };
        window.__camOv = [16.6, 2.65, 4.8, 16.6, 1.25, 0];
    });
    await page.waitForFunction(() => window.__ped?.[0] === 1 && window.__pedInfo?.[0]?.hands, { timeout: 15000 });
    await new Promise((resolve) => setTimeout(resolve, 350));

    const state = await page.evaluate(() => ({
        ped: window.__ped,
        placement: window.__pl?.[0],
        human: window.__pedInfo?.[0],
        drone: window.__pedInfo?.[5],
        mode: window.__game.sim.mode,
    }));
    assert.equal(state.mode, 'play', 'the game should remain in its normal play state');
    assert.deepEqual(state.ped, [1, 0, 0, 0, 0, 0], 'one near-field pedestrian should remain in its original type slot');
    assert.ok(state.placement && Math.abs(state.placement[1] - 16.6) < 0.05 && Math.abs(state.placement[2]) < 0.05 && state.placement[3] === 1,
        'the deterministic pedestrian placement/fade should remain unchanged');
    assert.equal(state.human.materialKey, 'shadowbot-pedestrian-hands', 'pedestrians should use the wrist-safe gait material');
    assert.deepEqual(state.human.hands.centers, [[-0.44, 0.94, 0.075], [0.44, 0.94, 0.075]], 'palm centers should be mirrored at both wrist endpoints');
    assert.equal(state.human.hands.fingersPerHand, 5, 'each glove should have four fingers and an attached thumb');
    assert.ok(state.human.hands.minY >= 0.79 && state.human.hands.minY < 0.82 && state.human.hands.maxY > 1.0,
        'the glove should overlap the wrist/forearm rather than float below it');
    assert.ok(state.human.hands.addedTriangles > 0 && state.human.hands.addedTriangles <= 450,
        'hand geometry should remain a compact addition');
    assert.ok(state.human.tris < 4300, 'pedestrian mesh triangle count should remain bounded');
    assert.equal(state.drone.hands, null, 'the hands change must not affect the quad-drone geometry');
    assert.equal(errors.length, 0, `browser errors: ${errors.join('; ')}`);

    await page.screenshot({ path: screenshot });
    console.log(JSON.stringify({ ok: true, viewport: '844x390 phone landscape', pedestrian: state.human, droneTriangles: state.drone.tris, errors, screenshot }, null, 2));
    console.log('PEDESTRIAN HANDS PASS');
} catch (error) {
    console.error(JSON.stringify({ ok: false, error: String(error), errors }, null, 2));
    process.exitCode = 1;
} finally {
    await browser.close();
}
