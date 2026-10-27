// ============================================================================
// games/fruit/score.js —— 接水果计分（透明、可复现、分项可核对）
// ----------------------------------------------------------------------------
// 分项：
//   base      每个水果的基础分（按水果类型，取自配置）
//   combo     连击加成（单独统计，方便核对；已包含在 base 的实际得分里）
//   finish    完成训练奖励（只在完整走完计划时长时一次性计入）
//
// 规则约定：
//   · 每个水果只结算一次（引擎用 fruit.scored 标记，这里不重复计数）
//   · 连击只在接住时增加；漏接 / 超时按配置归零
//   · 时间来自真实 dt（引擎按 Date.now 计算），不按帧数累加
//   · 结算只做一次（引擎用 settled 标记）
// ============================================================================

function round1(v) {
  return Math.round(v * 10) / 10
}

class ScoreManager {
  constructor(cfg) {
    this.cfg = cfg
    this.reset()
  }

  reset() {
    this.base = 0 // 累计原始得分（含连击倍率后的取整值）
    this.hits = 0
    this.misses = 0
    this.combo = 0
    this.maxCombo = 0
    this.comboBonus = 0
    this.finishBonus = 0
    this.sinceHit = 0
    this.lastGain = 0
    this.settled = false
    this.byType = {}
  }

  /** 连击倍率：第 n 次连续接住 → 1 + (n-1)*step，上限 comboMaxMul */
  get comboMul() {
    const step = Number(this.cfg.get('comboStep')) || 0
    const cap = Math.max(1, Number(this.cfg.get('comboMaxMul')) || 1)
    return Math.min(cap, 1 + Math.max(0, this.combo - 1) * step)
  }

  /**
   * 接住一个水果。
   * @param {number} value 该水果的基础分
   * @param {string} type 水果类型 id（用于分类统计）
   * @returns {{gain:number, combo:number, mul:number}}
   */
  hit(value, type) {
    const base = Math.max(0, Number(value) || 0)
    this.combo += 1
    if (this.combo > this.maxCombo) this.maxCombo = this.combo
    const mul = this.comboMul
    const gain = Math.round(base * mul)
    this.base += gain
    this.comboBonus += Math.max(0, gain - base)
    this.hits += 1
    this.sinceHit = 0
    this.lastGain = gain
    if (type) this.byType[type] = (this.byType[type] || 0) + 1
    return { gain: gain, combo: this.combo, mul: mul }
  }

  miss() {
    this.misses += 1
    if (this.cfg.get('comboResetOnMiss')) this.combo = 0
  }

  /** 每帧推进：处理连击保持时间（0 表示不因时间中断） */
  update(dt) {
    const step = Math.max(0, Math.min(0.1, Number(dt) || 0))
    const win = Number(this.cfg.get('comboWindowSec')) || 0
    if (win > 0 && this.combo > 0) {
      this.sinceHit += step
      if (this.sinceHit > win) {
        this.combo = 0
        this.sinceHit = 0
      }
    }
  }

  addFinish() {
    if (this.finishBonus > 0) return 0
    const v = Math.max(0, Number(this.cfg.get('finishBonus')) || 0)
    this.finishBonus = v
    return v
  }

  /** 接取成功率；没有生成过水果时返回 0（不会除零） */
  get accuracy() {
    const total = this.hits + this.misses
    return total > 0 ? this.hits / total : 0
  }

  get total() {
    const raw = this.base + this.finishBonus
    return Math.max(0, Math.round(raw))
  }

  snapshot() {
    return {
      total: this.total,
      base: Math.round(this.base), // 含连击加成后的实际得分
      rawBase: Math.round(this.base - this.comboBonus), // 不含加成的原始分（分项相加 = 总分）

      hits: this.hits,
      misses: this.misses,
      accuracy: round1(this.accuracy * 100) / 100,
      maxCombo: this.maxCombo,
      comboBonus: Math.round(this.comboBonus),
      finishBonus: Math.round(this.finishBonus),
      byType: Object.assign({}, this.byType)
    }
  }
}

module.exports = { ScoreManager }
