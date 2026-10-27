// wire-records.js —— 走钢丝：训练记录（本地为准，可逐条或批量上报）
const records = require('../../../utils/training-record.js')

const STATE_TEXT = {
  local: '待上报',
  uploaded: '已上报',
  failed: '上报失败',
  unconfigured: '未配置接口',
  skipped: '模拟数据·不上报'
}

function toView(r) {
  return {
    recordId: r.recordId,
    time: records.formatTime(r.startedAt),
    score: r.score,
    difficulty: r.difficulty,
    duration: records.formatDuration(r.durationSec || r.duration),
    distance: (r.distance || 0).toFixed(1),
    stable: (r.stableSec || 0).toFixed(1),
    offCount: r.offCount || 0,
    rope: r.ropeTriggers || 0,
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
    breakdown: r.breakdown || null,
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
    this.setData({
      list: raw.map(toView),
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
        content: '记录目前只保存在本机。管理员可在「走钢丝 · 训练设置」中填写上报接口地址，之后再来上报。',
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

  /** 批量上报：逐条串行，任一条失败会提示并停止 */
  onUploadAll() {
    const pending = records.list().filter((r) => r.uploadState === 'local' || r.uploadState === 'failed')
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
      content: '将发送这些记录的昵称、难度、得分、时长、距离、稳定时间、偏离与保险绳次数、数据来源和时间。用途：训练进度对比。',
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
