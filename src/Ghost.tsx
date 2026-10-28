import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import heroData from './hero.json';
import baseTexUrl from './basetex';
import { buildings, stepSim, setCompanionSim, type Events, type Input, type Sim } from './sim';
import { buildRig, CLIPS, combatPose, sampleClip, type CombatPoseState } from './Scene';

const DBG = !!(import.meta as any).env.VITE_DBG;
const HERO_SCALE = 1.5;
const BODY_OFF = [0.8, 0.3, 1.05, 1.7];
const enemyBodyOffset = (e: Sim['enemies'][number]) => e.boss ? 7.5 : BODY_OFF[e.kind ?? 0];
const SILENT: Events = {
    orb: () => {}, fall: () => {}, attach: () => {}, release: () => {}, jump: () => {},
    hit: () => {}, hurt: () => {}, ko: () => {}, land: () => {}, blast: () => {},
};
const _target = new THREE.Vector3();
const _handL = new THREE.Vector3();
const _handR = new THREE.Vector3();

function feminineHeroData() {
    const d = JSON.parse(JSON.stringify(heroData)) as any;
    const p: number[] = d.pos;
    const gauss = (y: number, center: number, width: number) => Math.exp(-(((y - center) / width) ** 2));
    for (let i = 0; i < p.length; i += 3) {
        const x = p[i], y = p[i + 1], z = p[i + 2];
        // A small, smooth torso-only shape change: fuller hips, a defined waist,
        // and narrower shoulders. The mesh, suit panels and bone hierarchy stay Shadow's.
        const torsoWeight = Math.max(0, 1 - Math.abs(x) / 0.34);
        const hip = 1 + 0.13 * gauss(y, 0.92, 0.15);
        const waist = 1 - 0.20 * gauss(y, 1.18, 0.15);
        const chest = 1 - 0.07 * gauss(y, 1.52, 0.16);
        const factor = 1 + ((y < 1.06 ? hip : y < 1.36 ? waist : chest) - 1) * torsoWeight;
        p[i] = x * factor;
        if (Math.abs(x) < 0.27 && z > 0) p[i + 2] += 0.025 * torsoWeight * gauss(y, 1.38, 0.17);
    }
    d.rebuildNormals = true;
    return d;
}

function recoloredSuitMaterial() {
    let mat!: THREE.MeshLambertMaterial;
    const tex = new THREE.TextureLoader().load(baseTexUrl, (source) => {
        const image = source.image as HTMLImageElement;
        const canvas = document.createElement('canvas');
        canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(image, 0, 0);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = pixels.data;
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const lum = r * 0.2126 + g * 0.7152 + b * 0.0722;
            const goldTrim = r > g * 1.10 && g > b * 1.06 && r > 55;
            const purpleLens = b > g * 1.55 && r > g * 1.18 && b > r * 1.12 && b > 72;
            if (purpleLens) {
                // Keep the lens texture's shading, but shift its purple hue to hot pink.
                const shade = 0.82 + 0.18 * (lum / 255);
                data[i] = 255 * shade; data[i + 1] = 26 * shade; data[i + 2] = 150 * shade;
            } else if (lum < 142 && !goldTrim) {
                // Lift Shadow's dark suit panels to white while preserving the original
                // grayscale weave, creases and gold trim rather than adding new armor.
                const shade = 0.80 + 0.20 * (lum / 142);
                data[i] = 250 * shade; data[i + 1] = 252 * shade; data[i + 2] = 255 * shade;
            }
        }
        ctx.putImageData(pixels, 0, 0);
        const painted = new THREE.CanvasTexture(canvas);
        painted.flipY = false; painted.colorSpace = THREE.SRGBColorSpace; painted.anisotropy = 2;
        mat.map = painted; mat.emissiveMap = painted; mat.needsUpdate = true;
        source.dispose();
    });
    tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 2;
    mat = new THREE.MeshLambertMaterial({ map: tex, emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: 0.45 });
    return mat;
}

function makeGhostRig() {
    const suit = recoloredSuitMaterial();
    const rig = buildRig(feminineHeroData(), suit);
    rig.root.name = 'ghost-human-companion';
    rig.root.scale.setScalar(HERO_SCALE);
    rig.root.visible = false;
    return { ...rig, suit };
}

