// ============================================================================
// pages/shoot/shoot.js —— FR-GAME-01 射击训练（体感保持 + 自动开火）
// ----------------------------------------------------------------------------
// 页面只做三件事：
//   1. 把 Canvas 节点交给 GameEngine，桥接传感器数据（WitMotion roll）；
//   2. 治疗师面板：滑块 / 开关 / 难度档位 → 直接调用实时 API，游戏不中断；
//   3. 把引擎状态（得分 / 连击 / 倾角 / 是否在保持范围内）同步到界面。
// ============================================================================

const WitBle = require('../../utils/witble.js')
const speaker = require('../../utils/speaker.js')
const game = require('../../utils/game/index.js')
const { SCHEMA, getStore } = require('../../utils/game/config.js')

// 治疗师面板上出现的参数（顺序即展示顺序）
const PANEL_KEYS = [
  'hitRange',
  'fireRate',
  'keepRangeDeg',
  'maxLeanDeg',
  'smooth',
  'comboWindowMs',
  'scoreMin',
  'scoreMax',
  'gameDuration',
  'baseScorePerSecond'
]

const UNIT_TEXT = { '±°': '°' }

function fmt(key, value) {
  const meta = SCHEMA[key]
  if (!meta) return String(value)
  const unit = UNIT_TEXT[meta.unit] || meta.unit || ''
  return value + (unit ? ' ' + unit : '')
}

