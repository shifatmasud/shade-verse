/**
 * BAKE (build-time only, never shipped): the two heroes of the first screen, drawn in code (Shifat Nov 2 4:03 PM: "Generate
 * everything Illustration from code"; root Nov 2: nothing 3D loads before Play, so the heroes are baked to transparent webp). The REAL
 * in-game hero mesh, skeleton and costume texture (src/hero.json, src/basetex.ts, trim recolour src/heroTrim.ts), posed by hand,
 * with a comic finish: the game's inverted-hull ink outline (thicker) and a halftone cel pass in the material. Shadow (purple trim)
 * swings on a taut web; Ghost (white suit, pink trim, feminine build) fires her pink Shock.
 * Run: node tools/title/bake_heroes.mjs  (vite dev server + headless Chrome; writes src/title/art/*.webp + heroes.json).
 * Ghost's look mirrors Ghost.tsx feminineHeroData() + recoloredSuitMaterial() (that module pulls in the whole game); keep in sync.
 */
import * as THREE from 'three';
import heroData from '../../src/hero.json';
import baseTexUrl from '../../src/basetex';
import { paintTrim, SHADOW_TRIM, GHOST_TRIM } from '../../src/heroTrim';

export type Pose = Record<string, [number, number, number]>;   // bone -> euler degrees (XYZ), applied on the rest pose

const D2R = Math.PI / 180;

function feminine(d: any) {   // mirror of Ghost.tsx feminineHeroData()
    const p: number[] = d.pos;
    const gauss = (y: number, c: number, w: number) => Math.exp(-(((y - c) / w) ** 2));
    for (let i = 0; i < p.length; i += 3) {
        const x = p[i], y = p[i + 1];
        const tw = Math.max(0, 1 - Math.abs(x) / 0.34);
        const hip = 1 + 0.13 * gauss(y, 0.92, 0.15), waist = 1 - 0.20 * gauss(y, 1.18, 0.15), chest = 1 - 0.07 * gauss(y, 1.52, 0.16);
        p[i] = x * (1 + ((y < 1.06 ? hip : y < 1.36 ? waist : chest) - 1) * tw);
        if (Math.abs(x) < 0.27 && p[i + 2] > 0) p[i + 2] += 0.025 * tw * gauss(y, 1.38, 0.17);
    }
    d.rebuildNormals = true;
    return d;
}

/** the costume texture, repainted per hero on a canvas (Shadow: gold -> purple; Ghost: dark panels -> white, gold -> pink, lens -> pink) */
function suitTexture(ghost: boolean, done: () => void): Promise<THREE.Texture> {
    return new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => {
            const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
            const x = c.getContext('2d', { willReadFrequently: true })!; x.drawImage(img, 0, 0);
            const px = x.getImageData(0, 0, c.width, c.height), d = px.data;
            for (let i = 0; i < d.length; i += 4) {
                if (!ghost) { paintTrim(d, i, SHADOW_TRIM); continue; }
                const r = d[i], g = d[i + 1], b = d[i + 2], lum = r * 0.2126 + g * 0.7152 + b * 0.0722;
                const gold = r > g * 1.10 && g > b * 1.06 && r > 55;
                const lens = b > g * 1.55 && r > g * 1.18 && b > r * 1.12 && b > 72;
                if (gold && paintTrim(d, i, GHOST_TRIM)) { /* pink piping */ }
                else if (lens) { const s = 0.82 + 0.18 * (lum / 255); d[i] = 255 * s; d[i + 1] = 26 * s; d[i + 2] = 150 * s; }
                else if (lum < 142 && !gold) { const s = 0.80 + 0.20 * (lum / 142); d[i] = 250 * s; d[i + 1] = 252 * s; d[i + 2] = 255 * s; }
            }
            x.putImageData(px, 0, 0);
            const t = new THREE.CanvasTexture(c); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
            res(t); done();
        };
        img.onerror = rej; img.src = baseTexUrl;
    });
}

