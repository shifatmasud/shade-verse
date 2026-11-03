/**
 * The portfolio's header, for the Shade Verse first screen (Shifat Nov 2 3:24 PM: "Top left side logo like my portfolio. Top right
 * volume button like my portfolio"). Ported from surface-tension src/dom/ui/Header.tsx + app.css .header/.wordmark/.pill--quiet:
 *  - left: his flat mark ONLY, no word beside it (Shifat Nov 2 4:24 PM: "Top left logo don't need logo text. Symbol only.");
 *  - right: the quiet sound toggle, ONE thin stroke (his W19 note: "Volume button doesn't need volume icon just animate simple
 *    single wave line"): on, a gentle sine drifts; off, it eases to flat; static under reduced motion. 40 px tall, 44 px+ hit area.
 * The mute itself is the game's master mute (App passes muted / onToggle); the choice persists (localStorage 'sv-muted').
 */
import React, { useEffect, useRef } from 'react';

export const MARK_PATH = 'M100 0H200L100 100H0Z M100 100H200L100 200H0Z';
export const Mark = ({ size = '100%' }: { size?: string }) => <svg viewBox="0 0 200 200" width={size} height={size} fill="currentColor" aria-hidden="true" focusable="false"><path d={MARK_PATH} /></svg>;

function Wave({ on }: { on: boolean }) {
    const ref = useRef<HTMLCanvasElement>(null), onRef = useRef(on), kick = useRef<() => void>(() => {});
    onRef.current = on;
    useEffect(() => {
        const c = ref.current!; const ctx = c.getContext('2d')!;
        const W = 22, H = 14, dpr = Math.min(devicePixelRatio || 1, 2); c.width = W * dpr; c.height = H * dpr; ctx.scale(dpr, dpr);
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        let raf = 0, amp = onRef.current ? 1 : 0, phase = 0, last = performance.now();
        const draw = (now: number) => {
            const dt = Math.min(0.05, (now - last) / 1000); last = now;
            const target = onRef.current ? 1 : 0;
            amp = reduced ? target : amp + (target - amp) * (1 - Math.exp(-6 * dt));
            if (!reduced) phase += dt * 3.2;
            ctx.clearRect(0, 0, W, H); ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = getComputedStyle(c).color;
            ctx.beginPath();
            for (let x = 1; x <= W - 1; x += 0.5) { const env = Math.sin((Math.PI * (x - 1)) / (W - 2)); const y = H / 2 + Math.sin(x * 0.62 - phase) * 3 * amp * env; x === 1 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
            ctx.stroke();
            if (reduced || (target === 0 && amp < 0.002)) { raf = 0; return; }   // settled and still: stop drawing until the state changes
            raf = requestAnimationFrame(draw);
        };
        kick.current = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(draw); } };
        raf = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(raf);
    }, []);
    useEffect(() => { kick.current(); }, [on]);
    return <canvas ref={ref} className="sv-wave" aria-hidden="true" />;
}

export function TitleHeader({ word, muted, onToggle }: { word: string; muted: boolean; onToggle: () => void }) {
    return <header className="sv-hdr" onClick={(e) => e.stopPropagation()}>
        <span className="sv-wordmark" role="img" aria-label={word}><span className="sv-wordmark__mark"><Mark /></span></span>
        <button type="button" className="sv-sound" onClick={(e) => { e.stopPropagation(); onToggle(); }} aria-pressed={!muted} aria-label={muted ? 'Sound off' : 'Sound on'}><Wave on={!muted} /></button>
    </header>;
}
