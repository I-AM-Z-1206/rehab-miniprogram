# -*- coding: utf-8 -*-
# ============================================================================
# tools/blender/rig_anim.py —— 给 low-poly 走钢丝角色绑骨骼 + 走路循环 + 导出 glb
# ----------------------------------------------------------------------------
# 用法（必须先跑 build_char.py）：
#   blender -b tools/blender/out/wire_char.blend -P tools/blender/rig_anim.py
#
# 产出：
#   tools/blender/out/wire_char_rigged.blend
#   tools/blender/out/wire_acrobat.glb        带骨骼 + Walk 动画
#   tools/blender/out/anim_00..03.png         走路循环四个相位的预览
#
# ---------------------------------------------------------------- 为什么不用自动权重
# Blender 的 bone-heat 权重在"多个部件重叠、彼此不相连"的 mesh 上经常直接失败
# （failed to find solution for one or more bones），而这套模型本来就是 30 多个
# 圆柱/球拼起来再 join 的。所以这里自己刷：按"顶点到骨段的最短距离"做倒数加权，
# 只在最近的 2 根骨之间过渡。低模下这和 heat weighting 的观感没有差别，
# 但结果是确定的 —— 每个顶点一定有权重，且一定归一化。
#
# 两处必须硬绑（否则会被拉成橡皮）：
#   ① 兜帽：全部给 Head（靠 build_char 打的 HOOD 标记，不按高度切）。
#   ② 鞋：z < 0.150 全部给 Foot。靴子是刚体，只要有一角被分到 Shin，
#      落地帧靴子就会歪。
#   ③ 斗篷 / 披肩：只用 Hips/Spine/Chest（靠 GARMENT 标记）。
#      下摆 0.612 低于髋 0.800，按距离会自动判给 Thigh，一迈步就撕开。
# ============================================================================

import bpy
import math
import os
import json
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
BLEND = os.path.join(OUT, "wire_char_rigged.blend")

scene = bpy.context.scene
CHAR = bpy.data.objects.get("WireAcrobat")
LAMP = bpy.data.objects.get("Lantern")
WIRE = bpy.data.objects.get("SteelWire")
assert CHAR and LAMP, "先跑 build_char.py（需要 WireAcrobat + Lantern）"

# ============================================================================
# 一、骨架
# ============================================================================
# 尺寸全部对齐 build_char.py 里的关节落点。改那边就必须改这边，否则骨在肉里。
# v5 与 v4 的差别：没有平衡杆（Pole），多一根 Lamp 挂在右手；双臂从"胸前扶杆"
# 改成"自然下垂 / 外展提灯"，所以 UpperArm / ForeArm 的落点整条重算。
BONES = [
    # name,        head,                    tail,                    parent,     connect, deform
    ("Root",      (0, 0, 0.000),           (0, 0, 0.240),           None,       False, False),
    ("Hips",      (0, 0, 0.800),           (0, 0, 0.950),           "Root",     False, True),
    ("Spine",     (0, 0, 0.950),           (0, 0, 1.190),           "Hips",     True,  True),
    ("Chest",     (0, 0, 1.190),           (0, 0, 1.400),           "Spine",    True,  True),
    ("Neck",      (0, 0, 1.400),           (0, 0, 1.472),           "Chest",    True,  True),
    ("Head",      (0, 0, 1.472),           (0, 0, 1.740),           "Neck",     True,  True),
]

