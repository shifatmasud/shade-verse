#!/usr/bin/env python3
"""Measure a reference body (glTF, A-pose) against the hero mesh, for src/ghostBody.ts (Nov 2 2026).

Usage: python3 tools/body_ref/measure_ref.py <scene.gltf> [ghost_pos.json]
  scene.gltf: "Female Body (A-Pose & T-Pose) Free" by Leafar, CC-BY-4.0 (see CREDITS.md). Not in the repo; reference only.
  ghost_pos.json (optional): {"ghost": [x,y,z,...]} = feminineHeroData().pos, dumped with esbuild, to print Ghost beside it.
Needs numpy. Prints cross-section widths/depths at body landmarks (torso half-width, front/back depth; per-leg width/depth),
with the reference scaled to the hero's height (crotch, knee and shoulder land within 2 cm) and then to the hero's hip width.
"""
import json, sys, os
import numpy as np

HERO = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'hero.json')

def load_ref(path, mesh_name='Female_APose__0'):
    g = json.load(open(path)); binf = open(os.path.join(os.path.dirname(path), g['buffers'][0]['uri']), 'rb').read()
    def acc(i):
        a = g['accessors'][i]; bv = g['bufferViews'][a['bufferView']]; off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]; dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16}[a['componentType']]
        st = bv.get('byteStride', 0)
        if st:
            raw = np.frombuffer(binf, np.uint8, st * a['count'], off).reshape(-1, st); return raw[:, :n * np.dtype(dt).itemsize].copy().view(dt).reshape(-1, n)
        return np.frombuffer(binf, dt, a['count'] * n, off).reshape(-1, n)
    par = {c: i for i, n in enumerate(g['nodes']) for c in n.get('children', [])}
    ni = next(i for i, n in enumerate(g['nodes']) if n.get('name') == mesh_name)
    M = np.eye(4); i = ni
    while i is not None:
        n = g['nodes'][i]; M = (np.array(n['matrix']).reshape(4, 4).T if 'matrix' in n else np.eye(4)) @ M; i = par.get(i)
    pr = g['meshes'][g['nodes'][ni]['mesh']]['primitives'][0]
    P = acc(pr['attributes']['POSITION']).astype(float); P = (np.c_[P, np.ones(len(P))] @ M.T)[:, :3]
    P[:, 0] -= (P[:, 0].min() + P[:, 0].max()) / 2; P[:, 1] -= P[:, 1].min()
    return P, acc(pr['indices']).reshape(-1, 3)

def xsec(A, idx, y):
    T = A[idx]; out = []
    for a, b in ((0, 1), (1, 2), (2, 0)):
        ya, yb = T[:, a, 1], T[:, b, 1]; m = (ya - y) * (yb - y) < 0
        out.append(T[m, a] + (T[m, b] - T[m, a]) * ((y - ya[m]) / (yb[m] - ya[m]))[:, None])
    return np.vstack(out)

def clusters(P, gap):
    if not len(P): return []
    P = P[np.argsort(P[:, 0])]; return np.split(P, np.where(np.diff(P[:, 0]) > gap)[0] + 1)

def torso(A, idx, y, gap=0.03):
    for c in clusters(xsec(A, idx, y), gap):
        if c[:, 0].min() <= 0 <= c[:, 0].max(): return max(-c[:, 0].min(), c[:, 0].max()), c[:, 2].max(), c[:, 2].min()
    return None

def leg(A, idx, y, maxx=0.32):
    P = xsec(A, idx, y); P = P[(P[:, 0] > 0) & (P[:, 0] < maxx)]
    if len(P) < 3: return None
    return P[:, 0].max() - P[:, 0].min(), P[:, 2].max() - P[:, 2].min()

def main():
    R, Ri = load_ref(sys.argv[1]); H = json.load(open(HERO))
    S = np.array(H['pos']).reshape(-1, 3); Si = np.array(H['idx']).reshape(-1, 3)
    si = np.array(H['si']).reshape(-1, 4); sw = np.array(H['sw']).reshape(-1, 4); names = [b['n'] for b in H['bones']]
    legw = (np.isin(si, [names.index(n) for n in names if n[:5] in ('thigh', 'shinL', 'shinR', 'footL', 'footR')]) * sw).sum(1)
    Li = Si[(legw[Si] > 0.5).all(1)]
    G = np.array(json.load(open(sys.argv[2]))['ghost']).reshape(-1, 3) if len(sys.argv) > 2 else None
    k = (S[:, 1].max()) / R[:, 1].max()               # height (the hood tip vs the crown: crotch/knee/shoulder then agree within 2 cm)
    hipR = torso(R, Ri, 0.99 / k)[0] * k; hipH = torso(G if G is not None else S, Si, 0.99, 0.04)[0]
    w = hipH / hipR                                    # width: reference hip = hero hip
    print(f"height scale {k:.3f}, hip-width scale {w:.3f} (on top of height)")
    print("TORSO  y    ref half/zf/zb (hip-scaled)   shadow half/zf/zb" + ("   ghost" if G is not None else ""))
    for y in np.arange(0.99, 1.45, 0.03):
        r = torso(R, Ri, y / k); s = torso(S, Si, y, 0.04); gg = torso(G, Si, y, 0.04) if G is not None else None
        f = lambda t, m=1: ("%.3f %+.3f %+.3f" % tuple(v * m for v in t)) if t else "   -"
        print(f"      {y:.2f}  {f(r, k * w)}   {f(s)}" + (f"   {f(gg)}" if G is not None else ""))
    print("LEG    y    ref w/d (hip-scaled)   shadow w/d" + ("   ghost" if G is not None else ""))
    for y in np.arange(0.28, 0.97, 0.03):
        r = leg(R, Ri, y / k, 0.2); s = leg(S, Li, y); gg = leg(G, Li, y) if G is not None else None
        f = lambda t, m=1: ("%.3f %.3f" % (t[0] * m, t[1] * m)) if t else "  -"
        print(f"      {y:.2f}  {f(r, k * w)}   {f(s)}" + (f"   {f(gg)}" if G is not None else ""))

if __name__ == '__main__':
    main()
