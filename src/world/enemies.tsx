import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { ESHOT, Unibeam, enemyBodyOffset, enemyPalm, type Sim } from '../sim';
import { EYE_RED, armorCompanion, armorDrone, armorRobot, robotGeo, robotMat } from '../robotgeo';
import { useEffect, useMemo, useRef } from 'react';
import { GLOW_FS, GLOW_VS } from '../shaders/glow';
import { shadowGeo, shadowMat } from '../shadowbot';
import { SELECTIVE_BLOOM_LAYER } from '../renderLayers';
import { BOSS_BODY_OFFSET } from '../bossConfig';
import { SHOCK_SHADOW, tint } from '../combatFx';

const DBG = !!(import.meta as any).env.VITE_DBG;   // test hooks only in instrumented builds

// Enemies: heavily armoured robots, every sensor visor red (Polyfork free models, modified). 0 armoured trooper, 1 armoured walker, 2 hover drone, 3 armoured service drone.
export const ENEMY_DEFS: any[] = [
    { model: 'robot', eye: EYE_RED, shell: [0.20, 0.21, 0.24], frame: [0.07, 0.07, 0.08], accent: [0.55, 0.07, 0.07], scale: 1.1, extras: armorRobot, dy: -0.85, spd: 5 },
    { model: 'companion', eye: EYE_RED, dark: [0.14, 0.14, 0.17], shell: [0.18, 0.18, 0.21], frame: [0.07, 0.07, 0.08], accent: [0.55, 0.07, 0.07], scale: 1.6, extras: armorCompanion, dy: -0.85, spd: 6 },
    { model: 'survey', eye: EYE_RED, shell: [0.20, 0.21, 0.24], frame: [0.07, 0.07, 0.08], accent: [0.55, 0.07, 0.07], scale: 1.7, extras: armorDrone, dy: 0.45, spd: 0 },
    { model: 'shadow', eye: EYE_RED, shell: [0.20, 0.21, 0.25], accent: [0.55, 0.07, 0.07], scale: 1.0, dy: 0, spd: 9 }];   // kind 3: Shadow-body heavy armoured robot (replaces the dome)
export const ENEMY_INST_MAX = 48;
export function buildEnemy(kind: number, time: { value: number }) {
    const d = ENEMY_DEFS[kind];
    // aStill (per instance, 0..1): a KO'd bot's limbs go limp instead of walking on while it lies there (written by Scene from enemyReact)
    const still = () => new THREE.InstancedBufferAttribute(new Float32Array(ENEMY_INST_MAX), 1).setUsage(THREE.DynamicDrawUsage);
    if (d.model === 'shadow') { const geo = shadowGeo({ shell: d.shell, accent: d.accent, eye: d.eye, heavy: true }); geo.setAttribute('aStill', still()); return { geo, mat: shadowMat(time, d.spd) }; }
    const r = robotGeo(d); r.geo.translate(0, d.dy, 0); r.geo.setAttribute('aStill', still());
    return { geo: r.geo, mat: robotMat(r.parts, r.scale, time, d.spd, true) };
}



