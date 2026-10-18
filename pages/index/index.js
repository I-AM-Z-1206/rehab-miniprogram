// index.js —— 首页：蓝牙连接（主位）+ 功能入口
const { selectTab, openPage } = require('../../utils/tab.js')
const speaker = require('../../utils/speaker.js')
const WitBle = require('../../utils/witble.js')

// 每次进入小程序只播报一次欢迎语
let welcomed = false

Page({
  data: {
    bleLinked: false, // 蓝牙是否已连接（全局单例，任何页面连上都生效）
    bleLinkedName: ''
  },

  onShow() {
    selectTab(this, 0)
    this.refreshBle()
    if (!welcomed) {
      welcomed = true
      speaker.speak('欢迎使用运动康复助手，请先连接蓝牙传感器')
    }
  },

  onUnload() {
    speaker.stop()
  },

  // 读取全局蓝牙单例状态：一次连上，不退出小程序就一直保持
  refreshBle() {
    let linked = false
    let name = ''
    try {
      const ble = WitBle.getShared()
      linked = !!ble.connectedId
      name = linked ? 'WT9011DCL' : ''
    } catch (e) { /* 忽略 */ }
    this.setData({ bleLinked: linked, bleLinkedName: name })
  },

  // 蓝牙连接：进专门的蓝牙页做扫描连接
  goWit() {
    if (this.data.bleLinked) {
      speaker.speak('设备已连接，可查看传感器数据')
    } else {
      speaker.speak('请确认传感器已开机，蓝灯快闪后点击扫描设备')
    }
    openPage('/pages/wit/wit')
  },

  // 零点标定：独立功能页
  goCalibrate() {
    openPage('/pages/calibrate/calibrate')
  }
})
