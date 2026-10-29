// ============================================================================
// pages/fruit/fruit.js —— 「接水果」体感训练（单页多状态）
// ----------------------------------------------------------------------------
// 页面只做四件事：
//   1. Canvas 桥接：把节点交给 FruitRenderer，用 requestAnimationFrame 驱动；
//   2. 传感器：复用 utils/witble.js 的共享连接，把每帧 roll/pitch 喂给引擎；
//   3. 交互：canvas 按钮热区点击 → 分发给引擎（全 Canvas UI，避免原生层遮挡）；
//   4. 记录：结算时写本地训练记录（fruit_records_v1），按用户确认后上报。
//
// 生命周期：
//   onHide  → 停帧循环、暂停本局（计时不计入）、停语音
//   onShow  → 恢复帧循环、重新接管蓝牙回调
//   onUnload→ 中止本局并落记录，释放音频，绝不断开共享蓝牙
// ============================================================================

const WitBle = require('../../../utils/witble.js')
const speaker = require('../../../utils/speaker.js')
const { VOICE_FILES } = require('../../../utils/voiceMap.js')
const { getStore } = require('../../../utils/fruit-config.js')
const { FruitEngine } = require('../../games/fruit/engine.js')
const { FruitRenderer } = require('../../games/fruit/renderer.js')
const { AudioKit } = require('../../../utils/game/audio.js')
const records = require('../../utils/fruit-record.js')
const { getNickname } = require('../../../utils/tab.js')

