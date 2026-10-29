// ============================================================================
// utils/rhythm-config.js —— 「左右节奏训练」场景配置（管理 + 校验 + 持久化）
// ----------------------------------------------------------------------------
// 与射击 / 走钢丝 / 接水果各自独立保存，存储键 rhythm_cfg_v1。
// 治疗师在 pages/rhythm-settings 修改后立即写盘，引擎每帧读最新值。
//
// 单位约定（重要）：
//   · leftLimit / rightLimit：角度（°），只用于把姿态偏移归一化成 ±1，不是位移
//   · sideThreshold：归一化控制量阈值（0~1），|x| 超过它才算进入左/右区域
//   · perfectMs / greatMs / goodMs：判定时间窗口（毫秒，±）
//   · syncOffsetMs：音画同步补偿（毫秒），>0 表示"听到的比看到的晚"
//   · approachMs：音符从出现到抵达判定线的时间（毫秒）
//   · musicVolume：0~1
//
// 所有默认值都是"待真机实测的游戏参数"，不代表医疗安全区间，也不构成
// 康复疗效结论。
// ============================================================================

const { SONGS, DEFAULT_SONG_ID } = require('./rhythm-songs.js')

const STORAGE_KEY = 'rhythm_cfg_v1'

const SONG_IDS = SONGS.map((s) => s.songId)

