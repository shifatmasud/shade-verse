import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const port = process.env.PORT || '4173';
const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome-stable',
    headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
const testWidth = Number(process.env.WALLRUN_TEST_WIDTH || 1000);
const testHeight = Number(process.env.WALLRUN_TEST_HEIGHT || 700);
await page.setViewport({ width: testWidth, height: testHeight, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

async function captureWallRunEvidence() {
    const directory = process.env.CAPTURE_DIR;
    if (!directory) return null;
    mkdirSync(directory, { recursive: true });
    const screenshot = join(directory, 'shadow-ghost-wall-run.png');
    const video = join(directory, 'shadow-ghost-wall-run.mp4');
    await page.screenshot({ path: screenshot });
    const client = await page.createCDPSession(), frames = [];
    client.on('Page.screencastFrame', ({ data, sessionId }) => {
        frames.push(Buffer.from(data, 'base64'));
        void client.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    });
    await client.send('Page.startScreencast', { format: 'jpeg', quality: 75, everyNthFrame: 2 });
    await new Promise((resolve) => setTimeout(resolve, 1800));
    await client.send('Page.stopScreencast');
    await client.detach();
    assert.ok(frames.length > 0, 'Chromium screencast should provide frames');
    execFileSync('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', '24', '-vcodec', 'mjpeg', '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', video], { input: Buffer.concat(frames), stdio: ['pipe', 'ignore', 'inherit'] });
    return { screenshot, video, frames: frames.length };
}

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
            .sort((a, b) => Math.min(b.x1 - b.x0, b.z1 - b.z0) - Math.min(a.x1 - a.x0, a.z1 - a.z0) || Math.hypot((a.x0 + a.x1) * 0.5 - g.sim.pos[0], (a.z0 + a.z1) * 0.5 - g.sim.pos[2]) - Math.hypot((b.x0 + b.x1) * 0.5 - g.sim.pos[0], (b.z0 + b.z1) * 0.5 - g.sim.pos[2]));
        if (!choices.length) throw new Error('No suitable rectangular wall fixture');
        const b = choices[0];
        for (const e of g.sim.enemies) { e.x = -300; e.z = -300; e.atk = 0; e.down = 1000; e.roof = undefined; }
        window.__ghostDisableCombat = true;
        const clearCombat = (o) => { if (!o) return; o.mv = null; o.slam = null; o.atkT = 0; o.shotT = 0; o.snareT = 0; o.flip = null; };
        clearCombat(g.sim); clearCombat(window.__ghostSim);
        g.sim.slowT = 0; g.sim.tsNow = 1;
        window.__ts = 1;
        return { index: g.buildings.indexOf(b), x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, h: b.h };
    });

    async function waitForWallRun() {
        await page.waitForFunction(() => window.__game.sim.wallRun && !!window.__game.sim.wall, { timeout: 2200 });
        await page.waitForFunction(() => window.__shadowAnimation?.wallRunPoseWeight > 0.1, { timeout: 3000 });
        return page.evaluate(() => {
            const s = window.__game.sim, a = window.__shadowAnimation, b = window.__rig?.b;
            return { pos: [...s.pos], vel: [...s.vel], wall: s.wall ? [...s.wall] : null, wallB: s.wallB, web: s.web, wallRun: s.wallRun, ang: s.ang, action: a?.action, clipKey: a?.clipKey, wallRunPoseWeight: a?.wallRunPoseWeight, ghostWallRunPoseWeight: window.__ghostState?.animation?.wallRunPoseWeight ?? 0, spineZ: b?.spine?.rotation.z };
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
        assert.equal(entry.web, false, 'release the swing web on wall contact, as in the reference');
        assert.equal(entry.action, 'wall-run', 'the animation state should identify the wall-run');
        assert.equal(entry.clipKey, 'run', 'the wall-run should use the existing running stride, not the crawl clip');
        assert.ok(entry.wallRunPoseWeight > 0.1, 'Shadow should begin blending into the GIF-inspired wall-run pose');
        assert.ok(entry.wall, 'the contacted wall normal must be retained');
        await page.evaluate(() => {
            const g = window.__game, s = g.sim, n = s.wall, tx = -n[1], tz = n[0];
            const along = Math.sign(s.vel[0] * tx + s.vel[2] * tz || 1) * 2.5;
            g.input.mx = 0; g.input.my = 0;
            s.vel[0] = tx * along - n[0] * 1.5; s.vel[2] = tz * along - n[1] * 1.5;
            window.__ts = 2;
        });

        try { await page.waitForFunction((normal) => {
            const d = window.__ghostState, g = window.__ghostSim, n = d?.leaderWallNormal;
            return !!d?.leaderWall && d.transport === 'idle' && !!g?.wallRun && !!g?.wall && !g?.web && d.webHandMask === 0 && !!n && Math.abs(n[0] - normal[0]) < 0.1 && Math.abs(n[1] - normal[1]) < 0.1;
        }, { timeout: 40000 }, entry.wall); }
        catch (error) {
            console.error('Ghost follow state:', await page.evaluate(() => ({ state: window.__ghostState, actor: window.__ghostSim && { pos: [...window.__ghostSim.pos], wall: window.__ghostSim.wall, wallRun: window.__ghostSim.wallRun }, time: window.__game.sim.t })));
            throw error;
        }
        const ghostStart = await page.evaluate(() => [...window.__ghostSim.pos]);

        const n = entry.wall, tangent = [-n[1], n[0]], direction = [Math.sin(entry.ang), Math.cos(entry.ang)];
        const along = entry.vel[0] * tangent[0] + entry.vel[2] * tangent[1];
        assert.ok(Math.abs(along) > 3, `wall contact should preserve incoming tangent speed (got ${along.toFixed(2)} m/s)`);
        const facing = direction[0] * tangent[0] * Math.sign(along) + direction[1] * tangent[1] * Math.sign(along);
        assert.ok(facing > 0.94, 'body should face along its preserved wall-run direction');

        const runningStart = await page.evaluate(({ wall, vel }) => {
            const s = window.__game.sim, n = s.wall || wall, tx = -n[1], tz = n[0], along = vel[0] * tx + vel[2] * tz;
            const testSpeed = Math.sign(along || 1) * 7;
            s.vel[0] = tx * testSpeed - n[0] * 1.5; s.vel[2] = tz * testSpeed - n[1] * 1.5;
            window.__ts = 1;
            return { pos: [...s.pos], vel: [...s.vel], wall: s.wall ? [...s.wall] : null, wallB: s.wallB, t: s.t };
        }, { wall: entry.wall, vel: entry.vel });
        await page.waitForTimeout(900);
        const running = await page.evaluate(({ face, start }) => {
            const s = window.__game.sim, a = window.__shadowAnimation;
            return { start, end: [...s.pos], vel: [...s.vel], t: s.t, wall: s.wall ? [...s.wall] : null, wallRun: s.wallRun, action: a?.action, clipKey: a?.clipKey, wallRunPoseWeight: a?.wallRunPoseWeight, ghostWallRunPoseWeight: window.__ghostState?.animation?.wallRunPoseWeight ?? 0, runFrame: a?.frame, spineZ: window.__rig?.b?.spine?.rotation.z, face };
        }, { face, start: runningStart.pos });
        assert.equal(running.wallRun, true, 'holding the existing swing input should sustain wall-run');
        assert.equal(running.action, 'wall-run');
        assert.ok(running.wallRunPoseWeight > 0.8, 'the purposeful wall-run pose should be fully blended while traversing');
        assert.ok(running.ghostWallRunPoseWeight > 0.8, 'Ghost should fully blend into the wall-run pose while following');
        assert.equal(running.clipKey, 'run', 'the alternating foot plants should come from the existing running cycle');
        const tether = await page.evaluate(() => ({ web: window.__game.sim.web, anchor: [...window.__game.sim.anchor] }));
        assert.equal(tether.web, false, 'the wall-run has a wall hand, not a swinging tether hand');
        const ghostPose = await page.evaluate(() => {
            const a = window.__ghostState?.animation, b = window.__ghostRig?.b;
            const g = window.__ghostSim;
            const d = window.__ghostState;
            return { action: a?.action, clipKey: a?.clipKey, weight: a?.wallRunPoseWeight, wallRun: g?.wallRun, wall: !!g?.wall, web: g?.web, webHandMask: d?.webHandMask, leaderWeb: window.__game.sim.web, leaderSwings: window.__game.sim.swings, leaderWallRun: window.__game.sim.wallRun, source: a?.source, transport: d?.transport, morphReason: d?.morphReason, morphT: d?.morphT, followerWallRun: d?.followerWallRun, followerWall: d?.followerWall, followerSwingHeld: d?.followerSwingHeld, independentFight: d?.independentFight, velocity: g?.vel ? [...g.vel] : null };
        });
        assert.equal(ghostPose.action, 'wall-run', 'Ghost should mirror the active wall-run animation state');
        assert.equal(ghostPose.clipKey, 'run', 'Ghost should use the running stride, not the crawl clip');
        assert.equal(ghostPose.wallRun, true, `Ghost should use the horizontal wall-run locomotion while following: ${JSON.stringify(ghostPose)}`);
        assert.equal(ghostPose.wall, true, 'Ghost should retain wall contact while running');
        assert.equal(ghostPose.web, false, 'Ghost should run on the facade without an attached web');
        assert.equal(ghostPose.webHandMask, 0, 'Ghost should not keep a web tether while running against the wall');
        assert.ok(ghostPose.weight > 0.8, `Ghost should fully blend into the shared wall-run animation (weight=${ghostPose.weight})`);
        const ghostEnd = await page.evaluate(() => [...window.__ghostSim.pos]);
        const ghostTangentDistance = face === 'x' ? Math.abs(ghostEnd[2] - ghostStart[2]) : Math.abs(ghostEnd[0] - ghostStart[0]);
        const ghostTangentVelocity = ghostPose.velocity[0] * tangent[0] + ghostPose.velocity[2] * tangent[1];
        assert.ok(ghostTangentDistance > 0.2 && Math.abs(ghostTangentVelocity) > 1.5, `Ghost should follow along the ${face}-face during the wall-run (moved ${ghostTangentDistance.toFixed(2)} m at ${ghostTangentVelocity.toFixed(2)} m/s; start=${ghostStart.map((x) => x.toFixed(2)).join(',')}; end=${ghostEnd.map((x) => x.toFixed(2)).join(',')}; transport=${ghostPose.transport}; reason=${ghostPose.morphReason})`);
        const tangentDistance = face === 'x' ? Math.abs(running.end[2] - running.start[2]) : Math.abs(running.end[0] - running.start[0]);
        const tangentVelocity = running.vel[0] * tangent[0] + running.vel[2] * tangent[1];
        assert.ok(tangentDistance > 0.2 && Math.abs(tangentVelocity) > 4.5 && tangentVelocity * along > 0, `wall-run should carry forward momentum along the ${face}-face (moved ${tangentDistance.toFixed(2)} m at ${tangentVelocity.toFixed(2)} m/s; along0=${along.toFixed(2)}; tangent=${tangent.join(',')}; startWall=${JSON.stringify(runningStart.wall)}; endWall=${JSON.stringify(running.wall)}; start=${running.start.map((x) => x.toFixed(2)).join(',')}; end=${running.end.map((x) => x.toFixed(2)).join(',')})`);
        assert.ok(Math.abs(running.end[1] - running.start[1]) < 0.45, 'wall-run should not turn into a vertical crawl');
        assert.ok(running.wall, 'wall contact should persist through the run');
        if (face === 'x') assert.ok(running.end[0] <= fixture.x0 - 0.45, 'body center must stay outside the x-face, not clip into the facade');
        else assert.ok(running.end[2] <= fixture.z0 - 0.45, 'body center must stay outside the z-face, not clip into the facade');
        const evidence = face === 'x' ? await captureWallRunEvidence() : null;

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
        const releasedWeb = await page.evaluate(() => window.__game.sim.web);
        assert.equal(releasedWeb, false, 'releasing the hold should detach the web before normal crawling');
        const ghostCrawl = await page.evaluate(() => {
            const g = window.__ghostSim, a = window.__ghostState?.animation;
            return { wallRun: g?.wallRun, wall: !!g?.wall, web: g?.web, webHandMask: window.__ghostState?.webHandMask, action: a?.action, clipKey: a?.clipKey };
        });
        assert.equal(ghostCrawl.wallRun, false, 'Ghost should leave wall-run when Shadow releases the hold');
        assert.equal(ghostCrawl.wall, true, 'Ghost should keep her existing wall-follow contact');
        assert.equal(ghostCrawl.web, false, 'Ghost should remain on the follower tether path when the leader releases the hold');
        assert.equal(ghostCrawl.webHandMask, 0, 'Ghost should drop the mirrored web strand when the hold is released');
        assert.equal(ghostCrawl.action, 'wall-crawl', 'Ghost should return to the ordinary crawl animation');
        assert.equal(ghostCrawl.clipKey, 'wall', 'Ghost should return to the existing wall-crawl clip');
        const rehookStart = await page.evaluate(({ face, fixture }) => {
            const g = window.__game, s = g.sim, b = g.buildings[fixture.index], n = face === 'x' ? [-1, 0] : [0, -1], tx = -n[1], tz = n[0], positive = true;
            const oldAnchor = [...s.anchor], oldSwings = s.swings;
            g.input.swing = true; g.input.swingQ = false; g.input.keys.w = false; g.input.mx = 0; g.input.my = 0;
            s.pos[1] = Math.min(10, b.h - 4); s.wall = n; s.wallB = fixture.index; s.wallRun = true; s.web = false; s.ground = false; s.swim = false; s.glideOn = false; s.grappleFlight = false;
            s.vel[0] = tx * 8 - n[0] * 1.5; s.vel[2] = tz * 8 - n[1] * 1.5;
            if (face === 'x') s.pos[2] = positive ? b.z1 + 6 : b.z0 - 6; else s.pos[0] = positive ? b.x1 + 6 : b.x0 - 6;
            s.t += 0.01; window.__ts = 1;
            return { t: s.t, oldAnchor, oldSwings };
        }, { face, fixture });
        await page.waitForFunction((target) => window.__game.sim.t >= target && window.__game.sim.web && !window.__game.sim.wall && window.__ghostSim?.web, { timeout: 6000 }, rehookStart.t + 0.08);
        const rehook = await page.evaluate(() => ({ web: window.__game.sim.web, wall: !!window.__game.sim.wall, wallRun: window.__game.sim.wallRun, anchor: [...window.__game.sim.anchor], swings: window.__game.sim.swings, webT: window.__game.sim.webT, ghostWeb: window.__ghostSim?.web, ghostAnchor: window.__ghostSim?.anchor ? [...window.__ghostSim.anchor] : null, ghostMask: window.__ghostState?.webHandMask }));
        assert.equal(rehook.web, true, 'holding the existing control off the wall should attach a new web');
        assert.equal(rehook.wall, false, 'the new web should start after wall contact ends');
        assert.equal(rehook.wallRun, false, 'the wall-run should end before the next swing');
        assert.equal(rehook.swings, rehookStart.oldSwings + 1, 'wall exit should fire exactly one replacement web');
        assert.ok(rehook.anchor.some((v, i) => Math.abs(v - rehookStart.oldAnchor[i]) > 0.1), 'the replacement web should use a new anchor');
        assert.equal(rehook.ghostWeb, true, 'Ghost should take the same new web on wall exit');
        assert.deepEqual(rehook.ghostAnchor, rehook.anchor, 'Ghost should share the leader’s new anchor, not create a second tether');
        return { face, entry, running, ghostPose, ghostTangentDistance, tether, crawl, releasedWeb, ghostCrawl, rehook, evidence };
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
