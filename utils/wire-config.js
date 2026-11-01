// ============================================================================
// utils/wire-config.js —— 「走钢丝」场景配置（配置管理 + 校验 + 持久化）
// ----------------------------------------------------------------------------
// 与射击游戏（pkgShoot/games/shoot/config.js）各自独立保存：每个场景一份配置，互不干扰。
// 存储键 wire_cfg_v1，治疗师在 pages/wire-settings 修改后立即写盘。
//
// 结构：
//   SCHEMA      每个可配置项的定义（类型 / 上下限 / 步进 / 默认值 / 分组）
//   PRESETS     1~5 档难度预设（一键套用，之后仍可单项微调）
//   validate()  开赛前校验：范围、上下限、阈值先后关系，返回 { ok, errors[] }
//
// 注意：这里所有默认值都是「待真机实测的游戏参数」，不代表任何医疗安全区间，
// 也不构成康复疗效结论。治疗师的实际设置以本地保存值为准。
// ============================================================================

const STORAGE_KEY = 'wire_cfg_v1'

// 归一化控制量统一用「活动边界」做分母：
//   nx = clamp(角度 * 灵敏度 / 对应侧边界, -1, 1)
// 到达 ±1 即到达治疗师设定的边界，保险绳阈值、警戒阈值都以这个 0~1 为刻度。
const SCHEMA = {
  // ---------------- 难度 ----------------
  difficulty: {
    group: '难度', label: '难度档位', type: 'num', unit: '档',
    min: 1, max: 5, step: 1, def: 2,
    tip: '第 1 档最宽松（幅度小、速度慢），第 5 档要求最稳'
  },

  // ---------------- 画面 ----------------
  characterId: {
    group: '画面', label: '角色', type: 'enum', def: 'fox',
    options: ['fox', 'rabbit', 'panda'],
    labels: { fox: '小狐狸', rabbit: '小兔子', panda: '小熊猫' },
    // 纯外观，**不影响手感**。治疗师要拿同一档位做前后对比，
    // 角色如果带属性（比如熊猫更稳），换角色就等于换难度，前后对比就废了。
    tip: '只有外观不同，不影响判定、速度与难度'
  },

  // ---------------- 训练目标 ----------------
  durationSec: {
    group: '训练目标', label: '训练时长', type: 'num', unit: '秒',
    min: 20, max: 300, step: 5, def: 90,
    tip: '真实经过时间，不含暂停与传感器中断'
  },
  trackLength: {
    group: '训练目标', label: '钢丝长度', type: 'num', unit: '米',
    min: 10, max: 300, step: 5, def: 100,
    // 2026-11-01：40 米 → 100 米。40 米配 90 秒等于 0.44 m/s，
    // 临床上属于慢速步态（普通人 1.2~1.4 m/s），画面读起来就是「怎么这么慢」。
    tip: '游戏世界内的前进里程，不是真实空间位移。100 米 ≈ 真实步速走 90 秒'
  },
  forwardSpeed: {
    group: '训练目标', label: '前进速度', type: 'num', unit: '米/秒',
    min: 0.1, max: 3, step: 0.05, def: 1.2,
    // 这里只是**画面的**前进速度。患者并不真的走路，只做重心转移，
    // 所以调快它不会要求患者动得更快 —— 这一点必须写清楚，
    // 否则治疗师会以为「调快 = 加难度」。实际难度由稳定要求与失衡模型决定。
    tip: '平衡良好时的画面前进速度（不影响患者动作难度）。失衡按平衡值比例减速，越界几乎停住'
  },

  // ---------------- 体感输入 ----------------
  axisX: {
    group: '体感输入', label: '左右轴', type: 'enum', def: 'pitch',
    options: ['pitch', 'roll'],
    tip: '实测本项目佩戴方式下左右移动读 pitch；换佩戴方向时改这里'
  },
  axisY: {
    group: '体感输入', label: '前后轴', type: 'enum', def: 'roll',
    options: ['roll', 'pitch']
  },
  invertX: { group: '体感输入', label: '左右反向', type: 'bool', def: true, tip: '角色与身体同向时关闭' },
  invertY: { group: '体感输入', label: '前后反向', type: 'bool', def: false },
  sensitivity: {
    group: '体感输入', label: '控制灵敏度', type: 'num', unit: '倍',
    min: 0.4, max: 2, step: 0.05, def: 1,
    tip: '越大，同样的身体偏移产生的控制量越大'
  },
  deadzoneDeg: {
    group: '体感输入', label: '中心死区', type: 'num', unit: '°',
    min: 0, max: 8, step: 0.5, def: 1.5,
    tip: '小于该角度的呼吸抖动不计入控制量'
  },
  smooth: {
    group: '体感输入', label: '跟手度', type: 'num', unit: '',
    min: 0.2, max: 1, step: 0.02, def: 0.55,
    tip: '越大越跟手、越小越平顺；过低会拖影'
  },

  // ---------------- 活动边界 ----------------
  leftLimit: { group: '活动边界', label: '左侧边界', type: 'num', unit: '°', min: 3, max: 45, step: 1, def: 14 },
  rightLimit: { group: '活动边界', label: '右侧边界', type: 'num', unit: '°', min: 3, max: 45, step: 1, def: 14 },
  forwardLimit: { group: '活动边界', label: '前方边界', type: 'num', unit: '°', min: 3, max: 45, step: 1, def: 12 },
  backLimit: { group: '活动边界', label: '后方边界', type: 'num', unit: '°', min: 3, max: 45, step: 1, def: 12 },

  // ---------------- 平衡模型 ----------------
  recoveryRate: {
    group: '平衡模型', label: '平衡恢复速度', type: 'num', unit: '/秒',
    min: 0.1, max: 1.2, step: 0.05, def: 0.5,
    tip: '回到中心（偏移 < 0.18）后平衡值回升的快慢。这个数越小，回正后要等越久才重新走起来'
  },
  instability: {
    group: '平衡模型', label: '失衡恶化速度', type: 'num', unit: '/秒',
    min: 0.3, max: 2, step: 0.05, def: 0.95,
    // 平衡值现在**直接就是速度系数**：跌到 0 就彻底停住，
    // 唯一出路是患者自己把重心找回来（回到舒适区后按恢复速度回升）。
    tip: '偏移越大、越久，平衡值下降越快。平衡值 = 前进速度系数，掉到 0 就停住'
  },
  warnThreshold: {
    group: '平衡模型', label: '失衡警戒阈值', type: 'num', unit: '',
    min: 0.3, max: 0.95, step: 0.01, def: 0.66,
    tip: '归一化偏移超过该值提示失衡，并开始扣稳定分'
  },

  // ---------------- 保险绳 ----------------
  ropeEnabled: { group: '保险绳', label: '启用保险绳', type: 'bool', def: true },
  ropeTrigger: {
    group: '保险绳', label: '触发阈值', type: 'num', unit: '',
    min: 0.4, max: 1, step: 0.01, def: 0.88,
    tip: '高于警戒阈值；触发后角色被轻拉回，不结束本局'
  },
  ropeRelease: {
    group: '保险绳', label: '解除阈值', type: 'num', unit: '',
    min: 0.15, max: 0.9, step: 0.01, def: 0.52,
    tip: '回落到该值以下并保持一段时间才解除，避免边界反复触发'
  },
  ropeHoldMs: { group: '保险绳', label: '解除保持时间', type: 'num', unit: 'ms', min: 200, max: 2000, step: 50, def: 600 },
  ropeCooldownMs: { group: '保险绳', label: '再次触发间隔', type: 'num', unit: 'ms', min: 300, max: 4000, step: 100, def: 1500 },
  ropePull: {
    group: '保险绳', label: '引导强度', type: 'num', unit: '',
    min: 0, max: 1, step: 0.05, def: 0.6,
    // 2026-11-01：这个参数原来叫「回拉强度」，做的是**自动把患者拉回中线**
    // （把控制量乘上 1-pull）。那是替患者站稳，学不到东西。现在绳索不碰
    // 控制量，这个值改成引导强度：方向光带多亮、语音多急、绳索音多重。
    tip: '失衡时引导的强度（光带亮度 / 语音频次 / 绳索音）。已经不参与判定'
  },
  failRule: {
    group: '保险绳', label: '关闭保险绳时的越界规则', type: 'enum', def: 'penalty',
    options: ['penalty', 'terminate'],
    tip: 'penalty：越界暂停前进并扣分；terminate：直接结束本局'
  },
  penaltyScore: { group: '保险绳', label: '越界扣分', type: 'num', unit: '分', min: 0, max: 20, step: 1, def: 3 },
  failGraceSec: {
    group: '保险绳', label: '越界容忍时间', type: 'num', unit: '秒',
    min: 0.2, max: 3, step: 0.1, def: 0.8,
    tip: '越过边界持续该时长才判定越界，避免瞬时抖动误判'
  },

  // ---------------- 计分 ----------------
  scorePerMeter: { group: '计分', label: '每米前进得分', type: 'num', unit: '分', min: 0, max: 20, step: 0.5, def: 1.5 },
  stableScorePerSec: { group: '计分', label: '每秒稳定得分', type: 'num', unit: '分', min: 0, max: 10, step: 0.5, def: 2 },
  comboStep: { group: '计分', label: '每级连击加成', type: 'num', unit: '', min: 0, max: 0.5, step: 0.05, def: 0.1 },
  comboMaxMul: { group: '计分', label: '连击加成上限', type: 'num', unit: '倍', min: 1, max: 4, step: 0.1, def: 2 },
  finishBonus: { group: '计分', label: '走完全程奖励', type: 'num', unit: '分', min: 0, max: 300, step: 10, def: 60 },

  // ---------------- 反馈 ----------------
  sfxOn: { group: '反馈', label: '音效', type: 'bool', def: true },
  voiceOn: { group: '反馈', label: '语音提示', type: 'bool', def: true },
  vibrateOn: { group: '反馈', label: '振动反馈', type: 'bool', def: true },
  showTrail: { group: '反馈', label: '显示重心轨迹', type: 'bool', def: false }
}

