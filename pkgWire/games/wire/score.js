// ============================================================================
// games/wire/score.js —— 计分（透明、可复现、分项可核对）
// ----------------------------------------------------------------------------
// 分项：
//   distance  前进距离分：每前进 1 米 × scorePerMeter
//   stable    稳定时间分：每秒 × stableScorePerSec × 连击倍率
//   combo     连击加成（单独记录，便于核对；已包含在 stable 中）
//   finish    走完全程奖励（仅完成时一次性计入）
//   penalty   越界/介入扣分（可配置，默认很轻）
//
// 规则约定：
//   · 相同配置、相同操作 → 结果一致（不使用随机数）
//   · 时间来自真实 dt（由引擎按 Date.now 计算），不依赖帧数
//   · 保险绳介入不清零得分，只按配置扣分（默认 0 分）
//   · 结算只做一次（引擎用 settled 标记），不会重复累加
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
    this.distance = 0 // 米
    this.distanceScore = 0
    this.stableScore = 0
    this.comboBonus = 0
    this.finishBonus = 0
    this.penalty = 0
    this.stableSec = 0
    this.streak = 0 // 连续稳定秒数
    this.combo = 0 // 当前连击等级
    this.maxCombo = 0
    this.settled = false
    this._sinceCombo = 0
  }

  get comboMul() {
    const step = Number(this.cfg.get('comboStep')) || 0
    const cap = Math.max(1, Number(this.cfg.get('comboMaxMul')) || 1)
    return Math.min(cap, 1 + this.combo * step)
  }

  /** 前进距离（米） */
  addDistance(meters) {
    const m = Math.max(0, Number(meters) || 0)
    if (m <= 0) return
    this.distance += m
    this.distanceScore += m * (Number(this.cfg.get('scorePerMeter')) || 0)
  }

  /**
   * 每帧结算稳定分
   * @param {number} dt 秒
   * @param {boolean} stable 是否处于稳定区
   */
  update(dt, stable) {
    const step = Math.max(0, Math.min(0.1, Number(dt) || 0))
    if (stable) {
      this.stableSec += step
      this._sinceCombo += step
      // 每满 1 秒提升一级连击
      while (this._sinceCombo >= 1) {
        this._sinceCombo -= 1
        this.combo += 1
        if (this.combo > this.maxCombo) this.maxCombo = this.combo
      }
      const perSec = Number(this.cfg.get('stableScorePerSec')) || 0
      const gain = perSec * this.comboMul * step
      this.stableScore += gain
      this.comboBonus += Math.max(0, gain - perSec * step)
    } else {
      this._sinceCombo = 0
      this.combo = 0
    }
  }

  /** 扣分（越界 / 绳索介入等） */
  penaltyBy(points, reason) {
    const p = Math.max(0, Number(points) || 0)
    if (p <= 0) return 0
    this.penalty += p
    this.lastPenalty = { points: p, reason: reason || '', at: Date.now() }
    return p
  }

  addFinish() {
    if (this.finishBonus > 0) return 0
    const v = Math.max(0, Number(this.cfg.get('finishBonus')) || 0)
    this.finishBonus = v
    return v
  }

  get total() {
    const raw = this.distanceScore + this.stableScore + this.finishBonus - this.penalty
    return Math.max(0, Math.round(raw))
  }

  snapshot() {
    return {
      total: this.total,
      distance: round1(this.distance),
      distanceScore: Math.round(this.distanceScore),
      stableScore: Math.round(this.stableScore),
      comboBonus: Math.round(this.comboBonus),
      finishBonus: Math.round(this.finishBonus),
      penalty: Math.round(this.penalty),
      stableSec: round1(this.stableSec),
      maxCombo: this.maxCombo,
      comboMul: round1(this.comboMul)
    }
  }
}

module.exports = { ScoreManager }
