"""Shared helpers for headless Blender asset generation (low-poly, flat-shaded, palette materials).

Run via:  blender --background --factory-startup --python blender/<script>.py -- <out_dir>
Each script writes GLBs into <out_dir>/<category>/<name>.glb (later optimized by scripts/convert-assets.mjs).
"""
import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector, Matrix

PALETTE = {
    'stone': (0.50, 0.49, 0.46), 'stone_dark': (0.36, 0.35, 0.33), 'stone_light': (0.66, 0.64, 0.60),
    'sandstone': (0.78, 0.68, 0.50), 'wood': (0.45, 0.30, 0.18), 'wood_dark': (0.30, 0.19, 0.11),
    'wood_light': (0.62, 0.45, 0.28), 'iron': (0.22, 0.22, 0.24), 'gold': (0.85, 0.66, 0.22),
    'red': (0.55, 0.10, 0.08), 'blue': (0.14, 0.22, 0.48), 'green': (0.18, 0.36, 0.16),
    'cloth': (0.86, 0.80, 0.68), 'straw': (0.85, 0.72, 0.38), 'flame': (1.0, 0.62, 0.16),
    'white': (0.92, 0.92, 0.90), 'black': (0.06, 0.06, 0.06), 'purple': (0.36, 0.16, 0.42),
    'leather': (0.42, 0.24, 0.14), 'glass': (0.55, 0.75, 0.85), 'water': (0.25, 0.45, 0.55),
    'duck_body': (0.55, 0.42, 0.28), 'duck_head': (0.10, 0.38, 0.18), 'beak': (0.95, 0.62, 0.12),
    'goat': (0.88, 0.85, 0.78), 'goat_dark': (0.35, 0.30, 0.26), 'horn': (0.55, 0.50, 0.42),
    'pink': (0.92, 0.62, 0.62), 'brick': (0.58, 0.30, 0.22), 'candle': (0.95, 0.92, 0.80),
    'hay': (0.80, 0.68, 0.32), 'hedge': (0.22, 0.42, 0.18),
}
_mats = {}


def out_dir():
    if '--' in sys.argv:
        return sys.argv[sys.argv.index('--') + 1]
    return os.path.join(os.path.dirname(__file__), '..', 'assets-raw', 'blender')


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _mats.clear()


def mat(name):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    col = PALETTE.get(name, (0.8, 0.8, 0.8))
    bsdf.inputs['Base Color'].default_value = (*col, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.85
    if name in ('iron', 'gold'):
        bsdf.inputs['Metallic'].default_value = 0.6
        bsdf.inputs['Roughness'].default_value = 0.45
    if name == 'flame':
        bsdf.inputs['Emission Color'].default_value = (1.0, 0.55, 0.12, 1)
        bsdf.inputs['Emission Strength'].default_value = 4.0
    if name == 'glass':
        bsdf.inputs['Emission Color'].default_value = (0.9, 0.7, 0.3, 1)
        bsdf.inputs['Emission Strength'].default_value = 0.0
    _mats[name] = m
    return m


def _finish(obj, material, name):
    obj.name = name or obj.name
    if material:
        obj.data.materials.clear()
        obj.data.materials.append(mat(material))
    for p in obj.data.polygons:
        p.use_smooth = False
    return obj


def box(sx, sy, sz, loc=(0, 0, 0), material='wood', name=None, rot=(0, 0, 0)):
    """Box sized sx (X) * sy (Y, depth) * sz (Z, up). loc is the box centre. Blender Z-up."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _finish(o, material, name)


def cyl(r, depth, loc=(0, 0, 0), material='wood', verts=8, name=None, rot=(0, 0, 0), r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot)
    return _finish(bpy.context.active_object, material, name)


def cone(r, depth, loc=(0, 0, 0), material='red', verts=8, name=None, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=0, depth=depth, location=loc, rotation=rot)
    return _finish(bpy.context.active_object, material, name)


def sphere(r, loc=(0, 0, 0), material='white', seg=8, rings=6, name=None, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=r, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _finish(o, material, name)


def torus(R, r, loc=(0, 0, 0), material='iron', name=None, rot=(0, 0, 0), major=12, minor=4):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=major, minor_segments=minor, location=loc, rotation=rot)
    return _finish(bpy.context.active_object, material, name)


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    return o


def bevel(obj, width=0.02, segments=1):
    m = obj.modifiers.new('bev', 'BEVEL')
    m.width = width
    m.segments = segments
    m.limit_method = 'ANGLE'
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier='bev')
    return obj


def export(category, name, objects=None, animations=False):
    """Export current scene (or the given objects) as GLB. Y-up conversion handled by exporter."""
    d = os.path.join(out_dir(), category)
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, name + '.glb')
    bpy.ops.object.select_all(action='DESELECT')
    if objects:
        for o in objects:
            o.select_set(True)
            for c in o.children_recursive:
                c.select_set(True)
    kw = dict(filepath=path, export_format='GLB', export_apply=True, export_yup=True,
              use_selection=bool(objects), export_animations=animations)
    if animations:
        kw['export_animation_mode'] = 'ACTIONS'
        kw['export_force_sampling'] = True
    bpy.ops.export_scene.gltf(**kw)
    print('EXPORTED', category, name)
    return path


def ring_points(n, r, z=0.0, start=0.0):
    return [(math.cos(start + i * 2 * math.pi / n) * r, math.sin(start + i * 2 * math.pi / n) * r, z) for i in range(n)]


def mesh_from(verts, faces, name, material):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    return _finish(o, material, name)
