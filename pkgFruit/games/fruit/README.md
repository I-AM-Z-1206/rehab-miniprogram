# 接水果 · 左右倾身接取（fruit）

WT9011 **卡在胸带上**（胸带从**腋下最高点**绕一圈固定，传感器就在带子正前方），标定中立位后：

* 身体向左 / 向右倾 → 果篮在屏幕上**跟着横向移动**（`nx = ±1` 对应可移动范围的两端）；
* 水果从上方不同位置落下，把果篮移到水果正下方，落下那一帧对准就接住；
* 没对准 → 记漏接（`reason = 'outside'`），水果从篮边掉下去。

**这是一个"移动去接"的游戏**：水果落点铺满整条可及范围，站着不动接不到几个。
姿态稳定率（`holdRate`）仍会统计并写进记录，但**只作为辅助指标**，
不参与接取判定。

---

## 0. 佩戴方式（和图示一致）

```
胸带：  从腋下最高点这一圈绕过去，绕躯干一圈扣紧
传感器：卡在胸带正前方（胸前正中位置），夹扣压在带子上
松紧：  贴身但不勒；松了传感器会晃，读数跟着抖
```

`games/fruit/renderer.js` 的 `_drawWearFigure()` 画的就是这个姿势：
腋下高度一圈胸带（两侧有调节扣）+ 带子正前方一个橙色方块（传感器，带指示灯）。

**轴向提醒**：本项目的 `axisX = pitch` 是"胸前佩戴 + 胸带过腋下最高点 + 设备正贴"
这个姿态下实测出来的。如果传感器换了个方向（比如旋转 90° 贴），
左右方向可能落到 `roll` 上 —— 在治疗师设置页「体感输入 → 左右轴」改成 `roll` 即可，
不用改代码。

---

## 1. 文件职责

| 文件 | 作用 | 关键点 |
| --- | --- | --- |
| `games/fruit/engine.js` | 状态机 + 果篮跟随 + 对准判定 + 计分编排 | 纯逻辑，不碰 Canvas / wx API，可在 Node 里跑 |
| `games/fruit/spawner.js` | 水果生成（固定种子） | 落点铺满可及范围、避开篮口当前位置，同参数可复现 |
| `games/fruit/score.js` | 计分 / 连击 / 成功率 | 每果只计一次；分项 `rawBase + comboBonus + finishBonus = 总分` |
| `games/fruit/fruits.js` | 五种水果与果篮的矢量绘制 | 纯路径绘制，随屏等比缩放 |
| `games/fruit/renderer.js` | 整页 Canvas 渲染 + 按钮热区 | 果篮位移、落点引导线、位置指示条、HUD、各面板 |
| `pages/fruit/*` | 小程序页面桥接 | 蓝牙、帧循环、触摸、音频、记录、隐私上报 |
| `pages/fruit-settings/*` | 治疗师参数 | 5 档预设 + 逐项微调 + 校验 |
| `pages/fruit-records/*` | 训练记录 | 本机列表、保持指标明细、逐条/批量上报 |
| `utils/fruit-config.js` | 配置存储 | 键 `fruit_cfg_v1` |
| `utils/fruit-record.js` | 记录库 | 键 `fruit_records_v1` / `fruit_upload_cfg_v1` |

---

## 2. 状态机

```
IDLE(介绍) → READY(准备) → CALIBRATING(标定) → COUNTDOWN(3-2-1)
   → PLAYING ⇄ PAUSED
        ↓
   SENSOR_ERROR（断线/超时，冻结判定）→ 恢复 → PLAYING
        ↓
   RESULT / ABORTED
```

* 只有 `PLAYING` 会推进计时、落水果、做判定；暂停 / 断线 / 结算全部冻结。
* `finish()` 只结算一次（`settled`），重复调用不会重复加分。
* 断线不会静默切模拟，也不会把漏掉的水果判成接住。

---

## 3. 果篮跟随与对准判定（本游戏核心）

```
nx = 左右轴角度 / 活动边界           // -1 左 … +1 右，已扣零点、死区、一阶低通
travel = (basketMaxX - basketMinX)/2 // 可移动范围的一半
basket.x = clamp(0.5 + nx × travel, basketMinX, basketMaxX)
```

* 可移动范围 = 屏幕宽度扣掉"半个篮宽 + 2% 余量"，果篮永远完整留在屏幕里。
* 倒计时期间果篮已经跟着身体走，玩家可以先试试左右倾。
* 新水果的落点会避开"篮口正下方"，所以站着不动几乎接不到（自检里实测 4% 左右，
  跟着落点移动则接近 100%）。
* 判定量是**姿态角 → 归一化控制量**（代理指标），不是厘米位移。

### 碰撞

水果中心 `y` 跨过篮口高度（`CATCH_LINE = 1`）的那一帧：

* 在篮口横向范围内（`|水果x - 果篮x| ≤ basketHalf*0.94 + 水果半径容差`）→ 接住；
* 否则记漏接，`reason = 'outside'`。