// Plasma web shot: soft glowing core + halo (Nov 2, Shifat: no solid shapes / rings / hard edges - was solid spheres + torus rings),
// a soft impact bloom with glowing embers (was flash sphere + expanding ring + cone debris), and a small lock reticle over the auto-target.
// Everything is pooled (3 bolts, 4 blasts, 12 sparks each): zero per-frame allocation, additive only, no lights.
const SOFT_TEX = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d')!; const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(0.6, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
// Aim-lock marker (Shifat's VFX rule: soft, glowing, blurry, hero colour; was a sharp cyan square outline + dot): four soft glints on a
// faint blurred diamond, white in the texture and tinted with sim fxCol each frame. Same size, same spin/pulse, still 2 draws.
const LOCK_TEX = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d')!, m = 64, r = 46;
    x.shadowColor = 'rgba(255,255,255,0.5)'; x.shadowBlur = 9; x.shadowOffsetX = 512; x.lineWidth = 4; x.strokeStyle = '#fff'; x.beginPath(); x.moveTo(m - 512, m - r); x.lineTo(m - 512 + r, m); x.lineTo(m - 512, m + r); x.lineTo(m - 512 - r, m); x.closePath(); x.stroke(); x.shadowColor = 'transparent';   // shadow-only stroke = a blurred line on every browser (ctx.filter is not on older iOS)
    for (const [px, py] of [[m, m - r], [m + r, m], [m, m + r], [m - r, m]]) { const g = x.createRadialGradient(px, py, 0, px, py, 17);
        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(px - 17, py - 17, 34, 34); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
export function PlasmaFx({ sim }: { sim: Sim }) {
    const { camera } = useThree();
    const ret = useRef<THREE.Group>(null!);
    useFrame(() => {
        // Shifat 11:34 AM "Web shot too?": the bolt and its blast take the caster's colour (Shadow purple / Ghost pink, sim fxCol); was cyan/white
        const col = ((sim as any).fxCol ?? SHOCK_SHADOW) as number;
        // web-shot bolt + blast are drawn by CombatFX now (layered particles, Shifat Nov 2 3:00 PM); this keeps only the lock reticle
        const e = sim.aimE;
        const sa = sim as any, inMelee = !!(sa.mv || sa.slam || sa.chainT > 0 || sa.cWeb);   // gap #5: the web-shot lock square cluttered melee (sat over the punched bot) - hidden during a melee move/slam and the combo window
        ret.current.visible = !!e && sim.mode === 'play' && !inMelee; if (DBG) (window as any).__retVis = ret.current.visible;
        if (e) {
            ret.current.position.set(e.x, e.y + (e.boss ? BOSS_BODY_OFFSET : [0.8, 0.3, 1.05, 0.95][e.kind ?? 0]) + 1.05, e.z);
            ret.current.quaternion.copy(camera.quaternion);
            const s2 = 1 + Math.sin(sim.t * 6) * 0.09; ret.current.scale.setScalar(s2);
            ret.current.children[0].rotation.z = sim.t * 2.4;
            if (col !== (ret.current as any).lc) { (ret.current as any).lc = col; (((ret.current.children[0] as THREE.Mesh).material) as THREE.MeshBasicMaterial).color.setHex(tint(col, 0.35)); (((ret.current.children[1] as THREE.Mesh).material) as THREE.MeshBasicMaterial).color.setHex(tint(col, 0.75)); }
        }
    });
    return <>
        <group ref={ret} visible={false} frustumCulled={false}>
            <mesh frustumCulled={false}><planeGeometry args={[1.5, 1.5]} /><meshBasicMaterial map={LOCK_TEX} color="#c99bff" transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} /></mesh>
            <mesh frustumCulled={false}><planeGeometry args={[0.36, 0.36]} /><meshBasicMaterial map={SOFT_TEX} color="#eadcff" transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} /></mesh>
        </group>
    </>;
}

