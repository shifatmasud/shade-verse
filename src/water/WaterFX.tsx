import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Sim } from '../sim';
import { WATER_Z, isLakeWater, waterSurfaceAt, seabedAt } from '../sim';
import { waterRenderY } from './waveHeight';
import { WaterInteraction, ixImpulse, ixBody } from './interaction';
import { splBurst, SK, waterHits } from './splash';
import { GpuSplash } from './gpuSplash';
import { QUALITY } from '../quality';
import { TOD, WEATHER } from '../world/env';

/* Nov 15 2026 (Shifat: fake floating ring -> real displacement rings, swimming -> wake trail, impacts -> realistic particle splash).
   Replaces the hero's three flat foam-ring decals, the white two-arm wake ribbon and the cone-shard entry crown in Scene.tsx. Drives:
   - the interactive height-field (./interaction.ts): the hero as a floating body (treading pulse while still, stroke pulse + motion while
     swimming -> the surface itself carries the rings and the V wake), impact craters + rebound jets;
   - splash particles (./splash.ts): entry crown + Worthington jet + mist, stroke spray, surf spray, drips on leaving the water, hits that land on
     water (combat FX queue) and enemies falling in. Every drop that falls back raises its own small ring. */

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** Water surface height at (x, z) if there is water there (sea / lake / island pools), else null. */
function waterAt(x: number, z: number, t: number): number | null {
    if (isLakeWater(x, z)) return waterSurfaceAt(x, z, t);
    if (z < WATER_Z) { const y = waterRenderY(x, z, t); return seabedAt(x, z) < y - 0.15 ? y : null; }
    return null;
}

/** A body or object hitting the water at (x, y, z): speed (m/s, downward), size (m, ~0.5 for a person). */
export function waterImpact(x: number, y: number, z: number, speed: number, size = 0.5) {
    const e = Math.min(1.8, Math.max(0.15, speed / 7)) * Math.min(1.6, Math.max(0.3, size / 0.5));
    // height-field: crater, then the cavity collapses and rebounds (delayed jet) -> a ring train instead of a single ring
    const R = 0.3 + size * 0.55;
    ixImpulse(x, z, -Math.min(0.42, 0.16 * e), R);
    ixImpulse(x, z, Math.min(0.26, 0.09 * e), R * 0.55, 0.2);
    ixImpulse(x, z, -Math.min(0.12, 0.04 * e), R * 0.45, 0.42);
    // GPU particles (Shifat 4:38 PM 'super tiny & many', 4:56 PM 'more more particles'): ~25-40k millimetre drops per dive
    splBurst(SK.CROWN, x, y, z, 3200 + 6400 * e, e, size, 0, 0, y);
    splBurst(SK.JET, x, y, z, 700 + 1900 * e, e, size, 0, 0, y);
    splBurst(SK.MIST, x, y, z, 1400 + 3000 * e, e, size, 0, 0, y);
    splBurst(SK.BUBBLE, x, y, z, 1100 + 2700 * e, e, size, 0, 0, y);
    splBurst(SK.FOAM, x, y, z, 2200 + 3800 * e, e, size, 0, 0, y);
    // falling drops pock the surface: a scatter of tiny rings where the crown comes down (ballistic landing radius / time)
    const up = 1.4 + 2.6 * e;
    for (let i = 0; i < 10; i++) { const a = rnd(0, Math.PI * 2), tf = 2 * up * rnd(0.45, 1.1) / 9.81, rr = size * 0.45 + rnd(0.5, 2.6) * Math.sqrt(e) * tf * 0.8;
        ixImpulse(x + Math.cos(a) * rr, z + Math.sin(a) * rr, -rnd(0.006, 0.016) * Math.min(1.3, e), rnd(0.12, 0.2), tf); }
}

