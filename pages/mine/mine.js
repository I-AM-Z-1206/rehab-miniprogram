// mine.js —— 「我的」页：个人信息、设置
const { selectTab, getNickname, setNickname } = require('../../utils/tab.js')
const speaker = require('../../utils/speaker.js')

Page({
  data: {
    avatar: '\u{1F938}',
    speechOn: true, // 语音播报开关
    nickname: '体验用户',
    levelText: '体验版',
    version: 'v1.0.0'
  },

  onShow() {
    selectTab(this, 2)
    this.setData({ speechOn: speaker.isEnabled(), nickname: getNickname() })
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

  // ---------- 关于 ----------
  onGuide() {
    wx.showModal({
      title: '使用说明',
      showCancel: false,
      content: '① 传感器开机后蓝灯快闪为广播状态\n② 首页中间点「连接传感器」，扫描连接 WT9011DCL\n③ 按正确方式佩戴后点「标定零点」（零点全局生效）\n④ 连接成功后即可在传感器数据页查看实时姿态'
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
