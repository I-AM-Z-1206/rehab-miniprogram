// ============================================================================
// pages/rhythm/rhythm.js —— 「节奏训练」页面桥接
// ----------------------------------------------------------------------------
// 页面只做五件事：
//   1. Canvas 桥接：节点交给 RhythmRenderer，requestAnimationFrame 驱动；
//   2. 传感器：复用 utils/witble.js 的共享连接，每帧 roll/pitch 喂给引擎；
//   3. 音频：BeatClock 持有 InnerAudioContext，以音频进度为时间基准；
//   4. 交互：canvas 热区点击 → 分发（全 Canvas UI，避免原生层遮挡）；
//   5. 记录：结算写本地 rhythm_records_v1，用户确认后才上报。
//
// 生命周期：
//   onHide  → 停帧循环 + 暂停本局（音乐与时间一起冻结）
//   onShow  → 恢复帧循环 + 重新接管蓝牙回调
//   onUnload→ 中止本局并落记录，释放音频，绝不断开共享蓝牙
// ============================================================================

const WitBle = require('../../../utils/witble.js')
const speaker = require('../../../utils/speaker.js')
const { VOICE_FILES } = require('../../../utils/voiceMap.js')
const { getStore } = require('../../../utils/rhythm-config.js')
const { songById } = require('../../../utils/rhythm-songs.js')
const { BeatClock } = require('../../games/rhythm/beat-clock.js')
const { RhythmEngine } = require('../../games/rhythm/engine.js')
const { RhythmRenderer } = require('../../games/rhythm/renderer.js')
const { AudioKit } = require('../../../utils/game/audio.js')
const records = require('../../utils/rhythm-record.js')
const { getNickname } = require('../../../utils/tab.js')

