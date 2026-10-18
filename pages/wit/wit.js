// wit.js —— 蓝牙传感器连接 / 数据页
// 说明：本页使用全局蓝牙单例（WitBle.getShared），
// 任意页面连上后全局可用；离开页面只解绑回调，绝不主动断开。
const WitBle = require('../../utils/witble.js')
const speaker = require('../../utils/speaker.js')

const CMD_UNLOCK = [0xff, 0xaa, 0x69, 0x88, 0xb5]
const CMD_READ_BATTERY = [0xff, 0xaa, 0x27, 0x64, 0x00]
const CMD_READ_TEMP = [0xff, 0xaa, 0x27, 0x40, 0x00]
const VIEW_INTERVAL = 100 // 界面刷新节流(ms)

Page({
  data: {
    // idle / scanning / connecting / connected / disconnected
    status: 'idle',
    statusText: '未连接',
    devices: [],
    packets: 0,
    ax: '0.000', ay: '0.000', az: '0.000', // g
    wx: '0.0', wy: '0.0', wz: '0.0', // °/s
    roll: '0.00', pitch: '0.00', yaw: '0.00', // °（已叠加全局虚拟零点，保留 2 位小数）
    rawRoll: '--', rawPitch: '--', // °（传感器原始角度，保留 2 位小数）
    battery: '--',
    batVolt: '',
    temp: '--'
  },

  onLoad() {
    this.ble = WitBle.getShared()
    this.latest = {}
    speaker.speak('请确认传感器已开机，蓝灯快闪后点击扫描设备')
  },

  onShow() {
    this.attach()
    // 进入时同步单例状态（在别的页面已连上也能直接显示）
    if (this.ble.connectedId) {
      this.setData({ status: 'connected', statusText: '已连接 · 接收数据中' })
    }
  },

  // 离开只摘回调，蓝牙保持连接
  onUnload() {
    speaker.stop()
    WitBle.detach(this.ble)
  },

  attach() {
    const that = this
    this.ble.handlers = {
      onData: (d) => that.onData(d),
      onReady: () => {
        that.setData({ status: 'connected', statusText: '已连接 · 接收数据中' })
        speaker.speak('蓝牙连接成功，正在接收传感器数据')
        wx.showToast({ title: '连接成功', icon: 'success' })
      },
      onError: (msg) => {
        that.setData({ status: 'disconnected', statusText: msg || '连接失败' })
        speaker.speak('蓝牙连接失败，请确认传感器已开机并靠近手机')
      },
      onDisconnected: () => {
        that.setData({ status: 'disconnected', statusText: '连接已断开' })
        speaker.speak('蓝牙连接已断开，请重新连接')
        wx.showToast({ title: '蓝牙已断开', icon: 'none' })
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
          content: '请确认：1) 手机蓝牙已开启；2) 用真机运行（模拟器不支持 BLE）；3) 已授权定位权限（Android 扫描需要）。'
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

  // ---------- 读电量 / 温度 ----------
  onQueryBattery() {
    if (!this.ble.connectedId) {
      wx.showToast({ title: '请先连接传感器', icon: 'none' })
      return
    }
    this.ble.write(CMD_UNLOCK)
    setTimeout(() => this.ble.write(CMD_READ_BATTERY), 150)
  },

  onQueryTemp() {
    if (!this.ble.connectedId) {
      wx.showToast({ title: '请先连接传感器', icon: 'none' })
      return
    }
    this.ble.write(CMD_UNLOCK)
    setTimeout(() => this.ble.write(CMD_READ_TEMP), 150)
  },

  // ---------- 数据 ----------
  onData(d) {
    // 寄存器响应帧：电量 / 温度
    if (typeof d.regStart === 'number') {
      this.handleReg(d.regStart, d.reg || [])
      return
    }
    this.latest = Object.assign({}, this.latest, d)
    this.setData({ packets: this.data.packets + 1 })
    this.scheduleView()
  },

  handleReg(startReg, vals) {
    if (startReg === 0x64) {
      // 电量寄存器：值 = 电压 ×100（如 388 = 3.88V），按锂电池曲线估算百分比
      const v = vals[0]
      if (v >= 300 && v <= 450) {
        const volt = v / 100
        const pct = Math.round(Math.max(0, Math.min(100, ((volt - 3.3) / (4.2 - 3.3)) * 100)))
        this.latest.battery = pct
        this.latest.batVolt = volt.toFixed(2)
        speaker.speak('传感器电量已读取，请查看屏幕')
      } else if (v >= 0 && v <= 100) {
        this.latest.battery = v // 个别固件直接返回百分比
        speaker.speak('传感器电量已读取，请查看屏幕')
      }
    } else if (startReg === 0x40) {
      this.latest.temp = vals[0] / 100 // 温度寄存器：值 ×100 ℃
      speaker.speak('传感器温度已读取，请查看屏幕')
    }
    this.scheduleView()
  },

  // 界面刷新节流：高频上传时避免 setData 过载
  scheduleView() {
    if (this.viewTimer) return
    const that = this
    this.viewTimer = setTimeout(() => {
      that.viewTimer = null
      const l = that.latest || {}
      const pick = (v, cur, n) => (typeof v === 'number' ? v.toFixed(n) : cur)
      that.setData({
        ax: pick(l.ax, that.data.ax, 3),
        ay: pick(l.ay, that.data.ay, 3),
        az: pick(l.az, that.data.az, 3),
        wx: pick(l.wx, that.data.wx, 1),
        wy: pick(l.wy, that.data.wy, 1),
        wz: pick(l.wz, that.data.wz, 1),
        // 姿态角统一保留小数点后 2 位（传感器分辨率约 0.0055°，2 位足够观察细微变化）
        roll: pick(l.roll, that.data.roll, 2),
        pitch: pick(l.pitch, that.data.pitch, 2),
        yaw: pick(l.yaw, that.data.yaw, 2),
        rawRoll: pick(l.rawRoll, that.data.rawRoll, 2),
        rawPitch: pick(l.rawPitch, that.data.rawPitch, 2),
        battery: l.battery === undefined ? that.data.battery : String(l.battery),
        batVolt: l.batVolt === undefined ? that.data.batVolt : l.batVolt,
        temp: pick(l.temp, that.data.temp, 1)
      })
    }, VIEW_INTERVAL)
  }
})