接取**不看**姿态是否"稳住"：只要果篮此刻在水果下方就算接住。
跨线检测避免高速下落时"穿过"判定；每个水果只结算一次。

漏接后的处理（**曾经出过 bug**）：果子标记 `missed` 后**继续以 1.7 倍速度下落**，
渲染层同时缩小 + 淡出，落出画面（`y > 1.3`）或超过 0.9 秒即从数组移除。
早期版本在漏接后直接 `continue` 跳过更新，`y` 冻在 1.035 到不了回收线，
果子会永远挂在篮口下方不动。

### 稳定统计（辅助指标）

`devX = |左右轴角度|`，`inRange = devX ≤ holdToleranceDeg`（可选叠加前后轴）。

* `inRange` 连续 `holdStableSec` → 记一次"稳定"，累计时间进 `holdRate`；
* 偏离超过容差且超过 `holdGraceSec` → 稳定计时中断，`holdOutCount + 1`；
* 这些数字**只写进训练记录**，不改变任何接取结果。

---

## 4. 计分

```
单果得分 = 水果分值 × 连击倍率
连击倍率 = min(comboMaxMul, 1 + max(0, combo-1) × comboStep)
总分     = 基础分 + 完成奖励          // 连击加成已含在基础分里，单独列出便于核对
成功率   = hits / (hits + misses)
```

结算分项为「基础分（不含加成）+ 连击加成 + 完成奖励 = 总分」，页面上可以逐项加对。

---

## 5. 可配置项（治疗师页）

| 分组 | 键 | 含义 |
| --- | --- | --- |
| 难度 | `difficulty` | 1~5 档，套用预设 |
| 训练目标 | `durationSec` | 训练时长（秒） |
| 体感输入 | `axisX` / `invertX` / `deadzoneDeg` / `smooth` | 轴向、反向、死区、跟手平滑 |
| 体感输入 | `leftLimit` / `rightLimit` | **满行程角度**（°）：倾多少度果篮走到最左/最右 |
| 接取与稳定 | `basketWidthPct` | **接取宽度**（% 屏宽）：也是对准判定的宽度 |
| 接取与稳定 | `holdToleranceDeg` | **稳定判定容差**（°）：只影响稳定率统计 |
| 接取与稳定 | `holdStableSec` | **稳定判定时间**（秒）：只影响稳定率统计 |
| 接取与稳定 | `holdGraceSec` | **越界宽限**（秒）：抖动不至于打断稳定计时 |
| 接取与稳定 | `holdBothAxis` / `holdToleranceYDeg` | 是否把前后方向也计入稳定统计 |
| 水果与下落 | `spawnInterval` / `fallSpeed` / `maxFruits` / `speedRamp` | 密度与速度 |
| 计分 | 各类水果分值、`comboStep` / `comboMaxMul` / `comboWindowSec` / `finishBonus` | 计分规则 |
| 反馈 | `sfxOn` / `sfxVolume` / `bgmOn` / `bgmVolume` / `voiceOn` / `vibrateOn` | 声音与振动 |

`validate()` 会拦截"稳定容差 < 2°""稳定判定时间 < 0.1s""接取宽度越界"等错误，
并对"容差过小""稳定判定时间过长""宽限为 0"给出提醒。

---

## 6. 训练记录（含稳定统计）

基础字段：`nickname / gameId('fruit') / scene / difficulty / rangeConfig / score / breakdown /
hits / misses / accuracy / comboMax / durationSec / dataSource / completed / interrupted /
startedAt / endedAt`，本玩法另有：

| 字段 | 含义 |
| --- | --- |
| `holdRate` | 姿态稳定率 = 容差内累计时间 / 训练时长（辅助指标） |
| `holdTimeSec` | 容差内累计秒数 |
| `holdBestSec` | 最长连续稳定秒数 |
| `holdOutCount` | 偏离超限次数 |
| `deviationAvgDeg` / `deviationMaxDeg` | 平均 / 最大偏离角 |
| `holdToleranceDeg` | 本局使用的稳定判定容差（便于跨局对比） |

记录页顶部 KPI 显示命中率，稳定率在 KPI 与展开详情里都能看到；
展开后还能看到最长连续稳定、平均/最大偏离、偏离超限次数。

> 记录页曾经"什么都看不到"：`utils/fruit-record.js` 只导出了 store，
> 没有导出 `formatTime`，页面 `toView()` 一调用就抛错、列表永远是空的。
> 现在已补上导出，并给页面加了逐条 try/catch，单条脏数据不会打空整页。

---

## 7. 声音（音效 + 背景音乐）

* 音效集 `casual`：接住＝清脆"叮"、连击＝上行双音、漏接＝柔和低音、按钮＝极轻点击；
* 背景音乐 `garden_loop.mp3`（110 BPM，四小节循环），只在 `PLAYING` 播放，暂停同步暂停；
* 音量可在设置页调（音效默认 80% / 音乐默认 26%）；
* `stop()/seek()/play()` 分三步各自 try，机型在 `stop→seek` 抛错也不会整局没声；
  播放器真坏了会换一个新的顶上。

