# 赛车引擎（race/engine.js）

`pages/race` 使用的核心来自独立小游戏工程 **NEON REHAB RACER**。

> **重要：原始小游戏工程（`D:/Desktop/sc`，26 个 ES Module）已被删除。**
> 现在唯一的维护基线是**反格式化出来的单文件源码** `src/engine.src.js`（约 4900 行）。
> 所有康复改造（去蓝牙入口、HUD 换侧屈角度、滤波参数、巡航油门…）已经内联在里面，
> 不再靠打包时打补丁。

小游戏与小程序运行时不同，不能直接 `require game.js`，这里做了三件事：

1. **esbuild 打包**：`src/engine.src.js` → 单文件 CommonJS `race/engine.js`（约 83KB）
2. **画布替换**：页面 `<canvas type="2d">` 节点替代 `wx.createCanvas()`
3. **输入桥接**：页面 touch → `engine.onPointerDown/Move/Up`，坐标直接交给 `engine.toDesign()`

## 怎么改

改 `pkgRace/race/src/engine.src.js`，然后重新打包：

```bash
npm run build:race     # 打包 + 自检
npm run check:race     # 只自检现有产物，不重新打包
```

`src/` 目录已在 `project.config.json` 的 `packOptions.ignore` 里，**不进小程序包**；
产物 `engine.js` 才是运行时加载的那份。

打包脚本做两件事：压缩，以及一组**出厂自检**。自检分三类，别混：

| 类别 | 查谁 | 内容 |
| --- | --- | --- |
| `MUST_HAVE` | 产物 | 「侧屈」「体感待机」「模拟模式（触屏驱动）」等文案还在 |
| `MUST_NOT_HAVE` | 产物 | 「连接 WT9011 传感器」「.02,1.6」「Debug：方向键」必须消失 |
| `SRC_ONLY` | 源码 | `RoadRenderer2` 等类名（压缩后会被改名，只能查源码） |

产物还会真的 `require()` 一次，确认导出 `GameEngine` 且 `update / render / setState /
onPointerDown / toDesign` 五个方法齐全 —— 纯字符串检查抓不到「打成 ESM」这类问题。

> esbuild 的 Go 二进制在本项目里**写文件会被拦**（`tools/` 下报 Access denied），
> 所以构建用 `write:false` 拿回内存再自己落盘，别改回 `outfile`。

## 改完必须跑测试

```bash
node tools/race-headless-test.js     # 已并入 npm test（13 套之一）
```

84 项断言，覆盖的不是「能不能跑」而是「康复参数有没有被改坏」：跟手延迟、
死区、巡航、渲染确定性、NaN 毒性、长跑稳定性、结算字段、记录映射、音频生命周期。
细节见脚本头部注释。


## 传感器：不用游戏自带的蓝牙

原小游戏自己 `wx.openBluetoothAdapter` + 扫设备 + 连接，小程序里已经有一套连好的链路
（`utils/witble.js` 单例），再连一次既多余又会二次弹权限。所以：

1. **打包时把 BLE 界面去掉**（源码工程不动，只在产物里改，见 `tools/build_race.js`）：
   - 菜单去掉「连接 WT9011 传感器」按钮和底部连接状态文案
   - HUD 左上角的「传感器已连接 xxHz」换成实时 `侧屈 ±X°`
   - 顺带把键盘快捷键的说明改成触屏/长按提示
2. **页面注入数据**（`pages/race/race.js`）：

```js
const WitBle = require('../../utils/witble.js')
this.wit = WitBle.getShared()
this.wit.handlers = { onData: (d) => this.feedSensor(d), ... }

feedSensor(d) {
  // 只取 roll / pitch（yaw 固定 0），加速度、角速度、磁场一概不参与
  engine.ble.injectSample({
    angle: { roll: steer, pitch: throttle, yaw: 0 }
  })
}
```

> `d.roll / d.pitch` 已在 `utils/witble.js` 里扣过全局零点（`utils/zero.js`），
> 与引擎内部 `neutral = {roll:0, pitch:0}` 口径一致，进游戏不需要再标定一次。
> 之所以不再传 gyro/accel：引擎这两个值只用于 HUD 的抖动评估，本项目用不到，
> 少构造两个对象也少一点每帧开销。

`injectSample()` → `_commit()` → `emit('sample')` → `MotionController.onSample()`，
和游戏自己收蓝牙时的路径完全一致，所以滤波、标定、治疗师面板参数都照旧生效。

### 滤波：为什么改了卡尔曼参数

`src/motion/KalmanFilter.js` 原参数 `q = 0.02 / r = 1.6`，稳态卡尔曼增益只有 **~0.10**，
等效时间常数约 10 个样本——50Hz 下就是 **210ms 纯滞后**，再叠一层 WMA 到 **250ms+**。
患者侧屈完要小半秒车才有反应，这是实机「不跟手 / 不精准」的主因。

打包时改成 `q = 0.3 / r = 1.0`（增益 ~0.30）：

| | 63% | 90% | 95% |
| --- | --- | --- | --- |
| 改前 | 133ms | 333ms | 433ms |
| 改后 | **50ms** | **117ms** | **130ms** |

