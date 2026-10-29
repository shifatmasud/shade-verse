import puppeteer from 'puppeteer-core';

const port = process.env.PORT || '4173';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
await new Promise((resolve) => setTimeout(resolve, 1200));
await page.evaluate(() => window.__game.start());
await new Promise((resolve) => setTimeout(resolve, 500));

async function waitForState(predicate, timeout = 3500) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
        const value = await page.evaluate(() => ({ state: window.__ghostState, player: window.__game.sim, actor: window.__ghostSim }));
        if (predicate(value)) return value;
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return await page.evaluate(() => ({ state: window.__ghostState, player: window.__game.sim, actor: window.__ghostSim }));
}

const wallSetup = await page.evaluate(() => {
    const game = window.__game, sim = game.sim;
    sim.enemies.forEach((enemy) => { enemy.down = 1000; enemy.atk = 0; });
    game.input.keys.w = false; game.input.keys.a = false; game.input.keys.s = false; game.input.keys.d = false;
    game.input.swing = false; game.input.swingQ = false; game.input.jumpQ = false;
    const building = game.buildings.filter((entry) => entry.h > 18 && entry.h < 34 && Math.abs(entry.x0) < 150 && Math.abs(entry.z0) < 150)
        .sort((a, b) => Math.hypot((a.x0 + a.x1) / 2 - sim.pos[0], (a.z0 + a.z1) / 2 - sim.pos[2]) - Math.hypot((b.x0 + b.x1) / 2 - sim.pos[0], (b.z0 + b.z1) / 2 - sim.pos[2]))[0];
    if (!building) throw new Error('No central wall-crawl fixture found');
    const z = (building.z0 + building.z1) / 2;
    sim.pos = [building.x0 - 1.2, 1, z]; sim.vel = [0, 0, 0]; sim.ground = true;
    sim.web = false; sim.wall = null; sim.wallB = -1; sim.swim = false; sim.glideOn = false; sim.grappleFlight = false; sim.spring = 0; sim.airT = 0;
    sim.yaw = Math.PI / 2; sim.ang = Math.PI / 2;
    game.input.keys.w = true;
    return { building: { x0: building.x0, z0: building.z0, h: building.h } };
});
await page.waitForFunction(() => !!window.__game.sim.wall, { timeout: 2500 });
await page.evaluate(() => { window.__game.input.keys.w = false; window.__game.input.my = 0.35; });
const wallResult = await waitForState((value) => value.state?.transport === 'idle' && value.state?.leaderTraversal === 'wall' && value.state?.ghostTraversal === 'wall', 3500);
const wall = { leader: wallResult.state?.leaderTraversal, ghost: wallResult.state?.ghostTraversal, leaderWall: !!wallResult.player.wall, ghostWall: !!wallResult.actor.wall, sameWall: wallResult.player.wallB === wallResult.actor.wallB, animation: wallResult.state?.animation };

await page.evaluate(() => {
    const g = window.__game, s = g.sim;
    g.input.keys.w = false; g.input.my = 0; g.input.swingQ = false; g.input.swing = true;
    s.pos[0] -= 6; s.pos[1] = Math.max(s.pos[1] + 8, 24); s.vel = [0, 0, 0]; s.wall = null; s.wallB = -1; s.ground = false;
    s.web = true; s.anchor = [s.pos[0], s.pos[1] + 20, s.pos[2] + 10]; s.rope = 30; s.webT = 0;
    window.__ts = 0;
});
const swung = await waitForState((value) => value.player.web === true, 2500);
const swingResult = await waitForState((value) => value.state?.transport === 'idle' && value.state?.leaderTraversal === 'swing' && value.state?.ghostTraversal === 'swing', 3000);
const swing = { leader: swingResult.state?.leaderTraversal, ghost: swingResult.state?.ghostTraversal, leaderSwing: !!swingResult.player.web, ghostSwing: !!swingResult.actor.web, foundLeaderSwing: !!swung.player.web, animation: swingResult.state?.animation };

