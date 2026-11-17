/*
 * Wall-run pose regression: holding RMB/Shift on a facade must keep the body against the wall with the
 * wall-side hand and foot planted on it, and must release back to the ordinary crawl.
 *
 * Needs an instrumented preview (VITE_DBG=1) served on PORT, e.g.
 *   VITE_DBG=1 npm run build && npx vite preview --port 4173 &
 *   CHROME_PATH=/path/to/chrome PORT=4173 node test/wall-run-pose.mjs
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
await page.setViewport({ width: 800, height: 520, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 200)); });

/** Wall-side hand/foot as measured on the drawn rig, in metres clear of the facade. */
async function contacts() {
    return page.evaluate(() => {
        const s = window.__game.sim, rig = window.__rig, b = rig.b, n = s.wall;
        const bld = window.__game.buildings[s.wallB];
        if (!n || !bld) return null;
        const axis = Math.abs(n[0]) > 0.5 ? 0 : 2;
        const surface = axis === 0 ? (n[0] < 0 ? bld.x0 : bld.x1) : (n[1] < 0 ? bld.z0 : bld.z1);
        const sign = (axis === 0 ? n[0] : n[1]) < 0 ? -1 : 1;
        const at = (bone) => { const v = new (bone.position.constructor)(); bone.getWorldPosition(v); return +(v.getComponent(axis) - surface) * sign; };
        const ang = s.ang;
        const wallSide = Math.sign(-n[0] * Math.cos(ang) + n[1] * Math.sin(ang)) || 1;
        const wallSideName = wallSide > 0 ? 'R' : 'L';
        const hips = at(b.hips), head = at(b.head);
        return {
            wallSide,
            hand: +at(b['hand' + wallSideName]).toFixed(3),
            foot: +at(b['foot' + wallSideName]).toFixed(3),
            trailFoot: +at(b['foot' + (wallSide > 0 ? 'L' : 'R')]).toFixed(3),
            hips: +hips.toFixed(3), head: +head.toFixed(3),
            roll: +Math.abs(rig.poseRoot.rotation.z).toFixed(3),
            weight: +(window.__shadowAnimation?.wallRunPoseWeight ?? 0).toFixed(2),
            action: window.__shadowAnimation?.action,
        };
    });
}

try {
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.__game, { timeout: 60000 });
    await page.evaluate(() => window.__game.start());
    await page.waitForFunction(() => window.__game.sim.mode === 'play', { timeout: 120000 });
    await new Promise((r) => setTimeout(r, 800));

    const fixture = await page.evaluate(() => {
        const g = window.__game, s = g.sim;
        const b = g.buildings.filter((x) => !x.ob && x.host === undefined && !x.sea && x.h > 24 && x.x1 - x.x0 > 18 && x.z1 - x.z0 > 18)
            .sort((p, q) => Math.min(q.x1 - q.x0, q.z1 - q.z0) - Math.min(p.x1 - p.x0, p.z1 - p.z0))[0];
        for (const e of s.enemies) { e.x = -400; e.z = -400; e.atk = 0; e.down = 1000; e.roof = undefined; }
        window.__ghostDisableCombat = true;
        const clear = (o) => { if (!o) return; o.mv = null; o.slam = null; o.atkT = 0; o.shotT = 0; o.snareT = 0; o.flip = null; };
        clear(s); clear(window.__ghostSim);
        window.__ts = 0.5;
        s.pos = [b.x0 - 0.25, 9, b.z0 + 2.5]; s.vel = [18, 0, 7]; s.yaw = Math.PI / 2; s.ang = s.yaw;
        s.ground = false; s.web = true; s.webT = 0.2; s.anchor = [...s.pos]; s.rope = 1000;
        s.wall = null; s.wallB = -1; s.wallT = 0; s.wallRun = false; s.spring = 0; s.webDepartB = undefined;
        g.input.swing = true; g.input.swingQ = false; g.input.mx = 0; g.input.my = 0.6;
        for (const k of Object.keys(g.input.keys)) g.input.keys[k] = false;
        return { x0: b.x0 };
    });

    await page.waitForFunction(() => window.__game.sim.wallRun && !!window.__game.sim.wall, { timeout: 30000 });
    const start = await page.evaluate(() => window.__game.sim.t);
    await page.waitForFunction((t) => window.__game.sim.t >= t + 0.4, { timeout: 60000 }, start).catch(() => {});

    const c = await contacts();
    assert.ok(c, 'the hero keeps a wall contact while the hold is down');
    assert.equal(c.action, 'wall-run', 'the hold keeps the wall-run action');
    assert.ok(c.weight > 0.8, `the wall-run pose is fully blended (weight ${c.weight})`);
    assert.ok(c.hand < 0.35, `wall-side palm must be on the facade (got ${c.hand} m)`);
    assert.ok(c.foot < 0.35, `wall-side foot must be planted on the facade (got ${c.foot} m)`);
    assert.ok(c.trailFoot > c.foot + 0.1, `the trailing foot stays back off the wall (near ${c.foot} m, trailing ${c.trailFoot} m)`);
    assert.ok(c.roll > 0.1, `the torso tips into the wall (roll ${c.roll} rad)`);
    assert.ok(c.hips > 0 && c.head > 0, 'nothing of the body is pushed inside the facade');

    // release returns to the ordinary crawl
    await page.evaluate(() => { window.__game.input.swing = false; window.__game.input.swingQ = false; });
    await page.waitForFunction(() => window.__game.sim.wallRun === false, { timeout: 30000 });
    const after = await page.evaluate(() => ({ action: window.__shadowAnimation?.action, wall: !!window.__game.sim.wall }));
    assert.equal(after.action, 'wall-crawl', 'releasing the hold leaves wall-run for the crawl');
    assert.equal(after.wall, true, 'the wall contact itself is kept after the release');
    assert.deepEqual(errors, [], `browser errors: ${errors.join(' | ')}`);
    console.log(JSON.stringify({ ok: true, fixture, contacts: c, released: after }, null, 1));
} catch (e) {
    console.error(e);
    if (errors.length) console.error('Browser errors:', JSON.stringify(errors));
    process.exitCode = 1;
} finally {
    await browser.close();
}
