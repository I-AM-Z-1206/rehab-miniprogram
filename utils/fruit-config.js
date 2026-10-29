// ============================================================================
// utils/fruit-config.js —— 「接水果」场景配置（管理 + 校验 + 持久化）
// ----------------------------------------------------------------------------
// 与射击（pkgShoot/games/shoot/config.js）、走钢丝（utils/wire-config.js）各自独立保存，
// 存储键 fruit_cfg_v1。治疗师在 pages/fruit-settings 修改后立即写盘。
//
// 玩法口径：左右倾身移动果篮（动态对准）
//   · nx = 左右轴角度 / 活动边界（-1 左 … +1 右），线性映射成果篮的横向位置
//   · basketWidthPct：接取宽度，也是"对准"的判定宽度
//   · holdToleranceDeg / holdStableSec / holdGraceSec：只用于统计「稳定率」，
//     不影响接取判定（篮子是否在水果下方才是唯一判定）
//   · 水果落点铺满整条可及范围，玩家需要把果篮移过去
//
// 所有默认值都是「待真机实测的游戏参数」，不代表医疗安全区间，也不构成
// 康复疗效结论。治疗师的实际设置以本地保存值为准。
// ============================================================================

const STORAGE_KEY = 'fruit_cfg_v1'

const SCHEMA = {
  // ---------------- 难度 ----------------
  difficulty: {
    group: '难度', label: '难度档位', type: 'num', unit: '档',
    min: 1, max: 5, step: 1, def: 2,
    tip: '第 1 档水果少、落得慢、篮子宽；第 5 档要求更快的身体反应'
  },

  // ---------------- 训练目标 ----------------
  durationSec: {
    group: '训练目标', label: '训练时长', type: 'num', unit: '秒',
    min: 20, max: 300, step: 5, def: 90,
    tip: '真实经过时间，不含暂停与传感器中断'
  },

  // ---------------- 体感输入 ----------------
  axisX: {
    group: '体感输入', label: '左右轴', type: 'enum', def: 'pitch',
    options: ['pitch', 'roll'],
    tip: '胸前佩戴、胸带过腋下最高点时，实测左右移动读 pitch；换佩戴方向时改这里'
  },
  axisY: { group: '体感输入', label: '前后轴（本游戏未使用）', type: 'enum', def: 'roll', options: ['roll', 'pitch'] },
  invertX: { group: '体感输入', label: '左右反向', type: 'bool', def: true, tip: '身体与果篮方向相反时切换' },
  invertY: { group: '体感输入', label: '前后反向', type: 'bool', def: false },
  leftLimit: {
    group: '体感输入', label: '向左满行程', type: 'num', unit: '°',
    min: 4, max: 30, step: 1, def: 12,
    tip: '身体向左倾多少度，果篮移动到最左边；越小越灵敏'
  },
  rightLimit: {
    group: '体感输入', label: '向右满行程', type: 'num', unit: '°',
    min: 4, max: 30, step: 1, def: 12,
    tip: '身体向右倾多少度，果篮移动到最右边；越小越灵敏'
  },
  deadzoneDeg: {
    group: '体感输入', label: '偏差死区', type: 'num', unit: '°',
    min: 0, max: 6, step: 0.5, def: 1.5,
    tip: '小于该角度的呼吸抖动不让果篮移动'
  },
  smooth: {
    group: '体感输入', label: '跟手平滑', type: 'num', unit: '',
    min: 0.2, max: 1, step: 0.02, def: 0.55,
    tip: '越大越跟手、越小越平顺；越小越不容易因噪声让果篮抖动'
  },

  // ---------------- 接取与稳定（本游戏的核心） ----------------
  basketWidthPct: {
    group: '接取与稳定', label: '接取宽度', type: 'num', unit: '% 屏宽',
    min: 12, max: 40, step: 0.5, def: 24,
    tip: '果篮宽度，也是对准判定的宽度；越宽越容易接住'
  },
  holdToleranceDeg: {
    group: '接取与稳定', label: '稳定判定容差', type: 'num', unit: '°',
    min: 2, max: 25, step: 0.5, def: 6,
    tip: '仅用于统计稳定率：偏离超过该角度的时间不计入稳定，不影响接取'
  },
  holdToleranceYDeg: {
    group: '接取与稳定', label: '前后允许偏离', type: 'num', unit: '°',
    min: 3, max: 30, step: 1, def: 12,
    tip: '仅在「同时统计前后」开启时生效'
  },
  holdBothAxis: {
    group: '接取与稳定', label: '同时统计前后', type: 'bool', def: false,
    tip: '前后方向也计入稳定率统计，适合坐姿躯干控制训练'
  },
  holdStableSec: {
    group: '接取与稳定', label: '稳定判定时间', type: 'num', unit: '秒',
    min: 0.1, max: 2, step: 0.05, def: 0.4,
    tip: '连续在容差内这么久才算一次稳定（只影响稳定率统计）'
  },
  holdGraceSec: {
    group: '接取与稳定', label: '越界宽限', type: 'num', unit: '秒',
    min: 0, max: 1, step: 0.05, def: 0.25,
    tip: '短时间抖动不会打断稳定计时，避免一抖就断'
  },

  // ---------------- 水果与下落 ----------------
  spawnInterval: {
    group: '水果与下落', label: '生成间隔', type: 'num', unit: '秒',
    min: 0.5, max: 3.5, step: 0.05, def: 1.4,
    tip: '平均间隔，实际会有 ±15% 的自然浮动'
  },
  fallSpeed: {
    group: '水果与下落', label: '下落速度', type: 'num', unit: '屏高/秒',
    min: 0.12, max: 0.6, step: 0.01, def: 0.26,
    tip: '0.26 表示约 3.8 秒从顶部落到篮子，与屏幕尺寸无关'
  },
  maxFruits: { group: '水果与下落', label: '同时最多水果', type: 'num', unit: '个', min: 1, max: 6, step: 1, def: 3 },
  speedRamp: {
    group: '水果与下落', label: '难度爬升', type: 'num', unit: '%',
    min: 0, max: 40, step: 2, def: 15,
    tip: '训练后段最多加快该比例；0 表示全程速度恒定'
  },

  // ---------------- 计分 ----------------
  scoreApple: { group: '计分', label: '苹果', type: 'num', unit: '分', min: 1, max: 50, step: 1, def: 10 },
  scoreOrange: { group: '计分', label: '橙子', type: 'num', unit: '分', min: 1, max: 50, step: 1, def: 10 },
  scoreBanana: { group: '计分', label: '香蕉', type: 'num', unit: '分', min: 1, max: 50, step: 1, def: 12 },
  scoreStrawberry: { group: '计分', label: '草莓', type: 'num', unit: '分', min: 1, max: 50, step: 1, def: 15 },
  scoreWatermelon: { group: '计分', label: '西瓜', type: 'num', unit: '分', min: 1, max: 50, step: 1, def: 20 },
  comboStep: {
    group: '计分', label: '每级连击加成', type: 'num', unit: '',
    min: 0, max: 0.4, step: 0.02, def: 0.08,
    tip: '连击 1 次得 1+step 倍，之后逐级叠加，直到上限'
  },
  comboMaxMul: { group: '计分', label: '连击加成上限', type: 'num', unit: '倍', min: 1, max: 3, step: 0.1, def: 1.8 },
  comboWindowSec: {
    group: '计分', label: '连击保持时间', type: 'num', unit: '秒',
    min: 0, max: 6, step: 0.5, def: 2.5,
    tip: '超过该时间没有接住水果则连击归零；0 表示不会因间隔而中断'
  },
  comboResetOnMiss: { group: '计分', label: '漏接中断连击', type: 'bool', def: true },
  finishBonus: { group: '计分', label: '完成训练奖励', type: 'num', unit: '分', min: 0, max: 200, step: 5, def: 40 },

  // ---------------- 反馈 ----------------
  sfxOn: { group: '反馈', label: '音效', type: 'bool', def: true },
  sfxVolume: {
    group: '反馈', label: '音效音量', type: 'num', unit: '', min: 0, max: 1, step: 0.05, def: 0.8,
    tip: '接住 / 连击 / 漏接的提示音量；0 表示静音但仍保留视觉反馈'
  },
  bgmOn: {
    group: '反馈', label: '背景音乐', type: 'bool', def: true,
    tip: '果园背景音乐在训练中循环播放，暂停时同步暂停'
  },
  bgmVolume: {
    group: '反馈', label: '音乐音量', type: 'num', unit: '', min: 0, max: 1, step: 0.05, def: 0.26,
    tip: '背景音乐压得比音效低，避免盖住命中提示'
  },
  voiceOn: { group: '反馈', label: '语音提示', type: 'bool', def: true },
  vibrateOn: { group: '反馈', label: '振动反馈', type: 'bool', def: true }
}