const GROUPS = ['难度', '画面', '训练目标', '体感输入', '活动边界', '平衡模型', '保险绳', '计分', '反馈']

// ---------------------------------------------------------------------------
// 1~5 档预设。每档只描述「场景参数」，不改计分公式本身。
// 数值均为待真机实测的游戏参数。
// ---------------------------------------------------------------------------
const PRESETS = {
  1: {
    // 2026-11-01：里程 ×3.5、速度 ×2.6 —— 原来 90 秒走 40 米 = 0.44 m/s，
    // 临床上属于慢速步态，画面读起来就是「怎么这么慢」。
    // 注意：这是**画面前进速度**，不增加患者动作难度。
    label: '第 1 档 · 入门', durationSec: 120, trackLength: 110, forwardSpeed: 1.05,
    sensitivity: 1.15, deadzoneDeg: 2, smooth: 0.5,
    leftLimit: 16, rightLimit: 16, forwardLimit: 14, backLimit: 14,
    recoveryRate: 0.6, instability: 0.7, warnThreshold: 0.72,
    ropeTrigger: 0.92, ropeRelease: 0.58, ropePull: 0.72
  },
  2: {
    label: '第 2 档 · 轻松', durationSec: 90, trackLength: 100, forwardSpeed: 1.2,
    sensitivity: 1, deadzoneDeg: 1.5, smooth: 0.55,
    leftLimit: 14, rightLimit: 14, forwardLimit: 12, backLimit: 12,
    recoveryRate: 0.5, instability: 0.95, warnThreshold: 0.66,
    ropeTrigger: 0.88, ropeRelease: 0.52, ropePull: 0.6
  },
  3: {
    label: '第 3 档 · 标准', durationSec: 80, trackLength: 100, forwardSpeed: 1.4,
    sensitivity: 0.95, deadzoneDeg: 1.2, smooth: 0.6,
    leftLimit: 12, rightLimit: 12, forwardLimit: 11, backLimit: 11,
    recoveryRate: 0.45, instability: 1.1, warnThreshold: 0.62,
    ropeTrigger: 0.86, ropeRelease: 0.5, ropePull: 0.58
  },
  4: {
    label: '第 4 档 · 进阶', durationSec: 70, trackLength: 100, forwardSpeed: 1.6,
    sensitivity: 0.9, deadzoneDeg: 1, smooth: 0.66,
    leftLimit: 10, rightLimit: 10, forwardLimit: 9, backLimit: 9,
    recoveryRate: 0.4, instability: 1.25, warnThreshold: 0.58,
    ropeTrigger: 0.84, ropeRelease: 0.48, ropePull: 0.55
  },
  5: {
    label: '第 5 档 · 挑战', durationSec: 60, trackLength: 95, forwardSpeed: 1.8,
    sensitivity: 0.85, deadzoneDeg: 0.8, smooth: 0.72,
    leftLimit: 9, rightLimit: 9, forwardLimit: 8, backLimit: 8,
    recoveryRate: 0.35, instability: 1.4, warnThreshold: 0.54,
    ropeTrigger: 0.82, ropeRelease: 0.46, ropePull: 0.5
  }
}

