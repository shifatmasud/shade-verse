/*
 * Web slingshot pose regression (second hand on the move: tap web / RMB / Shift).
 *
 * What the move has to hold on the drawn rig, frame by frame:
 *   - BOTH FISTS ON THE LINE: each upper arm and forearm points at the anchor (< 10 deg off), the two sides within
 *     a few degrees of each other. The aim used to run before the torso layers and ended up 57-73 deg off, splayed
 *     beside the hood, with the left and right arms disagreeing.
 *   - CENTRED / NO SIDEWAYS LEAN: the body's roll stays at zero, the spine carries pitch only, and the head sits on
 *     the hips' sagittal plane (the old pose inherited the stock air clip's 11 deg hip roll / 15 deg spine twist).
 *   - A COIL THAT READS: knees tucked at the start of the pull (~90 deg), legs long by the launch, both sides equal.
 *   - NO SNAP AFTER THE PULL: the tether is still on and the body still on the line ~1 s later, and the move never
 *     rolls into a flip while the hero is climbing.
 *
 * Needs an instrumented preview (VITE_DBG=1) served on PORT, e.g.
 *   VITE_DBG=1 npm run build && npx vite preview --port 4173 &
 *   CHROME_PATH=/path/to/chrome PORT=4173 node test/web-spring-pose.mjs
 */
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const port = process.env.PORT || '4173';
const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome-stable',
    headless: 'shell',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
await page.setViewport({ width: 640, height: 420, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 200)); });

/** Slingshot pose as measured on the drawn rig at this instant. */
async function pose() {
    return page.evaluate(() => {
        const g = window.__game, s = g.sim, rig = window.__rig, B = rig.b;
        const V = rig.root.position.constructor;
        const w = (b) => { const v = new V(); b.getWorldPosition(v); return v; };
        const deg = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.dot(b) / ((a.length() * b.length()) || 1)))) * 180 / Math.PI;
        const target = s.anchor;
        const tg = new V(target[0], target[1], target[2]);
        const arm = (sd) => {
            const u = w(B['uarm' + sd]), f = w(B['farm' + sd]), h = w(B['hand' + sd]);
            return {
                uarm: deg(new V().subVectors(f, u), new V().subVectors(tg, u)),
                farm: deg(new V().subVectors(h, f), new V().subVectors(tg, f)),
                arm: deg(new V().subVectors(h, u), new V().subVectors(tg, u)),
                gap: h.distanceTo(tg),
            };
        };
        const knee = (sd) => {
            const th = w(B['thigh' + sd]), sh = w(B['shin' + sd]), ft = w(B['foot' + sd]);
            return deg(new V().subVectors(th, sh), new V().subVectors(ft, sh));
        };
        // body frame: forward along the facing, side across it
        const fwd = [Math.sin(s.ang), 0, Math.cos(s.ang)], side = [Math.cos(s.ang), 0, -Math.sin(s.ang)];
        const hips = w(B.hips), head = w(B.head);
        const lateral = (p) => (p.x - hips.x) * side[0] + (p.z - hips.z) * side[2];
        const eul = (n) => [B[n].rotation.x, B[n].rotation.y, B[n].rotation.z];
        return {
            t: s.t, spring: s.spring, action: window.__shadowAnimation?.action,
            pose: window.__shadowAnimation?.slingshotPose,
            roll: rig.poseRoot.rotation.z,
            spin: [eul('hips')[2], eul('spine')[2], eul('chest')[2]],
            twist: [eul('hips')[1], eul('spine')[1], eul('chest')[1]],
            headLateral: lateral(head),
            handLateral: [lateral(w(B.handL)), lateral(w(B.handR))],
            shoulderY: [w(B.uarmL).y - w(B.uarmR).y],
            L: arm('L'), R: arm('R'),
            knee: [knee('L'), knee('R')],
            flip: !!s.flip, vy: s.vel[1], y: s.pos[1],
            grapple: !!s.grappleFlight, web: !!s.web,
            tether: [!!(window.__webO0), !!(window.__webO1)],
        };
    });
}

