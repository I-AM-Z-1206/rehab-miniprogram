# ============================================================================
# tools/blender/fighter.py —— 生成射击游戏的战机贴图
# ----------------------------------------------------------------------------
# 在 Blender 里执行（Scripting 面板 → Run Script），产出：
#   assets/games/shoot/fighter.png   306×216 RGBA，比例 = engine._shipBox 的 68:48
#
# 为什么是"离线渲染成 PNG"而不是运行时加载 .glb：
#   小程序 canvas 只有 2D 上下文。跑 3D 要 WebGL + three.js + GLTFLoader，
#   2026-10-29 试过并整体回滚（GLTFLoader 官方包没有、只引 WebGLRenderer 就要
#   461KB、真机上 WebGL 上下文只能 getContext 一次）。运行时就是一张位图。
#
# 模型：313 顶点 / 251 面，5 个材质分区。设计**针对后视角度**倒推：
#   宽三角翼、双外倾垂尾、双引擎、边条翼、平尾 —— 全部放在从正后方能看见的位置。
#
# 安全约束：全程在临时 scene 里建，结束后删除临时 scene 和所有孤儿对象。
#   绝不动当前打开的文件（曾经用 use_selection=False 导出，把用户整个场景
#   都 export 进 glb 过，别再犯）。
#
# 调参速查：
#   SEC        机身 6 个截面 (y, 半宽, 上表面 z, 下表面 z)
#   ZW(x)      机翼上反：z 随 |x| 线性升高
#   cx / r     引擎中心与半径。**中心距必须 > 直径**，否则两个圆会叠成 8 字
#   SHIP_K     不在本文件里 —— 那是 engine.js 的贴图放大系数
# ============================================================================
import bpy
import math
from mathutils import Vector

OUT_PNG = 'E:/demo - 副本/assets/games/shoot/fighter.png'
RES_X, RES_Y = 306, 216          # 68:48 × 4.5
CAM_LOC = Vector((0, 8.1, 2.85))  # 后上方，俯角 ~19°
CAM_TARGET = Vector((0, 0.12, 0.16))

prev_scene = bpy.context.window.scene
tmp = bpy.data.scenes.new('__fighter_build')
bpy.context.window.scene = tmp

V, F, M = [], [], []


def ring(y, hw, ztop, zbot, n=12):
    i0 = len(V)
    for i in range(n):
        a = (i / n) * 2 * math.pi
        V.append((math.cos(a) * hw, y, zbot + (math.sin(a) * 0.5 + 0.5) * (ztop - zbot)))
    return i0


def bridge(a, b, n=12, m=0):
    for i in range(n):
        j = (i + 1) % n
        F.append((a + i, a + j, b + j, b + i))
        M.append(m)


def slab(top, bot, m=0, side_m=None):
    """一块有厚度的板：top/bot 各 4 个点（前内、前外、后外、后内）"""
    i0 = len(V)
    for p in top:
        V.append(p)
    for p in bot:
        V.append(p)
    F.append((i0, i0 + 1, i0 + 2, i0 + 3)); M.append(m)
    F.append((i0 + 7, i0 + 6, i0 + 5, i0 + 4)); M.append(m)
    sm = m if side_m is None else side_m
    for k in range(4):
        j = (k + 1) % 4
        F.append((i0 + k, i0 + j, i0 + 4 + j, i0 + 4 + k))
        M.append(sm)


# ---------------- 机身：12 边形 × 6 截面，机头收尖 ----------------
nose = len(V)
V.append((0.0, -3.00, 0.03))
SEC = [
    (-2.48, 0.20, 0.10, -0.11),
    (-1.82, 0.36, 0.21, -0.18),
    (-0.88, 0.50, 0.34, -0.26),
    (0.34, 0.56, 0.39, -0.29),
    (1.52, 0.50, 0.34, -0.26),
    (2.12, 0.42, 0.25, -0.20),
]
secs = [ring(s[0], s[1], s[2], s[3]) for s in SEC]
for i in range(12):
    F.append((nose, secs[0] + (i + 1) % 12, secs[0] + i)); M.append(0)
for k in range(len(secs) - 1):
    bridge(secs[k], secs[k + 1], 12, 0)
