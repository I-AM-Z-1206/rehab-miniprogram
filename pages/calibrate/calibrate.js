// calibrate.js —— 零点标定页：静止 5 秒采样加速度，算出零点偏置，并用 ECharts 绘制曲线
const WitBle = require('../../utils/witble.js')
const speaker = require('../../utils/speaker.js')
const echarts = require('../../components/ec-canvas/echarts.js')

const CAL_TIME = 5000 // 标定时长（毫秒）：5 秒
const G = 9.81 // 重力加速度，用于把 g 换算成 m/s² 再做速度积分
const KEY_ZERO = 'zero_offset'

Page({
  data: {
    // 连接
    status: 'idle', // idle / scanning / connecting / connected / disconnected
    statusText: '未连接',
    devices: [],

    // 标定
    phase: 'idle', // idle / calibrating / done
    remain: 5, // 剩余秒数
    sampleCount: 0,

    // 结果（零点偏置）
    axOff: '--',
    ayOff: '--',
    azOff: '--',

    // 图表（懒加载，标定完成后手动 init）
    ecAx: { lazyLoad: true },
    ecAy: { lazyLoad: true },
    ecVel: { lazyLoad: true }
  },

  onLoad() {
    this.ble = WitBle.getShared()
  },

  onShow() {
    this.attach()
    if (this.ble.connectedId) {
      this.setData({ status: 'connected', statusText: '已连接 · 接收数据中' })
    }
  },

  onUnload() {
    speaker.stop()
    if (this.calTimer) clearInterval(this.calTimer)
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

  // ---------- 标定 ----------
  onStartCalibrate() {
    if (this.data.phase === 'calibrating') return
    if (!this.ble.connectedId) {
      speaker.speak('请先连接传感器')
      wx.showToast({ title: '请先连接传感器', icon: 'none' })
      return
    }
    this.samples = []
    this.startAt = Date.now()
    this.lastT = 0
    this.vx = 0
    this.vy = 0
    if (this.calTimer) clearInterval(this.calTimer)

    this.setData({
      phase: 'calibrating',
      remain: 5,
      sampleCount: 0,
      axOff: '--',
      ayOff: '--',
      azOff: '--'
    })
    speaker.speak('请保持静止，正在标定')

    this.calTimer = setInterval(() => {
      const elapsed = Date.now() - this.startAt
      const remain = Math.max(0, Math.ceil((CAL_TIME - elapsed) / 1000))
      this.setData({ remain })
      if (elapsed >= CAL_TIME) this.finishCalibrate()
    }, 100)
  },

  onData(d) {
    if (this.data.phase !== 'calibrating') return
    if (typeof d.ax !== 'number' && typeof d.ay !== 'number') return

    const now = Date.now()
    const t = (now - this.startAt) / 1000
    const dt = this.lastT ? (now - this.lastT) / 1000 : 0
    this.lastT = now

    // 速度积分：对加速度（m/s²）按时间累加，得到标定期间的漂移速度
    if (dt > 0 && dt < 0.5) {
      this.vx += (d.ax || 0) * G * dt
      this.vy += (d.ay || 0) * G * dt
    }

    this.samples.push({
      t,
      ax: d.ax || 0,
      ay: d.ay || 0,
      az: d.az || 0,
      vx: this.vx,
      vy: this.vy
    })
    this.setData({ sampleCount: this.samples.length })
  },

  finishCalibrate() {
    if (this.calTimer) { clearInterval(this.calTimer); this.calTimer = null }
    if (!this.samples || this.samples.length < 10) {
      this.setData({ phase: 'idle' })
      wx.showToast({ title: '数据不足，请检查连接', icon: 'none' })
      return
    }

    // 零点偏置 = 静止时加速度均值；Z 轴减去 1g 重力
    let sx = 0, sy = 0, sz = 0, n = 0
    this.samples.forEach(s => { sx += s.ax; sy += s.ay; sz += s.az; n++ })
    const axOff = sx / n
    const ayOff = sy / n
    const azOff = (sz / n) - 1

    try { wx.setStorageSync(KEY_ZERO, { ax: axOff, ay: ayOff, az: azOff }) } catch (e) { /* 忽略 */ }

    speaker.speak('零点标定完成')

    // 先渲染出图表容器（wx:if 展开），再初始化 ECharts，否则 selectComponent 取不到组件
    this.setData({
      phase: 'done',
      axOff: axOff.toFixed(4),
      ayOff: ayOff.toFixed(4),
      azOff: azOff.toFixed(4)
    }, () => this.renderCharts())
  },

  // ---------- 图表 ----------
  renderCharts() {
    const s = this.samples
    const times = s.map(x => Math.round(x.t * 100) / 100)
    const ax = s.map(x => Math.round(x.ax * 10000) / 10000)
    const ay = s.map(x => Math.round(x.ay * 10000) / 10000)
    const vx = s.map(x => Math.round(x.vx * 10000) / 10000)
    const vy = s.map(x => Math.round(x.vy * 10000) / 10000)

    this.initChart('ecAx', makeLineOption(times, [
      { name: '加速度X', data: ax, color: '#0f9c8c' }
    ], 'g', true))
    this.initChart('ecAy', makeLineOption(times, [
      { name: '加速度Y', data: ay, color: '#2f7bd6' }
    ], 'g', true))
    this.initChart('ecVel', makeLineOption(times, [
      { name: '速度X', data: vx, color: '#0f9c8c' },
      { name: '速度Y', data: vy, color: '#2f7bd6' }
    ], 'm/s', false))
  },

  initChart(ecId, option) {
    const comp = this.selectComponent('#' + ecId)
    if (!comp) return
    comp.init((canvas, width, height, dpr) => {
      const chart = echarts.init(canvas, null, {
        width: width,
        height: height,
        devicePixelRatio: dpr
      })
      canvas.setChart(chart)
      chart.setOption(option)
      return chart
    })
  }
})

// 生成折线图 option（时间轴 + 一条/多条曲线 + 可选零点参考线）
function makeLineOption(times, seriesArr, unit, showZeroLine) {
  const series = seriesArr.map(s => ({
    name: s.name,
    type: 'line',
    showSymbol: false,
    smooth: false,
    data: s.data,
    lineStyle: { width: 2, color: s.color },
    itemStyle: { color: s.color },
    markLine: showZeroLine ? {
      silent: true,
      symbol: 'none',
      label: { show: false },
      lineStyle: { color: '#ff6b6b', type: 'dashed', width: 1 },
      data: [{ yAxis: 0 }]
    } : undefined
  }))

  return {
    animation: false,
    grid: { left: 10, right: 14, top: 16, bottom: 6, containLabel: true },
    tooltip: { trigger: 'axis', confine: true },
    xAxis: {
      type: 'category',
      data: times,
      boundaryGap: false,
      name: 's',
      nameLocation: 'end',
      nameTextStyle: { color: '#999' },
      axisLine: { lineStyle: { color: '#d5d7dc' } },
      axisLabel: { color: '#999', fontSize: 10 },
      axisTick: { show: false },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      scale: true,
      name: unit,
      nameTextStyle: { color: '#999' },
      axisLine: { show: false },
      axisLabel: { color: '#999', fontSize: 10 },
      splitLine: { lineStyle: { color: '#eef0f3' } }
    },
    series
  }
}
