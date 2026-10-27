// ============================================================================
// games/fruit/fruits.js —— 水果与篮子的矢量绘制（Canvas 2D，无位图依赖）
// ----------------------------------------------------------------------------
// 为什么手绘而不是贴图：
//   1. 工程里没有水果素材，需求允许 Canvas 绘制；
//   2. 矢量绘制可以随屏幕等比缩放，不会糊；
//   3. 每种水果都有独立的高光/叶蒂/纹理，能一眼分辨（康复训练要看清楚目标）。
//
// 每个水果都以 (x, y) 为中心、r 为基准半径绘制，调用方负责缩放和旋转。
// ============================================================================

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v)
}

/** 椭圆（用 scale + arc，兼容没有 ctx.ellipse 的基础库） */
function ellipse(ctx, x, y, rx, ry, rot) {
  ctx.save()
  ctx.translate(x, y)
  if (rot) ctx.rotate(rot)
  ctx.scale(Math.max(0.001, rx), Math.max(0.001, ry))
  ctx.beginPath()
  ctx.arc(0, 0, 1, 0, Math.PI * 2)
  ctx.restore()
}

function radial(ctx, x, y, r, stops) {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.34, r * 0.1, x, y, r * 1.08)
  stops.forEach((s) => g.addColorStop(s[0], s[1]))
  return g
}

function specular(ctx, x, y, rx, ry, alpha, rot) {
  ctx.save()
  ctx.globalAlpha = alpha === undefined ? 0.55 : alpha
  ellipse(ctx, x, y, rx, ry, rot || -0.5)
  ctx.fillStyle = '#FFFFFF'
  ctx.fill()
  ctx.restore()
}

// ---------------------------------------------------------------------------
// 苹果
// ---------------------------------------------------------------------------
function drawApple(ctx, x, y, r, rot) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot || 0)
  ctx.beginPath()
  ctx.moveTo(0, -r * 0.62)
  ctx.bezierCurveTo(r * 0.55, -r * 1.02, r * 1.06, -r * 0.3, r * 0.92, r * 0.22)
  ctx.bezierCurveTo(r * 0.8, r * 0.92, r * 0.18, r * 1.02, 0, r * 0.88)
  ctx.bezierCurveTo(-r * 0.18, r * 1.02, -r * 0.8, r * 0.92, -r * 0.92, r * 0.22)
  ctx.bezierCurveTo(-r * 1.06, -r * 0.3, -r * 0.55, -r * 1.02, 0, -r * 0.62)
  ctx.closePath()
  ctx.fillStyle = radial(ctx, 0, 0, r, [
    [0, '#F4685A'], [0.55, '#DE3B31'], [1, '#A81F1F']
  ])
  ctx.fill()
  // 左侧暗部，增加体积
  ctx.save()
  ctx.clip()
  ctx.globalAlpha = 0.22
  ellipse(ctx, -r * 0.55, r * 0.2, r * 0.66, r * 0.7)
  ctx.fillStyle = '#7A1220'
  ctx.fill()
  ctx.restore()

  specular(ctx, -r * 0.32, -r * 0.36, r * 0.26, r * 0.34, 0.5, -0.5)

  // 果蒂
  ctx.beginPath()
  ctx.lineWidth = Math.max(1.2, r * 0.1)
  ctx.strokeStyle = '#7A4A22'
  ctx.lineCap = 'round'
  ctx.moveTo(0, -r * 0.6)
  ctx.quadraticCurveTo(r * 0.06, -r * 0.92, r * 0.14, -r * 1.02)
  ctx.stroke()

  // 叶子
  ctx.beginPath()
  ctx.moveTo(r * 0.1, -r * 0.86)
  ctx.quadraticCurveTo(r * 0.56, -r * 1.16, r * 0.66, -r * 0.74)
  ctx.quadraticCurveTo(r * 0.34, -r * 0.7, r * 0.1, -r * 0.86)
  ctx.closePath()
  ctx.fillStyle = '#4FA83C'
  ctx.fill()
  ctx.restore()
}

