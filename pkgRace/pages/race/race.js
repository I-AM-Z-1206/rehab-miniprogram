// ============================================================================
// pages/race/race.js —— 体感赛车（NEON REHAB RACER → 小程序页面）
// ----------------------------------------------------------------------------
// 原项目是一套微信小游戏（D:\Desktop\sc），小游戏与小程序运行时不同，
// 不能直接 require game.js，这里做了三件事把它「搬」进页面：
//   1. 用 esbuild 把 src/**（26 个 ES Module）打包成 CommonJS：race/engine.js
//   2. 用页面里的 <canvas type="2d"> 节点替代 wx.createCanvas()
//   3. 用页面 touch 事件喂给 engine.onPointerDown/Move/Up
//
// 横屏方案：page.json 里写 pageOrientation: "landscape"（基础库 2.5.0+，
// 只影响本页面，竖屏页面不受影响）。旋转交给系统，画布就是真实横屏，
// 不再用 CSS transform 旋转——那样会连坐标一起转，很容易整页塌成一条。
// 引擎内部按设计尺寸 1334×750 等比缩放居中（letterbox），任何屏幕比例都不变形。
//
// 传感器：游戏**不再自己连蓝牙**（打包时已把 BLE 入口和状态文案从界面去掉），
// 统一复用小程序侧 utils/witble.js 的单例连接，把每一帧 roll/pitch 直接注入引擎：
//   engine.ble.injectSample({ angle, gyro, accel }) → MotionController 解算
// 这样首页/传感器页连上之后，进游戏就有数据，不需要二次连接。
// ============================================================================

const { GameEngine } = require('../../race/engine.js')
const WitBle = require('../../../utils/witble.js')

const MAX_DPR = 2
const HINT_MS = 2600

// 轴交换：本项目的佩戴方式下，传感器 pitch = 身体左右侧屈、roll = 前后倾
// （射击页实测确认过）。赛车引擎约定 roll=转向、pitch=油门，
// 因此注入前把两轴对调；若你的佩戴方式相反，把它改成 false。
const SWAP_AXES = true

// 传感器输出频率（WT9011 只支持离散档位，50 是其中之一；越高越跟手，但功耗/丢包也高）
const SENSOR_HZ = 50

// 康复姿态参数：脑卒中患者活动范围小、稳定性差，这里整体调「小角度就有明显响应」。
// 数值会覆盖引擎默认值（引擎自己的治疗师面板仍可在此基础上继续微调）。
// 引擎自身的治疗师参数存储键（与 D:/Desktop/sc/src/utils/Storage.js 保持一致）
const ENGINE_PARAM_KEY = 'nrr_therapist_params_v1'
// 种子标记：改了 MOTION_TUNE 就把它升个版本，才会重新写入
const ENGINE_SEED_KEY = 'race_motion_seed_v2'

const MOTION_TUNE = {
  maxAngle: 10,        // 打满方向盘所需侧屈角度：默认 20° → 10°
  deadZone: 1.5,       // 死区：默认 3.5° → 1.5°（别把有效动作当抖动吃掉，也不至于被呼吸带得乱晃）
  brakeAngle: 999,     // 康复期不设刹车：后倾只是把油门收回，车仍有巡航速度，不会停死
  smoothing: 0.18,     // 滤波：默认 0.35 → 0.18（越小越跟手，延迟更低）
  assist: 0,           // 回正辅助关掉：它会削弱小幅度输入，影响精度
  rollSensitivity: 1.1,
  pitchSensitivity: 1.1,
  invertRoll: true     // 实机左右颠倒 → 反转转向轴
}
// 油门方向：引擎里 pitch 正 = 加速、负 = 刹车。若实机「前倾反而减速」，
// 把这里改成 true 即可（只翻转油门，不影响转向）。
const INVERT_THROTTLE = false

