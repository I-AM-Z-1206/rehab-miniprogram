# 左右节奏训练 · 体感康复小游戏（rhythm）

WT9011 **卡在胸带上**（胸带从**腋下最高点**绕一圈固定），标定中立位后，身体左右偏移 → 归一化控制量 `nx ∈ [-1,1]` →
判定当前处于**左 / 中 / 右**哪个区域（三车道：中向音符要求「回到中立位」）。音符按 BPM 精确生成，
玩家在音符到达判定线时把身体保持在正确一侧即为命中；方向和时间各算一项指标。

---

## 1. 文件职责

| 文件 | 作用 | 关键点 |
| --- | --- | --- |
| `games/rhythm/beat-clock.js` | 音乐时钟 | 单调时钟为主、音频进度纠偏、loop 回绕累计，暂停冻结 |
| `games/rhythm/chart.js` | 谱面 | 按 BPM/难度/种子**确定性生成** + 外部 JSON 校验 |
| `games/rhythm/hit-judge.js` | 判定 | 方向 × 时间两个维度，窗口分级，纯函数好测 |
| `games/rhythm/score.js` | 计分 | 连击倍率、三个准确率、除零保护 |
| `games/rhythm/engine.js` | 状态机与编排 | 不碰 Canvas / wx API，可在 Node 里跑 |
| `games/rhythm/renderer.js` | 整页 Canvas 渲染 | 霓虹跑道、菱形音符、判定地台、HUD、各面板 |
| `pages/rhythm/*` | 页面桥接 | 蓝牙、音频、帧循环、触摸、记录、隐私上报 |
| `pages/rhythm-settings/*` | 治疗师参数 | 5 档预设 + 逐项微调 + 校验 + 上报配置 |
| `pages/rhythm-records/*` | 训练记录 | 本地列表、明细、逐条/批量上报、删除 |
| `utils/rhythm-config.js` | 配置存储 | 键 `rhythm_cfg_v1` |
| `utils/rhythm-songs.js` | 曲目表 | BPM、每小节拍数、循环小节数、起始偏移 |
| `utils/rhythm-record.js` | 记录库 | 键 `rhythm_records_v1` / `rhythm_upload_cfg_v1` |
| `audio/rhythm/*.m4a` | 循环音轨（打包用） | 由 `tools/gen_rhythm_audio.py` 合成 wav 后用 ffmpeg 转 aac，BPM 精确已知 |
| `audio/rhythm/*.wav` | 音轨中间产物 | 不打包（`packOptions.ignore`）、不进主包，只用于生成 m4a |

训练记录复用 `utils/training-record.js` 的工厂 `createRecordStore()`，与走钢丝、接水果各自分库。

---

## 2. 状态机

```
IDLE(intro) ─start→ READY(prepare) ─calibrate→ CALIBRATING
                       │                          │
                       └─────enter──────▶ COUNTDOWN（预备拍 4 拍）
                                                 │ 音乐开始
                                                 ▼
                            PAUSED ◀──pause──▶ PLAYING ──timeout/quit──▶ RESULT / ABORTED
                                                 │
                                    SENSOR_ERROR ◀─断线/超时
                                        │
                                        └─resume（数据恢复）→ PLAYING
```

* 只有 `PLAYING` 会推进音乐时间与判定；`PAUSED` / `SENSOR_ERROR` / `RESULT` 全部冻结。
* `finish()` 只结算一次（`settled`），重复调用不会重复加分。
* 断线**不会**自动切模拟，也不会把漏掉的音符判成命中。

---

## 3. 时间基准与音画同步

* 主时钟：`performance.now()`（单调递增），**不用帧数累加**。
* 音频 `currentTime` 只用于纠偏：偏差 > 80ms 硬纠正，否则按 5% 软拉。
* 音频 `loop` 播放时 `currentTime` 回绕，用回绕检测累计 `loopCount`，
  得到连续音乐时间；循环长度 = 整数小节，因此不会累积漂移。
* 暂停：记录 `pausedAt`，恢复时重设锚点，音频从暂停点继续。
* 判定时间 = `音乐时间 − syncOffsetMs`；视觉位置用音乐时间。
  `syncOffsetMs > 0` 表示"听到比看到晚"，在准备页用「试听 8 拍」校准。
