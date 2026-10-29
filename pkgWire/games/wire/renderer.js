// ============================================================================
// games/wire/renderer.js —— 走钢丝的画面与界面（全部绘制在 Canvas 上）
// ----------------------------------------------------------------------------
// 为什么整页都画在 Canvas：
//   页面用 webview 渲染器时，原生 canvas 会盖住普通 WXML 节点，把 HUD/按钮放在
//   canvas 上层会被遮挡；全部画在 canvas 上既能保证层次正确，也能做出统一的
//   游戏化视觉（HUD、按钮、面板都按同一套设计规范绘制）。
//
// 画面分层（从后到前）：
//   1. 天空 / 云 / 远山 / 山谷雾（静态缓存，只重绘尺寸变化时）
//   2. 透视钢丝 + 安全走廊 + 里程标（随相机推进）
//   3. 保险绳
//   4. 角色（脚底贴住钢丝）
//   5. 特效（稳定光环、失衡边缘提示）
//   6. HUD / 面板 / 按钮（按钮区域同时登记为可点击热区）
//
// 透视模型：以角色所在深度 r=0 为基准，r 越大越远。
//   p = 1 - 1/(1 + r/D)       → 0 近 … 1 远
//   y = charY - (charY - farY) * p
//   w = nearHalf / (1 + r/D)  → 近大远小
// 钢丝、走廊、里程标全部用同一套函数，保证角色永远站在钢丝上。
// ============================================================================

const { drawWalker, beltWorld } = require('./character.js')
// 2.5D 纵深原语（地平线雾 / 远景剪影 / 云海 / 软阴影 / 浮尘 / 暗角）
const depth = require('../../../utils/scene/depth.js')

const D = 5.2 // 透视深度常数（米）

const C = {
  ink: '#13293A',
  inkSoft: '#3F586B',
  inkMute: '#5D7386',
  teal: '#0F9C8C',
  tealDeep: '#0A7E72',
  tealLight: '#3FC3B0',
  amber: '#E39A32',
  danger: '#DF5540',
  white: '#FFFFFF',
  card: 'rgba(255,255,255,0.97)',
  cardSoft: 'rgba(255,255,255,0.66)',
  line: 'rgba(19,41,58,0.09)'
}

