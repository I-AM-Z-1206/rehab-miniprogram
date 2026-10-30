// index.js —— 首页：蓝牙连接（主位）+ 功能入口
const { selectTab, openPage } = require('../../utils/tab.js')
const speaker = require('../../utils/speaker.js')
const WitBle = require('../../utils/witble.js')
const progress = require('../../utils/progress.js')

// 每次进入小程序只播报一次欢迎语
let welcomed = false

Page({
  data: {
    bleLinked: false, // 蓝牙是否已连接（全局单例，任何页面连上都生效）
    bleLinkedName: '',
    // 「我的进步」：患者每天打开第一眼要看的东西。
    // 指标是控制稳定率，不是分数 —— 分数受难度影响，升档就掉，会让人误以为退步。
    prog: {
      tone: 'none',
      headline: '',
      detail: '',
      meta: '',
      arrow: '',
      week: [],
      days: 0,
      count: 0,
      total: 0
    }
  },

  onShow() {
    selectTab(this, 0)
    this.refreshBle()
    this.refreshProgress()
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

  // 主操作：没连上就去连；连上了直接进训练 —— 首页原来连完蓝牙就没出口了
  goWit() {
    if (this.data.bleLinked) {
      speaker.speak('传感器已连接，选择今天的训练项目')
      selectTab(this, 1)
      return
    }
    speaker.speak('请确认传感器已开机，蓝灯快闪后点击扫描设备')
    openPage('/pages/wit/wit')
  },

  // 设备详情：点状态行进蓝牙页（看数据、断开都在这）
  goDevice() {
    openPage('/pages/wit/wit')
  },

  // 零点标定：独立功能页
  goCalibrate() {
    openPage('/pages/calibrate/calibrate')
  },

  /**
   * 刷新「我的进步」卡片。
   *
   * 读五个游戏的记录（各游戏分库），归一成控制稳定率后和上周比。
   * 任何异常都不能让首页白屏 —— 这张卡是加分项，不是主功能。
   */
  refreshProgress() {
    try {
      // detail 比 summary 多给 week（打卡圆点）；首页要用，所以调 detail
      const d = progress.detail()
      const desc = progress.describe(d)
      const w = d.thisWeek
      // 一天练一局很常见，「4 天 · 4 次」是重复的，合并成「4 次」
      let meta = ''
      if (w.count > 0) {
        meta = w.days === w.count
          ? '本周 ' + w.count + ' 次'
          : '本周 ' + w.days + ' 天 · ' + w.count + ' 次'
      } else if (d.totalCount > 0) {
        meta = '累计 ' + d.totalCount + ' 次'
      }
      this.setData({
        prog: {
          tone: desc.tone,
          headline: desc.headline,
          detail: desc.detail,
          meta: meta,
          arrow: desc.tone === 'up' ? '↑' : (desc.tone === 'down' ? '↓' : (desc.tone === 'flat' ? '→' : '')),
          week: d.week,
          days: w.days,
          count: w.count,
          total: d.totalCount
        }
      })
    } catch (e) {
      console.error('[index] progress', e)
    }
  },

  goProgress() {
    openPage('/pages/progress/progress')
  }
})
