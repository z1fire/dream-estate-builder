"""Chinese-style garden, furniture and plant assets (low-poly, flat-shaded): stone and paper lanterns, moon gate,
zigzag and hump bridges, scholar rock, incense burner, guardian lion, paifang archway, bonsai, garden table set;
cherry/plum blossom trees and bamboo; canopy bed, armchair, throne, screen, cabinet, scholar's desk, altar,
hanging scroll, porcelain vase, drum, gong and hanging lantern.

Front faces -Y (glTF +Z). Wall items sit against y=0 and extend towards -Y. Hanging items hang below the origin's rod.
"""
import math
import os
import sys
import bpy
sys.path.insert(0, os.path.dirname(__file__))
from common import PALETTE, reset, box, cyl, cone, sphere, torus, join, export, mesh_from  # noqa: E402

R = math.radians
PALETTE.update({
    'lacquer': (0.58, 0.07, 0.05), 'lacquer_dark': (0.32, 0.05, 0.04), 'jade': (0.22, 0.52, 0.40), 'teal': (0.10, 0.40, 0.42),
    'bronze': (0.42, 0.30, 0.16), 'porcelain': (0.93, 0.93, 0.95), 'cobalt': (0.10, 0.20, 0.55), 'blossom': (0.96, 0.66, 0.74),
    'blossom_white': (0.98, 0.90, 0.92), 'bark_dark': (0.20, 0.13, 0.10), 'bamboo': (0.56, 0.64, 0.26), 'bamboo_leaf': (0.28, 0.50, 0.17),
    'tile_grey': (0.30, 0.31, 0.34), 'wall_white': (0.92, 0.90, 0.85), 'paper': (0.96, 0.90, 0.74), 'lantern_red': (0.85, 0.12, 0.06),
    'rock_grey': (0.62, 0.62, 0.60), 'ink': (0.08, 0.08, 0.08), 'silk': (0.90, 0.84, 0.62), 'yellow': (0.90, 0.68, 0.12),
})
_orig_mat = None


def glow(name, color, strength):
    """Give a palette material an emission so lanterns glow at night."""
    import common
    m = common.mat(name)
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Emission Color'].default_value = (*color, 1)
    bsdf.inputs['Emission Strength'].default_value = strength
    return m


def tile_coping(length, y=0.0, z=0.0, width=0.9, mat='tile_grey'):
    """Small two-sided tiled roof along X, ridge at height z (used on walls and gates)."""
    v = [(-length / 2, y - width / 2, z - 0.28), (length / 2, y - width / 2, z - 0.28), (length / 2, y, z), (-length / 2, y, z),
         (-length / 2, y + width / 2, z - 0.28), (length / 2, y + width / 2, z - 0.28)]
    roof = mesh_from(v, [(0, 1, 2, 3), (3, 2, 5, 4), (1, 0, 4, 5)], 'coping', mat)
    ridge = box(length + 0.1, 0.16, 0.14, (0, y, z + 0.04), mat)
    curls = [box(0.14, 0.16, 0.3, (sx * (length / 2 + 0.02), y, z + 0.16), mat, rot=(0, R(-20 * sx), 0)) for sx in (-1, 1)]
    return [roof, ridge] + curls


def mini_roof(w, d, z, rise=0.6, over=0.35, mat='tile_grey', lift=0.25, cx=0.0):
    """A small hip roof with upturned corners centred at the origin (pavilion-style), base at height z."""
    hx, hy = w / 2 + over, d / 2 + over
    rx = max(0.05, hx - hy * 0.9)
    verts = [(-hx, -hy, z + lift), (hx, -hy, z + lift), (hx, hy, z + lift), (-hx, hy, z + lift),
             (-hx * 0.5, -hy * 0.5, z + rise * 0.55), (hx * 0.5, -hy * 0.5, z + rise * 0.55), (hx * 0.5, hy * 0.5, z + rise * 0.55), (-hx * 0.5, hy * 0.5, z + rise * 0.55),
             (-rx, 0, z + rise), (rx, 0, z + rise),
             (0, -hy, z), (hx, 0, z), (0, hy, z), (-hx, 0, z)]
    # corners lifted (0..3), mid-edges low (10..13) → curved eaves
    faces = [(0, 10, 4), (10, 1, 5, 4), (1, 11, 5), (11, 2, 6, 5), (2, 12, 6), (12, 3, 7, 6), (3, 13, 7), (13, 0, 4, 7),
             (4, 5, 9, 8), (5, 6, 9), (6, 7, 8, 9), (7, 4, 8)]
    verts = [(x + cx, y, zz) for (x, y, zz) in verts]
    r = mesh_from(verts, faces, 'miniroof', mat)
    return [r, box(rx * 2 + 0.2, 0.14, 0.12, (cx, 0, z + rise + 0.03), mat)]


