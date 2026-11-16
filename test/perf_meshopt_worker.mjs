import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const port = process.argv[2] || '5175';
const preload = fs.readFileSync(new URL('../src/preloadList.ts', import.meta.url), 'utf8');
const assets = [...preload.matchAll(/"(\/polyfork\/[^"\n]+\.glb)"/g)].map((m) => m[1]);
if (!assets.length) throw new Error('No preloaded GLB assets found');

const browser = await puppeteer.launch({
    executablePath: process.env.CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

async function run(mode) {
    const page = await browser.newPage();
    await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${port}/?meshoptBench=${mode}`, { waitUntil: 'load', timeout: 120000 });
    const result = await page.evaluate(async ({ mode, assets }) => {
        const { MeshoptDecoder } = await import('/node_modules/three/examples/jsm/libs/meshopt_decoder.module.js');
        if (mode === 'worker') MeshoptDecoder.useWorkers(1);

        let active = false, lastTick = performance.now();
        const eventLoopGaps = [], longTasks = [];
        const heartbeat = setInterval(() => { const now = performance.now(); if (active && lastTick) eventLoopGaps.push(now - lastTick); lastTick = now; }, 1);
        let observer = null;
        try { observer = new PerformanceObserver((list) => longTasks.push(...list.getEntries().map((e) => e.duration))); observer.observe({ type: 'longtask', buffered: false }); } catch { /* unsupported browser */ }
        if (mode === 'worker') await new Promise((resolve) => setTimeout(resolve, 80));

        const tasks = [];
        let compressedBytes = 0, assetBytes = 0;
        for (const url of assets) {
            const response = await fetch(url, { cache: 'no-store' });
            if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
            const glb = await response.arrayBuffer(); assetBytes += glb.byteLength;
            const view = new DataView(glb); let offset = 12, json = null, binOffset = -1, binLength = 0;
            while (offset + 8 <= glb.byteLength) {
                const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true); offset += 8;
                if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, offset, length)).trim());
                if (type === 0x004e4942) { binOffset = offset; binLength = length; }
                offset += length;
            }
            if (!json || binOffset < 0) continue;
            for (const bufferView of json.bufferViews || []) {
                const ext = bufferView.extensions?.EXT_meshopt_compression || bufferView.extensions?.KHR_meshopt_compression;
                if (!ext || ext.buffer !== 0) continue;
                const source = new Uint8Array(glb, binOffset + (ext.byteOffset || 0), ext.byteLength || 0);
                compressedBytes += source.byteLength;
                tasks.push({ count: ext.count, stride: ext.byteStride, source, mode: ext.mode, filter: ext.filter });
            }
        }
        await MeshoptDecoder.ready;
        const heapBefore = performance.memory?.usedJSHeapSize ?? null;
        eventLoopGaps.length = 0; longTasks.length = 0; lastTick = performance.now(); active = true;
        const decodeStart = performance.now();
        const decoded = await Promise.all(tasks.map((t) => MeshoptDecoder.decodeGltfBufferAsync(t.count, t.stride, t.source, t.mode, t.filter)));
        const decodeWallMs = performance.now() - decodeStart;
        await new Promise((resolve) => setTimeout(resolve, 10));
        active = false; clearInterval(heartbeat);
        await new Promise((resolve) => setTimeout(resolve, 60));
        const heapAfter = performance.memory?.usedJSHeapSize ?? null;
        const hashes = decoded.map((result) => {
            const bytes = new Uint8Array(result.buffer);
            let h = 2166136261;
            for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 16777619) >>> 0;
            return { bytes: bytes.length, hash: h >>> 0 };
        });
        const sorted = (xs) => [...xs].sort((a, b) => a - b);
        const percentile = (xs, p) => { const s = sorted(xs); return s.length ? +s[Math.min(s.length - 1, Math.ceil(s.length * p) - 1)].toFixed(2) : 0; };
        if (mode === 'worker') MeshoptDecoder.useWorkers(0);
        observer?.disconnect();
        return {
            mode, preloadedAssets: assets.length, compressedBufferViews: tasks.length,
            compressedBytes, decodedBytes: decoded.reduce((n, r) => n + r.byteLength, 0), assetBytes,
            decodeWallMs: +decodeWallMs.toFixed(2), mainThreadEventLoopGapP90Ms: percentile(eventLoopGaps, 0.9), mainThreadEventLoopGapMaxMs: percentile(eventLoopGaps, 1),
            longTaskCount: longTasks.length, longestLongTaskMs: percentile(longTasks, 1),
            heapMeasurementScope: 'page JavaScript heap only; excludes dedicated-worker heap',
            jsHeapBeforeBytes: heapBefore, jsHeapAfterBytes: heapAfter,
            hashes,
        };
    }, { mode, assets });
    await page.close();
    return result;
}

try {
    const main = await run('main');
    const worker = await run('worker');
    const parity = main.hashes.length === worker.hashes.length && main.hashes.every((x, i) => x.bytes === worker.hashes[i].bytes && x.hash === worker.hashes[i].hash);
    if (!parity) throw new Error('Decoded Meshopt byte parity failed');
    const { hashes: _mainHashes, ...mainSummary } = main;
    const { hashes: _workerHashes, ...workerSummary } = worker;
    console.log(JSON.stringify({ browser: 'Chromium SwiftShader diagnostic, actual preloaded GLB assets; not a device measurement', parity, main: mainSummary, worker: workerSummary }, null, 2));
} finally {
    await browser.close();
}
