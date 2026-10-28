import puppeteer from 'puppeteer-core';

const port = process.env.PORT || '4173';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
await new Promise((resolve) => setTimeout(resolve, 1000));
await page.evaluate(() => window.__game.start());
await new Promise((resolve) => setTimeout(resolve, 600));
await page.evaluate(() => {
    const game = window.__game, sim = game.sim;
    window.__ts = 0;
    for (const enemy of sim.enemies) { enemy.down = 1000; enemy.atk = 0; }
    for (const key of Object.keys(game.input.keys)) game.input.keys[key] = false;
    game.input.mx = game.input.my = 0; game.input.attackQ = game.input.dodgeQ = game.input.jumpQ = false;
    game.input.swing = game.input.swingQ = game.input.grabQ = game.input.shotQ = game.input.meleeQ = game.input.specialQ = false;
});

async function waitFor(predicate, timeout = 2500) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
        const value = await page.evaluate(() => ({ state: window.__ghostState, shadow: window.__shadowAnimation }));
        if (predicate(value)) return value;
        await new Promise((resolve) => setTimeout(resolve, 40));
    }
    return await page.evaluate(() => ({ state: window.__ghostState, shadow: window.__shadowAnimation }));
}

const actions = [
    { name: 'ground-run', expected: 'run', state: { ground: true, vel: [5, 0, 0] }, clip: 'run' },
    { name: 'jump', expected: 'airborne', state: { ground: false, pos: [30, 60, 30], vel: [0, 4, 0] }, clip: 'jump' },
    { name: 'wall-jump', expected: 'wall-jump', state: { ground: false, pos: [30, 60, 30], wallT: 0.24, vel: [2, 5, 0] }, clip: 'jump' },
    { name: 'rooftop-vault-landing', expected: 'rooftop-vault', state: { ground: true, land: 0.22, pos: [0, 31, 0], vel: [2, 0, 0], vaulted: 1 }, clip: '' },
    { name: 'dual-hand-spring-shot-launch', expected: 'web-spring-launch', triggerSpring: true, state: { ground: false, pos: [30, 60, 30], web: true, webT: 0.25, anchorReal: true, anchor: [34, 90, 32], rope: 50, swings: 1, vel: [0, 0, 0] }, clip: 'jump' },
    { name: 'auto-glide', expected: 'glide', state: { ground: false, pos: [30, 60, 30], glideOn: true, airT: 0.6, gB: 0.6, vel: [0, 1, 4] }, clip: '' },
    { name: 'powered-flight', expected: 'powered-flight', state: { ground: false, pos: [30, 60, 30], glideOn: true, airT: 0.6, flightPress: 0.2, jumpHeld: true, gB: 0.8, vel: [0, 3, 5] }, clip: '' },
    { name: 'glide-cancel', expected: 'glide-cancel', state: { ground: false, pos: [30, 60, 30], glideOn: false, airT: 0.2, flightTapCancel: true, glideBlocked: true, vel: [0, -2, 1] }, clip: 'jump' },
    { name: 'surface-swim', expected: 'swim', state: { ground: false, pos: [0, -1.5, -250], swim: true, dive: false, vel: [2, 0, 1] }, clip: 'swim' },
    { name: 'underwater-dive', expected: 'dive', state: { ground: false, pos: [0, -1.5, -250], swim: true, dive: true, vel: [0, -3, 2] }, clip: 'swim' },
    { name: 'shore-exit-leap', expected: 'shore-exit-leap', state: { ground: false, pos: [0, 1, -250], swim: false, leapT: 0.3, vel: [2, 6, 0] }, clip: 'jump' },
    { name: 'dodge-flip', expected: 'dodge-flip', state: { ground: false, pos: [30, 60, 30], dodgeT: 0.38, flip: { t: 0.17, dur: 0.5, ax: 'x', dir: 1 }, vel: [2, 4, 0] }, clip: '' },
    { name: 'dodge-roll', expected: 'dodge-flip', state: { ground: false, pos: [30, 60, 30], dodgeT: 0.3, flip: { t: 0.08, dur: 0.42, ax: 'z', dir: 1 }, vel: [2, 2, 0] }, clip: '' },
    { name: 'cartwheel-left', expected: 'dodge-flip', state: { ground: false, pos: [30, 60, 30], dodgeT: 0.42, flip: { t: 0.18, dur: 0.68, ax: 'x', dir: -1 }, vel: [-2, 3, 0] }, clip: '' },
    { name: 'cartwheel-right', expected: 'dodge-flip', state: { ground: false, pos: [30, 60, 30], dodgeT: 0.42, flip: { t: 0.18, dur: 0.68, ax: 'x', dir: 1 }, vel: [2, 3, 0] }, clip: '' },
    ...Array.from({ length: 7 }, (_, i) => ({ name: `melee-move-${i + 1}`, expected: `move-${i + 1}`, state: { ground: i !== 5, pos: i === 5 ? [30, 60, 30] : [0, 31, 0], atkT: 0.25, mv: { id: i + 1, t: 0.18, e: null }, vel: [0, 0, 0] }, clip: '' })),
    { name: 'homing-plasma-web-shot', expected: 'plasma-web-shot', state: { ground: true, pos: [0, 31, 0], shotT: 0.25, shotTgt: [8, 35, 3], vel: [0, 0, 0] }, clip: 'idle' },
    { name: 'shadow-snare-gather', expected: 'shadow-snare', state: { ground: true, snareT: 1.2, vel: [0, 0, 0] }, clip: '' },
    { name: 'shadow-snare-hold', expected: 'shadow-snare', state: { ground: true, snareT: 0.75, vel: [0, 0, 0] }, clip: '' },
    { name: 'shadow-snare-finisher', expected: 'shadow-snare', state: { ground: true, snareT: 0.2, vel: [0, 0, 0] }, clip: '' },
];

