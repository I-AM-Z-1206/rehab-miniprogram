// ============================================================================
// games/fruit/renderer.js —— 「接水果」的画面与界面（全部绘制在 Canvas 上）
// ----------------------------------------------------------------------------
// 为什么整页都画在 Canvas：
//   页面用 webview 渲染器时，原生 canvas 会盖住 WXML 节点；把 HUD / 按钮 / 面板
//   全部画在 canvas 上，层次永远正确，也能保持统一的游戏化视觉。
//
// 画面分层（从后到前）：
//   1. 天空 / 云 / 远山 / 果园树列 / 草地（尺寸变化时才重绘，缓存到离屏画布）
//   2. 中景雾气 + 地面透视车道
//   3. 下落水果（含接住入篮动画、漏接淡出）
//   4. 果篮（画在水果之后，水果「沉进」篮口）
//   5. 粒子 / 得分飘字 / 连击反馈
//   6. HUD / 底部操作 / 面板 / 按钮（按钮区域同时登记为热区）
//
// 坐标口径：水果位置来自引擎的归一化坐标（x,y ∈ 0~1），这里只做屏幕映射：
//   px = x * W        py = fieldTop + y * (rimY - fieldTop)
//   归一化坐标与屏幕无关，所以换机型不会改变游戏难度。
// ============================================================================

const { drawFruit, drawBasket } = require('./fruits.js')
const { FRUIT_TYPES, DESIGN_WIDTH } = require('./spawner.js')
// 2.5D 纵深原语（地平线雾 / 远景剪影 / 透视地面 / 软阴影 / 浮尘 / 暗角）
const depth = require('../../../utils/scene/depth.js')

const C = {
  ink: '#152D22',
  inkSoft: '#35503F',
  inkMute: '#5E7367',
  teal: '#0F9C8C',
  tealDeep: '#0A7E72',
  tealLight: '#43C7B0',
  amber: '#E39A32',
  amberDeep: '#B4771A',
  danger: '#DF5540',
  white: '#FFFFFF',
  card: 'rgba(255,255,255,0.96)',
  line: 'rgba(21,45,34,0.09)'
}

const SKY = {
  top: '#8ACFEC',
  mid: '#BCE5F5',
  low: '#EFF6E9',
  horizon: '#F7F3DE',
  sun: 'rgba(255,247,214,0.9)',
  hillFar: '#A9C8D8',
  hillMid: '#94BBAE',
  hillNear: '#8CB48F',
  treeDark: '#4C7F58',
  treeMid: '#5F9863',
  treeLight: '#79B173',
  trunk: '#7A5C3C',
  grassFar: '#C9E0A9',
  grassMid: '#A9CC84',
  grassNear: '#8CB86A'
}

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v)
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

function rr(ctx, x, y, w, h, r) {
  const rad = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2)
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

function ellipse(ctx, x, y, rx, ry) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(Math.max(0.001, rx), Math.max(0.001, ry))
  ctx.beginPath()
  ctx.arc(0, 0, 1, 0, Math.PI * 2)
  ctx.restore()
}

/** 稳定伪随机（粒子用，避免每帧抖动） */
function hash(i, seed) {
  const x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453
  return x - Math.floor(x)
}

