/**
 * The portfolio's header, for the Shade Verse first screen (Shifat Nov 2 3:24 PM: "Top left side logo like my portfolio. Top right
 * volume button like my portfolio"). Ported from surface-tension src/dom/ui/Header.tsx + app.css .header/.wordmark/.pill--quiet:
 *  - left: his flat mark ONLY, no word beside it (Shifat Nov 2 4:24 PM: "Top left logo don't need logo text. Symbol only.");
 *  - right: the quiet sound toggle, ONE thin stroke (his W19 note: "Volume button doesn't need volume icon just animate simple
 *    single wave line"): on, a gentle sine drifts; off, it eases to flat; static under reduced motion. 40 px tall, 44 px+ hit area.
 * The toggle is TitleButton's 'quiet' variant (./TitleButton.tsx), the same button as Play, with the portfolio's ink press.
 * The mute itself is the game's master mute (App passes muted / onToggle); the choice persists (localStorage 'sv-muted').
 */
import React from 'react';
import { TitleButton } from './TitleButton';

export const MARK_PATH = 'M100 0H200L100 100H0Z M100 100H200L100 200H0Z';
export const Mark = ({ size = '100%' }: { size?: string }) => <svg viewBox="0 0 200 200" width={size} height={size} fill="currentColor" aria-hidden="true" focusable="false"><path d={MARK_PATH} /></svg>;

export function TitleHeader({ word, muted, onToggle }: { word: string; muted: boolean; onToggle: () => void }) {
    return <header className="sv-hdr" onClick={(e) => e.stopPropagation()}>
        <span className="sv-wordmark" role="img" aria-label={word}><span className="sv-wordmark__mark"><Mark /></span></span>
        <TitleButton variant="quiet" className="sv-sound" onPress={onToggle} pressed={!muted} on={!muted} label={muted ? 'Sound off' : 'Sound on'} />
    </header>;
}
