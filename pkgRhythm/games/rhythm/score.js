// ============================================================================
// games/rhythm/score.js —— 计分 / 连击 / 稳定度 / 左右均衡
// ----------------------------------------------------------------------------
// 【2026-11-01 口径变更】跟着判定一起换
//
// 旧口径有三个「准确率」：节奏准确率（时间）、方向准确率、综合命中率。
// 门控模式下后两个数学上恒等于 100%（方向不对就完不成，完成数就是分母），
// 继续显示等于骗人，所以整组换成：
//
//   稳定度 stabilityRate = (完美×1 + 很稳×0.75 + 完成×0.4) / 完成数
//   左右均衡 balanceRate = 1 - |左 - 右| / (左 + 右)     ← 0 个左右音符时返回 null
//   平均节奏 paceSec     = 实际用时 / 完成数              ← 引擎算，这里的 avgHold 只做辅助
//
// 公式：
//   单音符得分 = 音符分值 × 连击倍率
//   连击倍率   = min(comboMaxMul, 1 + max(0, combo - 1) × comboStep)
//   总分       = 基础分合计 + 连击加成合计 + 完成奖励
//
// 连击 = 连续「稳住」（完美 / 很稳）。掉到「完成了」会断连击 ——
// 断的是倍率，不扣分、也不给红字提示（康复红线：失误提示必须中性）。
//
// 分母为 0 时一律返回 null（页面显示「暂无数据」），绝不冒充 100%。
// ============================================================================

const { ACC_WEIGHT, VERDICT } = require('./hit-judge.js')

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v)
}

class ScoreManager {
  constructor(cfg) {
    this.cfg = cfg
    this.reset()
  }

  reset() {
    this.perfect = 0
    this.great = 0
    this.good = 0
    this.unsolved = 0
    this.wrongDir = 0
    this.leftHits = 0
    this.centerHits = 0
    this.rightHits = 0
    this.combo = 0
    this.maxCombo = 0
    this.base = 0
    this.comboBonus = 0
    this.finishBonus = 0
    this.reactionSum = 0
    this.reactionCount = 0
    this.holdSum = 0
    this.flapSum = 0
    this.settled = false
  }

  get comboMul() {
    const step = Number(this.cfg.get('comboStep')) || 0
    const cap = Math.max(1, Number(this.cfg.get('comboMaxMul')) || 1)
    return Math.min(cap, 1 + Math.max(0, this.combo - 1) * step)
  }

  /** 完成数 = 判定成功过的音符数 */
  get completed() {
    return this.perfect + this.great + this.good
  }

  /** 稳定度：加权正确率。没有完成任何音符时返回 null */
  get stabilityRate() {
    if (!this.completed) return null
    const w = this.perfect * ACC_WEIGHT.perfect + this.great * ACC_WEIGHT.great +
      this.good * ACC_WEIGHT.good
    return w / this.completed
  }

  /** 左右均衡度：1 = 左右次数完全相等，0 = 只做了一侧。左右都为 0 时返回 null */
  get balanceRate() {
    const l = this.leftHits
    const r = this.rightHits
    const denom = l + r
    if (!denom) return null
    return 1 - Math.abs(l - r) / denom
  }

  /** 平均到位用时（毫秒，只记录不打分） */
  get avgReactionMs() {
    if (!this.reactionCount) return null
    return Math.round(this.reactionSum / this.reactionCount)
  }

  /** 平均保持时长（毫秒） */
  get avgHoldMs() {
    if (!this.completed) return null
    return Math.round(this.holdSum / this.completed)
  }

  get total() {
    return Math.round(this.base + this.comboBonus + this.finishBonus)
  }

  /**
   * 完成一个音符
   * @param {string} verdict perfect | great | good
   * @param {object} opts { side, value, reactionMs, holdMs, flaps }
   */
  hit(verdict, opts) {
    const o = opts || {}
    const value = Number(o.value) || 100
    const side = o.side

    // 连击只认「稳住」；掉到「完成了」就断（断倍率，不扣分）
    if (verdict === VERDICT.PERFECT || verdict === VERDICT.GREAT) {
      this.combo += 1
      if (this.combo > this.maxCombo) this.maxCombo = this.combo
    } else {
      this.combo = 0
    }

    const mul = this.comboMul
    const gain = Math.round(value * mul)

    if (verdict === VERDICT.PERFECT) this.perfect += 1
    else if (verdict === VERDICT.GREAT) this.great += 1
    else this.good += 1

    if (side === 'left') this.leftHits += 1
    else if (side === 'center') this.centerHits += 1
    else if (side === 'right') this.rightHits += 1

    if (isFinite(Number(o.reactionMs))) {
      this.reactionSum += Math.max(0, Number(o.reactionMs))
      this.reactionCount += 1
    }
    if (isFinite(Number(o.holdMs))) this.holdSum += Math.max(0, Number(o.holdMs))
    this.flapSum += Math.max(0, Math.round(Number(o.flaps) || 0))

    this.base += value
    this.comboBonus += gain - value

    return { gain, combo: this.combo, mul, total: this.total }
  }

  /**
   * 时间到点时还没完成的那个音符。
   * **不记 MISS、不扣分、不中断连击** —— 门控下它只是「还没做完」，
   * 用红字告诉一个平衡功能不佳的人「你漏了」是反治疗的。
   */
  unsolvedNote() {
    this.unsolved += 1
    return { combo: this.combo }
  }

  addFinish() {
    if (this.settled) return this.finishBonus
    this.settled = true
    this.finishBonus = Math.max(0, Number(this.cfg.get('finishBonus')) || 0)
    return this.finishBonus
  }

  snapshot() {
    return {
      score: this.total,
      base: Math.round(this.base),
      comboBonus: Math.round(this.comboBonus),
      finishBonus: Math.round(this.finishBonus),
      perfect: this.perfect,
      great: this.great,
      good: this.good,
      miss: 0,
      unsolved: this.unsolved,
      completed: this.completed,
      hits: this.completed,
      judged: this.completed + this.unsolved,
      combo: this.combo,
      maxCombo: this.maxCombo,
      wrongDir: this.wrongDir,
      leftHits: this.leftHits,
      centerHits: this.centerHits,
      rightHits: this.rightHits,
      avgFlaps: this.completed ? Math.round((this.flapSum / this.completed) * 10) / 10 : null,
      stabilityRate: this.stabilityRate,
      balanceRate: this.balanceRate,
      avgReactionMs: this.avgReactionMs,
      avgHoldMs: this.avgHoldMs
    }
  }
}

module.exports = { ScoreManager, clamp }
