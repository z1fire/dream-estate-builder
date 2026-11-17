"""Castle pieces the CC0 kits don't cover: moat edging, drawbridge, portcullis, crenellation pieces,
spiral stair, banners, wall torches, brazier, well, arched doors. Front faces Blender -Y (= glTF +Z)."""
import math
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
from common import reset, box, cyl, cone, sphere, torus, join, export, mat, mesh_from  # noqa: E402


def moat_edge_stone():
    reset()
    parts = []
    # 4 m run of capping stones, staggered
    for i in range(5):
        w = 0.78 + (i % 2) * 0.06
        parts.append(box(w, 0.7, 0.32, (-1.6 + i * 0.8, 0, 0.16 + (i % 2) * 0.02), 'stone_light'))
    # sloped face into the water
    for i in range(4):
        parts.append(box(0.98, 0.5, 1.4, (-1.5 + i * 1.0, -0.3, -0.7), 'stone' if i % 2 else 'stone_dark', rot=(math.radians(12), 0, 0)))
    o = join(parts, 'moat_edge_stone')
    export('castle', 'moat_edge_stone', [o])


def drawbridge():
    reset()
    parts = []
    L, W = 8.0, 4.0
    for i in range(8):  # planks across
        parts.append(box(W, L / 8 - 0.04, 0.18, (0, -(i + 0.5) * L / 8, 0.09), 'wood' if i % 2 else 'wood_light'))
    for x in (-W / 2 + 0.25, W / 2 - 0.25):  # beams under
        parts.append(box(0.3, L, 0.25, (x, -L / 2, -0.1), 'wood_dark'))
    for y in (-1.5, -4, -6.5):  # iron bands
        parts.append(box(W + 0.05, 0.12, 0.2, (0, y, 0.12), 'iron'))
    for x in (-W / 2 + 0.2, W / 2 - 0.2):  # chain rings at the far end
        parts.append(torus(0.18, 0.04, (x, -L + 0.3, 0.3), 'iron', rot=(0, math.radians(90), 0)))
    o = join(parts, 'drawbridge')
    export('castle', 'drawbridge', [o])


def portcullis():
    reset()
    parts = []
    W, H = 4.0, 5.0
    for i in range(7):
        x = -W / 2 + 0.25 + i * (W - 0.5) / 6
        parts.append(box(0.12, 0.12, H, (x, 0, H / 2), 'iron'))
        parts.append(cone(0.1, 0.35, (x, 0, -0.15), 'iron', verts=4, rot=(math.pi, 0, 0)))
    for j in range(6):
        parts.append(box(W, 0.1, 0.12, (0, 0, 0.5 + j * (H - 0.8) / 5), 'iron'))
    o = join(parts, 'portcullis')
    export('castle', 'portcullis', [o])


def merlon():
    reset()
    o = box(1.0, 0.8, 0.9, (0, 0, 0.45), 'stone')
    export('castle', 'merlon', [o])


def arrow_slit():
    reset()
    parts = [box(0.9, 0.2, 2.0, (-0.32, 0, 1.0), 'stone_dark'), box(0.9, 0.2, 2.0, (0.32, 0, 1.0), 'stone_dark')]
    o = join(parts, 'arrow_slit')
    export('castle', 'arrow_slit', [o])


def spiral_stairs():
    reset()
    parts = []
    H, R, steps = 3.6, 1.6, 16
    parts.append(cyl(0.22, H, (0, 0, H / 2), 'stone_dark', verts=10))
    for i in range(steps):
        a = i * (2 * math.pi * 0.9) / steps
        z = (i + 1) * H / steps
        # wedge step
        verts = [(0, 0, z - 0.18), (math.cos(a) * R, math.sin(a) * R, z - 0.18),
                 (math.cos(a + 0.42) * R, math.sin(a + 0.42) * R, z - 0.18),
                 (0, 0, z), (math.cos(a) * R, math.sin(a) * R, z), (math.cos(a + 0.42) * R, math.sin(a + 0.42) * R, z)]
        faces = [(0, 2, 1), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5)]
        parts.append(mesh_from(verts, faces, f'step{i}', 'stone_light' if i % 2 else 'stone'))
    o = join(parts, 'spiral_stairs')
    export('castle', 'spiral_stairs', [o])


