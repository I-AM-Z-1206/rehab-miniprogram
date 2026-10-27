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
    launchedAt: 0
  },

  onLaunch() {
    this.globalData.launchedAt = Date.now()
    try {
      const saved = wx.getStorageSync(LOG_KEY)
      if (Array.isArray(saved)) this.globalData.errorLog = saved
    } catch (e) { /* 忽略 */ }
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
