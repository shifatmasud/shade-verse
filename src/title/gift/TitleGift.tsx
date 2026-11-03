/**
 * Shade Verse title GIFT (Shifat Nov 2 7:37 PM: "Add same gift 🎁 sticker & 3d scene with shade verse case study card in game title
 * screen. Copy my portfolio. Art direct placement"). The sticker, the dialog and the 3D gift are his portfolio's own code
 * (./giftSticker.ts, ./gift.ts, ./GiftStage.ts, ./giftSound.ts: surface-tension src/dom/gift/, rules in ./STEERS.md); ./env.ts adapts
 * what they read from the portfolio's engine.
 *
 * Placement (art directed): slapped on the top-right corner of Ghost's frame, half on the frame and half off it, the portfolio's
 * -8° tilt against the frame's own clockwise lean, so it reads as a vinyl sticker someone stuck on the comic page. That corner is
 * clear of both faces, the caption title, Play, the logo and the sound toggle on desktop and on short landscape phones.
 * It gathers out of hot-pink embers after Play has landed (the intro's last beat). Only the sticker is in the title bundle: the
 * WebGL gift (GiftStage + its css) is a dynamic import fetched on the first tap, and its context is released when the title goes.
 */
import { useEffect, useRef } from 'react'
import { ART } from '../layout'
import { mountGiftSticker } from './giftSticker'
const DBG = !!(import.meta as any).env.VITE_DBG   // QA hooks only in instrumented builds (VITE_DBG=1), never in release
import { giftDispose, giftIsOpen } from './gift'
import { audio } from '../../audio/engine'
import './giftTitle.css'

type Fit = { k: number; phone: boolean; tx: number; ty: number }
/** the corner of Ghost's frame (design px) the sticker is stuck on, and where its centre sits from that corner (design px) */
const GHOST_TR = ART.panels.find((p) => p.id === 'harbor')!.quad[1]
const SPOT = { desk: { dx: -14, dy: 16, css: 92 }, phone: { dx: -16, dy: 20, css: 62 } }

export function TitleGift({ f, again }: { f: Fit; again: boolean }) {
    const btn = useRef<HTMLButtonElement>(null)
    const size = f.phone ? SPOT.phone.css : SPOT.desk.css
    useEffect(() => {
        const b = btn.current; if (!b) return
        const ctl = mountGiftSticker(b)
        // the title is a click-to-play surface: a tap / peel / drag on the sticker, or Space / Enter on it, is the sticker's only
        // Space stays Play everywhere on the title (Shifat 7:37 PM), even with focus back on the sticker after the gift closes: it
        // does not activate the sticker and goes on to Play; Enter opens the gift when the sticker is focused from the keyboard
        const own = (e: Event) => {
            if (e instanceof KeyboardEvent && (e.key === ' ' || e.code === 'Space')) { e.preventDefault(); return }
            e.stopPropagation()
        }
        const evs = ['click', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'keydown', 'keyup'] as const
        evs.forEach((n) => b.addEventListener(n, own))
        // the tap is a gesture: wake the game's sound so the gift's sounds play (unless the game is muted)
        const wake = () => {
            if (!audio.muted) audio.unlock()
            // the sticker's mouse press holds focus back (its peel); a pointer open then lands focus on the box without the keyboard ring
            b.focus({ preventScroll: true, focusVisible: false } as FocusOptions)
            // a pointer open: the box takes focus for the keyboard, but its focus ring stays for keyboard users (cleared on any key)
            const de = document.documentElement; de.classList.add('gift-ptr')
            const k = () => { de.classList.remove('gift-ptr'); removeEventListener('keydown', k, true) }
            addEventListener('keydown', k, true)
        }
        b.addEventListener('pointerdown', wake, true)
        // while the gift is open the title's keys (Space = Play, any key starts) stay asleep, wherever focus is; Esc still closes it
        const guard = (e: KeyboardEvent) => { if (giftIsOpen() && e.key !== 'Escape' && !(e.target instanceof Element && e.target.closest('.gift'))) e.stopPropagation() }
        addEventListener('keydown', guard, true)
        const t = window.setTimeout(() => ctl.set(true), again ? 700 : 2200)
        if (DBG) (window as any).__svGift = { ctl, open: () => b.click(), isOpen: giftIsOpen }
        return () => { clearTimeout(t); removeEventListener('keydown', guard, true); evs.forEach((n) => b.removeEventListener(n, own)); b.removeEventListener('pointerdown', wake, true); ctl.destroy(); giftDispose() }
    }, [size]) // eslint-disable-line
    const s = f.phone ? SPOT.phone : SPOT.desk
    const x = (GHOST_TR[0] + s.dx) * f.k, y = (GHOST_TR[1] + s.dy) * f.k
    return <div className="sv-gift" style={{ left: f.tx, top: f.ty, width: ART.w * f.k, height: ART.h * f.k }}>
        <button ref={btn} key={size} type="button" className="gift-sticker" aria-label="Open gift" aria-haspopup="dialog"
            style={{ left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: size * 0.28 }} />
    </div>
}