const SENSOR_HZ = 50
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
    this.engine = null
    this.renderer = null
    this.canvas = null
    this.raf = 0
    this.lastTs = 0
    this.rect = null
    this.retry = 0
    this.rateApplied = false
    // casual 音效集：接住=清脆"叮"、连击=上行双音、漏接=柔和低音（不再是射击的爆炸声）
    this.audio = new AudioKit(this.cfg, 'casual')
    this.lastHintAt = {}
    this.lastBuzzAt = 0
    this.recordSaved = false
    this.savedRecord = null
  },

  onReady() {
    this.initCanvas()
  },

  onShow() {
    this.attachBle()
    if (this.canvas && this.engine && !this.raf) this.startLoop()
    if (this.ble && this.ble.connectedId) this.ensureRate()
    // 从设置页回来：音量/开关可能改过，先同步再决定是否继续放
    if (this.audio) this.audio.sync()
    if (this.audio && this.engine && this.engine.state === 'PLAYING') this.audio.resumeBgm()
  },

  onHide() {
    this.stopLoop()
    if (this.engine && (this.engine.state === 'PLAYING' || this.engine.state === 'COUNTDOWN')) {
      this.engine.pause()
    }
    speaker.stop()
    // 只是切到后台：暂停而不是停掉，回来能接着放
    if (this.audio) this.audio.pauseBgm()
  },

  onUnload() {
    this._clearTimers()
    this.stopLoop()
    speaker.stop()
    // 中途离开：中止本局并落一条「未完成」记录，避免成绩丢失
    if (this.engine && (this.engine.state === 'PLAYING' || this.engine.state === 'PAUSED' ||
        this.engine.state === 'COUNTDOWN' || this.engine.state === 'SENSOR_ERROR')) {
      this.engine.finish('aborted')
      this.persistRecord()
    }
    WitBle.detach(this.ble)
    if (this.audio) {
      this.audio.destroy()
      this.audio = null
    }
    this.engine = null
    this.renderer = null
    this.canvas = null
  },

  onResize() {
    this.fitCanvas()
  },

  // ---------------------------------------------------------------- Canvas
  initCanvas() {
    if (this.engine) return
    const that = this
    wx.createSelectorQuery().in(this)
      .select('#fruitCanvas')
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
        const engine = new FruitEngine({ cfg: that.cfg })
        that.engine = engine
        that.renderer = new FruitRenderer({
          canvas: canvas,
          ctx: ctx,
          engine: engine,
          cfg: that.cfg
        })
        that.renderer.resize(info.width, info.height, dpr)

        if (that.audio) that.audio.init()
        that.setData({ canvasReady: true })
        that.startLoop()
      })
  },

  fitCanvas() {
    if (!this.canvas || !this.engine) return
    const that = this
    this._later(() => {
      wx.createSelectorQuery().in(that).select('#fruitCanvas')
        .fields({ size: true, rect: true })
        .exec((res) => {
          const info = res && res[0]
          if (!info || !info.width || !info.height) return
          const dpr = that.getDpr()
          that.rect = { left: info.left || 0, top: info.top || 0, width: info.width, height: info.height }
          if (that.canvas.width !== Math.round(info.width * dpr) ||
              that.canvas.height !== Math.round(info.height * dpr)) {
            that.canvas.width = Math.round(info.width * dpr)
            that.canvas.height = Math.round(info.height * dpr)
          }
          that.renderer.resize(info.width, info.height, dpr)
        })
    }, 120)
  },

  getDpr() {
    try {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      return Math.min(info.pixelRatio || 2, 2.5)
    } catch (e) {
      return 2
    }
  },

  // ---------------------------------------------------------------- 主循环
  startLoop() {
    if (!this.canvas || !this.engine || this.raf) return
    const canvas = this.canvas
    this.lastTs = 0
    const step = (ts) => {
      this.raf = 0
      if (!this.engine || !this.canvas) return
      const now = typeof ts === 'number' && ts > 0 ? ts : Date.now()
      let dt = this.lastTs ? (now - this.lastTs) / 1000 : 1 / 60
      if (!isFinite(dt) || dt <= 0) dt = 1 / 60
      dt = Math.min(dt, 0.1)
      this.lastTs = now

      try {
        this.engine.update(dt)
        this.handleEvents(this.engine.drainEvents())
        this.renderer.render(dt, Date.now())
      } catch (e) {
        console.error('[fruit] frame error', e)
      }
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

  // ---------------------------------------------------------------- 传感器
  attachBle() {
    const that = this
    if (!this.ble) return
    this.ble.handlers = {
      onData: (d) => {
        if (!that.engine || !d) return
        that.engine.feedSensor(d)
      },
      onReady: () => {
        that.ensureRate()
      },
      onDisconnected: () => {
        that.rateApplied = false
        if (!that.engine) return
        that.engine.enterSensorError()
        if (that.renderer) that.renderer.showHint('传感器已断开', '#DF5540')
      },
      onError: () => { that.rateApplied = false },
      onLog: () => {}
    }
    if (this.ble.connectedId) this.ensureRate()
  },

  ensureRate() {
    if (this.rateApplied || !this.ble || !this.ble.connectedId) return
    this.rateApplied = true
    this.ble.setOutputRate(SENSOR_HZ)
  },

  // ---------------------------------------------------------------- 事件
  handleEvents(events) {
    if (!events || !events.length) return
    for (let i = 0; i < events.length; i++) {
      const ev = events[i]
      if (ev.type === 'state') {
        this.onStateChange(ev.state)
      } else if (ev.type === 'hit') {
        this.sfx('catch')
        this.buzz('light')
      } else if (ev.type === 'combo') {
        this.sfx('combo')
        this.hint('连击 x' + ev.value + '，继续对准', '#9A6414', 900)
      } else if (ev.type === 'miss') {
        this.sfx('miss')
        this.buzz('light')
        this.hint('差一点：果篮没在水果下面', '#DF5540', 1600)
      } else if (ev.type === 'warn') {
        this.hint('还剩 ' + (ev.left || 10) + ' 秒，继续接', '#9A6414', 1200)
      } else if (ev.type === 'sensor:lost') {
        this.buzz('heavy')
        this.hint('传感器数据中断，已暂停判定', '#DF5540', 0)
      } else if (ev.type === 'sensor:resume') {
        this.hint('传感器已恢复，继续训练', '#0A7E72', 600)
      } else if (ev.type === 'calibrate') {
        const ok = ev.result === 'ok' || ev.ok
        this.hint(ok ? (ev.simulated ? '模拟模式：无需标定' : '标定成功') : (ev.message || '标定失败，请重试'),
          ok ? '#0A7E72' : '#DF5540', 700)
        if (ok) {
          this.buzz()
          this.say('零点标定完成')
        }
      } else if (ev.type === 'finish') {
        this.onFinish(ev.summary)
      }
    }
  },

  onStateChange(state) {
    if (state === 'COUNTDOWN') {
      this.say('开始训练，左右倾身移动果篮')
      this.sfx('ui')
    } else if (state === 'PLAYING') {
      this.sfx('ui')
      // 音乐跟着本局走：只在训练进行中播放
      if (this.audio) this.audio.startBgm()
    } else if (state === 'PAUSED') {
      if (this.audio) this.audio.pauseBgm()
    } else if (state === 'SENSOR_ERROR') {
      if (this.audio) this.audio.pauseBgm()
    } else if (state === 'RESULT' || state === 'ABORTED') {
      if (this.audio) this.audio.stopBgm()
      this.sfx('combo')
    }
  },

  onFinish(summary) {
    if (!summary) return
    const rec = this.persistRecord()
    if (!rec) return
    // 静默上报已在 records.save() 内部触发：家用场景没人会点确认弹窗。
    // 需要重传时去「训练记录」页手动操作。
  },

  // ---------------------------------------------------------------- 记录
  persistRecord() {
    if (!this.engine || !this.engine.summary) return null
    if (this.recordSaved) return this.savedRecord || null
    const s = this.engine.summary
    // 参数快照：治疗师之后改难度/容差时，历史数据仍能解释自己（可跨周比较）
    const cfgSnap = getStore().all()
    cfgSnap.version = Number(wx.getStorageSync('cfg_ver_fruit')) || 0
    const rec = {
      recordId: s.recordId,
      nickname: getNickname(),
      gameId: 'fruit',
      scene: s.scene,
      difficulty: s.difficulty,
      rangeConfig: s.rangeConfig,
      score: s.score,
      breakdown: s.breakdown,
      hits: s.hits,
      misses: s.misses,
      accuracy: s.accuracy,
      comboMax: s.comboMax,
      // 稳定统计（只用于记录，不影响接取）
      holdRate: s.holdRate,
      holdTimeSec: s.holdTimeSec,
      holdBestSec: s.holdBestSec,
      holdOutCount: s.holdOutCount,
      deviationAvgDeg: s.deviationAvgDeg,
      deviationMaxDeg: s.deviationMaxDeg,
      holdToleranceDeg: s.holdToleranceDeg,
      duration: s.durationSec,
      durationSec: s.durationSec,
      plannedSec: s.plannedSec,
      completed: s.completed,
      reason: s.reason,
      byType: (s.breakdown && s.breakdown.byType) || {},
      pathLength: s.pathLength,
      avgRate: s.avgRate,
      peak: s.peak,
      sway: s.sway,
      trajectorySummary: s.trajectorySummary,
      dataSource: s.dataSource,
      interrupted: s.interrupted,
      interruptedSec: s.interruptedSec,
      interruptedCount: s.interruptedCount,
      sensorInterrupted: s.sensorInterrupted,
      grade: s.grade,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      calibration: s.calibration,
      configSnapshot: cfgSnap
    }
    records.save(rec)
    this.recordSaved = true
    this.savedRecord = rec
    return rec
  },

  /** 隐私确认：逐项展示将发送的内容与用途，用户同意后才发 */
  askUpload(recordId, rec) {
    const rows = records.describePayload(rec)
    const preview = rows.slice(0, 6).map((r) => r[0] + '：' + r[1]).join('\n')
    wx.showModal({
      title: '发送本局训练记录？',
      content: '将发送以下内容到训练平台，用于训练进度对比：\n' + preview +
        '\n…（共 ' + rows.length + ' 项，不含姓名、证件号、联系方式）\n\n可随时在「训练记录」中重试或删除。',
      confirmText: '同意发送',
      cancelText: '仅存本机',
      success: (res) => {
        if (!res.confirm) return
        records.upload(recordId, { consent: true }).then((r) => {
          if (r.ok) {
            wx.showToast({ title: '已上传', icon: 'success' })
          } else {
            wx.showToast({ title: '上传失败：' + (r.error || '请稍后重试'), icon: 'none', duration: 2200 })
          }
        })
      }
    })
  },

  // ---------------------------------------------------------------- 反馈
  hint(text, color, gapMs) {
    if (!this.renderer) return
    const now = Date.now()
    const key = text || ''
    const gap = gapMs === undefined ? 1200 : gapMs
    if (gap > 0 && this.lastHintAt[key] && now - this.lastHintAt[key] < gap) return
    this.lastHintAt[key] = now
    this.renderer.showHint(text, color)
  },

  sfx(name) {
    if (this.audio) this.audio.sfx(name)
  },

  /** 接水果节奏快，振动做节流，避免连续震动 */
  buzz(type) {
    if (!this.cfg.get('vibrateOn')) return
    const now = Date.now()
    if (type !== 'heavy' && now - this.lastBuzzAt < 420) return
    this.lastBuzzAt = now
    try {
      wx.vibrateShort({ type: type || 'light' })
    } catch (e) { /* 忽略 */ }
  },

  /** 只播已有语音包，缺失时静默（不弹「未接入插件」提示） */
  say(text) {
    if (!this.cfg.get('voiceOn')) return
    if (!VOICE_FILES[text]) return
    speaker.speak(text)
  },

  // ---------------------------------------------------------------- 交互
  onTouchStart(e) {
    const t = (e.touches && e.touches[0]) || null
    if (!t) return
    this.touchAt = { x: t.clientX, y: t.clientY, time: Date.now() }
  },

  onTouchEnd(e) {
    const t = (e.changedTouches && e.changedTouches[0]) || null
    if (!t || !this.touchAt) {
      this.touchAt = null
      return
    }
    const dx = t.clientX - this.touchAt.x
    const dy = t.clientY - this.touchAt.y
    if (Math.sqrt(dx * dx + dy * dy) > TAP_SLOP) {
      this.touchAt = null
      return
    }
    this.touchAt = null
    this.onTap(t.clientX, t.clientY)
  },

  onTouchCancel() {
    this.touchAt = null
  },

  onTap(clientX, clientY) {
    if (!this.renderer) return
    const rect = this.rect || { left: 0, top: 0 }
    const x = clientX - rect.left
    const y = clientY - rect.top
    const id = this.renderer.hitTest(x, y)
    if (!id) return
    this.renderer.markPress(id)
    if (id === 'sim:toggle') return
    this.sfx('ui')
    this.dispatch(id)
  },

  dispatch(id) {
    const engine = this.engine
    if (!engine) return

    switch (id) {
      // ---- 介绍页 ----
      case 'start':
        engine.prepare()
        break
      case 'settings':
        wx.navigateTo({ url: '/pkgFruit/pages/fruit-settings/fruit-settings' })
        break
      case 'records':
      case 'detail':
        wx.navigateTo({ url: '/pkgFruit/pages/fruit-records/fruit-records' })
        break
      case 'sim:on':
        engine.setSimMode(true)
        this.hint('已切换到模拟数据（不会当作真实训练）', '#9A6414', 0)
        break
      case 'sim:off':
        engine.setSimMode(false)
        this.hint('已关闭模拟数据', '#0A7E72', 0)
        break

      // ---- 准备页 ----
      case 'connect':
        wx.navigateTo({ url: '/pages/wit/wit' })
        break
      // 零点统一在「零点标定」页设置，游戏内不再做独立标定
      case 'zero:set':
        wx.navigateTo({ url: '/pages/calibrate/calibrate' })
        break
      case 'back':
        engine.toIntro()
        break
      case 'enter':
        this.tryStart()
        break

      // ---- 游戏中 ----
      case 'pause':
        if (engine.state === 'PLAYING') engine.pause()
        else if (engine.state === 'PAUSED') engine.resume()
        break
      case 'resume':
        if (engine.state === 'SENSOR_ERROR' && engine.motion.stale) {
          this.hint('仍在等待传感器数据…', '#DF5540', 0)
          return
        }
        engine.resume()
        break
      case 'quit':
        this.confirmQuit()
        break
      case 'reconnect':
        wx.navigateTo({ url: '/pages/wit/wit' })
        break

      // ---- 结算页 ----
      case 'again':
        this.tryStart(true)
        break
      case 'restart':
        this.tryStart(true)
        break
      case 'home':
        this.goHome()
        break

      // ---- 模拟测试（全部走真实判定路径）----
      case 'sim:hold':
      case 'sim:center':
        engine.centerSim()
        this.hint('模拟：身体回中，果篮回到屏幕中间', '#0A7E72', 1200)
        break
      case 'sim:out':
        engine.nudgeSim(0.9, 0)
        this.hint('模拟：身体向右倾，果篮往右移', '#9A6414', 1200)
        break
      case 'sim:spawn':
        if (!engine.debugSpawn(3)) this.simOnlyHint()
        break
      case 'sim:catch':
        if (!engine.debugAlignToBasket()) this.simOnlyHint()
        break
      case 'sim:miss':
        if (!engine.debugAlignAway()) this.simOnlyHint()
        break
      case 'sim:combo':
        if (!engine.debugSpawn(3, { atBasket: true })) this.simOnlyHint()
        else this.hint('3 个水果已排在篮子上方，果篮别动就能连击', '#9A6414', 0)
        break
      case 'sim:lost':
        if (engine.state !== 'PLAYING') { this.simOnlyHint(); return }
        engine.enterSensorError()
        this.hint('已模拟一次数据中断', '#DF5540', 0)
        break

      default:
        break
    }
  },

  simOnlyHint() {
    if (!this.engine || !this.engine.simMode) {
      this.hint('这些测试按钮只在模拟模式下可用', '#9A6414', 0)
      return
    }
    this.hint('需要先开始训练（PLAYING）才能测试', '#9A6414', 0)
  },

  tryStart(isRestart) {
    const engine = this.engine
    if (!engine) return
    const res = engine.startCountdown()
    if (!res.ok) {
      const msg = (res.errors || ['配置不合法']).join('\n')
      wx.showModal({ title: '无法开始训练', content: msg, showCancel: false })
      return
    }
    this.recordSaved = false
    this.savedRecord = null
    if (res.warnings && res.warnings.length) {
      this.hint(res.warnings[0], '#9A6414', 0)
    }
    void isRestart
  },

  confirmQuit() {
    wx.showModal({
      title: '结束本局？',
      content: '本局会立即结算并生成训练记录（标记为未完成）。',
      confirmText: '结束',
      cancelText: '继续训练',
      success: (res) => {
        if (!res.confirm) return
        if (this.engine) this.engine.finish('aborted')
      }
    })
  },

  goHome() {
    wx.navigateBack({
      fail: () => wx.switchTab({ url: '/pages/games/games' })
    })
  }
})
