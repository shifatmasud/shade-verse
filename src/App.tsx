import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { AnimatePresence, motion } from 'framer-motion';
import gsap from 'gsap';
import { Scene } from './Scene';
import { GhostCompanion } from './Ghost';
import { createSim, buildings, resetSim, input, actionCtx, type Events } from './sim';
import { installDesktopInput, MAP_KB, MAP_PAD } from './desktopInput';
import { QUALITY, QK, AA_MSAA } from './quality';
import { audio } from './audio/engine';
import { SoundDirector } from './audio/director';

const DBG = !!(import.meta as any).env.VITE_DBG;   // test hooks exist only in instrumented builds (VITE_DBG=1), never in the release build
let GL2 = false;   // functional WebGL2 capability flag lives in module state, not on window
const isGl2 = () => GL2;
// every button press: big icon kick, expanding ring, and a stage flash tinted per action (transform/opacity only, no extra render passes)
const impact = (tint: string, size: number, shk: number, showRing = true) => {
    const o = showRing ? document.querySelector('.impact') as HTMLElement | null : null, f = document.querySelector('.flash') as HTMLElement | null, c = document.querySelector('.stage canvas') as HTMLElement | null;
    if (o) { o.style.color = tint; gsap.fromTo(o, { scale: 0.2, opacity: 1 }, { scale: size, opacity: 0, duration: 0.45, ease: 'power3.out' }); }
    if (f) { f.style.setProperty('--fx', tint); gsap.fromTo(f, { opacity: shk ? 0.9 : 0.5 }, { opacity: 0, duration: 0.35 }); }
    if (c && shk) gsap.fromTo(c, { x: shk, y: -shk * 0.6 }, { x: 0, y: 0, duration: 0.3, ease: 'elastic.out(1.2,0.3)' });
};
const burst = (e: React.PointerEvent, tint: string, spin = 0, showRing = true) => {
    const el = e.currentTarget as HTMLElement;
    if (showRing) { const r = document.createElement('i'); r.className = 'ripple'; r.style.color = tint; el.appendChild(r); gsap.fromTo(r, { scale: 0.5, opacity: 0.95 }, { scale: 2.6, opacity: 0, duration: 0.5, ease: 'power2.out', onComplete: () => r.remove() }); }
    gsap.fromTo(el.querySelector('svg:not(.ring)'), { scale: 1.7, rotate: spin }, { scale: 1, rotate: 0, duration: 0.42, ease: 'back.out(3)' });
    const f = document.querySelector('.flash') as HTMLElement | null; if (f) { f.style.setProperty('--fx', tint); gsap.fromTo(f, { opacity: 0.55 }, { opacity: 0, duration: 0.3, ease: 'power2.out' }); }
};
const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;