const GROUPS = ['难度', '训练目标', '体感输入', '接取与稳定', '水果与下落', '计分', '反馈']

// ---------------------------------------------------------------------------
// 1~5 档预设。只改场景参数，不改计分公式。
// ---------------------------------------------------------------------------
const PRESETS = {
  1: {
    label: '第 1 档 · 入门', durationSec: 120,
    deadzoneDeg: 2, smooth: 0.5,
    basketWidthPct: 30, holdToleranceDeg: 10, holdStableSec: 0.3, holdGraceSec: 0.4,
    spawnInterval: 2, fallSpeed: 0.17, maxFruits: 2, speedRamp: 8,
    comboStep: 0.06, comboWindowSec: 3
  },
  2: {
    label: '第 2 档 · 轻松', durationSec: 90,
    deadzoneDeg: 1.5, smooth: 0.55,
    basketWidthPct: 26, holdToleranceDeg: 8, holdStableSec: 0.4, holdGraceSec: 0.3,
    spawnInterval: 1.5, fallSpeed: 0.22, maxFruits: 2, speedRamp: 12,
    comboStep: 0.08, comboWindowSec: 2.5
  },
  3: {
    label: '第 3 档 · 标准', durationSec: 80,
    deadzoneDeg: 1.2, smooth: 0.6,
    basketWidthPct: 24, holdToleranceDeg: 6, holdStableSec: 0.5, holdGraceSec: 0.25,
    spawnInterval: 1.15, fallSpeed: 0.28, maxFruits: 3, speedRamp: 16,
    comboStep: 0.1, comboWindowSec: 2.2
  },
  4: {
    label: '第 4 档 · 进阶', durationSec: 70,
    deadzoneDeg: 1, smooth: 0.66,
    basketWidthPct: 21, holdToleranceDeg: 5, holdStableSec: 0.6, holdGraceSec: 0.2,
    spawnInterval: 0.9, fallSpeed: 0.34, maxFruits: 4, speedRamp: 20,
    comboStep: 0.12, comboWindowSec: 2
  },
  5: {
    label: '第 5 档 · 挑战', durationSec: 60,
    deadzoneDeg: 0.8, smooth: 0.72,
    basketWidthPct: 18, holdToleranceDeg: 4, holdStableSec: 0.7, holdGraceSec: 0.15,
    spawnInterval: 0.72, fallSpeed: 0.4, maxFruits: 5, speedRamp: 24,
    comboStep: 0.14, comboWindowSec: 1.8
  }
}

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
  if (!(s.basketWidthPct >= 12 && s.basketWidthPct <= 40)) errors.push('接取宽度需在 12%~40% 屏宽之间')
  if (!(s.holdToleranceDeg >= 2 && s.holdToleranceDeg <= 25)) errors.push('稳定判定容差需在 2°~25° 之间')
  if (!(s.holdStableSec >= 0.1)) errors.push('稳定判定时间需不小于 0.1 秒')
  if (!(s.holdGraceSec >= 0)) errors.push('越界宽限不能为负数')
  if (!(s.spawnInterval > 0)) errors.push('水果生成间隔需大于 0')
  if (!(s.fallSpeed > 0)) errors.push('水果下落速度需大于 0')
  if (!(s.maxFruits >= 1)) errors.push('同时最多水果需至少为 1')
  if (s.axisX === s.axisY) errors.push('左右轴与前后轴不能使用同一个轴')
  if (s.comboMaxMul < 1) errors.push('连击加成上限不能小于 1 倍')

  // 实际可达性：接取宽度 / 反应时间 vs 水果密度（只提醒，不阻止）
  if (s.spawnInterval < 0.8 && s.maxFruits >= 4) warnings.push('水果密度较高，注意患者是否来得及移动果篮')
  if (s.fallSpeed > 0.45) warnings.push('下落速度很快，留给移动果篮的时间很少')
  if (s.basketWidthPct < 15) warnings.push('接取宽度较窄，需要更精确地把果篮移到水果下方')
  if (s.holdToleranceDeg < 3) warnings.push('稳定容差很小，统计到的稳定率会偏低')
  if (s.holdStableSec > 1) warnings.push('稳定判定时间较长，稳定率会被压低')
  if (s.holdGraceSec === 0) warnings.push('越界宽限为 0，轻微抖动就会打断稳定计时')
  if (s.comboWindowSec === 0) warnings.push('连击不会因时间间隔而中断')
  if (s.speedRamp > 30) warnings.push('后段提速幅度较大，训练后半程可能跟不上')

  return { ok: errors.length === 0, errors, warnings }
}

// ---- 通用存储（get/patch/set/load/save/reset/subscribe 见 utils/config-store.js）----
const { createConfigStore } = require('./config-store.js')

const { ConfigStore, getStore, coerce, DEFAULT_CONFIG } = createConfigStore({
  key: STORAGE_KEY,
  schema: SCHEMA,
  presets: PRESETS,
  validate: validate,
  defaultDifficulty: 2,
  logTag: 'fruit-config'
})

module.exports = {
  FruitConfigStore: ConfigStore,
  getStore,
  SCHEMA,
  GROUPS,
  PRESETS,
  DEFAULT_CONFIG,
  STORAGE_KEY,
  validate,
  coerce
}
