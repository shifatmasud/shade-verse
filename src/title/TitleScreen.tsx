/**
 * Shade Verse title + preloader, in the aesthetic of Shifat's portfolio preloader (Nov 2 2026, 2:59 PM: "See my portfolio
 * preloader & follow that aesthetics to redesign our title screen. Use the 3d logo."):
 *  - black panel, his 3D glossy mark (ported 1:1, ./LogoMark3D.ts) turning in the centre;
 *  - Inter 400, white / silver, giant display vs tiny labels; "Shade Verse" bottom-left at display size;
 *  - Play (unchanged flow: tap Play / anywhere / any key) bottom-right;
 *  - on Play the name rolls up out of its mask and the odometer rolls in from below in its place: digits and % only, every
 *    change a MASKED ROLL (reels in overflow masks, carries slide), tracking the REAL preload (files, world build + shader
 *    compile, sound decode), smooth to 100 with no jumps;
 *  - at 100 the whole panel lifts like a curtain into the game; the logo is disposed when it is gone.
 * Reduced motion: everything instant (no rolls, no spin, no curtain).
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createTitleLogo, type TitleLogo } from './logo3d';
import { paintReels, rollPositions, REEL } from './odometer';
import { ControlMap } from './ControlMap';
import { ComicTitle } from './ComicTitle';
import './title.css';

type Phase = 'title' | 'load' | 'lift' | 'gone';
const reducedMQ = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const EASE_INOUT = 'cubic-bezier(0.65, 0, 0.35, 1)';   // portfolio HOUSE.CSS_INOUT (curtain)
const LIFT_MS = 1050;                                 // portfolio curtain duration

export interface TitleProps {
    mode: string;                       // hud.mode: 'title' | 'over' | 'play'
    loading: boolean;                   // Play pressed, preload running
    progress: () => number;             // real preload progress 0..1
    ready: () => boolean;               // everything is in memory and built
    onStart: () => void;
    onReady: () => void;                // counter painted 100: gameplay begins as the curtain lifts
    extra?: React.ReactNode;            // game over: the orbs line
    desk?: boolean;                     // mouse/keyboard or gamepad: the control map shows in game after the curtain
    muted: boolean;                     // master mute (the first screen's portfolio sound toggle)
    onMute: () => void;
}

export function TitleScreen({ mode, loading, progress, ready, onStart, onReady, extra, desk, muted, onMute }: TitleProps) {
    const reduced = !!reducedMQ?.matches;
    const [phase, setPhase] = useState<Phase>(mode === 'play' ? 'gone' : 'title');
    const [shown, setShown] = useState(false);
    const [lifts, setLifts] = useState(0);              // curtains lifted so far: the control map follows each one          // entrance roll-in once the face is ready
    const root = useRef<HTMLDivElement>(null), cv = useRef<HTMLCanvasElement>(null), count = useRef<HTMLDivElement>(null);
    const logo = useRef<TitleLogo | null>(null);
    const cb = useRef({ progress, ready, onReady }); cb.current = { progress, ready, onReady };
    const dropNext = useRef(false), sawPlay = useRef(mode === 'play'), comicSeen = useRef(false);
    useEffect(() => { if (phase !== 'title') comicSeen.current = true; }, [phase]);   // back from a game over: no second intro
    useLayoutEffect(() => {   // after a game over the panel comes back down from the top (the curtain, reversed)
        if (!dropNext.current || phase !== 'title') return; dropNext.current = false;
        if (root.current && !reduced) root.current.animate([{ transform: 'translateY(-100%)' }, { transform: 'translateY(0%)' }], { duration: 800, easing: EASE_INOUT });
    }, [phase]); // eslint-disable-line

    // phase from the game's state: back to the title after a game over (the panel drops back down), into the load on Play
    useEffect(() => {
        // only a real return from play (a game over) brings it back: right after the lift the HUD's mode can still read 'title' for a beat
        if (mode === 'play') sawPlay.current = true;
        else if (phase === 'gone' && sawPlay.current) { sawPlay.current = false; dropNext.current = true; setPhase('title'); }
        if (loading && phase === 'title') setPhase('load');
    }, [mode, loading, phase]); // eslint-disable-line

    // the face is a local 24 KB subset of Inter; the name rolls in only once it has loaded (never a fallback-face flash), capped
    useEffect(() => {
        let live = true; const go = () => { if (live) setShown(true); };
        const f = (document as any).fonts;
        if (f && f.load) Promise.race([f.load('400 64px "SV Inter"'), new Promise((r) => setTimeout(r, 1200))]).then(go, go); else go();
        return () => { live = false; };
    }, []);

    // the 3D mark: made on Play (the first screen is the comic art), alive through the load, disposed once the curtain is gone
    useEffect(() => {
        if (phase === 'gone') { logo.current?.dispose(); logo.current = null; return; }
        if (phase === 'title') return;
        if (!logo.current && cv.current) logo.current = createTitleLogo(cv.current, reduced);
        const r = () => logo.current?.resize();
        addEventListener('resize', r);
        return () => removeEventListener('resize', r);
    }, [phase]); // eslint-disable-line
    useEffect(() => () => { logo.current?.dispose(); logo.current = null; }, []);

    useLayoutEffect(() => { if (count.current) paintReels(count.current.querySelectorAll<HTMLElement>('.sv-strip'), rollPositions(0, 3)); }, [phase === 'title']); // eslint-disable-line

    // the counter (portfolio Intro.tsx): never ahead of reality, never backwards, at most ~1.2 points a frame so every digit
    // shows and every carry slides; a short minimum so it never flashes; once really done, an ease-out tail of >= 400 ms to 100
    useEffect(() => {
        if (phase !== 'load') return;
        const strips = count.current ? count.current.querySelectorAll<HTMLElement>('.sv-strip') : null;
        const paint = (v: number) => { if (strips) paintReels(strips, rollPositions(v * 100, 3)); };
        const repeat = cb.current.ready();
        const minDur = repeat ? 350 : 1200, t0 = performance.now();
        let raf = 0, last = t0, eased = 0, tailT = 0, tailFrom = 0, tailMs = 400;
        const loop = (now: number) => {
            const dt = Math.min((now - last) / 1000, 0.5); last = now;
            const real = cb.current.ready() ? 1 : Math.min(0.99, cb.current.progress());
            const target = Math.min(real, Math.min(1, (now - t0) / minDur));
            if (reduced) eased = target;
            else if (target >= 1) {
                if (!tailT) { tailT = now; tailFrom = eased; tailMs = Math.max(400, ((1 - tailFrom) * 100) / 75 * 1000); }
                const k = Math.min(1, (now - tailT) / tailMs);
                const tv = k >= 1 ? 1 : tailFrom + (1 - tailFrom) * (1 - (1 - k) * (1 - k));
                eased = Math.max(eased, Math.min(tv, eased + 0.0125));
                if (k >= 1 && eased > 0.9995) eased = 1;
            } else {
                const next = eased + (target - eased) * (1 - Math.exp(-7 * dt));
                eased = Math.max(eased, Math.min(next, eased + Math.max(0.012, dt * 0.6)));
            }
            paint(eased); logo.current?.progress(eased);
            if (DBGHOLD() && eased >= 0.6) { eased = 0.6; paint(eased); raf = requestAnimationFrame(loop); return; }
            if (eased >= 1) { lift(); return; }
            raf = requestAnimationFrame(loop);
        };
        const lift = () => {
            cb.current.onReady();
            logo.current?.exit();
            setPhase('lift');
            const el = root.current;
            setLifts((n) => n + 1);
            if (!el || reduced) { setPhase('gone'); return; }
            const a = el.animate([{ transform: 'translateY(0%)' }, { transform: 'translateY(-100%)' }], { duration: LIFT_MS, easing: EASE_INOUT, fill: 'forwards' });
            a.onfinish = () => { setPhase('gone'); a.cancel(); };
            if ((import.meta as any).env.VITE_DBG) (window as any).__svLift = a;   // QA (instrumented builds only): curtain frames
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [phase]); // eslint-disable-line

    if (phase === 'gone') return desk && lifts > 0 && mode === 'play' ? <ControlMap key={lifts} first={lifts === 1} /> : null;
    const cls = 'sv-title' + (shown ? ' in' : '') + (phase !== 'title' ? ' loading' : '') + (phase === 'lift' ? ' lifting' : '') + (reduced ? ' still' : '');
    return <div ref={root} className={cls} onClick={phase === 'title' ? onStart : undefined} role="presentation">
        <canvas ref={cv} className="sv-logo" aria-hidden="true" />
        <div className="sv-bl">
            <div className="sv-mask"><h1 className="sv-name">Shade Verse</h1></div>
            <div className="sv-mask sv-cmask" aria-hidden="true"><div className="sv-count" ref={count}>
                <span className="sv-odo">{[0, 1, 2].map((i) => <span key={i} className="sv-col"><span className="sv-strip">{REEL.map((d, k) => <span key={k}>{d}</span>)}</span></span>)}</span>
            </div></div>
        </div>
        {(phase === 'title' || phase === 'load') && <ComicTitle muted={muted} onMute={onMute} onStart={onStart} extra={phase === 'title' ? extra : undefined} leaving={phase !== 'title'} again={comicSeen.current && phase === 'title'} />}
        <div className="sv-br">
            {extra && <div className="sv-mask"><div className="sv-meta sv-extra">{extra}</div></div>}
            <div className="sv-mask"><div className="sv-meta">by Shifat Masud</div></div>
            <div className="sv-mask sv-gomask"><button className="sv-go" aria-label="play" onClick={(e) => { e.stopPropagation(); onStart(); }}>
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M8.5 5.8l10 6.2-10 6.2z" fill="currentColor" /></svg>
            </button></div>
        </div>
    </div>;
}
/** QA: ?titlehold parks the counter at 60 % (frames of the odometer mid-load) until window.__svGo is set */
const DBGHOLD = () => /[?&]titlehold/.test(location.search) && !(window as any).__svGo;
