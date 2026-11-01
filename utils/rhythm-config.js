// ============================================================================
// utils/rhythm-config.js —— 「左右节奏训练」场景配置（管理 + 校验 + 持久化）
// ----------------------------------------------------------------------------
// 与射击 / 走钢丝 / 接水果各自独立保存，存储键 rhythm_cfg_v1。
// 治疗师在 pages/rhythm-settings 修改后立即写盘，引擎每帧读最新值。
//
// 【2026-11-01 参数体系变更：时间表 → 门控】
//   已删除（它们描述的是「机器按时间表放音符」）：
//     perfectMs / greatMs / goodMs / earlyFactor   时间窗口，门控下没有时间可对
//     noteGapMs                                     音符间隔，改由患者的速度决定
//     restRate                                      呼吸间隔，机器不再插空
//     snapToBeat / noteStepBeats / beatsPerBar 相关  吸附拍点，音乐已不承担节奏
//     sameSideGapMs / comboBreakOnMiss              针对漏接的后门，已无漏接
//     beatClickOn                                   拍点点击音，没有拍点了
//   新增：
//     gapMs          喘息：完成一个之后隔多久出下一个（档位越高越短）
//     holdMs         保持要求：稳住之后还要保持多久才算完成
//     backgroundId   背景（患者可在开始页自选）
//     melodyOn       命中推进旋律
//
// 单位约定：
//   · leftLimit / rightLimit：角度（°），只用于把姿态偏移归一化成 ±1，不是位移
//   · sideThreshold：归一化控制量阈值（0~1），|x| 超过它才算进入左/右区域
//   · stableMs：进入某一侧后要保持多久才算「稳住」
//   · holdMs：稳住之后还要保持多久才算完成
//   · gapMs：完成一个音符后到下一个音符**出现**的间隔
//   · approachMs：音符从地平线飞到判定线的时间（到线后停住等，不会冲过去）
//
// 所有默认值都是"待真机实测的游戏参数"，不代表医疗安全区间，也不构成
// 康复疗效结论。
// ============================================================================

const { SONGS, DEFAULT_SONG_ID } = require('./rhythm-songs.js')

const STORAGE_KEY = 'rhythm_cfg_v1'

const SONG_IDS = SONGS.map((s) => s.songId)

// 三个背景：同一套跑道与山形几何，只换天空与光。
// **车道色温（左冷青 / 中暖白 / 右琥珀）不随背景变** —— 那是功能语义，
// 换了患者要重新学，属于医疗红线。
const BACKGROUNDS = ['dawn', 'dusk', 'moon']

