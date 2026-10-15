// rehab.js —— 康复训练：3D 小人姿态跟随 · 胸前佩戴左右侧倾检测
// 特点：Three.js 真 3D 小人、roll/pitch/yaw 三轴实时旋转、航空姿态仪、大字号、全程语音
const WitBle = require('../../utils/witble.js')
const speaker = require('../../utils/speaker.js')
const { selectTab, pushRehabLog } = require('../../utils/tab.js')
const man3d = require('../../utils/man3d.js')

const STORE_COINS = 'rehab_coins'
const STORE_BEST = 'rehab_best'
const DEFAULT_GOAL = 10
const BACK_TOL = 5 // 回到坐直的判定容差(度)
const VIEW_INTERVAL = 60 // UI 刷新间隔(ms)，避免频繁 setData
const BASE_SAMPLES = 800 // 标定采样时长(ms)

// 中文数字：便于语音包直接播报
const TARGETS = [
  { value: 15, label: '15°', voice: '目标角度已设为十五度' },
  { value: 20, label: '20°', voice: '目标角度已设为二十度' },
  { value: 25, label: '25°', voice: '目标角度已设为二十五度' },
  { value: 30, label: '30°', voice: '目标角度已设为三十度' }
]

const AXES = [
  { value: 'roll', label: '左右侧倾', voice: '已切换为左右倾斜检测' },
  { value: 'pitch', label: '前后俯仰', voice: '已切换为前后倾斜检测' }
]

function wrap180(v) {
  let x = v % 360
  if (x > 180) x -= 360
  if (x < -180) x += 360
  return x
}

function clamp(v, min, max) {
  return v < min ? min : (v > max ? max : v)
}

// 当前时间 yyyy-MM-dd HH:mm
function formatNow() {
  const d = new Date()
  const p = (n) => (n < 10 ? '0' + n : '' + n)
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
}

