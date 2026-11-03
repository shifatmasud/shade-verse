
import { launch } from './_tmp_rec_lib.mjs';
import fs from 'node:fs';
const OUT = '/tmp/svrec_frames';
const only = process.argv[2] ? process.argv[2].split(',') : null;
const BASE = [-8, 1, -60]; const R90 = Math.PI / 2;

// page-side helpers installed once
const HELPERS = `(() => {
  const g = window.__game;
  window.__rec = {
    cam: null, c: null, l: null,
    place(cfg) {
      const s = g.sim, inp = g.input;
      for (const k of Object.keys(inp.keys)) delete inp.keys[k];
      Object.assign(inp, { attackQ: false, meleeQ: false, shotQ: false, specialQ: false, grabQ: false, swing: false, swingQ: false, jumpQ: false, jumpHeld: false, glide: false, dodgeQ: false, mx: 0, my: 0 });
      const sa = s;
      s.pos[0] = cfg.pos[0]; s.pos[1] = cfg.pos[1]; s.pos[2] = cfg.pos[2]; s.vel[0] = s.vel[1] = s.vel[2] = 0;
      s.web = false; s.wall = null; s.wallB = -1; s.wallT = 0; s.ground = true; s.spring = 0; s.glideOn = false; s.swim = false; s.dive = false; s.grappleFlight = false;
      sa.mv = null; sa.mvQ = false; sa.flip = null; sa.chain = 0; sa.chainT = 0; sa.snareT = 0; sa.snareList = []; sa.snareCd = 0; sa.cWeb = null; sa.hitStop = 0; sa.shake = 0;
      s.atkT = 0; s.shotT = 0; s.plasma.length = 0; s.blasts.length = 0; if (s.eshots) s.eshots.length = 0; s.hp = 100; s.combo = 0;
      s.ang = cfg.ang || 0; s.yaw = cfg.yaw ?? s.ang; if (cfg.pitch != null) s.pitch = cfg.pitch;
      const proto = this.proto || (this.proto = JSON.parse(JSON.stringify(s.enemies.find(e => !e.boss && !e.air && !e.roof) || s.enemies[0])));
      const A = cfg.ang || 0, fx = Math.sin(A), fz = Math.cos(A), rx = -fz, rz = fx;
      const list = (cfg.enemies || []).map((d, i) => ({ ...JSON.parse(JSON.stringify(proto)), x: cfg.pos[0] + d[1] * fx + d[0] * rx, y: d[3] ?? 1, z: cfg.pos[2] + d[1] * fz + d[0] * rz, hp: d[2] ?? 50, atk: -5, hit: 0, kb: [0, 0], down: 0, ly: 0, vy: 0, slam: 0, kind: i % 4, uni: undefined, roof: undefined, air: undefined, boss: undefined }));
      s.enemies.length = 0; for (const e of list) s.enemies.push(e);
      window.__ghostDisableCombat = !!cfg.ghostOff;
      this.passive = cfg.passive !== false;
      this.cam = cfg.cam ? { ...cfg.cam } : null; if (this.cam && !this.cam.world) { const o = this.cam.off; this.cam.off = [o[0] * rx + o[2] * fx, o[1], o[0] * rz + o[2] * fz]; } this.c = null; this.l = null;
    },
    camStep() {
      const s = g.sim, cfg = this.cam; if (!cfg) { window.__camOv = null; return; }
      const gp = window.__ghostState && window.__ghostState.position;
      let tx, ty, tz;
      const e = s.enemies.find(e => e.down <= 0) || s.enemies[0];
      if (cfg.t === 'hero' || !e) { tx = s.pos[0]; ty = s.pos[1]; tz = s.pos[2]; }
      else if (cfg.t === 'ghost' && gp) { tx = gp[0]; ty = gp[1]; tz = gp[2]; }
      else if (cfg.t === 'ghostmid' && gp) { tx = (gp[0] + s.pos[0] + e.x) / 3; ty = (gp[1] + s.pos[1]) / 2; tz = (gp[2] + s.pos[2] + e.z) / 3; }
      else { tx = (s.pos[0] + e.x) / 2; ty = 1 + 0.5 * Math.max(0, s.pos[1] - 1); tz = (s.pos[2] + e.z) / 2; }
      if (cfg.t === 'ots' && e) { const want = [s.pos[0] + cfg.off[0], s.pos[1] + cfg.off[1], s.pos[2] + cfg.off[2]], look = [e.x, (e.y || 1) + (e.ly || 0) + (cfg.ly ?? 0.6), e.z]; if (!this.c) { this.c = want.slice(); this.l = look.slice(); } const kk = cfg.k ?? 0.12; for (let i = 0; i < 3; i++) { this.c[i] += (want[i] - this.c[i]) * kk; this.l[i] += (look[i] - this.l[i]) * kk; } const shk = s.shake || 0; let cx = this.c[0], cy = this.c[1], cz = this.c[2]; if (shk > 0.001) { const a = shk * shk * 2.2, tt = s.t * 61; cx += Math.sin(tt * 1.3) * a; cy += Math.sin(tt * 1.9 + 1.7) * a * 0.8; cz += Math.sin(tt * 1.1 + 4.1) * a; } window.__camOv = [cx, cy, cz, this.l[0], this.l[1], this.l[2]]; return; }
      if (cfg.fixedLook) { tx = cfg.fixedLook[0]; ty = cfg.fixedLook[1]; tz = cfg.fixedLook[2]; }
      const k = this.c ? (cfg.k ?? 0.12) : 1;
      const want = [tx + cfg.off[0], ty + cfg.off[1], tz + cfg.off[2]], look = [tx, ty + (cfg.ly ?? 0.6), tz];
      if (!this.c) { this.c = want.slice(); this.l = look.slice(); }
      for (let i = 0; i < 3; i++) { this.c[i] += (want[i] - this.c[i]) * k; this.l[i] += (look[i] - this.l[i]) * Math.min(1, k * 1.6); }
      let cx = this.c[0], cy = this.c[1], cz = this.c[2];
      const shk = s.shake || 0; if (shk > 0.001) { const a = shk * shk * 2.2, tt = s.t * 61; cx += Math.sin(tt * 1.3) * a; cy += Math.sin(tt * 1.9 + 1.7) * a * 0.8; cz += Math.sin(tt * 1.1 + 4.1) * a; }
      window.__camOv = [cx, cy, cz, this.l[0], this.l[1], this.l[2]];
    },
    step(ms) {
      const s = g.sim;
      s.hp = 100; s.time = 75;
      if (this.passive) for (const e of s.enemies) if (e.atk > 0 || e.atk > -0.5) e.atk = -1;
      this.camStep();
      window.__vclock.tick(ms);
      const sa = s, m = sa.mv;
      return { t: +s.t.toFixed(4), mv: m ? m.id : 0, mvt: m ? +m.t.toFixed(3) : 0, hitF: m ? m.hit : false, atkT: +s.atkT.toFixed(3), shotT: +s.shotT.toFixed(3), snareT: +(sa.snareT || 0).toFixed(3), spring: +(s.spring || 0).toFixed(3), web: s.web, ground: s.ground, wall: !!s.wall, glide: s.glideOn, hitStop: +(sa.hitStop || 0).toFixed(3), shake: +(sa.shake || 0).toFixed(3), combo: s.combo, flip: sa.flip ? +sa.flip.t.toFixed(2) : 0, land: +(s.land || 0).toFixed(2), landHard: +(s.landHard || 0).toFixed(2), pos: s.pos.map(v => +v.toFixed(2)), vel: s.vel.map(v => +v.toFixed(1)), plasma: s.plasma.length, en: s.enemies.map(e => [+e.hp.toFixed(1), +(e.hit || 0).toFixed(2), +(e.ly || 0).toFixed(2), +e.down.toFixed(2)]), ghost: window.__ghostState ? { a: window.__ghostState.action, p: (window.__ghostState.position || []).map(v => +v.toFixed(1)) } : null };
    },
  };
})()`;

