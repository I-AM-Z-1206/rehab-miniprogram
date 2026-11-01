# ============================================================================
# tools/blender/fruits.py —— 生成接水果的预渲染精灵（Blender 离线渲染）
# ----------------------------------------------------------------------------
# 命令行跑（不需要打开 Blender GUI / MCP）：
#   "D:/Apps/App_base/Blender 5.2/blender.exe" --background --python tools/blender/fruits.py
#
# 为什么是离线渲染 PNG 而不是运行时 3D：
#   小程序 canvas 只有 2D 上下文。WebGL + three.js 已在 2026-10-29 整体回滚
#   （GLTFLoader 官方包没有 / 只引 WebGLRenderer 就 461KB / 真机 WebGL 上下文
#   只能 getContext 一次）。所以「低模 3D 进游戏」的唯一正确姿势 =
#   Blender 建低模 → 正交相机渲染成透明 PNG → 游戏里 drawImage，同 fight.py 的管线。
#
# 内存/包体预算（用户红线：不要超过内存）：
#   水果 160×160×4B ≈ 100KB 解码 ×6 + 篮子 320×240×4B ≈ 307KB ≈ 0.9MB 显存（可忽略）
#   PNG 文件合计约 150~250KB，pkgFruit 从 258KB → ~450KB，远低于 2048KB 上限
#
# 安全约束（沿用 fighter.py）：全程在临时 scene 里建，结束删除临时 scene 与孤儿数据。
# 光照纪律（game-art-prompt-pack）：WORKBENCH STUDIO 光固定不变 —— 所有主体光源方向
#   天然统一；正交相机 + 统一构图，摆在一起不会串味。
# ============================================================================
import bpy
import math
import os
from mathutils import Vector

OUT_DIR = 'E:/demo - 副本/pkgFruit/assets/sprites'
RES = 160            # 水果画布（显示半径 12~17px，dpr3=51px，160 留足缩放余量）
BASKET_RES_X, BASKET_RES_Y = 384, 256
ORTHO = 2.9          # 正交视野：模型半径 1 的水果占画面约 70%

os.makedirs(OUT_DIR, exist_ok=True)

prev_scene = bpy.context.window.scene
tmp = bpy.data.scenes.new('__fruit_build')
bpy.context.window.scene = tmp


def clean_scene():
    """删掉临时 scene 里的所有对象，给下一个水果腾干净"""
    for o in list(tmp.collection.objects):
        bpy.data.objects.remove(o, do_unlink=True)


def clamp(v, lo, hi):
    return lo if v < lo else (hi if v > hi else v)


def make_mat(name, rgb, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (rgb[0], rgb[1], rgb[2], alpha)
    return m


def shade_smooth(ob):
    if ob.type != 'MESH':
        return  # 曲线 bevel 出来的网格自带平滑
    for p in ob.data.polygons:
        p.use_smooth = True


def add_sphere(name, mat, scale=(1, 1, 1), loc=(0, 0, 0), squash_top=0.0):
    """苹果/橙子/西瓜的基体。squash_top：顶部压扁（苹果上凹的近似）"""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=18, radius=1)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = scale
    if squash_top > 0:
        for v in ob.data.vertices:
            if v.co.z > 0.72:
                v.co.z -= squash_top * (v.co.z - 0.72) / 0.28
    ob.location = loc
    ob.data.materials.append(mat)
    shade_smooth(ob)
    return ob


def add_stem(z_top, tilt=0.12):
    """果蒂：细圆柱，微微歪 —— 手绘版的果蒂都有，丢掉会像塑料球"""
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.045, depth=0.34)
    ob = bpy.context.active_object
    ob.name = 'stem'
    ob.rotation_euler = (tilt, tilt * 0.6, 0)
    ob.location = (0.02, 0, z_top + 0.12)
    return ob


def add_leaf(z_top, mat, flip=1.0):
    """叶子：压扁的圆锥当叶形，低模够用"""
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=0.16, radius2=0.0, depth=0.05)
    ob = bpy.context.active_object
    ob.name = 'leaf'
    ob.rotation_euler = (math.radians(96), 0, flip * 0.5)
    ob.scale = (2.4, 1.0, 1.0)
    ob.location = (flip * 0.3, 0, z_top + 0.18)
    ob.data.materials.append(mat)
    return ob