# ------------------------------------------------------------------ garden & landscape
def stone_lantern():
    reset()
    p = [cyl(0.42, 0.2, (0, 0, 0.1), 'rock_grey', verts=6), cyl(0.12, 0.9, (0, 0, 0.65), 'rock_grey', verts=6),
         cyl(0.36, 0.14, (0, 0, 1.15), 'rock_grey', verts=6), box(0.46, 0.46, 0.42, (0, 0, 1.43), 'rock_grey'),
         box(0.3, 0.5, 0.24, (0, 0, 1.45), 'paper'), box(0.5, 0.3, 0.24, (0, 0, 1.45), 'paper'),
         cyl(0.62, 0.32, (0, 0, 1.8), 'rock_grey', verts=6, r2=0.12), sphere(0.11, (0, 0, 2.02), 'rock_grey', seg=6, rings=4)]
    glow('paper', (1.0, 0.7, 0.35), 0.0)
    export('garden', 'cn_stone_lantern', [join(p, 'cn_stone_lantern')])


def lantern_post():
    reset()
    glow('lantern_red', (1.0, 0.25, 0.08), 0.6)
    p = [box(0.3, 0.3, 0.12, (0, 0, 0.06), 'rock_grey'), box(0.12, 0.12, 2.6, (0, 0, 1.35), 'lacquer_dark'),
         box(0.9, 0.1, 0.1, (0.35, 0, 2.55), 'lacquer_dark'), cyl(0.012, 0.3, (0.7, 0, 2.38), 'ink'),
         sphere(0.26, (0.7, 0, 2.0), 'lantern_red', seg=10, rings=7, scale=(1, 1, 1.25)),
         cyl(0.16, 0.06, (0.7, 0, 2.33), 'gold', verts=10), cyl(0.16, 0.06, (0.7, 0, 1.67), 'gold', verts=10),
         cyl(0.02, 0.25, (0.7, 0, 1.52), 'yellow', verts=4)]
    export('lighting', 'cn_lantern_post', [join(p, 'cn_lantern_post')])


def lantern_hanging():
    reset()
    glow('lantern_red', (1.0, 0.25, 0.08), 0.6)
    p = [cyl(0.015, 0.4, (0, 0, 0.05), 'ink'), sphere(0.3, (0, 0, -0.45), 'lantern_red', seg=10, rings=7, scale=(1, 1, 1.25)),
         cyl(0.18, 0.06, (0, 0, -0.08), 'gold', verts=10), cyl(0.18, 0.06, (0, 0, -0.82), 'gold', verts=10),
         cyl(0.025, 0.3, (0, 0, -1.0), 'yellow', verts=4)]
    export('lighting', 'cn_lantern_hanging', [join(p, 'cn_lantern_hanging')])


def moon_gate():
    """Free-standing white wall section with a circular doorway and a tiled coping."""
    reset()
    L, H, T, r, cz = 4.6, 3.0, 0.4, 1.15, 1.35
    p = []
    n = 24
    for i in range(n):
        x0 = -L / 2 + L * i / n
        x1 = x0 + L / n
        xm = (x0 + x1) / 2
        if abs(xm) < r:
            dz = math.sqrt(r * r - xm * xm)
            lo, hi = cz - dz, cz + dz
            if lo > 0.02:
                p.append(box(x1 - x0 + 0.002, T, lo, (xm, 0, lo / 2), 'wall_white'))
            p.append(box(x1 - x0 + 0.002, T, H - hi, (xm, 0, (H + hi) / 2), 'wall_white'))
        else:
            p.append(box(x1 - x0 + 0.002, T, H, (xm, 0, H / 2), 'wall_white'))
    p.append(torus(r + 0.06, 0.08, (0, 0, cz), 'rock_grey', rot=(R(90), 0, 0), major=32, minor=4))
    p.append(box(L + 0.1, T + 0.15, 0.25, (0, 0, 0.12), 'rock_grey'))
    p += tile_coping(L + 0.6, 0, H + 0.32, T + 0.7)
    export('garden', 'cn_moon_gate', [join(p, 'cn_moon_gate')])


