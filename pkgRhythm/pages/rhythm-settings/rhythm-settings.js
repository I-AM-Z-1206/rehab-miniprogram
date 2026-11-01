// rhythm-settings.js —— 节奏训练：治疗师训练参数
// 所有参数写入 utils/rhythm-config.js（独立存储键 rhythm_cfg_v1），改动立即生效。
const { getStore, SCHEMA, GROUPS, PRESETS, validate } = require('../../../utils/rhythm-config.js')
const { SONGS, songById } = require('../../../utils/rhythm-songs.js')

const AXIS_LABEL = { pitch: 'Pitch 轴', roll: 'Roll 轴' }

// 音符数估算（门控口径）：一个完整周期 = 飞行 + 保持 + 喘息，
// 患者自己磨蹭的时间不算在内 —— 所以这是「做得顺的话大概几个」。
function estimateNotes(cfg, durSec) {
  const approach = Number(cfg.get('approachMs')) || 1700
  const gap = Number(cfg.get('gapMs')) || 0
  const hold = Number(cfg.get('holdMs')) || 400
  const cycle = Math.max(1200, approach + gap + hold)
  const prep = Number(cfg.get('prepMs')) || 2000
  return Math.max(1, Math.round(Math.max(0, durSec * 1000 - prep) / cycle))
}

function fmt(key, value) {
  const meta = SCHEMA[key]
  if (!meta) return String(value)
  if (meta.type === 'bool') return value ? '开' : '关'
  if (key === 'songId') return songById(value).name
  if (key === 'backgroundId') return ({ dawn: '清晨逆光', dusk: '暮色蓝调', moon: '月夜银' })[value] || value
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
        // BPM 不再决定节奏（门控驱动），这里描述的是「命中时听到的音色」
        desc: s.sub + ' · ' + s.tag + '音色',
        active: s.songId === cfg.get('songId')
      })),
      // 五档对比：让治疗师一眼看出差别（只读，改参数请用下面的滑块）
      presetRows: [1, 2, 3, 4, 5].map((lv) => {
        const p = PRESETS[lv]
        return {
          lv: lv,
          active: lv === cfg.get('difficulty'),
          step: p.holdMs + 'ms',
          window: p.gapMs + 'ms',
          fly: (p.approachMs / 1000).toFixed(1) + ' 秒',
          duration: p.durationSec + ' 秒'
        }
      }),
      errors: v.errors,
      warnings: v.warnings,
      syncOffsetMs: Number(cfg.get('syncOffsetMs')) || 0,
      // 门控下这是「做得顺的话大概几个」，实际由患者速度决定
      notePreview: '节奏顺的话本局约 ' + estimateNotes(cfg, dur) + ' 个音符，做不到的会一直等'
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

  // ---------------------------------------------------------------- 校验
  onCheck() {
    const v = this.cfg.validate()
    this.setData({ errors: v.errors, warnings: v.warnings })
    if (v.ok) wx.showToast({ title: '参数有效，可以开始训练', icon: 'none' })
  }
})
