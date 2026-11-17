"""Medieval furniture & interior decor in a low-poly style. Origin at floor centre; front faces Blender -Y."""
import math
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
from common import reset, box, cyl, cone, sphere, torus, join, export, mesh_from  # noqa: E402

R = math.radians


def legs(w, d, h, inset=0.08, t=0.1, material='wood_dark'):
    return [box(t, t, h, (sx * (w / 2 - inset), sy * (d / 2 - inset), h / 2), material) for sx in (-1, 1) for sy in (-1, 1)]


def long_table():
    reset()
    p = [box(4.0, 1.1, 0.1, (0, 0, 0.78), 'wood')] + legs(4.0, 1.1, 0.74, 0.25, 0.14)
    p.append(box(3.4, 0.08, 0.1, (0, 0, 0.25), 'wood_dark'))
    p.append(box(3.6, 0.5, 0.01, (0, 0, 0.835), 'red'))  # runner
    export('furniture', 'long_table', [join(p, 'long_table')])


def bench_long():
    reset()
    p = [box(3.6, 0.38, 0.08, (0, 0, 0.46), 'wood')] + legs(3.6, 0.38, 0.42, 0.3, 0.1)
    export('furniture', 'bench_long', [join(p, 'bench_long')])


def throne():
    reset()
    p = [box(1.0, 0.9, 0.5, (0, 0, 0.25), 'wood_dark'), box(0.9, 0.8, 0.12, (0, 0, 0.56), 'red'),
         box(1.0, 0.16, 1.9, (0, 0.38, 1.1), 'wood_dark'), box(0.8, 0.06, 1.3, (0, 0.29, 1.1), 'red'),
         box(0.14, 0.8, 0.5, (-0.48, 0, 0.8), 'wood_dark'), box(0.14, 0.8, 0.5, (0.48, 0, 0.8), 'wood_dark')]
    for x in (-0.42, 0, 0.42):
        p.append(cone(0.08, 0.25, (x, 0.38, 2.15), 'gold', verts=4))
    p.append(sphere(0.07, (-0.48, -0.38, 1.08), 'gold')); p.append(sphere(0.07, (0.48, -0.38, 1.08), 'gold'))
    p.append(box(1.6, 1.6, 0.15, (0, 0, -0.0), 'stone_light'))
    export('furniture', 'throne', [join(p, 'throne')])


def chandelier():
    reset()
    p = [torus(0.9, 0.05, (0, 0, 0), 'iron', major=16), cyl(0.02, 1.8, (0, 0, 0.9), 'iron')]
    for i in range(8):
        a = i * math.pi / 4
        x, y = math.cos(a) * 0.9, math.sin(a) * 0.9
        p += [cyl(0.05, 0.18, (x, y, 0.1), 'candle'), cone(0.035, 0.1, (x, y, 0.24), 'flame', verts=5)]
    for i in range(4):
        a = i * math.pi / 2
        p.append(cyl(0.015, 1.0, (math.cos(a) * 0.45, math.sin(a) * 0.45, 0.45), 'iron', rot=(math.sin(a) * 0.5, -math.cos(a) * 0.5, 0)))
    o = join(p, 'chandelier')
    for v in o.data.vertices:
        v.co.z -= 1.8  # origin at ceiling mount point
    export('lighting', 'chandelier', [o])


def candle_stand():
    reset()
    p = [cyl(0.2, 0.05, (0, 0, 0.025), 'iron', verts=8), cyl(0.03, 1.3, (0, 0, 0.67), 'iron'), cyl(0.12, 0.04, (0, 0, 1.33), 'iron', verts=8),
         cyl(0.05, 0.25, (0, 0, 1.47), 'candle'), cone(0.035, 0.1, (0, 0, 1.64), 'flame', verts=5)]
    export('lighting', 'candle_stand', [join(p, 'candle_stand')])