await page.evaluate(() => {
    const g = window.__game, s = g.sim;
    g.input.swing = true; g.input.swingQ = false; g.input.keys.w = false;
    s.pos[1] = 1; s.vel = [0, 0, 0]; s.ground = false; s.web = true; s.webT = 0.5;
    s.anchor = [s.pos[0], s.pos[1] + 30, s.pos[2] + 1]; s.rope = 40;
    window.__ts = 0;
});
const zipResult = await waitForState((value) => value.player.web && value.state?.animation?.action === 'street-zip-up', 2000);
const zip = { action: zipResult.state?.animation?.action, source: zipResult.state?.animation?.source, leaderWeb: !!zipResult.player.web };

await page.evaluate(() => {
    const g = window.__game, s = g.sim;
    g.input.swing = false; g.input.swingQ = false; g.input.keys.w = false;
    s.wall = null; s.wallB = -1; s.web = false; s.swim = false; s.grappleFlight = false; s.spring = 0; s.flightBoost = false;
    s.pos[1] = Math.max(s.pos[1] + 12, 42); s.vel = [0, 0, 0]; s.ground = false; s.airT = 0.6; s.glideOn = true;
    window.__ts = 0;
});
const glideResult = await waitForState((value) => value.state?.transport === 'idle' && value.state?.leaderTraversal === 'glide' && value.state?.ghostTraversal === 'glide', 3000);
const glide = { leader: glideResult.state?.leaderTraversal, ghost: glideResult.state?.ghostTraversal, leaderGlide: !!glideResult.player.glideOn, ghostGlide: !!glideResult.actor.glideOn, animation: glideResult.state?.animation };

await page.evaluate(() => { window.__game.sim.pos[0] += 100; });
let morphOut = false, morphIn = false, captured = false;
for (let i = 0; i < 80; i++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const state = await page.evaluate(() => window.__ghostState);
    if (state.transport === 'out') morphOut = state.particles === 96;
    if (state.transport === 'in') {
        morphIn = state.particles === 96;
        if (!captured) {
            await page.evaluate(() => {
                const p = window.__game.sim.pos;
                window.__camOv = [p[0] - 8, p[1] + 5, p[2] - 12, p[0], p[1] + 3, p[2]];
            });
            await new Promise((resolve) => setTimeout(resolve, 100));
            await page.screenshot({ path: 'art/ghost/shot-after-ghost-morph-mobile-landscape.png' });
            captured = true;
        }
    }
    if (morphOut && morphIn && state.transport === 'idle') break;
}
const final = await page.evaluate(() => ({ state: window.__ghostState, leader: window.__game.sim.pos, actor: window.__ghostSim.pos }));
const finalDistance = Math.hypot(final.actor[0] - final.leader[0], final.actor[1] - final.leader[1], final.actor[2] - final.leader[2]);
const ok = wall.leader === 'wall' && wall.ghost === 'wall' && wall.leaderWall && wall.ghostWall && wall.sameWall && wall.animation?.source === 'shadow' && wall.animation?.action === 'wall-crawl' && wall.animation?.key === 'wall' && swing.leader === 'swing' && swing.ghost === 'swing' && swing.leaderSwing && swing.ghostSwing && swing.foundLeaderSwing && swing.animation?.source === 'shadow' && swing.animation?.action === 'web-swing' && zip.action === 'street-zip-up' && zip.source === 'shadow' && zip.leaderWeb && glide.leader === 'glide' && glide.ghost === 'glide' && glide.leaderGlide && glide.ghostGlide && glide.animation?.source === 'shadow' && glide.animation?.action === 'glide' && morphOut && morphIn && final.state.transport === 'idle' && finalDistance < 18 && errors.length === 0;
console.log(JSON.stringify({ ok, wallSetup, wall, swing, zip, glide, morph: { out: morphOut, in: morphIn, final: final.state, finalDistance }, errors }));
console.log(ok ? 'GHOST TRAVERSAL PASS' : 'GHOST TRAVERSAL FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
