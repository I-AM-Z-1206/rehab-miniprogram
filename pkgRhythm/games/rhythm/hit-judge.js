// ============================================================================
// games/rhythm/hit-judge.js —— 门控判定（只看动作质量，不看时间）
// ----------------------------------------------------------------------------
// 【2026-11-01 重写】从「时间窗口判定」改成「门控判定」
//
// 为什么必须换：
//   旧判定回答的是「你到位的时间准不准」—— 靠 |now - targetTime| 分
//   PERFECT / GREAT / GOOD，超过窗口就是 MISS。但这套规则**只在机器决定
//   音符时刻时才有意义**。一旦改成「接到才出下一个」，音符是患者自己触发
//   的，他永远不会迟到、也不会早到，时间精度这个维度在物理上消失了；
//   而 MISS 更不可能发生 —— 音符会停在那里一直等。
//
// 现在的判定回答的是「你站得稳不稳」。一个音符的生命周期：
//
//   approaching ──到达判定线──→ waiting ──方向对且稳住 stableMs──→ holding
//        ↑                          │                                 │
//        │                     （一直等，不惩罚）              ──保持 holdMs──→ done
//        └──────────────────────────┴───────── 中途离开正确一侧 ─────────┘
//
// 分级依据是**抖动次数（flaps）**：进入正确一侧并且稳住之后，中途离开过几次。
//   flaps = 0    → PERFECT（一次到位，全程没离开）
//   flaps 1~2    → GREAT
//   flaps ≥ 3    → GOOD（反复进出，但最后完成了）
//
// 康复意义：这条规则奖励的是「安静地站住」，不是「快」。平衡功能训练里
// 快是危险信号 —— 抢动作、身体冲过头、重心来不及回收，都是跌倒的典型路径。
// 所以时间只**记录**（reactionMs / holdMs），不参与评分。
// ============================================================================

const VERDICT = {
  PERFECT: 'perfect',
  GREAT: 'great',
  GOOD: 'good',
  // 时间到点时还没完成的那一个音符。**不是漏接**：门控下它只是"还没做完"。
  UNSOLVED: 'unsolved',
  // 仅旧记录（judgeVersion v1/v2 时代）里会出现，新对局永不产生
  MISS: 'miss'
}

// 判定名称 / 颜色 / 图形同时给出，避免只靠颜色区分（需求 §4）
const VERDICT_STYLE = {
  perfect: { en: 'PERFECT', zh: '稳住了', mark: '★', color: '#FFD479' },
  great: { en: 'GREAT', zh: '很稳', mark: '◆', color: '#7BE3FF' },
  good: { en: 'GOOD', zh: '完成了', mark: '●', color: '#B49BFF' },
  unsolved: { en: 'UNSOLVED', zh: '未完成', mark: '○', color: '#96A5B4' },
  miss: { en: 'MISS', zh: '漏接', mark: '✕', color: '#96A5B4' }
}

// 稳定度权重：完美 1 / 很稳 0.75 / 完成 0.4
const ACC_WEIGHT = { perfect: 1, great: 0.75, good: 0.4, unsolved: 0, miss: 0 }

// 抖动容差：离开正确一侧超过这个次数就掉到 GOOD
const FLAPS_GREAT = 2

// 逐级提示的门槛（音符在判定线上干等了多少毫秒）
const HINT_TIERS = [3000, 6000, 10000]

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v)
}

class GateJudge {
  /**
   * @param {object} cfg 配置 store（每帧读最新值，治疗师改完立即生效）
   */
  constructor(cfg) {
    this.cfg = cfg
  }

  /** 稳住多久才允许开始计「保持」——过滤路过的抖动 */
  get stableNeedMs() {
    return clamp(Number(this.cfg.get('stableMs')) || 0, 0, 400)
  }

  /** 稳住之后还要保持多久才算完成 */
  get holdNeedMs() {
    return clamp(Number(this.cfg.get('holdMs')) || 400, 120, 1600)
  }

  quality(flaps) {
    const f = Math.max(0, Math.round(Number(flaps) || 0))
    if (f <= 0) return VERDICT.PERFECT
    if (f <= FLAPS_GREAT) return VERDICT.GREAT
    return VERDICT.GOOD
  }

  /**
   * 单帧推进：**纯函数**，不改 note，返回新状态由引擎落盘。
   *
   * @param {object} note  { targetTimeMs, flaps }
   * @param {object} input { now, side, expected, enterAt, stableMs }
   *   enterAt = 进入当前所处一侧的时刻（引擎的 action.since）
   *   stableMs = 进入该侧已经多久（now - enterAt）
   * @returns {{state:string, flaps:number, reactionMs:number, heldMs:number,
   *            waitMs:number, hintLevel:number, verdict?:string}}
   */
  step(note, input) {
    const now = Number(input.now) || 0
    const target = Number(note.targetTimeMs) || 0
    const flaps = Math.max(0, Math.round(Number(note.flaps) || 0))
    const expected = input.expected
    const side = input.side

    // 1. 还在飞：只报告进度，不判定
    if (now < target) {
      return {
        state: 'approaching',
        flaps: flaps,
        reactionMs: 0,
        heldMs: 0,
        waitMs: 0,
        hintLevel: 0
      }
    }

    const waitMs = now - target
    const onSide = side === expected
    const enterAt = Number(input.enterAt) || 0
    const stableNeed = this.stableNeedMs

    // 2. 方向不对 / 还没稳够 → waiting。
    //    曾经 holding 过又掉了 → 记一次抖动（这就是「稳不住」的量化）。
    if (!onSide || (now - enterAt) < stableNeed) {
      const wasHolding = input.state === 'holding'
      return {
        state: 'waiting',
        flaps: wasHolding ? flaps + 1 : flaps,
        reactionMs: 0,
        heldMs: 0,
        waitMs: waitMs,
        hintLevel: this._hintLevel(waitMs)
      }
    }

    // 3. 方向对且已经稳了：从「稳住的那一刻」开始算保持时长。
    //    提前站好的患者不该被惩罚 —— stableStartAt 落在 targetTime 之前时
    //    一律按 targetTime 起算（提前准备好是他自己的策略，不是失误）。
    const stableStartAt = Math.max(target, enterAt + stableNeed)
    const heldMs = now - stableStartAt
    const holdNeed = this.holdNeedMs
    // 反应时只记录不打分：进入稳定状态的时刻 - 音符到达时刻（提前则为 0）
    const reactionMs = Math.max(0, Math.round(stableStartAt - target))

    if (heldMs >= holdNeed) {
      return {
        state: 'done',
        flaps: flaps,
        reactionMs: reactionMs,
        heldMs: Math.round(heldMs),
        waitMs: 0,
        hintLevel: 0,
        verdict: this.quality(flaps)
      }
    }

    return {
      state: 'holding',
      flaps: flaps,
      reactionMs: reactionMs,
      heldMs: Math.round(heldMs),
      waitMs: 0,
      hintLevel: 0
    }
  }

  /** 等待越久，提示越明确。0 = 不提示 */
  _hintLevel(waitMs) {
    let lv = 0
    for (let i = 0; i < HINT_TIERS.length; i++) if (waitMs >= HINT_TIERS[i]) lv = i + 1
    return lv
  }
}

module.exports = { GateJudge, VERDICT, VERDICT_STYLE, ACC_WEIGHT, HINT_TIERS, FLAPS_GREAT }