# ---------------------------------------------------------------- 渲染一个水果
def render_object(name, out_png, ortho=ORTHO, res=(RES, RES)):
    cam_data = bpy.data.cameras.new('__cam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = ortho
    cam = bpy.data.objects.new('__cam', cam_data)
    tmp.collection.objects.link(cam)
    tmp.camera = cam
    # 正面微俯 12°：果蒂和顶部高光看得见，透视与游戏里「水果迎面掉落」一致
    cam.location = Vector((0, 7, 1.5))
    cam.rotation_euler = (Vector((0, 0, 0.2)) - cam.location).to_track_quat('-Z', 'Y').to_euler()

    tmp.render.engine = 'BLENDER_WORKBENCH'
    sh = tmp.display.shading
    sh.light = 'STUDIO'
    sh.color_type = 'MATERIAL'
    sh.show_specular_highlight = True
    sh.show_cavity = True
    sh.cavity_type = 'BOTH'
    sh.show_shadows = False
    tmp.render.film_transparent = True
    tmp.render.resolution_x, tmp.render.resolution_y = res
    tmp.render.filepath = out_png
    bpy.ops.render.render(write_still=True, scene=tmp.name)

    clean_scene()


# ---------------------------------------------------------------- 各水果建模
def build_apple(mat_body, mat_stem, mat_leaf, out):
    add_sphere('apple', mat_body, scale=(0.96, 0.96, 0.88), squash_top=0.10)
    add_stem(0.82)
    add_leaf(0.82, mat_leaf)
    render_object('apple', out)


def build_orange(mat_body, out):
    add_sphere('orange', mat_body, scale=(1.0, 1.0, 0.92))
    # 蒂疤：小圆片凹在顶上
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.09, depth=0.05)
    cap = bpy.context.active_object
    cap.location = (0, 0, 0.93)
    cap.data.materials.append(make_mat('orange_cap', (0.55, 0.32, 0.10)))
    render_object('orange', out)


def build_banana(mat_body, out):
    curve = bpy.data.curves.new('banana', type='CURVE')
    curve.dimensions = '3D'
    sp = curve.splines.new('BEZIER')
    sp.bezier_points.add(3)
    pts = [(-0.85, 0, 0.34), (-0.34, 0, -0.24), (0.34, 0, -0.24), (0.85, 0, 0.34)]
    for i, bp in enumerate(sp.bezier_points):
        bp.co = pts[i]
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
    curve.bevel_depth = 0.17
    curve.bevel_resolution = 5
    curve.use_fill_caps = True
    ob = bpy.data.objects.new('banana', curve)
    tmp.collection.objects.link(ob)
    ob.data.materials.append(mat_body)
    shade_smooth(ob)
    # 两端深色蒂尖：两个小球
    for sx in (-1, 1):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.10)
        tip = bpy.context.active_object
        tip.location = (sx * 0.88, 0, 0.38)
        tip.scale=(0.7,0.7,0.7)
        tip.data.materials.append(make_mat('banana_tip', (0.38, 0.28, 0.08)))
    render_object('banana', out)


def build_strawberry(mat_body, mat_leaf, out):
    # 心形果体：球体 + 底部逐环收尖（圆锥太规则，一眼假）
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=18, radius=1)
    ob = bpy.context.active_object
    ob.name = 'strawberry'
    ob.scale = (0.82, 0.80, 1.08)
    for v in ob.data.vertices:
        if v.co.z < -0.3:
            k = clamp((-v.co.z - 0.3) / 0.7, 0, 1)
            shrink = 1 - k * 0.72
            v.co.x *= shrink
            v.co.y *= shrink
    ob.data.materials.append(mat_body)
    shade_smooth(ob)
    # 绿萼：小一号的叶盘
    bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=0.34, radius2=0.05, depth=0.09)
    calyx = bpy.context.active_object
    calyx.location = (0, 0, 0.86)
    calyx.scale = (1.0, 1.0, 0.7)
    calyx.data.materials.append(mat_leaf)
    add_stem(0.88)
    render_object('strawberry', out)


