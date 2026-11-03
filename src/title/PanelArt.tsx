/**
 * The two panel backgrounds of the first screen, in SVG (design px, 1920x1080 stage): a sunset over the bridge for Shadow, the
 * neon harbor at night for Ghost. Comic finish: flat bands, halftone dot fields, speed lines, thick off-white frames with an ink edge.
 */
import React from 'react';
import type { Panel, Pt } from './layout';

const pts = (q: Pt[]) => q.map((p) => p.join(',')).join(' ');
const bbox = (q: Pt[]) => { const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };

function Sunset({ b }: { b: number[] }) {
    const [x0, y0, x1, y1] = b, w = x1 - x0, h = y1 - y0, hz = y0 + h * 0.74;   // horizon
    const sx = x0 + w * 0.62, sy = hz - 6;
    const tower = (x: number) => <g fill="#14081f"><rect x={x - 9} y={y0 + h * 0.3} width={18} height={hz - (y0 + h * 0.3) + 30} /><rect x={x - 14} y={y0 + h * 0.3 + 30} width={28} height={7} /><rect x={x - 14} y={y0 + h * 0.3 + 85} width={28} height={7} /><rect x={x - 14} y={hz - 40} width={28} height={8} /></g>;
    const tA = x0 + w * 0.22, tB = x0 + w * 0.8, ty = y0 + h * 0.3 + 4, deck = hz + 6;
    return <g>
        <rect x={x0} y={y0} width={w} height={h} fill="url(#svSunsetSky)" />
        <rect x={x0} y={y0} width={w} height={h * 0.6} fill="url(#svDotsDark)" opacity="0.35" />
        <circle cx={sx} cy={sy} r={h * 0.2} fill="url(#svSun)" />
        <circle cx={sx} cy={sy} r={h * 0.2} fill="url(#svDotsLight)" opacity="0.5" />
        {[0, 1, 2, 3].map((i) => <rect key={i} x={x0} y={sy - 8 - i * 26} width={w} height={4 + i} fill="#ff9a55" opacity={0.18 - i * 0.03} />)}
        {/* far city */}
        <path fill="#3b1240" d={`M${x0} ${hz} ` + Array.from({ length: 18 }, (_, i) => { const xx = x0 + (i / 17) * w, hh = 18 + ((i * 37) % 46); return `L${xx} ${hz - hh} L${xx + w / 22} ${hz - hh}`; }).join(' ') + ` L${x1} ${hz} Z`} />
        {/* the bridge: two towers, the main cable, hangers, the deck */}
        {tower(tA)}{tower(tB)}
        <path d={`M${x0 - 10} ${deck - 60} Q${(x0 + tA) / 2} ${deck - 20} ${tA} ${ty} Q${(tA + tB) / 2} ${deck - 18} ${tB} ${ty} Q${(tB + x1) / 2} ${deck - 20} ${x1 + 10} ${deck - 60}`} fill="none" stroke="#14081f" strokeWidth="5" />
        {Array.from({ length: 22 }, (_, i) => { const f = (i + 1) / 23, x = tA + (tB - tA) * f, yc = ty + (deck - 18 - ty) * 2 * f * (1 - f) * 2 * 0.98; return <line key={i} x1={x} y1={Math.min(yc, deck)} x2={x} y2={deck} stroke="#14081f" strokeWidth="1.6" />; })}
        <rect x={x0} y={deck} width={w} height={11} fill="#14081f" />
        {/* water */}
        <rect x={x0} y={deck + 11} width={w} height={y1 - deck} fill="url(#svSunsetSea)" />
        {Array.from({ length: 7 }, (_, i) => <rect key={i} x={sx - 70 + ((i * 29) % 50) - i * 6} y={deck + 22 + i * 9} width={140 - i * 14} height={3} fill="#ffc78a" opacity={0.8 - i * 0.09} />)}
        {/* motion streaks across the sky, along the swing */}
        <g stroke="#fff3df" strokeLinecap="round" opacity="0.42">{Array.from({ length: 9 }, (_, i) => { const yy = y0 + h * (0.1 + i * 0.055), xx = x0 + w * (0.05 + ((i * 37) % 30) / 100), len = w * (0.18 + ((i * 13) % 20) / 100); return <line key={i} x1={xx} y1={yy + len * 0.18} x2={xx + len} y2={yy} strokeWidth={i % 3 ? 2 : 3.5} />; })}</g>
    </g>;
}