Page({
  data: {
    // 连接
    status: 'idle', // idle / scanning / connecting / connected
    dockText: '连接传感器',
    devices: [],
    showDevices: false,

    // 训练
    axis: 'roll',
    axisList: AXES,
    targets: TARGETS,
    targetAngle: 20,
    dirSign: 1, // 方向取反（设备佩戴朝向不同时使用）
    hasBase: false,
    phase: 'idle', // idle / left / leftOk / right / rightOk / done
    targetDir: '',
    tip: '请先将传感器佩戴在胸前',
    tipType: 'normal',
    leanText: '0',
    hudRotate: 0,
    hudShift: 0,

    // 数据
    coins: 0,
    reps: 0,
    combo: 0,
    best: 0,
    goal: DEFAULT_GOAL,
    showGain: false,
    gainText: ''
  },

  onLoad() {
    this.ble = WitBle.getShared() // 全局单例：跨页面保持连接
    this.baseRoll = 0
    this.basePitch = 0
    this.hasBase = false
    this.lastDir = 'left'
    this.lastView = 0
    this.calibrating = false
    this.calSamples = []
    this.manInited = false

    let coins = 0
    let best = 0
    try {
      coins = wx.getStorageSync(STORE_COINS) || 0
      best = wx.getStorageSync(STORE_BEST) || 0
    } catch (e) { /* 忽略 */ }
    this.setData({ coins, best })
  },

  onReady() {
    this.initMan3d()
  },

  // 初始化 3D 小人 canvas：canvas 缓冲区必须匹配舞台实际宽高比，否则画面拉伸变形
  initMan3d() {
    const that = this
    wx.createSelectorQuery()
      .select('#webgl')
      .node()
      .exec((res) => {
        const canvas = res && res[0] && res[0].node
        if (!canvas) {
          console.error('[rehab] webgl canvas 未找到')
          return
        }
        const info = wx.getWindowInfo()
        const dpr = info.pixelRatio || 2
        // 延迟一帧量取舞台实际布局尺寸
        wx.createSelectorQuery()
          .select('.stage')
          .boundingClientRect((rect) => {
            const w = Math.round((rect && rect.width ? rect.width : info.windowWidth) * dpr)
            const h = Math.round((rect && rect.height ? rect.height : info.windowWidth * 1.15) * dpr)
            try {
              canvas.width = w
              canvas.height = h
            } catch (e) { /* 忽略 */ }
            man3d.init(canvas)
            that.manInited = true
          })
          .exec()
      })
  },

  onShow() {
    selectTab(this, 1) // 康复是第 2 个 tab
    this.attachHandlers()
    // 回到本页时恢复连接态（连接不会被自动断开）
    if (this.ble.connectedId) {
      this.setData({
        status: 'connected',
        dockText: '已连接 · 传感器',
        tip: this.hasBase ? this.data.tip : '请佩戴好后点「设定基准」'
      })
    } else if (!this.hasBase) {
      // 未连接时才提示佩戴，避免训练途中切回页面反复播报
      this.setData({ tip: '请先将传感器佩戴在胸前' })
      speaker.speak('请先将传感器佩戴在胸前')
    }
  },

  onHide() {
    speaker.stop()
  },

  // 离开页面：释放 3D 资源 + 解绑回调（绝不主动断开蓝牙）
  onUnload() {
    speaker.stop()
    WitBle.detach(this.ble)
    man3d.dispose()
    this.manInited = false
  },

  attachHandlers() {
    const that = this
    this.ble.handlers = {
      onData: (d) => that.onFrame(d),
      onReady: () => {
        that.setData({
          status: 'connected',
          dockText: '已连接 · 传感器',
          showDevices: false
        })
        speaker.speak('蓝牙连接成功，请佩戴好后点击设定基准')
      },
      onError: (msg) => {
        that.setData({ status: 'idle', dockText: '重新连接', showDevices: false })
        speaker.speak('连接失败，请确认传感器已开机后重试')
        wx.showToast({ title: msg || '连接失败', icon: 'none' })
      },
      onDisconnected: () => {
        that.setData({
          status: 'idle',
          dockText: '重新连接',
          phase: 'idle',
          targetDir: '',
          tip: '蓝牙已断开，请重新连接',
          tipType: 'warn'
        })
        that.hasBase = false
        speaker.speak('蓝牙连接已断开，请重新连接')
      },
      onLog: () => {}
    }
  },

  // ---------- 连接 ----------
  onDockTap() {
    if (this.data.status === 'connected') return
    if (this.data.status === 'scanning') {
      this.stopScan()
      return
    }
    this.startScan()
  },

  startScan() {
    const that = this
    this.setData({ status: 'scanning', dockText: '停止扫描', devices: [], showDevices: true })
    speaker.speak('开始扫描蓝牙设备，请稍候')
    this.ble.stopScan()
    this.ble.startScan(
      (devices) => that.setData({ devices }),
      (err) => {
        that.setData({ status: 'idle', dockText: '连接传感器', showDevices: false })
        speaker.speak('蓝牙不可用，请确认手机蓝牙已开启')
        wx.showModal({
          title: '蓝牙不可用',
          showCancel: false,
          content: '请确认：1) 手机蓝牙已开启；2) 用真机运行；3) 已授权定位权限。'
        })
      }
    )
  },

  stopScan() {
    this.ble.stopScan()
    const connected = !!this.ble.connectedId
    this.setData({
      status: connected ? 'connected' : 'idle',
      dockText: connected ? '已连接 · 传感器' : '连接传感器',
      showDevices: false
    })
  },

  onCloseDevices() {
    this.setData({ showDevices: false })
  },

  onPickDevice(e) {
    const deviceId = e.currentTarget.dataset.id
    if (!deviceId) return
    const that = this
    this.ble.stopScan()
    this.setData({ status: 'connecting', dockText: '连接中…', showDevices: false })
    speaker.speak('正在连接设备，请稍候')
    this.ble.connect(deviceId, this.ble.handlers)
  },

  onDisconnectTap() {
    speaker.speak('已断开蓝牙连接')
    this.ble.disconnect(false)
    this.hasBase = false
    this.setData({
      status: 'idle',
      dockText: '连接传感器',
      phase: 'idle',
      targetDir: '',
      hasBase: false,
      tip: '请连接传感器',
      tipType: 'warn'
    })
  },

  // ---------- 设置 ----------
  onAxisChange(e) {
    const axis = e.currentTarget.dataset.axis
    if (axis === this.data.axis) return
    const item = AXES.filter((a) => a.value === axis)[0]
    this.hasBase = false
    this.setData({
      axis,
      hasBase: false,
      phase: 'idle',
      targetDir: '',
      tip: '方向已改，请重新设定基准',
      tipType: 'warn'
    })
    speaker.speak(item ? item.voice : '已切换检测方向')
  },

  onFlipDir() {
    this.setData({ dirSign: -this.data.dirSign })
    speaker.speak('已切换检测方向')
  },

  onTargetChange(e) {
    const target = Number(e.currentTarget.dataset.target)
    const item = TARGETS.filter((t) => t.value === target)[0]
    this.setData({ targetAngle: target })
    speaker.speak(item ? item.voice : '目标角度已设为二十度')
  },

  // ---------- 标定 ----------
  onCalibrate() {
    if (!this.ble.connectedId) {
      speaker.speak('请先连接传感器')
      wx.showToast({ title: '请先连接传感器', icon: 'none' })
      return
    }
    speaker.speak('请坐直不动，马上为你标定基准')
    if (this.data.phase === 'done') this.setData({ reps: 0, combo: 0 })
    this.calibrating = true
    this.calSamples = []
    this.setData({ tip: '正在标定，请保持坐直…', tipType: 'normal' })
    setTimeout(() => this.finishCalibrate(), BASE_SAMPLES)
  },

  finishCalibrate() {
    this.calibrating = false
    if (!this.calSamples.length) {
      wx.showToast({ title: '没收到姿态数据', icon: 'none' })
      this.setData({ tip: '没收到数据，请检查连接', tipType: 'warn' })
      return
    }
    let sumRoll = 0
    let sumPitch = 0
    let n = 0
    this.calSamples.forEach((s) => {
      if (typeof s.roll === 'number') sumRoll += s.roll
      if (typeof s.pitch === 'number') sumPitch += s.pitch
      n++
    })
    this.baseRoll = n ? sumRoll / n : 0
    this.basePitch = n ? sumPitch / n : 0
    this.hasBase = true
    this.lastDir = 'left'
    this.setData({
      hasBase: true,
      phase: 'left',
      targetDir: 'left',
      tip: '请向左侧倾斜身体',
      tipType: 'normal'
    })
    speaker.speak('标定完成，请向左侧倾斜身体')
  },

  // ---------- 数据帧 ----------
  onFrame(d) {
    // 标定采样：同时记录 roll 和 pitch，修复原来只记一个轴的 bug
    if (this.calibrating) {
      if (typeof d.roll === 'number' || typeof d.pitch === 'number') {
        this.calSamples.push({ roll: d.roll, pitch: d.pitch })
      }
      return
    }

    const dirSign = this.data.dirSign
    const leanRoll = typeof d.roll === 'number' ? wrap180(d.roll - this.baseRoll) * dirSign : 0
    const leanPitch = typeof d.pitch === 'number' ? wrap180(d.pitch - this.basePitch) * dirSign : 0

    // 训练判定使用当前选定轴
    const lean = this.data.axis === 'roll' ? leanRoll : leanPitch
    if (this.hasBase) this.step(lean)

    // UI 节流
    const now = Date.now()
    if (now - this.lastView < VIEW_INTERVAL) return
    this.lastView = now

    // 3D 小人：三轴全喂，让小人姿态最自然（侧倾 roll + 俯仰 pitch + 偏航 yaw）
    const yaw = typeof d.yaw === 'number' ? wrap180(d.yaw - (this.baseYaw || 0)) : 0
    man3d.setPose({ roll: leanRoll, pitch: leanPitch, yaw: yaw })

    // 航空姿态仪修复：
    //   hudRotate 取消负号，天地线倾倒方向与身体一致
    //   hudShift 用 pitch 的真实偏移（之前错用同一个 base）
    this.setData({
      leanText: Math.abs(lean).toFixed(0),
      hudRotate: clamp(lean, -90, 90).toFixed(1),
      hudShift: clamp(leanPitch * 2, -70, 70).toFixed(1)
    })
  },

  // ---------- 训练状态机 ----------
  step(lean) {
    const phase = this.data.phase
    const target = this.data.targetAngle
    if (phase === 'left' && lean <= -target) {
      this.setData({ phase: 'leftOk', tip: '很好！慢慢坐直回来', tipType: 'ok' })
      this.lastDir = 'left'
      speaker.speak('向左到位，非常好')
      wx.vibrateShort({ type: 'medium' })
      man3d.setFlash(true)
    } else if (phase === 'right' && lean >= target) {
      this.setData({ phase: 'rightOk', tip: '很好！慢慢坐直回来', tipType: 'ok' })
      this.lastDir = 'right'
      speaker.speak('向右到位，非常好')
      wx.vibrateShort({ type: 'medium' })
      man3d.setFlash(true)
    } else if (phase === 'leftOk' || phase === 'rightOk') {
      if (Math.abs(lean) <= BACK_TOL) {
        man3d.setFlash(false)
        this.finishRep()
      }
    }
  },

  finishRep() {
    let coins = this.data.coins
    let combo = this.data.combo
    let reps = this.data.reps + 1
    let best = this.data.best

    combo += 1
    if (combo > best) best = combo
    const bonus = Math.min((combo - 1) * 2, 10)
    const gain = 10 + bonus
    coins += gain

    try {
      wx.setStorageSync(STORE_COINS, coins)
      wx.setStorageSync(STORE_BEST, best)
    } catch (e) { /* 忽略 */ }

    this.setData({
      coins,
      best,
      combo,
      reps,
      showGain: true,
      gainText: String(gain)
    })
    setTimeout(() => this.setData({ showGain: false }), 900)

    speaker.speak('很好，完成一次，继续保持')

    if (reps >= this.data.goal) {
      // 一轮训练完成，落一条记录（供「我的」页发送到邮箱）
      pushRehabLog({
        time: formatNow(),
        reps: reps,
        goal: this.data.goal,
        axis: this.data.axis,
        bestCombo: best,
        coins: coins
      })
      this.setData({
        phase: 'done',
        targetDir: '',
        tip: '今日目标完成！🎉',
        tipType: 'ok'
      })
      speaker.speak('恭喜，今日训练目标已达成')
      wx.vibrateShort({ type: 'heavy' })
      return
    }

    // 左右交替
    const next = this.lastDir === 'left' ? 'right' : 'left'
    this.setData({
      phase: next,
      targetDir: next,
      tip: next === 'left' ? '请向左侧倾斜身体' : '请向右侧倾斜身体',
      tipType: 'normal'
    })
    speaker.speak(next === 'left' ? '请向左侧倾斜身体' : '请向右侧倾斜身体')
  }
})