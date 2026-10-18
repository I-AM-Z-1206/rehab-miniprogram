# FR-GAME-01 · 射击训练（体感静态保持 + 固定小怪兽）

微信小程序原生 Canvas 2D 实现的康复射击游戏。患者佩戴 WitMotion WT9011DCL 传感器，
通过**身体左右移动**把准星对准屏幕中间的**固定小怪兽**持续射击。按实机佩戴方向，
左右移动读取传感器的 **Pitch 轴**（实测该轴对应左右方向），Roll 仅缓存；游戏小人按**镜像方向**跟随患者。
**保持在范围内才会自动开火**；偏离超过 `keepRangeDeg` 立即停火（清空在飞子弹）、暂停每秒基础分，
外星人露出**张嘴大笑**（停火嘲笑）；击中怪兽露出**悲伤表情**。
治疗师可在训练过程中实时调整判定范围、发射频率、难度、得分区间与保持范围，**无需重启游戏**。
画面使用 Kenney CC0 贴图（飞船 / 怪兽 / 激光 / 星空），贴图加载失败时自动回退矢量绘制。

---

## 1. 文件结构

```
utils/game/
├── config.js    ConfigStore   配置中心：SCHEMA 声明、校验/收敛、难度预设、持久化、变更广播
├── score.js     ScoreManager  0.1s 击中累计 + 连击奖励 + 1.0s 基础计时/计分
├── bullet.js    BulletSystem  子弹对象池、速度/散射、上一帧位置（供扫掠判定）
├── hit.js       HitDetector   圆-圆 / 线段-圆扫掠判定，判定半径可热更新
├── pose.js      PoseTracker   实机 Pitch → 镜像横向位置、左右方向、保持范围、掉线检测、帧率统计
├── engine.js    GameEngine    帧循环、60Hz 姿态采样、双时钟、开火/碰撞、贴图渲染、参数热更新
├── sprites.js   SpriteBank    贴图加载（createImage → base64 兜底，失败回退矢量）
├── audio.js     AudioKit      音效池 + BGM（素材见 audio/game/CREDITS.md）
└── index.js     对外门面       setHitArea / setFireRate / setDifficulty ...

pages/shoot/     游戏页面：Canvas 舞台 + 治疗师控制台（滑块/开关/难度档位）
assets/games/shoot/         Kenney CC0 贴图 9 张（约 9KB，见该目录 CREDITS.md）
tools/game_selftest.js     纯逻辑自测（47 项断言）
tools/game_engine_sim.js   桩化 Canvas 的引擎冒烟测试（1200 帧）
tools/game_sprite_sim.js   贴图渲染 / 矢量回退双路径冒烟测试
audio/game/                音效与 BGM（来自 GitHub phaserjs/examples）
```

页面入口：游戏 Tab → 「射击」→ `pages/shoot/shoot`（已注册进 `app.json`）。

---

## 2. 配置项声明（ConfigStore）

所有参数声明在 `utils/game/config.js` 的 `SCHEMA`，包含 `min/max/step/unit/label/tip`，
控制台控件由它生成；取值统一经 `coerce()` 收敛。配置写入 `wx.storage`（`shoot_cfg_v2`）。

| 分组 | 配置键 | 默认值 | 说明 |
| --- | --- | --- | --- |
| 计时与计分 | `gameDuration` | 60 | 游戏总时长（秒），0 = 不限时 |
| | `baseScorePerSecond` | 1 | 每秒基础分，仅在保持范围内累加 |
| | `tickMs` | 100 | **0.1s 判定/计分刻度** |
| | `baseTickMs` | 1000 | **1.0s 基础计时刻度** |
| 子弹 | `fireRate` | 3 | 发射频率（发/秒） |
| | `bulletSpeed` / `spreadDeg` | 760 / 0 | 子弹速度 / 散射角（固定目标默认 0） |
| 判定 | `hitRange` | 60 | **击中判定半径（px）**，治疗师可实时改 |
| | `comboWindowMs` | 100 | 连击窗口（ms），默认即 0.1s |
| | `comboStep` / `comboMaxMul` | 0.15 / 3 | 每级连击加成 / 加成上限 |
| 得分浮动 | `scoreMin` / `scoreMax` | 1 / 3 | 单次命中得分浮动区间（含端点随机整数） |
| 保持范围 | `keepRangeDeg` | 6 | 允许左右偏离 ±°（静态保持，超过即提示回中） |
| | `maxLeanDeg` | 20 | 满量程倾角，**越小越灵敏**（倾斜该角度=屏幕边缘） |
| | `deadzoneDeg` / `smooth` | 1 / 0.6 | 中心死区 / 跟手度（越大越跟手，最低按 0.5 生效） |
| 目标 | `targetRadius` | 22 | 固定小怪兽尺寸 |
| 难度 | `difficulty` | normal | easy / normal / hard / expert |
| 显示与音频 | `showHitArea` / `sfxOn` / `bgmOn` | false / true / true | 判定圈、音效、音乐 |

