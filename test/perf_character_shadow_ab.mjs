import puppeteer from 'puppeteer-core';

const base = process.argv[2] || 'http://127.0.0.1:5173';
const mode = process.argv[3] || 'phone';
const zoneNames = (process.argv[4] || 'street,lake').split(',');
const zones = {
    street: [0, 2, 0],
    rooftop: [0, 80, 0],
    ocean: [0, 2, -215],
    lake: [202, 3, 104],
};
const executablePath = process.env.CHROME || '/usr/bin/google-chrome';
const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
if (mode === 'phone') {
    await page.setUserAgent('Mozilla/5.0 (Linux; Android 10; SM-M025F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36');
    await page.setViewport({ width: 760, height: 360, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
} else {
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
}
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(`${base}/?debug&res=0.5`, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => !!window.__game, { timeout: 120000 });
await new Promise((resolve) => setTimeout(resolve, 1000));
await page.evaluate(() => window.__game.start());
await page.waitForFunction(() => window.__game.sim.mode === 'play' && !!window.__gl, { timeout: 180000, polling: 250 });
await page.waitForFunction(() => !!window.__characterShadowState, { timeout: 120000 });

const backend = await page.evaluate(() => {
    const gl = window.__gl.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const measure = async () => {
    const samples = await page.evaluate(() => new Promise((resolve) => {
        const out = [];
        let start = 0, prev = 0;
        const frame = (now) => {
            if (!start) start = now;
            const state = window.__characterShadowState || {};
            out.push({ dt: prev ? now - prev : 0, cpu: state.cpuMs || 0, actors: state.actors || 0, triangles: state.triangles || 0, nodes: state.nodes || 0, signature: state.signature || '' });
            prev = now;
            if (now - start < 2800) requestAnimationFrame(frame); else resolve(out);
        };
        requestAnimationFrame(frame);
    }));
    const quantile = (key, q) => {
        const values = samples.map((sample) => sample[key]).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
        return values.length ? +values[Math.min(values.length - 1, Math.floor((values.length - 1) * q))].toFixed(2) : 0;
    };
    let signatureChanges = 0;
    for (let i = 1; i < samples.length; i++) if (samples[i].signature !== samples[i - 1].signature) signatureChanges++;
    const last = samples.at(-1) || {};
    return { frames: samples.length, signatureChanges, frameMsP50: quantile('dt', 0.5), frameMsP90: quantile('dt', 0.9), updateCpuMsP50: quantile('cpu', 0.5), updateCpuMsP90: quantile('cpu', 0.9), actors: last.actors || 0, triangles: last.triangles || 0, nodes: last.nodes || 0 };
};

const results = {};
for (const name of zoneNames) {
    const position = zones[name];
    if (!position) throw new Error(`Unknown zone: ${name}`);
    await page.evaluate((p) => {
        const sim = window.__game.sim;
        sim.pos = p;
        sim.vel = [0, 0, 0];
        sim.web = false;
    }, position);
    await sleep(1800);
    const rows = { allCrowdEnemy: [], visibilityCull: [], heroBossOnly: [] };
    // Symmetric order reduces drift from the game clock and warm browser state.
    const arms = ['allCrowdEnemy', 'visibilityCull', 'heroBossOnly', 'heroBossOnly', 'visibilityCull', 'allCrowdEnemy'];
    for (const arm of arms) {
        await page.evaluate((which) => {
            window.__skipCrowdEnemyShadow = which === 'heroBossOnly';
            window.__noCharacterShadowCull = which === 'allCrowdEnemy';
        }, arm);
        await sleep(500);
        rows[arm].push(await measure());
    }
    const merge = (key) => {
        const runs = rows[key];
        const med = (field) => +runs.map((run) => run[field]).sort((a, b) => a - b)[Math.floor(runs.length / 2)].toFixed(2);
        return { runs: runs.length, actors: med('actors'), triangles: med('triangles'), nodes: med('nodes'), signatureChanges: med('signatureChanges'), updateCpuMsP50: med('updateCpuMsP50'), updateCpuMsP90: med('updateCpuMsP90'), frameMsP50: med('frameMsP50'), frameMsP90: med('frameMsP90') };
    };
    results[name] = { allCrowdEnemy: merge('allCrowdEnemy'), visibilityCull: merge('visibilityCull'), heroBossOnly: merge('heroBossOnly') };
    console.log(JSON.stringify({ zone: name, ...results[name] }));
}
console.log(JSON.stringify({ mode, backend, note: 'Software SwiftShader diagnostics only; these timings and frame intervals are not target-device FPS.', errors: errors.length, errorSamples: errors.slice(0, 3), results }));
await browser.close();