def zigzag_bridge():
    """Nine-turn style bridge: three straight runs at alternating angles, red rails, stone piers. ~12 m."""
    reset()
    p = []
    seg_len, w, deck = 4.2, 1.6, 0.75
    x, y, ang = 0.0, -6.0, 0.0
    for i, a in enumerate([25, -25, 25]):
        th = R(a)
        cx, cy = x + math.sin(th) * seg_len / 2, y + math.cos(th) * seg_len / 2
        p.append(box(w, seg_len + 0.3, 0.16, (cx, cy, deck), 'stone_light', rot=(0, 0, -th)))
        for side in (-1, 1):
            ox, oy = math.cos(th) * side * (w / 2 - 0.05), -math.sin(th) * side * (w / 2 - 0.05)
            p.append(box(0.08, seg_len, 0.08, (cx + ox, cy + oy, deck + 0.75), 'lacquer', rot=(0, 0, -th)))
            p.append(box(0.06, seg_len, 0.05, (cx + ox, cy + oy, deck + 0.35), 'lacquer', rot=(0, 0, -th)))
            for k in range(4):
                t = -seg_len / 2 + 0.1 + k * (seg_len - 0.2) / 3
                px, py = cx + math.sin(th) * t + ox, cy + math.cos(th) * t + oy
                p.append(box(0.1, 0.1, 0.85, (px, py, deck + 0.42), 'lacquer_dark'))
        for k in (-1, 1):
            t = k * seg_len * 0.3
            p.append(box(0.4, 0.4, deck + 0.6, (cx + math.sin(th) * t, cy + math.cos(th) * t, (deck - 0.6) / 2), 'rock_grey'))
        x, y = x + math.sin(th) * seg_len, y + math.cos(th) * seg_len
    export('boats', 'cn_zigzag_bridge', [join(p, 'cn_zigzag_bridge')])


def hump_bridge():
    """Stone moon (hump) bridge spanning ~10 m with balustrades."""
    reset()
    p = []
    n, span, rise, w = 16, 10.0, 2.2, 2.4
    pts = []
    for i in range(n + 1):
        t = i / n
        yy = -span / 2 + span * t
        zz = rise * math.sin(math.pi * t) + 0.25
        pts.append((yy, zz))
    for i in range(n):
        (y0, z0), (y1, z1) = pts[i], pts[i + 1]
        L = math.hypot(y1 - y0, z1 - z0)
        a = math.atan2(z1 - z0, y1 - y0)
        p.append(box(w, L + 0.05, 0.35, (0, (y0 + y1) / 2, (z0 + z1) / 2), 'stone_light', rot=(a, 0, 0)))
        for sx in (-1, 1):
            p.append(box(0.18, L + 0.02, 0.55, (sx * (w / 2 - 0.09), (y0 + y1) / 2, (z0 + z1) / 2 + 0.45), 'rock_grey', rot=(a, 0, 0)))
            if i % 2 == 0:
                p.append(box(0.24, 0.24, 0.8, (sx * (w / 2 - 0.09), y0, z0 + 0.55), 'rock_grey'))
    # arch ring under the deck (visual)
    for i in range(n):
        t0, t1 = i / n, (i + 1) / n
        a0, a1 = math.pi * t0, math.pi * t1
        ra = span * 0.36
        y0, z0 = -math.cos(a0) * ra, math.sin(a0) * ra * 0.75 - 0.4
        y1, z1 = -math.cos(a1) * ra, math.sin(a1) * ra * 0.75 - 0.4
        p.append(mesh_from([(-w / 2 + 0.05, y0, z0), (w / 2 - 0.05, y0, z0), (w / 2 - 0.05, y1, z1), (-w / 2 + 0.05, y1, z1)], [(0, 1, 2, 3)], 'arch', 'stone'))
    export('boats', 'cn_hump_bridge', [join(p, 'cn_hump_bridge')])


def scholar_rock():
    """Tall, holed Taihu limestone."""
    reset()
    p = []
    import random
    rnd = random.Random(7)
    z = 0.0
    for i in range(7):
        s = 0.5 - abs(i - 3) * 0.05 + rnd.uniform(-0.08, 0.08)
        lean = 0.12 * i
        o = sphere(s, (lean + rnd.uniform(-0.4, 0.4), rnd.uniform(-0.15, 0.15), z + s * 0.8), 'rock_grey', seg=6, rings=4,
                   scale=(1.3 + rnd.uniform(-0.3, 0.5), 0.6 + rnd.uniform(-0.1, 0.2), 0.8 + rnd.uniform(0, 0.6)))
        o.rotation_euler = (rnd.uniform(-0.4, 0.4), rnd.uniform(-0.6, 0.6), rnd.uniform(0, 3))
        p.append(sphere(s * 0.6, (lean + rnd.uniform(-0.6, 0.6), rnd.uniform(-0.1, 0.1), z + s), 'rock_grey', seg=5, rings=4, scale=(1.2, 0.6, 0.8)))
        p.append(o)
        z += s * 1.05
    p.append(cyl(0.7, 0.25, (0, 0, 0.0), 'stone_dark', verts=7))
    rock = join(p, 'cn_scholar_rock')
    for (x, y, zz, r) in [(0.1, 0, 1.2, 0.18), (-0.15, 0, 2.2, 0.15), (0.2, 0, 3.0, 0.13)]:
        hole = cyl(r, 2.0, (x, y, zz), 'rock_grey', verts=8, rot=(R(90), 0, 0))
        m = rock.modifiers.new('hole', 'BOOLEAN')
        m.operation = 'DIFFERENCE'
        m.object = hole
        bpy.context.view_layer.objects.active = rock
        bpy.ops.object.modifier_apply(modifier='hole')
        bpy.data.objects.remove(hole)
    export('garden', 'cn_scholar_rock', [rock])