Page({
  data: {
    // 运行状态
    state: 'ready',
    running: false,
    btnText: '开始训练',
    btnIcon: '/assets/icons/play-white.png',
    // 实时数据
    score: 0,
    combo: 0,
    hits: 0,
    angle: 0,
    inZone: true,
    dir: 'center',
    timeLeft: '--',
    zoneRate: 100,
    sensorConnected: false,
    sensorStale: true,
    sensorHz: 0,
    // 面板
    panelOpen: true,
    params: [],
    difficulties: [],
    difficulty: 'normal',
    difficultyLabel: '标准',
    scoreMul: 1,
    showHitArea: false,
    sfxOn: true,
    bgmOn: true,
    // 结束汇总
    summary: null,
    outWarn: ''
  },

  onLoad() {
    this.cfg = getStore()
    this.ble = WitBle.getShared()
    this.unsub = null
    this.lastOutToast = 0
    this.syncParams()
    this.syncDifficulty()
    game.mountGlobal()
  },

  onReady() {
    this.initCanvas()
  },

  onShow() {
    this.attachBle()
    this.refreshBleStatus()
    // 进页面时若已连上（在别的页面连的），补一次输出频率设置
    if (this.ble && this.ble.connectedId) this.applySensorRate()
    if (this.game) this.game.feedSensor(null)
  },

  onHide() {
    // 离开页面一定要暂停：帧循环不该在后台跑
    if (this.game && this.game.state === 'running') {
      this.game.pause()
      this.setData({ state: 'paused', running: false, btnText: '继续训练' })
    }
  },

  onUnload() {
    speaker.stop()
    WitBle.detach(this.ble)
    if (this.unsub) this.unsub()
    if (this.game) {
      game.detach(this.game)
      this.game.destroy()
      this.game = null
    }
  },

  onResize() {
    this.syncCanvasSize()
  },

  // -------------------------------------------------------------- Canvas / 引擎
  initCanvas() {
    if (this.game) return
    const that = this
    const query = wx.createSelectorQuery().in(this)
    query.select('#gameCanvas').fields({ node: true, size: true, rect: true }).exec((res) => {
      const info = res && res[0]
      if (!info || !info.node) {
        // 首帧布局未完成：稍后重试
        if (!that.retryCount) that.retryCount = 0
        that.retryCount += 1
        if (that.retryCount < 20) setTimeout(() => that.initCanvas(), 120)
        return
      }
      that.canvas = info.node
      that.canvasRect = { left: info.left, top: info.top, width: info.width, height: info.height }
      const dpr = that.getDpr()
      const w = Math.max(160, info.width)
      const h = Math.max(200, info.height)
      that.canvas.width = Math.floor(w * dpr)
      that.canvas.height = Math.floor(h * dpr)
      const ctx = that.canvas.getContext('2d')

      that.game = game.createEngine({
        canvas: that.canvas,
        ctx: ctx,
        width: w,
        height: h,
        dpr: dpr,
        cfg: that.cfg,
        handlers: {
          onState: (st) => that.onEngineState(st),
          onEvent: (ev) => that.onEngineEvent(ev)
        }
      })
      // 已连上传感器时，保持范围立即生效
      that.game.render()
      that.setData({ showHitArea: !!that.cfg.get('showHitArea') })
    })
  },

  getDpr() {
    try {
      if (wx.getWindowInfo) return wx.getWindowInfo().pixelRatio || 2
      return wx.getSystemInfoSync().pixelRatio || 2
    } catch (e) {
      return 2
    }
  },

  /** 面板展开/收起后舞台高度变了，需要重新量一次画布 */
  syncCanvasSize() {
    if (!this.canvas || !this.game) return
    const that = this
    setTimeout(() => {
      wx.createSelectorQuery().in(that).select('#gameCanvas').fields({ size: true, rect: true }).exec((res) => {
        const info = res && res[0]
        if (!info || !info.width || !info.height) return
        const dpr = that.getDpr()
        that.canvas.width = Math.floor(info.width * dpr)
        that.canvas.height = Math.floor(info.height * dpr)
        that.canvasRect = { left: info.left, top: info.top, width: info.width, height: info.height }
        that.game.resize(info.width, info.height, dpr)
      })
    }, 320)
  },

  // -------------------------------------------------------------- 传感器
  attachBle() {
    const that = this
    this.ble.handlers = {
      onData: (d) => {
        if (!that.game) return
        that.game.feedSensor(d)
        if (!that.data.sensorConnected) that.setData({ sensorConnected: true, sensorStale: false })
      },
      onReady: () => {
        that.setData({ sensorConnected: true, sensorStale: false })
        // 连上后把模块输出频率提到 100Hz（硬件只支持离散档位），
        // 引擎再按固定 60Hz 采样消费，保证手感跟手
        that.applySensorRate()
      },
      onDisconnected: () => {
        that.rateApplied = false
        that.setData({ sensorConnected: false, sensorStale: true, sensorHz: 0 })
        wx.showToast({ title: '传感器已断开', icon: 'none' })
      },
      onError: () => { that.setData({ sensorConnected: false }) },
      onLog: () => {}
    }
  },

  /** 传感器输出频率：硬件最近档位 100Hz（不支持精确 60Hz），消费端固定 60Hz */
  applySensorRate() {
    if (!this.ble || !this.ble.connectedId) return
    if (this.rateApplied) return
    this.rateApplied = true
    const hz = this.ble.setOutputRate(100)
    if (hz) {
      wx.showToast({ title: '传感器输出已设为 ' + hz + 'Hz', icon: 'none', duration: 1500 })
    }
  },

  refreshBleStatus() {
    const connected = !!(this.ble && this.ble.connectedId)
    this.setData({ sensorConnected: connected })
  },

  goConnect() {
    wx.navigateTo({ url: '/pages/wit/wit' })
  },

  // -------------------------------------------------------------- 引擎回调
  onEngineState(st) {
    const patch = {
      state: st.state,
      running: st.running,
      score: st.score,
      combo: st.combo,
      hits: st.hits,
      angle: st.angle,
      inZone: st.inZone,
      dir: st.dir,
      zoneRate: st.zoneRate,
      sensorStale: st.sensorStale,
      sensorHz: st.sensorHz || 0,
      timeLeft: st.timeLeft >= 0 ? Math.ceil(st.timeLeft) + '' : st.elapsed.toFixed(0),
      btnText: st.running ? '暂停' : (st.paused ? '继续训练' : (st.ended ? '再来一局' : '开始训练')),
      btnIcon: st.running ? '/assets/icons/pause-white.png' : '/assets/icons/play-white.png'
    }
    if (patch.timeLeft !== this.data.timeLeft || patch.score !== this.data.score ||
        patch.combo !== this.data.combo || patch.inZone !== this.data.inZone ||
        patch.angle !== this.data.angle || patch.state !== this.data.state ||
        patch.running !== this.data.running || patch.sensorHz !== this.data.sensorHz) {
      this.setData(patch)
    }
  },

  onEngineEvent(ev) {
    if (!ev) return
    if ((ev.type === 'start' || ev.type === 'reset') && this.data.outWarn) {
      this.setData({ outWarn: '' })
    }
    if (ev.type === 'end') {
      const stats = ev.stats || {}
      this.setData({ summary: stats, outWarn: '' })
      wx.showModal({
        title: '训练结束',
        content: '总分 ' + stats.score + ' 分\n命中 ' + stats.hits + ' 次\n最高连击 x' + stats.maxCombo + '\n保持在范围内 ' + stats.zoneRate + '%',
        confirmText: '再来一局',
        cancelText: '结束',
        success: (res) => {
          if (res.confirm && this.game) {
            this.setData({ summary: null })
            this.game.restart()
          }
        }
      })
      return
    }
    if (ev.type === 'out') {
      const now = Date.now()
      if (now - this.lastOutToast > 3000) {
        this.lastOutToast = now
        wx.showToast({ title: '请回到保持范围内', icon: 'none', duration: 1200 })
      }
      // 方向提示按屏幕里的小人给：小人偏左 → 向右，偏右 → 向左
      const cdir = ev.charDir || ev.dir
      const dirText = cdir === 'left'
        ? '请向右偏 →'
        : (cdir === 'right' ? '← 请向左偏' : '请回到中间')
      this.setData({ outWarn: dirText })
      return
    }
    if (ev.type === 'back') {
      this.setData({ outWarn: '' })
      return
    }
    if (ev.type === 'outHint') {
      const now = Date.now()
      if (now - this.lastOutToast > 3000) {
        this.lastOutToast = now
        wx.showToast({ title: '回到中间才会继续射击', icon: 'none', duration: 1800 })
      }
    }
  },

  // -------------------------------------------------------------- 开始 / 暂停
  onActionTap() {
    if (!this.game) return
    if (this.data.state === 'ended') {
      this.setData({ summary: null })
      this.game.restart()
      return
    }
    this.game.toggle()
    if (this.game.state === 'running') {
      // 首次开始时若没有传感器，给一句提示
      if (this.game.pose.stale) {
        wx.showToast({ title: '未连接传感器，可左右拖动画面模拟', icon: 'none', duration: 2000 })
      }
    }
  },

  onCanvasTap(e) {
    if (!this.game) return
    if (this.game.state !== 'running') {
      this.onActionTap()
      return
    }
    // 运行中点击画面不打断游戏
    void e
  },

  onRestart() {
    if (!this.game) return
    this.setData({ summary: null })
    this.game.restart()
  },

  // -------------------------------------------------------------- 触屏模拟
  onStageTouch(e) {
    if (!this.game || !this.game.pose.stale) return
    const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0])
    if (!t) return
    const rect = this.canvasRect || { left: 0, width: 375 }
    const x = (typeof t.x === 'number' ? t.x : t.clientX - rect.left)
    const ratio = Math.max(0, Math.min(1, x / (rect.width || 375)))
    const maxLean = Number(this.cfg.get('maxLeanDeg')) || 30
    this.game.setSimAngle((ratio * 2 - 1) * maxLean)
  },

  // -------------------------------------------------------------- 治疗师面板
  syncParams() {
    const cfg = this.cfg
    const list = []
    for (let i = 0; i < PANEL_KEYS.length; i++) {
      const key = PANEL_KEYS[i]
      const meta = SCHEMA[key]
      if (!meta) continue
      const value = cfg.get(key)
      list.push({
        key: key,
        label: meta.label,
        tip: meta.tip || '',
        min: meta.min,
        max: meta.max,
        step: meta.step,
        value: value,
        display: fmt(key, value)
      })
    }
    this.setData({
      params: list,
      showHitArea: !!cfg.get('showHitArea'),
      sfxOn: !!cfg.get('sfxOn'),
      bgmOn: !!cfg.get('bgmOn')
    })
  },

  scheduleParamsSync() {
    if (this.paramTimer) return
    this.paramTimer = setTimeout(() => {
      this.paramTimer = null
      this.syncParams()
    }, 90)
  },

  syncDifficulty() {
    const cfg = this.cfg
    const cur = cfg.get('difficulty')
    const list = cfg.listDifficulty().map((d) => ({
      key: d.key,
      label: d.label,
      active: d.key === cur
    }))
    const meta = cfg.getDifficulty()
    this.setData({
      difficulties: list,
      difficulty: cur,
      difficultyLabel: meta.label,
      scoreMul: meta.scoreMul
    })
  },

  /** 滑块拖动中实时写配置 → 引擎下一帧生效（无需重启） */
  onParamChanging(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    const value = Number(e.detail.value)
    // 直接走公开 API：命中范围 / 发射频率 / 保持范围 / 得分区间 都是实时参数
    if (key === 'hitRange') game.setHitArea(value)
    else if (key === 'fireRate') game.setFireRate(value)
    else if (key === 'keepRangeDeg') game.setKeepRange(value)
    else if (key === 'maxLeanDeg') game.setMaxLean(value)
    else if (key === 'comboWindowMs') game.setComboWindow(value)
    else if (key === 'scoreMin' || key === 'scoreMax') {
      const range = this.cfg.getScoreRange()
      const next = key === 'scoreMin' ? [value, range[1]] : [range[0], value]
      game.setScoreRange(next[0], next[1])
    } else this.cfg.set(key, value, 'ui:slider')
    this.scheduleParamsSync()
  },

  onDifficultyTap(e) {
    const level = e.currentTarget.dataset.key
    if (!level) return
    const res = game.setDifficulty(level)
    this.syncDifficulty()
    this.syncParams()
    wx.showToast({ title: '已切换：' + this.cfg.getDifficulty().label + '（得分系数 x' + res.scoreMul + '）', icon: 'none' })
  },

  onToggleHitArea(e) {
    const on = !!e.detail.value
    this.cfg.set('showHitArea', on, 'ui:switch')
    this.setData({ showHitArea: on })
    if (on && this.game) this.game.rangeFlash = 2
  },

  onToggleSfx(e) {
    const on = !!e.detail.value
    this.cfg.set('sfxOn', on, 'ui:switch')
    this.setData({ sfxOn: on })
  },

  onToggleBgm(e) {
    const on = !!e.detail.value
    this.cfg.set('bgmOn', on, 'ui:switch')
    this.setData({ bgmOn: on })
    if (this.game && this.game.audio) {
      if (on && this.game.state === 'running') this.game.audio.startBgm()
      else this.game.audio.stopBgm()
    }
  },

  onResetParams() {
    wx.showModal({
      title: '恢复默认参数',
      content: '将把全部治疗参数恢复为默认值（不影响历史成绩）。',
      success: (res) => {
        if (!res.confirm) return
        game.resetConfig()
        this.syncParams()
        this.syncDifficulty()
        wx.showToast({ title: '已恢复默认', icon: 'success' })
      }
    })
  },

  onTogglePanel() {
    const open = !this.data.panelOpen
    this.setData({ panelOpen: open })
    this.syncCanvasSize()
  }
})
