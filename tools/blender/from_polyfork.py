# ============================================================================
# tools/blender/from_polyfork.py —— 把 Polyfork 的低模 GLB 渲染成游戏精灵
# ----------------------------------------------------------------------------
# 用法：
#   "D:/Apps/App_base/Blender 5.2/blender.exe" --background --python tools/blender/from_polyfork.py
#
# 输入：pkgFruit/assets/models/*.glb（来源与许可见 ../sprites/CREDITS.md）
# 输出：pkgFruit/assets/sprites/fruit-{apple,orange,banana,strawberry,watermelon}.png
#       （文件名与 sprites.js 的映射一致，替换后游戏自动生效，无需改代码）
#
# 统一化（game-art-prompt-pack 的纪律：同一视线平面 / 光源统一 / 构图统一）：
#   全部用同一套 WORKBENCH STUDIO 光 + 正交相机（正面微俯 12°）+ 相同画面占比，
#   不同作者做的模型摆在一起才不会像两个次元。
# 黄金苹果不在本脚本里 —— Polyfork 没有金苹果，继续用 fruits.py 的程序化版本。
# ============================================================================
import bpy
import math
import os
from mathutils import Vector

MODELS = [
    ('apple-b15012', 'fruit-apple.png', 2.6),
    ('orange-ea3791', 'fruit-orange.png', 2.6),
    ('banana-09c206', 'fruit-banana.png', 3.1),
    ('strawberry-57b7d5', 'fruit-strawberry.png', 2.9),
    ('watermelon-slice-bd255f', 'fruit-watermelon.png', 3.0),
]

ROOT = 'E:/demo - 副本/pkgFruit/assets'
RES = 160
ORTHO = 2.9

prev_scene = bpy.context.window.scene
tmp = bpy.data.scenes.new('__polyfork_build')
bpy.context.window.scene = tmp


def clamp(v, lo, hi):
    return lo if v < lo else (hi if v > hi else v)


def clear_scene():
    for o in list(tmp.collection.objects):
        bpy.data.objects.remove(o, do_unlink=True)


def render(out_png, ortho):
    cam_data = bpy.data.cameras.new('__cam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = ortho
    cam = bpy.data.objects.new('__cam', cam_data)
    tmp.collection.objects.link(cam)
    tmp.camera = cam
    cam.location = Vector((0, 7, 1.5))
    cam.rotation_euler = (Vector((0, 0, 0.2)) - cam.location).to_track_quat('-Z', 'Y').to_euler()

    tmp.render.engine = 'BLENDER_WORKBENCH'
    sh = tmp.display.shading
    sh.light = 'STUDIO'
    # Polyfork 的颜色在顶点色里 —— VERTEX 模式直接显示，多色模型
    # （西瓜切片的红瓤绿皮）不会被均值染色弄脏
    sh.color_type = 'VERTEX'
    sh.show_specular_highlight = True
    sh.show_cavity = True
    sh.cavity_type = 'BOTH'
    sh.show_shadows = False
    tmp.render.film_transparent = True
    tmp.render.resolution_x = RES
    tmp.render.resolution_y = RES
    tmp.render.filepath = out_png
    bpy.ops.render.render(write_still=True, scene=tmp.name)


def fix_materials(meshes):
    """Polyfork 的颜色在顶点色里（Base Color ← Vertex Color），
    WORKBENCH 的 MATERIAL 模式只读材质 viewport 色 —— 把顶点色均值写给材质。
    一个低模通常就一种主色，均值足够准。"""
    for o in meshes:
        me = o.data
        if not len(me.materials) or not me.color_attributes or len(me.color_attributes) == 0:
            continue
        ca = me.color_attributes[0]
        r = g = b = n = 0
        for d in ca.data:
            c = d.color
            r += c[0]
            g += c[1]
            b += c[2]
            n += 1
        if n == 0:
            continue
        col = (r / n, g / n, b / n, 1.0)
        for m in me.materials:
            if m:
                m.diffuse_color = col


def import_and_fit(glb_path, ortho):
    """导入 GLB → 合并 → 居中到原点 → 归一化到统一画面占比 → 返回"""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=glb_path)
    meshes = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']

    # 世界的包围盒
    pts = []
    for o in meshes:
        for corner in o.bound_box:
            pts.append(o.matrix_world @ Vector(corner))
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    center = (lo + hi) / 2
    radius = max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z) / 2
    if radius <= 0:
        radius = 1

    # 归一化：中心落原点，最大半径 → 1
    for o in meshes:
        o.location = (o.location - center) / radius
        o.scale = o.scale / radius

    # 平滑着色（低模也平滑，方角交给 cavity）
    for o in meshes:
        for p in o.data.polygons:
            p.use_smooth = True
    fix_materials(meshes)
    return meshes


for mid, out_name, ortho in MODELS:
    clear_scene()
    glb = os.path.join(ROOT, 'models', mid + '.glb')
    import_and_fit(glb, ortho)
    render(os.path.join(ROOT, 'sprites', out_name), ortho)
    print('rendered', out_name)

# 黄金苹果：复用 Polyfork 的苹果模型，顶点色整颗改成金色 ——
# 「连叶子都是金的」是比换色更清楚的奖励语言，且风格与其它水果完全一致
clear_scene()
import_and_fit(os.path.join(ROOT, 'models', 'apple-b15012.glb'), 2.6)
for o in [o for o in tmp.collection.objects if o.type == 'MESH']:
    me = o.data
    if not me.color_attributes or len(me.color_attributes) == 0:
        ca = me.color_attributes.new(name='gold', type='FLOAT_COLOR', domain='CORNER')
        for d in ca.data:
            d.color = (1.0, 0.80, 0.28, 1.0)
    else:
        ca = me.color_attributes[0]
        for d in ca.data:
            c = d.color
            # 原色向金色调制：保留一点明暗变化，别糊成一坨纯黄
            lum = (c[0] + c[1] + c[2]) / 3
            d.color = (0.98 + lum * 0.02, 0.72 + lum * 0.10, 0.18 + lum * 0.10, 1.0)
render(os.path.join(ROOT, 'sprites', 'fruit-golden.png'), 2.6)
print('rendered fruit-golden.png')

# ---------------- 清理 ----------------
bpy.context.window.scene = prev_scene
bpy.data.scenes.remove(tmp)
for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.images):
    for item in list(coll):
        if item.users == 0:
            coll.remove(item, do_unlink=True)

result = {'done': len(MODELS)}
