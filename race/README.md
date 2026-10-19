# 赛车引擎（race/engine.js）

`pages/race` 使用的核心来自独立小游戏工程 **NEON REHAB RACER**（`D:/Desktop/sc`，4638 行 / 26 个 ES Module）。

小游戏与小程序运行时不同，不能直接 `require game.js`，这里做了三件事：

1. **esbuild 打包**：`src/**` → 单文件 CommonJS `race/engine.js`（约 82KB）
2. **画布替换**：页面 `<canvas type="2d">` 节点替代 `wx.createCanvas()`
3. **输入桥接**：页面 touch → `engine.onPointerDown/Move/Up`，坐标直接交给 `engine.toDesign()`

## 怎么改

源码请改 `D:/Desktop/sc`，然后重新打包：

```bash
npm i esbuild
node tools/build_race.js            # 默认读 D:/Desktop/sc
SC_DIR=/path/to/sc node tools/build_race.js
```

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
  engine.ble.injectSample({
    angle: { roll, pitch, yaw },   // roll/pitch 已由 utils/zero.js 扣过零点
    gyro: { x: d.wx, y: d.wy, z: d.wz },
    accel: { x: d.ax, y: d.ay, z: d.az }
  })
}
```

`injectSample()` → `_commit()` → `emit('sample')` → `MotionController.onSample()`，
和游戏自己收蓝牙时的路径完全一致，所以滤波、标定、治疗师面板参数都照旧生效。

### 轴映射（SWAP_AXES）

本项目佩戴方式下 **pitch = 身体左右侧屈、roll = 前后倾**（射击页实机确认），
而引擎约定 `roll = 转向 / pitch = 油门`，所以 `race.js` 顶部常量：

```js
const SWAP_AXES = true   // 佩戴方向相反时改成 false
```

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