def candelabra():
    reset()
    p = [cyl(0.1, 0.03, (0, 0, 0.015), 'gold'), cyl(0.02, 0.3, (0, 0, 0.17), 'gold'), box(0.4, 0.03, 0.03, (0, 0, 0.32), 'gold')]
    for x in (-0.19, 0, 0.19):
        p += [cyl(0.025, 0.14, (x, 0, 0.4), 'candle'), cone(0.02, 0.06, (x, 0, 0.5), 'flame', verts=5)]
    export('lighting', 'candelabra', [join(p, 'candelabra')])


def bed_fourposter():
    reset()
    p = [box(1.9, 2.3, 0.4, (0, 0, 0.35), 'wood_dark'), box(1.8, 2.15, 0.22, (0, 0.02, 0.66), 'cloth'),
         box(1.82, 1.4, 0.1, (0, -0.35, 0.8), 'red'), box(0.6, 0.35, 0.14, (-0.45, 0.85, 0.82), 'white'), box(0.6, 0.35, 0.14, (0.45, 0.85, 0.82), 'white'),
         box(1.9, 0.12, 1.0, (0, 1.12, 1.0), 'wood_dark')]
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.append(box(0.12, 0.12, 2.4, (sx * 0.92, sy * 1.12, 1.2), 'wood_dark'))
    p.append(box(1.96, 2.36, 0.12, (0, 0, 2.4), 'wood_dark'))
    p.append(box(1.9, 2.3, 0.05, (0, 0, 2.33), 'red'))
    for sx in (-1, 1):  # drapes
        p.append(box(0.06, 0.5, 1.6, (sx * 0.92, -1.0, 1.6), 'red'))
    export('furniture', 'bed_fourposter', [join(p, 'bed_fourposter')])


def bed_simple():
    reset()
    p = [box(1.0, 2.0, 0.3, (0, 0, 0.25), 'wood'), box(0.95, 1.9, 0.15, (0, 0, 0.47), 'straw'), box(0.97, 1.2, 0.06, (0, -0.3, 0.56), 'blue'),
         box(0.5, 0.3, 0.1, (0, 0.75, 0.58), 'cloth'), box(1.0, 0.08, 0.5, (0, 1.0, 0.45), 'wood')]
    export('furniture', 'bed_simple', [join(p, 'bed_simple')])


def wardrobe():
    reset()
    p = [box(1.4, 0.65, 2.1, (0, 0, 1.05), 'wood'), box(1.5, 0.72, 0.1, (0, 0, 2.15), 'wood_dark'), box(0.02, 0.05, 1.8, (0, -0.34, 1.05), 'wood_dark'),
         sphere(0.04, (-0.08, -0.35, 1.1), 'iron'), sphere(0.04, (0.08, -0.35, 1.1), 'iron')]
    for x in (-0.36, 0.36):
        p.append(box(0.5, 0.02, 0.7, (x, -0.33, 1.5), 'wood_light')); p.append(box(0.5, 0.02, 0.7, (x, -0.33, 0.6), 'wood_light'))
    export('furniture', 'wardrobe', [join(p, 'wardrobe')])


def chest_large():
    reset()
    p = [box(1.2, 0.65, 0.55, (0, 0, 0.3), 'wood'), cyl(0.33, 1.2, (0, 0, 0.58), 'wood_dark', verts=12, rot=(0, R(90), 0))]
    for x in (-0.45, 0, 0.45):
        p.append(box(0.08, 0.7, 0.62, (x, 0, 0.33), 'iron'))
    p.append(box(0.15, 0.04, 0.18, (0, -0.34, 0.5), 'gold'))
    o = join(p, 'chest_large')
    for v in o.data.vertices:  # flatten bottom of lid cylinder
        if v.co.z < 0.58 and abs(v.co.y) > 0.01 and v.co.z > 0.3:
            v.co.z = max(v.co.z, 0.58)
    export('furniture', 'chest_large', [o])


