// ============================================================================
// utils/lightchart.js —— 极简 Canvas 2D 图表（替代 ECharts，约 11KB）
// ----------------------------------------------------------------------------
// 只做标定页需要的事：
//   LineChart    —— 网格 + Y 轴刻度 + 折线 + 可选面积填充 + 零线 + X 轴标签
//   ScatterChart —— Roll/Pitch 二维分布：散点云 + 1σ 框 + 最大抖动框 + 零点十字
// 相比 components/ec-canvas（492KB）体积可以忽略，且不依赖第三方库。
//
// 用法：
//   const chart = new LineChart(canvasNode, { series: [{ color, fill }], unit: '°' })
//   chart.setSize(width, height, dpr)
//   chart.setData(['0.0','0.1'], [[1.2, 1.5]])   // labels + 多条曲线数据
//
//   const sc = new ScatterChart(canvasNode, { unit: '°', minSpan: 2 })
//   sc.setSize(width, height, dpr)
//   sc.setData([{ r: 1.2, p: -0.5 }, ...])       // 采样点
//   sc.stats()  → { n, meanR, meanP, sdR, sdP, spreadR, spreadP, maxShake }
// ============================================================================

const AXIS_COLOR = '#eef0f3'
const LABEL_COLOR = '#9aa0a6'
const FONT = '10px sans-serif'
const TEAL = '#0f9c8c'
const TEAL_DEEP = '#0b7a6d'
const GRAY_SOFT = '#c3c7cd'

class LineChart {
  /**
   * @param {Object} canvas Canvas 2D 节点（canvas.getContext('2d') 的来源）
   * @param {Object} options { series:[{color, fill}], unit, showXAxis, zeroLine, padding }
   */
  constructor(canvas, options) {
    const o = options || {}
    this.canvas = canvas
    this.ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null
    this.series = o.series || [{ color: '#0f9c8c' }]
    this.unit = o.unit || ''
    this.showXAxis = o.showXAxis !== false
    this.zeroLine = !!o.zeroLine
    this.padding = o.padding || { left: 40, right: 12, top: 14, bottom: 6 }
    this.width = 0
    this.height = 0
    this.dpr = 1
    this.labels = []
    this.data = []
  }

  setSize(width, height, dpr) {
    this.width = Math.max(40, width || 0)
    this.height = Math.max(40, height || 0)
    this.dpr = dpr || 1
    if (this.canvas) {
      this.canvas.width = Math.floor(this.width * this.dpr)
      this.canvas.height = Math.floor(this.height * this.dpr)
      if (!this.ctx) this.ctx = this.canvas.getContext('2d')
    }
    return this
  }

  setData(labels, data) {
    this.labels = labels || []
    this.data = data || []
    this.render()
    return this
  }

  clear() {
    this.data = []
    this.labels = []
    this.render()
    return this
  }

  render() {
    const ctx = this.ctx
    if (!ctx) return
    const w = this.width
    const h = this.height
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const pad = this.padding
    const left = pad.left
    const right = pad.right
    const top = pad.top
    const bottom = this.showXAxis ? 20 : pad.bottom
    const plotW = Math.max(1, w - left - right)
    const plotH = Math.max(1, h - top - bottom)

    // ---------- Y 轴范围 ----------
    let min = Infinity
    let max = -Infinity
    this.data.forEach((arr) => {
      if (!arr) return
      for (let i = 0; i < arr.length; i++) {
        const v = arr[i]
        if (typeof v === 'number' && isFinite(v)) {
          if (v < min) min = v
          if (v > max) max = v
        }
      }
    })
    if (this.zeroLine) {
      min = Math.min(min, 0)
      max = Math.max(max, 0)
    }
    if (!isFinite(min) || !isFinite(max)) {
      min = -1
      max = 1
    }
    if (max - min < 1e-9) {
      const c = (max + min) / 2
      min = c - 0.5
      max = c + 0.5
    }
    const padRange = (max - min) * 0.12
    min -= padRange
    max += padRange

    const yOf = (v) => top + plotH - ((v - min) / (max - min)) * plotH
    const xOf = (i, n) => left + (n <= 1 ? 0 : (i / (n - 1)) * plotW)
    const span = max - min
    const decimals = span >= 20 ? 0 : (span >= 2 ? 1 : 2)

    // ---------- 网格 + Y 刻度 ----------
    ctx.font = FONT
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 1
    const TICKS = 4
    for (let i = 0; i <= TICKS; i++) {
      const v = min + span * (i / TICKS)
      const y = yOf(v)
      ctx.strokeStyle = AXIS_COLOR
      ctx.beginPath()
      ctx.moveTo(left, y)
      ctx.lineTo(left + plotW, y)
      ctx.stroke()
      ctx.fillStyle = LABEL_COLOR
      ctx.fillText(v.toFixed(decimals), left - 6, y)
    }

    // ---------- X 轴标签（首/中/尾，避免拥挤） ----------
    if (this.showXAxis && this.labels.length) {
      const n = this.labels.length
      const idxs = n <= 3 ? this.labels.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1]
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle = LABEL_COLOR
      for (let k = 0; k < idxs.length; k++) {
        const i = idxs[k]
        ctx.fillText(String(this.labels[i]), xOf(i, n), top + plotH + 4)
      }
    }

