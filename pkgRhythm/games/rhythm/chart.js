// ============================================================================
// games/rhythm/chart.js —— 方向序列（不再生成时间表）
// ----------------------------------------------------------------------------
// 【2026-11-01 结构变更】从「时间表」改成「方向序列」
//
// 旧模型：谱面预先算好每个音符的绝对时刻（t += gapMs），引擎按时间把它们
// 一个个飞到判定线上，过了窗口就打 MISS。后果是**下一个音符什么时候来跟患者
// 有没有接到完全无关** —— 接得快就堆着，接不住就连着漏，主观上就是
// 「一下子来一堆、一下子半天不来」。
//
// 新模型：门控。同一时刻场上只有一个音符，它飞到判定线就停在那里等，
// 患者完成之后才出下一个。于是「音符什么时候来」由患者自己决定，
// 谱面只需要回答一个问题：**下一个应该是哪个方向**。
//
// 保留的东西（这些和门控无关，都是踩过的坑）：
//   · 确定性种子：同曲 + 同难度 + 同种子 → 完全相同的方向序列，便于前后对比；
//   · 左右交替基于「上一个非中间音符」，否则每个中间音符之后都恒取 left，
//     左侧比右侧多 14~32% —— 康复训练最忌讳左右训练量不对称；
//   · 同向保持（sameSideRate）：连着两个同方向，患者不需要重新移动。
//     **门控下它的意义变了**：从「同向连打」变成「保持训练」——
//     不用动，练的是稳住不动多久。
// ============================================================================

const SIDES = ['left', 'center', 'right']
// 序列长度上限：门控下一局能完成多少由患者决定，多生成一些兜底
const MAX_NOTES = 400
// 生成多少条：按训练时长估一个充裕的上限（最短周期约 800ms）
const MIN_CYCLE_MS = 800

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
 * 生成方向序列
 *
 * @param {object} opts
 *   song            曲目对象或 songId（只用于种子与元信息，不再参与计时）
 *   durationSec     训练时长（秒），用于估算要生成多少条
 *   noteCount       直接指定条数（优先于 durationSec 估算）
 *   centerRate      中间音符比例 0~0.6（要求回到中立位）
 *   sameSideRate    同向保持比例 0~0.5（门控下 = 保持训练）
 *   accentEvery     每几个音符一个强拍（只影响分值与视觉）
 *   difficulty      仅用于种子与备注
 *   seed            序列种子
 *   chartSeedVersion 换算法时改它，旧序列不会悄悄变化
 * @returns {{notes:Array, meta:object}}
 */
function buildSequence(opts) {
  const o = opts || {}
  const songId = typeof o.song === 'string' ? o.song : ((o.song && o.song.songId) || 'slow_wave')
  const durationSec = clamp(Number(o.durationSec) || 90, 10, 600)

  const autoCount = Math.ceil((durationSec * 1000) / MIN_CYCLE_MS) + 12
  const count = clamp(Math.round(Number(o.noteCount) || autoCount), 1, MAX_NOTES)

  const centerRate = clamp(Number(o.centerRate) || 0, 0, 0.6)
  const sameSideRate = clamp(Number(o.sameSideRate) || 0, 0, 0.5)
  const accentEvery = clamp(Number(o.accentEvery) || 4, 2, 8)
  const difficulty = clamp(Number(o.difficulty) || 3, 1, 5)
  const seed = Number(o.seed) || 7
  const version = o.chartSeedVersion || 'v5'

  const rng = mulberry32(hashSeed(songId + '|' + difficulty + '|' + seed + '|' + version))

  const notes = []
  // 交替必须基于「上一个非中间音符」：center !== 'left'，
  // 若拿 lastSide 判断，每个中间音符之后都会恒取 left（左右训练量不对称）。
  let lastNonCenter = 'right'
  let lastSide = 'right'

  for (let i = 0; i < count; i++) {
    let side = lastNonCenter === 'left' ? 'right' : 'left'

    // 三车道：按 centerRate 概率要求「回到中立位」
    if (centerRate > 0 && rng() < centerRate) side = 'center'

    // 同向保持：门控下它代表「不用动，练稳住」
    // 中间音符之后再来一个中间没有意义（等于一直站着），所以要求 lastSide 非 center
    if (sameSideRate > 0 && lastSide !== 'center' && rng() < sameSideRate) side = lastSide

    const accent = (i + 1) % accentEvery === 0
    notes.push({
      noteId: 'n' + String(i + 1).padStart(4, '0'),
      seq: i + 1,
      targetSide: side,
      noteType: accent ? 'accent' : 'normal',
      scoreValue: accent ? 120 : 100,
      // 门控下时间由引擎在运行时填写；这里保持字段存在，避免下游到处判空
      targetTimeMs: 0,
      spawnAtMs: 0
    })

    lastSide = side
    if (side !== 'center') lastNonCenter = side
  }

  return {
    notes: notes,
    meta: {
      songId: songId,
      difficulty: difficulty,
      seed: seed,
      version: version,
      durationSec: durationSec,
      mode: 'gate',
      noteCount: notes.length,
      centerRate: centerRate,
      sameSideRate: sameSideRate,
      leftCount: notes.filter((n) => n.targetSide === 'left').length,
      centerCount: notes.filter((n) => n.targetSide === 'center').length,
      rightCount: notes.filter((n) => n.targetSide === 'right').length,
      generatedAt: ''
    }
  }
}

/**
 * 兼容旧调用名。引擎已改用 buildSequence，这里保留给外部工具/旧谱面文件。
 */
function buildChart(opts) {
  return buildSequence(opts)
}

/**
 * 读取外部 JSON 方向序列并校验
 * 支持 [ ... ] 或 { notes: [...] }
 * 时间字段（targetTimeMs）**不再需要**，写了也忽略 —— 门控模式下时间由患者决定。
 * @returns {{notes:Array, errors:Array<string>}}
 */
function parseChart(raw) {
  const errors = []
  let list = null
  if (Array.isArray(raw)) list = raw
  else if (raw && typeof raw === 'object' && Array.isArray(raw.notes)) list = raw.notes
  if (!list) return { notes: [], errors: ['序列格式不正确：需要数组或 { notes: [...] }'] }

  const out = []
  const seen = {}
  list.forEach((item, i) => {
    if (!item || typeof item !== 'object') {
      errors.push('第 ' + (i + 1) + ' 条不是对象')
      return
    }
    const side = SIDES.indexOf(item.targetSide) >= 0 ? item.targetSide : null
    if (!side) {
      errors.push('第 ' + (i + 1) + ' 条 targetSide 必须是 left / center / right')
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
      seq: i + 1,
      targetSide: side,
      noteType: item.noteType === 'accent' ? 'accent' : 'normal',
      scoreValue: isFinite(Number(item.scoreValue)) ? Number(item.scoreValue) : 100,
      targetTimeMs: 0,
      spawnAtMs: 0
    })
  })
  return { notes: out, errors }
}

/** 序列摘要（设置页/记录页展示用） */
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

module.exports = { buildSequence, buildChart, parseChart, chartSummary, hashSeed, mulberry32 }
