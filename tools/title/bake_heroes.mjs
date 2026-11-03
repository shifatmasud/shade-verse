// Bakes the first screen's two heroes from the REAL game models (tools/title/heroBake.ts, poses.ts) into transparent webp cut-outs:
//   node tools/title/bake_heroes.mjs        (CHROME=/path/to/chrome to pick a browser; default: puppeteer's)
// Writes src/title/art/<id>.webp, <id>@h.webp and src/title/art/heroes.json (position + size in the 1920x1080 design space).
// Re-run whenever the hero mesh, Ghost's body or the trim colours change. Nothing 3D ships on the title: only these images.
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const art = path.join(root, 'src/title/art');
const server = await createServer({ root, logLevel: 'error', server: { port: 0, host: '127.0.0.1' }, optimizeDeps: { noDiscovery: true, include: [] } });
await server.listen();
const port = server.httpServer.address().port;
const exe = process.env.CHROME || '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const b = await puppeteer.launch({ executablePath: exe, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
    const p = await b.newPage();
    p.on('pageerror', (e) => console.error('pageerror', e.message));
    await p.goto(`http://127.0.0.1:${port}/tools/title/bake.html`, { waitUntil: 'load', timeout: 120000 });
    await p.waitForFunction(() => window.__bake, { timeout: 180000 });
    const res = await p.evaluate(() => window.__bake);
    if (res.error) throw new Error(res.error);
    mkdirSync(art, { recursive: true });
    const meta = {};
    for (const r of res) {
        writeFileSync(path.join(art, `${r.id}.webp`), Buffer.from(r.full.split(',')[1], 'base64'));
        writeFileSync(path.join(art, `${r.id}@h.webp`), Buffer.from(r.half.split(',')[1], 'base64'));
        meta[r.id] = { x: r.x, y: r.y, w: r.w, h: r.h, hand: r.hand };
        console.log('baked', r.id, meta[r.id]);
    }
    writeFileSync(path.join(art, 'heroes.json'), JSON.stringify(meta, null, 2) + '\n');
    if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT, fullPage: true });
} finally { await b.close(); await server.close(); }
