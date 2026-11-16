import puppeteer from 'puppeteer-core';

const port = process.argv[2] || '5175';
const voiceDelayMs = Number(process.argv[3] || 3500);
if (voiceDelayMs <= 2500) throw new Error('Use a delay longer than the former 2.5-second banter cutoff');
const browser = await puppeteer.launch({
    executablePath: process.env.CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 (Linux; Android 11; SM-M025F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36');
await page.setViewport({ width: 760, height: 360, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
let voiceRequests = 0, voiceFinished = 0, firstVoiceAtMs = null;
const delayedBanterRequests = [];
const t0 = Date.now();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.setRequestInterception(true);
page.on('request', (request) => {
    if (/\/audio\/vo\//.test(request.url())) {
        voiceRequests++;
        if (firstVoiceAtMs === null) firstVoiceAtMs = Date.now() - t0;
        if (/\/audio\/vo\/(?:cg|cs)_\d+\./.test(request.url())) delayedBanterRequests.push({ url: request.url(), atMs: Date.now() - t0 });
        setTimeout(() => request.continue().catch(() => {}), voiceDelayMs);
    } else request.continue().catch(() => {});
});
page.on('requestfinished', (request) => { if (/\/audio\/vo\//.test(request.url())) voiceFinished++; });

try {
    await page.goto(`http://127.0.0.1:${port}/?debug&audioGate=1`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => !!window.__game, { timeout: 120000 });
    await page.evaluate(() => {
        window.__game.start();
        const { engine, director } = window.__audio;
        engine.setMuted(false);
        director.bIdleAt = 1e9; director.bCd = 1e9; director.bCombatCd = 1e9;
        window.__perfBanterPlays = [];
        const play = engine.play.bind(engine);
        engine.play = (name, opts) => {
            const voice = play(name, opts);
            if (/^vo_c[gs]_/.test(name)) window.__perfBanterPlays.push({
                name, scheduled: !!voice, gain: voice?.g.gain.value ?? null,
                duration: voice?.src.buffer?.duration ?? null,
                outputRunning: engine.ctx?.state === 'running', muted: engine.muted,
                atMs: Date.now(),
            });
            return voice;
        };
    });
    await page.waitForFunction(() => window.__game.sim.mode === 'play', { timeout: 180000, polling: 100 });
    const queued = await page.evaluate(async () => {
        const { BANTER } = await import('/src/audio/banter.ts');
        const exchange = BANTER.find((x) => x.t === 'idle');
        if (!exchange) throw new Error('No idle banter exchange found');
        const names = exchange.l.map(([sp, i]) => `vo_${sp === 'g' ? 'cg' : 'cs'}_${i}`);
        const engine = window.__audio.engine, director = window.__audio.director;
        const coldBeforeQueue = names.every((name) => !engine.has(name));
        const oldRandom = Math.random; Math.random = () => 0;
        let accepted;
        try { accepted = director.banter('idle', true); } finally { Math.random = oldRandom; }
        return { names, text: exchange.l.map(([, , text]) => text), coldBeforeQueue, accepted, queuedAt: Date.now() };
    });
    if (!queued.coldBeforeQueue || !queued.accepted) throw new Error(`Could not start a cold-cache banter exchange: ${JSON.stringify(queued)}`);

    const queueAtMs = Date.now();
    const targetReqStart = Date.now();
    while (delayedBanterRequests.length < queued.names.length && Date.now() - targetReqStart < 15000) await new Promise((r) => setTimeout(r, 50));
    if (delayedBanterRequests.length < queued.names.length) throw new Error(`Timed out waiting for cold banter requests: ${JSON.stringify({ names: queued.names, requests: delayedBanterRequests })}`);
    await new Promise((resolve) => setTimeout(resolve, Math.min(900, voiceDelayMs - 250)));
    const pending = await page.evaluate((names) => ({
        mode: window.__game.sim.mode,
        busy: window.__audio.director.bBusy,
        selectedStillUncached: names.every((name) => !window.__audio.engine.has(name)),
        dialogueScheduled: window.__perfBanterPlays.some((play) => names.includes(play.name)),
        caption: (window.__captions || []).slice(-2),
    }), queued.names);
    if (!pending.busy || !pending.selectedStillUncached || pending.dialogueScheduled || pending.mode !== 'play') {
        throw new Error(`Cold-cache dialogue did not remain queued during delayed fetch: ${JSON.stringify(pending)}`);
    }

    await page.waitForFunction((names) => window.__perfBanterPlays.some((play) => names.includes(play.name) && play.scheduled), { timeout: voiceDelayMs + 20000, polling: 100 }, queued.names);
    const after = await page.evaluate((names) => {
        const engine = window.__audio.engine;
        const plays = window.__perfBanterPlays.filter((play) => names.includes(play.name));
        return {
            mode: window.__game.sim.mode,
            busy: window.__audio.director.bBusy,
            decoded: names.map((name) => ({ name, cached: engine.has(name) })),
            plays,
            captions: (window.__captions || []).slice(-2),
            audioStats: { played: engine.stats.played, dropped: engine.stats.dropped, ctxState: engine.ctx?.state, muted: engine.muted },
        };
    }, queued.names);
    const audible = after.plays.some((play) => play.scheduled && play.gain > 0 && play.outputRunning && !play.muted);
    if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
    if (!audible || after.plays.length === 0 || !after.captions.length) throw new Error(`Delayed banter did not schedule audible dialogue: ${JSON.stringify(after)}`);
    if (after.mode !== 'play') throw new Error(`Game left play mode during delayed voice loading: ${after.mode}`);
    console.log(JSON.stringify({
        browser: 'Chromium SwiftShader diagnostic; verifies queued playback scheduling, not device audio latency',
        voiceRequestArtificialDelayMs: voiceDelayMs,
        formerCutoffMs: 2500,
        queueToFirstAudibleScheduleMs: after.plays[0].atMs - queueAtMs,
        targetExchange: queued.names,
        targetColdBeforeQueue: queued.coldBeforeQueue,
        requests: { total: voiceRequests, finished: voiceFinished, delayedBanter: delayedBanterRequests.map(({ url, atMs }) => ({ file: url.split('/').pop(), atMs })) },
        pendingAfterFetchStarted: pending,
        afterAudioArrived: after,
        audibleScheduledAtPositiveGain: audible,
        pageErrors: errors.length,
    }, null, 2));
} finally {
    await browser.close();
}