function floorAt(x: number, z: number) {
    let y = 0;
    for (const b of buildings) if (x > b.x0 + 0.25 && x < b.x1 - 0.25 && z > b.z0 + 0.25 && z < b.z1 - 0.25 && b.h > y) y = b.h;
    return y;
}

function makeControls(): Input {
    return { attackQ: false, dodgeQ: false, mx: 0, my: 0, swing: false, keys: {}, jumpQ: false, swingQ: false, grabQ: false, shotQ: false, meleeQ: false, specialQ: false, jumpHeld: false, jumpReleased: false, jumpCancelled: false, glide: false };
}

function makeActor(leader: Sim, at: [number, number, number]): Sim {
    const actor = { ...leader, pos: [...at] as [number, number, number], vel: [0, 0, 0] as [number, number, number],
        enemies: leader.enemies, orbs: [], plasma: [], blasts: [], anchor: [0, 0, 0] as [number, number, number],
        safe: [...at] as [number, number, number], mode: 'play' as const, ground: true, web: false,
        anchorReal: false, spring: 0, shotT: 0, shotTgt: [0, 0, 0] as [number, number, number], shotE: null,
        glideOn: false, swim: false, dive: false, wall: null, wallB: -1, wallT: 0, vaulted: 0,
        hp: 100, hurtT: 0, atkT: 0, dodgeT: 0, combo: 0, comboT: 0, kos: 0, score: 0,
        land: 0, landHard: 0, lastHit: -9, swings: 0, maxSpeed: 0, runPhase: 0, lastDrag: -10,
        aimE: null, atkPend: 0, webT: 0, rope: 20, airT: 0, grappleFlight: false, webDepartB: undefined,
        yaw: leader.ang, pitch: leader.pitch, ang: leader.ang, t: leader.t, time: leader.time } as Sim;
    for (const key of ['mv', 'mvQ', 'flip', 'chain', 'chainT', 'snareT', 'snareCd', 'snareList', 'cWeb', 'windT', 'hitStop']) delete (actor as any)[key];
    (actor as any).snareCd = 0;
    return actor;
}

function resetControls(c: Input) {
    c.attackQ = c.dodgeQ = c.jumpQ = c.swingQ = false;
    c.grabQ = c.shotQ = c.meleeQ = c.specialQ = false;
    c.jumpHeld = c.jumpReleased = c.jumpCancelled = false;
    c.mx = c.my = 0; c.swing = false; c.glide = false;
    for (const key of Object.keys(c.keys)) delete c.keys[key];
}

function selectTarget(actor: Sim) {
    let best: Sim['enemies'][number] | null = null, bestD = 24, count = 0;
    for (const e of actor.enemies) {
        if (e.down > 0) continue;
        const d = Math.hypot(e.x - actor.pos[0], e.z - actor.pos[2]);
        const dy = Math.abs(e.y + ((e as any).ly || 0) + enemyBodyOffset(e) - actor.pos[1]);
        if (d < 25 && dy < 16) count++;
        if (d < bestD && dy < 16) { best = e; bestD = d; }
    }
    return { enemy: best, distance: best ? bestD : Infinity, count };
}

