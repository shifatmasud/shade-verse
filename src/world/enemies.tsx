import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { enemyBodyOffset, world, type Sim } from '../sim';
import { EYE_RED, armorCompanion, armorDrone, armorRobot, robotGeo, robotMat } from '../robotgeo';
import { useMemo, useRef } from 'react';
import { shadowGeo, shadowMat } from '../shadowbot';
import { SELECTIVE_BLOOM_LAYER } from '../renderLayers';
import { BOSS_BODY_OFFSET } from '../bossConfig';

const DBG = !!(import.meta as any).env.VITE_DBG;   // test hooks only in instrumented builds

// Enemies: heavily armoured robots, every sensor visor red (Polyfork free models, modified). 0 armoured trooper, 1 armoured walker, 2 hover drone, 3 armoured service drone.
export const ENEMY_DEFS: any[] = [
    { model: 'robot', eye: EYE_RED, shell: [0.20, 0.21, 0.24], frame: [0.07, 0.07, 0.08], accent: [0.55, 0.07, 0.07], scale: 1.1, extras: armorRobot, dy: -0.85, spd: 5 },
    { model: 'companion', eye: EYE_RED, dark: [0.14, 0.14, 0.17], shell: [0.18, 0.18, 0.21], frame: [0.07, 0.07, 0.08], accent: [0.55, 0.07, 0.07], scale: 1.6, extras: armorCompanion, dy: -0.85, spd: 6 },
    { model: 'survey', eye: EYE_RED, shell: [0.20, 0.21, 0.24], frame: [0.07, 0.07, 0.08], accent: [0.55, 0.07, 0.07], scale: 1.7, extras: armorDrone, dy: 0.45, spd: 0 },
    { model: 'shadow', eye: EYE_RED, shell: [0.20, 0.21, 0.25], accent: [0.55, 0.07, 0.07], scale: 1.0, dy: 0, spd: 9 }];   // kind 3: Shadow-body heavy armoured robot (replaces the dome)
export function buildEnemy(kind: number, time: { value: number }) {
    const d = ENEMY_DEFS[kind]; if (d.model === 'shadow') return { geo: shadowGeo({ shell: d.shell, accent: d.accent, eye: d.eye, heavy: true }), mat: shadowMat(time, d.spd) };
    const r = robotGeo(d); r.geo.translate(0, d.dy, 0);
    return { geo: r.geo, mat: robotMat(r.parts, r.scale, time, d.spd) };
}



