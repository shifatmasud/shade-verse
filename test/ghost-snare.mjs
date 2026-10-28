import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const port = process.env.PORT || '4173';
const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
try {
    const page = await browser.newPage();
    await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await page.evaluate(() => window.__game.start());
    await new Promise((resolve) => setTimeout(resolve, 500));

    await page.evaluate(() => {
        const game = window.__game, s = game.sim, g = window.__ghostSim;
        if (!g) throw new Error('Ghost simulator not ready');
        s.pos = [20, 1, 20]; s.vel = [0, 0, 0]; s.yaw = 0; s.ang = 0; s.pitch = 0;
        s.ground = true; s.web = false; s.wall = null; s.swim = false; s.landHard = 0;
        s.atkT = 0; s.shotT = 0; s.dodgeT = 0; s.snareCd = 0; s.snareT = 0; s.snareList = [];
        s.enemies.forEach((e, i) => { e.x = 100 + i; e.y = 1; e.z = 100; e.hp = 10; e.down = 1000; e.atk = 0; e.hit = 0; e.kb = [0, 0]; e.roof = undefined; e.air = false; e.ly = 0; e.vy = 0; e.boss = false; });
        game.input.specialQ = game.input.attackQ = game.input.meleeQ = game.input.shotQ = false;
        g.pos = [17.4, 1, 18.55]; g.vel = [0, 0, 0]; g.ground = true; g.web = false; g.wall = null; g.swim = false; g.glideOn = false;
        g.snareT = 0; g.snareList = []; g.snareCd = 0; g.land = 0; g.ang = 0; g.yaw = 0; g.enemies = s.enemies;
    });
    await page.waitForFunction(() => window.__ghostState?.transport === 'idle', { timeout: 5000 });

    await page.evaluate(() => {
        const s = window.__game.sim, g = window.__ghostSim;
        const distances = [4, 5.5, 7, 8.5, 10, 4.6], angles = [-0.4, -0.24, -0.08, 0.08, 0.24, 0.4];
        for (let i = 0; i < distances.length; i++) {
            const e = s.enemies[i];
            e.x = g.pos[0] + Math.sin(angles[i]) * distances[i];
            e.z = g.pos[2] + Math.cos(angles[i]) * distances[i];
            e.y = i === 5 ? g.pos[1] + 16 : g.pos[1];
            e.hp = 10; e.down = 0; e.atk = 0; e.hit = 0; e.kb = [0, 0]; e.ly = 0; e.vy = 0; e.roof = undefined; e.air = false;
        }
        window.__ghostForceSpecial = true;
    });

    await page.waitForFunction(() => window.__ghostSim?.snareT > 1.45, { timeout: 5000 });
    const started = await page.evaluate(() => {
        const g = window.__ghostSim, s = window.__game.sim;
        return { t: g.snareT, cooldown: g.snareCd, indices: g.snareList.map((e) => s.enemies.indexOf(e)), count: g.snareList.length, phase: window.__ghostState.snarePhase, lines: window.__ghostState.snareWebLines, snareColor: window.__ghostState.snareColor, strandColor: window.__ghostState.strandColor, shockColor: window.__ghostState.shockColor, playerSnareT: s.snareT, playerCooldown: s.snareCd, playerSpecialQ: window.__game.input.specialQ, shadow: window.__shadowAnimation, shadowFx: window.__shadowSnareFx };
    });
    assert.equal(started.count, 5, 'Ghost should bind five eligible targets using its own simulator');
    assert.ok(!started.indices.includes(5), 'Ghost should leave the vertically ineligible near decoy unbound');
    assert.equal(started.phase, 'gather', 'Ghost should begin in the gather phase');
    assert.equal(started.lines, 10, 'Ghost should connect both hands to all five targets');
    assert.equal(started.snareColor, '#ff1a96', 'Ghost’s own special strands should be hot pink');
    assert.equal(started.strandColor, 'ff1a96', 'Ghost’s web strands should match its hot-pink lenses');
    assert.equal(started.shockColor, 'ff1a96', 'Ghost’s pulse and shock material should match its hot-pink lenses');
    assert.equal(started.playerSnareT, 0, 'Ghost activation must not trigger Shadow Snare');
    assert.notEqual(started.shadow.action, 'shadow-snare', 'Ghost activation must not drive Shadow’s attack pose');
    assert.equal(started.shadowFx.webLines, 0, 'Ghost activation must not draw Shadow’s attack webs');
    assert.equal(started.shadowFx.pulseSegments, 0, 'Ghost activation must not show a pulse on Shadow');
    assert.equal(started.shadowFx.ringSegments, 0, 'Ghost activation must not show discharge rings on Shadow');
    assert.equal(started.playerSpecialQ, false, 'Ghost activation must not mutate Shadow input');
    assert.ok(started.cooldown > 8.5 && started.cooldown <= 9, 'Ghost should start the nine-second cooldown');
    assert.equal(started.playerCooldown, 0, 'Ghost activation must not start Shadow’s cooldown');

    await page.waitForFunction(() => window.__ghostState?.snarePhase === 'shockwave' && window.__ghostState.pulseSegments === 20, { timeout: 7000 });
    const pulse = await page.evaluate(() => ({ progress: window.__ghostState.pulseProgress, t: window.__ghostSim.snareT, snareColor: window.__ghostState.snareColor, shockColor: window.__ghostState.shockColor }));
    assert.ok(pulse.progress > 0 && pulse.progress < 1, 'Ghost should animate a travelling taser pulse along all bound strands');
    assert.equal(pulse.snareColor, '#ff1a96', 'Ghost’s traveling pulse should stay hot pink');
    assert.equal(pulse.shockColor, 'ff1a96', 'Ghost’s shock material should stay hot pink');
    await page.screenshot({ path: 'art/shadow-snare/ghost-shock-mobile-landscape.png' });

    await page.waitForFunction(() => {
        const g = window.__ghostSim;
        return g?.snareT > 0 && g.snareT <= 0.15 && g.snareList.length === 5 && g.snareList.every((e) => e.hp === 7);
    }, { timeout: 5000 });
    const impact = await page.evaluate(() => ({
        t: window.__ghostSim.snareT,
        ringSegments: window.__ghostState.ringSegments,
        snareColor: window.__ghostState.snareColor,
        shockColor: window.__ghostState.shockColor,
        boundHp: window.__ghostSim.snareList.map((e) => e.hp),
        decoyHp: window.__game.sim.enemies[5].hp,
        playerSnareT: window.__game.sim.snareT,
    }));
    assert.equal(impact.ringSegments, 80, 'Ghost should show a discharge ring at each of five bound targets');
    assert.equal(impact.snareColor, '#ff1a96', 'Ghost’s discharge rings should stay hot pink');
    assert.equal(impact.shockColor, 'ff1a96', 'Ghost’s discharge effect material should stay hot pink');
    assert.ok(impact.boundHp.every((hp) => hp === 7), 'The taser discharge should hit each bound target exactly once');
    assert.equal(impact.decoyHp, 10, 'The nearby unbound decoy should remain untouched');
    assert.equal(impact.playerSnareT, 0, 'Ghost discharge must not run Shadow Snare');

    await page.waitForFunction(() => window.__ghostSim?.snareT === 0, { timeout: 5000 });
    assert.equal((await page.evaluate(() => window.__ghostSim.snareList.length)), 0, 'Ghost should release its web bindings after recovery');
    assert.equal(errors.length, 0, `Browser errors: ${errors.join('; ')}`);
    console.log('GHOST SNARE PASS', JSON.stringify({ started, pulse, impact, errors }));
    await page.close();
} finally {
    await browser.close();
}