// Enemy KO burst = the first burst of a real fire explosion (Shifat 1:12-1:13 PM: "softer, realistic particles glow based burst",
// "Study real first burst explosion images", "Fire"). From reference photos (files/fixes/ko_refs): a blinding white-yellow flash for a
// few frames; a lumpy cauliflower fireball that grows fast then slows, hot yellow-white lobes with darker creases, cooling to orange and
// deep red at the edge; dark smoke rolling up out of it as it cools; fast sparks with short glowing streaks, slowed by drag, falling.
// Was an orange solid-mesh fire (icosahedron, cones, a torus ground ring) plus a pale cyan flash disc. Now two pooled soft point
// batches (additive fire + alpha smoke, 2 draws, was 4 + the flash), procedural noise for the lobes, no hard edges anywhere.
// A few sparks carry a faint tint of the hero who landed the KO (enemy.koCol). It observes the existing down transition only.
const DEATH_FX_SLOTS = 6, KO_PUFFS = 14, KO_SPARKS = 26, KO_SMOKE = 10, DEATH_FX_LIFE = 2.0;
const KO_FIRE_PTS = 1 + KO_PUFFS + KO_SPARKS * 3;
type DeathFxSlot = { x: number; y: number; z: number; born: number; active: boolean; col: number; seed: number };
const KO_VS = /* glsl */`attribute float aSize; attribute vec4 aCol; attribute float aSeed; uniform float uScale; varying vec4 vCol; varying float vSeed;
void main() { vCol = aCol; vSeed = aSeed; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize > 0.0 ? min(aSize * projectionMatrix[1][1] * 0.5 * uScale / max(0.1, -mv.z), 640.0) : 0.0; }`;   // uScale = the target viewport height in px
const KO_FS = /* glsl */`uniform float uT; varying vec4 vCol; varying float vSeed;
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + 1.0), f.x), f.y); }
void main() { vec2 q = gl_PointCoord * 2.0 - 1.0; float r = length(q); if (r >= 1.0) discard;
  float a, k = 1.0;
  if (vSeed < 0.0) { a = exp(-r * r * 3.6) * (1.0 - r * r); }                       // spark / flash: plain soft glow
  else { vec2 o = vec2(vSeed * 3.1, vSeed * 1.7) + uT * 0.35; float n = vn(q * 2.3 + o) * 0.62 + vn(q * 5.1 - o * 1.3) * 0.38;
    a = 1.0 - smoothstep(0.2 + 0.5 * n, 0.98, r); a *= a; k = mix(0.3, 1.4, n * n * (3.0 - 2.0 * n)); }   // lumpy billow: noisy soft edge, bright lobes, darker creases
#ifdef SMOKE
  gl_FragColor = vec4(vCol.rgb * mix(0.75, 1.2, k - 0.25), vCol.a * a * k);
#else
  gl_FragColor = vec4(vCol.rgb * vCol.a * a * k, 1.0);
#endif
}`;
const hash1 = (n: number) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };
// fire colour by temperature (0 cold .. 1+ white hot), linear HDR
const fireRamp = (c: THREE.Color, T: number) => {
    if (T > 0.8) return c.setRGB(1, 0.8 + 0.12 * Math.min(1, (T - 0.8) * 3), 0.4 + 0.3 * Math.min(1, (T - 0.8) * 3)).multiplyScalar(1.3 + 0.6 * (T - 0.8));
    if (T > 0.5) { const u = (T - 0.5) / 0.3; return c.setRGB(1, 0.4 + 0.4 * u, 0.06 + 0.34 * u).multiplyScalar(0.9 + 0.4 * u); }
    if (T > 0.22) { const u = (T - 0.22) / 0.28; return c.setRGB(0.55 + 0.45 * u, 0.1 + 0.32 * u, 0.02 + 0.06 * u).multiplyScalar(0.5 + 0.3 * u); }
    const u = Math.max(0, T) / 0.22; return c.setRGB(0.55 * u, 0.1 * u, 0.02 * u).multiplyScalar(0.5 * u);
};
function koGeo(n: number) { const g = new THREE.BufferGeometry();
    for (const [k, w] of [['position', 3], ['aCol', 4], ['aSize', 1], ['aSeed', 1]] as const) g.setAttribute(k, new THREE.BufferAttribute(new Float32Array(n * w), w).setUsage(THREE.DynamicDrawUsage));
    return g; }
