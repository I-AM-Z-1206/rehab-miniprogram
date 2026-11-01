// ============================================================================
// pages/wire/wire.js —— 「走钢丝」体感平衡训练（单页多状态）
// ----------------------------------------------------------------------------
// 页面只做四件事：
//   1. Canvas 桥接：把节点交给 WireRenderer，用 requestAnimationFrame 驱动；
//   2. 传感器：复用 utils/witble.js 的共享连接，把每帧 roll/pitch 喂给引擎；
//   3. 交互：canvas 上的按钮热区点击 → 分发给引擎（全 Canvas UI，避免原生层遮挡）；
//   4. 记录：结算时写本地训练记录，按用户确认后上报。
//
// 页面生命周期处理：
//   onHide  → 停帧循环、暂停本局（计时不计入）、停语音
//   onShow  → 恢复帧循环、重新接管蓝牙回调
//   onUnload→ 中止本局并落记录，释放音频，绝不断开共享蓝牙
// ============================================================================

const WitBle = require('../../../utils/witble.js')
const speaker = require('../../../utils/speaker.js')
const { VOICE_FILES } = require('../../../utils/voiceMap.js')
const { getStore } = require('../../../utils/wire-config.js')
const { WireEngine } = require('../../games/wire/engine.js')
const { WireRenderer } = require('../../games/wire/renderer.js')
const { AudioKit } = require('../../../utils/game/audio.js')
const records = require('../../../utils/training-record.js')
const { getNickname } = require('../../../utils/tab.js')
const deviceReady = require('../../../utils/device-ready.js')