// Plasma web shot: bright core wrapped in spinning web-strand rings, a huge impact shockwave
// (flash bubble + expanding ring + radial debris), and a small lock reticle over the auto-target.
// Everything is pooled (3 bolts, 4 blasts, 12 sparks each): zero per-frame allocation, additive only, no lights.
const _pz = new THREE.Vector3(0, 0, 1), _pv = new THREE.Vector3();
export function PlasmaFx({ sim }: { sim: Sim }) {
    const { camera } = useThree();
    const proj = useRef<THREE.Group[]>([]);
    const blasts = useRef<{ g: THREE.Group; flash: THREE.Mesh; ring: THREE.Mesh; sparks: THREE.InstancedMesh; dir: Float32Array }[]>([]);
    const ret = useRef<THREE.Group>(null!);
    const o = useMemo(() => new THREE.Object3D(), []);
    useFrame(() => {
        for (let i = 0; i < 3; i++) {
            const g = proj.current[i]; if (!g) continue;
            const b = sim.plasma[i];
            g.visible = !!b;
            if (b) {
                g.position.set(b.x, b.y, b.z);
                _pv.set(b.vx, b.vy, b.vz).normalize();
                g.quaternion.setFromUnitVectors(_pz, _pv);
                (g.children[2] as THREE.Mesh).rotation.z = sim.t * 22;    // strand rings spin around the flight axis
                (g.children[3] as THREE.Mesh).rotation.z = -sim.t * 17;
                (g.children[4] as THREE.Mesh).rotation.z = sim.t * 27;
                const pu = 1 + Math.sin(sim.t * 31) * 0.12; g.children[0].scale.setScalar(pu);
            }
        }
        for (let i = 0; i < 6; i++) {
            const grp = blasts.current[i]; if (!grp) continue;
            const bl = sim.blasts[i], on = !!bl && bl.t < 0.85;
            grp.g.visible = !!on;
            if (on && bl) {
                const k = bl.t / 0.85;
                grp.g.position.set(bl.x, bl.y, bl.z);
                const fk = Math.min(1, bl.t / 0.2);
                grp.flash.scale.setScalar(0.5 + fk * bl.r * 0.55);
                (grp.flash.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.95 * (1 - bl.t / 0.28));
                grp.ring.quaternion.copy(camera.quaternion);
                grp.ring.scale.setScalar(0.6 + k * bl.r * 1.5);
                (grp.ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k) * (1 - k);
                for (let j = 0; j < 12; j++) {
                    const d = grp.dir, sp = (0.25 + k * bl.r * (0.75 + d[j * 4 + 3] * 0.5));
                    o.position.set(d[j * 4] * sp, d[j * 4 + 1] * sp + k * k * -3.5, d[j * 4 + 2] * sp);
                    o.scale.setScalar(Math.max(0.04, (1 - k) * 0.5));
                    o.rotation.set(sim.t * 9 + j, j * 1.7, 0); o.updateMatrix();
                    grp.sparks.setMatrixAt(j, o.matrix);
                }
                grp.sparks.instanceMatrix.needsUpdate = true;
            }
        }
        const e = sim.aimE;
        ret.current.visible = !!e && sim.mode === 'play';
        if (e) {
            ret.current.position.set(e.x, e.y + (e.boss ? BOSS_BODY_OFFSET : [0.8, 0.3, 1.05, 0.95][e.kind ?? 0]) + 1.05, e.z);
            ret.current.quaternion.copy(camera.quaternion);
            const s2 = 1 + Math.sin(sim.t * 6) * 0.09; ret.current.scale.setScalar(s2);
            ret.current.children[0].rotation.z = sim.t * 2.4;
        }
    });
    return <>
        {[0, 1, 2].map((i) => <group key={'p' + i} ref={(g) => { if (g) proj.current[i] = g; }} visible={false} frustumCulled={false}>
            <mesh frustumCulled={false}><sphereGeometry args={[0.3, 10, 8]} /><meshBasicMaterial color="#e8fdff" toneMapped={false} transparent opacity={0.5} blending={THREE.NoBlending} /></mesh>
            <mesh frustumCulled={false}><sphereGeometry args={[0.78, 10, 8]} /><meshBasicMaterial color="#5fd8ff" transparent opacity={0.38} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>
            {[0.42, 0.58, 0.5].map((r, j) => <mesh key={j} frustumCulled={false} position={[0, 0, (j - 1) * 0.55]}><torusGeometry args={[r, 0.035, 5, 14]} /><meshBasicMaterial color="#f4f8ff" transparent opacity={0.9} depthWrite={false} /></mesh>)}
        </group>)}
        {[0, 1, 2, 3, 4, 5].map((i) => <group key={'b' + i} ref={(g) => {
            if (g && !blasts.current[i]) {
                const flash = g.children[0] as THREE.Mesh, ring = g.children[1] as THREE.Mesh, sparks = g.children[2] as THREE.InstancedMesh;
                const dir = new Float32Array(12 * 4);
                for (let j = 0; j < 12; j++) { const a = (j / 12) * Math.PI * 2 + (j % 3) * 0.4, y = 0.15 + ((j * 7) % 5) * 0.16, l = Math.hypot(Math.cos(a), y, Math.sin(a)); dir[j * 4] = Math.cos(a) / l; dir[j * 4 + 1] = y / l; dir[j * 4 + 2] = Math.sin(a) / l; dir[j * 4 + 3] = ((j * 13) % 10) / 10; }
                blasts.current[i] = { g, flash, ring, sparks, dir };
            }
        }} visible={false}>
            <mesh frustumCulled={false}><sphereGeometry args={[1, 14, 10]} /><meshBasicMaterial color="#cfeeff" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>
            <mesh frustumCulled={false}><ringGeometry args={[0.82, 1, 40]} /><meshBasicMaterial color="#bfe9ff" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} /></mesh>
            <instancedMesh args={[undefined, undefined, 12]} frustumCulled={false}><coneGeometry args={[0.16, 0.6, 4]} /><meshBasicMaterial color="#ffd9a8" transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></instancedMesh>
        </group>)}
        <group ref={ret} visible={false} frustumCulled={false}>
            <mesh frustumCulled={false}><ringGeometry args={[0.5, 0.58, 4, 1]} /><meshBasicMaterial color="#8fe9ff" transparent opacity={0.85} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} /></mesh>
            <mesh frustumCulled={false}><circleGeometry args={[0.07, 8]} /><meshBasicMaterial color="#dffbff" transparent opacity={0.9} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} /></mesh>
        </group>
    </>;
}

