import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { AnimatePresence, motion } from 'framer-motion';
import gsap from 'gsap';
import { Scene } from './Scene';
import { createSim, buildings, resetSim, input, type Events } from './sim';

const DBG = !!(import.meta as any).env.VITE_DBG;   // test hooks exist only in instrumented builds (VITE_DBG=1), never in the release build
let GL2 = false;   // functional WebGL2 capability flag lives in module state, not on window
const isGl2 = () => GL2;
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
const ISnare = () => <Svg s={48}><circle cx="12" cy="12" r="3.2" fill="currentColor" /><path d="M12 4.5c3.5 0 6 2 7 4.5M19.5 12c0 3.5-2 6-4.5 7M12 19.5c-3.5 0-6-2-7-4.5M4.5 12c0-3.5 2-6 4.5-7" /><path d="M18.2 6.2l1.3 2.9-3-.6M5.8 17.8l-1.3-2.9 3 .6" /></Svg>;
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
    const perf = useRef({ scale: coarse ? 0.7 : 1, fps: 60, speed: 0 }).current;
    const actx = useRef<AudioContext | null>(null);
    const [hud, setHud] = useState({ score: 0, time: 0, mode: sim.mode, best: sim.best, bn: 0, bd: 0, hp: 100, ko: 0, sc: 0 });
    const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
    const toastId = useRef(0);
    const [muted, setMuted] = useState(false);
    const [dbg, setDbg] = useState('');
    const mutedRef = useRef(false);
    const wind = useRef<{ g: GainNode; f: BiquadFilterNode } | null>(null);
    const water = useRef<{ g: GainNode; f: BiquadFilterNode; buf: AudioBuffer } | null>(null);
    const wprev = useRef({ swim: false, dive: false });
    const buzz = (ms: number) => { try { if (!mutedRef.current) (navigator as any).vibrate?.(ms); } catch (e) { /* ignore */ } };
    const lastScore = useRef(0);
    const showToast = (_t: string, _ms = 1600) => { /* zero text in game UI */ };
    const beep = (f: number, d = 0.12, type: OscillatorType = 'sine', v = 0.07) => {
        try { const a = actx.current; if (!a || mutedRef.current) return; const o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.value = f; g.gain.value = v; g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + d); o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + d); } catch (e) { /* ignore */ }
    };
    const ev: Events = useMemo(() => ({
        orb: () => { buzz(25); showToast('+' + (sim.score - lastScore.current), 700); lastScore.current = sim.score; beep(780 + Math.min(sim.score, 20) * 25, 0.15, 'sine', 0.09); gsap.fromTo(fx, { fov: 10 }, { fov: 0, duration: 0.5, ease: 'power2.out' }); },
        fall: () => { buzz(120); gsap.fromTo(fx, { fov: -8 }, { fov: 0, duration: 0.6, ease: 'elastic.out(1,0.4)' }); showToast('Knocked out. Back to your last rooftop.', 2000); beep(120, 0.3, 'sawtooth', 0.08); },
        attach: () => { buzz(12); beep(520, 0.08, 'triangle'); gsap.fromTo(fx, { fov: 6 }, { fov: 0, duration: 0.35, ease: 'power2.out' }); },
        release: () => { beep(300, 0.08, 'triangle'); },
        hit: () => { buzz(30); beep(160, 0.09, 'square', 0.08); gsap.fromTo(fx, { shake: 0.5 }, { shake: 0, duration: 0.2 }); },
        hurt: () => { buzz(70); beep(90, 0.18, 'sawtooth', 0.09); showToast('Ouch', 600); },
        ko: () => { buzz(50); beep(240, 0.18, 'triangle', 0.09); showToast('KO +2', 700); },
        land: (hard: boolean) => { buzz(hard ? 80 : 15); beep(hard ? 70 : 140, hard ? 0.25 : 0.08, 'sine', hard ? 0.12 : 0.05); if (hard) showToast('Hard landing', 700); },
        jump: () => { beep(380, 0.1, 'square', 0.04); },
    }), []); // eslint-disable-line

    useEffect(() => {
        const id = setInterval(() => {
            { const jb = document.querySelector('.ico.jump'); if (jb) jb.classList.toggle('inv', sim.mode === 'play' && sim.swim && !sim.dive); }
            if (wind.current && actx.current) { const k = sim.mode === 'play' && !mutedRef.current ? Math.min(1, perf.speed / 45) : 0; wind.current.g.gain.setTargetAtTime(k * 0.22, actx.current.currentTime, 0.15); wind.current.f.frequency.setTargetAtTime(300 + k * 1800, actx.current.currentTime, 0.15); }
            if (water.current && actx.current) {
                const a = actx.current, w = water.current, on = sim.mode === 'play' && sim.swim && !mutedRef.current;
                const under = sim.dive; // underwater: muffled, deeper; surface: bright laps
                w.g.gain.setTargetAtTime(on ? (under ? 0.2 : 0.11) : 0, a.currentTime, 0.12);
                w.f.frequency.setTargetAtTime(under ? 260 : 900, a.currentTime, 0.1);
                if (wind.current && sim.swim) wind.current.g.gain.setTargetAtTime(under ? 0.005 : 0.03, a.currentTime, 0.1);
                const pv = wprev.current;
                if (!mutedRef.current && sim.mode === 'play' && ((sim.swim && !pv.swim) || (sim.dive !== pv.dive) || (!sim.swim && pv.swim))) {
                    // splash: short noise burst, low-passed sweep down
                    try { const src = a.createBufferSource(); src.buffer = w.buf; const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(3200, a.currentTime); f.frequency.exponentialRampToValueAtTime(300, a.currentTime + 0.5); const g = a.createGain(); g.gain.setValueAtTime(0.0001, a.currentTime); g.gain.exponentialRampToValueAtTime(0.35, a.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.55); src.connect(f); f.connect(g); g.connect(a.destination); src.start(); src.stop(a.currentTime + 0.6); } catch (e) { /* ignore */ }
                    buzz(25);
                }
                pv.swim = sim.swim; pv.dive = sim.dive;
            }
            setDbg(Math.round(perf.fps) + ' fps · res ' + perf.scale.toFixed(2) + (isGl2() ? ' · WebGL2' : ' · WebGL1'));
            document.documentElement.style.setProperty('--spd', String(Math.min(1, Math.max(0, (perf.speed - 18) / 40))));
            setHud((h) => {
                const n = { score: sim.score, time: Math.ceil(sim.time), mode: sim.mode, best: sim.best, bn: sim.beaconN, hp: Math.round(sim.hp), ko: sim.kos, sc: Math.round(Math.min(1, ((sim as any).snareCd || 0) / 9) * 20) / 20, bd: Math.round(Math.hypot(sim.beacon[0] - sim.pos[0], sim.beacon[1] - sim.pos[1], sim.beacon[2] - sim.pos[2]) / 5) * 5 };
                if (sim.score > sim.best) { sim.best = sim.score; n.best = sim.best; try { localStorage.setItem('webswinger3d-best', String(sim.best)); } catch (e) { /* ignore */ } }
                return h.score === n.score && h.time === n.time && h.mode === n.mode && h.best === n.best && h.bn === n.bn && h.hp === n.hp && h.ko === n.ko && h.sc === n.sc && h.bd === n.bd ? h : n;
            });
        }, 100);
        const down = (e: KeyboardEvent) => {
            const k = e.key.toLowerCase();
            if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
            if (k === ' ' && !input.keys[' ']) input.jumpQ = true;
            if ((k === 'j' || k === 'e') && !input.keys[k]) input.attackQ = true;
            if ((k === 'c' || k === 'q') && !input.keys[k]) input.dodgeQ = true;
            if ((k === 'shift' || k === 'f') && !input.keys[k]) input.swingQ = true;
            if (k === 'enter' && sim.mode !== 'play') start();
            input.keys[k] = true;
        };
        const up = (e: KeyboardEvent) => { input.keys[e.key.toLowerCase()] = false; };
        const vis = () => { try { const c = actx.current; if (c) { if (document.hidden) c.suspend(); else c.resume(); } } catch (e) { /* ignore */ } if (document.hidden) { input.swing = false; input.mx = 0; input.my = 0; } };
        document.addEventListener('visibilitychange', vis);
        const blur = () => { try { for (const k of Object.keys((input as any).keys || {})) (input as any).keys[k] = false; } catch (e) { /* ignore */ } input.swing = false; input.mx = 0; input.my = 0; try { for (const k of Object.keys(input as any)) if (typeof (input as any)[k] === 'boolean') (input as any)[k] = false; } catch (e) { /* ignore */ } };
        window.addEventListener('blur', blur);
        window.addEventListener('keydown', down); window.addEventListener('keyup', up);
        if (DBG) (window as any).__game = { sim, input, perf, fx, buildings, start: () => start() };
        return () => { document.removeEventListener('visibilitychange', vis); window.removeEventListener('blur', blur); clearInterval(id); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
    }, []); // eslint-disable-line

    function start() {
        try { const AC = (window as any).AudioContext || (window as any).webkitAudioContext; if (!actx.current && AC) actx.current = new AC(); try { const rp = actx.current && actx.current.state === 'suspended' ? actx.current.resume() : null; if (rp && rp.catch) rp.catch(() => { /* ignore */ }); } catch (e) { /* ignore */ } if (DBG) (window as any).__audio = { ctx: () => actx.current, wind: () => wind.current, muted: () => mutedRef.current }; } catch (e) { /* ignore */ }
        if (actx.current && !wind.current) { try { const c = actx.current, buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const src = c.createBufferSource(); src.buffer = buf; src.loop = true; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 400; const g = c.createGain(); g.gain.value = 0; src.connect(f); f.connect(g); g.connect(c.destination); src.start(); wind.current = { g, f }; } catch (e) { /* ignore */ } }
        if (actx.current && !water.current) { try { const c = actx.current, buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = buf.getChannelData(0); let l = 0; for (let i = 0; i < d.length; i++) { l = l * 0.97 + (Math.random() * 2 - 1) * 0.3; d[i] = l; } const src = c.createBufferSource(); src.buffer = buf; src.loop = true; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; const g = c.createGain(); g.gain.value = 0; src.connect(f); f.connect(g); g.connect(c.destination); src.start(); water.current = { g, f, buf }; if (DBG) (window as any).__audio.water = () => water.current; } catch (e) { /* ignore */ } }
        gsap.fromTo(fx, { fov: 22 }, { fov: 0, duration: 1.4, ease: 'power3.out' });
        resetSim(sim); lastScore.current = 0; sim.mode = 'play'; 
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
    const [swingOn, setSwingOn] = useState(false);

    return <div className="stage" onContextMenu={(e) => e.preventDefault()}>
        <div id="uw" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3, opacity: 0, transition: 'opacity .15s', background: 'linear-gradient(180deg, rgba(120,225,240,.38), rgba(30,140,175,.30) 45%, rgba(8,70,105,.5))' }} />
        <Canvas
            dpr={[1, coarse ? 1.5 : 2]}
            gl={{ antialias: !coarse, powerPreference: 'high-performance', alpha: false, stencil: false }}
            camera={{ fov: 62, near: 0.5, far: 700, position: [0, 40, -10] }}
            onCreated={({ gl }) => { gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2) * perf.scale); GL2 = gl.capabilities.isWebGL2; }}
            onPointerDown={(e) => { drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY }; }}
            onPointerMove={(e) => {
                if (e.pointerId !== drag.current.id) return;
                sim.yaw -= (e.clientX - drag.current.x) * 0.006; sim.pitch = Math.max(0.05, Math.min(1.0, sim.pitch + (e.clientY - drag.current.y) * 0.004));
                drag.current.x = e.clientX; drag.current.y = e.clientY; sim.lastDrag = sim.t;
            }}
            onPointerUp={() => { drag.current.id = -1; }}
        ><Scene sim={sim} ev={ev} coarse={coarse} fx={fx} perf={perf} /></Canvas>

        <div className="hud">
            <div className="chip" aria-label="orbs"><IOrb /><Pips n={hud.score > 0 ? ((hud.score - 1) % 10) + 1 : 0} /><span className="tiers">{Array.from({ length: Math.min(6, Math.floor(Math.max(0, hud.score - 1) / 10)) }, (_, i) => <i key={i} />)}</span></div>
            <div className={'chip' + (hud.hp < 35 ? ' low' : '')} aria-label="health"><IHeart /><span className="hpbar"><i style={{ width: Math.max(0, Math.min(100, hud.hp)) + '%' }} /></span></div>
            <div className="chip" aria-label="beacon"><IBeacon /><span className="hpbar"><i style={{ width: Math.max(4, Math.min(100, 100 - hud.bd / 3)) + '%' }} /></span></div>
        </div>
        {DEBUG && <div className="dbg">{dbg}</div>}
        {/* navigator arrow removed (user 10:01) */}
        <div className="vig" />
        <div className="speedlines" />
        <button className="mute" aria-label={muted ? 'Unmute' : 'Mute'} onClick={() => { mutedRef.current = !mutedRef.current; setMuted(mutedRef.current); }}><ISpeaker off={muted} /></button>
        <AnimatePresence>{hud.mode !== 'play' && <><motion.div className="bar top" initial={{ y: -60 }} animate={{ y: 0 }} exit={{ y: -60 }} /><motion.div className="bar bot" initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }} /></>}</AnimatePresence>

        {hud.mode === 'play' && <>
            <div className="padzone" onPointerDown={padStart} onPointerMove={(e) => { if (e.pointerId === stickId.current) padMove(e); }} onPointerUp={stickEnd} onPointerCancel={stickEnd} />
            <div className="dpad" ref={padRef}><svg width="120" height="120" viewBox="0 0 120 120" {...IC} strokeWidth={2}><path d="M60 8l9 11H51zM60 112l-9-11h18zM8 60l11-9v18zM112 60l-11 9V51z" fill="currentColor" stroke="none" opacity=".85" /><circle cx="60" cy="60" r="38" opacity=".35" /></svg><div className="knob" ref={knobRef} /></div>
            <button className={'ico swing' + (swingOn ? ' on' : '')} aria-label="web swing"
                onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); input.swing = true; input.swingQ = true; setSwingOn(true); }}
                onPointerUp={() => { input.swing = false; setSwingOn(false); }} onPointerCancel={() => { input.swing = false; setSwingOn(false); }}><ISwing /></button>
            <button className="ico grab" aria-label="web grab" onPointerDown={() => { input.grabQ = true; }}><IGrab /></button>
            <button className="ico shot" aria-label="web shot" onPointerDown={() => { input.shotQ = true; input.attackQ = true; }}><IShot /></button>
            <button className={'ico special' + (hud.sc > 0 ? ' cd' : '')} aria-label="shadow snare" onPointerDown={() => { input.specialQ = true; }}><ISnare /><svg className="ring" viewBox="0 0 44 44"><circle cx="22" cy="22" r="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeDasharray={125.7} strokeDashoffset={125.7 * hud.sc} transform="rotate(-90 22 22)" /></svg></button>
            <button className="ico melee" aria-label="melee" onPointerDown={() => { input.meleeQ = true; input.attackQ = true; }}><IFist /></button>
            <button className="ico jump" aria-label="jump" onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); input.jumpQ = true; }}><IJump /></button>
        </>}

        <AnimatePresence>
            {hud.mode !== 'play' && <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.04 }}>
                <motion.div className="otitle" initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}>Shadow: The Soul of Darkness</motion.div>
                {hud.mode === 'over' && <div className="otext"><IOrb /><Pips n={Math.min(10, hud.score)} /></div>}
                <div className="legend"><span><IStick /></span><span><IWeb /></span><span><IJump /></span><span><IFist /></span><span><IDash /></span></div>
                <motion.button className="go" aria-label="play" whileTap={{ scale: 0.95 }} onClick={start}><IPlay /></motion.button>
            </motion.div>}
        </AnimatePresence>
    </div>;
}
