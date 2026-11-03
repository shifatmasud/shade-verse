// dev-only page (vite dev server): bakes the first screen's heroes, hands webp data URLs to bake_heroes.mjs via window.__bake
import { bakeHero, trim } from './heroBake';
import { HEROES } from './poses';

(async () => {
    const out: any[] = [];
    try {
        for (const s of HEROES) {
            const c = await bakeHero(s, 1);
            // sticker edge: a crisp off-white rim around the whole cut-out (it reads over any panel), then the ink hull inside it
            const pad = 6, rim = 3.2, e = document.createElement('canvas'); e.width = c.width + pad * 2; e.height = c.height + pad * 2;
            const ex = e.getContext('2d')!;
            for (let a = 0; a < 24; a++) ex.drawImage(c, pad + Math.cos((a / 24) * Math.PI * 2) * rim, pad + Math.sin((a / 24) * Math.PI * 2) * rim);
            ex.globalCompositeOperation = 'source-in'; ex.fillStyle = '#f4efe4'; ex.fillRect(0, 0, e.width, e.height);
            ex.globalCompositeOperation = 'source-over'; ex.drawImage(c, pad, pad);
            (e as any).hand = (c as any).hand;
            const t = trim(e);
            const half = document.createElement('canvas'); half.width = Math.ceil(t.canvas.width / 2); half.height = Math.ceil(t.canvas.height / 2);
            const hx = half.getContext('2d')!; hx.imageSmoothingQuality = 'high'; hx.drawImage(t.canvas, 0, 0, half.width, half.height);
            const hd = ((c as any).hand as number[]).map((v) => v + 6);
            out.push({ id: s.id, hand: [Math.round(s.box[0] + hd[0]), Math.round(s.box[1] + hd[1])], x: s.box[0] - 6 + t.x0, y: s.box[1] - 6 + t.y0, w: t.canvas.width, h: t.canvas.height, full: t.canvas.toDataURL('image/webp', 0.86), half: half.toDataURL('image/webp', 0.84) });
            t.canvas.style.cssText = 'display:block;margin:8px;background:#000'; document.body.appendChild(t.canvas);
        }
        (window as any).__bake = out;
    } catch (e) { (window as any).__bake = { error: String((e as any)?.stack || e) }; }
})();
