// rhythm-settings.js —— 节奏训练：治疗师训练参数
// 所有参数写入 utils/rhythm-config.js（独立存储键 rhythm_cfg_v1），改动立即生效。
const { getStore, SCHEMA, GROUPS, PRESETS, validate } = require('../../../utils/rhythm-config.js')
const { SONGS, songById } = require('../../../utils/rhythm-songs.js')
const records = require('../../utils/rhythm-record.js')

const AXIS_LABEL = { pitch: 'Pitch 轴', roll: 'Roll 轴' }

// 音符数估算：间隔已经是毫秒，直接用时长除，不再绕 BPM 换算
function estimateNotes(cfg, durSec) {
  const gap = Math.max(620, Number(cfg.get('noteGapMs')) || 1100)
  const prep = Number(cfg.get('prepMs')) || 2400
  return Math.max(1, Math.round(Math.max(0, durSec * 1000 - prep) / gap))
}

function fmt(key, value) {
  const meta = SCHEMA[key]
  if (!meta) return String(value)
  if (meta.type === 'bool') return value ? '开' : '关'
  if (key === 'songId') return songById(value).name + ' · ' + songById(value).bpm + ' BPM'
  if (key === 'axisX' || key === 'axisY') return AXIS_LABEL[value] || value
  if (key === 'difficulty') return '第 ' + value + ' 档'
  const num = typeof value === 'number' ? Math.round(value * 100) / 100 : value
  return num + (meta.unit ? ' ' + meta.unit : '')
}