export function EnemyDeathFx({ sim }: { sim: Sim }) {
    const slots = useRef<DeathFxSlot[]>(Array.from({ length: DEATH_FX_SLOTS }, () => ({ x: 0, y: 0, z: 0, born: -10, active: false, col: SHOCK_SHADOW, seed: 0 })));
    const seenDown = useRef(new WeakMap<object, boolean>()), cursor = useRef(0), triggered = useRef(0);
    const fire = useRef<THREE.Points>(null!), smoke = useRef<THREE.Points>(null!);
    const assets = useMemo(() => {
        const u = { uScale: { value: 400 }, uT: { value: 0 } };
        const fireMat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: KO_VS, fragmentShader: KO_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
        const smokeMat = new THREE.ShaderMaterial({ uniforms: u, defines: { SMOKE: 1 }, vertexShader: KO_VS, fragmentShader: KO_FS, transparent: true, depthWrite: false, toneMapped: false });
        return { u, fireGeo: koGeo(DEATH_FX_SLOTS * KO_FIRE_PTS), smokeGeo: koGeo(DEATH_FX_SLOTS * KO_SMOKE), fireMat, smokeMat };
    }, []);
    const vp = useMemo(() => new THREE.Vector4(), []), hero = useMemo(() => new THREE.Color(), []), c = useMemo(() => new THREE.Color(), []);
    useFrame(() => {
        for (const e of sim.enemies) {
            const down = e.down > 0, wasDown = seenDown.current.get(e) || false;
            if (down && !wasDown) {
                const slot = slots.current[cursor.current++ % DEATH_FX_SLOTS], lift = (e as any).ly || 0;
                slot.x = e.x; slot.y = e.y + lift + enemyBodyOffset(e); slot.z = e.z; slot.born = sim.t; slot.active = true; slot.col = ((e as any).koCol ?? (sim as any).fxCol ?? SHOCK_SHADOW) as number; slot.seed = (triggered.current++ % 97) * 131.7;
            }
            seenDown.current.set(e, down);
        }
        /* Shifat 9:43 AM 'freeze what's not visible': with no burst playing, both batches are hidden and not re-filled */
        const F = fire.current, S = smoke.current; if (!F || !S) return;
        const anyOn = slots.current.some((s) => s.active && sim.t - s.born >= 0 && sim.t - s.born < DEATH_FX_LIFE + 0.1);
        F.visible = S.visible = anyOn;
        if (!anyOn) { for (const s of slots.current) s.active = false; if (DBG) F.userData.activeEffects = 0; return; }
        assets.u.uT.value = sim.t;
        const fg = assets.fireGeo.attributes, sg = assets.smokeGeo.attributes;
        const put = (A: typeof fg, k: number, x: number, y: number, z: number, size: number, col: THREE.Color, b: number, seed: number) => {
            (A.position as THREE.BufferAttribute).setXYZ(k, x, y, z); (A.aCol as THREE.BufferAttribute).setXYZW(k, col.r, col.g, col.b, b); (A.aSize as THREE.BufferAttribute).setX(k, b > 0.003 && size > 0.002 ? size : 0); (A.aSeed as THREE.BufferAttribute).setX(k, seed); };
        const off = (A: typeof fg, k: number) => (A.aSize as THREE.BufferAttribute).setX(k, 0);
        let active = 0;
        for (let i = 0; i < DEATH_FX_SLOTS; i++) {
            const s = slots.current[i], age = sim.t - s.born, on = s.active && age >= 0 && age < DEATH_FX_LIFE, f0 = i * KO_FIRE_PTS, s0 = i * KO_SMOKE;
            if (s.active && !on) s.active = false;
            if (!on) { for (let j = 0; j < KO_FIRE_PTS; j++) off(fg, f0 + j); for (let j = 0; j < KO_SMOKE; j++) off(sg, s0 + j); continue; }
            active++;
            // 1. the first-frames flash: white-yellow, big, gone in ~0.1 s
            put(fg, f0, s.x, s.y, s.z, 3.0, c.setRGB(1, 0.85, 0.55), 0.9 * Math.exp(-age * 30), -1);
            // 2. fireball: lumpy puffs on a fast-then-slow growing shell, rising, cooling white -> yellow -> orange -> deep red
            const grow = 1 - Math.exp(-age * 6.5), rise = 0.35 * age + 0.55 * age * age;
            for (let j = 0; j < KO_PUFFS; j++) { const r = s.seed + j * 7.31, az = hash1(r) * 6.283, cz = hash1(r + 1.1) * 1.6 - 0.6, sz = Math.sqrt(Math.max(0, 1 - cz * cz)), rad = (0.25 + 0.75 * hash1(r + 2.3)) * grow * 1.3;
                const T = 0.98 - age * (0.85 + 0.6 * hash1(r + 3.7)) - rad * 0.35, b = T > 0 ? 0.8 * Math.min(1, age * 30) : 0;
                put(fg, f0 + 1 + j, s.x + Math.cos(az) * sz * rad, s.y + cz * rad * 0.8 + rise, s.z + Math.sin(az) * sz * rad, (0.8 + 0.6 * hash1(r + 4.9)) * (0.45 + 1.0 * grow), fireRamp(c, T), b, hash1(r + 6.1) * 10); }
            // 3. sparks with short glowing streaks (head + 2 trail samples), air drag + gravity, a few in the KO hero's tint
            hero.setHex(tint(s.col, 0.45)).multiplyScalar(2.2);
            const K = 3.2, G = 9;
            for (let j = 0; j < KO_SPARKS; j++) { const r = s.seed + 101 + j * 3.71, az = hash1(r) * 6.283, cz = hash1(r + 1.3) * 1.25 - 0.3, sz = Math.sqrt(Math.max(0, 1 - cz * cz)), sp = 5 + hash1(r + 2.7) * 9, life = 0.4 + hash1(r + 4.1) * 0.55, tinted = j % 7 === 3;
                for (let m = 0; m < 3; m++) { const k = f0 + 1 + KO_PUFFS + j * 3 + m, ta = age - m * 0.02, u = ta / life;
                    if (ta <= 0 || u >= 1) { off(fg, k); continue; }
                    const eK = Math.exp(-K * ta), dd = (1 - eK) / K, gy = G * (ta / K - dd / K), fd = 1 - u;
                    if (tinted) c.copy(hero); else fireRamp(c, 1.1 - u * 0.75);
                    put(fg, k, s.x + Math.cos(az) * sz * sp * dd, s.y + (cz * sp + 1.5) * dd - gy, s.z + Math.sin(az) * sz * sp * dd, (0.13 + 0.06 * hash1(r + 5.9)) * (1 - m * 0.18) * (0.5 + 0.5 * fd), c, fd * fd * (1 - m * 0.33), -1); } }
            // 4. smoke: dark, alpha-blended, rolls up out of the fireball as it cools, lit warm from below while young
            for (let j = 0; j < KO_SMOKE; j++) { const r = s.seed + 401 + j * 5.31, ta = age - 0.14 - 0.035 * j, az = hash1(r) * 6.283, rr = 0.25 + 0.6 * hash1(r + 1.7);
                if (ta <= 0) { off(sg, s0 + j); continue; }
                const lit = Math.max(0, 1 - ta * 2.2), al = 0.34 * Math.min(1, ta * 6) * Math.max(0, 1 - ta / (DEATH_FX_LIFE - 0.3));
                c.setRGB(0.1 + 0.3 * lit, 0.095 + 0.1 * lit, 0.09 + 0.03 * lit);
                put(sg, s0 + j, s.x + Math.cos(az) * rr * (1 + ta * 0.6), s.y + 0.35 + 1.1 * ta + 0.35 * ta * ta + hash1(r + 2.2) * 0.4, s.z + Math.sin(az) * rr * (1 + ta * 0.6), 0.9 + 1.4 * ta + 0.4 * hash1(r + 3.1), c, al, hash1(r + 4.4) * 10); }
        }
        for (const A of [fg, sg]) for (const k of ['position', 'aCol', 'aSize', 'aSeed'] as const) (A[k] as THREE.BufferAttribute).needsUpdate = true;
        if (DBG) { F.userData.activeEffects = active; F.userData.triggeredTotal = triggered.current; }
    });
    const setVp = (r: THREE.WebGLRenderer) => { r.getCurrentViewport(vp); assets.u.uScale.value = vp.w; };   // point sizes in world metres, whatever target (world DPR / bloom pass) is drawing
    return <>
        <points ref={smoke} name="enemy-death-smoke" args={[assets.smokeGeo, assets.smokeMat]} visible={false} frustumCulled={false} renderOrder={1} onBeforeRender={setVp} />
        <points ref={fire} name="enemy-death-core" args={[assets.fireGeo, assets.fireMat]} visible={false} frustumCulled={false} renderOrder={2} onBeforeRender={setVp} onUpdate={(o: THREE.Object3D) => o.layers.enable(SELECTIVE_BLOOM_LAYER)} />
    </>;
}

