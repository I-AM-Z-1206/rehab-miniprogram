// ============================================================================
// pages/shoot/shoot.js —— 射击训练（整屏画布，治疗师参数在独立页面）
// ----------------------------------------------------------------------------
// 页面只做四件事：
//   1. Canvas 桥接：GameEngine 画玩法，ShootUI 画开始/暂停/结算/按钮条；
//   2. 传感器：复用 utils/witble.js 的共享连接，把每帧 roll/pitch 喂给引擎；
//   3. 交互：全 Canvas 热区点击 → 分发给引擎 / 跳设置页（不用 WXML 按钮，
//      避免被原生 canvas 遮挡，和接水果 / 走钢丝 / 节奏训练一致）；
//   4. 参数：治疗师在 pages/shoot-settings 调整，ConfigStore 一变引擎下一帧生效。
//
// 和改造前的区别：治疗师控制台（滑块 / 开关 / 难度）整块搬到了独立页面，
// 游戏页不再有任何调试面板。
// ============================================================================

const WitBle = require('../../../utils/witble.js')
const speaker = require('../../../utils/speaker.js')
const game = require('../../../utils/game/index.js')
const { getStore } = require('../../../utils/game/config.js')
const { AudioKit } = require('../../../utils/game/audio.js')
const { ShootUI } = require('../../games/shoot/ui.js')

const SENSOR_HZ = 100
const TAP_SLOP = 14