def incense_burner():
    reset()
    p = [cyl(0.5, 0.55, (0, 0, 0.75), 'bronze', verts=12, r2=0.42), cyl(0.54, 0.06, (0, 0, 1.03), 'bronze', verts=12)]
    for i in range(3):
        a = i * 2 * math.pi / 3
        p.append(cyl(0.06, 0.55, (math.cos(a) * 0.35, math.sin(a) * 0.35, 0.28), 'bronze', verts=6, r2=0.08))
    for sx in (-1, 1):
        p.append(torus(0.12, 0.03, (sx * 0.45, 0, 1.15), 'bronze', rot=(R(90), 0, R(90)), major=8))
    p += [cone(0.3, 0.35, (0, 0, 1.25), 'bronze', verts=12), sphere(0.08, (0, 0, 1.45), 'gold')]
    p += [cyl(0.01, 0.35, (x * 0.08, 0, 1.2), 'lacquer_dark', verts=4) for x in (-1, 0, 1)]
    p.append(box(1.3, 1.3, 0.12, (0, 0, 0.06), 'rock_grey'))
    export('garden', 'cn_incense_burner', [join(p, 'cn_incense_burner')])


def guardian_lion():
    """Stylised seated guardian lion on a plinth, facing -Y."""
    reset()
    p = [box(1.0, 1.4, 0.8, (0, 0, 0.4), 'rock_grey'), box(1.1, 1.5, 0.1, (0, 0, 0.85), 'stone_light')]
    p += [sphere(0.42, (0, 0.2, 1.3), 'stone_light', seg=8, rings=6, scale=(1, 1.2, 1.05)),  # haunches
          sphere(0.34, (0, -0.15, 1.65), 'stone_light', seg=8, rings=6, scale=(1, 0.9, 1.3)),  # chest
          sphere(0.36, (0, -0.25, 2.2), 'stone_light', seg=8, rings=6),  # head
          box(0.3, 0.2, 0.18, (0, -0.55, 2.12), 'stone_light'),  # muzzle
          sphere(0.07, (-0.13, -0.56, 2.3), 'stone_dark'), sphere(0.07, (0.13, -0.56, 2.3), 'stone_dark')]
    for i in range(10):  # curly mane
        a = i / 10 * math.pi * 2
        p.append(sphere(0.12, (math.cos(a) * 0.36, -0.12 + math.sin(a) * 0.08, 2.2 + math.sin(a) * 0.32), 'rock_grey', seg=6, rings=4))
    for sx in (-1, 1):
        p.append(box(0.18, 0.2, 0.7, (sx * 0.2, -0.4, 1.25), 'stone_light'))  # forelegs
    p.append(sphere(0.18, (0.25, -0.62, 1.0), 'stone_dark', seg=8, rings=6))  # ball under paw
    export('garden', 'cn_guardian_lion', [join(p, 'cn_guardian_lion')])


def paifang():
    """Three-bay memorial archway (paifang) with red posts and tiled roofs, ~7 m tall, 9 m wide."""
    reset()
    p = []
    xs = [-4.0, -1.6, 1.6, 4.0]
    for x in xs:
        p += [box(0.45, 0.45, 5.6, (x, 0, 2.8), 'lacquer'), box(0.8, 0.8, 0.5, (x, 0, 0.25), 'rock_grey')]
    for (a, b, top) in [(xs[0], xs[1], 4.6), (xs[1], xs[2], 6.0), (xs[2], xs[3], 4.6)]:
        cx, w = (a + b) / 2, b - a
        p += [box(w + 0.45, 0.35, 0.5, (cx, 0, top - 0.9), 'teal'), box(w + 0.45, 0.32, 0.3, (cx, 0, top - 1.6), 'lacquer'),
              box(w * 0.55, 0.36, 0.55, (cx, 0, top - 1.25), 'jade')]
        for k in range(int(w / 0.5)):
            p.append(box(0.18, 0.5, 0.22, (a + 0.25 + k * 0.5, 0, top - 0.5), 'jade'))
        p += mini_roof(w + 0.6, 1.0, top - 0.4, rise=0.9, over=0.4, mat='tile_grey', lift=0.3, cx=cx)
    p.append(box(1.2, 0.4, 0.45, (0, -0.02, 4.8), 'yellow'))  # name plaque
    export('garden', 'cn_paifang', [join(p, 'cn_paifang')])