    // ---------- 零线 ----------
    if (this.zeroLine && min < 0 && max > 0) {
      ctx.save()
      ctx.setLineDash([4, 4])
      ctx.strokeStyle = 'rgba(255, 107, 107, 0.85)'
      ctx.beginPath()
      ctx.moveTo(left, yOf(0))
      ctx.lineTo(left + plotW, yOf(0))
      ctx.stroke()
      ctx.restore()
    }

    // ---------- 曲线 ----------
    this.data.forEach((arr, si) => {
      if (!arr || arr.length < 2) return
      const style = this.series[si] || { color: '#0f9c8c' }
      const n = arr.length
      const x0 = xOf(0, n)
      const x1 = xOf(n - 1, n)
      ctx.beginPath()
      let started = false
      for (let i = 0; i < n; i++) {
        const v = arr[i]
        if (typeof v !== 'number' || !isFinite(v)) {
          started = false
          continue
        }
        const x = xOf(i, n)
        const y = yOf(v)
        if (!started) {
          ctx.moveTo(x, y)
          started = true
        } else {
          ctx.lineTo(x, y)
        }
      }
      ctx.strokeStyle = style.color
      ctx.lineWidth = 2
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.stroke()

      if (style.fill) {
        // 面积填充：沿曲线闭合到底边
        ctx.lineTo(x1, top + plotH)
        ctx.lineTo(x0, top + plotH)
        ctx.closePath()
        ctx.fillStyle = style.fill
        ctx.fill()
      }
    })

    // ---------- 单位 ----------
    if (this.unit) {
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillStyle = '#c3c7cd'
      ctx.fillText(this.unit, 2, 0)
    }
  }
}

/** 对一组 { r, p } 采样做统计：均值、标准差、极差 */
function scatterStats(points) {
  let n = 0
  let sr = 0
  let sp = 0
  let minR = Infinity
  let maxR = -Infinity
  let minP = Infinity
  let maxP = -Infinity

  for (let i = 0; i < points.length; i++) {
    const pt = points[i]
    if (!pt || typeof pt.r !== 'number' || typeof pt.p !== 'number') continue
    if (!isFinite(pt.r) || !isFinite(pt.p)) continue
    sr += pt.r
    sp += pt.p
    n += 1
    if (pt.r < minR) minR = pt.r
    if (pt.r > maxR) maxR = pt.r
    if (pt.p < minP) minP = pt.p
    if (pt.p > maxP) maxP = pt.p
  }

  if (!n) {
    return {
      n: 0, meanR: null, meanP: null, sdR: null, sdP: null,
      minR: null, maxR: null, minP: null, maxP: null,
      spreadR: null, spreadP: null, maxShake: null
    }
  }

  const meanR = sr / n
  const meanP = sp / n
  let vr = 0
  let vp = 0
  for (let i = 0; i < points.length; i++) {
    const pt = points[i]
    if (!pt || typeof pt.r !== 'number' || typeof pt.p !== 'number') continue
    if (!isFinite(pt.r) || !isFinite(pt.p)) continue
    vr += (pt.r - meanR) * (pt.r - meanR)
    vp += (pt.p - meanP) * (pt.p - meanP)
  }

  const sdR = Math.sqrt(vr / n)
  const sdP = Math.sqrt(vp / n)
  return {
    n,
    meanR,
    meanP,
    sdR,
    sdP,
    minR,
    maxR,
    minP,
    maxP,
    spreadR: maxR - minR,
    spreadP: maxP - minP,
    maxShake: Math.max(sdR, sdP)
  }
}