def banner(color='red', name='banner_red', emblem='gold'):
    reset()
    parts = [cyl(0.04, 1.6, (0, 0, 3.2), 'wood_dark', rot=(0, math.radians(90), 0))]
    # cloth with swallowtail
    verts = [(-0.7, 0, 3.2), (0.7, 0, 3.2), (0.7, 0, 0.6), (0, 0, 0.95), (-0.7, 0, 0.6)]
    cloth = mesh_from(verts + [(x, -0.02, z) for x, _, z in verts], [(0, 1, 2, 3, 4), (9, 8, 7, 6, 5)], 'cloth', color)
    parts.append(cloth)
    parts.append(box(0.5, 0.06, 0.5, (0, -0.03, 2.2), emblem, rot=(0, math.radians(45), 0)))
    o = join(parts, name)
    export('castle', name, [o])


def wall_torch():
    reset()
    parts = [box(0.12, 0.3, 0.25, (0, 0.12, 0), 'iron'), cyl(0.05, 0.6, (0, -0.1, 0.25), 'wood_dark', rot=(math.radians(-25), 0, 0)),
             cyl(0.1, 0.15, (0, -0.22, 0.55), 'iron', r2=0.13), cone(0.1, 0.35, (0, -0.22, 0.78), 'flame', verts=6)]
    o = join(parts, 'torch_wall')
    export('lighting', 'torch_wall', [o])


def standing_torch():
    reset()
    parts = [cyl(0.05, 1.8, (0, 0, 0.9), 'wood_dark'), cyl(0.12, 0.18, (0, 0, 1.85), 'iron', r2=0.16), cone(0.13, 0.42, (0, 0, 2.15), 'flame', verts=6),
             cyl(0.25, 0.08, (0, 0, 0.04), 'iron', verts=6)]
    o = join(parts, 'torch_standing')
    export('lighting', 'torch_standing', [o])


def brazier():
    reset()
    parts = [cyl(0.45, 0.35, (0, 0, 1.05), 'iron', r2=0.55), cone(0.4, 0.6, (0, 0, 1.45), 'flame', verts=7)]
    for a in range(3):
        ang = a * 2 * math.pi / 3
        parts.append(cyl(0.04, 1.0, (math.cos(ang) * 0.3, math.sin(ang) * 0.3, 0.5), 'iron', rot=(math.sin(ang) * 0.3, -math.cos(ang) * 0.3, 0)))
    o = join(parts, 'brazier')
    export('lighting', 'brazier', [o])


def well():
    reset()
    parts = []
    for i in range(12):
        a = i * 2 * math.pi / 12
        parts.append(box(0.62, 0.32, 0.9, (math.cos(a) * 1.0, math.sin(a) * 1.0, 0.45), 'stone' if i % 2 else 'stone_light', rot=(0, 0, a + math.pi / 2)))
    parts.append(cyl(0.9, 0.1, (0, 0, 0.5), 'water', verts=12))
    for x in (-1.05, 1.05):
        parts.append(box(0.16, 0.16, 2.2, (x, 0, 1.6), 'wood_dark'))
    parts.append(cyl(0.1, 2.3, (0, 0, 2.2), 'wood', rot=(0, math.radians(90), 0)))
    parts.append(cyl(0.02, 0.9, (0, 0, 1.7), 'cloth'))
    parts.append(cyl(0.16, 0.25, (0, 0, 1.2), 'wood_light', r2=0.2))
    # little roof
    verts = [(-1.4, -0.9, 2.5), (1.4, -0.9, 2.5), (1.4, 0, 3.2), (-1.4, 0, 3.2), (-1.4, 0.9, 2.5), (1.4, 0.9, 2.5)]
    parts.append(mesh_from(verts, [(0, 1, 2, 3), (3, 2, 5, 4), (0, 3, 4), (1, 5, 2)], 'roof', 'wood_dark'))
    o = join(parts, 'well')
    export('village', 'well', [o])


