// race-records.js —— 赛车：训练记录（本地为准，可逐条或批量上报）
const records = require('../../utils/race-record.js')

const STATE_TEXT = {
  local: '待上报',
  uploaded: '已上报',
  failed: '上报失败',
  unconfigured: '未配置接口',
  skipped: '模拟数据·不上报'
}

/** 秒 → mm:ss，比赛时长经常上百秒，比「150 秒」好读 */
function mmss(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0))
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
}

function toView(r) {
  const cfg = r.configSnapshot || {}
  const dim = (v) => (v === undefined || v === null ? '—' : v)
  // 记录条数多，视图对象尽量扁平，避免 setData 传大树
  return {
    recordId: r.recordId,
    time: records.formatTime(r.startedAt || r.endedAt),
    score: r.score || 0,
    rank: r.rank || 0,
    level: r.level || r.difficulty || 0,
    levelName: r.levelName || ('第 ' + (r.level || r.difficulty || 0) + ' 档'),
    duration: records.formatDuration(r.durationSec || 0),
    // KPI
    combo: r.combo || 0,
    perfect: r.perfect || 0,
    hits: r.hits || 0,
    rings: r.rings || 0,
    accuracy: Math.round(r.accuracy || 0),
    distance: r.distance || 0,
    stableTime: r.stableTime || 0,
    calories: r.calories || 0,
    // 详情
    maxAngle: dim(cfg.maxAngle),
    deadZone: dim(cfg.deadZone),
    smoothing: dim(cfg.smoothing),
    session: cfg.sessionSeconds ? mmss(cfg.sessionSeconds) : '—',
    source: r.dataSource === 'simulation' ? '模拟数据' : '真实传感器',
    isSim: r.dataSource === 'simulation',
    stateText: STATE_TEXT[r.uploadState] || '待上报',
    state: r.uploadState || 'local',
    canUpload: r.dataSource !== 'simulation'
  }
}

Page({
  data: {
    list: [],
    stats: { total: 0, uploaded: 0, pending: 0 },
    uploadReady: false,
    uploadState: '未配置',
    expanded: '',
    pendingCount: 0,
    // 汇总：把「最好的一局」摆在最上面，治疗师一眼能看到进步
    best: null
  },

  onLoad() {
    this.load()
  },

  onShow() {
    // 从设置页/对局返回时可能新增了记录
    this.load()
  },

  onPullDownRefresh() {
    this.load()
    wx.stopPullDownRefresh()
  },

  load() {
    const cfg = records.getUploadConfig()
    const raw = records.list()
    const stats = records.stats()
    // 单条历史数据格式异常时不要让整页变成空白
    const view = []
    raw.forEach((r) => {
      try {
        view.push(toView(r))
      } catch (e) {
        console.error('[race-records] 记录解析失败', r && r.recordId, e)
      }
    })

    // 只统计真实传感器数据：模拟局不该出现在「最好成绩」里
    const real = view.filter((v) => !v.isSim)
    const best = real.reduce((a, b) => (b.score > (a ? a.score : -1) ? b : a), null)

    this.setData({
      list: view,
      stats: stats,
      uploadReady: !!cfg.url && cfg.enabled,
      // enabled = 有网络 && 已登录；只说"未配置"会让人以为地址没填
      uploadState: cfg.url ? (cfg.enabled ? '已配置' : '待登录或离线') : '未配置',
      pendingCount: stats.pending,
      best: best
    })
  },

  onToggle(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ expanded: this.data.expanded === id ? '' : id })
  },

  onUpload(e) {
    const id = e.currentTarget.dataset.id
    const rec = records.get(id)
    if (!rec) return
    if (rec.dataSource === 'simulation') {
      wx.showToast({ title: '模拟数据不上报', icon: 'none' })
      return
    }
    if (!this.data.uploadReady) {
      wx.showModal({
        title: '暂时无法上报',
        content: '记录目前只保存在本机。上报需要先登录并连通训练平台（地址由 utils/api.js 统一管理）。',
        showCancel: false
      })
      return
    }
    const rows = records.describePayload(rec)
    wx.showModal({
      title: '发送这条训练记录？',
      content:
        '将发送：' +
        rows.map((r) => r[0]).join('、') +
        '。用途：训练进度对比。不含姓名、证件号、联系方式。',
      confirmText: '同意发送',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '上传中', mask: true })
        records.upload(id, { consent: true }).then((r) => {
          wx.hideLoading()
          if (r.ok) wx.showToast({ title: '已上传', icon: 'success' })
          else wx.showToast({ title: r.error || '上传失败', icon: 'none', duration: 2200 })
          this.load()
        })
      }
    })
  },

  /** 批量上报：逐条串行，任一条失败继续下一条并统计 */
  onUploadAll() {
    const pending = records
      .list()
      .filter((r) => r.uploadState === 'local' || r.uploadState === 'failed')
      .filter((r) => r.dataSource !== 'simulation')
    if (!pending.length) {
      wx.showToast({ title: '没有待上报的记录', icon: 'none' })
      return
    }
    if (!this.data.uploadReady) {
      wx.showModal({
        title: '暂时无法上报',
        content: '记录只保存在本机。上报需要先登录并连通训练平台。',
        showCancel: false
      })
      return
    }
    wx.showModal({
      title: '上报 ' + pending.length + ' 条记录？',
      content:
        '将发送这些记录的昵称、难度、得分、连击、碰撞/完美闪避、能量环、稳定率、行驶距离、姿态参数快照、时间与数据来源。用途：训练进度对比。',
      confirmText: '同意上报',
      success: (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '上传中', mask: true })
        let i = 0
        let failed = 0
        const next = () => {
          if (i >= pending.length) {
            wx.hideLoading()
            wx.showToast({
              title: failed ? '完成，' + failed + ' 条失败' : '全部上报成功',
              icon: failed ? 'none' : 'success'
            })
            this.load()
            return
          }
          const id = pending[i].recordId
          i += 1
          records.upload(id, { consent: true }).then((r) => {
            if (!r.ok) failed += 1
            next()
          })
        }
        next()
      }
    })
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除这条记录？',
      content: '删除后无法恢复，也不会再上报。',
      confirmText: '删除',
      confirmColor: '#DF5540',
      success: (res) => {
        if (!res.confirm) return
        records.remove(id)
        this.load()
        wx.showToast({ title: '已删除', icon: 'none' })
      }
    })
  },

  onClearAll() {
    if (!this.data.list.length) return
    wx.showModal({
      title: '清空全部记录？',
      content: '将删除本机保存的 ' + this.data.list.length + ' 条记录，已上报的不会从服务器删除。',
      confirmText: '清空',
      confirmColor: '#DF5540',
      success: (res) => {
        if (!res.confirm) return
        records.clear()
        this.load()
        wx.showToast({ title: '已清空', icon: 'none' })
      }
    })
  }
})