function animateHuman(actor: Sim, rig: ReturnType<typeof buildRig>, dt: number, state: any) {
    const root = rig.root, bones = rig.bones;
    root.position.set(actor.pos[0], actor.pos[1] - 1, actor.pos[2]);
    root.rotation.set(0, actor.ang, 0);
    root.scale.setScalar(HERO_SCALE);
    bones.forEach((b) => b.rotation.set(0, 0, 0));
    const speed = Math.hypot(actor.vel[0], actor.vel[2]);
    const sa = actor as any;
    const clipKey = sa.mv || sa.flip || sa.snareT > 0 || (actor.glideOn && (sa.gB ?? 0) > 0.3) ? '' : actor.swim ? 'swim' : actor.wall ? 'wall' : actor.atkT > 0 && actor.shotT <= 0 ? 'punch' : (!actor.ground && !actor.web) ? 'jump' : (actor.ground && speed < 0.6 && !actor.dive) ? 'idle' : (actor.ground && !actor.web) ? 'run' : '';
    if (state.anim.key !== clipKey) { state.anim.key = clipKey; state.anim.t = 0; }
    const clip = clipKey ? CLIPS[clipKey] : null;
    if (clip) {
        if (clipKey === 'wall') state.anim.t += dt * Math.min(1.6, speed / 3);
        else if (clipKey === 'swim') state.anim.t += dt * (0.6 + Math.min(1.2, speed / 8));
        else if (clipKey === 'punch') state.anim.t = 0.10 + (0.32 - actor.atkT) * 2;
        else if (clipKey === 'jump') state.anim.t = (clip.n / clip.fps) * 0.5;
        else if (clipKey === 'run') state.anim.t += dt * Math.max(0.5, Math.min(2, speed / 5.5));
        else state.anim.t += dt;
        state.anim.w += ((clipKey === 'idle' ? 0.55 : 1) - state.anim.w) * Math.min(1, dt * 6);
        sampleClip(clip, state.anim.t, clipKey === 'wall' || clipKey === 'swim' || clipKey === 'idle' || clipKey === 'run', bones, state.anim.w);
        if ((clipKey === 'run' || clipKey === 'idle') && clip.hy) {
            const fi = Math.floor(((state.anim.t * clip.fps) % clip.n + clip.n) % clip.n);
            rig.b.hips.position.y = rig.hipsY + (clip.hy[fi] - 1) * (clipKey === 'idle' ? 0.3 : 0.6) * state.anim.w;
        }
    } else state.anim.w += (0 - state.anim.w) * Math.min(1, dt * 7);
    if (actor.glideOn && !sa.snareT) {
        rig.b.uarmR.rotation.x = rig.b.uarmL.rotation.x = -0.1;
        rig.b.uarmR.rotation.z = 1.3; rig.b.uarmL.rotation.z = -1.3;
        const gt = Math.sin(actor.t * 5) * 0.05;
        rig.b.thighR.rotation.x = 0.12 + gt; rig.b.thighL.rotation.x = 0.06 - gt;
    }
    combatPose(actor, rig, root, dt, state.pose as CombatPoseState);
    root.updateMatrixWorld(true);
    rig.skel.update();
}

