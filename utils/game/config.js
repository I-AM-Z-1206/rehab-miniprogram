// ============================================================================
// utils/game/config.js —— FR-GAME-01 配置中心（ConfigStore）
// ----------------------------------------------------------------------------
// 职责：
//   1. 声明全部可配置项（SCHEMA），治疗师面板根据 SCHEMA 自动生成控件；
//   2. 统一做取值校验 / 区间收敛 / 步进取整（非法输入不会把游戏搞崩）；
//   3. 变更广播（subscribe）：任何页面、任何模块改配置，运行中的游戏立刻生效；
//   4. 本地持久化（wx.storage），重启小程序后治疗师的参数仍然保留；
//   5. 难度档位预设（DIFFICULTIES）：一键套用一组参数，之后仍可单独微调。
//
// 玩法（静态保持）：屏幕中间固定一只小怪兽，患者左右移动身体（按实机佩戴方向读 Pitch）
// 把准星对准怪兽持续射击；偏离超过 keepRangeDeg 会提示回到中间、基础分暂停，
// 但子弹仍然继续发射。击中怪兽会露出悲伤表情。
//
// 配置项一览（治疗师可调）：
//   计时与计分  gameDuration / baseScorePerSecond / tickMs / baseTickMs
//   子弹        fireRate / bulletSpeed / spreadDeg
//   判定        hitRange / comboWindowMs / comboStep / comboMaxMul
//   得分浮动    scoreMin / scoreMax                （单次命中基础分的浮动区间）
//   保持范围    keepRangeDeg / maxLeanDeg / deadzoneDeg / smooth
//   目标        targetRadius                      （固定小怪兽尺寸）
//   难度        difficulty
//   显示与音频  showHitArea / sfxOn / bgmOn
// ============================================================================

const STORAGE_KEY = 'shoot_cfg_v2'
const SAVE_DELAY = 300 // 配置写盘防抖(ms)：拖动滑块时不会狂写 storage

// ---------------------------------------------------------------------------
// 配置项声明（min / max / step / unit 同时是面板控件的定义）
// ---------------------------------------------------------------------------
const SCHEMA = {
  // ---------- 计时与计分 ----------
  gameDuration: { group: '计时与计分', label: '游戏时长', unit: '秒', type: 'num', min: 0, max: 300, step: 5, def: 60, tip: '0 表示不限时' },
  baseScorePerSecond: { group: '计时与计分', label: '每秒基础分', unit: '分', type: 'num', min: 0, max: 10, step: 0.5, def: 1, tip: '每秒结算一次，仅在保持范围内累加' },
  tickMs: { group: '计时与计分', label: '判定刻度', unit: 'ms', type: 'num', min: 100, max: 500, step: 100, def: 100, hidden: true, tip: '0.1s = 100ms' },
  baseTickMs: { group: '计时与计分', label: '计分刻度', unit: 'ms', type: 'num', min: 1000, max: 1000, step: 1000, def: 1000, hidden: true },

  // ---------- 子弹 ----------
  fireRate: { group: '子弹发射', label: '发射频率', unit: '发/秒', type: 'num', min: 0.5, max: 12, step: 0.5, def: 3 },
  bulletSpeed: { group: '子弹发射', label: '子弹速度', unit: 'px/s', type: 'num', min: 300, max: 1400, step: 20, def: 760, hidden: true },
  spreadDeg: { group: '子弹发射', label: '散射角', unit: '°', type: 'num', min: 0, max: 10, step: 0.5, def: 0, hidden: true },

  // ---------- 判定 ----------
  hitRange: { group: '击中判定', label: '击中判定半径', unit: 'px', type: 'num', min: 8, max: 200, step: 2, def: 60, tip: '击中范围=以怪兽圆心为原点的容错半径，游戏进行中可实时修改' },
  comboWindowMs: { group: '击中判定', label: '连击窗口', unit: 'ms', type: 'num', min: 100, max: 1000, step: 50, def: 100, tip: '默认 100ms（0.1 秒刻度内连续击中）' },
  comboStep: { group: '击中判定', label: '每级连击加成', unit: '', type: 'num', min: 0, max: 1, step: 0.05, def: 0.15, hidden: true },
  comboMaxMul: { group: '击中判定', label: '连击加成上限', unit: '倍', type: 'num', min: 1, max: 6, step: 0.5, def: 3, hidden: true },

  // ---------- 得分浮动区间 ----------
  scoreMin: { group: '得分浮动', label: '单次得分下限', unit: '分', type: 'num', min: 0, max: 99, step: 1, def: 1 },
  scoreMax: { group: '得分浮动', label: '单次得分上限', unit: '分', type: 'num', min: 0, max: 99, step: 1, def: 3 },

  // ---------- 保持范围（体感，静态保持） ----------
  // 按实机佩戴方向，左右移动读取 Pitch 轴（实测该轴对应左右方向）；Roll 仅缓存。
  // 游戏小人按“镜像”方式跟随（见 pose.js），因此不再提供左右轴切换 / 反向开关。
  keepRangeDeg: { group: '保持范围', label: '允许偏离角度', unit: '±°', type: 'num', min: 1, max: 60, step: 1, def: 6, tip: '静态保持：身体偏离超过该角度即提示回到中间，并暂停基础分（子弹仍会发射）' },
  maxLeanDeg: { group: '保持范围', label: '满量程倾斜角', unit: '°', type: 'num', min: 8, max: 60, step: 1, def: 20, tip: '越小越灵敏：倾斜到该角度时准星到达屏幕边缘' },
  deadzoneDeg: { group: '保持范围', label: '中心死区', unit: '°', type: 'num', min: 0, max: 10, step: 0.5, def: 1, hidden: true },
  // smooth 是“跟手度”（0.5…1，越大越跟手）；默认 0.6，低于 0.5 会明显拖影，故不开放
  smooth: { group: '保持范围', label: '姿态跟手度', type: 'num', min: 0.5, max: 1, step: 0.05, def: 0.6, tip: '越大越跟手、延迟越低；0.5 以下会明显拖影，故不开放' },

  // ---------- 目标（固定小怪兽） ----------
  targetRadius: { group: '目标', label: '怪兽大小', unit: 'px', type: 'num', min: 12, max: 48, step: 2, def: 22, hidden: true },

  // ---------- 难度 ----------
  difficulty: { group: '难度', label: '难度档位', type: 'enum', def: 'normal', options: ['easy', 'normal', 'hard', 'expert'] },

  // ---------- 显示 / 音频 ----------
  showHitArea: { group: '显示', label: '显示判定圈', type: 'bool', def: false },
  sfxOn: { group: '音频', label: '音效', type: 'bool', def: true },
  bgmOn: { group: '音频', label: '背景音乐', type: 'bool', def: true }
}