const SCHEMA = {
  // ---------------- 难度 ----------------
  difficulty: {
    group: '难度', label: '难度档位', type: 'num', unit: '档',
    min: 1, max: 5, step: 1, def: 2,
    tip: '第 1 档节奏慢、只需稳一下就过；第 5 档节奏紧、要稳得更久'
  },

  // ---------------- 画面 ----------------
  backgroundId: {
    group: '画面', label: '背景', type: 'enum', def: 'dawn',
    options: BACKGROUNDS,
    labels: { dawn: '清晨逆光', dusk: '暮色蓝调', moon: '月夜银' },
    tip: '只换天色与光，跑道与车道色温不变（左冷青 / 中暖白 / 右琥珀）'
  },

  // ---------------- 音乐 ----------------
  songId: {
    group: '音乐', label: '音色', type: 'enum', def: DEFAULT_SONG_ID,
    options: SONG_IDS,
    labels: SONGS.reduce((m, s) => { m[s.songId] = s.name; return m }, {}),
    tip: '命中发声的调式与音色。BPM 不再决定节奏 —— 音符什么时候来由患者自己决定'
  },
  melodyOn: {
    group: '音乐', label: '命中推进旋律', type: 'bool', def: true,
    tip: '每完成一个音符，旋律往前走一步，像自己在弹这首曲子。关掉后改成循环播放背景乐（音符仍按门控出现，与音乐无关）'
  },
  musicVolume: {
    group: '音乐', label: '音量', type: 'num', unit: '', min: 0, max: 1, step: 0.05, def: 0.7,
    tip: '命中音与提示音的音量'
  },
  syncOffsetMs: {
    group: '音乐', label: '音画延迟补偿', type: 'num', unit: 'ms',
    min: -200, max: 200, step: 5, def: 0,
    tip: '已停用：门控下音符会停住等，不存在音画对不上的问题。字段保留只为解释旧记录'
  },
  beatPulseOn: {
    group: '音乐', label: '临近呼吸提示', type: 'bool', def: true,
    tip: '判定台与踏板随音符临近柔和呼吸，帮助患者预判什么时候该动'
  },

  // ---------------- 训练目标 ----------------
  durationSec: {
    group: '训练目标', label: '训练时长', type: 'num', unit: '秒',
    min: 30, max: 300, step: 5, def: 90,
    tip: '到点即结束，完成多少个算多少个（音符不会再漏，只是做得慢）'
  },
  prepMs: {
    group: '训练目标', label: '开头预备时间', type: 'num', unit: 'ms',
    min: 600, max: 8000, step: 100, def: 2000,
    tip: '开始后多久出现第一个音符。建议不小于音符飞行时间的六成'
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
    min: 0.15, max: 0.8, step: 0.05, def: 0.2,
    // 0.35 → 0.2（2026-10-30）：按默认死区 1.5° / 边界 12° 换算
    //   0.1 → 2.7°（太浅，呼吸都能触发）
    //   0.2 → 3.9°（死区的 2.6 倍，明确侧倾才触发）← 取这个
    //   0.35 → 5.7°（要明显摆动，幅度小的患者进不去）
    tip: '|控制量| 超过该值才算进入左 / 右区域；越大越难触发。0.2 约等于侧倾 4°'
  },
  stableMs: {
    group: '左右判定', label: '稳定判定时间', type: 'num', unit: 'ms',
    min: 0, max: 400, step: 10, def: 120,
    tip: '进入某一侧后需要保持多久才算「稳住」，过滤路过的抖动'
  },

  // ---------------- 节奏判定（门控） ----------------
  holdMs: {
    group: '节奏判定', label: '保持要求', type: 'num', unit: 'ms',
    min: 120, max: 1200, step: 20, def: 400,
    tip: '稳住之后还要保持多久才算完成。这是「稳得住」的核心参数，越高越难'
  },
  gapMs: {
    group: '节奏判定', label: '音符喘息', type: 'num', unit: 'ms',
    min: 0, max: 2000, step: 20, def: 250,
    tip: '完成一个音符后隔多久出下一个。0 = 立刻出，越大节奏越从容'
  },
  approachMs: {
    group: '节奏判定', label: '音符飞行时间', type: 'num', unit: 'ms',
    min: 900, max: 4000, step: 50, def: 1700,
    // 门控下它**不再承担预判难度**：音符飞到判定线就停住等，来不及也没关系。
    // 所以不用像旧版那样拉到 3400ms，1.3~2.2 秒既看得清、又不至于一局做不了几个。
    tip: '音符从地平线飞到判定线的时间。到线后会停在那里等，不会冲过去'
  },
  centerRate: {
    group: '节奏判定', label: '中间音符比例', type: 'num', unit: '',
    min: 0, max: 0.6, step: 0.05, def: 0.25,
    tip: '0 = 只出左右音符；调高后要求「回到中立位」的中间音符越多'
  },
  sameSideRate: {
    group: '节奏判定', label: '同向保持比例', type: 'num', unit: '',
    min: 0, max: 0.5, step: 0.05, def: 0.12,
    tip: '连着两个同方向：患者不用动，练的是「稳住不动多久」'
  },
  chartSeed: {
    group: '节奏判定', label: '序列种子', type: 'num', unit: '',
    min: 1, max: 9999, step: 1, def: 7,
    tip: '同曲同难度同种子 → 完全相同的方向序列，便于前后对比'
  },

  // ---------------- 计分 ----------------
  scorePerfect: { group: '计分', label: '完美分值', type: 'num', unit: '分', min: 50, max: 200, step: 10, def: 100 },
  scoreGreat: { group: '计分', label: '很稳分值', type: 'num', unit: '分', min: 20, max: 150, step: 10, def: 70 },
  scoreGood: { group: '计分', label: '完成分值', type: 'num', unit: '分', min: 10, max: 100, step: 5, def: 40 },
  comboStep: { group: '计分', label: '连击加成步长', type: 'num', unit: '', min: 0, max: 0.2, step: 0.01, def: 0.04 },
  comboMaxMul: { group: '计分', label: '连击倍率上限', type: 'num', unit: '倍', min: 1, max: 3, step: 0.1, def: 1.5 },
  finishBonus: { group: '计分', label: '完成奖励', type: 'num', unit: '分', min: 0, max: 500, step: 10, def: 100 },

  // ---------------- 反馈 ----------------
  sfxOn: { group: '反馈', label: '音效', type: 'bool', def: true },
  voiceOn: { group: '反馈', label: '语音播报', type: 'bool', def: true, tip: '等待提示（往左一点）也会用到语音' },
  vibrateOn: { group: '反馈', label: '振动反馈', type: 'bool', def: true },
  guideOn: { group: '反馈', label: '引导提示', type: 'bool', def: true, tip: '长时间没完成一个音符时给一句提示' }
}