class FruitRenderer {
  constructor(opts) {
    const o = opts || {}
    this.canvas = o.canvas
    this.ctx = o.ctx
    this.engine = o.engine
    this.cfg = o.cfg

    this.W = 375
    this.H = 667
    this.dpr = 2
    this.clock = 0
    this.nowMs = 0
    this.buttons = []
    this.pressId = ''
    this.pressAt = 0
    this.bg = null
    this.bgKey = ''
    this.bgCtx = null
    this.hint = null
    this.simOpen = false
    this.fx = { catchGlow: 0 }

    this._layout()
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

    const hudH = short ? 82 : 92
    const hudY = safeTop + 5
    const hudBottom = hudY + hudH
    const fieldTop = hudBottom + 12
    const widthPct = Number(this.cfg.get('basketWidthPct')) || 22
    const basketHalfW = clamp((W * widthPct) / 200, W * 0.06, W * 0.20)
    // 篮体高 ≈ 0.96 半宽（与 fruits.drawBasket 一致），再留一点投影空间。
    // 之前 rimY 只按固定 52px 上抬，导致篮体下半截被底部按钮压住，视觉上像个"盘子"。
    const basketH = basketHalfW * 0.96 + 10
    const groundY = H - (short ? 62 : 76)
    const rimY = groundY - basketH

    this.L = {
      W: W,
      H: H,
      short: short,
      safeTop: safeTop,
      cx: W * 0.5,
      hudY: hudY,
      hudH: hudH,
      hudBottom: hudBottom,
      fieldTop: fieldTop,
      fieldH: Math.max(120, rimY - fieldTop),
      groundY: groundY,
      rimY: rimY,
      catchLine: 1,
      basketHalfW: basketHalfW,
      btnY: H - (short ? 46 : 52),
      btnH: short ? 38 : 42,
      horizonY: H * (short ? 0.5 : 0.52),
      fruitScale: W / DESIGN_WIDTH
    }

    // 花粉 / 浮尘：尺寸变化时重建一次，每帧只读
    this.dust = depth.buildDust(W, H, fieldTop, groundY + 24, 26, 5)
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

  // ================================================================ 背景
  _drawBackground() {
    const ctx = this.ctx
    const key = this.W + 'x' + this.H + '@' + this.dpr
    if (this.bg && this.bgKey === key) {
      // 必须显式给目标尺寸：离屏画布是设备像素尺寸，直接 drawImage(bg,0,0)
      // 会在 dpr 变换下被放大 dpr 倍，导致中景和草地被顶出画面
      ctx.drawImage(this.bg, 0, 0, this.W, this.H)
      return
    }
    this.bgKey = key
    // 离屏缓存：静态背景每帧重绘在低端机上会掉帧
    let off = null
    try {
      if (wx.createOffscreenCanvas) {
        off = wx.createOffscreenCanvas({
          type: '2d',
          width: Math.round(this.W * this.dpr),
          height: Math.round(this.H * this.dpr)
        })
      }
    } catch (e) {
      off = null
    }

    if (off && off.getContext) {
      const g = off.getContext('2d')
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
      this.bgCtx = g
      this._paintSky(g)
      this.bgCtx = null
      this.bg = off
      ctx.drawImage(off, 0, 0, this.W, this.H)
    } else {
      // 兜底：没有离屏画布时直接画在主画布上
      this.bgCtx = null
      this._paintSky(ctx)
      this.bg = null
    }
  }

  _paintSky(g) {
    const L = this.L
    const W = L.W
    const H = L.H
    const hz = L.horizonY

    // 天空
    const sky = g.createLinearGradient(0, 0, 0, hz + H * 0.08)
    sky.addColorStop(0, SKY.top)
    sky.addColorStop(0.55, SKY.mid)
    sky.addColorStop(0.86, SKY.low)
    sky.addColorStop(1, SKY.horizon)
    g.fillStyle = sky
    g.fillRect(0, 0, W, hz + H * 0.1)

    // 右上角柔光（太阳）
    const sunX = W * 0.82
    const sunY = hz * 0.22
    const sun = g.createRadialGradient(sunX, sunY, 4, sunX, sunY, W * 0.55)
    sun.addColorStop(0, SKY.sun)
    sun.addColorStop(0.35, 'rgba(255,248,220,0.34)')
    sun.addColorStop(1, 'rgba(255,248,220,0)')
    g.fillStyle = sun
    g.fillRect(0, 0, W, hz)

    // 第二层日晕：把右上角的天空撑起来，不那么平
    const halo = g.createRadialGradient(sunX, sunY, W * 0.10, sunX, sunY, W * 0.78)
    halo.addColorStop(0, 'rgba(255,250,226,0.20)')
    halo.addColorStop(0.6, 'rgba(255,250,226,0.06)')
    halo.addColorStop(1, 'rgba(255,250,226,0)')
    g.fillStyle = halo
    g.fillRect(0, 0, W, hz)

    // 云（烘焙进背景，静态不动）
    this._drawClouds(g, true)

    // 远处几只小鸟：两笔小弧，很轻，但有"活的"感觉
    g.save()
    g.lineCap = 'round'
    g.strokeStyle = 'rgba(74,104,92,0.34)'
    const birds = [[0.62, 0.14, 8, 1.3], [0.69, 0.105, 6, 1.1], [0.575, 0.175, 5, 0.9]]
    birds.forEach((b) => {
      const bx = W * b[0]
      const by = hz * b[1]
      const sp = b[2]
      g.lineWidth = b[3]
      g.beginPath()
      g.moveTo(bx - sp, by)
      g.quadraticCurveTo(bx - sp * 0.5, by - sp * 0.62, bx, by)
      g.quadraticCurveTo(bx + sp * 0.5, by - sp * 0.62, bx + sp, by)
      g.stroke()
    })
    g.restore()

    // 最远一层山脊：只做层次、不做细节，颜色贴近天空（大气透视）
    depth.ridge(g, {
      w: W,
      hz: hz,
      bands: [
        { amp: 0.24, rise: 0.02, freq: 3.6, alpha: 0.46, color: '150,186,208', seed: 0.8 }
      ]
    })

    // 地平线大气光：只在中间亮、两端淡出。
    // ⚠️ 不能用全宽纵向渐变 —— 那等于给屏幕画一条水位线，把山脊全切断。
    depth.haze(g, {
      cx: W * 0.5,
      y: hz + 1,
      rx: W * 0.76,
      ry: 0.095,
      color: '255,247,219',
      alpha: 0.34,
      lineAlpha: 0.16,
      w: W * 1.15
    })

    // 远山两层
    this._paintHills(g)

    // 果园树列
    this._paintTrees(g)

    // 草地 + 透视车道
    this._paintField(g)

    // 底部远景压暗，让底栏更清楚
    const foot = g.createLinearGradient(0, H * 0.86, 0, H)
    foot.addColorStop(0, 'rgba(48,84,48,0)')
    foot.addColorStop(1, 'rgba(38,68,42,0.18)')
    g.fillStyle = foot
    g.fillRect(0, H * 0.86, W, H * 0.14)
  }

  _drawClouds(g, baked) {
    const W = this.W
    const H = this.H
    const hz = this.L.horizonY
    const ctx = g || this.ctx
    const clouds = [
      { x: 0.16, y: 0.12, s: 0.9, a: 0.92 },
      { x: 0.62, y: 0.075, s: 0.66, a: 0.8 },
      { x: 0.88, y: 0.19, s: 0.5, a: 0.66 },
      { x: 0.36, y: 0.26, s: 0.42, a: 0.5 }
    ]
    ctx.save()
    clouds.forEach((c, ci) => {
      const drift = baked ? 0 : Math.sin(this.clock * 0.06 + ci) * 4
      const cx = W * c.x + drift
      const cy = hz * c.y * 2.6
      const r = W * 0.13 * c.s
      ctx.globalAlpha = c.a
      const puffs = [
        [-1.1, 0.22, 0.62], [-0.4, -0.1, 0.86], [0.35, 0.02, 0.74],
        [1.0, 0.26, 0.54], [0.05, 0.3, 0.68]
      ]
      puffs.forEach((p) => {
        const grd = ctx.createRadialGradient(
          cx + p[0] * r, cy + p[1] * r, r * 0.1,
          cx + p[0] * r, cy + p[1] * r, r * p[2]
        )
        grd.addColorStop(0, 'rgba(255,255,255,0.96)')
        grd.addColorStop(0.72, 'rgba(255,255,255,0.72)')
        grd.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = grd
        ellipse(ctx, cx + p[0] * r, cy + p[1] * r, r * p[2], r * p[2] * 0.78)
        ctx.fill()
      })
    })
    ctx.restore()
  }

  _paintHills(g) {
    const L = this.L
    const W = L.W
    const H = L.H
    const hz = L.horizonY

    // 远山：淡蓝绿，起伏很缓
    g.beginPath()
    g.moveTo(0, hz + 6)
    g.lineTo(0, hz - H * 0.055)
    g.bezierCurveTo(W * 0.16, hz - H * 0.1, W * 0.3, hz - H * 0.035, W * 0.44, hz - H * 0.06)
    g.bezierCurveTo(W * 0.6, hz - H * 0.088, W * 0.72, hz - H * 0.02, W * 0.86, hz - H * 0.048)
    g.bezierCurveTo(W * 0.94, hz - H * 0.062, W * 0.98, hz - H * 0.04, W, hz - H * 0.042)
    g.lineTo(W, hz + 6)
    g.closePath()
    g.fillStyle = SKY.hillFar
    g.globalAlpha = 0.62
    g.fill()
    g.globalAlpha = 1

    // 中景丘陵
    g.beginPath()
    g.moveTo(0, hz + 10)
    g.lineTo(0, hz - H * 0.012)
    g.bezierCurveTo(W * 0.18, hz - H * 0.05, W * 0.34, hz + H * 0.004, W * 0.52, hz - H * 0.016)
    g.bezierCurveTo(W * 0.7, hz - H * 0.038, W * 0.84, hz + H * 0.006, W, hz - H * 0.008)
    g.lineTo(W, hz + 10)
    g.closePath()
    g.fillStyle = SKY.hillMid
    g.globalAlpha = 0.72
    g.fill()
    g.globalAlpha = 1
  }

  _paintTrees(g) {
    const L = this.L
    const W = L.W
    const H = L.H
    const hz = L.horizonY

    // 近处果园树列：固定位置（场景结构不变，保证训练可重复）
    const rows = [
      { y: hz + H * 0.012, scale: 0.62, alpha: 0.5, xs: [0.04, 0.13, 0.22, 0.3, 0.72, 0.8, 0.89, 0.97] },
      { y: hz + H * 0.055, scale: 0.96, alpha: 0.85, xs: [0.02, 0.115, 0.235, 0.785, 0.895, 0.98] }
    ]

    rows.forEach((row) => {
      row.xs.forEach((fx, i) => {
        const x = W * fx
        const s = row.scale * (0.86 + hash(i, row.scale * 10) * 0.3)
        this._tree(g, x, row.y, W * 0.062 * s, s, row.alpha, i + Math.round(row.scale * 10))
      })
    })

    // 地平线两侧的矮灌木：补一层景深，别让草地和山之间空着
    const bush = (bx, by, r, a) => {
      g.save()
      g.globalAlpha = a
      const grd = g.createRadialGradient(bx - r * 0.3, by - r * 0.4, r * 0.1, bx, by, r)
      grd.addColorStop(0, '#8CC079')
      grd.addColorStop(1, '#5C8F52')
      g.fillStyle = grd
      ;[[-0.7, 0.1, 0.62], [0, -0.1, 0.8], [0.72, 0.12, 0.58]].forEach((p) => {
        ellipse(g, bx + p[0] * r, by + p[1] * r, r * p[2], r * p[2] * 0.78)
        g.fill()
      })
      g.restore()
    }
    bush(W * 0.10, hz + H * 0.052, W * 0.045, 0.9)
    bush(W * 0.90, hz + H * 0.060, W * 0.052, 0.9)
    bush(W * 0.045, hz + H * 0.072, W * 0.034, 0.75)

    // 树列下的暗色地被（树根附近），增加层次
    const belt = g.createLinearGradient(0, hz - 2, 0, hz + H * 0.13)
    belt.addColorStop(0, 'rgba(96,140,86,0.22)')
    belt.addColorStop(1, 'rgba(96,140,86,0)')
    g.fillStyle = belt
    g.fillRect(0, hz - 2, W, H * 0.13)
  }

  _tree(g, x, baseY, r, s, alpha, seed) {
    g.save()
    g.globalAlpha = alpha
    // 树干
    g.beginPath()
    g.moveTo(x - r * 0.09, baseY)
    g.lineTo(x - r * 0.055, baseY - r * 1.25)
    g.lineTo(x + r * 0.055, baseY - r * 1.25)
    g.lineTo(x + r * 0.09, baseY)
    g.closePath()
    g.fillStyle = SKY.trunk
    g.fill()

    // 树冠：3~4 个叠加圆，上亮下暗
    const cy = baseY - r * 1.72
    const puffs = [
      [-0.62, 0.1, 0.62], [0.6, 0.06, 0.6], [-0.05, -0.42, 0.68], [0.02, 0.16, 0.78]
    ]
    puffs.forEach((p, i) => {
      const px = x + p[0] * r
      const py = cy + p[1] * r
      const pr = r * p[2]
      const grd = g.createRadialGradient(px - pr * 0.3, py - pr * 0.35, pr * 0.1, px, py, pr)
      grd.addColorStop(0, i === 2 ? SKY.treeLight : SKY.treeMid)
      grd.addColorStop(1, SKY.treeDark)
      g.fillStyle = grd
      ellipse(g, px, py, pr, pr * 0.92)
      g.fill()
    })

    // 果子点缀
    g.globalAlpha = alpha * 0.9
    g.fillStyle = '#E2694F'
    for (let i = 0; i < 3; i++) {
      const a = hash(i + 3, seed) * Math.PI * 2
      const rr2 = r * (0.35 + hash(i + 9, seed) * 0.34)
      g.beginPath()
      g.arc(x + Math.cos(a) * rr2, cy + Math.sin(a) * rr2 * 0.8, Math.max(1, r * 0.055), 0, Math.PI * 2)
      g.fill()
    }
    g.restore()

    // 影子
    g.save()
    g.globalAlpha = alpha * 0.16
    ellipse(g, x, baseY + r * 0.02, r * 0.8, r * 0.14)
    g.fillStyle = '#33562F'
    g.fill()
    g.restore()
  }

  _paintField(g) {
    const L = this.L
    const W = L.W
    const H = L.H
    const hz = L.horizonY

    const grass = g.createLinearGradient(0, hz, 0, H)
    grass.addColorStop(0, SKY.grassFar)
    grass.addColorStop(0.45, SKY.grassMid)
    grass.addColorStop(1, SKY.grassNear)
    g.fillStyle = grass
    g.beginPath()
    g.moveTo(0, hz)
    g.lineTo(W, hz)
    g.lineTo(W, H)
    g.lineTo(0, H)
    g.closePath()
    g.fill()

    // 空气透视：靠地平线的一带融进天色。
    // 少了这一层，草地就是一块从下到上一样绿的色块 —— 有透视也没纵深。
    const air = g.createLinearGradient(0, hz, 0, hz + (H - hz) * 0.30)
    air.addColorStop(0, 'rgba(246,247,228,0.62)')
    air.addColorStop(0.45, 'rgba(240,246,222,0.24)')
    air.addColorStop(1, 'rgba(240,246,222,0)')
    g.fillStyle = air
    g.fillRect(0, hz, W, (H - hz) * 0.30)

    // 中间一块柔和阳光斑：让接取区亮一点，画面有中心
    const pool = g.createRadialGradient(W * 0.5, hz + (H - hz) * 0.55, 10,
      W * 0.5, hz + (H - hz) * 0.55, W * 0.62)
    pool.addColorStop(0, 'rgba(255,252,214,0.30)')
    pool.addColorStop(0.55, 'rgba(255,252,214,0.10)')
    pool.addColorStop(1, 'rgba(255,252,214,0)')
    g.fillStyle = pool
    g.fillRect(0, hz, W, H - hz)

    // 透视地块：横线按 y = hz + floorH / u 分布（越远越密），纵线从消失点放射。
    // 这是草地「有纵深」的唯一凭据 —— 之前用 pow(t,1.9) 手调，近处过密、远处全糊在一起。
    // 隔带填色做出割草条纹，绿色比地面略深，只负责「这是一片地」。
    depth.perspectiveFloor(g, {
      w: W,
      h: H,
      hz: hz,
      cx: W * 0.5,
      rows: 9,
      cols: 5,
      spread: 0.30,
      topSpread: 0.05,
      color: '72,104,58',
      farAlpha: 0.055,
      nearAlpha: 0.17,
      stripe: { color: '52,90,46', alpha: 0.075 },
      lineWidth: 1
    })

    // 细草纹理：草叶必须按远近换尺寸，否则一片"等大的短线"等于噪点。
    // 近处大、深、密，远处小、淡、疏 —— 这是最便宜的纵深线索之一。
    g.save()
    g.lineCap = 'round'
    for (let i = 0; i < 150; i++) {
      const gx = W * hash(i, 42)
      const gy = hz + Math.pow(hash(i, 43), 0.62) * (H - hz) * 0.95
      const d = depth.depthT(gy, hz, H)
      const len = (1.2 + hash(i, 44) * 4.2) * (0.55 + d * 1.35)
      const lean = (hash(i, 47) - 0.5) * len * 0.7
      g.lineWidth = (0.6 + hash(i, 45) * 0.7) * (0.7 + d * 0.9)
      g.strokeStyle = 'rgba(' + (d > 0.5 ? '66,102,52' : '104,140,84') + ',' +
        (0.07 + hash(i, 46) * 0.10 * (0.5 + d)).toFixed(3) + ')'
      g.beginPath()
      g.moveTo(gx, gy)
      g.quadraticCurveTo(gx + lean * 0.5, gy - len * 0.6, gx + lean, gy - len)
      g.stroke()
    }
    g.restore()

    // 草地上的小花：只在左右两侧，避开中间接取区
    const flower = (fx, fy, r, petal) => {
      g.fillStyle = petal
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2
        g.beginPath()
        g.ellipse(fx + Math.cos(a) * r * 0.9, fy + Math.sin(a) * r * 0.9,
          r * 0.66, r * 0.5, a, 0, Math.PI * 2)
        g.fill()
      }
      g.fillStyle = '#F7D06B'
      g.beginPath()
      g.arc(fx, fy, r * 0.44, 0, Math.PI * 2)
      g.fill()
    }
    const petals = ['rgba(255,255,255,0.94)', 'rgba(255,216,228,0.94)', 'rgba(255,238,190,0.94)']
    for (let i = 0; i < 9; i++) {
      const left = i < 5
      const fx = left ? W * (0.045 + i * 0.043) : W * (0.755 + (i - 5) * 0.052)
      const fy = H * (0.70 + hash(i, 31) * 0.15)
      flower(fx, fy, 2.2 + hash(i, 32) * 1.5, petals[i % 3])
    }

    // 远处草地上的暖光（夕阳方向）
    const glow = g.createRadialGradient(W * 0.8, hz + H * 0.02, 4, W * 0.8, hz + H * 0.02, W * 0.7)
    glow.addColorStop(0, 'rgba(255,250,215,0.35)')
    glow.addColorStop(1, 'rgba(255,250,215,0)')
    g.fillStyle = glow
    g.fillRect(0, hz - 6, W, H - hz)

    // 前景草叶（左右下角，避开中间接取区）
    g.save()
    g.globalAlpha = 0.4
    g.strokeStyle = '#7FA85F'
    g.lineWidth = 2
    for (let i = 0; i < 7; i++) {
      const bx = i < 4 ? W * (0.02 + i * 0.035) : W * (0.86 + (i - 4) * 0.033)
      const by = H - 4 - hash(i, 7) * 10
      const hgt = 12 + hash(i, 3) * 18
      g.beginPath()
      g.moveTo(bx, by)
      g.quadraticCurveTo(bx + (i % 2 ? 3 : -3), by - hgt * 0.6, bx + (i % 2 ? 7 : -7), by - hgt)
      g.stroke()
    }
    g.restore()
  }

