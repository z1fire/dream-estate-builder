"""Farm, garden and animal assets missing from the packs: scarecrow, beehive, troughs, haystack, fruit tree,
fountain, statue, sundial, birdbath, rose arch, market goods; plus animated duck and goat (armature + actions)."""
import math
import os
import sys
import bpy
sys.path.insert(0, os.path.dirname(__file__))
from common import reset, box, cyl, cone, sphere, torus, join, export, mesh_from  # noqa: E402

R = math.radians


def scarecrow():
    reset()
    p = [cyl(0.05, 2.4, (0, 0, 1.2), 'wood_dark'), cyl(0.04, 1.6, (0, 0, 1.7), 'wood_dark', rot=(0, R(90), 0)),
         box(0.55, 0.3, 0.7, (0, 0, 1.55), 'blue'), box(1.5, 0.2, 0.2, (0, 0, 1.75), 'blue'), sphere(0.2, (0, 0, 2.1), 'cloth'),
         cyl(0.35, 0.04, (0, 0, 2.25), 'straw', verts=10), cone(0.2, 0.35, (0, 0, 2.42), 'straw', verts=8),
         box(0.5, 0.25, 0.25, (0, 0, 1.12), 'leather')]
    for x in (-0.8, 0.8):
        p.append(cone(0.08, 0.2, (x, 0, 1.75), 'straw', verts=5, rot=(0, R(90 if x > 0 else -90), 0)))
    export('farm', 'scarecrow', [join(p, 'scarecrow')])


def beehive():
    reset()
    p = [box(0.6, 0.6, 0.06, (0, 0, 0.55), 'wood'), box(0.06, 0.06, 0.55, (0.24, 0.24, 0.27), 'wood_dark'), box(0.06, 0.06, 0.55, (-0.24, -0.24, 0.27), 'wood_dark'),
         box(0.06, 0.06, 0.55, (0.24, -0.24, 0.27), 'wood_dark'), box(0.06, 0.06, 0.55, (-0.24, 0.24, 0.27), 'wood_dark')]
    for i in range(5):
        r = 0.28 - i * 0.045
        p.append(cyl(r, 0.11, (0, 0, 0.64 + i * 0.1), 'straw' if i % 2 else 'hay', verts=10, r2=r - 0.04))
    p.append(box(0.1, 0.05, 0.06, (0, -0.27, 0.62), 'black'))
    export('farm', 'beehive', [join(p, 'beehive')])


def water_trough():
    reset()
    p = [box(2.0, 0.6, 0.5, (0, 0, 0.3), 'wood'), box(1.85, 0.45, 0.05, (0, 0, 0.5), 'water')]
    p += [box(0.12, 0.7, 0.15, (x, 0, 0.06), 'wood_dark') for x in (-0.8, 0.8)]
    export('farm', 'water_trough', [join(p, 'water_trough')])


def feed_trough():
    reset()
    p = [box(1.6, 0.5, 0.35, (0, 0, 0.3), 'wood_dark'), box(1.45, 0.38, 0.06, (0, 0, 0.45), 'hay')] + \
        [box(0.08, 0.08, 0.15, (x * 0.7, y * 0.2, 0.07), 'wood_dark') for x in (-1, 1) for y in (-1, 1)]
    export('farm', 'feed_trough', [join(p, 'feed_trough')])


def haystack():
    reset()
    p = [cyl(1.4, 1.4, (0, 0, 0.7), 'hay', verts=12, r2=1.25), cone(1.3, 1.6, (0, 0, 2.2), 'straw', verts=12), cyl(0.04, 0.6, (0, 0, 3.1), 'wood_dark')]
    export('farm', 'haystack', [join(p, 'haystack')])


def hay_bale_round():
    reset()
    p = [cyl(0.7, 1.1, (0, 0, 0.7), 'hay', verts=12, rot=(0, R(90), 0)), cyl(0.5, 1.12, (0, 0, 0.7), 'straw', verts=12, rot=(0, R(90), 0))]
    export('farm', 'hay_bale_round', [join(p, 'hay_bale_round')])