> 存储键已从 `shoot_cfg_v1` 升级到 `shoot_cfg_v2`，旧参数不再生效，确保收紧后的默认值直接作用于真机。

### 难度预设

| 档位 | 得分系数 | 发射频率 | 判定半径 | 保持范围 | 满量程 |
| --- | --- | --- | --- | --- | --- |
| 简单 easy | ×0.8 | 2 /s | 88 px | ±10° | 24° |
| 标准 normal | ×1.0 | 3 /s | 60 px | ±6° | 20° |
| 困难 hard | ×1.5 | 4 /s | 44 px | ±4° | 18° |
| 极限 expert | ×2.0 | 5 /s | 32 px | ±2° | 16° |

切换档位 = 一次性写入该组参数，之后仍可单项微调。

---

## 3. 核心逻辑

### 3.1 双时钟（engine.update）

```
帧循环 canvas.requestAnimationFrame  →  update(dt)  →  render()
   ├── 0.1s 累加器  accTick：score.onTick(tickIndex, hitBucket)
   │      累计击中次数、连击判定、连击奖励结算
   └── 1.0s 累加器  accSec ：score.onSecond(inZone)
          游戏总时长推进（elapsedMs 累加 → 60s 倒计时）、基础分累加
```

命中判定在**渲染帧内做线段扫掠**（`HitDetector.sweep`），命中先入 `hitBucket`，
等 0.1s 刻度到点再统一结算——既防穿透又满足「0.1s 累计击中」口径。
右上角显示**整数秒倒计时**（`Math.ceil(timeLeft)`），60 → 59 → … → 0 后结算。

### 3.2 连击算法（score.js）

```
combo = (tick - lastHitTick) <= comboWindowTicks ? combo + 1 : 1
base  = randomInt(scoreMin, scoreMax)
mul   = min(1 + (combo - 1) * comboStep, comboMaxMul)
gain  = round(base × 难度系数 × mul)
```

### 3.3 传感器 → 左右（pose.js）

```
实机佩戴方向：左右移动读 Pitch 轴（实测对应左右方向），Roll 仅缓存
  → 角色镜像：angle = -pitch（只影响角色屏幕位置）
  → 身体方向：bodyAngle = pitch（HUD 倾角 / 回中提示）
  → 一阶低通 smooth（默认跟手度 0.6，按 dt 换算，最低按 0.5 处理）
  → 中心死区 deadzoneDeg
  → norm = clamp(angle / maxLeanDeg, -1, 1)  →  x01 = (norm+1)/2
  → inZone = |bodyAngle| <= keepRangeDeg
```

- `maxLeanDeg` 从 30° 收紧到 20°（更灵敏）；`keepRangeDeg` 从 18° 收紧到 6°，
  符合康复「静态保持」的容错要求，小角度偏离即触发反馈；
- **采样频率固定 60Hz**：`engine.js` 的 `SENSOR_HZ = 60`，姿态按 `1000/60 ms` 固定步长消费，
  与渲染帧率解耦（渲染掉帧时一次补多步、高刷屏每帧仍更新，平滑手感一致）；
- **硬件输出频率**：连接成功后自动 `WitBle.setOutputRate(100)`，写 JY/WT 协议寄存器 `0x03`
  （模块只支持 0.2/0.5/1/2/5/10/20/50/100/200Hz 离散档位，**没有 60Hz 档**，取 100Hz 保证 ≥60Hz 数据）；
  状态条会显示实测收包帧率（`sensorHz`），可据此确认链路是否达标。设置失败不影响使用；
- 蓝牙传感器页（`pages/wit`）的 Roll / Pitch / Yaw 与原始值统一保留 **2 位小数**
  （`toFixed(2)`，传感器分辨率约 0.0055°）；标定页的实时姿态同步为 2 位小数；
- **已取消**「左右移动轴」与「左右反向」开关：左右移动固定读 Pitch，角色位置做固定镜像；
  但 `bodyAngle` 始终保留患者身体的真实方向，HUD 倾角与「身体偏左/右」回中提示都用它，
  不会因为角色镜像而把提示方向带反；
- 1.2s 无新帧判定掉线 → 自动切到触屏模拟（左右拖动画面）。

### 3.4 保持范围与固定怪兽

怪兽固定于屏幕水平中央（`cx`）、垂直 `0.40H` 处，轻微上下浮动，不移动、不消失。
患者把准星（角色）保持在中间即可持续命中：