// Inputs: frame -> page code (runs before the tick)
const tapM = `Object.assign(__game.input, { attackQ: true, meleeQ: true })`;
const tapS = `Object.assign(__game.input, { attackQ: true, shotQ: true })`;
const SEG = [
  { name: 'combo', title: 'Shadow - melee combo (tap Melee x6)', fps: 60, n: 170, slow: true,
    setup: { pos: BASE, ang: R90, enemies: [[0, 2.4, 99]], ghostOff: true, cam: { t: 'mid', off: [3.9, 1.5, 1.6], ly: 1.0 } },
    at: { 12: tapM, 30: tapM, 48: tapM, 70: tapM, 96: tapM, 120: tapM } },
  { name: 'combo_ko', title: 'Shadow - combo to KO (enemy 4 HP)', fps: 60, n: 150, slow: false,
    setup: { pos: BASE, ang: R90, enemies: [[0, 2.4, 4]], ghostOff: true, cam: { t: 'mid', off: [-4.0, 1.6, 2.0], ly: 0.9 } },
    at: { 10: tapM, 26: tapM, 42: tapM, 62: tapM } },
  { name: 'pull', title: 'Shadow - web-pull strike (Melee at 11 m)', fps: 60, n: 90, slow: true,
    setup: { pos: BASE, ang: R90, enemies: [[0, 11, 99]], ghostOff: true, cam: { t: 'mid', off: [-6.5, 2.0, 0.5], ly: 0.9, k: 0.2 } },
    at: { 10: tapM } },
  { name: 'shot', title: 'Shadow - web shot (tap Attack x3)', fps: 60, n: 120, slow: true,
    setup: { pos: BASE, ang: R90, enemies: [[0, 14, 99]], ghostOff: true, cam: { t: 'ots', off: [-2.6, 2.1, -3.6], ly: 0.6 } },
    at: { 10: tapS, 34: tapS, 58: tapS } },
  { name: 'yank', title: 'Shadow - launcher > aerial > web yank', fps: 60, n: 170, slow: true,
    setup: { pos: BASE, ang: R90, enemies: [[0, 2.4, 99]], ghostOff: true, cam: { t: 'mid', off: [4.4, 1.8, 1.0], ly: 1.4 } },
    at: { 8: tapM, 24: tapM, 40: tapM, 60: tapM, 84: tapS, 110: tapS } },
  { name: 'shock', title: 'Shadow - Web Shock (hold Attack)', fps: 60, n: 130, slow: true,
    setup: { pos: BASE, ang: R90, enemies: [[0, 8, 99], [4, 6, 99], [-5, 7, 99], [3, 12, 99], [-4, 13, 99]], ghostOff: true, cam: { t: 'hero', off: [-4.2, 2.6, 4.6], ly: 0.9, k: 0.1 } },
    at: { 10: `__game.input.specialQ = true` } },
  { name: 'dodge', title: 'Shadow - dodge flip', fps: 60, n: 60, slow: false,
    setup: { pos: BASE, ang: R90, enemies: [[0, 3, 99]], ghostOff: true, cam: { t: 'mid', off: [-4.5, 1.6, 0.5], ly: 0.9 } },
    at: { 8: `__game.input.dodgeQ = true; __game.input.keys['a'] = true`, 12: `delete __game.input.keys['a']`, 36: `__game.input.dodgeQ = true; __game.input.keys['s'] = true`, 40: `delete __game.input.keys['s']` } },
  { name: 'jump', title: 'Shadow - jump, double jump, fly, glide, land', fps: 30, n: 135, slow: false,
    setup: { pos: BASE, ang: R90, enemies: [], ghostOff: true, cam: { t: 'hero', off: [-5.5, 1.6, 1.5], ly: 0.9, k: 0.2 } },
    at: { 5: `__game.input.jumpQ = true; __game.input.jumpHeld = true`, 8: `__game.input.jumpHeld = false; __game.input.jumpReleased = true`, 13: `__game.input.jumpQ = true; __game.input.jumpHeld = true`, 14: `__game.input.jumpHeld = false; __game.input.jumpReleased = true`, 26: `__game.input.jumpQ = true; __game.input.jumpHeld = true; __game.input.keys['w'] = true`, 52: `__game.input.jumpHeld = false; __game.input.jumpReleased = true`, 70: `__game.input.jumpQ = true; __game.input.jumpHeld = true`, 71: `__game.input.jumpHeld = false; __game.input.jumpReleased = true`, 80: `delete __game.input.keys['w']` } },
  { name: 'spring', title: 'Shadow - web spring / zip (tap Web)', fps: 30, n: 70, slow: false,
    setup: { pos: BASE, ang: R90, enemies: [], ghostOff: true, cam: { t: 'hero', off: [-6, 2.0, -3], ly: 1, k: 0.22 } },
    at: { 5: `__game.input.grabQ = true` } },
  { name: 'swing', title: 'Shadow - web swing (hold Web)', fps: 30, n: 150, slow: false,
    setup: { pos: BASE, ang: R90, enemies: [], ghostOff: true, cam: { t: 'hero', off: [-5.5, 1.8, -4.5], ly: 1, k: 0.25 } },
    at: { 3: `__game.input.jumpQ = true; __game.input.keys['w'] = true`, 10: `__game.input.swingQ = true; __game.input.swing = true`, 58: `__game.input.swing = false`, 64: `__game.input.swingQ = true; __game.input.swing = true`, 112: `__game.input.swing = false`, 118: `__game.input.swingQ = true; __game.input.swing = true` } },
  { name: 'wall', title: 'Shadow - wall crawl', fps: 30, n: 100, slow: false,
    setup: { pos: BASE, ang: 0, yaw: 0, enemies: [], ghostOff: true, cam: { t: 'hero', world: true, off: [5.5, 1.2, -6.5], ly: 1, k: 0.2 } },
    at: { 2: `__game.input.keys['w'] = true` } },
  { name: 'ghost', title: 'Ghost (AI partner) - fighting', fps: 60, n: 360, slow: false,
    setup: { pos: BASE, ang: R90, enemies: [[-3, 6, 99], [2, 9, 99], [-2, 12, 99]], ghostOff: false, passive: false, cam: { t: 'ghostmid', off: [-6.5, 2.6, -2], ly: 0.9, k: 0.1 } },
    at: {} },
];

