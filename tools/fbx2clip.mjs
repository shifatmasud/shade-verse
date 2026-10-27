// dev tool: Mixamo FBX -> compact JSON clip retargeted (direction/swing based) onto the generated 17-bone hero rig.
// usage: node tools/fbx2clip.mjs in.fbx out.json [loop]
import fs from 'fs';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
globalThis.self = globalThis;
const [,, inF, outF] = process.argv;
const hero = JSON.parse(fs.readFileSync(new URL('../src/hero.json', import.meta.url)));
const rest = {}; hero.bones.forEach((b) => (rest[b.n] = { p: b.p, h: new THREE.Vector3(...b.h), par: b.p >= 0 ? hero.bones[b.p].n : null }));
const buf = fs.readFileSync(inF); const obj = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
const clip = obj.animations[0]; const mix = new THREE.AnimationMixer(obj); mix.clipAction(clip).play();
const mb = {}; obj.traverse((o) => { if (o.isBone) mb[o.name.replace('mixamorig', '')] = o; });
const wp = (n) => new THREE.Vector3().setFromMatrixPosition(mb[n].matrixWorld);
// my bone -> [mixamo from, mixamo to]; side-tag S replaced by Left/Right
const mapS = (s) => ({
  hips: ['Hips', 'Spine'], spine: ['Spine', 'Spine2'], chest: ['Spine2', 'Neck'], neck: ['Neck', 'Head'], head: ['Head', 'HeadTop_End'],
  ['uarm' + s[0]]: [s + 'Arm', s + 'ForeArm'], ['farm' + s[0]]: [s + 'ForeArm', s + 'Hand'], ['hand' + s[0]]: [s + 'Hand', s + 'HandMiddle1'],
  ['thigh' + s[0]]: [s + 'UpLeg', s + 'Leg'], ['shin' + s[0]]: [s + 'Leg', s + 'Foot'], ['foot' + s[0]]: [s + 'Foot', s + 'ToeBase'],
});
const MAP = { ...mapS('Right'), ...mapS('Left') };
const restTo = { hips: 'spine', spine: 'chest', chest: 'neck', neck: 'head' };
const restDir = (n) => {
  const side = n.slice(-1); const base = n.replace(/[LR]$/, '');
  const h = (x) => rest[x].h;
  let to;
  if (restTo[n]) to = h(restTo[n]);
  else if (base === 'uarm') to = h('farm' + side); else if (base === 'farm') to = h('hand' + side);
  else if (base === 'thigh') to = h('shin' + side); else if (base === 'shin') to = h('foot' + side);
  if (to) return to.clone().sub(h(n)).normalize();
  if (n === 'head') return new THREE.Vector3(0, 1, 0);
  if (base === 'hand') return h('hand' + side).clone().sub(h('farm' + side)).normalize();
  if (base === 'foot') return new THREE.Vector3(0, 0, 1);
};
const order = hero.bones.map((b) => b.n);
const fps = 30, dur = clip.duration, N = Math.max(2, Math.round(dur * fps));
mix.setTime(0); obj.updateMatrixWorld(true);
const hipsRest = wp('Hips').y;
const out = []; const hipsY = [];
for (let f = 0; f < N; f++) {
  mix.setTime((f / N) * dur); obj.updateMatrixWorld(true);
  const W = {};
  for (const n of order) {
    const m = MAP[n]; let q = new THREE.Quaternion();
    if (m && mb[m[0]] && mb[m[1]]) {
      const a = wp(m[0]), b = wp(m[1]); const d = b.sub(a).normalize(); d.x = -d.x; // mirror: Mixamo Right is -x, hero R is +x
      q.setFromUnitVectors(restDir(n), d);
    }
    W[n] = q;
    const par = rest[n].par; const local = par ? W[par].clone().invert().multiply(q) : q.clone();
    out.push(+local.x.toFixed(3), +local.y.toFixed(3), +local.z.toFixed(3), +local.w.toFixed(3));
  }
  hipsY.push(+(wp('Hips').y / hipsRest).toFixed(3));
}
fs.writeFileSync(outF, JSON.stringify({ fps, n: N, bones: order, q: out, hy: hipsY }));
console.log(outF, 'frames', N, 'dur', dur.toFixed(2), 'bytes', fs.statSync(outF).size, 'hipsY', Math.min(...hipsY), Math.max(...hipsY));