def door(kind='wood'):
    reset()
    parts = []
    W, H = (1.2, 2.2) if kind != 'double' else (2.2, 2.8)
    n = 5 if kind != 'double' else 8
    for i in range(n):
        parts.append(box(W / n - 0.02, 0.1, H, (-W / 2 + (i + 0.5) * W / n, 0, H / 2), 'wood' if i % 2 else 'wood_light'))
    if kind in ('arched', 'double'):
        parts.append(cyl(W / 2, 0.1, (0, 0, H), 'wood', verts=12, rot=(math.radians(90), 0, 0)))
    for z in (0.4, H - 0.5):
        parts.append(box(W, 0.13, 0.1, (0, -0.02, z), 'iron'))
    parts.append(torus(0.08, 0.015, (W / 2 - 0.25 if kind != 'double' else 0.2, -0.08, H / 2), 'iron', rot=(math.radians(90), 0, 0)))
    o = join(parts, f'door_{kind}')
    export('castle', f'door_{kind}', [o])


def window(kind='stained'):
    reset()
    parts = []
    W, H = 1.0, 1.8
    parts.append(box(W + 0.2, 0.25, 0.15, (0, 0, 0), 'stone_light'))  # sill
    if kind == 'stained':
        cols = ['red', 'blue', 'gold', 'green', 'purple', 'blue']
        for i in range(6):
            parts.append(box(W / 2 - 0.03, 0.04, H / 3 - 0.03, (-W / 4 + (i % 2) * W / 2, 0, 0.15 + (i // 2 + 0.5) * H / 3), cols[i]))
        parts.append(cyl(W / 2, 0.04, (0, 0, H + 0.15), 'gold', verts=10, rot=(math.radians(90), 0, 0)))
    elif kind == 'shutter':
        parts.append(box(W, 0.04, H, (0, 0, H / 2 + 0.1), 'glass'))
        for s in (-1, 1):
            parts.append(box(W / 2, 0.06, H, (s * (W * 0.75 + 0.02), -0.05, H / 2 + 0.1), 'green'))
    else:
        parts.append(box(W, 0.04, H, (0, 0, H / 2 + 0.1), 'glass'))
        parts.append(cyl(W / 2, 0.04, (0, 0, H + 0.1), 'glass', verts=10, rot=(math.radians(90), 0, 0)))
    parts.append(box(0.06, 0.06, H, (0, -0.03, H / 2 + 0.1), 'iron'))
    o = join(parts, f'window_{kind}')
    export('castle', f'window_{kind}', [o])


def flagpole():
    reset()
    parts = [cyl(0.06, 6, (0, 0, 3), 'wood_dark'), sphere(0.1, (0, 0, 6.05), 'gold')]
    verts = [(0, 0, 5.9), (2.0, 0, 5.4), (0, 0, 4.7)]
    parts.append(mesh_from(verts + [(x, -0.02, z) for x, _, z in verts], [(0, 1, 2), (5, 4, 3)], 'pennant', 'red'))
    o = join(parts, 'flagpole')
    export('castle', 'flagpole', [o])


if __name__ == '__main__':
    moat_edge_stone(); drawbridge(); portcullis(); merlon(); arrow_slit(); spiral_stairs()
    banner('red', 'banner_red'); banner('blue', 'banner_blue'); banner('green', 'banner_green', 'white')
    wall_torch(); standing_torch(); brazier(); well(); flagpole()
    door('wood'); door('arched'); door('double')
    window('stained'); window('shutter'); window('arched')
    _ = mat
