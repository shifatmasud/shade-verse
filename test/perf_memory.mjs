import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const port = process.argv[2] || '5175';
const outPath = path.resolve(process.argv[3] || '/tmp/shade-verse-perf-memory-before.json');
const browser = await puppeteer.launch({
    executablePath: process.env.CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--expose-gc'],
});
const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 (Linux; Android 11; SM-M025F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36');
await page.setViewport({ width: 760, height: 360, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function browserTreeMemory(rootPid) {
    const entries = fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x));
    const byPid = new Map();
    for (const id of entries) {
        try {
            const status = fs.readFileSync(`/proc/${id}/status`, 'utf8');
            const ppid = Number(status.match(/^PPid:\s+(\d+)/m)?.[1] || 0);
            const rss = Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] || 0) * 1024;
            const cmd = fs.readFileSync(`/proc/${id}/cmdline`, 'utf8').replaceAll('\0', ' ').trim().slice(0, 180);
            byPid.set(Number(id), { pid: Number(id), ppid, rssBytes: rss, cmd });
        } catch { /* process exited or access denied */ }
    }
    const out = [], stack = [rootPid], seen = new Set();
    while (stack.length) {
        const pid = stack.pop(); if (seen.has(pid)) continue; seen.add(pid);
        const e = byPid.get(pid); if (e) out.push(e);
        for (const item of byPid.values()) if (item.ppid === pid) stack.push(item.pid);
    }
    return { rootPid, processes: out, summedRssBytes: out.reduce((a, e) => a + e.rssBytes, 0) };
}

try {
    const cdp = await page.createCDPSession();
    await cdp.send('Performance.enable');
    await page.goto(`http://127.0.0.1:${port}/?debug`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => !!window.__game, { timeout: 120000 });
    await page.evaluate(() => window.__game.start());
    await page.waitForFunction(() => window.__game.sim.mode === 'play' && !!window.__audio?.engine && !!window.__gl, { timeout: 180000, polling: 200 });
    await page.waitForFunction(() => [...window.__audio.engine.bytes.keys()].filter((n) => n.startsWith('vo_')).length >= 282, { timeout: 60000, polling: 250 }).catch(() => {});
    await sleep(700);

    const measurePage = async () => {
        const pageData = await page.evaluate(async () => {
            const e = window.__audio?.engine;
            const voice = (n) => n.startsWith('vo_');
            const buffers = e ? [...e.bufs.entries()] : [];
            const decodedBytes = (b) => b.length * b.numberOfChannels * Float32Array.BYTES_PER_ELEMENT;
            let encodedVoiceBytes = 0, encodedSettled = 0, encodedFailed = 0;
            if (e) for (const [name, promise] of e.bytes.entries()) if (voice(name)) {
                try { const ab = await promise; encodedVoiceBytes += ab.byteLength; encodedSettled++; } catch { encodedFailed++; }
            }
            let uaMemory = null, uaMemoryError = null;
            if (typeof performance.measureUserAgentSpecificMemory === 'function') {
                try { const m = await performance.measureUserAgentSpecificMemory(); uaMemory = { bytes: m.bytes, breakdown: m.breakdown?.map((x) => ({ bytes: x.bytes, types: x.types })) }; }
                catch (err) { uaMemoryError = String(err); }
            } else uaMemoryError = 'not supported by this Chromium/page context';
            const audioRows = buffers.map(([name, b]) => ({ name, bytes: decodedBytes(b), duration: b.duration, channels: b.numberOfChannels }));
            const voiceRows = audioRows.filter((x) => voice(x.name));
            return {
                mode: window.__game?.sim?.mode,
                audio: {
                    codec: e?.ext ?? null,
                    encodedVoiceEntries: e ? [...e.bytes.keys()].filter(voice).length : 0,
                    encodedVoiceBytes,
                    encodedSettled,
                    encodedFailed,
                    decodedVoiceCount: voiceRows.length,
                    decodedVoiceBytes: voiceRows.reduce((a, x) => a + x.bytes, 0),
                    decodedVoiceNames: voiceRows.map((x) => x.name),
                    decodedAllCount: audioRows.length,
                    decodedAllBytes: audioRows.reduce((a, x) => a + x.bytes, 0),
                    voiceBufferDetails: voiceRows,
                },
                v8: performance.memory ? { usedHeapBytes: performance.memory.usedJSHeapSize, totalHeapBytes: performance.memory.totalJSHeapSize, heapLimitBytes: performance.memory.jsHeapSizeLimit } : null,
                userAgentSpecificMemory: uaMemory,
                userAgentSpecificMemoryError: uaMemoryError,
                gl: {
                    worldDpr: window.__tel?.worldDpr,
                    canvasDpr: window.__tel?.canvasDpr,
                    rendererDpr: window.__tel?.rendererDpr,
                    geometries: window.__gl?.info?.memory?.geometries,
                    textures: window.__gl?.info?.memory?.textures,
                    calls: window.__gl?.info?.render?.calls,
                    triangles: window.__gl?.info?.render?.triangles,
                },
            };
        });
        let perfMetrics = null, domCounters = null;
        try {
            const p = await cdp.send('Performance.getMetrics');
            perfMetrics = Object.fromEntries(p.metrics.filter((m) => ['JSHeapUsedSize', 'JSHeapTotalSize', 'Nodes', 'Documents', 'JSEventListeners'].includes(m.name)).map((m) => [m.name, m.value]));
        } catch (e) { perfMetrics = { error: String(e) }; }
        try { domCounters = await cdp.send('Memory.getDOMCounters'); } catch (e) { domCounters = { error: String(e) }; }
        return { page: pageData, cdp: { perfMetrics, domCounters }, browserProcessTree: browserTreeMemory(browser.process().pid) };
    };

    if (typeof page.evaluate === 'function') await page.evaluate(() => { try { window.gc?.(); } catch {} });
    await sleep(500);
    const initial = await measurePage();
    const stress = await page.evaluate(async () => {
        const e = window.__audio.engine;
        const names = Array.from({ length: 30 }, (_, i) => `vo_cg_${i}`);
        const startedAt = performance.now();
        await Promise.all(names.map((n) => e.load(n)));
        return { names, elapsedMs: performance.now() - startedAt, decodedVoices: [...e.bufs.keys()].filter((n) => n.startsWith('vo_')).length };
    });
    await page.evaluate(() => { try { window.gc?.(); } catch {} });
    await sleep(500);
    const after30VoiceStress = await measurePage();
    const result = {
        environment: 'Chromium SwiftShader diagnostic on the sandbox host; not device RSS/GPU/audio-process measurements',
        viewportCss: { width: 760, height: 360, deviceScaleFactor: 2 },
        pageErrors: errors,
        phases: { initial, voiceStress: stress, after30VoiceStress },
        limitations: [
            'performance.memory and CDP JS heap exclude GPU-driver allocations and can exclude native AudioBuffer storage.',
            'Chromium process-tree RSS is host/SwiftShader memory and includes browser, renderer, GPU, and utility processes; it is not Intel UHD 600 or Adreno 506 device memory.',
            'renderer.info exposes texture/geometry counts, not their actual GPU byte totals.',
            'AudioBuffer byte estimates use length × channels × 4 bytes per sample and are exact for the exposed Float32 channel data, but do not include decoder scratch buffers or browser-native overhead.',
        ],
    };
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
    if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
} finally {
    await browser.close();
}