// 需要在难易之外额外限制的范围（校验时用）
const HARD_LIMIT = { angle: 45, duration: 300 }

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v)
}

function num(v, def) {
  const n = Number(v)
  return isFinite(n) ? n : def
}

/**
 * 开赛前校验。返回 { ok, errors, warnings }
 * errors 会阻止开始游戏，warnings 只提示。
 */
function validate(state) {
  const s = state || {}
  const errors = []
  const warnings = []

  if (!(s.durationSec >= 20 && s.durationSec <= HARD_LIMIT.duration)) {
    errors.push('训练时长需在 20~300 秒之间')
  }
  if (!(s.trackLength >= 10)) errors.push('钢丝长度需不小于 10 米')
  if (!(s.forwardSpeed > 0)) errors.push('前进速度需大于 0')
  if (['fox', 'rabbit', 'panda'].indexOf(s.characterId) < 0) errors.push('角色不存在：' + s.characterId)

  const angles = ['leftLimit', 'rightLimit', 'forwardLimit', 'backLimit']
  angles.forEach((k) => {
    const v = s[k]
    if (!(v >= 3 && v <= HARD_LIMIT.angle)) {
      errors.push(SCHEMA[k].label + '需在 3°~45° 之间')
    }
  })
  if (s.warnThreshold >= s.ropeTrigger) {
    errors.push('失衡警戒阈值需小于保险绳触发阈值')
  }
  if (s.ropeRelease >= s.ropeTrigger) {
    errors.push('保险绳解除阈值需小于触发阈值')
  }
  if (s.ropePull < 0 || s.ropePull > 1) errors.push('保险绳回拉强度需在 0~1 之间')
  if (s.ropeTrigger > 1.0001) errors.push('保险绳触发阈值不能大于 1（边界）')

  if (s.axisX === s.axisY) errors.push('左右轴与前后轴不能使用同一个轴')

  if (s.warnThreshold > 0.9) warnings.push('警戒阈值过高，失衡提示会很少出现')
  if (s.instability < 0.5) warnings.push('失衡恶化速度很低，几乎不会失衡')
  if (s.ropeEnabled && s.ropePull < 0.2) warnings.push('保险绳回拉强度过低，介入效果不明显')
  if (!s.ropeEnabled && s.failRule === 'terminate') warnings.push('保险绳已关闭，越界会直接结束本局')
  if (s.sensitivity > 1.4) warnings.push('灵敏度过高，小动作会被放大')

  return { ok: errors.length === 0, errors, warnings }
}

