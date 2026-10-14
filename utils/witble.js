// witble.js —— WitMotion 蓝牙姿态传感器通用封装（BLE 连接 + 协议解析）
// 复用已验证的连接要点：
//  - 连接成功需延迟再获取服务，空列表自动重试（部分机型 GATT 未就绪）
//  - 特征属性字段名为 properties（不是 props）
//  - 优先 Nordic UART 6e400003 通道，其次透传 ffe0/ffe5
//  - 先注册 onBLECharacteristicValueChange，再开启 notify
//  - 0x55 0x61 组合帧 20 字节；多余字节自动丢弃并重新同步
const NUS_NOTIFY = '6e400003'
const NUS_WRITE = '6e400002'

function s16(lo, hi) {
  let v = (hi << 8) | lo
  if (v >= 0x8000) v -= 0x10000
  return v
}

class WitBle {
  constructor() {
    this.devices = []
    this.connectedId = ''
    this.services = []
    this.notifyChar = null
    this.writeChar = null
    this.fallbackChar = null
    this.notifyScore = 0
    this.writeScore = 0
    this.buf = []
    this.handlers = {}
  }

  log(msg) {
    if (this.handlers.onLog) this.handlers.onLog(msg)
  }

  // ---------- 扫描 ----------
  startScan(onDevices, onFail) {
    const that = this
    this.devices = []
    wx.openBluetoothAdapter({
      success() {
        wx.onBluetoothDeviceFound(function (res) {
          const map = {}
          that.devices.forEach((d) => { map[d.deviceId] = d })
          ;(res.devices || []).forEach((d) => {
            if (!d.deviceId) return
            const name = d.name || d.localName || ''
            const prev = map[d.deviceId]
            if (prev) {
              prev.rssi = d.rssi !== 0 ? d.rssi : prev.rssi
              if (name) prev.name = name
            } else {
              map[d.deviceId] = { deviceId: d.deviceId, name, rssi: d.rssi || 0 }
            }
          })
          const list = Object.keys(map).map((k) => map[k])
          // WitMotion 设备置顶
          list.sort((a, b) => {
            const wa = /WT|Wit/i.test(a.name) ? 0 : 1
            const wb = /WT|Wit/i.test(b.name) ? 0 : 1
            if (wa !== wb) return wa - wb
            return b.rssi - a.rssi
          })
          that.devices = list.slice(0, 20)
          if (onDevices) onDevices(that.devices)
        })
        wx.startBluetoothDevicesDiscovery({
          allowDuplicatesKey: true,
          powerLevel: 'high',
          success() { that.log('开始扫描蓝牙设备') },
          fail: (err) => { if (onFail) onFail(err) }
        })
      },
      fail: (err) => { if (onFail) onFail(err) }
    })
  }

  stopScan() {
    wx.stopBluetoothDevicesDiscovery({ complete: () => {} })
    try { wx.offBluetoothDeviceFound() } catch (e) { /* 忽略 */ }
  }

  // ---------- 连接 ----------
  connect(deviceId, handlers) {
    this.handlers = handlers || {}
    const that = this
    wx.createBLEConnection({
      deviceId,
      timeout: 6000,
      success() {
        that.connectedId = deviceId
        that.afterConnected()
      },
      fail: (err) => {
        if (handlers.onError) handlers.onError('连接失败：' + (err.errMsg || ''))
      }
    })
  }

  afterConnected() {
    const that = this
    wx.onBLEConnectionStateChange(function (res) {
      if (res.deviceId === that.connectedId && !res.connected) {
        that.disconnect(true)
        if (that.handlers.onDisconnected) that.handlers.onDisconnected()
      }
    })
    // 先注册数据回调
    wx.onBLECharacteristicValueChange(function (res) {
      that.feed(new Uint8Array(res.value))
    })
    wx.setBLEMTU({ deviceId: this.connectedId, mtu: 185, complete: () => {} })
    this.discoverServices(3)
  }

