# 赛车引擎（race/engine.js）

`pages/race` 使用的核心来自独立小游戏工程 **NEON REHAB RACER**（`D:/Desktop/sc`，4638 行 / 26 个 ES Module）。

小游戏与小程序运行时不同，不能直接 `require game.js`，这里做了三件事：

1. **esbuild 打包**：`src/**` → 单文件 CommonJS `race/engine.js`（约 78KB）
2. **画布替换**：页面 `<canvas type="2d">` 节点替代 `wx.createCanvas()`
3. **输入桥接**：页面 touch → `engine.onPointerDown/Move/Up`，坐标直接交给 `engine.toDesign()`

## 怎么改

源码请改 `D:/Desktop/sc`，然后重新打包：

```bash
npm i esbuild
node tools/build_race.js            # 默认读 D:/Desktop/sc
SC_DIR=/path/to/sc node tools/build_race.js
```

esbuild 不在项目里时，可以装到托管工作区再用 `NODE_PATH` 指过去：

```bash
npm --prefix ~/.workbuddy/binaries/node/workspace i esbuild
NODE_PATH=~/.workbuddy/binaries/node/workspace/node_modules node tools/build_race.js
```

打包时会做这些「产物改造」（源码工程保持原样）：去掉 BLE 菜单与状态文案、
HUD 换成 `侧屈 ±X°`、回调滤波参数、注入巡航油门/初速度/低速转向。
全部用字符串精确匹配，源码结构一变就报错，不会悄悄失效；产物出厂前还会自检。

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

（`tools/race_page_test.js` 里有阶跃响应断言，超过 160ms 会失败。）
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
**实际不会触碰 `wx.openBluetoothAdapter` 等 BLE 接口**（`tools/race_page_test.js` 里有断言）。
小游戏专属的 `wx.onTouchStart/Move/End`、`wx.onKeyDown` 在引擎里都有 `typeof` 保护，小程序下不会执行。