def fruit_tree(name='tree_apple', fruit='red'):
    reset()
    p = [cyl(0.16, 1.8, (0, 0, 0.9), 'wood', verts=7, r2=0.12)]
    for (x, y, z, s) in [(0, 0, 2.4, 1.15), (0.6, 0.2, 2.1, 0.8), (-0.55, -0.25, 2.15, 0.85), (0.1, -0.5, 2.7, 0.7)]:
        p.append(sphere(s, (x, y, z), 'green', seg=8, rings=5))
    for i in range(14):
        a = i * 2.4
        rr = 0.95 + (i % 3) * 0.12
        p.append(sphere(0.09, (math.cos(a) * rr, math.sin(a) * rr, 2.0 + (i % 4) * 0.22), fruit, seg=6, rings=4))
    export('trees', name, [join(p, name)])


def fountain_tiered():
    reset()
    p = []
    for i in range(16):
        a = i * 2 * math.pi / 16
        p.append(box(0.85, 0.35, 0.6, (math.cos(a) * 2.2, math.sin(a) * 2.2, 0.3), 'stone_light', rot=(0, 0, a + math.pi / 2)))
    p += [cyl(2.1, 0.1, (0, 0, 0.45), 'water', verts=16), cyl(0.3, 1.6, (0, 0, 0.8), 'stone', verts=8),
          cyl(1.0, 0.25, (0, 0, 1.6), 'stone_light', verts=12, r2=0.7), cyl(0.85, 0.06, (0, 0, 1.72), 'water', verts=12),
          cyl(0.15, 0.8, (0, 0, 2.1), 'stone', verts=8), cyl(0.45, 0.15, (0, 0, 2.5), 'stone_light', verts=10, r2=0.3), sphere(0.15, (0, 0, 2.7), 'stone_light')]
    export('garden', 'fountain_tiered', [join(p, 'fountain_tiered')])


def statue_knight():
    reset()
    p = [box(1.2, 1.2, 1.0, (0, 0, 0.5), 'stone_dark'), box(1.3, 1.3, 0.15, (0, 0, 1.05), 'stone'),
         box(0.25, 0.25, 0.9, (-0.18, 0, 1.6), 'stone_light'), box(0.25, 0.25, 0.9, (0.18, 0, 1.6), 'stone_light'),
         box(0.7, 0.4, 0.9, (0, 0, 2.45), 'stone_light'), sphere(0.22, (0, 0, 3.1), 'stone_light'), box(0.3, 0.3, 0.12, (0, -0.1, 3.08), 'stone'),
         box(0.18, 0.18, 0.75, (-0.45, 0, 2.4), 'stone_light'), box(0.12, 0.05, 1.6, (0.45, -0.25, 2.3), 'stone_light'),
         box(0.4, 0.05, 0.08, (0.45, -0.25, 2.8), 'stone'), box(0.55, 0.1, 0.75, (-0.6, -0.15, 2.3), 'stone')]
    export('garden', 'statue_knight', [join(p, 'statue_knight')])


def sundial():
    reset()
    p = [cyl(0.4, 0.15, (0, 0, 0.07), 'stone', verts=10), cyl(0.15, 0.85, (0, 0, 0.55), 'stone_light', verts=8), cyl(0.4, 0.08, (0, 0, 1.0), 'stone_light', verts=12),
         mesh_from([(0, -0.25, 1.04), (0, 0.25, 1.04), (0, 0.25, 1.3)], [(0, 1, 2)], 'gnomon', 'gold')]
    export('garden', 'sundial', [join(p, 'sundial')])


def birdbath():
    reset()
    p = [cyl(0.3, 0.1, (0, 0, 0.05), 'stone', verts=8), cyl(0.1, 0.8, (0, 0, 0.5), 'stone_light', verts=8), cyl(0.5, 0.15, (0, 0, 0.95), 'stone_light', verts=12, r2=0.35),
         cyl(0.42, 0.03, (0, 0, 1.0), 'water', verts=12)]
    export('garden', 'birdbath', [join(p, 'birdbath')])


def rose_arch():
    reset()
    p = []
    for x in (-1.0, 1.0):
        for y in (-0.3, 0.3):
            p.append(box(0.08, 0.08, 2.2, (x, y, 1.1), 'white'))
    for i in range(9):
        a = math.pi * i / 8
        for y in (-0.3, 0.3):
            p.append(box(0.08, 0.08, 0.35, (math.cos(a) * 1.0, y, 2.2 + math.sin(a) * 0.6), 'white', rot=(0, -a + math.pi / 2, 0)))
    for i in range(18):
        a = i * 1.9
        side = -1 if i % 2 else 1
        z = 0.4 + (i * 0.37) % 2.4
        p.append(sphere(0.18, (side * 1.0 + math.cos(a) * 0.05, math.sin(a) * 0.3, z), 'hedge', seg=6, rings=4))
        if i % 3 == 0:
            p.append(sphere(0.07, (side * 1.0, -0.36, z + 0.05), 'red', seg=5, rings=3))
    export('garden', 'rose_arch', [join(p, 'rose_arch')])