* 音频不可用 → `silent` 模式：时钟照跑，界面显示「无音乐」，**不声称与音乐同步**。

---

## 4. 谱面

```js
{ noteId, targetSide: 'left'|'right', beatIndex, targetTimeMs, noteType, scoreValue }
```

* `targetTimeMs = offsetMs + beatIndex × (60000 / BPM)`，单位毫秒。
* 生成规则（`buildChart`）：从第 `prepBeats` 拍开始，每 `noteStepBeats` 拍一个音符；
  左右交替为底版，按 `centerRate` 概率换成中向音符（要求回到中立位），
  按 `sameSideRate` 概率出现同向连续，按 `restRate` 概率留出休止拍；
  小节第一拍标为 `accent`（分值 120）。`centerRate = 0` 时退化为纯左右两车道。
* **同向连续必须间隔 ≥ `sameSideGapMs`**，否则生成时强制换向 —— 否则在"一次动作只结算一个音符"的规则下玩家根本打不出来。
* 同曲 + 同难度 + 同种子 + 同算法版本 → 完全相同的音符时间表（训练可对比）。
* `parseChart()` 可读取外部 JSON，逐条校验方向/时间/ID 重复，不合法只报错不静默丢弃。

---

## 5. 身体输入

复用 `utils/motion.js`（死区 → 归一化 → 一阶低通 → 方向滞回），只消费：

* `nx ∈ [-1,1]`：归一化控制量（不是厘米位移）
* `dir`：`left` / `center` / `right`，阈值由 `sideThreshold` 决定
* `stale`：> 1.2 秒没有新帧 → 立即进入 `SENSOR_ERROR`

游戏再叠一层"动作事件"：

* `enterAt`：这一侧是什么时候进入的（用于算节奏误差）
* `stableMs`：进入后保持多久（`stableMs` 之前不算命中，过滤路过抖动）
* `actionSeq`：进入动作的序号；**一次动作最多结算一个音符**
  例外：保持同一侧时，距上次命中 ≥ `sameSideGapMs` 可再次命中（避免"一直站着刷分"）

---

## 6. 判定规则（hit-judge.js）

```
音符到达判定线（targetTime）之前：一律不判 —— 提前站好不算准
到达之后：
  · 方向错误且已稳定      → MISS（记 wrongDirection，同时断连击）
    （中向音符例外：回中路上必然经过两侧，给满整个窗口再判方向错误，
     窗口内回到中间按迟到正常判，避免误伤正在正确移动的患者）
  · 方向正确 + 稳定 + 动作可用：
        时间误差 = 进入该侧的时刻 − 目标时刻（提前站好最多算到窗口边缘）
        |误差| ≤ perfectMs → PERFECT
        |误差| ≤ greatMs   → GREAT
        |误差| ≤ goodMs    → GOOD
  · 超过 goodMs 仍未就位  → MISS（late / no-input / no-new-action）
```

判定窗口全部可配（`perfectMs < greatMs < goodMs`，校验会拦截顺序错误），
颜色、英文名、中文名、图形标记四者同时呈现，不只靠颜色区分。

---

## 7. 计分

```
单音符得分 = 音符分值 × 连击倍率
连击倍率   = min(comboMaxMul, 1 + max(0, combo-1) × comboStep)
总分       = 基础分合计 + 连击加成合计 + 完成奖励

节奏准确率 = (PERFECT×1 + GREAT×0.7 + GOOD×0.4 + MISS×0) / 已判定数
方向准确率 = 命中数 / (命中数 + 方向错误数)
综合命中率 = 命中数 / 谱面音符总数
```

分母为 0 一律返回 `null`，界面显示「暂无数据」（不会冒充 100%）。

---

## 8. 难度与配置

默认节奏：66 BPM、**每拍一个音符**（约 0.9 秒来一个）、休止拍 12%、预备拍 2，
飞行时间 2.6 秒 —— 音符看着长、来得连贯，不会"半天才来一个"，也不会快到反应不过来。
1~5 档预设只覆盖手感参数（音符间隔 2 / 1.5 / 1 / 0.75 / 0.5 拍、休止比例、判定窗口、
飞行时间、时长、预备拍），体感输入与曲目选择保持治疗师设置。可调项：

