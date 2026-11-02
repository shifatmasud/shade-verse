/**
 * Drives the ported 3D mark (LogoMark3D.ts) on the title, with the motion of the portfolio preloader (src/preloader/boot.ts):
 * ~1 turn / 2.4 s, eased per turn so it lingers when it faces you and hurries through the back, a slow tilt bob, the key
 * light rising with progress, a light sweep across the face near 100 and on exit, and a short extra spin as the curtain lifts.
 * Reduced motion: one static 3/4 frame. dispose() removes nothing from the page (React owns the canvas); it stops the loop and
 * frees the few GL objects on an idle slot after the lift, off the world's first frames (portfolio v5.8: no loseContext).
 */
import { createLogoRenderer, type LogoFrame, type LogoRenderer } from './LogoMark3D';

export interface TitleLogo { progress(p: number): void; exit(): void; resize(): void; dispose(): void; readonly ok: boolean; frames: number }

export function createTitleLogo(cv: HTMLCanvasElement, reduced: boolean): TitleLogo {
    let R: LogoRenderer | null = createLogoRenderer(cv);
    let raf = 0, last = 0, phase = 0.08, prog = 0, progS = 0, exitT = 0, done = false;
    const fr: LogoFrame = { angle: 0, tilt: 0, key: 1, sweep: 0, sweepAmt: 0 };
    const api: TitleLogo = {
        ok: !!R && R.ok, frames: 0,
        progress(v) { prog = Math.max(prog, Math.min(1, v || 0)); },
        exit() { if (!exitT) { exitT = performance.now(); prog = 1; } },
        resize() { if (!R) return; const w = cv.clientWidth || 1; R.resize(Math.round(w * Math.min(devicePixelRatio || 1, 2))); },
        dispose() {
            if (done) return; done = true; cancelAnimationFrame(raf);
            const r = R; R = null;
            if (r) setTimeout(() => { const go = () => r.dispose(); if (typeof requestIdleCallback === 'function') requestIdleCallback(go, { timeout: 2000 }); else go(); }, 3000);
        },
    };
    if (!R || !R.ok) { R = null; return api; }
    const tick = (now: number) => {
        raf = requestAnimationFrame(tick);
        const dt = last ? Math.min((now - last) / 1000, 0.1) : 0; last = now;
        progS += (prog - progS) * (1 - Math.exp(-6 * dt));
        const p = progS;
        const ex = exitT ? Math.min((now - exitT) / 1000, 2) : 0;
        const speed = reduced ? 0 : (1 + 0.28 * p) * (1 + 2.2 * Math.exp(-((ex - 0.35) ** 2) / 0.08) * (exitT ? 1 : 0));
        phase += (dt / 2.4) * speed;
        const u = phase % 1;
        fr.angle = reduced ? -0.62 : 2 * Math.PI * u - 0.42 * Math.sin(2 * Math.PI * u);
        fr.tilt = reduced ? -0.16 : -0.1 + 0.05 * Math.sin(2 * Math.PI * phase * 0.5);
        fr.key = 0.78 + 0.22 * p;
        const sw = exitT ? Math.min(ex / 0.7, 1) : p > 0.9 ? ((p - 0.9) / 0.1) * 0.5 : 0;
        fr.sweep = sw; fr.sweepAmt = sw > 0 && sw < 1 ? Math.sin(Math.PI * sw) : 0;
        // reduced motion: draw once (and again only when the canvas is resized), never a loop of identical frames
        if (R && (!reduced || !api.frames)) { R.render(fr); api.frames++; }
    };
    api.resize();
    raf = requestAnimationFrame(tick);
    return api;
}
