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
    await page.goto(`http://127.0.0.1:${port}/?debug&enemyShotParity=1`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => typeof window.__svSpatialTest?.enemyShotStepParity === 'function', { timeout: 120000 });
    const result = await page.evaluate(() => window.__svSpatialTest.enemyShotStepParity());
    if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
    if (!result.result || result.caseCount < 1 || result.mismatches !== 0) {
        throw new Error(`actual stepEnemyShots/full-scan parity failed: ${JSON.stringify(result)}`);
    }
    for (const c of result.cases) {
        if (!c.pass || c.indexed.indexQueries !== 1 || !c.indexed.targetBuildingInIndexCandidates || c.indexed.indexCandidates >= result.buildingCount || c.indexed.impacts.length !== 1 || c.indexed.impacts[0].kind !== 'impact' || c.fullScan.impacts.length !== 1 || c.fullScan.impacts[0].kind !== 'impact') {
            throw new Error(`enemy-shot case did not exercise indexed impact parity: ${JSON.stringify(c)}`);
        }
    }
    console.log(JSON.stringify({ browser: 'Chromium SwiftShader diagnostic; deterministic simulation parity, not a device measurement', ...result, pageErrors: errors.length }, null, 2));
} finally {
    await browser.close();
}