const results = [];
for (const test of actions) {
    await page.evaluate((test) => {
        const g = window.__game, s = g.sim, extra = test.state;
        s.wall = null; s.wallB = -1; s.web = false; s.webT = 0; s.spring = 0; s.grappleFlight = false; s.anchorReal = false;
        s.glideOn = false; s.swim = false; s.dive = false; s.ground = true; s.vel = [0, 0, 0]; s.gB = 0; s.vaulted = 0; s.rope = 20; s.swings = 0;
        s.mv = null; s.flip = null; s.snareT = 0; s.snareList = []; s.shotT = 0; s.atkT = 0; s.dodgeT = 0; s.land = 0; s.wallT = 0;
        s.glideBlocked = false; s.flightTapCancel = false; s.flightBoost = false; s.flightPress = undefined; g.input.jumpHeld = false; s.leapT = 0;
        s.anchor = [s.pos[0], s.pos[1] + 10, s.pos[2]]; s.shotTgt = [s.pos[0] + 8, s.pos[1] + 4, s.pos[2] + 3];
        for (const [key, value] of Object.entries(extra)) {
            if (key === 'pos') s.pos = [...value];
            else if (key === 'jumpHeld') g.input.jumpHeld = value;
            else s[key] = value;
        }
        g.input.swing = !!s.web; g.input.swingQ = false; g.input.jumpQ = !!test.triggerSpring; window.__ts = test.triggerSpring ? 1 : 0;
        if (s.mv) s.mv.e = s.enemies[0] || null;
    }, test);
    const result = await waitFor((v) => {
        const a = v.state?.animation;
        return a?.source === 'shadow' && a.action === test.expected
            && (!test.state.flip || JSON.stringify(a.flip) === JSON.stringify(test.state.flip))
            && (!test.state.mv || a.moveId === test.state.mv.id && Math.abs(a.moveT - test.state.mv.t) < 1e-5)
            && (test.state.snareT === undefined || Math.abs(a.snareT - test.state.snareT) < 1e-5)
            && (test.state.shotT === undefined || Math.abs(a.shotT - test.state.shotT) < 1e-5)
            && (test.state.spring === undefined || Math.abs(a.spring - test.state.spring) < 1e-5)
            && (!test.triggerSpring || a.spring > 0 && a.aimedHands === 2 && JSON.stringify(a.aimTarget) === JSON.stringify(test.state.anchor));
    });
    const ghost = result.state?.animation, shadow = result.shadow;
    const clipMatch = (!test.clip || ghost?.key === test.clip && shadow?.key === test.clip)
        && ghost?.clipKey === shadow?.clipKey
        && Math.abs((ghost?.t ?? 0) - (shadow?.t ?? 0)) < 1e-4
        && Math.abs((ghost?.weight ?? 0) - (shadow?.weight ?? 0)) < 1e-4
        && Math.abs((ghost?.frame ?? 0) - (shadow?.frame ?? 0)) < 1e-4
        && Math.abs((ghost?.poseWeight ?? 0) - (shadow?.poseWeight ?? 0)) < 1e-4;
    const actionMatch = ghost?.action === test.expected && shadow?.action === test.expected;
    const moveMatch = ghost?.moveId === (test.state.mv?.id ?? null) && shadow?.moveId === (test.state.mv?.id ?? null);
    const timeMatch = test.state.mv ? Math.abs((ghost?.moveT || 0) - (shadow?.moveT || 0)) < 1e-5
        : test.state.flip ? JSON.stringify(ghost?.flip) === JSON.stringify(shadow?.flip) : true;
    const aimMatch = !test.triggerSpring || ghost?.aimedHands === 2 && shadow?.aimedHands === 2 && JSON.stringify(ghost?.aimTarget) === JSON.stringify(test.state.anchor) && JSON.stringify(shadow?.aimTarget) === JSON.stringify(test.state.anchor);
    const springMatch = !test.triggerSpring || ghost?.spring > 0 && shadow?.spring > 0 && ghost?.spring === shadow?.spring;
    const ok = ghost?.source === 'shadow' && actionMatch && clipMatch && moveMatch && timeMatch && aimMatch && springMatch;
    results.push({ name: test.name, ok, source: ghost?.source, action: ghost?.action, shadowAction: shadow?.action, clip: ghost?.key, shadowClip: shadow?.key, clipKey: ghost?.clipKey, shadowClipKey: shadow?.clipKey, frame: ghost?.frame, shadowFrame: shadow?.frame, weight: ghost?.weight, shadowWeight: shadow?.weight, poseWeight: ghost?.poseWeight, shadowPoseWeight: shadow?.poseWeight, moveId: ghost?.moveId, moveT: ghost?.moveT, flip: ghost?.flip, snareT: ghost?.snareT, shotT: ghost?.shotT, spring: ghost?.spring, aimedHands: ghost?.aimedHands, aimTarget: ghost?.aimTarget, shadowAimedHands: shadow?.aimedHands, shadowAimTarget: shadow?.aimTarget });
    if (!ok) break;
    if (result.state.transport !== 'idle') await waitFor((v) => v.state?.transport === 'idle', 1800);
}

const errorsOut = errors;
console.log(JSON.stringify({ ok: results.length === actions.length && results.every((r) => r.ok) && errorsOut.length === 0, actions: results, count: results.length, errors: errorsOut }));
await browser.close();
process.exit(results.length === actions.length && results.every((r) => r.ok) && errorsOut.length === 0 ? 0 : 1);
