// Audio demo capture (Nov 3 audio polish): plays a melee combo, web shots, a Web Shock and a Slam next to 3 bots and records the OUTPUT stage (limiter / soft clip) with MediaRecorder + CDP screencast frames.
// usage: CHROME=<chrome> node test/audiorec.mjs http://127.0.0.1:<port>/ <outdir>   (VITE_DBG=1 build) -> <outdir>/a.webm, f/*.jpg, meta.json (frame timestamps + audio start) for ffmpeg

import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const url = process.argv[2], OUT = process.argv[3];
fs.mkdirSync(OUT + '/f', { recursive: true });
const b = await puppeteer.launch({ executablePath: process.env.CHROME, headless: 'new', ignoreDefaultArgs: ['--mute-audio'], args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage(); await p.setViewport({ width: 854, height: 480, deviceScaleFactor: 1 });
const errs = []; p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await p.goto(url, { waitUntil: 'load' }); await sleep(2500); await p.mouse.click(400, 50); await sleep(1500);
await p.evaluate(() => window.__game.start()); for (let i = 0; i < 160 && (await p.evaluate(() => window.__game.sim.mode)) !== 'play'; i++) await sleep(500);
await sleep(2500);
await p.evaluate(() => { const els = [...document.querySelectorAll('body *')].filter((el) => /WASD|Space|hold/i.test(el.innerText || '') && el.children.length < 40); els.sort((a, b) => (a.innerText.length - b.innerText.length)); const big = els.filter((el) => el.getBoundingClientRect().width > 120).pop(); if (big) big.style.visibility = 'hidden';
  window.__camOvShake = 1; setInterval(() => { const s = window.__game.sim; window.__camOv = [s.pos[0] + 3.0, s.pos[1] + 2.3, s.pos[2] - 6.2, s.pos[0] + 3.2, s.pos[1] + 0.6, s.pos[2]]; }, 16); });
const BX = -8, BZ = -60;
const place = () => p.evaluate((BX, BZ) => { const s = window.__game.sim; s.pos[0] = BX; s.pos[1] = 1; s.pos[2] = BZ; s.vel = [0, 0, 0]; s.ground = true; s.web = false; s.ang = Math.PI / 2; s.yaw = Math.PI / 2; s.combo = 0;
  const proto = JSON.parse(JSON.stringify(s.enemies.find((e) => !e.boss && !e.air && !e.roof) || s.enemies[0]));
  const L = [[2.6, 0], [4.0, -1.8], [4.2, 1.8]].map(([dx, dz], i) => ({ ...JSON.parse(JSON.stringify(proto)), x: BX + dx, y: 1, z: BZ + dz, hp: 9, atk: -50, hit: 0, kb: [0, 0], down: 0, ly: 0, vy: 0, slam: 0, kind: i % 4, uni: undefined, roof: undefined, air: undefined, boss: undefined }));
  s.enemies.length = 0; for (const e of L) s.enemies.push(e); window.__ghostDisableCombat = false; }, BX, BZ);
await place(); await sleep(1200);
// audio tap: the output stage (limiter / soft clip) into a MediaRecorder = what reaches the speakers
await p.evaluate(() => { const E = window.__audio.engine, c = E.ctx, d = c.createMediaStreamDestination(); (E.out || E.master).connect(d);
  const ch = []; const r = new MediaRecorder(d.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 96000 }); r.ondataavailable = (e) => ch.push(e.data);
  window.__recA = { r, ch, t0: 0 }; r.onstart = () => { window.__recA.t0 = Date.now() / 1000; }; r.start(250); });
const cdp = await p.target().createCDPSession(); const frames = [];
cdp.on('Page.screencastFrame', async (f) => { frames.push(f.metadata.timestamp); fs.writeFileSync(`${OUT}/f/${String(frames.length).padStart(5, '0')}.jpg`, Buffer.from(f.data, 'base64')); try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch (e) {} });
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, everyNthFrame: 1 });
const tap = async (k, ms = 80) => { await p.keyboard.down(k); await sleep(ms); await p.keyboard.up(k); };
await sleep(500);
await tap('KeyK'); await sleep(380); await tap('KeyK'); await sleep(380); await tap('KeyK'); await sleep(1400);   // jab, cross, spin-kick finisher
await place(); await sleep(500);
await tap('KeyJ'); await sleep(700); await tap('KeyJ'); await sleep(900);   // web shots
await tap('KeyJ', 650); await sleep(2200);   // Web Shock (hold)
await place(); await sleep(500);
await tap('KeyK', 900); await sleep(2600);   // Slam (hold K past HOLD_MS)
await cdp.send('Page.stopScreencast');
const audio = await p.evaluate(async () => { const A = window.__recA; await new Promise((res) => { A.r.onstop = res; A.r.stop(); }); const bl = new Blob(A.ch, { type: 'audio/webm' }); const buf = new Uint8Array(await bl.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return { t0: A.t0, b64: btoa(s) }; });
fs.writeFileSync(OUT + '/a.webm', Buffer.from(audio.b64, 'base64'));
fs.writeFileSync(OUT + '/meta.json', JSON.stringify({ frames, aT0: audio.t0, errs }));
console.log('frames', frames.length, 'span', (frames[frames.length - 1] - frames[0]).toFixed(2), 'audioT0-frame0', (audio.t0 - frames[0]).toFixed(3), 'errors', JSON.stringify(errs));
await b.close();
