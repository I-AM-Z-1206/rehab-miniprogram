# -*- coding: utf-8 -*-
# ============================================================================
# tools/blender/render_sprite.py —— 把绑定好的人物渲成背影序列帧
# ----------------------------------------------------------------------------
# 用法：
#   blender -b tools/blender/out/wire_char_rigged.blend -P tools/blender/render_sprite.py
#   然后 python tools/blender/pack_sprite.py
#
# 为什么是序列帧而不是在游戏里跑 WebGL：
#   ① 微信小程序 canvas 的 WebGL 上下文一个页面只能拿一次，本项目场景切换已经
#      用过一次了，再给角色开一个等于把整个 pkgWire 的渲染器换掉；
#   ② three.js 走不了 tree-shaking，只引 WebGLRenderer 就 461KB，pkgWire 现在
#      整个分包才 240KB；
#   ③ 官方 threejs-miniprogram 不带 GLTFLoader，要自己搬 loader + DRACO。
#   序列帧把这三条全绕开了：一张 PNG、零依赖、engine.js 一行不动，
#   观感仍然是这套 3D 模型渲出来的。
#
# 相机必须是正交：透视相机下角色随 z 位置变化会有轻微缩放，逐帧拼起来
# 循环时会在"近头远脚"之间呼吸，一眼看出是贴图。
# ============================================================================

import bpy
import math
import os
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out", "sprite")
os.makedirs(OUT, exist_ok=True)

scene = bpy.context.scene

# 钢丝不渲进来：游戏里的钢索是 renderer.js 按 2.5D 透视画的，
# 贴图里再带一根会和场景里的对不上。
wire = bpy.data.objects.get("SteelWire")
if wire:
    wire.hide_render = True

# ---------------------------------------------------------------- 画幅裁切
# 上一版是 400x600 的整幅，其中 34% 是纯透明留白（杆伸到 x=35，脚下到 y=574，
# 而角色本体只占 x[35..334] y[43..570]）。8 帧全渲之后体积翻倍，
# 省掉这块留白就是白捡的。
#
# 裁切框必须**关于画幅竖轴 x=200 对称**，不能按 bbox 居中：
#   头中心量出来是 199~202（≈ 画幅中心），而全身 bbox 中心是 184.5。
#   差的这 15px 全在平衡杆上 —— 杆在身前约 20cm，被 15° 偏航投影到左边。
#   杆偏左是物理正确的，不是错位；**角色真正的轴是 x=200**。
#   按 bbox 居中会把整个身体右移 15px，角色就站不到钢丝上了。
#   所以半宽取 max(200-35, 334-200) + 余量 = 165 + 3 = 168。
#
# 原画幅 600px / 2.02m = 297.03 px/m，裁切框在原来那幅里的位置换算：
#   顶 y=40  → z = 1.91 - 40/297.03 = 1.77533
#   底 y=574 → z = 1.91 - 574/297.03 = -0.02247
ORTHO = 1.79780                 # 竖直覆盖 1.798m（原 2.02）
CAM_Z = 0.87643                 # 裁切框中心 = (1.77533 + (-0.02247)) / 2
# 脚底 z=0 距裁切框底边 (0-(-0.02247))/1.7978 = 0.0125 —— character.js 的 foot
FOOT = 0.0125
# 336x534 是裁切框的原尺寸（297.03 px/m 时不掉分辨率的 1:1）。
# 8 帧全渲在这个尺寸约 610KB，超过这张图该占的份量，缩到 0.929 倍：
#   px/m = 496/1.7978 = 275.9
#   屏幕上 558 物理像素（charH 241.8 逻辑 px × 1.1543 × dpr 2）
#   → 558/496 = 1.13 倍拉伸。原来 400 高那版是 1.40 倍，这一版还更清楚。
FRAME_W = 312
FRAME_H = 496

# ---------------------------------------------------------------- 正交相机
# 相机必须偏 15°，不能正对背后（0°）。
# 正后方视角下"迈步"是沿视线方向的前后位移，投影到画面上几乎为零 ——
# 两条腿永远叠在一起，怎么调动画都读成"一条腿"。偏 15° 之后前后步幅
# 会有一部分投影到横向，两腿才分得开；同时肩和杆有了透视收窄，
# 剪影不再是左右完全对称的对称图形（对称 = 贴纸）。
CAM_YAW = 15.0
cam_data = bpy.data.cameras.new("SpriteCam")
cam_data.type = 'ORTHO'
cam_data.ortho_scale = ORTHO
cam = bpy.data.objects.new("SpriteCam", cam_data)
scene.collection.objects.link(cam)
_yaw = math.radians(CAM_YAW)
cam.location = (math.sin(_yaw) * 6.0, math.cos(_yaw) * 6.0, CAM_Z)
d = Vector((0, 0, CAM_Z)) - cam.location
cam.rotation_mode = 'QUATERNION'
cam.rotation_quaternion = d.to_track_quat('-Z', 'Y')
scene.camera = cam

scene.render.resolution_x = FRAME_W
scene.render.resolution_y = FRAME_H
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.color_depth = '8'
scene.render.image_settings.compression = 100
try:
    scene.eevee.taa_render_samples = 64
except Exception:
    pass

# 8 帧覆盖整个循环（相位 0 ~ 7π/8，每 4 帧 = π/4）。CYCLE=32 → fr = 0,4,...,28
# 上一版只渲 4 帧、后 4 帧靠水平镜像，省下的预算换分辨率。**这条路走不通**：
#   镜像要成立，渲染必须关于画幅竖轴完全对称；而 15° 偏航恰恰是为了打破
#   左右对称（0° 偏航下两腿沿视线方向前后摆，投影不动，叠成一根柱子）。
#   镜像一个 15° 偏航的画面，等价于"从 -15° 看这个姿态"，而真实的相位 π
#   是"从 +15° 看镜像的姿态"。两者差一个 30° 的朝向：
#     横向偏移 = 2·sin(15°)·y·pxPerMeter
#   杆在身前 y≈0.20m → 2×0.2588×0.20×297 = 31px。
#   实测镜像前后 bbox 中心 184.5 → 215.5，正好 31px，每半圈抖一次。
#   **凡是有深度的部件都躲不过这一项**（手臂 25px），除非整个模型压成纸片。
FRAMES = [1, 5, 9, 13, 17, 21, 25, 29]
for i, fr in enumerate(FRAMES):
    scene.frame_set(fr)
    scene.render.filepath = os.path.join(OUT, "spr_%02d.png" % i)
    bpy.ops.render.render(write_still=True)

# 脚底在裁切后的画面里的位置（character.js 的 SPRITE.foot 必须等于这个数）
print("RESULT_JSON " + __import__("json").dumps({
    "ok": True,
    "frames": len(FRAMES),
    "frame_w": FRAME_W,
    "frame_h": FRAME_H,
    "foot_ratio_from_bottom": FOOT,
    "meter_h": round(ORTHO, 5),
    "cam_z": CAM_Z,
    "cam_yaw": CAM_YAW,
    "out": OUT,
}))