// ---- 通用存储（get/patch/set/load/save/reset/subscribe 见 utils/config-store.js）----
const { createConfigStore } = require('./config-store.js')

const base = createConfigStore({
  key: STORAGE_KEY,
  schema: SCHEMA,
  presets: PRESETS,
  validate: validate,
  defaultDifficulty: 2,
  logTag: 'wire-config'
})
const { ConfigStore, getStore: baseGetStore, coerce, DEFAULT_CONFIG } = base

// ---------------------------------------------------------------------------
// 规则集迁移（ruleset v2，2026-11-01）
// ---------------------------------------------------------------------------
// 【为什么必须有这个东西】
// 配置是**治疗师所有**的：参数一旦落盘就以盘上那份为准，改 SCHEMA 的 def
// 或改 PRESETS 对老设备**一点作用都没有**。我这轮把前进速度从 0.5 提到 1.2、
// 里程从 40 提到 100，结果用户手机上仍然显示「里程 1.5 / 40 米」—— 代码全对，
// 只是那个 40 是上一版存在 storage 里的。
//
// 所以规则集改变时必须显式迁移一次，而且只迁**出厂值**：
// 表里只列出各档预设与旧默认值，治疗师手调过的数字（比如 0.73）不在表里，
// 一个都不动。宁可漏迁，也不能把人家的个体化参数冲掉。
const RULESET_KEY = 'wire_ruleset'
const RULESET_VERSION = 2

