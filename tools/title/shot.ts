// dev-only (vite dev server, loaded INTO the running DBG game page by bake_heroes.mjs): stages one title hero inside the real game
// world for a panel shot. The hero is the real in-game mesh/skeleton/costume (./heroBake.ts buildHero + the pose from ./poses.ts) with the
// game's own hero material (Scene.tsx buildRig: Lambert + emissive suit 0.45) and the game's ink hull, lit by the game's own sun, sky and
// fog at a chosen time of day; the camera is the game camera (DBG __camOv) at the pose's framing. Shadow gets his taut web, Ghost her
// inked pink Shock bolts (no soft orb, Shifat Nov 2 4:38 PM).
import * as THREE from 'three';
import { buildHero, applyPose, suitTexture, type HeroSpec } from './heroBake';
import { GHOST_HEIGHT } from '../../src/ghostBody';

const D2R = Math.PI / 180;
const W: any = window;

export interface Place { at: [number, number, number]; yaw: number; tod: number; roof?: [number, number, number]; ground?: boolean }

let staged: THREE.Group | null = null, bg: THREE.Mesh | null = null;
const hidden: THREE.Object3D[] = [];

export async function stage(s: HeroSpec, pl: Place) {
    const scene: THREE.Scene = W.__scene, camObj: THREE.PerspectiveCamera = W.__camObj;
    if (staged) { scene.remove(staged); staged = null; }
    if (pl.roof) {   // stand on the real roof nearest [x, z], dz metres in from its south edge
        const rs: number[][] = W.__roofs; let best = rs[0], bd = 1e9; for (const r of rs) { const d = Math.hypot(r[0] - pl.roof[0], r[2] - pl.roof[1]); if (d < bd) { bd = d; best = r; } }
        pl = { ...pl, at: [best[0] + (pl.at[0] || 0), best[1], best[2] - best[3] + pl.roof[2]] };
    }
    if (pl.ground) {   // stand on whatever real surface is under [x, z] (a ray straight down through the game world)
        const rc = new THREE.Raycaster(new THREE.Vector3(pl.at[0], 400, pl.at[2]), new THREE.Vector3(0, -1, 0));
        const hit = rc.intersectObjects(scene.children, true).find((i) => (i.object as any).isMesh && i.object.visible && !(i.object as any).isSkinnedMesh && i.point.y > 3 && !/sea|water|lake|ocean/i.test(i.object.name + (i.object.parent?.name || '')));
        console.log('ground', hit?.object.name, hit?.object.parent?.name, hit?.point.y);
        if (hit) pl = { ...pl, at: [pl.at[0], hit.point.y, pl.at[2]] };
    }
    const tex = await suitTexture(s.ghost, () => {});
    const mat = new THREE.MeshLambertMaterial({ map: tex, emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: 0.45 });
    const h = buildHero(s.ghost, mat);
    (h.om as any).fog = false;
    const rig = new THREE.Group(); rig.position.set(...pl.at); rig.rotation.y = pl.yaw * D2R;
    h.root.position.set(...s.pos); h.root.rotation.set(s.rot[0] * D2R, s.rot[1] * D2R, s.rot[2] * D2R);
    if (s.ghost) h.root.scale.setScalar(GHOST_HEIGHT);
    applyPose(h.by, s.pose); rig.add(h.root); scene.add(rig); rig.updateMatrixWorld(true);
    const hand = new THREE.Vector3(); h.by.handR.getWorldPosition(hand); const handL = rig.worldToLocal(hand.clone());
    if (!s.ghost) {   // the taut straight web from the raised hand up out of the frame (white core, ink edge), as on the locked title
        const dir = new THREE.Vector3(0.7, 9, -0.4).normalize(), from = handL.clone().addScaledVector(dir, 0.06), top = handL.clone().addScaledVector(dir, 9);
        const mk = (r: number, color: number) => { const len = from.distanceTo(top); const me = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10, 1, true), new THREE.MeshBasicMaterial({ color, fog: false }));
            me.position.copy(from).lerp(top, 0.5); me.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); return me; };
        const ink = mk(0.045, 0x05040a), core = mk(0.021, 0xf4f1ff); core.renderOrder = 3; ink.renderOrder = 2; rig.add(ink, core);
    } else {          // the pink Shock: crackling inked bolts thrown out of the palm (same bolts as the locked title)
        let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
        const inkM = new THREE.MeshBasicMaterial({ color: 0x1a0010, fog: false, depthTest: false });
        const glowM = new THREE.MeshBasicMaterial({ color: 0xff1a96, fog: false, depthTest: false });
        const coreM = new THREE.MeshBasicMaterial({ color: 0xffe3f4, fog: false, depthTest: false });
        const farm = rig.worldToLocal(new THREE.Vector3().setFromMatrixPosition(h.by.farmR.matrixWorld));
        const fwd = handL.clone().sub(farm).normalize(), side = new THREE.Vector3(0, 1, 0).cross(fwd).normalize(), up = fwd.clone().cross(side).normalize();
        for (let k = 0; k < 9; k++) {
            const a = (k / 9) * Math.PI * 2, spread = 0.55 + (k % 3) * 0.18, len = 0.9 + (k % 4) * 0.35, pts: THREE.Vector3[] = [];
            for (let j = 0; j <= 8; j++) { const f = j / 8; pts.push(handL.clone().addScaledVector(fwd, len * f * 0.8).addScaledVector(side, Math.cos(a) * spread * f + rnd() * 0.16 * f).addScaledVector(up, Math.sin(a) * spread * f + rnd() * 0.16 * f)); }
            const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.0);
            const t0 = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.05, 5, false), inkM), t1 = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.032, 5, false), glowM), t2 = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.012, 5, false), coreM);
            t0.renderOrder = 2; t1.renderOrder = 3; t2.renderOrder = 4; rig.add(t0, t1, t2);
        }
    }
    rig.traverse((o) => { o.frustumCulled = false; });
    staged = rig;
    const cam = rig.localToWorld(new THREE.Vector3(...s.cam)), look = rig.localToWorld(new THREE.Vector3(...s.look));
    W.__camOv = [cam.x, cam.y, cam.z, look.x, look.y, look.z];
    if (!Object.getOwnPropertyDescriptor(camObj, 'fov')?.get) Object.defineProperty(camObj, 'fov', { get: () => W.__fovOv ?? 62, set: () => {}, configurable: true });
    W.__fovOv = s.fov; camObj.updateProjectionMatrix();
    W.__todPh = pl.tod;
    return { hand: hand.toArray(), cam: W.__camOv };
}

