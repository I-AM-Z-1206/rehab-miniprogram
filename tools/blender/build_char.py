# -*- coding: utf-8 -*-
# ============================================================================
# tools/blender/build_char.py —— 提灯旅人（v5：换角色）
# ----------------------------------------------------------------------------
#   blender -b --factory-startup -P tools/blender/build_char.py
#
# ---------------------------------------------------------------- 为什么要换
# v4 那个角色「像病人」。这不是建模精度问题，而是身份符号问题，三条同时成立：
#
#   ① 主色 #2A5F6C 是康复科/护理垫/隔离服的青绿 —— 而且画面是暖金逆光，
#      冷青色的人贴在上面本身就是两块，不是一个人站在光里。
#   ② 背后 V 形交叉带 + 白色挂片 = 康复步态带的形状。康复科真的用这种带子
#      让治疗师站在身后扶患者。这个符号比任何配色都致命。
#   ③ 腰胯高度的一根白色横杆 = 助行器 / 双杠，不是杂技的平衡杆。
#
# 再加体态（肩背平直、两臂松垂）就是「被搀着走」而不是「掌握平衡」。
#
# 所以 v5 不是调色，是**换一整套身份符号**：
#   兜帽（没有发型、没有脸、没有年龄）、短斗篷（不是病号服那种直筒剪裁）、
#   皮靴、手里一盏提灯。全身只有双手露肤，其余全被衣服包住。
#
# ---------------------------------------------------------------- 提灯是设计的核心
# 原来那根平衡杆承担一个视觉职责：让人看见"我正在往哪边倒"。职责改由
# **提灯**和斗篷下摆承担，而且更适合逆光：灯是画面里唯一的暖色发光体，
# 在「清晨逆光 + 云海」里是天然的焦点，也不会像横杆那样读成医疗器械。
#
# ---------------------------------------------------------------- 与 v4 的关系
# v4 的放样方法（loft / loft_path）验证过是"粗糙"的正解，全部保留。
# 删掉的是：头球、头发壳（haircap）、耳朵、脖子、肩球、平衡杆、安全背带。
# 兜帽整体替代了"头 + 发 + 颈"，所以 eggify / haircap 这两个函数也一并删除
# —— 它们的三个坑（切割函数依赖 x、边界必须沿经线滑动、后颈露皮肤）都记在
# README 第十三节里，将来若真要画头发再回去看。
# ============================================================================

import bpy
import bmesh
import math
import os
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
SCENE = bpy.context.scene
SCENE.unit_settings.system = 'METRIC'
TAU = math.pi * 2

# ============================================================================
# 比例基准 —— 卡通 5.4 头身（头顶仍严格 1.750，character.js 的 charH 不用改）
# ============================================================================
Z_TOP = 1.750
SHOULDER_Z = 1.392
WAIST_Z = 0.960
HIP_Z = 0.800
Z_KNEE = 0.450
LEG_X = 0.074

# 斗篷下摆高度。这个是新角色最要紧的一个数：必须**明显高于膝盖**（0.450），
# 否则走路循环里两条腿的交替全被布料盖住 —— 而腿的交替是这个游戏唯一的
# 动作反馈。定在 0.612，露出膝上 16cm + 整条小腿。
HEM_Z = 0.612

# 提灯：右手向外侧提，挂在小臂末端。x 必须落在斗篷投影边界之外，
# 否则深色灯体压在深色斗篷上，240px 高的人身上什么都看不见。
# 斗篷 z=0.74 处投影半宽 = sqrt((rx·cos15)² + (ry·sin15)²) ≈ 0.179，
# 灯内缘 = 0.234 - 0.040 = 0.194，留 1.5cm 净空。
LX = 0.234
LY = -0.050

# ---------------------------------------------------------------- 配色：从冷换成暖
# 第一版给的是深靛 #31465E，渲出来才发现两件事：
#   ① 远山剪影本来就是 #33506B / #1E3651 / #112335（见 renderer 的云海一节），
#      深靛的人物站在深靛的山前，剪影直接融进去 —— 这是地形色，不是衣服色。
#   ② 画面是「冷天空 + 亮云海 + 暖金光」，再画一个冷色的人，人就不在光里。
# 所以主色改成暖赭：旧羊毛 / 皮革的色，在冷色云海里是唯一一块暖实体。
# 冷色只留给裤子（和暖斗篷拉开，两条腿才数得清）和钢丝。
PAL = {
    "cloak":   "#6B3B2C",   # 暖赭斗篷（主色）
    "cloakLo": "#50291F",   # 袖子 / 暗面：比斗篷深一档，手臂才不会融成一片
    # 兜帽必须比斗篷**深**。上一版给的是 #7A4535（比斗篷亮一档，理由是"受光面朝上"），
    # 渲出来是一个被上方天光照亮的圆顶 —— 和一颗光头在画面上完全等价。
    # 亮色圆顶 = 皮肤；深色圆顶 = 布。这一档不是为了物理正确，是为了读得对。
    "hood":    "#4E2A1D",
    "mantle":  "#7E4633",   # 披肩反过来要比斗篷亮：肩上接天光，层次才分得开
    "lining":  "#B49B7C",   # 亚麻里子：只出现在下摆一道，亮度必须低于灯焰
    "pants":   "#3C4757",   # 冷灰裤：和暖斗篷对比，两条腿分开
    "pantsLo": "#2A3240",
    "boot":    "#2E2016",   # 深棕皮靴
    "sole":    "#4A3828",
    "skin":    "#D8B28C",
    "brass":   "#C39A5A",   # 灯架黄铜
    "flame":   "#FFC978",   # 灯焰（自发光）
    "steel":   "#4A5866",   # 钢丝
}

