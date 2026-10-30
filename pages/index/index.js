// index.js —— 首页：蓝牙连接（主位）+ 功能入口
const { selectTab, openPage } = require('../../utils/tab.js')
const speaker = require('../../utils/speaker.js')
const WitBle = require('../../utils/witble.js')
const progress = require('../../utils/progress.js')
const zero = require('../../utils/zero.js')

// 每次进入小程序只播报一次欢迎语
let welcomed = false

Page({
  data: {
    bleLinked: false, // 蓝牙是否已连接（全局单例，任何页面连上都生效）
    bleLinkedName: '',
    // 训练前的三步：连接 → 标定 → 训练。
    // 零点标定原来被我放在「工具」区，那是错的：传感器每次佩戴位置不同，
    // 不标定所有判定都会偏，它不是可选项，是必经的一步。
    zeroSet: false,
    zeroToday: false,
    step: 1,
    stateText: '未连接',
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
    this.refreshZero()
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

  /**
   * 读零点状态并算出当前处在第几步。
   *
   * 零点是设备级的：传感器每次戴的位置不一样，昨天标的不代表今天准。
   * 所以「已标定」要按自然日判断 —— 光看 set=true 会一直显示已标定，
   * 患者第二天戴上就用昨天的零点，判定全偏也不知道为什么。
   */
  refreshZero() {
    let z = { set: false, at: 0 }
    try { z = zero.get() } catch (e) { /* 读不到就当没标定 */ }
    const sameDay = !!(z.set && z.at) &&
      new Date(z.at).toDateString() === new Date().toDateString()
    const linked = this.data.bleLinked
    const step = !linked ? 1 : (sameDay ? 3 : 2)
    let stateText = '未连接'
    if (linked) stateText = sameDay ? '已连接 · 今天已标定' : '已连接 · 未标定'
    this.setData({
      zeroSet: !!z.set,
      zeroToday: sameDay,
      step: step,
      stateText: stateText
    })
  },

  // 第 1 步：连接（已连接时点它是看设备详情）
  goConnect() {
    if (!this.data.bleLinked) speaker.speak('请确认传感器已开机，蓝灯快闪后点击扫描设备')
    openPage('/pages/wit/wit')
  },

  // 第 2 步：标定
  goCalibrate() {
    if (!this.data.bleLinked) {
      wx.showToast({ title: '先连接传感器', icon: 'none' })
      return
    }
    speaker.speak('站直不动，按一下标定')
    openPage('/pages/calibrate/calibrate')
  },

  // 第 3 步：开始训练
  goTrain() {
    speaker.speak('选择今天的训练项目')
    selectTab(this, 1)
  },

  hintConnect() {
    wx.showToast({ title: '先连接传感器', icon: 'none' })
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
