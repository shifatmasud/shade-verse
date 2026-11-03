/**
 * The first screen's hero poses (bone eulers in degrees on the rest pose), placement and framing for the real game reference shots (refshots.mjs / shot.ts).
 * box = the design px (1920x1080 stage) each render covers; the trimmed cut-out keeps its place inside it.
 */
import type { HeroSpec } from './heroBake';

export const HEROES: HeroSpec[] = [
    {   // Shadow mid web-swing: right hand high on a taut web, left arm flung out, knees tucked, leaning into the arc
        id: 'shadow', ghost: false,
        box: [395, 30, 965, 690],
        pos: [0, 0, 0], rot: [0, 28, -16],
        pose: {
            spine: [8, 0, 4], chest: [6, 0, 6], neck: [-6, 0, 0], head: [-18, 10, 0],
            uarmR: [0, 0, 160], farmR: [0, 0, 12], handR: [0, 0, 0],
            uarmL: [-20, 0, -72], farmL: [-10, -30, -25],
            thighL: [-78, 0, -6], shinL: [88, 0, 0], footL: [20, 0, 0],
            thighR: [-25, 0, 8], shinR: [105, 0, 0], footR: [30, 0, 0],
        },
        cam: [0, 1.05, 6.6], look: [0.05, 1.15, 0], fov: 30,
    },
    {   // Ghost firing her Shock: right arm thrust out with the open palm, left fist cocked back, wide braced stance
        id: 'ghost', ghost: true,
        box: [935, 100, 1585, 720],
        pos: [0, 0, 0], rot: [0, 45, 3],
        pose: {
            spine: [4, -6, 2], chest: [0, -14, 4], neck: [0, -10, 0], head: [-6, -18, 0],
            uarmR: [0, -56, 86], farmR: [0, -6, 2], handR: [0, 0, -20],
            uarmL: [10, 30, -62], farmL: [0, 95, 0],
            thighL: [-14, 0, -14], shinL: [22, 0, 0], footL: [-6, 0, 0],
            thighR: [10, 0, 16], shinR: [16, 0, 0],
        },
        cam: [0, 1.0, 6.4], look: [0.2, 1.0, 0], fov: 30,
    },
];