  // ================================================================ 世界
  _drawWorld(vm, screen) {
    const ctx = this.ctx
    const L = this.L
    const W = L.W
    const H = L.H

    // 中央柔和光柱：让水果在复杂背景上更清楚（不改变水果颜色）
    const beam = ctx.createLinearGradient(0, L.fieldTop, 0, L.groundY)
    beam.addColorStop(0, 'rgba(255,255,255,0.16)')
    beam.addColorStop(0.55, 'rgba(255,255,255,0.07)')
    beam.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = beam
    ctx.fillRect(W * 0.14, L.fieldTop, W * 0.72, L.groundY - L.fieldTop)

    // 花粉 / 浮尘：贴着草地缓慢上浮。便宜（26 个小圆），但画面立刻有「空气」
    if (this.dust) {
      depth.drawDust(ctx, this.dust, this.clock, {
        top: L.fieldTop,
        bottom: L.groundY + 24,
        color: '255,252,214',
        alpha: 0.6
      })
    }

    // 两只小蝴蝶：贴着两侧花丛轻轻飞（纯装饰，低不透明度，不抢水果）
    if (screen === 'play' || screen === 'countdown') {
      for (let i = 0; i < 2; i++) {
        const t = this.clock * (0.30 + i * 0.1) + i * 2.2
        const bx = W * (i === 0 ? 0.13 : 0.87) + Math.sin(t) * W * 0.055
        const by = L.fieldTop + (L.groundY - L.fieldTop) * (0.66 + 0.10 * Math.sin(t * 0.8 + i))
        const flap = 0.35 + Math.abs(Math.sin(this.clock * 5.5 + i)) * 0.65
        ctx.save()
        ctx.globalAlpha = 0.55
        ctx.translate(bx, by)
        ctx.fillStyle = i === 0 ? 'rgba(255,205,110,0.95)' : 'rgba(255,175,196,0.95)'
        ctx.beginPath()
        ctx.ellipse(-3.4, -1.2, 3.8 * flap, 2.7, -0.42, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.ellipse(3.4, -1.2, 3.8 * flap, 2.7, 0.42, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(96,68,40,0.9)'
        ctx.beginPath()
        ctx.ellipse(0, 0, 1.1, 2.3, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    }

    // 果篮脚下的暗影要跟着篮子走，否则篮子一动就像在"滑冰"
    const bx = vm.basket ? clamp(vm.basket.x, 0, 1) : 0.5
    depth.softShadow(ctx, bx * W, L.groundY + 2, L.basketHalfW * 1.55, 9, 0.30, '44,72,40')

    // 水果（先画，被篮口覆盖）
    this._drawFruits(vm)
    // 最低水果的落点引导线：让"把果篮移过去"这件事看得明白
    if (screen === 'play') this._drawAimGuide(vm)

    // 果篮
    if (screen !== 'result') this._drawBasket(vm)

    // 粒子与飘字
    this._drawFx(vm)

    // 屏幕边缘暗角：环境绿而不是纯黑，纯黑在暖色草地上会发脏
    depth.vignette(ctx, { w: W, h: H, color: '32,60,40', alpha: 0.17, cy: 0.55, inner: 0.40, outer: 0.98 })
  }

  _fruitPx(f) {
    const L = this.L
    return {
      x: f.x * L.W,
      y: L.fieldTop + f.y * L.fieldH
    }
  }

  _fruitRadius(type) {
    const t = FRUIT_TYPES.find((it) => it.id === type) || FRUIT_TYPES[0]
    return t.r * this.L.fruitScale
  }

  _drawFruits(vm) {
    const ctx = this.ctx
    const L = this.L
    const anim = vm.catchAnimSec || 0.36
    const fruits = vm.fruits || []
    const basketX = vm.basket ? vm.basket.x : 0.5

    for (let i = 0; i < fruits.length; i++) {
      const f = fruits[i]
      const r0 = this._fruitRadius(f.type)
      const p = this._fruitPx(f)

      if (f.state === 'caught') {
        // 入篮动画：从接住点滑到篮口中心，缩小并淡出（篮子随后覆盖它）
        const age = clamp((this.engine.t - f.caughtAt) / anim, 0, 1)
        const ease = age * age * (3 - 2 * age)
        const fromX = (f.catchFromX !== undefined ? f.catchFromX : f.x) * L.W
        const toX = basketX * L.W
        const fromY = L.fieldTop + L.catchLine * L.fieldH
        const toY = L.fieldTop + (L.catchLine + 0.1) * L.fieldH
        const x = lerp(fromX, toX, ease)
        const y = lerp(fromY, toY, ease)
        const r = r0 * (1 - ease * 0.42)
        drawFruit(ctx, f.type, x, y, r, f.rot + ease * 1.6, { alpha: 1 - ease * 0.55 })
        continue
      }

      if (f.state === 'missed') {
        // 漏接：继续下落 + 缩小 + 淡出，落地即消失（不做抖动或红屏）
        const t = clamp((f.y - 1) / 0.3, 0, 1)
        drawFruit(ctx, f.type, p.x, p.y, r0 * (1 - t * 0.28), f.rot, { alpha: (1 - t) * 0.85 })
        continue
      }

      // 正常下落：远端略小（纵深感），落地时恢复实际大小
      const depthScale = 0.74 + 0.26 * clamp(f.y, 0, 1)
      // 地面投影：投在篮口那一层地面上，越接近越深、越小
      // （原来只是贴在水果下沿的一小条，看不出高度）
      if (f.y > 0.42) {
        const k = clamp((f.y - 0.42) / 0.58, 0, 1)
        const sw = r0 * (1.05 - k * 0.42)
        ctx.save()
        ctx.globalAlpha = 0.08 + k * 0.16
        ellipse(ctx, p.x, L.rimY + 3, sw, sw * 0.26)
        ctx.fillStyle = '#2C4A22'
        ctx.fill()
        ctx.restore()
      }
      // 离开背景：先铺一层向右下的软投影，水果才「浮」在草地上而不是贴上去
      depth.softShadow(ctx, p.x + r0 * 0.14, p.y + r0 * 0.18,
        r0 * 0.95, r0 * 0.78, 0.13, '46,74,42')
      drawFruit(ctx, f.type, p.x, p.y, r0 * depthScale, f.rot)
    }
  }

  _drawBasket(vm) {
    const ctx = this.ctx
    const L = this.L
    const b = vm.basket || { x: 0.5, tilt: 0, squash: 0, flash: 0 }
    const halfW = L.basketHalfW
    const x = b.x * L.W
    const aligned = !!vm.aligned
    const alpha = 1 - (vm.missFlash || 0) * 0.12

    // 漏接时的柔和扩散环（温和反馈，不闪屏）
    if ((vm.missFlash || 0) > 0.02) {
      const t = 1 - vm.missFlash
      ctx.save()
      ctx.globalAlpha = (vm.missFlash || 0) * 0.35
      ellipse(ctx, x, L.rimY, halfW * (1.2 + t * 0.9), halfW * (0.3 + t * 0.2))
      ctx.lineWidth = 2
      ctx.strokeStyle = C.amber
      ctx.stroke()
      ctx.restore()
    }

    // 已经对准水果：篮口亮一圈，作为"可以接了"的即时反馈
    ctx.save()
    ctx.globalAlpha = aligned ? 0.62 : 0.26
    const g = ctx.createRadialGradient(x, L.rimY, halfW * 0.2, x, L.rimY, halfW * 1.5)
    g.addColorStop(0, aligned ? 'rgba(63,195,176,0.5)' : 'rgba(255,255,255,0.3)')
    g.addColorStop(1, 'rgba(63,195,176,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(x, L.rimY, halfW * 1.5, halfW * 0.9, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    drawBasket(ctx, x, L.rimY, halfW, {
      tilt: b.tilt,
      squash: b.squash,
      flash: b.flash,
      alpha: alpha
    })
  }

  /** 最低水果的落点引导：虚线 + 篮口高度上的落点标记 */
  _drawAimGuide(vm) {
    const ctx = this.ctx
    const L = this.L
    const fruits = vm.fruits || []
    let target = null
    for (let i = 0; i < fruits.length; i++) {
      const f = fruits[i]
      if (f.state !== 'fall' || f.y >= L.catchLine) continue
      if (!target || f.y > target.y) target = f
    }
    if (!target) return
    const p = this._fruitPx(target)
    const r = this._fruitRadius(target.type)
    if (p.y + r * 0.5 >= L.rimY) return
    const aligned = !!vm.aligned

    ctx.save()
    ctx.globalAlpha = aligned ? 0.32 : 0.18
    ctx.setLineDash([5, 7])
    ctx.lineWidth = 1.5
    ctx.strokeStyle = aligned ? '#0F9C8C' : '#FFFFFF'
    ctx.beginPath()
    ctx.moveTo(p.x, p.y + r * 0.7)
    ctx.lineTo(p.x, L.rimY + 1)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.globalAlpha = aligned ? 0.65 : 0.34
    ctx.beginPath()
    ctx.ellipse(p.x, L.rimY + 1, L.basketHalfW * 0.6, 5, 0, 0, Math.PI * 2)
    ctx.lineWidth = 1.8
    ctx.strokeStyle = aligned ? '#0F9C8C' : 'rgba(255,255,255,0.95)'
    ctx.stroke()
    ctx.restore()
  }

  _drawFx(vm) {
    const ctx = this.ctx
    const L = this.L
    const t = this.engine.t

    // 粒子：从接住点向外溅开的果肉/叶子
    const bursts = vm.bursts || []
    for (let bi = 0; bi < bursts.length; bi++) {
      const b = bursts[bi]
      const age = t - b.at
      if (age < 0 || age > 1.1) continue
      const bx = b.x * L.W
      // 稍微抬到篮口上方：不然粒子会在篮口正中拖出一个小圆点，看起来像篮子里贴了个点
      const by = L.fieldTop + L.catchLine * L.fieldH - 12
      const k = clamp(age / 0.7, 0, 1)
      const alpha = 1 - k
      const color = this._fruitColor(b.type)
      ctx.save()
      for (let i = 0; i < 9; i++) {
        const a = hash(i, b.seed) * Math.PI * 2
        const sp = (46 + hash(i + 20, b.seed) * 96) * (1 - k * 0.55)
        const px = bx + Math.cos(a) * sp * age
        const py = by + Math.sin(a) * sp * age + 210 * age * age
        const pr = Math.max(0.8, (2.4 + hash(i + 40, b.seed) * 3) * (1 - k * 0.7))
        ctx.globalAlpha = alpha * 0.9
        ctx.fillStyle = i % 3 === 0 ? '#FFFFFF' : color
        ctx.beginPath()
        ctx.arc(px, py, pr, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }

    // 得分飘字
    const pops = vm.pops || []
    for (let i = 0; i < pops.length; i++) {
      const p = pops[i]
      const age = t - p.at
      if (age < 0 || age > 1.2) continue
      const k = clamp(age / 1, 0, 1)
      const alpha = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4)
      const x = p.x * L.W
      const y = L.fieldTop + L.catchLine * L.fieldH - 18 - k * 46
      const scale = 1 + Math.max(0, 0.22 - k) * 2.2
      ctx.save()
      ctx.globalAlpha = clamp(alpha, 0, 1)
      ctx.translate(x, y)
      ctx.scale(scale, scale)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = '800 20px "PingFang SC", "Helvetica Neue", Helvetica, Arial, sans-serif'
      ctx.lineWidth = 4
      ctx.strokeStyle = 'rgba(255,255,255,0.92)'
      ctx.strokeText(p.text, 0, 0)
      ctx.fillStyle = p.combo >= 3 ? C.amberDeep : C.tealDeep
      ctx.fillText(p.text, 0, 0)
      if (p.mul && p.mul > 1.05) {
        ctx.font = '700 10px "PingFang SC", "Helvetica Neue", Helvetica, Arial, sans-serif'
        ctx.lineWidth = 3
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'
        ctx.strokeText('x' + p.mul.toFixed(2), 0, 16)
        ctx.fillStyle = C.amberDeep
        ctx.fillText('x' + p.mul.toFixed(2), 0, 16)
      }
      ctx.restore()
    }
  }

  _fruitColor(type) {
    if (type === 'orange') return '#F59A28'
    if (type === 'banana') return '#FFCE3A'
    if (type === 'strawberry') return '#E93B4E'
    if (type === 'watermelon') return '#EF4A55'
    return '#DE3B31'
  }

  // ================================================================ HUD
  _drawHud(vm) {
    const ctx = this.ctx
    const L = this.L
    const W = L.W
    const x = 12
    const y = L.hudY
    const w = W - 24
    const h = L.hudH
    const short = L.short

    // 卡片：白底 + 柔和投影
    ctx.save()
    ctx.shadowColor = 'rgba(16,48,32,0.18)'
    ctx.shadowBlur = 20
    ctx.shadowOffsetY = 6
    rr(ctx, x, y, w, h, 20)
    ctx.fillStyle = 'rgba(255,255,255,0.97)'
    ctx.fill()
    ctx.restore()
    rr(ctx, x, y, w, h, 20)
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.stroke()

    // 顶部细彩条（果园三色：嫩绿 / 蜜黄 / 杏橙）
    const topBar = ctx.createLinearGradient(x + 16, 0, x + w - 16, 0)
    topBar.addColorStop(0, '#7ED3B6')
    topBar.addColorStop(0.55, '#F3C96B')
    topBar.addColorStop(1, '#F2A07C')
    rr(ctx, x + 16, y + 2, w - 32, 3, 1.5)
    ctx.fillStyle = topBar
    ctx.fill()

    // ---- 第一行：得分（左） / 连击（中） / 剩余（右） ----
    const labelY = y + (short ? 20 : 22)
    const numBase = y + (short ? 46 : 52)
    const scoreStr = String(Math.round(vm.score))
    this._text('得分', x + 16, labelY, { size: 9.5, weight: '700', color: C.inkMute })
    this._text(scoreStr, x + 15, numBase, { size: short ? 26 : 30, weight: '800', color: C.ink })

    const lowTime = vm.timeLeft <= 10
    this._text('剩余', x + w - 16, labelY, {
      size: 9.5, weight: '700', color: C.inkMute, align: 'right'
    })
    this._text(vm.timeLeftText, x + w - 15, numBase - (short ? 2 : 3), {
      size: short ? 20 : 23, weight: '800', color: lowTime ? C.danger : C.ink, align: 'right'
    })

    // 连击：放中间，出现时轻微弹出，跟分数 / 时间同一行
    const combo = vm.combo || 0
    const ccx = x + w * 0.5
    const ccy = y + (short ? 33 : 37)
    if (combo >= 2) {
      const pop = 1 + Math.max(0, 0.16 - (vm.comboFlash || 0) * 0.16)
      const label = '连击 ' + combo + (vm.comboMul > 1.02 ? '  x' + vm.comboMul.toFixed(1) : '')
      const cw = this._measure(label, 10.5, '700') + 20
      ctx.save()
      ctx.translate(ccx, ccy)
      ctx.scale(pop, pop)
      ctx.shadowColor = 'rgba(222,142,28,0.35)'
      ctx.shadowBlur = 8
      ctx.shadowOffsetY = 2
      rr(ctx, -cw / 2, -10, cw, 21, 10.5)
      const g = ctx.createLinearGradient(0, -10, 0, 11)
      g.addColorStop(0, '#F7C566')
      g.addColorStop(1, '#E39425')
      ctx.fillStyle = g
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.shadowOffsetY = 0
      this._text(label, 0, 3.6, { size: 10.5, weight: '700', color: '#FFFFFF', align: 'center' })
      ctx.restore()
    } else {
      this._text('连击 —', ccx, ccy + 3.4, {
        size: 9, weight: '600', color: 'rgba(21,45,34,0.22)', align: 'center'
      })
    }

    // ---- 分割线 ----
    const divY = y + (short ? 55 : 62)
    ctx.beginPath()
    ctx.moveTo(x + 16, divY)
    ctx.lineTo(x + w - 16, divY)
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(21,45,34,0.08)'
    ctx.stroke()

    // ---- 第二行：接住 / 漏接 / 命中 ----
    const statY = y + (short ? 70 : 79)
    const judged = (vm.hits || 0) + (vm.misses || 0)
    const acc = judged > 0 ? clamp(vm.accuracy || 0, 0, 1) : null
    const cols = [
      { k: '接住', v: String(vm.hits || 0), c: C.teal },
      { k: '漏接', v: String(vm.misses || 0), c: C.amber },
      {
        k: '命中',
        v: acc === null ? '—' : Math.round(acc * 100) + '%',
        c: acc === null ? C.inkMute : (acc >= 0.6 ? C.teal : C.amber)
      }
    ]
    const colW = (w - 32) / 3
    cols.forEach((c, i) => {
      const cx0 = x + 16 + colW * i
      this._dot(cx0 + 3, statY - 3.2, 3, c.c)
      this._text(c.k, cx0 + 11, statY, { size: 9, weight: '600', color: C.inkMute })
      const kw = this._measure(c.k, 9, '600')
      this._text(c.v, cx0 + 11 + kw + 5, statY, { size: 11, weight: '800', color: C.ink })
      if (i < 2) {
        ctx.beginPath()
        ctx.moveTo(cx0 + colW - 9, statY - 9)
        ctx.lineTo(cx0 + colW - 9, statY + 3)
        ctx.lineWidth = 1
        ctx.strokeStyle = 'rgba(21,45,34,0.07)'
        ctx.stroke()
      }
    })

    // ---- 进度条 ----
    const ratio = clamp(vm.timeLeft / Math.max(1, vm.plannedSec), 0, 1)
    const barX = x + 16
    const barW = w - 32
    const barY = y + h - 9
    rr(ctx, barX, barY, barW, 4, 2)
    ctx.fillStyle = 'rgba(21,45,34,0.08)'
    ctx.fill()
    if (ratio > 0.01) {
      const pg = ctx.createLinearGradient(barX, 0, barX + barW, 0)
      pg.addColorStop(0, '#43C7B0')
      pg.addColorStop(1, lowTime ? '#DF5540' : '#9BDC8F')
      rr(ctx, barX, barY, Math.max(4, barW * ratio), 4, 2)
      ctx.fillStyle = pg
      ctx.fill()
    }

    this._drawBottomBar(vm)
  }

  _drawBottomBar(vm) {
    const ctx = this.ctx
    const L = this.L
    const W = L.W
    const by = L.btnY
    const bh = L.btnH
    const bw = Math.min(84, W * 0.22)

    this._button('pause', 12, by, bw, bh, vm.state === 'PAUSED' ? '继续' : '暂停', {
      variant: 'glass', icon: vm.state === 'PAUSED' ? 'play' : 'pause', size: 12
    })
    this._button('quit', W - 12 - bw, by, bw, bh, '结束', {
      variant: 'glass', icon: 'exit', size: 12
    })

    // 果篮位置条：身体左右倾 → 这里的小圆点就是篮子位置
    const basketX = clamp(vm.basket ? vm.basket.x : 0.5, 0, 1)
    const x0 = 12 + bw + 12
    const x1 = W - 12 - bw - 12
    const pillW = Math.max(40, x1 - x0)
    const pillH = Math.min(30, bh)
    const pillY = by + (bh - pillH) / 2

    ctx.save()
    ctx.shadowColor = 'rgba(16,48,32,0.12)'
    ctx.shadowBlur = 10
    ctx.shadowOffsetY = 3
    rr(ctx, x0, pillY, pillW, pillH, pillH / 2)
    ctx.fillStyle = 'rgba(255,255,255,0.94)'
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0

    const trackX0 = x0 + 14
    const trackX1 = x0 + pillW - 30
    const trackW = Math.max(20, trackX1 - trackX0)
    const ty = pillY + pillH / 2

    // 轨道
    rr(ctx, trackX0, ty - 2.5, trackW, 5, 2.5)
    ctx.fillStyle = 'rgba(21,45,34,0.09)'
    ctx.fill()

    // 三段刻度：左 / 中 / 右
    for (let i = 0; i < 3; i++) {
      const tx = trackX0 + trackW * (i / 2)
      ctx.fillStyle = i === 1 ? 'rgba(21,45,34,0.28)' : 'rgba(21,45,34,0.16)'
      ctx.fillRect(tx - 0.6, ty - (i === 1 ? 6 : 4.5), 1.2, i === 1 ? 12 : 9)
    }

    // 圆点 = 果篮当前位置；对准水果时变绿并轻微放大
    const aligned = !!vm.aligned
    const kx = trackX0 + trackW * basketX
    const kr = aligned ? 7 : 6
    ctx.beginPath()
    ctx.arc(kx, ty, kr, 0, Math.PI * 2)
    ctx.fillStyle = aligned ? C.teal : C.amber
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'
    ctx.stroke()

    // 右侧：方向词
    const dirWord = vm.dir === 'left' ? '左' : (vm.dir === 'right' ? '右' : '中')
    this._text(dirWord, x0 + pillW - 11, ty + 3.2, {
      size: 9.5, weight: '700', color: aligned ? C.tealDeep : C.inkMute, align: 'right'
    })
    ctx.restore()
  }

  _dot(x, y, r, color) {
    const ctx = this.ctx
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
  }

  // ================================================================ 模拟控制
  _drawSimPad(vm) {
    const L = this.L
    const W = L.W
    const x = 10
    const chipY = L.hudBottom + 6

    this._miniChip('sim:toggle', x, chipY, 62, 24, this.simOpen ? '收起 ▴' : '模拟 ▾', true)
    if (!this.simOpen) return

    const bw = 44
    const bh = 28
    const gap = 4
    const rows = [
      [
        { id: 'sim:hold', label: '回中' },
        { id: 'sim:out', label: '倾身' },
        { id: 'sim:spawn', label: '补果' }
      ],
      [
        { id: 'sim:catch', label: '接住' },
        { id: 'sim:miss', label: '漏接' },
        { id: 'sim:lost', label: '断线' }
      ],
      [
        { id: 'sim:combo', label: '连击' }
      ]
    ]
    let y = chipY + 28
    rows.forEach((row) => {
      row.forEach((btn, i) => {
        this._miniChip(btn.id, x + i * (bw + gap), y, bw, bh, btn.label, false)
      })
      y += bh + gap
    })
    void W
  }

  _miniChip(id, x, y, w, h, label, strong) {
    const ctx = this.ctx
    const pressed = this.pressId === id && (this.nowMs - this.pressAt < 150)
    rr(ctx, x, y, w, h, 9)
    ctx.fillStyle = pressed ? 'rgba(15,156,140,0.95)' : (strong ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.78)')
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = pressed ? 'rgba(15,156,140,1)' : 'rgba(21,45,34,0.12)'
    ctx.stroke()
    this._text(label, x + w / 2, y + h * 0.66, {
      size: 11, weight: '700', color: pressed ? '#FFFFFF' : C.inkSoft, align: 'center'
    })
    this.buttons.push({ id: id, x: x, y: y, w: w, h: h })
  }

  // ================================================================ 倒计时 / 暂停 / 断线
  _drawCountdown(vm) {
    const ctx = this.ctx
    const L = this.L
    const W = L.W
    const H = L.H
    const n = Math.max(1, Math.ceil(vm.countdown))
    const frac = 1 - (vm.countdown - Math.floor(vm.countdown))

    ctx.save()
    ctx.fillStyle = 'rgba(12,40,26,0.22)'
    ctx.fillRect(0, 0, W, H)
    ctx.restore()

    const cx = W / 2
    const cy = H * 0.42
    const r = Math.min(W * 0.15, 58)

    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.94)'
    ctx.fill()
    // 进度环
    ctx.beginPath()
    ctx.arc(cx, cy, r - 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac)
    ctx.lineWidth = 4
    ctx.strokeStyle = C.tealLight
    ctx.lineCap = 'round'
    ctx.stroke()
    ctx.restore()

    this._text(String(n), cx, cy + 14, { size: 40, weight: '800', color: C.ink, align: 'center' })
    this._text('准备开始', cx, cy + r + 26, {
      size: 13, weight: '600', color: '#FFFFFF', align: 'center', shadow: true
    })
    this._text('左右倾身，把果篮移到水果下面', cx, cy + r + 46, {
      size: 10.5, weight: '500', color: 'rgba(255,255,255,0.85)', align: 'center'
    })
  }

  _drawPauseOverlay(vm) {
    const ctx = this.ctx
    const L = this.L
    const W = L.W
    const H = L.H
    ctx.save()
    ctx.fillStyle = 'rgba(10,36,24,0.42)'
    ctx.fillRect(0, 0, W, H)
    ctx.restore()

    const pw = Math.min(W - 56, 320)
    const ph = 250
    const px = (W - pw) / 2
    const py = (H - ph) / 2 - 10
    this._panel(px, py, pw, ph)

    this._text('已暂停', px + pw / 2, py + 42, { size: 19, weight: '800', color: C.ink, align: 'center' })
    this._text('水果、计时与判定都停在原地', px + pw / 2, py + 64, {
      size: 10.5, weight: '500', color: C.inkMute, align: 'center'
    })
    this._text('已接住 ' + vm.hits + ' · 漏接 ' + vm.misses, px + pw / 2, py + 90, {
      size: 12, weight: '600', color: C.inkSoft, align: 'center'
    })
    this._button('resume', px + 24, py + ph - 116, pw - 48, 44, '继续训练', { variant: 'primary', icon: 'play', size: 14 })
    this._button('quit', px + 24, py + ph - 64, pw - 48, 40, '结束本局并查看成绩', { variant: 'ghost', icon: 'exit', size: 11 })
  }

  _drawSensorOverlay(vm) {
    const ctx = this.ctx
    const L = this.L
    const W = L.W
    const H = L.H
    ctx.save()
    ctx.fillStyle = 'rgba(10,36,24,0.5)'
    ctx.fillRect(0, 0, W, H)
    ctx.restore()

    const pw = Math.min(W - 48, 330)
    const ph = 262
    const px = (W - pw) / 2
    const py = (H - ph) / 2 - 8
    this._panel(px, py, pw, ph, { accent: C.amber })

    this._text('传感器数据中断', px + pw / 2, py + 44, { size: 18, weight: '800', color: C.ink, align: 'center' })
    this._text('已停止接取判定，本局不会因中断而得分', px + pw / 2, py + 68, {
      size: 10.5, weight: '500', color: C.inkMute, align: 'center'
    })
    this._text('中断 ' + (vm.interrupted ? vm.interrupted.count : 0) + ' 次 · 累计 ' +
      ((vm.interrupted ? vm.interrupted.totalSec : 0) || 0).toFixed(1) + ' 秒',
      px + pw / 2, py + 92, { size: 11, weight: '600', color: C.amberDeep, align: 'center' })

    this._button('reconnect', px + 24, py + 112, pw - 48, 44, '重新连接传感器', { variant: 'primary', icon: 'bluetooth', size: 13 })
    this._button('resume', px + 24, py + 164, (pw - 58) / 2, 38, '继续等待', { variant: 'ghost', size: 11 })
    this._button('quit', px + 24 + (pw - 58) / 2 + 10, py + 164, (pw - 58) / 2, 38, '结束本局', { variant: 'ghost', size: 11 })
  }

  // ================================================================ 介绍页
  _drawIntro(vm) {
    const ctx = this.ctx
    const L = this.L
    const W = L.W
    const H = L.H

    // 轻压暗：上方留出天空，下方托住文字
    const scrim = ctx.createLinearGradient(0, 0, 0, H)
    scrim.addColorStop(0, 'rgba(255,255,255,0.18)')
    scrim.addColorStop(0.42, 'rgba(255,255,255,0.10)')
    scrim.addColorStop(0.62, 'rgba(255,253,246,0.30)')
    scrim.addColorStop(1, 'rgba(255,251,240,0.55)')
    ctx.fillStyle = scrim
    ctx.fillRect(0, 0, W, H)

    const cardX = 16
    const cardW = W - 32
    const roomy = H >= 700
    // 卡片高度 = 内容高度（不再拉满全屏，避免中间出现大片空白）
    const needH = roomy ? 404 : 336
    let cardH = Math.min(needH, H - (L.safeTop + 18) - 196 - 16)
    cardH = Math.max(300, cardH)
    let cardY = H - 16 - cardH
    const headMin = L.safeTop + 18
    if (cardY - headMin < 214) {
      // 矮屏：卡片跟着头顶内容走，尽量不重叠
      cardY = Math.min(headMin + 214, H - 16 - 300)
      cardH = H - 16 - cardY
    }
    // 头部（标题 + 水果 + 胶囊）在卡片上方的空间里居中，整体更稳
    const headNeed = 196
    const headTop = headMin + Math.max(0, Math.min(54, (cardY - headMin - headNeed) * 0.42))
    const top = headTop

    // 标题
    this._text('接水果', 24, top + 34, { size: 34, weight: '800', color: C.ink })
    this._text('果园接果训练', 25, top + 58, { size: 12, weight: '700', color: C.inkSoft })
    this._text('左右倾身 · 身体一动，果篮跟着走', 25, top + 78, {
      size: 11, weight: '500', color: C.inkMute
    })

    // 五种水果展示
    const rowY = top + 116
    const types = ['apple', 'orange', 'banana', 'strawberry', 'watermelon']
    const gap = Math.min(56, (W - 60) / 5)
    types.forEach((t, i) => {
      const fx = 34 + i * gap
      const bob = Math.sin(this.clock * 1.4 + i * 0.7) * 2.2
      drawFruit(ctx, t, fx, rowY + bob, 15 * L.fruitScale, Math.sin(this.clock * 0.9 + i) * 0.18)
    })

    // 状态胶囊
    let cx = 25
    const chips = []
    chips.push({
      t: vm.sim ? '模拟数据' : (vm.stale ? '传感器未连接' : '传感器已连接'),
      bg: vm.sim ? 'rgba(227,154,50,0.95)' : (vm.stale ? 'rgba(255,255,255,0.9)' : 'rgba(15,156,140,0.92)'),
      fg: vm.sim ? '#FFFFFF' : (vm.stale ? '#6B7A70' : '#FFFFFF')
    })
    chips.push({ t: '时长 ' + (Number(this.cfg.get('durationSec')) || 90) + ' 秒', bg: 'rgba(255,255,255,0.9)', fg: C.inkSoft })
    chips.push({ t: '第 ' + vm.difficulty + ' 档', bg: 'rgba(255,255,255,0.9)', fg: C.inkSoft })
    chips.forEach((c) => {
      const w = this._measure(c.t, 10.5, '600') + 20
      rr(ctx, cx, rowY + 26, w, 22, 11)
      ctx.fillStyle = c.bg
      ctx.fill()
      this._text(c.t, cx + w / 2, rowY + 41, {
        size: 10.5, weight: '600', color: c.fg || '#FFFFFF', align: 'center'
      })
      cx += w + 7
    })

    // 主体卡片
    this._glass(cardX, cardY, cardW, cardH, 22)

    this._text('怎么玩', cardX + 20, cardY + 26, { size: 12, weight: '700', color: C.ink })
    const steps = [
      '站好或坐稳，在中立位完成零点标定',
      '身体向左或向右倾，果篮会跟着横向移动',
      '水果落下前把果篮移到它正下方就算接住'
    ]
    const stepGap = roomy ? 26 : 22
    steps.forEach((s, i) => {
      const sy = cardY + 50 + i * stepGap
      ctx.beginPath()
      ctx.arc(cardX + 25, sy - 4, 8, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(15,156,140,0.12)'
      ctx.fill()
      this._text(String(i + 1), cardX + 25, sy - 0.5, {
        size: 9, weight: '700', color: C.tealDeep, align: 'center'
      })
      this._text(s, cardX + 39, sy - 0.5, { size: 10.5, weight: '500', color: C.inkSoft })
    })

    let contentY = cardY + 50 + steps.length * stepGap + 2

    if (roomy) {
      // 本局参数 2×2
      const params = [
        { k: '接取宽度', v: (Number(this.cfg.get('basketWidthPct')) || 24) + '% 屏宽' },
        { k: '左右行程', v: '整屏可移动' },
        { k: '生成间隔', v: (Number(this.cfg.get('spawnInterval')) || 1.4).toFixed(1) + ' 秒/个' },
        { k: '下落速度', v: (Number(this.cfg.get('fallSpeed')) || 0.26).toFixed(2) + ' 屏高/秒' }
      ]
      const cellW = (cardW - 40) / 2
      params.forEach((p, i) => {
        const px2 = cardX + 20 + (i % 2) * cellW
        const py2 = contentY + Math.floor(i / 2) * 38
        rr(ctx, px2, py2, cellW - 8, 32, 9)
        ctx.fillStyle = 'rgba(21,45,34,0.035)'
        ctx.fill()
        this._text(p.k, px2 + 10, py2 + 13, { size: 9.5, weight: '500', color: C.inkMute })
        this._text(p.v, px2 + 10, py2 + 26, { size: 10.5, weight: '700', color: C.ink })
      })
      contentY += 82
      this._text('成绩先保存在本机，可在「训练记录」里查看并上报治疗师', cardX + 20, contentY + 4, {
        size: 9.5, weight: '500', color: 'rgba(21,45,34,0.42)'
      })
    } else {
      // 短屏：参数说明挪到「训练设置」里，这里只保留玩法，避免和按钮挤在一起
      this._text('也可以先到「训练设置」调整难度与接取范围', cardX + 20, contentY + 6, {
        size: 9, weight: '600', color: C.inkMute
      })
    }

    // 按钮区（贴在卡片底部）
    const btnH = 48
    const startY = cardY + cardH - btnH - 16
    this._button('start', cardX + 18, startY, cardW - 36, btnH, '开始训练', { variant: 'primary', icon: 'play', size: 15 })
    const halfW = (cardW - 46) / 2
    this._button('settings', cardX + 18, startY - 44, halfW, 36, '训练设置', { variant: 'ghost', icon: 'gear', size: 11 })
    this._button('records', cardX + 28 + halfW, startY - 44, halfW, 36, '训练记录', { variant: 'ghost', icon: 'list', size: 11 })

    // 模拟模式开关（真实数据模式与模拟数据严格分离）
    const swY = startY - 74
    const label = vm.sim ? '模拟数据：开（仅用于测试）' : '使用模拟数据测试（无传感器也能玩）'
    this._text(label, cardX + 18, swY + 14, {
      size: 10, weight: '600', color: vm.sim ? C.amberDeep : C.inkMute
    })
    // 开关
    const swW = 44
    const swH = 24
    const swX = cardX + cardW - 18 - swW
    rr(ctx, swX, swY, swW, swH, swH / 2)
    ctx.fillStyle = vm.sim ? 'rgba(227,154,50,0.95)' : 'rgba(21,45,34,0.14)'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(swX + (vm.sim ? swW - swH / 2 : swH / 2), swY + swH / 2, swH / 2 - 3, 0, Math.PI * 2)
    ctx.fillStyle = '#FFFFFF'
    ctx.fill()
    this.buttons.push({ id: vm.sim ? 'sim:off' : 'sim:on', x: swX - 90, y: swY - 6, w: swW + 96, h: swH + 12 })
  }

  // ================================================================ 准备页
  _drawPrepare(vm) {
    const ctx = this.ctx
    const L = this.L
    const W = L.W
    const H = L.H

    const scrim = ctx.createLinearGradient(0, 0, 0, H)
    scrim.addColorStop(0, 'rgba(255,255,255,0.16)')
    scrim.addColorStop(0.5, 'rgba(255,255,255,0.10)')
    scrim.addColorStop(1, 'rgba(255,251,240,0.48)')
    ctx.fillStyle = scrim
    ctx.fillRect(0, 0, W, H)

    const cardX = 16
    const cardW = W - 32
    // 卡片按内容高度贴底，头部在剩余空间里下移一点，避免「上挤下空」
    const cardNeed = 520
    let cardH = Math.min(cardNeed, H - (L.safeTop + 76) - 20)
    cardH = Math.max(420, cardH)
    let cardY = H - 18 - cardH
    const headShift = Math.max(0, Math.min(46, (cardY - (L.safeTop + 76) - 92) * 0.34))

    this._text('设备准备', 22, L.safeTop + 34 + headShift, { size: 24, weight: '800', color: C.ink })
    this._text('戴好胸带，坐稳或站稳就能开始', 23, L.safeTop + 56 + headShift, {
      size: 11, weight: '600', color: C.inkSoft
    })
    this._button('back', W - 66, L.safeTop + 12 + headShift, 52, 34, '返回', { variant: 'link', size: 11 })

    this._glass(cardX, cardY, cardW, cardH, 22)

    // 状态
    let cx = cardX + 18
    const connected = !vm.stale
    const chips = [
      { t: vm.sim ? '模拟模式' : (connected ? '传感器已连接' : '传感器未连接'), bg: vm.sim ? C.amber : (connected ? C.teal : 'rgba(21,45,34,0.35)') },
      { t: (vm.rateHz || 0) + ' Hz', bg: 'rgba(21,45,34,0.12)' }
    ]
    chips.forEach((c) => {
      const w = this._measure(c.t, 10, '700') + 18
      rr(ctx, cx, cardY + 18, w, 22, 11)
      ctx.fillStyle = c.bg
      ctx.fill()
      this._text(c.t, cx + w / 2, cardY + 33, { size: 10, weight: '700', color: '#FFFFFF', align: 'center' })
      cx += w + 6
    })
    if (!connected && !vm.sim) {
      this._button('connect', cardX + cardW - 92, cardY + 14, 78, 30, '去连接', { variant: 'primary', size: 11, icon: 'bluetooth' })
    }

    // 佩戴图示（右侧给标注留出宽度，避免标注压到步骤文字）
    const figW = Math.min(112, cardW * 0.32)
    const figH = Math.min(146, cardH * 0.32)
    this._drawWearFigure(cardX + 16 + figW / 2, cardY + 118, figH)

    // 步骤文字
    const tx = cardX + 16 + figW + 34
    const tw = cardW - (tx - cardX) - 16
    const steps = [
      { t: '传感器卡在胸带上', d: '胸带从腋下最高点绕一圈固定' },
      { t: '坐稳或站稳', d: '双手自然放下，身体保持中立位' },
      { t: '身体左右倾', d: '果篮跟着过去接水果' }
    ]
    const stepGap2 = cardH > 560 ? 56 : (cardH > 480 ? 52 : 46)
    steps.forEach((s, i) => {
      const sy = cardY + 66 + i * stepGap2
      ctx.beginPath()
      ctx.arc(tx + 9, sy, 9, 0, Math.PI * 2)
      ctx.fillStyle = i === 0 ? 'rgba(15,156,140,0.16)' : 'rgba(21,45,34,0.07)'
      ctx.fill()
      this._text(String(i + 1), tx + 9, sy + 3.5, {
        size: 10, weight: '700', color: C.tealDeep, align: 'center'
      })
      this._text(s.t, tx + 24, sy + 4, { size: 11, weight: '600', color: C.ink })
      this._text(s.d, tx + 24, sy + 18, { size: 9, weight: '500', color: C.inkMute })
      void tw
    })

    // 零点：只报状态，不做独立标定
    // 零点全 App 只有一份，统一在「零点标定」页设置；这里再放一套就等于让用户标两遍
    const infoY = cardY + 66 + 3 * stepGap2 - 8
    const z = vm.zero || { roll: 0, pitch: 0, set: false }
    const fDeg = (v) => (v >= 0 ? '+' : '') + (Math.round(v * 10) / 10).toFixed(1) + '°'
    if (z.set) {
      this._text('当前零点 ' + fDeg(z.roll) + ' / ' + fDeg(z.pitch), cardX + 18, infoY + 12, {
        size: 10.5, weight: '600', color: C.tealDeep
      })
    } else {
      this._text('还没设置零点，读数按传感器原始角度算', cardX + 18, infoY + 12, {
        size: 10, weight: '600', color: C.danger
      })
    }
    this._button('zero:set', cardX + cardW - 92, infoY + 1, 74, 26, z.set ? '重设' : '去标定', {
      variant: 'ghost', size: 10
    })

    // 按钮
    const btnH = 46
    const by = cardY + cardH - btnH - 16
    this._button('enter', cardX + 18, by, cardW - 36, btnH, '进入游戏', {
      variant: 'primary', icon: 'play', size: 15
    })
    this._button(vm.sim ? 'sim:off' : 'sim:on', cardX + 18, by - 44, cardW - 36, 38,
      vm.sim ? '关闭模拟数据' : '使用模拟数据', { variant: 'ghost', icon: 'check', size: 11 })

    // 训练条件 + 标定小贴士：优先贴着按钮区往上排；
    // 短屏放不下整块时，至少保留「本局条件」这一行，别在卡片中间留一大片空白
    const ghostTop = by - 44
    const chipsH = 46
    const tipsH = 78
    const tipsGap = 10
    const bottomLimit = ghostTop - 12
    let condTop = bottomLimit - (chipsH + tipsGap + tipsH)
    let showTips = condTop >= infoY + 30
    if (!showTips) condTop = bottomLimit - chipsH
    if (condTop >= infoY + 24) {
      this._text('本局条件', cardX + 18, condTop + 10, { size: 10, weight: '700', color: C.ink })
      const conds = [
        '第 ' + vm.difficulty + ' 档',
        '篮子 ' + (Number(this.cfg.get('basketWidthPct')) || 24) + '%',
        '水果 ' + (Number(this.cfg.get('spawnInterval')) || 1.4).toFixed(1) + ' 秒/个',
        '落速 ' + (Number(this.cfg.get('fallSpeed')) || 0.26).toFixed(2)
      ]
      // 窄屏放不下 4 个胶囊就退化成一行文字，绝不让它顶出卡片
      const widths = conds.map((c) => this._measure(c, 9.5, '600') + 18)
      const totalW = widths.reduce((a, b) => a + b, 0) + 6 * (conds.length - 1)
      if (totalW <= cardW - 36) {
        let ccx = cardX + 18
        conds.forEach((c, i) => {
          rr(ctx, ccx, condTop + 18, widths[i], 22, 11)
          ctx.fillStyle = 'rgba(21,45,34,0.05)'
          ctx.fill()
          this._text(c, ccx + widths[i] / 2, condTop + 33, {
            size: 9.5, weight: '600', color: C.inkSoft, align: 'center'
          })
          ccx += widths[i] + 6
        })
      } else {
        this._text(conds.join(' · '), cardX + 18, condTop + 33, {
          size: 9.5, weight: '600', color: C.inkSoft
        })
      }

      if (showTips) {
        const noteY = condTop + chipsH + tipsGap
        rr(ctx, cardX + 16, noteY, cardW - 32, tipsH, 12)
        ctx.fillStyle = 'rgba(15,156,140,0.06)'
        ctx.fill()
        this._text('佩戴与零点', cardX + 30, noteY + 19, { size: 10, weight: '700', color: C.tealDeep })
        const tips = [
          '胸带别松：松了传感器会晃，读数跟着抖；',
          '换人或换佩戴方式，去「零点标定」页重设一次；',
          '摆好姿势后尽量别乱动，果篮跟着身体走。'
        ]
        tips.forEach((t, i) => {
          this._text(t, cardX + 30, noteY + 35 + i * 14, {
            size: 9.2, weight: '500', color: C.inkSoft
          })
        })
      }
    }
  }

  _drawWearFigure(cx, cy, h) {
    const ctx = this.ctx
    const s = h / 140
    const skin = '#F3D3B0'
    const shirt = '#4FA79A'
    const pants = '#3D5C6B'
    const strap = '#64798B'

    ctx.save()
    ctx.translate(cx, cy)

    // 地面椭圆
    ctx.save()
    ctx.globalAlpha = 0.12
    ellipse(ctx, 0, 68 * s, 42 * s, 7 * s)
    ctx.fillStyle = '#20392B'
    ctx.fill()
    ctx.restore()

    // 裤腿与鞋
    rr(ctx, -14 * s, 8 * s, 28 * s, 22 * s, 6 * s)
    ctx.fillStyle = pants
    ctx.fill()
    ;[-1, 1].forEach((side) => {
      rr(ctx, side * 7 * s - 5 * s, 28 * s, 10 * s, 32 * s, 4 * s)
      ctx.fillStyle = pants
      ctx.fill()
      rr(ctx, side * 7 * s - 7 * s, 56 * s, 14 * s, 9 * s, 4 * s)
      ctx.fillStyle = '#2C3E48'
      ctx.fill()
    })

    // 手臂：自然垂下，肩下留出「腋下最高点」这一段躯干
    ;[-1, 1].forEach((side) => {
      ctx.beginPath()
      ctx.moveTo(side * 14 * s, -33 * s)
      ctx.quadraticCurveTo(side * 27 * s, -12 * s, side * 23 * s, 16 * s)
      ctx.lineWidth = 7 * s
      ctx.lineCap = 'round'
      ctx.strokeStyle = shirt
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(side * 23 * s, 18 * s, 4.2 * s, 0, Math.PI * 2)
      ctx.fillStyle = skin
      ctx.fill()
    })

    // 躯干
    rr(ctx, -16 * s, -38 * s, 32 * s, 52 * s, 11 * s)
    const g = ctx.createLinearGradient(-16 * s, -38 * s, 16 * s, 14 * s)
    g.addColorStop(0, '#5FBDAE')
    g.addColorStop(1, shirt)
    ctx.fillStyle = g
    ctx.fill()

    // 胸带：绕在躯干上，正好走「腋下最高点」这一圈（正面看是一道横带）
    const bandTop = -33 * s
    const bandBot = -26 * s
    const bandBow = 1.6 * s
    const bandPath = () => {
      ctx.beginPath()
      ctx.moveTo(-19 * s, bandTop)
      ctx.quadraticCurveTo(0, bandTop + bandBow, 19 * s, bandTop)
      ctx.lineTo(19 * s, bandBot)
      ctx.quadraticCurveTo(0, bandBot + bandBow, -19 * s, bandBot)
      ctx.closePath()
    }
    ctx.save()
    rr(ctx, -16 * s, -38 * s, 32 * s, 52 * s, 11 * s)
    ctx.clip()
    bandPath()
    ctx.fillStyle = strap
    ctx.fill()
    // 上沿受光 / 下沿暗边：让它看起来是织物带，而不是一块色块
    ctx.save()
    bandPath()
    ctx.clip()
    ctx.fillStyle = 'rgba(255,255,255,0.22)'
    ctx.fillRect(-19 * s, bandTop, 38 * s, 2.4 * s)
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    ctx.fillRect(-19 * s, bandBot - 2.2 * s, 38 * s, 2.2 * s)
    ctx.restore()
    // 侧边调节扣（左右各一个，提示这条带子是绕一圈的）
    ;[-1, 1].forEach((side) => {
      rr(ctx, side * 14 * s - 2.3 * s, (bandTop + bandBot) / 2 - 2.8 * s, 4.6 * s, 5.6 * s, 1.4 * s)
      ctx.fillStyle = '#8C9DA9'
      ctx.fill()
      ctx.lineWidth = 0.7 * s
      ctx.strokeStyle = 'rgba(40,58,70,0.28)'
      ctx.stroke()
    })
    ctx.restore()

    // 传感器：正面卡在胸带上（不是挂在带子下面，也不是夹在腋下）
    const sw2 = 8.4 * s
    const sh2 = 5.2 * s
    const sy = (bandTop + bandBot) / 2
    // 先垫一层暗影，读起来是「压在带子上」而不是浮在衣服前
    rr(ctx, -sw2 / 2 + 0.6 * s, sy - sh2 / 2 + 0.9 * s, sw2, sh2, 1.4 * s)
    ctx.fillStyle = 'rgba(24,38,48,0.28)'
    ctx.fill()
    rr(ctx, -sw2 / 2, sy - sh2 / 2, sw2, sh2, 1.2 * s)
    ctx.fillStyle = '#E3982F'
    ctx.fill()
    ctx.lineWidth = 0.8 * s
    ctx.strokeStyle = 'rgba(255,255,255,0.92)'
    ctx.stroke()
    // 指示灯（很小一个点）
    ctx.beginPath()
    ctx.arc(2 * s, sy - 0.9 * s, 0.7 * s, 0, Math.PI * 2)
    ctx.fillStyle = '#9BF0D9'
    ctx.fill()

    // 脖子与头（画在最后，压住躯干顶边）
    rr(ctx, -4.5 * s, -44 * s, 9 * s, 10 * s, 4 * s)
    ctx.fillStyle = skin
    ctx.fill()
    ctx.beginPath()
    ctx.arc(0, -54 * s, 14 * s, 0, Math.PI * 2)
    ctx.fillStyle = skin
    ctx.fill()
    ctx.beginPath()
    ctx.arc(0, -58 * s, 14 * s, Math.PI * 1.02, Math.PI * 2.02)
    ctx.fillStyle = '#3A3128'
    ctx.fill()

    // 两条指示线：上面标胸带，下面标传感器
    // 先铺一层白描边再叠虚线，压过衣服/手臂时也能看清
    const drawLeader = (pts) => {
      const path = () => {
        ctx.beginPath()
        ctx.moveTo(pts[0][0] * s, pts[0][1] * s)
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * s, pts[i][1] * s)
      }
      ctx.setLineDash([])
      ctx.strokeStyle = 'rgba(255,255,255,0.82)'
      ctx.lineWidth = 3
      path()
      ctx.stroke()
      ctx.setLineDash([3, 3])
      ctx.strokeStyle = 'rgba(21,45,34,0.34)'
      ctx.lineWidth = 1.1
      path()
      ctx.stroke()
    }
    ctx.save()
    // 胸带在腋下高度、传感器就卡在这条带上，两者同一水平线，
    // 所以一个往上引、一个往下引，避免两条线叠在一起
    drawLeader([[16, sy / s], [27, sy / s], [27, -40], [30, -40]])
    drawLeader([[0, (sy + 2.6 * s) / s], [0, -13], [27, -13], [30, -13]])
    ctx.setLineDash([])
    ctx.restore()

    const fs1 = Math.max(7, 7.8 * s)
    const fs2 = Math.max(6.8, 7.2 * s)
    this._text('胸带', 32 * s, -42 * s, { size: fs1, weight: '700', color: C.inkMute })
    this._text('过腋下最高点', 32 * s, -33 * s, {
      size: fs2, weight: '500', color: 'rgba(21,45,34,0.4)'
    })
    this._text('传感器', 32 * s, -15 * s, { size: fs1, weight: '700', color: C.inkMute })
    this._text('扣在胸带正中', 32 * s, -6 * s, {
      size: fs2, weight: '500', color: 'rgba(21,45,34,0.4)'
    })

    ctx.restore()
  }

  // ================================================================ 结算页
  _drawResult(vm) {
    const ctx = this.ctx
    const L = this.L
    const W = L.W
    const H = L.H
    const engine = this.engine
    const sum = engine.summary || {}

    const scrim = ctx.createLinearGradient(0, 0, 0, H)
    scrim.addColorStop(0, 'rgba(255,255,255,0.30)')
    scrim.addColorStop(0.5, 'rgba(255,253,246,0.42)')
    scrim.addColorStop(1, 'rgba(255,249,238,0.62)')
    ctx.fillStyle = scrim
    ctx.fillRect(0, 0, W, H)

    const px = 16
    const pw = W - 32
    const py = Math.max(L.safeTop + 8, H * 0.055)
    const ph = H - py - 16
    this._glass(px, py, pw, ph, 24)

    const tight = ph < 590
    const aborted = !sum.completed
    const gx = px + 20
    const gw = pw - 40

    // ---- 纵向配平：先算内容需要多高，再把富余空间分给各段的间距，
    //      避免矮屏挤在一起、高屏中间空一大块。
    const bh = tight ? 42 : 46
    const btnBlockH = bh + 14 + (tight ? 40 : 44) + 10
    const scoreSize = tight ? 36 : 40
    const tileH = tight ? 38 : 42
    const mGap = tight ? 30 : 34
    const swayRows = (sum.sway || []).slice(0, tight ? 3 : 5)
    const rowGap = tight ? 13 : 15
    const baseContent = (tight ? 104 : 108) + tileH + (tight ? 18 : 22) + mGap * 3 +
      (tight ? 8 : 12) + 14 + Math.max(1, swayRows.length) * rowGap + (tight ? 10 : 12)
    const spare = Math.max(0, ph - 26 - baseContent - btnBlockH)
    const topPad = 26 + Math.min(70, spare * 0.26)
    const gapA = Math.min(34, spare * 0.14)

    let y = py + topPad

    // 标题行
    this._text(aborted ? '本局已结束' : '训练完成', gx, y + 18, {
      size: 15, weight: '800', color: C.ink
    })
    this._text(sum.dataSource === 'simulation' ? '模拟数据 · 不计入真实训练' : '真实传感器数据', gx, y + 34, {
      size: 9, weight: '500', color: sum.dataSource === 'simulation' ? C.amberDeep : C.inkMute
    })

    // 评级环
    const ringR = tight ? 20 : 23
    this._gradeRing(px + pw - 30 - ringR, y + 30, ringR, sum.grade || '-')

    // 分数
    const scoreStr = String(sum.score || 0)
    this._text(scoreStr, gx, y + (tight ? 70 : 74), { size: scoreSize, weight: '800', color: C.ink })
    const sw = this._measure(scoreStr, scoreSize, '800')
    this._text('分', gx + sw + 5, y + (tight ? 70 : 74), { size: 11, weight: '600', color: C.inkMute })
    this._text('接住 ' + (sum.hits || 0) + ' 个 · 漏接 ' + (sum.misses || 0) + ' 个 · 成功率 ' +
      Math.round((sum.accuracy || 0) * 100) + '%', gx, y + (tight ? 90 : 96), {
      size: 10, weight: '500', color: C.inkSoft
    })

    // 分项得分小卡
    const tiles = [
      { k: '基础分', v: (sum.breakdown && (sum.breakdown.rawBase !== undefined
        ? sum.breakdown.rawBase : sum.breakdown.base)) || 0 },
      { k: '连击加成', v: (sum.breakdown && sum.breakdown.comboBonus) || 0 },
      { k: '完成奖励', v: (sum.breakdown && sum.breakdown.finishBonus) || 0 },
      { k: '最高连击', v: sum.comboMax || 0 }
    ]
    const tileY = y + (tight ? 100 : 108)
    const tileGap = 8
    const tileW = (gw - tileGap * 3) / 4
    tiles.forEach((t, i) => {
      const tx = gx + i * (tileW + tileGap)
      rr(ctx, tx, tileY, tileW, tileH, 10)
      ctx.fillStyle = 'rgba(21,45,34,0.04)'
      ctx.fill()
      this._text(String(t.v), tx + tileW / 2, tileY + tileH * 0.5 + 4, {
        size: 13, weight: '700', color: C.ink, align: 'center'
      })
      this._text(t.k, tx + tileW / 2, tileY + tileH - 5, {
        size: 9.5, weight: '500', color: C.inkMute, align: 'center'
      })
    })

    // 指标
    y = tileY + tileH + gapA + (tight ? 8 : 10)
    const holdRate = typeof sum.holdRate === 'number' ? sum.holdRate : 0
    const metrics = [
      { k: '命中率', v: Math.round((sum.accuracy || 0) * 100) + '%', hi: true },
      { k: '稳定率', v: Math.round(holdRate * 100) + '%' },
      { k: '最长稳定', v: (sum.holdBestSec || 0).toFixed(1) + ' 秒' },
      { k: '平均偏离', v: (sum.deviationAvgDeg || 0).toFixed(1) + '° / ±' + (sum.holdToleranceDeg || 6) + '°' },
      { k: '训练时长', v: this._fmtSec(sum.durationSec || 0) },
      { k: '数据来源', v: sum.dataSource === 'simulation' ? '模拟' : '真实' }
    ]
    const cellW = gw / 2
    metrics.forEach((m, i) => {
      const mx = gx + (i % 2) * cellW
      const my = y + Math.floor(i / 2) * mGap
      this._text(m.k, mx, my + 9, { size: 9, weight: '500', color: C.inkMute })
      this._text(m.v, mx, my + 24, { size: 12, weight: '700', color: m.hi ? C.tealDeep : C.ink })
    })
    y += mGap * 3 + gapA * 0.7

    // 身体摆动分布
    this._text('身体摆动分布（归一化代理，非真实位移）', gx, y + 6, { size: 9, weight: '600', color: C.inkMute })
    y += 14
    swayRows.forEach((b, i) => {
      const ry = y + i * rowGap
      const ratio = clamp(b.ratio || 0, 0, 1)
      this._text(b.label, gx, ry + 6, { size: 9.5, weight: '500', color: C.inkMute })
      const tx = gx + 42
      const tw = gw - 42 - 32
      rr(ctx, tx, ry, tw, 5, 2.5)
      ctx.fillStyle = 'rgba(21,45,34,0.06)'
      ctx.fill()
      if (ratio > 0.01) {
        rr(ctx, tx, ry, Math.max(3, tw * ratio), 5, 2.5)
        ctx.fillStyle = i >= 3 ? 'rgba(223,85,64,0.7)' : (i >= 1 ? 'rgba(227,154,50,0.72)' : 'rgba(63,195,176,0.85)')
        ctx.fill()
      }
      this._text(Math.round(ratio * 100) + '%', gx + gw, ry + 6, {
        size: 9.5, weight: '600', color: C.inkMute, align: 'right'
      })
    })
    y += swayRows.length * rowGap + gapA * 0.7

    this._text('稳定率与偏离角都是姿态代理指标，不是真实位移；成绩仅用于训练对比。', gx, y + 8, {
      size: 9.5, weight: '500', color: 'rgba(21,45,34,0.4)'
    })
    const footBottom = y + 14

    // 底部按钮
    const by = py + ph - bh - 14
    const ghostTop = by - (tight ? 40 : 44)
    // 训练建议：贴在按钮上方，把结算页下半部分留白填掉（同时给出可执行的调整方向）
    const tips = []
    const acc = sum.accuracy || 0
    if (acc >= 0.85) {
      tips.push('对准很准，可以加快下落速度或缩小篮口宽度')
    } else if (acc < 0.55) {
      tips.push('先放宽篮口宽度或减慢下落速度，让患者更容易对准')
    } else {
      tips.push('对准基本到位，注意水果落到篮口前不要提前停下动作')
    }
    if ((sum.misses || 0) >= 8) {
      tips.push('漏接偏多，可以先只练"看到落点再移动"，不必追求连击')
    } else if (acc >= 0.8) {
      tips.push('命中很稳，可以适当提高一档难度')
    }
    const tipH = 40 + Math.min(2, tips.length) * 16
    const tipTop = ghostTop - 14 - tipH
    if (tipTop > footBottom + 18) {
      rr(ctx, gx - 4, tipTop, gw + 8, tipH, 12)
      ctx.fillStyle = 'rgba(15,156,140,0.055)'
      ctx.fill()
      this._text('训练建议', gx + 8, tipTop + 19, { size: 10, weight: '700', color: C.tealDeep })
      tips.slice(0, 2).forEach((t, i) => {
        this._text(t, gx + 8, tipTop + 36 + i * 16, { size: 9.5, weight: '500', color: C.inkSoft })
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

  _gradeRing(x, y, r, grade) {
    const ctx = this.ctx
    const color = grade === 'S' ? '#E39A32' : grade === 'A' ? '#0F9C8C' : grade === 'B' ? '#5B93B8' : '#8B9A8F'
    ctx.save()
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.fill()
    ctx.lineWidth = 3
    ctx.strokeStyle = color
    ctx.stroke()
    this._text(grade, x, y + r * 0.34, {
      size: r * 0.95, weight: '800', color: color, align: 'center'
    })
    this._text('评级', x, y + r + 11, { size: 9, weight: '600', color: C.inkMute, align: 'center' })
    ctx.restore()
  }

  // ================================================================ 基础控件
  _text(str, x, y, o) {
    const opt = o || {}
    const ctx = this.ctx
    ctx.save()
    ctx.font = (opt.weight || '400') + ' ' + (opt.size || 12) + 'px "PingFang SC", "Helvetica Neue", Helvetica, Arial, sans-serif'
    ctx.textAlign = opt.align || 'left'
    ctx.textBaseline = opt.baseline || 'alphabetic'
    if (opt.alpha !== undefined) ctx.globalAlpha = opt.alpha
    if (opt.shadow) {
      ctx.shadowColor = 'rgba(8,26,16,0.4)'
      ctx.shadowBlur = 8
      ctx.shadowOffsetY = 1
    }
    ctx.fillStyle = opt.color || C.ink
    ctx.fillText(String(str), x, y)
    ctx.restore()
  }

  _measure(str, size, weight) {
    const ctx = this.ctx
    ctx.save()
    ctx.font = (weight || '400') + ' ' + size + 'px "PingFang SC", "Helvetica Neue", Helvetica, Arial, sans-serif'
    const w = ctx.measureText(String(str)).width
    ctx.restore()
    return w
  }

  _glass(x, y, w, h, r) {
    const ctx = this.ctx
    ctx.save()
    ctx.shadowColor = 'rgba(10,36,22,0.18)'
    ctx.shadowBlur = 18
    ctx.shadowOffsetY = 6
    rr(ctx, x, y, w, h, r)
    ctx.fillStyle = C.card
    ctx.fill()
    ctx.restore()

    rr(ctx, x, y, w, h, r)
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'
    ctx.stroke()
  }

  _panel(x, y, w, h, o) {
    const opt = o || {}
    const ctx = this.ctx
    ctx.save()
    ctx.shadowColor = 'rgba(6,22,14,0.34)'
    ctx.shadowBlur = 28
    ctx.shadowOffsetY = 10
    rr(ctx, x, y, w, h, 22)
    const g = ctx.createLinearGradient(0, y, 0, y + h)
    g.addColorStop(0, 'rgba(255,255,255,0.99)')
    g.addColorStop(1, 'rgba(246,251,247,0.99)')
    ctx.fillStyle = g
    ctx.fill()
    ctx.restore()

    rr(ctx, x, y, w, h, 22)
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(255,255,255,0.92)'
    ctx.stroke()

    if (opt.accent) {
      ctx.beginPath()
      ctx.moveTo(x + 22, y + 1)
      ctx.lineTo(x + w - 22, y + 1)
      ctx.lineWidth = 3
      ctx.strokeStyle = opt.accent
      ctx.globalAlpha = 0.6
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  }

  _button(id, x, y, w, h, label, o) {
    const opt = o || {}
    const ctx = this.ctx
    const disabled = !!opt.disabled
    const pressed = this.pressId === id && (this.nowMs - this.pressAt < 150)
    const scale = pressed ? 0.97 : 1
    const cxp = x + w / 2
    const cyp = y + h / 2

    ctx.save()
    ctx.translate(cxp, cyp)
    ctx.scale(scale, scale)
    ctx.translate(-cxp, -cyp)

    const r = Math.min(h / 2, 22)
    if (opt.variant === 'primary') {
      ctx.save()
      ctx.shadowColor = disabled ? 'rgba(12,38,20,0.05)' : 'rgba(15,156,140,0.34)'
      ctx.shadowBlur = disabled ? 2 : 14
      ctx.shadowOffsetY = disabled ? 1 : 5
      rr(ctx, x, y, w, h, r)
      const g = ctx.createLinearGradient(0, y, 0, y + h)
      if (disabled) {
        g.addColorStop(0, '#CBD8D0')
        g.addColorStop(1, '#B9C8BE')
      } else {
        g.addColorStop(0, '#22B49F')
        g.addColorStop(1, '#0A8B7E')
      }
      ctx.fillStyle = g
      ctx.fill()
      ctx.restore()
    } else if (opt.variant === 'glass') {
      ctx.save()
      ctx.shadowColor = 'rgba(10,36,22,0.12)'
      ctx.shadowBlur = 10
      ctx.shadowOffsetY = 3
      rr(ctx, x, y, w, h, r)
      ctx.fillStyle = disabled ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.86)'
      ctx.fill()
      ctx.restore()
      rr(ctx, x, y, w, h, r)
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.stroke()
    } else if (opt.variant === 'link') {
      rr(ctx, x, y, w, h, r)
      ctx.fillStyle = pressed ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.2)'
      ctx.fill()
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'
      ctx.stroke()
    } else {
      rr(ctx, x, y, w, h, r)
      ctx.fillStyle = disabled ? 'rgba(240,244,240,1)' : 'rgba(255,255,255,0.96)'
      ctx.fill()
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(21,45,34,0.1)'
      ctx.stroke()
    }

    const fg = opt.variant === 'primary' ? '#FFFFFF' : (opt.variant === 'link' ? '#FFFFFF' : C.ink)
    const size = opt.size || 14
    const hasIcon = !!opt.icon
    const textW = this._measure(label, size, '700')
    const iconW = hasIcon ? size + 7 : 0
    const startX = cxp - (textW + iconW) / 2
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
      ctx.moveTo(8, 6)
      ctx.lineTo(20, 6)
      ctx.moveTo(8, 12)
      ctx.lineTo(20, 12)
      ctx.moveTo(8, 18)
      ctx.lineTo(20, 18)
      ctx.moveTo(4.5, 6)
      ctx.lineTo(4.6, 6)
      ctx.moveTo(4.5, 12)
      ctx.lineTo(4.6, 12)
      ctx.moveTo(4.5, 18)
      ctx.lineTo(4.6, 18)
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
    } else if (name === 'bluetooth') {
      ctx.moveTo(12, 3)
      ctx.lineTo(12, 21)
      ctx.lineTo(17, 16.5)
      ctx.lineTo(7, 7.5)
      ctx.moveTo(12, 3)
      ctx.lineTo(17, 7.5)
      ctx.lineTo(7, 16.5)
      ctx.stroke()
    } else if (name === 'check') {
      ctx.moveTo(5, 12.5)
      ctx.lineTo(10, 17.5)
      ctx.lineTo(19, 7)
      ctx.stroke()
    }
    ctx.restore()
  }

  // ---------------------------------------------------------------- 临时提示
  showHint(text, color) {
    this.hint = { text: text, color: color || C.ink, at: this.nowMs || Date.now() }
  }

  _drawTransient() {
    const h = this.hint
    if (!h) return
    const age = (this.nowMs || Date.now()) - h.at
    if (age > 1800) {
      this.hint = null
      return
    }
    const alpha = age < 1400 ? 1 : 1 - (age - 1400) / 400
    const ctx = this.ctx
    const W = this.W
    const w = this._measure(h.text, 12, '600') + 32
    const y = this.L.hudBottom + 10
    ctx.save()
    ctx.globalAlpha = clamp(alpha, 0, 1)
    rr(ctx, (W - w) / 2, y, w, 28, 14)
    ctx.fillStyle = 'rgba(19,41,28,0.84)'
    ctx.fill()
    this._text(h.text, W / 2, y + 18, { size: 12, weight: '600', color: '#FFFFFF', align: 'center' })
    ctx.restore()
  }

  _fmtSec(sec) {
    const s = Math.max(0, Math.round(sec || 0))
    const m = Math.floor(s / 60)
    return (m < 10 ? '0' + m : m) + ':' + (s % 60 < 10 ? '0' + (s % 60) : s % 60)
  }

  // ---------------------------------------------------------------- 交互
  hitTest(x, y) {
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i]
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id
    }
    return null
  }

  markPress(id) {
    this.pressId = id
    this.pressAt = this.nowMs || Date.now()
    if (id === 'sim:toggle') this.simOpen = !this.simOpen
  }
}

module.exports = { FruitRenderer, C }
