// Renders a 42 s montage of the sound pass with the game's own buffers (procedural recipes + the shipped files)
// through an OfflineAudioContext, and writes a 16-bit WAV. usage: CHROME=... node test/sound-demo.mjs <url> <out.wav>
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
const [url, outWav] = [process.argv[2], process.argv[3]];
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage(); await p.setViewport({ width: 915, height: 412 });
p.on('pageerror', (e) => console.error('pageerror', String(e)));
await p.goto(url, { waitUntil: 'load' }); await new Promise((r) => setTimeout(r, 2000));
await p.mouse.click(400, 50); await new Promise((r) => setTimeout(r, 1000));
const b64 = await p.evaluate(async () => {
    const E = window.__audio.engine, { RECIPES } = window.__svSynth;
    const names = [...Object.keys(RECIPES), 'steps', 'birds', 'music_title', 'music_explore', 'music_action'];
    await Promise.all(names.map((n) => E.load(n)));
    const B = (n) => E.bufs.get(n);
    const SR = 44100, LEN = 42, c = new OfflineAudioContext(2, SR * LEN, SR);
    const lim = c.createDynamicsCompressor(); lim.threshold.value = -6; lim.knee.value = 6; lim.ratio.value = 8; lim.attack.value = 0.003; lim.release.value = 0.2; lim.connect(c.destination);
    const master = c.createGain(); master.gain.value = 1; master.connect(lim);
    const music = c.createGain(); music.gain.value = 0.55; music.connect(master);
    const muffle = c.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 20000; muffle.Q.value = 0.5; muffle.connect(master);
    const world = c.createGain(); world.connect(muffle);
    const one = (n, t, o = {}) => { const s = c.createBufferSource(); s.buffer = B(n); s.playbackRate.value = o.rate || 1; const g = c.createGain(); g.gain.value = o.gain ?? 1; const pn = c.createStereoPanner(); pn.pan.value = o.pan || 0; s.connect(g); g.connect(pn); pn.connect(world); if (o.dur) s.start(t, o.off || 0, o.dur); else s.start(t); return s; };
    const bed = (n, lvl, pts, o = {}) => { const s = c.createBufferSource(); s.buffer = B(n); s.loop = true; const g = c.createGain(); g.gain.setValueAtTime(0, 0); for (const [t, v] of pts) g.gain.linearRampToValueAtTime(v * lvl, t); const pn = c.createStereoPanner(); pn.pan.value = o.pan || 0; s.connect(g); g.connect(pn); pn.connect(o.bus || world); if (o.rate) { s.playbackRate.setValueAtTime(o.rate[0][1], 0); for (const [t, v] of o.rate) s.playbackRate.linearRampToValueAtTime(v, t); } s.start(0, o.off || 0); return { s, g, pn }; };
    const L = { city: 0.32, wind: 0.42, waves: 0.55, lake: 0.36, birds: 0.34, leaves: 0.2, underwater: 0.45, swingair: 0.4, glide: 0.4 };
    // ---- music: title theme, then the adaptive score (explore layer + action layer swelling with the swing and the fight)
    bed('music_title', 0.9, [[0.3, 1], [6.6, 1], [8.6, 0]], { bus: music });
    const ex = c.createBufferSource(), ac = c.createBufferSource(); ex.buffer = B('music_explore'); ac.buffer = B('music_action'); ex.loop = ac.loop = true;
    const ge = c.createGain(), ga = c.createGain(); ex.connect(ge); ac.connect(ga); ge.connect(music); ga.connect(music);
    ge.gain.setValueAtTime(0, 0); ge.gain.setValueAtTime(0, 7.4); ge.gain.linearRampToValueAtTime(0.8, 9); ge.gain.setValueAtTime(0.8, 30); ge.gain.linearRampToValueAtTime(0.85, 33);
    ga.gain.setValueAtTime(0, 0); ga.gain.setValueAtTime(0, 12.5); ga.gain.linearRampToValueAtTime(0.75, 15.5); ga.gain.linearRampToValueAtTime(0.95, 22); ga.gain.setValueAtTime(0.95, 28.5); ga.gain.linearRampToValueAtTime(0.05, 34); ga.gain.linearRampToValueAtTime(0.0, 38);
    ex.start(7.4); ac.start(7.4);
    music.gain.setValueAtTime(0.55, 35.0); music.gain.linearRampToValueAtTime(0.3, 35.4); music.gain.setValueAtTime(0.3, 38.8); music.gain.linearRampToValueAtTime(0.55, 39.4);
    // ---- ambience beds
    bed('city', L.city, [[0.5, 0.45], [7, 0.5], [9, 1], [13, 1], [16, 0.55], [22, 0.75], [28.5, 0.75], [31, 0.15], [34, 0.12], [35.2, 0]]);
    bed('wind', L.wind, [[0.5, 0.15], [8, 0.15], [9, 0.18], [13, 0.25], [17, 0.85], [21.5, 0.9], [22.4, 0.2], [29, 0.15], [35, 0], [39, 0], [39.6, 0.25]], { rate: [[0, 0.8], [13, 0.85], [18, 1.35], [21.5, 1.4], [22.4, 0.85]] });
    bed('swingair', L.swingair, [[13, 0], [13.4, 0.6], [17, 1], [21.5, 1], [22, 0]], { rate: [[13, 0.8], [15, 1.1], [16.4, 0.95], [18, 1.3], [19.4, 1.1], [21, 1.45]] });
    bed('lake', L.lake, [[29, 0], [31, 0.85], [35, 0.85], [35.2, 0], [38.8, 0]], { pan: 0.35 });
    bed('birds', L.birds, [[29, 0], [31.5, 0.9], [35, 0.9], [35.2, 0]]);
    bed('leaves', L.leaves, [[29, 0], [31.5, 0.8], [35, 0.8], [35.2, 0]], { pan: -0.3 });
    bed('underwater', L.underwater, [[35.1, 0], [35.4, 1], [38.6, 1], [38.9, 0]]);
    bed('waves', L.waves, [[38.8, 0], [40, 1], [42, 1]], { pan: -0.2 });
    muffle.frequency.setValueAtTime(20000, 35.15); muffle.frequency.setTargetAtTime(650, 35.2, 0.06); muffle.frequency.setValueAtTime(650, 38.8); muffle.frequency.setTargetAtTime(20000, 38.85, 0.15);
    // ---- title -> play hit
    one('start_hit', 6.8, { gain: 0.8 });
    // ---- street: concrete footsteps
    const SP = { concrete: [0, 0.32, 0.64, 0.96], grass: [1.28, 1.6, 1.92, 2.24], sand: [2.56, 2.88, 3.2, 3.52] };
    const steps = (surf, t0, t1, dt, g) => { let i = 0; for (let t = t0; t < t1; t += dt) one('steps', t, { off: SP[surf][(i++ * 3) % 4], dur: 0.3, gain: g * (surf === 'concrete' ? 0.55 : 0.7), rate: 0.94 + ((i * 37) % 10) / 80 }); };
    steps('concrete', 8.2, 12.6, 0.36, 0.6);
    // ---- swinging: three web lines with thwip + attach + whoosh, a release, a web spring, then the landing
    for (const t of [13.0, 15.6, 18.2]) { one('thwip', t, { gain: 0.6, rate: 0.9 }); one('attach', t + 0.1, { gain: 0.3, pan: 0.3 }); one('whoosh', t + 0.05, { gain: 0.6, rate: 0.95 + (t - 13) * 0.05 }); }
    one('whoosh', 20.3, { gain: 0.5, rate: 1.3 });
    one('spring', 20.5, { gain: 0.6 }); one('whoosh', 20.6, { gain: 0.35, rate: 0.7 });
    one('land', 22.0, { gain: 0.85 }); one('steps', 22.0, { off: 0.32, dur: 0.3, gain: 0.55 });
    // ---- fight: melee, web shot, Web Shock charge + zap, robot KO
    const hitAt = (t, pan) => { one('swish', t - 0.08, { gain: 0.4, rate: 1 + pan * 0.1 }); one('punch', t, { gain: 0.7, rate: 0.9 + Math.abs(pan) * 0.2 }); one('metal', t + 0.01, { gain: 0.5, pan, rate: 0.95 + pan * 0.05 }); };
    hitAt(22.7, 0.3); hitAt(23.1, -0.2); hitAt(23.55, 0.4); one('punch_heavy', 24.1, { gain: 0.9 }); one('metal', 24.11, { gain: 0.55, pan: 0.1, rate: 0.85 });
    one('thwip', 24.7, { gain: 0.55, rate: 1.25 }); one('metal', 24.95, { gain: 0.45, pan: -0.5 });
    one('shock_charge', 25.3, { gain: 0.6 }); one('zap', 26.8, { gain: 0.85 });
    one('metal', 26.82, { gain: 0.45, pan: -0.4 }); one('metal', 26.86, { gain: 0.45, pan: 0.45, rate: 1.1 }); one('enemy_down', 26.95, { gain: 0.75, pan: 0.3 }); one('enemy_down', 27.3, { gain: 0.6, pan: -0.45, rate: 1.08 });
    // ---- park and lake: grass footsteps, birds, rustling cherry blossoms, lapping water
    steps('grass', 30.0, 34.6, 0.4, 0.6);
    // ---- dive: splash, then everything underwater muffled with bubbles
    one('splash', 35.0, { gain: 0.75 });
    one('splash', 38.8, { gain: 0.5, rate: 1.1 });
    // ---- beach: sand steps by the waves
    steps('sand', 39.6, 41.6, 0.42, 0.65);
    const buf = await c.startRendering();
    const L0 = buf.getChannelData(0), R0 = buf.getChannelData(1), n = buf.length, pcm = new Int16Array(n * 2);
    for (let i = 0; i < n; i++) { pcm[i * 2] = Math.max(-1, Math.min(1, L0[i])) * 32767; pcm[i * 2 + 1] = Math.max(-1, Math.min(1, R0[i])) * 32767; }
    let s = ''; const u8 = new Uint8Array(pcm.buffer); for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s);
});
const pcm = Buffer.from(b64, 'base64'), h = Buffer.alloc(44);
h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(44100, 24); h.writeUInt32LE(44100 * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
writeFileSync(outWav, Buffer.concat([h, pcm])); console.log('wrote', outWav, pcm.length); await b.close();
