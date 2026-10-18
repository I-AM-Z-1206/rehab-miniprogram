// ============================================================================
// utils/game/hit.js —— 碰撞 / 判定（HitDetector）
// ----------------------------------------------------------------------------
// FR-GAME-01 第 3 条：击中范围由治疗师预设，且支持游戏过程中实时调整。
//
// 判定语义
//   目标圆心为原点，半径 hitRange 的圆内即算命中（hitRange 已包含目标自身半径，
//   治疗师调大 = 更宽容，调小 = 更严格）。目标身上会画一层虚线圈，改参数立刻可见。
//
// 两种检测
//   · test()  圆-圆（当前位置，用于静止目标 / 调试）
//   · sweep() 线段-圆（子弹上一帧位置 → 当前位置，防止 760px/s 的子弹穿过目标）
//
// 实时性
//   hitRange 每次判定都从 ConfigStore 现读，所以 setHitArea() 之后
//   正在飞行的子弹、已经存在的目标，下一帧就按新范围判定，无需重启游戏。
// ============================================================================

const MIN_RANGE = 8
const MAX_RANGE = 200

function dist2(ax, ay, bx, by) {
  const dx = ax - bx
  const dy = ay - by
  return dx * dx + dy * dy
}

class HitDetector {
  constructor(cfg) {
    this.cfg = cfg
    this.lastHits = 0
  }

  /** 当前判定半径（px） */
  getRange() {
    return Number(this.cfg.get('hitRange')) || 0
  }

  /** 实时调整判定范围：返回收敛后的值 */
  setRange(range) {
    let r = Number(range)
    if (!isFinite(r)) r = this.getRange()
    r = Math.max(MIN_RANGE, Math.min(MAX_RANGE, r))
    this.cfg.set('hitRange', r, 'api:setHitArea')
    return this.cfg.get('hitRange')
  }

  /** 圆-圆：点是否落在判定范围内 */
  test(x, y, target) {
    const r = this.getRange()
    const tr = target.radius || 0
    // 判定圈以目标圆心为原点，半径 hitRange（>= 目标半径时才有意义）
    const radius = Math.max(r, tr)
    return dist2(x, y, target.x, target.y) <= radius * radius
  }

  /**
   * 线段-圆扫掠：子弹从 (x0,y0) 走到 (x1,y1)，是否穿过判定圈
   * @returns {Object|null} 命中时返回 { x, y, distance }
   */
  sweep(x0, y0, x1, y1, target) {
    const r = Math.max(this.getRange(), target.radius || 0)
    const dx = x1 - x0
    const dy = y1 - y0
    const len2 = dx * dx + dy * dy
    let t = 0
    if (len2 > 1e-6) {
      t = ((target.x - x0) * dx + (target.y - y0) * dy) / len2
      t = t < 0 ? 0 : (t > 1 ? 1 : t)
    }
    const cx = x0 + dx * t
    const cy = y0 + dy * t
    const d2 = dist2(cx, cy, target.x, target.y)
    if (d2 > r * r) return null
    return { x: cx, y: cy, distance: Math.sqrt(d2) }
  }

  /**
   * 批量结算：一次遍历，每颗子弹只消耗一次，每个目标同一帧只记一次
   * @param {Array} bullets BulletSystem.list
   * @param {Array} targets 目标数组
   * @param {Function} onHit (bullet, target, point) => void
   */
  resolve(bullets, targets, onHit) {
    let count = 0
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i]
      if (!b || !b.alive) continue
      for (let j = 0; j < targets.length; j++) {
        const t = targets[j]
        if (!t || t.dead || t.hitThisFrame) continue
        const hit = this.sweep(b.px, b.py, b.x, b.y, t)
        if (!hit) continue
        t.hitThisFrame = true
        count += 1
        if (typeof onHit === 'function') onHit(b, t, hit)
        break
      }
    }
    this.lastHits = count
    return count
  }
}

module.exports = { HitDetector, MIN_RANGE, MAX_RANGE }
