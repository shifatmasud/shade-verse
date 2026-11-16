import puppeteer from 'puppeteer-core';

const port = process.argv[2] || '5175';
const voiceDelayMs = Number(process.argv[3] || 2000);
const browser = await puppeteer.launch({
    executablePath: process.env.CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 (Linux; Android 11; SM-M025F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36');
await page.setViewport({ width: 760, height: 360, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
let voiceRequests = 0, voiceFinished = 0, firstVoiceAtMs = null;
const t0 = Date.now();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.setRequestInterception(true);
page.on('request', (request) => {
    if (/\/audio\/vo\//.test(request.url())) {
        voiceRequests++;
        if (firstVoiceAtMs === null) firstVoiceAtMs = Date.now() - t0;
        setTimeout(() => request.continue().catch(() => {}), voiceDelayMs);
    } else request.continue().catch(() => {});
});
page.on('requestfinished', (request) => { if (/\/audio\/vo\//.test(request.url())) voiceFinished++; });

try {
    await page.goto(`http://127.0.0.1:${port}/?audioGate=1`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => !!window.__game, { timeout: 120000 });
    const startAt = Date.now();
    await page.evaluate(() => window.__game.start());
    await page.waitForFunction(() => window.__game.sim.mode === 'play', { timeout: 180000, polling: 100 });
    const playAtMs = Date.now() - startAt;
    const voiceRequestsAtPlay = voiceRequests, voiceFinishedAtPlay = voiceFinished;
    const atPlay = await page.evaluate(() => {
        const engine = window.__audio?.engine;
        return {
            mode: window.__game.sim.mode,
            requestedVoiceKeys: engine ? [...engine.bytes.keys()].filter((n) => n.startsWith('vo_')).length : null,
            decodedVoiceKeys: engine ? [...engine.bufs.keys()].filter((n) => n.startsWith('vo_')).length : null,
            longTailCached: engine ? engine.bytes.has('vo_cg_118') : null,
        };
    });
    if (atPlay.longTailCached !== false) throw new Error(`long-tail line was not deferred: ${JSON.stringify(atPlay)}`);

    const requestsBeforeProbe = voiceRequests;
    const playback = await page.evaluate(() => {
        const engine = window.__audio.engine;
        const name = 'vo_cg_118';
        (window).__perfLongTailProbe = { name, loaded: false, played: false };
        void engine.load(name).then((buffer) => {
            const probe = (window).__perfLongTailProbe;
            probe.loaded = !!buffer;
            probe.played = !!buffer && !!engine.play(name, { gain: 0, prio: 4 });
        });
        return { requested: true, name };
    });
    await new Promise((resolve) => setTimeout(resolve, voiceDelayMs + 500));
    const after = await page.evaluate(() => ({
        mode: window.__game.sim.mode,
        voiceDecoded: window.__audio.engine.has('vo_cg_118'),
        probe: (window).__perfLongTailProbe,
    }));
    const voiceCache = await page.evaluate(async () => {
        const entries = [...window.__audio.engine.bytes.entries()].filter(([n]) => n.startsWith('vo_'));
        const buffers = await Promise.all(entries.map(([, p]) => p.catch(() => null)));
        return {
            encodedVoiceEntries: entries.length,
            encodedVoiceBytes: buffers.reduce((sum, value) => sum + (value instanceof ArrayBuffer ? value.byteLength : 0), 0),
        };
    });
    if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
    if (!after.voiceDecoded || !after.probe?.played) throw new Error(`on-demand long-tail playback failed: ${JSON.stringify(after)}`);
    if (after.mode !== 'play') throw new Error(`game left play mode during voice fetch: ${after.mode}`);
    console.log(JSON.stringify({
        browser: 'Chromium SwiftShader diagnostic, not a device load-time result',
        voiceRequestArtificialDelayMs: voiceDelayMs,
        timeFromPlayTapToPlayableMs: playAtMs,
        firstVoiceRequestFromNavigationMs: firstVoiceAtMs,
        voiceRequestsAtPlay,
        voiceResponsesFinishedAtPlay: voiceFinishedAtPlay,
        voiceRequestsPendingAtPlay: Math.max(0, voiceRequestsAtPlay - voiceFinishedAtPlay),
        voiceRequestsAfterLongTailProbe: voiceRequests,
        requestsTriggeredByProbe: voiceRequests - requestsBeforeProbe,
        voiceResponsesFinishedAfterProbe: voiceFinished,
        playableAtCheck: atPlay.mode === 'play',
        atPlay,
        onDemandLongTailProbe: { ...playback, ...after.probe, decodedByCheck: after.voiceDecoded },
        stillPlayableAfterDelay: after.mode === 'play',
        voiceCacheAfterProbe: voiceCache,
        pageErrors: errors.length,
    }, null, 2));
} finally {
    await browser.close();
}
