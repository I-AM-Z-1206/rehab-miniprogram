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
// 物理下限：低于这个值，多数康复患者一次左右转移都做不完，只能一路漏接
const HARD_MIN_GAP_MS = 620
// 呼吸时长倍数：呼吸时把间隔拉长，而不是跳过一个音符（跳过 = 节奏断线）
const BREATHE_FACTOR = 1.5
// 吸附模式下允许落在哪些拍值上（保证音符仍在拍点，音乐性不丢）
const ALLOWED_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4]

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
 *
 * 时间推进有两种模式（由 snapToBeat 决定）：
 *   1. **自由间隔（默认）**：音符之间隔多少毫秒就是多少毫秒，与 BPM 无关。
 *      康复训练要的是「患者来得及做一次完整的重心转移」，音乐是背景不是考官，
 *      所以默认不让 BPM 反过来决定训练强度。
 *   2. **吸附拍点（snapToBeat）**：把间隔换算到最近的合法拍值上，音符落在拍点上。
 *      想让动作跟着音乐走时打开；代价是快曲子会把间隔压小，需靠安全下限兜底。
 *
 * @param {object} opts
 *   song            曲目对象或 songId
 *   durationSec     训练时长（秒）
 *   noteGapMs       目标音符间隔（毫秒）—— 自由模式下的主参数
 *   snapToBeat      true = 吸附到音乐拍点（此时 noteStepBeats 生效）
 *   noteStepBeats   每几拍一个音符（仅吸附模式用）
 *   restRate        呼吸频率 0~0.5
 *   sameSideRate    同向连续概率 0~0.5
 *   sameSideGapMs   同向连续所需最小间隔
 *   prepMs          开头留白毫秒（自由模式用，建议 = 音符飞行时间）
 *   prepBeats       开头空多少拍（吸附模式用）
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

  // ── 音符间隔：默认按毫秒直给，不跟音乐拍点 ──
  //
  // 拍数是相对量。同一个「标准」档在 66 BPM 下是 909ms、110 BPM 下只有 545ms，
  // 差 1.7 倍 —— 治疗师选同一档难度，换个曲子难度就完全变了；而康复患者
  // 完成一次左右转移再稳定下来要 700ms 以上，545ms 在数学上就不可能命中。
  //
  // 所以默认用毫秒：目标间隔 = noteGapMs，与 BPM 无关，换曲子训练强度不变。
  // 想保留音乐性就打开 snapToBeat，音符会吸附到最近的合法拍值。
  const snapToBeat = !!o.snapToBeat
  const gapWanted = clamp(Number(o.noteGapMs) || Number(o.minGapMs) || 0, 0, 4000)
  // 物理下限：低于这个值，多数患者一次转移都做不完，只能一路漏接
  const gapMs = Math.max(HARD_MIN_GAP_MS, gapWanted || 1000)

  let step = clamp(Number(o.noteStepBeats) || 1, 0.25, 4)
  if (snapToBeat && gapWanted > 0) {
    step = ALLOWED_STEPS.reduce((best, b) => {
      return Math.abs(b * beat - gapWanted) < Math.abs(best * beat - gapWanted) ? b : best
    }, ALLOWED_STEPS[0])
    let guard = 0
    while (step * beat < HARD_MIN_GAP_MS && guard < 32) {
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
  const prepMs = clamp(Number(o.prepMs) || 2400, 600, 10000)
  const difficulty = clamp(Number(o.difficulty) || 3, 1, 5)
  const seed = Number(o.seed) || 7
  const version = o.chartSeedVersion || 'v1'

  const rng = mulberry32(hashSeed(song.songId + '|' + difficulty + '|' + seed + '|' + version))

  // 呼吸：原来是「跳过一个音符」，间隔直接翻倍（666→1333ms），患者刚建立
  // 起来的节奏预期被整段打断，主观感受就是「一下子好多、一下子又没有」。
  // 改成把间隔拉长到 1.5 倍 —— 音符一个不少，只是慢半拍，节奏不断线。
  const restEvery = restRate > 0 ? Math.max(2, Math.round(1 / restRate / 2)) : 0
  // 重音周期：自由模式下没有小节，按固定间隔给一个「强拍感」
  const accentEvery = clamp(Number(o.accentEvery) || 4, 2, 8)

  // ── 第一步：只算「音符出现在哪些时刻」──
  // 两种模式的差别全在这段里，后面的方向分配完全共用。
  const slots = []
  let restBeats = 0

  if (snapToBeat) {
    let slot = 0
    for (let b = prepBeats; b * beat + offsetMs <= durationMs; b += step) {
      const timeMs = Math.round(b * beat) + offsetMs
      if (timeMs > durationMs) break
      // 开头不设休止，保证一上来就能听到第一组音符；之后每隔 restEvery 个
      // 小节，在**小节末尾**空一拍。用 floor 判断跨小节，不用浮点取模 ——
      // step 是 0.75 这类值时 (b+step) % beatsPerBar 永远不落在 0 上。
      const early = b < prepBeats + 2 * step
      if (!early && restEvery) {
        const barNow = Math.floor(b / beatsPerBar)
        const barNext = Math.floor((b + step) / beatsPerBar)
        if (barNext > barNow) {
          slot += 1
          if (slot % restEvery === 0) {
            restBeats += 1
            continue
          }
        }
      }
      slots.push({ t: timeMs, b: b })
    }
  } else {
    let t = offsetMs + prepMs
    while (t <= durationMs && slots.length < MAX_NOTES) {
      slots.push({ t: Math.round(t), b: t / beat })
      const breathe = restEvery > 0 && slots.length % restEvery === 0
      if (breathe) restBeats += 1
      t += Math.round(breathe ? gapMs * BREATHE_FACTOR : gapMs)
    }
  }

  // ── 第二步：给每个时刻分配方向（两种模式共用同一套规则）──
  const notes = []
  let lastSide = 'right'
  // 「上一个非中间音符」：交替必须基于它，不能基于 lastSide。
  // 因为 center !== 'left'，若拿 lastSide 判断，每个中间音符之后都会恒取
  // left —— 实测左侧音符比右侧多 14~32%。康复训练最忌讳左右训练量不对称。
  let lastNonCenter = 'right'
  let lastTime = -99999
  let seq = 0

  for (let i = 0; i < slots.length; i++) {
    const timeMs = slots[i].t

    let side = lastNonCenter === 'left' ? 'right' : 'left'
    // 三车道：按 centerRate 概率要求「回到中立位」（中间音符）
    if (centerRate > 0 && rng() < centerRate) side = 'center'
    const same = rng() < sameSideRate
    if (same && timeMs - lastTime >= sameSideGapMs) side = lastSide

    // 同向但间隔不够 → 强制换向（否则引擎判定规则下玩家没法命中）
    if (side === lastSide && timeMs - lastTime < sameSideGapMs) {
      side = SIDES.find((s) => s !== lastSide) || 'left'
    }

    const accent = snapToBeat
      ? Math.abs(slots[i].b % beatsPerBar) < 1e-6
      : i % accentEvery === 0

    seq += 1
    notes.push({
      noteId: 'n' + String(seq).padStart(4, '0'),
      targetSide: side,
      beatIndex: Math.round(slots[i].b * 1000) / 1000,
      targetTimeMs: timeMs,
      noteType: accent ? 'accent' : 'normal',
      scoreValue: accent ? 120 : 100,
      // 同向连续：这条跟上一条同侧，患者**不需要重新移动**，已经在正确位置。
      // 引擎拿它区分「真的移动了」和「本来就站在这边」——
      // 没有这个标记，交替谱面下「站着不动」也能靠时间后门拿分（见 engine._actionOk）。
      repeat: seq > 1 && side === lastSide && side !== 'center',
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
      snapToBeat,
      gapMs,
      gapWantedMs: gapWanted,
      prepMs,
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
  // 同向连续标记：外部谱面也要补算，否则引擎会把「本来就站在这边」当成
  // 「没移动」，同向连续的第二个音符永远判不中。
  for (let i = 0; i < out.length; i++) {
    const prev = i > 0 ? out[i - 1].targetSide : null
    out[i].repeat = i > 0 && out[i].targetSide === prev && out[i].targetSide !== 'center'
  }
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
