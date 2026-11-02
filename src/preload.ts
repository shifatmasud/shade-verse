// Everything the world needs is downloaded before gameplay begins (Shifat Nov 1 7:53 PM 'Preload everything first before gameplay begins.
// No whileplay asset load'): the world code chunk, every model and texture (kept in three's loader cache, so the loaders in the world read
// them from memory) and every sound file. It starts on the Play tap (Shifat 8:19 PM 'Only load when tap play'); gameplay waits for it.
import * as THREE from 'three';
import { PRELOAD_IMAGES, PRELOAD_MODELS } from './preloadList';
import { audio } from './audio/engine';

THREE.Cache.enabled = true;
type Prog = (done: number, total: number) => void;
let net: Promise<void> | null = null, done = 0, total = 0;
const subs = new Set<Prog>();
export function onPreloadProgress(f: Prog) { subs.add(f); f(done, total); return () => { subs.delete(f); }; }
export function preloadNet(): Promise<void> {
    if (net) return net;
    const fl = new THREE.FileLoader().setResponseType('arraybuffer'), il = new THREE.ImageLoader();
    const jobs: Promise<unknown>[] = [
        import('./Scene'), import('./Ghost'),
        ...PRELOAD_MODELS.map((u) => fl.loadAsync(u)),
        ...PRELOAD_IMAGES.map((u) => il.loadAsync(u)),
        audio.prefetch(),
    ];
    total = jobs.length; const tick = () => { done++; subs.forEach((f) => f(done, total)); };
    net = Promise.all(jobs.map((j) => j.catch(() => null).then(tick))).then(() => undefined);
    return net;
}

// every three.js loader (the world's GLTF and texture loaders included) reports to the default manager; the world is ready once nothing is pending
let pending = 0;
const M = THREE.DefaultLoadingManager, s0 = M.itemStart.bind(M), e0 = M.itemEnd.bind(M), r0 = M.itemError.bind(M);
M.itemStart = (u: string) => { pending++; s0(u); };
M.itemEnd = (u: string) => { pending = Math.max(0, pending - 1); e0(u); };
M.itemError = (u: string) => { r0(u); };
export const pendingLoads = () => pending;
let readyRes: () => void = () => {};
/** resolves once the world has mounted, its loaders are idle and its shaders are compiled */
export const worldReady = new Promise<void>((r) => { readyRes = r; });
export function markWorldReady() { stages.world = true; readyRes(); }
/* the title odometer (src/title): REAL progress of everything Play waits for — files 70 %, the world mounted 8 %, its loaders idle 6 %,
   its shaders compiled 6 %, every sound decoded 10 % (Nov 2 title redesign) */
const stages = { mounted: false, idle: false, world: false, audio: false };
export function markStage(k: keyof typeof stages) { stages[k] = true; }
export function preloadProgress() { return (total ? 0.7 * done / total : 0) + (stages.mounted ? 0.08 : 0) + (stages.idle ? 0.06 : 0) + (stages.world ? 0.06 : 0) + (stages.audio ? 0.1 : 0); }
/** gives up waiting after ms (a stuck file must never lock the player out) */
export const capped = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<void>((r) => setTimeout(r, ms))]);
