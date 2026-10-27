// ============================================================================
// games/rhythm/score.js —— 计分 / 连击 / 三个准确率
// ----------------------------------------------------------------------------
// 公式（与 README 一致，页面上也是按这个算）：
//   单音符得分   = 音符分值 × 连击倍率
//   连击倍率     = min(comboMaxMul, 1 + max(0, combo - 1) × comboStep)
//   节奏准确率   = (PERFECT×1 + GREAT×0.7 + GOOD×0.4) / 已判定音符数
//   方向准确率   = 命中数 / (命中数 + 方向错误数)
//   综合命中率   = 命中数 / 谱面音符总数
//   总分         = 基础分合计 + 连击加成合计 + 完成奖励
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
    this.totalNotes = 0
    this.reset(0)
  }

  reset(totalNotes) {
    this.totalNotes = Math.max(0, Math.round(Number(totalNotes) || 0))
    this.perfect = 0
    this.great = 0
    this.good = 0
    this.miss = 0
    this.wrongDir = 0
    this.leftHits = 0
    this.centerHits = 0
    this.rightHits = 0
    this.combo = 0
    this.maxCombo = 0
    this.base = 0
    this.comboBonus = 0
    this.finishBonus = 0
    this.settled = false
  }

  get comboMul() {
    const step = Number(this.cfg.get('comboStep')) || 0
    const cap = Math.max(1, Number(this.cfg.get('comboMaxMul')) || 1)
    return Math.min(cap, 1 + Math.max(0, this.combo - 1) * step)
  }

  get hits() {
    return this.perfect + this.great + this.good
  }

  get judged() {
    return this.hits + this.miss
  }

  /** 节奏准确率：时间维度的加权正确率 */
  get rhythmAccuracy() {
    if (!this.judged) return null
    const w = this.perfect * ACC_WEIGHT.perfect + this.great * ACC_WEIGHT.great +
      this.good * ACC_WEIGHT.good + this.miss * ACC_WEIGHT.miss
    return w / this.judged
  }

  /** 方向准确率：方向维度（分母含方向错误） */
  get directionAccuracy() {
    const denom = this.hits + this.wrongDir
    if (!denom) return null
    return this.hits / denom
  }

  /** 综合命中率：命中数 / 谱面音符总数 */
  get overallHitRate() {
    if (!this.totalNotes) return null
    return this.hits / this.totalNotes
  }

  get total() {
    return Math.round(this.base + this.comboBonus + this.finishBonus)
  }

  /** 命中：返回本音符实际得分与连击信息 */
  hit(verdict, opts) {
    const o = opts || {}
    const value = Number(o.value) || 100
    const side = o.side
    this.combo += 1
    if (this.combo > this.maxCombo) this.maxCombo = this.combo

    const mul = this.comboMul
    const gain = Math.round(value * mul)

    if (verdict === VERDICT.PERFECT) this.perfect += 1
    else if (verdict === VERDICT.GREAT) this.great += 1
    else this.good += 1

    if (side === 'left') this.leftHits += 1
    else if (side === 'center') this.centerHits += 1
    else if (side === 'right') this.rightHits += 1

    this.base += value
    this.comboBonus += gain - value

    return { gain, combo: this.combo, mul, total: this.total }
  }

  /** 漏接 / 方向错误：不获得命中分（方法名避开同名计数器） */
  missNote(reason) {
    this.miss += 1
    if (reason === 'wrong-side') this.wrongDir += 1
    if (this.cfg.get('comboBreakOnMiss')) this.combo = 0
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
      miss: this.miss,
      hits: this.hits,
      judged: this.judged,
      wrongDir: this.wrongDir,
      combo: this.combo,
      maxCombo: this.maxCombo,
      leftHits: this.leftHits,
      centerHits: this.centerHits,
      rightHits: this.rightHits,
      totalNotes: this.totalNotes,
      rhythmAccuracy: this.rhythmAccuracy,
      directionAccuracy: this.directionAccuracy,
      overallHitRate: this.overallHitRate
    }
  }
}

module.exports = { ScoreManager, clamp }
