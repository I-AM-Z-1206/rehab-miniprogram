// ============================================================================
// utils/scene/depth.js —— 2.5D 纵深绘制底座（纯 Canvas 2D）
// ----------------------------------------------------------------------------
// 为什么需要它：
//   五个游戏各有自己的 renderer，但「纵深」的语言是同一套：
//     地平线 → 消失点 → 透视地面 → 远景剪影 → 大气雾 → 落地阴影 → 暗角。
//   以前每个渲染器各画各的，结果风格不一致，而且都停在「平涂插画」。
//   这里把这套语言抽成一组可配色的原语，各 renderer 传自己的调色板即可。
//
// 透视约定（与 pkgShoot/games/shoot/scene2d.js 完全一致，别改）：
//   · 地平线 y = hz；
//   · 地面上第 u 层的横线 y = hz + floorH / u，u 越大越远、越密；u 递减即向前滚动；
//   · 纵向放射线全部从消失点 (cx, hz) 出发。
//
// 铁律：
//   1. 只画「背景与氛围」，绝不参与命中判定，也不改任何逻辑坐标；
//   2. 不 require three / 不碰 WebGL / 不碰 wx、document、window；
//   3. 每帧不 new 大量对象 —— 随机层在 buildXxx 时一次生成；
//   4. 所有函数对非有限数输入必须直接返回，宁可少画一层也不能画崩。
// ============================================================================

const TAU = Math.PI * 2

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v)
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

function finite() {
  for (let i = 0; i < arguments.length; i++) {
    const v = arguments[i]
    if (typeof v !== 'number' || !isFinite(v)) return false
  }
  return true
}

/** 屏幕上某个 y 的「远近程度」：0 = 地平线（最远），1 = 屏幕底（最近） */
function depthT(y, hz, h) {
  if (!finite(y, hz, h) || h - hz <= 0) return 0
  return clamp((y - hz) / (h - hz), 0, 1)
}

// ---------------------------------------------------------------------------
// 椭圆工具（不用 ctx.ellipse，兼容老基础库）
// ---------------------------------------------------------------------------
function fillEllipse(ctx, x, y, rx, ry, style) {
  if (!finite(x, y, rx, ry) || rx <= 0 || ry <= 0) return
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(1, ry / rx)
  ctx.fillStyle = style
  ctx.beginPath()
  ctx.arc(0, 0, rx, 0, TAU)
  ctx.fill()
  ctx.restore()
}

function ringEllipse(ctx, x, y, rx, ry, style, lw) {
  if (!finite(x, y, rx, ry) || rx <= 0 || ry <= 0) return
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(1, ry / rx)
  ctx.beginPath()
  ctx.arc(0, 0, rx, 0, TAU)
  ctx.strokeStyle = style
  ctx.lineWidth = lw || 1
  ctx.stroke()
  ctx.restore()
}

/**
 * 软阴影：椭圆径向渐变，中心浓边缘透明。
 * 比 shadowBlur 快一个数量级，低端机也不会掉帧。
 * color 传 'r,g,b'（默认纯黑），地面上的影子建议传地面暗色，纯黑会发脏。
 */
function softShadow(ctx, x, y, rx, ry, alpha, color) {
  if (!finite(x, y, rx, ry) || rx <= 0 || ry <= 0) return
  const a = clamp(alpha, 0, 1)
  if (a <= 0.004) return
  const c = color || '0,0,0'
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(1, ry / rx)
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx)
  g.addColorStop(0, 'rgba(' + c + ',' + a.toFixed(3) + ')')
  g.addColorStop(0.5, 'rgba(' + c + ',' + (a * 0.55).toFixed(3) + ')')
  g.addColorStop(1, 'rgba(' + c + ',0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, rx, 0, TAU)
  ctx.fill()
  ctx.restore()
}

/**
 * 地平线大气光：扁椭圆径向渐变，只在中间亮、两端自然消失。
 * ⚠️ 不要用「全宽纵向渐变」代替 —— 那等于给屏幕画一条横贯的水位线，
 * 会把远处的山脊、树线全部切断。
 */
