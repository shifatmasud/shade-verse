import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const baseUrl = process.argv[2] || process.env.BASE_URL || 'http://localhost:4173/';
const output = process.argv[3] || 'art/death-vfx/shot-after-fire-ko-mobile-landscape.png';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

try {
    await page.goto(baseUrl, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.__game && !!window.__scene, { timeout: 20000 });
    await page.evaluate(() => window.__game.start());
    await page.waitForFunction(() => window.__game.sim.mode === 'play', { timeout: 5000 });
    await new Promise(resolve => setTimeout(resolve, 900));

    const setup = await page.evaluate(() => {
        const { sim, input } = window.__game;
        const p = sim.pos.slice(), enemy = sim.enemies[0];
        enemy.x = p[0]; enemy.y = p[1]; enemy.z = p[2] + 2.2;
        enemy.hp = 3; enemy.down = 0; enemy.hit = 0; enemy.atk = 10;
        sim.enemies = [enemy];
        sim.yaw = 0; sim.ang = 0;
        window.__camOv = [enemy.x - 2, enemy.y + 1.5, enemy.z - 1.4, enemy.x, enemy.y + 1, enemy.z];
        return { pos: p, score: sim.score, kos: sim.kos, hp: sim.hp, attackQ: input.attackQ, enemyX: enemy.x, enemyY: enemy.y, enemyZ: enemy.z };
    });
    await new Promise(resolve => setTimeout(resolve, 160));

    const coreName = 'enemy-death-core';
    const pre = await page.evaluate(name => {
        const core = window.__scene.getObjectByName(name);
        return { active: core?.userData.activeEffects, total: core?.userData.triggeredTotal ?? 0 };
    }, coreName);
    assert.equal(pre.active, 0, 'no effect should appear while the target remains alive');

    await page.evaluate(() => {
        const { sim } = window.__game, enemy = sim.enemies[0];
        enemy.hp = 0;
        enemy.down = 3; // Drive the existing down-state transition; leave combat logic under its own tests.
        sim.blasts.push({ x: enemy.x, y: enemy.y + 1, z: enemy.z, t: 0, r: 5.5 }); // Preserve the existing KO flash in the visual comparison.
    });
    await page.waitForFunction(name => window.__scene.getObjectByName(name)?.userData.activeEffects === 1, { timeout: 5000 }, coreName);
    await new Promise(resolve => setTimeout(resolve, 100));

    const during = await page.evaluate(name => {
        const { sim, input } = window.__game, core = window.__scene.getObjectByName(name);
        const flames = window.__scene.getObjectByName('enemy-death-flames');
        const embers = window.__scene.getObjectByName('enemy-death-embers');
        const matrix = Array.from(core.instanceMatrix.array.slice(0, 16));
        return {
            active: core.userData.activeEffects, total: core.userData.triggeredTotal,
            flameInstances: flames?.count, emberInstances: embers?.count,
            center: [matrix[12], matrix[13], matrix[14]],
            score: sim.score, kos: sim.kos, hp: sim.hp, pos: sim.pos.slice(), attackQ: input.attackQ,
            down: sim.enemies[0]?.down,
        };
    }, coreName);
    assert.equal(during.active, 1, 'a single down transition should activate one pooled burst');
    assert.equal(during.total, 1, 'the same down state must not re-trigger every frame');
    assert.equal(during.flameInstances, 54, 'flames use the six-slot instanced pool');
    assert.equal(during.emberInstances, 72, 'embers use the six-slot instanced pool');
    assert.ok(Math.abs(during.center[0] - setup.enemyX) < 0.01 && Math.abs(during.center[2] - setup.enemyZ) < 0.01, 'fire core is anchored at the enemy in world space');
    assert.ok(during.center[1] > setup.enemyY, 'fire core is raised to the enemy body rather than drawn as a screen overlay');
    assert.equal(during.score, setup.score, 'VFX does not alter score');
    assert.equal(during.kos, setup.kos, 'VFX does not alter KO accounting');
    assert.equal(during.hp, setup.hp, 'VFX does not alter player health');
    assert.deepEqual(during.pos, setup.pos, 'VFX does not move the player');
    assert.equal(during.attackQ, setup.attackQ, 'VFX does not alter attack input');
    assert.ok(during.down > 0, 'the existing enemy-down state remains active');

    await page.screenshot({ path: output });
    await page.evaluate(() => { window.__ts = 4; });
    await page.waitForFunction(name => window.__scene.getObjectByName(name)?.userData.activeEffects === 0, { timeout: 15000 }, coreName);
    const expired = await page.evaluate(name => {
        const core = window.__scene.getObjectByName(name);
        return { active: core.userData.activeEffects, total: core.userData.triggeredTotal };
    }, coreName);
    assert.equal(expired.active, 0, 'burst expires after its short lifetime');
    assert.equal(expired.total, 1, 'expiry does not create a second burst');
    assert.deepEqual(errors, [], 'no browser or console errors');
    console.log(JSON.stringify({ result: 'PASS', viewport: '844x390 landscape', setup, during, expired, errors }));
} finally {
    await browser.close();
}