* 音乐：曲目（静水深流 66 / 晨光漫步 90 / 心跳律动 110 BPM）、音量、音画补偿、节拍脉冲、节拍点击音
* 训练目标：时长、预备拍
* 体感输入：左右轴、反向、灵敏度、死区、跟手度、左右边界
* 左右判定：区域阈值、稳定判定时间、同向重复间隔
* 节奏判定：三档窗口、飞行时间、音符间隔、中间音符比例、休止比例、同向比例、谱面种子
* 计分：三档分值、连击步长/上限、漏接是否断连击、完成奖励
* 反馈：音效、语音、振动、引导提示

---

## 9. 模拟模式

* 入口：介绍页开关、准备页「使用模拟 / 关闭模拟」、游戏中「模拟 ▾」面板。
* 面板：左移 / 回中 / 右移、补左音符、补右音符、模拟断线、暂停、结算。
* 补音符只往谱面里插一条数据，**判定仍走真实流程**，不做"假装命中"。
* 模拟局记录 `dataSource = 'simulation'`，界面常驻「模拟数据」，默认不上报。

---

## 10. 训练记录字段

`nickname / gameId('rhythm') / songId / songName / bpm / difficulty / chartSeed / noteCount /
score / perfectCount / greatCount / goodCount / missCount / wrongDirectionCount / comboMax /
leftHitCount / centerHitCount / rightHitCount / rhythmAccuracy / directionAccuracy / overallHitRate /
syncOffsetMs / controlConfig / durationSec / dataSource / startedAt / endedAt /
completed / interrupted / interruptedSec / interruptedCount / audioMode`

先存本地，失败可重试；同 `recordId` 不重复保存；上报必须用户显式同意，字段清单逐条展示。

---

## 11. 性能与异常

* 静态背景（夜空 + 极光 + 暗角 + 三色车道 + 网格）离屏缓存，每帧只 `drawImage` 一次；`drawImage` 必须显式给目标宽高。
* 每帧新增的动态层控制在低开销范围：12 条车道流光（描边）、判定线柔光（1 个渐变）、
  每个音符 3 节拖尾菱形 + 1 个外圈描边、3 块地台底光（3 个径向渐变）。
* 高频传感器数据只写进 `MotionTracker`，页面**没有任何逐帧 setData**。
* 音符按时间游标加入 `active`，判定后保留 700ms 淡出再回收，并有上限保护。
* 页面隐藏：停帧循环 + 暂停音乐 + 停语音；卸载：结算落记录、销毁音频、断开共享蓝牙。

---

## 12. 测试

```bash
# 无头自检（117 项，含三向判定/暂停/断线/计分/渲染/记录）
node tools/rhythm-headless-test.js

# 回归其它游戏（确认没破坏公共模块）
node tools/fruit-headless-test.js
node tools/wire-headless-test.js

# 重新生成音轨（已生成则不必跑）
python tools/gen_rhythm_audio.py

# 浏览器预览（看真实渲染）
node <esbuild> tools/rhythm-preview/main.js --bundle --format=iife --target=es2018 \
  --outfile=tools/rhythm-preview/bundle.js
# 打开 tools/rhythm-preview/index.html
# ?screen=intro|prepare|calib|play|combo|pause|sensor|result&bare=1&freeze=1&w=&h=
```

`tools/rhythm-preview/shots/` 里有 390×844 与 320×568 的验证截图。

### 真机验收步骤

1. 连接 WT9011（50Hz）→ 准备页显示「传感器已连接 / Hz」。
2. 中立位 3 秒完成标定 → 点「试听 8 拍」调音画补偿，让闪烁与听到的拍子重合。
3. 开始 → 先听 4 拍预备，音乐开始后按拍左右移动；音符到判定线时保持在正确一侧。
4. 暂停：音乐、音符、判定、计时全部停住；恢复后不跳帧、不重复计分。
5. 关掉传感器：进入「传感器数据中断」，不判定、不加分；重连后可继续，结算里带中断时长。
6. 结算：分项之和 = 总分；三个准确率公式与记录页一致；无样本显示「暂无数据」。