def market_goods():
    reset()
    p = [box(1.4, 0.8, 0.05, (0, 0, 0.0), 'wood')]
    cols = ['red', 'green', 'gold', 'purple']
    for i in range(4):
        p.append(cyl(0.2, 0.12, (-0.48 + i * 0.32, 0, 0.08), 'wood_light', verts=8))
        for j in range(5):
            p.append(sphere(0.06, (-0.48 + i * 0.32 + (j % 3 - 1) * 0.07, (j // 3 - 0.5) * 0.08, 0.17 + (j % 2) * 0.03), cols[i], seg=5, rings=3))
    export('village', 'market_goods', [join(p, 'market_goods')])


def signpost():
    reset()
    p = [cyl(0.06, 2.3, (0, 0, 1.15), 'wood_dark'), box(0.9, 0.05, 0.25, (0.35, 0, 1.9), 'wood_light'), box(0.8, 0.05, 0.22, (-0.3, 0, 1.55), 'wood_light', rot=(0, 0, R(20)))]
    export('village', 'signpost', [join(p, 'signpost')])


def windmill_sails():
    """Separate rotating sail assembly for the windmill building (rotates around local +Y in three / -Y blender)."""
    reset()
    p = [cyl(0.25, 0.4, (0, 0, 0), 'wood_dark', rot=(R(90), 0, 0))]
    for i in range(4):
        a = i * math.pi / 2
        p.append(box(0.15, 0.1, 5.5, (math.sin(a) * 2.75, -0.15, math.cos(a) * 2.75), 'wood_dark', rot=(0, a, 0)))
        p.append(box(0.9, 0.04, 4.2, (math.sin(a) * 3.0 + math.cos(a) * 0.5, -0.2, math.cos(a) * 3.0 - math.sin(a) * 0.5), 'cloth', rot=(0, a, 0)))
    export('village', 'windmill_sails', [join(p, 'windmill_sails')])


def waterwheel():
    reset()
    p = [cyl(0.2, 1.4, (0, 0, 0), 'wood_dark', rot=(0, R(90), 0))]
    for side in (-0.55, 0.55):
        p.append(torus(2.0, 0.08, (side, 0, 0), 'wood_dark', rot=(0, R(90), 0), major=16))
    for i in range(12):
        a = i * math.pi / 6
        p.append(box(1.2, 0.08, 0.6, (0, math.cos(a) * 2.0, math.sin(a) * 2.0), 'wood', rot=(a, 0, 0)))
        p.append(box(0.08, 0.06, 2.0, (0.55, math.cos(a) * 1.0, math.sin(a) * 1.0), 'wood_dark', rot=(a - math.pi / 2, 0, 0)))
    export('village', 'waterwheel', [join(p, 'waterwheel')])


# ---------------- animated animals ----------------
def _armature(bones):
    """bones: list of (name, head, tail, parent). Returns armature object."""
    bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
    arm = bpy.context.active_object
    arm.name = 'Armature'
    eb = arm.data.edit_bones
    eb.remove(eb[0])
    made = {}
    for name, head, tail, parent in bones:
        b = eb.new(name)
        b.head, b.tail = head, tail
        if parent:
            b.parent = made[parent]
        made[name] = b
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in arm.pose.bones:
        pb.rotation_mode = 'XYZ'
    return arm


def _attach(obj, arm, bone):
    bpy.context.view_layer.update()
    mw = obj.matrix_world.copy()
    obj.parent = arm
    obj.parent_type = 'BONE'
    obj.parent_bone = bone
    bpy.context.view_layer.update()
    obj.matrix_world = mw


def _action(arm, name, frames, keys):
    """keys: {bone: [(frame, (rx,ry,rz), (lx,ly,lz) or None), ...]}"""
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data_create()
    arm.animation_data.action = act
    for bone, ks in keys.items():
        pb = arm.pose.bones[bone]
        for f, rot, loc in ks:
            pb.rotation_euler = rot
            pb.keyframe_insert('rotation_euler', frame=f)
            if loc is not None:
                pb.location = loc
                pb.keyframe_insert('location', frame=f)
    for pb in arm.pose.bones:
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
    tr = arm.animation_data.nla_tracks.new()
    tr.name = name
    tr.strips.new(name, 1, act)
    arm.animation_data.action = None
    return act


def _swing(bone_names, amp, frames=24, phase=None):
    out = {}
    for i, b in enumerate(bone_names):
        ph = (phase[i] if phase else 0)
        out[b] = [(f, (R(amp) * math.sin(2 * math.pi * (f - 1) / frames + ph), 0, 0), None) for f in range(1, frames + 2, 4)]
    return out


def duck():
    reset()
    arm = _armature([
        ('root', (0, 0, 0.15), (0, 0, 0.3), None),
        ('body', (0, 0, 0.2), (0, -0.1, 0.25), 'root'),
        ('neck', (0, -0.15, 0.3), (0, -0.18, 0.42), 'body'),
        ('leg_l', (-0.06, 0, 0.15), (-0.06, 0, 0.02), 'root'),
        ('leg_r', (0.06, 0, 0.15), (0.06, 0, 0.02), 'root'),
    ])
    body = sphere(0.16, (0, 0.02, 0.22), 'duck_body', seg=8, rings=6, scale=(0.85, 1.35, 0.8))
    tail = cone(0.07, 0.14, (0, 0.22, 0.27), 'duck_body', verts=5, rot=(R(-70), 0, 0))
    wing_l = sphere(0.1, (-0.12, 0.03, 0.25), 'wood', seg=6, rings=4, scale=(0.4, 1.3, 0.6))
    wing_r = sphere(0.1, (0.12, 0.03, 0.25), 'wood', seg=6, rings=4, scale=(0.4, 1.3, 0.6))
    head = sphere(0.085, (0, -0.2, 0.43), 'duck_head', seg=8, rings=6)
    neck = cyl(0.05, 0.14, (0, -0.17, 0.34), 'duck_head', verts=6)
    beak = box(0.07, 0.1, 0.03, (0, -0.3, 0.42), 'beak')
    eyes = [sphere(0.015, (s * 0.06, -0.25, 0.46), 'black', seg=4, rings=3) for s in (-1, 1)]
    legs = [cyl(0.012, 0.12, (s * 0.06, 0, 0.08), 'beak', verts=4) for s in (-1, 1)]
    feet = [box(0.06, 0.07, 0.01, (s * 0.06, -0.02, 0.01), 'beak') for s in (-1, 1)]
    b = join([body, tail, wing_l, wing_r], 'duck_body')
    h = join([head, neck, beak] + eyes, 'duck_head')
    ll = join([legs[0], feet[0]], 'duck_leg_l')
    lr = join([legs[1], feet[1]], 'duck_leg_r')
    _attach(b, arm, 'body'); _attach(h, arm, 'neck'); _attach(ll, arm, 'leg_l'); _attach(lr, arm, 'leg_r')
    _action(arm, 'Idle', 48, {'neck': [(1, (0, 0, 0), None), (24, (R(8), 0, R(10)), None), (48, (0, 0, 0), None)],
                              'body': [(1, (0, 0, 0), None), (24, (R(2), 0, 0), None), (48, (0, 0, 0), None)]})
    walk = _swing(['leg_l', 'leg_r'], 30, 16, [0, math.pi])
    walk['root'] = [(f, (0, R(6) * math.sin(2 * math.pi * (f - 1) / 16), 0), None) for f in range(1, 18, 4)]
    _action(arm, 'Walk', 16, walk)
    _action(arm, 'Eat', 40, {'neck': [(1, (0, 0, 0), None), (12, (R(-75), 0, 0), None), (28, (R(-70), 0, 0), None), (40, (0, 0, 0), None)],
                             'body': [(1, (0, 0, 0), None), (12, (R(-15), 0, 0), None), (28, (R(-15), 0, 0), None), (40, (0, 0, 0), None)]})
    _action(arm, 'Swim', 32, {'body': [(1, (0, 0, 0), None), (16, (R(-4), 0, R(3)), None), (32, (0, 0, 0), None)],
                              'leg_l': [(1, (R(-30), 0, 0), None), (16, (R(30), 0, 0), None), (32, (R(-30), 0, 0), None)],
                              'leg_r': [(1, (R(30), 0, 0), None), (16, (R(-30), 0, 0), None), (32, (R(30), 0, 0), None)]})
    export('animals', 'duck', [arm], animations=True)


def goat():
    reset()
    H = 0.55  # leg length
    arm = _armature([
        ('root', (0, 0, H), (0, 0, H + 0.2), None),
        ('neck', (0, -0.42, H + 0.25), (0, -0.55, H + 0.5), 'root'),
        ('tail', (0, 0.42, H + 0.25), (0, 0.5, H + 0.35), 'root'),
        ('leg_fl', (-0.15, -0.3, H), (-0.15, -0.3, 0), 'root'),
        ('leg_fr', (0.15, -0.3, H), (0.15, -0.3, 0), 'root'),
        ('leg_bl', (-0.15, 0.3, H), (-0.15, 0.3, 0), 'root'),
        ('leg_br', (0.15, 0.3, H), (0.15, 0.3, 0), 'root'),
    ])
    body = join([box(0.42, 0.95, 0.42, (0, 0, H + 0.2), 'goat'), box(0.3, 0.3, 0.12, (0, 0.1, H - 0.05), 'pink')], 'goat_body')
    head = join([box(0.2, 0.32, 0.22, (0, -0.68, H + 0.55), 'goat'), box(0.22, 0.15, 0.25, (0, -0.55, H + 0.42), 'goat'),
                 cone(0.04, 0.25, (-0.07, -0.6, H + 0.75), 'horn', verts=5, rot=(R(30), 0, 0)), cone(0.04, 0.25, (0.07, -0.6, H + 0.75), 'horn', verts=5, rot=(R(30), 0, 0)),
                 box(0.06, 0.05, 0.12, (0, -0.82, H + 0.38), 'goat_dark'), box(0.16, 0.05, 0.06, (-0.15, -0.62, H + 0.6), 'goat', rot=(0, R(-30), 0)),
                 box(0.16, 0.05, 0.06, (0.15, -0.62, H + 0.6), 'goat', rot=(0, R(30), 0)),
                 sphere(0.02, (-0.1, -0.78, H + 0.6), 'black', seg=4, rings=3), sphere(0.02, (0.1, -0.78, H + 0.6), 'black', seg=4, rings=3)], 'goat_head')
    tail = box(0.08, 0.16, 0.06, (0, 0.5, H + 0.35), 'goat', rot=(R(-35), 0, 0))
    legs = {}
    for n, x, y in [('leg_fl', -0.15, -0.3), ('leg_fr', 0.15, -0.3), ('leg_bl', -0.15, 0.3), ('leg_br', 0.15, 0.3)]:
        legs[n] = join([box(0.09, 0.09, H, (x, y, H / 2 + 0.03), 'goat'), box(0.1, 0.1, 0.06, (x, y, 0.03), 'goat_dark')], 'goat_' + n)
    _attach(body, arm, 'root'); _attach(head, arm, 'neck'); _attach(tail, arm, 'tail')
    for n, o in legs.items():
        _attach(o, arm, n)
    _action(arm, 'Idle', 60, {'neck': [(1, (0, 0, 0), None), (20, (R(-5), 0, R(12)), None), (40, (R(3), 0, R(-8)), None), (60, (0, 0, 0), None)],
                              'tail': [(f, (0, 0, R(20) * math.sin(f / 3)), None) for f in range(1, 62, 6)]})
    _action(arm, 'Walk', 24, _swing(['leg_fl', 'leg_fr', 'leg_bl', 'leg_br'], 25, 24, [0, math.pi, math.pi, 0]))
    _action(arm, 'Eat', 48, {'neck': [(1, (0, 0, 0), None), (12, (R(-80), 0, 0), None), (24, (R(-72), 0, R(4)), None), (36, (R(-80), 0, 0), None), (48, (0, 0, 0), None)]})
    export('animals', 'goat', [arm], animations=True)


if __name__ == '__main__':
    scarecrow(); beehive(); water_trough(); feed_trough(); haystack(); hay_bale_round()
    fruit_tree('tree_apple', 'red'); fruit_tree('tree_pear', 'gold'); fruit_tree('tree_plum', 'purple')
    fountain_tiered(); statue_knight(); sundial(); birdbath(); rose_arch(); market_goods(); signpost()
    windmill_sails(); waterwheel()
    duck(); goat()
    _ = torus
