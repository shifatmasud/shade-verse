import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Sim } from '../sim';
import { WATER_Z, WATER_Y, isLakeWater, waterSurfaceAt, seabedAt } from '../sim';
import { waterRenderY } from './waveHeight';
import { WaterInteraction, ixImpulse, ixBody } from './interaction';
import { spl, splPool, splEmit, SPL_MAX, SF, waterHits } from './splash';
import { TOD } from '../world/env';

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

const MAX_RING_DROPS = 8;   // drop-landing rings per frame (each is one impulse slot)
let ringBudget = 0;

/** A body or object hitting the water at (x, y, z): speed (m/s, downward), size (m, ~0.5 for a person). */
export function waterImpact(x: number, y: number, z: number, speed: number, size = 0.5) {
    const e = Math.min(1.8, Math.max(0.15, speed / 7)) * Math.min(1.6, Math.max(0.3, size / 0.5));
    // height-field: crater, then the cavity collapses and rebounds (delayed jet) -> a ring train instead of a single ring
    const R = 0.3 + size * 0.55;
    ixImpulse(x, z, -Math.min(0.42, 0.16 * e), R);
    ixImpulse(x, z, Math.min(0.26, 0.09 * e), R * 0.55, 0.2);
    ixImpulse(x, z, -Math.min(0.12, 0.04 * e), R * 0.45, 0.42);
    // crown: a sheet torn into drops thrown up and out on ballistic arcs
    const n = Math.round(16 + 46 * e), r0 = size * 0.45, up = 1.6 + 2.4 * e;
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd(-0.12, 0.12), rr = r0 * rnd(0.8, 1.2), out = rnd(0.9, 2.4) * Math.sqrt(e);
        splEmit(x + Math.cos(a) * rr, y + 0.04, z + Math.sin(a) * rr, Math.cos(a) * out, up * rnd(0.6, 1.15), Math.sin(a) * out, rnd(1.0, 1.8), rnd(0.035, 0.085) * (0.8 + 0.4 * e));
    }
    // Worthington jet: a column rising from the centre a moment later (emitted now with a short upward burst + higher speed, centred)
    const nj = Math.round(5 + 14 * e);
    for (let i = 0; i < nj; i++) splEmit(x + rnd(-0.08, 0.08), y + 0.02, z + rnd(-0.08, 0.08), rnd(-0.35, 0.35), (2.4 + 3.6 * e) * rnd(0.75, 1.05), rnd(-0.35, 0.35), rnd(1.1, 1.9), rnd(0.05, 0.11));
    // mist: fine spray that hangs and drifts
    const nm = Math.round(3 + 8 * e);
    for (let i = 0; i < nm; i++) { const a = rnd(0, Math.PI * 2), o = rnd(0.1, 0.6) * size; splEmit(x + Math.cos(a) * o, y + rnd(0.1, 0.5), z + Math.sin(a) * o, Math.cos(a) * rnd(0.3, 1.0), rnd(0.5, 1.4) * e, Math.sin(a) * rnd(0.3, 1.0), rnd(0.8, 1.5), rnd(0.5, 1.1) * (0.7 + 0.5 * e), 1); }
}

const VS = `uniform float uScale; attribute vec4 aD; varying float vA; varying float vK; varying float vS;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; float ps = aD.x * uScale / max(0.3, -mv.z); gl_PointSize = clamp(ps, 1.0, 96.0); vA = aD.y * clamp(ps / 1.5, 0.2, 1.0); vK = aD.z; vS = ps; }`;
const FS = `uniform float uDay; uniform vec3 uSky; varying float vA; varying float vK; varying float vS;
void main(){ vec2 q = gl_PointCoord * 2.0 - 1.0; float r = dot(q, q); if (r > 1.0) discard;
  vec3 lit = mix(vec3(0.30, 0.40, 0.46), vec3(0.96, 0.99, 1.0), 0.55 + 0.45 * uDay);
  if (vK < 0.5) {   /* droplet: clear water lens - sky-tinted body, bright rim and a small specular glint */
    float rim = smoothstep(0.45, 0.95, r), glint = smoothstep(0.18, 0.0, length(q - vec2(-0.32, 0.36)));
    vec3 c = mix(uSky * 0.75 + vec3(0.05, 0.10, 0.12), lit, 0.35 + 0.45 * rim) + glint * 0.6 * uDay;
    gl_FragColor = vec4(c, vA * (1.0 - smoothstep(0.75, 1.0, r)) * (0.55 + 0.35 * rim)); }
  else { float a = (1.0 - r); a *= a; gl_FragColor = vec4(lit * 0.95, a * vA * 0.28); } }`;

