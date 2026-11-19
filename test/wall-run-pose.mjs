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
        const V = (bone) => { const v = new (bone.position.constructor)(); bone.getWorldPosition(v); return v; };
        const hips3 = V(b.hips), thW3 = V(b['thigh' + wallSideName]), shW3 = V(b['shin' + wallSideName]), ftW3 = V(b['foot' + wallSideName]);
        const thF3 = V(b['thigh' + (wallSide > 0 ? 'L' : 'R')]), shF3 = V(b['shin' + (wallSide > 0 ? 'L' : 'R')]), ftF3 = V(b['foot' + (wallSide > 0 ? 'L' : 'R')]);
        const knee = (hip, kn, ft) => { const u = new (hip.constructor)().subVectors(kn, hip), w = new (hip.constructor)().subVectors(ft, kn); const c = Math.max(-1, Math.min(1, u.dot(w) / (u.length() * w.length()))); return Math.acos(c) * 180 / Math.PI; }; // 0 = straight, 90 = right angle
        const tangent = [-n[1], 0, n[0]];
        const travel = Math.sign(s.vel[0] * tangent[0] + s.vel[2] * tangent[2]) || 1;
        const along = (p) => (p.x - hips3.x) * tangent[0] * travel + (p.z - hips3.z) * tangent[2] * travel;
        const nv = new (hips3.constructor)(n[0], 0, n[1]).normalize();
        const seg = V(b.head).sub(V(b.hips));
        return {
            wallSide,
            hand: +at(b['hand' + wallSideName]).toFixed(3),
            foot: +at(b['foot' + wallSideName]).toFixed(3),
            trailFoot: +at(b['foot' + (wallSide > 0 ? 'L' : 'R')]).toFixed(3),
            hips: +hips.toFixed(3), head: +head.toFixed(3),
            roll: +Math.abs(rig.poseRoot.rotation.z).toFixed(3),
            weight: +(window.__shadowAnimation?.wallRunPoseWeight ?? 0).toFixed(2),
            action: window.__shadowAnimation?.action,
            hipsClear: +at(b.hips).toFixed(3),
            leanDeg: +(Math.atan2(Math.abs(seg.dot(nv)), Math.abs(seg.y)) * 180 / Math.PI).toFixed(1),
            leanOut: seg.dot(nv) > 0,          // head further from the facade than the hips = the marked 45 deg diagonal
            hull: window.__wc ? window.__wc.hull : null,          // deepest skinned point, metres clear of the facade
            hullCorr: window.__wc ? window.__wc.corr : null,      // the scene's push-out that correction asked for
            speed: +Math.hypot(...s.vel).toFixed(1),
            wallKnee: +knee(thW3, shW3, ftW3).toFixed(1),          // bend in degrees: 0 = straight, 90 = folded up
            freeKnee: +knee(thF3, shF3, ftF3).toFixed(1),
            wsAlong: +along(ftW3).toFixed(2),
            freeAlong: +along(ftF3).toFixed(2),
            wsDrop: +(ftW3.y - hips3.y).toFixed(2),
            freeDrop: +(ftF3.y - hips3.y).toFixed(2),
        };
    });
}