for sx, sfx in ((-1, "L"), (1, "R")):
    BONES += [
        ("Shoulder." + sfx, (sx * 0.045, 0.006, 1.372), (sx * 0.100, 0.004, 1.392),
         "Chest", False, False),
        # 左臂自然下垂（落点 -0.100 → -0.170，几乎贴着身体），
        # 右臂外展提灯（0.100 → 0.212，比左臂外张 4cm）。
        ("UpperArm." + sfx,
         (sx * 0.100, 0.004, 1.392),
         (sx * (0.152 if sx < 0 else 0.176), -0.006 if sx < 0 else -0.010, 1.150),
         "Shoulder." + sfx, True, True),
        ("ForeArm." + sfx,
         (sx * (0.152 if sx < 0 else 0.176), -0.006 if sx < 0 else -0.010, 1.150),
         (sx * (0.170 if sx < 0 else 0.206), -0.020 if sx < 0 else -0.034,
          0.905 if sx < 0 else 0.958),
         "UpperArm." + sfx, True, True),
        ("Hand." + sfx,
         (sx * (0.170 if sx < 0 else 0.206), -0.020 if sx < 0 else -0.034,
          0.905 if sx < 0 else 0.958),
         (sx * (0.170 if sx < 0 else 0.208), -0.032 if sx < 0 else -0.044,
          0.868 if sx < 0 else 0.938),
         "ForeArm." + sfx, True, True),
        ("Thigh." + sfx, (sx * 0.074, 0.002, 0.800), (sx * 0.074, -0.002, 0.450),
         "Hips", False, True),
        ("Shin." + sfx, (sx * 0.074, -0.002, 0.450), (sx * 0.070, 0.002, 0.105),
         "Thigh." + sfx, True, True),
        ("Foot." + sfx, (sx * 0.070, 0.002, 0.105), (sx * 0.070, -0.126, 0.035),
         "Shin." + sfx, True, True),
    ]

# 提灯：挂在右手掌，独立一根骨。
# 为什么不并进 Hand：灯是刚体，跟着手腕弯折会变形；
# 更重要的是它需要**自己的滞后摆动** —— 人手提着灯笼走路时，灯是晚半拍荡的。
BONES.append(("Lamp", (0.234, -0.050, 0.872), (0.234, -0.050, 0.712),
              "Hand.R", False, True))

arm_data = bpy.data.armatures.new("WireRig")
ARM = bpy.data.objects.new("WireRig", arm_data)
scene.collection.objects.link(ARM)

bpy.context.view_layer.objects.active = ARM
bpy.ops.object.mode_set(mode='EDIT')
eb = arm_data.edit_bones
for name, head, tail, parent, connect, deform in BONES:
    b = eb.new(name)
    b.head = Vector(head)
    b.tail = Vector(tail)
    b.use_deform = deform
    if parent:
        b.parent = eb[parent]
        b.use_connect = connect

# 骨骼 roll 统一归零：四肢都沿各自的轴，绕本地 X 就是前后摆，
# 不手动归零的话不同骨的 X 轴朝向不一致，一个姿势表套到左右腿会反。
for b in eb:
    b.roll = 0.0
bpy.ops.object.mode_set(mode='OBJECT')

DEFORM = [n for n, h, t, p, c, d in BONES if d]

# ============================================================================
# 二、刷权重
# ============================================================================
def seg_dist(p, a, b):
    ab = b - a
    l2 = ab.length_squared
    if l2 < 1e-12:
        return (p - a).length
    t = max(0.0, min(1.0, (p - a).dot(ab) / l2))
    return (p - (a + ab * t)).length


BSEG = {}
for name, head, tail, parent, connect, deform in BONES:
    if deform:
        BSEG[name] = (Vector(head), Vector(tail))


def tag_verts(obj, group):
    """读 build_char.py 打好的顶点组标记，返回顶点索引集合。"""
    vg = obj.vertex_groups.get(group)
    if not vg:
        return set()
    gi = vg.index
    return {v.index for v in obj.data.vertices
            if any(g.group == gi for g in v.groups)}


def paint(obj, allowed, hard_rules=None, masks=None):
    """masks: [(顶点索引集合, [允许的骨名])]，命中就只用那几根骨。"""
    me = obj.data
    mw = obj.matrix_world
    masks = masks or []
    for g in list(obj.vertex_groups):
        obj.vertex_groups.remove(g)
    vg = {n: obj.vertex_groups.new(name=n) for n in allowed}

    for v in me.vertices:
        p = mw @ v.co

        forced = None
        if hard_rules:
            forced = hard_rules(p)
        if forced:
            # 允许返回 {骨名: 权重} —— 按高度自上而下过渡时必须能给多个骨
            if isinstance(forced, dict):
                for bn, wt in forced.items():
                    if wt > 1e-4:
                        vg[bn].add([v.index], wt, 'REPLACE')
            else:
                vg[forced].add([v.index], 1.0, 'REPLACE')
            continue

        use = allowed
        for idxs, names in masks:
            if v.index in idxs:
                use = names
                break

        ds = sorted((seg_dist(p, BSEG[n][0], BSEG[n][1]), n) for n in use)
        d1, n1 = ds[0]
        if len(ds) == 1:
            vg[n1].add([v.index], 1.0, 'REPLACE')
            continue
        d2, n2 = ds[1]
        # 次近骨远出 2.2 倍以上就单骨硬绑 —— 否则整条腿都会被躯干骨拖一点
        if d2 > d1 * 2.2 + 0.012:
            vg[n1].add([v.index], 1.0, 'REPLACE')
        else:
            a1 = 1.0 / (d1 + 0.004) ** 3
            a2 = 1.0 / (d2 + 0.004) ** 3
            s = a1 + a2
            vg[n1].add([v.index], a1 / s, 'REPLACE')
            vg[n2].add([v.index], a2 / s, 'REPLACE')

    obj.parent = ARM
    obj.matrix_parent_inverse = ARM.matrix_world.inverted()
    m = obj.modifiers.new("Armature", 'ARMATURE')
    m.object = ARM