export function WaterFX({ sim }: { sim: Sim }) {
    const { gl, size, camera } = useThree();
    const ix = useMemo(() => new WaterInteraction(gl), [gl]);
    useEffect(() => () => ix.dispose(), [ix]);
    const gs = useMemo(() => new GpuSplash(gl, TOD.day), [gl]);
    useEffect(() => () => gs.dispose(), [gs]);
    const st = useRef({ prevSwim: false, prevDive: false, prevVy: 0, stroke: 0, half: 0, side: 1, dripT: -9, sprayAcc: 0, foamAcc: 0, dripAcc: 0, bubAcc: 0, rainAcc: 0, enemyY: new WeakMap<object, number>() });

    useFrame((_, dtRaw) => {
        const s = sim as any, p = sim.pos, v = sim.vel, t = sim.t, dt = Math.min(0.05, Math.max(0, dtRaw)), S = st.current;
        // ---- rain spray (Shifat 6:00 PM 'they should spray too'): random impacts in 4 discs around the camera, each its own water level
        const rn = WEATHER.rain.value; if (rn > 0.02 && gs.ok) { const cx = camera.position.x, cz = camera.position.z, cw = waterAt(cx, cz, t);
            if (cw !== null && camera.position.y > cw - 0.2) { S.rainAcc += dt * rn * (QUALITY.coarse ? 5000 : 10000);
                for (let i = 0; i < 4 && S.rainAcc >= 40; i++) { const a = Math.random() * 6.283, rr = 1 + Math.sqrt(Math.random()) * 9, x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr, wy = waterAt(x, z, t);
                    const n = Math.floor(S.rainAcc / (4 - i)); S.rainAcc -= n; if (wy !== null) splBurst(SK.RAIN, x, wy, z, n, 1, 2.4, 0, 0, wy); } } }
        const surf = waterAt(p[0], p[2], t), sp = Math.hypot(v[0], v[2]), surfing = !!s.surf, fx = Math.sin(sim.ang), fz = Math.cos(sim.ang);
        // ---- hero: entry splash (jump / dive / fall in), scaled by the speed it hit the water with
        if (sim.swim && !S.prevSwim && surf !== null && p[1] > surf - 2.5) waterImpact(p[0], surf, p[2], Math.max(1.2, -S.prevVy, sp * 0.35), 0.55);
        if (!sim.swim && S.prevSwim && surf !== null && p[1] > surf - 0.5) S.dripT = t;   // climbing / leaping out: the body drips
        if (sim.dive && !S.prevDive && surf !== null && p[1] > surf - 1.2) waterImpact(p[0], surf, p[2], 2.5, 0.4);   // duck-dive: small break of the surface
        // ---- hero as a floating body: presses the surface down by its submerged footprint; only the change is written (interaction.ts)
        const near = surf !== null && (sim.swim || surfing) && !sim.dive && p[1] > surf - 1.6;
        if (near) {
            const sub = THREE.MathUtils.smoothstep(p[1], surf! - 1.6, surf! - 0.6) * (1 - THREE.MathUtils.smoothstep(p[1], surf! + 0.4, surf! + 1.2));
            let depth: number, rad = 0.45, foam = 0;
            if (surfing) { depth = 0.2; rad = 0.6; foam = THREE.MathUtils.smoothstep(sp, 3, 9) * 0.9; }
            else if (sp < 0.6) depth = 0.14 + 0.055 * Math.sin(t * Math.PI * 2 * 0.85) + 0.018 * Math.sin(t * Math.PI * 2 * 2.3 + 1.1);   // treading water: soft rings
            else { const hz = 0.75 + 0.22 * sp; S.stroke += dt * hz; depth = 0.2 + 0.06 * Math.min(1, sp / 4); /* Shifat 7:03 PM 'ring ripple on swim shows, rings only when floating; wake takes too long to form': a steady, deeper hull (no stroke bob = no rings); its motion alone makes the V */ foam = THREE.MathUtils.smoothstep(sp, 2.2, 6) * 0.55; }
            // body centre a little ahead of the hips (head + shoulders lead), elongated swimmers approximated by a second smaller footprint behind
            ixBody(0, true, p[0] + fx * 0.25, p[2] + fz * 0.25, depth * sub, rad, foam);
            if (sp > 0.6 && !surfing) { ixBody(1, true, p[0] - fx * 0.6, p[2] - fz * 0.6, depth * 0.75 * sub, 0.34, foam * 0.6); ixBody(2, true, p[0] + fx * 0.8, p[2] + fz * 0.8, depth * 0.8 * sub, 0.26, foam * 0.4); ixBody(3, true, p[0] - fx * 1.15, p[2] - fz * 1.15, depth * 0.4 * sub, 0.3, foam * 0.5); }   /* head, chest, hips, kicking legs: a 2 m hull throws a full V at once */
            else { ixBody(1, false); ixBody(2, false); ixBody(3, false); }
            if (!surfing && sp > 0.6) { S.foamAcc += dt * sp * 180; if (S.foamAcc >= 30) { const n = Math.floor(S.foamAcc); S.foamAcc -= n; splBurst(SK.FOAM, p[0] - fx * 0.5, surf!, p[2] - fz * 0.5, n, 0.3, 0.3, v[0] * 0.3, v[2] * 0.3, surf!); } }   /* churned bubbles strung along the wake */
            // stroke spray: each arm entry throws a handful of drops forward / up and dimples the surface
            if (!surfing && sp > 0.8) {
                const half = Math.floor(S.stroke * 2);
                if (half !== S.half) {   /* a new half-cycle = the other arm enters the water */
                    S.half = half; S.side = -S.side; const hx = p[0] + fx * 0.65 - fz * 0.32 * S.side, hzp = p[2] + fz * 0.65 + fx * 0.32 * S.side, k = Math.min(1.4, sp / 4);
                    /* 7:03 PM: arm entries no longer dimple the height-field (each dimple was a ring); the spray particles carry the stroke */
                    splBurst(SK.STROKE, hx, surf!, hzp, 320 + 560 * k, k, 0.4, fx, fz, surf!); splBurst(SK.FOAM, hx, surf!, hzp, 140 + 220 * k, 0.5, 0.25, v[0], v[2], surf!);
                }
            }
            // surf / fast tow: continuous spray sheets peeling off both sides
            if (surfing || sp > 6) {
                S.sprayAcc += dt * Math.min(4800, sp * 520);   /* ~3500 tiny drops a second at surf speed */
                if (S.sprayAcc >= 60) { const n = Math.floor(S.sprayAcc); S.sprayAcc -= n; splBurst(SK.SHEET, p[0], surf!, p[2], n, Math.min(1.4, sp / 6), 0.5, v[0], v[2], surf!); splBurst(SK.MIST, p[0], surf!, p[2], n * 0.25, 0.6, 0.6, 0, 0, surf!); splBurst(SK.FOAM, p[0] - fx * 0.6, surf!, p[2] - fz * 0.6, n * 0.4, 0.4, 0.4, 0, 0, surf!); }
            }
        } else { ixBody(0, false); ixBody(1, false); ixBody(2, false); ixBody(3, false); }
        // drips for ~0.7 s after leaving the water
        if (t - S.dripT < 0.7) { S.dripAcc += dt * 700; if (S.dripAcc >= 20) { const n = Math.floor(S.dripAcc); S.dripAcc -= n; splBurst(SK.DRIP, p[0], p[1], p[2], n, 1, 0.5, v[0], v[2], waterAt(p[0], p[2], t) ?? p[1] - 4); } }
        // under water (diving / deep swim): a thin stream of bubbles off the body
        if (surf !== null && p[1] < surf - 0.5) { S.bubAcc += dt * (80 + sp * 90); if (S.bubAcc >= 16) { const n = Math.floor(S.bubAcc); S.bubAcc -= n; splBurst(SK.BUBBLE, p[0], p[1] + 0.9, p[2], n, 0.15, 0.35, 0, 0, surf); } }
        S.prevSwim = sim.swim; S.prevDive = !!sim.dive; S.prevVy = v[1];
        // ---- enemies / objects falling into the water
        for (const e of sim.enemies) {
            const py = S.enemyY.get(e); S.enemyY.set(e, e.y);
            if (py === undefined || py <= e.y) continue;
            const w = waterAt(e.x, e.z, t); if (w === null) continue;
            if (py > w && e.y <= w) waterImpact(e.x, w, e.z, (py - e.y) / Math.max(dt, 1e-3), e.boss ? 1.1 : 0.55);
        }
        // ---- hits that land on water (punches, shots, slams, shocks near the surface)
        for (let i = 0; i + 3 < waterHits.length; i += 4) {
            const x = waterHits[i], y = waterHits[i + 1], z = waterHits[i + 2], k = waterHits[i + 3], w = waterAt(x, z, t);
            if (w !== null && y < w + 1.4 && y > w - 1.0) waterImpact(x, w, z, 4 + 5 * k, 0.3 + 0.35 * k);
        }
        waterHits.length = 0;
        // ---- step the height-field round the hero
        ix.update(dt, t, p[0], p[2]);
        // ---- particles: all on the GPU (./gpuSplash.ts)
        const pc = camera as THREE.PerspectiveCamera;
        gs.update(dt, t, size.height * gl.getPixelRatio() * 0.5 / Math.tan((pc.fov || 60) * Math.PI / 360));
    }, -1);

    return <primitive object={gs.points} />;
}
