import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';

const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
await mkdir('art/boss', { recursive: true });
const page = await browser.newPage();
await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
await page.goto(`http://127.0.0.1:${process.env.PORT || 4173}/`, { waitUntil: 'load' });
await new Promise((resolve) => setTimeout(resolve, 900));
await page.evaluate(() => { window.__game.input.specialQ = false; window.__game.start(); });
await page.waitForFunction(() => !!window.__game?.sim?.enemies?.find((enemy) => enemy.boss), { timeout: 5000 });

const setup = await page.evaluate(() => {
    const { sim, input } = window.__game;
    const boss = sim.enemies.find((enemy) => enemy.boss);
    if (!boss?.flight || !boss.roof) throw new Error('Boss flight state or rooftop bounds are missing');
    sim.enemies.forEach((enemy) => { if (enemy !== boss) { enemy.down = 10000; enemy.atk = 0; enemy.x = 10000; enemy.z = 10000; } });
    const roof = boss.roof;
    const centerX = (roof.x0 + roof.x1) / 2, centerZ = (roof.z0 + roof.z1) / 2;
    boss.x = centerX; boss.z = centerZ + 6; boss.y = boss.flight.baseY;
    boss.atk = 0; boss.hit = 0; boss.down = 0; boss.kb = [0, 0]; boss.flight.phase = 'grounded'; boss.flight.phaseT = 100;
    sim.pos = [roof.x1 - 2, boss.y + 1.5, centerZ]; sim.vel = [0, 0, 0]; sim.ground = true; sim.safe = [...sim.pos];
    sim.web = false; sim.swim = false; sim.dive = false; sim.wall = null; sim.windT = sim.t + 1000;
    input.attackQ = false; input.dodgeQ = false; input.mx = 0; input.my = 0; input.swing = false; input.swingQ = false; input.jumpQ = false; input.jumpHeld = false; input.specialQ = false;
    for (const key of Object.keys(input.keys)) input.keys[key] = false;
    window.__ts = 1.2;
    const dx = sim.pos[0] - boss.x, dz = sim.pos[2] - boss.z;
    boss.ang = Math.atan2(dx, dz);
    const fx = Math.sin(boss.ang), fz = Math.cos(boss.ang);
    const flightY = boss.flight.baseY + 6.5;
    window.__camOv = [boss.x + fx * 12, flightY + 5.2, boss.z + fz * 12, boss.x, flightY + 4.35, boss.z];
    return { baseY: boss.flight.baseY, roof: { ...roof }, inputKeys: Object.keys(input).sort(), inputState: JSON.stringify(input) };
});

const state = () => page.evaluate(() => {
    const { sim } = window.__game, boss = sim.enemies.find((enemy) => enemy.boss);
    const thrusters = window.__giantBossRoot?.getObjectByName('boss-thrusters');
    return {
        phase: boss?.flight?.phase, phaseT: boss?.flight?.phaseT, x: boss?.x, y: boss?.y, z: boss?.z,
        baseY: boss?.flight?.baseY, roof: boss?.roof,
        thrustersVisible: !!thrusters?.visible, thrusterPhase: thrusters?.userData?.phase,
        thrusterPower: thrusters?.userData?.power ?? 0,
    };
});
const insideRoof = (point) => point.x >= setup.roof.x0 && point.x <= setup.roof.x1 && point.z >= setup.roof.z0 && point.z <= setup.roof.z1;

await page.waitForFunction(() => {
    const flight = window.__game.sim.enemies.find((enemy) => enemy.boss)?.flight;
    return flight?.phase === 'takeoff' && flight.phaseT >= 0.18;
}, { timeout: 5000 });
const takeoff = await state();
assert.ok(takeoff.y > setup.baseY + 0.4, `takeoff should lift the boss: ${JSON.stringify(takeoff)}`);
assert.ok(takeoff.thrustersVisible && takeoff.thrusterPhase === 'takeoff' && takeoff.thrusterPower > 0, 'takeoff should activate the paired thruster cue');
assert.ok(insideRoof(takeoff), 'takeoff must remain within the rooftop arena');