// ---------------------------------------------------------------------------
// 橙子
// ---------------------------------------------------------------------------
function drawOrange(ctx, x, y, r, rot) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot || 0)
  ellipse(ctx, 0, 0, r * 0.98, r * 0.96)
  ctx.fillStyle = radial(ctx, 0, 0, r, [
    [0, '#FFC15A'], [0.5, '#F99A28'], [1, '#DE6E12']
  ])
  ctx.fill()

  // 表皮细点（少量即可，避免花）
  ctx.save()
  ctx.globalAlpha = 0.16
  ctx.fillStyle = '#8C4406'
  for (let i = 0; i < 14; i++) {
    const a = i * 2.399
    const rq = r * (0.24 + (i % 5) * 0.13)
    ctx.beginPath()
    ctx.arc(Math.cos(a) * rq, Math.sin(a) * rq, Math.max(0.6, r * 0.035), 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  ctx.save()
  ctx.globalAlpha = 0.18
  ellipse(ctx, -r * 0.5, r * 0.3, r * 0.6, r * 0.62)
  ctx.fillStyle = '#9C4A08'
  ctx.fill()
  ctx.restore()

  specular(ctx, -r * 0.32, -r * 0.38, r * 0.28, r * 0.36, 0.5, -0.6)

  // 蒂
  ellipse(ctx, 0, -r * 0.9, r * 0.16, r * 0.1)
  ctx.fillStyle = '#4E7A2A'
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(r * 0.1, -r * 0.92)
  ctx.quadraticCurveTo(r * 0.48, -r * 1.12, r * 0.58, -r * 0.84)
  ctx.quadraticCurveTo(r * 0.3, -r * 0.8, r * 0.1, -r * 0.92)
  ctx.closePath()
  ctx.fillStyle = '#57A83C'
  ctx.fill()
  ctx.restore()
}

// ---------------------------------------------------------------------------
// 香蕉
// ---------------------------------------------------------------------------
function drawBanana(ctx, x, y, r, rot) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot || 0)
  ctx.beginPath()
  ctx.moveTo(-r * 0.9, -r * 0.42)
  ctx.bezierCurveTo(-r * 0.5, r * 0.72, r * 0.42, r * 0.86, r * 0.92, r * 0.2)
  ctx.bezierCurveTo(r * 0.62, r * 0.5, -r * 0.16, r * 0.34, -r * 0.62, -r * 0.54)
  ctx.closePath()
  const g = ctx.createLinearGradient(-r * 0.8, -r * 0.4, r * 0.8, r * 0.6)
  g.addColorStop(0, '#FFE06A')
  g.addColorStop(0.45, '#FFCB2E')
  g.addColorStop(1, '#E9A213')
  ctx.fillStyle = g
  ctx.fill()
  ctx.lineWidth = Math.max(0.8, r * 0.06)
  ctx.strokeStyle = 'rgba(140,88,10,0.35)'
  ctx.stroke()

  // 面向观众的高光条
  ctx.save()
  ctx.globalAlpha = 0.5
  ctx.beginPath()
  ctx.moveTo(-r * 0.62, -r * 0.32)
  ctx.quadraticCurveTo(-r * 0.24, r * 0.36, r * 0.5, r * 0.44)
  ctx.lineWidth = Math.max(1, r * 0.14)
  ctx.lineCap = 'round'
  ctx.strokeStyle = '#FFF6C4'
  ctx.stroke()
  ctx.restore()

  // 两端深色蒂
  ellipse(ctx, -r * 0.86, -r * 0.42, r * 0.1, r * 0.07, 0.5)
  ctx.fillStyle = '#6E4A16'
  ctx.fill()
  ellipse(ctx, r * 0.9, r * 0.2, r * 0.09, r * 0.07, -0.6)
  ctx.fillStyle = '#6E4A16'
  ctx.fill()
  ctx.restore()
}