function haze(ctx, o) {
  if (!o || !finite(o.cx, o.y, o.rx)) return
  const ry = o.ry || 0.07 // 椭圆压扁比（相对 rx）
  const a = o.alpha === undefined ? 0.22 : o.alpha
  if (o.rx <= 0 || a <= 0.004) return
  const c = o.color || '255,246,220'
  ctx.save()
  ctx.translate(o.cx, o.y)
  ctx.scale(1, ry)
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, o.rx)
  g.addColorStop(0, 'rgba(' + c + ',' + a.toFixed(3) + ')')
  g.addColorStop(0.55, 'rgba(' + c + ',' + (a * 0.4).toFixed(3) + ')')
  g.addColorStop(1, 'rgba(' + c + ',0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, o.rx, 0, TAU)
  ctx.fill()
  ctx.restore()

  // 地平线本身的亮线（可选）：两端淡出，绝不铺满全宽
  if (o.lineAlpha && o.lineAlpha > 0.004) {
    const w = o.w || o.rx * 2
    const x0 = o.cx - w / 2
    const lg = ctx.createLinearGradient(x0, 0, x0 + w, 0)
    lg.addColorStop(0, 'rgba(' + c + ',0)')
    lg.addColorStop(0.34, 'rgba(' + c + ',' + (o.lineAlpha * 0.55).toFixed(3) + ')')
    lg.addColorStop(0.5, 'rgba(' + c + ',' + o.lineAlpha.toFixed(3) + ')')
    lg.addColorStop(0.66, 'rgba(' + c + ',' + (o.lineAlpha * 0.55).toFixed(3) + ')')
    lg.addColorStop(1, 'rgba(' + c + ',0)')
    ctx.fillStyle = lg
    ctx.fillRect(x0, o.y - 0.5, w, 1)
  }
}

/**
 * 远景剪影：地平线上若干层起伏的山脊 / 树线。
 * 作用不是「画山」，而是让地平线不是一条空直线 —— 有了剪影，
 * 画面才有「远处有世界」，透视地面才有落点。
 * bands: [{ amp, rise, freq, alpha, color:'r,g,b' , seed }]，按由远到近给。
 *   amp  —— 起伏幅度（相对屏宽）
 *   rise —— 整体抬高（相对屏宽）
 *   freq —— 主频，越大峰越密
 */
function ridge(ctx, o) {
  if (!o || !finite(o.w, o.hz)) return
  const w = o.w
  const hz = o.hz
  const bands = o.bands || []
  for (let L = 0; L < bands.length; L++) {
    const p = bands[L]
    const amp = p.amp === undefined ? 0.1 : p.amp
    const rise = p.rise === undefined ? 0.05 : p.rise
    const freq = p.freq || 6.1
    const seed = p.seed || 1.3
    const a = p.alpha === undefined ? 0.6 : p.alpha
    ctx.beginPath()
    ctx.moveTo(-4, hz + 2)
    const step = o.step || 6
    for (let x = -4; x <= w + 4; x += step) {
      const u = x / w
      const wave =
        Math.sin(u * freq + seed) * 0.5 +
        Math.sin(u * freq * 2.24 + seed * 2) * 0.3 +
        Math.sin(u * freq * 4.8 + seed * 3) * 0.14
      const y = hz - (wave + 0.9) * w * amp * 0.5 + w * rise * 0.5
      ctx.lineTo(x, y)
    }
    ctx.lineTo(w + 4, hz + 2)
    ctx.closePath()
    ctx.fillStyle = 'rgba(' + (p.color || '40,70,90') + ',' + a + ')'
    ctx.fill()
  }
}

/**
 * 透视地面。
 *   rows  —— 横向层数（越多越密）
 *   cols  —— 纵向放射线一半的数量
 *   phase —— 0~1，递增即「向前滚动」
 *   stripe—— 可选的隔带填色（草地条纹），{ color:'r,g,b', alpha }
 *   fadeSide / fadeBottom —— 两侧与底部压暗，把视线收到中间
 */