def bonsai():
    reset()
    p = [cyl(0.4, 0.25, (0, 0, 0.12), 'cobalt', verts=8, r2=0.33), box(0.75, 0.55, 0.08, (0, 0, 0.27), 'wood_dark'),
         cyl(0.06, 0.5, (0.05, 0, 0.5), 'bark_dark', verts=6, rot=(0, R(25), 0)), cyl(0.04, 0.4, (0.2, 0, 0.75), 'bark_dark', verts=5, rot=(0, R(-40), 0))]
    for (x, y, z, s) in [(0.3, 0, 0.85, 0.2), (-0.05, 0.05, 0.85, 0.17), (0.15, -0.1, 1.0, 0.15)]:
        p.append(sphere(s, (x, y, z), 'green', seg=7, rings=4, scale=(1.3, 1.1, 0.55)))
    export('garden', 'cn_bonsai', [join(p, 'cn_bonsai')])


def garden_table_set():
    reset()
    p = [cyl(0.25, 0.75, (0, 0, 0.38), 'rock_grey', verts=8, r2=0.18), cyl(0.7, 0.1, (0, 0, 0.78), 'stone_light', verts=16)]
    for i in range(4):
        a = i * math.pi / 2 + math.pi / 4
        x, y = math.cos(a) * 1.15, math.sin(a) * 1.15
        p += [cyl(0.24, 0.45, (x, y, 0.22), 'rock_grey', verts=10, r2=0.2), torus(0.22, 0.03, (x, y, 0.22), 'stone_dark', major=10)]
    p += [cyl(0.08, 0.1, (0.15, 0.1, 0.88), 'porcelain', verts=8), sphere(0.1, (-0.15, 0, 0.92), 'porcelain', seg=8, rings=5)]
    export('garden', 'cn_table_set', [join(p, 'cn_table_set')])


# ------------------------------------------------------------------ plants
def blossom_tree(name, col):
    reset()
    p = [cyl(0.2, 2.0, (0, 0, 1.0), 'bark_dark', verts=7, r2=0.14),
         cyl(0.1, 1.6, (0.45, 0, 2.3), 'bark_dark', verts=6, rot=(0, R(35), 0)), cyl(0.09, 1.5, (-0.4, 0.2, 2.25), 'bark_dark', verts=6, rot=(R(-15), R(-35), 0)),
         cyl(0.07, 1.2, (0.1, -0.45, 2.4), 'bark_dark', verts=5, rot=(R(35), 0, 0))]
    for (x, y, z, s) in [(0, 0, 3.2, 1.2), (1.0, 0.1, 2.9, 0.95), (-0.9, 0.3, 2.9, 0.95), (0.2, -0.8, 3.0, 0.85), (-0.2, 0.7, 3.4, 0.8), (0.5, 0.5, 3.6, 0.7)]:
        p.append(sphere(s, (x, y, z), col, seg=8, rings=5, scale=(1.1, 1.1, 0.75)))
    export('trees', name, [join(p, name)])


def bamboo(name, n, h):
    reset()
    import random
    rnd = random.Random(n * 13 + int(h))
    p = []
    for i in range(n):
        a, rr = rnd.uniform(0, math.pi * 2), rnd.uniform(0, 0.6)
        x, y = math.cos(a) * rr, math.sin(a) * rr
        hh = h * rnd.uniform(0.75, 1.0)
        lean = (rnd.uniform(-6, 6), rnd.uniform(-6, 6))
        p.append(cyl(0.05, hh, (x, y, hh / 2), 'bamboo', verts=6, rot=(R(lean[0]), R(lean[1]), 0)))
        for k in range(1, int(hh / 0.45)):  # nodes
            z = k * 0.45
            p.append(cyl(0.058, 0.03, (x + math.sin(R(lean[1])) * z, y - math.sin(R(lean[0])) * z, z), 'bamboo_leaf', verts=6))
        tx, ty = x + math.sin(R(lean[1])) * hh, y - math.sin(R(lean[0])) * hh
        for k in range(5):  # leaf sprays near the top
            z = hh * (0.55 + k * 0.1)
            aa = rnd.uniform(0, math.pi * 2)
            f = z / hh
            p.append(sphere(0.35 + k * 0.03, (x + (tx - x) * f + math.cos(aa) * 0.3, y + (ty - y) * f + math.sin(aa) * 0.3, z), 'bamboo_leaf', seg=6, rings=3, scale=(1.3, 0.5, 0.35)))
    export('trees', name, [join(p, name)])


