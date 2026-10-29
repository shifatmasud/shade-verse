import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';

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
await new Promise((resolve) => setTimeout(resolve, 700));
await mkdir('art/ghost', { recursive: true });

const fixtures = await page.evaluate(() => {
    const g = window.__game, s = g.sim, blds = g.buildings;
    const parkHeight = (x, z) => { const e = Math.min(x - 100, 260 - x, z - 20, 180 - z); if (e <= 0) return 0; const t = Math.min(1, e / 34), w = t * t * (3 - 2 * t); return w * (-5 + 1.4 * Math.sin(x * 0.06 + 1) * Math.cos(z * 0.05)); };
    const floor = (x, z) => { let y = parkHeight(x, z); for (const b of blds) if (x > b.x0 + 0.25 && x < b.x1 - 0.25 && z > b.z0 + 0.25 && z < b.z1 - 0.25 && b.h > y) y = b.h; return y; };
    let street = null;
    for (let r = 0; r <= 36 && !street; r += 2) for (let i = 0; i < 32 && !street; i++) {
        const a = i * Math.PI / 16, x = s.pos[0] + Math.cos(a) * r, z = s.pos[2] + Math.sin(a) * r;
        if (floor(x, z) === 0) street = { x, y: 1, z, support: 0 };
    }
    if (!street) throw new Error('Could not find a street-ground fixture near the player');
    const park = { x: 180, y: 1 + parkHeight(180, 100), z: 100, support: parkHeight(180, 100) };
    const candidates = blds.filter((b) => b.host === undefined && b.h > 8 && b.x1 - b.x0 > 8 && b.z1 - b.z0 > 8);
    let roof = null;
    for (const b of candidates.sort((a, b2) => Math.hypot((a.x0 + a.x1) / 2 - s.pos[0], (a.z0 + a.z1) / 2 - s.pos[2]) - Math.hypot((b2.x0 + b2.x1) / 2 - s.pos[0], (b2.z0 + b2.z1) / 2 - s.pos[2]))) {
        for (const [u, v] of [[0.5, 0.5], [0.35, 0.35], [0.65, 0.35], [0.35, 0.65], [0.65, 0.65]]) {
            const x = b.x0 + (b.x1 - b.x0) * u, z = b.z0 + (b.z1 - b.z0) * v;
            if (floor(x, z) === b.h) { roof = { x, y: b.h + 1, z, support: b.h }; break; }
        }
        if (roof) break;
    }
    if (!roof) throw new Error('Could not find a clean rooftop landing fixture');
    const wallIndex = blds.map((b, i) => ({ b, i })).filter(({ b }) => b.host === undefined && b.h > 18 && b.h < 34 && Math.abs(b.x0) < 150 && Math.abs(b.z0) < 150).sort((a, c) => Math.hypot((a.b.x0 + a.b.x1) / 2 - s.pos[0], (a.b.z0 + a.b.z1) / 2 - s.pos[2]) - Math.hypot((c.b.x0 + c.b.x1) / 2 - s.pos[0], (c.b.z0 + c.b.z1) / 2 - s.pos[2]))[0]?.i ?? -1;
    if (wallIndex < 0) throw new Error('Could not find a wall-crawl fixture');
    const wall = blds[wallIndex], wallY = 1;
    return { street, park, roof, wall: { wallB: wallIndex, bounds: { ...wall }, x: wall.x0 - 1.2, y: wallY, z: (wall.z0 + wall.z1) / 2, face2z: wall.z0 - 1.2, face2x: (wall.x0 + wall.x1) / 2 } };
});

await page.evaluate(() => {
    const g = window.__game;
    window.__ts = 0;
    for (const e of g.sim.enemies) { e.down = 1000; e.atk = 0; }
    for (const key of Object.keys(g.input.keys)) g.input.keys[key] = false;
    g.input.mx = g.input.my = 0; g.input.swing = g.input.swingQ = g.input.jumpQ = false;
});