# 自发光强度。灯要做成画面里唯一的暖色光源，靠的是"它自己发亮"。
# 但 2.6 会把灯整个烧成一块纯白 —— 渲出来读成"手里端了个白杯子"，
# 反倒看不出是灯。1.4 留住灯芯的高光，同时让黄铜框还能被看见。
EMIT = {"flame": 1.4}

MATS = {}


def hex2lin(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    c = [(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c]
    return (c[0], c[1], c[2], 1.0)


def M(key, rough=0.90, metallic=0.0):
    if key in MATS:
        return MATS[key]
    m = bpy.data.materials.new("WIRE_" + key)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    col = hex2lin(PAL[key])
    b.inputs["Base Color"].default_value = col
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metallic
    for k in ("Specular IOR Level", "Specular"):
        if k in b.inputs:
            b.inputs[k].default_value = 0.10
            break
    # 自发光 socket 的名字在 4.x 之后改过（"Emission" → "Emission Color"）
    if key in EMIT:
        for sock in ("Emission Color", "Emission"):
            if sock in b.inputs:
                b.inputs[sock].default_value = col
                break
        if "Emission Strength" in b.inputs:
            b.inputs["Emission Strength"].default_value = EMIT[key]
    m.diffuse_color = col
    m.roughness = rough
    m.metallic = metallic
    MATS[key] = m
    return m


PARTS = []


def _new_mesh(name, verts, faces):
    me = bpy.data.meshes.new(name + "Mesh")
    me.from_pydata(verts, [], faces)
    me.validate(verbose=False)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    SCENE.collection.objects.link(ob)
    return ob


def _finish(ob, key, smooth=True, rough=0.90, metallic=0.0):
    ob.data.materials.append(M(key, rough, metallic))
    for p in ob.data.polygons:
        p.use_smooth = smooth
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    PARTS.append(ob)
    return ob


# ---------------------------------------------------------------- 顶点组标记
# rig_anim.py 是按「顶点到骨段的最短距离」刷权重的，自动权重不认识"这是一件
# 斗篷"。斗篷下摆掉到 0.612（低于髋 0.800），侧摆顶点离 Thigh 只有 12cm、
# 离 Hips 有 27cm —— 权重会整片判给大腿，一迈步整条下摆被撕开。
#
# 所以在这里先打一个组标记。join 时同名顶点组会自动合并，rig_anim 读出来
# 就能把"这件衣服"限制在躯干骨里。
#   GARMENT  斗篷 / 下摆包边 / 披肩 / 披肩镶边  → 只跟 Hips/Spine/Chest
#   HOOD     兜帽                                → 只跟 Head
def tag(ob, group):
    vg = ob.vertex_groups.new(name=group)
    vg.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
    return ob


def loft(name, prof, key, seg=14, smooth=True, cap_bot=True, cap_top=True,
         rough=0.90, metallic=0.0):
    """竖直放样。prof = [(z, cx, cy, rx, ry), ...] 自下而上。

    cy 让每一圈可以整体前后偏移 —— 兜帽的"尖顶后倾"就是靠它做的，
    而不是靠旋转一整个球（那样底部会跟着歪）。
    """
    n = len(prof)
    verts = []
    for (z, cx, cy, rx, ry) in prof:
        for i in range(seg):
            a = TAU * i / seg
            verts.append((cx + math.cos(a) * rx, cy + math.sin(a) * ry, z))
    faces = []
    for k in range(n - 1):
        b0, b1 = k * seg, (k + 1) * seg
        for i in range(seg):
            j = (i + 1) % seg
            faces.append((b0 + i, b0 + j, b1 + j, b1 + i))
    if cap_bot:
        faces.append(tuple(range(seg - 1, -1, -1)))
    if cap_top:
        faces.append(tuple(range((n - 1) * seg, n * seg)))
    ob = _new_mesh(name, verts, faces)
    return _finish(ob, key, smooth, rough, metallic)


def loft_path(name, pts, radii, key, seg=12, smooth=True, squash=1.0,
              rough=0.90, cap=True, up_hint=(0, 0, 1), metallic=0.0):
    """沿任意 3D 路径放样（手臂 / 提梁）。截面在路径法平面内。"""
    P = [Vector(p) for p in pts]
    n = len(P)
    dirs = []
    for i in range(n):
        if i == 0:
            d = P[1] - P[0]
        elif i == n - 1:
            d = P[-1] - P[-2]
        else:
            d = P[i + 1] - P[i - 1]
        dirs.append(d.normalized())

    up = Vector(up_hint)
    verts = []
    for i in range(n):
        d = dirs[i]
        u = up.cross(d)
        if u.length < 1e-4:
            u = Vector((1.0, 0.0, 0.0)).cross(d)
        u.normalize()
        v = d.cross(u).normalized()
        r = radii[i]
        for k in range(seg):
            a = TAU * k / seg
            verts.append(tuple(P[i] + u * (math.cos(a) * r) + v * (math.sin(a) * r * squash)))
    faces = []
    for i in range(n - 1):
        b0, b1 = i * seg, (i + 1) * seg
        for k in range(seg):
            j = (k + 1) % seg
            faces.append((b0 + k, b0 + j, b1 + j, b1 + k))
    if cap:
        faces.append(tuple(range(seg - 1, -1, -1)))
        faces.append(tuple(range((n - 1) * seg, n * seg)))
    ob = _new_mesh(name, verts, faces)
    return _finish(ob, key, smooth, rough, metallic)


def ball(name, loc, r, key, seg=16, ring=10, scale=(1, 1, 1), rough=0.90,
         smooth=True, metallic=0.0):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=seg, ring_count=ring, radius=r, location=loc)
    ob = bpy.context.object
    ob.name = name
    ob.scale = scale
    return _finish(ob, key, smooth, rough, metallic)


# ============================================================================
# 一、斗篷（一条放样：下摆 → 腰 → 胸 → 肩坡 → 肩顶）
# ----------------------------------------------------------------------------
# 剪裁上故意做两件事，让它不读成"病号服"：
#   ① **A 字**：下摆 0.196 比胸 0.176 宽。直筒剪裁是病号服/家居服的特征，
#      下摆外扩才是"穿着外套"。
#   ② **有腰**：0.960 处收到 0.159。收到 0.145 会读成束腰女装，这里是 0.159，
#      只做出"布料下面是个人"的程度。
# ============================================================================
CLOAK = [
    (HEM_Z, 0.0, 0.000, 0.196, 0.156),   # 下摆（最宽，悬在腿上）
    (0.660, 0.0, 0.000, 0.190, 0.151),
    (0.740, 0.0, 0.000, 0.181, 0.144),
    (0.820, 0.0, 0.000, 0.172, 0.137),
    (0.900, 0.0, 0.000, 0.164, 0.131),
    (0.960, 0.0, 0.000, 0.159, 0.127),   # 腰（最细）
    (1.040, 0.0, 0.000, 0.162, 0.129),
    (1.120, 0.0, -0.002, 0.168, 0.134),
    (1.200, 0.0, -0.003, 0.174, 0.138),
    (1.280, 0.0, -0.003, 0.176, 0.140),  # 胸最宽
    (1.340, 0.0, -0.002, 0.174, 0.138),
    (1.386, 0.0, 0.000, 0.168, 0.134),   # 肩坡
    (1.414, 0.0, 0.002, 0.152, 0.122),
    (1.434, 0.0, 0.004, 0.115, 0.096),   # 肩顶（收进兜帽）
]
tag(loft("cloak", CLOAK, "cloak", seg=18, cap_bot=True, cap_top=False), "GARMENT")

# 下摆折边：2.2cm 的朱红，比斗篷外扩 2mm。
# 这是全角色唯一的暖色。位置必须在**下摆边缘**而不是腰上 —— 腰上一圈带子
# 会被读成腰带（v4 踩过），而下摆折边是布料自己的包边，读的是"这衣服有里子"。
tag(loft("hem_band", [
    (HEM_Z - 0.008, 0.0, 0.0, 0.194, 0.154),
    (HEM_Z + 0.014, 0.0, 0.0, 0.198, 0.158),
], "lining", seg=18, cap_bot=False, cap_top=False), "GARMENT")

# ============================================================================
# 二、兜帽（替代 v4 的「头 + 头发 + 脖子 + 耳朵」）
# ----------------------------------------------------------------------------
# 第一版兜帽渲出来是**一个正球**。原因可以算出来，不是感觉：
#   最宽圈半径 0.186，从最宽圈到顶尖只有 0.196 高 —— 比值 1.05，那就是半球。
#   正球在背影里的投影是正圆，无论怎么调颜色都读成"扣了个球"。
# 这一版压到"卵形"：
#   最宽圈下移到 1.516、半径收到 0.179，顶尖在 1.750 → 高/半径 = 1.31。
#   同时每圈中心 cy 从 0.006 一路推到 0.100，顶尖后倾 10cm：
#   背后那条轮廓线上有一段明确的后倒斜线，这是"戴了帽子"和"秃头"的唯一区别。
#
# 底部收窄到 0.098（颈），让它扎进围巾里 —— 帽子是「从衣服里长出来」的。
#
# 关于帽口：兜帽真正的身份符号是帽口翻边，但角色是**背影**，帽口在远侧，
# 15° 偏航也露不出来。所以背影视角能用的线索只剩三条：
#   ① 卵形 + 后倾的轮廓（上面）
#   ② 头与身体的交界处有一圈**围巾**（下一条）—— 这是唯一有效的横向分界
#   ③ 提灯
# 换句话说，兜帽在这套视角里承担的是"没有脸、没有发型、没有年龄"，
# 身份靠围巾和灯来立。别再指望把兜帽做得更像帽子。
# ============================================================================
HOOD = [
    (1.340, 0.000, 0.000, 0.098, 0.092),   # 底：藏进披肩内部，不封底（见下）
    (1.392, -0.002, 0.006, 0.124, 0.114),
    (1.436, -0.004, 0.012, 0.146, 0.136),
    (1.486, -0.007, 0.020, 0.162, 0.151),
    (1.538, -0.010, 0.028, 0.168, 0.157),   # 最宽
    (1.590, -0.013, 0.038, 0.163, 0.152),
    (1.640, -0.016, 0.048, 0.150, 0.139),
    (1.682, -0.018, 0.058, 0.128, 0.118),
    (1.716, -0.020, 0.066, 0.098, 0.089),
    (1.738, -0.021, 0.073, 0.058, 0.052),
    (1.750, -0.022, 0.078, 0.020, 0.018),   # 顶（后倾 7.8cm + 左偏 2.2cm）
]
# 为什么要左右偏 2.2cm：完全对称的蛋形不管刷什么颜色都是"一个几何体"。
# 真实的兜帽戴在头上会往一边塌，顶尖也不会落在正中间 —— 这 2cm 是"布"和
# "球"在剪影上的唯一差别。偏左而不是偏右，是因为提灯在右手：头往左塌，
# 画面才不平衡得有个理由（提着东西的人本来就会偏）。
# 底不封口（cap_bot=False）+ 底部压到 1.340：
# 上一版兜帽底封在 1.376、半径 0.088，而披肩顶口在 1.400、半径 0.150 ——
# 从侧面能看到「兜帽细颈浮在披肩开口中央」，中间一圈空洞，读成花瓶。
# 现在兜帽底钻到披肩内部（1.340 处披肩还有 0.184，兜帽 0.098），
# 开口朝下、被披肩裹住：**没有缝、没有底盖、也不相交**。
tag(loft("hood", HOOD, "hood", seg=18, cap_bot=False, cap_top=True), "HOOD")

# ---------------------------------------------------------------- 兜帽下沿（帽檐）
# 这是"兜帽"唯一能在背影里成立的形状证据。
# 一个光滑的圆顶，不管调成什么颜色，都只是一个圆顶 —— 头也是圆的，帽子也是圆的。
# 帽子之所以是帽子，在于**它比里面的东西宽，而且在下沿翻出来一圈**：
# 布压在肩膀上，帽檐下面必然有一道阴影线。这道线横切肩部，正是我们要的分界。
#
# 做法：一圈向外翻的短裙，下沿 0.186（比披肩同高度的 0.164~0.196 略大），
# 上沿收回 0.150 接兜帽本体。翻边与披肩是两个交角很大的曲面，
# 相交线是一道干净的弧 —— 不是上一版那种近乎相切的碎锯齿。
tag(loft("hood_rim", [
    (1.348, -0.001, 0.002, 0.170, 0.144),
    (1.372, -0.002, 0.004, 0.188, 0.160),   # 最外（翻边底）
    (1.396, -0.003, 0.006, 0.172, 0.146),
    (1.412, -0.004, 0.008, 0.150, 0.128),   # 收进兜帽本体
], "hood", seg=18, cap_bot=False, cap_top=False), "HOOD")
# 头部尺寸说明：最宽 0.168（头宽 33.6cm），肩宽 35.2cm —— **头必须比肩窄**。
# 上一版给到 0.183（头宽 36.6cm）比肩还宽，整个人读成"大头娃娃"，
# 而"小孩 / 被照顾的人"正是这次要摆脱的读法。

# ============================================================================
# 二·五、披肩（替代围巾）
# ----------------------------------------------------------------------------
# 围巾试过两版，都不成立：
#   ① 只有一圈横带 → 背影里读成"贴在背上的白胶带"：上下沿都被斗篷的曲面硬切
#      出直边，没有任何东西提示"这是一块布"。
#   ② 加两条垂到腰的尾端 → 尾端太窄（0.03），在 240px 上是一条 4px 的白线，
#      末端还因为 cx 漂移拐了个弯，读成"挂着个价签"。
#
# 根因是同一个：**细长条在低分辨率下不成立**。布的体量必须靠"面"来表达，
# 不能靠"线"。所以换成披肩：一片从颈根张到肩外、盖住整个肩线的布，下沿一道
# 米白镶边。
# 它同时解决三件事：
#   ① 头与身体之间那道硬接不上（兜帽底 1.386 直接压在斗篷肩坡上）；
#   ② 背影轮廓里唯一的横向分界线（没有它，整个轮廓只有"头 + 锥"两段）；
#   ③ 旅人的符号 —— 披风领比围巾更老、更"在赶路"。
#
# 下沿 0.206 比斗篷胸围（0.176）外扩 3cm，是"盖在衣服外面的一层"。
# 上口 0.128 收进兜帽底，视觉上帽子从披肩里长出来。
# ============================================================================
# ---------------------------------------------------------------- 为什么不交叉
# 兜帽底 1.376 处半径 0.088，披肩顶口 1.400 处半径 0.150 ——
# **兜帽的整个底圈都落在披肩顶口的圆圈之内**，所以兜帽是"从领口里穿出来"的，
# 两个曲面没有相交面。兜帽要到 1.452（0.142）才接近 0.150，
# 而那时它已经高过披肩顶口，不再碰面。
#
# 之前那版兜帽底 1.386/0.098、披肩顶 1.434/0.114，两条曲线在 z≈1.42 处相交。
# 两个 18 边曲面求交，边界落成一条锯齿折线，从侧面看就是一串尖刺。
# 这不是法线问题、也不是平滑问题，**是穿了**。改材质、改平滑都救不了。
MANTLE = [
    (1.296, 0.0, 0.000, 0.196, 0.162),   # 下沿（最宽）
    (1.324, 0.0, 0.000, 0.191, 0.157),
    (1.352, 0.0, 0.002, 0.178, 0.146),
    (1.378, 0.0, 0.004, 0.164, 0.135),
    (1.400, 0.0, 0.006, 0.150, 0.124),   # 顶口（比兜帽底大得多 → 不相交）
]
tag(loft("mantle", MANTLE, "mantle", seg=18, cap_bot=False, cap_top=False), "GARMENT")

# 披肩镶边**删掉了**。
# 原来那圈 2.4cm 米白横贯整个肩宽，渲出来是一条笔直的亮线，像贴在背上的胶带：
# ① 它完全水平，而肩是斜的 —— 水平线在斜面上必然读成"贴上去的东西"；
# ② 米白是画面里除灯焰外最亮的东西，把注意力从灯上抢走了；
# ③ 这条线两端正好停在袖子上，切口是硬的，更像胶带。
# 肩膀上需要的"横向分界"，现在由**兜帽下沿**给出（见下），而且是带阴影的曲面交界，
# 不是画上去的一条线。

# ============================================================================
# 三、手臂 —— 左右**不对称**
# ----------------------------------------------------------------------------
# v4 两只手都在胸前扶杆，是严格对称的。对称的姿势读起来永远是"摆拍"。
# 这里让右边提着灯（所以右臂外展、几乎不摆），左边自然下垂（走路时正常摆）。
# 一个提着东西的人，是"在赶路"；两只手都张开的人，是"在做康复动作"。
#
# 袖子与斗篷同一材质：手臂有一半埋在斗篷体积里，只要颜色一样，
# 相交处就没有接缝，读成"衣服上的袖子"。
# ============================================================================
# 袖子用 cloakLo（比斗篷深一档）。
# 第一版袖子和斗篷同色，46° 侧视图里整个人读成一只"企鹅" —— 手臂的轮廓
# 在斗篷的轮廓里面，同色就完全没有分界。深一档等于给它画了一条背光边，
# 物理上也成立：手臂是圆柱，两侧本来就该比正面平的地方暗。
ARM_R = [0.070, 0.067, 0.062, 0.056, 0.051, 0.048, 0.046]

# 左手：自然下垂，贴近身体
loft_path("arm_L",
          [(-0.100, 0.004, SHOULDER_Z),
           (-0.132, -0.002, 1.300),
           (-0.152, -0.006, 1.150),
           (-0.160, -0.012, 1.030),
           (-0.170, -0.020, 0.905)],
          [0.070, 0.067, 0.062, 0.053, 0.046], "cloakLo", seg=12)
ball("hand_L", (-0.170, -0.032, 0.868), 0.046, "skin", seg=12, ring=8,
     scale=(1.0, 1.1, 1.25))

# 右手：外展提灯。肘部弯得多一点，灯抬到大腿高度 ——
# 垂到膝盖高度时，灯焰正好压在斗篷下摆那条亮边上，两者抢视线，读成"提着个桶"。
loft_path("arm_R",
          [(0.100, 0.004, SHOULDER_Z),
           (0.140, -0.002, 1.300),
           (0.176, -0.010, 1.150),
           (0.196, -0.022, 1.045),
           (0.206, -0.034, 0.958)],
          [0.070, 0.067, 0.062, 0.053, 0.046], "cloakLo", seg=12)
ball("hand_R", (0.208, -0.044, 0.938), 0.046, "skin", seg=12, ring=8,
     scale=(1.0, 1.1, 1.25))

# ============================================================================
# 四、提灯（独立对象，绑一根 Lantern 骨到右手）
# ----------------------------------------------------------------------------
# 第一版按真实尺寸做（0.088m 高、半径 0.041），在 240px 高的人身上只有 12px，
# 而且 EMIT 2.6 直接烧成一块白 —— 读成"手里端了个白杯子"，不是灯。
#
# 这一版按"识字尺度"放大，不再追求物理正确：
#   灯体 0.664~0.816 = 0.152m 高、半径 0.058 → 屏幕上约 21px。
#   必须能在这个尺寸里读出「黄铜框 + 暖光 + 提梁」三件事，否则等于没带灯。
# 所以：上下黄铜盖各自加厚到 0.018，中间加**四根竖梁**（不是网格，是四根细柱），
# 竖梁之间露出的才是光。只有"框"和"光"同时在场，才读成灯笼。
# ============================================================================
# 提梁必须露出来。手是个半径 0.046×1.25 的球，指尖低到 z≈0.800；
# 第一版灯顶做在 0.822 —— 整个提梁埋在手心里，画面上就是"手按在一个白盒子上"。
# 现在灯顶压到 0.792、提梁从中穿过 6cm，才看得出"提着"。
loft_path("lantern_bail",
          [(0.210, -0.046, 0.928),
           (0.222, -0.052, 0.900),
           (LX, LY, 0.872)],
          [0.008, 0.008, 0.008], "brass", seg=6, rough=0.55, metallic=0.35)

# 顶盖（像个小屋顶：两段收分）
loft("lantern_top", [
    (0.846, LX, LY, 0.062, 0.062),
    (0.860, LX, LY, 0.054, 0.054),
    (0.870, LX, LY, 0.030, 0.030),
], "brass", seg=14, rough=0.55, metallic=0.35, cap_bot=False, cap_top=True)

# 灯芯玻璃：中间鼓、两端收
loft("lantern_glass", [
    (0.732, LX, LY, 0.046, 0.046),
    (0.754, LX, LY, 0.056, 0.056),
    (0.800, LX, LY, 0.058, 0.058),
    (0.834, LX, LY, 0.050, 0.050),
], "flame", seg=14, cap_bot=False, cap_top=False)

# 底座
loft("lantern_base", [
    (0.712, LX, LY, 0.040, 0.040),
    (0.724, LX, LY, 0.056, 0.056),
    (0.738, LX, LY, 0.058, 0.058),
], "brass", seg=14, rough=0.55, metallic=0.35, cap_bot=True, cap_top=False)

# 四根竖梁：正面一根、背面一根、左右各一根。
# 只做两根（正/背）在斜视角下会有一根消失，剩下三根反而更像"缺了一条腿"。
for _k in range(4):
    _a = TAU * (_k / 4.0) + math.pi * 0.25
    _bx = LX + math.cos(_a) * 0.058
    _by = LY + math.sin(_a) * 0.058
    loft_path("lantern_bar_%d" % _k,
              [(_bx, _by, 0.736), (_bx, _by, 0.844)],
              [0.0085, 0.0085], "brass", seg=5, rough=0.55, metallic=0.35)

# ============================================================================
# 五、腿脚（沿用 v4 的连续放样曲线：髋 → 膝 → 小腿肚 → 踝）
# ----------------------------------------------------------------------------
# 这条曲线是整整一轮调出来的，直接继承：膝上方收细（0.065）、膝下膨出（0.071）、
# 小腿肚最粗（0.073）、踝最细（0.049）。四段等半径的柱子读成"塑料管"。
# ============================================================================
LEG_PROF = [
    (0.818, 0.002, 0.084, 0.083),   # 髋（藏进斗篷）
    (0.742, 0.001, 0.083, 0.081),
    (0.664, 0.000, 0.079, 0.079),
    (0.572, -0.004, 0.072, 0.075),
    (0.494, -0.008, 0.068, 0.072),
    (0.450, -0.010, 0.065, 0.070),  # 膝（最细）
    (0.398, -0.006, 0.071, 0.077),  # 膝下膨出
    (0.330, 0.000, 0.073, 0.080),   # 小腿肚
    (0.256, 0.005, 0.065, 0.070),
    (0.176, 0.007, 0.055, 0.058),
    (0.112, 0.007, 0.049, 0.052),   # 踝
]

for sx in (-1, 1):
    tag = "L" if sx < 0 else "R"
    leg_key = "pantsLo" if sx < 0 else "pants"
    prof = [(z, sx * LEG_X, cy, rx, ry) for (z, cy, rx, ry) in LEG_PROF]
    loft("leg_" + tag, prof, leg_key, seg=12, cap_bot=False, cap_top=True)

    # 靴子：从脚底一直包到小腿中段（0.228），比 v4 的浅口鞋高得多。
    # 皮靴是"旅人"，浅口运动鞋是"病号"。上半圈半径必须大于小腿（0.055），
    # 否则小腿会从靴口鼓出来。
    #
    # 脚踝（0.100）必须是最细的一圈：上一版 rx 从 0.050 一路涨到 0.062 不收，
    # 整只靴子是个圆桶，读成雨靴。收一下才看得出踝骨。
    loft("boot_" + tag, [
        (0.000, sx * LEG_X, -0.030, 0.048, 0.096),
        (0.022, sx * LEG_X, -0.032, 0.055, 0.102),
        (0.060, sx * LEG_X, -0.026, 0.057, 0.100),
        (0.100, sx * LEG_X, -0.012, 0.052, 0.086),   # 踝（最细）
        (0.140, sx * LEG_X, -0.002, 0.058, 0.074),
        (0.190, sx * LEG_X, 0.004, 0.065, 0.070),
        (0.228, sx * LEG_X, 0.006, 0.067, 0.069),
    ], "boot", seg=14, cap_bot=True, cap_top=False)
    # 靴口翻边。
    # 没有它，靴口和裤腿几乎同径，两个边数不同的多边形（boot 14 段 / leg 12 段）
    # 边界会交错，渲出来是一圈蓝棕相间的锯齿 —— 看起来像靴子被撕开了。
    # 三级半径必须拉开：裤腿 0.058 < 靴筒 0.067 < 翻边 0.080，各差 1cm 以上。
    #
    # 下沿必须**钻进靴筒里面**（0.060 < 靴筒 0.065）。
    # 上一版让下沿等于靴筒半径（0.067），两根 14 段圆柱的同一圈顶点只是近似重合，
    # 差 2mm 就是一条环形缝 —— 缝后面是裤腿，斜着看过去是一块蓝色三角戳在靴子上。
    # 现在下沿埋进靴筒内部，翻边看起来是"从靴筒里翻出来的"，没有空腔可看。
    # 靴口翻边。rx 必须整个 < 0.074（半腿距）：两圈翻边都在身体中线两侧留缝。
    # 上一版最宽给到 0.080 > 0.074，两圈在中线处互相穿插 —— 双腿并立时穿模藏
    # 在靴子里看不见，一条腿一抬，相交面就被拉成一条连接两只靴子的土色条带。
    loft("cuff_" + tag, [
        (0.186, sx * LEG_X, 0.004, 0.058, 0.063),
        (0.208, sx * LEG_X, 0.006, 0.070, 0.075),
        (0.232, sx * LEG_X, 0.006, 0.064, 0.069),
    ], "sole", seg=14, cap_bot=False, cap_top=False)
    # 鞋底：薄薄一层，只做"靴子和钢丝之间有一道暗线"
    loft("sole_" + tag, [
        (0.000, sx * LEG_X, -0.030, 0.046, 0.093),
        (0.020, sx * LEG_X, -0.030, 0.049, 0.095),
    ], "sole", seg=14, cap_bot=True, cap_top=False)

# ============================================================================
# 合并：身体一个对象，提灯单独一个对象
# ----------------------------------------------------------------------------
# 提灯必须独立：并进身体再刷权重会被分到 Chest + 右手，一摆臂灯就跟着变形。
# 单独绑一根 Lantern 骨（100% 权重），灯永远是一个刚体。
# ============================================================================
lantern_objs = [o for o in PARTS if o.name.startswith("lantern")]
for o in lantern_objs:
    PARTS.remove(o)

for group, final_name, mesh_name in ((PARTS, "WireAcrobat", "WireAcrobatMesh"),
                                     (lantern_objs, "Lantern", "LanternMesh")):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in group:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = group[0]
    bpy.ops.object.join()
    ob = bpy.context.object
    ob.name = final_name
    ob.data.name = mesh_name
    if final_name == "WireAcrobat":
        CHAR = ob
    else:
        LAMP = ob

# ============================================================================
# 六、钢丝（单条曲线 → bevel）
# ============================================================================
CURVE = bpy.data.curves.new("SteelWire", 'CURVE')
CURVE.dimensions = '3D'
CURVE.resolution_u = 2
CURVE.bevel_depth = 0.0055
CURVE.bevel_resolution = 1
CURVE.fill_mode = 'FULL'
SP = CURVE.splines.new('POLY')
N = 17
SP.points.add(N - 1)
for i in range(N):
    t = i / (N - 1.0)
    SP.points[i].co = (0.0, 3.2 - t * 7.4, -0.018 * math.sin(math.pi * t), 1.0)
WIRE = bpy.data.objects.new("SteelWire", CURVE)
SCENE.collection.objects.link(WIRE)
CURVE.materials.append(M("steel", rough=0.35, metallic=0.55))

# ============================================================================
# 七、灯光 / 相机 / 渲染
# ============================================================================
def add_light(name, kind, loc, energy, size=3.0, color=(1, 1, 1), target=(0, 0, 1.0)):
    ld = bpy.data.lights.new(name, kind)
    ld.energy = energy
    ld.color = color
    if kind == 'AREA':
        ld.size = size
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    d = Vector(target) - Vector(loc)
    ob.rotation_mode = 'QUATERNION'
    ob.rotation_quaternion = d.to_track_quat('-Z', 'Y')
    SCENE.collection.objects.link(ob)
    return ob


# 按"浅色云海"配：Fill 是决定明度的主光（大面积冷天光），
# Key 是地平线来的暖逆光（只勾边），Rim 把角色从浅背景里拉出来。
add_light("Key", 'AREA', (-1.9, -2.6, 3.0), 150, size=3.4, color=(1.0, 0.90, 0.78))
add_light("Fill", 'AREA', (0.4, 4.4, 2.6), 380, size=5.5, color=(0.92, 0.96, 1.0))
add_light("Rim", 'AREA', (-1.4, 2.8, 3.2), 120, size=2.4, color=(1.0, 0.95, 0.88))

WORLD = bpy.data.worlds.new("W")
SCENE.world = WORLD
WORLD.use_nodes = True
bg = WORLD.node_tree.nodes["Background"]
bg.inputs[0].default_value = hex2lin("#A6B8C8")
bg.inputs[1].default_value = 1.55

CAM_DATA = bpy.data.cameras.new("Cam")
CAM_DATA.lens = 60
CAM = bpy.data.objects.new("Cam", CAM_DATA)
SCENE.collection.objects.link(CAM)
SCENE.camera = CAM


def look_at(ob, target):
    d = Vector(target) - ob.location
    ob.rotation_mode = 'QUATERNION'
    ob.rotation_quaternion = d.to_track_quat('-Z', 'Y')


for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'CYCLES'):
    try:
        SCENE.render.engine = eng
        break
    except Exception:
        continue