# ------------------------------------------------------------------ furniture
def canopy_bed():
    reset()
    p = [box(2.2, 2.3, 0.45, (0, 0, 0.32), 'lacquer'), box(2.0, 2.0, 0.18, (0, 0.05, 0.62), 'silk'), box(0.9, 0.4, 0.14, (0, 0.8, 0.78), 'lantern_red'),
         box(2.3, 2.4, 0.1, (0, 0, 0.07), 'lacquer_dark')]
    for x in (-1.05, 1.05):
        for y in (-1.1, 1.1):
            p.append(box(0.1, 0.1, 2.3, (x, y, 1.45), 'lacquer'))
    p += [box(2.3, 2.4, 0.12, (0, 0, 2.62), 'lacquer'), box(2.2, 0.06, 1.0, (0, 1.12, 1.4), 'lacquer_dark'),
          box(0.06, 2.2, 1.0, (-1.08, 0, 1.4), 'lacquer_dark'), box(0.06, 2.2, 1.0, (1.08, 0, 1.4), 'lacquer_dark'),
          box(2.2, 0.06, 0.35, (0, -1.12, 2.4), 'gold')]
    for x in (-0.95, 0.95):  # tied-back curtains
        p.append(box(0.22, 0.12, 1.7, (x, -1.05, 1.65), 'lantern_red'))
    export('furniture', 'cn_canopy_bed', [join(p, 'cn_canopy_bed')])


def armchair():
    reset()
    p = [box(0.65, 0.55, 0.06, (0, 0, 0.5), 'lacquer_dark'), box(0.6, 0.05, 0.6, (0, 0.25, 0.85), 'lacquer_dark'),
         box(0.08, 0.5, 0.06, (-0.3, 0, 0.75), 'lacquer_dark'), box(0.08, 0.5, 0.06, (0.3, 0, 0.75), 'lacquer_dark'),
         cyl(0.04, 0.85, (0, 0.25, 1.15), 'lacquer_dark', rot=(0, R(90), 0)), box(0.3, 0.03, 0.4, (0, 0.23, 0.85), 'gold')]
    for x in (-0.28, 0.28):
        for y in (-0.23, 0.23):
            p.append(box(0.06, 0.06, 0.5, (x, y, 0.25), 'lacquer_dark'))
        p.append(box(0.04, 0.04, 0.25, (x, -0.23, 0.63), 'lacquer_dark'))
    p.append(box(0.55, 0.05, 0.05, (0, -0.22, 0.1), 'lacquer_dark'))
    export('furniture', 'cn_armchair', [join(p, 'cn_armchair')])


def dragon_throne():
    reset()
    p = [box(2.6, 2.0, 0.3, (0, 0, 0.15), 'yellow'), box(2.4, 1.7, 0.25, (0, 0.1, 0.42), 'lacquer'),
         box(1.4, 0.9, 0.5, (0, 0.2, 0.8), 'gold'), box(1.2, 0.8, 0.12, (0, 0.2, 1.1), 'yellow'),
         box(1.5, 0.15, 1.3, (0, 0.6, 1.7), 'gold'), box(1.2, 0.08, 1.0, (0, 0.52, 1.6), 'lantern_red'),
         box(0.15, 0.8, 0.55, (-0.72, 0.2, 1.35), 'gold'), box(0.15, 0.8, 0.55, (0.72, 0.2, 1.35), 'gold')]
    for sx in (-1, 1):
        p.append(cone(0.12, 0.45, (sx * 0.72, 0.6, 2.5), 'gold', verts=5, rot=(0, R(-20 * sx), 0)))
    p += [box(0.9, 0.5, 0.2, (0, -0.85, 0.4), 'lacquer'), box(0.9, 0.5, 0.2, (0, -0.85, 0.2), 'yellow')]  # steps
    for x in (-1.6, 1.6):  # screens either side
        p.append(box(0.06, 0.6, 2.2, (x, 0.5, 1.4), 'lacquer'))
        p.append(box(0.04, 0.5, 1.6, (x, 0.48, 1.5), 'gold'))
    export('furniture', 'cn_throne', [join(p, 'cn_throne')])


def folding_screen():
    reset()
    p = []
    for i in range(4):
        x = -1.05 + i * 0.7
        a = R(14 if i % 2 else -14)
        p += [box(0.7, 0.05, 1.9, (x, 0, 1.0), 'lacquer_dark', rot=(0, 0, a)), box(0.6, 0.06, 1.6, (x, -0.005, 1.05), 'silk', rot=(0, 0, a))]
        p.append(sphere(0.12, (x + 0.05, -0.04, 1.3 - i * 0.08), 'blossom', seg=6, rings=4, scale=(1, 0.2, 1)))
        p.append(box(0.04, 0.07, 0.6, (x - 0.1, -0.04, 0.85), 'ink', rot=(0, R(25), a)))
    export('furniture', 'cn_screen', [join(p, 'cn_screen')])


def cabinet():
    reset()
    p = [box(1.1, 0.55, 1.9, (0, 0, 1.0), 'lacquer'), box(0.52, 0.02, 1.6, (-0.27, -0.28, 1.05), 'lacquer_dark'), box(0.52, 0.02, 1.6, (0.27, -0.28, 1.05), 'lacquer_dark'),
         cyl(0.1, 0.02, (0, -0.3, 1.1), 'gold', verts=10, rot=(R(90), 0, 0)), box(0.04, 0.03, 0.25, (-0.04, -0.3, 1.1), 'gold'), box(0.04, 0.03, 0.25, (0.04, -0.3, 1.1), 'gold')]
    for x in (-0.5, 0.5):
        p.append(box(0.06, 0.06, 0.1, (x, -0.22, 0.03), 'lacquer_dark'))
    p += [cyl(0.09, 0.25, (-0.3, 0, 2.1), 'porcelain', verts=8, r2=0.05), sphere(0.11, (0.3, 0, 2.06), 'cobalt', seg=8, rings=5)]
    export('furniture', 'cn_cabinet', [join(p, 'cn_cabinet')])