| 事件 | 效果 |
| --- | --- |
| 出界（`|bodyAngle| > keepRangeDeg`） | **立即停火**并清空在飞子弹、每秒基础分暂停、外星人**张嘴大笑**（带轻微弹跳）、红框 + 「请向右偏 / 请向左偏」提示 + 震动、`miss.mp3` |
| 回到范围 | 恢复自动开火与基础分、`back` 事件、外星人恢复平静 |
| 击中 | 得分 + 飘字 + 粒子 + 连击判定，外星人**悲伤**表情（贴图撇嘴）约 0.7s |

> **回中提示按屏幕里的小人给方向**（`charDir`，取镜像后的 `pose.norm`）：
> 小人偏左 → 「请向右偏 →」，小人偏右 → 「← 请向左偏」，小人居中但身体越界 → 「请回到中间」。
> HUD 的「倾角」仍显示患者身体真实角度（`bodyAngle`），两者用途不同。

---

## 4. 治疗师 / 管理员实时调整 API

模块门面 `utils/game/index.js`，页面内 `require` 使用，也已挂到全局：
`getApp().globalData.gameApi`（控制台 / 其它页面 / 远程指令可直接调用）。

```js
const game = require('/utils/game/index.js')

game.setHitArea(80)          // 击中判定半径（px），运行中立即生效
game.setFireRate(6)          // 发射频率（发/秒）
game.setDifficulty('hard')   // 难度档位，同时套用预设参数
game.setScoreRange(2, 6)     // 得分浮动区间
game.setKeepRange(4)         // 保持范围 ±°
game.setMaxLean(18)          // 满量程倾角（越小越灵敏）
game.setComboWindow(600)     // 连击窗口(ms)
game.patch({ baseScorePerSecond: 2 })

game.getConfig() / resetConfig() / getState()
game.start() / pause() / resume() / restart()
```

实现方式：setter 只写 ConfigStore 并广播，`GameEngine` 每帧/每次判定现读配置，
所以全部参数都是热生效；改 `hitRange` 还会自动闪出判定虚线圈 1.4s。

---

## 5. 页面与控制台

`pages/shoot/shoot`（页面级 `"renderer": "webview"`，Canvas 2D 开发者工具可直接预览）：

- 舞台：星空贴图（平铺 + 缓慢视差）、保持区、飞船（随倾斜旋转 + 尾焰 + 枪口光）、
  固定小怪兽（贴图身体 + 眼睛 + 嘴，**平静 / 悲伤 / 张嘴大笑**三种表情）、激光子弹、星形粒子、飘分、
  HUD（得分 / **大号整数倒计时** / 连击 / 倾角 / 出界红框，带半透明卡片底板）；
- 控制台：开始/暂停/重来/恢复默认；实时数据（得分·连击·命中·在界率，**不再显示命中率**）；
  难度档位；10 个实时滑块（判定半径、发射频率、保持范围、满量程倾角、姿态跟手度、连击窗口、得分上下限、时长、每秒基础分）；
  判定圈/音效/音乐开关；状态条显示传感器实测 Hz；
- `bindchanging` 事件直接调用 API，拖动过程即实时生效。

---

## 6. 自测

```bash
node tools/game_selftest.js     # 47 项：配置收敛/难度预设/连击公式/小数基础分/判定热更新/镜像姿态映射
node tools/game_engine_sim.js   # 桩化 Canvas 跑 1200 帧：开火/命中/倒计时/出界停火+清弹/怪兽得意/热更新
node tools/game_sprite_sim.js   # 贴图路径与矢量回退两条渲染分支各跑 180 帧
```

三者均已本地通过（`通过 47 项，失败 0 项` / `全部通过` / `全部通过`）。

---

## 7. 已知限制

1. Canvas 在 Skyline 渲染器下无法在开发者工具中调试（微信已知限制），本页使用页面级
   `renderer: webview`（同 `pages/calibrate`）。
2. 触屏模拟只在传感器掉线时生效，真机连接后以传感器为准。
3. `audio/game` 素材来自公开示例仓库，商用请替换（见 `audio/game/CREDITS.md`）。
4. 贴图在 `assets/games/shoot/`（Kenney CC0，约 10KB）；加载走 `canvas.createImage → base64 → 矢量兜底`
   三级降级，任何一级失败都不会白屏。替换素材保持文件名不变即可，比例变了要同步改 `_drawMonster()`。
5. 左右方向固定按实机 Pitch + 镜像处理（`utils/game/pose.js` 的 `MIRROR_SIGN`），
   运行时不再提供反向开关；若整套佩戴方向相反，把该常量从 `-1` 改为 `1` 即可。
6. 硬件没有 60Hz 档位，只能设 100Hz；若模块拒绝写寄存器，实际仍是默认 10Hz（手感会靠平滑补偿），
   可看状态条的实测 Hz 判断。