const GROUPS = ['难度', '画面', '音乐', '训练目标', '体感输入', '左右判定', '节奏判定', '计分', '反馈']

// 五档预设：只覆盖"游戏手感"参数，体感输入与画面/音色的选择保持治疗师设置
//
// 门控下难度由三件事一起决定，缺一不可：
//   · gapMs      喘息：越小越赶
//   · approachMs 飞行：越短越不容易看清（但到线会停住等，所以不再是硬门槛）
//   · holdMs     保持：越大越考验「稳得住」——这是康复真正的目标
//
// 一个完整周期 ≈ gapMs + approachMs + holdMs（不含患者自己磨蹭的时间）：
//   1 档 2840ms → 60 秒约 21 个
//   3 档 2350ms → 90 秒约 38 个
//   5 档 1960ms → 120 秒约 61 个
// 旧时间表模式同档位是 62 个，但那个数字是「必须接住才有的量」，
// 一旦漏几个就崩；门控下这 38 个是真的一个一个做完的。
const PRESETS = {
  1: {
    label: '入门', gapMs: 400, approachMs: 2200, holdMs: 240,
    centerRate: 0.35, sameSideRate: 0.05,
    stableMs: 80, durationSec: 60, prepMs: 2400
  },
  2: {
    label: '轻量', gapMs: 340, approachMs: 2000, holdMs: 300,
    centerRate: 0.3, sameSideRate: 0.08,
    stableMs: 100, durationSec: 75, prepMs: 2200
  },
  3: {
    label: '标准', gapMs: 250, approachMs: 1700, holdMs: 400,
    centerRate: 0.25, sameSideRate: 0.12,
    stableMs: 120, durationSec: 90, prepMs: 2000
  },
  4: {
    label: '进阶', gapMs: 170, approachMs: 1500, holdMs: 480,
    centerRate: 0.2, sameSideRate: 0.16,
    stableMs: 140, durationSec: 105, prepMs: 1800
  },
  5: {
    label: '挑战', gapMs: 100, approachMs: 1300, holdMs: 560,
    centerRate: 0.15, sameSideRate: 0.2,
    stableMs: 160, durationSec: 120, prepMs: 1600
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
  if (!SONG_IDS.includes(s.songId)) errors.push('音色不存在：' + s.songId)
  if (BACKGROUNDS.indexOf(s.backgroundId) < 0) errors.push('背景不存在：' + s.backgroundId)
  if (s.sideThreshold > 0.7) warnings.push('左右区域阈值偏大，患者可能需要很大幅度才能触发')
  if (s.approachMs < 1200) warnings.push('音符飞行时间偏短，患者可能看不清就要动')
  if (s.holdMs > 800) warnings.push('保持要求超过 0.8 秒，多数患者会中途抖掉，建议配合降低侧向阈值')
  if (s.stableMs > 0 && s.holdMs < s.stableMs) warnings.push('保持要求小于稳定判定时间，等于只要求「稳一下」')
  if (s.durationSec > 240) warnings.push('单局超过 4 分钟，建议中途休息')
  if (s.melodyOn && s.musicVolume <= 0) warnings.push('命中旋律已开启但音量为 0，等于没有任何听觉反馈')
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
  BACKGROUNDS,
  DEFAULT_CONFIG,
  STORAGE_KEY,
  validate,
  coerce
}