function perspectiveFloor(ctx, o) {
  if (!o || !finite(o.w, o.h, o.hz, o.cx)) return
  const w = o.w
  const h = o.h
  const hz = o.hz
  const cx = o.cx
  const floorH = h - hz
  if (floorH <= 0) return

  const rows = o.rows || 10
  const phase = o.phase || 0
  const col = o.color || '255,255,255'
  const nearA = o.nearAlpha === undefined ? 0.14 : o.nearAlpha
  const farA = o.farAlpha === undefined ? 0.05 : o.farAlpha
  const lw = o.lineWidth || 1

  // 行位置缓存：横线和隔带共用，避免重复算 y
  const ys = []
  for (let i = 1; i <= rows + 1; i++) {
    const u = i - (phase % 1)
    if (u < 0.06) {
      ys.push(null)
      continue
    }
    const y = hz + floorH / u
    ys.push(y > h + 4 ? null : y)
  }

  // 隔带填色：从远到近逐带填，透明度随距离递增
  if (o.stripe) {
    const sc = o.stripe.color || '255,255,255'
    const sa = o.stripe.alpha === undefined ? 0.05 : o.stripe.alpha
    for (let i = 0; i < ys.length - 1; i++) {
      const y0 = ys[i + 1]
      const y1 = ys[i]
      if (y0 === null || y1 === null || y1 - y0 < 1) continue
      const t = depthT((y0 + y1) * 0.5, hz, h)
      ctx.fillStyle = 'rgba(' + sc + ',' + (sa * (0.35 + t * 0.9)).toFixed(3) + ')'
      ctx.fillRect(0, Math.max(hz, y0), w, Math.min(h, y1) - Math.max(hz, y0))
    }
  }

  // 纵向放射线：从消失点出发，近处散开
  if (o.cols) {
    const spread = o.spread === undefined ? 0.17 : o.spread
    const topSpread = o.topSpread === undefined ? 0.012 : o.topSpread
    ctx.beginPath()
    for (let i = -o.cols; i <= o.cols; i++) {
      const bx = cx + i * (w * spread)
      const tx = cx + i * (w * topSpread)
      if (bx < -w || bx > w * 2) continue
      ctx.moveTo(tx, hz)
      ctx.lineTo(bx, h)
    }
    ctx.strokeStyle = 'rgba(' + col + ',' + (farA * 1.1).toFixed(3) + ')'
    ctx.lineWidth = lw
    ctx.stroke()
  }

  // 横向线：分三组（远 / 中 / 近）各一次 stroke，近处更亮更粗
  const bands = [
    { lo: 5.5, hi: 999, k: 0 },
    { lo: 2.6, hi: 5.5, k: 0.55 },
    { lo: 0, hi: 2.6, k: 1 }
  ]
  for (let b = 0; b < bands.length; b++) {
    const band = bands[b]
    ctx.beginPath()
    let drew = false
    for (let i = 0; i < ys.length; i++) {
      const y = ys[i]
      if (y === null) continue
      const u = i + 1 - (phase % 1)
      if (u < band.lo || u >= band.hi) continue
      if (y < hz + 1) continue
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      drew = true
    }
    if (!drew) continue
    const a = lerp(farA, nearA, band.k)
    ctx.strokeStyle = 'rgba(' + col + ',' + a.toFixed(3) + ')'
    ctx.lineWidth = lw * (1 + band.k * 0.9)
    ctx.stroke()
  }

  // 两侧压暗：网格只在中间可见，别铺满整屏
  if (o.fadeSide) {
    const sc = o.fadeColor || '0,0,0'
    const k = o.fadeSide
    const side = ctx.createLinearGradient(0, 0, w, 0)
    side.addColorStop(0, 'rgba(' + sc + ',' + (0.9 * k).toFixed(3) + ')')
    side.addColorStop(0.2, 'rgba(' + sc + ',' + (0.55 * k).toFixed(3) + ')')
    side.addColorStop(0.42, 'rgba(' + sc + ',' + (0.08 * k).toFixed(3) + ')')
    side.addColorStop(0.5, 'rgba(' + sc + ',0)')
    side.addColorStop(0.58, 'rgba(' + sc + ',' + (0.08 * k).toFixed(3) + ')')
    side.addColorStop(0.8, 'rgba(' + sc + ',' + (0.55 * k).toFixed(3) + ')')
    side.addColorStop(1, 'rgba(' + sc + ',' + (0.9 * k).toFixed(3) + ')')
    ctx.fillStyle = side
    ctx.fillRect(0, hz, w, floorH)
  }

  // 底部压暗：脚下的地面不该比远处的更抢眼
  if (o.fadeBottom) {
    const sc = o.fadeColor || '0,0,0'
    const bh = floorH * 0.34
    const bottom = ctx.createLinearGradient(0, h - bh, 0, h)
    bottom.addColorStop(0, 'rgba(' + sc + ',0)')
    bottom.addColorStop(1, 'rgba(' + sc + ',' + o.fadeBottom.toFixed(3) + ')')
    ctx.fillStyle = bottom
    ctx.fillRect(0, h - bh, w, bh)
  }
}

/**
 * 云海：一排重叠的扁椭圆，底平顶圆。
 * 高空场景（走钢丝）里，它比任何山脊都更能说明「脚下有多高」。
 */