  discoverServices(retry) {
    const that = this
    setTimeout(() => {
      wx.getBLEDeviceServices({
        deviceId: that.connectedId,
        success: (res) => {
          const list = (res.services || []).map((s) => s.uuid)
          if (!list.length && retry > 0) {
            that.log('服务列表为空，重试(' + retry + ')')
            that.discoverServices(retry - 1)
            return
          }
          that.services = list
          that.probeNextService()
        },
        fail: () => {
          if (retry > 0) { that.discoverServices(retry - 1); return }
          if (that.handlers.onError) that.handlers.onError('获取服务失败')
        }
      })
    }, 1000)
  }

  probeNextService() {
    const that = this
    if (!this.services.length) {
      if (!this.notifyChar && this.fallbackChar) this.notifyChar = this.fallbackChar
      if (!this.notifyChar) {
        if (that.handlers.onError) that.handlers.onError('未找到可订阅的数据特征值')
        return
      }
      this.subscribe()
      return
    }
    const serviceId = this.services.shift()
    wx.getBLEDeviceCharacteristics({
      deviceId: this.connectedId,
      serviceId,
      success: (res) => {
        (res.characteristics || []).forEach((c) => {
          const uuid = (c.uuid || '').toLowerCase()
          const props = c.properties || c.props || {}
          const canNotify = props.notify || props.indicate
          const canWrite = props.write || props.writeNoResponse || props.writeDefault
          if (canNotify) {
            const score = uuid.indexOf(NUS_NOTIFY) !== -1 ? 3 : (uuid.indexOf('ffe') !== -1 || uuid.indexOf('fff') !== -1) ? 2 : 1
            if (!that.notifyChar || score > that.notifyScore) {
              that.notifyChar = { serviceId, charId: c.uuid }
              that.notifyScore = score
            }
          }
          if (canWrite) {
            const score = uuid.indexOf(NUS_WRITE) !== -1 ? 3 : (uuid.indexOf('ffe') !== -1 || uuid.indexOf('fff') !== -1) ? 2 : 1
            if (!that.writeChar || score > that.writeScore) {
              that.writeChar = { serviceId, charId: c.uuid }
              that.writeScore = score
            }
          }
          if (!that.fallbackChar && serviceId.toLowerCase().indexOf('ffe') !== -1) {
            that.fallbackChar = { serviceId, charId: c.uuid }
          }
        })
      },
      complete: () => that.probeNextService()
    })
  }

  subscribe() {
    const that = this
    const nc = this.notifyChar
    wx.notifyBLECharacteristicValueChange({
      deviceId: this.connectedId,
      serviceId: nc.serviceId,
      characteristicId: nc.charId,
      state: true,
      success: () => {
        that.log('订阅成功：' + nc.charId.slice(0, 8))
        if (that.handlers.onReady) that.handlers.onReady()
      },
      fail: (err) => {
        if (that.handlers.onError) that.handlers.onError('订阅失败：' + (err.errMsg || ''))
      }
    })
  }

  // ---------- 协议解析 ----------
  feed(bytes) {
    let buf = this.buf.concat(Array.prototype.slice.call(bytes))
    while (true) {
      while (buf.length && buf[0] !== 0x55) buf.shift()
      if (buf.length < 2) break
      const flag = buf[1]
      if (flag === 0x61) {
        if (buf.length < 20) break
        this.parseCombo(buf.slice(0, 20))
        buf = buf.slice(20)
        continue
      }
      if (flag === 0x71) {
        // 寄存器响应帧：55 71 <起始寄存器> 00 + 8 个 int16 寄存器值 + sum
        if (buf.length < 20) break
        this.parseReg(buf.slice(0, 20))
        buf = buf.slice(20)
        continue
      }
      if (flag >= 0x50 && flag <= 0x5a) {
        if (buf.length < 11) break
        const pkt = buf.slice(0, 11)
        let sum = 0
        for (let i = 0; i < 10; i++) sum += pkt[i]
        if ((sum & 0xff) === pkt[10]) {
          this.parseLegacy(flag, pkt)
          buf = buf.slice(11)
        } else {
          buf.shift()
        }
        continue
      }
      buf.shift()
    }
    this.buf = buf
  }