F.append(tuple(secs[-1] + i for i in range(11, -1, -1))); M.append(0)

# ---------------- 座舱盖：占机身宽 45%，低于 30% 会像一根天线 ----------------
c0 = len(V)
V += [(-0.24, -1.88, 0.22), (0.24, -1.88, 0.22), (0.26, -0.38, 0.36), (-0.26, -0.38, 0.36)]
V += [(-0.16, -1.66, 0.46), (0.16, -1.66, 0.46), (0.16, -0.52, 0.60), (-0.16, -0.52, 0.60)]
for f in [(c0, c0 + 1, c0 + 2, c0 + 3), (c0 + 4, c0 + 7, c0 + 6, c0 + 5),
          (c0, c0 + 4, c0 + 5, c0 + 1), (c0 + 1, c0 + 5, c0 + 6, c0 + 2),
          (c0 + 2, c0 + 6, c0 + 7, c0 + 3), (c0 + 3, c0 + 7, c0 + 4, c0)]:
    F.append(f); M.append(2)

# ---------------- 边条翼 LERX ----------------
for sx in (-1, 1):
    i0 = len(V)
    V += [(sx * 0.19, -2.34, -0.01), (sx * 0.50, -0.72, -0.04),
          (sx * 0.46, 0.36, -0.05), (sx * 0.30, -1.70, -0.08)]
    F.append((i0, i0 + 1, i0 + 2, i0 + 3)); M.append(1)

# ---------------- 主翼：两段后掠 + 上反 + 涂装 + 面板线 + 翼尖挂架 ----------------
ZW = lambda x: -0.05 + (abs(x) / 2.92) * 0.17
for sx in (-1, 1):
    rf = (sx * 0.46, -0.74, -0.05); mf = (sx * 1.62, 0.06, ZW(1.62))
    mb = (sx * 1.62, 1.58, ZW(1.62)); rb = (sx * 0.46, 1.46, -0.05)
    tf = (sx * 2.92, 0.98, ZW(2.92)); tb = (sx * 2.92, 1.66, ZW(2.92))
    slab([rf, mf, mb, rb], [(p[0], p[1], p[2] - 0.115) for p in [rf, mf, mb, rb]], 0, 0)
    slab([mf, tf, tb, mb], [(p[0], p[1], p[2] - 0.070) for p in [mf, tf, tb, mb]], 0, 0)
    st = [(sx * 0.62, 0.58, ZW(0.62) + 0.008), (sx * 2.30, 1.10, ZW(2.30) + 0.008),
          (sx * 2.30, 1.46, ZW(2.30) + 0.008), (sx * 0.62, 0.94, ZW(0.62) + 0.008)]
    slab(st, [(p[0], p[1], p[2] - 0.004) for p in st], 3)
    pl = [(sx * 1.05, -0.10, ZW(1.05) + 0.010), (sx * 1.10, -0.02, ZW(1.10) + 0.010),
          (sx * 1.10, 1.40, ZW(1.10) + 0.010), (sx * 1.05, 1.48, ZW(1.05) + 0.010)]
    slab(pl, [(p[0], p[1], p[2] - 0.004) for p in pl], 4)
    p0 = (sx * 2.55, 0.95, ZW(2.55) - 0.02); p1 = (sx * 2.86, 0.95, ZW(2.86) - 0.02)
    p2 = (sx * 2.86, 1.60, ZW(2.86) - 0.02); p3 = (sx * 2.55, 1.60, ZW(2.55) - 0.02)
    slab([p0, p1, p2, p3], [(p[0], p[1], p[2] - 0.055) for p in [p0, p1, p2, p3]], 1)

# ---------------- 平尾 ----------------
for sx in (-1, 1):
    a = (sx * 0.40, 1.30, 0.05); b = (sx * 1.12, 1.86, 0.11)
    c = (sx * 1.12, 2.14, 0.11); d = (sx * 0.40, 2.02, 0.03)
    slab([a, b, c, d], [(p[0], p[1], p[2] - 0.045) for p in [a, b, c, d]], 0, 0)

