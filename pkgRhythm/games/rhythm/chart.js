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

  const step = clamp(Number(o.noteStepBeats) || 1, 0.25, 4)
  const restRate = clamp(Number(o.restRate) || 0, 0, 0.6)
  const sameSideRate = clamp(Number(o.sameSideRate) || 0, 0, 0.6)
  const centerRate = clamp(Number(o.centerRate) || 0, 0, 0.6)
  const sameSideGapMs = clamp(Number(o.sameSideGapMs) || 320, 80, 2000)
  const prepBeats = clamp(Number(o.prepBeats) || 4, 0, 16)
  const difficulty = clamp(Number(o.difficulty) || 3, 1, 5)
  const seed = Number(o.seed) || 7
  const version = o.chartSeedVersion || 'v1'

  const rng = mulberry32(hashSeed(song.songId + '|' + difficulty + '|' + seed + '|' + version))

  // 呼吸拍：按固定间隔留空，而不是随机留空。
  // 随机留空会连着空两三拍（患者感受就是"一堆音符之后半天没一个"），
  // 固定间隔则变成"每 N 个音符空一拍"，节奏可预期。
  const restEvery = restRate > 0 ? Math.max(4, Math.round(1 / restRate)) : 0

  const notes = []
  let lastSide = 'right'
  let lastTime = -99999
  let seq = 0
  let restBeats = 0
  let slot = 0

  for (let b = prepBeats; b * beat + offsetMs <= durationMs; b += step) {
    if (notes.length >= MAX_NOTES) break
    const timeMs = Math.round(b * beat) + offsetMs
    if (timeMs > durationMs) break

    // 开头两拍不设休止，保证一上来能听到第一组音符；
    // 之后每隔 restEvery 个音符空一拍（固定位置，绝不会连着空）
    const early = b < prepBeats + 2 * step
    if (!early) {
      slot += 1
      if (restEvery && slot % restEvery === 0) {
        restBeats += 1
        continue
      }
    }

    let side = lastSide === 'left' ? 'right' : 'left'
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
