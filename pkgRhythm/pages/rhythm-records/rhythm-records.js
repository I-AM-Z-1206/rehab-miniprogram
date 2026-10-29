// rhythm-records.js —— 节奏训练：训练记录（本地为准，可逐条或批量上报）
const records = require('../../utils/rhythm-record.js')

const STATE_TEXT = {
  local: '待上报',
  uploaded: '已上报',
  failed: '上报失败',
  unconfigured: '未配置接口',
  skipped: '模拟数据·不上报'
}

function pct(v) {
  return (v === null || v === undefined) ? '暂无数据' : Math.round(v * 100) + '%'
}

function toView(r) {
  const bd = r.breakdown || {}
  return {
    recordId: r.recordId,
    time: records.formatTime(r.startedAt || r.recordedAt),
    songName: r.songName || r.songId || '未命名曲目',
    bpm: r.bpm || '-',
    score: r.score || 0,
    difficulty: r.difficulty || '-',
    duration: records.formatDuration(r.durationSec || r.duration),
    perfect: r.perfectCount || r.perfect || 0,
    great: r.greatCount || r.great || 0,
    good: r.goodCount || r.good || 0,
    miss: r.missCount || r.miss || 0,
    totalNotes: r.noteCount || ((r.perfect || 0) + (r.great || 0) + (r.good || 0) + (r.miss || 0)),
    combo: r.comboMax || 0,
    left: r.leftHitCount || 0,
    right: r.rightHitCount || 0,
    wrongDir: r.wrongDirectionCount || 0,
    rhythmAcc: pct(r.rhythmAccuracy),
    dirAcc: pct(r.directionAccuracy),
    hitRate: pct(r.overallHitRate),
    syncOffset: (r.syncOffsetMs > 0 ? '+' : '') + (r.syncOffsetMs || 0) + ' ms',
    completed: !!r.completed,
    aborted: r.reason === 'aborted',
    source: r.dataSource === 'simulation' ? '模拟数据' : '真实数据',
    isSim: r.dataSource === 'simulation',
    stateText: STATE_TEXT[r.uploadState] || '待上报',
    state: r.uploadState || 'local',
    canUpload: r.dataSource !== 'simulation',
    interrupted: r.interrupted ? (r.interruptedSec || 0).toFixed(1) + ' 秒' : '无',
    grade: r.grade || '-',
    base: bd.base || 0,
    comboBonus: bd.comboBonus || 0,
    finishBonus: bd.finishBonus || 0
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
        content: '记录目前只保存在本机。管理员可在「节奏训练 · 训练设置」中填写上报接口地址，之后再来上报。',
        showCancel: false
      })
      return
    }
    const rows = records.describePayload(rec)
    const preview = rows.slice(0, 6).map((r) => r[0] + '：' + r[1]).join('\n')
    wx.showModal({
      title: '上报本局记录？',
      content: '将发送以下内容，用于训练进度对比：\n' + preview +
        '\n…（共 ' + rows.length + ' 项，不含姓名、证件号、联系方式）',
      confirmText: '同意上报',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return
        records.upload(id, { consent: true }).then((r) => {
          wx.showToast({
            title: r.ok ? '已上报' : ('失败：' + (r.error || '稍后重试')),
            icon: 'none', duration: 2200
          })
          this.load()
        })
      }
    })
  },

  onUploadAll() {
    const pend = this.data.list.filter((it) => it.canUpload && (it.state === 'local' || it.state === 'failed'))
    if (!pend.length) {
      wx.showToast({ title: '没有待上报的记录', icon: 'none' })
      return
    }
    if (!this.data.uploadReady) {
      wx.showModal({
        title: '未配置上报接口',
        content: '记录目前只保存在本机。管理员可在「训练设置」中填写上报接口地址。',
        showCancel: false
      })
      return
    }
    wx.showModal({
      title: '批量上报 ' + pend.length + ' 条？',
      content: '会按时间顺序逐条发送本机记录（仅训练数据，不含姓名与联系方式）。',
      confirmText: '同意上报',
      success: (res) => {
        if (!res.confirm) return
        this.runBatch(pend)
      }
    })
  },

  runBatch(list) {
    let ok = 0
    let fail = 0
    const step = (i) => {
      if (i >= list.length) {
        wx.showToast({ title: '完成：成功 ' + ok + ' 条，失败 ' + fail + ' 条', icon: 'none', duration: 2400 })
        this.load()
        return
      }
      records.upload(list[i].recordId, { consent: true }).then((r) => {
        if (r.ok) ok += 1
        else fail += 1
        step(i + 1)
      })
    }
    step(0)
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除这条记录？',
      content: '删除后本机不再保留，已上报的数据不受影响。',
      confirmText: '删除',
      confirmColor: '#d9534f',
      success: (res) => {
        if (!res.confirm) return
        records.remove(id)
        this.load()
      }
    })
  },

  onClear() {
    wx.showModal({
      title: '清空本机记录？',
      content: '会删除本机保存的全部节奏训练记录，不可恢复。',
      confirmText: '清空',
      confirmColor: '#d9534f',
      success: (res) => {
        if (!res.confirm) return
        records.clear()
        this.load()
      }
    })
  },

  goSettings() {
    wx.navigateTo({ url: '/pkgRhythm/pages/rhythm-settings/rhythm-settings' })
  }
})