# ---------------- 双垂尾（外倾 22°） ----------------
for sx in (-1, 1):
    bf = (sx * 0.34, 1.18, 0.24); bb = (sx * 0.34, 2.34, 0.24)
    tf = (sx * 0.92, 1.72, 1.10); tb = (sx * 0.92, 2.26, 1.10)
    slab([bf, tf, tb, bb], [(p[0] + sx * 0.062, p[1], p[2]) for p in [bf, tf, tb, bb]], 0, 0)

# ---------------- 双引擎：外环 / 唇口内壁 / 收敛段 / 涡轮面 ----------------
# 中心距 0.67、直径 0.47 —— 中心距必须 > 直径，否则两个圆叠成一个 8 字。
for sx in (-1, 1):
    cx = sx * 0.335
    n = 14

    def circ(r, y, zc=0.02):
        i0 = len(V)
        for i in range(n):
            a = (i / n) * 2 * math.pi
            V.append((cx + math.cos(a) * r, y, zc + math.sin(a) * r))
        return i0

    a0 = circ(0.235, 2.10); a1 = circ(0.205, 2.26)
    a2 = circ(0.172, 2.12); a3 = circ(0.146, 1.86)
    for i in range(n):
        j = (i + 1) % n
        F.append((a0 + i, a0 + j, a1 + j, a1 + i)); M.append(1)
        F.append((a1 + i, a1 + j, a2 + j, a2 + i)); M.append(1)
        F.append((a2 + i, a2 + j, a3 + j, a3 + i)); M.append(5)
    F.append(tuple(a3 + i for i in range(11, -1, -1))); M.append(5)

me = bpy.data.meshes.new('FighterMesh')
me.from_pydata(V, [], F)
me.validate()
me.update()
ob = bpy.data.objects.new('fighter', me)
tmp.collection.objects.link(ob)
for i, p in enumerate(me.polygons):
    p.use_smooth = False
    if i < len(M):
        p.material_index = M[i]

# 0 机身 / 1 暗面 / 2 座舱 / 3 涂装 / 4 面板线 / 5 喷口内
COLS = [
    (0.25, 0.33, 0.45),
    (0.19, 0.26, 0.36),   # 不要压到 0.10 以下：纯黑的背光面在游戏里像一个洞
    (0.07, 0.11, 0.17),
    (0.88, 0.56, 0.22),
    (0.11, 0.16, 0.24),
    (0.42, 0.72, 0.70),   # 喷口给中亮青：canvas 会在它上面叠一层脉动光团
]
for i, c in enumerate(COLS):
    mat = bpy.data.materials.new('M%d' % i)
    mat.diffuse_color = (c[0], c[1], c[2], 1)
    me.materials.append(mat)

# ---------------- 渲染 ----------------
cam_data = bpy.data.cameras.new('__cam')
cam_data.type = 'PERSP'
cam_data.lens = 85
cam = bpy.data.objects.new('__cam', cam_data)
tmp.collection.objects.link(cam)
tmp.camera = cam

tmp.render.engine = 'BLENDER_WORKBENCH'
sh = tmp.display.shading
sh.light = 'STUDIO'
sh.color_type = 'MATERIAL'
sh.show_cavity = True
sh.cavity_type = 'BOTH'
sh.show_shadows = False
tmp.render.film_transparent = True      # RGBA：游戏里叠在深色场景上
tmp.render.resolution_x = RES_X
tmp.render.resolution_y = RES_Y
cam.location = CAM_LOC
cam.rotation_euler = (CAM_TARGET - CAM_LOC).to_track_quat('-Z', 'Y').to_euler()
tmp.render.filepath = OUT_PNG
bpy.ops.render.render(write_still=True, scene=tmp.name)

# ---------------- 清理：不留任何痕迹 ----------------
bpy.context.window.scene = prev_scene
bpy.data.scenes.remove(tmp)
for o in list(bpy.data.objects):
    if o.users == 0 and not o.name.startswith('ds_'):
        bpy.data.objects.remove(o, do_unlink=True)
for m2 in list(bpy.data.meshes):
    if m2.users == 0 and m2.name.startswith('Fighter'):
        bpy.data.meshes.remove(m2)

result = {'verts': len(V), 'faces': len(F), 'png': OUT_PNG,
          'scene_objects_left': len(bpy.context.scene.objects)}