function cloudSea(ctx, o) {
  if (!o || !finite(o.w, o.y)) return
  const w = o.w
  const y = o.y
  const c = o.color || '255,255,255'
  const a = o.alpha === undefined ? 0.6 : o.alpha
  const n = o.count || 7
  const h = o.h || 22
  const seed = o.seed || 3.1
  const jitter = o.jitter || 0
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n
    // 每个云团错开位置与高低：排成一条水平线会读成「一道白条」而不是云海
    const jx = Math.sin(i * 2.7 + seed) * w * 0.035
    const jy = jitter ? Math.sin(i * 5.3 + seed * 1.7) * jitter : 0
    const x = w * u + jx + (o.drift || 0)
    const r = w * (0.09 + ((i * 37) % 11) / 11 * 0.09) * (o.scale || 1)
    const ry = h * (0.5 + ((i * 53) % 7) / 7 * 0.5)
    const yy = y + jy
    // 主体
    fillEllipse(ctx, x, yy, r, ry, 'rgba(' + c + ',' + (a * 0.85).toFixed(3) + ')')
    // 顶部再叠两个小圆堆，云才有蓬松感（纯椭圆读起来像馒头）
    fillEllipse(ctx, x - r * 0.3, yy - ry * 0.55, r * 0.55, ry * 0.78,
      'rgba(' + c + ',' + (a * 0.72).toFixed(3) + ')')
    fillEllipse(ctx, x + r * 0.28, yy - ry * 0.4, r * 0.46, ry * 0.62,
      'rgba(' + c + ',' + (a * 0.58).toFixed(3) + ')')
  }
}

/**
 * 云层：横贯画面的「一片云」，顶部是起伏的软边，向下逐渐融进空气。
 * 用于从高处往下看的场景（走钢丝）。
 * ⚠️ 别用小圆团拼云海 —— 一串等大的白椭圆会读成「水洼」或「泡沫」，
 * 真正从上方看到的云是一整片，只有顶边有起伏。
 *   y     云层顶边基准线
 *   h     云层厚度（向下渐隐）
 *   wave  顶边起伏幅度
 *   freq  起伏频率（越大越碎）
 */
function cloudBank(ctx, o) {
  if (!o || !finite(o.w, o.y, o.h)) return
  const w = o.w
  const y = o.y
  const h = o.h
  if (h <= 0) return
  const c = o.color || '255,255,255'
  const a = o.alpha === undefined ? 0.5 : o.alpha
  if (a <= 0.004) return
  const wave = o.wave === undefined ? 10 : o.wave
  const freq = o.freq || 5.4
  const seed = o.seed || 1.9
  const step = o.step || 7

  ctx.beginPath()
  ctx.moveTo(-4, y + h)
  for (let x = -4; x <= w + 4; x += step) {
    const u = x / w
    const yy = y +
      Math.sin(u * freq + seed) * wave +
      Math.sin(u * freq * 2.3 + seed * 2.1) * wave * 0.45 +
      Math.sin(u * freq * 4.7 + seed * 3.3) * wave * 0.18
    if (x <= -4) ctx.moveTo(x, yy)
    else ctx.lineTo(x, yy)
    void u
  }
  ctx.lineTo(w + 4, y + h)
  ctx.closePath()

  const g = ctx.createLinearGradient(0, y - wave, 0, y + h)
  g.addColorStop(0, 'rgba(' + c + ',' + a.toFixed(3) + ')')
  g.addColorStop(0.55, 'rgba(' + c + ',' + (a * 0.66).toFixed(3) + ')')
  g.addColorStop(1, 'rgba(' + c + ',0)')
  ctx.fillStyle = g
  ctx.fill()

  // 顶边再提一道细亮，云才有「受光的边」
  if (o.rimAlpha && o.rimAlpha > 0.004) {
    ctx.beginPath()
    for (let x = -4; x <= w + 4; x += step) {
      const u = x / w
      const yy = y +
        Math.sin(u * freq + seed) * wave +
        Math.sin(u * freq * 2.3 + seed * 2.1) * wave * 0.45 +
        Math.sin(u * freq * 4.7 + seed * 3.3) * wave * 0.18
      if (x <= -4) ctx.moveTo(x, yy)
      else ctx.lineTo(x, yy)
    }
    ctx.strokeStyle = 'rgba(' + c + ',' + o.rimAlpha.toFixed(3) + ')'
    ctx.lineWidth = o.rimWidth || 1.4
    ctx.stroke()
  }
}

/**
 * 边缘光：沿椭圆轮廓勾一圈环境光。
 * 平涂色块 + 边缘光 = 有体积；没有边缘光，贴图永远像贴纸。
 * from: 光的来向（弧度），默认左上。
 */