Page({
  data: {
    groups: [],
    difficulty: 2,
    difficultyLabel: '',
    presets: [],
    presetRows: [],
    songs: [],
    errors: [],
    warnings: [],
    uploadUrl: '',
    uploadToken: '',
    uploadState: '未配置',
    syncOffsetMs: 0,
    notePreview: ''
  },

  onLoad() {
    this.cfg = getStore()
    this.syncAll()
  },

  onShow() {
    this.syncAll()
  },

  syncAll() {
    const cfg = this.cfg
    const groups = GROUPS.map((g) => {
      const keys = Object.keys(SCHEMA).filter((k) => SCHEMA[k].group === g && k !== 'difficulty')
      const items = keys.map((k) => {
        const meta = SCHEMA[k]
        const value = cfg.get(k)
        return {
          key: k,
          label: meta.label,
          tip: meta.tip || '',
          type: meta.type,
          value: value,
          display: fmt(k, value),
          min: meta.min,
          max: meta.max,
          step: meta.step,
          options: (meta.options || []).map((o) => ({
            value: o,
            label: (meta.labels && meta.labels[o]) || AXIS_LABEL[o] || String(o),
            active: o === value
          }))
        }
      })
      return { name: g, items: items }
    }).filter((g) => g.items.length > 0)

    const v = validate(cfg.all())
    const upload = records.getUploadConfig()
    const dur = Number(cfg.get('durationSec')) || 90
    this.setData({
      groups: groups,
      difficulty: cfg.get('difficulty'),
      difficultyLabel: PRESETS[cfg.get('difficulty')] ? PRESETS[cfg.get('difficulty')].label : '',
      presets: [1, 2, 3, 4, 5].map((lv) => ({
        lv: lv,
        label: PRESETS[lv].label,
        active: lv === cfg.get('difficulty')
      })),
      songs: SONGS.map((s) => ({
        songId: s.songId,
        name: s.name,
        desc: s.bpm + ' BPM · ' + s.loopBars + ' 小节循环 · ' + s.tag,
        active: s.songId === cfg.get('songId')
      })),
      // 五档对比：让治疗师一眼看出差别（只读，改参数请用下面的滑块）
      presetRows: [1, 2, 3, 4, 5].map((lv) => {
        const p = PRESETS[lv]
        return {
          lv: lv,
          active: lv === cfg.get('difficulty'),
          step: p.noteGapMs + 'ms',
          window: '±' + p.goodMs + 'ms',
          fly: (p.approachMs / 1000).toFixed(1) + ' 秒',
          duration: p.durationSec + ' 秒'
        }
      }),
      errors: v.errors,
      warnings: v.warnings,
      uploadUrl: upload.url || '',
      uploadState: upload.url ? (upload.enabled ? '已配置' : '已填写但未启用') : '未配置',
      syncOffsetMs: Number(cfg.get('syncOffsetMs')) || 0,
      // 音符数按毫秒直接算：间隔不再经过 BPM 换算，换曲子这个数字不变
      notePreview: '本局约 ' + estimateNotes(cfg, dur) + ' 个音符'
    })
  },

  // ---------------------------------------------------------------- 参数
  onSlide(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    const value = Number(e.detail.value)
    this.cfg.set(key, value, 'ui:slider')
    this.patchDisplay(key, value)
  },

  /** 拖动中只更新显示，避免整表重建导致滑块抖动 */
  patchDisplay(key, value) {
    const groups = this.data.groups
    for (let gi = 0; gi < groups.length; gi++) {
      const items = groups[gi].items
      for (let i = 0; i < items.length; i++) {
        if (items[i].key === key) {
          this.setData({
            ['groups[' + gi + '].items[' + i + '].value']: value,
            ['groups[' + gi + '].items[' + i + '].display']: fmt(key, Number(value))
          })
          return
        }
      }
    }
  },

  onSlideEnd() {
    const v = this.cfg.validate()
    this.setData({ errors: v.errors, warnings: v.warnings })
  },

  onSlideChange(e) {
    this.onSlide(e)
    this.onSlideEnd()
  },

  onToggle(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    this.cfg.set(key, !!e.detail.value, 'ui:switch')
    this.syncAll()
  },

  onOptionTap(e) {
    const key = e.currentTarget.dataset.key
    const raw = e.currentTarget.dataset.value
    if (!key || raw === undefined) return
    const meta = SCHEMA[key]
    // 数值型选项转数字，枚举型（轴向 / 曲目）保持字符串
    const value = meta && meta.type === 'num' ? Number(raw) : raw
    this.cfg.set(key, value, 'ui:option')
    this.syncAll()
  },

  onSongTap(e) {
    const songId = e.currentTarget.dataset.song
    if (!songId) return
    this.cfg.set('songId', songId, 'ui:song')
    this.syncAll()
    const s = songById(songId)
    wx.showToast({ title: '已选择《' + s.name + '》', icon: 'none' })
  },

  onDifficultyTap(e) {
    const lv = Number(e.currentTarget.dataset.lv)
    if (!lv) return
    wx.showModal({
      title: '切换到第 ' + lv + ' 档？',
      content: '会套用该档位的推荐参数（音符间隔、休止比例、判定窗口、飞行时间、时长、预备拍），之后仍可单项微调。',
      confirmText: '套用',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return
        this.cfg.applyDifficulty(lv)
        this.syncAll()
        wx.showToast({ title: '已套用第 ' + lv + ' 档', icon: 'none' })
      }
    })
  },

  onReset() {
    wx.showModal({
      title: '恢复默认参数',
      content: '所有治疗参数将恢复为默认值，历史训练记录不受影响。',
      confirmText: '恢复',
      success: (res) => {
        if (!res.confirm) return
        this.cfg.reset()
        this.syncAll()
        wx.showToast({ title: '已恢复默认', icon: 'success' })
      }
    })
  },

  // ---------------------------------------------------------------- 上报配置
  onUrlInput(e) {
    this.setData({ uploadUrl: e.detail.value })
  },

  onTokenInput(e) {
    this.setData({ uploadToken: e.detail.value })
  },

  onSaveUpload() {
    const url = (this.data.uploadUrl || '').trim()
    if (url && !/^https:\/\//i.test(url)) {
      wx.showModal({
        title: '地址格式提示',
        content: '上报地址必须是 https 开头的接口地址。小程序不允许请求 http 明文接口。',
        showCancel: false
      })
      return
    }
    records.setUploadConfig({ url: url, token: this.data.uploadToken || '', enabled: !!url })
    this.syncAll()
    wx.showToast({ title: url ? '已保存' : '已清空', icon: 'none' })
  },

  // ---------------------------------------------------------------- 校验
  onCheck() {
    const v = this.cfg.validate()
    this.setData({ errors: v.errors, warnings: v.warnings })
    if (v.ok) wx.showToast({ title: '参数有效，可以开始训练', icon: 'none' })
  }
})
