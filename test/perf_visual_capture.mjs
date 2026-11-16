import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const port = process.argv[2] || '5175';
const outDir = path.resolve(process.argv[3] || 'evidence/performance-review/capture');
const profile = (process.argv[4] || 'android').toLowerCase();
const desktop = profile === 'desktop';
const viewport = desktop
    ? { width: 1366, height: 768, deviceScaleFactor: 1, hasTouch: false, isMobile: false }
    : { width: 844, height: 390, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
const userAgent = desktop
    ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36 Edg/155.0.0.0'
    : 'Mozilla/5.0 (Linux; Android 10; SM-M025F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36';
const water = { x: 30, z: -262 }; // verified sea test coordinates from test/waterline_cam.mjs
fs.mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
    executablePath: process.env.CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
await page.setUserAgent(userAgent);
await page.setViewport(viewport);
const errors = [], consoleErrors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readDiagnostics = () => page.evaluate(async () => {
    const { QUALITY } = await import('/src/quality.ts');
    const { GS_W, GS_N } = await import('/src/water/gpuSplash.ts');
    const gl = window.__gl, ds = window.__dbgStats;
    return {
        mode: window.__game?.sim?.mode,
        dpr: {
            world: window.__tel?.worldDpr,
            canvas: window.__tel?.canvasDpr,
            renderer: gl?.getPixelRatio(),
            cssDevice: window.devicePixelRatio,
            scaler: window.__tel?.scale,
            buffer: gl?.domElement ? { width: gl.domElement.width, height: gl.domElement.height } : null,
        },
        draw: {
            calls: ds?.calls ?? window.__tel?.calls,
            triangles: ds?.tris ?? window.__tel?.tris,
            frameMs: window.__tel?.ms,
            renderCpuMs: ds?.cpu,
            gameLogicMs: ds?.logic,
        },
        quality: { tier: QUALITY.tier, gpu: QUALITY.gpu, weakGpu: QUALITY.weakGpu, coarse: QUALITY.coarse },
        shadowMap: window.__shadowMapInfo ? { ...window.__shadowMapInfo } : null,
        splash: { width: GS_W, particles: GS_N },
        webgl2: !!gl?.capabilities?.isWebGL2,
        floatColorTarget: !!gl?.extensions?.has('EXT_color_buffer_float'),
    };
});

async function pinAndRead(scale) {
    await page.evaluate((s) => { window.__perfPin = s; }, scale);
    await sleep(1800);
    const d = await readDiagnostics();
    if (!d.dpr.world || d.dpr.world < 0.8 - 0.015) throw new Error(`Actual world DPR violated lock at requested scaler ${scale}: ${JSON.stringify(d.dpr)}`);
    return d;
}

async function setStreet() {
    await page.evaluate(() => {
        const s = window.__game.sim; s.pos = [0, 2, 0]; s.vel = [0, 0, 0]; s.web = false; s.swim = false; s.dive = false; s.yaw = 0; s.pitch = 0;
        window.__camOv = null;
    });
}

async function setSeaUnderwaterView() {
    await page.evaluate(({ x, z }) => {
        const s = window.__game.sim; s.pos = [x, -1.3, z + 8]; s.vel = [0, 0, 0]; s.web = false; s.swim = true; s.dive = false; s.yaw = 0; s.ang = 0;
        window.__camOv = [x, -1, z, x, -1, z - 10];
    }, water);
    await sleep(1600);
    // Reuse the project's waterline probe so the surface—not a nearby city prop—is in view.
    let cy = -1;
    for (let i = 0; i < 3; i++) {
        const dy = await page.evaluate(() => window.__wl ? window.__wl[1] : null);
        if (typeof dy !== 'number' || !Number.isFinite(dy)) break;
        cy = cy - dy + 0.04;
        await page.evaluate(({ x, z, cy }) => { window.__camOv = [x, cy, z, x, cy, z - 10]; }, { ...water, cy });
        await sleep(700);
    }
}

async function setSeaSurfaceView() {
    await page.evaluate(async ({ x, z }) => {
        const { waterRenderY } = await import('/src/water/waveHeight.ts');
        const sim = window.__game.sim, y = waterRenderY(x, z, sim.t);
        sim.pos = [x, y - 1.3, z + 8]; sim.vel = [0, 0, 0]; sim.web = false; sim.swim = true; sim.dive = false; sim.yaw = 0; sim.ang = 0;
        // Look down at the impact point from just above the surface, keeping it visible during the splash recording.
        window.__camOv = [x, y + 2.5, z + 8, x, y, z];
    }, water);
    await sleep(900);
}

async function doWaterImpact() {
    return page.evaluate(async ({ x, z }) => {
        const { waterImpact } = await import('/src/water/WaterFX.tsx');
        const { waterRenderY } = await import('/src/water/waveHeight.ts');
        const y = waterRenderY(x, z, window.__game.sim.t);
        waterImpact(x, y, z, 14, 0.55);
        return { x, y, z };
    }, water);
}

try {
    await page.goto(`http://127.0.0.1:${port}/?debug`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => !!window.__game, { timeout: 120000 });
    await page.evaluate(() => window.__game.start());
    await page.waitForFunction(() => window.__game.sim.mode === 'play' && !!window.__tel && !!window.__gl, { timeout: 180000, polling: 250 });

    // Input smoke check. This records existing behavior without changing controls or gameplay.
    await setStreet(); await sleep(600);
    const beforeMove = await page.evaluate(() => [...window.__game.sim.pos]);
    await page.keyboard.down('w'); await sleep(700); await page.keyboard.up('w'); await sleep(300);
    const afterMove = await page.evaluate(() => [...window.__game.sim.pos]);
    const movementDelta = Math.hypot(...afterMove.map((v, i) => v - beforeMove[i]));

    // Probe a below-lock request; the actual environment DPR must remain >= 0.8.
    await page.evaluate(() => { window.__perfPin = 0.75; });
    await sleep(1800);
    const floorProbe = await readDiagnostics();
    if (!floorProbe.dpr.world || floorProbe.dpr.world < 0.8 - 0.015) throw new Error(`Scale pin bypassed locked 0.8 world DPR: ${JSON.stringify(floorProbe.dpr)}`);

    await setStreet();
    const atLockedFloor = await pinAndRead(1.0);
    await page.screenshot({ path: path.join(outDir, 'world-dpr-0.8.png') });
    const streetAtFloor = await readDiagnostics();
    await page.screenshot({ path: path.join(outDir, 'street-shadow-dpr-0.8.png') });

    await setSeaUnderwaterView();
    const underwaterAtFloor = await pinAndRead(1.0);
    await page.screenshot({ path: path.join(outDir, 'water-underwater-dpr-0.8.png') });

    await setSeaSurfaceView();
    const surfaceAtFloor = await pinAndRead(1.0);
    const stillImpact = await doWaterImpact();
    await sleep(220);
    await page.screenshot({ path: path.join(outDir, 'water-splash-dpr-0.8.png') });

    // Attempt a higher, still-valid actual world DPR; report and name the file by what the tier really allows.
    await setSeaSurfaceView();
    const highestAllowedDpr = await pinAndRead(1.25);
    const highDprFile = `water-highest-allowed-dpr-${highestAllowedDpr.dpr.world.toFixed(1)}.png`;
    await page.screenshot({ path: path.join(outDir, highDprFile) });

    // Record a real water impact at the verified sea coordinates at locked DPR 0.8.
    await pinAndRead(1.0);
    await setSeaSurfaceView();
    const recordingImpact = await doWaterImpact();
    await sleep(180);
    const frames = [];
    for (let i = 0; i < 30; i++) { frames.push(await page.screenshot({ type: 'png' })); await sleep(100); }
    const videoPath = path.join(outDir, 'water-splash-world-dpr-0.8.mp4');
    const video = spawnSync('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', '10', '-vcodec', 'png', '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '25', '-pix_fmt', 'yuv420p', videoPath], { input: Buffer.concat(frames), maxBuffer: 256 * 1024 * 1024, encoding: 'utf8' });
    if (video.status !== 0) throw new Error(`ffmpeg failed: ${video.stderr || video.stdout}`);

    const report = {
        environment: 'Sandbox Chromium using SwiftShader; simulated user-agent/viewport only, not Intel UHD 600/Edge or Adreno 506/Chrome hardware evidence.',
        profile, userAgent, viewport,
        lock: { minimumActualWorldDpr: 0.8, belowFloorRequestScaler: 0.75, observedBelowFloorRequest: floorProbe.dpr },
        input: { before: beforeMove, after: afterMove, distance: +movementDelta.toFixed(3), moved: movementDelta > 0.05 },
        locations: { sea: water, projectReference: 'test/waterline_cam.mjs', stillImpact },
        captures: {
            actualWorldDpr0_8: atLockedFloor,
            streetAtFloor,
            underwaterAtFloor,
            surfaceAtFloor,
            highestAllowedWorldDpr: highestAllowedDpr,
        },
        recording: { path: path.basename(videoPath), frames: frames.length, fps: 10, durationSeconds: 3, impact: recordingImpact, purpose: 'visual screen recording only; not performance timing' },
        pageErrors: errors,
        consoleErrors: consoleErrors.filter((e) => /shader|compile|webgl/i.test(e)).slice(0, 20),
        files: ['world-dpr-0.8.png', 'street-shadow-dpr-0.8.png', 'water-underwater-dpr-0.8.png', 'water-splash-dpr-0.8.png', highDprFile, path.basename(videoPath)],
    };
    fs.writeFileSync(path.join(outDir, 'visual-capture-metrics.json'), JSON.stringify(report, null, 2) + '\n');
    if (movementDelta <= 0.05) throw new Error(`Keyboard movement did not respond: ${JSON.stringify(report.input)}`);
    if ([floorProbe, atLockedFloor, streetAtFloor, underwaterAtFloor, surfaceAtFloor, highestAllowedDpr].some((x) => x.dpr.world < 0.8 - 0.015)) throw new Error(`World DPR lock check failed: ${JSON.stringify(report.captures)}`);
    if (errors.length || report.consoleErrors.length) throw new Error(`visual/shader errors: ${JSON.stringify({ errors, consoleErrors: report.consoleErrors })}`);
    console.log(JSON.stringify(report, null, 2));
} finally {
    await browser.close();
}
