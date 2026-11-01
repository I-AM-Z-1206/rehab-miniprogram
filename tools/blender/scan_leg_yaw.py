# -*- coding: utf-8 -*-
# ============================================================================
# tools/blender/scan_leg_yaw.py —— 扫描「腿绕竖直轴偏转」角度对两脚间距的影响
# ----------------------------------------------------------------------------
# 用法：
#   blender -b tools/blender/out/wire_char_rigged.blend -P tools/blender/scan_leg_yaw.py
#
# 背景：
#   相机偏航 15°，于是腿的**前后摆动**会投影成**横向位移**。
#   屏幕上： screen_x = -x·cos(φ+15°) + y·sin(φ+15°)
#   其中 φ 是腿绕竖直轴额外转的角度。
#   φ = 0     → y 系数 = sin15° = 0.259，摆动全量投影到横向（两脚一会儿大开一会儿并死）
#   φ = -15°  → y 系数 = 0，横向完全恒定 —— 但那样两腿就只剩髋距，
#               等于把偏航归零，"两条腿"读不出来（这就是当初加 15° 偏航的原因）
#   所以要的是**部分补偿**：保留 30% 左右的横向摆动，把波动从 ±27px 压到 ±8px。
#
# 这个脚本不改文件，只在内存里临时叠加旋转，扫一遍角度看哪个 gap 最稳。
# ============================================================================

import bpy
import math
import os
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))

CAM_YAW_DEG = 15.0
ORTHO = 1.79780
CAM_Z = 0.87643
FRAME_W = 312
FRAME_H = 496
RENDER_FRAMES = [1, 5, 9, 13, 17, 21, 25, 29]

scene = bpy.context.scene
ARM = bpy.data.objects.get("WireRig")
if ARM is None:
    ARM = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
assert ARM

yaw = math.radians(CAM_YAW_DEG)
cam_loc = Vector((math.sin(yaw) * 6.0, math.cos(yaw) * 6.0, CAM_Z))
forward = (Vector((0, 0, CAM_Z)) - cam_loc).normalized()
right = forward.cross(Vector((0, 0, 1))).normalized()
up = right.cross(forward).normalized()
px_per_m = FRAME_H / ORTHO


def project(p):
    d = Vector(p) - cam_loc
    return (FRAME_W * 0.5 + d.dot(right) * px_per_m,
            FRAME_H * 0.5 - d.dot(up) * px_per_m)


def foot_x(side):
    pb = ARM.pose.bones["Foot." + side]
    mid = (ARM.matrix_world @ pb.head + ARM.matrix_world @ pb.tail) * 0.5
    return project(Vector((mid.x, mid.y, 0.02)))[0]


def gap_at(phi_deg):
    """返回 8 个相位下的 |gap| 列表"""
    out = []
    sign = 1.0 if phi_deg >= 0 else -1.0
    phi = math.radians(abs(phi_deg))
    for f in RENDER_FRAMES:
        scene.frame_set(f)
        # 叠加：只动 Thigh 的本地 Y（骨骼沿 -Z，本地 Y ≈ 世界竖直轴）
        for sfx in ("L", "R"):
            tb = ARM.pose.bones["Thigh." + sfx]
            rx = tb.rotation_euler[0]
            tb.rotation_euler = (rx, sign * phi, 0.0)
            # 鞋扭回来，脚尖仍然朝前
            fb = ARM.pose.bones["Foot." + sfx]
            fx, fy, fz = fb.rotation_euler
            fb.rotation_euler = (fx, -sign * phi, fz)
        bpy.context.view_layer.update()
        out.append(abs(foot_x("R") - foot_x("L")))
    # 复位
    for sfx in ("L", "R"):
        ARM.pose.bones["Thigh." + sfx].rotation_euler = (0, 0, 0)
        ARM.pose.bones["Foot." + sfx].rotation_euler = (0, 0, 0)
    return out


print("phi_deg   min     max     span    mean   gaps")
best = None
for d in (0, -6, -9, -10.5, -12, -14, -15, 6, 9, 10.5, 12, 14):
    g = gap_at(d)
    span = max(g) - min(g)
    mean = sum(g) / len(g)
    print("%7.2f %7.2f %7.2f %7.2f %7.2f  %s" %
          (d, min(g), max(g), span, mean, " ".join("%.0f" % v for v in g)))
    if min(g) > 12 and (best is None or span < best[1]):
        best = (d, span, min(g), max(g))
print("BEST %s" % (best,))