（`tools/race-headless-test.js` 里有阶跃响应断言，超过 160ms 会失败。）
噪声抑制仍有 ~0.2×，而 WT9011 角度噪声本身只有 ±0.2° 量级，画面上看不出抖动。
觉得还不够跟手就继续调大 `q`（0.6 → 约 83ms），觉得画面发抖就调小。

### 轴映射（SWAP_AXES）

本项目佩戴方式下 **pitch = 身体左右侧屈、roll = 前后倾**（射击页实机确认），
而引擎约定 `roll = 转向 / pitch = 油门`，所以 `race.js` 顶部常量：

```js
const SWAP_AXES = true   // 佩戴方向相反时改成 false
```

### 康复参数（`MOTION_TUNE`）

脑卒中患者活动范围小，默认档位「要很大角度才有反应」，所以页面进来自动覆盖：

| 参数 | 默认 | 本项目 | 说明 |
| --- | --- | --- | --- |
| `maxAngle` | 20° | **10°** | 侧屈 10° 即打满方向 |
| `deadZone` | 3.5° | **1.5°** | 死区，别把有效动作当抖动过滤掉 |
| `brakeAngle` | 8° | **999** | 康复期不设刹车，后倾只是收油门，车不会停死 |
| `smoothing` | 0.35 | **0.18** | 滤波更跟手（WMA 窗口 5 个样本） |
| `assist` | 0.18 | **0** | 回正辅助会削弱小幅输入，康复期直接关掉 |
| `rollSensitivity` | 1 | **1.1** | 转向略放大 |
| `pitchSensitivity` | 1 | **1.1** | 油门略放大 |
| `invertRoll` | false | **true** | 实机左右颠倒，翻转转向 |

写入方式：**一次性种子**（`seedMotionParams()`）写进引擎自己的
`nrr_therapist_params_v1`，之后治疗师在游戏内面板调的值会正常保存、不被覆盖。
改了 `MOTION_TUNE` 记得把 `race_motion_seed_v2` 升个版本才会重新播种
（v1 是 20°/3.5° 那版，升到 v2 是为了让已经装过老版本的手机重新写一次）。

### 油门方向

引擎里 `pitch > 0 = 加速`。若实机「身体前倾反而减速」，把 `race.js` 顶部的
`INVERT_THROTTLE` 改成 `true`（只翻转油门，不影响转向）。

### 车速：巡航 + 初速度

- `Player.update` 的油门改成 `0.14 + 0.86 × throttle`（打包时注入）：
  不倾身也有基础油门，稳态约 **1/3 最高速**；前倾在此基础上继续加速。
- `startSession` 里开局给 `maxSpeed × 0.3` 初速度，车不等患者发力就先滑出去。
- 侧向位移改成 `dx = dt × steerRate × max(speedPct, 0.5)`：原来正比于 `speedPct`，
  起步/慢速时几乎打不动方向，是「左右倾斜没用」的另一个隐藏原因。

### 退出时静音

引擎的 BGM 是 `setInterval` 调度的合成音，页面卸载不会自己停，
实机表现就是**退出赛车页音乐还在响**。`race.js` 显式处理：

| 时机 | 处理 |
| --- | --- |
| `onHide` | `stopBgm()` + `master.gain = 0` + `ctx.suspend()` |
| `onShow` | `ctx.resume()` + `master.gain = 0.35`，对局中则 `startBgm()` |
| `onUnload` | 上面全部 + 停掉所有 source + `ctx.close()` |

`engine.js` 是单例产物的普通 require，音频上下文不会因为页面销毁而自动回收，
所以 `onUnload` 必须 `close()`，否则返回上一页还能听到残留音。

### 输出频率

进页面时把传感器输出频率设成 **50Hz**（`wit.setOutputRate(50)`，只设一次，
未连接则等 `onReady` 再设）。WT9011 只支持离散档位，50 兼顾跟手与稳定。

### 页面切换

`WitBle` 的 `handlers` 是全局唯一对象，其他页面（传感器页/射击页/标定页）都在
`onShow` 里重新挂载，所以本页 `onUnload` 只调用 `WitBle.detach()` 摘回调，**不断开蓝牙**。

## 横屏方案


`page.json` 里写 `"pageOrientation": "landscape"`（基础库 2.5.0+，**只影响本页面**，
首页/我的等竖屏页面不受影响）。旋转交给系统，画布就是真实横屏：

- canvas 用 `position:absolute; inset:0; width/height:100%` 铺满窗口；
- touch 的 `clientX/clientY` 就是画布内 CSS 坐标，`engine.toDesign()` 内部会乘 dpr
  再按 `scale/offset` 反算，**不做任何手工旋转**；
- 引擎按设计尺寸 1334×750 等比缩放（letterbox），竖向顶满，多余宽度留在左侧。

> 早期版本用 CSS `transform: rotate(90deg)` 做「伪横屏」，画布尺寸会跟着变换塌掉，
> 表现为整页只剩中间一条竖条，坐标也全错——已废弃，不要再改回去。

### 让开微信胶囊