// ---------------------------------------------------------------------------
// 草莓
// ---------------------------------------------------------------------------
function drawStrawberry(ctx, x, y, r, rot) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot || 0)
  ctx.beginPath()
  ctx.moveTo(0, -r * 0.58)
  ctx.bezierCurveTo(r * 0.92, -r * 0.72, r * 0.94, r * 0.3, 0, r * 1.0)
  ctx.bezierCurveTo(-r * 0.94, r * 0.3, -r * 0.92, -r * 0.72, 0, -r * 0.58)
  ctx.closePath()
  ctx.fillStyle = radial(ctx, 0, -r * 0.1, r, [
    [0, '#FF7A88'], [0.55, '#E93B4E'], [1, '#B01C31']
  ])
  ctx.fill()

  // 籽
  ctx.save()
  ctx.globalAlpha = 0.85
  ctx.fillStyle = '#FFE9A8'
  for (let row = 0; row < 4; row++) {
    const count = 3 - (row > 1 ? 1 : 0)
    for (let i = 0; i < count; i++) {
      const px = (i - (count - 1) / 2) * r * 0.42
      const py = -r * 0.18 + row * r * 0.36
      ellipse(ctx, px, py, r * 0.055, r * 0.075, 0.2)
      ctx.fill()
    }
  }
  ctx.restore()

  specular(ctx, -r * 0.3, -r * 0.18, r * 0.2, r * 0.32, 0.42, -0.5)

  // 绿萼
  ctx.beginPath()
  ctx.moveTo(0, -r * 0.5)
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i - 2) * 0.52
    const len = r * (i === 2 ? 0.5 : 0.42)
    ctx.lineTo(Math.cos(a) * len, -r * 0.52 + Math.sin(a) * len * 0.5)
  }
  ctx.closePath()
  ctx.fillStyle = '#3F9B34'
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(0, -r * 0.58)
  ctx.lineTo(0, -r * 0.94)
  ctx.lineWidth = Math.max(1, r * 0.09)
  ctx.strokeStyle = '#2F7A28'
  ctx.lineCap = 'round'
  ctx.stroke()
  ctx.restore()
}

// ---------------------------------------------------------------------------
// 西瓜（切块）
// ---------------------------------------------------------------------------
function drawWatermelon(ctx, x, y, r, rot) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot || 0)
  // 三角形切块，底边在下方
  const h = r * 0.95
  const w = r * 1.08
  ctx.beginPath()
  ctx.moveTo(0, h * 0.82)
  ctx.quadraticCurveTo(-w, h * 0.2, -w * 0.98, -h * 0.02)
  ctx.quadraticCurveTo(0, -h * 0.72, w * 0.98, -h * 0.02)
  ctx.quadraticCurveTo(w, h * 0.2, 0, h * 0.82)
  ctx.closePath()
  ctx.save()
  ctx.clip()
  // 红瓤
  const g = ctx.createLinearGradient(0, -h * 0.5, 0, h)
  g.addColorStop(0, '#FF6E73')
  g.addColorStop(0.6, '#F04350')
  g.addColorStop(1, '#D22B3C')
  ctx.fillStyle = g
  ctx.fillRect(-w, -h, w * 2, h * 2.4)
  // 籽
  ctx.fillStyle = '#3A1A20'
  const seeds = [[-0.42, 0.02], [0.0, -0.1], [0.4, 0.04], [-0.22, 0.36], [0.2, 0.34], [0.0, 0.56]]
  seeds.forEach((s) => {
    ellipse(ctx, s[0] * r, s[1] * r, r * 0.06, r * 0.085, s[0] * 0.5)
    ctx.fill()
  })
  ctx.restore()
  // 白色内层 + 绿色瓜皮
  ctx.beginPath()
  ctx.moveTo(-w * 0.98, -h * 0.02)
  ctx.quadraticCurveTo(0, -h * 0.72, w * 0.98, -h * 0.02)
  ctx.quadraticCurveTo(w, h * 0.2, 0, h * 0.82)
  ctx.quadraticCurveTo(-w, h * 0.2, -w * 0.98, -h * 0.02)
  ctx.closePath()
  ctx.lineWidth = Math.max(2.4, r * 0.2)
  ctx.strokeStyle = '#EFF8E2'
  ctx.stroke()
  ctx.lineWidth = Math.max(1.6, r * 0.11)
  ctx.strokeStyle = '#3E8E3A'
  ctx.stroke()
  ctx.restore()
}

const DRAWERS = {
  apple: drawApple,
  orange: drawOrange,
  banana: drawBanana,
  strawberry: drawStrawberry,
  watermelon: drawWatermelon
}

/**
 * 画一个水果
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} type 水果类型 id
 * @param {number} x 中心 x
 * @param {number} y 中心 y
 * @param {number} r 基准半径（px）
 * @param {number} rot 旋转弧度
 * @param {object} opt { alpha, squash }
 */
function drawFruit(ctx, type, x, y, r, rot, opt) {
  const o = opt || {}
  const fn = DRAWERS[type] || drawApple
  ctx.save()
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha
  if (o.squash) {
    const s = clamp(o.squash, 0, 1)
    ctx.translate(x, y + r * 0.3 * s)
    ctx.scale(1 + s * 0.16, 1 - s * 0.2)
    ctx.translate(-x, -(y + r * 0.3 * s))
  }
  fn(ctx, x, y, r, rot || 0)
  ctx.restore()
}