async function readState() {
    return page.evaluate(() => ({ state: window.__ghostState, player: window.__game.sim, actor: window.__ghostSim }));
}
async function waitFor(predicate, timeout = 2500) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
        const v = await readState();
        if (predicate(v)) return v;
        await new Promise((resolve) => setTimeout(resolve, 35));
    }
    return await readState();
}
async function placePair(point, airborne, extra = {}) {
    await page.evaluate(({ point, airborne, extra }) => {
        const s = window.__game.sim, a = window.__ghostSim;
        s.pos = [point.x, point.y + (airborne ? 8 : 0), point.z]; s.vel = [0, airborne ? -3 : 0, 0]; s.ground = !airborne; s.wall = null; s.wallB = -1; s.web = false; s.spring = 0; s.grappleFlight = false; s.swim = false; s.dive = false; s.glideOn = false; s.airT = airborne ? 0.6 : 0; s.land = 0; s.mv = null; s.flip = null; s.snareT = 0; s.shotT = 0; s.atkT = 0;
        Object.assign(s, extra);
        if (a) { a.pos = [point.x - 2, point.y + (airborne ? 6 : 0), point.z]; a.vel = [0, 0, 0]; a.ground = !airborne; a.wall = null; a.wallB = -1; a.web = false; a.spring = 0; a.swim = false; a.dive = false; a.glideOn = false; a.airT = airborne ? 0.5 : 0; a.mv = null; a.flip = null; a.snareT = 0; }
    }, { point, airborne, extra });
}

