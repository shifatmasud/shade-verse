/**
 * Control map shown IN GAME right after the curtain lifts (Shifat Nov 2 3:22 PM: "Control map visual must be present when
 * preloader is gone & game is loaded"). Desktop / gamepad only (touch has its own icon buttons, HUD layout A, untouched).
 * Same aesthetic as the title: Inter 400, white / silver on a soft black glass panel, every line rolls in and out of its own
 * mask. Bottom-left, clear of the hero (centre) and the HUD pill (top-left). Stays ~9 s (5 s on later runs), never eats input.
 * It replaces the old 4 s "Keyboard & mouse detected" toast on Play, so the two never double up.
 */
import React, { useEffect, useState } from 'react';
import { MAP_PAD } from '../desktopInput';

const KB: [string, string][] = [
    ['WASD', 'Move'], ['Mouse / Arrows', 'Camera · click to lock, Esc frees'], ['J / Left click', 'Tap web shot · hold Web Shock'],
    ['I / Space', 'Tap jump · hold fly'], ['K / Ctrl', 'Tap melee · hold Slam'], ['L / Right click', 'Tap web spring · hold swing'],
];
const reducedMQ = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

export function ControlMap({ first }: { first: boolean }) {
    const [st, setSt] = useState<'pre' | 'in' | 'out' | 'gone'>('pre');
    useEffect(() => {
        const r = !!reducedMQ?.matches;
        const a = setTimeout(() => setSt('in'), r ? 0 : 80);
        const b = setTimeout(() => setSt('out'), first ? 9000 : 5000);
        const c = setTimeout(() => setSt('gone'), (first ? 9000 : 5000) + (r ? 0 : 900));
        return () => { clearTimeout(a); clearTimeout(b); clearTimeout(c); };
    }, []); // eslint-disable-line
    if (st === 'gone') return null;
    let i = 0;
    const row = (k: string, v: string) => <li key={k} className="sv-mask"><span className="sv-cl" style={{ '--d': `${(i++) * 35}ms` } as React.CSSProperties}><kbd>{k}</kbd><span>{v}</span></span></li>;
    return <div className={'sv-cmap ' + st + (reducedMQ?.matches ? ' still' : '')} role="note" aria-label="controls">
        <div className="sv-ccol">
            <div className="sv-mask"><b className="sv-cl" style={{ '--d': '0ms' } as React.CSSProperties}>Keyboard + mouse</b></div>
            <ul>{KB.map(([k, v]) => row(k, v))}</ul>
        </div>
        <div className="sv-ccol">
            <div className="sv-mask"><b className="sv-cl" style={{ '--d': '0ms' } as React.CSSProperties}>Gamepad</b></div>
            <ul>{MAP_PAD.map(([k, v]) => row(k, v))}</ul>
        </div>
    </div>;
}