const { browser, page, cdp, errors } = await launch();
try {
  await page.evaluate(HELPERS);
  const meta = [];
  for (const seg of SEG) {
    if (only && !only.includes(seg.name)) continue;
    const dir = `${OUT}/${seg.name}`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    await page.evaluate((c) => window.__rec.place(c), seg.setup);
    // settle 20 frames, not recorded
    for (let i = 0; i < 60; i++) await page.evaluate(() => window.__rec.step(1000 / 60));
    await page.evaluate((c) => window.__rec.place(c), seg.setup);
    for (let i = 0; i < 4; i++) await page.evaluate(() => window.__rec.step(1000 / 60));
    const log = []; const t0 = Date.now();
    for (let f = 0; f < seg.n; f++) {
      if (seg.at[f]) await page.evaluate(seg.at[f]);
      const st = await page.evaluate((ms) => window.__rec.step(ms), 1000 / seg.fps);
      st.f = f; log.push(st);
      const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
      fs.writeFileSync(`${dir}/${String(f).padStart(5, '0')}.jpg`, Buffer.from(r.data, 'base64'));
    }
    fs.writeFileSync(`${dir}/log.json`, JSON.stringify(log));
    meta.push({ name: seg.name, title: seg.title, fps: seg.fps, n: seg.n, slow: seg.slow, wall_s: (Date.now() - t0) / 1000 });
    console.log(seg.name, 'done', (Date.now() - t0) / 1000, 's');
  }
  fs.writeFileSync(`${OUT}/meta_${only ? only.join('_') : 'all'}.json`, JSON.stringify(meta));
  console.log('errors', JSON.stringify(errors.slice(0, 10)));
} finally { await browser.close(); }