export function WaterFX({ sim }: { sim: Sim }) {
    const { gl, size, camera } = useThree();
    const ix = useMemo(() => new WaterInteraction(gl), [gl]);
    useEffect(() => () => ix.dispose(), [ix]);
    const geo = useMemo(() => { const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPL_MAX * 3), 3).setUsage(THREE.DynamicDrawUsage));
        g.setAttribute('aD', new THREE.BufferAttribute(new Float32Array(SPL_MAX * 4), 4).setUsage(THREE.DynamicDrawUsage)); g.setDrawRange(0, 0); return g; }, []);
    const mat = useMemo(() => new THREE.ShaderMaterial({ uniforms: { uScale: { value: 400 }, uDay: TOD.day, uSky: { value: new THREE.Color('#9fc4d8') } }, vertexShader: VS, fragmentShader: FS,
        transparent: true, depthWrite: false, toneMapped: false }), []);
    const st = useRef({ prevSwim: false, prevDive: false, prevVy: 0, stroke: 0, half: 0, side: 1, dripT: -9, sprayAcc: 0, enemyY: new WeakMap<object, number>() });

    useFrame((_, dtRaw) => {
        const s = sim as any, p = sim.pos, v = sim.vel, t = sim.t, dt = Math.min(0.05, Math.max(0, dtRaw)), S = st.current;
        ringBudget = MAX_RING_DROPS;
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
            else if (sp < 0.6) depth = 0.13 + 0.035 * Math.sin(t * Math.PI * 2 * 0.85) + 0.012 * Math.sin(t * Math.PI * 2 * 2.3 + 1.1);   // treading water: soft rings
            else { const hz = 0.75 + 0.22 * sp; S.stroke += dt * hz; depth = 0.11 + 0.025 * Math.sin(S.stroke * Math.PI * 2); foam = THREE.MathUtils.smoothstep(sp, 2.2, 6) * 0.55; }
            // body centre a little ahead of the hips (head + shoulders lead), elongated swimmers approximated by a second smaller footprint behind
            ixBody(0, true, p[0] + fx * 0.25, p[2] + fz * 0.25, depth * sub, rad, foam);
            if (sp > 0.6 && !surfing) ixBody(1, true, p[0] - fx * 0.55, p[2] - fz * 0.55, depth * 0.5 * sub, 0.32, foam * 0.6); else ixBody(1, false);
            // stroke spray: each arm entry throws a handful of drops forward / up and dimples the surface
            if (!surfing && sp > 0.8) {
                const half = Math.floor(S.stroke * 2);
                if (half !== S.half) {   /* a new half-cycle = the other arm enters the water */
                    S.half = half; S.side = -S.side; const hx = p[0] + fx * 0.65 - fz * 0.32 * S.side, hzp = p[2] + fz * 0.65 + fx * 0.32 * S.side, k = Math.min(1.4, sp / 4);
                    ixImpulse(hx, hzp, -0.035 * k, 0.22);
                    for (let i = 0; i < 6 + Math.round(8 * k); i++) splEmit(hx + rnd(-0.1, 0.1), surf! + 0.03, hzp + rnd(-0.1, 0.1), fx * rnd(0.3, 1.6) * k + rnd(-0.4, 0.4), rnd(0.8, 2.2) * k, fz * rnd(0.3, 1.6) * k + rnd(-0.4, 0.4), rnd(0.6, 1.1), rnd(0.03, 0.06));
                }
            }
            // surf / fast tow: continuous spray sheets peeling off both sides
            if (surfing || sp > 6) {
                S.sprayAcc += dt * Math.min(80, sp * 9);
                while (S.sprayAcc >= 1) { S.sprayAcc -= 1; const sd = Math.random() < 0.5 ? -1 : 1, o = rnd(0.35, 0.6);
                    splEmit(p[0] - fz * o * sd + fx * rnd(-0.2, 0.4), surf! + 0.05, p[2] + fx * o * sd + fz * rnd(-0.2, 0.4), -fz * sd * rnd(1.2, 3.2) + v[0] * 0.35, rnd(1.2, 3.0), fx * sd * rnd(1.2, 3.2) + v[2] * 0.35, rnd(0.7, 1.3), rnd(0.035, 0.07), Math.random() < 0.12 ? 1 : 0); }
            }
        } else { ixBody(0, false); ixBody(1, false); }
        // drips for ~0.7 s after leaving the water
        if (t - S.dripT < 0.7 && Math.random() < 0.6) splEmit(p[0] + rnd(-0.25, 0.25), p[1] + rnd(-0.6, 0.4), p[2] + rnd(-0.25, 0.25), v[0] * 0.6, v[1] * 0.4 - 0.5, v[2] * 0.6, 1.4, rnd(0.03, 0.05));
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
        // ---- particles: gravity + air drag; drops that fall back into the water die there and raise a small ring
        const pa = geo.attributes.position as THREE.BufferAttribute, da = geo.attributes.aD as THREE.BufferAttribute, P = pa.array as Float32Array, D = da.array as Float32Array;
        let n = splPool.n;
        for (let i = 0; i < n; i++) {
            const o = i * SF; spl[o + 6] += dt;
            let dead = spl[o + 6] >= spl[o + 7];
            if (!dead) {
                const mist = spl[o + 9] > 0.5, dr = Math.exp(-(mist ? 2.6 : 0.35) * dt);
                spl[o + 3] *= dr; spl[o + 5] *= dr; spl[o + 4] = spl[o + 4] * dr - (mist ? 0.35 : 9.81) * dt;
                spl[o] += spl[o + 3] * dt; spl[o + 1] += spl[o + 4] * dt; spl[o + 2] += spl[o + 5] * dt;
                if (!mist && spl[o + 4] < 0 && spl[o + 1] < WATER_Y + 3.5) {
                    const w = waterAt(spl[o], spl[o + 2], t);
                    if (w !== null && spl[o + 1] <= w) { dead = true; if (spl[o + 8] > 0.055 && ringBudget > 0) { ringBudget--; ixImpulse(spl[o], spl[o + 2], -0.012 - spl[o + 8] * 0.08, 0.2); } }
                }
            }
            if (dead) { n--; if (i !== n) spl.copyWithin(o, n * SF, n * SF + SF); i--; continue; }
            const age = spl[o + 6] / spl[o + 7];
            P[i * 3] = spl[o]; P[i * 3 + 1] = spl[o + 1]; P[i * 3 + 2] = spl[o + 2];
            D[i * 4] = spl[o + 8]; D[i * 4 + 1] = spl[o + 9] > 0.5 ? Math.sin(Math.min(1, age * 4) * Math.PI * 0.5) * (1 - age) : 1 - age * age; D[i * 4 + 2] = spl[o + 9]; D[i * 4 + 3] = 0;
        }
        splPool.n = n; geo.setDrawRange(0, n);
        if (n) { pa.needsUpdate = true; da.needsUpdate = true; }
        const pc = camera as THREE.PerspectiveCamera;
        mat.uniforms.uScale.value = size.height * gl.getPixelRatio() * 0.5 / Math.tan((pc.fov || 60) * Math.PI / 360);
    }, -1);

    return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={6} />;
}