横屏下胶囊固定在右上角，而游戏计分板正好画在设计坐标右上角。`fit()` 会把可用宽度
收窄到 `getMenuButtonBoundingClientRect().left - 10px`，并让画面**右对齐**，于是：
右侧不被遮挡、左侧多出的 letterbox 正好给左上角返回键腾位置。

### 旋转时机

`onReady` 时系统可能还没转完屏，所以：

- `Page.onResize` + `wx.onWindowResize` 双监听，旋转过程延迟多次 `refit()`（100/260/520/900ms）；
- 帧循环每 30 帧兜底比对一次 `windowWidth/windowHeight`（不依赖事件），变了就重排；
- 尺寸没变时不重建 canvas 缓冲区（重建会清屏闪一下）。

## 依赖的外部接口

页面层用到：`wx.getWindowInfo / getStorageSync / vibrateShort / showToast`、
`wx.onWindowResize / offWindowResize`、`wx.getMenuButtonBoundingClientRect`、
`wx.createWebAudioContext`（不可用时自动降级为静音）。

引擎里的 `BLEManager` 代码仍随包存在，但菜单入口已移除、页面也不再调用它的扫描/连接，
**实际不会触碰 `wx.openBluetoothAdapter` 等 BLE 接口**
（`tools/race-headless-test.js` 第 10 节把 BLE 接口全部记数，断言整套流程一次都没调）。
小游戏专属的 `wx.onTouchStart/Move/End`、`wx.onKeyDown` 在引擎里都有 `typeof` 保护，小程序下不会执行。

## 配套页面（2026-10-29 补齐）

赛车原本只有游戏页，另外三个游戏都有「设置 / 记录」，赛车没有——治疗师改不了参数，
一局跑完也没有任何数据留下来。现补齐两页，版式与其余游戏一致：

| 页面 | 路径 | 作用 |
|---|---|---|
| 训练设置 | `pkgRace/pages/race-settings/` | 13 项参数的滑块/开关、五档赛道对比与套用、康复推荐值与恢复默认 |
| 训练记录 | `pkgRace/pages/race-records/` | 概览三格、最好成绩、6 个 KPI、9 行参数快照、逐条/批量上报 |

入口在**游戏菜单与结算页**的左下角（`race.wxml` 的 `.side-nav`）。对局中完全隐藏：
那两枚按钮压在画布左下角，比赛中会挡视线，`catchtap` 还会把本该给画布的触摸吃掉
（模拟模式下等于半个方向失灵）。

### 设置页与引擎的存储契约（改这里之前必读）

设置页不拥有自己的存储，它直接写引擎的 `nrr_therapist_params_v1`，因此有两条
**静默失效**路径：

1. **必须同时写种子标记 `race_motion_seed_v2`**。`race.js` 的 `seedMotionParams()`
   在「没有种子」时会把 `MOTION_TUNE` 整套盖回去，只改参数不落种子 =「设置改了没生效」。
2. **`brakeOn` 是虚拟开关**。引擎只认 `brakeAngle`，`999` = 永不刹车。关刹车写 999，
   开刹车要写回 8（引擎默认值），不能把 999 留着。

还有两个数值细节：

- `smoothing` 的步长必须是 **0.01**。用 0.05 会把康复推荐值 0.18 对齐成 0.2
  （跟手延迟 117ms → 150ms 以上），等于把实测调过的跟手性悄悄改钝。
- 步长网格必须**从 `min` 起算**（`min + round((v-min)/step)*step`）。从 0 起算会飘：
  `smoothing` 的 min 是 0.05、step 0.01，0.18 会落到 0.185。

参数**只在下一局生效**——引擎在构造函数里读一次并缓存到 `motion.params`，对局中途改
不会热更新。页面顶部必须明说，否则治疗师会以为改坏了。

上述每一条都由 `tools/race-settings-test.js`（51 项）钉住，最后一节直接
`new GameEngine` 读 `engine.motion.params`，断言的是「设置页写下的东西引擎真的读到了」，
而不是「存储里有个看着对的 JSON」。

### 记录页的统计口径

「最好成绩」只统计 `dataSource !== 'simulation'` 的记录。触屏模拟模式容易跑出高分，
混进榜首会让治疗师误判患者进步。模拟记录仍留在列表里（带 `模拟` 标签），但不上报。

## 自检一览

| 命令 | 覆盖 |
|---|---|
| `npm run build:race` | esbuild 打包 `engine.src.js` → `engine.js` + 三类自检 |
| `npm run check:race` | 只做自检不写盘（CI 用） |
| `node tools/race-headless-test.js` | 引擎 85 项：跟手延迟、死区、巡航、确定性、2000 帧长跑、不碰 BLE |
| `node tools/race_page_test.js` | 页面层：letterbox、姿态链路、记录映射、音频生命周期 |
| `node tools/race-settings-test.js` | 设置页 51 项：存储契约、虚拟开关、步长对齐、引擎侧闭环 |
| `node tools/race-records-test.js` | 记录页 35 项：最好成绩口径、字段映射、缺快照兜底、时长格式化 |

全部并入 `npm test`（现 16 套）。