// Enemy KO fire: a small, pooled world-space burst (hot core, tapered flame tongues,
// an expanding ground ring, and embers). It observes the existing down transition only.
const DEATH_FX_SLOTS = 6, DEATH_FX_FLAMES = 9, DEATH_FX_EMBERS = 12, DEATH_FX_LIFE = 1.05;
type DeathFxSlot = { x: number; y: number; z: number; born: number; active: boolean };
export function EnemyDeathFx({ sim }: { sim: Sim }) {
    const slots = useRef<DeathFxSlot[]>(Array.from({ length: DEATH_FX_SLOTS }, () => ({ x: 0, y: 0, z: 0, born: -10, active: false })));
    const seenDown = useRef(new WeakMap<object, boolean>()), cursor = useRef(0), triggered = useRef(0);
    const core = useRef<THREE.InstancedMesh>(null!), flames = useRef<THREE.InstancedMesh>(null!), embers = useRef<THREE.InstancedMesh>(null!), rings = useRef<THREE.InstancedMesh>(null!);
    const assets = useMemo(() => ({
        coreGeo: new THREE.IcosahedronGeometry(0.62, 1), flameGeo: new THREE.ConeGeometry(0.24, 1.15, 5, 1), emberGeo: new THREE.ConeGeometry(0.055, 0.34, 4, 1), ringGeo: new THREE.TorusGeometry(0.62, 0.055, 5, 24),
        coreMat: new THREE.MeshStandardMaterial({ color: '#ff8a16', emissive: '#ff3c00', emissiveIntensity: 2.4, roughness: 0.85, metalness: 0, toneMapped: false }),
        flameMat: new THREE.MeshStandardMaterial({ color: '#ff7412', emissive: '#ff3b00', emissiveIntensity: 2.2, roughness: 0.8, metalness: 0, toneMapped: false }),
        emberMat: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
        ringMat: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    }), []);
    const obj = useMemo(() => new THREE.Object3D(), []), up = useMemo(() => new THREE.Vector3(0, 1, 0), []), dir = useMemo(() => new THREE.Vector3(), []), col = useMemo(() => new THREE.Color(), []);
    useFrame(() => {
        for (const e of sim.enemies) {
            const down = e.down > 0, wasDown = seenDown.current.get(e) || false;
            if (down && !wasDown) {
                const slot = slots.current[cursor.current++ % DEATH_FX_SLOTS], lift = (e as any).ly || 0;
                slot.x = e.x; slot.y = e.y + lift + enemyBodyOffset(e); slot.z = e.z; slot.born = sim.t; slot.active = true; triggered.current++;
            }
            seenDown.current.set(e, down);
        }
        let active = 0;
        for (let i = 0; i < DEATH_FX_SLOTS; i++) {
            const s = slots.current[i], age = sim.t - s.born, on = s.active && age >= 0 && age < DEATH_FX_LIFE;
            if (s.active && !on) s.active = false; if (on) active++;
            const t = on ? age / DEATH_FX_LIFE : 1, fade = Math.max(0, 1 - t), swell = Math.sin(Math.min(1, t * 1.7) * Math.PI * 0.5);
            obj.position.set(s.x, s.y, s.z); obj.rotation.set(t * 1.4, sim.t * 2.2 + i, t * 0.8);
            const coreScale = on ? (0.28 + 1.05 * swell) * Math.pow(fade, 0.72) : 0;
            obj.scale.setScalar(coreScale); obj.updateMatrix(); core.current.setMatrixAt(i, obj.matrix); core.current.setColorAt(i, col.setHSL(0.075 + t * 0.035, 1, 0.54 + fade * 0.12));
            obj.position.set(s.x, s.y - 0.72, s.z); obj.rotation.set(-Math.PI / 2, 0, 0); obj.scale.setScalar(on ? 0.18 + t * 1.6 : 0); obj.updateMatrix(); rings.current.setMatrixAt(i, obj.matrix); rings.current.setColorAt(i, col.setRGB(fade, fade * 0.34, fade * 0.035));
            for (let j = 0; j < DEATH_FX_FLAMES; j++) {
                const idx = i * DEATH_FX_FLAMES + j, a = j * 2.39996 + i * 0.53, lift = 0.42 + ((j * 7) % 5) * 0.12;
                dir.set(Math.cos(a) * 0.72, lift, Math.sin(a) * 0.72).normalize();
                const wobble = on ? Math.sin(sim.t * 17 + j * 2.1 + i) * 0.07 : 0, spread = on ? 0.28 + 1.1 * t : 0;
                obj.position.set(s.x + dir.x * spread, s.y + dir.y * (0.18 + 0.62 * t) + wobble, s.z + dir.z * spread);
                obj.quaternion.setFromUnitVectors(up, dir); obj.rotation.y += sim.t * 0.35 + j;
                const flicker = 0.78 + 0.22 * Math.sin(sim.t * 24 + j * 3.7 + i), flameFade = on ? fade * flicker : 0;
                obj.scale.set(0.62 * flameFade, (1.25 + 0.25 * swell) * flameFade, 0.62 * flameFade); obj.updateMatrix(); flames.current.setMatrixAt(idx, obj.matrix);
                flames.current.setColorAt(idx, col.setHSL((j % 3 === 0 ? 0.13 : 0.075) + 0.025 * t, 1, 0.48 + 0.12 * fade));
            }
            for (let j = 0; j < DEATH_FX_EMBERS; j++) {
                const idx = i * DEATH_FX_EMBERS + j, a = j * 2.39996 + i * 0.31, elev = 0.25 + ((j * 7) % 9) * 0.075, speed = 1.5 + ((j * 5) % 7) * 0.27;
                const vx = Math.cos(a) * Math.cos(elev) * speed, vz = Math.sin(a) * Math.cos(elev) * speed, vy = (0.65 + Math.sin(elev)) * speed;
                obj.position.set(s.x + vx * age, s.y + vy * age - 1.2 * age * age, s.z + vz * age); dir.set(vx, vy - 2.4 * age, vz).normalize();
                obj.quaternion.setFromUnitVectors(up, dir); const emberFade = on ? fade * (0.82 + 0.18 * Math.sin(sim.t * 31 + j)) : 0;
                obj.scale.set(emberFade, emberFade, emberFade); obj.updateMatrix(); embers.current.setMatrixAt(idx, obj.matrix); embers.current.setColorAt(idx, col.setRGB(emberFade, emberFade * 0.58, emberFade * 0.16));
            }
        }
        for (const m of [core.current, flames.current, embers.current, rings.current]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
        if (DBG && core.current) { core.current.userData.activeEffects = active; core.current.userData.triggeredTotal = triggered.current; }
    });
    const bloom = (o: THREE.Object3D) => o.layers.enable(SELECTIVE_BLOOM_LAYER);
    return <>
        <instancedMesh ref={core} name="enemy-death-core" onUpdate={bloom} args={[assets.coreGeo, assets.coreMat, DEATH_FX_SLOTS]} frustumCulled={false} />
        <instancedMesh ref={flames} name="enemy-death-flames" onUpdate={bloom} args={[assets.flameGeo, assets.flameMat, DEATH_FX_SLOTS * DEATH_FX_FLAMES]} frustumCulled={false} />
        <instancedMesh ref={embers} name="enemy-death-embers" onUpdate={bloom} args={[assets.emberGeo, assets.emberMat, DEATH_FX_SLOTS * DEATH_FX_EMBERS]} frustumCulled={false} />
        <instancedMesh ref={rings} name="enemy-death-ring" onUpdate={bloom} args={[assets.ringGeo, assets.ringMat, DEATH_FX_SLOTS]} frustumCulled={false} />
    </>;
}