function rimLight(ctx, o) {
  if (!o || !finite(o.x, o.y, o.rx, o.ry)) return
  const a = o.alpha === undefined ? 0.34 : o.alpha
  if (a <= 0.004 || o.rx <= 0 || o.ry <= 0) return
  const c = o.color || '255,255,255'
  const from = o.from === undefined ? -2.3 : o.from
  ctx.save()
  ctx.translate(o.x, o.y)
  ctx.scale(1, o.ry / o.rx)
  ctx.beginPath()
  // 只在「受光侧」画一段弧，整圈会变成描边
  ctx.arc(0, 0, o.rx, from - 1.15, from + 1.15)
  const g = ctx.createLinearGradient(
    Math.cos(from - 1.15) * o.rx, Math.sin(from - 1.15) * o.rx,
    Math.cos(from + 1.15) * o.rx, Math.sin(from + 1.15) * o.rx
  )
  g.addColorStop(0, 'rgba(' + c + ',0)')
  g.addColorStop(0.5, 'rgba(' + c + ',' + a.toFixed(3) + ')')
  g.addColorStop(1, 'rgba(' + c + ',0)')
  ctx.strokeStyle = g
  ctx.lineWidth = o.lw || 1.6
  ctx.stroke()
  ctx.restore()
}

/**
 * 浮尘：贴着地面 / 空中缓慢上浮的光点。
 * 数组在 buildDust 时一次生成，每帧只读不算。
 */
function buildDust(w, h, top, bottom, n, seedBase) {
  const list = []
  const s = seedBase || 0
  for (let i = 0; i < n; i++) {
    // 用确定性伪随机，保证「同一尺寸 → 同一布局」，训练画面可重复
    const r1 = ((Math.sin((i + 1) * 12.9898 + s) * 43758.5453) % 1 + 1) % 1
    const r2 = ((Math.sin((i + 1) * 78.233 + s) * 12345.6789) % 1 + 1) % 1
    const r3 = ((Math.sin((i + 1) * 39.425 + s) * 9876.5432) % 1 + 1) % 1
    list.push({
      x: w * r1,
      y: top + (bottom - top) * r2,
      r: 0.7 + r3 * 1.9,
      a: 0.08 + r2 * 0.2,
      sp: 3 + r1 * 8,
      p: r3 * TAU
    })
  }
  return list
}

function drawDust(ctx, list, t, o) {
  if (!list || !list.length) return
  const opt = o || {}
  const top = opt.top === undefined ? 0 : opt.top
  const bottom = opt.bottom === undefined ? 0 : opt.bottom
  const span = bottom - top
  const c = opt.color || '255,255,255'
  const amp = opt.alpha === undefined ? 1 : opt.alpha
  ctx.save()
  for (let i = 0; i < list.length; i++) {
    const d = list[i]
    let y = d.y - (t * d.sp) % (span > 0 ? span : 1)
    if (span > 0 && y < top) y = bottom - (top - y)
    const a = d.a * amp * (0.5 + 0.5 * Math.sin(t * 1.6 + d.p))
    if (a <= 0.01) continue
    ctx.fillStyle = 'rgba(' + c + ',' + a.toFixed(3) + ')'
    ctx.beginPath()
    ctx.arc(d.x + Math.sin(t * 0.5 + d.p) * 4, y, d.r, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
}

/**
 * 暗角：四周压暗，把注意力收到中间。
 * color 用场景的环境暗色（暖场景别用纯黑，会发脏）。
 */
function vignette(ctx, o) {
  if (!o || !finite(o.w, o.h)) return
  const w = o.w
  const h = o.h
  const a = o.alpha === undefined ? 0.5 : o.alpha
  if (a <= 0.004) return
  const c = o.color || '0,0,0'
  const cy = o.cy === undefined ? 0.5 : o.cy
  const inner = o.inner === undefined ? 0.34 : o.inner
  const outer = o.outer === undefined ? 0.78 : o.outer
  const g = ctx.createRadialGradient(
    w * 0.5, h * cy, Math.min(w, h) * inner,
    w * 0.5, h * (cy + 0.04), Math.max(w, h) * outer
  )
  g.addColorStop(0, 'rgba(' + c + ',0)')
  g.addColorStop(0.7, 'rgba(' + c + ',' + (a * 0.31).toFixed(3) + ')')
  g.addColorStop(1, 'rgba(' + c + ',' + a.toFixed(3) + ')')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

module.exports = {
  TAU,
  clamp,
  lerp,
  finite,
  depthT,
  fillEllipse,
  ringEllipse,
  softShadow,
  haze,
  ridge,
  perspectiveFloor,
  cloudSea,
  cloudBank,
  rimLight,
  buildDust,
  drawDust,
  vignette
}
