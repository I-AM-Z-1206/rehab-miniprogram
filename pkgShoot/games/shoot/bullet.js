// ============================================================================
// pkgShoot/games/shoot/bullet.js —— 子弹机制（BulletSystem）
// ----------------------------------------------------------------------------
// · 对象池复用，避免 60fps 场景里频繁 new / GC
// · 发射频率由 ConfigStore.fireRate 决定（每秒发数），运行时修改立即生效
// · 速度 / 散射角同样来自配置
// · 每颗子弹记录上一帧位置 (px,py)，供 HitDetector 做扫掠（防穿透）判定
// · 纵深（k / a）：只影响**绘制**，不影响任何判定。HitDetector 用的是
//   目标半径与 hitRange，从来看子弹半径，所以子弹怎么缩都不改手感。
// ============================================================================

class BulletSystem {
  constructor(cfg, options) {
    const opt = options || {}
    this.cfg = cfg
    this.width = opt.width || 375
    this.height = opt.height || 600
    this.list = []
    this.pool = []
    this.max = opt.max || 160
    this.seq = 0
    // 纵深参考面，由引擎在 _layout() 里给
    this.nearY = 0
    this.farY = 0
  }

  resize(width, height) {
    this.width = width
    this.height = height
  }

  /**
   * 纵深参考面：nearY = 枪口所在屏幕 y（最近），farY = 目标所在屏幕 y（最远）。
   * 子弹按「飞过的距离占比」从 1 缩到 0.45，形成「射向深处」的观感。
   */
  setDepthRange(nearY, farY) {
    this.nearY = Number(nearY) || 0
    this.farY = Number(farY) || 0
  }

  /**
   * 由飞行进度推纵深缩放。
   * 不用地面透视公式，因为光核悬在地平线之上（MONSTER_Y_RATIO 0.40 <
   * HORIZON_RATIO 0.52），地面那套 y = horizonY + floorH/u 对它不成立。
   * 打空后子弹继续往上飞，t 锁在 1，不再继续缩小（否则会缩成一个点，像消失了）。
   */
  _depthOf(b) {
    const span = b.oy - this.farY
    if (!(span > 1)) {
      b.k = 1
      b.a = 1
      return
    }
    let t = (b.oy - b.y) / span
    t = t < 0 ? 0 : (t > 1 ? 1 : t)
    b.k = 1 - 0.55 * t
    b.a = 1 - 0.22 * t
  }

  /** 开火：从 (x, y) 向上发射一颗子弹 */
  fire(x, y, extra) {
    const speed = Number(this.cfg.get('bulletSpeed')) || 760
    const spread = (Number(this.cfg.get('spreadDeg')) || 0) * Math.PI / 180
    const angle = -Math.PI / 2 + (Math.random() * 2 - 1) * spread
    const bullet = this.pool.pop() || {}
    bullet.id = ++this.seq
    bullet.x = x
    bullet.y = y
    bullet.px = x
    bullet.py = y
    bullet.vx = Math.cos(angle) * speed
    bullet.vy = Math.sin(angle) * speed
    bullet.r = 3.4
    bullet.life = 0
    bullet.alive = true
    // 枪口位置固定，纵深进度以它为起点
    bullet.oy = y
    bullet.k = 1
    bullet.a = 1
    if (extra && extra.color) bullet.color = extra.color
    this.list.push(bullet)
    if (this.list.length > this.max) this.recycle(0)
    return bullet
  }

  recycle(index) {
    const b = this.list[index]
    if (!b) return
    this.list.splice(index, 1)
    b.alive = false
    if (this.pool.length < 120) this.pool.push(b)
  }

  update(dt) {
    const w = this.width
    const h = this.height
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i]
      b.px = b.x
      b.py = b.y
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.life += dt
      this._depthOf(b)
      if (b.y < -24 || b.x < -24 || b.x > w + 24 || b.y > h + 24) {
        this.recycle(i)
      }
    }
  }

  /** 命中后移除 */
  kill(bullet) {
    const i = this.list.indexOf(bullet)
    if (i >= 0) this.recycle(i)
  }

  clear() {
    while (this.list.length) this.recycle(this.list.length - 1)
  }

  get count() {
    return this.list.length
  }
}

module.exports = { BulletSystem }
