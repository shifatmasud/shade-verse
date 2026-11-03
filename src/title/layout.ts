/**
 * The first screen, all drawn in code (Shifat Nov 2 4:03 PM "Generate everything Illustration from code"; 3:44 PM "2 panels & title
 * after that. I like things cleaner."): a 1920x1080 design space fitted to the screen.
 *  - panels: tilted comic frames (quad corners in design px), images clipped by ./PanelArt.tsx, intro slide/tilt from `from`
 *  - each frame holds AI-rendered 3D key art of one hero (Shifat Nov 2 6:03 PM), ./art/panel-<id>.webp from tools/title/bake_panels.mjs
 *  - title: the sticker wordmark (SVG text), play: [cx, cy, diameter]; box: the part that must always be visible
 */
export type Pt = [number, number];
export interface Panel { id: 'sunset' | 'harbor'; quad: [Pt, Pt, Pt, Pt]; from: [number, number, number]; delay: number }
export interface Frame { box: [number, number, number, number]; title: { cx: number; cy: number; size: number; delay: number }; play: [number, number, number] }

export const ART = {
    w: 1920, h: 1080,
    box: [420, 20, 1600, 944] as [number, number, number, number],
    panels: [
        // Shadow drawn last so it overlaps Ghost's frame at the seam (Shifat Nov 2 7:23 PM)
        { id: 'harbor', quad: [[985, 218], [1385, 248], [1370, 632], [970, 602]], from: [180, -40, 7], delay: 0.42 },
        { id: 'sunset', quad: [[593, 232], [1003, 208], [993, 600], [573, 628]], from: [-170, -60, -8], delay: 0.15 },
    ] as Panel[],
    title: { cx: 962, cy: 750, size: 166, delay: 1.18 },
    // the caption box behind the title, in units of the title size around its baseline (w: width, top/bot: above/below the baseline)
    caption: { on: true, w: 4.96, top: 0.93, bot: 0.15 },
    play: [962, 860, 78] as [number, number, number],
    // short landscape phones (e.g. 844x390): a tighter frame so the panels and heroes fill the height. The box is the two panels plus
    // the title and Play below them; the web may leave the top of the screen (like it leaves its frame). The title's caption box
    // tucks up over the frames' bottom edge (as on desktop) and Play sits right under it.
    phone: {
        box: [505, 196, 1420, 878],
        title: { cx: 962, cy: 726, size: 140, delay: 1.18 },
        play: [962, 840, 84],
    } as Frame,
};