// ---------------------------------------------------------------------------
// 难度档位预设：切换难度 = 一次性写入这一组参数（之后仍可单项微调）
// scoreMul 是命中得分的难度系数
// ---------------------------------------------------------------------------
const DIFFICULTIES = {
  easy: {
    label: '简单', scoreMul: 0.8,
    fireRate: 2, hitRange: 88, scoreMin: 1, scoreMax: 2,
    keepRangeDeg: 10, maxLeanDeg: 24, comboStep: 0.1, comboMaxMul: 2, targetRadius: 26
  },
  normal: {
    label: '标准', scoreMul: 1,
    fireRate: 3, hitRange: 60, scoreMin: 1, scoreMax: 3,
    keepRangeDeg: 6, maxLeanDeg: 20, comboStep: 0.15, comboMaxMul: 3, targetRadius: 22
  },
  hard: {
    label: '困难', scoreMul: 1.5,
    fireRate: 4, hitRange: 44, scoreMin: 2, scoreMax: 5,
    keepRangeDeg: 4, maxLeanDeg: 18, comboStep: 0.2, comboMaxMul: 4, targetRadius: 20
  },
  expert: {
    label: '极限', scoreMul: 2,
    fireRate: 5, hitRange: 32, scoreMin: 3, scoreMax: 8,
    keepRangeDeg: 2, maxLeanDeg: 16, comboStep: 0.25, comboMaxMul: 5, targetRadius: 18
  }
}

// 面板分组顺序
const PANEL_GROUPS = ['计时与计分', '子弹发射', '击中判定', '得分浮动', '保持范围', '目标', '难度', '显示', '音频']

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------
function isNum(v) {
  return typeof v === 'number' && isFinite(v)
}

function clampNum(value, meta) {
  let v = Number(value)
  if (!isFinite(v)) v = meta.def
  if (isNum(meta.min) && v < meta.min) v = meta.min
  if (isNum(meta.max) && v > meta.max) v = meta.max
  if (meta.step) v = Math.round(v / meta.step) * meta.step
  // 保留两位小数，避免 0.30000000000000004 之类
  return Math.round(v * 100) / 100
}

/** 按 SCHEMA 校验并收敛一个配置值 */
function coerce(key, value) {
  const meta = SCHEMA[key]
  if (!meta) return undefined
  if (meta.type === 'bool') {
    if (typeof value === 'boolean') return value
    if (value === 'true' || value === 1 || value === '1') return true
    if (value === 'false' || value === 0 || value === '0') return false
    return meta.def
  }
  if (meta.type === 'enum') {
    const opts = meta.options || Object.keys(DIFFICULTIES)
    return opts.indexOf(value) >= 0 ? value : meta.def
  }
  return clampNum(value, meta)
}

function defaults() {
  const d = {}
  Object.keys(SCHEMA).forEach((k) => { d[k] = SCHEMA[k].def })
  return d
}

const DEFAULT_CONFIG = defaults()

// ---------------------------------------------------------------------------
// ConfigStore
// ---------------------------------------------------------------------------
class ConfigStore {
  constructor(options) {
    const opt = options || {}
    this.key = opt.storageKey || STORAGE_KEY
    this.persistEnabled = opt.persist !== false
    this.state = defaults()
    this.listeners = []
    this.saveTimer = null
    if (this.persistEnabled) this.load()
  }

