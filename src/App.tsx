import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { AnimatePresence, motion } from 'framer-motion';
import gsap from 'gsap';
import { Scene } from './Scene';
import { createSim, resetSim, input, type Events } from './sim';

const isGl2 = () => !!(window as any).__gl2;
const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

export function App() {
    const sim = useMemo(() => createSim(), []);
    const fx = useRef({ fov: 0, shake: 0 }).current;
    const perf = useRef({ scale: coarse ? 0.7 : 1, fps: 60, speed: 0 }).current;
    const actx = useRef<AudioContext | null>(null);
    const [hud, setHud] = useState({ score: 0, time: 0, mode: sim.mode, best: sim.best, bn: 0, bd: 0, hp: 100, ko: 0 });
    const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
    const toastId = useRef(0);
    const [muted, setMuted] = useState(false);
    const [dbg, setDbg] = useState('');
    const mutedRef = useRef(false);
    const wind = useRef<{ g: GainNode; f: BiquadFilterNode } | null>(null);
    const buzz = (ms: number) => { try { if (!mutedRef.current) (navigator as any).vibrate?.(ms); } catch (e) { /* ignore */ } };
    const lastScore = useRef(0);
    const showToast = (text: string, ms = 1600) => { const id = ++toastId.current; setToast({ id, text }); setTimeout(() => setToast((t) => (t && t.id === id ? null : t)), ms); };
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
            if (wind.current && actx.current) { const k = sim.mode === 'play' && !mutedRef.current ? Math.min(1, perf.speed / 45) : 0; wind.current.g.gain.setTargetAtTime(k * 0.22, actx.current.currentTime, 0.15); wind.current.f.frequency.setTargetAtTime(300 + k * 1800, actx.current.currentTime, 0.15); }
            setDbg(Math.round(perf.fps) + ' fps · res ' + perf.scale.toFixed(2) + (isGl2() ? ' · WebGL2' : ' · WebGL1'));
            document.documentElement.style.setProperty('--spd', String(Math.min(1, Math.max(0, (perf.speed - 18) / 40))));
            setHud((h) => {
                const n = { score: sim.score, time: Math.ceil(sim.time), mode: sim.mode, best: sim.best, bn: sim.beaconN, hp: Math.round(sim.hp), ko: sim.kos, bd: Math.round(Math.hypot(sim.beacon[0] - sim.pos[0], sim.beacon[1] - sim.pos[1], sim.beacon[2] - sim.pos[2]) / 5) * 5 };
                if (sim.score > sim.best) { sim.best = sim.score; n.best = sim.best; try { localStorage.setItem('webswinger3d-best', String(sim.best)); } catch (e) { /* ignore */ } }
                return h.score === n.score && h.time === n.time && h.mode === n.mode && h.best === n.best && h.bn === n.bn && h.hp === n.hp && h.ko === n.ko && h.bd === n.bd ? h : n;
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
        (window as any).__game = { sim, input, perf, fx, start: () => start() };
        return () => { document.removeEventListener('visibilitychange', vis); window.removeEventListener('blur', blur); clearInterval(id); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
    }, []); // eslint-disable-line

    function start() {
        try { const AC = (window as any).AudioContext || (window as any).webkitAudioContext; if (!actx.current && AC) actx.current = new AC(); (window as any).__audio = { ctx: () => actx.current, wind: () => wind.current, muted: () => mutedRef.current }; } catch (e) { /* ignore */ }
        if (actx.current && !wind.current) { try { const c = actx.current, buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const src = c.createBufferSource(); src.buffer = buf; src.loop = true; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 400; const g = c.createGain(); g.gain.value = 0; src.connect(f); f.connect(g); g.connect(c.destination); src.start(); wind.current = { g, f }; } catch (e) { /* ignore */ } }
        gsap.fromTo(fx, { fov: 22 }, { fov: 0, duration: 1.4, ease: 'power3.out' });
        resetSim(sim); lastScore.current = 0; sim.mode = 'play'; showToast('Hold SWING to fire a web, release to let go', 3500);
    }

    // controls
    const stickRef = useRef<HTMLDivElement>(null), knobRef = useRef<HTMLDivElement>(null);
    const stickId = useRef(-1);
    const stickMove = (e: React.PointerEvent) => {
        const r = stickRef.current!.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        let dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2);
        const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
        input.mx = dx; input.my = -dy; knobRef.current!.style.transform = `translate(${dx * r.width * 0.28}px,${dy * r.height * 0.28}px)`;
    };
    const stickEnd = (e: React.PointerEvent) => { if (e.pointerId === stickId.current) { stickId.current = -1; input.mx = 0; input.my = 0; knobRef.current!.style.transform = 'translate(0,0)'; } };
    const drag = useRef({ id: -1, x: 0, y: 0 });
    const [swingOn, setSwingOn] = useState(false);

    return <div className="stage" onContextMenu={(e) => e.preventDefault()}>
        <Canvas
            dpr={[1, coarse ? 1.5 : 2]}
            gl={{ antialias: !coarse, powerPreference: 'high-performance', alpha: false, stencil: false }}
            camera={{ fov: 62, near: 0.5, far: 700, position: [0, 40, -10] }}
            onCreated={({ gl }) => { gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2) * perf.scale); (window as any).__gl2 = gl.capabilities.isWebGL2; }}
            onPointerDown={(e) => { drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY }; }}
            onPointerMove={(e) => {
                if (e.pointerId !== drag.current.id) return;
                sim.yaw -= (e.clientX - drag.current.x) * 0.006; sim.pitch = Math.max(0.05, Math.min(1.0, sim.pitch + (e.clientY - drag.current.y) * 0.004));
                drag.current.x = e.clientX; drag.current.y = e.clientY; sim.lastDrag = sim.t;
            }}
            onPointerUp={() => { drag.current.id = -1; }}
        ><Scene sim={sim} ev={ev} coarse={coarse} fx={fx} perf={perf} /></Canvas>

        <div className="hud">
            <div className="chip"><span className="lab">ORBS</span><b>{hud.score}</b></div>
            <div className="chip"><span className="lab">FLIGHT</span><b>{hud.time}s</b></div>
            <div className="chip"><span className="lab">HP · KO {hud.ko}</span><b style={{ color: hud.hp < 35 ? '#FF453A' : '#E0E0E0' }}>{hud.hp}</b></div>
            <div className="chip"><span className="lab">BEACON {hud.bn}</span><b>{hud.bd}m</b></div>
        </div>
        <div className="dbg">{dbg}</div>
        <div id="bmark" className="bmark">▲</div>
        <div className="vig" />
        <div className="speedlines" />
        <button className="mute" aria-label={muted ? 'Unmute' : 'Mute'} onClick={() => { mutedRef.current = !mutedRef.current; setMuted(mutedRef.current); }}>{muted ? '🔇' : '🔊'}</button>
        <AnimatePresence>{hud.mode !== 'play' && <><motion.div className="bar top" initial={{ y: -60 }} animate={{ y: 0 }} exit={{ y: -60 }} /><motion.div className="bar bot" initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }} /></>}</AnimatePresence>
        <AnimatePresence>{toast && <motion.div key={toast.id} className="toast" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{toast.text}</motion.div>}</AnimatePresence>

        {hud.mode === 'play' && <>
            <div className="stick" ref={stickRef} onPointerDown={(e) => { stickId.current = e.pointerId; (e.target as HTMLElement).setPointerCapture(e.pointerId); stickMove(e); }} onPointerMove={(e) => { if (e.pointerId === stickId.current) stickMove(e); }} onPointerUp={stickEnd} onPointerCancel={stickEnd}><div className="knob" ref={knobRef} /></div>
            <button className={'act swing' + (swingOn ? ' on' : '')}
                onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); input.swing = true; input.swingQ = true; setSwingOn(true); }}
                onPointerUp={() => { input.swing = false; setSwingOn(false); }} onPointerCancel={() => { input.swing = false; setSwingOn(false); }}>SWING</button>
            <button className="act jump" onPointerDown={() => { input.jumpQ = true; }}>JUMP</button>
            <button className="act punch" onPointerDown={() => { input.attackQ = true; }}>PUNCH</button>
            <button className="act dodge" onPointerDown={() => { input.dodgeQ = true; }}>DODGE</button>
        </>}

        <AnimatePresence>
            {hud.mode !== 'play' && <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.04 }}>
                <motion.div className="otitle" initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}>{hud.mode === 'over' ? "Web Swinger" : 'Web Swinger'}</motion.div>
                <div className="otext">{hud.mode === 'over' ? `You grabbed ${hud.score} orbs. Best: ${hud.best}.` : 'Swing between rooftops as Nova and grab the glowing orbs. Free roam: no timer, no game over. Collect orbs and explore the city.'}</div>
                <div className="keys">Phone: left stick runs, drag the view to look, hold SWING in the air, tap JUMP, PUNCH near enemies, DODGE their swings.<br />Keyboard: WASD run, Space jump, J or E punch, C or Q dodge, hold Shift or F to swing, arrow keys look.</div>
                <motion.button className="go" whileTap={{ scale: 0.95 }} onClick={start}>{hud.mode === 'over' ? 'Play again' : 'Play'}</motion.button>
            </motion.div>}
        </AnimatePresence>
    </div>;
}