body_bones = [n for n in DEFORM if n != "Lamp"]


# 下半身（z < 0.34）**只按高度分配权重**，不看半径。
#
# 为什么必须这样：靴筒（半径 0.065）和裤腿（0.058）在同一个高度上，
# 到 Shin / Foot 两根骨的距离不一样 → 距离加权算出的混合比不一样
# （0.176 处靴子 75/25、裤腿 65/35）→ 脚踝一转，两者错开，
# 裤腿就从靴筒侧面戳出来一块。靴子的粗细本来就和裤腿不同，
# **只要按距离算，这个错位就必然存在**，改阈值、改半径都只是挪位置。
# 按 z 算，同高度的所有顶点拿到同一组权重，靴子和裤腿永远同步。
def body_rules(p):
    z = p.z
    if z > 0.34:
        return None
    side = "L" if p.x < 0 else "R"
    if z <= 0.105:                      # 踝以下：刚性
        return {"Foot." + side: 1.0}
    t = (z - 0.105) / (0.34 - 0.105)
    t = t * t * (3.0 - 2.0 * t)         # smoothstep，踝不可见折角
    return {"Foot." + side: 1.0 - t, "Shin." + side: t}


# 斗篷会盖到 0.612（低于髋 0.800），侧摆顶点离 Thigh 只有 12cm、离 Hips 27cm，
# 纯按距离刷权重会整片判给大腿 —— 一迈步下摆被撕开。所以用 build_char 打的
# GARMENT / HOOD 标记，把这两类顶点圈死在躯干骨和头骨里。
GARMENT_V = tag_verts(CHAR, "GARMENT")
HOOD_V = tag_verts(CHAR, "HOOD")
TORSO_BONES = ["Hips", "Spine", "Chest"]

paint(CHAR, body_bones, body_rules,
      masks=[(GARMENT_V, TORSO_BONES), (HOOD_V, ["Head"])])
paint(LAMP, ["Lamp"])

# ============================================================================
# 三、走路循环
# ----------------------------------------------------------------------------
# 走钢丝不是走路：步幅只有 10~15cm、膝盖从不锁死、永远至少一只脚在钢丝上。
# 所以大腿摆幅只给 9°，小腿屈曲给到 28°（抬脚全靠屈膝，不靠抬大腿）。
#     腿向前摆  = 绕本地 X 负角（骨沿 -Z，正角是往后）
#     抬脚相位  = cos(phase) 的正半周，和大腿"从后往前"的区间重合
# 四条硬规则（和 2D 版 character.js 完全一致，被患者看过的）：
#   a) 任何时刻至少一只脚在钢丝上 → 两腿相位差 π，抬脚量取 max(0, cos)
#   b) 抬脚必须同时变高、变短、向外，只改一样读成"上下抽搐"
#   c) 身体起伏是步频两倍 —— 用 cos(2*phase)，写成 |sin| 会跟落脚同相，像在蹦
#   d) 脚要钉在钢丝上：脚掌角度反向抵消 thigh+shin 的累计旋转
# ============================================================================
FPS = 24
CYCLE = 32                      # 32 帧一个完整循环（左右各一步）≈ 1.33s
scene.render.fps = FPS

ARM.animation_data_create()
ACT = bpy.data.actions.new("Walk")
ARM.animation_data.action = ACT

if hasattr(ACT, "slots"):       # Blender 4.4+ 的 layered action
    try:
        slot = ACT.slots.new(id_type='OBJECT', name="WireRig")
        ARM.animation_data.action_slot = slot
    except Exception:
        pass