def nightstand():
    reset()
    p = [box(0.5, 0.45, 0.6, (0, 0, 0.3), 'wood'), box(0.4, 0.02, 0.18, (0, -0.23, 0.42), 'wood_light'), sphere(0.025, (0, -0.25, 0.42), 'iron'),
         cyl(0.04, 0.12, (0.1, 0, 0.66), 'candle'), cone(0.03, 0.06, (0.1, 0, 0.75), 'flame', verts=5)]
    export('furniture', 'nightstand', [join(p, 'nightstand')])


def hearth():
    """Large kitchen/hall fireplace placed against a wall (back at +Y)."""
    reset()
    p = [box(2.8, 1.0, 0.3, (0, 0, 0.15), 'stone_dark'), box(0.5, 1.0, 1.8, (-1.15, 0, 1.05), 'stone'), box(0.5, 1.0, 1.8, (1.15, 0, 1.05), 'stone'),
         box(2.9, 1.1, 0.35, (0, 0, 2.1), 'stone_light'), box(2.4, 0.9, 1.6, (0, 0.2, 3.1), 'stone', rot=(0, 0, 0)),
         box(1.8, 0.2, 1.8, (0, 0.45, 1.0), 'black')]
    for i in range(3):
        p.append(cyl(0.08, 0.9, (-0.3 + i * 0.3, -0.05, 0.42), 'wood_dark', rot=(0, R(90), R(20 * i))))
    p += [cone(0.28, 0.7, (-0.15, 0, 0.8), 'flame', verts=6), cone(0.22, 0.55, (0.25, 0.05, 0.72), 'flame', verts=6)]
    export('furniture', 'hearth', [join(p, 'hearth')])


def fireplace():
    reset()
    p = [box(1.8, 0.7, 0.2, (0, 0, 0.1), 'stone_dark'), box(0.35, 0.7, 1.3, (-0.72, 0, 0.75), 'stone'), box(0.35, 0.7, 1.3, (0.72, 0, 0.75), 'stone'),
         box(1.9, 0.8, 0.25, (0, 0, 1.5), 'stone_light'), box(1.1, 0.15, 1.2, (0, 0.28, 0.75), 'black'),
         cone(0.2, 0.5, (0, 0, 0.5), 'flame', verts=6), cyl(0.06, 0.6, (0, 0, 0.27), 'wood_dark', rot=(0, R(90), 0))]
    export('furniture', 'fireplace', [join(p, 'fireplace')])


def kitchen_table():
    reset()
    p = [box(2.0, 0.9, 0.12, (0, 0, 0.82), 'wood_light')] + legs(2.0, 0.9, 0.78, 0.12, 0.12)
    p += [cyl(0.15, 0.08, (-0.5, 0, 0.92), 'wood_dark', verts=10), sphere(0.08, (0.4, 0.1, 0.93), 'red'), sphere(0.07, (0.55, -0.05, 0.92), 'green'),
          box(0.4, 0.25, 0.04, (0.1, -0.15, 0.9), 'wood')]
    export('furniture', 'kitchen_table', [join(p, 'kitchen_table')])


def cooking_pot():
    reset()
    p = [sphere(0.4, (0, 0, 0.55), 'iron', seg=10, rings=6, scale=(1, 1, 0.8)), cyl(0.38, 0.04, (0, 0, 0.82), 'water', verts=10)]
    for a in range(3):
        ang = a * 2 * math.pi / 3
        p.append(cyl(0.035, 1.8, (math.cos(ang) * 0.5, math.sin(ang) * 0.5, 0.85), 'wood_dark', rot=(math.sin(ang) * 0.5, -math.cos(ang) * 0.5, 0)))
    p += [cone(0.3, 0.4, (0, 0, 0.15), 'flame', verts=6)]
    export('furniture', 'cooking_pot', [join(p, 'cooking_pot')])