// ---------------------------------------------------------------------------
// 篮子（柳编果篮，敞口，接住时挤压回弹）
// ---------------------------------------------------------------------------
/**
 * @param {number} x 篮子中心
 * @param {number} rimY 篮子口高度
 * @param {number} halfW 半宽
 * @param {object} o { tilt, squash, flash, alpha }
 */
function drawBasket(ctx, x, y, halfW, o) {
  const opt = o || {}
  const squash = clamp(opt.squash || 0, 0, 1)
  const tilt = clamp(opt.tilt || 0, -1, 1)
  const h = halfW * 0.96 // 篮体高度（口沿到篮底）
  const rimRY = halfW * 0.195 // 口沿椭圆短半轴
  const bottomHalf = halfW * 0.64
  const sx = 1 + squash * 0.1
  const sy = 1 - squash * 0.14

  ctx.save()
  if (opt.alpha !== undefined) ctx.globalAlpha = opt.alpha
  ctx.translate(x, y)
  ctx.rotate(tilt * 0.06)
  ctx.scale(sx, sy)

  // 地面投影
  ctx.save()
  ctx.globalAlpha = 0.18
  ellipse(ctx, 0, h * 1.0, halfW * 0.96, halfW * 0.15)
  ctx.fillStyle = '#3C5A34'
  ctx.fill()
  ctx.restore()

  // 篮体轮廓：口沿宽、底部收窄，侧壁略外鼓
  const bodyPath = () => {
    ctx.beginPath()
    ctx.moveTo(-halfW, 0)
    ctx.bezierCurveTo(-halfW * 1.04, h * 0.34, -bottomHalf * 1.16, h * 0.74, -bottomHalf, h)
    ctx.quadraticCurveTo(0, h * 1.06, bottomHalf, h)
    ctx.bezierCurveTo(bottomHalf * 1.16, h * 0.74, halfW * 1.04, h * 0.34, halfW, 0)
    ctx.closePath()
  }

  bodyPath()
  const bg2 = ctx.createLinearGradient(-halfW, 0, halfW * 0.6, h)
  bg2.addColorStop(0, '#D9A566')
  bg2.addColorStop(0.42, '#E7BE85')
  bg2.addColorStop(0.72, '#C9924F')
  bg2.addColorStop(1, '#A9713A')
  ctx.fillStyle = bg2
  ctx.fill()

  // 柳编纹理
  ctx.save()
  bodyPath()
  ctx.clip()

  // 竖向篾条：顺着侧壁的弧度走，深/浅交替，形成编织起伏
  const cols = 8
  const lw = Math.max(1, halfW * 0.055)
  for (let i = 0; i < cols; i++) {
    const t = (i + 0.5) / cols
    const x0 = -halfW + halfW * 2 * t
    const x1 = -bottomHalf + bottomHalf * 2 * t
    const cx2 = (x0 + x1) * 0.5 * 1.04
    ctx.beginPath()
    ctx.moveTo(x0, h * 0.02)
    ctx.quadraticCurveTo(cx2, h * 0.6, x1, h * 1.01)
    ctx.lineWidth = lw
    ctx.strokeStyle = i % 2 ? 'rgba(255,231,190,0.42)' : 'rgba(122,76,32,0.3)'
    ctx.stroke()
    // 错开半个格再画一根暗线，制造"一上一下"的编织感
    ctx.beginPath()
    ctx.moveTo(x0 + lw * 0.7, h * 0.02)
    ctx.quadraticCurveTo(cx2 + lw * 0.7, h * 0.6, x1 + lw * 0.5, h * 1.01)
    ctx.lineWidth = Math.max(0.6, lw * 0.45)
    ctx.strokeStyle = 'rgba(120,72,28,0.22)'
    ctx.stroke()
  }

  // 横向箍：宽度随篮体收窄，向上拱起一点
  const bands = [0.2, 0.42, 0.64, 0.86]
  bands.forEach((t) => {
    const half = halfW + (bottomHalf - halfW) * t
    ctx.beginPath()
    ctx.moveTo(-half * 0.98, h * t)
    ctx.quadraticCurveTo(0, h * t + h * 0.09, half * 0.98, h * t)
    ctx.lineWidth = Math.max(1.6, halfW * 0.07)
    ctx.strokeStyle = 'rgba(255,226,182,0.36)'
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-half * 0.98, h * t + Math.max(1, halfW * 0.055))
    ctx.quadraticCurveTo(0, h * t + h * 0.09 + Math.max(1, halfW * 0.055), half * 0.98, h * t + Math.max(1, halfW * 0.055))
    ctx.lineWidth = Math.max(0.8, halfW * 0.035)
    ctx.strokeStyle = 'rgba(116,70,26,0.34)'
    ctx.stroke()
  })

  // 左侧暗部 + 右侧受光，让篮体有体积
  const shade = ctx.createLinearGradient(-halfW, 0, halfW, 0)
  shade.addColorStop(0, 'rgba(84,52,20,0.34)')
  shade.addColorStop(0.34, 'rgba(84,52,20,0.06)')
  shade.addColorStop(0.62, 'rgba(255,238,205,0.16)')
  shade.addColorStop(1, 'rgba(84,52,20,0.26)')
  ctx.fillStyle = shade
  ctx.fillRect(-halfW * 1.1, 0, halfW * 2.2, h * 1.1)
  ctx.restore()

  // 篮口内壁（暗）—— 让"里面是空的"这件事看得清
  ellipse(ctx, 0, rimRY * 0.16, halfW * 0.985, rimRY)
  const inner = ctx.createLinearGradient(0, -rimRY, 0, rimRY * 2)
  inner.addColorStop(0, '#6B4320')
  inner.addColorStop(0.55, '#8E5C2B')
  inner.addColorStop(1, '#5E3A1B')
  ctx.fillStyle = inner
  ctx.fill()

  // 内壁后缘更暗（口沿挡住光）
  ctx.save()
  ellipse(ctx, 0, rimRY * 0.16, halfW * 0.985, rimRY)
  ctx.clip()
  ctx.beginPath()
  ctx.moveTo(-halfW, -rimRY * 2)
  ctx.lineTo(halfW, -rimRY * 2)
  ctx.lineTo(halfW, rimRY * 0.55)
  ctx.quadraticCurveTo(0, rimRY * 1.5, -halfW, rimRY * 0.55)
  ctx.closePath()
  ctx.fillStyle = 'rgba(46,28,12,0.35)'
  ctx.fill()
  ctx.restore()

  // 口沿：一圈柳条箍
  ctx.beginPath()
  ellipseOnly(ctx, 0, 0, halfW, rimRY)
  ctx.lineWidth = Math.max(3.4, halfW * 0.135)
  const rg = ctx.createLinearGradient(0, -rimRY * 1.4, 0, rimRY * 1.6)
  rg.addColorStop(0, '#F7DCB4')
  rg.addColorStop(0.4, '#E2B279')
  rg.addColorStop(0.75, '#C1874A')
  rg.addColorStop(1, '#9E6931')
  ctx.strokeStyle = rg
  ctx.stroke()

  // 口沿前缘高光（只在正面一小段，避免像盘子边缘）
  ctx.beginPath()
  ctx.save()
  ctx.scale(halfW, rimRY)
  ctx.arc(0, 0, 0.94, Math.PI * 0.22, Math.PI * 0.78)
  ctx.restore()
  ctx.lineWidth = Math.max(1.2, halfW * 0.045)
  ctx.strokeStyle = 'rgba(255,246,226,0.9)'
  ctx.stroke()

  // 接住时：口内暖光（不是外圈光晕，避免看起来像套了个环）
  if (opt.flash > 0.01) {
    ctx.save()
    const f = Math.min(1, opt.flash)
    const glow = ctx.createRadialGradient(0, rimRY * 0.2, 2, 0, rimRY * 0.2, halfW * 0.95)
    glow.addColorStop(0, 'rgba(255,214,138,' + (0.55 * f).toFixed(3) + ')')
    glow.addColorStop(0.6, 'rgba(255,205,120,' + (0.22 * f).toFixed(3) + ')')
    glow.addColorStop(1, 'rgba(255,200,110,0)')
    ellipse(ctx, 0, rimRY * 0.2, halfW * 0.98, rimRY * 1.15)
    ctx.fillStyle = glow
    ctx.fill()
    ctx.restore()
  }

  ctx.restore()
}

/** 只建立椭圆路径（不 fill/stroke），给调用方决定怎么画 */
function ellipseOnly(ctx, x, y, rx, ry) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(Math.max(0.001, rx), Math.max(0.001, ry))
  ctx.beginPath()
  ctx.arc(0, 0, 1, 0, Math.PI * 2)
  ctx.restore()
}

module.exports = {
  drawFruit,
  drawBasket,
  FRUIT_DRAWERS: DRAWERS
}
