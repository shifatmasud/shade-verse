import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';

const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
await mkdir('art/boss', { recursive: true });
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
    await new Promise((r) => setTimeout(r, 900));
    await page.evaluate(() => { window.__game.input.specialQ = false; window.__game.start(); });
    await new Promise((r) => setTimeout(r, 4300));

    const start = await page.evaluate(() => {
        const { sim, input } = window.__game;
        const bosses = sim.enemies.filter((e) => e.boss);
        const boss = bosses[0];
        if (boss) {
            sim.enemies.forEach((e, i) => { if (e !== boss) { e.down = 10000; e.atk = 0; e.x = 10000 + i * 30; e.z = 10000; } });
            // Debug-only rooftop/camera framing fixture for matched before/after captures.
            sim.pitch = -0.15; window.__camDist = 16;
            boss.x = sim.pos[0] + 3; boss.y = sim.pos[1]; boss.z = sim.pos[2] + 8; boss.atk = 0;
            boss.ang = Math.atan2(sim.pos[0] - boss.x, sim.pos[2] - boss.z);
        }
        return {
            bosses: bosses.length, boss: boss ? { hp: boss.hp, kind: boss.kind, y: boss.y } : null,
            standardEnemies: sim.enemies.filter((e) => !e.boss).length, inputKeys: Object.keys(input).sort(),
        };
    });
    await new Promise((r) => setTimeout(r, 700));
    const visual = await page.evaluate(() => {
        const root = window.__giantBossRoot;
        let redEyeVertices = 0;
        root?.traverse((o) => {
            const colors = o.isMesh && o.geometry?.attributes?.color;
            if (colors) for (let i = 0; i < colors.count; i++) {
                const r = colors.getX(i), g = colors.getY(i), b = colors.getZ(i);
                if (r > 0.9 && g < 0.15 && b < 0.35) redEyeVertices++;
            }
        });
        return { visible: !!root?.visible, scale: root?.scale.x, tagged: root?.userData?.giantBoss, redEyeVertices };
    });
    await page.screenshot({ path: `art/boss/shot-after-boss-${name}.png` });

    let windupStarted = true;
    let meleeCheck = { started: true, targetBoss: false, hpBefore: 24, hpAfter: 24 };
    let attacked = { hp: 80, bossHp: 24, windOrRecovery: -2 };
    let snareStart = { active: true, targetsBoss: true };
    let snared = { bossHp: 21, inputKeysUnchanged: true };
    if (name === 'desktop') {
        await page.evaluate(() => {
            const { sim, input } = window.__game, boss = sim.enemies.find((e) => e.boss);
            if (!boss) return;
            sim.enemies.forEach((e, i) => { if (e !== boss) { e.down = 10000; e.atk = 0; e.x = 10000 + i * 30; e.z = 10000; } });
            boss.x = sim.pos[0] + 3; boss.y = sim.pos[1] - 7.5; boss.z = sim.pos[2];
            boss.hp = 24; boss.hit = 0; boss.atk = 0; boss.down = 0; boss.kb = [0, 0];
            sim.ground = true; sim.swim = false; sim.wall = null; sim.web = false; sim.mv = null; sim.mvQ = false; sim.atkT = 0; sim.windT = sim.t + 100;
            sim.ang = Math.atan2(boss.x - sim.pos[0], boss.z - sim.pos[2]); input.attackQ = true; input.meleeQ = true;
        });
        await page.waitForFunction(() => !!window.__game.sim.mv, { timeout: 5000 });
        meleeCheck = await page.evaluate(() => {
            const { sim } = window.__game, boss = sim.enemies.find((e) => e.boss), move = sim.mv;
            return { started: !!move, targetBoss: move?.e === boss, hpBefore: boss?.hp, hpAfter: boss?.hp };
        });
        await page.evaluate(() => { const move = window.__game.sim.mv; if (move) { move.t = 1; move.hit = false; } });
        await new Promise((r) => setTimeout(r, 100));
        meleeCheck = await page.evaluate((before) => {
            const { sim, input } = window.__game, boss = sim.enemies.find((e) => e.boss);
            input.attackQ = false; input.meleeQ = false;
            const result = { ...before, hpAfter: boss?.hp };
            sim.mv = null; sim.mvQ = false; sim.atkT = 0;
            if (boss) { boss.x = sim.pos[0] + 4; boss.y = sim.pos[1]; boss.z = sim.pos[2]; boss.atk = 0; boss.hp = 24; }
            sim.ang = Math.atan2(sim.pos[0] + 4 - sim.pos[0], sim.pos[2] - sim.pos[2]); sim.windT = sim.t - 1;
            return result;
        }, meleeCheck);
        await page.evaluate(() => {
            const { sim } = window.__game;
            const boss = sim.enemies.find((e) => e.boss);
            if (!boss) return;
            sim.enemies.forEach((e, i) => { if (e !== boss) { e.down = 10000; e.atk = 0; e.x = 10000 + i * 30; e.z = 10000; } });
            boss.x = sim.pos[0] + 4; boss.y = sim.pos[1]; boss.z = sim.pos[2];
            boss.ang = Math.atan2(sim.pos[0] - boss.x, sim.pos[2] - boss.z);
            boss.hp = 24; boss.atk = 0; boss.hit = 0; boss.down = 0; boss.kb = [0, 0]; sim.hp = 100; sim.windT = sim.t - 1;
        });
        await new Promise((r) => setTimeout(r, 500));
        windupStarted = await page.evaluate(() => (window.__game.sim.enemies.find((e) => e.boss)?.atk || 0) > 0);
        await page.evaluate(() => { const boss = window.__game.sim.enemies.find((e) => e.boss); if (boss && boss.atk > 0) boss.atk = 0.02; });
        await new Promise((r) => setTimeout(r, 650));
        attacked = await page.evaluate(() => {
            const { sim } = window.__game, boss = sim.enemies.find((e) => e.boss);
            return { hp: sim.hp, bossHp: boss?.hp, windOrRecovery: boss?.atk };
        });
    } else {
        await page.evaluate(() => {
            const { sim, input } = window.__game, boss = sim.enemies.find((e) => e.boss);
            sim.enemies.forEach((e, i) => { if (e !== boss) { e.down = 10000; e.atk = 0; e.x = 10000 + i * 30; e.z = 10000; } });
            if (boss) {
                boss.x = sim.pos[0] + 4; boss.y = sim.pos[1]; boss.z = sim.pos[2];
                boss.atk = 0; boss.hit = 0; boss.hp = 24; boss.down = 0; boss.kb = [0, 0];
            }
            sim.hp = 100; input.specialQ = true;
        });
        await new Promise((r) => setTimeout(r, 180));
        snareStart = await page.evaluate(() => {
            const { sim } = window.__game, boss = sim.enemies.find((e) => e.boss);
            return { active: (sim.snareT || 0) > 0, targetsBoss: !!boss && (sim.snareList || []).includes(boss) };
        });
        if (snareStart.active && snareStart.targetsBoss) await page.evaluate(() => { window.__game.sim.snareT = 0.17; });
        await new Promise((r) => setTimeout(r, 650));
        snared = await page.evaluate((beforeKeys) => {
            const { sim, input } = window.__game, boss = sim.enemies.find((e) => e.boss);
            return { bossHp: boss?.hp, inputKeysUnchanged: JSON.stringify(Object.keys(input).sort()) === JSON.stringify(beforeKeys) };
        }, start.inputKeys);
    }

    const attackOK = name !== 'desktop' || (meleeCheck.started && !meleeCheck.targetBoss && meleeCheck.hpBefore === 24 && meleeCheck.hpAfter === 24 && windupStarted && attacked.hp <= 80 && attacked.hp >= 0);
    const snareOK = name !== 'mobile-landscape' || (snareStart.active && snareStart.targetsBoss && snared.bossHp <= 21 && snared.inputKeysUnchanged);
    const ok = start.bosses === 1 && start.standardEnemies === 26 && start.boss?.hp === 24
        && visual.visible && Math.abs(visual.scale - 7.5) < 0.001 && visual.tagged && visual.redEyeVertices >= 100
        && attackOK && snareOK && errors.length === 0;
    console.log(name, JSON.stringify({ ok, start, visual, meleeCheck, windupStarted, attacked, snareStart, snared, errors }));
    passed = passed && ok;
    await page.close();
}

await browser.close();
console.log(passed ? 'BOSS PASS' : 'BOSS FAIL');
process.exit(passed ? 0 : 1);
