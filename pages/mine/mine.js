// mine.js —— 「我的」页：个人信息、设置、数据与隐私
const { selectTab, getNickname, setNickname } = require('../../utils/tab.js')
const speaker = require('../../utils/speaker.js')
const auth = require('../../utils/auth.js')
const api = require('../../utils/api.js')

// 五个游戏的记录键。真实键是 `<base>:<patientId>`（未登录时 `:anon`），
// 早期版本还有不带后缀的固定键，清理时一并处理 —— 与
// utils/training-record.js 的 migrateTo() 覆盖的键完全一致。
const RECORD_BASES = [
  'fruit_records_v1', 'wire_records_v1', 'rhythm_records_v1',
  'shoot_records_v1', 'race_records_v1'
]

function recordKeys() {
  const pid = auth.patientId()
  const keys = []
  RECORD_BASES.forEach((base) => {
    keys.push(base, base + ':anon')
    if (pid) keys.push(base + ':' + pid)
  })
  return keys
}

function countLocal() {
  let n = 0
  recordKeys().forEach((k) => {
    let v = null
    try { v = wx.getStorageSync(k) } catch (e) { /* 忽略 */ }
    if (Array.isArray(v)) n += v.length
  })
  return n
}

Page({
  data: {
    avatar: '\u{1F938}',
    speechOn: true, // 语音播报开关
    consentOn: false, // 是否允许把训练记录同步到云端
    localCount: 0, // 本机记录条数
    nickname: '体验用户',
    levelText: '体验版',
    version: 'v1.0.0'
  },

  onShow() {
    selectTab(this, 2)
    this.setData({
      speechOn: speaker.isEnabled(),
      nickname: getNickname(),
      consentOn: auth.hasPrivacyConsent(),
      localCount: countLocal()
    })
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

  // ---------- 数据与隐私 ----------
  /**
   * 上传开关。打开是一次新的授权，关闭要二次确认 —— 家用场景里患者自己点，
   * 误触关掉之后治疗师那边就断线了，而且患者不会意识到。
   */
  onConsentChange(e) {
    const on = !!e.detail.value
    if (on) {
      auth.setPrivacyConsent()
      this.setData({ consentOn: true })
      // 刚开启：把攒在本机、还没传上去的记录补传一次。
      // flushAll 只覆盖主包里已注册的记录库（走钢丝），分包里的四款
      // 会在各自游戏页调用 flushPending，这里补多少算多少。
      try {
        require('../../utils/training-record.js').flushAll()
          .then(() => { this.setData({ localCount: countLocal() }) })
          .catch(() => { /* 忽略：下次联网再补 */ })
      } catch (err) { /* 忽略 */ }
      wx.showToast({ title: '已开启上传', icon: 'success' })
      return
    }
    wx.showModal({
      title: '关闭上传',
      content: '关闭后新的训练记录只保存在这台手机上，已上传的记录仍留在云端。治疗师将看不到你之后的训练情况。',
      confirmText: '关闭上传',
      cancelText: '保持开启',
      success: (res) => {
        if (!res.confirm) {
          // 开关已经被拨到「关」，取消时要拨回来
          this.setData({ consentOn: auth.hasPrivacyConsent() })
          return
        }
        auth.revokePrivacyConsent()
        this.setData({ consentOn: false })
        wx.showToast({ title: '已关闭上传', icon: 'none' })
      }
    })
  },

  onWhatUploaded() {
    wx.showModal({
      title: '会上传哪些数据',
      showCancel: false,
      content: '· 训练指标：游戏、开始时间、时长、得分、准确率、姿态稳定率\n' +
        '· 参数快照：做这一局时的难度与容差，用来解释历史数据为什么变化\n' +
        '· 不包含：姓名、身份证、手机号、传感器原始数据、位置信息\n\n' +
        '只有你本人和绑定的治疗师能读取。开启后会静默上传，失败的下次联网自动补传。'
    })
  },

  onClearLocal() {
    const n = countLocal()
    if (!n) {
      wx.showToast({ title: '本机没有训练记录', icon: 'none' })
      return
    }
    wx.showModal({
      title: '清空本机记录',
      content: '将删除这台手机上当前账号的 ' + n + ' 条记录。已上传到云端的不受影响。删除后无法恢复。',
      confirmText: '清空',
      confirmColor: '#d93a3a',
      success: (res) => {
        if (!res.confirm) return
        recordKeys().forEach((k) => {
          try { wx.removeStorageSync(k) } catch (e) { /* 忽略 */ }
        })
        this.setData({ localCount: 0 })
        wx.showToast({ title: '已清空', icon: 'success' })
      }
    })
  },

  onDeleteCloud() {
    wx.showModal({
      title: '删除云端记录',
      content: '将删除云端已上传的全部训练记录，治疗师无法再看到你的历史训练。本机记录不受影响。',
      confirmText: '删除',
      confirmColor: '#d93a3a',
      success: (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中', mask: true })
        api.del('/v1/records').then((r) => {
          wx.hideLoading()
          wx.showToast({ title: '已删除 ' + ((r && r.deleted) || 0) + ' 条', icon: 'none' })
        }).catch((err) => {
          wx.hideLoading()
          wx.showModal({
            title: '删除失败',
            content: (err && err.message) || '网络异常，请稍后再试',
            showCancel: false
          })
        })
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
      content: '运动康复助手 ' + this.data.version + '\n适用于 WitMotion WT9011DCL 蓝牙姿态传感器\n训练记录先存在本机，开启上传后同步到云端'
    })
  }
})