/** where the hand lands on screen (0..1), read after the game camera has moved */
export function handScreen() {
    const camObj: THREE.PerspectiveCamera = W.__camObj; camObj.updateMatrixWorld(true);
    let hand: THREE.Vector3 | null = null; staged?.traverse((o: any) => { if (o.isBone && o.name === 'handR') hand = o.getWorldPosition(new THREE.Vector3()); });
    const p = (hand as any as THREE.Vector3).clone().project(camObj); return [p.x * 0.5 + 0.5, 0.5 - p.y * 0.5];
}

/** 'all' = the full shot, 'world' = no hero, 'matte' = hero alone on a flat colour (for the alpha) */
export function mode(m: 'all' | 'world' | 'matte', color = 0x000000) {
    const scene: THREE.Scene = W.__scene;
    for (const o of hidden) o.visible = true; hidden.length = 0;
    if (bg) { scene.remove(bg); bg = null; }
    for (const n of ['rain', 'rain-splash']) { const o = scene.getObjectByName(n); if (o && o.visible) { o.visible = false; hidden.push(o); } }
    if (W.__bossArenaMarker?.visible) { W.__bossArenaMarker.visible = false; hidden.push(W.__bossArenaMarker); }
    if (!staged) return;
    staged.visible = m !== 'world';
    scene.onBeforeRender = () => {}; scene.onAfterRender = () => {};
    if (m === 'matte') {   // the game re-shows its own objects every frame, so the hiding happens inside each render call
        bg = new THREE.Mesh(new THREE.SphereGeometry(400, 16, 8), new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, fog: false, depthWrite: false }));
        bg.renderOrder = -10; bg.frustumCulled = false; bg.position.copy(W.__camObj.position); scene.add(bg);
        const keep = new Set<THREE.Object3D>(); staged.traverse((o) => keep.add(o)); keep.add(bg); keep.add(scene);
        const off: THREE.Object3D[] = [];
        scene.onBeforeRender = () => { scene.traverse((o) => { if (!keep.has(o) && !(o as any).isLight && o.visible) { o.visible = false; off.push(o); } }); };
        scene.onAfterRender = () => { for (const o of off) o.visible = true; off.length = 0; };
    }
}
