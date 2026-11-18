/*
 * Web slingshot regression (second hand on the move: tap web / RMB / Shift).
 *
 * The move is now two beats (Option B, src/sim.ts): the anchored lines draw the hero in for SLINGSHOT.PULL, then the
 * catapult fires and the webs let go, retract into the fists and are gone. What has to hold, frame by frame:
 *   - BOTH FISTS ON THE LINE through the pull: each arm points at the anchor (< 10 deg off), the two sides within a few
 *     degrees of each other, and both web lines are drawn and sit ON the anchor.
 *   - CENTRED / NO SIDEWAYS LEAN: body roll zero, the spine column carries pitch only, head on the hips' sagittal plane.
 *   - A COIL THAT READS, THEN THE CATAPULT: he is drawn in at pull speed (no launch velocity yet), then the launch beat
 *     fires the slingshot velocity - and NOT before the coil has played.
 *   - WEBS RELEASE ON LAUNCH: after the release + retract window no web is drawn at all (nothing stretching back to an
 *     anchor he has passed), and the arms come off the line while the body keeps the launch pose.
 *   - NO SNAP AFTER THE PULL: no release flip, the body keeps soaring along the line.
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
        const an = window.__shadowAnimation || {};
        return {
            t: s.t, spring: s.spring, u: +(0.4 - s.spring).toFixed(4), rel: an.springRel ?? -1, aimW: an.aimWeight ?? -1,
            action: an.action, pose: an.slingshotPose,
            roll: rig.poseRoot.rotation.z,
            spin: [eul('hips')[2], eul('spine')[2], eul('chest')[2]],
            twist: [eul('hips')[1], eul('spine')[1], eul('chest')[1]],
            headLateral: lateral(head),
            handLateral: [lateral(w(B.handL)), lateral(w(B.handR))],
            shoulderY: [w(B.uarmL).y - w(B.uarmR).y],
            L: arm('L'), R: arm('R'),
            knee: [knee('L'), knee('R')],
            flip: !!s.flip, vy: s.vel[1], speed: Math.hypot(...s.vel), y: s.pos[1],
            grapple: !!s.grappleFlight, web: !!s.web,
            webDbg: window.__webDbg || null,
            tether: window.__webDbg ? window.__webDbg.vis : [!!window.__webO0, !!window.__webO1],
        };
    });
}

const step = async (seconds, ts = 0.12) => page.evaluate(([sec, t]) => new Promise((res) => {
    window.__ts = t;
    const start = window.__game.sim.t;
    const iv = setInterval(() => {
        if (window.__game.sim.t - start >= sec) { clearInterval(iv); window.__ts = 0; res(); }
    }, 16);
}), [seconds, ts]);

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
        window.__ts = 0.12;
        return { b: [b.x0, b.x1, b.z0, b.z1, b.h], P };
    });
    await new Promise((r) => setTimeout(r, 400));

    // per-frame record of the drawn webs from the trigger to well after the move (the release/no-stretch evidence)
    await page.evaluate(() => {
        window.__slingTrace = []; window.__slingOn = true;
        const loop = () => {
            if (!window.__slingOn) return;
            const s = window.__game.sim, d = window.__webDbg, an = window.__shadowAnimation;
            const rec = { t: s.t, u: +(0.4 - s.spring).toFixed(4), spring: s.spring, rel: an && an.springRel != null ? an.springRel : -1, vis: d ? d.vis : null, len: d ? d.len : null, gripped: d ? d.gripped : null, retracting: d ? d.retracting : null, speed: +Math.hypot(...s.vel).toFixed(1), y: +s.pos[1].toFixed(2) };
            const last = window.__slingTrace[window.__slingTrace.length - 1];
            if (!last || last.t !== rec.t) window.__slingTrace.push(rec);
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    });

    // real trigger: the flag a web tap (RMB / Shift / L) sets
    await page.evaluate(() => { window.__game.input.grabQ = true; });
    await page.waitForFunction(() => window.__game.sim.spring > 0, { timeout: 30000 });

    const beats = {};
    const marks = [
        ['coil', 0.34],     // the anticipation beat, webbing taut and fists locked
        ['pull', 0.305],    // still drawing in on the anchored lines, no catapult yet
        ['launch', 0.255],  // just after the launch beat: velocity on, webs letting go
        ['flight', 0.06],   // post-release flight
    ];
    for (const [name, mark] of marks) {
        await page.waitForFunction((v) => window.__game.sim.spring <= v, { timeout: 90000, polling: 10 }, mark);
        await page.evaluate(() => { window.__ts = 0; });
        await new Promise((r) => setTimeout(r, 120));
        beats[name] = await pose();
        await page.evaluate(() => { window.__ts = 0.12; });
    }

    for (const name of ['coil', 'pull', 'launch', 'flight']) {
        const m = beats[name];
        assert.equal(m.action, 'web-spring-launch', `${name}: the move is the web slingshot`);
        // centred: no roll on the body or the spine column, head on the hips' sagittal plane
        assert.ok(Math.abs(m.roll) < 0.02, `${name}: no body roll (${m.roll.toFixed(3)} rad)`);
        for (const s2 of m.spin) assert.ok(Math.abs(s2) < 0.06, `${name}: the spine column carries no sideways tilt (${m.spin.map((v) => v.toFixed(2)).join(', ')})`);
        for (const s2 of m.twist) assert.ok(Math.abs(s2) < 0.06, `${name}: the spine column carries no twist (${m.twist.map((v) => v.toFixed(2)).join(', ')})`);
        assert.ok(Math.abs(m.headLateral) < 0.10, `${name}: the head sits on the pull plane (${m.headLateral.toFixed(3)} m sideways)`);
        assert.ok(Math.abs(m.shoulderY[0]) < 0.04, `${name}: the shoulders stay level (${m.shoulderY[0].toFixed(3)} m)`);
    }
    // the pull: the slingshot pose owns the body, both fists locked on the line, both webs drawn and ON the anchor
    for (const name of ['coil', 'pull']) {
        const m = beats[name];
        assert.ok(m.pose > 0.9, `${name}: the slingshot pose owns the body (weight ${m.pose})`);
        for (const side of ['L', 'R']) {
            assert.ok(m[side].uarm < 10, `${name}: ${side} upper arm is on the line (${m[side].uarm.toFixed(1)} deg off)`);
            assert.ok(m[side].farm < 10, `${name}: ${side} forearm is on the line (${m[side].farm.toFixed(1)} deg off)`);
            assert.ok(m[side].arm < 10, `${name}: ${side} arm points at the anchor (${m[side].arm.toFixed(1)} deg off)`);
        }
        assert.ok(Math.abs(m.L.arm - m.R.arm) < 5, `${name}: the two arms agree (L ${m.L.arm.toFixed(1)}, R ${m.R.arm.toFixed(1)} deg)`);
        assert.ok(Math.abs(m.L.gap - m.R.gap) < 0.10, `${name}: both fists are the same distance from the anchor (${m.L.gap.toFixed(2)} / ${m.R.gap.toFixed(2)} m)`);
        assert.ok(Math.abs(m.handLateral[0] + m.handLateral[1]) < 0.10, `${name}: the fists mirror across the plane (${m.handLateral.map((v) => v.toFixed(2)).join(' / ')} m)`);
        assert.ok(Math.abs(m.handLateral[0] - m.handLateral[1]) > 0.25, `${name}: the fists are on both sides of the plane, not crossed`);
        assert.deepEqual(m.tether, [true, true], `${name}: both web lines are drawn`);
        assert.ok(m.webDbg.gripped && !m.webDbg.retracting, `${name}: both lines are holding the anchor`);
        assert.ok(m.webDbg.len[0] > 5 && m.webDbg.len[1] > 5, `${name}: the lines reach the anchor (${m.webDbg.len.join(' / ')} m)`);
        assert.ok(m.aimW > 0.9, `${name}: the fist aim is fully on the line (${m.aimW})`);
    }
    // the coil reads: knees tucked at the start, and the pull beat is a DRAW, not the catapult
    assert.ok(beats.coil.knee[0] < 115 && beats.coil.knee[1] < 115, `coil: both knees are tucked (${beats.coil.knee.map((k) => k.toFixed(0)).join(' / ')} deg)`);
    assert.ok(Math.abs(beats.coil.knee[0] - beats.coil.knee[1]) < 10, `coil: the knees mirror (${beats.coil.knee.map((k) => k.toFixed(0)).join(' / ')} deg)`);
    assert.ok(beats.pull.speed < 20, `pull: he is drawn in at pull speed, not launched yet (${beats.pull.speed.toFixed(1)} m/s)`);
    assert.ok(beats.pull.spring > 0 && beats.pull.rel < 0, `pull: the launch beat has not happened yet (spring ${beats.pull.spring.toFixed(3)})`);
    // the launch beat: the catapult fires, the webs let go, the aim starts to come off the line
    const launch = beats.launch;
    assert.ok(launch.rel > 0.09 && launch.rel < 0.16, `launch: the release lands on the launch beat (${launch.rel.toFixed(3)} s)`);
    assert.ok(launch.speed > 50, `launch: the slingshot velocity is on (${launch.speed.toFixed(1)} m/s)`);
    assert.ok(beats.pull.speed + 40 < launch.speed, `launch: the catapult fires after the pull (${beats.pull.speed.toFixed(1)} -> ${launch.speed.toFixed(1)} m/s)`);
    assert.ok(launch.aimW < 1, `launch: the fists start to come off the line (aim weight ${launch.aimW})`);
    // post-release flight: nothing is drawn, no web is left stretching back to the anchor
    const flight = beats.flight;
    assert.deepEqual(flight.tether, [false, false], 'flight: no web line is drawn after the release');
    assert.equal(flight.webDbg.mode, -1, 'flight: the webs are gone, not retargeted');
    assert.ok(flight.aimW === 0, `flight: the arms are free of the line (aim weight ${flight.aimW})`);
    assert.ok(flight.knee[0] > 150 && flight.knee[1] > 150, `flight: the legs are long (${flight.knee.map((k) => k.toFixed(0)).join(' / ')} deg)`);
    assert.ok(beats.coil.knee[0] + 30 < flight.knee[0], `the coil releases into the extension (${beats.coil.knee[0].toFixed(0)} -> ${flight.knee[0].toFixed(0)} deg)`);

    // after the pull: no flip, no webs, the body keeps soaring along the line
    await page.waitForFunction(() => window.__game.sim.spring <= 0, { timeout: 60000, polling: 10 });
    await page.evaluate(() => { window.__ts = 0.5; });
    await step(0.5, 0.5);
    const exit = await pose();
    await step(0.5, 0.5);
    const later = await pose();
    for (const [name, m] of [['exit', exit], ['exit+1s', later]]) {
        assert.equal(m.flip, false, `${name}: no release flip out of the slingshot`);
        assert.ok(Math.abs(m.roll) < 0.05, `${name}: still no roll (${m.roll.toFixed(3)} rad)`);
        assert.ok(m.vy > 0 || m.y > 30, `${name}: still climbing / arriving at the roof`);
        assert.ok(m.grapple || m.y > 30, `${name}: the slingshot flight is still the move`);
        assert.deepEqual(m.tether, [false, false], `${name}: no tether is left behind`);
    }
    assert.ok(later.y > 30, `exit: the arc still lands on the roof (y ${later.y.toFixed(2)} of ${fixture.b[4].toFixed(1)})`);

    // the frame trace: the release really is a release, and nothing is drawn afterwards
    const trace = await page.evaluate(() => { window.__slingOn = false; return window.__slingTrace; });
    const t0 = trace.find((f) => f.spring > 0);
    assert.ok(t0, 'trace: the trigger is in the record');
    const relFrame = trace.find((f) => f.rel > 0);
    assert.ok(relFrame, 'trace: the release frame is in the record');
    const afterRel = trace.filter((f) => f.rel > 0 && f.u - f.rel > 0.14);
    assert.ok(afterRel.length > 5, `trace: ${afterRel.length} post-release frames recorded`);
    const drawnAfter = afterRel.filter((f) => f.vis && (f.vis[0] || f.vis[1]));
    assert.equal(drawnAfter.length, 0, `trace: no web is drawn more than 0.14 s after the release (${drawnAfter.length} frames)`);
    const pullFrames = trace.filter((f) => f.spring > 0 && f.rel < 0 && f.u > 0.04);
    assert.ok(pullFrames.length > 3, `trace: ${pullFrames.length} anchored pull frames recorded`);
    assert.ok(pullFrames.every((f) => f.vis && f.vis[0] && f.vis[1] && f.gripped), 'trace: both lines hold the anchor through the pull');
    assert.ok(pullFrames.every((f) => f.speed < 20), `trace: the pull never carries launch speed (max ${Math.max(...pullFrames.map((f) => f.speed)).toFixed(1)} m/s)`);
    const drawnAfterMove = trace.filter((f) => f.spring <= 0 && f.vis && (f.vis[0] || f.vis[1]));
    assert.equal(drawnAfterMove.length, 0, 'trace: nothing is drawn once the move is over');

    assert.deepEqual(errors, [], `browser errors: ${errors.join(' | ')}`);
    console.log(JSON.stringify({ ok: true, fixture, beats, exit: { ...exit, L: undefined, R: undefined }, later: { ...later, L: undefined, R: undefined }, trace: { frames: trace.length, release: relFrame.rel, postReleaseDrawn: drawnAfter.length, pullFrames: pullFrames.length, lastDrawn: (() => { const d = trace.filter((f) => f.vis && (f.vis[0] || f.vis[1])); return d.length ? +d[d.length - 1].u.toFixed(3) : null; })() } }, null, 1));
} catch (e) {
    console.error(e);
    if (errors.length) console.error('Browser errors:', JSON.stringify(errors));
    process.exitCode = 1;
} finally {
    await browser.close();
}
