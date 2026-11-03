
// Bent-knee pose audit (Nov 3): every bent-knee pose of Shadow and Ghost, front + side, by direct state triggers (no play-until-it-happens).
// Usage: CHROME=<path> node test/bentknee_audit.mjs <port> <outdir> [rows,comma,separated]
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const [port, outdir, only] = process.argv.slice(2);
fs.mkdirSync(outdir, { recursive: true });
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width: 640, height: 360, deviceScaleFactor: 1 });
const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction(() => !!window.__game, { timeout: 120000 });
await new Promise(r => setTimeout(r, 1500));
await p.evaluate(() => window.__game.start());
await p.waitForFunction(() => window.__game.sim.mode === 'play' && window.__game.sim.t > 1.5 && !!window.__ghostActor, { timeout: 180000, polling: 250 });
await new Promise(r => setTimeout(r, 500));
await p.addStyleTag({ content: '#root *, body > div * { visibility: hidden !important; } #root canvas, body > div canvas, canvas { visibility: visible !important; }' });   // HUD/captions off: the pose is the subject
const raf = (n) => p.evaluate((n) => new Promise(res => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
await p.evaluate(() => {
  const g = window.__game, s = g.sim; window.__spawn = window.__spawn || [...s.pos];
  window.__BK = {
    park(enemiesAway = true) {
      const s = window.__game.sim, I = window.__game.input, A = window.__ghostActor, q = window.__spawn;
      I.keys.w = I.keys.a = I.keys.s = I.keys.d = false; I.swing = false; I.swingQ = false; I.jumpQ = false; I.meleeHeld = false; I.slamHeld = false; I.attackQ = false; I.meleeQ = false;
      s.pos = [q[0], q[1], q[2]]; s.vel = [0, 0, 0]; s.web = false; s.wall = null; s.swim = false; s.glideOn = false; s.ground = true; s.ang = 0; s.yaw = 0; s.mv = null; s.flip = null; s.slam = null; s.hp = 100; s.dodgeT = 0; s.atkT = 0; s.hurtT = 0; s.land = 0; s.landHard = 0; s.spring = 0; s.shotT = 0;
      if (enemiesAway) s.enemies.forEach((e, i) => { e.down = 0; e.atk = -50; e.hp = 99; e.x = q[0] + 200 + i * 4; e.z = q[2] + 200; e.kb = [0, 0]; e.vy = 0; e.ly = 0; });
      const fx = Math.sin(s.ang), fz = Math.cos(s.ang), rx = -fz, rz = fx;
      A.pos = [q[0] - fx * 1.45 + rx * 2.6, q[1], q[2] - fz * 1.45 + rz * 2.6]; A.vel = [0, 0, 0]; A.ang = 0; A.yaw = 0; A.ground = true; A.web = false; A.wall = null; A.mv = null; A.flip = null; A.slam = null; A.hurtT = 0; A.land = 0; A.landHard = 0; A.atkT = 0; A.shotT = 0; A.glideOn = false;
      window.__ghostDisableCombat = true;
    },
    cam(who, view) {
      const s = window.__game.sim, A = window.__ghostActor, o = who === 'S' ? s : A, q = o.pos, a = o.ang || 0, fx = Math.sin(a), fz = Math.cos(a);
      const v = view === 'side' ? (who === 'S' ? [fz, -fx] : [-fz, fx]) : [fx, fz], d = 5.2;   // side: Shadow from his left, Ghost from her right, so the partner (2.6 m to his right) never stands between camera and subject
      if (window.__camHips) { const R = who === 'S' ? window.__rig : window.__ghostRig, m = R.b.hips.matrixWorld.elements, c = [m[12], m[13], m[14]], dd = 5.6;   // airborne rows: frame the rendered hips, not the sim position
        window.__camOv = [c[0] + v[0] * dd, c[1] + 0.25, c[2] + v[1] * dd, c[0], c[1] + 0.05, c[2]]; return; }
      window.__camOv = [q[0] + v[0] * d, q[1] + 0.2, q[2] + v[1] * d, q[0], q[1] - 0.05, q[2]];
    },
  };
  window.__pin = null; const loop = () => { if (window.__pin) try { window.__pin(); } catch (e) {} requestAnimationFrame(loop); }; requestAnimationFrame(loop);
});
// until(fnSrc): fn returns remaining game-seconds (<=0 = there); time scale follows the remainder so the target is hit closely
async function until(src, maxFrames = 1500, tsMax = 0.6) {
  for (let i = 0; i < maxFrames; i++) {
    const r = await p.evaluate((src, tsMax) => { const rem = (0, eval)(src)(); if (rem == null) { window.__ts = 0; return 'fail'; } if (rem <= 0) { window.__ts = 0; return 'ok'; } window.__ts = Math.min(tsMax, Math.max(0.02, rem / 0.15)); return 'go'; }, src, tsMax);
    if (r !== 'go') return r; await raf(1);
  }
  await p.evaluate(() => { window.__ts = 0; }); return 'timeout';
}
const cells = []; const log = [];
async function shoot(row, who) {
  const st = await p.evaluate((who) => { const s = window.__game.sim, A = window.__ghostActor, o = who === 'S' ? s : A, R = who === 'S' ? window.__rig : null;
    return { t: +s.t.toFixed(3), ground: o.ground, land: +(o.land || 0).toFixed(2), mv: o.mv ? [o.mv.id, +o.mv.t.toFixed(3)] : null, slam: o.slam ? [o.slam.ph, +(o.slam.t || 0).toFixed(3)] : null, hurtT: +(o.hurtT || 0).toFixed(3), web: !!o.web, vy: +o.vel[1].toFixed(2), anim: who === 'S' ? window.__shadowAnimation?.action : window.__ghostState?.action, flip: o.flip ? [o.flip.ax, o.flip.dir, +(o.flip.t / o.flip.dur).toFixed(2)] : null, tflip: (() => { const T = (who === 'S' ? window.__rig : window.__ghostRig)?.__tv; return T && T.fl ? +(T.flT / T.flD).toFixed(2) : null; })(), glide: !!o.glideOn }; }, who);
  await p.evaluate(() => { window.__eSave = window.__game.sim.enemies.map(e => [e.x, e.z]); window.__game.sim.enemies.forEach(e => { e.x += 400; e.z += 400; }); });
  if (who === 'G') await p.evaluate(() => { const s = window.__game.sim; window.__sSave = [...s.pos]; s.pos[0] += 7; });   // Shadow steps out of Ghost's frame (rendered only; the world is frozen)
  for (const view of ['front', 'side']) {
    await p.evaluate((who, view) => window.__BK.cam(who, view), who, view); await raf(8);   // the camera eases onto the override over a few frames
    const f = `${outdir}/${row}_${who}_${view}.png`; await p.screenshot({ path: f, clip: { x: 170, y: 30, width: 300, height: 300 } }); cells.push({ row, who, view, f });
  }
  if (who === 'G') await p.evaluate(() => { const s = window.__game.sim; s.pos = window.__sSave; });
  await p.evaluate(() => { window.__game.sim.enemies.forEach((e, i) => { e.x = window.__eSave[i][0]; e.z = window.__eSave[i][1]; }); });
  log.push({ row, who, ...st }); console.log(row, who, JSON.stringify(st));
}
const want = (r) => !only || only.split(',').includes(r);
const park = (away = true) => p.evaluate((away) => window.__BK.park(away), away);
const settle = async () => { await p.evaluate(() => { window.__ts = 1; }); await raf(4); for (let i = 0; i < 60; i++) { const a = await p.evaluate(() => window.__ghostState?.action); if (a !== 'transport') break; await raf(2); } await raf(2); };
const settleG = async () => { await settle(); for (let i = 0; i < 80; i++) { await raf(2); const ok = await p.evaluate(() => { const A = window.__ghostActor; return A.ground && Math.hypot(A.vel[0], A.vel[2]) < 0.2 && !A.mv; }); if (ok && i > 6) break; } };

if (want('run')) { await park(); await settle(); await p.evaluate(() => { const s = window.__game.sim; window.__t0 = s.t; window.__game.input.keys.w = true; const q = [...s.pos]; window.__pin = () => { const s = window.__game.sim; s.pos[0] = q[0]; s.pos[2] = q[2]; s.ang = 0; }; });
  const r = await until(`() => { const s = window.__game.sim; window.__game.input.keys.w = true; const hs = Math.hypot(s.vel[0], s.vel[2]); const ph = ((s.runPhase * 3) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI); return s.t - window.__t0 < 1.0 || hs < 5 ? 0.3 : (Math.abs(ph - Math.PI / 2) < 0.35 ? 0 : 0.02); }`);
  log.push({ run: r }); await shoot('run', 'S'); await shoot('run', 'G'); await p.evaluate(() => { window.__pin = null; window.__game.input.keys.w = false; }); }
if (want('jump')) { await park(); await settle(); await p.evaluate(() => { window.__game.input.jumpQ = true; });
  const r = await until(`() => { const s = window.__game.sim; return !s.ground && s.vel[1] < 2.5 ? 0 : 0.1; }`, 800, 0.3);
  log.push({ jump: r }); await shoot('jump', 'S'); await shoot('jump', 'G'); }
if (want('swing')) { await park(); await settle(); await p.evaluate(() => { const s = window.__game.sim, I = window.__game.input; s.pos[1] += 14; s.ground = false; s.anchor = [s.pos[0], s.pos[1] + 16, s.pos[2] + 7]; s.rope = Math.hypot(0, 16, 7); s.web = true; s.webT = 0.3; s.swings = 1; s.vel = [0, -6, 6]; I.swing = true; window.__t0 = s.t; });
  const r = await until(`() => { const s = window.__game.sim; window.__game.input.swing = true; if (!s.web) return null; return s.t - window.__t0 < 0.35 ? 0.35 - (s.t - window.__t0) : 0; }`, 800, 0.3);
  log.push({ swing: r }); await shoot('swing', 'S'); await shoot('swing', 'G'); await p.evaluate(() => { window.__game.input.swing = false; }); }
for (const [row, vy, after] of [['landsoft', -16, 0.06], ['landhard', -32, 0.16]]) { if (!want(row)) continue;
  for (const who of ['S', 'G']) { await park(); if (who === 'G') await settleG(); else await settle();
    await p.evaluate((who, vy) => { const o = who === 'S' ? window.__game.sim : window.__ghostActor; o.pos[1] += 1.2; o.ground = false; o.vel = [0, vy, 0]; window.__tg = null; window.__ts = 0.0005; }, who, vy); await raf(3);   // a few airborne frames first, so the landing is seen as a touchdown
    // timed on the hero's OWN clock (its landing value decays 3/s in its own sim), so Shadow and Ghost are compared at the same moment of their landing
    const r = await until(`() => { const o = ${who === 'S' ? 'window.__game.sim' : 'window.__ghostActor'}; if (o.ground && window.__tg == null) window.__tg = o.land; if (window.__tg == null) return 0.05; return ${after} - (window.__tg - o.land) / 3; }`, 600, 0.2);
    log.push({ [row + who]: r }); await shoot(row, who);
    if (who === 'S' && row === 'landhard') { await shoot(row, 'G'); break; } } }   // Ghost's hard landing is the mirrored one (in game she only lands hard with Shadow, carried by his landing); her own-drop variant is not reached by her AI
if (want('slamhold') || want('slamcrouch')) {
  await park(); await settle(); await p.evaluate(() => { const g = window.__game; g.input.meleeHeld = true; g.input.meleeAt = performance.now() - 230; g.input.slamHeld = true; window.__pin = () => { const I = window.__game.input; I.meleeHeld = true; I.slamHeld = true; }; });
  let r = await until(`() => { const S = window.__game.sim.slam; return S && S.ph === 0 ? 0.5 - S.t : 0.1; }`, 800, 0.3); log.push({ slamholdS: r }); await shoot('slamhold', 'S');
  await p.evaluate(() => { window.__pin = null; const I = window.__game.input; I.meleeHeld = false; I.slamHeld = false; });
  r = await until(`() => { const S = window.__game.sim.slam; if (!S) return null; return S.ph === 1 ? 0.05 - S.t : S.ph > 1 ? null : 0.02; }`, 400, 0.05); log.push({ slamcrouchS: r }); await shoot('slamcrouch', 'S');
  await park(); await p.evaluate(() => { window.__ts = 1; }); await raf(30); await park(); await settleG();
  // Ghost: her own Slam AI (2 bots within 6.5 m) holds the charge 0.75 s, then releases
  await p.evaluate(() => { const s = window.__game.sim, A = window.__ghostActor; window.__ghostDisableCombat = false; s.enemies.slice(0, 2).forEach((e, i) => { e.x = A.pos[0] + (i ? 2.5 : -2.5); e.z = A.pos[2] + 3.0; e.y = A.pos[1] - 1; e.hp = 99; e.down = 0; e.atk = -50; e.boss = false; e.kind = 0; e.air = false; }); window.__pin = () => { window.__game.sim.enemies.slice(0, 2).forEach(e => { e.atk = -50; }); }; });
  r = await until(`() => { const S = window.__ghostActor.slam; return S && S.ph === 0 ? 0.5 - S.t : 0.1; }`, 1500, 0.4); log.push({ slamholdG: r }); if (r === 'ok') await shoot('slamhold', 'G');
  r = await until(`() => { const S = window.__ghostActor.slam; if (!S) return 0.05; return S.ph === 1 ? 0.05 - S.t : S.ph > 1 ? null : 0.02; }`, 800, 0.05); log.push({ slamcrouchG: r }); if (r === 'ok') await shoot('slamcrouch', 'G');
  await p.evaluate(() => { window.__pin = null; window.__ghostDisableCombat = true; }); await park(); await p.evaluate(() => { window.__ts = 1; }); await raf(40);
}
if (want('kick')) {
  for (const who of ['S', 'G']) { await park(); if (who === 'G') await settleG(); else await settle();
    await p.evaluate((who) => { const s = window.__game.sim, o = who === 'S' ? s : window.__ghostActor, e = s.enemies[0]; e.x = o.pos[0]; e.z = o.pos[2] + 2.2; e.y = o.pos[1] - 1; e.hp = 99; e.down = 0; e.atk = -50; e.kind = 0; e.boss = false; e.kb = [0, 0];
      o.mv = { id: 3, t: 0, e, hit: false, d0: 2.2, spin: 1 }; window.__pin = () => { const e = window.__game.sim.enemies[0]; e.atk = -50; }; }, who);
    const O = who === 'S' ? 'window.__game.sim' : 'window.__ghostActor';
    let r = await until(`() => { const m = ${O}.mv; if (!m) return null; return 0.14 - m.t; }`, 800, 0.3); log.push({ ['kickchamber' + who]: r }); await shoot('kickchamber', who);
    r = await until(`() => { const m = ${O}.mv; if (!m) return null; return 0.26 - m.t; }`, 800, 0.3); log.push({ ['kick' + who]: r }); await shoot('kick', who);
    await p.evaluate(() => { window.__pin = null; }); }
}
if (want('hurt')) {
  for (const who of ['S', 'G']) { await park(); if (who === 'G') await settleG(); else await settle();
    await p.evaluate((who) => { const o = who === 'S' ? window.__game.sim : window.__ghostActor; o.hurtT = 0.3; }, who);
    const O = who === 'S' ? 'window.__game.sim' : 'window.__ghostActor';
    const r = await until(`() => { const o = ${O}; return o.hurtT - 0.21; }`, 600, 0.2); log.push({ ['hurt' + who]: r }); await shoot('hurt', who); }
}

// ---- FLY TUCK + FLIP TUCK (Nov 3): jump/fly hold through rise/apex/fall, glide, dodge flips (front, back, cartwheel), swing-release backflip and spring front flip,
// each hero triggered on its own and timed on its OWN clock (Ghost's headless clock runs about half Shadow's)
const OBJ = (who) => who === 'S' ? 'window.__game.sim' : 'window.__ghostActor';
const RIG = (who) => who === 'S' ? 'window.__rig' : 'window.__ghostRig';
const prep = async (who) => { await p.evaluate(() => { window.__camHips = false; }); await park(); if (who === 'G') await settleG(); else await settle(); await p.evaluate(() => { window.__camHips = true; }); };
if (want('fly')) {
  for (const who of ['S', 'G']) { await prep(who);
    await p.evaluate((who) => { const o = who === 'S' ? window.__game.sim : window.__ghostActor; o.pos[1] += 1.0; o.ground = false; o.vel = [0, 9, 0]; window.__ts = 0.3; }, who);
    for (const [row, src] of [['fly_rise', `() => { const o = ${OBJ(who)}; if (o.ground) return null; return (o.vel[1] - 5) / 25; }`], ['fly_apex', `() => { const o = ${OBJ(who)}; if (o.ground) return null; return o.vel[1] / 25; }`], ['fly_fall', `() => { const o = ${OBJ(who)}; if (o.ground) return null; return (o.vel[1] + 3.2) / 25; }`]]) {
      if (!want(row) && !want('fly')) continue; const r = await until(src, 800, 0.3); log.push({ [row + who]: r }); await shoot(row, who); } }
}
if (want('glide')) {
  for (const who of ['S', 'G']) { await prep(who);
    await p.evaluate((who) => { const o = who === 'S' ? window.__game.sim : window.__ghostActor; o.pos[1] += 6; o.ground = false; o.vel = [0, -1, 6]; o.glideOn = true; o.airT = 1; window.__t0 = o.t; window.__ts = 0.3;
      window.__pin = () => { const o = who === 'S' ? window.__game.sim : window.__ghostActor; o.glideOn = true; if (o.vel[1] < -2) o.vel[1] = -2; }; window.__game.input.glide = who === 'S'; }, who);
    let r = await until(`() => { const o = ${OBJ(who)}; return o.ground ? null : 0.45 - (o.t - window.__t0); }`, 800, 0.3); log.push({ ['glide' + who]: r }); await shoot('glide', who);
    await p.evaluate(() => { window.__pin = null; window.__game.input.glide = false; }); }
}
// dodge flips (sim flip, 0.5 s): ax x = front/back flip, ax z = cartwheel
for (const [name, ax, dir, us] of [['dflip', 'x', 1, [0.2, 0.45, 0.7]], ['bflip', 'x', -1, [0.45]], ['cart', 'z', 1, [0.3, 0.55]]]) { if (!want(name)) continue;
  for (const who of ['S', 'G']) { await prep(who);
    await p.evaluate((who, ax, dir) => { const o = who === 'S' ? window.__game.sim : window.__ghostActor; o.pos[1] += 0.6; o.ground = false; o.vel = [0, 7.5, 0]; o.dodgeT = 0.38; o.flip = { t: 0, dur: 0.5, ax, dir }; window.__ts = 0.0005; }, who, ax, dir);
    for (const u of us) { const row = `${name}_${Math.round(u * 100)}`;
      const r = await until(`() => { const f = ${OBJ(who)}.flip; if (!f) return null; return ${u} - f.t / f.dur; }`, 800, 0.2); log.push({ [row + who]: r }); await shoot(row, who); } }
}
// traversal flips (heroTraversal, 0.62 s): swing-release backflip (dir -1) and spring-release front flip (dir +1), started on the rig's own traversal state.
// Ghost only plays these while mirroring Shadow's traversal (her rig runs the flip with Shadow as the driver), so both rigs are started together with Shadow
// high in the air, and each hero is shot on its own flip clock (Shadow's set first, then a fresh start for Ghost's set).
for (const [name, dir, us] of [['rflip', -1, [0.25, 0.45, 0.7]], ['sflip', 1, [0.3, 0.5]]]) { if (!want(name)) continue;
  for (const who of (process.env.TUCK_TRAV_WHO || 'S').split(',')) { await prep('S');   // Ghost: her rig did not advance a flip started this way in the harness (she runs it only while mirroring Shadow's live traversal); TUCK_TRAV_WHO=S,G to try
    await p.evaluate((dir) => { const s = window.__game.sim, A = window.__ghostActor; s.pos[1] += 9; s.ground = false; s.vel = [0, 7, 8]; A.pos[1] = s.pos[1]; A.ground = false; A.vel = [0, 7, 8];
      for (const R of [window.__rig, window.__ghostRig]) { const T = R.__tv || (R.__tv = {}); const lean0 = R.poseRoot.rotation.x; Object.assign(T, { fl: 1, flT: 0, flD: 0.62, flP0: T.p || lean0, flV0: dir < 0 ? -6 : 6, flE: lean0 + dir * Math.PI * 2, flDir: dir, on: false, sp: 0 }); }
      window.__ts = 0.0005; }, dir);
    for (const u of us) { const row = `${name}_${Math.round(u * 100)}`;
      const r = await until(`() => { const T = ${RIG(who)}.__tv; if (!T || !T.fl) return null; return ${u} - T.flT / T.flD; }`, 800, 0.2); log.push({ [row + who]: r }); await shoot(row, who); } }
}
fs.writeFileSync(`${outdir}/cells.json`, JSON.stringify({ cells, log, errs }, null, 1));
console.log('ERRORS', errs.length, JSON.stringify(errs.slice(0, 5)));
await b.close(); process.exit(0);