try {
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
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
        window.__dbgWall = true;   // expose the scene's hull push-out (window.__wc)
        return { x0: b.x0, z0: b.z0 };
    });

    await page.waitForFunction(() => window.__game.sim.wallRun && !!window.__game.sim.wall, { timeout: 30000 });
    const start = await page.evaluate(() => window.__game.sim.t);
    await page.waitForFunction((t) => window.__game.sim.t >= t + 0.4, { timeout: 60000 }, start).catch(() => {});

    const c = await contacts();
    assert.ok(c, 'the hero keeps a wall contact while the hold is down');
    // Shifat Nov 19, the cyan line: the whole body is a ~45 deg diagonal OUT of the facade, not upright against it
    assert.ok(c.leanOut, `the body leans away from the facade (head ${c.head} m, hips ${c.hips} m clear)`);
    assert.ok(c.leanDeg > 38 && c.leanDeg < 50, `the body axis holds the marked ~45 deg off vertical (${c.leanDeg} deg)`);
    assert.ok(c.head - c.hips > 0.55, `the chest and head travel out over open air (head ${(c.head - c.hips).toFixed(2)} m further out than the hips)`);
    assert.ok(c.foot < 0.45, `the wall-side sole stays on the facade's side of the gap (${c.foot} m clear)`);
    // the legs are the game's own run clip, so they cycle off the wall and plant on their contact beat: the body has to
    // stay OUT of the facade on every phase (strict), and has to come onto it somewhere in the cycle (that beat is the contact)
    // `hull` is measured before the scene's push-out is applied, so a small positive value is the pose reaching into the
    // wall on its contact beat (the guard then holds the drawn body on the facade); the guard's own correction is bounded below
    assert.ok(c.hull === null || c.hull < 0.12, `the running legs only reach the facade, never through it (deepest point ${c.hull} m)`);
    assert.ok(c.hullCorr === null || Math.abs(c.hullCorr) < 0.15, `the wall-run pose, not the scene's hull guard, owns the stand-off (${c.hullCorr} m)`);
    // Shifat Nov 19: wall-run and wall-crawl are ~1.6x faster (18 -> 28, 16 -> 26, 18 -> 24 m/s)
    assert.ok(c.speed >= 21, `the run enters and holds wall-run speed (${c.speed} m/s, 28 target)`);
    // sample the stride: the legs must scissor, never fold into a crouch
    const samples = [];
    // step the clock by hand (__ts) so the sampling covers a whole stride cycle without the hero running off the facade
    await page.evaluate(() => { window.__ts = 0; });
    for (let i = 0; i < 40; i++) {
        const m = await contacts(); if (m) samples.push(m);
        await page.evaluate(() => new Promise((res) => { window.__ts = 0.45; setTimeout(() => { window.__ts = 0; res(); }, 110); }));
    }
    await page.evaluate(() => { window.__ts = 1; });
    const wallBends = samples.map((m) => m.wallKnee), freeBends = samples.map((m) => m.freeKnee);
    const straightest = Math.min(...wallBends, ...freeBends);          // 0 = a leg is straight out
    const mostTucked = Math.max(...wallBends, ...freeBends);           // a knee drives up in the swing
    const minWallDrop = Math.min(...samples.map((m) => m.wsDrop), ...samples.map((m) => m.freeDrop));
    const maxSplit = Math.max(...samples.map((m) => Math.abs(m.wsAlong - m.freeAlong)));
    const hipClears = samples.map((m) => m.hipsClear);

    assert.ok(straightest < 30, `a leg runs straight out in the stride - not a permanent crouch (straightest knee bend ${straightest.toFixed(0)} deg)`);
    assert.ok(mostTucked > 55, `a knee drives up in the swing (deepest knee bend ${mostTucked.toFixed(0)} deg)`);
    assert.ok(minWallDrop < -0.9, `the extended leg hangs long below the hip (foot ${minWallDrop.toFixed(2)} m)`);
    assert.ok(maxSplit > 0.55, `the two legs scissor apart along the run (max split ${maxSplit.toFixed(2)} m)`);
    const hulls = samples.map((m) => m.hull).filter((v) => v !== null);
    assert.ok(hulls.length && Math.max(...hulls) < 0.12, `the running legs never reach more than a boot's sole into the facade (deepest ${Math.max(...hulls)} m)`);
    assert.ok(hulls.length && Math.min(...hulls) < -0.02, `the body comes onto the facade on the stride's contact beat (closest ${Math.min(...hulls)} m)`);
    assert.ok(Math.min(...hipClears) > 0.6 && Math.max(...hipClears) < 1.25, `the hip keeps its distance from the facade so the legs can extend (${Math.min(...hipClears).toFixed(2)}-${Math.max(...hipClears).toFixed(2)} m)`);

    // release returns to the ordinary crawl
    await page.evaluate(() => { window.__game.input.swing = false; window.__game.input.swingQ = false; });
    await page.waitForFunction(() => window.__game.sim.wallRun === false, { timeout: 30000 });
    const after = await page.evaluate(() => ({ action: window.__shadowAnimation?.action, wall: !!window.__game.sim.wall }));
    assert.equal(after.action, 'wall-crawl', 'releasing the hold leaves wall-run for the crawl');
    assert.equal(after.wall, true, 'the wall contact itself is kept after the release');

    // the crawl's own speeds: 26 m/s up the facade, 24 m/s along it
    const crawl = await page.evaluate(async () => {
        const g = window.__game, s = g.sim, n = s.wall;
        if (!n) return null;
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const advance = async (sec) => { const t0 = s.t; for (let i = 0; i < 400 && s.t < t0 + sec; i++) await wait(50); };
        const t = [-n[1], 0, n[0]];
        g.input.swing = false; g.input.mx = 0; g.input.my = 1;
        s.yaw = Math.atan2(-n[0], -n[1]);            // face into the facade
        s.ang = s.yaw; s.vel = [0, 0, 0];
        await advance(0.5);
        const up = +s.vel[1].toFixed(1);
        s.yaw = Math.atan2(t[0], t[2]); s.ang = s.yaw;   // face along the facade
        s.vel = [0, 0, 0];
        await advance(0.5);
        const lat = +Math.hypot(s.vel[0], s.vel[2]).toFixed(1);
        g.input.my = 0;
        return { up, lat, wall: !!s.wall };
    });
    assert.ok(crawl && crawl.up > 22, `the crawl climbs at the new speed (${crawl && crawl.up} m/s, 26 target)`);
    assert.ok(crawl && crawl.lat > 18, `the crawl moves sideways at the new speed (${crawl && crawl.lat} m/s, 24 target)`);

    // the faster climb still tops out cleanly: the vault puts him on the roof, not through it
    const vault = await page.evaluate(async () => {
        const g = window.__game, s = g.sim, n = s.wall;
        if (!n) return null;
        const b = g.buildings[s.wallB], wait = (ms) => new Promise((r) => setTimeout(r, ms));
        s.pos = [b.x0 - 0.35, b.h - 2.2, (b.z0 + b.z1) / 2]; s.vel = [0, 0, 0];
        s.yaw = Math.atan2(-n[0], -n[1]); s.ang = s.yaw;
        g.input.my = 1; g.input.mx = 0; g.input.swing = false;
        for (let i = 0; i < 400 && !(s.ground && !s.wall); i++) await wait(50);
        g.input.my = 0;
        return { ground: s.ground, wall: !!s.wall, y: +s.pos[1].toFixed(2), roof: +b.h.toFixed(2) };
    });
    assert.ok(vault && vault.ground && !vault.wall, `the climb tops out and vaults onto the roof (${JSON.stringify(vault)})`);
    assert.ok(vault && Math.abs(vault.y - (vault.roof + 1.02)) < 1.5, `he lands on the roof surface, not short of it (${JSON.stringify(vault)})`);
    assert.deepEqual(errors, [], `browser errors: ${errors.join(' | ')}`);
    console.log(JSON.stringify({ ok: true, fixture, contacts: c, lean: { deg: c.leanDeg, outward: c.leanOut, headOverHips: +(c.head - c.hips).toFixed(2), hull: c.hull, hullCorr: c.hullCorr }, legRange: { straightest, mostTucked, minWallDrop, maxSplit, hipClears: [Math.min(...hipClears), Math.max(...hipClears)] }, speeds: { run: c.speed, ...crawl }, vault, released: after }, null, 1));
} catch (e) {
    console.error(e);
    if (errors.length) console.error('Browser errors:', JSON.stringify(errors));
    process.exitCode = 1;
} finally {
    await browser.close();
}