const IC = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const Svg = ({ children, s = 26 }: { children: React.ReactNode; s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" {...IC} aria-hidden>{children}</svg>;
// custom icon set (own drawings): web, jump chevrons, fist, dash, orb, shield, beacon, speaker, play
const IWeb = () => <Svg s={34}><circle cx="12" cy="12" r="1.2" fill="currentColor" /><path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19" opacity=".7" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="8.5" opacity=".6" /></Svg>;
const IJump = () => <Svg s={44}><path d="M6 17l6-6 6 6M6 11l6-6 6 6" /></Svg>;
const IFist = () => <Svg s={46}><rect x="6" y="8" width="12" height="11" rx="3.5" /><path d="M10 8v4M14 8v4M6 12.5h12" opacity=".7" /><path d="M18 10.5l3.5-1M18 15l3 1" opacity=".6" /><path d="M6 9.5L3.5 11M5 14.5l-2 1.5" opacity=".6" /></Svg>;
const IDash = () => <Svg s={28}><path d="M4 8h6M2 12h9M4 16h6" opacity=".7" /><path d="M13 6l6 6-6 6M19 12H11" /></Svg>;
const ISwing = () => <Svg s={48}><circle cx="20.5" cy="3.5" r="1.4" fill="currentColor" /><path d="M20.5 4.5C20 13 15 18 7 19" /><circle cx="6" cy="19.2" r="2.2" fill="currentColor" /><path d="M3 15.5l2 1.5M9 22l-1-2.5" opacity=".6" /></Svg>;
const IGrab = () => <Svg s={48}><path d="M3 21l11-11" /><path d="M10.5 9.5H15V14" /><path d="M14 5h7v3h-1v4h-5V8h-1z" opacity=".85" /><path d="M16.5 12v-2" opacity=".6" /></Svg>;
const IShot = () => <Svg s={48}><path d="M2 20l9-6" strokeDasharray="1 3" /><path d="M13 10.5l1.5-4 4 1.5 3 3-2 3.5-4 .5z" opacity=".9" /><path d="M14.5 6.5l1.5 6M18.5 8l-2 5M13 10.5l8 .5" opacity=".55" /></Svg>;
const IShock = () => <Svg s={48}><path d="M13.8 1.7 5.6 13.1h5.7l-1 9.2 8.1-12.3h-5.5l.9-8.3Z" fill="currentColor" stroke="none" /></Svg>;
const IOrb = () => <Svg s={20}><circle cx="12" cy="12" r="6" /><path d="M9.5 10a3 3 0 012-1.6" /></Svg>;
const IHeart = () => <Svg s={20}><path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" /></Svg>;
const IBeacon = () => <Svg s={20}><path d="M12 3l6 8-6 3-6-3 6-8zM12 14v7" /></Svg>;
const ISpeaker = ({ off }: { off: boolean }) => <Svg s={22}><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" />{off ? <path d="M16 9.5l5 5M21 9.5l-5 5" /> : <path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11" />}</Svg>;
const IPlay = () => <Svg s={30}><path d="M8 5.5l11 6.5-11 6.5z" fill="currentColor" /></Svg>;
const IStick = () => <Svg s={26}><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></Svg>;
const Pips = ({ n, max = 10 }: { n: number; max?: number }) => <span className="pips">{Array.from({ length: max }, (_, i) => <i key={i} className={i < n ? 'on' : ''} />)}</span>;

export function App() {
    const sim = useMemo(() => createSim(), []);
    const fx = useRef({ fov: 0, shake: 0 }).current;
    const DEBUG = typeof location !== 'undefined' && /[?&]debug\b/.test(location.search);
    const perf = useRef({ scale: coarse ? 0.8 : 1, fps: 60, speed: 0 }).current;
    const snd = useMemo(() => new SoundDirector(sim), [sim]);   // cinematic sound pass: beds, SFX and adaptive score (src/audio)
    const [hud, setHud] = useState({ score: 0, time: 0, mode: sim.mode, best: sim.best, bn: 0, bd: 0, hp: 100, ko: 0, sc: 0, gr: false, me: false, sh: false, sn: false, wb: false, rd: 0 });
    const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
    const toastId = useRef(0);
    const [muted, setMuted] = useState(audio.muted);
    const [dbg, setDbg] = useState('');
    const mutedRef = useRef(audio.muted);
    const wprev = useRef({ swim: false, dive: false });
    const buzz = (ms: number) => { try { if (!mutedRef.current) (navigator as any).vibrate?.(ms); } catch (e) { /* ignore */ } };
    const lastScore = useRef(0);
    const showToast = (_t: string, _ms = 1600) => { /* zero text in game UI */ };
    const ev: Events = useMemo(() => ({
        orb: () => { buzz(25); showToast('+' + (sim.score - lastScore.current), 700); lastScore.current = sim.score; snd.onOrb(); gsap.fromTo(fx, { fov: 10 }, { fov: 0, duration: 0.5, ease: 'power2.out' }); },
        fall: () => { buzz(120); gsap.fromTo(fx, { fov: -8 }, { fov: 0, duration: 0.6, ease: 'elastic.out(1,0.4)' }); showToast('Knocked out. Back to your last rooftop.', 2000); snd.onFall(); },
        attach: () => { impact('#8fe9ff', 1.8, 0, false); buzz(12); gsap.fromTo(fx, { fov: 6 }, { fov: 0, duration: 0.35, ease: 'power2.out' }); },
        release: () => { /* release whoosh comes from the sound director */ },
        hit: () => { impact('#ffffff', 2.6, 8); buzz(30); snd.onHit(); gsap.fromTo(fx, { shake: 0.5 }, { shake: 0, duration: 0.2 }); },
        blast: (x: number, y: number, z: number) => { impact('#aee6ff', 4.2, 14); buzz(60); snd.onBlast(x, y, z); gsap.fromTo(fx, { fov: 9 }, { fov: 0, duration: 0.45, ease: 'power3.out' }); gsap.fromTo(fx, { shake: 0.9 }, { shake: 0, duration: 0.3 }); },
        hurt: () => { impact('#ff3a3a', 3.4, 14); buzz(70); snd.onHurt(); showToast('Ouch', 600); },
        shot: (k, x, y, z) => { const p: [number, number, number] = [x, y, z]; if (k === 'charge') snd.repulsorCharge(p); else if (k === 'bolt') snd.repulsorBolt(p); else if (k === 'impact') snd.repulsorImpact(p); else if (k === 'uniCharge') snd.unibeamCharge(p); else if (k === 'uniStart') snd.unibeamStart(p); else if (k === 'uniMove') snd.unibeamMove(p); else snd.unibeamStop(); },   // env-iter3 F: enemy repulsors + boss unibeam
        ko: () => { impact('#ffd24a', 5, 20); buzz(50); showToast('KO +2', 700); },
        land: (hard: boolean) => { buzz(hard ? 80 : 15); snd.onLand(hard); if (hard) showToast('Hard landing', 700); },
        jump: () => { snd.onJump(); },
    }), []); // eslint-disable-line

    useEffect(() => {   // sound: unlock on the first gesture anywhere (title music starts then), and drive the director every frame
        const unlock = () => audio.unlock();
        window.addEventListener('pointerdown', unlock, true); window.addEventListener('keydown', unlock, true); window.addEventListener('touchend', unlock, true);
        let raf = 0, last = performance.now();
        const loop = (t: number) => { raf = requestAnimationFrame(loop); const dt = (t - last) / 1000; last = t; snd.tick(dt); };
        raf = requestAnimationFrame(loop);
        try { if ((navigator as any).getAutoplayPolicy?.('audiocontext') === 'allowed') audio.unlock(); } catch (e) { /* only some browsers expose the policy; others wait for the first gesture */ }
        if (DBG) (window as any).__audio = { engine: audio, director: snd, ctx: () => audio.ctx, muted: () => mutedRef.current };
        return () => { cancelAnimationFrame(raf); window.removeEventListener('pointerdown', unlock, true); window.removeEventListener('keydown', unlock, true); window.removeEventListener('touchend', unlock, true); };
    }, [snd]);
    useEffect(() => {
        const id = setInterval(() => {
            { const jb = document.querySelector('.ico.jump'); if (jb) jb.classList.toggle('inv', sim.mode === 'play' && sim.swim && !sim.dive); }
            { const pv = wprev.current; if (!mutedRef.current && sim.mode === 'play' && ((sim.swim && !pv.swim) || (sim.dive !== pv.dive) || (!sim.swim && pv.swim))) buzz(25); pv.swim = sim.swim; pv.dive = sim.dive; }   // splash sound: src/audio/director.ts
            { const ds = (window as any).__dbgStats; setDbg(Math.round(perf.fps) + ' fps · res ' + perf.scale.toFixed(2) + (isGl2() ? ' · WebGL2' : ' · WebGL1') + (ds ? ' · ' + ds.calls + ' calls · ' + Math.round(ds.tris / 1000) + 'k tris · cpu ' + ds.cpu.toFixed(1) + ' ms' : '')); }
            document.documentElement.style.setProperty('--spd', String(Math.min(1, Math.max(0, (perf.speed - 18) / 40))));
            setHud((h) => {
                const ctx = actionCtx(sim); const n = { score: sim.score, time: Math.ceil(sim.time), mode: sim.mode, best: sim.best, bn: sim.beaconN, hp: Math.round(sim.hp), ko: sim.kos, gr: ctx.grab, me: ctx.melee, sh: ctx.shot, sn: ctx.snare, wb: sim.web, rd: 0, sc: Math.round(Math.min(1, ((sim as any).snareCd || 0) / 9) * 20) / 20, bd: Math.round(Math.hypot(sim.beacon[0] - sim.pos[0], sim.beacon[1] - sim.pos[1], sim.beacon[2] - sim.pos[2]) / 5) * 5 };
                if (sim.score > sim.best) { sim.best = sim.score; n.best = sim.best; try { localStorage.setItem('webswinger3d-best', String(sim.best)); } catch (e) { /* ignore */ } }
                return h.score === n.score && h.time === n.time && h.mode === n.mode && h.best === n.best && h.bn === n.bn && h.hp === n.hp && h.ko === n.ko && h.gr === n.gr && h.me === n.me && h.sh === n.sh && h.sn === n.sn && h.wb === n.wb && h.rd === n.rd && h.sc === n.sc && h.bd === n.bd ? h : n;
            });
        }, 100);
        // Shift / Alt (now web buttons) can rewrite e.key (Shift+"." = ">", Mac Option+W = "∑"); map such characters back to the physical key so WASD / "." keep working while they are held
        const normKey = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); if ((e.altKey || e.shiftKey) && ((k.length === 1 && !/[a-z0-9 .]/.test(k)) || k === 'dead')) { if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3).toLowerCase(); if (e.code === 'Period') return '.'; if (/^Digit[0-9]$/.test(e.code)) return e.code.slice(5); } return k; };
        const down = (e: KeyboardEvent) => {
            const k = normKey(e);
            if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
            if (k === 'control') e.preventDefault();
            if (sim.mode !== 'play') { if (!e.repeat && !['escape', 'tab', 'meta', 'alt', 'control', 'shift', 'capslock'].includes(k)) start(); input.keys[k] = true; return; }   // title screen: any key starts
            if (!coarse) { deskRef.current = true; setDesk(true); }
            if (k === ' ' && !input.keys[' '] && !input.keys['@i']) { input.jumpQ = true; input.jumpHeld = true; }   // identical flags/timing to the mobile jump button
            if ((k === 'k' || k === 'm' || k === '.' || k === 'control') && !input.keys[k]) { input.meleeQ = true; input.attackQ = true; }
            input.keys[k] = true;
        };
        const up = (e: KeyboardEvent) => { const k = normKey(e); input.keys[k] = false; if (k === ' ' && !input.keys['@i']) { input.jumpHeld = false; input.jumpReleased = true; } };
        const vis = () => { audio.setHidden(document.hidden); if (document.hidden) { input.jumpHeld = false; input.jumpCancelled = true; input.keys[' '] = false; input.swing = false; input.mx = 0; input.my = 0; } };
        document.addEventListener('visibilitychange', vis);
        const blur = () => { try { for (const k of Object.keys((input as any).keys || {})) (input as any).keys[k] = false; } catch (e) { /* ignore */ } input.swing = false; input.mx = 0; input.my = 0; try { for (const k of Object.keys(input as any)) if (typeof (input as any)[k] === 'boolean') (input as any)[k] = false; } catch (e) { /* ignore */ } };
        const flightBlur = () => { blur(); input.jumpCancelled = true; };
        window.addEventListener('blur', flightBlur);
        window.addEventListener('keydown', down); window.addEventListener('keyup', up);
        const offTouch = () => { deskRef.current = false; setDesk(false); };   // a touch on a touchscreen laptop brings the buttons back
        window.addEventListener('touchstart', offTouch, { passive: true });
        const undesk = installDesktopInput(sim, () => deskRef.current, {
            onGamepad: (on) => { if (on) { deskRef.current = true; setDesk(true); setCtrlToast({ id: Date.now(), kind: 'pad' }); } },
            onCharge: (on) => setCharge(on), onLock: (on) => setLocked(on), start: () => start(),
        });
        if (DBG) (window as any).__game = { sim, input, perf, fx, buildings, events: ev, start: () => start(), quality: QUALITY };
        return () => { undesk(); window.removeEventListener('touchstart', offTouch); document.removeEventListener('visibilitychange', vis); window.removeEventListener('blur', flightBlur); clearInterval(id); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
    }, []); // eslint-disable-line

    function start() {
        // Fullscreen needs the Play gesture; rejection or unsupported browsers must not block play.
        if (coarse && !document.fullscreenElement && document.documentElement.requestFullscreen) {
            try { const f = document.documentElement.requestFullscreen({ navigationUI: 'hide' }); f?.catch(() => {}); } catch (e) { /* browser keeps its bar */ }
        }
        audio.unlock(); if (DBG) (window as any).__audio = { engine: audio, director: snd, ctx: () => audio.ctx, muted: () => mutedRef.current };
        gsap.fromTo(fx, { fov: 22 }, { fov: 0, duration: 1.4, ease: 'power3.out' });
        resetSim(sim); lastScore.current = 0; sim.mode = 'play';
        if (deskRef.current) { try { const c = document.querySelector('.stage canvas') as any; const p = c?.requestPointerLock?.(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* drag-look fallback */ } if (!kbToastShown.current) { kbToastShown.current = true; setCtrlToast({ id: Date.now(), kind: 'kb' }); } }
    }

    // controls
    // hidden D-pad: appears where the left thumb touches, only while moving; any push past the dead zone runs at full speed (auto run)
    const padRef = useRef<HTMLDivElement>(null), knobRef = useRef<HTMLDivElement>(null), stickId = useRef(-1), padC = useRef({ x: 0, y: 0 });
    const padMove = (e: React.PointerEvent) => {
        let dx = (e.clientX - padC.current.x) / 56, dy = (e.clientY - padC.current.y) / 56;
        const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
        const m = l < 0.22 ? 0 : 1, nl = l || 1; // auto run: full speed once past the dead zone
        input.mx = m ? dx / nl : 0; input.my = m ? -dy / nl : 0; knobRef.current!.style.transform = `translate(${dx * 38}px,${dy * 38}px)`;
    };
    const padStart = (e: React.PointerEvent) => { if (stickId.current !== -1 && stickId.current !== null && stickId.current !== undefined) return; stickId.current = e.pointerId; (e.target as HTMLElement).setPointerCapture(e.pointerId); padC.current = { x: e.clientX, y: e.clientY }; const p = padRef.current!; p.style.left = e.clientX - 60 + 'px'; p.style.top = e.clientY - 60 + 'px'; p.style.opacity = '1'; padMove(e); };
    const stickEnd = (e: React.PointerEvent) => { if (e.pointerId === stickId.current) { stickId.current = -1; input.mx = 0; input.my = 0; knobRef.current!.style.transform = 'translate(0,0)'; padRef.current!.style.opacity = '0'; } };
    const drag = useRef({ id: -1, x: 0, y: 0 });
    // desktop: no gameplay icon buttons (Shifat, Oct 28 11:24 PM); mouse/keyboard/gamepad instead
    const [desk, setDesk] = useState(!coarse); const deskRef = useRef(!coarse);
    const [ctrlToast, setCtrlToast] = useState<{ id: number; kind: 'kb' | 'pad' } | null>(null);
    const kbToastShown = useRef(false);
    const [charge, setCharge] = useState(false), [locked, setLocked] = useState(false);
    useEffect(() => { if (!ctrlToast) return; const id = setTimeout(() => setCtrlToast(null), 4200); return () => clearTimeout(id); }, [ctrlToast]);
    const [swingOn, setSwingOn] = useState(false);

    return <div className={(hud.mode === 'play' ? 'stage' : 'stage menu') + (desk ? ' desk' : '')} onContextMenu={(e) => e.preventDefault()}>
        <div id="uw" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3, opacity: 0, transition: 'opacity .15s', background: 'linear-gradient(180deg, rgba(110,215,235,.24), rgba(30,140,175,.30) 45%, rgba(8,70,105,.5))' }} />
        <Canvas
            dpr={[1, QK.dprCap]}
            gl={{ antialias: AA_MSAA, powerPreference: 'high-performance', alpha: false, stencil: false }}
            camera={{ fov: 62, near: 0.5, far: 1600, position: [0, 40, -10] }}
            onCreated={({ gl }) => { gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, QK.dprCap) * perf.scale); GL2 = gl.capabilities.isWebGL2; }}
            onPointerDown={(e) => { if (drag.current.id !== -1 || document.pointerLockElement) return; drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY }; sim.camHeld = true; sim.lastDrag = sim.t; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
            onPointerMove={(e) => {
                if (e.pointerId !== drag.current.id) return;
                sim.yaw -= (e.clientX - drag.current.x) * 0.006; sim.pitch = Math.max(-1.15, Math.min(1.35, sim.pitch + (e.clientY - drag.current.y) * 0.004));
                drag.current.x = e.clientX; drag.current.y = e.clientY; sim.lastDrag = sim.t;
            }}
            onPointerUp={(e) => { if (e.pointerId !== drag.current.id) return; drag.current.id = -1; sim.camHeld = false; sim.lastDrag = sim.t; }}
            onPointerCancel={(e) => { if (e.pointerId !== drag.current.id) return; drag.current.id = -1; sim.camHeld = false; sim.lastDrag = sim.t; }}
            onLostPointerCapture={(e) => { if (e.pointerId !== drag.current.id) return; drag.current.id = -1; sim.camHeld = false; sim.lastDrag = sim.t; }}
        ><Scene sim={sim} ev={ev} coarse={coarse} fx={fx} perf={perf} />
            <GhostCompanion sim={sim} />
        </Canvas>

        <div className="hud">
            <div className="chip orbs" aria-label="orbs (tap to mute or unmute)" onPointerDown={() => { mutedRef.current = !mutedRef.current; setMuted(mutedRef.current); audio.setMuted(mutedRef.current); }}><IOrb /><Pips n={hud.score > 0 ? ((hud.score - 1) % 10) + 1 : 0} /><span className="tiers">{Array.from({ length: Math.min(6, Math.floor(Math.max(0, hud.score - 1) / 10)) }, (_, i) => <i key={i} />)}</span>{muted && <span className="mutedmark"><ISpeaker off /></span>}</div>
            <div className={'chip hpchip' + (hud.hp < 100 ? ' show' : '') + (hud.hp < 35 ? ' low' : '')} aria-label="health"><IHeart /><span className="hpbar"><i style={{ width: Math.max(0, Math.min(100, hud.hp)) + '%' }} /></span></div>
        </div>
        {DEBUG && <div className="dbg">{dbg}</div>}
        {/* navigator arrow removed (user 10:01) */}
        <div className="vig" />
        <div className="flash" /><i className="impact" />
        <div className="speedlines" />
        {hud.mode !== 'play' && <button className="mute" aria-label={muted ? 'Unmute' : 'Mute'} onClick={() => { audio.unlock(); mutedRef.current = !mutedRef.current; setMuted(mutedRef.current); audio.setMuted(mutedRef.current); }}><ISpeaker off={muted} /></button>}
        <AnimatePresence>{hud.mode !== 'play' && <><motion.div className="bar top" initial={{ y: -60 }} animate={{ y: 0 }} exit={{ y: -60 }} /><motion.div className="bar bot" initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }} /></>}</AnimatePresence>

        {hud.mode === 'play' && <>
            <div className="padzone" onPointerDown={padStart} onPointerMove={(e) => { if (e.pointerId === stickId.current) padMove(e); }} onPointerUp={stickEnd} onPointerCancel={stickEnd} />
            <div className="dpad" ref={padRef}><svg width="120" height="120" viewBox="0 0 120 120" {...IC} strokeWidth={2}><path d="M60 8l9 11H51zM60 112l-9-11h18zM8 60l11-9v18zM112 60l-11 9V51z" fill="currentColor" stroke="none" opacity=".85" /><circle cx="60" cy="60" r="38" opacity=".35" /></svg><div className="knob" ref={knobRef} /></div>
            <button className={'ico swing' + (swingOn ? ' on' : '') + (hud.wb ? ' linked' : '')} aria-label="web swing"
                onPointerDown={(e) => { burst(e, '#8fe9ff', -25, false); (e.target as HTMLElement).setPointerCapture(e.pointerId); input.swing = true; input.swingQ = true; setSwingOn(true); }}
                onPointerUp={() => { input.swing = false; setSwingOn(false); }} onPointerCancel={() => { input.swing = false; setSwingOn(false); }}><ISwing /></button>
            <button className={'ico grab' + (hud.gr ? '' : ' off')} aria-label="web grab" onPointerDown={(e) => { burst(e, '#ffffff', 20); input.grabQ = true; }}><IGrab /></button>
            <button className={'ico shot' + (hud.sh ? '' : ' off')} aria-label="web shot" onPointerDown={(e) => { burst(e, '#8fe9ff', 30); input.shotQ = true; input.attackQ = true; }}><IShot /></button>
            <button className={'ico special' + (hud.sc > 0 ? ' cd' : '') + (hud.sn ? '' : ' off')} aria-label="Web Shock" onPointerDown={(e) => { burst(e, '#c9a7ff', 180); input.specialQ = true; }}><IShock /><svg className="ring" viewBox="0 0 44 44"><circle cx="22" cy="22" r="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeDasharray={125.7} strokeDashoffset={125.7 * hud.sc} transform="rotate(-90 22 22)" /></svg></button>
            <button className={'ico melee' + (hud.me ? '' : ' off')} aria-label="melee" onPointerDown={(e) => { burst(e, '#ff9a6a', -35); input.meleeQ = true; input.attackQ = true; }}><IFist /></button>
            <button className="ico jump" aria-label="jump" onPointerDown={(e) => { burst(e, '#ffe27a', 0); (e.target as HTMLElement).setPointerCapture(e.pointerId); input.jumpHeld = true; input.jumpQ = true; }} onPointerUp={() => { input.jumpHeld = false; input.jumpReleased = true; }} onPointerCancel={() => { input.jumpHeld = false; input.jumpCancelled = true; }} onLostPointerCapture={() => { if (input.jumpHeld) { input.jumpHeld = false; input.jumpCancelled = true; } }}><IJump /></button>
        </>}

        {hud.mode === 'play' && desk && locked && <div className={'xhair' + (charge ? ' charge' : '')} aria-hidden><i /></div>}
        <AnimatePresence>
            {hud.mode === 'play' && ctrlToast && <motion.div key={ctrlToast.id} className="ctoast" role="status" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }}>
                <b>{ctrlToast.kind === 'pad' ? 'Gamepad connected' : 'Keyboard & mouse detected'}</b>
                <ul>{(ctrlToast.kind === 'pad' ? MAP_PAD : MAP_KB).map(([k, v]) => <li key={k}><kbd>{k}</kbd><span>{v}</span></li>)}</ul>
            </motion.div>}
        </AnimatePresence>
        <AnimatePresence>
            {hud.mode !== 'play' && <motion.div className="overlay title" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.04 }} onClick={start}>
                <motion.div className="tmark" initial={{ scale: 0.6, opacity: 0, rotate: -8 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ delay: 0.05, duration: 0.9, ease: [0.2, 1.4, 0.4, 1] }}>
                    {/* Shifat's mark, taken as-is from shifatmasud/surface-tension-case-study (site/index.html .wordmark__mark) */}
                    <svg viewBox="0 0 200 200" fill="currentColor" aria-hidden="true"><path d="M100 0H200L100 100H0Z M100 100H200L100 200H0Z" /></svg>
                </motion.div>
                <motion.h1 className="otitle tname" initial={{ y: 16, opacity: 0, letterSpacing: '0.6em' }} animate={{ y: 0, opacity: 1, letterSpacing: '0.18em' }} transition={{ delay: 0.25, duration: 1.1, ease: 'easeOut' }}>Shade Verse</motion.h1>
                {hud.mode === 'over' && <div className="otext"><IOrb /><Pips n={Math.min(10, hud.score)} /></div>}
                <motion.button className="go" aria-label="play" whileTap={{ scale: 0.95 }} onClick={(e) => { e.stopPropagation(); start(); }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}><IPlay /></motion.button>
                <div className="tprompt">{desk ? 'Click or press any key to start' : 'Tap to start'}</div>
                {desk && <div className="tmaps">
                    <div><b>Mouse + keyboard</b><ul>{MAP_KB.map(([k, v]) => <li key={k}><kbd>{k}</kbd><span>{v}</span></li>)}</ul></div>
                    <div><b>Gamepad</b><ul>{MAP_PAD.map(([k, v]) => <li key={k}><kbd>{k}</kbd><span>{v}</span></li>)}</ul></div>
                </div>}
                <div className="tby">by Shifat Masud</div>
            </motion.div>}
        </AnimatePresence>
    </div>;
}
