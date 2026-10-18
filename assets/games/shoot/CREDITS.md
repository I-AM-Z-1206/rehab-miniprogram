# 游戏贴图素材来源（assets/games/shoot）

全部来自 **Kenney**（kenney.nl）的 CC0 素材，经 GitHub 镜像仓库 **shorepine/kenney** 获取。
CC0 1.0：可商用、可修改、无需署名（此处仍保留出处以便追溯）。

| 本地文件 | 来源（仓库内路径） | 原始尺寸 | 用途 |
| --- | --- | --- | --- |
| `bg.png` | `2d/Space Shooter Remastered/Backgrounds/darkPurple.png` | 256×256 | 星空背景（平铺 + 缓慢视差） |
| `ship.png` | `2d/Space Shooter Remastered/playerShip1_blue.png` | 99×75 | 玩家飞船（跟随左右倾斜） |
| `laser.png` | `2d/Space Shooter Remastered/Lasers/laserGreen09.png` | 9×37 | 子弹 |
| `star.png` | `2d/Space Shooter Remastered/Effects/star1.png` | 25×24 | 命中粒子 |
| `monster_body.png` | `2d/Monster Builder Pack/body_greenC.png` | 141×194 | 小怪兽身体 |
| `monster_eye.png` | `2d/Monster Builder Pack/eye_cute_dark.png` | 64×69 | 眼睛 |
| `mouth_idle.png` | `2d/Monster Builder Pack/mouthA.png` | 70×34 | 平静表情（张嘴笑） |
| `mouth_sad.png` | `2d/Monster Builder Pack/mouth_closed_sad.png` | 52×20 | 被击中：悲伤 |
| `brow_smug.png` | `2d/Monster Builder Pack/eyebrowA.png` | 49×32 | 停火大笑时挑起的眉毛 |

合计约 9 KB。怪兽是「身体 + 眼睛 + 嘴（+ 眉毛）」四层叠画，比例见
`utils/game/engine.js` 的 `_drawMonster()`（眼 0.28×体宽、位于 0.41×体高，嘴 0.31~0.34×体宽、位于 0.63×体高）。

## 加载方式

小程序 Canvas 2D 不能直接 `<image>`，`utils/game/sprites.js` 按顺序兜底：

1. `canvas.createImage()` + `img.src = 'assets/games/shoot/xxx.png'`（相对小程序根目录）
2. 失败 → `wx.getFileSystemManager().readFileSync(path, 'base64')` 转 `data:image/png;base64,...`
3. 都失败 → `get()` 返回 null，引擎自动回退到矢量绘制（不会白屏）

## 替换建议

保持文件名与目录不变直接覆盖即可；尺寸比例变了的话，同步改 `_drawMonster()` 里的比例系数。
