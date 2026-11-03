// Bakes the first screen's two panel images (Shifat Nov 2 6:03 PM: "Or just ai generated image as close to real 3d as possible"):
//   node tools/title/bake_panels.mjs <shadow.png> <ghost.png>
// Takes the chosen AI renders (made from real game captures of each hero, tools/title/refshots.mjs) and writes
// src/title/art/panel-sunset.webp (Shadow) and panel-harbor.webp (Ghost), each cover-cropped to its frame's box at 2x design px,
// plus @h half-size copies for small screens. Uses headless Chrome's own canvas webp encoder (no extra packages).
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { layoutQuads } from './refshots.mjs';

const here = path.dirname(fileURLToPath(import.meta.url)), art = path.resolve(here, '../../src/title/art');
const [shadowPng, ghostPng] = process.argv.slice(2);
const quads = await layoutQuads();
const jobs = [['sunset', shadowPng, process.env.FOCUS_SUNSET || '0.5,0.5'], ['harbor', ghostPng, process.env.FOCUS_HARBOR || '0.5,0.5']];
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', headless: 'new', args: ['--no-sandbox'] });
try {
    const p = await b.newPage();
    for (const [id, file, focus] of jobs) {
        const q = quads[id], xs = q.map((v) => v[0]), ys = q.map((v) => v[1]), bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
        const out = await p.evaluate(async (src, bw, bh, focus) => {
            const im = new Image(); im.src = src; await im.decode();
            const [fx, fy] = focus.split(',').map(Number), enc = (k, qual) => {
                const c = document.createElement('canvas'); c.width = Math.round(bw * k); c.height = Math.round(bh * k);
                const s = Math.max(c.width / im.width, c.height / im.height), w = im.width * s, h = im.height * s;   // cover, like the SVG's xMidYMid slice
                const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(im, (c.width - w) * fx, (c.height - h) * fy, w, h);
                return c.toDataURL('image/webp', qual); };
            return { full: enc(2, 0.78), half: enc(1, 0.8) };
        }, 'data:image/png;base64,' + readFileSync(file).toString('base64'), bw, bh, focus);
        for (const [k, u] of Object.entries(out)) { const f = path.join(art, `panel-${id}${k === 'half' ? '@h' : ''}.webp`), buf = Buffer.from(u.split(',')[1], 'base64'); writeFileSync(f, buf); console.log(f, buf.length); }
    }
} finally { await b.close(); }