const RULESET_V2 = {
  // 旧：第 1~5 档 0.40 / 0.50 / 0.62 / 0.72 / 0.82（以及旧默认 0.5）
  forwardSpeed: { 0.4: 1.05, 0.5: 1.2, 0.62: 1.4, 0.72: 1.6, 0.82: 1.8 },
  // 旧：30 / 40 / 45 / 50 / 55，默认 40
  trackLength: { 30: 110, 40: 100, 45: 100, 50: 100, 55: 95 },
  // 里程翻 2.5 倍，每米得分要跟着降，否则总分翻倍、和旧记录完全不可比
  scorePerMeter: { 4: 1.5 }
}

/** 纯函数：给一份 config 快照，返回需要迁移的字段（可单测） */
function rulesetPatch(state) {
  const s = state || {}
  const out = {}
  Object.keys(RULESET_V2).forEach((k) => {
    const cur = Number(s[k])
    if (!isFinite(cur)) return
    const table = RULESET_V2[k]
    Object.keys(table).forEach((from) => {
      if (Math.abs(Number(from) - cur) < 0.001) out[k] = table[from]
    })
  })
  return out
}

let rulesetChecked = false

/**
 * 取配置单例（并在第一次取用时做一次规则集迁移）。
 * 注意：`{fresh:true}` 是测试用的临时实例，不读也不写真实存储，直接跳过。
 */
function getStore(opts) {
  const store = baseGetStore(opts)
  if (rulesetChecked || (opts && opts.fresh)) return store
  rulesetChecked = true
  try {
    if (typeof wx === 'undefined' || !wx.getStorageSync) return store
    const ver = Number(wx.getStorageSync(RULESET_KEY)) || 0
    if (ver >= RULESET_VERSION) return store
    const patch = rulesetPatch(store.all())
    const keys = Object.keys(patch)
    if (keys.length) store.patch(patch, 'ruleset:v2')
    try { wx.setStorageSync(RULESET_KEY, RULESET_VERSION) } catch (e) { /* 忽略 */ }
    if (keys.length) console.log('[wire-config] 规则集迁移 v2：' + keys.join(','))
  } catch (e) {
    console.warn('[wire-config] 规则集迁移失败', e)
  }
  return store
}

module.exports = {
  WireConfigStore: ConfigStore,
  getStore,
  SCHEMA,
  GROUPS,
  PRESETS,
  DEFAULT_CONFIG,
  STORAGE_KEY,
  RULESET_KEY,
  RULESET_VERSION,
  rulesetPatch,
  validate,
  coerce
}
