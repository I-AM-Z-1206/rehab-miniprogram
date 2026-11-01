# -*- coding: utf-8 -*-
# ============================================================================
# tools/blender/pack_sprite.py —— 把 4 张背影序列帧拼成图集
# ----------------------------------------------------------------------------
#   python tools/blender/pack_sprite.py
#
# 输出：
#   tools/blender/out/sprite/wire_walk_8.png     1248x992 图集（4x2）
#   tools/blender/out/sprite/wire_walk_game.png   游戏实际尺寸的观感预览（深底）
# ============================================================================

import os
import sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "out", "sprite")
N = 8

frames = []
for i in range(N):
    p = os.path.join(SRC, "spr_%02d.png" % i)
    frames.append(Image.open(p).convert("RGBA"))

fw, fh = frames[0].size

# 透明边缘的 RGB 有时是黑的（物体没覆盖到的像素），缩小绘制时会被插值
# 掺进轮廓形成一圈脏边。做法是把颜色向外扩 2px：alpha 膨胀后，
# 用邻近的不透明像素颜色填进去。
def dilate_rgb(img, steps=2):
    px = img.load()
    w, h = img.size
    alpha = img.split()[3]
    for _ in range(steps):
        ap = alpha.load()
        new_rgb = {}
        for y in range(h):
            for x in range(w):
                if ap[x, y] > 8:
                    continue
                r = g = b = a = 0
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h and ap[nx, ny] > 8:
                            cr, cg, cb, ca = px[nx, ny]
                            r += cr * ca
                            g += cg * ca
                            b += cb * ca
                            a += ca
                if a:
                    new_rgb[(x, y)] = (r // a, g // a, b // a, 0)
        for (x, y), v in new_rgb.items():
            px[x, y] = v
    return img


frames = [dilate_rgb(f, 2) for f in frames]

# 8 帧排 4x2。横排一长条（2496x496）PNG 的行间相关性很差，方块能省两三成体积。
# 单帧已经是裁切过的（312x496，关于身体轴左右对称），没有可再裁的留白。
COLS = 4
ROWS = (N + COLS - 1) // COLS
sheet = Image.new("RGBA", (fw * COLS, fh * ROWS), (0, 0, 0, 0))
for i, f in enumerate(frames):
    sheet.paste(f, ((i % COLS) * fw, (i // COLS) * fh))

out_sheet = os.path.join(SRC, "wire_walk_8.png")
sheet.save(out_sheet, optimize=True)
print("sheet", sheet.size, os.path.getsize(out_sheet), "bytes")

# ---- 游戏实际尺寸的观感预览 ------------------------------------------------
# 贴图在游戏里被画成 558.2 物理像素高（charH 241.8 逻辑 px × 1.1543 × dpr 2），
# 也就是 496 高的图放大 1.125 倍。预览按这个倍数画，才是"眼睛真正看到的"。
SCALE = 558.2 / 496.0
PW = int(round(fw * SCALE))
PH = int(round(fh * SCALE))
PCOLS = 4
PROWS = (N + PCOLS - 1) // PCOLS
bg = Image.new("RGBA", (PW * PCOLS, PH * PROWS), (24, 36, 48, 255))
for i, f in enumerate(frames):
    r = f.resize((PW, PH), Image.LANCZOS)
    bg.paste(r, ((i % PCOLS) * PW, (i // PCOLS) * PH), r)
out_prev = os.path.join(SRC, "wire_walk_game.png")
bg.convert("RGB").save(out_prev, optimize=True)
print("preview", bg.size, os.path.getsize(out_prev), "bytes")
print("RESULT_JSON " + __import__("json").dumps({
    "ok": True,
    "sheet": out_sheet,
    "sheet_bytes": os.path.getsize(out_sheet),
    "frame_w": fw, "frame_h": fh, "count": N,
    "cols": COLS, "rows": ROWS,
}))