def pot_shelf():
    reset()
    p = [box(1.6, 0.4, 0.05, (0, 0, z), 'wood') for z in (0.4, 1.0, 1.6)]
    p += [box(0.06, 0.4, 1.7, (x, 0, 0.85), 'wood_dark') for x in (-0.78, 0.78)]
    for i, (x, z) in enumerate([(-0.5, 0.43), (0, 0.43), (0.5, 1.03), (-0.4, 1.03), (0.3, 1.63), (-0.3, 1.63)]):
        p.append(cyl(0.12, 0.25, (x, 0, z + 0.12), ['brick', 'iron', 'sandstone'][i % 3], verts=8, r2=0.09))
    export('furniture', 'pot_shelf', [join(p, 'pot_shelf')])


def bread_oven():
    reset()
    p = [box(2.0, 1.8, 0.8, (0, 0, 0.4), 'stone'), sphere(0.95, (0, 0, 0.8), 'brick', seg=10, rings=6, scale=(1, 0.95, 0.75)),
         box(0.6, 0.3, 0.45, (0, -0.85, 1.0), 'black'), cyl(0.15, 0.9, (0.4, 0.4, 1.8), 'brick', verts=6)]
    export('furniture', 'bread_oven', [join(p, 'bread_oven')])


def bookshelf():
    reset()
    p = [box(1.6, 0.4, 2.2, (0, 0.03, 1.1), 'wood_dark')]
    cols = ['red', 'blue', 'green', 'leather', 'purple', 'cloth', 'wood_light']
    k = 0
    for row in range(4):
        z = 0.2 + row * 0.5
        p.append(box(1.5, 0.36, 0.42, (0, -0.02, z + 0.24), 'black'))
        x = -0.68
        while x < 0.62:
            w = 0.06 + (k * 37 % 5) * 0.012
            hgt = 0.3 + (k * 13 % 4) * 0.025
            p.append(box(w, 0.28, hgt, (x + w / 2, -0.06, z + hgt / 2 + 0.02), cols[k % len(cols)]))
            x += w + 0.01
            k += 1
    export('furniture', 'bookshelf_medieval', [join(p, 'bookshelf_medieval')])


def writing_desk():
    reset()
    p = [box(1.4, 0.7, 0.08, (0, 0, 0.78), 'wood')] + legs(1.4, 0.7, 0.74, 0.08, 0.08)
    p += [box(0.35, 0.25, 0.01, (-0.1, -0.05, 0.825), 'cloth'), box(0.3, 0.22, 0.06, (0.35, 0.05, 0.85), 'red'),
          cyl(0.03, 0.08, (0.55, 0.2, 0.86), 'black'), cyl(0.04, 0.12, (-0.5, 0.2, 0.88), 'candle'), cone(0.03, 0.06, (-0.5, 0.2, 0.97), 'flame', verts=5),
          box(0.9, 0.3, 0.6, (0, 0.2, 1.12), 'wood_dark')]
    export('furniture', 'writing_desk', [join(p, 'writing_desk')])


def lectern():
    reset()
    p = [cyl(0.25, 0.08, (0, 0, 0.04), 'wood_dark', verts=8), cyl(0.07, 1.0, (0, 0, 0.55), 'wood'),
         box(0.6, 0.45, 0.06, (0, 0, 1.1), 'wood_dark', rot=(R(-25), 0, 0)), box(0.5, 0.35, 0.05, (0, -0.01, 1.15), 'cloth', rot=(R(-25), 0, 0))]
    export('furniture', 'lectern', [join(p, 'lectern')])


def chair_medieval():
    reset()
    p = [box(0.5, 0.5, 0.06, (0, 0, 0.46), 'wood')] + legs(0.5, 0.5, 0.44, 0.04, 0.06)
    p += [box(0.06, 0.06, 0.6, (x, 0.22, 0.78), 'wood_dark') for x in (-0.22, 0.22)]
    p += [box(0.5, 0.04, 0.35, (0, 0.23, 0.85), 'wood'), box(0.4, 0.4, 0.04, (0, 0, 0.5), 'red')]
    export('furniture', 'chair_medieval', [join(p, 'chair_medieval')])


