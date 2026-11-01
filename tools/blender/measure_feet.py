# -*- coding: utf-8 -*-
# ============================================================================
# tools/blender/measure_feet.py —— 不渲图，直接算每帧两只脚落在画面上的横坐标
# ----------------------------------------------------------------------------
# 用法：
#   blender -b tools/blender/out/wire_char_rigged.blend -P tools/blender/measure_feet.py
#
# 为什么需要它：
#   走路循环里"两只脚挤成一条"是投影问题，不是模型问题。改一次动画重渲一次
#   要几分钟，而这里只是把 Foot 骨的端点投到相机平面上 —— 几秒钟，可以反复调参。
#
# 相机必须和 render_sprite.py 完全一致（CAM_YAW / CAM_Z / ORTHO / FRAME_*），
# 否则算出来的像素和渲出来的对不上，调参就变成瞎调。
# ============================================================================

import bpy
import math
import os
import sys
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

# ---- 和 render_sprite.py 保持一致的四个数 ----
CAM_YAW = 15.0
ORTHO = 1.79780
CAM_Z = 0.87643
FRAME_W = 312
FRAME_H = 496

scene = bpy.context.scene
# 骨架对象叫 WireRig（网格才是 WireAcrobat）。按类型兜底，改名了也不会崩。
ARM = bpy.data.objects.get("WireRig")
if ARM is None:
    ARM = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
assert ARM, "这不是绑好骨的 blend"

# ---- 复刻 render_sprite.py 的相机基向量（正交，只看方向）----
yaw = math.radians(CAM_YAW)
cam_loc = Vector((math.sin(yaw) * 6.0, math.cos(yaw) * 6.0, CAM_Z))
forward = (Vector((0, 0, CAM_Z)) - cam_loc).normalized()
up_hint = Vector((0, 0, 1))
right = forward.cross(up_hint).normalized()          # 相机本地 +X
up = right.cross(forward).normalized()

px_per_m = FRAME_H / ORTHO


def project(p):
    """世界坐标 → 画面像素（x 向右, y 向下）"""
    d = Vector(p) - cam_loc
    x = d.dot(right)
    y = d.dot(up)
    return (FRAME_W * 0.5 + x * px_per_m,
            FRAME_H * 0.5 - y * px_per_m)


def foot_point(side):
    """鞋底中心：Foot 骨的 tail 就是脚尖，取 head/tail 中点再往下一截更稳"""
    pb = ARM.pose.bones["Foot." + side]
    head = ARM.matrix_world @ pb.head
    tail = ARM.matrix_world @ pb.tail
    # 鞋底：取脚骨中点，z 压到鞋底高度（0.02m），横向不参与判断
    mid = (head + tail) * 0.5
    return Vector((mid.x, mid.y, 0.02))


fmin = int(scene.frame_start)
fmax = int(scene.frame_end)
# 动作可能有 32 帧一个循环（CYCLE=32），但渲染只取 8 个相位。
# 直接按 8 个相位取帧，和 render_sprite.py 的 FRAMES 列表保持一致。
RENDER_FRAMES = [1, 5, 9, 13, 17, 21, 25, 29]
print("FRAME  Lx      Rx      gap   L_y     R_y   (px / m)")
rows = []
for f in RENDER_FRAMES:
    scene.frame_set(f)
    lp = foot_point("L")
    rp = foot_point("R")
    lx, lyy = project(lp)
    rx, _ = project(rp)
    rows.append((f, lx, rx, rx - lx, lp.y, rp.y))
    print("%5d  %7.2f %7.2f %7.2f  %6.3f %6.3f" %
          (f, lx, rx, rx - lx, lp.y, rp.y))

gaps = [abs(r[3]) for r in rows]
print("GAP min=%.2f max=%.2f span=%.2f  (frame %d..%d, px_per_m=%.1f)" %
      (min(gaps), max(gaps), max(gaps) - min(gaps), fmin, fmax, px_per_m))
print("CENTER 画幅中线 = %.1f" % (FRAME_W * 0.5))
