// sensor.js
Page({
  data: {
    running: false,
    x: '0.000',
    y: '0.000',
    z: '0.000',
    interval: 'normal', // normal / ui / game
    frequencyList: [
      { value: 'normal', label: '正常' },
      { value: 'ui', label: 'UI' },
      { value: 'game', label: '游戏' }
    ],
    supported: true
  },

  // 非渲染状态（不需要 setData，避免频繁渲染）
  starting: false, // 异步启动中标记，防止连点重复 start
  retryCount: 0, // "has enable" 残留状态自动重试次数
  wasRunningBeforeHide: false, // 切后台前是否在运行，用于回前台自动恢复
  listenerBound: false, // 监听器只绑定一次，防止重复注册

  onLoad() {
    // 检查当前设备是否支持加速度传感器（wx.getDeviceInfo 为同步 API，直接返回结果）
    try {
      const info = wx.getDeviceInfo()
      if (info && info.enableAccelerometer === false) {
        this.setData({ supported: false })
        wx.showToast({ title: '当前设备不支持加速度传感器', icon: 'none' })
      }
    } catch (e) {
      // 获取失败不阻塞功能，交由 startAccelerometer 的 fail 处理
    }
    this.bindListener()
  },

  onShow() {
    // 从后台切回时，若之前正在采集则自动恢复
    if (this.wasRunningBeforeHide) {
      this.wasRunningBeforeHide = false
      this.start()
    }
  },

  onHide() {
    // 切后台：记录状态并关闭传感器，避免原生层残留运行
    this.wasRunningBeforeHide = this.data.running
    this.stop()
  },

  onUnload() {
    // 页面卸载【重点】：彻底关闭传感器并解绑监听
    this.wasRunningBeforeHide = false
    this.stop()
    this.unbindListener()
  },

  // ---------- 监听器管理（只绑定一次，不随 start/stop 反复注册解绑） ----------
  bindListener() {
    if (this.listenerBound) return
    const that = this
    wx.onAccelerometerChange(function (res) {
      that.setData({
        x: res.x.toFixed(3),
        y: res.y.toFixed(3),
        z: res.z.toFixed(3)
      })
    })
    this.listenerBound = true
  },

  unbindListener() {
    if (!this.listenerBound) return
    wx.offAccelerometerChange()
    this.listenerBound = false
  },

  // ---------- 开启 / 停止 ----------
  toggle() {
    if (this.data.running || this.starting) {
      this.stop()
    } else {
      this.start()
    }
  },

  start() {
    // 状态保护：已开启或正在异步启动中，直接返回，杜绝重复 start
    if (this.data.running || this.starting) return
    if (!this.data.supported) {
      wx.showToast({ title: '当前设备不支持加速度传感器', icon: 'none' })
      return
    }
    this.starting = true
    this.doStart()
  },

  doStart() {
    const that = this
    wx.startAccelerometer({
      interval: this.data.interval,
      success: () => {
        that.retryCount = 0
        that.starting = false
        that.setData({ running: true })
      },
      fail: (err) => {
        const errMsg = err.errMsg || ''
        // 原生层传感器残留开启状态：先强制停止，再重试一次（最多重试 1 次）
        if (errMsg.indexOf('has enable') !== -1 && that.retryCount < 1) {
          that.retryCount++
          wx.stopAccelerometer({
            complete: () => that.doStart()
          })
          return
        }
        that.starting = false
        that.retryCount = 0
        wx.showModal({
          title: '启动失败',
          showCancel: false,
          content: 'errMsg: ' + (errMsg || '无') + '\nerrno: ' + (err.errno !== undefined ? err.errno : '无')
        })
        console.error('startAccelerometer fail:', err)
      }
    })
  },

  stop() {
    // 无论 running 标记如何都执行 stop，确保清掉原生层可能的残留状态（stop 可安全重复调用）
    this.starting = false
    this.retryCount = 0
    wx.stopAccelerometer({
      complete: () => {
        this.setData({ running: false })
      }
    })
  },

  // ---------- 切换采集频率 ----------
  onFrequencyChange(e) {
    const interval = e.currentTarget.dataset.freq
    if (interval === this.data.interval) return
    const wasRunning = this.data.running
    this.stop()
    this.setData({ interval })
    if (wasRunning) {
      // 等停止完成后以新频率重新启动
      setTimeout(() => this.start(), 300)
    }
  }
})
