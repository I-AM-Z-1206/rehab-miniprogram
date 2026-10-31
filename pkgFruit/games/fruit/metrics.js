// ============================================================================
// games/fruit/metrics.js —— 从「逐颗接取记录」算能力指标
// ----------------------------------------------------------------------------
// 为什么不能直接用命中率：
//   命中率 = f(患者能力, 落点分布)。落点随机时，同一个患者两局的命中率能差
//   20 个百分点 —— 拿它做「这段时间训练有没有效」，噪声会盖掉真实变化。
//
// 所以这里算的是**能力指标**，它们都不含"这局水果落在哪"这个随机因素：
//   D75   成功率 75% 对应的侧倾角度 —— 他能够到多远（功能性前伸的等价物）
//   RT50  反应潜伏期中位数 —— 从看见到开始动，运动准备的速度
//   MT50  到位耗时中位数 —— 从开始动到进入接取窗口，重心转移的速度
//   稳定率 到位后停不停得住（沿用引擎的 holdRate）
//   有效占比 1 - 无响应时长 / 总时长 —— 这段时间他到底有没有在练
//
// 全是纯函数：不碰 wx、不碰 engine 实例，可以直接喂数据验。
// ============================================================================

/** 中位数；空数组返回 null（不能返回 0，0 会被当成"极快"） */
function median(list) {
  const arr = (list || []).filter((v) => typeof v === 'number' && isFinite(v))
  if (!arr.length) return null
  arr.sort((a, b) => a - b)
  const mid = Math.floor(arr.length / 2)
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2
}

/** 分箱的边界（度）。3° 一档：对康复患者来说，3° 侧倾差不多是一次可见的重心转移 */
const BIN_EDGES = [0, 3, 6, 9, 12, 999]

/**
 * 按距离分箱统计成功率。
 * @param {Array} trials 每项至少要有 { dDeg, hit }
 */
function bins(trials) {
  const out = []
  for (let i = 0; i < BIN_EDGES.length - 1; i++) {
    out.push({ lo: BIN_EDGES[i], hi: BIN_EDGES[i + 1], n: 0, hits: 0, rate: null })
  }
  ;(trials || []).forEach((t) => {
    const d = Number(t && t.dDeg)
    if (!isFinite(d) || d < 0) return
    let idx = 0
    while (idx < out.length - 1 && d >= out[idx].hi) idx += 1
    out[idx].n += 1
    if (t.hit) out[idx].hits += 1
  })
  out.forEach((b) => { b.rate = b.n ? b.hits / b.n : null })
  return out
}

/**
 * D75：成功率降到 75% 的那个距离。
 *
 * 做法：在相邻两个"有效箱"（n≥2）之间线性插值。单箱样本少于 2 个不参与，
 * 否则一颗水果就能把某个箱的成功率定成 0% 或 100%。
 *
 * @returns {{value:number|null, bins:Array, enough:boolean, note:string}}
 */
function d75(trials, opts) {
  const o = opts || {}
  const minTrials = o.minTrials === undefined ? 20 : o.minTrials
  const target = o.target === undefined ? 0.75 : o.target
  const list = trials || []
  const all = bins(list)

  if (list.length < minTrials) {
    return { value: null, bins: all, enough: false, note: '样本不足（' + list.length + '/' + minTrials + '）' }
  }

  // 只用样本够的箱
  const valid = all.filter((b) => b.n >= 2)
  if (!valid.length) {
    return { value: null, bins: all, enough: false, note: '没有可用分箱' }
  }

  const ctr = (b) => (b.hi > 900 ? b.lo + 3 : (b.lo + b.hi) / 2)
  // 观测到的最大距离：给"到顶"兜底用。
  // 不兜的话 12° 以上那箱会被取成 15°，而患者实际最多只被要求 12°——
  // 报一个他从来没被要求的距离，比不报更糟。
  const maxObserved = Math.max.apply(null, list.map((t) => Number(t.dDeg) || 0))

  // 全都 ≥ 目标：说明最难的那一档还没难住他，取观测到的最大距离，标记"到顶"
  if (valid.every((b) => b.rate >= target)) {
    const last = valid[valid.length - 1]
    const cap = Math.min(90, maxObserved || ctr(last))
    return { value: Math.round(cap * 10) / 10, bins: all, enough: true, note: '已到最深一档' }
  }

  // 全都 < 目标：连最近的一档都不到 75%，D75 落在最小箱以下
  if (valid.every((b) => b.rate < target)) {
    const first = valid[0]
    return { value: Math.round(ctr(first) * 10) / 10, bins: all, enough: true, note: '连最近一档都未达标' }
  }

  for (let i = 0; i < valid.length - 1; i++) {
    const a = valid[i]
    const b = valid[i + 1]
    if (a.rate >= target && b.rate < target) {
      const span = a.rate - b.rate
      const k = span > 1e-6 ? (a.rate - target) / span : 0
      const v = ctr(a) + (ctr(b) - ctr(a)) * k
      return { value: Math.round(v * 10) / 10, bins: all, enough: true, note: '' }
    }
  }
  const last = valid[valid.length - 1]
  const cap = Math.min(90, maxObserved || (last.hi > 900 ? ctr(last) : last.hi))
  return { value: Math.round(cap * 10) / 10, bins: all, enough: true, note: '' }
}

/**
 * 一局的完整指标汇总。
 * @param {Array} trials 逐颗记录 {dDeg, hit, rt, mt, visibleSec, noResponse}
 * @param {object} o { elapsedSec, holdRate, minTrials }
 */
function summarize(trials, o) {
  const opt = o || {}
  const list = trials || []
  const elapsed = Math.max(0, Number(opt.elapsedSec) || 0)

  const rts = []
  const mts = []
  let noRespSec = 0
  let noRespCount = 0
  list.forEach((t) => {
    if (typeof t.rt === 'number' && isFinite(t.rt)) rts.push(t.rt)
    if (typeof t.mt === 'number' && isFinite(t.mt)) mts.push(t.mt)
    if (t.noResponse) {
      noRespCount += 1
      noRespSec += Math.max(0, Number(t.visibleSec) || 0)
    }
  })

  const activeSec = elapsed > 0 ? Math.max(0, elapsed - noRespSec) : 0
  const activeRate = elapsed > 0.5 ? clamp01(activeSec / elapsed) : null

  const d = d75(list, { minTrials: opt.minTrials })

  return {
    trials: list.length,
    d75: d.value,
    d75Note: d.note,
    d75bins: d.bins,
    rt50: round1(median(rts)),
    mt50: round1(median(mts)),
    holdRate: opt.holdRate === undefined ? null : opt.holdRate,
    activeRate: activeRate === null ? null : round1(activeRate * 100) / 100,
    noResponseCount: noRespCount,
    noResponseSec: round1(noRespSec),
    hitRate: list.length ? round1((list.filter((t) => t.hit).length / list.length) * 100) / 100 : null
  }
}

function clamp01(v) {
  return v < 0 ? 0 : (v > 1 ? 1 : v)
}

function round1(v) {
  if (v === null || v === undefined || !isFinite(v)) return null
  return Math.round(v * 10) / 10
}

module.exports = { median, bins, d75, summarize, BIN_EDGES }
