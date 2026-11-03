/**
 * ONE title button, two variants (Shifat Nov 2 7:28 PM: "Our titlescreen play button reuses same button style of volume button
 * right? Must be same button but variant. Same fluid press wavy interaction"; 7:31 PM: "Just use code from my portfolio.").
 * The portfolio's header sound pill, copied from surface-tension:
 *  - markup: src/dom/ui/Header.tsx `pill pill--quiet pill--sound` (two wave copies rolling in `.sroll`, the `.ink` flood layer
 *    holding the inverse-ink copies, `inv()` and the `invert` wave), bound with `bindInk` (./portfolio/inkButton.ts, a copy of
 *    src/services/inkButton.ts with src/core/house.ts as ./portfolio/house.ts);
 *  - styles: src/styles/app.css .pill / .pill--quiet / .pill--sound / .ink / .sroll / .big-btn .ia-b (./portfolio/ink.css).
 * Variants: 'quiet' = the sound toggle exactly as on the portfolio (bindInk kind 'sound'); 'play' = the same pill as a white disc
 * with the black comic ring and the play triangle, bound as the portfolio's big CTA (kind 'cta': its bigger magnet / ripple and
 * its arrow roll for the triangle). Its ink is the same `.pill--sound .ink { background: currentColor }`: black on Play.
 * Not copied (portfolio-only): audio.tick on hover, data-cursor, the header tone MutationObserver. The wave keeps this title's
 * own easing on toggle (the toggle must work exactly as before); the portfolio's `invert` copy is added to it.
 * The click is never held: onClick is the browser's own click; the ink keeps playing while the title leaves.
 */
import React, { useEffect, useRef } from 'react';
import { bindInk, inkKeyDown, inkKeyUp } from './portfolio/inkButton';
import './portfolio/ink.css';

/** BUTTON v2: the ink copy of the wave draws in the opposite of the header ink (the flood is the ink itself) */
function inv(c: string) {
  const m = c.match(/[\d.]+/g); if (!m) return '#fafafa'
  return (0.2126 * +m[0] + 0.7152 * +m[1] + 0.0722 * +m[2]) > 128 ? '#121315' : '#fafafa'
}

/** the sound toggle's ONE thin stroke: on, a gentle sine drifts; off, it eases to flat; static under reduced motion */
function Wave({ on, invert = false }: { on: boolean; invert?: boolean }) {
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
            const color = getComputedStyle(c).color;
            ctx.clearRect(0, 0, W, H); ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = invert ? inv(color) : color;
            ctx.beginPath();
            for (let x = 1; x <= W - 1; x += 0.5) { const env = Math.sin((Math.PI * (x - 1)) / (W - 2)); const y = H / 2 + Math.sin(x * 0.62 - phase) * 3 * amp * env; x === 1 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
            ctx.stroke();
            if (reduced || (target === 0 && amp < 0.002)) { raf = 0; return; }   // settled and still: stop drawing until the state changes
            raf = requestAnimationFrame(draw);
        };
        kick.current = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(draw); } };
        raf = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(raf);
    }, [invert]);
    useEffect(() => { kick.current(); }, [on]);
    return <canvas ref={ref} className="sv-wave" aria-hidden="true" />;
}

const Tri = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.8l10 6.2-10 6.2z" fill="currentColor" /></svg>;

type Props = {
    variant: 'quiet' | 'play';
    className?: string;
    style?: React.CSSProperties;
    label: string;
    pressed?: boolean;          // quiet: aria-pressed (sound on)
    on?: boolean;               // quiet: the wave's state
    onPress: () => void;
    /** play: Space presses this button (Shifat Nov 2 7:37 PM), from `spaceAfter` ms after mount while true */
    space?: boolean;
    spaceAfter?: number;
};

export function TitleButton({ variant, className, style, label, pressed, on = true, onPress, space = false, spaceAfter = 0 }: Props) {
    const ref = useRef<HTMLButtonElement>(null), pressRef = useRef(onPress);
    pressRef.current = onPress;
    useEffect(() => bindInk(ref.current, variant === 'play' ? 'cta' : 'sound'), [variant]);
    // Space = a press on this button (Shifat Nov 2 7:37 PM "Play must start with spacebar on press too alongside play button click"):
    // the same onPress as the click, once (no key repeat, one press per mount), only once the button is up (its intro is over),
    // and not when the button has focus itself (the browser's own Space activation is that press). App's own title "any key starts"
    // shares the same guarded start(), so the two never start twice; in game this listener is gone (the title unmounts / leaves).
    useEffect(() => {
        if (!space) return;
        const t0 = performance.now(); let fired = false, held = false;
        const focused = () => document.activeElement === ref.current;
        const down = (e: KeyboardEvent) => {
            if (e.code !== 'Space' && e.key !== ' ') return;
            if (e.repeat || fired || focused() || performance.now() - t0 < spaceAfter) return;
            fired = true; held = true; inkKeyDown(ref.current); pressRef.current();
        };
        const up = (e: KeyboardEvent) => { if ((e.code === 'Space' || e.key === ' ') && held) { held = false; inkKeyUp(ref.current); } };
        window.addEventListener('keydown', down); window.addEventListener('keyup', up);
        return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
    }, [space, spaceAfter]);
    const glyph = (invert: boolean) => variant === 'quiet'
        ? <span className="sroll ink-par"><span className="ir-a"><Wave on={on} invert={invert} /></span><span className="ir-b"><Wave on={on} invert={invert} /></span></span>
        : <span className="sroll ink-par"><span className="ia-a"><Tri /></span><span className="ia-b"><Tri /></span></span>;
    return <button type="button" ref={ref} className={`pill pill--sound ${variant === 'quiet' ? 'pill--quiet' : 'pill--play'}${className ? ' ' + className : ''}`} style={style}
        aria-label={label} aria-pressed={pressed} onClick={(e) => { e.stopPropagation(); onPress(); }}>
        {/* BUTTON v2 (mockup): two glyph copies roll in a mask; .ink is the flood with the inverse-ink copy */}
        {glyph(false)}
        <span className="ink" aria-hidden="true">{glyph(true)}</span>
    </button>;
}
