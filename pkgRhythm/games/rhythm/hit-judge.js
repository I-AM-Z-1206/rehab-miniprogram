// ============================================================================
// games/rhythm/hit-judge.js —— 命中判定（方向 × 节奏，两个维度分开算）
// ----------------------------------------------------------------------------
// 判定流程（与需求 §8 对应）：
//   1. 音符是否进入有效时间窗口（|now - targetTime| ≤ goodMs）
//   2. 当前身体方向是否等于音符要求的方向
//   3. 方向对了还要满足"稳定性"（进入该侧后保持 stableMs）
//   4. 方向对了还要满足"动作有效性"（一次动作最多结算一个音符；同向重复
//      需要新的动作或满足 sameSideGapMs 的间隔）
//   5. 方向反了且已稳定 → 记为 wrongDirection（同时按 MISS 结算）
//   6. 超过 goodMs 仍未命中 → 漏接（MISS）
//
// 为什么要"一次动作最多一个音符"：
//   否则玩家只要一直站在左侧，所有左侧音符都会自动命中，训练就失去意义。
//   引擎在 actionOk 里传这个信息，判定层只负责按规则裁决。
// ============================================================================

const VERDICT = {
  PERFECT: 'perfect',
  GREAT: 'great',
  GOOD: 'good',
  MISS: 'miss'
}

// 判定名称 / 颜色 / 图形同时给出，避免只靠颜色区分（需求 §4）
const VERDICT_STYLE = {
  perfect: { en: 'PERFECT', zh: '完美', mark: '★', color: '#FFD479' },
  great: { en: 'GREAT', zh: '很好', mark: '◆', color: '#7BE3FF' },
  good: { en: 'GOOD', zh: '不错', mark: '●', color: '#B49BFF' },
  miss: { en: 'MISS', zh: '漏接', mark: '✕', color: '#FF7C93' }
}

const ACC_WEIGHT = { perfect: 1, great: 0.7, good: 0.4, miss: 0 }

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v)
}

class HitJudge {
  /**
   * @param {object} cfg 配置 store（每帧读最新窗口，治疗师改完立即生效）
   */
  constructor(cfg) {
    this.cfg = cfg
  }

  get windows() {
    const p = clamp(Number(this.cfg.get('perfectMs')) || 60, 10, 300)
    const g = Math.max(p + 5, Number(this.cfg.get('greatMs')) || 105)
    const d = Math.max(g + 5, Number(this.cfg.get('goodMs')) || 160)
    // 提前容差：躯干不是按键。
    //
    // 按键可以在拍点上精确按下，躯干不行 —— 它必须**提前启动**才能准时到位，
    // 移动本身就要几百毫秒。所以「进入该侧的时刻早于拍点」是正常的、
    // 甚至是唯一可行的策略，不是失误。原来 early 和 late 用同一个窗口，
    // 结果就是：患者做对了（提前启动、准时到位）却被判 MISS，一路漏接。
    //
    // 只放宽 early 一侧；late 保持严格，那才是真的跟丢了节奏。
    const ef = clamp(Number(this.cfg.get('earlyFactor')) || 1, 1, 3)
    return { perfect: p, great: g, good: d, earlyFactor: ef }
  }

  /** 只按时间误差分级，不管方向。deltaMs < 0 = 提前进入 */
  classify(deltaMs) {
    const w = this.windows
    const a = Math.abs(deltaMs) / (deltaMs < 0 ? w.earlyFactor : 1)
    if (a <= w.perfect) return VERDICT.PERFECT
    if (a <= w.great) return VERDICT.GREAT
    if (a <= w.good) return VERDICT.GOOD
    return null
  }

  /** 时间窗口是否已经彻底关闭（该记漏接了） */
  isExpired(note, nowMs) {
    return nowMs - note.targetTimeMs > this.windows.good
  }

  /** 是否已经进入可以判定的时间窗 */
  isInWindow(note, nowMs) {
    return Math.abs(nowMs - note.targetTimeMs) <= this.windows.good
  }

