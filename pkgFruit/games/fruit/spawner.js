// ============================================================================
// games/fruit/spawner.js —— 水果生成器（可复现的伪随机序列）
// ----------------------------------------------------------------------------
// 为什么用固定种子：
//   需求要求「相同场景、难度和参数下行为一致」，训练也需要可重复性。
//   因此同一档位每次训练的水果序列相同（类型、位置、速度都可复现），
//   不同档位因为参数不同而自然不同。治疗师可以用这一点做前后对比。
//
// 坐标口径（全部归一化，与屏幕像素无关）：
//   x ∈ [0,1]  横向位置（占有效游戏区宽度）
//   y ∈ [0,1]  下落进度（0 = 生成线，1 = 篮子口高度）
//   vy         屏幕有效区高度/秒
// ============================================================================

const FIELD_MIN_X = 0.09
const FIELD_MAX_X = 0.91
const MIN_X_GAP = 0.19 // 同时下落的水果在横向至少间隔这么多，避免完全重叠
const NEAR_TOP = 0.34 // 只和还没落到这个高度以下的水果做避让

// r 同时被渲染层（画多大）和引擎（横向碰撞容差）使用，改这里两边一起变，保证「看到的就是判定的」
const FRUIT_TYPES = [
  { id: 'apple', name: '苹果', scoreKey: 'scoreApple', weight: 26, r: 28 },
  { id: 'orange', name: '橙子', scoreKey: 'scoreOrange', weight: 22, r: 27 },
  { id: 'banana', name: '香蕉', scoreKey: 'scoreBanana', weight: 18, r: 30 },
  { id: 'strawberry', name: '草莓', scoreKey: 'scoreStrawberry', weight: 18, r: 25 },
  { id: 'watermelon', name: '西瓜', scoreKey: 'scoreWatermelon', weight: 16, r: 34 }
]

const DESIGN_WIDTH = 390 // r 的设计基准宽度（渲染层按 W/390 等比缩放）

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v)
}

/** mulberry32：小而稳定的伪随机数发生器，同种子同序列 */
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

class FruitSpawner {
  constructor(cfg, opts) {
    const o = opts || {}
    this.cfg = cfg
    // 固定种子：同一档位每次训练的水果序列一致（可复现）
    this.seed = typeof o.seed === 'number' ? o.seed : 20261026
    this.reset()
  }

  reset() {
    this.rng = mulberry32(this.seed)
    this.timer = 0.9 // 开局第一个水果稍等一下，让玩家先看清场地
    this.serial = 0
  }

  _pickType() {
    const list = FRUIT_TYPES
    let total = 0
    for (let i = 0; i < list.length; i++) total += list[i].weight
    let r = this.rng() * total
    for (let i = 0; i < list.length; i++) {
      r -= list[i].weight
      if (r <= 0) return list[i]
    }
    return list[0]
  }

  /**
   * 决定横向位置。
   * 果篮会随身体左右倾移动，所以水果要散布在整条可及范围内，
   * 并且刻意避开果篮当前所在的位置——原地不动接不到，必须把篮子移过去。
   * 同时尽量避开同一批下落的水果，避免完全重叠。
   *
   * @param {Array} fruits 场上水果
   * @param {object} [avoid] { x, half }：果篮当前位置与半宽
   */
  _pickX(fruits, avoid) {
    // 可及范围：果篮中心能到 [basketMinX, basketMaxX]，落点铺满这一段就都能接到
    const minX = FIELD_MIN_X
    const maxX = FIELD_MAX_X
    const gap = Math.min(MIN_X_GAP, Math.max(0.02, (maxX - minX) * 0.32))
    const blockers = (fruits || []).filter((f) => f.state === 'fall' && f.y < NEAR_TOP).map((f) => f.x)
    const keepOut = avoid && typeof avoid.x === 'number'
      ? Math.max(0, Number(avoid.half) || 0) * 1.15
      : 0

    for (let attempt = 0; attempt < 16; attempt++) {
      const x = minX + this.rng() * (maxX - minX)
      let ok = true
      if (keepOut && Math.abs(x - avoid.x) < keepOut) ok = false
      for (let i = 0; i < blockers.length; i++) {
        if (Math.abs(blockers[i] - x) < gap) { ok = false; break }
      }
      if (ok) return x
    }

    // 兜底：优先"避开果篮"，再取与已有水果距离最大的候选点
    let best = 0.5
    let bestScore = -1
    for (let attempt = 0; attempt < 12; attempt++) {
      const x = minX + this.rng() * (maxX - minX)
      let g = 1
      for (let i = 0; i < blockers.length; i++) g = Math.min(g, Math.abs(blockers[i] - x))
      const away = !keepOut || Math.abs(x - avoid.x) >= keepOut
      const score = (away ? 10 : 0) + g
      if (score > bestScore) { bestScore = score; best = x }
    }
    return best
  }

  /**
   * 推进生成计时。
   * @param {number} dt 秒
   * @param {object} ctx { fruits, progress, basketX, basketHalf }
   * @returns {Array} 本帧要生成的水果描述
   */
  tick(dt, ctx) {
    const c = ctx || {}
    const fruits = c.fruits || []
    const progress = clamp(Number(c.progress) || 0, 0, 1)
    const cfg = this.cfg
    const out = []

    const interval = Math.max(0.2, Number(cfg.get('spawnInterval')) || 1.4)
    const maxFruits = Math.max(1, Math.round(Number(cfg.get('maxFruits')) || 3))
    const baseSpeed = Math.max(0.02, Number(cfg.get('fallSpeed')) || 0.26)
    const rampPct = Math.max(0, Number(cfg.get('speedRamp')) || 0) / 100
    // 难度爬升是连续函数，不会出现突然的速度跳变
    const ramp = 1 + rampPct * progress

    this.timer -= dt
    if (this.timer > 0) return out

    if (fruits.filter((f) => f.state === 'fall').length >= maxFruits) {
      this.timer = 0.25 // 名额满了，稍后再试，不排队爆发
      return out
    }

    // 自然浮动 ±15%，但仍然围绕配置的平均间隔
    this.timer = Math.max(0.35, interval * (0.85 + this.rng() * 0.3) / ramp)

    const type = this._pickType()
    const x = this._pickX(fruits, {
      x: c.basketX,
      half: c.basketHalf
    })
    this.serial += 1
    out.push({
      id: 'f' + this.serial,
      type: type.id,
      x: x,
      y: -0.03,
      vy: baseSpeed * (0.92 + this.rng() * 0.18) * ramp,
      rot: (this.rng() - 0.5) * 0.5,
      vrot: (this.rng() - 0.5) * 2.4,
      swayAmp: 0.003 + this.rng() * 0.007,
      swayPhase: this.rng() * Math.PI * 2,
      swaySpeed: 1.1 + this.rng() * 1.4,
      baseX: x
    })
    return out
  }
}

/** 每个类型对应分值（从配置读取，缺省回落到 10 分） */
function scoreOf(cfg, typeId) {
  const type = FRUIT_TYPES.find((t) => t.id === typeId)
  if (!type) return 10
  const v = Number(cfg.get(type.scoreKey))
  return isFinite(v) && v > 0 ? v : 10
}

module.exports = {
  FruitSpawner,
  FRUIT_TYPES,
  DESIGN_WIDTH,
  scoreOf,
  mulberry32,
  MIN_X_GAP,
  NEAR_TOP
}