class ScatterChart {
  /**
   * Roll / Pitch 二维分布图。
   * 两轴共用同一个「px / 度」比例 —— 这是刻意的：康复上看的就是
   * 「哪个方向晃得多」，一旦各自独立缩放，两个方向的抖动就不可比了。
   *
   * @param {Object} canvas Canvas 2D 节点
   * @param {Object} options { unit, minSpan（最小视窗跨度，度）, maxPoints（抽稀上限） }
   */
  constructor(canvas, options) {
    const o = options || {}
    this.canvas = canvas
    this.ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null
    this.unit = o.unit || '°'
    this.minSpan = typeof o.minSpan === 'number' ? o.minSpan : 2
    this.maxPoints = typeof o.maxPoints === 'number' ? o.maxPoints : 600
    this.padding = o.padding || { left: 40, right: 10, top: 12, bottom: 18 }
    this.width = 0
    this.height = 0
    this.dpr = 1
    this.points = []
    this._stats = scatterStats([])
  }

  setSize(width, height, dpr) {
    this.width = Math.max(80, width || 0)
    this.height = Math.max(80, height || 0)
    this.dpr = dpr || 1
    if (this.canvas) {
      this.canvas.width = Math.floor(this.width * this.dpr)
      this.canvas.height = Math.floor(this.height * this.dpr)
      if (!this.ctx) this.ctx = this.canvas.getContext('2d')
    }
    return this
  }

  setData(points) {
    const arr = Array.isArray(points) ? points : []
    // 等距抽稀：点太多时保留首尾顺序，视觉密度几乎不变，但每帧绘制量封顶
    if (arr.length > this.maxPoints) {
      const step = arr.length / this.maxPoints
      const out = []
      for (let i = 0; i < this.maxPoints; i++) out.push(arr[Math.floor(i * step)])
      this.points = out
    } else {
      this.points = arr
    }
    this._stats = scatterStats(this.points)
    this.render()
    return this
  }

  clear() {
    this.points = []
    this._stats = scatterStats([])
    this.render()
    return this
  }

  stats() {
    return this._stats
  }

