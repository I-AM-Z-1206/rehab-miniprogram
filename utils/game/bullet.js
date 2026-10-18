// ============================================================================
// utils/game/bullet.js —— 子弹机制（BulletSystem）
// ----------------------------------------------------------------------------
// · 对象池复用，避免 60fps 场景里频繁 new / GC
// · 发射频率由 ConfigStore.fireRate 决定（每秒发数），运行时修改立即生效
// · 速度 / 散射角同样来自配置
// · 每颗子弹记录上一帧位置 (px,py)，供 HitDetector 做扫掠（防穿透）判定
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
  }

  resize(width, height) {
    this.width = width
    this.height = height
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
