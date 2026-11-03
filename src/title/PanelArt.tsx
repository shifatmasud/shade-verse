/**
 * The two panel images of the first screen (design px, 1920x1080 stage): AI-rendered 3D key art of each hero in Neon Harbor at night
 * (Shifat Nov 2 6:03 PM: "Or just ai generated image as close to real 3d as possible"), made from real game captures of each hero as
 * references (tools/title/refshots.mjs) and baked to small webp by tools/title/bake_panels.mjs. Each frame clips its image and keeps
 * the thick off-white comic border with an ink edge.
 */
import React from 'react';
import type { Panel, Pt } from './layout';

const pts = (q: Pt[]) => q.map((p) => p.join(',')).join(' ');
const bbox = (q: Pt[]) => { const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
const url = (id: string, half: boolean) => new URL(`./art/panel-${id}${half ? '@h' : ''}.webp`, import.meta.url).href;   // vite bundles every ./art/*.webp

export function PanelArt({ p, half }: { p: Panel; half: boolean }) {
    const [x0, y0, x1, y1] = bbox(p.quad), id = 'svClip-' + p.id;
    const st = { animationDelay: `${p.delay}s`, '--fx': `${p.from[0]}px`, '--fy': `${p.from[1]}px`, '--fr': `${p.from[2]}deg` } as React.CSSProperties;
    return <g className="sv-pg" style={st}>
        <clipPath id={id}><polygon points={pts(p.quad)} /></clipPath>
        <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="#0b0d1c" clipPath={`url(#${id})`} />
        <image href={url(p.id, half)} x={x0} y={y0} width={x1 - x0} height={y1 - y0} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${id})`} />
        <polygon points={pts(p.quad)} fill="none" stroke="#05040a" strokeWidth="16" strokeLinejoin="round" />
        <polygon points={pts(p.quad)} fill="none" stroke="#f4efe4" strokeWidth="9" strokeLinejoin="round" />
    </g>;
}