---

## 13. 待真机确认

* **轴向与正负**：默认 `axisX = pitch`、`invertX = true`，换佩戴方向可能要改（设置页可改，立即生效）。
* **音画同步**：不同机型/蓝牙耳机延迟不同，必须用「试听 8 拍」现场校准；补偿值会写进记录。
* **判定手感**：`sideThreshold`（0.35）、`stableMs`（120ms）、`goodMs`（160ms）是按 90/110 BPM 估的初值，需按患者能力微调。
* **同向连击间隔**（320ms）：若患者保持一侧的稳定性差，可上调该值减少"来不及重新进入"的漏接。
* **音轨格式**：打包用的是 **22.05kHz 单声道 AAC（.m4a）**，三首合计约 300KB（静水深流 66 / 晨光漫步 90 / 心跳律动 110 BPM）；wav 是同参数中间产物，循环边界零跳变，只用于转码、不进包。
  转码命令写在 `tools/gen_rhythm_audio.py` 头部；若某机型循环有缝，先在真机确认再考虑换编码与重新校正循环长度。
* **上报接口**：需在设置页填 https 地址与令牌；隐私清单与同意流程已就位。

---

## 13.5 视觉风格：清新明亮 · 可爱

界面走「奶油白 + 糖果色」，不用霓虹/发光：

* 背景：浅天蓝 → 奶油白渐变，太阳、圆角云朵、飘落花瓣、空中光斑；
* 跑道：奶白色路面，三条车道分别染草莓粉 / 蜂蜜黄 / 薄荷绿，白色圆头虚线分道；
* 音符：圆角方块糖（不是菱形），白描边 + 顶部高光 + 拖尾；左粉 / 中黄 / 右绿，中间音符用白点标记；
* 判定地台：白色胶囊 + 糖果色描边 + 软阴影，选了哪侧就轻轻抬起；
* 玩家：白色小团子（眼睛 + 腮红 + 微笑），在三个刻度之间移动；
* 文字：深蓝灰 `#3F4A5A` 白底可读；判定字用深色版配色（`VERDICT_INK`）+ 白描边。

配色集中在 `games/rhythm/renderer.js` 顶部的 `C`，改主题只改这一个对象。

## 14. 参考的开源模板（只借鉴结构，未复制代码）

本工程是微信小程序原生实现，没有引入任何外部框架或第三方运行时代码。设计时参考了这些
GitHub 开源项目的**思路**：

* **brenny0707/Go2Jam** —— 下落式判定条 + 判定窗口 + 连击倍率 + 多难度谱面的最小结构。
* **J-sensei/Phaser-js-Rhythm-Game** —— 用 BPM / beat / sub-beat / offset 计算音符时间与出谱的方式。
* **GareBear99/Neolution** —— TRON 风格透视网格 + Canvas2D 轻量渲染 + perfect/great/good/miss
  四档判定 + offset 校准滑块的视觉与交互参考。

视觉参考（只借鉴风格语言，未拷贝任何文件）：

* **Kenney · UI Pack / Game Icons（CC0）** —— 圆角面板、胶囊按钮、三色强调条的形态参考；
* **GDQuest/game-sprites（CC0）** —— 简单几何 + 高对比描边的角色/道具处理方式；
* **OpenGameArt 上的可爱风 UI 素材（CC0/CC-BY）** —— 奶油底 + 糖果色的整体配色思路。

说明：本工程运行在微信小程序里，主包有体积限制，而且 canvas 不支持 SVG；
因此没有引入任何 PNG/SVG 素材文件，全部用 Canvas 2D 以同样的圆角/糖果语言绘制。
音频素材：`audio/rhythm/*.wav`（中间产物）与 `*.m4a`（打包用）均由本仓库的 `tools/gen_rhythm_audio.py` 合成，无第三方素材。
音效沿用 `audio/game/*`（来源见 `audio/game/CREDITS.md`）。
