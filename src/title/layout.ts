/**
 * The first screen, all drawn in code (Shifat Nov 2 4:03 PM "Generate everything Illustration from code"; 3:44 PM "2 panels & title
 * after that. I like things cleaner."): a 1920x1080 design space fitted to the screen.
 *  - panels: tilted comic frames (quad corners in design px), backgrounds are SVG (./PanelArt.tsx), intro slide/tilt from `from`
 *  - heroes: the REAL game models posed + baked at build time (tools/title/bake_heroes.mjs -> ./art/<id>.webp + heroes.json);
 *    they are drawn over the frames, so whatever leaves a frame breaks out of it
 *  - title: the sticker wordmark (SVG text), play: [cx, cy, diameter]; box: the part that must always be visible
 */
import baked from './art/heroes.json';

export type Pt = [number, number];
export interface Panel { id: 'sunset' | 'harbor'; quad: [Pt, Pt, Pt, Pt]; from: [number, number, number]; delay: number }
export interface Hero { id: 'shadow' | 'ghost'; x: number; y: number; w: number; h: number; hand: Pt; delay: number; pop: [number, number] }

export const ART = {
    w: 1920, h: 1080,
    box: [420, 20, 1600, 915] as [number, number, number, number],
    panels: [
        { id: 'sunset', quad: [[545, 232], [955, 208], [945, 600], [525, 628]], from: [-170, -60, -8], delay: 0.15 },
        { id: 'harbor', quad: [[985, 218], [1385, 248], [1370, 632], [970, 602]], from: [180, -40, 7], delay: 0.42 },
    ] as Panel[],
    heroes: [
        { id: 'shadow', ...(baked as any).shadow, delay: 0.78, pop: [-40, 60] },
        { id: 'ghost', ...(baked as any).ghost, delay: 0.92, pop: [40, 50] },
    ] as Hero[],
    title: { cx: 962, cy: 748, size: 118, delay: 1.18 },
    play: [962, 858, 84] as [number, number, number],
};
