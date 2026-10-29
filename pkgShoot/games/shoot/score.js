// ============================================================================
// pkgShoot/games/shoot/score.js —— 计分与连击（ScoreManager）
// ----------------------------------------------------------------------------
// 两个时钟，和 FR-GAME-01 的表述一一对应：
//   · 1.0s 基础刻度  → onSecond(inZone)  ：游戏总时长推进 + 基础分累计
//   · 0.1s 精细刻度  → onTick(tick, hits)：累计击中次数 + 连击(Combo)判定
//
// 连击算法：
//   命中发生在第 tick 个 0.1s 窗口内；若与上一次命中的窗口间隔 <= comboWindowTicks，
//   视为「连续击中」，combo+1；否则 combo 归 1。
//   comboWindowTicks = comboWindowMs / tickMs（默认 100/100 = 1 个刻度）。
//
// 单次得分：
//   base  = random(scoreMin, scoreMax)      // 得分浮动范围（治疗师可配）
//   mul   = min(1 + (combo-1) * comboStep, comboMaxMul)   // 阶梯式连击加成
//   gain  = round(base * scoreMul(难度) * mul)
//
// 说明：命中判定在渲染帧内做扫掠检测（避免高速子弹穿透），
//       命中结果先入桶，等 0.1s 刻度到点再统一结算 —— 保证「以 0.1s 为刻度累计击中次数」。
// ============================================================================

class ScoreManager {
  /**
   * @param {ConfigStore} cfg 配置中心（运行时读取，随时改随时生效）
   * @param {Object} options { rng: ()=>number }
   */
  constructor(cfg, options) {
    const opt = options || {}
    this.cfg = cfg
    this.rng = typeof opt.rng === 'function' ? opt.rng : Math.random
    this.reset()
  }

  reset() {
    this.score = 0        // 总分
    this.baseScore = 0    // 其中来自「每秒基础分」的部分
    this.hits = 0         // 累计击中次数（0.1s 刻度结算）
    this.shots = 0        // 累计开火数（用于命中率）
    this.combo = 0        // 当前连击
    this.maxCombo = 0     // 最高连击
    this.tick = 0         // 当前 0.1s 刻度序号
    this.lastHitTick = -99999
    this.elapsedSec = 0
    this.inZoneSec = 0    // 保持在范围内的时间（秒）
    this.hitTicks = 0     // 有命中的刻度数
    this.comboEvents = 0  // 触发连击奖励的次数
    this.baseCarry = 0    // 每秒基础分的累计余数（支持 0.5 分/秒这类小数配置）
  }

  // ---------- 刻度换算 ----------
  comboWindowTicks() {
    const tick = Math.max(1, Number(this.cfg.get('tickMs')) || 100)
    const win = Math.max(tick, Number(this.cfg.get('comboWindowMs')) || 100)
    return Math.max(1, Math.round(win / tick))
  }

  /** 得分浮动区间内取一个整数（含端点） */
  rollBase() {
    const range = this.cfg.getScoreRange()
    const lo = Math.round(range[0])
    const hi = Math.round(range[1])
    if (hi <= lo) return lo
    return lo + Math.floor(this.rng() * (hi - lo + 1))
  }

  // ---------- 0.1s 刻度：击中累计 + 连击 ----------
  /**
   * @param {number} tickIndex 刻度序号（0,1,2...）
   * @param {Array}  hits      本刻度内发生的命中（[{x,y,targetId}]），可为空
   * @returns {Array} 事件列表，交给引擎配音效 / 飘字
   */
  onTick(tickIndex, hits) {
    this.tick = tickIndex
    const list = hits && hits.length ? hits : []
    const events = []

    if (list.length) {
      this.hitTicks += 1
      const windowTicks = this.comboWindowTicks()
      for (let i = 0; i < list.length; i++) {
        const h = list[i]
        const continuous = (tickIndex - this.lastHitTick) <= windowTicks
        this.combo = continuous ? this.combo + 1 : 1
        this.lastHitTick = tickIndex
        if (this.combo > this.maxCombo) this.maxCombo = this.combo

        const base = this.rollBase()
        const step = Number(this.cfg.get('comboStep')) || 0
        const cap = Number(this.cfg.get('comboMaxMul')) || 1
        const mul = Math.min(1 + (this.combo - 1) * step, cap)
        const gain = Math.max(0, Math.round(base * this.cfg.getScoreMul() * mul))
        this.score += gain
        this.hits += 1
        if (this.combo >= 2) this.comboEvents += 1

        events.push({
          type: 'hit',
          x: h.x,
          y: h.y,
          gain: gain,
          base: base,
          mul: Math.round(mul * 100) / 100,
          combo: this.combo,
          score: this.score
        })
      }
      // 本刻度有多个命中时，连击在同刻度内依次叠加（同 0.1s 连击也计）
      if (events.length > 1) {
        events[events.length - 1].multi = events.length
      }
      return events
    }

    // 本刻度没有命中：检查连击是否断掉
    if (this.combo > 0 && (tickIndex - this.lastHitTick) > this.comboWindowTicks()) {
      const broken = this.combo
      this.combo = 0
      events.push({ type: 'comboEnd', combo: broken })
    }
    return events
  }

  // ---------- 1.0s 基础刻度 ----------
  /**
   * @param {boolean} inZone 本秒是否保持在允许范围内
   * @returns {Object} { type:'second', elapsed, inZone, gain }
   */
  onSecond(inZone) {
    this.elapsedSec += 1
    let gain = 0
    if (inZone) {
      this.inZoneSec += 1
      const per = Number(this.cfg.get('baseScorePerSecond')) || 0
      // 基础分可能是 0.5 这类小数：先累加，满 1 分才入账，避免每秒四舍五入放大得分
      this.baseCarry += per
      gain = Math.floor(this.baseCarry + 1e-9)
      this.baseCarry = Math.max(0, this.baseCarry - gain)
      this.baseScore += gain
      this.score += gain
    }
    return { type: 'second', elapsed: this.elapsedSec, inZone: !!inZone, gain: gain }
  }

  // ---------- 统计 ----------
  stats() {
    const total = Math.max(1, this.elapsedSec)
    return {
      score: Math.round(this.score),
      baseScore: Math.round(this.baseScore),
      hits: this.hits,
      shots: this.shots,
      combo: this.combo,
      maxCombo: this.maxCombo,
      elapsedSec: this.elapsedSec,
      inZoneSec: this.inZoneSec,
      zoneRate: Math.round((this.inZoneSec / total) * 100),
      accuracy: this.shots > 0 ? Math.round((this.hits / this.shots) * 100) : 0,
      comboEvents: this.comboEvents
    }
  }
}

module.exports = { ScoreManager }
