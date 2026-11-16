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
    await page.goto(`http://127.0.0.1:${port}/?debug&spatialParity=1`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => !!window.__game, { timeout: 120000 });
    await page.evaluate(() => window.__game.start());
    await page.waitForFunction(() => window.__game.sim.mode === 'play' && !!window.__svSpatialTest?.insideB, { timeout: 180000, polling: 250 });
    const result = await page.evaluate(() => {
        const t = window.__svSpatialTest;
        const blds = t.buildings;
        let seed = 0x23ac019;
        const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
        const allBounds = () => {
            let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
            for (const b of blds) { x0 = Math.min(x0, b.x0); x1 = Math.max(x1, b.x1); z0 = Math.min(z0, b.z0); z1 = Math.max(z1, b.z1); }
            return { x0, x1, z0, z1 };
        };
        const bounds = allBounds();
        const insideBRef = (x, z) => {
            for (const b of blds) if (x > b.x0 - 0.6 && x < b.x1 + 0.6 && z > b.z0 - 0.6 && z < b.z1 + 0.6) return true;
            return z < -900 && t.harborVoid(x, z);
        };
        const insideBARef = (x, z, y) => {
            for (const b of blds) if (b.h + 2 > y && x > b.x0 - 0.6 && x < b.x1 + 0.6 && z > b.z0 - 0.6 && z < b.z1 + 0.6) return true;
            return false;
        };
        const losRef = (ax, ay, az, bx, by, bz) => {
            const d = [bx - ax, by - ay, bz - az], o = [ax, ay, az];
            for (const b of blds) {
                const lo = [b.x0, -1e9, b.z0], hi = [b.x1, b.h, b.z1];
                let enter = 0, exit = 1, miss = false;
                for (let k = 0; k < 3; k++) {
                    if (Math.abs(d[k]) < 1e-9) { if (o[k] < lo[k] || o[k] > hi[k]) { miss = true; break; } }
                    else {
                        let a = (lo[k] - o[k]) / d[k], c = (hi[k] - o[k]) / d[k];
                        if (a > c) [a, c] = [c, a];
                        enter = Math.max(enter, a); exit = Math.min(exit, c);
                        if (enter > exit) { miss = true; break; }
                    }
                }
                if (!miss) return false;
            }
            return true;
        };
        let rngMissing = 0, rngCompared = 0;
        const spans = [0, 0];
        for (const b of blds) { spans[0] = Math.max(spans[0], b.x1 - b.x0); spans[1] = Math.max(spans[1], b.z1 - b.z0); }
        for (let i = 0; i < 750; i++) {
            const x = bounds.x0 - 100 + rand() * (bounds.x1 - bounds.x0 + 200), z = bounds.z0 - 100 + rand() * (bounds.z1 - bounds.z0 + 200), rx = rand() * 250, rz = rand() * 250;
            const x0 = x - rx, x1 = x + rx, z0 = z - rz, z1 = z + rz, candidates = new Set(t.query(x0, z0, x1, z1));
            for (let bi = 0; bi < blds.length; bi++) { const b = blds[bi]; if (b.x1 >= x0 && b.x0 <= x1 && b.z1 >= z0 && b.z0 <= z1) { rngCompared++; if (!candidates.has(bi)) rngMissing++; } }
        }
        let insideCompared = 0, insideMismatches = 0;
        for (let i = 0; i < 2500; i++) {
            const x = bounds.x0 - 50 + rand() * (bounds.x1 - bounds.x0 + 100), z = bounds.z0 - 50 + rand() * (bounds.z1 - bounds.z0 + 100), y = -5 + rand() * 180;
            if (t.insideB(x, z) !== insideBRef(x, z)) insideMismatches++;
            if (t.insideBA(x, z, y) !== insideBARef(x, z, y)) insideMismatches++;
            insideCompared += 2;
        }
        let losCompared = 0, losMismatches = 0;
        for (let i = 0; i < 1200; i++) {
            const ax = bounds.x0 - 50 + rand() * (bounds.x1 - bounds.x0 + 100), az = bounds.z0 - 50 + rand() * (bounds.z1 - bounds.z0 + 100), bx = bounds.x0 - 50 + rand() * (bounds.x1 - bounds.x0 + 100), bz = bounds.z0 - 50 + rand() * (bounds.z1 - bounds.z0 + 100), ay = -3 + rand() * 90, by = -3 + rand() * 90;
            if (t.losClear(ax, ay, az, bx, by, bz) !== losRef(ax, ay, az, bx, by, bz)) losMismatches++;
            losCompared++;
        }
        let cameraQueries = 0, cameraMismatches = 0, cameraCandidates = 0;
        for (let i = 0; i < 600; i++) {
            const x = bounds.x0 - 50 + rand() * (bounds.x1 - bounds.x0 + 100), z = bounds.z0 - 50 + rand() * (bounds.z1 - bounds.z0 + 100), r = 6 + rand() * 70;
            const expected = [];
            for (let bi = 0; bi < blds.length; bi++) { const b = blds[bi]; if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) expected.push(bi); }
            const actual = t.nearby(x, z, r); cameraCandidates += actual.length; cameraQueries++;
            if (actual.length !== expected.length || actual.some((bi, k) => bi !== expected[k])) cameraMismatches++;
        }
        const projectilePoints = [];
        for (let i = 0; i < 1800; i++) projectilePoints.push([
            bounds.x0 - 50 + rand() * (bounds.x1 - bounds.x0 + 100), -3 + rand() * 130,
            bounds.z0 - 50 + rand() * (bounds.z1 - bounds.z0 + 100),
        ]);
        for (let i = 0; i < Math.min(500, blds.length); i++) {
            const b = blds[Math.floor(i * blds.length / Math.min(500, blds.length))], x = (b.x0 + b.x1) / 2, z = (b.z0 + b.z1) / 2;
            projectilePoints.push([x, Math.max(-2, b.h - 0.1), z], [x, b.h + 0.1, z]);
        }
        let projectileCompared = 0, projectileMismatches = 0, projectileHits = 0;
        for (const [x, y, z] of projectilePoints) {
            const expected = blds.some((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && y < b.h);
            const actual = t.projectileHit(x, y, z); projectileCompared++; if (expected) projectileHits++;
            if (actual !== expected) projectileMismatches++;
        }
        let collisionCompared = 0, collisionMismatches = 0, localCandidateTotal = 0;
        const sameCollision = (a, b) => a.ground === b.ground && a.hitB === b.hitB && JSON.stringify(a.pos) === JSON.stringify(b.pos) && JSON.stringify(a.vel) === JSON.stringify(b.vel) && JSON.stringify(a.hitN) === JSON.stringify(b.hitN);
        for (let i = 0; i < 350; i++) {
            const bi = Math.floor(rand() * blds.length), b = blds[bi], x = (b.x0 + b.x1) / 2 + (rand() - 0.5) * 8, z = (b.z0 + b.z1) / 2 + (rand() - 0.5) * 8;
            const local = t.collisionProbe(x, 2, z, false), full = t.collisionProbe(x, 2, z, true);
            collisionCompared++; localCandidateTotal += local.candidateCount;
            if (!sameCollision(local, full)) collisionMismatches++;
        }
        const beforeDynamic = blds.length;
        t.addTrunks('__perf_spatial_parity__', [{ x: 9000, y: 0, z: 9000, s: 1 }], 0.45, 8);
        const dynamicId = beforeDynamic, dynamicIndexed = t.query(8999, 8999, 9001, 9001).includes(dynamicId);
        const chainStart = blds.length;
        t.addTrunks('__perf_spatial_chain__', [{ x: 10000, y: 0, z: 12000, s: 1 }, { x: 10001, y: 0, z: 12000, s: 1 }], 0.45, 8);
        const chainIndexed = t.collisionProbe(10000.5, 2, 12000, false), chainFull = t.collisionProbe(10000.5, 2, 12000, true);
        const chainedPushout = { contacts: chainIndexed.contacts, indexedCandidateCount: chainIndexed.candidateCount, indexedAndFullScanMatch: sameCollision(chainIndexed, chainFull), addedBuildingsIndexed: t.query(9999, 11999, 10002, 12001).includes(chainStart) && t.query(9999, 11999, 10002, 12001).includes(chainStart + 1) };
        return {
            buildingCount: beforeDynamic,
            maxBuildingSpan: spans,
            rectanglesCompared: 750,
            overlappingAabbsChecked: rngCompared,
            missingBroadphaseCandidates: rngMissing,
            occupancyChecksCompared: insideCompared,
            occupancyMismatches: insideMismatches,
            losSegmentsCompared: losCompared,
            losMismatches,
            cameraNearbyQueries: cameraQueries,
            cameraCandidatesCompared: cameraCandidates,
            cameraFullScanMismatches: cameraMismatches,
            projectileImpactPointsCompared: projectileCompared,
            fullScanProjectileHits: projectileHits,
            projectileImpactMismatches: projectileMismatches,
            chainedCollisionProbes: collisionCompared,
            averageIndexedCandidatesPerProbe: +(localCandidateTotal / collisionCompared).toFixed(1),
            chainedPushoutMismatches: collisionMismatches,
            dynamicTrunkRegistered: blds.length >= beforeDynamic + 3,
            dynamicTrunkIndexed: dynamicIndexed,
            chainedPushout,
            result: rngMissing === 0 && insideMismatches === 0 && losMismatches === 0 && cameraMismatches === 0 && projectileMismatches === 0 && collisionMismatches === 0 && chainedPushout.contacts >= 2 && chainedPushout.indexedAndFullScanMatch && chainedPushout.addedBuildingsIndexed && dynamicIndexed,
        };
    });
    if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
    if (!result.result) throw new Error(`spatial parity failed: ${JSON.stringify(result)}`);
    console.log(JSON.stringify({ browser: 'Chromium SwiftShader diagnostic; deterministic parity only', ...result }, null, 2));
} finally {
    await browser.close();
}