---

## 7.5 界面（清新明亮的果园风）

全部用 Canvas 2D 绘制，没有引入外部图片素材（小程序主包有体积限制、canvas 不支持 SVG）：

* **场景**：天蓝→奶油白天空、日晕、圆角云、远处小鸟；三层丘陵、果园树列、矮灌木、草地小花与细草纹理；
  中间一块柔和阳光斑；两只小蝴蝶在两侧花丛旁轻飞（低透明度，不抢水果）。
* **HUD**：白色圆角卡 + 顶部三色渐变条。第一行「得分 / 连击胶囊 / 剩余时间」，
  细分割线，第二行「接住 · 漏接 · 命中率」三栏（中间有竖分隔），最底下是渐变时间条。
* **底栏**：暂停 / 结束为白色胶囊按钮；中间是「果篮位置条」——左中右三个刻度 + 一个当前篮位的小圆点，
  对准水果时圆点变绿并略微放大。
* **水果投影**：落下的水果在篮口那一层地面上有投影，越接近越深、越小 —— 既增加立体感，
  也帮助判断"还有多久到"。
* 视觉参考（只借鉴风格语言，未拷贝文件）：Kenney UI Pack（CC0）的圆角面板/胶囊按钮、
  GDQuest game-sprites（CC0）的简单几何 + 高对比描边。

## 8. 性能与稳定性

* 静态背景离屏缓存，每帧只 `drawImage` 一次（必须显式给目标尺寸）。
* 传感器数据只写进 `MotionTracker`，页面**没有任何逐帧 setData**。
* 水果数组有上限；接住按动画时长回收，漏接按下落位置 + 0.9 秒兜底双条件回收
  （只判位置不够：`fallSpeed` 被调成 0 时又会卡住）。
* 页面隐藏：停帧循环 + 暂停本局 + 暂停音乐；卸载：结算落记录、销毁音频、断开共享蓝牙。

---

## 9. 测试

```bash
node tools/fruit-headless-test.js     # 玩法自检
node tools/audio-headless-test.js     # 音效层（35 项）
node tools/wire-headless-test.js      # 回归：走钢丝
node tools/rhythm-headless-test.js    # 回归：节奏训练
```

`tools/fruit-headless-test.js` 覆盖的关键点：

* 身体右倾/左倾 → 果篮跟着右移/左移，且不会跑出可移动范围；
* 自动追落点 → 命中多于漏接、得分 > 0、分项之和 = 总分；
* 水果在篮子上方 → 接住；水果落下前把果篮移走 → 漏接、连击归零；
* `holding = false` 时对准照样接住（判定不看稳定）；
* 稳定统计：刚进 PLAYING 不算稳定、倾身会打断、结算里稳定率被拉低；
* 暂停冻结（计时 / 水果 / 果篮 / 分数）；断线不判负、不自动切模拟；
* 记录库导出 `formatTime`（记录页依赖）。

### 浏览器预览

```bash
node <esbuild> tools/fruit-preview/main.js --bundle --format=iife --target=es2018 \
  --outfile=tools/fruit-preview/bundle.js
# 打开 tools/fruit-preview/index.html
# ?screen=intro|prepare|play|combo|break|pause|sensor|result&bare=1&freeze=1
#   screen=break 看"水果从篮边漏下去"的样子；预览里的"玩家"会自动把果篮移向最低的水果
```

### 真机验收

1. 连接 WT9011（50Hz）→ 准备页显示 Hz 与连接状态；
2. 中立位 3 秒完成标定 → 进入游戏，果篮应在屏幕中间；
3. 身体向左/向右倾 → 果篮立刻跟着移动，幅度与倾身角度成比例；
4. 水果落下时把果篮移到它下方 → 接住；没移过去 → 记漏接、HUD 命中率下降；
5. 暂停：计时 / 水果 / 果篮位置全停；断线：立即冻结并提示；
6. 结算 → 训练记录页能看到这一局（命中率、稳定率、最长稳定、偏离）。

---

## 10. 待真机确认

* **倾身行程**：`nx = ±1` 对应活动边界（`leftLimit/rightLimit`，默认 ±12°），
  即"倾 12° 果篮走到边"，需按患者能力在设置页调整。
* **稳定容差 / 稳定判定时间 / 越界宽限**：6° / 0.4s / 0.25s 只影响稳定率统计，
  抖动大的患者可放宽宽限，避免稳定率被噪声压低。
* **轴向与反向**：`axisX = pitch`、`invertX = true`，换佩戴方向要改（设置页可改）。
* **接取宽度**：24% 屏宽决定对准判定宽度，太窄会很难接，太宽则失去"移动去接"的意义。
* **音频**：`InnerAudioContext` 的格式兼容性已在音效层用 mp3 规避；
  背景音乐循环若有缝，需换素材并重新校验循环长度。
