# 游戏贴图素材来源（assets/games/shoot）

## 当前只保留两张

全部来自 **Kenney**（kenney.nl）的 CC0 素材，经 GitHub 镜像仓库 **shorepine/kenney** 获取。
CC0 1.0：可商用、可修改、无需署名（此处仍保留出处以便追溯）。

| 本地文件 | 来源（仓库内路径） | 原始尺寸 | 用途 |
| --- | --- | --- | --- |
| `laser.png` | `2d/Space Shooter Remastered/Lasers/laserGreen09.png` | 9×37 | 子弹 |
| `star.png` | `2d/Space Shooter Remastered/Effects/star1.png` | 25×24 | 命中粒子 |

## 已删除的素材（2026-10-29「战机打外星人」改版）

| 文件 | 原用途 | 删除原因 |
| --- | --- | --- |
| `ship.png` | 玩家飞船（99×75） | **俯视视角**的侧滚射击素材，摆在透视地面上视角是矛盾的：俯视的机翼和地面透视永远不是同一个相机。改成矢量绘制的后视战机（`engine.js` 的 `_drawPlayer`）。 |
| `monster_body.png` / `monster_eye.png` / `mouth_idle.png` / `mouth_sad.png` / `brow_smug.png` | 萌系小怪兽（身体 + 眼睛 + 嘴 + 眉毛叠画） | 主题是「打外星人」而不是「打可爱小怪兽」。贴图做不出大颅骨 + 巨型杏仁眼的识别特征，也拼不出「受击 ><」这种表情。改成矢量绘制的 `_drawAlienBody`。 |

需要回退时从 git 取回即可：`git checkout HEAD -- assets/games/shoot/`。
注意贴图版和矢量版的**尺寸基准不同**（贴图版靠 `bh = r * 2.62` 反推，矢量版直接用 `hw/hh`），
回退要连 `engine.js` 的绘制函数一起退。

**星空背景不用贴图**：`bg.png` 早已删除。2.5D 场景（星空 / 星云 / 行星 / 异星城市剪影 /
透视甲板）全部由 `pkgShoot/games/shoot/scene2d.js` 程序化绘制，见该文件顶部注释。

## 加载方式

小程序 Canvas 2D 不能直接 `<image>`，`pkgShoot/games/shoot/sprites.js` 按顺序兜底：

1. `canvas.createImage()` + `img.src = 'assets/games/shoot/xxx.png'`（相对小程序根目录）
2. 失败 → `wx.getFileSystemManager().readFileSync(path, 'base64')` 转 `data:image/png;base64,...`
3. 都失败 → `get()` 返回 null，引擎自动回退到矢量绘制（不会白屏）

浏览器预览（`tools/shoot-preview`）没有 `canvas.createImage()`，`sprites.js` 会退到原生
`new Image()`。**但预览里必须先把 BASE 换成相对路径**（`setBase('../../assets/games/shoot/')`），
否则 `/assets/...` 会被解析成 `file:///assets/...` → 404，整屏退回矢量兜底，
截图和真机完全不是一回事。这条坑踩过，别删 `canvas-main.js` 里那行 `setBase`。

---

## fighter.png（2026-10-29 新增）

| 项 | 值 |
| --- | --- |
| 尺寸 | 306×216 RGBA（比例 = `engine._shipBox()` 的 68:48） |
| 体积 | 约 67 KB |
| 来源 | **项目内自制**。建模脚本 `tools/blender/fighter.py`，Blender 5.2 workbench 离线渲染 |
| 授权 | 自有，无第三方素材 |

**为什么是渲染图而不是 .glb**：小程序 canvas 只有 2D 上下文。运行时加载 3D 需要
WebGL + three.js + GLTFLoader，2026-10-29 试过并整体回滚（见 `docs/FR-GAME-01.md` 与
项目记忆：GLTFLoader 官方包没有、只引 `WebGLRenderer` 就要 461KB、真机上 WebGL 上下文
只能 `getContext` 一次）。这里就是一张位图，`drawImage` 一次。

**模型**：313 顶点 / 251 面，6 个材质分区（机身 / 暗面 / 座舱 / 涂装 / 面板线 / 喷口）。
设计是针对**后视角度**倒推的：宽三角翼、双外倾垂尾、双引擎、边条翼、平尾。
改模型重跑 `tools/blender/fighter.py` 即可，输出路径已写死在脚本顶部。

**兜底**：`sprites.js` 的 `ASSETS.fighter` 加载失败时 `get('fighter')` 返回 `null`，
`_drawPlayer` 走 `else` 分支的**矢量版**（完整保留，一行没删）。不会白屏、不会开天窗。

**和矢量版的差异**（改动时别踩）：
- 引擎位置不同：矢量版 `±0.28hw`（设计值），贴图版 `±0.115hw`（模型真实位置）。
  用错位置光团会飘到机翼上。
- 贴图放大系数 `SHIP_K = 1.32` 写在 `engine.js`，翼尖灯和引擎光的位置都乘了它。
  改这个系数必须同步改那两处。