  render() {
    const ctx = this.ctx
    if (!ctx) return
    const w = this.width
    const h = this.height
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const pad = this.padding
    const left = pad.left
    const top = pad.top
    const plotW = Math.max(1, w - left - pad.right)
    const plotH = Math.max(1, h - top - pad.bottom)

    // 空数据：先画一句提示，避免页面上出现一块不明所以的空白
    if (!this.points.length) {
      ctx.font = FONT
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = LABEL_COLOR
      ctx.fillText('开始标定后显示分布', left + plotW / 2, top + plotH / 2)
      return
    }

    const st = this._stats

    // ---------- 视窗范围：两轴共用同一比例 ----------
    let centerR = (st.minR + st.maxR) / 2
    let centerP = (st.minP + st.maxP) / 2
    let span = Math.max(st.spreadR, st.spreadP, this.minSpan) * 1.3
    if (span < 1e-6) span = this.minSpan

    const scale = Math.min(plotW, plotH) / span
    const cxPx = left + plotW / 2
    const cyPx = top + plotH / 2
    const xOf = (r) => cxPx + (r - centerR) * scale
    const yOf = (p) => cyPx - (p - centerP) * scale

    // ---------- 网格（按整度数，最多 6 条） ----------
    const halfSpan = span / 2
    const stepDiv = halfSpan > 6 ? 2 : halfSpan > 3 ? 1 : halfSpan > 1.2 ? 0.5 : 0.2
    ctx.font = FONT
    ctx.lineWidth = 1
    const gridMinR = centerR - halfSpan
    const gridMaxR = centerR + halfSpan
    const first = Math.ceil(gridMinR / stepDiv) * stepDiv
    for (let v = first; v <= gridMaxR + 1e-9; v += stepDiv) {
      const x = xOf(v)
      if (x < left - 1 || x > left + plotW + 1) continue
      ctx.strokeStyle = AXIS_COLOR
      ctx.beginPath()
      ctx.moveTo(x, top)
      ctx.lineTo(x, top + plotH)
      ctx.stroke()
    }
    const gridMinP = centerP - halfSpan
    const gridMaxP = centerP + halfSpan
    const firstP = Math.ceil(gridMinP / stepDiv) * stepDiv
    for (let v = firstP; v <= gridMaxP + 1e-9; v += stepDiv) {
      const y = yOf(v)
      if (y < top - 1 || y > top + plotH + 1) continue
      ctx.strokeStyle = AXIS_COLOR
      ctx.beginPath()
      ctx.moveTo(left, y)
      ctx.lineTo(left + plotW, y)
      ctx.stroke()
    }

    // ---------- 裁剪区：落到坐标范围外的散点会被裁掉，不越界 ----------
    ctx.save()
    ctx.beginPath()
    ctx.rect(left, top, plotW, plotH)
    ctx.clip()

    // ---------- 最大抖动框（虚线） ----------
    const bx = xOf(st.minR)
    const bw = Math.max(1, xOf(st.maxR) - bx)
    const by = yOf(st.maxP)
    const bh = Math.max(1, yOf(st.minP) - by)
    ctx.setLineDash([5, 4])
    ctx.strokeStyle = '#c3c7cd'
    ctx.lineWidth = 1.5
    ctx.strokeRect(bx, by, bw, bh)

    // ---------- 1σ 框（实线） ----------
    if (st.sdR !== null && st.sdP !== null) {
      const sx = xOf(st.meanR - st.sdR)
      const sw = Math.max(1, xOf(st.meanR + st.sdR) - sx)
      const sy = yOf(st.meanP + st.sdP)
      const sh = Math.max(1, yOf(st.meanP - st.sdP) - sy)
      ctx.setLineDash([])
      ctx.strokeStyle = TEAL
      ctx.lineWidth = 1.5
      ctx.strokeRect(sx, sy, sw, sh)
    }

    // ---------- 散点：越新越亮，能看出漂移轨迹 ----------
    const n = this.points.length
    for (let i = 0; i < n; i++) {
      const pt = this.points[i]
      if (!pt || typeof pt.r !== 'number' || typeof pt.p !== 'number') continue
      const t = n <= 1 ? 1 : i / (n - 1)
      ctx.globalAlpha = 0.18 + 0.5 * t
      ctx.fillStyle = TEAL
      ctx.beginPath()
      ctx.arc(xOf(pt.r), yOf(pt.p), 2.2, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // ---------- 零点十字 + 中心点 ----------
    const mx = xOf(st.meanR)
    const my = yOf(st.meanP)
    ctx.setLineDash([])
    ctx.strokeStyle = TEAL_DEEP
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(mx - 10, my)
    ctx.lineTo(mx + 10, my)
    ctx.moveTo(mx, my - 10)
    ctx.lineTo(mx, my + 10)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(mx, my, 4, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'
    ctx.fill()
    ctx.strokeStyle = TEAL
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.restore()

    // ---------- 轴标签 ----------
    ctx.font = FONT
    ctx.fillStyle = LABEL_COLOR
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'right'
    ctx.fillText((centerP + halfSpan).toFixed(1), left - 5, yOf(centerP + halfSpan))
    ctx.fillText(centerP.toFixed(1), left - 5, cyPx)
    ctx.fillText((centerP - halfSpan).toFixed(1), left - 5, yOf(centerP - halfSpan))
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText((centerR - halfSpan).toFixed(1), xOf(centerR - halfSpan), top + plotH + 3)
    ctx.fillText(centerR.toFixed(1), cxPx, top + plotH + 3)
    ctx.fillText((centerR + halfSpan).toFixed(1), xOf(centerR + halfSpan), top + plotH + 3)

    if (this.unit) {
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillStyle = GRAY_SOFT
      ctx.fillText('Pitch ' + this.unit, 2, 0)
      ctx.textAlign = 'right'
      ctx.fillText('Roll ' + this.unit, w - 2, 0)
    }
  }
}

module.exports = { LineChart, ScatterChart, scatterStats }