/** comic finish on the hero material: 3-band cel light, screen-space halftone dots in the shade, a touch of rim */
function comicMaterial(map: THREE.Texture, ghost: boolean) {
    const m = new THREE.MeshLambertMaterial({ map, emissive: new THREE.Color('#ffffff'), emissiveMap: map, emissiveIntensity: ghost ? 0.32 : 0.42 });
    m.onBeforeCompile = (sh) => {
        sh.uniforms.uDot = { value: 5.0 };
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uDot;')
            .replace('#include <dithering_fragment>', `#include <dithering_fragment>
            {
                vec3 c = gl_FragColor.rgb;
                float L = dot(c, vec3(0.299, 0.587, 0.114));
                float band = L < 0.22 ? 0.55 : (L < 0.5 ? 0.85 : 1.08);
                c *= band;
                vec2 p = mat2(0.7071, -0.7071, 0.7071, 0.7071) * (gl_FragCoord.xy / uDot);
                float d = length(fract(p) - 0.5);
                float r = clamp((0.58 - L) * 1.25, 0.0, 0.62);
                float ink = 1.0 - smoothstep(r - 0.07, r + 0.07, d);
                c = mix(c, c * 0.28 + vec3(0.02, 0.0, 0.05), ink * 0.8);
                gl_FragColor.rgb = c;
            }`);
    };
    return m;
}

function buildHero(ghost: boolean, mat: THREE.Material) {
    const d: any = JSON.parse(JSON.stringify(heroData)); if (ghost) feminine(d);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(d.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(d.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(d.sw, 4));
    g.setIndex(d.idx);
    if (d.rebuildNormals) g.computeVertexNormals();
    const bones: THREE.Bone[] = [], by: Record<string, THREE.Bone> = {};
    d.bones.forEach((b: any) => {
        const bone = new THREE.Bone(); bone.name = b.n; bones.push(bone); by[b.n] = bone;
        const par = b.p >= 0 ? d.bones[b.p].h : [0, 0, 0];
        bone.position.set(b.h[0] - par[0], b.h[1] - par[1], b.h[2] - par[2]);
        if (b.p >= 0) bones[b.p].add(bone);
    });
    const mesh = new THREE.SkinnedMesh(g, mat); mesh.frustumCulled = false;
    const root = new THREE.Group(); root.add(mesh); mesh.add(bones[0]); root.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));
    // ink: the game's inverted hull (Scene.tsx buildRig), pushed further out for a comic line weight
    const om = new THREE.MeshBasicMaterial({ color: '#05040a', side: THREE.BackSide });
    om.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', 'transformed += normalize(objectNormal) * 0.026;\n#include <project_vertex>'); };
    const ol = new THREE.SkinnedMesh(g, om); ol.frustumCulled = false; ol.bind(mesh.skeleton); root.add(ol);
    return { root, by, mesh, ol, g, om };
}

function applyPose(by: Record<string, THREE.Bone>, pose: Pose) {
    const e = new THREE.Euler();
    for (const k in by) by[k].quaternion.identity();
    for (const k in pose) { const b = by[k]; if (!b) continue; const [x, y, z] = pose[k]; e.set(x * D2R, y * D2R, z * D2R, 'XYZ'); b.quaternion.setFromEuler(e); }
}

export interface HeroSpec {
    id: string; ghost: boolean; pose: Pose; rot: [number, number, number]; pos: [number, number, number];
    box: [number, number, number, number];          // design px (1920x1080) the render covers; the trimmed cut-out is placed inside it
    cam: [number, number, number]; look: [number, number, number]; fov: number; dot?: number;
}

