// fruit-records.js —— 接水果：训练记录（本地为准，可逐条或批量上报）
const records = require('../../../utils/fruit-record.js')

const STATE_TEXT = {
  local: '待上报',
  uploaded: '已上报',
  failed: '上报失败',
  unconfigured: '未配置接口',
  skipped: '模拟数据·不上报'
}

const TYPE_LABEL = {
  apple: '苹果',
  orange: '橙子',
  banana: '香蕉',
  strawberry: '草莓',
  watermelon: '西瓜'
}

function toView(r) {
  const bd = r.breakdown || {}
  const byType = r.byType || {}
  return {
    recordId: r.recordId,
    time: records.formatTime(r.startedAt),
    score: r.score,
    difficulty: r.difficulty,
    duration: records.formatDuration(r.durationSec || r.duration),
    hits: r.hits || 0,
    misses: r.misses || 0,
    accuracy: Math.round((r.accuracy || 0) * 100),
    combo: r.comboMax || 0,
    completed: !!r.completed,
    aborted: r.reason === 'aborted',
    source: r.dataSource === 'simulation' ? '模拟数据' : '真实数据',
    isSim: r.dataSource === 'simulation',
    stateText: STATE_TEXT[r.uploadState] || '待上报',
    state: r.uploadState || 'local',
    canUpload: r.dataSource !== 'simulation',
    pathLength: (r.pathLength || 0).toFixed(1),
    avgRate: (r.avgRate || 0).toFixed(2),
    interrupted: r.interrupted ? (r.interruptedSec || 0).toFixed(1) + ' 秒' : '无',
    grade: r.grade || '-',
    holdRate: (r.holdRate === undefined || r.holdRate === null) ? '暂无数据' : Math.round(r.holdRate * 100) + '%',
    holdBest: (r.holdBestSec || 0).toFixed(1),
    devAvg: (r.deviationAvgDeg || 0).toFixed(1),
    devMax: (r.deviationMaxDeg || 0).toFixed(1),
    devTol: r.holdToleranceDeg || 0,
    outCount: r.holdOutCount || 0,
    holdTime: (r.holdTimeSec || 0).toFixed(1),
    base: bd.rawBase !== undefined ? bd.rawBase : (bd.base || 0),
    comboBonus: bd.comboBonus || 0,
    finishBonus: bd.finishBonus || 0,
    types: Object.keys(TYPE_LABEL).map((k) => ({
      name: TYPE_LABEL[k],
      count: byType[k] || 0
    })),
    sway: (r.sway || []).map((s) => ({
      label: s.label,
      pct: Math.max(0, Math.min(100, Math.round((s.ratio || 0) * 100)))
    }))
  }
}

Page({
  data: {
    list: [],
    stats: { total: 0, uploaded: 0, pending: 0 },
    uploadReady: false,
    uploadState: '未配置',
    expanded: '',
    pendingCount: 0
  },

  onLoad() {
    this.load()
  },

  onShow() {
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
        console.error('[fruit-records] 记录解析失败', r && r.recordId, e)
      }
    })
    this.setData({
      list: view,
      stats: stats,
      uploadReady: !!cfg.url && cfg.enabled,
      uploadState: cfg.url ? (cfg.enabled ? '已配置' : '已填写未启用') : '未配置',
      pendingCount: stats.pending
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
        title: '未配置上报接口',
        content: '记录目前只保存在本机。管理员可在「接水果 · 训练设置」中填写上报接口地址，之后再来上报。',
        showCancel: false
      })
      return
    }
    const rows = records.describePayload(rec)
    wx.showModal({
      title: '发送这条训练记录？',
      content: '将发送：' + rows.map((r) => r[0]).join('、') +
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
    const pending = records.list()
      .filter((r) => r.uploadState === 'local' || r.uploadState === 'failed')
      .filter((r) => r.dataSource !== 'simulation')
    if (!pending.length) {
      wx.showToast({ title: '没有待上报的记录', icon: 'none' })
      return
    }
    if (!this.data.uploadReady) {
      wx.showModal({
        title: '未配置上报接口',
        content: '记录只保存在本机。请先在「训练设置」中填写上报接口。',
        showCancel: false
      })
      return
    }
    wx.showModal({
      title: '上报 ' + pending.length + ' 条记录？',
      content: '将发送这些记录的昵称、难度、得分、接住/漏接数、成功率、时长、轨迹与左右分布摘要、数据来源和时间。用途：训练进度对比。',
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
