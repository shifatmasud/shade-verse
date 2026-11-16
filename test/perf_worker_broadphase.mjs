import puppeteer from 'puppeteer-core';

const port = process.argv[2] || '5175';
const browser = await puppeteer.launch({
    executablePath: process.env.CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 (Linux; Android 11; SM-M025F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36');
await page.setViewport({ width: 760, height: 360, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

try {
    await page.goto(`http://127.0.0.1:${port}/?workerProbe=1`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => !!window.__game, { timeout: 120000 });
    await page.evaluate(() => window.__game.start());
    await page.waitForFunction(() => window.__game.sim.mode === 'play' && !!window.__svSpatialTest, { timeout: 180000, polling: 250 });
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const result = await page.evaluate(async () => {
        const test = window.__svSpatialTest;
        const buildings = test.buildings;
        const packed = new Float32Array(buildings.length * 4);
        for (let i = 0; i < buildings.length; i++) {
            const b = buildings[i];
            packed.set([b.x0, b.x1, b.z0, b.z1], i * 4);
        }

        const workerSource = `
            let boxes, cells, cellSize = 40;
            const key = (x, z) => (x << 16) | (z & 0xffff);
            onmessage = (event) => {
                const d = event.data;
                if (d.type === 'init') {
                    const start = performance.now();
                    boxes = new Float32Array(d.boxes);
                    cells = new Map();
                    const count = boxes.length / 4;
                    for (let i = 0; i < count; i++) {
                        const o = i * 4, x0 = boxes[o], x1 = boxes[o + 1], z0 = boxes[o + 2], z1 = boxes[o + 3];
                        for (let z = Math.floor(z0 / cellSize); z <= Math.floor(z1 / cellSize); z++)
                            for (let x = Math.floor(x0 / cellSize); x <= Math.floor(x1 / cellSize); x++) {
                                const k = key(x, z); let a = cells.get(k); if (!a) cells.set(k, a = []); a.push(i);
                            }
                    }
                    postMessage({ type: 'ready', buildMs: performance.now() - start, cellCount: cells.size });
                    return;
                }
                if (d.type !== 'query') return;
                const start = performance.now();
                const q = new Float32Array(d.queries), n = q.length / 4;
                const offsets = new Uint32Array(n + 1), ids = [], seen = new Uint32Array(boxes.length / 4);
                let stamp = 0;
                for (let qi = 0; qi < n; qi++) {
                    const j = qi * 4, x0 = Math.min(q[j], q[j + 2]), x1 = Math.max(q[j], q[j + 2]), z0 = Math.min(q[j + 1], q[j + 3]), z1 = Math.max(q[j + 1], q[j + 3]);
                    stamp++;
                    const found = [];
                    for (let z = Math.floor(z0 / cellSize); z <= Math.floor(z1 / cellSize); z++)
                        for (let x = Math.floor(x0 / cellSize); x <= Math.floor(x1 / cellSize); x++) {
                            const a = cells.get(key(x, z)); if (!a) continue;
                            for (const id of a) if (seen[id] !== stamp) { seen[id] = stamp; found.push(id); }
                        }
                    found.sort((a, b) => a - b);
                    for (const id of found) ids.push(id);
                    offsets[qi + 1] = ids.length;
                }
                const out = new Uint32Array(ids);
                postMessage({ type: 'result', requestId: d.requestId, offsets, ids: out, workMs: performance.now() - start }, [offsets.buffer, out.buffer]);
            };
        `;
        const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
        const worker = new Worker(workerUrl);
        URL.revokeObjectURL(workerUrl);
        let requestId = 0;
        const waitFor = (type, expectedId) => new Promise((resolve, reject) => {
            const timer = setTimeout(() => { worker.removeEventListener('message', handler); reject(new Error(`worker timeout: ${type}`)); }, 30000);
            const handler = (event) => {
                const d = event.data;
                if (d.type !== type || (expectedId !== undefined && d.requestId !== expectedId)) return;
                clearTimeout(timer); worker.removeEventListener('message', handler); resolve(d);
            };
            worker.addEventListener('message', handler);
        });

        const initStart = performance.now();
        const ready = waitFor('ready');
        worker.postMessage({ type: 'init', boxes: packed.buffer }, [packed.buffer]);
        const initialized = await ready;
        const workerInitRttMs = performance.now() - initStart;

        let seed = 0x49a82d1;
        const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
        const xs = buildings.map((b) => (b.x0 + b.x1) * 0.5), zs = buildings.map((b) => (b.z0 + b.z1) * 0.5);
        const loX = Math.min(...xs) - 120, hiX = Math.max(...xs) + 120, loZ = Math.min(...zs) - 120, hiZ = Math.max(...zs) + 120;
        const batchSizes = [1, 10, 50, 200, 500], samples = 9, rows = [];

        for (const size of batchSizes) {
            const queries = new Float32Array(size * 4);
            for (let i = 0; i < size; i++) {
                const x = loX + rand() * (hiX - loX), z = loZ + rand() * (hiZ - loZ), r = rand() * 40;
                queries.set([x - r, z - r, x + r, z + r], i * 4);
            }
            const localResults = Array.from({ length: size }, (_, i) => test.query(queries[i * 4], queries[i * 4 + 1], queries[i * 4 + 2], queries[i * 4 + 3]));
            const exactCandidateCount = localResults.reduce((sum, ids, i) => {
                const q = i * 4;
                return sum + ids.filter((id) => { const b = buildings[id]; return b.x1 >= queries[q] && b.x0 <= queries[q + 2] && b.z1 >= queries[q + 1] && b.z0 <= queries[q + 3]; }).length;
            }, 0);
            const localMs = [];
            for (let rep = 0; rep < samples; rep++) {
                const t = performance.now();
                for (let i = 0; i < size; i++) test.query(queries[i * 4], queries[i * 4 + 1], queries[i * 4 + 2], queries[i * 4 + 3]);
                localMs.push(performance.now() - t);
            }
            const workerMs = [], workerCpuMs = [];
            let parity = true, transferredIdCount = 0;
            for (let rep = 0; rep < samples; rep++) {
                const request = ++requestId, copy = queries.slice();
                const response = waitFor('result', request);
                const t = performance.now();
                worker.postMessage({ type: 'query', requestId: request, queries: copy.buffer }, [copy.buffer]);
                const d = await response;
                workerMs.push(performance.now() - t); workerCpuMs.push(d.workMs); transferredIdCount = d.ids.length;
                for (let i = 0; i < size && parity; i++) {
                    const start = d.offsets[i], end = d.offsets[i + 1], got = d.ids.subarray(start, end), expected = localResults[i];
                    if (got.length !== expected.length || got.some((id, j) => id !== expected[j])) parity = false;
                }
            }
            const summarize = (xs) => { const s = [...xs].sort((a, b) => a - b); return { medianMs: +s[Math.floor(s.length / 2)].toFixed(3), p90Ms: +s[Math.ceil(s.length * 0.9) - 1].toFixed(3) }; };
            rows.push({ batchQueries: size, localIndexed: summarize(localMs), workerRoundTrip: summarize(workerMs), workerCpu: summarize(workerCpuMs), queryBytes: size * 16, resultIdCount: transferredIdCount, exactCandidateCount, exactParity: parity });
        }
        worker.terminate();
        return { buildCount: buildings.length, workerGridCells: initialized.cellCount, workerIndexBuildMs: +initialized.buildMs.toFixed(3), workerInitRoundTripMs: +workerInitRttMs.toFixed(3), transferredAabbBytes: buildings.length * 16, rows };
    });

    if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
    if (result.rows.some((r) => !r.exactParity)) throw new Error('Worker spatial candidate parity failed');
    console.log(JSON.stringify({ browser: 'Chromium SwiftShader diagnostic (not a target-device measurement)', ...result }, null, 2));
} finally {
    await browser.close();
}