def build_watermelon(mat_body, out):
    ob = add_sphere('watermelon', mat_body, scale=(1.22, 0.98, 0.98))
    # 6 条经线凹槽：直接把基体顶点沿经线方向压进去 —— WORKBENCH 的 cavity
    # 会自动沿凹槽描出深色条纹。之前「叠凸球」的做法高差只有 1.5%，
    # 在 160px 渲染里不足 1px，条纹完全隐形 —— 凹槽是更可靠的做法。
    for v in ob.data.vertices:
        lon = math.atan2(v.co.y, v.co.x)
        d = 1.0 - 0.16 * max(0.0, math.cos(6 * lon)) ** 2
        v.co.x *= d
        v.co.y *= d
    # 平直着色 + 降段数：凹槽被 smooth 着色糊掉过一次；低模棱面感
    # 既让条纹立得住，也更像「低模」该有的样子
    for p in ob.data.polygons:
        p.use_smooth = False
    render_object('watermelon', out, ortho=3.2)


def build_basket(mat_wood, mat_rim, out):
    """果篮：梯形碗体 + 口沿圆环 + 12 根竖条（编织感的最低成本做法）"""
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=1.55, radius2=1.05, depth=1.15)
    body = bpy.context.active_object
    body.name = 'basket_body'
    body.location = (0, 0, 0.30)
    body.data.materials.append(mat_wood)
    # 口沿
    bpy.ops.mesh.primitive_torus_add(major_radius=1.57, minor_radius=0.09, major_segments=28, minor_segments=10)
    rim = bpy.context.active_object
    rim.name = 'basket_rim'
    rim.rotation_euler = (0, 0, 0)
    rim.location = (0, 0, 0.88)
    rim.scale = (1.0, 0.42, 1.0)
    rim.data.materials.append(mat_rim)
    # 竖条：贴在碗体外壁的深色窄条，暗示编织
    for i in range(12):
        a = (i / 12) * 2 * math.pi
        bpy.ops.mesh.primitive_cube_add(size=1)
        slat = bpy.context.active_object
        z0, z1 = -0.24, 0.86
        r0, r1 = 1.06, 1.56          # 底部半径小、口沿半径大 → 贴住锥面
        t = 0.055
        slat.scale = (t, 0.98, (z1 - z0) / 2)
        slat.location = (math.cos(a) * (r0 + r1) / 2, math.sin(a) * (r0 + r1) / 2 * 0.42, (z0 + z1) / 2 + 0.30)
        slat.rotation_euler = (0, 0, a)
        slat.data.materials.append(make_mat('basket_dark', (0.30, 0.185, 0.085)))
    render_object('basket', out, ortho=4.0, res=(BASKET_RES_X, BASKET_RES_Y))


# ---------------------------------------------------------------- 执行
M = {
    'apple': make_mat('apple', (0.92, 0.16, 0.12)),
    'golden': make_mat('golden', (1.0, 0.88, 0.35)),
    'orange': make_mat('orange', (1.0, 0.60, 0.10)),
    'banana': make_mat('banana', (1.0, 0.86, 0.20)),
    'strawberry': make_mat('strawberry', (0.95, 0.13, 0.16)),
    'watermelon': make_mat('watermelon', (0.16, 0.42, 0.14)),
    'stem': make_mat('stem', (0.36, 0.24, 0.10)),
    'leaf': make_mat('leaf', (0.25, 0.55, 0.22)),
    'wood': make_mat('wood', (0.62, 0.42, 0.22)),
    'rim': make_mat('rim', (0.52, 0.34, 0.17)),
}

built = []
build_apple(M['apple'], M['stem'], M['leaf'], os.path.join(OUT_DIR, 'fruit-apple.png')); built.append('apple')
build_apple(M['golden'], M['stem'], M['leaf'], os.path.join(OUT_DIR, 'fruit-golden.png')); built.append('golden')
build_orange(M['orange'], os.path.join(OUT_DIR, 'fruit-orange.png')); built.append('orange')
build_banana(M['banana'], os.path.join(OUT_DIR, 'fruit-banana.png')); built.append('banana')
build_strawberry(M['strawberry'], M['leaf'], os.path.join(OUT_DIR, 'fruit-strawberry.png')); built.append('strawberry')
build_watermelon(M['watermelon'], os.path.join(OUT_DIR, 'fruit-watermelon.png')); built.append('watermelon')
build_basket(M['wood'], M['rim'], os.path.join(OUT_DIR, 'basket.png')); built.append('basket')

# ---------------------------------------------------------------- 清理：不留痕迹
bpy.context.window.scene = prev_scene
bpy.data.scenes.remove(tmp)
for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.curves, bpy.data.cameras):
    for item in list(coll):
        if item.users == 0:
            coll.remove(item, do_unlink=True)

result = {'built': built, 'out_dir': OUT_DIR,
          'scene_objects_left': len(bpy.context.scene.objects)}