const SKY = {
  top: '#7BC6EA',
  mid: '#B6E2F4',
  low: '#E8F5F4',
  glow: 'rgba(255,246,222,0.95)',
  far: '#A8C7DC',
  midHill: '#8FB6CB',
  nearHill: '#7FA9A8',
  tree: 'rgba(74,110,105,0.55)',
  valleyTop: '#E6F2EE',
  valleyBottom: '#C9DFE0'
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

class WireRenderer {
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
    this.buttons = []
    this.pressId = ''
    this.pressAt = 0
    this.bg = null
    this.bgKey = ''
    this.bgDirect = false
    this.hint = null
    this.popups = []

    // 展示用的轻量状态（不改游戏数据）
    this.fx = { stableGlow: 0, warnGlow: 0, ropeFlash: 0, goalFlash: 0 }
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
    const charH = Math.min(H * 0.325, W * 0.62)
    this.L = {
      cx: W * 0.5,
      farY: H * 0.352,
      // 脚底线：短屏时上移，保证底部平衡条不会压住脚
      charY: Math.min(H * 0.775, H - 170),
      charH: charH,
      charScale: charH / 190,
      wireNearHalf: Math.max(3.2, W * 0.0084),
      corridor: Math.max(30, W * 0.1),
      horizonY: H * 0.335,
      safeTop: 0
    }

    // 高空浮尘：尺寸变化时重建一次，每帧只读（26 个点，成本可忽略）
    this.dust = depth.buildDust(W, H, this.L.farY, this.L.charY, 26, 11)
  }

  /** 深度 r（米，正 = 远处）→ 屏幕 y 与线宽系数 */
  _depth(r) {
    const k = 1 + r / D
    const p = 1 - 1 / Math.max(0.06, k)
    return {
      p: p,
      k: 1 / Math.max(0.06, k),
      y: this.L.charY - (this.L.charY - this.L.farY) * p
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
    this._updateFx(vm, dt)

    if (screen === 'play') this._drawHud(vm)
    else if (screen === 'intro') this._drawIntro(vm)
    else if (screen === 'prepare') this._drawPrepare(vm)
    else this._drawResult(vm)

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
    // 只按 key 判断是否需要重建：_buildBg 内部无论成功失败都会写入 bgKey，
    // 这样离屏画布创建失败时不会每帧重试（走 else 分支直接绘制）
    if (this.bgKey !== key) this._buildBg(key)

    if (this.bg) {
      ctx.drawImage(this.bg, 0, 0, this.W, this.H)
    } else {
      ctx.save()
      this._paintSky(ctx)
      this._paintHills(ctx)
      this._paintValley(ctx)
      ctx.restore()
    }
  }

  _buildBg(key) {
    this.bgKey = key
    this.bg = null
    try {
      if (typeof wx === 'undefined' || !wx.createOffscreenCanvas) {
        this.bgDirect = true
        return
      }
      const c = wx.createOffscreenCanvas({
        type: '2d',
        width: Math.round(this.W * this.dpr),
        height: Math.round(this.H * this.dpr)
      })
      if (!c) {
        this.bgDirect = true
        return
      }
      const g = c.getContext('2d')
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
      g.clearRect(0, 0, this.W, this.H)
      this._paintSky(g)
      this._paintHills(g)
      this._paintValley(g)
      this.bg = c
      this.bgDirect = false
    } catch (e) {
      this.bgDirect = true
      this.bg = null
    }
  }

  _paintSky(g) {
    const W = this.W
    const H = this.H
    const hz = this.L.horizonY
    this._bgCtx = g
    const sky = g.createLinearGradient(0, 0, 0, hz + 30)
    sky.addColorStop(0, SKY.top)
    sky.addColorStop(0.55, SKY.mid)
    sky.addColorStop(1, SKY.low)
    g.fillStyle = sky
    g.fillRect(0, 0, W, hz + 30)

    // 阳光：左上方柔和光晕（不闪动，避免不适）
    const sun = g.createRadialGradient(W * 0.2, H * 0.1, 4, W * 0.2, H * 0.1, W * 0.62)
    sun.addColorStop(0, 'rgba(255,252,235,0.95)')
    sun.addColorStop(0.35, 'rgba(255,248,225,0.35)')
    sun.addColorStop(1, 'rgba(255,248,225,0)')
    g.fillStyle = sun
    g.fillRect(0, 0, W, hz + 20)

    // 地平线暖光带
    const band = g.createLinearGradient(0, hz - 46, 0, hz + 10)
    band.addColorStop(0, 'rgba(255,244,220,0)')
    band.addColorStop(0.7, 'rgba(255,240,210,0.55)')
    band.addColorStop(1, 'rgba(255,248,230,0.9)')
    g.fillStyle = band
    g.fillRect(0, hz - 46, W, 56)

    // 云（烘焙进背景，静态不动，避免视觉干扰）
    this._drawClouds(true)
  }
  /** 云：烘焙版画在传入的上下文；动态版画在主画布 */
  _drawClouds(baked) {
    const g = baked ? this._bgCtx : this.ctx
    if (!g) return
    const W = this.W
    const H = this.H
    // 云层放在顶部信息条之下、地平线之上这条可见天空带里
    const clouds = [
      { x: 0.13, y: 0.205, s: 0.78, a: 0.86 },
      { x: 0.79, y: 0.188, s: 0.62, a: 0.76 },
      { x: 0.33, y: 0.288, s: 0.4, a: 0.42 },
      { x: 0.63, y: 0.302, s: 0.32, a: 0.34 },
      { x: 0.96, y: 0.262, s: 0.36, a: 0.4 }
    ]
    clouds.forEach((c, i) => {
      this._cloudShape(g, W * c.x, H * c.y, Math.min(W, H) * 0.1 * c.s, c.a, i)
    })
  }

  _cloudShape(g, x, y, r, alpha, seed) {
    g.save()
    g.globalAlpha = alpha
    g.fillStyle = '#FFFFFF'
    const puffs = [
      { dx: 0, dy: 0, rx: 1, ry: 0.66 },
      { dx: -0.78, dy: 0.14, rx: 0.66, ry: 0.46 },
      { dx: 0.76, dy: 0.16, rx: 0.6, ry: 0.42 },
      { dx: 0.2, dy: -0.26, rx: 0.62, ry: 0.5 }
    ]
    puffs.forEach((p, i) => {
      g.beginPath()
      g.ellipse ? g.ellipse(x + p.dx * r, y + p.dy * r, p.rx * r, p.ry * r, 0, 0, Math.PI * 2)
        : g.arc(x + p.dx * r, y + p.dy * r, p.rx * r, 0, Math.PI * 2)
      g.fill()
      void i
    })
    // 云底柔和阴影，避免纯白块
    g.globalAlpha = alpha * 0.45
    g.fillStyle = 'rgba(176,206,225,0.9)'
    g.beginPath()
    g.ellipse ? g.ellipse(x, y + r * 0.42, r * 1.16, r * 0.24, 0, 0, Math.PI * 2)
      : g.arc(x, y + r * 0.42, r * 1.16, 0, Math.PI * 2)
    g.fill()
    g.restore()
    void seed
  }

  /** 远山：三层，越远越淡；山脊用正弦叠加，固定不漂移 */
  _paintHills(g) {
    const W = this.W
    const H = this.H
    const hz = this.L.horizonY

    const ridge = (baseY, amp, color, freq, phase) => {
      g.beginPath()
      g.moveTo(-10, baseY)
      for (let x = -10; x <= W + 10; x += 8) {
        const t = x / W
        const y = baseY -
          Math.sin(t * Math.PI * freq + phase) * amp -
          Math.sin(t * Math.PI * freq * 2.7 + phase * 1.7) * amp * 0.32 -
          Math.sin(t * Math.PI * freq * 0.6 + phase * 0.5) * amp * 0.4
        g.lineTo(x, y)
      }
      g.lineTo(W + 10, hz + 8)
      g.lineTo(-10, hz + 8)
      g.closePath()
      g.fillStyle = color
      g.fill()
    }

    // 最远：淡蓝雪山
    ridge(hz - H * 0.012, H * 0.105, SKY.far, 1.5, 0.6)
    // 中层：蓝绿山
    ridge(hz + 2, H * 0.062, SKY.midHill, 2.4, 2.1)
    // 近层：青绿丘陵
    ridge(hz + 10, H * 0.032, SKY.nearHill, 3.6, 4.4)

    // 山脚大气雾：三层山如果一样清楚，就还是一张平涂插画。
    // 在山脚压一层暖雾，远山自然「退」进空气里。
    depth.haze(g, {
      cx: W * 0.5, y: hz - 4, rx: W * 0.72, ry: 0.055,
      color: '255,248,228', alpha: 0.42
    })

    // 山的受光面（左侧亮）
    const light = g.createLinearGradient(0, hz - H * 0.14, 0, hz)
    light.addColorStop(0, 'rgba(255,255,255,0.22)')
    light.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = light
    g.fillRect(0, hz - H * 0.16, W, H * 0.16)
  }

  _paintValley(g) {
    const W = this.W
    const H = this.H
    const hz = this.L.horizonY
    const valH = H - hz

    // 谷底：越靠近观察者越深越冷 —— 往下看就该是这样。
    // 全部留成浅色的话，云海再白也顶不起来。
    const v = g.createLinearGradient(0, hz, 0, H)
    v.addColorStop(0, '#EAF3EF')
    v.addColorStop(0.22, '#DCEBEB')
    v.addColorStop(0.58, '#C6DDE2')
    v.addColorStop(1, '#AFC9D2')
    g.fillStyle = v
    g.fillRect(0, hz, W, valH)

    // 谷中雾带：三条越远越亮的横雾，作用是把谷底「垫高」
    for (let i = 0; i < 3; i++) {
      const y = hz + valH * (0.085 + i * 0.115)
      const grad = g.createLinearGradient(0, y - 34, 0, y + 34)
      grad.addColorStop(0, 'rgba(255,255,255,0)')
      grad.addColorStop(0.5, 'rgba(255,255,255,' + (0.30 - i * 0.07).toFixed(2) + ')')
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = grad
      g.fillRect(0, y - 34, W, 68)
    }

    // —— 谷中树线：连续起伏的剪影 ——
    // 原来那排小三角读起来像插了一面旗子；真正的远处林子是「宽而缓的起伏」，
    // 所以频率要低（freq 9~14），颜色必须明显比谷雾更暗，否则等于没画。
    depth.ridge(g, {
      w: W,
      hz: hz + 12,
      step: 4,
      bands: [
        { amp: 0.055, rise: 0, freq: 8.6, alpha: 0.34, color: '112,146,138', seed: 1.7 },
        { amp: 0.036, rise: 0, freq: 13.4, alpha: 0.44, color: '84,118,112', seed: 3.9 }
      ]
    })

    // —— 云海：脚下要有云，「高空」才成立 ——
    // 位置必须明显低于树线（0.30 / 0.46 倍谷高），压在树线上会糊成一片白。
    // 远层小而淡、近层大而实。
    // 云：用「云层」而不是「云团」。
    // 一串等大白椭圆会读成水洼或泡沫；从高处往下看，云本来就是一片，
    // 只有顶边有起伏。两层就够，第三层会盖住角色。
    depth.cloudBank(g, {
      w: W, y: hz + valH * 0.30, h: valH * 0.16,
      wave: valH * 0.028, freq: 4.6, seed: 1.9,
      color: '255,255,255', alpha: 0.40, rimAlpha: 0.16
    })
    depth.cloudBank(g, {
      w: W, y: hz + valH * 0.50, h: valH * 0.20,
      wave: valH * 0.034, freq: 3.4, seed: 4.7,
      color: '255,255,255', alpha: 0.34, rimAlpha: 0.12
    })

    // 底部轻微压暗，突出 HUD
    const bottom = g.createLinearGradient(0, H * 0.68, 0, H)
    bottom.addColorStop(0, 'rgba(28,58,74,0)')
    bottom.addColorStop(1, 'rgba(28,58,74,0.26)')
    g.fillStyle = bottom
    g.fillRect(0, H * 0.68, W, H * 0.32)
  }

  // ================================================================ 世界
  _drawWorld(vm, screen) {
    const ctx = this.ctx
    const cx = this.L.cx
    const L = this.L
    const dist = this.engine.distance || 0

    // 非游戏界面（介绍 / 准备 / 结算）把角色下移并缩小，给面板腾位置，
    // 避免人物头部被卡片压住；介绍页按钮更多，需要再让开一些
    const idle = screen !== 'play'
    let feetY = L.charY
    let charScale = L.charScale
    if (idle) {
      const k = screen === 'intro' ? { y: 0.3, s: 0.76 } : { y: 0.2, s: 0.84 }
      feetY = L.charY + L.charH * k.y
      charScale = L.charScale * k.s
    }
    // ---- 高空浮尘 ----
    // 从远处往眼前缓慢上浮的小光点，读起来就是「这里有一片空气」。
    if (this.dust) {
      depth.drawDust(ctx, this.dust, this.clock, {
        top: L.farY, bottom: L.charY, color: '255,255,255', alpha: 0.7
      })
    }

    // ---- 安全走廊（两条透视虚线）----
    ctx.save()
    ctx.setLineDash([7, 9])
    ctx.lineWidth = 1.4
    ctx.strokeStyle = 'rgba(255,255,255,0.34)'
    ;[-1, 1].forEach((side) => {
      ctx.beginPath()
      for (let i = 0; i <= 60; i++) {
        const p = -0.62 + (i / 60) * 1.61
        const x = cx + side * L.corridor * (1 - p)
        const y = L.charY - (L.charY - L.farY) * p
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    })
    ctx.restore()

    // ---- 里程标 ----
    this._drawMarkers(dist)

    // ---- 钢丝 ----
    this._drawWire()

    // ---- 保险绳 ----
    this._drawRope(vm, screen, feetY, charScale)

    // ---- 角色 ----
    const balance = idle ? 0.92 : vm.balance
    const lean = idle ? Math.sin(this.clock * 0.9) * 0.012 : vm.lean
    const walkPhase = idle ? 0 : this.engine.walkPhase

    // 脚底光斑：平衡稳定时出现，缓慢呼吸（不闪烁）
    if (!idle && vm.balance > 0.7) {
      const a = (vm.balance - 0.7) * 0.9
      const rad = L.charH * (0.34 + 0.02 * Math.sin(this.clock * 1.4))
      const g = ctx.createRadialGradient(L.cx, feetY, 4, L.cx, feetY, rad)
      g.addColorStop(0, 'rgba(63,195,176,' + (0.22 * a) + ')')
      g.addColorStop(1, 'rgba(63,195,176,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(L.cx, feetY, rad, 0, Math.PI * 2)
      ctx.fill()
    }

    // 落脚接触阴影：脚与钢丝之间没有这层暗，人物就像「贴在画面上」
    depth.softShadow(ctx, L.cx, feetY + 1.5,
      L.charH * 0.19, Math.max(2.4, L.charH * 0.032), 0.30, '26,58,82')

    drawWalker(ctx, {
      x: L.cx + (idle ? Math.sin(this.clock * 0.7) * 1.2 : 0),
      y: feetY,
      scale: charScale,
      lean: lean,
      walkPhase: walkPhase,
      balance: balance,
      ropeTension: idle ? 0 : vm.ropeTension,
      speedRatio: idle ? 0 : clamp(vm.speed / 1.2, 0, 1),
      t: this.clock
    })

    // ---- 边缘警告 / 保险绳介入提示 ----
    if (screen === 'play') this._drawSceneFx(vm)

    // 轻微暗角：高空场景两侧压一点，视线自然收到人物和钢丝上
    depth.vignette(ctx, {
      w: L.W, h: L.H, color: '20,54,74', alpha: 0.16, cy: 0.56, inner: 0.42, outer: 0.96
    })
  }

  _drawWire() {
    const ctx = this.ctx
    const cx = this.L.cx
    const L = this.L

    // 透视参数 p：-0.62 已经越过画面底边（近端从屏幕外进来），0.995 贴近地平线
    // 线宽按 (1-p)^0.92 衰减；远端再分几段降透明度，让它自然融进雾里，
    // 不会出现“一根管子被切断”的硬边
    const P0 = -0.62
    const P1 = 0.995
    const sample = (p) => ({
      y: L.charY - (L.charY - L.farY) * p,
      half: Math.max(0.34, L.wireNearHalf * Math.pow(1 - p, 0.92)),
      k: 1 - p
    })

    // 钢丝投影（在下面的雾里留一点淡影，增加“悬空”感）
    ctx.beginPath()
    for (let i = 0; i <= 40; i++) {
      const p = P0 + (i / 40) * (0.9 - P0)
      const s = sample(p)
      if (i === 0) ctx.moveTo(cx, s.y)
      else ctx.lineTo(cx, s.y + 7 * s.k)
    }
    ctx.lineWidth = 1.6
    ctx.strokeStyle = 'rgba(60,90,110,0.07)'
    ctx.stroke()

    // 主体渐变（横向：左暗 → 窄高光 → 右暗）
    const w0 = sample(P0).half
    const grad = ctx.createLinearGradient(cx - w0 * 1.2, 0, cx + w0 * 1.2, 0)
    grad.addColorStop(0, '#2C3944')
    grad.addColorStop(0.28, '#5A6B78')
    grad.addColorStop(0.45, '#F1F8FC')
    grad.addColorStop(0.58, '#7B8C99')
    grad.addColorStop(1, '#232E38')

    // 分段：[起始 p, 结束 p, 整段透明度]
    const bands = [
      [P0, 0.84, 1],
      [0.84, 0.92, 0.72],
      [0.92, 0.97, 0.46],
      [0.97, P1, 0.24]
    ]

    bands.forEach((band) => {
      const a = band[0]
      const b = band[1]
      const alpha = band[2]
      const n = Math.max(6, Math.round((b - a) * 60))
      const list = []
      for (let i = 0; i <= n; i++) {
        const p = a + ((b - a) * i) / n
        list.push(sample(p))
      }
      const midP = (a + b) / 2

      ctx.save()
      ctx.globalAlpha = alpha

      // 远端剪影：细线在亮天空下会“消失”，加一圈由近及远的暗边
      const rim = clamp((midP - 0.32) / 0.62, 0, 1) * 0.6
      if (rim > 0.01) {
        const pad = 0.9 + 0.5 * (1 - midP)
        ctx.beginPath()
        for (let i = 0; i < list.length; i++) {
          const s = list[i]
          if (i === 0) ctx.moveTo(cx + s.half + pad, s.y)
          else ctx.lineTo(cx + s.half + pad, s.y)
        }
        for (let i = list.length - 1; i >= 0; i--) {
          const s = list[i]
          ctx.lineTo(cx - s.half - pad, s.y)
        }
        ctx.closePath()
        ctx.fillStyle = 'rgba(38,56,72,' + rim + ')'
        ctx.fill()
      }

      // 钢缆本体
      ctx.beginPath()
      for (let i = 0; i < list.length; i++) {
        const s = list[i]
        if (i === 0) ctx.moveTo(cx + s.half, s.y)
        else ctx.lineTo(cx + s.half, s.y)
      }
      for (let i = list.length - 1; i >= 0; i--) {
        ctx.lineTo(cx - list[i].half, list[i].y)
      }
      ctx.closePath()
      ctx.fillStyle = grad
      ctx.fill()

      // 顶部细高光（同样用锥形多边形，远端不会漂出线体）
      ctx.beginPath()
      for (let i = 0; i < list.length; i++) {
        const s = list[i]
        const h = s.half * 0.32
        const x = cx - s.half * 0.26
        if (i === 0) ctx.moveTo(x + h, s.y - s.half * 0.26)
        else ctx.lineTo(x + h, s.y - s.half * 0.26)
      }
      for (let i = list.length - 1; i >= 0; i--) {
        const s = list[i]
        const h = s.half * 0.32
        const x = cx - s.half * 0.26
        ctx.lineTo(x - h, s.y - s.half * 0.26)
      }
      ctx.closePath()
      ctx.fillStyle = 'rgba(255,255,255,0.58)'
      ctx.fill()

      ctx.restore()
    })

    // 钢丝纹理：随相机滚动的短斜纹（钢缆捻纹），近处明显、远处消失
    const scroll = (this.engine.distance || 0) * 6
    ctx.save()
    ctx.lineCap = 'round'
    for (let r = -2.05; r < 26; r += 0.55) {
      const rr2 = r - (scroll % 0.55)
      if (rr2 < -2.05) continue
      const d = this._depth(rr2)
      if (d.k < 0.16) continue
      const y = d.y
      const half = Math.max(0.7, L.wireNearHalf * Math.pow(d.k, 0.92))
      const a = clamp((d.k - 0.15) * 0.62, 0, 0.26)
      ctx.beginPath()
      ctx.moveTo(cx - half * 0.7, y)
      ctx.lineTo(cx + half * 0.55, y - half * 1.05)
      ctx.lineWidth = Math.max(0.5, half * 0.13)
      ctx.strokeStyle = 'rgba(28,44,58,' + a + ')'
      ctx.stroke()
    }
    ctx.restore()

    // 近端高光反射点（用 scale+arc 画椭圆，避免个别基础库没有 ctx.ellipse）
    const nearD = this._depth(-1.2)
    ctx.save()
    ctx.translate(cx - 1, nearD.y - 1.5)
    ctx.scale(2.0, 1.0)
    ctx.beginPath()
    ctx.arc(0, 0, 1, 0, Math.PI * 2)
    ctx.restore()
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.fill()
  }

  /** 是否处于“训练进行中”（用于决定场景里哪些辅助元素出现） */
  _isPlaying() {
    const s = this.engine && this.engine.state
    return s === 'PLAYING' || s === 'PAUSED' || s === 'COUNTDOWN'
  }

  _drawMarkers(distance) {
    const ctx = this.ctx
    const L = this.L
    const cx = L.cx
    const trackLength = Number(this.cfg.get('trackLength')) || 40
    const spacing = 5

    for (let m = 0; m <= trackLength + spacing; m += spacing) {
      const r = m - distance
      if (r < -1.2 || r > 30) continue
      const d = this._depth(r)
      const k = d.k
      if (k < 0.1) continue
      // 越靠近镜头越淡出，避免立柱突然从角色脚下冒出来
      const nearFade = r < 1.6 ? Math.max(0, r / 1.6) : 1
      if (nearFade < 0.04) continue
      const y = d.y
      const isMilestone = m % 10 === 0
      const side = isMilestone ? 1 : -1
      const x = cx + side * (L.corridor * k * 1.06)
      const h = (isMilestone ? 34 : 20) * k

      ctx.save()
      ctx.globalAlpha = clamp(k * 1.25, 0.15, 1) * nearFade

      // 立柱
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x, y - h)
      ctx.lineWidth = Math.max(0.8, 2.4 * k)
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx.lineCap = 'round'
      ctx.stroke()

      // 顶端小旗
      ctx.beginPath()
      ctx.moveTo(x, y - h)
      ctx.lineTo(x + side * 11 * k, y - h + 5 * k)
      ctx.lineTo(x, y - h + 10 * k)
      ctx.closePath()
      ctx.fillStyle = isMilestone ? 'rgba(255,183,94,0.95)' : 'rgba(120,214,199,0.95)'
      ctx.fill()

      // 里程碑数字牌（离镜头太近时不画，避免挡住角色；非游戏界面也不画）
      if (isMilestone && k > 0.2 && r > 2.2 && this._isPlaying()) {
        const bw = 26 * k
        const bh = 15 * k
        const bx = x - bw / 2
        const by = y - h - bh - 2 * k
        rr(ctx, bx, by, bw, bh, 4 * k)
        ctx.fillStyle = 'rgba(255,255,255,0.9)'
        ctx.fill()
        this._text(String(m), x, by + bh * 0.72, {
          size: Math.max(6, 10 * k), weight: '700', color: C.inkSoft, align: 'center'
        })
      }
      ctx.restore()
    }
  }

  _drawRope(vm, screen, feetY, charScale) {    const ctx = this.ctx
    const L = this.L
    const tension = screen === 'play' ? vm.ropeTension : 0
    const enabled = this.cfg.get('ropeEnabled')
    if (!enabled) return

    const anchorX = L.cx + this.W * 0.115
    const anchorY = -18
    const belt = beltWorld({
      x: L.cx,
      y: feetY === undefined ? L.charY : feetY,
      scale: charScale === undefined ? L.charScale : charScale,
      lean: screen === 'play' ? vm.lean : 0
    })

    // 未介入时绳子放松、自然下垂；介入时绷直并泛暖金色
    const slack = 1 - tension
    const midX = (anchorX + belt.x) / 2 + 22 * slack
    const midY = (anchorY + belt.y) / 2 + 30 * slack

    const path = () => {
      ctx.beginPath()
      ctx.moveTo(anchorX, anchorY)
      ctx.quadraticCurveTo(midX, midY, belt.x, belt.y)
    }

    // 绳索外发光（介入时更明显）
    if (tension > 0.05) {
      path()
      ctx.lineWidth = 5.5
      ctx.strokeStyle = 'rgba(255,205,120,' + (0.14 + tension * 0.24) + ')'
      ctx.stroke()
    }

    // 绳索：浅米色绳体 + 深色描边，天空背景下也能看清
    path()
    ctx.lineWidth = 2.8
    ctx.strokeStyle = 'rgba(74,62,44,' + (0.14 + tension * 0.16) + ')'
    ctx.stroke()

    path()
    ctx.lineWidth = 1.6
    ctx.strokeStyle = tension > 0.3
      ? 'rgba(255,206,128,0.98)'
      : 'rgba(247,238,216,' + (0.72 - slack * 0.16) + ')'
    ctx.stroke()

    // 绳索捻纹（只在介入时出现，避免平时抢镜）
    if (tension > 0.15) {
      ctx.save()
      path()
      ctx.setLineDash([2.5, 5])
      ctx.lineWidth = 0.9
      ctx.strokeStyle = 'rgba(120,96,60,' + (0.12 + tension * 0.24) + ')'
      ctx.stroke()
      ctx.restore()
    }

    // 与安全带连接处的挂钩
    ctx.beginPath()
    ctx.arc(belt.x, belt.y - 1, 2.6, 0, Math.PI * 2)
    ctx.fillStyle = tension > 0.3 ? 'rgba(255,214,140,1)' : 'rgba(240,229,206,0.95)'
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(74,62,44,0.35)'
    ctx.stroke()
  }

  _updateFx(vm, dt) {
    const step = Math.min(0.06, dt || 0.016)
    const warnTarget = vm.state === 'PLAYING' ? clamp((vm.load - vm.warnThreshold) / 0.3, 0, 1) : 0
    this.fx.warnGlow += (warnTarget - this.fx.warnGlow) * Math.min(1, step * 6)
    const ropeTarget = vm.ropeTension || 0
    this.fx.ropeFlash += (ropeTarget - this.fx.ropeFlash) * Math.min(1, step * 8)
    const stableTarget = vm.state === 'PLAYING' && vm.stable ? 1 : 0
    this.fx.stableGlow += (stableTarget - this.fx.stableGlow) * Math.min(1, step * 4)
  }

  _drawSceneFx(vm) {
    const ctx = this.ctx
    const W = this.W
    const H = this.H
    const warn = this.fx.warnGlow
    const rope = this.fx.ropeFlash

    // 失衡：左右边缘的柔和暖色渐晕（不使用闪烁）
    if (warn > 0.02) {
      const left = ctx.createLinearGradient(0, 0, W * 0.22, 0)
      left.addColorStop(0, 'rgba(226,85,60,' + (0.2 * warn) + ')')
      left.addColorStop(1, 'rgba(226,85,60,0)')
      ctx.fillStyle = left
      ctx.fillRect(0, H * 0.18, W * 0.22, H * 0.62)
      const right = ctx.createLinearGradient(W, 0, W * 0.78, 0)
      right.addColorStop(0, 'rgba(226,85,60,' + (0.2 * warn) + ')')
      right.addColorStop(1, 'rgba(226,85,60,0)')
      ctx.fillStyle = right
      ctx.fillRect(W * 0.78, H * 0.18, W * 0.22, H * 0.62)
    }

    // 保险绳介入：角色周围一圈金色保护环（细环，不遮挡角色）
    if (rope > 0.02) {
      const L = this.L
      const rx = L.charH * 0.42
      const ry = L.charH * 0.55
      const cxr = L.cx
      const cyr = L.charY - L.charH * 0.46
      ctx.save()
      ctx.translate(cxr, cyr)
      ctx.scale(rx, ry)
      ctx.beginPath()
      ctx.arc(0, 0, 1, 0, Math.PI * 2)
      ctx.restore()
      ctx.lineWidth = 2.2
      ctx.strokeStyle = 'rgba(255,206,126,' + (0.55 * rope) + ')'
      ctx.stroke()

      ctx.save()
      ctx.translate(cxr, cyr)
      ctx.scale(rx * 1.06, ry * 1.06)
      ctx.beginPath()
      ctx.arc(0, 0, 1, 0, Math.PI * 2)
      ctx.restore()
      ctx.lineWidth = 7
      ctx.strokeStyle = 'rgba(255,206,126,' + (0.14 * rope) + ')'
      ctx.stroke()

      // 「保险绳已介入」胶囊提示（画在角色上方，不与 HUD 冲突）
      const label = '保险绳已介入 · 正在扶稳'
      const bw = this._measure(label, 13, '600') + 34
      const bx = L.cx - bw / 2
      const by = L.charY - L.charH * 1.16
      rr(ctx, bx, by, bw, 26, 13)
      ctx.fillStyle = 'rgba(255,238,206,0.94)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(227,154,50,0.6)'
      ctx.lineWidth = 1
      ctx.stroke()
      this._text(label, L.cx, by + 18, { size: 13, weight: '700', color: '#8A5A16', align: 'center' })
    }
  }

  // ================================================================ HUD
  _drawHud(vm) {
    const ctx = this.ctx
    const W = this.W
    const H = this.H
    const L = this.L
    const top = this._safeTop()
    L.safeTop = top

    // ---------- 顶部三段信息条 ----------
    const barX = 14
    const barW = W - 28
    const barH = 54
    this._glass(barX, top, barW, barH, 18)

    const secW = barW / 3
    // 左：游戏名 + 难度
    this._text('走钢丝', barX + 16, top + 22, { size: 16, weight: '700', color: C.ink })
    const dl = '第 ' + vm.difficulty + ' 档'
    const dlw = this._measure(dl, 11, '600') + 14
    rr(ctx, barX + 16, top + 31, dlw, 16, 8)
    ctx.fillStyle = 'rgba(15,156,140,0.14)'
    ctx.fill()
    this._text(dl, barX + 16 + dlw / 2, top + 43, { size: 11, weight: '600', color: C.tealDeep, align: 'center' })

    // 分隔线
    this._vline(barX + secW, top + 12, barH - 24)
    this._vline(barX + secW * 2, top + 12, barH - 24)

    // 中：剩余时间
    this._text('剩余', barX + secW + 14, top + 20, { size: 11, weight: '500', color: C.inkMute })
    this._text(vm.timeLeftText, barX + secW + 14, top + 41, {
      size: 21, weight: '700', color: vm.timeLeft <= 10 ? C.danger : C.ink
    })

    // 右：得分
    this._text('得分', barX + secW * 2 + 14, top + 20, { size: 11, weight: '500', color: C.inkMute })
    this._text(String(vm.score), barX + secW * 2 + 14, top + 41, { size: 21, weight: '700', color: C.tealDeep })

    // ---------- 里程进度 ----------
    const py = top + barH + 10
    const pw = barW
    const prog = clamp(vm.progress, 0, 1)
    rr(ctx, barX, py, pw, 6, 3)
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.fill()
    if (prog > 0.002) {
      rr(ctx, barX, py, Math.max(6, pw * prog), 6, 3)
      const g = ctx.createLinearGradient(barX, 0, barX + pw, 0)
      g.addColorStop(0, '#43C3AF')
      g.addColorStop(1, '#0F9C8C')
      ctx.fillStyle = g
      ctx.fill()
    }
    // 已走距离 / 里程
    this._text(vm.distance.toFixed(1) + ' / ' + vm.trackLength + ' 米', barX, py + 22, {
      size: 11, weight: '600', color: C.inkSoft
    })

    // 右上角状态胶囊：数据来源 / 保险绳
    const chips = []
    if (vm.sim) chips.push({ t: '模拟数据', bg: 'rgba(227,154,50,0.92)', fg: '#FFF8EC' })
    else chips.push({ t: vm.stale ? '信号中断' : (vm.rateHz ? vm.rateHz + 'Hz' : '已连接'), bg: 'rgba(255,255,255,0.8)', fg: C.inkSoft })
    chips.push({
      t: '保险绳 ' + (vm.rope.enabled ? vm.rope.label : '关闭'),
      bg: vm.rope.state === 'ENGAGED' ? 'rgba(227,154,50,0.94)' : 'rgba(255,255,255,0.8)',
      fg: vm.rope.state === 'ENGAGED' ? '#FFF8EC' : C.inkSoft
    })
    let chipX = W - 14
    for (let i = chips.length - 1; i >= 0; i--) {
      const c = chips[i]
      const cw = this._measure(c.t, 11, '600') + 18
      chipX -= cw
      rr(ctx, chipX, py + 12, cw, 18, 9)
      ctx.fillStyle = c.bg
      ctx.fill()
      this._text(c.t, chipX + cw / 2, py + 25, { size: 11, weight: '600', color: c.fg, align: 'center' })
      chipX -= 6
    }

    // ---------- 平衡指示器 ----------
    this._drawBalance(vm)

    // ---------- 底部按钮 ----------
    const btnY = H - 62
    const btnH = 46
    this._button('pause', 16, btnY, 104, btnH, vm.state === 'PAUSED' ? '继续' : '暂停', {
      variant: 'glass', icon: vm.state === 'PAUSED' ? 'play' : 'pause', size: 14
    })
    this._button('exit', W - 16 - 104, btnY, 104, btnH, '退出', {
      variant: 'glass', icon: 'exit', size: 14
    })

    // 中间：前后方向（影响行进速度）
    const fwd = vm.ny
    const fwdText = fwd > 0.18 ? '前倾 +' + fwd.toFixed(1) : (fwd < -0.18 ? '后倾 ' + fwd.toFixed(1) : '重心居中')
    this._text(fwdText, W / 2, btnY + btnH * 0.62, {
      size: 13, weight: '600', color: C.inkSoft, align: 'center'
    })

    // ---------- 模拟控制 ----------
    if (vm.sim) this._drawSimPad(vm)

    // ---------- 暂停 / 中断 / 倒计时遮罩 ----------
    if (vm.state === 'PAUSED') this._drawPauseOverlay(vm)
    if (vm.state === 'SENSOR_ERROR') this._drawSensorOverlay(vm)
    if (vm.state === 'COUNTDOWN') this._drawCountdown(vm)
  }

  _drawBalance(vm) {
    const ctx = this.ctx
    const W = this.W
    const H = this.H
    const barW = Math.min(W - 72, 420)
    const barX = (W - barW) / 2
    const barY = H - 136
    const barH = 20
    const nx = clamp(vm.nx, -1, 1)
    const warn = clamp(vm.warnThreshold, 0.1, 0.95)

    // 状态文案（多个信号共同表达，不只靠颜色）
    let label = '平衡稳定'
    let color = C.tealDeep
    if (vm.rope.state === 'ENGAGED') {
      label = '保险绳介入 · 已扶稳'
      color = '#9A6414'
    } else if (Math.abs(nx) >= warn) {
      label = nx < 0 ? '向左侧失衡 · 请回正' : '向右侧失衡 · 请回正'
      color = C.danger
    } else if (Math.abs(nx) >= warn * 0.6) {
      label = nx < 0 ? '轻微左偏' : '轻微右偏'
      color = C.amber
    } else if (vm.balance < 0.45) {
      label = '重心不稳 · 放慢动作'
      color = C.amber
    }

    // 状态胶囊（带底衬，避免压在钢丝上看不清）
    const lw = this._measure(label, 14, '700') + 26
    const lh = 24
    const ly = barY - 12 - lh / 2
    rr(ctx, W / 2 - lw / 2, ly, lw, lh, lh / 2)
    ctx.fillStyle = 'rgba(255,255,255,0.82)'
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(19,41,58,0.06)'
    ctx.stroke()
    this._text(label, W / 2, barY - 12, { size: 14, weight: '700', color: color, align: 'center' })

    // 轨道
    rr(ctx, barX, barY, barW, barH, barH / 2)
    ctx.fillStyle = 'rgba(255,255,255,0.78)'
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(19,41,58,0.08)'
    ctx.stroke()

    // 安全带（中心，到警戒阈值的 82%）
    const safeHalf = (barW / 2) * warn * 0.82
    rr(ctx, W / 2 - safeHalf, barY + 3, safeHalf * 2, barH - 6, (barH - 6) / 2)
    ctx.fillStyle = 'rgba(63,195,176,0.24)'
    ctx.fill()

    // 警戒区间（安全带之外到边界）
    const edge = barW / 2
    ;[-1, 1].forEach((s) => {
      const x1 = W / 2 + s * safeHalf
      const x2 = W / 2 + s * (edge - 2)
      const g = ctx.createLinearGradient(x1, 0, x2, 0)
      g.addColorStop(0, 'rgba(227,154,50,0.05)')
      g.addColorStop(1, 'rgba(223,85,64,0.22)')
      ctx.beginPath()
      ctx.moveTo(x1, barY + 3)
      ctx.lineTo(x2, barY + 3)
      ctx.lineTo(x2, barY + barH - 3)
      ctx.lineTo(x1, barY + barH - 3)
      ctx.closePath()
      ctx.fillStyle = g
      ctx.fill()
    })

    // 中线
    ctx.beginPath()
    ctx.moveTo(W / 2, barY - 3)
    ctx.lineTo(W / 2, barY + barH + 3)
    ctx.lineWidth = 1.4
    ctx.strokeStyle = 'rgba(19,41,58,0.25)'
    ctx.stroke()

    // 刻度
    for (let i = -2; i <= 2; i++) {
      const x = W / 2 + (i / 2) * (edge - 6)
      ctx.beginPath()
      ctx.moveTo(x, barY + barH - 1)
      ctx.lineTo(x, barY + barH + (i === 0 ? 5 : 3))
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(19,41,58,0.18)'
      ctx.stroke()
    }

    // 当前位置标记
    const mx = W / 2 + nx * (edge - 8)
    const my = barY + barH / 2
    ctx.beginPath()
    ctx.arc(mx, my, 10, 0, Math.PI * 2)
    ctx.fillStyle = '#FFFFFF'
    ctx.fill()
    ctx.lineWidth = 3
    ctx.strokeStyle = Math.abs(nx) >= warn ? C.danger : (Math.abs(nx) >= warn * 0.6 ? C.amber : C.teal)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(mx, my, 3.2, 0, Math.PI * 2)
    ctx.fillStyle = Math.abs(nx) >= warn ? C.danger : C.teal
    ctx.fill()

    // 左右文字（不只依赖颜色）
    this._text('左', barX - 2, barY + barH - 5, { size: 11, weight: '600', color: C.inkMute, align: 'right' })
    this._text('右', barX + barW + 2, barY + barH - 5, { size: 11, weight: '600', color: C.inkMute })
  }

  _drawSimPad(vm) {
    const W = this.W
    const H = this.H
    const x = 12
    const y0 = Math.max(this._safeTop() + 108, H * 0.33)
    const bw = 44
    const short = H < 680
    const bh = short ? 30 : 34
    const gap = short ? 5 : 6
    const items = [
      { id: 'sim:left', t: '←', label: '左' },
      { id: 'sim:right', t: '→', label: '右' },
      { id: 'sim:up', t: '↑', label: '前' },
      { id: 'sim:down', t: '↓', label: '后' },
      { id: 'sim:center', t: '◎', label: '回中' },
      { id: 'sim:rope', t: '⚑', label: '触发绳索' }
    ]
    items.forEach((it, i) => {
      const y = y0 + i * (bh + gap)
      this._miniButton(it.id, x, y, bw, bh, it.t)
      this._text(it.label, x + bw + 6, y + bh * 0.66, { size: 10, weight: '600', color: 'rgba(19,41,58,0.55)' })
    })
    this._text('模拟', x + 2, y0 - 8, { size: 10, weight: '700', color: 'rgba(19,41,58,0.45)' })
    void vm
  }

  _drawCountdown(vm) {
    const ctx = this.ctx
    const W = this.W
    const H = this.H
    const n = Math.max(0, Math.ceil(vm.countdown))
    const frac = 1 - (vm.countdown - Math.floor(vm.countdown))
    const text = n > 0 ? String(n) : '开始'
    const scale = 1 + (1 - frac) * 0.18

    ctx.save()
    ctx.globalAlpha = clamp(frac * 1.4, 0, 1)
    this._text(text, W / 2, H * 0.44, {
      size: 86 * scale, weight: '800', color: 'rgba(255,255,255,0.96)', align: 'center', shadow: true
    })
    this._text('保持身体居中，扶稳重心', W / 2, H * 0.44 + 52, {
      size: 14, weight: '600', color: 'rgba(255,255,255,0.92)', align: 'center'
    })
    ctx.restore()
  }

  _drawPauseOverlay(vm) {
    void vm
    const ctx = this.ctx
    const W = this.W
    const H = this.H
    ctx.fillStyle = 'rgba(10,28,40,0.42)'
    ctx.fillRect(0, 0, W, H)

    const pw = Math.min(W - 64, 320)
    const ph = 208
    const px = (W - pw) / 2
    const py = (H - ph) / 2 - 20
    this._panel(px, py, pw, ph)

    this._text('已暂停', W / 2, py + 46, { size: 24, weight: '700', color: C.ink, align: 'center' })
    this._text('训练计时已停止，成绩不会变化', W / 2, py + 72, {
      size: 12, weight: '500', color: C.inkMute, align: 'center'
    })

    this._button('resume', px + 24, py + 92, pw - 48, 46, '继续训练', { variant: 'primary', icon: 'play' })
    this._button('restart', px + 24, py + 148, (pw - 60) / 2, 40, '重新开始', { variant: 'ghost', size: 13 })
    this._button('quit', px + 24 + (pw - 60) / 2 + 12, py + 148, (pw - 60) / 2, 40, '结束本局', { variant: 'ghost', size: 13 })
  }

  _drawSensorOverlay(vm) {
    const ctx = this.ctx
    const W = this.W
    const H = this.H
    ctx.fillStyle = 'rgba(10,28,40,0.5)'
    ctx.fillRect(0, 0, W, H)

    const pw = Math.min(W - 56, 330)
    const ph = 236
    const px = (W - pw) / 2
    const py = (H - ph) / 2 - 16
    this._panel(px, py, pw, ph, { accent: C.amber })

    this._text('传感器信号中断', W / 2, py + 44, { size: 20, weight: '700', color: C.ink, align: 'center' })
    this._text('训练已自动暂停，本次中断会计入记录', W / 2, py + 70, {
      size: 12, weight: '500', color: C.inkMute, align: 'center'
    })
    this._text('已中断 ' + (vm.interrupted.totalSec || 0).toFixed(1) + ' 秒', W / 2, py + 92, {
      size: 12, weight: '600', color: C.amber, align: 'center'
    })

    this._button('reconnect', px + 24, py + 110, pw - 48, 44, '去重新连接', { variant: 'primary', icon: 'bluetooth' })
    this._button('resume', px + 24, py + 164, (pw - 60) / 2, 40, vm.canResume ? '继续训练' : '等待数据…', {
      variant: 'ghost', size: 13, disabled: !vm.canResume
    })
    this._button('quit', px + 24 + (pw - 60) / 2 + 12, py + 164, (pw - 60) / 2, 40, '结束本局', {
      variant: 'ghost', size: 13
    })
  }

  // ================================================================ 介绍页
  _drawIntro(vm) {
    const ctx = this.ctx
    const W = this.W
    const H = this.H

    // 顶部轻微压暗，保证白色标题在亮天空上依然清晰
    const topScrim = ctx.createLinearGradient(0, 0, 0, H * 0.32)
    topScrim.addColorStop(0, 'rgba(12,38,54,0.16)')
    topScrim.addColorStop(1, 'rgba(12,38,54,0)')
    ctx.fillStyle = topScrim
    ctx.fillRect(0, 0, W, H * 0.32)

    // 下半部用柔和渐变托住内容，但不把远山/树林压成灰
    const scrim = ctx.createLinearGradient(0, H * 0.3, 0, H)
    scrim.addColorStop(0, 'rgba(12,38,54,0)')
    scrim.addColorStop(0.55, 'rgba(12,38,54,0.10)')
    scrim.addColorStop(1, 'rgba(8,26,40,0.38)')
    ctx.fillStyle = scrim
    ctx.fillRect(0, H * 0.3, W, H * 0.7)

    // 标题
    this._text('走钢丝', W / 2, H * 0.215, {
      size: Math.min(52, W * 0.145), weight: '800', color: '#FFFFFF', align: 'center', shadow: true
    })
    this._text('体感平衡训练 · 第 ' + vm.difficulty + ' 档', W / 2, H * 0.215 + 30, {
      size: 13, weight: '600', color: 'rgba(255,255,255,0.9)', align: 'center'
    })

    // 状态胶囊
    const chips = []
    chips.push({
      t: vm.sim ? '模拟数据' : (vm.stale ? '传感器未连接' : '传感器已连接'),
      fg: vm.sim ? '#FFF6E6' : '#FFFFFF',
      bg: vm.sim ? 'rgba(227,154,50,0.92)' : (vm.stale ? 'rgba(19,41,58,0.5)' : 'rgba(15,156,140,0.9)')
    })
    chips.push({ t: '时长 ' + (Number(this.cfg.get('durationSec')) || 90) + ' 秒', fg: C.inkSoft, bg: 'rgba(255,255,255,0.86)' })
    chips.push({ t: '里程 ' + (Number(this.cfg.get('trackLength')) || 40) + ' 米', fg: C.inkSoft, bg: 'rgba(255,255,255,0.86)' })
    let cx0 = W / 2 - 4
    const chipYs = H * 0.215 + 48
    const widths = chips.map((c) => this._measure(c.t, 11, '600') + 20)
    const totalW = widths.reduce((a, b) => a + b, 0) + (chips.length - 1) * 8
    cx0 = (W - totalW) / 2
    chips.forEach((c, i) => {
      rr(ctx, cx0, chipYs, widths[i], 22, 11)
      ctx.fillStyle = c.bg
      ctx.fill()
      this._text(c.t, cx0 + widths[i] / 2, chipYs + 15, { size: 11, weight: '600', color: c.fg, align: 'center' })
      cx0 += widths[i] + 8
    })

    // 规则卡
    const cardY = chipYs + 36
    const cardW = Math.min(W - 40, 380)
    const cardX = (W - cardW) / 2
    const cardH = 126
    this._glass(cardX, cardY, cardW, cardH, 20)

    const rules = [
      { t: '身体居中，角色才走得稳', d: '身体左右偏移会带动角色倾斜' },
      { t: '失衡时不要急，慢慢回正', d: '偏移越大越久，平衡恢复越慢' },
      { t: '保险绳会保护你', d: '越界时绳索轻拉回中线，不会直接失败' }
    ]
    rules.forEach((r, i) => {
      const ry = cardY + 26 + i * 34
      ctx.beginPath()
      ctx.arc(cardX + 24, ry - 4, 7, 0, Math.PI * 2)
      ctx.fillStyle = i === 2 ? 'rgba(227,154,50,0.18)' : 'rgba(15,156,140,0.14)'
      ctx.fill()
      this._text(String(i + 1), cardX + 24, ry - 0.5, {
        size: 10, weight: '700', color: i === 2 ? C.amber : C.tealDeep, align: 'center'
      })
      this._text(r.t, cardX + 40, ry, { size: 13, weight: '700', color: C.ink })
      this._text(r.d, cardX + 40, ry + 15, { size: 11, weight: '500', color: C.inkMute })
    })

    // 主按钮
    const btnW = Math.min(W - 80, 300)
    const btnX = (W - btnW) / 2
    const btnY = cardY + cardH + 22
    this._button('start', btnX, btnY, btnW, 52, '开始训练', { variant: 'primary', icon: 'play', size: 17 })

    // 次级按钮
    const subY = btnY + 64
    const subW = (btnW - 12) / 2
    this._button('settings', btnX, subY, subW, 40, '训练设置', { variant: 'glass', icon: 'gear', size: 13 })
    this._button('records', btnX + subW + 12, subY, subW, 40, '训练记录', { variant: 'glass', icon: 'list', size: 13 })

    // 模拟开关放在最底部，避开角色与按钮
    if (!vm.sim) {
      this._linkButton('sim:on', W / 2 - 70, H - 78, 140, 26, '没有设备？用模拟数据')
    } else {
      this._linkButton('sim:off', W / 2 - 64, H - 78, 128, 26, '关闭模拟数据')
    }

    this._text('建议在治疗师或家属陪同下训练', W / 2, H - 32, {
      size: 10, weight: '500', color: 'rgba(255,255,255,0.62)', align: 'center'
    })
  }

  // ================================================================ 准备页
  _drawPrepare(vm) {
    const ctx = this.ctx
    const W = this.W
    const H = this.H
    const top = this._safeTop()

    const scrim = ctx.createLinearGradient(0, 0, 0, H)
    scrim.addColorStop(0, 'rgba(10,32,46,0.55)')
    scrim.addColorStop(0.5, 'rgba(10,32,46,0.34)')
    scrim.addColorStop(1, 'rgba(8,26,40,0.62)')
    ctx.fillStyle = scrim
    ctx.fillRect(0, 0, W, H)

    this._text('设备准备', 24, top + 34, { size: 26, weight: '800', color: '#FFFFFF', shadow: true })
    this._text('传感器卡在胸带上，胸带绕到腋下最高点，固定好就能开始', 24, top + 58, {
      size: 12, weight: '500', color: 'rgba(255,255,255,0.82)'
    })

    // ---- 卡片 1：连接状态 ----
    const cardW = W - 32
    const cardX = 16
    let cy = top + 76
    this._glass(cardX, cy, cardW, 76, 18)

    const connected = !vm.stale
    ctx.beginPath()
    ctx.arc(cardX + 26, cy + 30, 5, 0, Math.PI * 2)
    ctx.fillStyle = vm.sim ? C.amber : (connected ? C.teal : C.danger)
    ctx.fill()

    this._text('WT9011 传感器', cardX + 40, cy + 34, { size: 14, weight: '700', color: C.ink })
    let status = '未连接'
    if (vm.sim) status = '模拟模式（不使用真实数据）'
    else if (connected) status = '已连接' + (vm.rateHz ? ' · ' + vm.rateHz + 'Hz' : '')
    this._text(status, cardX + 40, cy + 54, {
      size: 11.5, weight: '500', color: connected && !vm.sim ? C.tealDeep : C.inkMute
    })
    this._button(connected ? 'refresh' : 'connect', cardX + cardW - 92, cy + 22, 76, 32,
      connected ? '重新连接' : '连接设备', { variant: 'ghost', size: 11.5 })

    // ---- 卡片 2：佩戴位置 ----
    cy += 88
    const wearH = Math.min(150, H * 0.2)
    this._glass(cardX, cy, cardW, wearH, 18)
    this._text('佩戴位置', cardX + 18, cy + 24, { size: 13, weight: '700', color: C.ink })
    this._drawWearFigure(cardX + 60, cy + wearH * 0.63, Math.min(94, wearH * 0.64))
    this._text('传感器卡在胸带上，', cardX + 118, cy + 46, { size: 11.5, weight: '500', color: C.inkSoft })
    this._text('带子从腋下最高点绕一圈固定。', cardX + 118, cy + 64, { size: 11.5, weight: '500', color: C.inkSoft })
    this._text('身体保持自然直立，', cardX + 118, cy + 88, { size: 11.5, weight: '500', color: C.inkSoft })
    this._text('不要刻意挺胸或屏气。', cardX + 118, cy + 106, { size: 11.5, weight: '500', color: C.inkSoft })

    // ---- 零点：只报状态，不做独立标定 ----
    // 零点全 App 只有一份（utils/zero.js），统一在「零点标定」页设置。
    // 这里若再放一套 3 秒采样标定，等于让用户对同一件事标两遍。
    cy += wearH + 16
    const z = vm.zero || { roll: 0, pitch: 0, set: false }
    const fmtDeg = (v) => (v >= 0 ? '+' : '') + (Math.round(v * 10) / 10).toFixed(1) + '°'
    if (z.set) {
      this._text('当前零点 ' + fmtDeg(z.roll) + ' / ' + fmtDeg(z.pitch), cardX + 4, cy + 8, {
        size: 11.5, weight: '500', color: 'rgba(255,255,255,0.72)'
      })
    } else {
      this._text('还没设置零点，读数按传感器原始角度算', cardX + 4, cy + 8, {
        size: 11.5, weight: '500', color: C.amber
      })
    }
    this._linkButton('zero:set', cardX + cardW - 72, cy - 2, 72, 24, z.set ? '重设' : '去标定')

    // ---- 底部按钮 ----
    const btnH = 50
    const by = H - 108
    const bw = (W - 32 - 12) / 2
    this._button('back', 16, by, bw, btnH, '返回', { variant: 'glass', icon: 'back', size: 14 })
    // 不再拦零点：有没有零点都能进，读数是否合理由标定页负责
    const ready = connected || vm.sim
    this._button('enter', 16 + bw + 12, by, bw, btnH, '进入游戏', {
      variant: 'primary', icon: 'play', size: 15, disabled: !ready
    })

    if (!ready) {
      this._text('请先连接传感器，或打开模拟数据', W / 2, by + btnH + 18, {
        size: 11, weight: '500', color: 'rgba(255,255,255,0.8)', align: 'center'
      })
    }

    // 模拟开关
    if (!vm.sim) {
      this._linkButton('sim:on', W - 116, top + 26, 100, 24, '用模拟数据')
    } else {
      this._linkButton('sim:off', W - 116, top + 26, 100, 24, '关闭模拟')
    }
  }

  _drawWearFigure(x, y, h) {
    const ctx = this.ctx
    const s = h / 100
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(s, s)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const body = 'rgba(19,41,58,0.16)'
    const edge = 'rgba(19,41,58,0.32)'

    // 腿
    ctx.strokeStyle = body
    ctx.lineWidth = 8
    ctx.beginPath()
    ctx.moveTo(-2, 2)
    ctx.lineTo(-9, 26)
    ctx.lineTo(-10, 40)
    ctx.moveTo(2, 2)
    ctx.lineTo(9, 26)
    ctx.lineTo(10, 40)
    ctx.stroke()

    // 手臂（略张开，露出腋下）
    ctx.lineWidth = 6.5
    ctx.beginPath()
    ctx.moveTo(-13, -42)
    ctx.lineTo(-20, -24)
    ctx.lineTo(-24, -6)
    ctx.moveTo(13, -42)
    ctx.lineTo(20, -24)
    ctx.lineTo(24, -6)
    ctx.stroke()

    // 躯干
    ctx.beginPath()
    ctx.moveTo(-14, -46)
    ctx.quadraticCurveTo(-17, -26, -11, -8)
    ctx.quadraticCurveTo(-6, 0, 0, 1)
    ctx.quadraticCurveTo(6, 0, 11, -8)
    ctx.quadraticCurveTo(17, -26, 14, -46)
    ctx.quadraticCurveTo(0, -51, -14, -46)
    ctx.closePath()
    ctx.fillStyle = body
    ctx.fill()
    ctx.lineWidth = 1.4
    ctx.strokeStyle = edge
    ctx.stroke()

    // 头
    ctx.beginPath()
    ctx.arc(0, -60, 10.5, 0, Math.PI * 2)
    ctx.fillStyle = body
    ctx.fill()
    ctx.strokeStyle = edge
    ctx.lineWidth = 1.4
    ctx.stroke()

    // 胸带：从腋下最高点这一圈绕过去（正面看是一道横带）
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(-13.5, -36)
    ctx.quadraticCurveTo(0, -34.6, 13.5, -36)
    ctx.lineTo(13.5, -30)
    ctx.quadraticCurveTo(0, -28.6, -13.5, -30)
    ctx.closePath()
    ctx.fillStyle = 'rgba(19,41,58,0.24)'
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(19,41,58,0.3)'
    ctx.stroke()
    ctx.restore()

    // 传感器：正面卡在胸带上（宽度略大于带高，能认出是一台设备）
    ctx.beginPath()
    ctx.rect(-4.2, -35, 8.4, 5.2)
    ctx.fillStyle = C.amber
    ctx.fill()
    ctx.lineWidth = 1.1
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'
    ctx.stroke()
    // 指示灯：一个小点
    ctx.beginPath()
    ctx.arc(2.4, -32.4, 0.8, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fill()

    // 说明文字就在右侧，不用再拉一条很短的指示线（会像悬空的虚线）
    ctx.restore()
  }

  // ================================================================ 结算页
  _drawResult(vm) {
    const ctx = this.ctx
    const W = this.W
    const H = this.H
    const sum = this.engine.summary
    if (!sum) return

    ctx.fillStyle = 'rgba(9,28,40,0.55)'
    ctx.fillRect(0, 0, W, H)

    const pw = Math.min(W - 28, 400)
    const px = (W - pw) / 2
    const py = Math.max(this._safeTop() + 8, H * 0.045)
    const ph = Math.min(H - py - 30, 592)
    this._panel(px, py, pw, ph)

    const aborted = this.engine.state === 'ABORTED'
    const gridX = px + 24
    const gridW = pw - 48

    // 纵向节奏按可用高度分三档：常规 / 紧凑 / 迷你（迷你档把摆动分布并成一行）
    const compact = ph < 500
    const tight = !compact && ph < 566
    let Y
    if (compact) {
      Y = { score: 96, reason: 120, breakdown: 138, metrics: 158, mgap: 33, sway: 272, sgap: 13, note: 300, cond: 316, tiles: 0, inline: true }
    } else if (tight) {
      Y = { score: 100, reason: 124, breakdown: 142, metrics: 162, mgap: 34, sway: 278, sgap: 13, note: 362, cond: 378, tiles: 0, inline: false }
    } else {
      Y = { score: 112, reason: 136, breakdown: 154, metrics: 174, mgap: 38, sway: 302, sgap: 15, note: 398, cond: 414, tiles: 430, inline: false }
    }

    // ---------------- 标题 + 评级 ----------------
    this._text(aborted ? '训练已中止' : '训练结束', gridX, py + 38, {
      size: 19, weight: '700', color: C.ink
    })
    this._text(sum.dataSource === 'simulation' ? '模拟数据 · 仅用于功能验证' : '真实传感器数据',
      gridX, py + 58, {
        size: 10.5, weight: '600',
        color: sum.dataSource === 'simulation' ? C.amber : C.tealDeep
      })

    const ringX = px + pw - 56
    const ringY = py + 50
    this._gradeRing(ringX, ringY, 24, sum.grade)
    this._text(sum.grade, ringX, ringY + 1, {
      size: 19, weight: '800', color: C.tealDeep, align: 'center'
    })
    this._text('游戏评级', ringX, ringY + 40, { size: 9, weight: '600', color: C.inkMute, align: 'center' })

    // ---------------- 分数 ----------------
    let y = py + Y.score
    const scoreStr = String(sum.score)
    this._text(scoreStr, gridX, y, { size: tight ? 34 : 40, weight: '800', color: C.ink })
    const sw = this._measure(scoreStr, tight ? 34 : 40, '800')
    this._text('分', gridX + sw + 6, y, { size: 12, weight: '600', color: C.inkMute })

    const reasonText = sum.completed ? '走完全程' : (aborted ? '手动结束' : '时间到')
    this._text('走完 ' + sum.distance.toFixed(1) + ' / ' + sum.trackLength + ' 米 · ' +
      reasonText + ' · ' + this._fmtSec(sum.durationSec), gridX, py + Y.reason, {
      size: 10.5, weight: '500', color: C.inkSoft
    })

    const bd = sum.breakdown || {}
    this._text('距离 ' + (bd.distanceScore || 0) + ' · 稳定 ' + (bd.stableScore || 0) +
      ' · 完成 ' + (bd.finishBonus || 0) + ' · 扣分 ' + (bd.penalty || 0),
      gridX, py + Y.breakdown, { size: 10, weight: '500', color: C.inkMute })

    // ---------------- 指标 ----------------
    y = py + Y.metrics
    const cellW = gridW / 2
    const metrics = [
      { k: '平衡稳定时间', v: sum.stableSec.toFixed(1) + ' 秒' },
      { k: '偏离次数', v: sum.offCount + ' 次' },
      { k: '保险绳触发', v: sum.ropeTriggers + ' 次' },
      { k: '最高连击', v: 'x' + (bd.maxCombo || 0) },
      { k: '轨迹长度（代理）', v: sum.pathLength.toFixed(1) },
      { k: '数据中断', v: sum.interrupted ? sum.interruptedSec.toFixed(1) + ' 秒' : '无' }
    ]
    metrics.forEach((m, i) => {
      const mx = gridX + (i % 2) * cellW
      const my = y + Math.floor(i / 2) * Y.mgap
      this._text(m.k, mx, my + 11, { size: 10, weight: '500', color: C.inkMute })
      this._text(m.v, mx, my + 29, { size: 14, weight: '700', color: C.ink })
    })

    // ---------------- 摆动分布（横向行，避免标签挤压） ----------------
    y = py + Y.sway
    const rows = (sum.sway || []).slice(0, 5)
    if (Y.inline) {
      // 迷你档：单行概述，保证小屏也能看到分布概况
      const brief = rows
        .filter((b) => (b.ratio || 0) > 0.005)
        .map((b) => b.label + ' ' + Math.round(clamp(b.ratio || 0, 0, 1) * 100) + '%')
        .join(' · ') || '集中在极小幅度'
      this._text('摆动分布', gridX, y, { size: 10, weight: '600', color: C.inkMute })
      this._text(brief, gridX, y + 16, { size: 9.5, weight: '500', color: C.inkSoft })
    } else {
      this._text('摆动幅度分布（归一化）', gridX, y, { size: 10, weight: '600', color: C.inkMute })
      rows.forEach((b, i) => {
        const ry = y + 14 + i * Y.sgap
        const ratio = clamp(b.ratio || 0, 0, 1)
        this._text(b.label, gridX, ry + 6, { size: 9.5, weight: '500', color: C.inkMute })
        const tx = gridX + 44
        const tw = gridW - 44 - 34
        rr(ctx, tx, ry, tw, 6, 3)
        ctx.fillStyle = 'rgba(19,41,58,0.06)'
        ctx.fill()
        if (ratio > 0.01) {
          rr(ctx, tx, ry, Math.max(3, tw * ratio), 6, 3)
          ctx.fillStyle = i >= 4 ? 'rgba(223,85,64,0.75)' : (i >= 2 ? 'rgba(227,154,50,0.75)' : 'rgba(63,195,176,0.85)')
          ctx.fill()
        }
        this._text(Math.round(ratio * 100) + '%', gridX + gridW, ry + 6, {
          size: 9.5, weight: '600', color: C.inkMute, align: 'right'
        })
      })
    }

    this._text(gridW < 300 ? '轨迹与摆动为姿态代理指标，非真实位移。'
      : '轨迹与摆动为姿态代理指标，不是真实位移；成绩仅用于训练对比。', gridX, py + Y.note, {
      size: 9, weight: '500', color: 'rgba(19,41,58,0.42)'
    })

    // ---------------- 本局条件 ----------------
    const rc = sum.rangeConfig || {}
    this._text('左右 ±' + rc.left + '° · 前后 ±' + rc.forward + '° · 灵敏度 ' + rc.sensitivity +
      ' · 保险绳 ' + (this.cfg.get('ropeEnabled') ? '开' : '关'), gridX, py + Y.cond, {
      size: 9, weight: '500', color: 'rgba(19,41,58,0.42)'
    })

    // ---------------- 分项得分（短屏省略，文案已在上方一行列出） ----------------
    if (Y.tiles) {
      const tiles = [
        { k: '距离分', v: bd.distanceScore || 0 },
        { k: '稳定分', v: bd.stableScore || 0 },
        { k: '完成奖励', v: bd.finishBonus || 0 },
        { k: '扣分', v: bd.penalty || 0 }
      ]
      const tileW = (gridW - 9 * 3) / 4
      const tileY = py + Y.tiles
      tiles.forEach((t, i) => {
        const tx = gridX + i * (tileW + 9)
        rr(ctx, tx, tileY, tileW, 42, 10)
        ctx.fillStyle = 'rgba(19,41,58,0.035)'
        ctx.fill()
        this._text(String(t.v), tx + tileW / 2, tileY + 20, {
          size: 14, weight: '700', color: i === 3 ? C.inkMute : C.ink, align: 'center'
        })
        this._text(t.k, tx + tileW / 2, tileY + 34, {
          size: 9.5, weight: '500', color: C.inkMute, align: 'center'
        })
      })
    }

    // ---------------- 按钮 ----------------
    const bh2 = tight ? 40 : 44
    const by = py + ph - bh2 - 16
    this._button('again', gridX, by, gridW, bh2, '再来一局', { variant: 'primary', icon: 'refresh', size: 15 })
    const halfW = (gridW - 10) / 2
    this._button('records', gridX, by - 44, halfW, 34, '训练记录', { variant: 'ghost', icon: 'list', size: 12 })
    this._button('home', gridX + halfW + 10, by - 44, halfW, 34, '返回首页', { variant: 'ghost', icon: 'home', size: 12 })
  }

  _gradeRing(x, y, r, grade) {
    const ctx = this.ctx
    const ratio = grade === 'S' ? 0.95 : grade === 'A' ? 0.75 : grade === 'B' ? 0.55 : 0.32
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.lineWidth = 5
    ctx.strokeStyle = 'rgba(15,156,140,0.12)'
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio)
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    ctx.strokeStyle = C.teal
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x, y, r - 9, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(15,156,140,0.07)'
    ctx.fill()
  }

  // ================================================================ 通用控件
  _text(str, x, y, o) {
    const opt = o || {}
    const ctx = this.ctx
    ctx.save()
    ctx.font = (opt.weight || '400') + ' ' + (opt.size || 12) + 'px "PingFang SC", "Helvetica Neue", Helvetica, Arial, sans-serif'
    ctx.textAlign = opt.align || 'left'
    ctx.textBaseline = opt.baseline || 'alphabetic'
    if (opt.alpha !== undefined) ctx.globalAlpha = opt.alpha
    if (opt.shadow) {
      ctx.shadowColor = 'rgba(8,26,40,0.35)'
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

  _vline(x, y, h) {
    const ctx = this.ctx
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x, y + h)
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(19,41,58,0.07)'
    ctx.stroke()
  }

  _glass(x, y, w, h, r) {
    const ctx = this.ctx
    ctx.save()
    ctx.shadowColor = 'rgba(12,38,54,0.10)'
    ctx.shadowBlur = 14
    ctx.shadowOffsetY = 4
    rr(ctx, x, y, w, h, r)
    ctx.fillStyle = C.card
    ctx.fill()
    ctx.restore()

    rr(ctx, x, y, w, h, r)
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'
    ctx.stroke()
  }

  _panel(x, y, w, h, o) {
    const opt = o || {}
    const ctx = this.ctx
    ctx.save()
    ctx.shadowColor = 'rgba(6,22,34,0.3)'
    ctx.shadowBlur = 26
    ctx.shadowOffsetY = 10
    rr(ctx, x, y, w, h, 24)
    const g = ctx.createLinearGradient(0, y, 0, y + h)
    g.addColorStop(0, 'rgba(255,255,255,0.98)')
    g.addColorStop(1, 'rgba(246,250,250,0.98)')
    ctx.fillStyle = g
    ctx.fill()
    ctx.restore()

    rr(ctx, x, y, w, h, 24)
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.stroke()

    if (opt.accent) {
      ctx.beginPath()
      ctx.moveTo(x + 24, y + 1)
      ctx.lineTo(x + w - 24, y + 1)
      ctx.lineWidth = 3
      ctx.strokeStyle = opt.accent
      ctx.globalAlpha = 0.65
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

    const r = h / 2
    if (opt.variant === 'primary') {
      ctx.save()
      ctx.shadowColor = disabled ? 'rgba(12,38,54,0.05)' : 'rgba(15,156,140,0.35)'
      ctx.shadowBlur = disabled ? 2 : 16
      ctx.shadowOffsetY = disabled ? 1 : 6
      rr(ctx, x, y, w, h, r)
      const g = ctx.createLinearGradient(0, y, 0, y + h)
      if (disabled) {
        g.addColorStop(0, '#CBD8DD')
        g.addColorStop(1, '#B9C8CE')
      } else {
        g.addColorStop(0, '#25B7A3')
        g.addColorStop(1, '#0A8B7E')
      }
      ctx.fillStyle = g
      ctx.fill()
      ctx.restore()
    } else if (opt.variant === 'glass') {
      rr(ctx, x, y, w, h, r)
      ctx.fillStyle = disabled ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.82)'
      ctx.fill()
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.stroke()
    } else {
      rr(ctx, x, y, w, h, r)
      ctx.fillStyle = disabled ? 'rgba(240,244,246,1)' : 'rgba(255,255,255,0.96)'
      ctx.fill()
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(19,41,58,0.10)'
      ctx.stroke()
    }

    const fg = opt.variant === 'primary' ? '#FFFFFF' : C.ink
    const iconColor = opt.variant === 'primary' ? '#FFFFFF' : (opt.variant === 'glass' ? C.ink : C.ink)
    const size = opt.size || 14
    const hasIcon = !!opt.icon
    const textW = this._measure(label, size, '700')
    const iconW = hasIcon ? size + 8 : 0
    const totalW = textW + iconW
    const startX = cxp - totalW / 2

    if (hasIcon) {
      this._icon(opt.icon, startX, cyp, size * 0.95, iconColor)
    }
    this._text(label, startX + iconW, cyp + size * 0.36, {
      size: size, weight: '700', color: fg
    })

    ctx.restore()

    if (!disabled) this.buttons.push({ id: id, x: x, y: y, w: w, h: h })
  }

  _miniButton(id, x, y, w, h, label) {
    const ctx = this.ctx
    const pressed = this.pressId === id && (this.nowMs - this.pressAt < 150)
    rr(ctx, x, y, w, h, 10)
    ctx.fillStyle = pressed ? 'rgba(15,156,140,0.9)' : 'rgba(255,255,255,0.82)'
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = pressed ? 'rgba(15,156,140,1)' : 'rgba(19,41,58,0.10)'
    ctx.stroke()
    this._text(label, x + w / 2, y + h * 0.68, {
      size: 14, weight: '700', color: pressed ? '#FFFFFF' : C.inkSoft, align: 'center'
    })
    this.buttons.push({ id: id, x: x, y: y, w: w, h: h })
  }

  _linkButton(id, x, y, w, h, label) {
    const ctx = this.ctx
    const pressed = this.pressId === id && (this.nowMs - this.pressAt < 150)
    rr(ctx, x, y, w, h, h / 2)
    ctx.fillStyle = pressed ? 'rgba(255,255,255,0.36)' : 'rgba(255,255,255,0.16)'
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.stroke()
    this._text(label, x + w / 2, y + h * 0.68, {
      size: 11, weight: '600', color: 'rgba(255,255,255,0.95)', align: 'center'
    })
    this.buttons.push({ id: id, x: x, y: y, w: w, h: h })
  }

  /** 线性图标（与项目 Lucide 风格一致，纯路径绘制） */
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
    } else if (name === 'back') {
      ctx.moveTo(15, 5)
      ctx.lineTo(8, 12)
      ctx.lineTo(15, 19)
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
    const y = this._safeTop() + 132
    ctx.save()
    ctx.globalAlpha = clamp(alpha, 0, 1)
    rr(ctx, (W - w) / 2, y, w, 28, 14)
    ctx.fillStyle = 'rgba(19,41,58,0.82)'
    ctx.fill()
    this._text(h.text, W / 2, y + 18, { size: 12, weight: '600', color: '#FFFFFF', align: 'center' })
    ctx.restore()
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
  }
}

module.exports = { WireRenderer, C }
