"""Period household pieces for livable interiors: wooden bathtub, washstand with basin and jug, garderobe (privy seat),
laundry wash tub with washboard, Chinese lacquered washstand. Front faces -Y (glTF +Z); wall pieces have their back at +Y."""
import math
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
from common import PALETTE, reset, box, cyl, sphere, torus, join, export  # noqa: E402

PALETTE.update({'lacquer': (0.58, 0.07, 0.05), 'lacquer_dark': (0.32, 0.05, 0.04), 'bronze': (0.42, 0.30, 0.16),
                'porcelain': (0.93, 0.93, 0.95), 'cobalt': (0.10, 0.20, 0.55), 'linen': (0.90, 0.88, 0.80)})


def wooden_tub():
    reset()
    p = [cyl(0.62, 0.62, (0, 0, 0.31), 'wood', verts=16, r2=0.68), cyl(0.58, 0.02, (0, 0, 0.5), 'water', verts=16)]
    for z in (0.1, 0.5):
        p.append(torus(0.66 if z > 0.3 else 0.63, 0.025, (0, 0, z), 'iron', major=16))
    p.append(box(0.9, 0.05, 0.5, (0.45, 0.55, 0.62), 'linen', rot=(math.radians(-70), 0, 0)))  # towel over the rim
    p.append(box(0.4, 0.4, 0.3, (0.9, 0, 0.15), 'wood_dark'))  # step stool
    export('furniture', 'wooden_tub', [join(p, 'wooden_tub')])


def washstand():
    reset()
    p = [box(0.8, 0.5, 0.06, (0, 0, 0.82), 'wood'), box(0.7, 0.42, 0.04, (0, 0, 0.3), 'wood')]
    for x in (-0.36, 0.36):
        for y in (-0.21, 0.21):
            p.append(box(0.05, 0.05, 0.82, (x, y, 0.41), 'wood_dark'))
    p += [box(0.8, 0.05, 0.3, (0, 0.23, 1.0), 'wood_dark'),  # splashback
          cyl(0.22, 0.1, (0, -0.02, 0.9), 'porcelain', verts=14, r2=0.15), cyl(0.07, 0.25, (0.25, 0.05, 0.97), 'porcelain', verts=10, r2=0.09),
          box(0.5, 0.03, 0.6, (0, 0.24, 1.55), 'glass')]  # mirror
    export('furniture', 'washstand', [join(p, 'washstand')])


def garderobe():
    reset()
    p = [box(1.0, 0.7, 0.5, (0, 0.1, 0.25), 'wood'), box(1.0, 0.25, 1.2, (0, 0.38, 0.85), 'wood_dark'),
         cyl(0.18, 0.02, (0, 0.05, 0.51), 'black', verts=12), box(0.5, 0.5, 0.03, (0, 0.05, 0.53), 'wood_light', rot=(math.radians(80), 0, 0)),
         box(0.3, 0.1, 0.15, (0.35, 0.3, 0.6), 'linen')]
    export('furniture', 'garderobe', [join(p, 'garderobe')])


def wash_tub():
    reset()
    p = [cyl(0.42, 0.45, (0, 0, 0.45), 'wood', verts=14, r2=0.48), cyl(0.4, 0.02, (0, 0, 0.62), 'water', verts=14),
         torus(0.45, 0.02, (0, 0, 0.5), 'iron', major=14), box(0.4, 0.06, 0.6, (0.1, 0.2, 0.75), 'wood_light', rot=(math.radians(-20), 0, 0))]
    for i in range(3):
        a = i * 2 * math.pi / 3
        p.append(box(0.06, 0.06, 0.25, (math.cos(a) * 0.35, math.sin(a) * 0.35, 0.12), 'wood_dark'))
    p += [box(0.7, 0.35, 0.3, (0.8, 0, 0.15), 'linen')]  # basket of linen
    export('furniture', 'wash_tub', [join(p, 'wash_tub')])


def cn_washstand():
    reset()
    p = []
    for i in range(6):
        a = i * math.pi / 3
        p.append(box(0.04, 0.04, 1.6 if i in (2, 3) else 0.8, (math.cos(a) * 0.28, math.sin(a) * 0.28, 0.8 if i in (2, 3) else 0.4), 'lacquer_dark'))
    p += [torus(0.28, 0.02, (0, 0, 0.75), 'lacquer_dark', major=12), cyl(0.26, 0.1, (0, 0, 0.82), 'bronze', verts=14, r2=0.2),
          box(0.7, 0.04, 0.05, (-0.1, 0.25, 1.55), 'lacquer_dark'), box(0.5, 0.02, 0.4, (-0.1, 0.27, 1.35), 'linen')]
    export('furniture', 'cn_washstand', [join(p, 'cn_washstand')])


if __name__ == '__main__':
    wooden_tub(); washstand(); garderobe(); wash_tub(); cn_washstand()
    _ = sphere