  // ---------- 读写 ----------
  get(key) {
    if (key === undefined) return this.state
    const v = this.state[key]
    return v === undefined ? (SCHEMA[key] ? SCHEMA[key].def : undefined) : v
  }

  all() {
    return Object.assign({}, this.state)
  }

  /** 批量修改（治疗师面板 / 远程 API 都走这里），返回真正变化的键 */
  patch(partial, source) {
    if (!partial) return []
    const changed = []
    Object.keys(partial).forEach((k) => {
      if (!SCHEMA[k]) return
      const next = coerce(k, partial[k])
      if (next === undefined) return
      if (this.state[k] !== next) {
        this.state[k] = next
        changed.push(k)
      }
    })
    if (!changed.length) return changed
    // 得分区间自洽：min 不能大于 max
    this.fixScoreRange(changed)
    this.scheduleSave()
    this.emit(changed, source || 'patch')
    return changed
  }

  set(key, value, source) {
    const p = {}
    p[key] = value
    const changed = this.patch(p, source || ('set:' + key))
    return changed.length ? this.state[key] : this.get(key)
  }

  fixScoreRange(changed) {
    if (changed.indexOf('scoreMin') >= 0 && this.state.scoreMin > this.state.scoreMax) {
      this.state.scoreMax = this.state.scoreMin
    }
    if (changed.indexOf('scoreMax') >= 0 && this.state.scoreMax < this.state.scoreMin) {
      this.state.scoreMin = this.state.scoreMax
    }
  }

  /** 得分浮动区间 [min, max]（已保证 min <= max） */
  getScoreRange() {
    const a = this.state.scoreMin
    const b = this.state.scoreMax
    return a <= b ? [a, b] : [b, a]
  }

  // ---------- 难度 ----------
  listDifficulty() {
    return Object.keys(DIFFICULTIES).map((k) => ({
      key: k,
      label: DIFFICULTIES[k].label,
      scoreMul: DIFFICULTIES[k].scoreMul
    }))
  }

  getDifficulty() {
    return DIFFICULTIES[this.state.difficulty] || DIFFICULTIES.normal
  }

  getScoreMul() {
    return this.getDifficulty().scoreMul
  }

  /** 套用难度预设（可只改难度不改参数：immediate=false 只记档位） */
  applyDifficulty(level, applyPreset) {
    const preset = DIFFICULTIES[level]
    if (!preset) return []
    const p = { difficulty: level }
    if (applyPreset !== false) {
      Object.keys(preset).forEach((k) => {
        if (k === 'label') return
        if (SCHEMA[k]) p[k] = preset[k]
      })
    }
    return this.patch(p, 'difficulty:' + level)
  }

  // ---------- 订阅 ----------
  subscribe(fn) {
    if (typeof fn !== 'function') return () => {}
    this.listeners.push(fn)
    const that = this
    return function off() {
      const i = that.listeners.indexOf(fn)
      if (i >= 0) that.listeners.splice(i, 1)
    }
  }

  emit(changed, source) {
    const payload = { config: this.all(), changed, source }
    this.listeners.slice().forEach((fn) => {
      try { fn(payload) } catch (e) { console.error('[game.config] listener error', e) }
    })
  }

  // ---------- 持久化 ----------
  load() {
    let saved = null
    try {
      saved = wx.getStorageSync(this.key)
    } catch (e) { /* 忽略 */ }
    if (saved && typeof saved === 'object') {
      Object.keys(SCHEMA).forEach((k) => {
        if (saved[k] !== undefined) this.state[k] = coerce(k, saved[k])
      })
      this.fixScoreRange(['scoreMin', 'scoreMax'])
    }
    return this.state
  }

  scheduleSave() {
    if (!this.persistEnabled) return
    if (this.saveTimer) return
    const that = this
    this.saveTimer = setTimeout(function () {
      that.saveTimer = null
      that.save()
    }, SAVE_DELAY)
  }

  save() {
    if (!this.persistEnabled) return
    try {
      wx.setStorageSync(this.key, this.state)
    } catch (e) { /* 忽略 */ }
  }

  /** 恢复出厂参数 */
  reset() {
    const changed = []
    Object.keys(DEFAULT_CONFIG).forEach((k) => {
      if (this.state[k] !== DEFAULT_CONFIG[k]) {
        this.state[k] = DEFAULT_CONFIG[k]
        changed.push(k)
      }
    })
    this.save()
    if (changed.length) this.emit(changed, 'reset')
    return changed
  }
}

// ---------------------------------------------------------------------------
// 单例：全 App 一份配置，所有页面（游戏页 / 后台面板页）共用
// ---------------------------------------------------------------------------
let sharedStore = null

function getStore() {
  if (!sharedStore) sharedStore = new ConfigStore()
  return sharedStore
}

module.exports = {
  ConfigStore,
  getStore,
  SCHEMA,
  DEFAULT_CONFIG,
  DIFFICULTIES,
  PANEL_GROUPS,
  STORAGE_KEY,
  coerce
}
