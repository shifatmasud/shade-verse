import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const port = Number(process.env.PORT || 4174);
const url = `http://localhost:${port}/`;
const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

try {
    const page = await browser.newPage();
    await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 500)); });
    await page.goto(url, { waitUntil: 'load' });
    await new Promise((resolve) => setTimeout(resolve, 800));
    await page.evaluate(() => window.__game.start());
    await page.waitForFunction(() => window.__shadowSwimOrientation && window.__polyforkLake && window.__polyforkLakeTargets, { timeout: 30000 });
    await page.evaluate(() => {
        const { sim, input } = window.__game;
        for (const key of Object.keys(input.keys)) input.keys[key] = false;
        input.mx = 0; input.my = 0; input.swing = false; input.dodgeQ = false;
        sim.enemies.forEach((enemy) => { enemy.x = -300; enemy.z = -300; enemy.roof = undefined; });
        sim.pos = [180, -6, 110];
        sim.vel = [6, 0, 0];
        sim.yaw = 0; sim.ang = 0; sim.wall = null; sim.ground = false;
        sim.swim = false; sim.dive = false; sim.web = false; sim.glideOn = false;
        window.__camOv = [180, -7.0, 108, 180, -7.8, 100];
    });
    await page.waitForFunction(() => window.__game.sim.swim && window.__shadowSwimOrientation.wrapperPitch > 1.2, { timeout: 30000 });
    await page.waitForFunction(() => window.__polyforkLakeTargets.reflectionFrame.current > 0, { timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const probe = await page.evaluate(() => {
        const { sim } = window.__game;
        const uw = document.getElementById('uw');
        return {
            sim: { pos: [...sim.pos], vel: [...sim.vel], swim: sim.swim, dive: sim.dive, t: sim.t },
            shadow: { ...window.__shadowSwimOrientation },
            underwaterOpacity: uw.style.opacity,
            underwaterSplit: uw.dataset.split,
            reflectionFrame: window.__polyforkLakeTargets.reflectionFrame.current,
            reflectionSize: [window.__polyforkLakeTargets.reflection.width, window.__polyforkLakeTargets.reflection.height],
            refractionSize: [window.__polyforkLakeTargets.refraction.width, window.__polyforkLakeTargets.refraction.height],
        };
    });

    assert.equal(probe.sim.swim, true, 'Shadow did not enter lake swimming state');
    assert.ok(probe.sim.pos[1] > -6, 'Lake buoyancy did not lift the swimmer');
    assert.ok(probe.sim.vel[0] < 6, 'Lake drag did not reduce horizontal speed');
    assert.ok(Math.abs(probe.shadow.wrapperPitch - probe.shadow.lean) < 0.08, 'Shadow wrapper does not follow the swim pose');
    assert.ok(Math.abs(probe.shadow.bodyPitch) < 0.08, 'Skinned-body transform was not kept neutral after clip sampling');
    assert.ok(probe.shadow.clipWeight > 0.7, 'Shadow swim clip stopped animating while the body was reoriented');
    assert.equal(probe.underwaterOpacity, '1', 'Underwater view tint did not activate below the lake surface');
    assert.ok(probe.reflectionFrame > 0, 'Lake reflection did not render');
    assert.deepEqual(probe.reflectionSize, [256, 128]);
    assert.deepEqual(probe.refractionSize, [256, 128]);

    const currentGhost = readFileSync(fileURLToPath(new URL('../src/Ghost.tsx', import.meta.url)), 'utf8');
    const baselineGhost = execFileSync('git', ['show', '4696dca:src/Ghost.tsx'], { encoding: 'utf8' });
    assert.equal(currentGhost, baselineGhost, 'Ghost animation implementation changed from the starting mirror commit');

    await page.evaluate(() => { window.__ts = 0; window.__camOv = [180, -7.0, 108, 180, -7.8, 100]; });
    await new Promise((resolve) => setTimeout(resolve, 500));
    await page.screenshot({ path: 'art/environment/shot-after-lake-underwater-mobile-landscape.png' });
    assert.deepEqual(errors, [], `Browser/WebGL runtime errors: ${errors.join(' | ')}`);
    console.log(JSON.stringify({ ok: true, viewport: '844x390 phone landscape', probe, errors, screenshots: ['art/environment/shot-after-lake-underwater-mobile-landscape.png'] }, null, 2));
} finally {
    await browser.close();
}