def stool():
    reset()
    p = [cyl(0.2, 0.06, (0, 0, 0.45), 'wood', verts=8)]
    for a in range(3):
        ang = a * 2 * math.pi / 3
        p.append(cyl(0.025, 0.46, (math.cos(ang) * 0.12, math.sin(ang) * 0.12, 0.22), 'wood_dark', rot=(math.sin(ang) * 0.2, -math.cos(ang) * 0.2, 0)))
    export('furniture', 'stool_wood', [join(p, 'stool_wood')])


def round_table():
    reset()
    p = [cyl(0.7, 0.08, (0, 0, 0.76), 'wood', verts=12), cyl(0.1, 0.72, (0, 0, 0.36), 'wood_dark', verts=8), cyl(0.4, 0.06, (0, 0, 0.03), 'wood_dark', verts=8),
         cyl(0.06, 0.12, (0.2, 0.1, 0.86), 'iron', verts=8), cyl(0.06, 0.12, (-0.25, -0.15, 0.86), 'iron', verts=8)]
    export('furniture', 'round_table', [join(p, 'round_table')])


def weapon_rack():
    reset()
    p = [box(1.6, 0.4, 0.1, (0, 0, 0.05), 'wood_dark'), box(1.6, 0.1, 0.1, (0, 0.1, 1.5), 'wood_dark'),
         box(0.1, 0.1, 1.6, (-0.75, 0.1, 0.8), 'wood_dark'), box(0.1, 0.1, 1.6, (0.75, 0.1, 0.8), 'wood_dark'), box(1.5, 0.08, 0.06, (0, 0.1, 0.5), 'wood')]
    for i in range(5):
        x = -0.55 + i * 0.27
        if i % 2:
            p += [cyl(0.02, 1.9, (x, 0.05, 0.95), 'wood'), cone(0.04, 0.25, (x, 0.05, 2.0), 'iron', verts=4)]
        else:
            p += [box(0.06, 0.02, 1.1, (x, 0.05, 1.0), 'iron'), box(0.22, 0.04, 0.04, (x, 0.05, 0.45), 'gold'), cyl(0.025, 0.25, (x, 0.05, 0.3), 'leather')]
    export('furniture', 'weapon_rack', [join(p, 'weapon_rack')])


def armor_stand():
    reset()
    p = [cyl(0.3, 0.06, (0, 0, 0.03), 'wood_dark', verts=8), cyl(0.04, 1.2, (0, 0, 0.6), 'wood'),
         box(0.5, 0.3, 0.65, (0, 0, 1.25), 'iron'), sphere(0.17, (0, 0, 1.75), 'iron', scale=(1, 1, 1.15)), box(0.24, 0.05, 0.05, (0, -0.16, 1.75), 'black'),
         box(0.62, 0.32, 0.12, (0, 0, 1.55), 'iron'), box(0.5, 0.32, 0.3, (0, 0, 0.82), 'red'),
         cyl(0.05, 0.25, (0, 0, 1.97), 'red', r2=0.0)]
    export('furniture', 'armor_stand', [join(p, 'armor_stand')])


def shield_wall():
    reset()
    p = []
    for i, (x, c) in enumerate([(-0.7, 'red'), (0, 'blue'), (0.7, 'green')]):
        p += [cyl(0.32, 0.05, (x, 0, 1.6), c, verts=10, rot=(R(90), 0, 0)), sphere(0.06, (x, -0.04, 1.6), 'gold')]
    p += [box(0.06, 0.04, 1.4, (-0.35, 0.03, 1.6), 'iron', rot=(0, R(35), 0)), box(0.06, 0.04, 1.4, (0.35, 0.03, 1.6), 'iron', rot=(0, R(-35), 0))]
    export('furniture', 'shield_wall', [join(p, 'shield_wall')])