def scholar_desk():
    reset()
    p = [box(1.8, 0.75, 0.06, (0, 0, 0.82), 'wood_dark'), box(0.08, 0.6, 0.78, (-0.82, 0, 0.4), 'wood_dark'), box(0.08, 0.6, 0.78, (0.82, 0, 0.4), 'wood_dark'),
         box(0.06, 0.1, 0.06, (-0.92, 0, 0.86), 'wood_dark', rot=(0, R(-30), 0)), box(0.06, 0.1, 0.06, (0.92, 0, 0.86), 'wood_dark', rot=(0, R(30), 0)),
         box(0.7, 0.4, 0.005, (0, -0.05, 0.855), 'paper'), box(0.18, 0.12, 0.03, (0.55, 0, 0.865), 'ink'),
         box(0.25, 0.05, 0.25, (-0.6, 0.15, 0.97), 'wood'), cyl(0.06, 0.12, (-0.4, 0.2, 0.91), 'porcelain', verts=8)]
    for i in range(4):
        p.append(cyl(0.008, 0.25, (-0.67 + i * 0.045, 0.15, 1.1), 'bamboo', verts=4))
    export('furniture', 'cn_desk', [join(p, 'cn_desk')])


def altar_table():
    reset()
    p = [box(2.2, 0.7, 0.08, (0, 0, 1.0), 'lacquer'), box(2.0, 0.6, 0.85, (0, 0, 0.5), 'lacquer_dark'), box(1.9, 0.62, 0.6, (0, -0.01, 0.55), 'yellow'),
         box(0.18, 0.75, 0.12, (-1.12, 0, 1.08), 'lacquer'), box(0.18, 0.75, 0.12, (1.12, 0, 1.08), 'lacquer')]
    p += [cyl(0.16, 0.18, (0, 0, 1.13), 'bronze', verts=10), cyl(0.18, 0.03, (0, 0, 1.22), 'bronze', verts=10)]
    p += [cyl(0.008, 0.25, (x, 0, 1.32), 'lacquer_dark', verts=4) for x in (-0.04, 0, 0.04)]
    glow('flame', (1.0, 0.55, 0.12), 4.0)
    for x in (-0.7, 0.7):
        p += [cyl(0.07, 0.08, (x, 0, 1.08), 'gold', verts=8), cyl(0.04, 0.3, (x, 0, 1.27), 'lantern_red', verts=8), cone(0.025, 0.07, (x, 0, 1.46), 'flame', verts=5)]
    for x in (-0.35, 0.35):
        p.append(sphere(0.07, (x, 0.1, 1.1), 'blossom', seg=6, rings=4))
    p.append(box(0.9, 0.06, 1.1, (0, 0.35, 1.6), 'gold'))  # tablet / backboard
    p.append(box(0.75, 0.07, 0.95, (0, 0.32, 1.6), 'lacquer'))
    export('furniture', 'cn_altar', [join(p, 'cn_altar')])


def hanging_scroll():
    reset()
    p = [cyl(0.03, 0.8, (0, -0.03, 2.2), 'wood_dark', rot=(0, R(90), 0)), box(0.62, 0.02, 1.5, (0, -0.03, 1.45), 'silk'),
         box(0.5, 0.025, 1.1, (0, -0.035, 1.5), 'paper'), cyl(0.035, 0.75, (0, -0.03, 0.68), 'wood_dark', rot=(0, R(90), 0))]
    for i in range(5):  # calligraphy strokes
        p.append(box(0.07, 0.03, 0.12, (0.05 - (i % 2) * 0.1, -0.05, 1.85 - i * 0.17), 'ink', rot=(0, R(15 * (i % 3 - 1)), 0)))
    for i in range(3):  # mountains painted below
        p.append(mesh_from([(-0.2 + i * 0.15, -0.05, 1.0), (0.0 + i * 0.15, -0.05, 1.0), (-0.1 + i * 0.15, -0.05, 1.25 - i * 0.05)], [(0, 1, 2)], 'mtn', 'ink'))
    export('furniture', 'cn_scroll', [join(p, 'cn_scroll')])