Page({
  // 定时器统一管理：页面卸载时全部清掉，避免"页面已销毁还在回调"
  _later(fn, ms) {
    this._timers = this._timers || []
    const id = setTimeout(() => {
      this._timers = this._timers.filter((x) => x !== id)
      fn()
    }, ms)
    this._timers.push(id)
    return id
  },

  _clearTimers() {
    ;(this._timers || []).forEach((id) => clearTimeout(id))
    this._timers = []
  },
  data: {
    canvasReady: false
  },

  // ---------------------------------------------------------------- 生命周期
  onLoad() {
    this.cfg = getStore()
    this.ble = WitBle.getShared()
    this.game = null
    this.ui = null
    this.canvas = null
    this.rect = null
    this.retry = 0
    this.rateApplied = false
    this.audio = new AudioKit(this.cfg, 'shooter')
    game.mountGlobal()
  },

  onReady() {
    this.initCanvas()
  },

  onShow() {
    this.attachBle()
    if (this.ble && this.ble.connectedId) this.applySensorRate()
    if (this.game) this.game.feedSensor(null)
    if (this.audio) this.audio.sync()
    if (this.game) this.game.render()
  },

  onHide() {
    // 离开页面一定要暂停：帧循环不该在后台跑
    if (this.game && this.game.state === 'running') this.game.pause()
    speaker.stop()
    if (this.audio) this.audio.pauseBgm()
  },

  onUnload() {
    this._clearTimers()
    speaker.stop()
    if (this.ble) WitBle.detach(this.ble)
    if (this.game) {
      game.detach(this.game)
      this.game.destroy()
      this.game = null
    }
    if (this.audio) {
      this.audio.destroy()
      this.audio = null
    }
    this.ui = null
    this.canvas = null
  },

  onResize() {
    this.syncCanvasSize()
  },

  // ---------------------------------------------------------------- Canvas
  initCanvas() {
    if (this.game) return
    const that = this
    wx.createSelectorQuery().in(this)
      .select('#gameCanvas')
      .fields({ node: true, size: true, rect: true })
      .exec((res) => {
        const info = res && res[0]
        if (!info || !info.node || !info.width || !info.height) {
          that.retry += 1
          if (that.retry < 20) that._later(() => that.initCanvas(), 100)
          return
        }
        const canvas = info.node
        const dpr = that.getDpr()
        that.canvas = canvas
        that.rect = { left: info.left || 0, top: info.top || 0, width: info.width, height: info.height }
        canvas.width = Math.round(info.width * dpr)
        canvas.height = Math.round(info.height * dpr)

        const ctx = canvas.getContext('2d')
        const engine = game.createEngine({
          canvas: canvas,
          ctx: ctx,
          width: info.width,
          height: info.height,
          dpr: dpr,
          cfg: that.cfg,
          audio: that.audio,
          handlers: { onState: () => {}, onEvent: (ev) => that.onEngineEvent(ev) }
        })
        // 页面自己画面板：引擎只负责玩法 + HUD
        engine.externalOverlay = true
        engine.insetTop = that.getSafeTop()
        engine.afterRender = () => {
          if (that.ui) that.ui.render()
        }

        that.game = engine
        that.ui = new ShootUI({ ctx: ctx, engine: engine, cfg: that.cfg })
        that.ui.resize(info.width, info.height, dpr)
        that.ui.setInsets(engine.insetTop, that.getSafeBottom())

        that.setData({ canvasReady: true })
        engine.render()
      })
  },

  /** 画布尺寸变了就同步位图并让引擎重排（和接水果一致） */
  syncCanvasSize() {
    if (!this.canvas || !this.game) return
    const that = this
    if (this.sizeTimer) clearTimeout(this.sizeTimer)
    this.sizeTimer = this._later(() => {
      this.sizeTimer = null
      wx.createSelectorQuery().in(that).select('#gameCanvas')
        .fields({ size: true, rect: true })
        .exec((res) => {
          const info = res && res[0]
          if (!info || !info.width || !info.height) return
          const dpr = that.getDpr()
          that.rect = { left: info.left || 0, top: info.top || 0, width: info.width, height: info.height }
          const w = Math.round(info.width * dpr)
          const h = Math.round(info.height * dpr)
          if (that.canvas.width !== w || that.canvas.height !== h) {
            that.canvas.width = w
            that.canvas.height = h
          }
          if (that.ui) {
            that.ui.resize(info.width, info.height, dpr)
            that.ui.setInsets(that.getSafeTop(), that.getSafeBottom())
          }
          if (that.game) {
            that.game.insetTop = that.getSafeTop()
            that.game.resize(info.width, info.height, dpr)
            that.game.render()
          }
        })
    }, 150)
  },

  getDpr() {
    try {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      return Math.min(info.pixelRatio || 2, 2.5)
    } catch (e) {
      return 2
    }
  },

  /** 状态栏高度：HUD 不能压到刘海 / 状态栏 */
  getSafeTop() {
    try {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      const status = info.statusBarHeight || 20
      return status + 6
    } catch (e) {
      return 26
    }
  },

  /** 底部小黑条高度 */
  getSafeBottom() {
    try {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      const winH = info.windowHeight || info.screenHeight || 0
      const safeBottom = info.safeArea && info.safeArea.bottom ? info.safeArea.bottom : winH
      return Math.max(0, Math.min(40, winH - safeBottom))
    } catch (e) {
      return 0
    }
  },

  // ---------------------------------------------------------------- 传感器
  attachBle() {
    const that = this
    if (!this.ble) return
    this.ble.handlers = {
      onData: (d) => {
        if (that.game && d) that.game.feedSensor(d)
      },
      onReady: () => {
        that.applySensorRate()
        if (that.game) that.game.render()
      },
      onDisconnected: () => {
        that.rateApplied = false
        if (that.game) {
          // 断线：暂停本局，绝不在后台悄悄用模拟数据顶替
          if (that.game.state === 'running') that.game.pause()
          that.game.render()
        }
        wx.showToast({ title: '传感器已断开，训练已暂停', icon: 'none' })
      },
      onError: () => { that.rateApplied = false },
      onLog: () => {}
    }
    if (this.ble.connectedId) this.applySensorRate()
  },

  applySensorRate() {
    if (!this.ble || !this.ble.connectedId || this.rateApplied) return
    this.rateApplied = true
    this.ble.setOutputRate(SENSOR_HZ)
  },

  // ---------------------------------------------------------------- 引擎事件
  onEngineEvent(ev) {
    if (!ev) return
    if (ev.type === 'end') {
      // 结算页已经写得很清楚，这里只给一句语音，不再念分数（避免和音效打架）
      speaker.speak('训练结束')
      return
    }
    if (ev.type === 'out') {
      // 出界提示画在画布上（保持区变红 + 回中提示），这里只做一次轻振动
      const now = Date.now()
      if (now - (this.lastOutAt || 0) > 3000) {
        this.lastOutAt = now
        try { wx.vibrateShort({ type: 'light' }) } catch (e) { /* 忽略 */ }
      }
    }
  },

  // ---------------------------------------------------------------- 触摸
  onTouchStart(e) {
    const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0])
    if (!t) return
    const rect = this.rect || { left: 0, top: 0, width: 390, height: 700 }
    this.touchStart = {
      x: typeof t.x === 'number' ? t.x : (t.clientX - rect.left),
      y: typeof t.y === 'number' ? t.y : (t.clientY - rect.top),
      at: Date.now()
    }
  },

  onTouchEnd(e) {
    const start = this.touchStart
    this.touchStart = null
    if (!start || !this.ui) return
    const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0])
    if (!t) return
    const rect = this.rect || { left: 0, top: 0, width: 390, height: 700 }
    const x = typeof t.x === 'number' ? t.x : (t.clientX - rect.left)
    const y = typeof t.y === 'number' ? t.y : (t.clientY - rect.top)
    if (Math.abs(x - start.x) + Math.abs(y - start.y) > TAP_SLOP) return // 拖动不算点击

    const id = this.ui.hitTest(x, y)
    if (!id) return
    this.dispatch(id)
  },

  onTouchCancel() {
    this.touchStart = null
  },

  dispatch(id) {
    const engine = this.game
    if (!engine || !this.ui) return
    this.ui.markPress(id)
    switch (id) {
      case 'start':
      case 'resume':
        engine.start()
        if (engine.state === 'running' && engine.pose.stale) {
          wx.showToast({ title: '未连接传感器，可用触屏模拟左右倾角', icon: 'none', duration: 2000 })
        }
        break
      case 'pause':
        engine.pause()
        break
      case 'restart':
        engine.restart()
        break
      case 'settings':
        wx.navigateTo({ url: '/pkgShoot/pages/shoot-settings/shoot-settings' })
        break
      case 'connect':
        wx.navigateTo({ url: '/pages/wit/wit' })
        break
      case 'home':
        wx.switchTab({ url: '/pages/games/games' })
        break
      case 'back': {
        const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
        if (pages && pages.length > 1 && wx.navigateBack) wx.navigateBack()
        else wx.switchTab({ url: '/pages/games/games' })
        break
      }
      default:
        break
    }
    engine.render()
  }
})