def deg(v):
    return math.radians(v)


# ---------------------------------------------------------------- 腿的横向偏转
# 相机偏航 15°，屏幕上： screen_x = -x·cos(φ+15°) + y·sin(φ+15°)
# φ = 0 时腿的**前后摆动**会整量投影成**横向位移**：实测两脚间距在 8 帧里
# 从 7.8px 抖到 62.6px（鞋宽 34px）—— 帧 9/13/17 直接并成一只脚，
# 最开的那帧又张得像劈叉。这就是"身体扭曲"的第二个来源（第一个是内收交叉）。
#
# φ 越大波动越小：
#   +6°  → 20~50px（span 31）
#   +9°  → 26~44px（span 18）
#   +10.5° → 29~42px（span 13）   ← 取这个
#   +14° → 34~38px（span 4，但横向摆动几乎没了，读不出"在迈步"）
# 均值恒为 36px = 髋距的投影，所以"两条腿分得开"这件事不受影响。
# 注意符号是 **+**：骨头的本地 Y 沿 -Z（朝下），正号才对应世界里绕竖直轴的反向，
# 这一点和纸上推导反着，是实测出来的（tools/blender/scan_leg_yaw.py）。
#
# 静止时无副作用：竖直下垂的腿绕竖直轴自转不产生位移，只在摆动时起作用。
LEG_YAW = deg(10.5)


def pose_at(f):
    """返回 {bone: (rx, ry, rz)}（弧度）。f 从 0 到 CYCLE。"""
    ph = (f / float(CYCLE)) * math.tau
    out = {}

    for sfx in ("L", "R"):
        p = ph + (0.0 if sfx == "L" else math.pi)

        thigh = deg(-13.0) * math.sin(p)
        lift = max(0.0, math.cos(p)) ** 1.25
        shin = deg(46.0) * lift + deg(4.5)
        foot = -(thigh + shin) * 0.75

        # 内收归零。
        # 8° 会交叉成 X（老结论），3° 在换过相机和收窄腿之后同样交叉 ——
        # 因为大腿根本来就是互相重叠的（半径 0.084 > 腿距 0.074，内侧叠 1cm，
        # 目的是让大腿连成一片、不出现一条竖缝）。一旦绕髋部再拧 3°，
        # 两根轴就从"平行重叠"变成"对穿"，投影到 15° 偏航的画面上就是打叉。
        # 平行重叠只会读成"两腿内侧贴着"，交叉才读成"扭曲"。
        #
        # 第二个分量 LEG_YAW 是**绕竖直轴**的偏转（骨头本地 Y ≈ 世界竖直），
        # 它不改静止姿态，只改"摆动朝哪个方向"，用来抵消偏航带来的横向放大。
        # 两条腿同号 —— 补偿的是相机视角，不是腿之间的关系。
        out["Thigh." + sfx] = (thigh, LEG_YAW, 0.0)
        out["Shin." + sfx] = (shin, 0.0, 0.0)
        out["Foot." + sfx] = (foot, 0.0, 0.0)

    # ---------------------------------------------------------------- 手臂
    # 左臂空手自然摆。方向和同侧腿**相反**（thigh 是 -13·sin，这里 +7·sin）。
    # 右臂提灯，只给 2.5° —— 手里端着一盏灯的人不会甩胳膊。
    #
    # 摆幅这么小还有个工程原因：斗篷肩坡（x 0.152）离 UpperArm 骨头只有 5cm，
    # 权重会分一点给手臂。7° 在该处的位移是 0.052·sin7° ≈ 6mm ≈ 1px，看不见；
    # 给到 15° 就会看到"斗篷肩膀跟着手臂一起动"。
    pL = ph
    pR = ph + math.pi
    out["UpperArm.L"] = (deg(7.0) * math.sin(pL), 0.0, deg(-1.5))
    out["ForeArm.L"] = (deg(4.0) + deg(3.0) * math.sin(pL - 0.5), 0.0, 0.0)
    out["UpperArm.R"] = (deg(2.5) * math.sin(pR), 0.0, deg(2.0))
    out["ForeArm.R"] = (deg(6.0), 0.0, 0.0)
    # 灯是晚半拍荡的：相位滞后 0.9rad。这一下比什么都更能说明"这是提着的"。
    out["Lamp"] = (deg(4.5) * math.sin(ph - 0.9), 0.0, 0.0)

    # 身体：上下起伏两倍频 + 左右微倾 + 一点前倾
    sway = math.sin(ph)
    out["Hips"] = (deg(1.8), deg(0.6) * sway, deg(2.2) * sway)
    out["Spine"] = (deg(-1.0), deg(0.5) * sway, deg(-1.2) * sway)
    out["Chest"] = (deg(-0.8), deg(0.6) * sway, deg(-1.0) * sway)
    # 头稳住：人走路时眼睛是水平的，头跟着躯干晃会晕
    out["Head"] = (deg(-1.0), deg(-0.4) * sway, deg(-1.2) * sway)
    return out