def pew():
    reset()
    p = [box(2.4, 0.45, 0.06, (0, 0, 0.45), 'wood'), box(2.4, 0.06, 0.55, (0, 0.22, 0.75), 'wood'),
         box(0.08, 0.55, 1.0, (-1.2, 0.03, 0.5), 'wood_dark'), box(0.08, 0.55, 1.0, (1.2, 0.03, 0.5), 'wood_dark')]
    export('furniture', 'pew', [join(p, 'pew')])


def altar():
    reset()
    p = [box(2.0, 0.9, 1.0, (0, 0, 0.5), 'stone_light'), box(2.1, 1.0, 0.08, (0, 0, 1.04), 'white'), box(0.3, 1.01, 0.9, (0, 0, 0.55), 'red'),
         box(0.06, 0.06, 0.6, (0, 0.2, 1.38), 'gold'), box(0.36, 0.06, 0.06, (0, 0.2, 1.5), 'gold')]
    for x in (-0.7, 0.7):
        p += [cyl(0.04, 0.3, (x, 0.1, 1.23), 'candle'), cone(0.03, 0.06, (x, 0.1, 1.42), 'flame', verts=5)]
    export('furniture', 'altar', [join(p, 'altar')])


def wine_rack():
    reset()
    p = [box(1.8, 0.5, 2.0, (0, 0.05, 1.0), 'wood_dark')]
    for r in range(5):
        for c in range(6):
            x, z = -0.75 + c * 0.3, 0.25 + r * 0.38
            p += [box(0.27, 0.45, 0.33, (x, -0.02, z), 'black'), cyl(0.06, 0.4, (x, -0.06, z), 'green' if (r + c) % 3 else 'red', verts=6, rot=(R(90), 0, 0))]
    export('furniture', 'wine_rack', [join(p, 'wine_rack')])


def cask():
    reset()
    p = [cyl(0.65, 1.5, (0, 0, 0.85), 'wood', verts=12, rot=(R(90), 0, 0))]
    for y in (-0.6, -0.2, 0.2, 0.6):
        p.append(cyl(0.67, 0.07, (0, y, 0.85), 'iron', verts=12, rot=(R(90), 0, 0)))
    p += [box(0.2, 1.4, 0.3, (x, 0, 0.15), 'wood_dark') for x in (-0.45, 0.45)]
    p.append(cyl(0.05, 0.15, (0, -0.8, 0.5), 'wood_dark', rot=(R(90), 0, 0)))
    export('furniture', 'cask', [join(p, 'cask')])


def cell_bars():
    reset()
    p = [box(3.0, 0.12, 0.12, (0, 0, z), 'iron') for z in (0.05, 1.2, 2.4)]
    p += [cyl(0.03, 2.4, (-1.45 + i * 0.2, 0, 1.2), 'iron', verts=6) for i in range(15)]
    export('furniture', 'cell_bars', [join(p, 'cell_bars')])


def shackles():
    reset()
    p = [box(0.2, 0.05, 0.2, (x, 0.05, 1.6), 'iron') for x in (-0.4, 0.4)]
    for x in (-0.4, 0.4):
        for i in range(4):
            p.append(torus(0.05, 0.012, (x, 0, 1.5 - i * 0.09), 'iron', rot=(0, R(90 * (i % 2)), 0), major=8))
        p.append(torus(0.08, 0.02, (x, -0.02, 1.1), 'iron', rot=(R(90), 0, 0), major=10))
    export('furniture', 'shackles', [join(p, 'shackles')])


def straw_pile():
    reset()
    p = [sphere(0.8, (0, 0, 0), 'straw', seg=8, rings=5, scale=(1.3, 1, 0.35)), sphere(0.5, (0.5, 0.2, 0.05), 'hay', seg=7, rings=4, scale=(1, 1, 0.4))]
    export('furniture', 'straw_pile', [join(p, 'straw_pile')])


