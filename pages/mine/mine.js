// mine.js —— 「我的」页：个人信息、训练数据总览、设置
const {
  selectTab,
  openPage,
  readOverview,
  getNickname,
  setNickname,
  KEY_REHAB_COINS,
  KEY_REHAB_BEST
} = require('../../utils/tab.js')
const speaker = require('../../utils/speaker.js')

Page({
  data: {
    avatar: '\u{1F938}',
    speechOn: true, // 语音播报开关
    nickname: '体验用户',
    levelText: '康复训练 · 体验版',
    rehabCoins: 0,
    best: 0,
    version: 'v1.0.0'
  },

  onShow() {
    selectTab(this, 2)
    this.setData({ speechOn: speaker.isEnabled() })
    this.loadOverview()
  },

  onUnload() {
    speaker.stop()
  },

  // ---------- 语音播报 ----------
  onSpeechChange(e) {
    const on = !!e.detail.value
    speaker.setEnabled(on)
    this.setData({ speechOn: on })
    if (on) speaker.speak('语音播报已开启')
    else speaker.stop()
  },

  onTestVoice() {
    if (!this.data.speechOn) {
      wx.showToast({ title: '请先开启语音播报', icon: 'none' })
      return
    }
    speaker.speak('语音播报测试，能听到说明配置正常')
  },

  loadOverview() {
    this.setData(Object.assign({ nickname: getNickname() }, readOverview()))
  },

  // ---------- 资料 ----------
  onEditNickname() {
    const that = this
    wx.showModal({
      title: '修改昵称',
      editable: true,
      placeholderText: '请输入昵称',
      content: this.data.nickname,
      success: (res) => {
        if (!res.confirm) return
        const name = (res.content || '').trim()
        if (!name) {
          wx.showToast({ title: '昵称不能为空', icon: 'none' })
          return
        }
        setNickname(name)
        that.setData({ nickname: name })
        wx.showToast({ title: '已保存', icon: 'success' })
      }
    })
  },

  // ---------- 常用功能 ----------
  goRehab() {
    speaker.speak('请佩戴好传感器并连接，即可开始康复训练')
    openPage('/pages/rehab/rehab')
  },

  // ---------- 数据管理 ----------
  onClearRehab() {
    const that = this
    wx.showModal({
      title: '清空康复记录',
      content: '将清零金币与最高连击记录，确定继续吗？',
      success: (res) => {
        if (!res.confirm) return
        try {
          wx.setStorageSync(KEY_REHAB_COINS, 0)
          wx.setStorageSync(KEY_REHAB_BEST, 0)
        } catch (e) { /* 忽略 */ }
        that.loadOverview()
        wx.showToast({ title: '已清空', icon: 'success' })
      }
    })
  },

  // ---------- 关于 ----------
  onGuide() {
    wx.showModal({
      title: '使用说明',
      showCancel: false,
      content: '① 传感器开机后蓝灯快闪为广播状态\n② 首页中间点「连接传感器」，扫描连接 WT9011DCL\n③ 传感器绑在胸前，到底部「康复」页坐直点「设定基准」\n④ 按语音提示向左 / 向右侧倾，回正即完成 1 次'
    })
  },

  onAbout() {
    wx.showModal({
      title: '关于',
      showCancel: false,
      content: '运动康复助手 ' + this.data.version + '\n适用于 WitMotion WT9011DCL 蓝牙姿态传感器\n数据均保存在本机'
    })
  }
})