  /**
   * 判定一个音符
   * ------------------------------------------------------------------
   * 为什么"到达判定线之后才判"：
   *   玩家的输入是持续的身体位置，不是按键事件。如果音符还在半路就判，
   *   玩家提前 300ms 站好也会被当成"准"，节奏训练就失去意义。
   *   因此规则是：音符到达判定线（targetTime）那一帧起才开始判，
   *   时间误差 = 玩家"进入该侧"的时刻 − 音符目标时刻：
   *     · 正好在拍上进入 → PERFECT
   *     · 早了（提前站好并保持）→ 按提前量给 GREAT / GOOD
   *     · 晚了（进窗口后才进入）→ 按延后量给 GREAT / GOOD
   *     · 窗口内一直站在错误一侧 → 方向错误 + MISS
   *     · 窗口关闭仍未就位 → MISS
   *
   * @param {object} note 谱面音符
   * @param {number} nowMs 判定时间（音乐时间，已扣掉音画补偿）
   * @param {object} input { side, enterAt, stableMs, actionOk }
   * @returns {{verdict:string, deltaMs:number, reason:string}}
   */
  evaluate(note, nowMs, input) {
    const w = this.windows
    const sinceLine = nowMs - note.targetTimeMs
    const stableNeed = Number(this.cfg.get('stableMs')) || 0

    // 还没到判定线：一律不判（避免"提前站好"被误判为准）
    if (sinceLine < 0) return { verdict: 'pending', deltaMs: sinceLine, reason: 'before-line' }

    const expired = sinceLine > w.good
    const sideOk = input.side === note.targetSide

    if (!sideOk) {
      const stableWrong = input.side && input.side !== 'center' && input.stableMs >= stableNeed
      // 左右音符：稳定站在错误一侧 → 立即记方向错误（及时反馈）。
      // 中间音符例外：患者从两侧「回中」的路上必然先经过错误侧，
      // 到线瞬间就判方向错误会误伤正在正确移动的人 —— 给满整个窗口，
      // 窗口内回到中间照常按迟到判；窗口关闭仍偏在两侧才记方向错误。
      if (note.targetSide !== 'center' && stableWrong) {
        return { verdict: VERDICT.MISS, deltaMs: sinceLine, reason: 'wrong-side', wrongSide: true }
      }
      if (expired) {
        return {
          verdict: VERDICT.MISS,
          deltaMs: sinceLine,
          reason: stableWrong ? 'wrong-side' : 'no-input',
          wrongSide: stableWrong
        }
      }
      return { verdict: 'pending', deltaMs: sinceLine, reason: 'not-in-place' }
    }

    // 方向对：还要确认动作可结算（一次动作只结算一个音符）
    if (input.stableMs < stableNeed) {
      if (expired) return { verdict: VERDICT.MISS, deltaMs: sinceLine, reason: 'unstable' }
      return { verdict: 'pending', deltaMs: sinceLine, reason: 'unstable' }
    }
    if (!input.actionOk) {
      if (expired) return { verdict: VERDICT.MISS, deltaMs: sinceLine, reason: 'no-new-action' }
      return { verdict: 'pending', deltaMs: sinceLine, reason: 'no-new-action' }
    }

    // 时间误差：从"进入该侧"的时刻算，提前站好最多算到窗口边缘
    const entered = typeof input.enterAt === 'number' ? input.enterAt : note.targetTimeMs
    // 窗口都过了才进入 → 迟到，不再给分
    if (sinceLine > w.good && entered > note.targetTimeMs) {
      return { verdict: VERDICT.MISS, deltaMs: sinceLine, reason: 'too-late' }
    }
    const raw = entered - note.targetTimeMs
    // 提前侧的截断也要跟着放宽，否则 earlyFactor 白设
    const deltaMs = clamp(raw, -w.good * w.earlyFactor, w.good)
    const verdict = this.classify(deltaMs)
    if (!verdict) return { verdict: 'pending', deltaMs: sinceLine, reason: 'out' }
    return { verdict, deltaMs, reason: raw < 0 ? 'early' : 'hit' }
  }
}

module.exports = { HitJudge, VERDICT, VERDICT_STYLE, ACC_WEIGHT }