const SENSOR_HZ = 50 // WT9011 支持的离散档位；页面按 60fps 消费
const TAP_SLOP = 14 // 手指移动小于该距离视为点击

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v)
}

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
    canvasReady: false,
    // 初始化失败时换成具体原因。留空 = 显示默认的「正在准备场地…」
    bootMsg: ''
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
    this.audio = new AudioKit(this.cfg, 'casual')
    this.lastHintAt = {}
    this.recordSaved = false
  },

  onReady() {
    this.initCanvas()
  },

  onShow() {
    this.attachBle()
    if (this.canvas && this.engine && !this.raf) this.startLoop()
    if (this.ble && this.ble.connectedId) this.ensureRate()
    // 启动时网络不通的话，离线队列要等到下次进来才补传；这里给一次机会。
    records.flushPending().catch(function () { /* 忽略 */ })
  },

  onHide() {
    this.stopLoop()
    if (this.engine && (this.engine.state === 'PLAYING' || this.engine.state === 'COUNTDOWN')) {
      this.engine.pause()
    }
    speaker.stop()
    if (this.audio) this.audio.stopBgm()
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
      .select('#wireCanvas')
      .fields({ node: true, size: true, rect: true })
      .exec((res) => {
        const info = res && res[0]
        if (!info || !info.node || !info.width || !info.height) {
          that.retry += 1
          if (that.retry < 20) {
            that._later(() => that.initCanvas(), 100)
          } else {
            // 2 秒拿不到画布就不再重试。原来这里直接 return，页面永远停在
            // 「正在准备场地…」—— 那行字等一辈子都不会变，用户只能干等，
            // 治疗师也分不清是画布没拿到、还是代码已经崩了。
            // 把**实际拿到的是什么**报出来，三种情况的修法完全不同：
            //   查询无结果   → wxml 里没有这个 id，或页面根本没渲染
            //   有结果没 node → 基础库过低，不支持 fields({ node: true })
            //   有 node 但尺寸 0 → 样式没生效，canvas 被压成 0 高
            that.bootFail(!info ? '查询无结果（页面可能未渲染）'
              : !info.node ? '未取到画布节点（基础库过低？）'
                : '画布尺寸为 0（' + (info.width || 0) + '×' + (info.height || 0) + '，样式未生效）')
          }
          return
        }
        // 下面任何一步抛错，canvasReady 都设不上，boot 层就会一直盖着 ——
        // 原本这里是裸奔的，一次异常就变成永久白屏。包起来并说出来。
        try {
          const canvas = info.node
          const dpr = that.getDpr()
          that.canvas = canvas
          that.rect = { left: info.left || 0, top: info.top || 0, width: info.width, height: info.height }
          canvas.width = Math.round(info.width * dpr)
          canvas.height = Math.round(info.height * dpr)

          const ctx = canvas.getContext('2d')
          const engine = new WireEngine({ cfg: that.cfg })
          that.engine = engine
          that.renderer = new WireRenderer({
            canvas: canvas,
            ctx: ctx,
            engine: engine,
            cfg: that.cfg
          })
          that.renderer.resize(info.width, info.height, dpr)

          if (that.audio) that.audio.init()
          that.setData({ canvasReady: true })
          that.startLoop()
        } catch (e) {
          // 回到干净状态，让下次进页面还能重来（不然 this.engine 残留会卡住 initCanvas）
          that.engine = null
          that.renderer = null
          that.canvas = null
          that.bootFail('渲染器启动失败：' + ((e && e.message) || e))
          console.error('[wire] initCanvas error', e)
        }
      })
  },

  /**
   * 初始化失败：把原因摆到画面上，同时落进 app 的错误日志。
   * 宁可让患者看到一行技术文案，也不要给一个永远转不出来的空画面。
   */
  bootFail(msg) {
    console.error('[wire] ' + msg)
    try { this.setData({ bootMsg: msg }) } catch (e) { /* 页面可能已卸载 */ }
    try {
      const app = getApp()
      if (app && app.logError) app.logError('wire-boot', msg + ' @ ' + (this.route || ''))
    } catch (e) { /* 忽略 */ }
  },

  fitCanvas() {
    if (!this.canvas || !this.engine) return
    const that = this
    this._later(() => {
      wx.createSelectorQuery().in(that).select('#wireCanvas')
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
        console.error('[wire] frame error', e)
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

  /** 输出频率提到 50Hz（只设一次；未连接时等 onReady 再设） */
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
      } else if (ev.type === 'warn') {
        // 失衡：提示**方向**，不是提示「你错了」。
        // 原来这里是红字「已接近失衡」+ miss 音效 —— 患者知道出事了，
        // 但不知道该往哪动；而且红色在康复场景里是失误语言。
        this.sfx('wobble')
        this.buzz()
        this.hint(this._guideText(ev.guide), '#8FB8CE', 1100)
      } else if (ev.type === 'rope:in') {
        // 越界：绳索绷到头了。**不再说「已帮你扶稳」** —— 现在没有自动扶正，
        // 回正要患者自己做，话必须这么说，否则他会等游戏来救。
        this.sfx('edge')
        this.buzz('heavy')
        this.hint('已越界 · ' + this._guideText(ev.guide) + '（自己回正才能继续走）', '#B8792E', 900)
      } else if (ev.type === 'rope:out') {
        this.sfx('combo')
        this.hint('回正了，继续走', '#0A7E72', 800)
      } else if (ev.type === 'critical') {
        this.hint('重心不稳，请放慢动作', '#B8792E', 900)
      } else if (ev.type === 'goal') {
        this.sfx('hit')
        this.buzz('heavy')
      } else if (ev.type === 'penalty') {
        this.hint('已越界，本局不前进', '#B8792E', 800)
      } else if (ev.type === 'fail') {
        this.hint('越界，本局结束', '#B8792E', 900)
      } else if (ev.type === 'sensor:lost') {
        this.buzz('heavy')
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
      this.say('开始训练，请保持身体居中')
      this.sfx('ui')
    } else if (state === 'PLAYING') {
      this.sfx('ui')
    } else if (state === 'RESULT' || state === 'ABORTED') {
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
    cfgSnap.version = Number(wx.getStorageSync('cfg_ver_wire')) || 0
    const rec = {
      recordId: s.recordId,
      nickname: getNickname(),
      gameId: 'wire',
      scene: s.scene,
      difficulty: s.difficulty,
      rangeConfig: s.rangeConfig,
      score: s.score,
      breakdown: s.breakdown,
      duration: s.durationSec,
      durationSec: s.durationSec,
      plannedSec: s.plannedSec,
      distance: s.distance,
      trackLength: s.trackLength,
      completed: s.completed,
      reason: s.reason,
      comboMax: s.breakdown ? s.breakdown.maxCombo : 0,
      stableSec: s.stableSec,
      offCount: s.offCount,
      offSec: s.offSec,
      ropeTriggers: s.ropeTriggers,
      ropeEngagedSec: s.ropeEngagedSec,
      pathLength: s.pathLength,
      avgRate: s.avgRate,
      sway: s.sway,
      dataSource: s.dataSource,
      interrupted: s.interrupted,
      interruptedSec: s.interruptedSec,
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

  // ---------------------------------------------------------------- 反馈
  hint(text, color, gapMs) {
    if (!this.renderer) return
    const now = Date.now()
    const key = text || ''
    const gap = gapMs || 1200
    if (this.lastHintAt[key] && now - this.lastHintAt[key] < gap) return
    this.lastHintAt[key] = now
    this.renderer.showHint(text, color)
  },

  /**
   * 引导文案：把 guideDir 翻成人话。
   * 0 表示前后失衡（没有横向光带），这时只说「把重心收回来」——
   * 前后方向的光带读不出来，硬说「往前」反而会让人往前栽。
   */
  _guideText(dir) {
    const d = Number(dir) || 0
    if (d < 0) return '往左压一点'
    if (d > 0) return '往右压一点'
    return '把重心收回中间'
  },

  sfx(name) {
    if (this.audio) this.audio.sfx(name)
  },

  buzz(type) {
    if (!this.cfg.get('vibrateOn')) return
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
    this.sfx('ui')
    this.dispatch(id)
  },

  dispatch(id) {
    const engine = this.engine
    if (!engine) return

    // 角色：纯外观，立即生效并记住。介绍页里那个小人会当场换掉。
    if (id.indexOf('char:') === 0) {
      const cid = id.slice(5)
      this.cfg.set('characterId', cid, 'page')
      const NAME = { fox: '小狐狸', rabbit: '小兔子', panda: '小熊猫' }
      this.hint('角色：' + (NAME[cid] || cid), '#0A7E72', 0)
      return
    }

    switch (id) {
      // ---- 介绍页 ----
      case 'start':
        // 不再直接进「设备准备」页：就绪时应当直接开一局
        this.beginGame()
        break
      case 'settings':
        wx.navigateTo({ url: '/pkgWire/pages/wire-settings/wire-settings' })
        break
      case 'records':
        wx.navigateTo({ url: '/pkgWire/pages/wire-records/wire-records' })
        break
      case 'sim:on':
        engine.setSimMode(true)
        this.hint('已切换到模拟数据', '#9A6414', 0)
        break
      case 'sim:off':
        engine.setSimMode(false)
        this.hint('已关闭模拟数据', '#0A7E72', 0)
        break

      // ---- 准备页 ----
      case 'connect':
      case 'refresh':
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
        engine.resume()
        break
      case 'restart':
        this.tryStart(true)
        break
      case 'quit':
        this.confirmQuit()
        break
      case 'exit':
        if (engine.state === 'PAUSED') this.confirmQuit()
        else this.confirmQuit()
        break
      case 'reconnect':
        wx.navigateTo({ url: '/pages/wit/wit' })
        break

      // ---- 结算页 ----
      case 'again':
        this.tryStart(true)
        break
      case 'home':
        this.goHome()
        break
      case 'detail':
        wx.navigateTo({ url: '/pkgWire/pages/wire-records/wire-records' })
        break

      // ---- 模拟控制 ----
      case 'sim:left':
        engine.nudgeSim(-0.3, 0)
        break
      case 'sim:right':
        engine.nudgeSim(0.3, 0)
        break
      case 'sim:up':
        engine.nudgeSim(0, 0.3)
        break
      case 'sim:down':
        engine.nudgeSim(0, -0.3)
        break
      case 'sim:center':
        engine.centerSim()
        break
      case 'sim:rope':
        engine.setSimTarget(1, engine.motion.ny)
        this.hint('模拟偏移已到边界，观察保险绳', '#9A6414', 0)
        break

      default:
        break
    }
  },

  /**
   * 点「开始训练」。
   *
   * 首页已经把连接和零点标定做完了，这里再走一遍「设备准备」页等于同一件事
   * 做两次 —— 实测最直接的反馈就是「点一下开始，人还停在准备页」。
   * 所以就绪时直接进倒计时；只有真的没就绪才拦住，并且给两条出路：
   * 去补做（连接 / 标定），或者切到模拟数据。
   */
  beginGame() {
    const engine = this.engine
    if (!engine) return
    if (engine.simMode) { this.tryStart(); return }
    const st = deviceReady.check(this.ble)
    if (st.ready) { this.tryStart(); return }
    // 已连接、零点也对，只是数据还没开始推（刚进页面那几十毫秒）。
    // 等一下再试，别让患者看到「没有可用的传感器数据」这种吓人的提示。
    if (st.connected && engine.motion && !engine.motion.isLive()) {
      this._later(() => {
        const again = deviceReady.check(this.ble)
        if (again.ready) this.tryStart()
        else this.askDevice(again)
      }, 650)
      return
    }
    this.askDevice(st)
  },

  /**
   * 没就绪：说清缺什么，并给「去补做」和「用模拟数据」两条路。
   *
   * 三种情况要分开说，否则会指错方向：
   *   没连接 → 去连接
   *   连了但零点失效 → 去标定
   *   连了、零点也对，就是收不到数据 → 检查胸带/电量（提示「去标定」没用）
   */
  askDevice(st) {
    const engine = this.engine
    if (!engine) return
    const needZero = st.connected && !st.zeroOk
    const noData = st.connected && st.zeroOk

    let title = '还不能开始'
    let content = st.reason + '。'
    let confirmText = '去连接'
    if (!st.connected) {
      title = '还没连接传感器'
      content = '请先把胸带上的传感器开机，再回来连接。'
    } else if (needZero) {
      content = st.reason + '。请先完成零点标定 —— 传感器位置变了，旧零点就不准了。'
      confirmText = '去标定'
    } else if (noData) {
      title = '收不到传感器数据'
      content = '传感器已连接，但数据没有传上来。请检查胸带是否贴合、传感器是否还有电；也可以先用模拟数据试一次。'
      confirmText = '查看设备'
    }

    wx.showModal({
      title: title,
      content: content,
      confirmText: confirmText,
      cancelText: '用模拟数据',
      success: (r) => {
        if (r.confirm) {
          wx.navigateTo({ url: needZero ? '/pages/calibrate/calibrate' : '/pages/wit/wit' })
          return
        }
        if (!r.cancel) return
        engine.setSimMode(true)
        this.hint('已切换到模拟数据（不会当作真实训练）', '#9A6414', 0)
        this.tryStart()
      }
    })
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