SCENE.render.resolution_x = 620
SCENE.render.resolution_y = 880
SCENE.render.resolution_percentage = 100
SCENE.render.film_transparent = False
SCENE.render.image_settings.file_format = 'PNG'
SCENE.render.image_settings.color_mode = 'RGBA'
SCENE.view_settings.view_transform = 'Standard'
SCENE.view_settings.look = 'None'
SCENE.view_settings.exposure = 0.35
try:
    SCENE.eevee.taa_render_samples = 48
except Exception:
    pass
try:
    SCENE.eevee.use_raytracing = True
except Exception:
    pass
try:
    SCENE.cycles.samples = 64
except Exception:
    pass

TARGET = (0, 0, 0.96)
VIEWS = {
    "prev_back": (0.0, 3.60, 1.32),
    "prev_side": (3.60, 0.0, 1.15),
    "prev_34": (2.45, 2.65, 1.50),
    "prev_head": (0.0, 1.30, 1.66),
}
for name, loc in VIEWS.items():
    CAM.location = loc
    look_at(CAM, (0, 0, 1.52) if name == "prev_head" else TARGET)
    SCENE.render.filepath = os.path.join(OUT, name + ".png")
    bpy.ops.render.render(write_still=True)

dg = bpy.context.evaluated_depsgraph_get()
tris = 0
verts = 0
for ob in SCENE.objects:
    if ob.type != 'MESH':
        continue
    me = ob.evaluated_get(dg).to_mesh()
    me.calc_loop_triangles()
    tris += len(me.loop_triangles)
    verts += len(me.vertices)
    ob.evaluated_get(dg).to_mesh_clear()

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "wire_char.blend"))
print("RESULT_JSON " + __import__("json").dumps({
    "ok": True, "tris": tris, "verts": verts,
    "engine": SCENE.render.engine, "out": OUT}))