const SCHEMA = {
  // ---------------- 难度 ----------------
  difficulty: {
    group: '难度', label: '难度档位', type: 'num', unit: '档',
    min: 1, max: 5, step: 1, def: 2,
    tip: '第 1 档音符少、窗口宽；第 5 档密度高、窗口窄'
  },

  // ---------------- 音乐 ----------------
  songId: {
    group: '音乐', label: '曲目', type: 'enum', def: DEFAULT_SONG_ID,
    options: SONG_IDS,
    labels: SONGS.reduce((m, s) => { m[s.songId] = s.name + ' · ' + s.bpm + ' BPM'; return m }, {}),
    tip: 'BPM 与循环长度来自曲目配置，谱面按 BPM 精确生成'
  },
  musicVolume: {
    group: '音乐', label: '音量', type: 'num', unit: '', min: 0, max: 1, step: 0.05, def: 0.7,
    tip: '只控制音乐，不影响音效'
  },
  syncOffsetMs: {
    group: '音乐', label: '音画延迟补偿', type: 'num', unit: 'ms',
    min: -200, max: 200, step: 5, def: 0,
    tip: '真机上"听到"比"看到"晚时调大；请配合「试听 8 拍」校准'
  },
  beatPulseOn: { group: '音乐', label: '节拍脉冲提示', type: 'bool', def: true, tip: '判定区随节拍柔和呼吸，帮助感知时机' },
  beatClickOn: { group: '音乐', label: '节拍点击音', type: 'bool', def: true, tip: '训练中播放轻微节拍点击，可关闭' },

  // ---------------- 训练目标 ----------------
  durationSec: {
    group: '训练目标', label: '训练时长', type: 'num', unit: '秒',
    min: 30, max: 300, step: 5, def: 90,
    tip: '真实经历的音乐时间，不含暂停与中断'
  },
  prepBeats: {
    group: '训练目标', label: '预备拍', type: 'num', unit: '拍',
    min: 2, max: 8, step: 1, def: 2,
    tip: '开始前先数几拍；越大开局空等越久'
  },

  // ---------------- 体感输入 ----------------
  axisX: {
    group: '体感输入', label: '左右轴', type: 'enum', def: 'pitch',
    options: ['pitch', 'roll'],
    tip: '实测本项目佩戴方式下左右移动读 pitch；换佩戴方向时改这里'
  },
  axisY: { group: '体感输入', label: '前后轴（本游戏未使用）', type: 'enum', def: 'roll', options: ['roll', 'pitch'] },
  invertX: { group: '体感输入', label: '左右反向', type: 'bool', def: true, tip: '身体向左却判定到右侧时切换' },
  invertY: { group: '体感输入', label: '前后反向', type: 'bool', def: false },
  sensitivity: {
    group: '体感输入', label: '控制灵敏度', type: 'num', unit: '倍',
    min: 0.4, max: 2, step: 0.05, def: 1,
    tip: '越大，同样的身体偏移越快达到左右区域'
  },
  deadzoneDeg: {
    group: '体感输入', label: '中心死区', type: 'num', unit: '°',
    min: 0, max: 8, step: 0.5, def: 1.5,
    tip: '小于该角度的呼吸抖动不会导致左右状态跳变'
  },
  smooth: {
    group: '体感输入', label: '跟手度', type: 'num', unit: '',
    min: 0.2, max: 1, step: 0.02, def: 0.6,
    tip: '越大越跟手、越小越平顺'
  },
  leftLimit: { group: '体感输入', label: '左侧边界', type: 'num', unit: '°', min: 3, max: 45, step: 1, def: 12 },
  rightLimit: { group: '体感输入', label: '右侧边界', type: 'num', unit: '°', min: 3, max: 45, step: 1, def: 12 },
  forwardLimit: { group: '体感输入', label: '前侧边界（未使用）', type: 'num', unit: '°', min: 3, max: 45, step: 1, def: 12 },
  backLimit: { group: '体感输入', label: '后侧边界（未使用）', type: 'num', unit: '°', min: 3, max: 45, step: 1, def: 12 },

  // ---------------- 左右判定 ----------------
  sideThreshold: {
    group: '左右判定', label: '左右区域阈值', type: 'num', unit: '',
    min: 0.15, max: 0.8, step: 0.05, def: 0.35,
    tip: '|控制量| 超过该值才算真正进入左 / 右区域；越大越难触发'
  },
  stableMs: {
    group: '左右判定', label: '稳定判定时间', type: 'num', unit: 'ms',
    min: 0, max: 400, step: 10, def: 120,
    tip: '进入某一侧后需要保持多久才允许命中，过滤路过的抖动'
  },
  sameSideGapMs: {
    group: '左右判定', label: '同向重复间隔', type: 'num', unit: 'ms',
    min: 120, max: 900, step: 20, def: 320,
    tip: '保持同一侧时，两次命中之间至少间隔这么久，避免"一直站着刷分"'
  },

  // ---------------- 节奏判定 ----------------
  perfectMs: { group: '节奏判定', label: 'PERFECT 窗口', type: 'num', unit: '±ms', min: 25, max: 120, step: 5, def: 60 },
  greatMs: { group: '节奏判定', label: 'GREAT 窗口', type: 'num', unit: '±ms', min: 45, max: 180, step: 5, def: 105 },
  goodMs: { group: '节奏判定', label: 'GOOD 窗口', type: 'num', unit: '±ms', min: 70, max: 260, step: 5, def: 160 },
  approachMs: {
    group: '节奏判定', label: '音符飞行时间', type: 'num', unit: 'ms',
    min: 900, max: 4000, step: 50, def: 2400,
    tip: '音符从出现到抵达判定线的时间，越长越容易预判'
  },
  noteStepBeats: {
    group: '节奏判定', label: '音符间隔', type: 'num', unit: '拍',
    min: 0.5, max: 4, step: 0.25, def: 1,
    tip: '每几拍来一个音符；1 拍 = 跟着音乐每拍一个，越大约慢'
  },
  centerRate: {
    group: '节奏判定', label: '中间音符比例', type: 'num', unit: '',
    min: 0, max: 0.6, step: 0.05, def: 0.3,
    tip: '0 = 只出左右音符；调高后要求「回到中立位」的中间音符越多'
  },
  restRate: {
    group: '节奏判定', label: '呼吸拍间隔', type: 'num', unit: '',
    min: 0, max: 0.5, step: 0.01, def: 0.13,
    tip: '每 N 个音符空一拍（固定位置，不会连着空）；0 = 不留空。0.13≈每 8 个空一拍'
  },
  sameSideRate: {
    group: '节奏判定', label: '同向连击比例', type: 'num', unit: '',
    min: 0, max: 0.5, step: 0.05, def: 0.12,
    tip: '连续两个同方向音符的概率，训练保持能力'
  },
  chartSeed: {
    group: '节奏判定', label: '谱面种子', type: 'num', unit: '',
    min: 1, max: 9999, step: 1, def: 7,
    tip: '同曲同难度同种子 → 完全相同的音符时间表，便于前后对比'
  },

  // ---------------- 计分 ----------------
  scorePerfect: { group: '计分', label: 'PERFECT 分值', type: 'num', unit: '分', min: 50, max: 200, step: 10, def: 100 },
  scoreGreat: { group: '计分', label: 'GREAT 分值', type: 'num', unit: '分', min: 20, max: 150, step: 10, def: 70 },
  scoreGood: { group: '计分', label: 'GOOD 分值', type: 'num', unit: '分', min: 10, max: 100, step: 5, def: 40 },
  comboStep: { group: '计分', label: '连击加成步长', type: 'num', unit: '', min: 0, max: 0.2, step: 0.01, def: 0.04 },
  comboMaxMul: { group: '计分', label: '连击倍率上限', type: 'num', unit: '倍', min: 1, max: 3, step: 0.1, def: 1.5 },
  comboBreakOnMiss: { group: '计分', label: '漏接中断连击', type: 'bool', def: true },
  finishBonus: { group: '计分', label: '完成奖励', type: 'num', unit: '分', min: 0, max: 500, step: 10, def: 100 },

  // ---------------- 反馈 ----------------
  sfxOn: { group: '反馈', label: '音效', type: 'bool', def: true },
  voiceOn: { group: '反馈', label: '语音播报', type: 'bool', def: true, tip: '只在阶段切换时播报，不会每个音符都念' },
  vibrateOn: { group: '反馈', label: '振动反馈', type: 'bool', def: true },
  guideOn: { group: '反馈', label: '引导提示', type: 'bool', def: true, tip: '长时间没动作或左右明显失衡时给一句提示' }
}