/** renders one hero into a transparent canvas covering spec.box at `scale` px per design px */
export async function bakeHero(s: HeroSpec, scale: number): Promise<HTMLCanvasElement> {
    const W = Math.round((s.box[2] - s.box[0]) * scale), H = Math.round((s.box[3] - s.box[1]) * scale);
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const gl = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
    gl.setPixelRatio(1); gl.setSize(W, H, false); gl.setClearColor(0x000000, 0); gl.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(s.ghost ? 0xbfd6ff : 0xffd2b0, s.ghost ? 0x1a0830 : 0x2a1040, 1.15));
    const key = new THREE.DirectionalLight(s.ghost ? 0xffd0ec : 0xffb27a, 1.5); key.position.set(s.ghost ? 2 : -3, 3, 3); scene.add(key);
    const rim = new THREE.DirectionalLight(s.ghost ? 0x66e0ff : 0xb070ff, 1.1); rim.position.set(s.ghost ? -3 : 3, 1.5, -2.5); scene.add(rim);
    const tex = await suitTexture(s.ghost, () => {});
    const mat = comicMaterial(tex, s.ghost); (mat as any).userData.dot = s.dot ?? 5 * scale;
    mat.onBeforeCompile = ((orig) => (sh: any, r: any) => { orig(sh, r); sh.uniforms.uDot.value = s.dot ?? 5 * scale; })(mat.onBeforeCompile);
    const h = buildHero(s.ghost, mat);
    h.root.position.set(...s.pos); h.root.rotation.set(s.rot[0] * D2R, s.rot[1] * D2R, s.rot[2] * D2R);
    applyPose(h.by, s.pose); scene.add(h.root); h.root.updateMatrixWorld(true);
    const hand = new THREE.Vector3(); h.by.handR.getWorldPosition(hand);
    if (!s.ghost) {   // a taut, straight web from the raised hand up out of the frame (white core, ink edge)
        const dir = new THREE.Vector3(0.7, 9, -0.4).normalize(), from = hand.clone().addScaledVector(dir, 0.06), top = hand.clone().addScaledVector(dir, 9);
        const mk = (r: number, color: number, over: boolean) => { const len = from.distanceTo(top); const geo = new THREE.CylinderGeometry(r, r, len, 10, 1, true); const me = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, depthTest: !over }));
            me.position.copy(from).lerp(top, 0.5); me.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); return me; };
        const ink = mk(0.04, 0x05040a, true), core = mk(0.019, 0xf4f1ff, true); ink.renderOrder = 2; core.renderOrder = 3; scene.add(ink, core);
    } else {      // the pink Shock in her palm: crackling inked bolts (the game's Shock colours), comic style
        // no soft orb or white disc at the palm (Shifat Nov 2 4:38 PM: "Soft orb looks bad in this illustration"): inked bolts only
        let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
        const glowM = new THREE.MeshBasicMaterial({ color: 0xff1a96, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false });
        const coreM = new THREE.MeshBasicMaterial({ color: 0xffd6ef, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false });
        // crackling bolts thrown forward out of the palm (along the arm, fanning), each a jagged tube: pink glow + white-pink core
        const fwd = hand.clone().sub(new THREE.Vector3().setFromMatrixPosition(h.by.farmR.matrixWorld)).normalize();
        const side = new THREE.Vector3(0, 1, 0).cross(fwd).normalize(), up = fwd.clone().cross(side).normalize();
        for (let k = 0; k < 9; k++) {
            const a = (k / 9) * Math.PI * 2, spread = 0.55 + (k % 3) * 0.18, len = 0.9 + (k % 4) * 0.35;
            const pts: THREE.Vector3[] = [];
            for (let j = 0; j <= 8; j++) { const f = j / 8; pts.push(hand.clone().addScaledVector(fwd, len * f * 0.8).addScaledVector(side, Math.cos(a) * spread * f + rnd() * 0.16 * f).addScaledVector(up, Math.sin(a) * spread * f + rnd() * 0.16 * f)); }
            const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.0);
            const g1 = new THREE.TubeGeometry(curve, 24, 0.035, 5, false), g2 = new THREE.TubeGeometry(curve, 24, 0.012, 5, false);
            const m1 = new THREE.Mesh(g1, glowM), m2 = new THREE.Mesh(g2, coreM); m1.renderOrder = 3; m2.renderOrder = 4; scene.add(m1, m2);
        }
    }
    const cam = new THREE.PerspectiveCamera(s.fov, W / H, 0.1, 60); cam.position.set(...s.cam); cam.lookAt(...s.look);
    gl.render(scene, cam);
    const hp = hand.clone().project(cam); (canvas as any).hand = [(hp.x * 0.5 + 0.5) * W, (1 - (hp.y * 0.5 + 0.5)) * H];
    const out = document.createElement('canvas'); out.width = W; out.height = H; out.getContext('2d')!.drawImage(canvas, 0, 0);
    gl.dispose(); gl.forceContextLoss();
    (out as any).hand = (canvas as any).hand;
    return out;
}

/** tight bounds of the non-transparent pixels */
export function trim(c: HTMLCanvasElement) {
    const x = c.getContext('2d')!, d = x.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let i = 0; i < c.width; i++) if (d[(y * c.width + i) * 4 + 3] > 6) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2); x1 = Math.min(c.width - 1, x1 + 2); y1 = Math.min(c.height - 1, y1 + 2);
    const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1; o.getContext('2d')!.drawImage(c, -x0, -y0);
    return { canvas: o, x0, y0 };
}
