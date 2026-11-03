// Phone touch buttons (Nov 2 phone controls polish). One finger owns a button at a time: a second finger on the same
// button is ignored (it used to re-fire taps and could leave the swing stuck on). Release, cancel and lost capture all end
// the press exactly once, so a thumb sliding off or an OS gesture can never leave a button held. The tap/hold split is
// still HOLD_MS (220 ms), read from the touch events' own timestamps so a slow frame can't turn a quick tap into a hold.
// Visual only: [data-down] while pressed, [data-held] once the press passes HOLD_MS (the ring fills over HOLD_MS, then lights).
import { HOLD_MS } from './desktopInput';

export type TouchBtn = { id: number; t0: number; timer: number; held: boolean; el: HTMLElement | null };
export const newBtn = (): TouchBtn => ({ id: -1, t0: 0, timer: 0, held: false, el: null });

// event time on the performance.now() clock; falls back to now on browsers with an epoch timeStamp
const evT = (e: { timeStamp: number }) => { const n = performance.now(), t = e.timeStamp; return t > 0 && t <= n + 50 && n - t < 1000 ? t : n; };

let hapticOn = () => true;
export const setHapticGate = (f: () => boolean) => { hapticOn = f; };
export const haptic = (ms: number) => { try { if (hapticOn()) (navigator as any).vibrate?.(ms); } catch { /* unsupported */ } };

const all = new Set<{ b: TouchBtn; end: () => void }>();

/** Start a press. Returns false when another finger already owns this button. onHold fires once at HOLD_MS while still down. */
export function pressBtn(b: TouchBtn, e: { pointerId: number; timeStamp: number; currentTarget: EventTarget }, onHold?: () => void, onEnd?: () => void): boolean {
    if (b.id !== -1) return false;
    const el = e.currentTarget as HTMLElement;
    b.id = e.pointerId; b.t0 = evT(e); b.held = false; b.el = el;
    try { el.setPointerCapture(e.pointerId); } catch { /* synthetic / stale pointer */ }
    delete el.dataset.held; el.dataset.down = '';   // data-* not classes: React rewrites className whenever HUD state changes mid-press
    haptic(8);
    clearTimeout(b.timer);
    b.timer = window.setTimeout(() => {
        if (b.id === -1) return;
        b.held = true; el.dataset.held = '';
        if (onHold) { haptic(16); onHold(); }
    }, Math.max(0, HOLD_MS - (performance.now() - b.t0)));
    if (onEnd) all.add({ b, end: onEnd });
    return true;
}

/** End a press (up, cancel or lost capture). Returns null when this pointer doesn't own the button (already ended / other finger). */
export function releaseBtn(b: TouchBtn, e: { pointerId: number; timeStamp: number }): { held: boolean; long: boolean } | null {
    if (b.id === -1 || e.pointerId !== b.id) return null;
    return finish(b, evT(e));
}
function finish(b: TouchBtn, t: number) {
    clearTimeout(b.timer);
    const r = { held: b.held, long: t - b.t0 > HOLD_MS };
    b.id = -1; b.held = false;
    if (b.el) { delete b.el.dataset.down; delete b.el.dataset.held; }
    for (const x of all) if (x.b === b) all.delete(x);
    return r;
}

/** Drop every press (page hidden, window blur, leaving play): each button's onEnd clears its input flags. */
export function releaseAllBtns() {
    for (const x of [...all]) { if (x.b.id !== -1) { finish(x.b, performance.now()); x.end(); } }
    all.clear();
}