await page.waitForFunction(() => window.__game.sim.enemies.find((enemy) => enemy.boss)?.flight?.phase === 'hover', { timeout: 5000 });
await new Promise((resolve) => setTimeout(resolve, 45));
const hoverStart = await state();
await new Promise((resolve) => setTimeout(resolve, 85));
const hoverEnd = await state();
assert.ok(hoverStart.y > setup.baseY + 5.8, `hover should hold a controlled altitude: ${JSON.stringify(hoverStart)}`);
assert.ok(Math.abs(hoverEnd.y - hoverStart.y) < 0.55, 'hover altitude should stay steady with only a small bob');
assert.ok(Math.hypot(hoverEnd.x - hoverStart.x, hoverEnd.z - hoverStart.z) < 0.2, 'hover should hold its horizontal position');
assert.ok(hoverEnd.thrustersVisible && hoverEnd.thrusterPhase === 'hover' && hoverEnd.thrusterPower > 0, 'hover should retain a restrained exhaust cue');
assert.ok(insideRoof(hoverEnd), 'hover must remain within the rooftop arena');
await page.evaluate(() => { window.__ts = 0; });
await page.screenshot({ path: 'art/boss/shot-after-boss-flight-mobile-landscape.png' });
await page.evaluate(() => { window.__ts = 1.2; });

await page.waitForFunction(() => window.__game.sim.enemies.find((enemy) => enemy.boss)?.flight?.phase === 'propel', { timeout: 5000 });
const propelStart = await state();
await page.waitForFunction(() => {
    const flight = window.__game.sim.enemies.find((enemy) => enemy.boss)?.flight;
    return flight?.phase === 'propel' && flight.phaseT >= 0.6;
}, { timeout: 5000 });
const propelMid = await state();
assert.ok(Math.hypot(propelMid.x - propelStart.x, propelMid.z - propelStart.z) > 0.45, 'propel should move the boss across the roof');
assert.ok(propelMid.thrustersVisible && propelMid.thrusterPhase === 'propel' && propelMid.thrusterPower > 0.75, 'propel should intensify the thruster cue');
assert.ok(insideRoof(propelMid), 'propelled movement must remain inside the rooftop bounds');

await page.waitForFunction(() => window.__game.sim.enemies.find((enemy) => enemy.boss)?.flight?.phase === 'landing', { timeout: 5000 });
const landing = await state();
assert.ok(landing.y > setup.baseY + 2, 'landing should begin from flight altitude');
await page.waitForFunction(() => {
    const boss = window.__game.sim.enemies.find((enemy) => enemy.boss);
    return boss?.flight?.phase === 'grounded' && Math.abs(boss.y - boss.flight.baseY) < 0.03;
}, { timeout: 5000 });
await page.waitForFunction(() => {
    const thrusters = window.__giantBossRoot?.getObjectByName('boss-thrusters');
    return !!thrusters && !thrusters.visible && thrusters.userData.power === 0;
}, { timeout: 5000 });
const landed = await state();
assert.ok(Math.abs(landed.y - setup.baseY) < 0.03, 'landing should return the boss to the rooftop height');
assert.ok(!landed.thrustersVisible && landed.thrusterPower === 0, 'thrusters should shut off after touchdown');
assert.ok(insideRoof(landed), 'landing must stay inside the rooftop arena');
const finalInputState = await page.evaluate(() => JSON.stringify(window.__game.input));
const inputKeys = await page.evaluate(() => Object.keys(window.__game.input).sort());
assert.deepEqual(inputKeys, setup.inputKeys, 'boss flight must not add player input fields');
assert.equal(finalInputState, setup.inputState, 'boss flight must not alter player controls');
assert.deepEqual(errors, [], 'boss flight should produce no browser errors');

console.log('BOSS FLIGHT PASS', JSON.stringify({ takeoff, hover: hoverEnd, propel: propelMid, landing, landed, inputKeys, errors }));
await browser.close();
