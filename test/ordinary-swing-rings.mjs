import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const base = process.argv[2] || process.env.BASE_URL || 'http://localhost:4174/';
const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

try {
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__game?.events?.attach && window.__ghostState, { timeout: 10000 });
    await page.evaluate(() => window.__game.start());
    await new Promise((resolve) => setTimeout(resolve, 500));
    await page.evaluate(() => {
        const { sim } = window.__game;
        for (const enemy of sim.enemies) { enemy.down = 1000; enemy.atk = 0; }
        window.__ts = 0;
    });

    await page.evaluate(() => window.__game.events.attach());
    await new Promise((resolve) => setTimeout(resolve, 80));
    const attach = await page.evaluate(() => ({
        impactOpacity: getComputedStyle(document.querySelector('.impact')).opacity,
        flashOpacity: getComputedStyle(document.querySelector('.flash')).opacity,
    }));
    assert.equal(attach.impactOpacity, '0', 'ordinary web attach must not draw the screen-space ring');

    const button = await page.$('.ico.swing');
    const box = await button.boundingBox();
    assert.ok(box, 'swing control must be visible');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await new Promise((resolve) => setTimeout(resolve, 80));
    const pressed = await page.evaluate(() => ({
        rippleCount: document.querySelector('.ico.swing').querySelectorAll('.ripple').length,
        impactOpacity: getComputedStyle(document.querySelector('.impact')).opacity,
    }));
    assert.equal(pressed.rippleCount, 0, 'ordinary swing press must not add an expanding ring to the control');
    assert.equal(pressed.impactOpacity, '0', 'ordinary swing press must not draw the center-screen ring');

    await page.evaluate(() => {
        const { sim, input } = window.__game;
        sim.web = true; sim.webT = 0.25; sim.anchorReal = true;
        sim.anchor = [sim.pos[0] + 4, sim.pos[1] + 30, sim.pos[2] + 2];
        sim.rope = 50; sim.swings = 1; sim.snareT = 0; sim.snareList = [];
        input.swing = true;
        document.querySelector('.ico.swing').classList.add('linked');
    });
    await new Promise((resolve) => setTimeout(resolve, 120));
    const state = await page.evaluate(() => {
        const button = document.querySelector('.ico.swing');
        const after = getComputedStyle(button, '::after');
        return {
            linked: button.classList.contains('linked'),
            linkedPseudoBorder: after.borderTopWidth,
            linkedPseudoWidth: after.width,
            shadowFx: window.__shadowSnareFx,
            ghost: window.__ghostState,
        };
    });
    assert.equal(state.linked, true, 'the existing linked swing indicator remains available');
    assert.equal(parseFloat(state.linkedPseudoBorder), 0, 'linked ordinary swing must not have a dashed ring outline');
    assert.equal(state.shadowFx?.pulseSegments, 0, 'Shadow ordinary swing must have no Shock Web pulse segments');
    assert.equal(state.shadowFx?.ringSegments, 0, 'Shadow ordinary swing must have no Shock Web ring segments');
    assert.equal(state.ghost?.pulseSegments, 0, 'Ghost ordinary swing must have no Shock Web pulse segments');
    assert.equal(state.ghost?.ringSegments, 0, 'Ghost ordinary swing must have no Shock Web ring segments');
    assert.deepEqual(errors, [], 'browser must stay free of console and page errors');

    console.log(JSON.stringify({ result: 'PASS', viewport: '844x390 landscape', attach, pressed, linked: {
        linked: state.linked,
        pseudoBorder: state.linkedPseudoBorder,
        shadowRings: state.shadowFx?.ringSegments,
        shadowPulses: state.shadowFx?.pulseSegments,
        ghostRings: state.ghost?.ringSegments,
        ghostPulses: state.ghost?.pulseSegments,
    }, errors }));
} finally {
    await browser.close();
}