def vase():
    reset()
    p = [cyl(0.16, 0.08, (0, 0, 0.04), 'porcelain', verts=12, r2=0.2), sphere(0.32, (0, 0, 0.45), 'porcelain', seg=12, rings=8, scale=(1, 1, 1.1)),
         cyl(0.12, 0.3, (0, 0, 0.88), 'porcelain', verts=12, r2=0.1), cyl(0.15, 0.05, (0, 0, 1.04), 'cobalt', verts=12)]
    for z in (0.3, 0.62):
        p.append(torus(0.315 if z < 0.5 else 0.25, 0.025, (0, 0, z), 'cobalt', major=16))
    for i in range(6):
        a = i * math.pi / 3
        p.append(sphere(0.06, (math.cos(a) * 0.33, math.sin(a) * 0.33, 0.46), 'cobalt', seg=6, rings=4, scale=(1, 1, 1.4)))
    export('furniture', 'cn_vase', [join(p, 'cn_vase')])


def drum():
    reset()
    p = [cyl(0.55, 0.7, (0, 0, 1.25), 'lacquer', verts=16, rot=(R(90), 0, 0)), cyl(0.5, 0.72, (0, 0, 1.25), 'silk', verts=16, rot=(R(90), 0, 0))]
    for y in (-0.33, 0.33):
        p.append(torus(0.53, 0.025, (0, y, 1.25), 'gold', rot=(R(90), 0, 0), major=16))
    for x in (-0.55, 0.55):
        p += [box(0.08, 0.08, 1.2, (x, 0, 0.6), 'wood_dark'), box(0.08, 0.5, 0.08, (x, 0, 0.1), 'wood_dark')]
    p += [cyl(0.02, 0.4, (0.3, -0.5, 0.9), 'wood', rot=(R(70), 0, 0)), sphere(0.04, (0.3, -0.69, 0.97), 'lantern_red')]
    export('furniture', 'cn_drum', [join(p, 'cn_drum')])


def gong():
    reset()
    p = [box(0.1, 0.1, 2.0, (-0.75, 0, 1.0), 'lacquer'), box(0.1, 0.1, 2.0, (0.75, 0, 1.0), 'lacquer'), box(1.8, 0.12, 0.12, (0, 0, 2.0), 'lacquer'),
         cone(0.12, 0.2, (-0.92, 0, 2.05), 'gold', verts=4, rot=(0, R(90), 0)), cone(0.12, 0.2, (0.92, 0, 2.05), 'gold', verts=4, rot=(0, R(-90), 0)),
         cyl(0.55, 0.05, (0, 0, 1.2), 'bronze', verts=20, rot=(R(90), 0, 0)), cyl(0.2, 0.06, (0, 0, 1.2), 'gold', verts=12, rot=(R(90), 0, 0)),
         box(0.5, 0.5, 0.08, (-0.75, 0, 0.04), 'wood_dark'), box(0.5, 0.5, 0.08, (0.75, 0, 0.04), 'wood_dark')]
    p += [cyl(0.01, 0.25, (x, 0, 1.85), 'ink', verts=4) for x in (-0.3, 0.3)]
    export('furniture', 'cn_gong', [join(p, 'cn_gong')])


def tea_table():
    reset()
    p = [box(1.2, 0.8, 0.06, (0, 0, 0.42), 'lacquer'), box(1.1, 0.7, 0.05, (0, 0, 0.36), 'lacquer_dark')]
    for x in (-0.52, 0.52):
        for y in (-0.32, 0.32):
            p.append(box(0.06, 0.06, 0.36, (x, y, 0.18), 'lacquer_dark'))
    p += [sphere(0.1, (0, 0, 0.53), 'porcelain', seg=8, rings=5, scale=(1, 1, 0.8)), cyl(0.02, 0.1, (0.12, 0, 0.55), 'porcelain', verts=4, rot=(0, R(60), 0))]
    p += [cyl(0.035, 0.05, (x, y, 0.475), 'porcelain', verts=8) for (x, y) in [(-0.3, 0.15), (0.3, 0.15), (-0.3, -0.15), (0.3, -0.15)]]
    for (x, y) in [(0, 0.75), (0, -0.75)]:
        p.append(box(0.65, 0.55, 0.12, (x, y, 0.06), 'lantern_red'))  # floor cushions
    export('furniture', 'cn_tea_table', [join(p, 'cn_tea_table')])


if __name__ == '__main__':
    stone_lantern(); lantern_post(); lantern_hanging(); moon_gate(); zigzag_bridge(); hump_bridge(); scholar_rock()
    incense_burner(); guardian_lion(); paifang(); bonsai(); garden_table_set()
    blossom_tree('tree_cherry', 'blossom'); blossom_tree('tree_plum_blossom', 'blossom_white')
    bamboo('bamboo', 9, 7.0); bamboo('bamboo_small', 5, 3.5)
    canopy_bed(); armchair(); dragon_throne(); folding_screen(); cabinet(); scholar_desk(); altar_table()
    hanging_scroll(); vase(); drum(); gong(); tea_table()
    _ = (torus, cone, _orig_mat)
