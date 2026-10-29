// ============================================================================
// games/rhythm/chart.js —— 谱面（音符时间表）
// ----------------------------------------------------------------------------
// 两种来源：
//   1. buildChart()：按 BPM / 难度 / 种子**确定性生成**。同曲 + 同难度 + 同种子
//      → 完全相同的音符时间表，方便治疗师做前后对比；
//   2. parseChart()：读取外部 JSON 谱面（本地文件或后台下发），字段校验后才接受。
//
// 时间口径：targetTimeMs 一律相对"音乐开始"（0 = 音频第 0 ms），
// 单位毫秒，来自 beatIndex × beatMs + offsetMs，不使用帧数。
//
// 方向规则（三车道：左 / 中 / 右）：
//   · 底版仍是左右交替，按 centerRate 概率把音符换成「中间」（要求回到中立位）；
//   · 按 sameSideRate 概率出现"同向连续"；
//   · 同向连续必须留出 sameSideGapMs 的间隔，否则玩家来不及"重新进入"该侧
//     （引擎规定一次动作最多结算一个音符，见 hit-judge.js 的说明）；
//   · 休止拍（restRate）随机留空，给患者喘息。
// ============================================================================

const { songById, beatMs } = require('../../../utils/rhythm-songs.js')

const MAX_NOTES = 2400
const SIDES = ['left', 'center', 'right']

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v)
}

/** 字符串 → 32 位种子（FNV-1a 变体） */
function hashSeed(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** mulberry32：小、稳定、可复现 */
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 生成谱面
 * @param {object} opts
 *   song            曲目对象或 songId
 *   durationSec     训练时长（秒）
 *   noteStepBeats   每几拍一个音符（0.5 = 八分音符）
 *   restRate        休止概率 0~0.5
 *   sameSideRate    同向连续概率 0~0.5
 *   sameSideGapMs   同向连续所需最小间隔
 *   prepBeats       开头空多少拍
 *   difficulty      仅用于种子与备注
 *   seed            谱面种子
 *   chartSeedVersion 换算法时改它，旧谱面不会悄悄变化
 * @returns {{notes:Array, meta:object}}
 */
function buildChart(opts) {
  const o = opts || {}
  const song = typeof o.song === 'string' ? songById(o.song) : (o.song || songById('dawn_walk'))
  const beat = beatMs(song)
  const beatsPerBar = Number(song.beatsPerBar) || 4
  const offsetMs = Number(song.offsetMs) || 0
  const durationSec = clamp(Number(o.durationSec) || 90, 10, 600)
  const durationMs = durationSec * 1000

  const stepRaw = clamp(Number(o.noteStepBeats) || 1, 0.25, 4)
  // ── 康复安全下限：音符间隔必须按**毫秒**定，不能只看拍数 ──
  //
  // 拍数是相对量：同一个「标准」档在 66 BPM 下是 909ms，在 110 BPM 下只有
  // 545ms，差 1.7 倍 —— 治疗师选同一档难度，换个曲子难度就完全变了。
  // 而康复患者完成一次左右转移再稳定下来大约要 700ms 以上，
  // 545ms 的间隔在数学上就不可能命中，患者只能一路漏接。
  //
  // 做法：以毫秒为目标，从合法拍值里挑**换算后最接近目标**的那个。
  // 这样三首曲子在同一难度档下间隔几乎一致，音符也仍然落在拍点上。
  // （早先试过「不够就整倍数放大」，粒度太粗：66 BPM 的 909ms 会被
  //   直接翻到 1818ms，明明只差 9% 却慢了一倍。）
  const targetGapMs = clamp(Number(o.minGapMs) || 0, 0, 4000)
  const ALLOWED_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4]
  let step = stepRaw
  if (targetGapMs > 0) {
    step = ALLOWED_STEPS.reduce((best, b) => {
      return Math.abs(b * beat - targetGapMs) < Math.abs(best * beat - targetGapMs) ? b : best
    }, ALLOWED_STEPS[0])
    // 硬下限兜底：低于这个数，多数康复患者在物理上无法完成一次转移
    let guard = 0
    while (step * beat < 620 && guard < 32) {
      step += 0.25
      guard += 1
    }
  }
  step = clamp(step, 0.25, 8)
  const restRate = clamp(Number(o.restRate) || 0, 0, 0.6)
  const sameSideRate = clamp(Number(o.sameSideRate) || 0, 0, 0.6)
  const centerRate = clamp(Number(o.centerRate) || 0, 0, 0.6)
  const sameSideGapMs = clamp(Number(o.sameSideGapMs) || 320, 80, 2000)
  const prepBeats = clamp(Number(o.prepBeats) || 4, 0, 16)
  const difficulty = clamp(Number(o.difficulty) || 3, 1, 5)
  const seed = Number(o.seed) || 7
  const version = o.chartSeedVersion || 'v1'

  const rng = mulberry32(hashSeed(song.songId + '|' + difficulty + '|' + seed + '|' + version))

  // 呼吸拍：只在**小节末尾**留空，而且按小节计数。
  //
  // 原来是「每 N 个音符空一拍」，空的位置落在小节中间，实际效果是间隔突然
  // 从 666ms 跳到 1333ms —— 患者刚建立起来的节奏预期被整段打断，主观感受
  // 就是「一下子好多、一下子又没有」。乐句末尾的呼吸才是呼吸，
  // 小节中间的空白是断层。
  const restEveryBars = restRate > 0 ? Math.max(2, Math.round(1 / restRate / 2)) : 0

  const notes = []
  let lastSide = 'right'
  // 「上一个非中间音符」：交替必须基于它，不能基于 lastSide。
  // 因为 center !== 'left'，若拿 lastSide 判断，每个中间音符之后都会恒取
  // left —— 实测左侧音符比右侧多 14~32%。康复训练最忌讳左右训练量不对称。
  let lastNonCenter = 'right'
  let lastTime = -99999
  let seq = 0
  let restBeats = 0
  let slot = 0

  for (let b = prepBeats; b * beat + offsetMs <= durationMs; b += step) {
    if (notes.length >= MAX_NOTES) break
    const timeMs = Math.round(b * beat) + offsetMs
    if (timeMs > durationMs) break

    // 开头两拍不设休止，保证一上来能听到第一组音符；
    // 之后每隔 restEveryBars 个小节，在**小节末尾**空一拍。
    const early = b < prepBeats + 2 * step
    if (!early && restEveryBars) {
      // 用 floor 判断跨小节，不用浮点取模 —— step 是 0.75 这类值时，
      // (b+step) % beatsPerBar 永远不会正好落在 0 上，休止就再也不触发了。
      const barNow = Math.floor(b / beatsPerBar)
      const barNext = Math.floor((b + step) / beatsPerBar)
      if (barNext > barNow) {
        slot += 1
        if (slot % restEveryBars === 0) {
          restBeats += 1
          continue
        }
      }
    }

    let side = lastNonCenter === 'left' ? 'right' : 'left'
    // 三车道：按 centerRate 概率要求「回到中立位」（中间音符）
    if (centerRate > 0 && rng() < centerRate) side = 'center'
    const same = rng() < sameSideRate
    if (same && timeMs - lastTime >= sameSideGapMs) side = lastSide

    // 同向但间隔不够 → 强制换向（否则引擎判定规则下玩家没法命中）
    if (side === lastSide && timeMs - lastTime < sameSideGapMs) {
      side = SIDES.find((s) => s !== lastSide) || 'left'
    }

    const onBar = Math.abs((b % beatsPerBar)) < 1e-6
    seq += 1
    notes.push({
      noteId: 'n' + String(seq).padStart(4, '0'),
      targetSide: side,
      beatIndex: Math.round(b * 1000) / 1000,
      targetTimeMs: timeMs,
      noteType: onBar ? 'accent' : 'normal',
      scoreValue: onBar ? 120 : 100,
      judgeStatus: 'pending'
    })

    lastSide = side
    if (side !== 'center') lastNonCenter = side
    lastTime = timeMs
  }

  return {
    notes,
    meta: {
      songId: song.songId,
      bpm: song.bpm,
      beatMs: Math.round(beat * 1000) / 1000,
      beatsPerBar,
      difficulty,
      seed,
      version,
      durationSec,
      durationMs,
      noteCount: notes.length,
      restBeats,
      leftCount: notes.filter((n) => n.targetSide === 'left').length,
      centerCount: notes.filter((n) => n.targetSide === 'center').length,
      rightCount: notes.filter((n) => n.targetSide === 'right').length,
      generatedAt: ''
    }
  }
}

