// calibrate.js —— 零点标定页：姿态虚拟零点（roll / pitch 两个全局偏移量）
//               静止 3 秒取平均作为零点，配 Roll / Pitch 实时曲线
//               注：加速度零点标定已按需求移除（只保留姿态零点）
const WitBle = require('../../utils/witble.js')
const speaker = require('../../utils/speaker.js')
const zero = require('../../utils/zero.js')
const { LineChart } = require('../../utils/lightchart.js')

const ZERO_TIME = 3000 // 姿态虚拟零点采样时长（毫秒）：3 秒，取平均值
const VIEW_INTERVAL = 100 // 实时数值刷新节流(ms)
const RT_POINTS = 60 // 实时曲线保留点数（约 6 秒）
const LEGACY_ACCEL_KEY = 'zero_offset' // 旧版"加速度零点"的存储键，启动时清掉

Page({
  // 定时器统一管理：页面卸载时全部清掉
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
    // 连接
    status: 'idle', // idle / scanning / connecting / connected / disconnected
    statusText: '未连接',
    devices: [],

    // 姿态虚拟零点（全局两个变量：zeroRoll / zeroPitch）
    zeroRoll: '0.00',
    zeroPitch: '0.00',
    zeroSet: false,
    zeroCalibrating: false,
    zeroRemain: 0,
    curRoll: '--',
    curPitch: '--',
    rawRoll: '--',
    rawPitch: '--'
  },

  onLoad() {
    this.ble = WitBle.getShared()
    // 旧版本存过"加速度零点"，现在不用了，顺手清掉
    try { wx.removeStorageSync(LEGACY_ACCEL_KEY) } catch (e) { /* 忽略 */ }
    this.zeroSamples = null
    this.lastView = 0
    this.rtBuf = []
  },

  onShow() {
    this.attach()
    this.refreshZero()
    if (this.ble.connectedId) {
      this.setData({ status: 'connected', statusText: '已连接 · 接收数据中' })
    }
  },

  // 视图就绪后再取 canvas 节点（此时宽高才有效）
  onReady() {
    if (wx.nextTick) wx.nextTick(() => this.initRealtimeCharts())
    else this._later(() => this.initRealtimeCharts(), 50)
  },

  onUnload() {
    speaker.stop()
    this._clearTimers()
    if (this.zeroTimer) { clearInterval(this.zeroTimer); this.zeroTimer = null }
    this.zeroSamples = null
    WitBle.detach(this.ble)
  },

  attach() {
    const that = this
    this.ble.handlers = {
      onData: (d) => that.onData(d),
      onReady: () => {
        that.setData({ status: 'connected', statusText: '已连接 · 接收数据中' })
        speaker.speak('蓝牙连接成功，正在接收传感器数据')
      },
      onError: (msg) => {
        that.setData({ status: 'disconnected', statusText: msg || '连接失败' })
        speaker.speak('蓝牙连接失败，请确认传感器已开机并靠近手机')
      },
      onDisconnected: () => {
        that.setData({ status: 'disconnected', statusText: '连接已断开' })
        speaker.speak('蓝牙连接已断开，请重新连接')
      },
      onLog: () => {}
    }
  },

  // ---------- 扫描 / 连接 ----------
  startScan() {
    if (this.data.status === 'scanning') return
    this.setData({ devices: [], status: 'scanning', statusText: '扫描中…' })
    speaker.speak('开始扫描蓝牙设备，请稍候')
    const that = this
    this.ble.startScan(
      (devices) => that.setData({ devices }),
      () => {
        that.setData({ status: 'idle', statusText: '蓝牙不可用' })
        speaker.speak('蓝牙不可用，请确认手机蓝牙已开启')
        wx.showModal({
          title: '蓝牙不可用',
          showCancel: false,
          content: '请确认：1) 手机蓝牙已开启；2) 用真机运行（模拟器不支持 BLE）；3) 已授权定位权限。'
        })
      }
    )
  },

  onStopScan() {
    this.ble.stopScan()
    this.setData({ status: 'idle', statusText: '已停止扫描' })
  },

  onPickDevice(e) {
    if (this.data.status === 'connected' || this.data.status === 'connecting') return
    const deviceId = e.currentTarget.dataset.id
    if (!deviceId) return
    this.ble.stopScan()
    this.setData({ status: 'connecting', statusText: '连接中…' })
    speaker.speak('正在连接设备，请稍候')
    this.ble.connect(deviceId, this.ble.handlers)
  },

  onDisconnectTap() {
    speaker.speak('已断开蓝牙连接')
    this.ble.disconnect(false)
    this.setData({ status: 'disconnected', statusText: '已断开', devices: [] })
  },

  // ---------- 姿态虚拟零点（两个全局变量：zeroRoll / zeroPitch） ----------
  refreshZero() {
    const z = zero.get()
    this.setData({
      zeroRoll: (z.roll >= 0 ? '+' : '') + z.roll.toFixed(2),
      zeroPitch: (z.pitch >= 0 ? '+' : '') + z.pitch.toFixed(2),
      zeroSet: !!z.set
    })
  },

  // 重新标定零点：把手动触发的这一刻起 3 秒内的 roll / pitch 取平均，作为新零点
  onZeroCalibrate() {
    if (!this.ble.connectedId) {
      speaker.speak('请先连接传感器')
      wx.showToast({ title: '请先连接传感器', icon: 'none' })
      return
    }
    if (this.data.zeroCalibrating) return

    const that = this
    const startAt = Date.now()
    const total = Math.ceil(ZERO_TIME / 1000)
    this.zeroSamples = []
    this.setData({ zeroCalibrating: true, zeroRemain: total })
    speaker.speak('请保持静止，正在标定零点')

    if (this.zeroTimer) clearInterval(this.zeroTimer)
    this.zeroTimer = setInterval(() => {
      const left = Math.max(0, total - Math.floor((Date.now() - startAt) / 1000))
      if (left !== that.data.zeroRemain) that.setData({ zeroRemain: left })
    }, 200)

    this._later(() => {
      if (that.zeroTimer) { clearInterval(that.zeroTimer); that.zeroTimer = null }
      const samples = that.zeroSamples || []
      that.zeroSamples = null
      const z = zero.setFromSamples(samples)
      that.setData({ zeroCalibrating: false, zeroRemain: 0 })
      that.refreshZero()
      if (!z) {
        wx.showToast({ title: '没收到姿态数据', icon: 'none' })
        return
      }
      wx.showToast({ title: '零点已标定', icon: 'success' })
      speaker.speak('零点标定完成')
      wx.vibrateShort({ type: 'medium' })
    }, ZERO_TIME)
  },

  // 清除零点：恢复传感器原始角度
  onZeroClear() {
    zero.reset()
    this.refreshZero()
    wx.showToast({ title: '零点已清除', icon: 'none' })
    speaker.speak('零点已清除，使用传感器原始角度')
  },

  onData(d) {
    // 姿态实时值（roll / pitch 已在蓝牙层叠加过全局零点，原始值在 rawRoll / rawPitch）
    if (typeof d.roll === 'number' || typeof d.rawRoll === 'number') {
      this.pose = {
        roll: d.roll,
        pitch: d.pitch,
        rawRoll: d.rawRoll,
        rawPitch: d.rawPitch
      }
    }
    // 虚拟零点采样：用传感器原始角度，多次标定不会互相累加
    if (this.zeroSamples && (typeof d.rawRoll === 'number' || typeof d.rawPitch === 'number')) {
      this.zeroSamples.push({ roll: d.rawRoll, pitch: d.rawPitch })
    }

    const tView = Date.now()
    if (tView - this.lastView >= VIEW_INTERVAL) {
      this.lastView = tView
      const p = this.pose
      if (p) {
        const fmt = (v) => (typeof v === 'number' ? v.toFixed(2) : '--')
        this.setData({
          curRoll: fmt(p.roll),
          curPitch: fmt(p.pitch),
          rawRoll: fmt(p.rawRoll),
          rawPitch: fmt(p.rawPitch)
        })
        this.pushPosePoint(p.roll, p.pitch)
      }
    }
  },

  // ---------- 姿态实时曲线（Roll / Pitch） ----------
  initRealtimeCharts() {
    this.createChart('chartRoll', {
      series: [{ color: '#0f9c8c', fill: 'rgba(15, 156, 140, 0.08)' }],
      unit: '°'
    }).then((c) => { this.rollChart = c; this.drawRealtime() })
    this.createChart('chartPitch', {
      series: [{ color: '#2f7bd6', fill: 'rgba(47, 123, 214, 0.08)' }],
      unit: '°'
    }).then((c) => { this.pitchChart = c; this.drawRealtime() })
  },

  /** 取 canvas 节点并创建轻量折线图（节点未就绪时重试） */
  createChart(id, options, retry) {
    return new Promise((resolve) => {
      wx.createSelectorQuery().in(this).select('#' + id).fields({ node: true, size: true }).exec((res) => {
        const info = res && res[0]
        if (!info || !info.node) {
          if ((retry || 0) < 3) {
            this._later(() => {
              this.createChart(id, options, (retry || 0) + 1).then(resolve)
            }, 200)
          } else {
            console.warn('[calibrate] 找不到画布 #' + id)
            resolve(null)
          }
          return
        }
        const chart = new LineChart(info.node, options)
        chart.setSize(info.width, info.height, this.getDpr())
        resolve(chart)
      })
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

  // 实时曲线：缓冲最近 60 点，100ms 节流重绘
  pushPosePoint(roll, pitch) {
    if (typeof roll !== 'number' && typeof pitch !== 'number') return
    if (!this.rtBuf) this.rtBuf = []
    this.rtBuf.push({ t: Date.now(), roll: roll, pitch: pitch })
    while (this.rtBuf.length > RT_POINTS) this.rtBuf.shift()

    const now = Date.now()
    if (now - (this.lastChartAt || 0) < 100) return
    this.lastChartAt = now
    this.drawRealtime()
  },

  drawRealtime() {
    if (!this.rtBuf || !this.rtBuf.length) return
    const t0 = this.rtBuf[0].t
    const times = []
    const rs = []
    const ps = []
    this.rtBuf.forEach((pt) => {
      times.push(((pt.t - t0) / 1000).toFixed(1))
      rs.push(typeof pt.roll === 'number' ? Math.round(pt.roll * 10) / 10 : null)
      ps.push(typeof pt.pitch === 'number' ? Math.round(pt.pitch * 10) / 10 : null)
    })
    if (this.rollChart) this.rollChart.setData(times, [rs])
    if (this.pitchChart) this.pitchChart.setData(times, [ps])
  },

  // 标定结果图表（加速度）已随功能移除
})
