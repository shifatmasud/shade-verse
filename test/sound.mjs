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
await p.evaluate(() => window.__game.start()); for (let i = 0; i < 120 && (await p.evaluate(() => window.__game.sim.mode)) !== 'play'; i++) await sleep(500); await sleep(3000);   // Play now loads everything first
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
// audible output: the master bus must actually carry signal (Oct 31 bug: world/music were never routed to master and every check above still passed)
out.audible = await p.evaluate(async () => { const E = window.__audio.engine, c = E.ctx, an = c.createAnalyser(); an.fftSize = 2048; E.master.connect(an); const d = new Float32Array(2048); let pk = 0;
  for (let k = 0; k < 12; k++) { E.play('metal', { gain: 0.8, prio: 5 }); await new Promise((r) => setTimeout(r, 120)); an.getFloatTimeDomainData(d); for (const v of d) pk = Math.max(pk, Math.abs(v)); }
  E.master.disconnect(an); return pk; });
// audio polish (Nov 3): new cues rendered, and the heaviest stack (Slam blast: recorded dunk + doubled sub thump + hit + Shock zap + KO) stays
// under full scale after the output stage (desktop: limiter; phone: soft clip); the bus peak before it is reported
out.polish = await p.evaluate(async () => { const A = window.__audio, E = A.engine, D = A.director, s = window.__game.sim, c = E.ctx;
  const has = ['thump', 'slam_charge', 'ui_tick'].every((n) => E.has(n)); const p0 = E.stats.played;
  const an = c.createAnalyser(); an.fftSize = 2048; const an2 = c.createAnalyser(); an2.fftSize = 2048; E.master.connect(an); E.out.connect(an2); const d = new Float32Array(2048); let pk = 0, pk2 = 0;   // peak before and after the output stage (limiter / soft clip)
  const prev = s.slam; s.slam = { ph: 4 }; D.onHit(); D.onBlast(s.pos[0], s.pos[1], s.pos[2]); s.slam = prev; E.play('zap', { gain: 0.88, prio: 5 }); E.play('enemy_down', { gain: 0.75, prio: 3 });
  for (let k = 0; k < 10; k++) { await new Promise((r) => setTimeout(r, 40)); an.getFloatTimeDomainData(d); for (const v of d) pk = Math.max(pk, Math.abs(v)); an2.getFloatTimeDomainData(d); for (const v of d) pk2 = Math.max(pk2, Math.abs(v)); }
  E.master.disconnect(an); E.out.disconnect(an2); return { has, played: E.stats.played - p0, busPeak: +pk.toFixed(3), outPeak: +pk2.toFixed(3) }; });
// voice cap: fire 40 one-shots at once
out.cap = await p.evaluate(() => { const E = window.__audio.engine; const st0 = { ...E.stats }; for (let i = 0; i < 40; i++) E.play('metal', { gain: 0.1, prio: 1 }); const live = E.voices.filter((v) => v.end > E.ctx.currentTime).length; return { live, max: E.maxVoices, stolen: E.stats.stolen - st0.stolen, dropped: E.stats.dropped - st0.dropped }; });
// mute + hidden duck
out.mute = await p.evaluate(async () => { const E = window.__audio.engine; E.setMuted(true); await new Promise((r) => setTimeout(r, 400)); const g = E.master.gain.value; E.setMuted(false); await new Promise((r) => setTimeout(r, 400)); return { mutedGain: +g.toFixed(4), unmutedGain: +E.master.gain.value.toFixed(3) }; });
out.hidden = await p.evaluate(async () => { const E = window.__audio.engine; E.setHidden(true); await new Promise((r) => setTimeout(r, 600)); const st = E.ctx.state; E.setHidden(false); await new Promise((r) => setTimeout(r, 600)); return { hiddenState: st, back: E.ctx.state }; });
// procedural render cost (all recipes, one at a time)
out.render = await p.evaluate(async () => { const { RECIPES, renderRecipe } = window.__svSynth; const t0 = performance.now(); let audioSec = 0; const per = {}; for (const k of Object.keys(RECIPES)) { const a = performance.now(); const b = await renderRecipe(k, RECIPES[k]); per[k] = Math.round(performance.now() - a); audioSec += b.duration; } return { recipes: Object.keys(RECIPES).length, ms: Math.round(performance.now() - t0), audioSec: +audioSec.toFixed(1), slowest: Object.entries(per).sort((x, y) => y[1] - x[1]).slice(0, 4) }; });
for (const [k, v] of Object.entries({ before, title, ...out, errors: errs })) console.log(k, JSON.stringify(v));
const ok = out.polish.has && out.polish.played >= 4 && out.polish.outPeak <= 1.0 && out.audible > 0.005 && !before && title.state === 'running' &&  out.start.score && out.edgesPlayed >= 6 && out.cap.live <= out.cap.max && out.mute.mutedGain < 0.01 && out.hidden.hiddenState === 'suspended' && out.hidden.back === 'running' && errs.length === 0;
console.log(ok ? 'SOUND PASS' : 'SOUND FAIL'); await b.close(); process.exit(ok ? 0 : 1);
