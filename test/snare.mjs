import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

await mkdir('art/shadow-snare', { recursive: true });
const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const cases = [
    ['desktop', 1365, 768, false],
    ['mobile-landscape', 844, 390, true],
];
try {
    for (const [name, width, height, mobile] of cases) {
        const page = await browser.newPage();
        await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
        await page.goto('http://127.0.0.1:4173/', { waitUntil: 'load' });
        await new Promise((r) => setTimeout(r, 1800));
        await page.evaluate(() => window.__game.start());
        await new Promise((r) => setTimeout(r, 350));
        await page.evaluate(() => {
            window.__pedCfg = { n: 0, a: 0 };
            const game = window.__game, s = game.sim;
            s.pos = [20, 1, 20]; s.vel = [0, 0, 0]; s.yaw = 0; s.ang = 0; s.pitch = 0.28;
            s.ground = true; s.web = false; s.wall = null; s.swim = false; s.landHard = 0;
            s.atkT = 0; s.shotT = 0; s.dodgeT = 0; s.snareCd = 0; s.snareT = 0; s.snareList = [];
            s.mv = null; s.combo = 0; s.comboT = 0; s.chain = 2; s.chainT = 10;
            const distances = [4, 5.5, 7, 8.5, 10, 11.5];
            const angles = [-0.4, -0.24, -0.08, 0.08, 0.24, 0.4];
            s.enemies.forEach((e, i) => {
                e.x = 80 + i; e.y = 1; e.z = 20; e.hp = 10; e.down = 0; e.atk = 0; e.hit = 0;
                e.kb = [0, 0]; e.roof = undefined; e.air = false; e.ly = 0;
            });
            for (let i = 0; i < distances.length; i++) {
                const e = s.enemies[i];
                e.x = 20 + Math.sin(angles[i]) * distances[i];
                e.z = 20 + Math.cos(angles[i]) * distances[i];
            }
            window.__snareInitial = s.enemies.slice(0, 6).map((e) => Math.hypot(e.x - s.pos[0], e.z - s.pos[2]));
            game.input.specialQ = true;
        });

        await page.waitForFunction(() => window.__game?.sim?.snareT > 1.45, { timeout: 5000 });
        const started = await page.evaluate(() => {
            const s = window.__game.sim;
            return { t: s.snareT, cooldown: s.snareCd, count: s.snareList.length, indices: s.snareList.map((e) => s.enemies.indexOf(e)), chain: s.chain };
        });
        assert.equal(started.count, 5, `${name}: Snare should bind five eligible targets`);
        assert.equal(started.chain, 2, `${name}: normal melee chain index should be untouched at activation`);
        assert.ok(started.cooldown > 8.5 && started.cooldown <= 9, `${name}: Snare cooldown should remain nine seconds`);

        await page.waitForFunction(() => window.__game?.sim && window.__game.sim.snareT < 1.5 && window.__game.sim.snareT > 0.95, { timeout: 7000 });
        await page.screenshot({ path: `art/shadow-snare/after-${name}.png` });
        await page.waitForFunction(() => window.__game?.sim && window.__game.sim.snareT < 0.9 && window.__game.sim.snareT > 0.3, { timeout: 7000 });
        const gathered = await page.evaluate(() => {
            const s = window.__game.sim, indices = s.snareList.map((e) => s.enemies.indexOf(e));
            const before = indices.map((i) => window.__snareInitial[i]);
            const now = s.snareList.map((e) => Math.hypot(e.x - s.pos[0], e.z - s.pos[2]));
            return { t: s.snareT, meanBefore: before.reduce((a, b) => a + b, 0) / before.length, meanNow: now.reduce((a, b) => a + b, 0) / now.length };
        });
        assert.ok(gathered.meanNow < gathered.meanBefore - 1.5, `${name}: gathered enemies should move into the group`);

        const holdA = await page.evaluate(() => {
            const s = window.__game.sim;
            return { t: s.snareT, positions: s.snareList.map((e) => [e.x, e.y, e.z]), maxDistance: Math.max(...s.snareList.map((e) => Math.hypot(e.x - s.pos[0], e.z - s.pos[2]))), chain: s.chain };
        });
        await new Promise((r) => setTimeout(r, 120));
        const holdB = await page.evaluate(() => window.__game.sim.snareList.map((e) => [e.x, e.y, e.z]));
        const holdDrift = Math.max(...holdA.positions.map((p, i) => Math.hypot(p[0] - holdB[i][0], p[1] - holdB[i][1], p[2] - holdB[i][2])));
        assert.ok(holdA.maxDistance <= 2.8, `${name}: held targets should stay grouped`);
        assert.ok(holdDrift < 0.08, `${name}: held targets should remain bound through anticipation/spin`);
        assert.equal(holdA.chain, 2, `${name}: normal melee chain index should remain unchanged during Snare`);

        await page.waitForFunction(() => {
            const s = window.__game?.sim;
            return s?.snareList?.length === 5 && s.snareList.every((e) => e.hp === 7) && s.hitStop > 0;
        }, { timeout: 5000 });
        const impact = await page.evaluate(() => {
            const s = window.__game.sim;
            return { t: s.snareT, hitStop: s.hitStop, shake: s.shake, hitPoints: s.snareList.map((e) => e.hp), knockback: s.snareList.map((e) => Math.hypot(e.kb[0], e.kb[1])), sixthHp: s.enemies[5].hp, chain: s.chain };
        });
        assert.ok(impact.t <= 0.15 && impact.t > 0, `${name}: kick impact should land after the spin`);
        assert.ok(impact.hitStop > 0 && impact.shake >= 0.25, `${name}: localized impact response should be present`);
        assert.ok(impact.knockback.every((v) => v > 14), `${name}: bound targets should receive the stronger Snare knockback`);
        assert.equal(impact.sixthHp, 10, `${name}: sixth candidate should remain outside the five-target cap`);
        assert.equal(impact.chain, 2, `${name}: special ability must not change normal melee chain cadence`);

        await page.waitForFunction(() => window.__game?.sim?.snareT === 0, { timeout: 5000 });
        const recovered = await page.evaluate(() => ({ count: window.__game.sim.snareList.length, chain: window.__game.sim.chain, cooldown: window.__game.sim.snareCd }));
        assert.equal(recovered.count, 0, `${name}: target bindings should clear after recovery`);
        assert.equal(recovered.chain, 2, `${name}: normal melee chain index should remain unchanged after recovery`);
        assert.ok(recovered.cooldown > 7, `${name}: cooldown should continue normally`);
        assert.equal(errors.length, 0, `${name}: browser errors: ${errors.join('; ')}`);
        console.log(name, JSON.stringify({ passed: true, started, gathered, hold: { t: holdA.t, maxDistance: holdA.maxDistance, drift: holdDrift }, impact, recovered, errors }));
        await page.close();
    }
} finally {
    await browser.close();
}
console.log('SNARE PASS');