function Harbor({ b }: { b: number[] }) {
    const [x0, y0, x1, y1] = b, w = x1 - x0, h = y1 - y0, hz = y0 + h * 0.72;
    const blds = [[0.0, 0.34, 0.12], [0.1, 0.5, 0.1], [0.19, 0.28, 0.13], [0.31, 0.58, 0.09], [0.4, 0.4, 0.12], [0.53, 0.64, 0.08], [0.6, 0.36, 0.13], [0.72, 0.5, 0.1], [0.82, 0.3, 0.12], [0.92, 0.46, 0.1]];
    const neon = ['#ff2fa0', '#36e2ff', '#ff2fa0', '#b06bff', '#36e2ff'];
    return <g>
        <rect x={x0} y={y0} width={w} height={h} fill="url(#svNightSky)" />
        <circle cx={x0 + w * 0.2} cy={y0 + h * 0.2} r={h * 0.075} fill="#eef3ff" />
        <circle cx={x0 + w * 0.2} cy={y0 + h * 0.2} r={h * 0.075} fill="url(#svDotsDark)" opacity="0.25" />
        <rect x={x0} y={y0} width={w} height={hz - y0} fill="url(#svDotsLight)" opacity="0.07" />
        {/* crane */}
        <g stroke="#0b0f22" strokeWidth="6" fill="none"><path d={`M${x0 + w * 0.86} ${hz} L${x0 + w * 0.86} ${y0 + h * 0.3} L${x0 + w * 0.6} ${y0 + h * 0.33}`} /><path d={`M${x0 + w * 0.86} ${y0 + h * 0.3} L${x1 + 10} ${y0 + h * 0.36}`} /></g>
        {blds.map(([fx, fh, fw], i) => { const bx = x0 + fx * w, bw = fw * w, bh = fh * h * 0.9, by = hz - bh, c = neon[i % neon.length];
            return <g key={i}><rect x={bx} y={by} width={bw} height={bh} fill="#0d1230" stroke={c} strokeWidth="1.6" strokeOpacity="0.55" />
                {Array.from({ length: Math.floor(bh / 22) }, (_, r) => Array.from({ length: Math.max(1, Math.floor(bw / 16)) }, (_, k) => ((r * 7 + k * 3 + i) % 4 === 0) ? <rect key={r + '-' + k} x={bx + 5 + k * 16} y={by + 8 + r * 22} width={6} height={9} fill={c} opacity="0.85" /> : null))}
            </g>; })}
        <rect x={x0 + w * 0.36} y={hz - h * 0.52} width={w * 0.2} height={16} rx={3} fill="none" stroke="#ff2fa0" strokeWidth="3" />
        <rect x={x0} y={hz} width={w} height={y1 - hz} fill="url(#svHarborSea)" />
        {Array.from({ length: 16 }, (_, i) => <rect key={i} x={x0 + ((i * 53) % w)} y={hz + 8 + (i % 6) * 12} width={30 + (i % 3) * 18} height={2.5} fill={neon[i % neon.length]} opacity={0.55 - (i % 6) * 0.07} />)}
        <rect x={x0} y={hz} width={w} height={y1 - hz} fill="url(#svDotsLight)" opacity="0.1" />
    </g>;
}

export function PanelDefs() {
    return <defs>
        <linearGradient id="svSunsetSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#24104a" /><stop offset="0.38" stopColor="#7a2475" /><stop offset="0.62" stopColor="#e2513f" /><stop offset="0.78" stopColor="#ff9a4d" /><stop offset="1" stopColor="#ffd07a" /></linearGradient>
        <radialGradient id="svSun"><stop offset="0" stopColor="#fff2c4" /><stop offset="0.6" stopColor="#ffd27a" /><stop offset="1" stopColor="#ff9a4d" /></radialGradient>
        <linearGradient id="svSunsetSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7a2a5e" /><stop offset="1" stopColor="#1c0b2c" /></linearGradient>
        <linearGradient id="svNightSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#04061a" /><stop offset="0.6" stopColor="#0f1d4a" /><stop offset="1" stopColor="#2e1656" /></linearGradient>
        <linearGradient id="svHarborSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1a1446" /><stop offset="1" stopColor="#03040f" /></linearGradient>
        <pattern id="svDotsDark" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="4.5" cy="4.5" r="2" fill="#10031c" /></pattern>
        <pattern id="svDotsLight" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="4.5" cy="4.5" r="1.8" fill="#fff6e0" /></pattern>
    </defs>;
}

export function PanelArt({ p }: { p: Panel }) {
    const b = bbox(p.quad), id = 'svClip-' + p.id;
    const st = { animationDelay: `${p.delay}s`, '--fx': `${p.from[0]}px`, '--fy': `${p.from[1]}px`, '--fr': `${p.from[2]}deg` } as React.CSSProperties;
    return <g className="sv-pg" style={st}>
        <clipPath id={id}><polygon points={pts(p.quad)} /></clipPath>
        <g clipPath={`url(#${id})`}>{p.id === 'sunset' ? <Sunset b={b} /> : <Harbor b={b} />}</g>
        <polygon points={pts(p.quad)} fill="none" stroke="#05040a" strokeWidth="16" strokeLinejoin="round" />
        <polygon points={pts(p.quad)} fill="none" stroke="#f4efe4" strokeWidth="9" strokeLinejoin="round" />
    </g>;
}
