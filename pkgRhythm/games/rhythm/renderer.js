// ============================================================================
// games/rhythm/renderer.js —— 「左右节奏训练」整页 Canvas 渲染
// ----------------------------------------------------------------------------
// 视觉口径（对齐需求 §4 与参考截图）：
//   · 深蓝 / 紫色渐变夜空 + 星点，中央是透视霓虹跑道，左 / 中 / 右三条轨道；
//   · 音符是菱形，左品红 / 中紫 / 右青，内部带方向箭头或圆点（不只靠颜色区分）；
//   · 判定区是左 / 中 / 右三块发光地台，随节拍柔和呼吸（可关闭），不闪屏；
//   · 命中反馈：地台扩散环 + 粒子 + 飘字（PERFECT/GREAT/GOOD/MISS + 中文）；
//   · 顶部 HUD：曲名 / BPM / 难度 / 剩余时间 / 得分 / 连击 / 节奏准确率 / 状态；
//   · 底部：暂停、音量、节拍开关、退出。暂停与中断时冻结所有动态。
//
// 静态背景（夜空 + 跑道 + 网格）离屏缓存，每帧只贴一次图，低端机也能稳。
// 所有按钮都注册成热区（this.buttons），由页面 hitTest 分发，避免原生层遮挡。
// ============================================================================

const { songById } = require('../../../utils/rhythm-songs.js')
const { VERDICT_STYLE } = require('./hit-judge.js')

// 清新明亮 · 可爱风：奶油白底 + 低饱和糖果色，不用霓虹发光
const C = {
  ink: '#3F4A5A',                 // 主文字：深蓝灰（白底可读）
  inkSoft: 'rgba(63,74,90,0.84)',
  inkMute: 'rgba(63,74,90,0.66)',
  cyan: '#54C7E8',                // 天空蓝
  cyanDeep: '#2A9DBD',
  pink: '#FF8FB1',                // 草莓粉
  pinkDeep: '#EF6C96',
  violet: '#B49BFF',              // 淡紫
  mint: '#5ED3B8',                // 薄荷绿
  mintDeep: '#33B296',
  gold: '#F7B955',                // 蜂蜜黄
  lemon: '#FFD98A',
  danger: '#F2687E',
  card: 'rgba(255,255,255,0.95)',
  cardLight: 'rgba(255,255,255,0.72)',
  line: 'rgba(120,145,175,0.22)',
  shadow: 'rgba(92,116,148,0.16)',
  page: '#EAF7FF'
}

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v)
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

function rr(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rad, y)
  ctx.lineTo(x + w - rad, y)
  ctx.arcTo(x + w, y, x + w, y + rad, rad)
  ctx.lineTo(x + w, y + h - rad)
  ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad)
  ctx.lineTo(x + rad, y + h)
  ctx.arcTo(x, y + h, x, y + h - rad, rad)
  ctx.lineTo(x, y + rad)
  ctx.arcTo(x, y, x + rad, y, rad)
  ctx.closePath()
}

function diamond(ctx, x, y, r) {
  ctx.beginPath()
  ctx.moveTo(x, y - r)
  ctx.lineTo(x + r * 0.78, y)
  ctx.lineTo(x, y + r)
  ctx.lineTo(x - r * 0.78, y)
  ctx.closePath()
}

function hash(i, seed) {
  const s = Math.sin(i * 127.1 + (seed || 1) * 311.7) * 43758.5453
  return s - Math.floor(s)
}

const FONT = '"PingFang SC", "Helvetica Neue", Helvetica, Arial, sans-serif'

// 白底专用的判定色（VERDICT_STYLE 里那套是给深色背景用的，太浅）
const VERDICT_INK = {
  perfect: '#E8942A',
  great: '#2A9DBD',
  good: '#8A6FE0',
  miss: '#E2556E'
}

class RhythmRenderer {
  constructor(opts) {
    const o = opts || {}
    this.canvas = o.canvas
    this.ctx = o.ctx
    this.engine = o.engine
    this.cfg = o.cfg
    this.W = 390
    this.H = 844
    this.dpr = 2
    this.clock = 0
    this.nowMs = 0
    this.buttons = []
    this.bg = null
    this.bgKey = ''
    this.pressed = {}
    this.hint = null
    this.simOpen = false
  }

  resize(w, h, dpr) {
    this.W = Math.max(280, w)
    this.H = Math.max(480, h)
    this.dpr = dpr || 2
    this.bg = null
    this.bgKey = ''
    this._layout()
  }

  // ---------------------------------------------------------------- 布局
  _layout() {
    const W = this.W
    const H = this.H
    const short = H < 700
    const safeTop = this._safeTop()
    const hudY = safeTop + 6
    const hudH = short ? 100 : 114
    const btnY = H - (short ? 52 : 58)
    const btnH = short ? 38 : 42
    const stageTop = hudY + hudH + 8
    const stageBottom = btnY - (short ? 10 : 14)
    const stageH = Math.max(200, stageBottom - stageTop)

    this.L = {
      W, H, short, safeTop,
      hudY, hudH, hudBottom: hudY + hudH,
      btnY, btnH,
      stageTop,
      stageBottom,
      stageH,
      horizonY: stageTop + stageH * (short ? 0.16 : 0.14),
      judgeY: stageTop + stageH * 0.80,
      cx: W / 2,
      roadTopHalf: Math.max(18, W * 0.055),
      roadBottomHalf: W * 0.47,
      padHalfW: clamp(W * 0.085, 26, 42),
      padH: short ? 24 : 28
    }
    this.L.laneHalf = this.L.roadBottomHalf * 0.46
  }

  _safeTop() {
    try {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      const sb = info.statusBarHeight || 24
      const cap = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null
      const bottom = cap && cap.bottom ? cap.bottom + 8 : sb + 8
      return Math.max(sb + 6, bottom)
    } catch (e) {
      return 40
    }
  }

  // ---------------------------------------------------------------- 主渲染
  render(dt, now) {
    const ctx = this.ctx
    if (!ctx) return
    this.clock += Math.min(0.06, dt || 0.016)
    this.nowMs = now || Date.now()
    this.buttons.length = 0

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, this.W, this.H)

    const engine = this.engine
    const vm = engine.getViewModel()
    const screen = this._screen(vm.state)

    this._drawBackground()
    this._drawWorld(vm, screen)

    if (screen === 'play') {
      this._drawHud(vm)
      this._drawCombo(vm)
      this._drawBottomBar(vm)
      if (vm.sim) this._drawSimPad(vm)
      if (vm.state === 'COUNTDOWN') this._drawCountdown(vm)
      if (vm.state === 'PAUSED') this._drawPauseOverlay(vm)
      if (vm.state === 'SENSOR_ERROR') this._drawSensorOverlay(vm)
    } else if (screen === 'intro') {
      this._drawIntro(vm)
    } else if (screen === 'prepare') {
      this._drawPrepare(vm)
    } else {
      this._drawResult(vm)
    }

