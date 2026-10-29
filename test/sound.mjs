// Sound pass check: unlock, title music, beds by zone, hero/enemy SFX edges, voice cap, mute, hidden-tab duck, procedural render cost.
// usage: CHROME=/path/to/chrome node test/sound.mjs http://127.0.0.1:4291/   (needs a VITE_DBG=1 build)
import puppeteer from 'puppeteer-core';
const url = process.argv[2] || 'http://localhost:4173/';
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage(); await p.setViewport({ width: 915, height: 412, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
const errs = []; p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(url, { waitUntil: 'load' }); await new Promise((r) => setTimeout(r, 2500));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const before = await p.evaluate(() => !!(window.__audio && window.__audio.ctx()));
await p.mouse.click(400, 50); await sleep(2500);   // first gesture on the title screen
const title = await p.evaluate(() => { const A = window.__audio; return { state: A.ctx() && A.ctx().state, titleLoaded: A.engine.has('music_title'), beds: A.engine.activeBeds() }; });
await p.evaluate(() => window.__game.start()); await sleep(3000);
const out = {};
out.start = await p.evaluate(() => { const A = window.__audio; return { beds: A.engine.activeBeds(), score: A.engine.has('music_explore') && A.engine.has('music_action'), dbg: A.director.debug }; });
// teleport through zones
const zone = async (name, x, y, z, extra) => { await p.evaluate((x, y, z, extra) => { const s = window.__game.sim; s.pos[0] = x; s.pos[1] = y; s.pos[2] = z; s.vel = [0, 0, 0]; if (extra) Object.assign(s, extra); }, x, y, z, extra || null); await sleep(2500); out[name] = await p.evaluate(() => ({ beds: window.__audio.engine.activeBeds(), dbg: window.__audio.director.debug })); };
await zone('lakeshore', 180 + 22, 3, 100 + 4);
await zone('ocean', 0, 2, -215);
await zone('rooftop_high', 0, 80, 0);
// edges: web swing, shot, Web Shock, melee
const s0 = await p.evaluate(() => window.__audio.engine.stats.played);
const poke = async (f) => { await p.evaluate(f); await sleep(350); };
await poke(() => { const s = window.__game.sim; s.pos = [0, 2, 0]; s.web = true; s.anchor = [0, 40, 10]; });   // web attach -> thwip + attach + whoosh
await poke(() => { window.__game.sim.web = false; window.__game.sim.ground = false; });
await poke(() => { window.__game.sim.spring = 0.4; });
await poke(() => { window.__game.sim.shotT = 0.3; });
await poke(() => { window.__game.sim.atkT = 0.32; });
await poke(() => { window.__game.sim.snareT = 1.65; });
await sleep(1600);
out.edgesPlayed = (await p.evaluate(() => window.__audio.engine.stats.played)) - s0;
// voice cap: fire 40 one-shots at once
out.cap = await p.evaluate(() => { const E = window.__audio.engine; const st0 = { ...E.stats }; for (let i = 0; i < 40; i++) E.play('metal', { gain: 0.1, prio: 1 }); const live = E.voices.filter((v) => v.end > E.ctx.currentTime).length; return { live, max: E.maxVoices, stolen: E.stats.stolen - st0.stolen, dropped: E.stats.dropped - st0.dropped }; });
// mute + hidden duck
out.mute = await p.evaluate(async () => { const E = window.__audio.engine; E.setMuted(true); await new Promise((r) => setTimeout(r, 400)); const g = E.master.gain.value; E.setMuted(false); await new Promise((r) => setTimeout(r, 400)); return { mutedGain: +g.toFixed(4), unmutedGain: +E.master.gain.value.toFixed(3) }; });
out.hidden = await p.evaluate(async () => { const E = window.__audio.engine; E.setHidden(true); await new Promise((r) => setTimeout(r, 600)); const st = E.ctx.state; E.setHidden(false); await new Promise((r) => setTimeout(r, 600)); return { hiddenState: st, back: E.ctx.state }; });
// procedural render cost (all recipes, one at a time)
out.render = await p.evaluate(async () => { const { RECIPES, renderRecipe } = window.__svSynth; const t0 = performance.now(); let audioSec = 0; const per = {}; for (const k of Object.keys(RECIPES)) { const a = performance.now(); const b = await renderRecipe(k, RECIPES[k]); per[k] = Math.round(performance.now() - a); audioSec += b.duration; } return { recipes: Object.keys(RECIPES).length, ms: Math.round(performance.now() - t0), audioSec: +audioSec.toFixed(1), slowest: Object.entries(per).sort((x, y) => y[1] - x[1]).slice(0, 4) }; });
for (const [k, v] of Object.entries({ before, title, ...out, errors: errs })) console.log(k, JSON.stringify(v));
const ok = !before && title.state === 'running' &&  out.start.score && out.edgesPlayed >= 6 && out.cap.live <= out.cap.max && out.mute.mutedGain < 0.01 && out.hidden.hiddenState === 'suspended' && out.hidden.back === 'running' && errs.length === 0;
console.log(ok ? 'SOUND PASS' : 'SOUND FAIL'); await b.close(); process.exit(ok ? 0 : 1);
