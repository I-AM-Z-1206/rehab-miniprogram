// calibrate.js —— 零点标定页：姿态虚拟零点（roll / pitch 两个全局偏移量）
//               静止 5 秒取平均作为零点，配 Roll / Pitch 实时曲线 + 二维分布图
//               注：加速度零点标定已按需求移除（只保留姿态零点）
const WitBle = require('../../utils/witble.js')
const speaker = require('../../utils/speaker.js')
const zero = require('../../utils/zero.js')
const { LineChart, ScatterChart } = require('../../utils/lightchart.js')

const ZERO_TIME = 5000 // 姿态虚拟零点采样时长（毫秒）：5 秒，取平均值
const VIEW_INTERVAL = 100 // 实时数值刷新节流(ms)
const RT_POINTS = 60 // 实时曲线保留点数（约 6 秒）
const LEGACY_ACCEL_KEY = 'zero_offset' // 旧版"加速度零点"的存储键，启动时清掉
const SCATTER_INTERVAL = 100 // 二维分布图重绘节流(ms)
// 晃动质量阈值（标准差，度）：超过这个幅度说明患者没稳住，标定出来的零点不可信
const SHAKE_WARN = 2.5
const SHAKE_GOOD = 1.2

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
    rawPitch: '--',

    // 二维分布（Roll / Pitch 采样点云）
    zeroCount: 0,
    zeroSpanR: '--',
    zeroSpanP: '--',
    zeroSd: '--',
    zeroQuality: '', // '' | good | warn
    zeroQualityText: '',

    // 「曲线与分布图」默认展开：标定时能直接看到点云长出来，
    // 患者自己就能判断手稳不稳，不用等标定完才知道
    showDetail: true
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
    // 图表默认展开，画布已经在节点树里，直接建
    this.ensureCharts()
  },

  /** 建图表。收起后再展开时 canvas 节点被重建过，需要重新绑一次 */
  ensureCharts() {
    if (this._chartsInited) return
    this._chartsInited = true
    if (wx.nextTick) wx.nextTick(() => this.initRealtimeCharts())
    else this._later(() => this.initRealtimeCharts(), 50)
  },

  toggleDetail() {
    const showDetail = !this.data.showDetail
    this.setData({ showDetail })
    // wx:if 收起时 canvas 节点被销毁，旧 chart 还拿着失效的画布，
    // 必须丢掉落重建，否则再展开后图表是死的（只有空白）
    this.rollChart = null
    this.pitchChart = null
    this.zeroChart = null
    this._chartsInited = false
    if (showDetail) this.ensureCharts()
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

  // 重新标定零点：把手动触发的这一刻起 5 秒内的 roll / pitch 取平均，作为新零点
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
    this.setData({
      zeroCalibrating: true,
      zeroRemain: total,
      zeroCount: 0,
      zeroSpanR: '--',
      zeroSpanP: '--',
      zeroSd: '--',
      zeroQuality: '',
      zeroQualityText: ''
    })
    if (this.zeroChart) this.zeroChart.clear()
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

      // 标定质量：晃动幅度太大的零点不能用，直接提示重做
      const quality = that.zeroQuality || ''
      if (quality === 'warn') {
        wx.showToast({ title: '晃动偏大，建议重标定', icon: 'none', duration: 2500 })
        speaker.speak('晃动偏大，建议重新标定')
      } else {
        wx.showToast({ title: '零点已标定', icon: 'success' })
        speaker.speak('零点标定完成')
      }
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
    this.pushZeroScatter()

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

  // ---------- 姿态实时曲线（Roll / Pitch） + 二维分布 ----------
  initRealtimeCharts() {
    this.createChart('chartRoll', {
      series: [{ color: '#0f9c8c', fill: 'rgba(15, 156, 140, 0.08)' }],
      unit: '°'
    }).then((c) => { this.rollChart = c; this.drawRealtime() })
    this.createChart('chartPitch', {
      series: [{ color: '#2f7bd6', fill: 'rgba(47, 123, 214, 0.08)' }],
      unit: '°'
    }).then((c) => { this.pitchChart = c; this.drawRealtime() })
    this.createScatter('chartZero', { unit: '°', minSpan: 2 })
      .then((c) => {
        this.zeroChart = c
        // 收起重开时点云要补画回来，否则只剩空坐标系
        this.lastScatterAt = 0
        this.pushZeroScatter()
      })
  },

  /** 取 canvas 节点（节点未就绪或尺寸还是 0 时重试），拿到 { node, width, height } */
  pickCanvas(id, retry) {
    return new Promise((resolve) => {
      wx.createSelectorQuery().in(this).select('#' + id).fields({ node: true, size: true }).exec((res) => {
        const info = res && res[0]
        const hasNode = !!(info && info.node)
        // 节点在、但量出来 0×0，说明布局还没完成。此时建图会得到一张永远空白的画布，
        // 所以继续等，不能直接拿这个尺寸去建。
        const sized = hasNode && info.width > 0 && info.height > 0
        if (!sized) {
          const n = retry || 0
          if (n < 4) {
            this._later(() => {
              this.pickCanvas(id, n + 1).then(resolve)
            }, 120)
          } else {
            console.warn('[calibrate] 画布 #' + id + (hasNode ? ' 尺寸为 0' : ' 未找到'))
            resolve(hasNode ? info : null)
          }
          return
        }
        resolve(info)
      })
    })
  },

  /** 取 canvas 节点并创建轻量折线图 */
  createChart(id, options, retry) {
    return this.pickCanvas(id, retry).then((info) => {
      if (!info) return null
      const chart = new LineChart(info.node, options)
      chart.setSize(info.width, info.height, this.getDpr())
      return chart
    })
  },

  /** 取 canvas 节点并创建二维分布图 */
  createScatter(id, options, retry) {
    return this.pickCanvas(id, retry).then((info) => {
      if (!info) return null
      const chart = new ScatterChart(info.node, options)
      chart.setSize(info.width, info.height, this.getDpr())
      return chart
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

  // ---------- 二维分布（Roll / Pitch 点云 + 抖动范围） ----------
  /**
   * 把标定中的原始采样喂给散点图。相比「画完再给结果」，这里每 100ms 重绘一次，
   * 患者能看到点云逐渐长出来 —— 他自己的稳定性是可见的，不是标定完才知道。
   */
  pushZeroScatter() {
    if (!this.zeroChart || !this.zeroSamples) return
    const now = Date.now()
    if (now - (this.lastScatterAt || 0) < SCATTER_INTERVAL) return
    this.lastScatterAt = now

    const pts = []
    for (let i = 0; i < this.zeroSamples.length; i++) {
      const s = this.zeroSamples[i]
      if (s && typeof s.roll === 'number' && typeof s.pitch === 'number') {
        pts.push({ r: s.roll, p: s.pitch })
      }
    }
    this.zeroChart.setData(pts)

    const st = this.zeroChart.stats()
    if (!st.n) return
    const sd = st.maxShake || 0
    let quality = 'good'
    let qualityText = '保持得很好'
    if (sd > SHAKE_WARN) {
      quality = 'warn'
      qualityText = '晃动偏大 · 建议重做'
    } else if (sd > SHAKE_GOOD) {
      quality = 'warn'
      qualityText = '略有晃动 · 可用'
    }

    this.setData({
      zeroCount: st.n,
      zeroSpanR: st.spreadR.toFixed(2),
      zeroSpanP: st.spreadP.toFixed(2),
      zeroSd: sd.toFixed(2),
      zeroQuality: quality,
      zeroQualityText: qualityText
    })
  },

  // 标定结果图表（加速度）已随功能移除
})