const SENSOR_HZ = 50
const TAP_SLOP = 14
const VOLUME_STEPS = [0, 0.35, 0.7, 1]

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
    this.clock = null
    this.canvas = null
    this.raf = 0
    this.lastTs = 0
    this.rect = null
    this.retry = 0
    this.rateApplied = false
    // 提示音用 casual 音效集：音乐由 BeatClock 播，音效不能再叠一首背景音乐
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
    if (this.engine) {
      // 从设置页/记录页返回：可能换了曲目或音量
      this.engine.syncSong()
      if (this.clock) {
        this.clock.syncVolume()
        this.clock.setSong(this.engine.song)
      }
    }
    if (this.canvas && this.engine && !this.raf) this.startLoop()
    if (this.ble && this.ble.connectedId) this.ensureRate()
  },

  onHide() {
    this.stopLoop()
    if (this.engine && (this.engine.state === 'PLAYING' || this.engine.state === 'COUNTDOWN')) {
      this.engine.pause()
    }
    if (this.engine && this.engine.previewing) this.engine.stopPreview()
    speaker.stop()
    if (this.audio) this.audio.stopBgm()
  },

  onUnload() {
    this._clearTimers()
    this.stopLoop()
    speaker.stop()
    if (this.engine && (this.engine.state === 'PLAYING' || this.engine.state === 'PAUSED' ||
        this.engine.state === 'COUNTDOWN' || this.engine.state === 'SENSOR_ERROR')) {
      this.engine.finish('aborted')
      this.persistRecord()
    }
    if (this.clock) {
      this.clock.stop()
      this.clock.destroyAudio()
      this.clock = null
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
      .select('#rhythmCanvas')
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
        that.clock = new BeatClock({ cfg: that.cfg })
        that.engine = new RhythmEngine({ cfg: that.cfg, clock: that.clock })
        that.renderer = new RhythmRenderer({
          canvas: canvas,
          ctx: ctx,
          engine: that.engine,
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
      wx.createSelectorQuery().in(that).select('#rhythmCanvas')
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
        console.error('[rhythm] frame error', e)
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
        // 断线：冻结时间与判定，不猜测、不自动切模拟
        that.engine.enterSensorError('disconnected')
        if (that.renderer) that.renderer.showHint('传感器已断开', '#FF6B81')
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
        this.sfx('hit')
        this.buzz('light')
      } else if (ev.type === 'miss') {
        this.sfx('miss')
        if (ev.wrongSide) this.hint('方向反了：向' + (ev.side === 'left' ? '左' : '右') + '移动身体', '#FF6B81', 1400)
      } else if (ev.type === 'combo') {
        this.sfx('combo')
      } else if (ev.type === 'guide') {
        this.hint(ev.text || '跟着节拍慢慢移动', '#FFD479', 6000)
      } else if (ev.type === 'sensor:lost') {
        this.buzz('heavy')
        this.hint('传感器数据中断，已暂停判定', '#FF6B81', 0)
      } else if (ev.type === 'sensor:resume') {
        this.hint('数据已恢复，继续训练', '#7BE3A8', 800)
      } else if (ev.type === 'music') {
        if (ev.mode === 'silent') this.hint('无音乐：只能靠节拍点击与视觉判断', '#FFD479', 0)
      } else if (ev.type === 'calibrate') {
        const ok = ev.result === 'ok' || ev.ok
        this.hint(ok ? (ev.simulated ? '模拟模式：无需标定' : '标定成功') : (ev.message || '标定失败，请重试'),
          ok ? '#7BE3A8' : '#FF6B81', 800)
        if (ok) this.buzz()
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
    cfgSnap.version = Number(wx.getStorageSync('cfg_ver_rhythm')) || 0
    const rec = {
      recordId: s.recordId,
      nickname: getNickname(),
      gameId: 'rhythm',
      songId: s.songId,
      songName: s.songName,
      bpm: s.bpm,
      difficulty: s.difficulty,
      difficultyLabel: s.difficultyLabel,
      chartSeed: s.chartSeed,
      noteCount: s.noteCount,
      score: s.score,
      breakdown: s.breakdown,
      perfectCount: s.perfect,
      greatCount: s.great,
      goodCount: s.good,
      missCount: s.miss,
      perfect: s.perfect,
      great: s.great,
      good: s.good,
      miss: s.miss,
      hits: s.hits,
      wrongDirectionCount: s.wrongDirectionCount,
      comboMax: s.comboMax,
      leftHitCount: s.leftHitCount,
      centerHitCount: s.centerHitCount,
      rightHitCount: s.rightHitCount,
      rhythmAccuracy: s.rhythmAccuracy,
      directionAccuracy: s.directionAccuracy,
      overallHitRate: s.overallHitRate,
      syncOffsetMs: s.syncOffsetMs,
      controlConfig: s.controlConfig,
      duration: s.durationSec,
      durationSec: s.durationSec,
      plannedSec: s.plannedSec,
      pathLength: s.pathLength,
      avgRate: s.avgRate,
      peak: s.peak,
      trajectorySummary: s.trajectorySummary,
      dataSource: s.dataSource,
      completed: s.completed,
      reason: s.reason,
      interrupted: s.interrupted,
      interruptedSec: s.interruptedSec,
      interruptedCount: s.interruptedCount,
      sensorInterrupted: s.sensorInterrupted,
      audioMode: s.audioMode,
      grade: s.grade,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
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

  /** 节奏游戏命中很密集，振动与音效都要节流，避免盖住音乐 */
  buzz(type) {
    if (!this.cfg.get('vibrateOn')) return
    const now = Date.now()
    if (type !== 'heavy' && now - this.lastBuzzAt < 260) return
    this.lastBuzzAt = now
    try {
      wx.vibrateShort({ type: type || 'light' })
    } catch (e) { /* 忽略 */ }
  },

  /** 只播已有语音包，缺失时静默（不为每个音符播报，避免干扰节奏） */
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

    // 曲目 / 难度
    if (id.indexOf('song:') === 0) {
      const songId = id.slice(5)
      this.cfg.set('songId', songId, 'page')
      engine.syncSong()
      if (this.clock) this.clock.setSong(engine.song)
      this.hint('已选择《' + songById(songId).name + '》· ' + songById(songId).bpm + ' BPM', '#B9F4FF', 0)
      return
    }
    if (id.indexOf('lv:') === 0) {
      const lv = Number(id.slice(3)) || 1
      this.cfg.applyDifficulty(lv)
      this.hint('难度：第 ' + lv + ' 档 · ' + this.cfg.difficultyLabel(lv), '#B9F4FF', 0)
      return
    }

    switch (id) {
      // ---- 介绍页 ----
      case 'start':
        engine.prepare()
        break
      case 'settings':
        wx.navigateTo({ url: '/pkgRhythm/pages/rhythm-settings/rhythm-settings' })
        break
      case 'records':
        wx.navigateTo({ url: '/pkgRhythm/pages/rhythm-records/rhythm-records' })
        break
      case 'sim:on':
        engine.setSimMode(true)
        this.hint('已切换到模拟数据（不会当作真实训练）', '#FFD479', 0)
        break
      case 'sim:off':
        engine.setSimMode(false)
        this.hint('已关闭模拟数据', '#7BE3A8', 0)
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
      case 'calib:minus':
        this.nudgeOffset(-5)
        break
      case 'calib:plus':
        this.nudgeOffset(5)
        break
      case 'calib:play':
        if (engine.previewing) {
          engine.stopPreview()
        } else if (!engine.startPreview()) {
          this.hint('先连接传感器或打开模拟，才能试听', '#FFD479', 0)
        }
        break

      // ---- 游戏中 ----
      case 'pause':
        if (engine.state === 'PLAYING') engine.pause()
        else if (engine.state === 'PAUSED') engine.resume()
        break
      case 'resume':
        if (engine.state === 'SENSOR_ERROR' && !engine.simMode && !engine.motion.isLive()) {
          this.hint('仍在等待传感器数据…', '#FF6B81', 0)
          return
        }
        engine.resume()
        break
      case 'quit':
        this.confirmQuit()
        break
      case 'vol':
        this.cycleVolume()
        break
      case 'beat':
        this.cfg.set('beatPulseOn', !this.cfg.get('beatPulseOn'), 'page')
        this.hint(this.cfg.get('beatPulseOn') ? '临近提示已开启' : '临近提示已关闭', '#B9F4FF', 0)
        break
      case 'reconnect':
        wx.navigateTo({ url: '/pages/wit/wit' })
        break

      // ---- 结算页 ----
      case 'again':
      case 'restart':
        this.tryStart(true)
        break
      case 'home':
        this.goHome()
        break

      // ---- 模拟测试（判定仍走真实流程）----
      case 'sim:left':
        engine.nudgeSim(-0.45)
        break
      case 'sim:right':
        engine.nudgeSim(0.45)
        break
      case 'sim:center':
        engine.centerSim()
        break
      case 'sim:force-left':
        if (!engine.debugPushNote('left', 1400)) this.simOnlyHint()
        break
      case 'sim:force-right':
        if (!engine.debugPushNote('right', 1400)) this.simOnlyHint()
        break
      case 'sim:lost':
        if (engine.state !== 'PLAYING') { this.simOnlyHint(); return }
        engine.enterSensorError('sim')
        this.hint('已模拟一次数据中断', '#FF6B81', 0)
        break
      default:
        break
    }
  },

  nudgeOffset(delta) {
    if (!this.engine) return
    const cur = Number(this.cfg.get('syncOffsetMs')) || 0
    const next = Math.max(-200, Math.min(200, cur + delta))
    this.cfg.set('syncOffsetMs', next, 'page')
    this.hint('音画补偿 ' + (next > 0 ? '+' : '') + next + ' ms', '#B9F4FF', 0)
  },

  cycleVolume() {
    const cur = Number(this.cfg.get('musicVolume'))
    let idx = VOLUME_STEPS.findIndex((v) => Math.abs(v - cur) < 0.09)
    if (idx < 0) idx = 2
    const next = VOLUME_STEPS[(idx + 1) % VOLUME_STEPS.length]
    this.cfg.set('musicVolume', next, 'page')
    if (this.clock) this.clock.syncVolume()
    this.hint('音量 ' + Math.round(next * 100) + '%', '#B9F4FF', 0)
  },

  simOnlyHint() {
    if (!this.engine || !this.engine.simMode) {
      this.hint('这些测试按钮只在模拟模式下可用', '#FFD479', 0)
      return
    }
    this.hint('需要先开始训练（PLAYING）才能测试', '#FFD479', 0)
  },

  tryStart() {
    const engine = this.engine
    if (!engine) return
    if (engine.previewing) engine.stopPreview()
    const res = engine.startCountdown()
    if (!res.ok) {
      const msg = (res.errors || ['配置不合法']).join('\n')
      wx.showModal({ title: '无法开始训练', content: msg, showCancel: false })
      return
    }
    this.recordSaved = false
    this.savedRecord = null
    if (res.warnings && res.warnings.length) this.hint(res.warnings[0], '#FFD479', 0)
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
