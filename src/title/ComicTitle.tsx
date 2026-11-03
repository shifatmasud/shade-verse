/**
 * The first screen before Play, all illustration from code (Shifat Nov 2 4:03 PM: "Generate everything Illustration from code";
 * 3:44 PM: "2 panels & title after that. I like things cleaner."): two tilted comic panels on black (SVG backgrounds, ./PanelArt.tsx),
 * the heroes breaking out over the frames (the REAL game models posed in code, baked at build time to transparent webp by
 * tools/title/bake_heroes.mjs, so nothing 3D loads before Play), the sticker title (SVG), a round Play, his portfolio wordmark
 * top-left and the portfolio sound toggle top-right.
 * Intro: panel 1 slides/tilts in, panel 2, the heroes pop out, the title stamps on, Play fades up; then a very slow push-in.
 * Cheap: SVG + two <img> + CSS transforms/opacity, no canvas, no per-frame JS; reduced motion shows the finished frame.
 */
import React, { useLayoutEffect, useRef, useState } from 'react';
import { ART } from './layout';
import { PanelArt, PanelDefs } from './PanelArt';
import { TitleHeader } from './TitleHeader';

const url = (id: string, half: boolean) => new URL(`./art/${id}${half ? '@h' : ''}.webp`, import.meta.url).href;   // vite bundles every ./art/*.webp

function fit(W: number, H: number) {
    const [x0, y0, x1, y1] = ART.box, top = Math.min(64, H * 0.12);
    const k = Math.min((W * 0.94) / (x1 - x0), ((H - top * 0.35) * 0.97) / (y1 - y0));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return { k, tx: W / 2 - cx * k, ty: H / 2 + top * 0.12 - cy * k };
}

function Sticker() {
    const { cx, cy, size } = ART.title;
    const word = (t: string, x: number, shadow: string) => <g>
        <text x={x + 9} y={cy + 9} fill={shadow} stroke="#05040a" strokeWidth={size * 0.13} paintOrder="stroke" strokeLinejoin="round">{t}</text>
        <text x={x} y={cy} fill="#fbf8f2" stroke="#05040a" strokeWidth={size * 0.13} paintOrder="stroke" strokeLinejoin="round">{t}</text>
    </g>;
    return <g className="sv-sticker" style={{ animationDelay: `${ART.title.delay}s` }}>
        <g transform={`rotate(-4 ${cx} ${cy}) skewX(-9)`} style={{ fontFamily: "'SV Inter','Inter',system-ui,sans-serif", fontWeight: 900, fontSize: size, letterSpacing: '-0.035em' }} textAnchor="end">
            {word('SHADE', cx + 0.12 * size + cy * 0.158 - 8, '#a855f7')}
            <g textAnchor="start">{word('VERSE', cx + 0.12 * size + cy * 0.158 + 22, '#ff1a96')}</g>
        </g>
    </g>;
}

export function ComicTitle({ muted, onMute, onStart, extra, leaving, again }: { muted: boolean; onMute: () => void; onStart: () => void; extra?: React.ReactNode; leaving: boolean; again: boolean }) {
    const root = useRef<HTMLDivElement>(null);
    const [f, setF] = useState(() => fit(innerWidth, innerHeight));
    useLayoutEffect(() => {
        const r = () => { const el = root.current; if (el) setF(fit(el.clientWidth || innerWidth, el.clientHeight || innerHeight)); };
        r(); addEventListener('resize', r); return () => removeEventListener('resize', r);
    }, []);
    const half = f.k * Math.min(devicePixelRatio || 1, 2) <= 0.6;
    const [pcx, pcy, pd] = ART.play, playD = Math.max(pd, 52 / f.k);
    const ghost = ART.heroes.find((h) => h.id === 'ghost')!;
    return <div ref={root} className={'sv-comic' + (leaving ? ' leaving' : '') + (again ? ' again' : '')}>
        <div className="sv-stage" style={{ width: ART.w, height: ART.h, transform: `translate3d(${f.tx}px,${f.ty}px,0) scale(${f.k})` }}>
            <div className="sv-push">
                <svg className="sv-art" width={ART.w} height={ART.h} viewBox={`0 0 ${ART.w} ${ART.h}`} aria-hidden="true">
                    <PanelDefs />
                    {ART.panels.map((p) => <PanelArt key={p.id} p={p} />)}
                </svg>
                <div className="sv-glow" style={{ left: ghost.hand[0], top: ghost.hand[1], animationDelay: `${ghost.delay + 0.1}s, ${ghost.delay + 0.7}s` }} />
                {ART.heroes.map((h) => {
                    const st = { left: h.x, top: h.y, width: h.w, height: h.h, animationDelay: `${h.delay}s`, '--px': `${h.pop[0]}px`, '--py': `${h.pop[1]}px` } as React.CSSProperties;
                    return <img key={h.id} className={'sv-hero sv-hero-' + h.id} src={url(h.id, half)} alt="" draggable={false} decoding="async" style={st} />;
                })}
                <svg className="sv-art sv-top" width={ART.w} height={ART.h} viewBox={`0 0 ${ART.w} ${ART.h}`} aria-hidden="true"><Sticker /></svg>
                <button className="sv-play" aria-label="play" style={{ left: pcx - playD / 2, top: pcy - playD / 2, width: playD, height: playD }} onClick={(e) => { e.stopPropagation(); onStart(); }}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.8l10 6.2-10 6.2z" fill="currentColor" /></svg>
                </button>
            </div>
        </div>
        {extra && <div className="sv-cextra">{extra}</div>}
        <TitleHeader word="Shade Verse" muted={muted} onToggle={onMute} />
        <h1 className="sv-sr">Shade Verse</h1>
    </div>;
}