// env-iter3 F: Iron Man-style enemy fire, render side. One instanced additive "glow" mesh carries every bolt core, bolt streak,
// palm-charge glow and boss chest-charge glow (2 draw calls total with the beam), fresnel-faded so each reads as a soft light.
// No real lights on any tier; tagged for the existing selective bloom.
const ES_GLOW_N = ESHOT.MAX * 2 + 64, ES_BEAM_N = 4;
const _Z1 = new THREE.Vector3(0, 0, 1);
export function EnemyShotsFx({ sim }: { sim: Sim }) {
    const glow = useRef<THREE.InstancedMesh>(null!), beam = useRef<THREE.InstancedMesh>(null!);
    const mat = useMemo(() => new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 } }, vertexShader: GLOW_VS, fragmentShader: GLOW_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), []);
    const sGeo = useMemo(() => new THREE.SphereGeometry(1, 10, 8), []);
    const cGeo = useMemo(() => { const g = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true); g.translate(0, 0.5, 0); return g; }, []);
    const st = useMemo(() => ({ o: new THREE.Object3D(), c: new THREE.Color(), d: new THREE.Vector3(), q: new THREE.Quaternion(), Y: new THREE.Vector3(0, 1, 0) }), []);
    useEffect(() => { for (const m of [glow.current, beam.current]) { m.layers.enable(SELECTIVE_BLOOM_LAYER); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.setColorAt(0, st.c.set(0, 0, 0)); m.count = 0; } }, []);
    useFrame(() => {
        const { o, c, d, q, Y } = st, g = glow.current, bm = beam.current; mat.uniforms.uT.value = sim.t; let n = 0, nb = 0;
        const put = (x: number, y: number, z: number, sx: number, sy: number, sz: number, r: number, gg: number, b: number) => { if (n >= ES_GLOW_N) return; o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.updateMatrix(); g.setMatrixAt(n, o.matrix); g.setColorAt(n++, c.setRGB(r, gg, b)); };
        for (const b of sim.eshots || []) {
            if (b.dead > 0) { const k = 1 - b.dead / 0.25; o.quaternion.identity(); put(b.x, b.y, b.z, 0.5 + (1 - k) * 0.9, 0.5 + (1 - k) * 0.9, 0.5 + (1 - k) * 0.9, 0.9 * k, 0.95 * k, 1.0 * k); continue; }   // pop flash
            const sp = Math.hypot(b.vx, b.vy, b.vz) || 1; d.set(b.vx / sp, b.vy / sp, b.vz / sp);
            o.quaternion.identity(); put(b.x, b.y, b.z, b.boss ? 0.4 : 0.32, b.boss ? 0.4 : 0.32, b.boss ? 0.4 : 0.32, 1.0, 1.0, 1.0);   // white-hot core
            const L = Math.min(2.4, 0.25 + b.t * 16) * (b.boss ? 1.3 : 1);   // streak grows out of the palm, then a fixed light trail
            q.setFromUnitVectors(_Z1, d); o.quaternion.copy(q);
            put(b.x - d.x * L * 0.5, b.y - d.y * L * 0.5, b.z - d.z * L * 0.5, 0.21, 0.21, L * 0.5, 0.35, 0.75, 1.0);
        }
        o.quaternion.identity();
        for (const e of sim.enemies) {
            if (e.down > 0) continue; const ea = e as any;
            if (ea.rpT > 0) {   // telegraph: the raised palm glows up over the charge
                const k = 1 - Math.min(1, ea.rpT / ESHOT.CHARGE), pal = enemyPalm(e), s0 = (e.boss ? 0.55 : 0.22) * (0.5 + k) * (1 + 0.15 * Math.sin(sim.t * 40));
                put(pal[0], pal[1], pal[2], s0, s0, s0, 0.9, 0.97, 1.0);
                put(pal[0], pal[1], pal[2], s0 * 2.4, s0 * 2.4, s0 * 2.4, 0.12 * k, 0.32 * k, 0.5 * k);
            }
            const u: Unibeam | undefined = ea.uni;
            if (u) {
                const k = u.phase === 'charge' ? Math.min(1, u.t / ESHOT.UNI_CHARGE) : 1, s0 = (0.5 + 1.1 * k) * (1 + 0.1 * Math.sin(sim.t * 33));
                put(u.ox, u.oy, u.oz, s0, s0, s0, 0.9, 0.97, 1.0); put(u.ox, u.oy, u.oz, s0 * 2.2, s0 * 2.2, s0 * 2.2, 0.15 * k, 0.35 * k, 0.6 * k);   // chest arc reactor charging
                if (u.phase === 'fire' && nb < ES_BEAM_N - 1) {
                    d.set(Math.sin(u.yaw) * Math.cos(u.pitch), Math.sin(u.pitch), Math.cos(u.yaw) * Math.cos(u.pitch)); q.setFromUnitVectors(Y, d);
                    const fade = Math.min(1, u.t / 0.12) * Math.min(1, (ESHOT.UNI_FIRE - u.t) / 0.2), w = 1 + 0.12 * Math.sin(sim.t * 60);
                    o.quaternion.copy(q); o.position.set(u.ox, u.oy, u.oz);
                    o.scale.set(ESHOT.UNI_R * 0.9 * w, ESHOT.UNI_LEN, ESHOT.UNI_R * 0.9 * w); o.updateMatrix(); bm.setMatrixAt(nb, o.matrix); bm.setColorAt(nb++, c.setRGB(0.25 * fade, 0.6 * fade, 1.0 * fade));
                    o.scale.set(ESHOT.UNI_R * 0.38, ESHOT.UNI_LEN, ESHOT.UNI_R * 0.38); o.updateMatrix(); bm.setMatrixAt(nb, o.matrix); bm.setColorAt(nb++, c.setRGB(0.95 * fade, 0.98 * fade, 1.0 * fade));
                    o.quaternion.identity();
                }
            }
        }
        g.count = n; bm.count = nb;
        g.instanceMatrix.needsUpdate = true; bm.instanceMatrix.needsUpdate = true; if (g.instanceColor) g.instanceColor.needsUpdate = true; if (bm.instanceColor) bm.instanceColor.needsUpdate = true;
        if (DBG) (window as any).__eshots = { bolts: (sim.eshots || []).length, glows: n, beams: nb };
    });
    return <group>
        <instancedMesh ref={glow} args={[sGeo, mat, ES_GLOW_N]} frustumCulled={false} renderOrder={5} />
        <instancedMesh ref={beam} args={[cGeo, mat, ES_BEAM_N]} frustumCulled={false} renderOrder={5} />
    </group>;
}

