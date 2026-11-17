import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const port = process.env.PORT || '4173';
const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome-stable',
    headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 700, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

try {
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await page.evaluate(() => window.__game.start());
    await page.waitForFunction(() => window.__game.sim.mode === 'play', { timeout: 45000 });

    await page.evaluate(() => { window.__ts = 0; window.__game.input.swing = false; window.__game.input.swingQ = false; });
    await page.keyboard.down('Shift');
    await page.waitForFunction(() => window.__game.input.swing === true, { timeout: 3000 });
    await page.keyboard.up('Shift');
    await page.waitForFunction(() => window.__game.input.swing === false, { timeout: 1500 });
    const canvasBox = await page.$eval('.stage canvas', (canvas) => { const r = canvas.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.mouse.click(canvasBox.x, canvasBox.y);
    await page.waitForFunction(() => document.pointerLockElement === document.querySelector('.stage canvas'), { timeout: 3000 });
    await page.mouse.down({ button: 'right' });
    await page.waitForFunction(() => window.__game.input.swing === true, { timeout: 3000 });
    await page.mouse.up({ button: 'right' });
    await page.waitForFunction(() => window.__game.input.swing === false, { timeout: 1500 });
    await page.evaluate(() => { window.__game.input.swingQ = false; window.__game.input.grabQ = false; });

    const fixture = await page.evaluate(() => {
        const g = window.__game;
        const choices = g.buildings.filter((b) => !b.ob && b.host === undefined && !b.sea && b.h > 24 && b.x1 - b.x0 > 18 && b.z1 - b.z0 > 18)
            .sort((a, b) => Math.hypot((a.x0 + a.x1) * 0.5 - g.sim.pos[0], (a.z0 + a.z1) * 0.5 - g.sim.pos[2]) - Math.hypot((b.x0 + b.x1) * 0.5 - g.sim.pos[0], (b.z0 + b.z1) * 0.5 - g.sim.pos[2]));
        if (!choices.length) throw new Error('No suitable rectangular wall fixture');
        const b = choices[0];
        for (const e of g.sim.enemies) { e.x = -300; e.z = -300; e.atk = 0; e.down = 1000; e.roof = undefined; }
        window.__ts = 1;
        return { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, h: b.h };
    });

    async function waitForWallRun() {
        await page.waitForFunction(() => window.__game.sim.wallRun && !!window.__game.sim.wall, { timeout: 2200 });
        await new Promise((resolve) => setTimeout(resolve, 220));
        return page.evaluate(() => {
            const s = window.__game.sim, a = window.__shadowAnimation, b = window.__rig?.b;
            return { pos: [...s.pos], vel: [...s.vel], wall: s.wall ? [...s.wall] : null, wallB: s.wallB, web: s.web, wallRun: s.wallRun, ang: s.ang, action: a?.action, clipKey: a?.clipKey, wallRunPoseWeight: a?.wallRunPoseWeight, wallRunWallFoot: a?.wallRunWallFoot, ghostWallRunPoseWeight: window.__ghostState?.animation?.wallRunPoseWeight ?? 0, spineZ: b?.spine?.rotation.z, wallThighZ: b?.[a?.wallRunWallFoot === 'right' ? 'thighR' : 'thighL']?.rotation.z };
        });
    }

    async function swingCatch(face) {
        const setup = await page.evaluate(({ face, b }) => {
            const g = window.__game, s = g.sim, I = g.input;
            for (const key of Object.keys(I.keys)) I.keys[key] = false;
            I.swing = true; I.swingQ = false; I.mx = 0; I.my = 1;
            const y = Math.min(10, b.h - 4);
            if (face === 'x') {
                s.pos = [b.x0 - 0.8, y, (b.z0 + b.z1) * 0.5]; s.vel = [24, 0, -10]; s.yaw = Math.PI / 2;
            } else {
                s.pos = [(b.x0 + b.x1) * 0.5, y, b.z0 - 0.8]; s.vel = [10, 0, 24]; s.yaw = 0;
            }
            s.ang = s.yaw; s.ground = false; s.web = true; s.webT = 0.2; s.anchor = [...s.pos]; s.rope = 1000; s.anchorReal = false;
            s.wall = null; s.wallB = -1; s.wallT = 0; s.wallRun = false; s.grappleFlight = false; s.glideOn = false; s.swim = false; s.dive = false; s.spring = 0; s.landHard = 0; s.webDepartB = undefined;
            return { start: [...s.pos], normalAxis: face, tangentStart: face === 'x' ? s.pos[2] : s.pos[0], y: s.pos[1] };
        }, { face, b: fixture });
        const entry = await waitForWallRun();
        assert.equal(entry.wallRun, true, `${face}-face swing contact should enter wall-run`);
        assert.equal(entry.web, false, 'wall contact should end the web swing cleanly');
        assert.equal(entry.action, 'wall-run', 'the animation state should identify the wall-run');
        assert.equal(entry.clipKey, 'run', 'the wall-run should use the existing running stride, not the crawl clip');
        assert.ok(entry.wallRunPoseWeight > 0.5, 'Shadow should blend into the added parkour step pose');
        assert.equal(entry.ghostWallRunPoseWeight, 0, 'Ghost must not inherit Shadow’s new wall-run pose layer');
        assert.ok(entry.wall, 'the contacted wall normal must be retained');

        const n = entry.wall, tangent = [-n[1], n[0]], direction = [Math.sin(entry.ang), Math.cos(entry.ang)];
        const along = entry.vel[0] * tangent[0] + entry.vel[2] * tangent[1];
        const facing = direction[0] * tangent[0] * Math.sign(along) + direction[1] * tangent[1] * Math.sign(along);
        assert.ok(facing > 0.94, 'body should face along its preserved wall-run direction');

        const runningStart = await page.evaluate(() => ({ pos: [...window.__game.sim.pos], t: window.__game.sim.t }));
        await page.waitForFunction((target) => window.__game.sim.t >= target, { timeout: 10000 }, runningStart.t + 0.35);
        const running = await page.evaluate(({ face, start }) => {
            const s = window.__game.sim, a = window.__shadowAnimation;
            return { start, end: [...s.pos], vel: [...s.vel], wall: s.wall ? [...s.wall] : null, wallRun: s.wallRun, action: a?.action, wallRunPoseWeight: a?.wallRunPoseWeight, wallRunWallFoot: a?.wallRunWallFoot, ghostWallRunPoseWeight: window.__ghostState?.animation?.wallRunPoseWeight ?? 0, spineZ: window.__rig?.b?.spine?.rotation.z, wallThighZ: window.__rig?.b?.[a?.wallRunWallFoot === 'right' ? 'thighR' : 'thighL']?.rotation.z, face };
        }, { face, start: runningStart.pos });
        assert.equal(running.wallRun, true, 'holding the existing swing input should sustain wall-run');
        assert.equal(running.action, 'wall-run');
        assert.ok(running.wallRunPoseWeight > 0.8, 'the purposeful wall-run pose should be fully blended while traversing');
        assert.equal(running.ghostWallRunPoseWeight, 0, 'the follower must retain its existing traversal pose without the new Shadow overlay');
        assert.ok(Math.abs(running.spineZ) > 0.03 && Math.abs(running.wallThighZ) > 0.1, `the wall-side hip/torso cant and foot-placement reach should be visible in the rig (spineZ=${running.spineZ}, thighZ=${running.wallThighZ}, side=${running.wallRunWallFoot})`);
        const tangentDistance = face === 'x' ? Math.abs(running.end[2] - running.start[2]) : Math.abs(running.end[0] - running.start[0]);
        assert.ok(tangentDistance > 2.2, `wall-run should carry momentum along the ${face}-face (moved ${tangentDistance.toFixed(2)} m)`);
        assert.ok(Math.abs(running.end[1] - running.start[1]) < 0.45, 'wall-run should not turn into a vertical crawl');
        assert.ok(running.wall, 'wall contact should persist through the run');
        if (face === 'x') assert.ok(running.end[0] <= fixture.x0 - 0.45, 'body center must stay outside the x-face, not clip into the facade');
        else assert.ok(running.end[2] <= fixture.z0 - 0.45, 'body center must stay outside the z-face, not clip into the facade');

        const crawlStart = await page.evaluate(({ face }) => {
            const g = window.__game, s = g.sim, I = g.input;
            I.swing = false; I.swingQ = false; I.mx = 0; I.my = 1; I.keys.w = true;
            s.yaw = face === 'x' ? Math.PI / 2 : 0;
            return { startY: s.pos[1], t: s.t };
        }, { face });
        await page.waitForFunction((target) => window.__game.sim.t >= target, { timeout: 10000 }, crawlStart.t + 0.2);
        const crawl = await page.evaluate(({ startY }) => {
            const s = window.__game.sim, I = window.__game.input;
            I.keys.w = false;
            return { y: s.pos[1], startY, wall: !!s.wall, wallRun: s.wallRun, action: window.__shadowAnimation?.action, clipKey: window.__shadowAnimation?.clipKey };
        }, crawlStart);
        assert.equal(crawl.wallRun, false, 'releasing RMB/Shift should immediately leave wall-run mode');
        assert.equal(crawl.wall, true, 'release should keep ordinary wall contact');
        assert.equal(crawl.action, 'wall-crawl', 'release should restore the existing crawl action');
        assert.equal(crawl.clipKey, 'wall', 'release should restore the existing climbing-wall pose');
        assert.ok(crawl.y > crawl.startY + 1.1, 'W toward the wall after release should use the unchanged upward crawl control');
        return { face, entry, running, crawl };
    }

    const results = [await swingCatch('x'), await swingCatch('z')];
    assert.deepEqual(errors, [], `browser errors: ${errors.join(' | ')}`);
    console.log(JSON.stringify({ ok: true, fixture, results, errors }, null, 2));
} catch (error) {
    console.error(error);
    if (errors.length) console.error('Browser errors:', JSON.stringify(errors));
    process.exitCode = 1;
} finally {
    await browser.close();
}
