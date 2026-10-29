// Desktop input (Shifat's final desktop map, Oct 29 00:55): mouse + keyboard and gamepad, routed onto the EXISTING input flags only.
// Mouse: pointer-lock look; left tap = web shot, left hold = Web Shock (specialQ); right tap = web spring (grabQ), right hold = swing.
// Keys (in App): WASD move, Space = the mobile jump button 1:1, K / Ctrl / M / "." melee.
// Gamepad (standard mapping): left stick move, right stick camera, A = Space, RB tap shot / hold Web Shock, LT tap spring / hold swing, X melee.
import { input, type Sim } from './sim';

export const HOLD_MS = 220;
export type DeskEvents = { onGamepad: (connected: boolean) => void; onCharge: (on: boolean) => void; onLock: (locked: boolean) => void; start: () => void };

export function installDesktopInput(sim: Sim, isDesk: () => boolean, ev: DeskEvents) {
    let lmb = { down: false, t: 0, fired: false }, rmb = { down: false, t: 0, swinging: false };
    const canvas = () => document.querySelector('.stage canvas') as HTMLCanvasElement | null;
    const locked = () => !!document.pointerLockElement;
    const playing = () => sim.mode === 'play';
    const onDown = (e: MouseEvent) => {
        if (!isDesk() || !playing()) return;
        const c = canvas(); if (!c || e.target !== c) return;
        if (!locked()) { try { const p = (c as any).requestPointerLock?.(); if (p && p.catch) p.catch(() => {}); } catch { /* drag-look fallback stays */ } return; }
        if (e.button === 0) { lmb = { down: true, t: performance.now(), fired: false }; ev.onCharge(true); }
        if (e.button === 2) { rmb = { down: true, t: performance.now(), swinging: false }; }
        if (e.button === 1) e.preventDefault();
    };
    const onUp = (e: MouseEvent) => {
        if (e.button === 0 && lmb.down) { lmb.down = false; ev.onCharge(false); if (!lmb.fired && playing()) { input.shotQ = true; input.attackQ = true; } }
        if (e.button === 2 && rmb.down) { rmb.down = false; if (rmb.swinging) input.swing = false; else if (playing()) input.grabQ = true; }
    };
    const onMove = (e: MouseEvent) => {
        if (!locked() || !playing()) return;
        sim.yaw -= e.movementX * 0.0026; sim.pitch = Math.max(-1.15, Math.min(1.35, sim.pitch + e.movementY * 0.0019)); sim.lastDrag = sim.t;
    };
    const onLockChange = () => { ev.onLock(locked()); if (!locked()) { if (rmb.swinging) input.swing = false; lmb.down = rmb.down = false; ev.onCharge(false); } };
    const ctx = (e: MouseEvent) => { if (isDesk()) e.preventDefault(); };
    window.addEventListener('mousedown', onDown); window.addEventListener('mouseup', onUp); window.addEventListener('mousemove', onMove);
    window.addEventListener('contextmenu', ctx); document.addEventListener('pointerlockchange', onLockChange);

    // gamepad
    const gp = { a: false, x: false, rb: false, rbT: 0, rbFired: false, lt: false, ltT: 0, ltSwing: false, start: false, moving: false };
    const onConn = () => ev.onGamepad(true), onDisc = () => ev.onGamepad(false);
    window.addEventListener('gamepadconnected', onConn); window.addEventListener('gamepaddisconnected', onDisc);
    let raf = 0, last = performance.now();
    const tick = () => {
        raf = requestAnimationFrame(tick);
        const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
        // mouse hold thresholds
        if (lmb.down && !lmb.fired && now - lmb.t > HOLD_MS) { lmb.fired = true; ev.onCharge(false); if (playing()) input.specialQ = true; }
        if (rmb.down && !rmb.swinging && now - rmb.t > HOLD_MS && playing()) { rmb.swinging = true; input.swing = true; input.swingQ = true; }
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        let p: Gamepad | null = null; for (const q of pads) if (q && q.connected) { p = q; break; }
        if (!p) return;
        const b = (i: number) => !!p!.buttons[i] && (p!.buttons[i].pressed || p!.buttons[i].value > 0.5);
        const st = b(9);
        if (st && !gp.start && !playing()) ev.start();
        gp.start = st;
        if (!playing()) return;
        const dz = (v: number) => Math.abs(v) < 0.2 ? 0 : (v - Math.sign(v) * 0.2) / 0.8;
        const lx = dz(p.axes[0] || 0), ly = dz(p.axes[1] || 0), rx = dz(p.axes[2] || 0), ry = dz(p.axes[3] || 0);
        if (lx || ly) { input.mx = lx; input.my = -ly; gp.moving = true; } else if (gp.moving) { input.mx = 0; input.my = 0; gp.moving = false; }
        if (rx || ry) { sim.yaw -= rx * 2.6 * dt; sim.pitch = Math.max(-1.15, Math.min(1.35, sim.pitch + ry * 1.8 * dt)); sim.lastDrag = sim.t; }
        const a = b(0); if (a && !gp.a) { input.jumpQ = true; input.jumpHeld = true; } if (!a && gp.a) { input.jumpHeld = false; input.jumpReleased = true; } gp.a = a;
        const x = b(2); if (x && !gp.x) { input.meleeQ = true; input.attackQ = true; } gp.x = x;
        const rb = b(5);
        if (rb && !gp.rb) { gp.rbT = now; gp.rbFired = false; }
        if (rb && !gp.rbFired && now - gp.rbT > HOLD_MS) { gp.rbFired = true; input.specialQ = true; }
        if (!rb && gp.rb && !gp.rbFired) { input.shotQ = true; input.attackQ = true; }
        gp.rb = rb;
        const lt = b(6);
        if (lt && !gp.lt) { gp.ltT = now; gp.ltSwing = false; }
        if (lt && !gp.ltSwing && now - gp.ltT > HOLD_MS) { gp.ltSwing = true; input.swing = true; input.swingQ = true; }
        if (!lt && gp.lt) { if (gp.ltSwing) input.swing = false; else input.grabQ = true; }
        gp.lt = lt;
    };
    raf = requestAnimationFrame(tick);
    return () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('mousedown', onDown); window.removeEventListener('mouseup', onUp); window.removeEventListener('mousemove', onMove);
        window.removeEventListener('contextmenu', ctx); document.removeEventListener('pointerlockchange', onLockChange);
        window.removeEventListener('gamepadconnected', onConn); window.removeEventListener('gamepaddisconnected', onDisc);
    };
}

export const MAP_KB: [string, string][] = [
    ['WASD', 'Move'], ['Mouse', 'Camera (click to lock, Esc frees)'], ['Space', 'Jump · glide · fly'],
    ['Left click', 'Tap web shot · hold Web Shock'], ['Right click', 'Tap web spring · hold swing'], ['K / Ctrl / M / .', 'Melee'],
];
export const MAP_PAD: [string, string][] = [
    ['L-stick', 'Move'], ['R-stick', 'Camera'], ['A', 'Jump · glide · fly'],
    ['RB', 'Tap web shot · hold Web Shock'], ['LT', 'Tap web spring · hold swing'], ['X', 'Melee'],
];
