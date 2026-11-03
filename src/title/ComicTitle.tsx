/**
 * The first screen before Play (Shifat Nov 2 3:44 PM: "2 panels & title after that. I like things cleaner."): two tilted comic
 * frames on black holding AI-rendered 3D key art of each hero (Shifat Nov 2 6:03 PM: "Or just ai generated image as close to real 3d
 * as possible"; small baked webp, ./PanelArt.tsx, so nothing 3D loads before Play), the sticker title (SVG), a round Play, his
 * portfolio wordmark top-left and the portfolio sound toggle top-right.
 * Intro: panel 1 slides/tilts in, panel 2, the title stamps on, Play fades up; then a very slow push-in.
 * Cheap: SVG + two images + CSS transforms/opacity, no canvas, no per-frame JS; reduced motion shows the finished frame.
 */
import React, { useLayoutEffect, useRef, useState } from 'react';
import { ART } from './layout';
import { PanelArt } from './PanelArt';
import { TitleHeader } from './TitleHeader';
import { TitleButton } from './TitleButton';
import { TitleGift } from './gift/TitleGift';   // Shifat Nov 2 7:37 PM: the portfolio's gift sticker + 3D gift (lazy)

/** Play is up once its intro lands (.sv-play: sv-play-in .55s after 1.66s, title.css); Space waits for it (Shifat Nov 2 7:37 PM) */
const PLAY_UP_MS = 2210;
const REDUCED = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const isPhone = (W: number, H: number) => H <= 500 && W / H >= 1.6;   // short landscape phone (844x390 and friends)

/** fits a frame's box to the screen; the box grows by Play's 52 px minimum on small screens, so Play is never cut off */
function fit(W: number, H: number) {
    const phone = isPhone(W, H), L = phone ? ART.phone : ART, [x0, y0, x1, b1] = L.box, [, pcy] = L.play;
    // phone: the header row only uses the corners, so the art fills the height between a thin top and bottom margin
    const top = phone ? Math.max(14, H * 0.045) : Math.min(64, H * 0.12), bot = phone ? Math.max(8, H * 0.02) : 0;
    let y1 = b1, k = 1;
    for (let i = 0; i < 2; i++) {
        k = phone ? Math.min((W * 0.86) / (x1 - x0), (H - top - bot) / (y1 - y0) / 1.02)   // 1.02: room for the slow push-in
            : Math.min((W * 0.94) / (x1 - x0), ((H - top * 0.35) * 0.97) / (y1 - y0));
        y1 = Math.max(b1, pcy + 26 / k + 8 / k);
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return phone ? { k, phone, tx: W / 2 - cx * k, ty: top + (H - top - bot) / 2 - cy * k } : { k, phone, tx: W / 2 - cx * k, ty: H / 2 + top * 0.12 - cy * k };
}

function Sticker({ phone }: { phone: boolean }) {
    // "SHADE VERSE" in Anton (OFL, ./anton-title.woff2, only these 7 letters): a tall, condensed comic display face (Shifat Nov 2
    // 4:28 PM: "Shade verse text can be bigger condensed."), white with a thick ink edge and a hard offset shadow in each hero's colour.
    // Straight, no lean, tucked up over the bottom edge of both frames like a comic caption (Shifat Nov 2 6:39 PM: "Shade verse Text tilt
    // feels wrong & feels disconnected from the panels", 6:41 PM picked "Straighten the text and tuck it up so it overlaps the bottom edge of
    // both panels, like a comic caption banner"). The caption box sits behind the words, centred on the seam between the two frames, in
    // the frames' own border (off-white with an ink edge), so frames + caption read as one piece.
    const { cx, cy, size } = phone ? ART.phone.title : ART.title;
    const gap = size * 0.13;
    const word = (t: string, x: number, shadow: string) => <g>
        <text x={x + size * 0.055} y={cy + size * 0.055} fill={shadow} stroke="#05040a" strokeWidth={size * 0.1} paintOrder="stroke" strokeLinejoin="round">{t}</text>
        <text x={x} y={cy} fill="#fbf8f2" stroke="#05040a" strokeWidth={size * 0.1} paintOrder="stroke" strokeLinejoin="round">{t}</text>
    </g>;
    const B = ART.caption, bw = size * B.w, bt = cy - size * B.top, bb = cy + size * B.bot;
    return <g className="sv-sticker" style={{ animationDelay: `${ART.title.delay}s` }}>
        {B.on && <g>
            <rect x={cx - bw / 2} y={bt} width={bw} height={bb - bt} fill="#05040a" stroke="#05040a" strokeWidth="16" strokeLinejoin="round" />
            <rect x={cx - bw / 2} y={bt} width={bw} height={bb - bt} fill="#05040a" stroke="#f4efe4" strokeWidth="9" strokeLinejoin="round" />
        </g>}
        <g style={{ fontFamily: "'SV Anton','Anton','Impact','Arial Narrow',sans-serif", fontWeight: 400, fontSize: size, letterSpacing: '0.005em' }} textAnchor="end">
            {word('SHADE', cx - gap / 2, '#a855f7')}
            <g textAnchor="start">{word('VERSE', cx + gap / 2, '#ff1a96')}</g>
        </g>
    </g>;
}

export function ComicTitle({ muted, onMute, onStart, extra, leaving, again }: { muted: boolean; onMute: () => void; onStart: () => void; extra?: React.ReactNode; leaving: boolean; again: boolean }) {
    const root = useRef<HTMLDivElement>(null);
    const [f, setF] = useState(() => fit(innerWidth, innerHeight));
    useLayoutEffect(() => {
        const r = () => { const el = root.current; if (el) setF(fit(el.clientWidth || innerWidth, el.clientHeight || innerHeight)); };
        r(); addEventListener('resize', r); return () => removeEventListener('resize', r);
    }, []);
    const half = f.k * Math.min(devicePixelRatio || 1, 2) <= 0.6;
    const [pcx, pcy, pd] = f.phone ? ART.phone.play : ART.play, playD = Math.max(pd, 52 / f.k);
    return <div ref={root} className={'sv-comic' + (leaving ? ' leaving' : '') + (again ? ' again' : '')}>
        <div className="sv-stage" style={{ width: ART.w, height: ART.h, transform: `translate3d(${f.tx}px,${f.ty}px,0) scale(${f.k})` }}>
            <div className="sv-push">
                <svg className="sv-art" width={ART.w} height={ART.h} viewBox={`0 0 ${ART.w} ${ART.h}`} aria-hidden="true">
                    {ART.panels.map((p) => <PanelArt key={p.id} p={p} half={half} />)}
                </svg>
                <svg className="sv-art sv-top" width={ART.w} height={ART.h} viewBox={`0 0 ${ART.w} ${ART.h}`} aria-hidden="true"><Sticker phone={f.phone} /></svg>
                <TitleButton variant="play" className="sv-play" label="play" style={{ left: pcx - playD / 2, top: pcy - playD / 2, width: playD, height: playD }} onPress={onStart}
                    space={!leaving} spaceAfter={again || REDUCED() ? 0 : PLAY_UP_MS} />
            </div>
        </div>
        <TitleGift f={f} again={again} />
        {extra && <div className="sv-cextra">{extra}</div>}
        <TitleHeader word="Shade Verse" muted={muted} onToggle={onMute} />
        <h1 className="sv-sr">Shade Verse</h1>
    </div>;
}