/**
 * 读取外部 JSON 谱面并校验
 * 支持 [ ... ] 或 { notes: [...], bpm?: number, offsetMs?: number }
 * @returns {{notes:Array, errors:Array<string>}}
 */
function parseChart(raw, song) {
  const errors = []
  let list = null
  let bpm = song ? song.bpm : null
  let offsetMs = song ? (song.offsetMs || 0) : 0

  if (Array.isArray(raw)) {
    list = raw
  } else if (raw && typeof raw === 'object') {
    list = Array.isArray(raw.notes) ? raw.notes : null
    if (typeof raw.bpm === 'number') bpm = raw.bpm
    if (typeof raw.offsetMs === 'number') offsetMs = raw.offsetMs
  }
  if (!list) {
    return { notes: [], errors: ['谱面格式不正确：需要数组或 { notes: [...] }'] }
  }

  const out = []
  const seen = {}
  list.forEach((item, i) => {
    if (!item || typeof item !== 'object') {
      errors.push('第 ' + (i + 1) + ' 条不是对象')
      return
    }
    const side = SIDES.indexOf(item.targetSide) >= 0 ? item.targetSide : null
    if (!side) {
      errors.push('第 ' + (i + 1) + ' 条 targetSide 必须是 left 或 right')
      return
    }
    let t = Number(item.targetTimeMs)
    if (!isFinite(t) && bpm && isFinite(Number(item.beatIndex))) {
      t = Math.round(Number(item.beatIndex) * (60000 / bpm)) + offsetMs
    }
    if (!isFinite(t) || t < 0) {
      errors.push('第 ' + (i + 1) + ' 条缺少有效的 targetTimeMs 或 beatIndex')
      return
    }
    const id = String(item.noteId || ('n' + String(i + 1).padStart(4, '0')))
    if (seen[id]) {
      errors.push('noteId 重复：' + id)
      return
    }
    seen[id] = true
    out.push({
      noteId: id,
      targetSide: side,
      beatIndex: isFinite(Number(item.beatIndex)) ? Number(item.beatIndex) : null,
      targetTimeMs: Math.round(t),
      noteType: item.noteType === 'accent' ? 'accent' : 'normal',
      scoreValue: isFinite(Number(item.scoreValue)) ? Number(item.scoreValue) : 100,
      judgeStatus: 'pending'
    })
  })

  out.sort((a, b) => a.targetTimeMs - b.targetTimeMs)
  return { notes: out, errors }
}

/** 谱面摘要（设置页/记录页展示用） */
function chartSummary(notes) {
  const n = notes || []
  let left = 0
  let center = 0
  let right = 0
  for (let i = 0; i < n.length; i++) {
    if (n[i].targetSide === 'left') left += 1
    else if (n[i].targetSide === 'center') center += 1
    else right += 1
  }
  return { count: n.length, left, center, right }
}

module.exports = { buildChart, parseChart, chartSummary, hashSeed, mulberry32 }