export function GhostCompanion({ sim }: { sim: Sim }) {
    const model = useMemo(makeGhostRig, []);
    const actorRef = useRef<Sim | null>(null);
    const controls = useMemo(makeControls, []);
    const lineGeo = useMemo(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(72 * 3), 3)); return g; }, []);
    const plasmaGeo = useMemo(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 3), 3)); g.setDrawRange(0, 0); return g; }, []);
    const lineRef = useRef<THREE.LineSegments>(null!);
    const plasmaRef = useRef<THREE.Points>(null!);
    const state = useRef({ ready: false, floorY: 0, floorX: 1e9, floorZ: 1e9, floorT: -1, attackAt: 0, shotAt: 0, jumpAt: 0, swingAt: 0, specialAt: 0, dodgeAt: 0,
        anim: { key: '', t: 0, w: 0 }, pose: { w: 0, c: new Float32Array(36), t: new Float32Array(36) } });

    useFrame((_, rawDt) => {
        const dt = Math.min(0.05, rawDt), st = state.current, root = model.root;
        if (sim.mode !== 'play') {
            root.visible = false; st.ready = false; actorRef.current = null; setCompanionSim(null);
            st.attackAt = st.shotAt = st.jumpAt = st.swingAt = st.specialAt = st.dodgeAt = 0;
            st.anim.key = ''; st.anim.t = 0; st.anim.w = 0; st.pose.w = 0; st.pose.c.fill(0); st.pose.t.fill(0);
            if (lineRef.current) lineRef.current.visible = false;
            if (plasmaRef.current) plasmaRef.current.visible = false;
            if (DBG) (window as any).__ghostState = { visible: false, mode: sim.mode };
            return;
        }
        const fx = Math.sin(sim.ang), fz = Math.cos(sim.ang), rx = -fz, rz = fx;
        const tx = sim.pos[0] - fx * 1.45 + rx * 2.6;
        const tz = sim.pos[2] - fz * 1.45 + rz * 2.6;
        const airborneLeader = !sim.ground && !sim.wall && !sim.swim;
        let ty: number;
        if (sim.ground && !sim.web && !sim.wall && !sim.swim) {
            if (sim.t - st.floorT > 0.3 || Math.hypot(tx - st.floorX, tz - st.floorZ) > 2) {
                st.floorY = floorAt(tx, tz); st.floorX = tx; st.floorZ = tz; st.floorT = sim.t;
            }
            ty = st.floorY + 1;
        } else ty = sim.swim ? sim.pos[1] : sim.pos[1] - (airborneLeader ? 0.25 : 0);

        _target.set(tx, ty, tz);
        if (!actorRef.current) actorRef.current = makeActor(sim, [tx, ty, tz]);
        const actor = actorRef.current;
        actor.mode = 'play'; actor.t = sim.t; actor.time = sim.time; actor.enemies = sim.enemies;
        actor.safe[0] = tx; actor.safe[1] = ty; actor.safe[2] = tz;
        setCompanionSim(actor);
        resetControls(controls);
        const toLeader = Math.hypot(actor.pos[0] - sim.pos[0], actor.pos[1] - sim.pos[1], actor.pos[2] - sim.pos[2]);
        if (!st.ready || toLeader > 42) {
            actor.pos[0] = tx; actor.pos[1] = ty; actor.pos[2] = tz;
            actor.vel[0] = actor.vel[1] = actor.vel[2] = 0;
            actor.web = false; actor.wall = null; actor.ground = true; actor.swim = false;
            actor.ang = sim.ang; actor.yaw = sim.ang; st.ready = true;
        }

        const choice = selectTarget(actor), enemy = choice.enemy;
        const enemyD = choice.distance;
        const fighting = !!enemy && enemyD < 23;
        const gx = fighting && enemy ? enemy.x : tx, gz = fighting && enemy ? enemy.z : tz;
        const gy = fighting && enemy ? enemy.y + ((enemy as any).ly || 0) + enemyBodyOffset(enemy) : ty;
        const dx = gx - actor.pos[0], dz = gz - actor.pos[2], goalD = Math.hypot(dx, dz);
        const destYaw = Math.atan2(dx, dz);
        actor.yaw = destYaw;
        if (goalD > 2.4) { controls.my = 1; }
        if (fighting && enemyD < 3.5 && enemy && enemy.atk > 0.18 && actor.dodgeT <= 0 && sim.t >= st.dodgeAt) {
            controls.dodgeQ = true; controls.mx = (enemy.x - actor.pos[0]) >= 0 ? -0.65 : 0.65; controls.my = -0.7; st.dodgeAt = sim.t + 1.1;
        }
        const longRoute = Math.hypot(tx - actor.pos[0], tz - actor.pos[2]) > 12 || goalD > 15;
        if (longRoute && !actor.web && !actor.swim && sim.t >= st.swingAt) {
            if (!actor.ground && !actor.wall) { controls.swingQ = true; controls.swing = true; st.swingAt = sim.t + 1.2; }
            else if (goalD > 22) { controls.grabQ = true; st.swingAt = sim.t + 1.8; }
        }
        if (actor.web && goalD > 8 && longRoute) controls.swing = true;
        if (actor.web && (!longRoute || goalD < 7)) controls.swing = false;
        if (longRoute && actor.ground && !actor.swim && sim.t >= st.jumpAt) {
            controls.jumpQ = true; st.jumpAt = sim.t + 0.7;
        } else if (longRoute && actor.web && sim.t >= st.jumpAt) {
            controls.jumpQ = true; st.jumpAt = sim.t + 1.0;
        }
        if (actor.swim && sim.swim && actor.dive !== sim.dive && sim.t >= st.jumpAt) { controls.jumpQ = true; st.jumpAt = sim.t + 1.0; }

        if (fighting && enemy) {
            const lifted = ((enemy as any).ly || 0) > 1.1 || ((enemy as any).vy || 0) > 1.2;
            if (choice.count >= 2 && (actor as any).snareCd <= 0 && sim.t >= st.specialAt) {
                controls.specialQ = true; st.specialAt = sim.t + 9.2;
            }
            if (lifted && enemyD < 22 && sim.t >= st.attackAt) {
                controls.attackQ = true; controls.shotQ = true; st.attackAt = sim.t + 0.48;
            } else if (enemyD < 16 && sim.t >= st.attackAt) {
                controls.attackQ = true; controls.meleeQ = true; st.attackAt = sim.t + 0.48;
            } else if (enemyD < 34 && sim.t >= st.shotAt) {
                controls.attackQ = true; controls.shotQ = true; st.shotAt = sim.t + 1.6;
            }
        }

        for (let i = 0; i < 2; i++) stepSim(actor, dt / 2, SILENT, controls, { updateEnemies: false });
        animateHuman(actor, model, dt, st);
        root.visible = true;

        const pa = plasmaGeo.attributes.position as THREE.BufferAttribute;
        const bolts = actor.plasma.slice(0, 24);
        for (let i = 0; i < bolts.length; i++) pa.setXYZ(i, bolts[i].x, bolts[i].y, bolts[i].z);
        plasmaGeo.setDrawRange(0, bolts.length); pa.needsUpdate = true;
        if (plasmaRef.current) plasmaRef.current.visible = bolts.length > 0;

        const la = lineGeo.attributes.position as THREE.BufferAttribute; let n = 0;
        if (actor.web || actor.spring > 0 || (actor as any).snareT > 0) {
            model.root.updateMatrixWorld(true);
            model.b.handL.getWorldPosition(_handL); model.b.handR.getWorldPosition(_handR);
            if (actor.web || actor.spring > 0) {
                la.setXYZ(n * 2, _handL.x, _handL.y, _handL.z); la.setXYZ(n * 2 + 1, actor.anchor[0], actor.anchor[1], actor.anchor[2]); n++;
                la.setXYZ(n * 2, _handR.x, _handR.y, _handR.z); la.setXYZ(n * 2 + 1, actor.anchor[0], actor.anchor[1], actor.anchor[2]); n++;
            }
            const targets = ((actor as any).snareList || []) as Sim['enemies'];
            for (let i = 0; i < Math.min(5, targets.length); i++) {
                const e = targets[i]; if (e.down > 0) continue;
                la.setXYZ(n * 2, _handL.x, _handL.y, _handL.z); la.setXYZ(n * 2 + 1, e.x, e.y + enemyBodyOffset(e), e.z); n++;
                la.setXYZ(n * 2, _handR.x, _handR.y, _handR.z); la.setXYZ(n * 2 + 1, e.x, e.y + enemyBodyOffset(e), e.z); n++;
            }
        }
        lineGeo.setDrawRange(0, n * 2); la.needsUpdate = true;
        if (lineRef.current) lineRef.current.visible = n > 0;
        if (DBG) (window as any).__ghostState = {
            visible: true, mode: sim.mode, position: [...actor.pos], target: [tx, ty, tz], speed: Math.hypot(actor.vel[0], actor.vel[1], actor.vel[2]),
            leaderDistance: Math.hypot(actor.pos[0] - sim.pos[0], actor.pos[1] - sim.pos[1], actor.pos[2] - sim.pos[2]),
            enemyDistance: enemyD, targetId: enemy ? sim.enemies.indexOf(enemy) : -1,
            action: ((actor as any).mv || (actor as any).snareT > 0) ? 'combat' : actor.web ? 'swing' : actor.wall ? 'wall' : actor.swim ? 'swim' : 'follow',
            web: actor.web, combo: actor.combo, kos: actor.kos,
        };
        if (DBG) (window as any).__ghostSim = actor;
    });

    return <>
        <primitive object={model.root} dispose={null} />
        <lineSegments ref={lineRef} geometry={lineGeo} frustumCulled={false} dispose={null}>
            <lineBasicMaterial color="#d8f5ff" transparent opacity={0.92} depthTest={false} depthWrite={false} />
        </lineSegments>
        <points ref={plasmaRef} geometry={plasmaGeo} frustumCulled={false} dispose={null}>
            <pointsMaterial color="#c9f5ff" size={0.52} sizeAttenuation transparent opacity={0.95} depthWrite={false} />
        </points>
    </>;
}