Page({
  data: {
    showHint: true,
    hintText: '左上角可返回'
  },

  onLoad() {
    this.engine = null
    this.canvas = null
    this.raf = 0
    this.lastTs = 0
    this.hintTimer = null
    this.retryTimers = []
    this.wit = WitBle.getShared()
    this.sensorReady = false
    this.rateSet = false
    this.motionSeeded = this.seedMotionParams()
    this.bindResize()
  },

  onReady() {
    this.initCanvas()
  },

  onShow() {
    // 从后台回来/从别的页面返回时恢复循环
    if (this.engine && !this.raf) this.startLoop()
    this.unmuteAudio()
    // 别的页面可能重设过 handlers，回来时重新接管
    if (this.engine) this.attachSensor()
  },

  onHide() {
    // 切后台：停帧循环，对局中则暂停，避免体感数据继续累积
    this.stopLoop()
    this.muteAudio()
    if (this.engine && this.engine.state === 'play') {
      try { this.engine.setState('pause') } catch (e) { /* 忽略 */ }
    }
  },

  onUnload() {
    this.stopLoop()
    this.muteAudio(true)
    this.unbindResize()
    if (this.hintTimer) clearTimeout(this.hintTimer)
    this.hintTimer = null
    this.retryTimers.forEach((t) => clearTimeout(t))
    this.retryTimers = []
    this.detachSensor()
    this.engine = null
    this.canvas = null
  },

  // 系统旋转完成时会触发；部分机型 Page.onResize 不回调，另挂了 windowResize
  onResize() {
    this.scheduleRefit()
  },

  bindResize() {
    this.onWindowResize = () => this.scheduleRefit()
    if (wx.onWindowResize) wx.onWindowResize(this.onWindowResize)
  },

  unbindResize() {
    if (wx.offWindowResize && this.onWindowResize) wx.offWindowResize(this.onWindowResize)
    this.onWindowResize = null
  },

  /** 旋转过程中尺寸会变几次，延迟多次重量，保证最后一次是对的 */
  scheduleRefit() {
    this.retryTimers.forEach((t) => clearTimeout(t))
    this.retryTimers = [100, 260, 520, 900].map((ms) =>
      setTimeout(() => this.refit(), ms)
    )
  },

  // ---------------------------------------------------------------- 初始化
  initCanvas(retry) {
    if (this.engine) return
    const attempt = retry || 0
    wx.createSelectorQuery().in(this).select('#raceCanvas').fields({ node: true, size: true }).exec((res) => {
      const info = res && res[0]
      if (!info || !info.node || !info.width || !info.height) {
        if (attempt < 10) {
          setTimeout(() => this.initCanvas(attempt + 1), 120)
        } else {
          console.error('[race] 取不到 canvas 节点')
        }
        return
      }
      this.canvas = info.node

      // 先按真实尺寸设置画布，再创建引擎（引擎内部会用 wx 窗口尺寸重算，
      // 紧接着用页面实测尺寸覆盖，避免状态栏/安全区导致的偏差）
      const dpr = this.getDpr()
      this.canvas.width = Math.round(info.width * dpr)
      this.canvas.height = Math.round(info.height * dpr)

      const engine = new GameEngine(this.canvas)
      this.engine = engine
      this.fit(info.width, info.height, dpr)
      this.applyMotionTune()
      this.startLoop()
      this.attachSensor()
      setTimeout(() => this.noticeSensor(), 500)

      // 部分机型 onReady 时系统还没转完屏，稍后再校一次尺寸
      this.scheduleRefit()

      this.updateHint()
      this.hintTimer = setTimeout(() => {
        this.hintTimer = null
        this.setData({ showHint: false })
      }, HINT_MS)
    })
  },

  /** 用页面实测尺寸重算 letterbox（引擎按设计尺寸 1334×750 等比缩放） */
  fit(cssW, cssH, dpr) {
    const engine = this.engine
    const canvas = this.canvas
    if (!engine || !canvas || !cssW || !cssH) return
    const v = engine.view
    const w = Math.round(cssW * dpr)
    const h = Math.round(cssH * dpr)
    // 尺寸没变就不重建缓冲区，避免每帧闪一下
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }

    // 横屏下微信胶囊固定在右上角，而游戏计分板正好画在设计坐标的右上角，
    // 不避让就会被压住。把可用宽度收窄到胶囊左边界，再让画面右对齐。
    const cap = this.getCapsule()
    const margin = 10 * dpr
    let availW = w
    if (cap && cap.left > 0 && cap.left < cssW - 40) {
      // 至少保留 55% 宽度给画面，避免窄屏/异常胶囊位置把游戏压成一条
      availW = Math.max(Math.round(w * 0.55), Math.min(w, Math.round(cap.left * dpr) - margin))
    }

    engine.dpr = dpr
    engine.canvasSize = { w, h }
    engine.scale = Math.min(availW / v.width, h / v.height)
    const contentW = v.width * engine.scale
    // 有胶囊：右对齐（把多余宽度全留到左侧，同时给左上角返回键腾地方）；
    // 没有胶囊信息：正常居中
    engine.offsetX = availW < w ? availW - contentW : (w - contentW) / 2
    engine.offsetY = (h - v.height * engine.scale) / 2
    this.fittedCss = { w: cssW, h: cssH }
    this.seenSize = { w: cssW, h: cssH }
  },

  /** 微信右上角胶囊位置（CSS px），取不到返回 null */
  getCapsule() {
    try {
      const r = wx.getMenuButtonBoundingClientRect && wx.getMenuButtonBoundingClientRect()
      if (r && r.width > 0 && r.left > 0) return r
    } catch (e) { /* 忽略 */ }
    return null
  },

  /** 兜底：个别机型旋转后不发 resize 事件，帧循环里定期比对窗口尺寸 */
  checkViewport() {
    const info = this.getWindow()
    const w = info.windowWidth
    const h = info.windowHeight
    if (!w || !h) return
    const prev = this.seenSize
    this.seenSize = { w: w, h: h }
    if (!prev) return
    // 只在尺寸「真的变了」时重排，避免和 fittedCss 有 1~2px 偏差时来回抖
    if (Math.abs(prev.w - w) > 2 || Math.abs(prev.h - h) > 2) this.scheduleRefit()
  },

  refit() {
    if (!this.canvas || !this.engine) return
    wx.createSelectorQuery().in(this).select('#raceCanvas').fields({ size: true }).exec((res) => {
      const info = res && res[0]
      if (!info || !info.width || !info.height) return
      this.fit(info.width, info.height, this.getDpr())
      this.updateHint()
    })
  },

  /** 横屏没生效时（个别 PC / iPad 场景）给个引导 */
  updateHint() {
    const info = this.getWindow()
    const portrait = (info.windowHeight || 0) > (info.windowWidth || 0)
    const text = portrait ? '请把手机横过来 · 左上角可返回' : '左上角可返回'
    if (text !== this.data.hintText) this.setData({ hintText: text })
  },

  getWindow() {
    try {
      return wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    } catch (e) {
      return {}
    }
  },

  getDpr() {
    const info = this.getWindow()
    return Math.min(info.pixelRatio || 2, MAX_DPR)
  },

  // ---------------------------------------------------------------- 音频
  /**
   * 静音：引擎的 BGM 是 setInterval 调度的合成音，页面卸载时不会自己停，
   * 不显式处理就会出现「退出后音乐还在响」。
   */
  muteAudio(close) {
    const a = this.engine && this.engine.audio
    if (!a) return
    try { a.stopBgm() } catch (e) { /* 忽略 */ }
    try { if (a.master) a.master.gain.value = 0 } catch (e) { /* 忽略 */ }
    try { if (a.ctx && a.ctx.suspend) a.ctx.suspend() } catch (e) { /* 忽略 */ }
    try {
      const srcs = a.sources || {}
      Object.keys(srcs).forEach((k) => {
        const s = srcs[k]
        if (s && s.stop) s.stop()
        if (close && s && s.destroy) s.destroy()
      })
    } catch (e) { /* 忽略 */ }
    // 页面卸载：直接把 WebAudio 上下文关掉，彻底没有残留声音
    if (close) {
      try { if (a.ctx && a.ctx.close) a.ctx.close() } catch (e) { /* 忽略 */ }
    }
  },

  unmuteAudio() {
    const a = this.engine && this.engine.audio
    if (!a) return
    try { if (a.ctx && a.ctx.resume) a.ctx.resume() } catch (e) { /* 忽略 */ }
    try { if (a.master) a.master.gain.value = a.enabled === false ? 0 : 0.35 } catch (e) { /* 忽略 */ }
    try {
      if (this.engine.state === 'play' && a.musicEnabled) a.startBgm()
    } catch (e) { /* 忽略 */ }
  },

  // ---------------------------------------------------------------- 传感器
  /**
   * 接管小程序蓝牙数据。WitBle 是全页面共享的单例，handlers 只有一个对象，
   * 所以每次 onShow 都重新接管一次（别的页面可能改过它）。
   */
  attachSensor() {
    const that = this
    if (!this.wit) return
    this.wit.handlers = {
      onData: (d) => that.feedSensor(d),
      onReady: () => {
        that.sensorReady = true
        that.ensureRate()
      },
      onDisconnected: () => {
        that.sensorReady = false
        if (that.engine && that.engine.ble) that.engine.ble.state = 'idle'
      },
      onError: () => { that.sensorReady = false },
      onLog: () => {}
    }
    this.sensorReady = !!this.wit.connectedId
    if (this.sensorReady && this.engine && this.engine.ble) this.engine.ble.state = 'connected'
    this.ensureRate()
  },

  /** 把传感器输出频率设成 50Hz（只设一次；未连接时等 onReady 再设） */
  ensureRate() {
    if (this.rateSet || !this.wit || !this.wit.connectedId) return
    this.rateSet = true
    const hz = this.wit.setOutputRate(SENSOR_HZ)
    if (hz) console.log('[race] 传感器输出频率已设为 ' + hz + 'Hz')
  },

  /**
   * 把康复参数写进引擎自己的治疗师存储（只写一次）。
   * 写进存储而不是每次强行覆盖，是因为治疗师在游戏内面板调过之后
   * 会存进同一个键，下次进来应当以他调的为准。
   */
  seedMotionParams() {
    try {
      if (wx.getStorageSync(ENGINE_SEED_KEY)) return true
      let cur = wx.getStorageSync(ENGINE_PARAM_KEY)
      if (typeof cur === 'string') {
        try { cur = JSON.parse(cur) } catch (e) { cur = null }
      }
      if (!cur || typeof cur !== 'object') cur = {}
      const merged = Object.assign({}, cur, MOTION_TUNE)
      wx.setStorageSync(ENGINE_PARAM_KEY, JSON.stringify(merged))
      wx.setStorageSync(ENGINE_SEED_KEY, 1)
      // 校验真的落盘了（个别环境 setStorageSync 静默失败）
      return !!wx.getStorageSync(ENGINE_SEED_KEY)
    } catch (e) {
      return false
    }
  },

  /** 存储不可用时的兜底：直接覆盖引擎内存参数，保证本局灵敏度到位 */
  applyMotionTune() {
    const engine = this.engine
    if (!engine || !engine.motion || !engine.motion.params) return
    if (this.motionSeeded) return
    Object.assign(engine.motion.params, MOTION_TUNE)
  },

  detachSensor() {
    // 只摘回调，蓝牙连接保持（和传感器页、射击页一致）
    if (this.wit) WitBle.detach(this.wit)
  },

  /**
   * 一帧姿态 → 引擎样本。
   * d.roll / d.pitch 已经在 utils/witble.js 里扣过全局零点，直接可用；
   * 引擎内部的 0° 中立位默认也是 0，所以和首页/传感器页的口径一致。
   */
  feedSensor(d) {
    const engine = this.engine
    if (!engine || !d) return
    if (typeof d.roll !== 'number' && typeof d.pitch !== 'number') return

    const roll = typeof d.roll === 'number' ? d.roll : 0
    const pitch = typeof d.pitch === 'number' ? d.pitch : 0

    if (!this.sensorReady) {
      this.sensorReady = true
      if (engine.ble) engine.ble.state = 'connected'
    }
    if (!engine.ble || !engine.ble.injectSample) return

    const steer = SWAP_AXES ? pitch : roll      // 引擎 roll = 转向
    let throttle = SWAP_AXES ? roll : pitch     // 引擎 pitch = 油门
    if (INVERT_THROTTLE) throttle = -throttle

    // 只取 roll / pitch（yaw 留 0），加速度、角速度、磁场一律不参与，
    // 少一层对象创建也少一点每帧开销
    engine.ble.injectSample({
      angle: { roll: steer, pitch: throttle, yaw: 0 }
    })
  },

  /** 没连传感器时给一次提示，避免进了游戏车不动却不知道为什么 */
  noticeSensor() {
    if (this.wit && this.wit.connectedId) return
    if (this.sensorTipShown) return
    this.sensorTipShown = true
    wx.showToast({
      title: '未连接传感器，请先在首页连接',
      icon: 'none',
      duration: 2400
    })
  },

  // ---------------------------------------------------------------- 主循环
  startLoop() {
    if (!this.engine || !this.canvas || this.raf) return
    const canvas = this.canvas
    this.lastTs = 0
    const step = (ts) => {
      this.raf = 0
      if (!this.engine || !this.canvas) return
      const now = typeof ts === 'number' ? ts : Date.now()
      let dt = this.lastTs ? (now - this.lastTs) / 1000 : 1 / 60
      if (!isFinite(dt) || dt <= 0) dt = 1 / 60
      if (dt > 0.1) dt = 0.1
      this.lastTs = now
      try {
        this.engine.update(dt)
        this.engine.render()
      } catch (e) {
        console.error('[race] frame error', e)
        return
      }
      // 每 ~0.5s 校一次视口，兜住不触发 resize 的机型
      this.frameCount = (this.frameCount || 0) + 1
      if (this.frameCount % 30 === 0) this.checkViewport()
      this.raf = canvas.requestAnimationFrame(step)
    }
    this.raf = canvas.requestAnimationFrame(step)
  },

  stopLoop() {
    if (this.raf && this.canvas && this.canvas.cancelAnimationFrame) {
      try { this.canvas.cancelAnimationFrame(this.raf) } catch (e) { /* 忽略 */ }
    }
    this.raf = 0
  },

  // ---------------------------------------------------------------- 触摸
  // 原生横屏：touch 的 clientX/clientY 就是画布内 CSS 坐标，
  // engine.toDesign 内部会乘 dpr 再按 scale/offset 反算，无需手工旋转
  onTouchStart(e) { this.routePointer('down', e) },
  onTouchMove(e) { this.routePointer('move', e) },
  onTouchEnd(e) { this.routePointer('up', e) },
  onTouchCancel(e) { this.routePointer('up', e) },

  routePointer(type, e) {
    const engine = this.engine
    if (!engine) return
    const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0])
    if (!t) return
    const p = engine.toDesign(t.clientX, t.clientY)
    if (type === 'down') engine.onPointerDown(p.x, p.y)
    else if (type === 'move') engine.onPointerMove(p.x, p.y)
    else engine.onPointerUp()
  },

  // ---------------------------------------------------------------- 退出
  onBack() {
    this.stopLoop()
    wx.navigateBack({
      fail: () => wx.switchTab({ url: '/pages/games/games' })
    })
  }
})
