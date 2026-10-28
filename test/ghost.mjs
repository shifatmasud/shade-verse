import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';

const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
await mkdir('art/ghost', { recursive: true });
const baseUrl = `http://127.0.0.1:${process.env.PORT || 4173}/`;
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
    await page.goto(baseUrl, { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 1200));
    await page.evaluate(() => { window.__ghostTestHoldFire = true; window.__game.start(); });
    await new Promise((r) => setTimeout(r, 900));

    const start = await page.evaluate(() => {
        const game = window.__game, actor = window.__ghostSim;
        return {
            state: window.__ghostState,
            separateSim: !!actor && actor !== game.sim,
            sharedEnemies: !!actor && actor.enemies === game.sim.enemies,
            shadowInput: JSON.stringify(game.input),
        };
    });
    await page.screenshot({ path: `art/ghost/shot-after-ghost-${name}.png` });

    const fixture = await page.evaluate(() => {
        const game = window.__game, actor = window.__ghostSim;
        if (!actor) return null;
        const e = game.sim.enemies[0];
        const yaw = actor.ang;
        e.x = actor.pos[0] + Math.sin(yaw) * 1.8;
        e.z = actor.pos[2] + Math.cos(yaw) * 1.8;
        e.y = actor.pos[1] - 0.8;
        e.hp = 10; e.atk = 0; e.hit = 0; e.down = 0; e.kb = [0, 0]; e.kind = 0; e.air = false; e.roof = undefined;
        return { index: 0, hp: e.hp };
    });
    await page.evaluate(() => { window.__ghostTestHoldFire = false; });
    await page.waitForFunction(() => {
        const e = window.__game?.sim?.enemies?.[0];
        return e && (e.hp < 10 || e.down > 0);
    }, { timeout: 30000 });
    const fight = await page.evaluate((fixture) => {
        const game = window.__game, actor = window.__ghostSim;
        const e = fixture ? game.sim.enemies[fixture.index] : null;
        return {
            state: window.__ghostState,
            hp: e?.hp,
            down: e?.down,
            separateSim: !!actor && actor !== game.sim,
            sharedEnemies: !!actor && actor.enemies === game.sim.enemies,
            shadowInput: JSON.stringify(game.input),
        };
    }, fixture);

    const followStart = await page.evaluate(() => {
        const game = window.__game, actor = window.__ghostSim;
        for (const e of game.sim.enemies) { e.down = 3; e.atk = 0; }
        actor.pos = [...game.sim.pos]; actor.vel = [0, 0, 0]; actor.ground = true; actor.web = false;
        actor.wall = null; actor.swim = false; actor.glideOn = false; actor.ang = game.sim.ang; actor.yaw = game.sim.ang;
        actor.mv = null; actor.mvQ = false; actor.flip = null; actor.snareT = 0; actor.snareList = [];
        const baseline = [...actor.pos]; game.sim.pos[0] += 8;
        return baseline;
    });
    await new Promise((r) => setTimeout(r, 1800));
    const after = await page.evaluate(() => window.__ghostState);
    const followDelta = after?.position
        ? Math.hypot(after.position[0] - followStart[0], after.position[1] - followStart[1], after.position[2] - followStart[2])
        : 0;
    const attacked = fixture && (fight.hp < fixture.hp || fight.down > 0);
    const ok = start.state?.visible === true && start.separateSim && start.sharedEnemies
        && fight.separateSim && fight.sharedEnemies && attacked
        && fight.shadowInput === start.shadowInput
        && after?.visible === true && after.leaderDistance < 15 && followDelta > 1
        && errors.length === 0;
    console.log(name, JSON.stringify({ ok, start, fixture, fight, followStart, after, followDelta: +followDelta.toFixed(2), errors }));
    passed = passed && ok;
    await page.close();
}
await browser.close();
console.log(passed ? 'GHOST PASS' : 'GHOST FAIL');
process.exit(passed ? 0 : 1);