    this._drawTransient()
  }

  _screen(state) {
    if (state === 'IDLE') return 'intro'
    if (state === 'READY' || state === 'CALIBRATING') return 'prepare'
    if (state === 'RESULT' || state === 'ABORTED') return 'result'
    return 'play'
  }

  // ---------------------------------------------------------------- 背景
  _drawBackground() {
    const ctx = this.ctx
    const key = this.W + 'x' + this.H + '@' + this.dpr
    if (this.bg && this.bgKey === key) {
      // 必须显式给目标尺寸：离屏画布是设备像素尺寸，直接贴会被 dpr 放大
      ctx.drawImage(this.bg, 0, 0, this.W, this.H)
      return
    }
    this.bgKey = key
    this.bg = null

    let target = null
    try {
      if (typeof wx !== 'undefined' && wx.createOffscreenCanvas) {
        target = wx.createOffscreenCanvas({
          type: '2d',
          width: Math.round(this.W * this.dpr),
          height: Math.round(this.H * this.dpr)
        })
      }
    } catch (e) {
      target = null
    }
    if (!target) {
      this._paintBg(ctx)
      return
    }
    const g = target.getContext('2d')
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    g.clearRect(0, 0, this.W, this.H)
    this._paintBg(g)
    this.bg = target
    ctx.drawImage(this.bg, 0, 0, this.W, this.H)
  }

  _paintBg(g) {
    const L = this.L
    const W = L.W
    const H = L.H

    // 天空：浅天蓝 → 奶油白，明亮不刺眼
    const sky = g.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#DFF1FF')
    sky.addColorStop(0.40, '#EFF9FF')
    sky.addColorStop(0.76, '#FFF8EC')
    sky.addColorStop(1, '#FFF1DE')
    g.fillStyle = sky
    g.fillRect(0, 0, W, H)

    // 太阳：右上角一团暖光
    const sunX = W * 0.84
    const sunY = L.stageTop - 6
    const sun = g.createRadialGradient(sunX, sunY, 4, sunX, sunY, W * 0.32)
    sun.addColorStop(0, 'rgba(255,232,160,0.90)')
    sun.addColorStop(0.28, 'rgba(255,226,150,0.34)')
    sun.addColorStop(1, 'rgba(255,226,150,0)')
    g.fillStyle = sun
    g.fillRect(0, 0, W, Math.max(1, sunY + W * 0.32))

    // 云朵：三团圆角云，越远越淡
    const cloud = (cx, cy, r, a) => {
      g.fillStyle = 'rgba(255,255,255,' + a.toFixed(2) + ')'
      const puffs = [[-1.05, 0.10, 0.66], [0, 0, 1], [1.00, 0.14, 0.62]]
      puffs.forEach((p) => {
        g.beginPath()
        g.arc(cx + p[0] * r, cy + p[1] * r, r * 0.62 * p[2], 0, Math.PI * 2)
        g.fill()
      })
      g.beginPath()
      g.ellipse(cx, cy + r * 0.30, r * 1.5, r * 0.48, 0, 0, Math.PI * 2)
      g.fill()
    }
    cloud(W * 0.20, L.stageTop + 40, 24, 0.92)
    cloud(W * 0.74, L.stageTop + 96, 18, 0.72)
    cloud(W * 0.38, L.stageTop + 152, 13, 0.5)

    // 空中光斑（静态，让背景不空）
    for (let i = 0; i < 40; i++) {
      const x = hash(i, 1) * W
      const y = hash(i, 2) * H
      const r = 1.1 + hash(i, 3) * 2.4
      g.fillStyle = 'rgba(255,255,255,' + (0.30 + hash(i, 4) * 0.45).toFixed(2) + ')'
      g.beginPath()
      g.arc(x, y, r, 0, Math.PI * 2)
      g.fill()
    }

    this._paintRoad(g)
    this._paintGrid(g)
  }

  _paintRoad(g) {
    const L = this.L
    const cx = L.cx
    const topY = L.horizonY
    const botY = L.stageBottom + 20

    // 奶油色路面
    g.beginPath()
    g.moveTo(cx - L.roadTopHalf, topY)
    g.lineTo(cx + L.roadTopHalf, topY)
    g.lineTo(cx + L.roadBottomHalf, botY)
    g.lineTo(cx - L.roadBottomHalf, botY)
    g.closePath()
    const rg = g.createLinearGradient(0, topY, 0, botY)
    rg.addColorStop(0, 'rgba(255,253,247,0.97)')
    rg.addColorStop(0.6, 'rgba(255,250,240,0.98)')
    rg.addColorStop(1, 'rgba(255,244,229,0.99)')
    g.fillStyle = rg
    g.fill()

    // 三条车道各有一层柔和的糖果色
    const laneBand = (a, b, col) => {
      g.beginPath()
      g.moveTo(cx + a * L.roadTopHalf, topY)
      g.lineTo(cx + b * L.roadTopHalf, topY)
      g.lineTo(cx + b * L.roadBottomHalf, botY)
      g.lineTo(cx + a * L.roadBottomHalf, botY)
      g.closePath()
      g.fillStyle = col
      g.fill()
    }
    laneBand(-1, -0.23, 'rgba(255,183,206,0.40)')
    laneBand(-0.23, 0.23, 'rgba(255,234,178,0.34)')
    laneBand(0.23, 1, 'rgba(150,231,205,0.38)')

    // 地平平线：一条柔白亮带，暗示跑道尽头
    const hg = g.createLinearGradient(cx - L.roadTopHalf, 0, cx + L.roadTopHalf, 0)
    hg.addColorStop(0, 'rgba(255,255,255,0)')
    hg.addColorStop(0.5, 'rgba(255,255,255,0.85)')
    hg.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = hg
    g.fillRect(cx - L.roadTopHalf, topY - 1.5, L.roadTopHalf * 2, 3)

    // 边线：外侧白线 + 内侧一条彩色细线，干净不发光
    const edge = (dir, col) => {
      g.beginPath()
      g.moveTo(cx + dir * L.roadTopHalf, topY)
      g.lineTo(cx + dir * L.roadBottomHalf, botY)
      g.lineWidth = 3
      g.strokeStyle = 'rgba(255,255,255,0.95)'
      g.stroke()
      g.beginPath()
      g.moveTo(cx + dir * L.roadTopHalf, topY)
      g.lineTo(cx + dir * L.roadBottomHalf, botY)
      g.lineWidth = 1.6
      g.strokeStyle = col
      g.stroke()
    }
    edge(-1, 'rgba(239,108,150,0.55)')
    edge(1, 'rgba(42,157,189,0.55)')

    // 三车道分隔：白色圆头虚线
    ;[-1, 1].forEach((k) => {
      g.lineCap = 'round'
      for (let i = 0; i < 16; i++) {
        const t0 = i / 16
        const t1 = t0 + 0.042
        const y0 = lerp(topY, botY, Math.pow(t0, 1.8))
        const y1 = lerp(topY, botY, Math.pow(t1, 1.8))
        const h0 = lerp(L.roadTopHalf, L.roadBottomHalf, Math.pow(t0, 1.8)) * 0.23
        const h1 = lerp(L.roadTopHalf, L.roadBottomHalf, Math.pow(t1, 1.8)) * 0.23
        g.beginPath()
        g.moveTo(cx + k * h0, y0)
        g.lineTo(cx + k * h1, y1)
        g.lineWidth = 1.2 + t0 * 2.2
        g.strokeStyle = 'rgba(255,255,255,' + (0.55 + t0 * 0.4).toFixed(2) + ')'
        g.stroke()
      }
      g.lineCap = 'butt'
    })
  }

  _paintGrid(g) {
    const L = this.L
    const cx = L.cx
    const topY = L.horizonY
    const botY = L.stageBottom + 20

    // 横向刻度：很淡的水蓝色，只做透视参考
    g.strokeStyle = 'rgba(120,160,200,0.10)'
    g.lineWidth = 1
    for (let i = 1; i <= 10; i++) {
      const t = Math.pow(i / 10, 2.1)
      const y = lerp(topY, botY, t)
      const half = lerp(L.roadTopHalf, L.roadBottomHalf, t)
      g.beginPath()
      g.moveTo(cx - half, y)
      g.lineTo(cx + half, y)
      g.stroke()
    }

    // 判定线：奶白色宽边 + 左右两色渐入
    const jy = L.judgeY
    const half = lerp(L.roadTopHalf, L.roadBottomHalf, (jy - topY) / (botY - topY))
    const band = g.createLinearGradient(cx - half, jy, cx + half, jy)
    band.addColorStop(0, 'rgba(255,143,177,0.35)')
    band.addColorStop(0.5, 'rgba(255,255,255,0.95)')
    band.addColorStop(1, 'rgba(94,211,184,0.35)')
    g.beginPath()
    g.moveTo(cx - half, jy)
    g.lineTo(cx + half, jy)
    g.lineWidth = 4
    g.strokeStyle = band
    g.stroke()
  }

  // ---------------------------------------------------------------- 舞台
  _laneX(side, t) {
    const L = this.L
    const half = lerp(L.roadTopHalf, L.roadBottomHalf, t)
    const dir = side === 'left' ? -1 : (side === 'right' ? 1 : 0)
    return L.cx + dir * half * 0.46
  }

  _noteY(p) {
    const L = this.L
    // 接近缓动从 1.7 降到 1.15：之前音符大部分时间挤在远端（地平线附近），
    // 到判定线前突然加速，患者感觉"才看到就撞线"；调平后全程匀速、更可预判。
    const t = Math.pow(clamp(p, 0, 1), 1.15)
    return lerp(L.horizonY, L.judgeY, t)
  }

  _drawWorld(vm, screen) {
    const ctx = this.ctx
    const L = this.L

    // 节奏光柱：随节拍轻微呼吸（幅度很小，避免刺激）
    if (this.cfg.get('beatPulseOn') && screen === 'play') {
      const pulse = (1 - vm.beatPhase) * 0.5
      const g = ctx.createRadialGradient(L.cx, L.judgeY, 10, L.cx, L.judgeY, L.W * 0.55)
      g.addColorStop(0, 'rgba(150,190,255,' + (0.10 * pulse).toFixed(3) + ')')
      g.addColorStop(1, 'rgba(150,190,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, L.stageTop, L.W, L.stageBottom - L.stageTop)
    }

    if (screen === 'play') {
      this._drawPetals()
      this._drawJudgeGlow(vm)
      this._drawNotes(vm)
      this._drawPads(vm)
      this._drawPlayer(vm)
      this._drawFx(vm)
      this._drawJudgeText(vm)
    } else if (screen === 'intro') {
      this._drawIntroNotes(vm)
    }
  }

  /** 飘落的小花瓣：让画面"活"起来，成本很低 */
  _drawPetals() {
    const ctx = this.ctx
    const L = this.L
    const cols = ['rgba(255,183,206,0.85)', 'rgba(255,226,160,0.85)', 'rgba(178,236,218,0.85)']
    ctx.save()
    for (let i = 0; i < 9; i++) {
      const sp = 0.05 + (i % 3) * 0.018
      const ph = (this.clock * sp + i * 0.13) % 1
      const x0 = hash(i, 7) * L.W
      const x = x0 + Math.sin(this.clock * 0.9 + i) * 12
      const y = L.stageTop + ph * (L.stageBottom - L.stageTop)
      const r = 3.2 + (i % 3) * 1.1
      ctx.globalAlpha = 0.55 + 0.35 * Math.sin(ph * Math.PI)
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(this.clock * 0.6 + i)
      ctx.beginPath()
      ctx.ellipse(0, 0, r, r * 0.62, 0, 0, Math.PI * 2)
      ctx.fillStyle = cols[i % 3]
      ctx.fill()
      ctx.restore()
    }
    ctx.restore()
  }

  /** 判定线：随节拍亮起的一道柔光（不闪屏） */
  _drawJudgeGlow(vm) {
    const ctx = this.ctx
    const L = this.L
    const pulse = this.cfg.get('beatPulseOn') ? (1 - (vm.beatPhase || 0)) : 0.4
    const t = (L.judgeY - L.horizonY) / (L.stageBottom + 20 - L.horizonY)
    const half = lerp(L.roadTopHalf, L.roadBottomHalf, t)
    ctx.save()
    ctx.globalAlpha = 0.16 + pulse * 0.22
    const g = ctx.createLinearGradient(L.cx - half, 0, L.cx + half, 0)
    g.addColorStop(0, 'rgba(255,143,177,0)')
    g.addColorStop(0.5, 'rgba(255,255,255,0.95)')
    g.addColorStop(1, 'rgba(94,211,184,0)')
    ctx.fillStyle = g
    ctx.fillRect(L.cx - half, L.judgeY - 3, half * 2, 6)
    ctx.restore()
  }

  _drawNotes(vm) {
    const ctx = this.ctx
    const L = this.L
    const notes = vm.notes || []
    const tint = { left: C.pink, center: '#FFC46B', right: C.mint }
    const tintDeep = { left: C.pinkDeep, center: '#EFA13C', right: C.mintDeep }

    for (let i = 0; i < notes.length; i++) {
      const n = notes[i]
      const p = n.progress
      if (p < 0 || p > 1.15) continue
      const t = Math.pow(clamp(p, 0, 1), 1.15)
      const y = this._noteY(p)
      const x = this._laneX(n.side, t)
      const scale = 0.58 + 0.6 * Math.pow(clamp(p, 0, 1), 1.2)
      const R = (n.type === 'accent' ? 19 : 16) * scale
      const color = tint[n.side] || C.pink
      const deep = tintDeep[n.side] || C.pinkDeep

      let alpha = 1
      if (n.judged) {
        const age = (vm.musicMs - n.judgedAt) / 700
        alpha = n.verdict === 'miss' ? Math.max(0, 1 - age) * 0.5 : Math.max(0, 1 - age)
      }
      if (!n.judged && p < 0.08) alpha *= clamp(p / 0.08, 0, 1)
      if (alpha <= 0.01) continue

      ctx.save()
      ctx.globalAlpha = alpha

      // 拖尾：两节渐隐的圆角方块
      if (!n.judged && p > 0.08) {
        for (let k = 1; k <= 2; k++) {
          const pk = p - k * 0.05
          if (pk <= 0.005) break
          const tx = this._laneX(n.side, Math.pow(pk, 1.15))
          const ty = this._noteY(pk)
          ctx.globalAlpha = alpha * (0.22 - k * 0.08)
          rr(ctx, tx - R * 0.8, ty - R * 0.8, R * 1.6, R * 1.6, R * 0.55)
          ctx.fillStyle = color
          ctx.fill()
        }
        ctx.globalAlpha = alpha
      }

      // 落点柔光：快到判定线时脚下亮一下，帮助判断高度
      if (p > 0.78 && !n.judged) {
        const k = (p - 0.78) / 0.22
        ctx.globalAlpha = alpha * 0.32 * k
        const g = ctx.createRadialGradient(x, L.judgeY, 2, x, L.judgeY, 30 * k + 8)
        g.addColorStop(0, color)
        g.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.ellipse(x, L.judgeY, 22 * k + 8, 8 * k + 3, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = alpha
      }

      // 糖果本体：圆角方块 + 白边 + 顶部高光
      ctx.shadowColor = C.shadow
      ctx.shadowBlur = 8 * scale
      ctx.shadowOffsetY = 3 * scale
      rr(ctx, x - R, y - R, R * 2, R * 2, R * 0.5)
      const grad = ctx.createLinearGradient(x, y - R, x, y + R)
      grad.addColorStop(0, '#FFFFFF')
      grad.addColorStop(0.34, color)
      grad.addColorStop(1, deep)
      ctx.fillStyle = grad
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.shadowOffsetY = 0
      ctx.lineWidth = Math.max(1.2, R * 0.16)
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'
      ctx.stroke()

      // 高光点
      ctx.globalAlpha = alpha * 0.8
      ctx.beginPath()
      ctx.ellipse(x - R * 0.3, y - R * 0.44, R * 0.4, R * 0.2, -0.5, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.fill()
      ctx.globalAlpha = alpha

      // 方向标记
      if (n.side === 'center') {
        ctx.beginPath()
        ctx.arc(x, y + R * 0.06, R * 0.18, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,0.95)'
        ctx.fill()
      } else {
        this._arrow(x, y + R * 0.06, R * 0.34, n.side === 'left' ? -1 : 1, 'rgba(255,255,255,0.95)')
      }

      // 强拍：外圈白色虚线环
      if (n.type === 'accent') {
        ctx.globalAlpha = alpha * 0.55
        ctx.beginPath()
        ctx.arc(x, y, R * 1.34, 0, Math.PI * 2)
        ctx.lineWidth = Math.max(1, R * 0.09)
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'
        ctx.stroke()
        ctx.globalAlpha = alpha
      }
      ctx.restore()
    }
  }

  _arrow(x, y, r, dir, color) {
    const ctx = this.ctx
    ctx.beginPath()
    ctx.moveTo(x + dir * r, y)
    ctx.lineTo(x - dir * r * 0.7, y - r * 0.85)
    ctx.lineTo(x - dir * r * 0.7, y + r * 0.85)
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()
  }

  _drawPads(vm) {
    const ctx = this.ctx
    const L = this.L
    const beatOn = this.cfg.get('beatPulseOn')
    const pulse = beatOn ? (1 - (vm.beatPhase || 0)) : 0
    const armed = vm.dir
    const soft = {
      left: 'rgba(255,214,228,0.95)',
      center: 'rgba(255,238,196,0.95)',
      right: 'rgba(206,242,232,0.95)'
    }

    ;['left', 'center', 'right'].forEach((side) => {
      const x = this._laneX(side, 1)
      const y = L.judgeY
      const hw = side === 'center' ? L.padHalfW * 0.74 : L.padHalfW
      const hh = L.padH
      const isLeft = side === 'left'
      const color = isLeft ? C.pink : (side === 'center' ? C.gold : C.mint)
      const deep = isLeft ? C.pinkDeep : (side === 'center' ? '#E89A3C' : C.mintDeep)
      const active = armed === side
      const lift = active ? 3 : 0

      ctx.save()

      // 软阴影
      ctx.globalAlpha = 0.5
      rr(ctx, x - hw, y - hh + 5, hw * 2, hh * 2, hh)
      ctx.fillStyle = 'rgba(120,145,175,0.16)'
      ctx.fill()

      // 胶囊本体：白底 + 糖果色描边
      ctx.globalAlpha = 1
      const g = ctx.createLinearGradient(x, y - hh - lift, x, y + hh)
      g.addColorStop(0, '#FFFFFF')
      g.addColorStop(1, active ? soft[side] : 'rgba(255,255,255,0.9)')
      rr(ctx, x - hw, y - hh - lift, hw * 2, hh * 2, hh)
      ctx.fillStyle = g
      ctx.fill()
      ctx.lineWidth = active ? 3 : 2
      ctx.strokeStyle = color
      ctx.stroke()

      // 激活：外圈柔和光环
      if (active && pulse > 0.01) {
        ctx.beginPath()
        ctx.ellipse(x, y - lift, hw + (1 - pulse) * hw * 0.5, hh + (1 - pulse) * hh * 0.5, 0, 0, Math.PI * 2)
        ctx.globalAlpha = 0.35 * pulse
        ctx.lineWidth = 3
        ctx.strokeStyle = color
        ctx.stroke()
        ctx.globalAlpha = 1
      }

      // 标记
      if (side === 'center') {
        this._text('中', x, y + 5 - lift, {
          size: 13, weight: '800', color: deep, align: 'center'
        })
      } else {
        this._arrow(x - hw * 0.5, y - lift, 6.5, isLeft ? -1 : 1, deep)
        this._text(isLeft ? '左' : '右', x + hw * 0.4, y + 5 - lift, {
          size: 13, weight: '800', color: deep, align: 'center'
        })
      }
      ctx.restore()
    })
  }

  _drawPlayer(vm) {
    const ctx = this.ctx
    const L = this.L
    const xL = this._laneX('left', 1)
    const xR = this._laneX('right', 1)
    const nx = clamp(vm.nx || 0, -1, 1)
    const x = lerp(xL, xR, (nx + 1) / 2)
    const y = L.judgeY + L.padH + 24

    // 位置轨道：虚线 + 三个刻度
    ctx.save()
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(120,145,175,0.22)'
    ctx.setLineDash([2, 5])
    ctx.beginPath()
    ctx.moveTo(xL, y)
    ctx.lineTo(xR, y)
    ctx.stroke()
    ctx.setLineDash([])
    ;['left', 'center', 'right'].forEach((sd) => {
      const tx = this._laneX(sd, 1)
      ctx.beginPath()
      ctx.moveTo(tx, y - 4)
      ctx.lineTo(tx, y + 4)
      ctx.lineWidth = 2
      ctx.strokeStyle = sd === 'left' ? 'rgba(255,143,177,0.7)'
        : (sd === 'center' ? 'rgba(247,185,85,0.7)' : 'rgba(94,211,184,0.7)')
      ctx.stroke()
    })

    // 小团子：白身体 + 眼睛 + 腮红 + 微笑
    ctx.shadowColor = C.shadow
    ctx.shadowBlur = 10
    ctx.shadowOffsetY = 3
    ctx.beginPath()
    ctx.ellipse(x, y, 13, 12, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#FFFFFF'
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0
    ctx.lineWidth = 2
    ctx.strokeStyle = 'rgba(120,145,175,0.35)'
    ctx.stroke()

    // 眼睛
    ctx.fillStyle = '#43506A'
    ctx.beginPath()
    ctx.arc(x - 4.2, y - 1.6, 1.7, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x + 4.2, y - 1.6, 1.7, 0, Math.PI * 2)
    ctx.fill()
    // 腮红
    ctx.fillStyle = 'rgba(255,150,172,0.5)'
    ctx.beginPath()
    ctx.ellipse(x - 7.4, y + 3, 2.6, 1.6, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(x + 7.4, y + 3, 2.6, 1.6, 0, 0, Math.PI * 2)
    ctx.fill()
    // 微笑
    ctx.beginPath()
    ctx.arc(x, y + 2.2, 3, Math.PI * 0.18, Math.PI * 0.82)
    ctx.lineWidth = 1.4
    ctx.strokeStyle = '#43506A'
    ctx.stroke()
    ctx.restore()
  }

  _drawFx(vm) {
    const ctx = this.ctx
    const L = this.L
    const now = vm.musicMs
    const notes = vm.notes || []

    for (let i = 0; i < notes.length; i++) {
      const n = notes[i]
      if (!n.judged || n.verdict === 'miss') continue
      const age = (now - n.judgedAt) / 560
      if (age < 0 || age > 1) continue
      const x = this._laneX(n.side, 1)
      const y = L.judgeY
      const color = n.side === 'left' ? '#FF8FB1' : (n.side === 'center' ? '#B49BFF' : '#5ED3B8')

      // 扩散环
      ctx.save()
      ctx.globalAlpha = 1 - age
      ctx.beginPath()
      ctx.ellipse(x, y, 18 + age * 52, (18 + age * 52) * 0.42, 0, 0, Math.PI * 2)
      ctx.lineWidth = 2.4 * (1 - age)
      ctx.strokeStyle = color
      ctx.stroke()
      ctx.restore()

      // 粒子
      ctx.save()
      for (let k = 0; k < 7; k++) {
        const a = hash(k, i) * Math.PI * 2
        const sp = 40 + hash(k + 9, i) * 70
        const px = x + Math.cos(a) * sp * age
        const py = y + Math.sin(a) * sp * age * 0.55 - 34 * age * age
        ctx.globalAlpha = (1 - age) * 0.9
        ctx.fillStyle = k % 3 === 0 ? '#FFFFFF' : color
        ctx.beginPath()
        ctx.arc(px, py, Math.max(0.7, 3.2 * (1 - age)), 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }

    // 漏接：判定线上一道柔和的横向波纹（不闪屏）
    if (vm.missFlash > 0.02) {
      ctx.save()
      ctx.globalAlpha = vm.missFlash * 0.4
      ctx.beginPath()
      ctx.moveTo(L.cx - L.roadBottomHalf * 0.9, L.judgeY)
      ctx.lineTo(L.cx + L.roadBottomHalf * 0.9, L.judgeY)
      ctx.lineWidth = 2
      ctx.strokeStyle = 'rgba(255,124,147,0.9)'
      ctx.stroke()
      ctx.restore()
    }
  }

  _drawJudgeText(vm) {
    const f = vm.feedback
    if (!f) return
    const ctx = this.ctx
    const L = this.L
    const age = (vm.musicMs - f.at) / 900
    if (age < 0 || age > 1) return
    const style = VERDICT_STYLE[f.verdict] || VERDICT_STYLE.good
    const alpha = age < 0.12 ? age / 0.12 : 1 - Math.max(0, (age - 0.62) / 0.38)
    const scale = 1 + Math.max(0, 0.16 - age) * 1.4
    const y = L.judgeY - 68 - age * 18

    ctx.save()
    ctx.globalAlpha = clamp(alpha, 0, 1)
    ctx.translate(L.cx, y)
    ctx.scale(scale, scale)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    ctx.font = '800 26px ' + FONT
    ctx.lineWidth = 5
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'
    ctx.strokeText(style.mark + ' ' + style.en, 0, 0)
    const ink = VERDICT_INK[f.verdict] || VERDICT_INK.good
    ctx.shadowColor = 'rgba(92,116,148,0.25)'
    ctx.shadowBlur = 6
    ctx.shadowOffsetY = 2
    ctx.fillStyle = ink
    ctx.fillText(style.mark + ' ' + style.en, 0, 0)
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0

    ctx.font = '600 10px ' + FONT
    ctx.fillStyle = 'rgba(63,74,90,0.85)'
    const sub = style.zh + (f.deltaMs !== undefined ? '  ' + (f.deltaMs > 0 ? '+' : '') + f.deltaMs + 'ms' : '')
    ctx.fillText(sub, 0, 20)
    ctx.restore()
  }

  // ---------------------------------------------------------------- 连击
  _drawCombo(vm) {
    const combo = vm.combo || 0
    if (combo < 2) return
    const ctx = this.ctx
    const L = this.L
    const pop = vm.feedback && vm.musicMs - vm.feedback.at < 180 ? 1.08 : 1
    const y = L.stageTop + 24

    ctx.save()
    ctx.translate(L.cx, y)
    ctx.scale(pop, pop)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const tier = combo >= 30 ? '#E8942A' : (combo >= 15 ? C.cyanDeep : '#8A6FE0')
    ctx.font = '800 15px ' + FONT
    ctx.fillStyle = 'rgba(63,74,90,0.55)'
    ctx.fillText('COMBO', 0, -12)

    ctx.font = '800 34px ' + FONT
    ctx.lineWidth = 5
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.strokeText('×' + combo, 0, 16)
    ctx.fillStyle = tier
    ctx.fillText('×' + combo, 0, 16)
    ctx.restore()
  }

  // ---------------------------------------------------------------- HUD
  _drawHud(vm) {
    const ctx = this.ctx
    const L = this.L
    const x = 12
    const w = L.W - 24
    const y = L.hudY
    const h = L.hudH

    // 白色圆角卡片 + 柔和投影
    ctx.save()
    ctx.shadowColor = C.shadow
    ctx.shadowBlur = 16
    ctx.shadowOffsetY = 6
    rr(ctx, x, y, w, h, 18)
    ctx.fillStyle = C.card
    ctx.fill()
    ctx.restore()
    rr(ctx, x, y, w, h, 18)
    ctx.lineWidth = 1
    ctx.strokeStyle = C.line
    ctx.stroke()

    // 顶部三色渐变条（粉 → 黄 → 薄荷）
    const topLight = ctx.createLinearGradient(x, y, x + w, y)
    topLight.addColorStop(0, '#FFB7CB')
    topLight.addColorStop(0.5, '#FFDD9E')
    topLight.addColorStop(1, '#A8E8D5')
    ctx.save()
    rr(ctx, x + 14, y + 2, w - 28, 3, 1.5)
    ctx.fillStyle = topLight
    ctx.fill()
    ctx.restore()

    const short = L.short
    // 第一行：游戏名 + 曲名 + 难度
    this._text('节奏训练', x + 14, y + 18, { size: 9, weight: '700', color: C.inkMute })
    this._text(vm.song.name + ' · ' + vm.song.bpm + ' BPM', x + 14, y + 33, {
      size: 11, weight: '700', color: C.ink
    })

    const chip = '第 ' + vm.difficulty + ' 档'
    const chipW = this._measure(chip, 9, '700') + 14
    rr(ctx, x + w - 14 - chipW, y + 12, chipW, 18, 9)
    ctx.fillStyle = 'rgba(180,155,255,0.22)'
    ctx.fill()
    this._text(chip, x + w - 14 - chipW / 2, y + 24, {
      size: 9, weight: '700', color: '#7B5FD6', align: 'center'
    })

    // 第二行：得分 / 节奏准确率 / 连击
    const row2 = y + (short ? 44 : 48)
    this._text('得分', x + 14, row2 + 8, { size: 9.5, weight: '600', color: C.inkMute })
    const scoreTop = row2 + (short ? 4 : 6)
    const scoreGrad = ctx.createLinearGradient(0, scoreTop, 0, scoreTop + (short ? 26 : 30))
    scoreGrad.addColorStop(0, '#FF8FB1')
    scoreGrad.addColorStop(0.6, '#FB9F7E')
    scoreGrad.addColorStop(1, '#F5A03A')
    ctx.save()
    ctx.font = '800 ' + (short ? 26 : 30) + 'px ' + FONT
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = scoreGrad
    ctx.fillText(String(vm.score), x + 14, row2 + (short ? 30 : 33))
    ctx.restore()

    const accTxt = vm.rhythmAccuracy === null ? '暂无数据' : Math.round(vm.rhythmAccuracy * 100) + '%'
    this._text('节奏准确率', x + w * 0.52, row2 + 8, { size: 9.5, weight: '600', color: C.inkMute })
    this._text(accTxt, x + w * 0.52, row2 + (short ? 24 : 26), {
      size: short ? 13 : 14, weight: '800', color: vm.rhythmAccuracy === null ? C.inkMute : C.cyanDeep
    })

    const comboX = x + w * 0.78
    this._text('连击', comboX, row2 + 8, { size: 9.5, weight: '600', color: C.inkMute })
    this._text('×' + (vm.combo || 0), comboX, row2 + (short ? 24 : 26), {
      size: short ? 13 : 14, weight: '800', color: vm.combo >= 10 ? '#E8922F' : C.ink
    })

    // 第三行：剩余时间 + 音符进度 + 进度条
    const row3 = y + h - 18
    const mm = Math.floor(vm.timeLeftSec / 60)
    const ss = Math.floor(vm.timeLeftSec % 60)
    const timeTxt = (mm < 10 ? '0' + mm : mm) + ':' + (ss < 10 ? '0' + ss : ss)
    this._text('剩余 ' + timeTxt, x + 14, row3, {
      size: 9, weight: '600', color: vm.timeLeftSec <= 10 ? C.danger : C.inkSoft
    })
    this._text('音符 ' + vm.judgedCount + ' / ' + vm.totalNotes, x + w - 14, row3, {
      size: 9, weight: '600', color: C.inkMute, align: 'right'
    })

    const barX = x + 14
    const barW = w - 28
    const barY = y + h - 8
    rr(ctx, barX, barY, barW, 4, 2)
    ctx.fillStyle = 'rgba(120,145,175,0.14)'
    ctx.fill()
    if (vm.progress > 0.004) {
      const pw = Math.max(4, barW * vm.progress)
      const pg = ctx.createLinearGradient(barX, 0, barX + barW, 0)
      pg.addColorStop(0, '#FFB7CB')
      pg.addColorStop(0.5, '#FFDD9E')
      pg.addColorStop(1, '#7FDCC4')
      rr(ctx, barX, barY, pw, 4, 2)
      ctx.fillStyle = pg
      ctx.fill()
    }

    // 状态（曲目区右侧）
    let stateTxt = ''
    let stateColor = C.inkMute
    if (vm.state === 'PAUSED') { stateTxt = '已暂停'; stateColor = '#E8922F' }
    else if (vm.state === 'SENSOR_ERROR') { stateTxt = '信号中断'; stateColor = C.danger }
    else if (vm.state === 'COUNTDOWN') { stateTxt = '准备'; stateColor = C.cyanDeep }
    else if (vm.state === 'PLAYING') { stateTxt = vm.sim ? '模拟中' : '训练中'; stateColor = vm.sim ? '#E8922F' : C.mintDeep }
    if (vm.silent && vm.state === 'PLAYING') stateTxt = '无音乐'
    if (stateTxt) {
      this._dot(x + w - 14 - chipW - 12, y + 30, 3, stateColor)
      this._text(stateTxt, x + w - 14 - chipW - 20, y + 33, {
        size: 9.5, weight: '600', color: stateColor, align: 'right'
      })
    }
  }

  // ---------------------------------------------------------------- 底栏
  _drawBottomBar(vm) {
    const ctx = this.ctx
    const L = this.L
    const by = L.btnY
    const bh = L.btnH
    const gap = 8
    const sideW = Math.min(84, L.W * 0.22)
    const midW = Math.max(52, (L.W - 24 - sideW * 2 - gap * 3) / 2)

    this._button('pause', 12, by, sideW, bh, vm.state === 'PAUSED' ? '继续' : '暂停', {
      variant: 'glass', icon: vm.state === 'PAUSED' ? 'play' : 'pause', size: 11
    })

    const vol = Math.round((Number(this.cfg.get('musicVolume')) || 0) * 100)
    this._button('vol', 12 + sideW + gap, by, midW, bh, vol + '%', {
      variant: 'ghost', icon: 'volume', size: 10.5
    })
    this._button('beat', 12 + sideW + gap + midW + gap, by, midW, bh,
      this.cfg.get('beatPulseOn') ? '节拍开' : '节拍关', {
        variant: this.cfg.get('beatPulseOn') ? 'ghostOn' : 'ghost', icon: 'wave', size: 10.5
      })
    this._button('quit', L.W - 12 - sideW, by, sideW, bh, '退出', {
      variant: 'glass', icon: 'exit', size: 11
    })
    void ctx
  }

  // ---------------------------------------------------------------- 倒计时
  _drawCountdown(vm) {
    const ctx = this.ctx
    const L = this.L
    const n = Math.max(1, vm.countdownBeat)
    const frac = (vm.countdownSec % (vm.beatMs / 1000)) / (vm.beatMs / 1000)
    const scale = 1 + (1 - frac) * 0.25

    ctx.save()
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.fillRect(0, L.stageTop, L.W, L.stageBottom - L.stageTop)

    ctx.translate(L.cx, L.stageTop + (L.stageBottom - L.stageTop) * 0.42)
    ctx.scale(scale, scale)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '800 76px ' + FONT
    ctx.lineWidth = 8
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'
    ctx.strokeText(String(n), 0, 0)
    ctx.fillStyle = C.pink
    ctx.fillText(String(n), 0, 0)
    ctx.font = '700 13px ' + FONT
    ctx.fillStyle = C.inkSoft
    ctx.fillText('预备拍 · 站好或坐稳', 0, 62)
    ctx.restore()
  }

  // ---------------------------------------------------------------- 遮罩
  _dim(alpha) {
    const ctx = this.ctx
    const L = this.L
    ctx.save()
    ctx.fillStyle = 'rgba(255,255,255,' + (alpha === undefined ? 0.6 : alpha) + ')'
    ctx.fillRect(0, 0, L.W, L.H)
    ctx.restore()
  }

  _drawPauseOverlay(vm) {
    const ctx = this.ctx
    const L = this.L
    this._dim(0.62)
    const w = L.W - 64
    const h = 244
    const x = 32
    const y = (L.H - h) / 2 - 20
    this._glass(x, y, w, h)
    this._text('已暂停', L.cx, y + 44, { size: 20, weight: '800', color: C.ink, align: 'center' })
    this._text('音乐、音符、判定都停在原地', L.cx, y + 68, { size: 10, weight: '500', color: C.inkMute, align: 'center' })
    this._text('已命中 ' + vm.hits + ' · 漏接 ' + vm.miss, L.cx, y + 92, {
      size: 11, weight: '600', color: C.inkSoft, align: 'center'
    })
    this._button('resume', x + 20, y + 112, w - 40, 46, '继续训练', { variant: 'primary', icon: 'play', size: 14 })
    this._button('quit', x + 20, y + 170, w - 40, 40, '结束本局并查看成绩', { variant: 'ghost', icon: 'check', size: 11 })
    void ctx
  }

  _drawSensorOverlay(vm) {
    const L = this.L
    this._dim(0.68)
    const w = L.W - 64
    const h = 250
    const x = 32
    const y = (L.H - h) / 2 - 20
    this._glass(x, y, w, h)
    this._text('传感器数据中断', L.cx, y + 42, { size: 17, weight: '800', color: C.danger, align: 'center' })
    this._text('已停止判定与计时，本局不会因此掉分', L.cx, y + 66, {
      size: 10, weight: '500', color: C.inkMute, align: 'center'
    })
    this._text('中断 ' + vm.interruptedSec + ' 秒', L.cx, y + 88, {
      size: 10.5, weight: '600', color: '#E8942A', align: 'center'
    })
    this._button('reconnect', x + 20, y + 108, w - 40, 44, '去重新连接', { variant: 'primary', icon: 'wave', size: 13 })
    this._button('resume', x + 20, y + 162, w - 40, 38, '数据已恢复，继续', { variant: 'ghost', icon: 'check', size: 11 })
    this._button('quit', x + 20, y + 206, w - 40, 30, '结束本局', { variant: 'link', size: 10 })
  }

  // ---------------------------------------------------------------- 介绍页
  _drawIntro(vm) {
    const ctx = this.ctx
    const L = this.L
    const W = L.W
    const H = L.H

    const scrim = ctx.createLinearGradient(0, 0, 0, H)
    scrim.addColorStop(0, 'rgba(255,255,255,0.30)')
    scrim.addColorStop(0.45, 'rgba(255,255,255,0.22)')
    scrim.addColorStop(1, 'rgba(255,251,244,0.70)')
    ctx.fillStyle = scrim
    ctx.fillRect(0, 0, W, H)

    const top = L.safeTop + 16
    this._text('节奏训练', 24, top + 36, {
      size: 30, weight: '800', color: C.ink
    })
    this._text('跟着节拍，用身体左右移动接音符', 25, top + 60, {
      size: 11, weight: '500', color: C.inkSoft
    })

    // 状态胶囊
    let cx = 24
    const chips = []
    chips.push({
      t: vm.sim ? '模拟数据' : (vm.live ? '传感器已连接' : '传感器未连接'),
      bg: vm.sim ? 'rgba(255,226,150,0.95)' : (vm.live ? 'rgba(206,242,232,0.95)' : 'rgba(224,230,240,0.9)'),
      fg: vm.sim ? '#6B4A12' : (vm.live ? '#1F6E80' : '#5A6478')
    })
    chips.push({ t: 'BPM ' + vm.bpm, bg: 'rgba(255,255,255,0.85)', fg: '#5A6478' })
    chips.push({ t: '第 ' + vm.difficulty + ' 档', bg: 'rgba(255,255,255,0.85)', fg: '#5A6478' })
    chips.forEach((c) => {
      const w = this._measure(c.t, 10, '700') + 18
      rr(ctx, cx, top + 74, w, 22, 11)
      ctx.fillStyle = c.bg
      ctx.fill()
      this._text(c.t, cx + w / 2, top + 89, { size: 10, weight: '700', color: c.fg, align: 'center' })
      cx += w + 6
    })

    // 卡片：按内容高度贴底，头部在剩余空间里居中
    const cardX = 16
    const cardW = W - 32
    const btnBlock = 158 // 开始按钮 + 次按钮 + 模拟开关 + 间距
    const wantH = 466
    const maxH = H - (L.safeTop + 16) - 150
    let cardH = Math.max(320, Math.min(wantH, maxH))
    const cardY = H - 16 - cardH
    this._glass(cardX, cardY, cardW, cardH)

    const avail = cardH - btnBlock - 20
    const showSteps = avail >= 214
    const showParams = avail >= 286

    let y = cardY + 22
    this._text('选择曲目', cardX + 20, y + 8, { size: 11, weight: '700', color: C.ink })
    y += 20

    // 两首曲子
    const songs = require('../../../utils/rhythm-songs.js').SONGS
    const rowW = (cardW - 40 - 10) / 2
    songs.slice(0, 2).forEach((s, i) => {
      const sx = cardX + 20 + i * (rowW + 10)
      const on = s.songId === vm.song.songId
      rr(ctx, sx, y, rowW, 62, 12)
      ctx.fillStyle = on ? 'rgba(84,199,232,0.14)' : 'rgba(120,145,175,0.06)'
      ctx.fill()
      ctx.lineWidth = on ? 1.6 : 1
      ctx.strokeStyle = on ? 'rgba(84,199,232,0.7)' : C.line
      ctx.stroke()
      this._text(s.name, sx + 12, y + 24, { size: 12, weight: '700', color: C.ink })
      this._text(s.bpm + ' BPM · ' + s.tag, sx + 12, y + 42, { size: 9, weight: '500', color: C.inkMute })
      if (on) this._dot(sx + rowW - 14, y + 14, 4, C.cyan)
      this.buttons.push({ id: 'song:' + s.songId, x: sx, y: y, w: rowW, h: 62 })
    })
    y += 74

    // 难度：标签与档位同一行，省出纵向空间
    this._text('难度', cardX + 20, y + 15, { size: 10, weight: '700', color: C.inkMute })
    const dw = (cardW - 40 - 44 - 6 * 4) / 5
    for (let i = 1; i <= 5; i++) {
      const dx = cardX + 20 + 44 + (i - 1) * (dw + 6)
      const on = i === vm.difficulty
      rr(ctx, dx, y, dw, 30, 9)
      ctx.fillStyle = on ? 'rgba(180,155,255,0.28)' : 'rgba(120,145,175,0.06)'
      ctx.fill()
      ctx.lineWidth = on ? 1.4 : 1
      ctx.strokeStyle = on ? 'rgba(150,120,240,0.75)' : C.line
      ctx.stroke()
      this._text(String(i), dx + dw / 2, y + 20, {
        size: 12, weight: '800', color: on ? '#7B5FD6' : C.inkMute, align: 'center'
      })
      this.buttons.push({ id: 'lv:' + i, x: dx, y: y, w: dw, h: 30 })
    }
    y += 46

    // 玩法三步
    if (showSteps) {
      const steps = [
        '站好或坐稳，完成零点标定',
        '听音乐的拍子，向左 / 回正 / 向右移动身体',
        '音符到达判定线时保持在正确一侧'
      ]
      steps.forEach((s, i) => {
        const sy = y + i * 22 + 4
        ctx.beginPath()
        ctx.arc(cardX + 26, sy - 3.5, 7.5, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(84,199,232,0.16)'
        ctx.fill()
        this._text(String(i + 1), cardX + 26, sy - 0.5, {
          size: 9.5, weight: '700', color: C.cyanDeep, align: 'center'
        })
        this._text(s, cardX + 40, sy, { size: 10, weight: '500', color: C.inkSoft })
      })
      y += steps.length * 22 + 8
    }

    // 本局参数（空间不够就不画，信息在准备页还有一份）
    if (showParams) {
      const beatSec = 60 / Math.max(30, vm.bpm || 90)
      const stepBeats = Math.max(0.25, Number(this.cfg.get('noteStepBeats')) || 1)
      const est = Math.max(1, Math.round((Number(this.cfg.get('durationSec')) || 90) / (beatSec * stepBeats)))
      const params = [
        { k: '时长', v: (Number(this.cfg.get('durationSec')) || 90) + ' 秒' },
        { k: '音符间隔', v: stepBeats + ' 拍' },
        { k: '判定窗口', v: '±' + (Number(this.cfg.get('goodMs')) || 160) + 'ms' },
        { k: '预估音符', v: '约 ' + est + ' 个' }
      ]
      const cellW = (cardW - 40) / 2
      params.forEach((p, i) => {
        const px = cardX + 20 + (i % 2) * cellW
        const py = y + Math.floor(i / 2) * 34
        rr(ctx, px, py, cellW - 8, 30, 8)
        ctx.fillStyle = 'rgba(120,145,175,0.06)'
        ctx.fill()
        this._text(p.k, px + 9, py + 12, { size: 9.5, weight: '500', color: C.inkMute })
        this._text(String(p.v), px + 9, py + 25, { size: 10, weight: '700', color: C.ink })
      })
    }

    // 按钮区（贴卡片底部）
    const btnH = 48
    const startY = cardY + cardH - btnH - 14
    this._button('start', cardX + 18, startY, cardW - 36, btnH, '开始训练', {
      variant: 'primary', icon: 'play', size: 15
    })
    const halfW = (cardW - 46) / 2
    this._button('settings', cardX + 18, startY - 44, halfW, 36, '训练设置', { variant: 'ghost', icon: 'gear', size: 11 })
    this._button('records', cardX + 28 + halfW, startY - 44, halfW, 36, '训练记录', { variant: 'ghost', icon: 'list', size: 11 })

    // 模拟开关
    const swY = startY - 74
    this._text(vm.sim ? '模拟数据：开（仅用于测试）' : '用模拟数据测试（无传感器也能练）', cardX + 18, swY + 14, {
      size: 9.5, weight: '600', color: vm.sim ? C.gold : C.inkMute
    })
    const swW = 44
    const swH = 24
    const swX = cardX + cardW - 18 - swW
    rr(ctx, swX, swY, swW, swH, swH / 2)
    ctx.fillStyle = vm.sim ? 'rgba(255,180,80,0.95)' : 'rgba(255,255,255,0.16)'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(swX + (vm.sim ? swW - swH / 2 : swH / 2), swY + swH / 2, swH / 2 - 3, 0, Math.PI * 2)
    ctx.fillStyle = '#FFFFFF'
    ctx.fill()
    this.buttons.push({ id: vm.sim ? 'sim:off' : 'sim:on', x: swX - 90, y: swY - 6, w: swW + 96, h: swH + 12 })
  }

  /** 介绍页背景里飘的几个音符（纯装饰，不代表判定） */
  _drawIntroNotes(vm) {
    const ctx = this.ctx
    const L = this.L
    for (let i = 0; i < 3; i++) {
      const t = (this.clock * 0.12 + i * 0.33) % 1
      const y = lerp(L.horizonY, L.stageBottom, t)
      const side = i % 2 === 0 ? 'left' : 'right'
      const x = this._laneX(side, t)
      const r = 6 + t * 10
      ctx.save()
      ctx.globalAlpha = 0.18 + t * 0.25
      diamond(ctx, x, y, r)
      ctx.fillStyle = side === 'left' ? C.pink : C.cyan
      ctx.fill()
      ctx.restore()
    }
    void vm
  }

  // ---------------------------------------------------------------- 准备页
  _drawPrepare(vm) {
    const ctx = this.ctx
    const L = this.L
    const W = L.W
    const H = L.H

    const scrim = ctx.createLinearGradient(0, 0, 0, H)
    scrim.addColorStop(0, 'rgba(255,255,255,0.22)')
    scrim.addColorStop(0.5, 'rgba(255,255,255,0.28)')
    scrim.addColorStop(1, 'rgba(255,251,244,0.68)')
    ctx.fillStyle = scrim
    ctx.fillRect(0, 0, W, H)

    this._text('准备开始', 22, L.safeTop + 34, {
      size: 24, weight: '800', color: C.ink
    })
    this._text('佩戴传感器 → 零点标定 → 音画校准 → 开始', 23, L.safeTop + 56, {
      size: 10.5, weight: '500', color: C.inkSoft
    })
    this._button('back', W - 66, L.safeTop + 12, 52, 34, '返回', { variant: 'link', size: 11 })

    const cardX = 16
    const cardW = W - 32
    const cardNeed = 500
    let cardH = Math.min(cardNeed, H - (L.safeTop + 76) - 20)
    cardH = Math.max(400, cardH)
    const cardY = H - 18 - cardH
    this._glass(cardX, cardY, cardW, cardH)

    // 状态胶囊
    let cx = cardX + 18
    const connected = vm.live
    const chips = [
      { t: vm.sim ? '模拟模式' : (connected ? '传感器已连接' : '传感器未连接'), bg: vm.sim ? 'rgba(255,226,150,0.95)' : (connected ? 'rgba(206,242,232,0.95)' : 'rgba(224,230,240,0.9)'), fg: vm.sim || !connected ? '#6B4A12' : '#1F6E80' },
      { t: vm.sim ? '模拟输入' : ((vm.rateHz || 0) + ' Hz'), bg: 'rgba(255,255,255,0.85)', fg: '#5A6478' }
    ]
    chips.forEach((c) => {
      const w = this._measure(c.t, 10, '700') + 18
      rr(ctx, cx, cardY + 16, w, 22, 11)
      ctx.fillStyle = c.bg
      ctx.fill()
      this._text(c.t, cx + w / 2, cardY + 31, { size: 10, weight: '700', color: c.fg, align: 'center' })
      cx += w + 6
    })
    if (!connected && !vm.sim) {
      this._button('connect', cardX + cardW - 92, cardY + 12, 78, 30, '去连接', {
        variant: 'primary', size: 11, icon: 'wave'
      })
    }

    // 本局信息
    const infoY = cardY + 58
    this._text(vm.song.name + ' · ' + vm.bpm + ' BPM', cardX + 18, infoY + 10, {
      size: 14, weight: '800', color: C.ink
    })
    this._text('第 ' + vm.difficulty + ' 档 · ' + vm.difficultyLabel + ' · ' + (Number(this.cfg.get('durationSec')) || 90) + ' 秒', cardX + 18, infoY + 28, {
      size: 9.5, weight: '500', color: C.inkMute
    })

    // 波形示意（装饰）
    const waveY = infoY + 44
    for (let i = 0; i < 26; i++) {
      const h = 4 + Math.abs(Math.sin(i * 1.7)) * 14
      const bx = cardX + 18 + i * ((cardW - 36) / 26)
      rr(ctx, bx, waveY + 18 - h / 2, 2.5, h, 1.25)
      ctx.fillStyle = i % 4 === 0 ? 'rgba(255,143,177,0.8)' : 'rgba(84,199,232,0.45)'
      ctx.fill()
    }

    // 三步
    const steps = [
      { t: '传感器卡在胸带上', d: '胸带从腋下最高点绕一圈固定' },
      { t: '保持中立位 3 秒', d: '坐稳或站稳，双手自然放下' },
      { t: '听 ' + (Number(this.cfg.get('prepBeats')) || 2) + ' 拍预备音', d: '音乐开始后跟着拍子左右移动' }
    ]
    const stepTop = waveY + 46
    steps.forEach((s, i) => {
      const sy = stepTop + i * 40
      ctx.beginPath()
      ctx.arc(cardX + 27, sy, 9, 0, Math.PI * 2)
      ctx.fillStyle = i === 0 ? 'rgba(84,199,232,0.18)' : 'rgba(120,145,175,0.08)'
      ctx.fill()
      this._text(String(i + 1), cardX + 27, sy + 3.5, {
        size: 9.5, weight: '700', color: C.cyanDeep, align: 'center'
      })
      this._text(s.t, cardX + 44, sy + 2, { size: 11, weight: '600', color: C.ink })
      this._text(s.d, cardX + 44, sy + 16, { size: 9, weight: '500', color: C.inkMute })
    })

    // 标定进度 / 结果
    const calY = stepTop + steps.length * 40 + 2
    if (vm.state === 'CALIBRATING') {
      const p = clamp((vm.calibration && vm.calibration.elapsed) / 3000 || 0, 0, 1)
      this._text('正在标定：请保持不动', cardX + 18, calY + 8, { size: 10.5, weight: '600', color: C.cyan })
      rr(ctx, cardX + 18, calY + 14, cardW - 36, 7, 3.5)
      ctx.fillStyle = 'rgba(120,145,175,0.14)'
      ctx.fill()
      rr(ctx, cardX + 18, calY + 14, Math.max(4, (cardW - 36) * p), 7, 3.5)
      ctx.fillStyle = C.cyan
      ctx.fill()
    } else if (vm.calibration && vm.calibration.result) {
      const ok = vm.calibration.result === 'ok'
      this._text(ok ? '标定完成：中立位已记录' : (vm.calibration.message || '标定失败'), cardX + 18, calY + 10, {
        size: 10, weight: '600', color: ok ? C.mintDeep : C.danger
      })
    } else if (!vm.calibrated) {
      this._text('还没有标定：连接传感器后先做一次零点标定', cardX + 18, calY + 10, {
        size: 9.5, weight: '500', color: C.inkMute
      })
    }

    // 音画校准：贴在按钮上方
    const btnH = 46
    const by = cardY + cardH - btnH - 14
    const ghostTop = by - 44
    const calibBlockH = 76
    const calibTop = ghostTop - 14 - calibBlockH
    if (calibTop > calY + 28) {
      rr(ctx, cardX + 16, calibTop, cardW - 32, calibBlockH, 12)
      ctx.fillStyle = 'rgba(120,145,175,0.06)'
      ctx.fill()
      this._text('音画延迟补偿', cardX + 28, calibTop + 18, { size: 9.5, weight: '700', color: C.inkSoft })
      const off = Number(this.cfg.get('syncOffsetMs')) || 0
      this._text((off > 0 ? '+' : '') + off + ' ms', cardX + 28, calibTop + 40, {
        size: 14, weight: '800', color: C.cyan
      })
      this._text('点「试听」跟着拍手，让闪烁与听到的声音重合', cardX + 28, calibTop + 58, {
        size: 9.5, weight: '500', color: C.inkMute
      })
      const bw = 30
      this._button('calib:minus', cardX + cardW - 32 - bw * 2 - 8 - 62, calibTop + 26, bw, 26, '−', { variant: 'ghost', size: 13 })
      this._button('calib:plus', cardX + cardW - 32 - bw - 62, calibTop + 26, bw, 26, '+', { variant: 'ghost', size: 13 })
      this._button('calib:play', cardX + cardW - 32 - 56, calibTop + 26, 56, 26,
        vm.previewing ? '停止' : '试听', {
          variant: vm.previewing ? 'ghostOn' : 'ghost', size: 10
        })
    }

    // 试听时的节拍脉冲：让"看到"和"听到"对齐
    if (vm.previewing) {
      const phase = clamp(vm.previewBeatPhase || 0, 0, 1)
      const py = L.stageTop + (L.stageBottom - L.stageTop) * 0.34
      ctx.save()
      ctx.globalAlpha = 1 - phase
      ctx.beginPath()
      ctx.arc(L.cx, py, 24 + phase * 46, 0, Math.PI * 2)
      ctx.lineWidth = 3 * (1 - phase) + 1
      ctx.strokeStyle = C.cyan
      ctx.stroke()
      ctx.restore()
      ctx.save()
      ctx.globalAlpha = 0.9 - phase * 0.4
      ctx.beginPath()
      ctx.arc(L.cx, py, 12, 0, Math.PI * 2)
      ctx.fillStyle = C.cyan
      ctx.fill()
      ctx.restore()
      this._text('跟着闪烁拍手：听到的"哒"和看到的闪是同一时刻', L.cx, py + 74, {
        size: 9.5, weight: '600', color: C.inkSoft, align: 'center'
      })
    }

    // 按钮
    this._button('enter', cardX + 18, by, cardW - 36, btnH, '进入游戏', {
      variant: 'primary', icon: 'play', size: 15,
      disabled: vm.state === 'CALIBRATING'
    })
    const halfW = (cardW - 46) / 2
    this._button('calibrate', cardX + 18, ghostTop, halfW, 38, vm.calibrated ? '重新标定' : '开始标定', {
      variant: 'ghost', icon: 'refresh', size: 11
    })
    this._button(vm.sim ? 'sim:off' : 'sim:on', cardX + 28 + halfW, ghostTop, halfW, 38,
      vm.sim ? '关闭模拟' : '使用模拟', { variant: 'ghost', icon: 'check', size: 11 })
  }

  // ---------------------------------------------------------------- 结算页
  _drawResult(vm) {
    const ctx = this.ctx
    const L = this.L
    const W = L.W
    const H = L.H
    const s = this.engine.summary || {}

    // 背景：一层柔和白纱，把注意力收到卡片上
    const scrim = ctx.createLinearGradient(0, 0, 0, H)
    scrim.addColorStop(0, 'rgba(255,255,255,0.55)')
    scrim.addColorStop(0.5, 'rgba(255,252,246,0.62)')
    scrim.addColorStop(1, 'rgba(255,248,236,0.72)')
    ctx.fillStyle = scrim
    ctx.fillRect(0, 0, W, H)

    const px = 16
    const pw = W - 32
    const py = Math.max(L.safeTop + 8, H * 0.05)
    const ph = H - py - 16
    this._glass(px, py, pw, ph)

    const tight = ph < 600
    const gx = px + 20
    const gw = pw - 40
    const bh = tight ? 42 : 46
    const btnBlockH = bh + 14 + (tight ? 40 : 44) + 10

    // 结算内容比一屏短，往下压一点，避免全部堆在顶部
    const topPad = tight ? 24 : 52
    let y = py + topPad

    this._text(s.completed ? '训练完成' : '本局已结束', gx, y + 16, {
      size: 16, weight: '800', color: C.ink
    })
    this._text((s.songName || '') + ' · ' + (s.bpm || 0) + ' BPM · 第 ' + (s.difficulty || 0) + ' 档', gx, y + 34, {
      size: 9, weight: '500', color: C.inkMute
    })
    this._text(s.dataSource === 'simulation' ? '模拟数据 · 不计入真实训练' : '真实传感器数据', gx, y + 50, {
      size: 9, weight: '500', color: s.dataSource === 'simulation' ? '#C98A1E' : C.mintDeep
    })

    // 评级环
    const ringR = tight ? 22 : 25
    this._gradeRing(px + pw - 34 - ringR, y + 34, ringR, s.grade || '-')

    // 分数
    const scoreStr = String(s.score || 0)
    const resScore = ctx.createLinearGradient(0, y + (tight ? 56 : 60), 0, y + (tight ? 92 : 98))
    resScore.addColorStop(0, '#FF8FB1')
    resScore.addColorStop(0.6, '#FB9F7E')
    resScore.addColorStop(1, '#F5A03A')
    ctx.save()
    ctx.font = '800 ' + (tight ? 36 : 40) + 'px ' + FONT
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = resScore
    ctx.fillText(scoreStr, gx, y + (tight ? 84 : 90))
    ctx.restore()
    const sw = this._measure(scoreStr, tight ? 36 : 40, '800')
    this._text('分', gx + sw + 5, y + (tight ? 84 : 90), { size: 11, weight: '600', color: C.inkMute })
    this._text('命中 ' + (s.hits || 0) + ' / ' + (s.noteCount || 0) + ' 个音符 · 连击最高 ×' + (s.comboMax || 0),
      gx, y + (tight ? 104 : 110), { size: 9.5, weight: '500', color: C.inkSoft })

    // 四档判定计数
    const tileY = y + (tight ? 116 : 122)
    const tileH = 44
    const tiles = [
      { k: 'PERFECT', v: s.perfect || 0, c: VERDICT_INK.perfect },
      { k: 'GREAT', v: s.great || 0, c: VERDICT_INK.great },
      { k: 'GOOD', v: s.good || 0, c: VERDICT_INK.good },
      { k: 'MISS', v: s.miss || 0, c: VERDICT_INK.miss }
    ]
    const tileGap = 8
    const tileW = (gw - tileGap * 3) / 4
    tiles.forEach((t, i) => {
      const tx = gx + i * (tileW + tileGap)
      rr(ctx, tx, tileY, tileW, tileH, 10)
      ctx.fillStyle = 'rgba(120,145,175,0.07)'
      ctx.fill()
      this._text(String(t.v), tx + tileW / 2, tileY + 22, {
        size: 16, weight: '800', color: t.c, align: 'center'
      })
      this._text(t.k, tx + tileW / 2, tileY + 36, {
        size: 9, weight: '700', color: C.inkMute, align: 'center'
      })
    })

    // 判定分布条（用长度而不是颜色单独表达比例，颜色只是辅助）
    const distY = tileY + tileH + (tight ? 12 : 16)
    const distTotal = Math.max(1, (s.perfect || 0) + (s.great || 0) + (s.good || 0) + (s.miss || 0))
    const dist = [
      { v: s.perfect || 0, c: VERDICT_STYLE.perfect.color },
      { v: s.great || 0, c: VERDICT_STYLE.great.color },
      { v: s.good || 0, c: VERDICT_STYLE.good.color },
      { v: s.miss || 0, c: VERDICT_STYLE.miss.color }
    ]
    let dx2 = gx
    const distW = gw
    rr(ctx, gx, distY, distW, 8, 4)
    ctx.fillStyle = 'rgba(120,145,175,0.07)'
    ctx.fill()
    ctx.save()
    rr(ctx, gx, distY, distW, 8, 4)
    ctx.clip()
    dist.forEach((d) => {
      const w = distW * (d.v / distTotal)
      if (w <= 0) return
      ctx.fillStyle = d.c
      ctx.fillRect(dx2, distY, Math.max(1, w), 8)
      dx2 += w
    })
    ctx.restore()

    // 三个准确率（没有样本时显示"暂无数据"）
    y = distY + (tight ? 18 : 22)
    const accs = [
      { k: '节奏准确率', v: s.rhythmAccuracy, tip: '加权时间精度' },
      { k: '方向准确率', v: s.directionAccuracy, tip: '左右方向是否正确' },
      { k: '综合命中率', v: s.overallHitRate, tip: '命中 / 音符总数' }
    ]
    const accW = gw / 3
    accs.forEach((a, i) => {
      const ax = gx + i * accW
      this._text(a.k, ax, y + 9, { size: 9.5, weight: '600', color: C.inkMute })
      const txt = a.v === null || a.v === undefined ? '暂无数据' : Math.round(a.v * 100) + '%'
      this._text(txt, ax, y + 27, {
        size: a.v === null || a.v === undefined ? 10 : 15,
        weight: '800',
        color: a.v === null || a.v === undefined ? C.inkMute : C.ink
      })
    })
    y += 42

    // 明细
    const rows = [
      ['左 / 中 / 右命中', (s.leftHitCount || 0) + ' / ' + (s.centerHitCount || 0) + ' / ' + (s.rightHitCount || 0)],
      ['方向错误', (s.wrongDirectionCount || 0) + ' 次'],
      ['训练时长', (s.durationSec || 0).toFixed(1) + ' / ' + (s.plannedSec || 0).toFixed(0) + ' 秒'],
      ['音画补偿', (s.syncOffsetMs > 0 ? '+' : '') + (s.syncOffsetMs || 0) + ' ms'],
      ['数据中断', (s.interruptedSec || 0).toFixed(1) + ' 秒'],
      ['谱面种子', String(s.chartSeed || '-')]
    ]
    const rowGap = tight ? 30 : 38
    rows.forEach((r, i) => {
      const ry = y + Math.floor(i / 2) * rowGap
      const col = i % 2
      const rx = gx + col * (gw / 2)
      this._text(r[0], rx, ry + 8, { size: 9.5, weight: '500', color: C.inkMute })
      this._text(r[1], rx, ry + 24, { size: 11, weight: '700', color: C.ink })
    })
    y += Math.ceil(rows.length / 2) * rowGap + 10

    // 三向命中对比（康复训练关心两侧与回中是否均衡）
    if (!tight) {
      const lh = s.leftHitCount || 0
      const ch = s.centerHitCount || 0
      const rh = s.rightHitCount || 0
      const maxHits = Math.max(1, lh, ch, rh)
      this._text('左 / 中 / 右命中对比', gx, y + 8, { size: 9.5, weight: '600', color: C.inkMute })
      const barY = y + 18
      const barW = gw - 46
      ;[
        { k: '左', v: lh, c: C.pink },
        { k: '中', v: ch, c: C.violet },
        { k: '右', v: rh, c: C.cyan }
      ].forEach((b, i) => {
        const ry = barY + i * 19
        this._text(b.k, gx, ry + 9, { size: 9, weight: '700', color: b.c })
        rr(ctx, gx + 16, ry, barW, 7, 3.5)
        ctx.fillStyle = 'rgba(120,145,175,0.07)'
        ctx.fill()
        const wpx = barW * (b.v / maxHits)
        if (wpx > 1) {
          rr(ctx, gx + 16, ry, wpx, 7, 3.5)
          ctx.fillStyle = b.c
          ctx.fill()
        }
        this._text(b.v + ' 次', gx + gw, ry + 9, {
          size: 9, weight: '700', color: C.inkSoft, align: 'right'
        })
      })
      y = barY + 44

      // 两侧差值提示（只在明显偏一侧时出现）
      if (maxHits >= 6 && Math.min(lh, rh) / maxHits < 0.3) {
        this._text('左右差别较大，建议下次刻意向' + (lh < rh ? '左' : '右') + '侧多移动', gx, y + 4, {
          size: 9.5, weight: '600', color: C.gold
        })
        y += 14
      }
    }

    // 建议（贴按钮上方）
    const by = py + ph - bh - 14
    const ghostTop = by - (tight ? 40 : 44)
    const tips = this._tips(s)
    const tipH = 34 + Math.min(2, tips.length) * 15
    const tipTop = ghostTop - 12 - tipH
    if (tipTop > y) {
      rr(ctx, gx - 4, tipTop, gw + 8, tipH, 10)
      ctx.fillStyle = 'rgba(53,230,255,0.06)'
      ctx.fill()
      this._text('训练建议', gx + 8, tipTop + 17, { size: 9.5, weight: '700', color: C.cyanDeep })
      tips.slice(0, 2).forEach((t, i) => {
        this._text(t, gx + 8, tipTop + 33 + i * 15, { size: 9, weight: '500', color: C.inkSoft })
      })
    }

    this._button('again', gx, by, gw, bh, '再来一局', { variant: 'primary', icon: 'refresh', size: 14 })
    const halfW = (gw - 9) / 2
    this._button('records', gx, ghostTop, halfW, tight ? 34 : 36, '训练记录', {
      variant: 'ghost', icon: 'list', size: 10.5
    })
    this._button('home', gx + halfW + 9, ghostTop, halfW, tight ? 34 : 36, '返回首页', {
      variant: 'ghost', icon: 'home', size: 10.5
    })
  }

  _tips(s) {
    const out = []
    const acc = s.rhythmAccuracy
    if (acc === null || acc === undefined) {
      out.push('本局没有有效判定样本，先确认传感器与音乐是否正常')
    } else if (acc >= 0.8) {
      out.push('节奏跟得很稳，可以试试提高一档难度或换更快的曲目')
    } else if (acc >= 0.6) {
      out.push('节奏基本跟上，注意在音符到达判定线的瞬间保持不动')
    } else {
      out.push('先把速度放慢：加大判定窗口或延长音符飞行时间')
    }
    if ((s.wrongDirectionCount || 0) >= Math.max(3, (s.noteCount || 10) * 0.2)) {
      out.push('方向错得比较多，可以在设置里调「左右反向」或放大身体幅度')
    } else if ((s.miss || 0) > (s.hits || 0)) {
      out.push('漏接偏多，建议降低音符密度或延长判定窗口')
    } else if ((s.comboMax || 0) >= 10) {
      out.push('连击不错，保持这个节奏继续练')
    }
    return out
  }

  _gradeRing(x, y, r, grade) {
    const ctx = this.ctx
    const color = grade === 'S' ? '#E8942A' : grade === 'A' ? C.cyanDeep
      : grade === 'B' ? '#8A6FE0' : grade === 'C' ? '#5E86B8' : C.inkMute
    ctx.save()
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(120,145,175,0.07)'
    ctx.fill()
    ctx.lineWidth = 3
    ctx.strokeStyle = color
    ctx.stroke()
    this._text(grade, x, y + r * 0.34, { size: r * 0.95, weight: '800', color: color, align: 'center' })
    this._text('评级', x, y + r + 12, { size: 9, weight: '600', color: C.inkMute, align: 'center' })
    ctx.restore()
  }

  // ---------------------------------------------------------------- 模拟面板
  _drawSimPad(vm) {
    const ctx = this.ctx
    const L = this.L
    const x = 12
    const y = L.hudBottom + 6
    const w = this.simOpen ? L.W - 24 : 74
    const rowH = 26
    const h = this.simOpen ? 30 + rowH * 2 : 26

    rr(ctx, x, y, w, h, 12)
    ctx.fillStyle = 'rgba(255,226,150,0.45)'
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(232,148,42,0.45)'
    ctx.stroke()
    this._text('模拟 ' + (this.simOpen ? '▴' : '▾'), x + 12, y + 17, {
      size: 9.5, weight: '700', color: '#B57A1E'
    })
    this.buttons.push({ id: 'sim:toggle', x: x, y: y, w: this.simOpen ? 74 : w, h: 26 })

    if (!this.simOpen) return
    const items = [
      { id: 'sim:left', t: '左移' },
      { id: 'sim:center', t: '回中' },
      { id: 'sim:right', t: '右移' },
      { id: 'sim:force-left', t: '补左音符' },
      { id: 'sim:force-right', t: '补右音符' },
      { id: 'sim:lost', t: '模拟断线' }
    ]
    const bw = (w - 24 - 8 * 2) / 3
    items.forEach((it, i) => {
      const bx = x + 12 + (i % 3) * (bw + 8)
      const by = y + 30 + Math.floor(i / 3) * rowH
      this._button(it.id, bx, by, bw, rowH - 4, it.t, { variant: 'mini', size: 9.5 })
    })
    void vm
  }

  // ---------------------------------------------------------------- 基础控件
  _text(str, x, y, o) {
    const opt = o || {}
    const ctx = this.ctx
    ctx.save()
    ctx.font = (opt.weight || '400') + ' ' + (opt.size || 12) + 'px ' + FONT
    ctx.textAlign = opt.align || 'left'
    ctx.textBaseline = opt.baseline || 'alphabetic'
    if (opt.alpha !== undefined) ctx.globalAlpha = opt.alpha
    if (opt.shadow) {
      ctx.shadowColor = 'rgba(2,4,12,0.7)'
      ctx.shadowBlur = 10
      ctx.shadowOffsetY = 2
    }
    if (opt.glow) {
      ctx.shadowColor = opt.glow
      ctx.shadowBlur = 14
    }
    ctx.fillStyle = opt.color || C.ink
    ctx.fillText(String(str), x, y)
    ctx.restore()
  }

  _measure(str, size, weight) {
    const ctx = this.ctx
    ctx.save()
    ctx.font = (weight || '400') + ' ' + size + 'px ' + FONT
    const w = ctx.measureText(String(str)).width
    ctx.restore()
    return w
  }

  _dot(x, y, r, color) {
    const ctx = this.ctx
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
  }

  _glass(x, y, w, h, r) {
    const ctx = this.ctx
    ctx.save()
    ctx.shadowColor = C.shadow
    ctx.shadowBlur = 24
    ctx.shadowOffsetY = 10
    rr(ctx, x, y, w, h, r || 20)
    ctx.fillStyle = 'rgba(255,255,255,0.97)'
    ctx.fill()
    ctx.restore()

    rr(ctx, x, y, w, h, r || 20)
    ctx.lineWidth = 1
    ctx.strokeStyle = C.line
    ctx.stroke()
  }

  _button(id, x, y, w, h, label, o) {
    const opt = o || {}
    const ctx = this.ctx
    const pressed = this.pressed[id] && this.nowMs - this.pressed[id] < 120
    const scale = pressed ? 0.97 : 1
    const variant = opt.variant || 'ghost'
    const disabled = !!opt.disabled

    ctx.save()
    ctx.translate(x + w / 2, y + h / 2)
    ctx.scale(scale, scale)
    ctx.translate(-(x + w / 2), -(y + h / 2))
    if (disabled) ctx.globalAlpha = 0.45

    let bg = 'rgba(255,255,255,0.92)'
    let fg = C.ink
    let border = C.line
    let shadow = 'rgba(92,116,148,0.18)'
    if (variant === 'primary') {
      const g = ctx.createLinearGradient(x, y, x + w, y + h)
      g.addColorStop(0, '#FFA6C0')
      g.addColorStop(0.55, '#FFB98A')
      g.addColorStop(1, '#FF9E7A')
      bg = g
      fg = '#FFFFFF'
      border = 'rgba(255,255,255,0.6)'
      shadow = 'rgba(255,150,150,0.35)'
    } else if (variant === 'glass') {
      bg = 'rgba(255,255,255,0.95)'
      fg = C.ink
      border = 'rgba(120,145,175,0.28)'
    } else if (variant === 'ghostOn') {
      bg = 'rgba(206,242,232,0.85)'
      fg = C.mintDeep
      border = 'rgba(94,211,184,0.7)'
    } else if (variant === 'mini') {
      bg = 'rgba(255,255,255,0.85)'
      fg = C.inkSoft
      border = C.line
    } else if (variant === 'link') {
      bg = 'rgba(0,0,0,0)'
      fg = C.inkMute
      border = 'rgba(0,0,0,0)'
      shadow = ''
    }

    if (shadow) {
      ctx.shadowColor = shadow
      ctx.shadowBlur = 12
      ctx.shadowOffsetY = 4
    }
    rr(ctx, x, y, w, h, h / 2)
    ctx.fillStyle = bg
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0
    if (border !== 'rgba(0,0,0,0)') {
      ctx.lineWidth = 1
      ctx.strokeStyle = border
      ctx.stroke()
    }

    const size = opt.size || 12
    const hasIcon = !!opt.icon
    const iconW = hasIcon ? size + 7 : 0
    const labelW = this._measure(label, size, '700')
    const startX = x + w / 2 - (labelW + iconW) / 2
    const cyp = y + h / 2
    if (hasIcon) this._icon(opt.icon, startX, cyp, size * 0.95, fg)
    this._text(label, startX + iconW, cyp + size * 0.36, { size: size, weight: '700', color: fg })
    ctx.restore()

    if (!disabled) this.buttons.push({ id: id, x: x, y: y, w: w, h: h })
  }

  _icon(name, x, y, size, color) {
    const ctx = this.ctx
    const s = size / 24
    ctx.save()
    ctx.translate(x, y - size / 2)
    ctx.scale(s, s)
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = 2.1
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()

    if (name === 'play') {
      ctx.moveTo(8, 5)
      ctx.lineTo(19, 12)
      ctx.lineTo(8, 19)
      ctx.closePath()
      ctx.fill()
    } else if (name === 'pause') {
      ctx.moveTo(9, 5)
      ctx.lineTo(9, 19)
      ctx.moveTo(15, 5)
      ctx.lineTo(15, 19)
      ctx.stroke()
    } else if (name === 'exit') {
      ctx.moveTo(14, 4)
      ctx.lineTo(6, 4)
      ctx.lineTo(6, 20)
      ctx.lineTo(14, 20)
      ctx.moveTo(13, 12)
      ctx.lineTo(21, 12)
      ctx.moveTo(18, 9)
      ctx.lineTo(21, 12)
      ctx.lineTo(18, 15)
      ctx.stroke()
    } else if (name === 'gear') {
      ctx.arc(12, 12, 3.2, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(12, 12, 7.2, 0, Math.PI * 2)
      ctx.stroke()
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        ctx.beginPath()
        ctx.moveTo(12 + Math.cos(a) * 7.2, 12 + Math.sin(a) * 7.2)
        ctx.lineTo(12 + Math.cos(a) * 9.4, 12 + Math.sin(a) * 9.4)
        ctx.stroke()
      }
    } else if (name === 'list') {
      ctx.moveTo(8, 6); ctx.lineTo(20, 6)
      ctx.moveTo(8, 12); ctx.lineTo(20, 12)
      ctx.moveTo(8, 18); ctx.lineTo(20, 18)
      ctx.moveTo(4.5, 6); ctx.lineTo(4.6, 6)
      ctx.moveTo(4.5, 12); ctx.lineTo(4.6, 12)
      ctx.moveTo(4.5, 18); ctx.lineTo(4.6, 18)
      ctx.stroke()
    } else if (name === 'refresh') {
      ctx.arc(12, 12, 7, 0.6, 5.4)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(17.4, 4.6)
      ctx.lineTo(18.4, 9.2)
      ctx.lineTo(13.8, 8.2)
      ctx.stroke()
    } else if (name === 'home') {
      ctx.moveTo(4, 11)
      ctx.lineTo(12, 4.5)
      ctx.lineTo(20, 11)
      ctx.moveTo(6.5, 10)
      ctx.lineTo(6.5, 19.5)
      ctx.lineTo(17.5, 19.5)
      ctx.lineTo(17.5, 10)
      ctx.stroke()
    } else if (name === 'check') {
      ctx.moveTo(5, 12.5)
      ctx.lineTo(10, 17.5)
      ctx.lineTo(19, 7)
      ctx.stroke()
    } else if (name === 'wave') {
      ctx.moveTo(3, 12)
      ctx.lineTo(6, 12)
      ctx.lineTo(8.5, 6)
      ctx.lineTo(11.5, 18)
      ctx.lineTo(14, 9)
      ctx.lineTo(16.5, 15)
      ctx.lineTo(21, 15)
      ctx.stroke()
    } else if (name === 'volume') {
      ctx.moveTo(4, 9.5)
      ctx.lineTo(8, 9.5)
      ctx.lineTo(13, 5)
      ctx.lineTo(13, 19)
      ctx.lineTo(8, 14.5)
      ctx.lineTo(4, 14.5)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.arc(13, 12, 6, -0.9, 0.9)
      ctx.stroke()
    }
    ctx.restore()
  }

  // ---------------------------------------------------------------- 提示
  showHint(text, color) {
    this.hint = { text: text, color: color || C.ink, at: this.nowMs || Date.now() }
  }

  _drawTransient() {
    const h = this.hint
    if (!h) return
    const age = (this.nowMs || Date.now()) - h.at
    if (age > 2000) {
      this.hint = null
      return
    }
    const alpha = age < 1600 ? 1 : 1 - (age - 1600) / 400
    const ctx = this.ctx
    const w = this._measure(h.text, 11.5, '600') + 30
    const x = (this.W - w) / 2
    const y = this.L.hudBottom + 8
    ctx.save()
    ctx.globalAlpha = clamp(alpha, 0, 1)
    rr(ctx, x, y, w, 30, 15)
    ctx.fillStyle = 'rgba(10,14,34,0.92)'
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(120,150,255,0.35)'
    ctx.stroke()
    this._text(h.text, this.W / 2, y + 19, {
      size: 11.5, weight: '600', color: h.color, align: 'center'
    })
    ctx.restore()
  }

  // ---------------------------------------------------------------- 交互
  hitTest(x, y) {
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i]
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id
    }
    return ''
  }

  markPress(id) {
    if (id === 'sim:toggle') {
      this.simOpen = !this.simOpen
      return
    }
    this.pressed[id] = this.nowMs || Date.now()
  }
}

module.exports = { RhythmRenderer, C }
