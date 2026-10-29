// ============================================================================
// app.js —— 全局入口
// ----------------------------------------------------------------------------
// 只做两件事：
//   1. 启动时的轻量初始化（记录启动时间、读出上一次的错误日志）；
//   2. 兜底捕获未处理异常 / Promise 拒绝，落一条本地环形日志（最多 50 条），
//      方便治疗师反馈时导出，而不是"白屏了但没人知道为什么"。
//
// 日志只存错误类型、消息、页面路径，不含姓名、传感器原始数据。
// 读取接口：getApp().getErrorLog() / getApp().clearErrorLog()
// ============================================================================

const LOG_KEY = 'app_error_log_v1'
const MAX_LOGS = 50
const CLIP = 600

function stamp() {
  const d = new Date()
  const p = (n) => (n < 10 ? '0' + n : '' + n)
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
    p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds())
}

function clip(v) {
  let s
  if (typeof v === 'string') s = v
  else {
    try { s = JSON.stringify(v) } catch (e) { s = String(v) }
  }
  return s && s.length > CLIP ? s.slice(0, CLIP) + '…' : (s || '')
}

function currentPage() {
  try {
    const pages = getCurrentPages() || []
    const p = pages[pages.length - 1]
    return p ? (p.route || '') : ''
  } catch (e) {
    return ''
  }
}

function pushLog(kind, detail) {
  const rec = { at: stamp(), kind: kind, page: currentPage(), detail: clip(detail) }
  try {
    const saved = wx.getStorageSync(LOG_KEY)
    const arr = Array.isArray(saved) ? saved : []
    arr.push(rec)
    while (arr.length > MAX_LOGS) arr.shift()
    wx.setStorageSync(LOG_KEY, arr)
    const app = getApp()
    if (app && app.globalData) app.globalData.errorLog = arr
  } catch (e) {
    // 兜底里不能再抛错：存不进去就只打控制台
  }
  return rec
}

App({
  globalData: {
    errorLog: [],
    launchedAt: 0,
    // 云端状态：ready=false 时小程序照常可用，只是记录只存本地
    cloud: { ready: false, role: '', patientId: '', error: '' }
  },

  onLaunch() {
    this.globalData.launchedAt = Date.now()
    try {
      const saved = wx.getStorageSync(LOG_KEY)
      if (Array.isArray(saved)) this.globalData.errorLog = saved
    } catch (e) { /* 忽略 */ }
    this.bootCloud()
  },

  onShow() {
    // 回到前台补传离线记录：家庭网络失败是常态，不能指望一次就传上去
    if (this.globalData.cloud.ready) {
      try {
        require('./utils/training-record.js').flushAll().catch(function () { /* 忽略 */ })
      } catch (e) { /* 忽略 */ }
    }
  },

  /** 运行期未捕获错误 */
  onError(err) {
    pushLog('error', err)
    console.error('[app] onError', err)
  },

  /** 未处理的 Promise 拒绝（网络、音频、蓝牙都可能走这里） */
  onUnhandledRejection(res) {
    pushLog('rejection', res && (res.reason || res))
    console.error('[app] unhandledRejection', res)
  },

  /** 页面不存在：记一条并回首页，避免用户停在空白页 */
  onPageNotFound(res) {
    pushLog('page404', res && res.path)
    wx.reLaunch({ url: '/pages/index/index' })
  },

  // ---------------------------------------------------------------- 云端
  /**
   * 静默登录 + 拉参数 + 补传。
   * 任何一步失败都只影响联网功能，本地训练和本地记录完全不受影响。
   */
  bootCloud() {
    const that = this
    let auth, remote, rec
    try {
      auth = require('./utils/auth.js')
      remote = require('./utils/remote-config.js')
      rec = require('./utils/training-record.js')
    } catch (e) {
      this.globalData.cloud.error = '模块加载失败'
      console.warn('[app] 云端模块加载失败', e && e.message)
      return
    }

    auth.bootstrap().then(function (me) {
      that.globalData.cloud = {
        ready: true,
        role: me.role || 'patient',
        patientId: (me.patient && me.patient.id) || '',
        error: ''
      }
      // 先把旧版本固定键、以及登录前产生的 anon 记录归到当前账号名下，
      // 必须在补传之前做，否则这些记录永远传不上去（owner 为空会被当成别人的）
      try {
        const moved = rec.migrateStores()
        if (moved) console.log('[app] 已把 ' + moved + ' 条历史记录归到当前账号')
      } catch (e) { /* 忽略 */ }
      // 拉参数：治疗师改了难度，患者下次打开就生效
      remote.pullAll().catch(function () { /* 忽略 */ })
      // 补传离线队列
      rec.flushAll().catch(function () { /* 忽略 */ })
      // 首次使用询问一次隐私授权，之后静默上报
      that.maybeAskPrivacy()
    }).catch(function (err) {
      that.globalData.cloud = {
        ready: false,
        role: '',
        patientId: '',
        error: (err && err.message) || '登录失败'
      }
      console.warn('[app] 云端登录失败，进入离线模式：', err && err.message)
    })
  },

  /** 只在首次询问一次；拒绝后不再自动打扰 */
  maybeAskPrivacy() {
    const auth = require('./utils/auth.js')
    if (auth.hasPrivacyConsent()) return
    let asked = false
    try { asked = wx.getStorageSync('privacy_prompted_v1') === true } catch (e) { /* 忽略 */ }
    if (asked) return

    setTimeout(function () {
      wx.showModal({
        title: '训练数据上传',
        content: '上传后治疗师才能看到你的训练情况并调整难度。\n\n· 只上传得分、时长、姿态稳定率等训练指标\n· 不含姓名、身份证、手机号\n· 只有你绑定的治疗师能看\n· 可随时在「我的」页关闭并删除',
        confirmText: '同意',
        cancelText: '暂不上传',
        success: function (res) {
          try { wx.setStorageSync('privacy_prompted_v1', true) } catch (e) { /* 忽略 */ }
          if (res.confirm) {
            auth.setPrivacyConsent()
            try {
              require('./utils/training-record.js').flushAll().catch(function () { /* 忽略 */ })
            } catch (e) { /* 忽略 */ }
          }
        }
      })
    }, 1500)
  },

  // ---------------------------------------------------------------- 错误日志
  getErrorLog() {
    return this.globalData.errorLog || []
  },

  clearErrorLog() {
    this.globalData.errorLog = []
    try { wx.removeStorageSync(LOG_KEY) } catch (e) { /* 忽略 */ }
  },

  /** 手动记录一条（页面 catch 到可恢复异常时用） */
  logError(kind, detail) {
    return pushLog(kind || 'manual', detail)
  }
})