def rug(name, color, w=2.4, d=1.6, border='gold'):
    reset()
    p = [box(w, d, 0.02, (0, 0, 0.01), border), box(w - 0.2, d - 0.2, 0.025, (0, 0, 0.012), color)]
    p.append(box(w * 0.4, d * 0.4, 0.03, (0, 0, 0.014), border, rot=(0, 0, R(45))) if w == d else box(w * 0.5, d * 0.25, 0.03, (0, 0, 0.014), border))
    export('furniture', name, [join(p, name)])


def tapestry(name, color):
    reset()
    p = [cyl(0.03, 2.2, (0, 0, 2.6), 'wood_dark', rot=(0, R(90), 0)), box(2.0, 0.03, 2.4, (0, 0, 1.4), color),
         box(1.8, 0.035, 2.2, (0, -0.005, 1.4), 'cloth'), box(1.6, 0.04, 2.0, (0, -0.01, 1.4), color),
         box(0.6, 0.045, 0.6, (0, -0.015, 1.6), 'gold', rot=(0, R(45), 0)), box(0.2, 0.045, 1.2, (0, -0.016, 1.3), 'gold')]
    export('furniture', name, [join(p, name)])


def bar_counter():
    reset()
    p = [box(3.0, 0.7, 1.05, (0, 0, 0.52), 'wood_dark'), box(3.1, 0.8, 0.08, (0, 0, 1.08), 'wood')]
    for x in (-1.0, -0.6, 0.5, 1.1):
        p.append(cyl(0.06, 0.16, (x, 0, 1.2), 'wood_light', verts=8))
    export('furniture', 'bar_counter', [join(p, 'bar_counter')])


def forge():
    reset()
    p = [box(1.8, 1.4, 0.9, (0, 0, 0.45), 'stone'), box(1.4, 1.0, 0.1, (0, 0, 0.92), 'black'), cone(0.35, 0.4, (0, 0, 1.1), 'flame', verts=6),
         box(1.2, 1.0, 0.8, (0, 0.2, 2.6), 'stone_dark'), box(0.6, 0.5, 1.4, (0, 0.3, 1.6), 'stone_dark'),
         box(0.8, 0.5, 0.35, (1.2, 0, 0.6), 'leather')]
    export('furniture', 'forge', [join(p, 'forge')])


def anvil():
    reset()
    p = [cyl(0.3, 0.6, (0, 0, 0.3), 'wood_dark', verts=8), box(0.5, 0.22, 0.12, (0, 0, 0.66), 'iron'), box(0.7, 0.26, 0.15, (0.05, 0, 0.79), 'iron'),
         cone(0.12, 0.3, (0.52, 0, 0.8), 'iron', verts=4, rot=(0, R(90), 0))]
    export('furniture', 'anvil', [join(p, 'anvil')])


if __name__ == '__main__':
    long_table(); bench_long(); throne(); chandelier(); candle_stand(); candelabra()
    bed_fourposter(); bed_simple(); wardrobe(); chest_large(); nightstand()
    hearth(); fireplace(); kitchen_table(); cooking_pot(); pot_shelf(); bread_oven()
    bookshelf(); writing_desk(); lectern(); chair_medieval(); stool(); round_table()
    weapon_rack(); armor_stand(); shield_wall(); pew(); altar(); wine_rack(); cask()
    cell_bars(); shackles(); straw_pile(); bar_counter(); forge(); anvil()
    rug('rug_red', 'red'); rug('rug_blue', 'blue', 2.0, 2.0); rug('rug_runner', 'red', 1.2, 6.0)
    tapestry('tapestry_red', 'red'); tapestry('tapestry_blue', 'blue'); tapestry('tapestry_green', 'green')
