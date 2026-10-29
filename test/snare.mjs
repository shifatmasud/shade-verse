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
const baseUrl = `http://127.0.0.1:${process.env.PORT || 4173}/`;
function assertShadowAttack(state, phase, name) {
    assert.equal(state.shadow.action, 'shadow-snare', `${name}: Shadow should remain in the shared attack`);
    assert.equal(state.shadow.snarePhase, phase, `${name}: Shadow should be in the ${phase} phase`);
    assert.equal(state.shadow.gripHands, 2, `${name}: Shadow should grip with both hands`);
    assert.equal(state.shadowFx.webLines, 10, `${name}: Shadow should connect both hands to all five targets`);
    assert.equal(state.shadowFx.snareColor, '#a855f7', `${name}: Shadow’s own special should be purple`);
    assert.equal(state.shadowFx.strandColor, 'a855f7', `${name}: Shadow’s special strands should be purple`);
    assert.equal(state.shadowFx.shockColor, 'a855f7', `${name}: Shadow’s shock should be purple`);
    assert.notEqual(state.ghost.animation.action, 'shadow-snare', `${name}: Shadow’s special must not drive Ghost’s attack pose`);
    assert.equal(state.ghost.animation.source, 'ghost', `${name}: Ghost should keep its independent animation source`);
    assert.equal(state.ghost.snarePhase, 'inactive', `${name}: Ghost’s own Snare should remain inactive`);
    assert.equal(state.ghost.snareWebLines, 0, `${name}: Shadow’s attack must not draw Ghost’s independent webs`);
    assert.equal(state.ghost.pulseSegments, 0, `${name}: Shadow’s pulse must not appear on Ghost`);
    assert.equal(state.ghost.ringSegments, 0, `${name}: Shadow’s discharge rings must not appear on Ghost`);
    assert.equal(state.ghost.snareColor, null, `${name}: Ghost should keep its own special color inactive`);
}
try {
    for (const [name, width, height, mobile] of cases) {
        const page = await browser.newPage();
        await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
        await page.goto(baseUrl, { waitUntil: 'load' });
        await new Promise((r) => setTimeout(r, 1800));
        await page.evaluate(() => window.__game.start());
        await new Promise((r) => setTimeout(r, 350));
        const ability = await page.$eval('.ico.special', (el) => { const icon = el.querySelector('svg:not(.ring)'); return { label: el.getAttribute('aria-label'), visibleText: el.innerText.trim(), hasIcon: !!icon, iconSize: [icon?.getAttribute('width'), icon?.getAttribute('height')], iconPath: icon?.querySelector('path')?.getAttribute('d') }; });
        assert.equal(ability.label, 'shadow snare', `${name}: existing special button accessibility label should remain unchanged`);
        assert.equal(ability.visibleText, '', `${name}: the icon-only HUD should not gain a visible text label`);
        assert.ok(ability.hasIcon, `${name}: special button should keep its icon`);
        assert.deepEqual(ability.iconSize, ['48', '48'], `${name}: the special icon's existing size should remain unchanged`);
        assert.ok(ability.iconPath?.startsWith('M13.8 1.7'), `${name}: the special icon should be the approved lightning/shock glyph`);

        await page.evaluate(() => {
            window.__pedCfg = { n: 0, a: 0 };
            const game = window.__game, s = game.sim;
            window.__ghostDisableCombat = true;
            s.pos = [20, 1, 20]; s.vel = [0, 0, 0]; s.yaw = 0; s.ang = 0; s.pitch = 0.28;
            s.ground = true; s.web = false; s.wall = null; s.swim = false; s.landHard = 0;
            s.atkT = 0; s.shotT = 0; s.dodgeT = 0; s.snareCd = 0; s.snareT = 0; s.snareList = [];
            s.mv = null; s.combo = 0; s.comboT = 0; s.chain = 2; s.chainT = 10;
            s.enemies.forEach((e, i) => { e.x = 80 + i; e.y = 1; e.z = 80; e.hp = 10; e.down = 0; e.atk = 0; e.hit = 0; e.kb = [0, 0]; e.roof = undefined; e.air = false; e.ly = 0; });
            const ghost = window.__ghostSim;
            if (ghost) { ghost.pos = [17.4, 1, 18.55]; ghost.vel = [0, 0, 0]; ghost.ground = true; ghost.web = false; ghost.wall = null; ghost.swim = false; ghost.glideOn = false; ghost.snareT = 0; ghost.snareList = []; ghost.snareCd = 60; ghost.land = 0; ghost.ang = 0; ghost.yaw = 0; ghost.enemies = []; }
        });
        await page.waitForFunction(() => window.__ghostState?.transport === 'idle' && window.__ghostState?.leaderDistance < 10, { timeout: 5000 });
        await page.evaluate(() => {
            const s = window.__game.sim;
            const distances = [4, 5.5, 7, 8.5, 10, 4.6], angles = [-0.4, -0.24, -0.08, 0.08, 0.24, 0.4];
            for (let i = 0; i < distances.length; i++) { const e = s.enemies[i]; e.x = 20 + Math.sin(angles[i]) * distances[i]; e.z = 20 + Math.cos(angles[i]) * distances[i]; if (i === 5) e.y = s.pos[1] + 16; }
            window.__snareInitial = s.enemies.slice(0, 6).map((e) => Math.hypot(e.x - s.pos[0], e.z - s.pos[2]));
            window.__ts = 0.1;
            window.__game.input.specialQ = true;
        });

        await page.waitForFunction(() => window.__game?.sim?.snareT > 0 && window.__game.sim.snareList.length === 5 && window.__ghostState?.transport === 'idle' && window.__shadowSnareFx?.webLines === 10 && window.__shadowSnareFx?.snareColor === '#a855f7' && window.__ghostState?.snarePhase === 'inactive' && window.__ghostState?.snareWebLines === 0, { timeout: 5000 });
        const started = await page.evaluate(() => {
            const s = window.__game.sim;
            return { t: s.snareT, cooldown: s.snareCd, count: s.snareList.length, indices: s.snareList.map((e) => s.enemies.indexOf(e)), chain: s.chain, ghostCooldown: window.__ghostSim.snareCd, shadow: window.__shadowAnimation, shadowFx: window.__shadowSnareFx, ghost: window.__ghostState };
        });
        assert.equal(started.count, 5, `${name}: attack should bind five eligible targets`);
        assert.ok(!started.indices.includes(5), `${name}: vertically ineligible decoy should not be bound`);
        assert.equal(started.chain, 2, `${name}: normal melee chain index should be untouched at activation`);
        assert.ok(started.cooldown > 8.5 && started.cooldown <= 9, `${name}: attack cooldown should remain nine seconds`);
        assertShadowAttack(started, 'gather', name);
        assert.ok(started.ghostCooldown > 50, `${name}: Shadow’s attack must not reset Ghost’s independent cooldown`);

        await page.evaluate(() => { window.__ts = 2; });
        await page.waitForFunction(() => window.__game?.sim && window.__game.sim.snareT < 1.5 && window.__game.sim.snareT > 0.95, { timeout: 7000 });
        await page.screenshot({ path: `art/shadow-snare/after-${name}.png` });
        await page.waitForFunction(() => window.__game?.sim && window.__game.sim.snareT < 0.9 && window.__game.sim.snareT > 0.3, { timeout: 7000 });
        const gathered = await page.evaluate(() => {
            const s = window.__game.sim, indices = s.snareList.map((e) => s.enemies.indexOf(e));
            const before = indices.map((i) => window.__snareInitial[i]);
            const now = s.snareList.map((e) => Math.hypot(e.x - s.pos[0], e.z - s.pos[2]));
            return { t: s.snareT, meanBefore: before.reduce((a, b) => a + b, 0) / before.length, meanNow: now.reduce((a, b) => a + b, 0) / now.length };
        });
        assert.ok(gathered.meanNow < gathered.meanBefore - 1.5, `${name}: bound targets should gather into the group`);

        await page.evaluate(() => { window.__ts = 0; });
        const holdA = await page.evaluate(() => {
            const s = window.__game.sim;
            return { t: s.snareT, positions: s.snareList.map((e) => [e.x, e.y, e.z]), maxDistance: Math.max(...s.snareList.map((e) => Math.hypot(e.x - s.pos[0], e.z - s.pos[2]))), chain: s.chain };
        });
        await new Promise((r) => setTimeout(r, 120));
        const holdB = await page.evaluate(() => window.__game.sim.snareList.map((e) => [e.x, e.y, e.z]));
        const holdDrift = Math.max(...holdA.positions.map((p, i) => Math.hypot(p[0] - holdB[i][0], p[1] - holdB[i][1], p[2] - holdB[i][2])));
        assert.ok(holdA.maxDistance <= 2.8, `${name}: bound targets should stay grouped`);
        assert.ok(holdDrift < 0.08, `${name}: bound targets should stay still while the heroes grip the web`);
        assert.equal(holdA.chain, 2, `${name}: normal melee chain index should remain unchanged during the attack`);

        await page.evaluate(() => { window.__ts = 2; });
        await page.waitForFunction(() => window.__game?.sim && window.__game.sim.snareT < 0.55 && window.__game.sim.snareT > 0.35 && window.__shadowSnareFx?.pulseSegments === 20 && window.__ghostState?.pulseSegments === 0, { timeout: 5000 });
        const shockEarly = await page.evaluate(() => ({ shadow: window.__shadowAnimation, shadowFx: window.__shadowSnareFx, ghost: window.__ghostState }));
        assertShadowAttack(shockEarly, 'shockwave', name);
        assert.equal(shockEarly.shadowFx.pulseSegments, 20, `${name}: Shadow should animate a pulse on each hand-to-target strand`);
        assert.equal(shockEarly.ghost.pulseSegments, 0, `${name}: Shadow’s pulse must not appear on Ghost`);
        assert.ok(shockEarly.shadowFx.pulseProgress > 0 && shockEarly.shadowFx.pulseProgress < 0.5, `${name}: early pulse should be near the heroes’ hands`);

        await page.evaluate(() => { window.__ts = 0.5; });
        await page.waitForFunction(() => window.__game?.sim && window.__game.sim.snareT < 0.32 && window.__game.sim.snareT > 0.1 && window.__shadowSnareFx?.pulseProgress > 0.7 && window.__ghostState?.pulseSegments === 0, { timeout: 7000 });
        await page.evaluate(() => { window.__ts = 0; });
        const shockLate = await page.evaluate(() => ({ shadow: window.__shadowAnimation, shadowFx: window.__shadowSnareFx, ghost: window.__ghostState }));
        assertShadowAttack(shockLate, 'shockwave', name);
        assert.ok(shockLate.shadowFx.pulseProgress > shockEarly.shadowFx.pulseProgress + 0.15, `${name}: shockwave should visibly advance along the web`);
        assert.equal(shockLate.ghost.pulseSegments, 0, `${name}: Ghost should keep its own shock visuals inactive`);
        if (mobile) await page.screenshot({ path: 'art/shadow-snare/shock-mobile-landscape.png' });

        await page.evaluate(() => { window.__ts = 0.25; });
        try {
            await page.waitForFunction(() => {
                const s = window.__game?.sim;
                return s?.snareList?.length === 5 && s.snareList.every((e) => e.hp === 7);
            }, { timeout: 7000 });
        } catch (error) {
            console.log('SHADOW IMPACT WAIT STATE', JSON.stringify(await page.evaluate(() => { const s = window.__game.sim; return { ts: window.__ts, t: s.snareT, hp: s.snareList.map((e) => e.hp), hitStop: s.hitStop, shake: s.shake, shadowFx: window.__shadowSnareFx, ghost: window.__ghostState }; })));
            throw error;
        }
        await page.evaluate(() => { window.__ts = 0; });
        await page.waitForFunction(() => window.__shadowSnareFx?.ringSegments === 80 && window.__ghostState?.ringSegments === 0, { timeout: 3000 });
        const impact = await page.evaluate(() => {
            const s = window.__game.sim;
            return { t: s.snareT, hitStop: s.hitStop, shake: s.shake, hitPoints: s.snareList.map((e) => e.hp), knockback: s.snareList.map((e) => Math.hypot(e.kb[0], e.kb[1])), sixthHp: s.enemies[5].hp, chain: s.chain, shadowFx: window.__shadowSnareFx, ghost: window.__ghostState };
        });
        assert.ok(impact.t <= 0.15 && impact.t > 0, `${name}: shock discharge should land after traveling through the connected web`);
        assert.ok(impact.hitStop > 0 && impact.shake >= 0.25, `${name}: localized discharge response should be present`);
        assert.ok(impact.knockback.every((v) => v > 14), `${name}: bound targets should receive the existing Snare knockback`);
        assert.equal(impact.shadowFx.ringSegments, 80, `${name}: Shadow should show the discharge ring at all five targets`);
        assert.equal(impact.ghost.ringSegments, 0, `${name}: Shadow’s discharge rings must not appear on Ghost`);
        assert.equal(impact.sixthHp, 10, `${name}: nearby unbound decoy inside the horizontal shock radius should remain untouched`);
        assert.equal(impact.chain, 2, `${name}: special ability must not change normal melee chain cadence`);

        await page.evaluate(() => { window.__ts = 2; });
        await page.waitForFunction(() => window.__game?.sim?.snareT === 0, { timeout: 5000 });
        await page.evaluate(() => { window.__ts = 0; });
        const recovered = await page.evaluate(() => ({ count: window.__game.sim.snareList.length, chain: window.__game.sim.chain, cooldown: window.__game.sim.snareCd }));
        assert.equal(recovered.count, 0, `${name}: web bindings should clear after recovery`);
        assert.equal(recovered.chain, 2, `${name}: normal melee chain index should remain unchanged after recovery`);
        assert.ok(recovered.cooldown > 7, `${name}: cooldown should continue normally`);
        assert.equal(errors.length, 0, `${name}: browser errors: ${errors.join('; ')}`);
        console.log(name, JSON.stringify({ passed: true, ability, started: { t: started.t, count: started.count, cooldown: started.cooldown }, gathered, hold: { t: holdA.t, maxDistance: holdA.maxDistance, drift: holdDrift }, shock: { early: shockEarly.shadowFx.pulseProgress, late: shockLate.shadowFx.pulseProgress }, impact: { t: impact.t, hitPoints: impact.hitPoints, ringSegments: impact.shadowFx.ringSegments }, recovered, errors }));
        await page.close();
    }
} finally {
    await browser.close();
}
console.log('SNARE PASS');
