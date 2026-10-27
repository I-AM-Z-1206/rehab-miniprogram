// ============================================================================
// pages/shoot-settings/shoot-settings.js —— 射击训练：治疗师训练参数
// ----------------------------------------------------------------------------
// 这些参数原来挤在游戏页的治疗师控制台里（占掉半个屏幕），现在独立成页，
// 和接水果 / 走钢丝 / 节奏训练一致：游戏页只有画面，参数来这里调。
//
// 所有改动写进 utils/game/config.js（存储键 shoot_cfg_v2），
// 回到游戏页后引擎下一帧就按新参数跑，不需要重开一局。
// ============================================================================

const { getStore, SCHEMA, PANEL_GROUPS } = require('../../../utils/game/config.js')

// 单位里的「±°」只是面板写法，展示时用普通度号
const UNIT_TEXT = { '±°': '°' }

function fmt(key, value) {
  const meta = SCHEMA[key]
  if (!meta) return String(value)
  if (meta.type === 'bool') return value ? '开' : '关'
  const unit = UNIT_TEXT[meta.unit] || meta.unit || ''
  const num = typeof value === 'number' ? Math.round(value * 100) / 100 : value
  return num + (unit ? ' ' + unit : '')
}

Page({
  data: {
    groups: [],
    difficulties: [],
    difficultyLabel: '',
    scoreMul: 1,
    durationText: '',
    rangeText: '',
    baseScoreText: ''
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
    const cur = cfg.get('difficulty')

    const difficulties = cfg.listDifficulty().map((d) => ({
      key: d.key,
      label: d.label,
      mul: d.scoreMul,
      active: d.key === cur
    }))

    const groups = PANEL_GROUPS.map((name) => {
      const keys = Object.keys(SCHEMA).filter((k) => {
        const meta = SCHEMA[k]
        return meta.group === name && !meta.hidden && k !== 'difficulty'
      })
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
          step: meta.step
        }
      })
      return { name: name, items: items }
    }).filter((g) => g.items.length > 0)

    const range = cfg.getScoreRange()
    const meta = cfg.getDifficulty()
    this.setData({
      groups: groups,
      difficulties: difficulties,
      difficultyLabel: meta.label,
      scoreMul: meta.scoreMul,
      durationText: (Number(cfg.get('gameDuration')) || 0) > 0
        ? (Number(cfg.get('gameDuration')) + ' 秒')
        : '不限时',
      rangeText: range[0] + ' ~ ' + range[1] + ' 分',
      baseScoreText: fmt('baseScorePerSecond', cfg.get('baseScorePerSecond'))
    })
  },

  /** 切换难度：套用推荐参数（之后仍可逐项微调） */
  onDifficultyTap(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    const res = this.cfg.applyDifficulty(key)
    this.syncAll()
    if (wx.showToast) {
      wx.showToast({
        title: '已切换：' + this.cfg.getDifficulty().label + '（得分系数 x' + res.scoreMul + '）',
        icon: 'none'
      })
    }
  },

  /** 拖动中实时写配置：游戏页下一帧就生效 */
  onSlide(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    this.cfg.set(key, Number(e.detail.value), 'ui:slider')
    this.syncAll()
  },

  /** 松手时再同步一次，保证分数区间等联动参数收敛后显示正确 */
  onSlideChange(e) {
    this.onSlide(e)
  },

  onToggle(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    this.cfg.set(key, !!e.detail.value, 'ui:switch')
    this.syncAll()
  },

  onReset() {
    const that = this
    wx.showModal({
      title: '恢复默认参数',
      content: '将把全部训练参数恢复为默认值（不影响历史成绩）。',
      success: (res) => {
        if (!res.confirm) return
        that.cfg.reset()
        that.syncAll()
        wx.showToast({ title: '已恢复默认', icon: 'success' })
      }
    })
  },

  /** 回游戏页看效果 */
  onBack() {
    wx.navigateBack()
  }
})