  emit(d) {
    if (this.handlers.onData) this.handlers.onData(d)
  }

  parseCombo(f) {
    this.emit({
      ax: (s16(f[2], f[3]) / 32768) * 16,
      ay: (s16(f[4], f[5]) / 32768) * 16,
      az: (s16(f[6], f[7]) / 32768) * 16,
      wx: (s16(f[8], f[9]) / 32768) * 2000,
      wy: (s16(f[10], f[11]) / 32768) * 2000,
      wz: (s16(f[12], f[13]) / 32768) * 2000,
      roll: (s16(f[14], f[15]) / 32768) * 180,
      pitch: (s16(f[16], f[17]) / 32768) * 180,
      yaw: (s16(f[18], f[19]) / 32768) * 180
    })
  }

  parseReg(f) {
    const startReg = f[2]
    const reg = (idx) => s16(f[4 + idx * 2], f[5 + idx * 2])
    const vals = []
    for (let i = 0; i < 8; i++) vals.push(reg(i))
    this.emit({ regStart: startReg, reg: vals })
  }

  // ---------- 写指令（读电量 / 读温度等） ----------
  write(bytes) {
    const wc = this.writeChar || this.notifyChar
    if (!wc || !this.connectedId) {
      this.log('无写入通道，指令未发送')
      return false
    }
    wx.writeBLECharacteristicValue({
      deviceId: this.connectedId,
      serviceId: wc.serviceId,
      characteristicId: wc.charId,
      value: new Uint8Array(bytes).buffer,
      success: () => this.log('已发送指令'),
      fail: (err) => this.log('指令发送失败：' + (err.errMsg || ''))
    })
    return true
  }

  parseLegacy(flag, f) {
    const v = [s16(f[2], f[3]), s16(f[4], f[5]), s16(f[6], f[7])]
    if (flag === 0x51) {
      this.emit({ ax: (v[0] / 32768) * 16, ay: (v[1] / 32768) * 16, az: (v[2] / 32768) * 16 })
    } else if (flag === 0x52) {
      this.emit({ wx: (v[0] / 32768) * 2000, wy: (v[1] / 32768) * 2000, wz: (v[2] / 32768) * 2000 })
    } else if (flag === 0x53) {
      this.emit({ roll: (v[0] / 32768) * 180, pitch: (v[1] / 32768) * 180, yaw: (v[2] / 32768) * 180 })
    }
  }

  // ---------- 断开 ----------
  disconnect(silent) {
    this.stopScan()
    try { wx.offBLECharacteristicValueChange() } catch (e) { /* 忽略 */ }
    try { wx.offBLEConnectionStateChange() } catch (e) { /* 忽略 */ }
    if (this.connectedId) {
      wx.closeBLEConnection({ deviceId: this.connectedId, complete: () => {} })
      this.connectedId = ''
    }
    this.buf = []
    this.services = []
    this.notifyChar = null
    this.writeChar = null
    this.fallbackChar = null
    this.notifyScore = 0
    this.writeScore = 0
    if (!silent) this.log('已断开连接')
  }
}

// ---------- 全局共享实例 ----------
// 一次连接成功后，页面切换/返回都不会主动断开，整个小程序生命周期内保持连接
function getShared() {
  const app = typeof getApp === 'function' ? getApp() : null
  if (!app) return new WitBle()
  app.globalData = app.globalData || {}
  if (!app.globalData.witBle) app.globalData.witBle = new WitBle()
  return app.globalData.witBle
}

// 解绑回调（页面卸载时用）：只摘回调，绝不主动断开蓝牙
function detach(ble) {
  if (!ble) return
  ble.handlers = {}
}

module.exports = WitBle
module.exports.getShared = getShared
module.exports.detach = detach