const GROUPS = ['难度', '音乐', '训练目标', '体感输入', '左右判定', '节奏判定', '计分', '反馈']

// 五档预设：只覆盖"游戏手感"参数，体感输入与音乐的选择保持治疗师设置
const PRESETS = {
  1: {
    label: '入门', noteStepBeats: 2, restRate: 0.28, sameSideRate: 0.05,
    perfectMs: 90, greatMs: 150, goodMs: 220, approachMs: 3000,
    stableMs: 80, sameSideGapMs: 260, durationSec: 60, prepBeats: 2
  },
  2: {
    label: '轻量', noteStepBeats: 1.5, restRate: 0.2, sameSideRate: 0.08,
    perfectMs: 80, greatMs: 130, goodMs: 195, approachMs: 2800,
    stableMs: 100, sameSideGapMs: 280, durationSec: 75, prepBeats: 2
  },
  3: {
    label: '标准', noteStepBeats: 1, restRate: 0.12, sameSideRate: 0.12,
    perfectMs: 70, greatMs: 115, goodMs: 170, approachMs: 2600,
    stableMs: 120, sameSideGapMs: 320, durationSec: 90, prepBeats: 2
  },
  4: {
    label: '进阶', noteStepBeats: 0.75, restRate: 0.08, sameSideRate: 0.16,
    perfectMs: 60, greatMs: 105, goodMs: 155, approachMs: 2400,
    stableMs: 140, sameSideGapMs: 340, durationSec: 105, prepBeats: 2
  },
  5: {
    label: '挑战', noteStepBeats: 0.5, restRate: 0.06, sameSideRate: 0.2,
    perfectMs: 52, greatMs: 92, goodMs: 140, approachMs: 2200,
    stableMs: 160, sameSideGapMs: 360, durationSec: 120, prepBeats: 2
  }
}

function defaults() {
  const out = {}
  Object.keys(SCHEMA).forEach((k) => { out[k] = SCHEMA[k].def })
  return out
}

function validate(state) {
  const errors = []
  const warnings = []
  const s = state
  if (!SONG_IDS.includes(s.songId)) errors.push('曲目不存在：' + s.songId)
  if (!(s.perfectMs < s.greatMs && s.greatMs < s.goodMs)) {
    errors.push('判定窗口必须满足 PERFECT < GREAT < GOOD')
  }
  if (s.sideThreshold > 0.7) warnings.push('左右区域阈值偏大，患者可能需要很大幅度才能触发')
  if (s.sameSideGapMs < s.stableMs) warnings.push('同向重复间隔小于稳定判定时间，连续同向音符可能判不出来')
  if (s.approachMs < 900) warnings.push('音符飞行时间过短，预判时间不足')
  if (s.noteStepBeats <= 0.5 && s.prepBeats < 3) warnings.push('高密度谱面建议保留 3 拍以上预备拍')
  if (s.durationSec > 240) warnings.push('单局超过 4 分钟，建议中途休息')
  if (s.musicVolume <= 0) warnings.push('音乐音量为 0，节奏将只能靠视觉与点击音判断')
  return { ok: errors.length === 0, errors, warnings }
}

// ---- 通用存储（get/patch/set/load/save/reset/subscribe 见 utils/config-store.js）----
const { createConfigStore } = require('./config-store.js')

const { ConfigStore, getStore, coerce, DEFAULT_CONFIG } = createConfigStore({
  key: STORAGE_KEY,
  schema: SCHEMA,
  presets: PRESETS,
  validate: validate,
  defaultDifficulty: 3,
  logTag: 'rhythm-config'
})

module.exports = {
  RhythmConfigStore: ConfigStore,
  getStore,
  SCHEMA,
  GROUPS,
  PRESETS,
  DEFAULT_CONFIG,
  STORAGE_KEY,
  validate,
  coerce
}
