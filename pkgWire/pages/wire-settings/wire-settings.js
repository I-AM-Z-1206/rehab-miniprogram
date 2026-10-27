// wire-settings.js —— 走钢丝：治疗师训练参数设置
// 所有参数写入 utils/wire-config.js（独立存储键），游戏进行中也可从别的入口修改
const { getStore, SCHEMA, GROUPS, PRESETS, validate } = require('../../../utils/wire-config.js')
const records = require('../../../utils/training-record.js')

const AXIS_LABEL = { pitch: 'Pitch 轴', roll: 'Roll 轴' }
const FAIL_LABEL = { penalty: '暂停前进 + 扣分', terminate: '直接结束本局' }

function fmt(key, value) {
  const meta = SCHEMA[key]
  if (!meta) return String(value)
  if (meta.type === 'bool') return value ? '开' : '关'
  if (key === 'axisX' || key === 'axisY') return AXIS_LABEL[value] || value
  if (key === 'failRule') return FAIL_LABEL[value] || value
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
    errors: [],
    warnings: [],
    uploadUrl: '',
    uploadToken: '',
    uploadState: '未配置',
    saving: false
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
            label: AXIS_LABEL[o] || FAIL_LABEL[o] || String(o),
            active: o === value
          }))
        }
      })
      return { name: g, items: items }
    }).filter((g) => g.items.length > 0)

    const v = validate(cfg.all())
    const upload = records.getUploadConfig()
    this.setData({
      groups: groups,
      difficulty: cfg.get('difficulty'),
      difficultyLabel: PRESETS[cfg.get('difficulty')] ? PRESETS[cfg.get('difficulty')].label : '',
      presets: [1, 2, 3, 4, 5].map((lv) => ({
        lv: lv,
        label: (PRESETS[lv].label.split('·')[1] || '').trim() || ('第 ' + lv + ' 档'),
        active: lv === cfg.get('difficulty')
      })),
      errors: v.errors,
      warnings: v.warnings,
      uploadUrl: upload.url || '',
      uploadState: upload.url ? (upload.enabled ? '已配置' : '已填写但未启用') : '未配置'
    })
  },

  // ---------------------------------------------------------------- 参数
  onSlide(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    const value = Number(e.detail.value)
    this.cfg.set(key, value, 'ui:slider')
    this.patchDisplay(key, e.detail.value)
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

  /** 松手时再校验一次（拖动过程中不做整表刷新，避免滑块抖） */
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
    if (!key) return
    let value = raw
    if (raw === 'pitch' || raw === 'roll') value = raw
    else if (raw === 'penalty' || raw === 'terminate') value = raw
    else if (!isNaN(Number(raw))) value = Number(raw)
    this.cfg.set(key, value, 'ui:option')
    this.syncAll()
  },

  onDifficultyTap(e) {
    const lv = Number(e.currentTarget.dataset.lv)
    if (!lv) return
    wx.showModal({
      title: '切换到第 ' + lv + ' 档？',
      content: '会套用该档位的推荐参数（时长、里程、速度、边界、阈值），之后仍可单项微调。',
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
    if (v.ok) {
      wx.showToast({ title: '参数有效，可以开始训练', icon: 'none' })
    }
  }
})
