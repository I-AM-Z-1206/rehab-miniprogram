// ============================================================================
// utils/lightchart.js —— 极简 Canvas 2D 折线图（替代 ECharts，约 6KB）
// ----------------------------------------------------------------------------
// 只做标定页需要的事：网格 + Y 轴刻度 + 折线 + 可选面积填充 + 可选零线 + X 轴首中尾标签。
// 相比 components/ec-canvas（492KB）体积可以忽略，且不依赖第三方库。
//
// 用法：
//   const chart = new LineChart(canvasNode, { series: [{ color: '#0f9c8c', fill: 'rgba(...)' }], unit: '°' })
//   chart.setSize(width, height, dpr)
//   chart.setData(['0.0','0.1'], [[1.2, 1.5]])   // labels + 多条曲线数据
// ============================================================================

const AXIS_COLOR = '#eef0f3'
const LABEL_COLOR = '#9aa0a6'
const FONT = '10px sans-serif'

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

module.exports = { LineChart }
