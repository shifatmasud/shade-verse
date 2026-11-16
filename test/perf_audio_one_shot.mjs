import puppeteer from 'puppeteer-core';

const port = process.argv[2] || '5175';
const voiceDelayMs = Number(process.argv[3] || 3500);
if (voiceDelayMs <= 2500) throw new Error('Use a delay longer than the former 1.2-second ordinary-voice cutoff');
const target = /\/audio\/vo\/shadow_14\.(?:ogg|mp3)(?:\?.*)?$/;
const browser = await puppeteer.launch({
    executablePath: process.env.CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 (Linux; Android 11; SM-M025F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36');
await page.setViewport({ width: 760, height: 360, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
let targetRequests = 0, targetRequestStartedAt = null, targetRequestFinishedAt = null;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.setRequestInterception(true);
page.on('request', (request) => {
    if (target.test(new URL(request.url()).pathname)) {
        targetRequests++;
        if (targetRequestStartedAt === null) targetRequestStartedAt = Date.now();
        setTimeout(() => request.continue().catch(() => {}), voiceDelayMs);
    } else request.continue().catch(() => {});
});
page.on('requestfinished', (request) => { if (target.test(new URL(request.url()).pathname)) targetRequestFinishedAt = Date.now(); });

try {
    await page.goto(`http://127.0.0.1:${port}/?debug&audioOneShot=1`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => !!window.__game && !!window.__audio, { timeout: 120000 });
    await page.evaluate(() => window.__game.start());
    await page.waitForFunction(() => window.__game.sim.mode === 'play', { timeout: 180000, polling: 100 });
    const queued = await page.evaluate(() => {
        const { engine, director } = window.__audio;
        engine.setMuted(false);
        director.voGap = 1e9; director.voCd = { shadow: 1e9, ghost: 1e9, robot: 1e9, boss: 1e9, ped: 1e9 };
        director.bIdleAt = 1e9; director.bCd = 1e9; director.bCombatCd = 1e9; director.idleT = 0;
        const name = 'vo_shadow_14';
        const coldBeforeQueue = !engine.has(name);
        window.__ordinaryVoicePlays = [];
        const play = engine.play.bind(engine);
        engine.play = (playedName, opts) => {
            const voice = play(playedName, opts);
            if (playedName === name) window.__ordinaryVoicePlays.push({
                name: playedName, scheduled: !!voice, gain: voice?.g.gain.value ?? null,
                outputRunning: engine.ctx?.state === 'running', muted: engine.muted,
                duration: voice?.src.buffer?.duration ?? null, atMs: Date.now(),
            });
            return voice;
        };
        if (director.voPending) throw new Error('A different ordinary voice was pending before the test');
        director.vo('shadow', [14], { force: true, cd: 20 });
        return { name, mode: window.__game.sim.mode, coldBeforeQueue, pendingAfterCall: director.voPending, queuedAt: Date.now(), initialGap: director.voGap };
    });
    if (!queued.coldBeforeQueue || !queued.pendingAfterCall) throw new Error(`Could not queue a cold ordinary voice: ${JSON.stringify(queued)}`);

    const requestDeadline = Date.now() + 15000;
    while (targetRequests === 0 && Date.now() < requestDeadline) await new Promise((r) => setTimeout(r, 50));
    if (!targetRequests) throw new Error('The exact vo_shadow_14 cold-fetch request did not start');
    const pendingWaitMs = Math.max(0, 1400 - (Date.now() - queued.queuedAt));
    if (pendingWaitMs) await new Promise((r) => setTimeout(r, pendingWaitMs));
    const pending = await page.evaluate((name) => ({
        mode: window.__game.sim.mode,
        stillUncached: !window.__audio.engine.has(name),
        voicePending: window.__audio.director.voPending,
        gapReserved: window.__audio.director.voGap > 0,
        plays: window.__ordinaryVoicePlays.slice(),
    }), queued.name);
    const pendingElapsedMs = Date.now() - queued.queuedAt;
    if (pendingElapsedMs <= 1200 || pending.mode !== 'play' || !pending.stillUncached || !pending.voicePending || !pending.gapReserved || pending.plays.length) {
        throw new Error(`Ordinary voice did not remain queued beyond the old cutoff: ${JSON.stringify({ pendingElapsedMs, pending })}`);
    }

    await page.waitForFunction((name) => window.__ordinaryVoicePlays.some((p) => p.name === name && p.scheduled), { timeout: voiceDelayMs + 20000, polling: 100 }, queued.name);
    const after = await page.evaluate((name) => {
        const engine = window.__audio.engine, director = window.__audio.director;
        return {
            mode: window.__game.sim.mode,
            cached: engine.has(name),
            voicePending: director.voPending,
            voGap: director.voGap,
            plays: window.__ordinaryVoicePlays.filter((p) => p.name === name),
            audioStats: { played: engine.stats.played, dropped: engine.stats.dropped, stolen: engine.stats.stolen, ctxState: engine.ctx?.state, muted: engine.muted },
        };
    }, queued.name);
    const scheduled = after.plays.length === 1 && after.plays[0].scheduled;
    const audibleScheduled = scheduled && after.plays[0].gain > 0 && after.plays[0].outputRunning && !after.plays[0].muted;
    const requestToScheduleMs = targetRequestStartedAt === null || after.plays.length === 0 ? null : after.plays[0].atMs - targetRequestStartedAt;
    if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
    if (!audibleScheduled || !after.cached || after.voicePending || targetRequests !== 1 || targetRequestFinishedAt === null) {
        throw new Error(`Delayed ordinary voice did not schedule exactly once at positive gain: ${JSON.stringify({ after, targetRequests, targetRequestFinishedAt, errors })}`);
    }
    if (targetRequestFinishedAt > after.plays[0].atMs || requestToScheduleMs < voiceDelayMs - 400) {
        throw new Error(`Playback did not follow the delayed fetch promptly: ${JSON.stringify({ requestToScheduleMs, targetRequestFinishedAt, playAt: after.plays[0].atMs })}`);
    }
    console.log(JSON.stringify({
        browser: 'Chromium SwiftShader diagnostic; verifies queued scheduling, not physical device audio latency',
        voiceDelayArtificialMs: voiceDelayMs,
        formerOrdinaryCutoffMs: 1200,
        target: queued.name,
        coldBeforeQueue: queued.coldBeforeQueue,
        requestCount: targetRequests,
        pendingAtMs: pendingElapsedMs,
        pendingState: pending,
        requestToScheduleMs,
        requestFinishedAtMs: targetRequestFinishedAt - targetRequestStartedAt,
        afterAudioArrived: after,
        scheduledAtPositiveGain: audibleScheduled,
        pageErrors: errors.length,
    }, null, 2));
} finally {
    await browser.close();
}