async function step(seconds) {
    await page.evaluate((sec) => new Promise((res) => {
        window.__ts = 0.08;
        const start = window.__game.sim.t;
        const iv = setInterval(() => {
            if (window.__game.sim.t - start >= sec) { clearInterval(iv); window.__ts = 0; res(); }
        }, 16);
    }), seconds);
}

try {
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.__game, { timeout: 60000 });
    await page.evaluate(() => window.__game.start());
    await page.waitForFunction(() => window.__game.sim.mode === 'play', { timeout: 120000 });
    await new Promise((r) => setTimeout(r, 800));
    await page.keyboard.press('Escape').catch(() => {});

    const fixture = await page.evaluate(() => {
        const g = window.__game, s = g.sim, blds = g.buildings;
        const cands = blds.filter((x) => !x.ob && x.host === undefined && !x.sea && x.h > 24 && x.h < 60 && x.x1 - x.x0 > 12 && x.z1 - x.z0 > 12)
            .sort((p, q) => Math.abs(p.h - 34) - Math.abs(q.h - 34));
        let b = null, P = null;
        for (const c of cands) {
            const px = c.x0 - 25, pz = (c.z0 + c.z1) / 2;
            if (px < -900 || px > 900 || pz < -900 || pz > 900) continue;
            if (blds.some((o) => o !== c && !o.sea && o.host === undefined && px > o.x0 - 6 && px < o.x1 + 6 && pz > o.z0 - 6 && pz < o.z1 + 6)) continue;
            b = c; P = [px, 1.0, pz]; break;
        }
        for (const e of s.enemies) { e.x = -900; e.z = -900; e.atk = 0; e.down = 1000; }
        window.__ghostDisableCombat = true;
        const clear = (o) => { if (!o) return; o.mv = null; o.slam = null; o.atkT = 0; o.shotT = 0; o.snareT = 0; o.flip = null; };
        clear(s); clear(window.__ghostSim);
        s.pos = [...P]; s.vel = [0, 0, 0]; s.yaw = Math.PI / 2; s.ang = Math.PI / 2;
        s.ground = true; s.web = false; s.spring = 0; s.wall = null; s.wallB = -1; s.wallT = 0; s.wallRun = false;
        for (const k of Object.keys(g.input.keys)) g.input.keys[k] = false;
        g.input.swing = false; g.input.swingQ = false; g.input.grabQ = false; g.input.jumpQ = false;
        g.input.mx = 0; g.input.my = 0;
        window.__ts = 0.08;
        return { b: [b.x0, b.x1, b.z0, b.z1, b.h], P };
    });
    await new Promise((r) => setTimeout(r, 400));

    // real trigger: the flag a web tap (RMB / Shift / L) sets
    await page.evaluate(() => { window.__game.input.grabQ = true; });
    await page.waitForFunction(() => window.__game.sim.spring > 0, { timeout: 30000 });

    const beats = {};
    const marks = [
        ['coil', 0.30],   // anticipation held for the first ~90 ms
        ['pull', 0.22],
        ['launch', 0.08],
    ];
    for (const [name, mark] of marks) {
        await page.waitForFunction((v) => window.__game.sim.spring <= v, { timeout: 60000, polling: 10 }, mark);
        await page.evaluate(() => { window.__ts = 0; });
        await new Promise((r) => setTimeout(r, 120));
        beats[name] = await pose();
        await page.evaluate(() => { window.__ts = 0.08; });
    }

    for (const [name, m] of Object.entries(beats)) {
        assert.equal(m.action, 'web-spring-launch', `${name}: the move is the web slingshot`);
        assert.ok(m.pose > 0.9, `${name}: the slingshot pose owns the body (weight ${m.pose})`);
        for (const side of ['L', 'R']) {
            assert.ok(m[side].uarm < 10, `${name}: ${side} upper arm is on the line (${m[side].uarm.toFixed(1)} deg off)`);
            assert.ok(m[side].farm < 10, `${name}: ${side} forearm is on the line (${m[side].farm.toFixed(1)} deg off)`);
            assert.ok(m[side].arm < 10, `${name}: ${side} arm points at the anchor (${m[side].arm.toFixed(1)} deg off)`);
        }
        assert.ok(Math.abs(m.L.arm - m.R.arm) < 5, `${name}: the two arms agree (L ${m.L.arm.toFixed(1)}, R ${m.R.arm.toFixed(1)} deg)`);
        assert.ok(Math.abs(m.L.gap - m.R.gap) < 0.10, `${name}: both fists are the same distance from the anchor (${m.L.gap.toFixed(2)} / ${m.R.gap.toFixed(2)} m)`);
        // centred: no roll on the body or the spine column, head on the hips' sagittal plane
        assert.ok(Math.abs(m.roll) < 0.02, `${name}: no body roll (${m.roll.toFixed(3)} rad)`);
        for (const s2 of m.spin) assert.ok(Math.abs(s2) < 0.06, `${name}: the spine column carries no sideways tilt (${m.spin.map((v) => v.toFixed(2)).join(', ')})`);
        for (const s2 of m.twist) assert.ok(Math.abs(s2) < 0.06, `${name}: the spine column carries no twist (${m.twist.map((v) => v.toFixed(2)).join(', ')})`);
        assert.ok(Math.abs(m.headLateral) < 0.10, `${name}: the head sits on the pull plane (${m.headLateral.toFixed(3)} m sideways)`);
        assert.ok(Math.abs(m.handLateral[0] + m.handLateral[1]) < 0.10, `${name}: the fists mirror across the plane (${m.handLateral.map((v) => v.toFixed(2)).join(' / ')} m)`);
        assert.ok(Math.abs(m.handLateral[0] - m.handLateral[1]) > 0.25, `${name}: the fists are on both sides of the plane, not crossed`);
        assert.ok(Math.abs(m.shoulderY[0]) < 0.04, `${name}: the shoulders stay level (${m.shoulderY[0].toFixed(3)} m)`);
        // tether: both lines are drawn from a hand
        assert.deepEqual(m.tether, [true, true], `${name}: both web lines are on`);
    }
    // the coil reads: knees tucked at the start, legs long by the launch, both sides equal
    assert.ok(beats.coil.knee[0] < 115 && beats.coil.knee[1] < 115, `coil: both knees are tucked (${beats.coil.knee.map((k) => k.toFixed(0)).join(' / ')} deg)`);
    assert.ok(Math.abs(beats.coil.knee[0] - beats.coil.knee[1]) < 10, `coil: the knees mirror (${beats.coil.knee.map((k) => k.toFixed(0)).join(' / ')} deg)`);
    assert.ok(beats.launch.knee[0] > 150 && beats.launch.knee[1] > 150, `launch: the legs are long (${beats.launch.knee.map((k) => k.toFixed(0)).join(' / ')} deg)`);
    assert.ok(beats.coil.knee[0] + 30 < beats.launch.knee[0], `the coil releases into the extension (${beats.coil.knee[0].toFixed(0)} -> ${beats.launch.knee[0].toFixed(0)} deg)`);

    // after the pull: no flip, the tether stays on, the body keeps soaring along the line
    await page.waitForFunction(() => window.__game.sim.spring <= 0, { timeout: 60000, polling: 10 });
    await page.evaluate(() => { window.__ts = 0.1; });
    await step(0.5);
    const exit = await pose();
    await step(0.5);
    const later = await pose();
    for (const [name, m] of [['exit', exit], ['exit+1s', later]]) {
        assert.equal(m.flip, false, `${name}: no release flip out of the slingshot`);
        assert.ok(Math.abs(m.roll) < 0.05, `${name}: still no roll (${m.roll.toFixed(3)} rad)`);
        assert.ok(m.vy > 0 || m.y > 30, `${name}: still climbing / arriving at the roof`);
        assert.ok(m.grapple || m.y > 30, `${name}: the slingshot flight is still the move`);
    }
    assert.deepEqual(later.tether, [true, true], 'exit: the two lines stay on the anchor through the flight');
    assert.deepEqual(errors, [], `browser errors: ${errors.join(' | ')}`);
    console.log(JSON.stringify({ ok: true, fixture, beats, exit: { ...exit, L: undefined, R: undefined }, later: { ...later, L: undefined, R: undefined } }, null, 1));
} catch (e) {
    console.error(e);
    if (errors.length) console.error('Browser errors:', JSON.stringify(errors));
    process.exitCode = 1;
} finally {
    await browser.close();
}