async function checkMorph(reason, options = {}) {
    let first = null, trace = [], screenshot = false;
    const frameTracePromise = page.evaluate(({ reason }) => new Promise((resolve) => {
        const frames = []; let seen = false, started = performance.now();
        const tick = () => {
            const st = window.__ghostState;
            if (st?.morphReason === reason && st.transport !== 'idle') {
                seen = true;
                frames.push({ phase: st.transport, t: st.morphT, opacity: st.bodyOpacity, position: st.position, target: st.morphTo, particles: st.particles, grounded: st.grounded, wallB: st.wallB, leaderWall: st.leaderWall, leaderWallB: st.leaderWallB });
            }
            if ((seen && st?.morphReason === reason && st.transport === 'idle') || performance.now() - started > 3000) return resolve(frames);
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }), { reason });
    const deadline = Date.now() + 2500;
    while (Date.now() < deadline) {
        const value = await readState(), st = value.state;
        if (st?.morphReason === reason && st.transport === 'out' && !first) first = st;
        if (st?.morphReason === reason && st.transport !== 'idle') {
            trace.push({ phase: st.transport, t: st.morphT, opacity: st.bodyOpacity, position: st.position, target: st.morphTo, particles: st.particles });
            if (options.capture && !screenshot && st.transport === 'out' && st.bodyOpacity > 0.15 && st.bodyOpacity < 0.9) {
                await page.evaluate(() => { const p = window.__game.sim.pos; window.__camOv = [p[0] - 8, p[1] + 5, p[2] - 12, p[0], p[1] + 3, p[2]]; });
                await new Promise((resolve) => setTimeout(resolve, 80));
                await page.screenshot({ path: 'art/ghost/shot-after-ghost-landing-morph-mobile-landscape.png' }); screenshot = true;
            }
        }
        if (first && st?.morphReason === reason && st.transport === 'idle') break;
        await new Promise((resolve) => setTimeout(resolve, 24));
    }
    const frameTrace = await frameTracePromise;
    let maxVisibleStep = 0, movedWhileVisible = [], snapped = false;
    for (let i = 1; i < frameTrace.length; i++) {
        const prev = frameTrace[i - 1], current = frameTrace[i];
        const d = Math.hypot(current.position[0] - prev.position[0], current.position[1] - prev.position[1], current.position[2] - prev.position[2]);
        if (d > 0.08) { maxVisibleStep = Math.max(maxVisibleStep, d); if (prev.opacity > 0.03 && current.opacity > 0.03) { movedWhileVisible.push({ d, previousOpacity: prev.opacity, opacity: current.opacity, phase: current.phase }); snapped = true; } }
    }
    const final = await readState(), st = final.state;
    const inPhase = frameTrace.find((t) => t.phase === 'in');
    const validSupport = options.ground ? Math.abs((first?.targetSupportY ?? 1e9) - (first?.leaderSurfaceY ?? -1e9)) <= 0.9 : true;
    const wallFrame = frameTrace.find((t) => t.phase === 'in');
    const wallValid = options.wall ? wallFrame?.wallB === options.wall.wallB && wallFrame?.grounded === false && !!wallFrame.leaderWall && wallFrame.leaderWallB === options.wall.wallB && first?.morphTo[1] >= 1.2 && first?.morphTo[1] <= options.wall.bounds.h - 0.65 && (options.face === 'x' ? first?.morphTo[0] >= options.wall.bounds.x0 - 1.5 && first?.morphTo[0] <= options.wall.bounds.x0 + 0.2 && first?.morphTo[2] >= options.wall.bounds.z0 + 1.1 && first?.morphTo[2] <= options.wall.bounds.z1 - 1.1 : first?.morphTo[2] >= options.wall.bounds.z0 - 1.5 && first?.morphTo[2] <= options.wall.bounds.z0 + 0.2 && first?.morphTo[0] >= options.wall.bounds.x0 + 1.1 && first?.morphTo[0] <= options.wall.bounds.x1 - 1.1) : true;
    return { ok: !!first && !!inPhase && st?.transport === 'idle' && first.particles === 96 && validSupport && wallValid && !snapped && frameTrace.every((t) => t.particles === 96), reason, validSupport, wallValid, noVisibleSnap: !snapped, maxPositionStep: +maxVisibleStep.toFixed(3), movedWhileVisible, start: first, inPhase, final: { transport: st?.transport, position: st?.position, target: st?.target, grounded: st?.grounded, wallB: st?.wallB, morphReason: st?.morphReason, leaderGround: st?.leaderGround, leaderWall: st?.leaderWall, leaderWallB: st?.leaderWallB, surfaceTransition: st?.surfaceTransition, wallEntered: st?.wallEntered }, trace: frameTrace.slice(0, 8), screenshot };
}

const results = [];
for (const point of [fixtures.street, fixtures.park, fixtures.roof]) {
    await placePair(point, true);
    await waitFor((v) => !v.player.ground && v.state?.transport === 'idle' && v.state?.animation?.action === 'airborne');
    await new Promise((resolve) => setTimeout(resolve, 100));
    await placePair(point, false, { land: 0.22 });
    const result = await checkMorph('ground-landing', { ground: true, capture: point === fixtures.street });
    result.surface = point === fixtures.street ? 'street' : point === fixtures.park ? 'park' : 'rooftop';
    result.supportY = point.support;
    results.push(result);
    if (!result.ok) break;
}

if (results.length === 3) {
    const wall = fixtures.wall;
    await page.evaluate(({ wall }) => {
        const g = window.__game, s = g.sim, a = window.__ghostSim;
        s.pos = [wall.x, 1, wall.z]; s.vel = [0, 0, 0]; s.wall = null; s.wallB = -1; s.ground = true; s.yaw = s.ang = Math.PI / 2; s.web = false; s.glideOn = false; s.swim = false;
        if (a) { a.pos = [wall.x - 2, 1, wall.z]; a.vel = [0, 0, 0]; a.ground = true; a.wall = null; a.wallB = -1; }
        g.input.keys.w = true; window.__ts = 1;
    }, { wall });
    await page.waitForFunction(() => !!window.__game.sim.wall, { timeout: 2500 });
    await page.evaluate(() => { window.__game.input.keys.w = false; window.__game.input.my = 0.35; window.__ts = 1; });
    let entry = await checkMorph('wall-entry', { wall, face: 'x' }); entry.surface = 'first-wall-entry'; results.push(entry);

}

const ok = results.length === 4 && results.every((r) => r.ok) && errors.length === 0;
console.log(JSON.stringify({ ok, viewport: '844x390 phone landscape', fixtures, results, errors }));
await browser.close();
process.exit(ok ? 0 : 1);