BOB = 0.007                     # 起伏幅度（米）

for fr in range(0, CYCLE + 1):
    frame = fr + 1
    p = pose_at(fr)
    ph = (fr / float(CYCLE)) * math.tau

    for name, rot in p.items():
        pb = ARM.pose.bones[name]
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = rot
        pb.keyframe_insert("rotation_euler", frame=frame)

    hips = ARM.pose.bones["Hips"]
    hips.location = (0.0, 0.0, BOB * math.cos(2.0 * ph))
    hips.keyframe_insert("location", frame=frame)

# 线性插值：走路循环里 Bezier 会在关键帧之间"过冲"，脚会陷进钢丝
# Blender 4.4+ 的 Action 是 layered 结构，没有 .fcurves，要往下钻 channelbag；
# 4.3 及以前是扁平的 .fcurves。两条路都走一遍。
def iter_fcurves(action):
    if hasattr(action, "fcurves"):
        try:
            return list(action.fcurves)
        except Exception:
            pass
    out = []
    for layer in getattr(action, "layers", []):
        for strip in getattr(layer, "strips", []):
            for cbag in getattr(strip, "channelbags", []):
                out.extend(cbag.fcurves)
    return out


FCURVES = iter_fcurves(ACT)
for fc in FCURVES:
    for kp in fc.keyframe_points:
        kp.interpolation = 'LINEAR'

scene.frame_start = 1
scene.frame_end = CYCLE + 1

# ============================================================================
# 四、渲染四个相位预览
# ============================================================================
CAM = bpy.data.objects.get("Cam")
TARGET = (0, 0, 0.96)
CAM.location = (0.0, 3.60, 1.32)
d = Vector(TARGET) - CAM.location
CAM.rotation_mode = 'QUATERNION'
CAM.rotation_quaternion = d.to_track_quat('-Z', 'Y')

scene.render.resolution_x = 420
scene.render.resolution_y = 620

for i, fr in enumerate((1, 9, 17, 25)):
    scene.frame_set(fr)
    scene.render.filepath = os.path.join(OUT, "anim_%02d.png" % i)
    bpy.ops.render.render(write_still=True)

scene.frame_set(1)

# ============================================================================
# 五、导出 glb
# ============================================================================
bpy.ops.wm.save_as_mainfile(filepath=BLEND)

GLB = os.path.join(OUT, "wire_acrobat.glb")
for ob in scene.objects:
    ob.select_set(ob.name in ("WireAcrobat", "Lantern", "WireRig"))

kw = dict(
    filepath=GLB,
    export_format='GLB',
    use_selection=True,
    export_yup=True,
    export_apply=False,
    export_animations=True,
    export_frame_range=True,
    export_anim_slide_to_zero=False,
    export_bake_animation=False,
    export_skins=True,
    export_morph=False,
    export_cameras=False,
    export_lights=False,
    export_extras=False,
)
try:
    bpy.ops.export_scene.gltf(**kw)
except TypeError:
    # 5.x 删掉/改名了部分参数，逐级降级
    for drop in ("export_bake_animation", "export_anim_slide_to_zero", "export_extras",
                 "export_morph", "export_apply"):
        kw.pop(drop, None)
        try:
            bpy.ops.export_scene.gltf(**kw)
            break
        except TypeError:
            continue

size = os.path.getsize(GLB) if os.path.exists(GLB) else -1
print("RESULT_JSON " + json.dumps({
    "ok": os.path.exists(GLB),
    "glb": GLB,
    "glb_bytes": size,
    "bones": len(BONES),
    "deform": len(DEFORM),
    "frames": CYCLE + 1,
    "fps": FPS,
    "fcurves": len(FCURVES),
}))
