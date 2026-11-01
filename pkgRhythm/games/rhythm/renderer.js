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
const { THEMES, THEME_IDS, themeById } = require('./theme.js')

// 清新明亮 · 可爱风：奶油白底 + 低饱和糖果色，不用霓虹发光
// ============================================================================
// 配色：清晨逆光跑道（2026-11-01 重做，原「奶油白 + 糖果色」已废弃）
//
// 为什么换：糖果色那版全画面都在 70% 亮度以上，没有暗部锚点，所以「糊、平」；
// 而且高明度底色撑不起任何辉光——光效画上去直接被洗没。逆光是唯一能同时
// 解决「有暗部」「光能立住」「和走钢丝同一世界观」三件事的基调。
//
// 三条硬约束（走钢丝已经踩过一遍，别再犯）：
//   1. 金色只允许出现在地平线最后 8%，给到 24% 就成「渐变壁纸」；
//   2. 远山必须是**比天空暗**的剪影，三层都画得比天空淡 = 三张半透明纸；
//   3. 云体必须冷白（236,242,250）。整朵米黄 + 上亮下暗 = 沙丘。
//
// 旧键名全部保留（cyan/pink/mint/lemon…），赋逆光语义的值，这样所有引用
// 自动跟随新基调；新增语义键给新代码用。
const C = {
  ink: '#F4EADC',                 // 主文字：暖白（暗底可读）
  inkSoft: 'rgba(244,234,220,0.86)',
  inkMute: 'rgba(244,234,220,0.58)',
  inkDeep: '#12233A',             // 亮底上的深字

  // —— 天空（由上到下，天顶最暗）——
  skyTop: '#0C1A30',
  skyMid: '#1B3350',
  skyLow: '#3C5570',
  // —— 光 ——
  gold: '#F3C17E',
  goldDeep: '#D9995A',
  goldPale: '#FFE6B8',
  sun: '#FFF3D6',
  // —— 远山剪影（越近越暗）——
  ridgeFar: '#2E4A66',
  ridgeMid: '#1D3350',
  ridgeNear: '#0F1C2B',
  // —— 跑道 ——
  road: '#22303F',
  roadDeep: '#16212C',
  roadLit: '#2E3E50',

  // 旧键：语义映射到逆光色，别删（大量引用）
  cyan: '#7FA8C9',                // 冷青：左车道 / 右踏板
  cyanDeep: '#4F7C9E',
  pink: '#C98F7F',                // 赭红：左踏板 / 连击
  pinkDeep: '#A96A5C',
  violet: '#8E86A8',
  mint: '#93AD9C',                // 灰绿：中车道点缀
  mintDeep: '#6E8F7C',
  lemon: '#FFE6B8',
  danger: '#D97A6B',              // 不用纯红（康复红线）

  card: 'rgba(13,23,35,0.80)',    // 只留给暂停面板 / 结算
  cardLight: 'rgba(13,23,35,0.46)',
  line: 'rgba(255,236,206,0.16)',
  lineSoft: 'rgba(255,236,206,0.09)',
  shadow: 'rgba(5,12,21,0.50)',
  page: '#0C1A30'
}

// 2.5D 纵深原语（地平线雾 / 透视地面 / 软阴影 / 暗角）
const depth = require('../../../utils/scene/depth.js')

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
// 暗底专用的判定色。原来是「白底专用」的深色版本，整套改暗后反过来了。
const VERDICT_INK = {
  perfect: '#FFD479',
  great: '#7BE3FF',
  good: '#B49BFF',
  unsolved: '#96A5B4',
  miss: '#9AA9B8'
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
    this.th = THEMES.dawn
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

    // 2026-11-01：HUD 全拆 —— 顶部不再有「两枚胶囊 + 四张数据卡」，
    // 只留一行浮字。舞台因此上移约 110px，跑道变长、判定线更靠下，
    // 音符的可预判距离也跟着变长（对患者是好事）。
    const hudH = short ? 50 : 58
    const pillY = safeTop
    const pillH = hudH
    const btnH = short ? 38 : 42
    const btnY = H - (short ? 10 : 14) - btnH
    // 身体位置光带浮在跑道底边，不占独立面板高度，只留一条窄带
    const posH = short ? 24 : 28
    const posY = btnY - 10 - posH

    const stageTop = safeTop + hudH + 4
    const stageBottom = posY - 6
    const stageH = Math.max(150, stageBottom - stageTop)

    this.L = {
      W, H, short, safeTop,
      pillY, pillH,
      statY: pillY,
      statH: pillH,
      hudY: pillY,
      hudH,
      hudBottom: pillY + pillH,
      posY, posH,
      btnY, btnH,
      stageTop, stageBottom, stageH,
      horizonY: stageTop + stageH * (short ? 0.13 : 0.12),
      judgeY: stageTop + stageH * 0.80,
      cx: W / 2,
      roadTopHalf: Math.max(14, W * 0.045),
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
    // 主题必须在画背景之前定下来：缓存键里带它，换了背景立刻重画
    this.th = themeById(vm.backgroundId || (this.cfg && this.cfg.get('backgroundId')) || 'dawn')

    this._drawBackground()
    this._drawWorld(vm, screen)

    if (screen === 'play') {
      this._drawHud(vm)
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
    // 缓存键必须带背景 id：只按尺寸缓存的话，患者一换背景会看到旧天色
    const key = this.W + 'x' + this.H + '@' + this.dpr + '#' + this.th.id
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
    const hz = L.horizonY
    const th = this.th || THEMES.dawn

    // 天空：渐层完全由主题给。天顶必须最暗 —— 没有暗部锚点，整幅画就是平的。
    const sky = g.createLinearGradient(0, 0, 0, hz + 1)
    for (let i = 0; i < th.sky.length; i++) sky.addColorStop(th.sky[i].at, th.sky[i].color)
    g.fillStyle = sky
    g.fillRect(0, 0, W, hz + 2)

    // 星点（月夜）：静态、确定性。离地平线越近越稀（大气消光），
    // 这条比「均匀撒满」重要得多 —— 均匀撒在这种渐层上像噪点。
    if (th.stars > 0) this._paintStars(g, hz, th.stars)

    const lx = L.cx + W * th.light.x
    const ly = hz + th.light.y

    // 光源外晕：整幅画面「有没有光」全靠它。铺满地平线以上，让天顶也吃一点。
    const glow = g.createRadialGradient(lx, ly, 2, lx, ly, W * 0.62)
    for (let i = 0; i < th.light.glow.length; i++) {
      glow.addColorStop(Number(th.light.glow[i][0]), th.light.glow[i][1])
    }
    g.fillStyle = glow
    g.fillRect(0, 0, W, hz + 2)

    // 地平线：一道窄光。宽度只覆盖地平线那几像素，给宽了就是「渐变壁纸」。
    const lineY = hz - 1
    const lineG = g.createLinearGradient(0, 0, W, 0)
    lineG.addColorStop(0, 'rgba(' + th.farFade + ',0)')
    lineG.addColorStop(0.5, 'rgba(' + th.farFade + ',0.92)')
    lineG.addColorStop(1, 'rgba(' + th.farFade + ',0)')
    g.fillStyle = lineG
    g.fillRect(0, lineY - 1.4, W, 2.8)

    // 地平线上的薄云：局部宽度、两端渐隐。不能跨全屏 ——
    // 跨全屏的软边两端必然露边，读成一道折痕（走钢丝踩过）。
    const cloudRGB = th.cloud
    const cloudBand = (cy, halfW, h, alpha, seed) => {
      const x0 = L.cx - halfW
      const x1 = L.cx + halfW
      const grd = g.createLinearGradient(x0, 0, x1, 0)
      grd.addColorStop(0, 'rgba(' + cloudRGB + ',0)')
      grd.addColorStop(0.20, 'rgba(' + cloudRGB + ',' + alpha.toFixed(2) + ')')
      grd.addColorStop(0.80, 'rgba(' + cloudRGB + ',' + alpha.toFixed(2) + ')')
      grd.addColorStop(1, 'rgba(' + cloudRGB + ',0)')
      g.beginPath()
      g.moveTo(x0, cy + h)
      for (let i = 0; i <= 14; i++) {
        const u = i / 14
        const x = lerp(x0, x1, u)
        // 云顶起伏只做在上沿，凸起幅度小 —— 大凸起会变成「气泡」
        const bump = Math.sin(u * Math.PI) * 0.6 + Math.sin(u * Math.PI * 4.1 + seed) * 0.22
        g.lineTo(x, cy - h * bump)
      }
      g.lineTo(x1, cy + h)
      g.closePath()
      g.fillStyle = grd
      g.fill()
    }
    cloudBand(hz - 40, W * 0.34, 15, 0.50, 1.2)
    cloudBand(hz - 22, W * 0.23, 9, 0.58, 2.7)
    cloudBand(hz - 62, W * 0.19, 8, 0.30, 0.4)
    cloudBand(hz - 84, W * 0.13, 6, 0.16, 5.1)

    // 远城灯火（暮色）：地平线上一排疏疏的暖点。
    // 必须画在远山**之前**，让它被山的剪影吃掉一半 —— 否则像贴上去的贴纸。
    if (th.city > 0) this._paintCity(g, hz, th.city)

    // 远山：三层剪影，越近越暗。逆光时山的受光面在这一侧根本看不见，
    // 所以只能是纯剪影 —— 三层都比天空亮就等于三张半透明纸。
    // 峰必须窄：平滑正弦的剪影会读成「地球远山」。
    const hillY = L.horizonY
    const ridge = (col, segs, hMax, seed, lift) => {
      g.beginPath()
      g.moveTo(-4, hillY + 10)
      const N = segs * 2
      for (let i = 0; i <= N; i++) {
        const x = (i / N) * (W + 8) - 4
        const k = Math.floor(i / 2)
        const r1 = hash(k * 13 + seed, 3)
        const isPeak = i % 2 === 0
        const h = isPeak ? hMax * (0.52 + r1 * 0.48) : hMax * (0.06 + r1 * 0.20)
        const jitter = (hash(k * 5 + seed, 6) - 0.5) * (isPeak ? 9 : 20)
        g.lineTo(x + jitter, hillY - h + lift)
      }
      g.lineTo(W + 4, hillY + 10)
      g.closePath()
      g.fillStyle = col
      g.fill()
    }
    ridge(th.ridge[0], 7, H * 0.072, 11, -2)
    ridge(th.ridge[1], 5, H * 0.052, 29, 3)
    ridge(th.ridge[2], 4, H * 0.034, 47, 7)

    // 山脚薄雾：让剪影「站」在空气里。椭圆径向渐变，不铺矩形 ——
    // 矩形雾会在两侧切出可见的方块（走钢丝铁律）。
    depth.haze(g, {
      cx: L.cx, y: hillY - 2, rx: W * 0.78, ry: 0.075,
      color: th.haze, alpha: 0.42
    })

    // 地面：地平线以下整体压暗。第一档必须贴着天空最底部的暖色，
    // 否则天地之间会出现一条硬边（这条比任何加雾都管用）。
    const ground = g.createLinearGradient(0, hillY, 0, L.stageBottom + 30)
    for (let i = 0; i < th.ground.length; i++) {
      ground.addColorStop(th.ground[i].at, th.ground[i].color)
    }
    g.fillStyle = ground
    g.fillRect(0, hillY + 2, W, L.stageBottom + 30 - hillY)

    // 地平线附近的地面也吃到天光：两侧不能一刀切成纯黑。
    // 径向渐变到 0 alpha，不会在边缘切出方块。
    const groundGlow = g.createRadialGradient(L.cx, hillY, W * 0.06, L.cx, hillY, W * 0.92)
    groundGlow.addColorStop(0, 'rgba(' + th.groundGlow + ',0.30)')
    groundGlow.addColorStop(0.42, 'rgba(' + th.groundGlow + ',0.11)')
    groundGlow.addColorStop(1, 'rgba(' + th.groundGlow + ',0)')
    g.fillStyle = groundGlow
    g.fillRect(0, hillY, W, L.stageH * 0.55)

    this._paintRoad(g)

    this._paintGrid(g)

    // —— 远处收口：跑道尽头要「融进」天色，不能是一条被切断的硬边 ——
    // 1) 消失点一圈大气光（扁椭圆，只在中间亮）
    depth.haze(g, {
      cx: L.cx,
      y: L.horizonY + 1,
      rx: W * 0.52,
      ry: 0.055,
      color: th.farFade,
      alpha: 0.62
    })
    // 2) 跑道远端 22% 逐层淡出到雾色：越远越淡，纵深就有了。
    // ⚠️ 必须贴着跑道边缘画梯形，不能用 fillRect —— 矩形在跑道两侧会切出
    //    一块可见的方块（跑到湖面上会非常显眼）。
    const fogH = (L.stageBottom - L.horizonY) * 0.22
    const span = L.stageBottom + 20 - L.horizonY
    const halfAt = (y) => lerp(L.roadTopHalf, L.roadBottomHalf,
      clamp((y - L.horizonY) / span, 0, 1))
    const hTop = halfAt(L.horizonY) * 1.02
    const hBot = halfAt(L.horizonY + fogH) * 1.02
    const fog = g.createLinearGradient(0, L.horizonY, 0, L.horizonY + fogH)
    fog.addColorStop(0, 'rgba(' + th.farFade + ',0.92)')
    fog.addColorStop(0.45, 'rgba(' + th.farFade + ',0.42)')
    fog.addColorStop(1, 'rgba(' + th.farFade + ',0)')
    g.beginPath()
    g.moveTo(L.cx - hTop, L.horizonY)
    g.lineTo(L.cx + hTop, L.horizonY)
    g.lineTo(L.cx + hBot, L.horizonY + fogH)
    g.lineTo(L.cx - hBot, L.horizonY + fogH)
    g.closePath()
    g.fillStyle = fog
    g.fill()

    // —— 光源本体：必须画在跑道与远端雾之后 ——
    // 逆光的全部依据就是「看得见光源」。放在天空层里画，会被跑道收口和雾
    // 盖成一团白，画面上就没有太阳（也没有月亮）了。
    const coreX = L.cx + W * th.light.x
    const coreY = hz + th.light.y
    const coreR = W * th.light.r
    const core = g.createRadialGradient(coreX, coreY, 0.5, coreX, coreY, coreR)
    for (let i = 0; i < th.light.core.length; i++) {
      core.addColorStop(Number(th.light.core[i][0]), th.light.core[i][1])
    }
    g.fillStyle = core
    g.beginPath()
    g.ellipse(coreX, coreY, coreR, coreR * 0.74, 0, 0, Math.PI * 2)
    g.fill()

    // 贴着地平线的横向光条：光源压在地平线上时，光沿地平线铺开
    const beam = g.createLinearGradient(0, 0, W, 0)
    beam.addColorStop(0, th.light.beam[1])
    beam.addColorStop(0.5, th.light.beam[0])
    beam.addColorStop(1, th.light.beam[1])
    g.fillStyle = beam
    g.beginPath()
    g.ellipse(coreX, hz - 2, W * 0.46, 5.5, 0, 0, Math.PI * 2)
    g.fill()
  }

  /** 星点（月夜）：静态 + 确定性，背景是离屏缓存的，不需要动画 */
  _paintStars(g, hz, count) {
    const L = this.L
    g.save()
    for (let i = 0; i < count; i++) {
      const x = hash(i * 3 + 1, 11) * L.W
      const y = hash(i * 7 + 2, 23) * (hz - 10)
      // 消光：越靠地平线越稀
      const ext = Math.pow(clamp(y / hz, 0, 1), 1.5)
      if (hash(i * 5 + 3, 31) > 0.18 + ext * 0.82) continue
      const r = 0.45 + hash(i, 41) * 0.85
      g.globalAlpha = 0.22 + hash(i * 11, 53) * 0.55
      g.beginPath()
      g.arc(x, y, r, 0, Math.PI * 2)
      g.fillStyle = 'rgba(238,246,255,1)'
      g.fill()
    }
    g.restore()
  }

  /** 远城灯火（暮色）：一排疏疏的窗口暖点，被远山剪影吃掉一半 */
  _paintCity(g, hz, count) {
    const L = this.L
    g.save()
    for (let i = 0; i < count; i++) {
      const x = hash(i * 13 + 5, 17) * L.W
      const y = hz - 1 - hash(i * 7 + 3, 29) * 5
      const w = 0.9 + hash(i * 3 + 7, 37) * 1.5
      const h = 0.8 + hash(i * 9 + 1, 43) * 1.4
      g.globalAlpha = 0.20 + hash(i * 11 + 2, 59) * 0.42
      g.fillStyle = 'rgba(255,206,140,1)'
      g.fillRect(x, y, w, h)
    }
    g.restore()
  }

  _paintRoad(g) {
    const L = this.L
    const th = this.th || THEMES.dawn
    const cx = L.cx
    const topY = L.horizonY
    const botY = L.stageBottom + 20

    // 路面：逆光时路面朝上但背对光源，本来就是暗的；近处更暗（前景压重），
    // 远端被大气光抬起 —— 纵深靠这条明暗，不靠画材质。
    g.beginPath()
    g.moveTo(cx - L.roadTopHalf, topY)
    g.lineTo(cx + L.roadTopHalf, topY)
    g.lineTo(cx + L.roadBottomHalf, botY)
    g.lineTo(cx - L.roadBottomHalf, botY)
    g.closePath()
    const rg = g.createLinearGradient(0, topY, 0, botY)
    for (let i = 0; i < th.road.length; i++) rg.addColorStop(th.road[i].at, th.road[i].color)
    g.fillStyle = rg
    g.fill()

    // 三条车道：不用高饱和糖果色（暗底上会脏成泥）。只用极弱的色温提示左右，
    // 真正的方向识别交给判定台的颜色与车道位置。
    // **色温顺序（左冷 / 中中性 / 右暖）三套主题完全一致，永远不改。**
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
    laneBand(-1, -0.23, th.lanes[0])
    laneBand(-0.23, 0.23, th.lanes[1])
    laneBand(0.23, 1, th.lanes[2])

    // 远端收口：跑道尽头必须被光「吃掉」，不能是一条被切断的硬边
    const farFade = g.createLinearGradient(0, topY, 0, topY + L.stageH * 0.16)
    farFade.addColorStop(0, 'rgba(' + th.farFade + ',0.52)')
    farFade.addColorStop(1, 'rgba(' + th.farFade + ',0)')
    g.save()
    g.beginPath()
    g.moveTo(cx - L.roadTopHalf, topY)
    g.lineTo(cx + L.roadTopHalf, topY)
    g.lineTo(cx + L.roadBottomHalf * 0.30, topY + L.stageH * 0.16)
    g.lineTo(cx - L.roadBottomHalf * 0.30, topY + L.stageH * 0.16)
    g.closePath()
    g.fillStyle = farFade
    g.fill()
    g.restore()

    // 边线：逆光的边缘光。三层叠出来（宽而淡的外晕 + 主边线 + 近处加强），
    // 单画一条亮线会读成「塑料跑道的白漆边」。
    const edge = (dir) => {
      const x0 = cx + dir * L.roadTopHalf
      const x1 = cx + dir * L.roadBottomHalf
      const stroke = (lw, col) => {
        g.beginPath()
        g.moveTo(x0, topY)
        g.lineTo(x1, botY)
        g.lineWidth = lw
        g.strokeStyle = col
        g.stroke()
      }
      stroke(11, 'rgba(' + th.edge + ',0.08)')
      stroke(4.5, 'rgba(' + th.edge + ',0.18)')
      stroke(2.2, 'rgba(' + th.edge + ',0.62)')
      // 近处一截更亮：逆光边缘光越靠近观察者越强。
      // 必须走**同一条边线**的端点，只让颜色沿 y 分段 ——
      // 各算一套参数会让这段亮线偏离边线，在跑道外面拉出一条斜杠。
      const nearG = g.createLinearGradient(0, lerp(topY, botY, 0.55), 0, botY)
      nearG.addColorStop(0, 'rgba(' + th.farFade + ',0)')
      nearG.addColorStop(1, 'rgba(' + th.farFade + ',0.85)')
      g.beginPath()
      g.moveTo(x0, topY)
      g.lineTo(x1, botY)
      g.lineWidth = 2.2
      g.strokeStyle = nearG
      g.stroke()
    }
    edge(-1)
    edge(1)

    // 分道虚线：冷白、细、越远越淡。只做透视参考，不抢戏。
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
        g.lineWidth = 1 + t0 * 1.8
        g.strokeStyle = 'rgba(226,238,248,' + (0.12 + t0 * 0.30).toFixed(2) + ')'
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

    // 横向刻度：极淡的冷白，只做透视参考。暗底上它自己就会消失，
    // 不需要更亮 —— 亮了会变成「跑道上的横杠」。
    g.strokeStyle = 'rgba(214,232,246,0.055)'
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

    // 判定线：整幅画面唯一的**冷白**主线。地平线已经占了暖金，
    // 判定线用冷白才能从暖底里跳出来（同色温会糊在一起）。
    const jy = L.judgeY
    const half = lerp(L.roadTopHalf, L.roadBottomHalf, (jy - topY) / (botY - topY))
    // 外层柔光
    const halo = g.createLinearGradient(0, jy - 16, 0, jy + 16)
    halo.addColorStop(0, 'rgba(206,232,248,0)')
    halo.addColorStop(0.5, 'rgba(206,232,248,0.34)')
    halo.addColorStop(1, 'rgba(206,232,248,0)')
    g.fillStyle = halo
    g.fillRect(cx - half - 6, jy - 16, (half + 6) * 2, 32)
    // 主线：两端渐隐
    const band = g.createLinearGradient(cx - half, jy, cx + half, jy)
    band.addColorStop(0, 'rgba(220,234,243,0)')
    band.addColorStop(0.12, 'rgba(232,244,252,0.88)')
    band.addColorStop(0.5, 'rgba(248,252,255,0.98)')
    band.addColorStop(0.88, 'rgba(232,244,252,0.88)')
    band.addColorStop(1, 'rgba(220,234,243,0)')
    g.beginPath()
    g.moveTo(cx - half, jy)
    g.lineTo(cx + half, jy)
    g.lineWidth = 3
    g.lineCap = 'round'
    g.strokeStyle = band
    g.stroke()
    g.lineCap = 'butt'
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
    // 匀速下落（指数 1.0）。
    //
    // 曾是 1.7 → 1.15，「1.7」让音符大部分时间挤在远端、到判定线前突然加速，
    // 患者感觉「才看到就撞线」。1.15 只是把这股冲刺削弱了一点，**方向仍是加速**：
    // 从地平线（0.12h）到判定线（0.84h）是 519px，末尾 20% 的时间走完 25% 的距离，
    // 越靠近判定线越快 —— 这正是「音符来的速度太快」的来源。
    // 匀速是唯一能预判的曲线：同样时间走同样距离，患者才能练出稳定的提前量。
    const t = Math.min(p, 1)
    let y = lerp(L.horizonY, L.judgeY, t)
    // 过了判定线继续往前走一小段，而不是**停在**判定线上。
    // 停住的话，判定过的音符会和下一个音符叠在同一个位置 ——
    // 停留时间哪怕已经压到 380ms，密集谱面上判定线附近还是一团糊。
    if (p > 1) y += (p - 1) * (L.judgeY - L.horizonY) * 0.30
    return y
  }

  _drawWorld(vm, screen) {
    const ctx = this.ctx
    const L = this.L

    // 节奏光柱：随**音符**轻微呼吸（幅度很小，避免刺激）
    if (this.cfg.get('beatPulseOn') && screen === 'play') {
      const pulse = (vm.notePhase || 0) * 0.5
      const g = ctx.createRadialGradient(L.cx, L.judgeY, 10, L.cx, L.judgeY, L.W * 0.55)
      g.addColorStop(0, 'rgba(150,190,255,' + (0.10 * pulse).toFixed(3) + ')')
      g.addColorStop(1, 'rgba(150,190,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, L.stageTop, L.W, L.stageBottom - L.stageTop)
    }

    if (screen === 'play') {
      this._drawHorizonBreath(vm)
      this._drawRoadFlow()
      this._drawSunPulse(vm)
      this._drawPetals()
      this._drawComboPillars(vm)
      this._drawJudgeGlow(vm)
      this._drawTargetLane(vm)
      // 顺序不能反：判定台是**地面上的**东西，音符是浮在它上面的。
      // 原来先画音符再画判定台 —— 时间表时代音符嗖地穿过去看不出问题，
      // 门控之后音符会**停在判定台正中**，就会被台面整个盖住、看起来像没出音符。
      this._drawPads(vm)
      this._drawNotes(vm)
      this._drawPlayer(vm)
      this._drawFx(vm)
      this._drawJudgeText(vm)
    } else if (screen === 'intro') {
      this._drawIntroNotes(vm)
    }

    // 轻微暗角：把注意力收到中间的判定区。用冷灰蓝而不是纯黑，
    // 纯黑压在糖果色上会发脏。
    depth.vignette(ctx, {
      w: L.W, h: L.H, color: '6,14,24', alpha: 0.30, cy: 0.50, inner: 0.40, outer: 1.0
    })
  }

  /** 飘落的小花瓣：让画面"活"起来，成本很低 */
  // 空气里的浮尘（原「飘落花瓣」）。逆光场景里花瓣是粉色贴纸，
  // 而光尘才是逆光本身产生的东西：它让画面「有空气」。
  // 冷白 + 暖金两色，1/4 是冷色（对应天空的反射光）。
  _drawPetals() {
    const ctx = this.ctx
    const L = this.L
    ctx.save()
    for (let i = 0; i < 14; i++) {
      const sp = 0.045 + (i % 3) * 0.016
      const ph = (this.clock * sp + i * 0.11) % 1
      const x0 = hash(i, 7) * L.W
      const x = x0 + Math.sin(this.clock * 0.7 + i) * 14
      const y = L.stageTop + ph * (L.stageBottom - L.stageTop)
      const r = 1.1 + (i % 4) * 0.55
      const warm = i % 4 !== 0
      ctx.globalAlpha = (0.20 + 0.42 * Math.sin(ph * Math.PI)) * (warm ? 1 : 0.7)
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = warm ? 'rgba(255,232,196,1)' : 'rgba(214,236,252,1)'
      ctx.fill()
    }
    ctx.restore()
  }

  /**
   * 连击光柱：每 5 连击升一阶，沿跑道两条边缘往上长。
   * 这是「积累感」的唯一载体 —— 不做屏幕震动、不做闪白（会干扰站立时的
   * 本体感觉，也可能诱发不适），用不断变亮变宽的光柱表达「我越来越稳」。
   */
  _drawComboPillars(vm) {
    const combo = vm.combo || 0
    if (combo < 5) return
    const ctx = this.ctx
    const L = this.L
    const tier = Math.min(4, Math.floor(combo / 5))
    const k = tier / 4
    const top = L.judgeY - L.stageH * 0.06
    const bot = L.stageBottom
    const span = L.stageBottom + 20 - L.horizonY
    const halfAt = (y) => lerp(L.roadTopHalf, L.roadBottomHalf, clamp((y - L.horizonY) / span, 0, 1))
    const xTop = halfAt(top)
    const xBot = halfAt(bot)

    ;[-1, 1].forEach((dir) => {
      // 往外让开 7~14px：贴死在跑道金边上会和边线糊成一条，看不出「长出来了」
      const outTop = 6 + k * 8
      const outBot = 8 + k * 14
      const wTop = 5 + k * 10
      const wBot = 11 + k * 26
      const g = ctx.createLinearGradient(0, bot, 0, top)
      g.addColorStop(0, 'rgba(255,214,168,' + (0.12 + k * 0.26).toFixed(3) + ')')
      g.addColorStop(0.55, 'rgba(255,206,154,' + (0.05 + k * 0.13).toFixed(3) + ')')
      g.addColorStop(1, 'rgba(255,206,154,0)')
      ctx.beginPath()
      ctx.moveTo(L.cx + dir * (xTop + outTop), top)
      ctx.lineTo(L.cx + dir * (xTop + outTop + wTop), top)
      ctx.lineTo(L.cx + dir * (xBot + outBot + wBot), bot)
      ctx.lineTo(L.cx + dir * (xBot + outBot), bot)
      ctx.closePath()
      ctx.fillStyle = g
      ctx.fill()
    })
  }

  /**
   * 地平线随拍呼吸（±8% 明暗）。
   * 用户定的是「只呼吸、不大幅动」：背景整片起伏会被误读成自己没站稳。
   * 所以背景贴图缓存不动，只在上面叠一层跟着音符相位的微光。
   */
  _drawHorizonBreath(vm) {
    if (!this.cfg.get('beatPulseOn')) return
    const ctx = this.ctx
    const L = this.L
    const k = 0.5 + 0.5 * Math.sin((vm.notePhase || 0) * Math.PI * 2)
    const a = 0.035 + k * 0.055
    const g = ctx.createLinearGradient(0, 0, L.W, 0)
    g.addColorStop(0, 'rgba(255,226,186,0)')
    g.addColorStop(0.5, 'rgba(255,240,210,' + a.toFixed(3) + ')')
    g.addColorStop(1, 'rgba(255,226,186,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(L.cx + L.W * 0.07, L.horizonY - 6, L.W * 0.48, 9, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  /**
   * 跑道上的流光：三条极淡的光带沿跑道方向缓慢流过。
   * 它解决的是「跑道是一块静止的深色梯形」——玩家感觉不到自己在往前走。
   * 速度必须慢（一个来回 5s 以上），快了会诱发追视和不适。
   */
  _drawRoadFlow() {
    const ctx = this.ctx
    const L = this.L
    const span = L.stageBottom + 20 - L.horizonY
    const halfAt = (y) => lerp(L.roadTopHalf, L.roadBottomHalf, clamp((y - L.horizonY) / span, 0, 1))
    ctx.save()
    for (let i = 0; i < 3; i++) {
      const ph = ((this.clock * 0.19 + i * 0.37) % 1)
      const u = Math.pow(ph, 1.7)
      const y = L.horizonY + u * span
      const h = 18 + u * 54
      const half = halfAt(y) * 0.96
      const g = ctx.createLinearGradient(0, y, 0, y + h)
      g.addColorStop(0, 'rgba(255,236,206,0)')
      g.addColorStop(0.4, 'rgba(255,236,206,' + (0.030 * (0.35 + u)).toFixed(3) + ')')
      g.addColorStop(1, 'rgba(255,236,206,0)')
      ctx.fillStyle = g
      ctx.fillRect(L.cx - half, y, half * 2, h)
    }
    ctx.restore()
  }

  /**
   * 完美命中：地平线整条亮一下（不是闪白，是「日出方向更亮了」）。
   * 这是全画面唯一一处整屏级别的回应，所以只给 perfect / great。
   */
  _drawSunPulse(vm) {
    const f = vm.feedback
    if (!f) return
    if (f.verdict !== 'perfect' && f.verdict !== 'great') return
    const age = (vm.musicMs - f.at) / 620
    if (age < 0 || age > 1) return
    const ctx = this.ctx
    const L = this.L
    const k = Math.pow(1 - age, 2.2)
    const g = ctx.createLinearGradient(0, 0, L.W, 0)
    g.addColorStop(0, 'rgba(255,226,186,0)')
    g.addColorStop(0.5, 'rgba(255,242,212,' + (0.30 * k).toFixed(3) + ')')
    g.addColorStop(1, 'rgba(255,226,186,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(L.cx + L.W * 0.07, L.horizonY - 8, L.W * 0.50, 4 + 12 * k, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  /** 判定线：随下一个音符的临近亮起的一道柔光（不闪屏） */
  _drawJudgeGlow(vm) {
    const ctx = this.ctx
    const L = this.L
    const pulse = this.cfg.get('beatPulseOn') ? (vm.notePhase || 0) : 0.4
    const t = (L.judgeY - L.horizonY) / (L.stageBottom + 20 - L.horizonY)
    const half = lerp(L.roadTopHalf, L.roadBottomHalf, t)
    ctx.save()
    ctx.globalAlpha = 0.20 + pulse * 0.26
    const g = ctx.createLinearGradient(L.cx - half, 0, L.cx + half, 0)
    g.addColorStop(0, 'rgba(206,232,248,0)')
    g.addColorStop(0.5, 'rgba(240,249,255,0.95)')
    g.addColorStop(1, 'rgba(206,232,248,0)')
    ctx.fillStyle = g
    ctx.fillRect(L.cx - half, L.judgeY - 4, half * 2, 8)
    ctx.restore()
  }

  /**
   * 节拍横线已删除（2026-11-01）。
   * 它按音乐拍点流过来，而音符按门控出现，两者抵达判定线的时刻根本对不上；
   * 患者会拿横线当「该动了」的信号，然后每次都错。没有拍点，就没有横线。
   */

  /** 下一颗音符快到时，把它的车道按透视点亮一段：视线自动跟过去 */
  _drawTargetLane(vm) {
    const ctx = this.ctx
    const L = this.L
    const notes = vm.notes || []
    let next = null
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i]
      if (n.judged) continue
      if (!next || n.progress < next.progress) next = n
    }
    if (!next || next.progress < 0.55) return
    const k = clamp((next.progress - 0.55) / 0.45, 0, 1)

    // 用和车道一致的缓动（现已统一为匀速），否则会像贴了一张直边色块
    const t0 = 0.55
    const t1 = 1
    const y0 = lerp(L.horizonY, L.judgeY, t0)
    const y1 = L.judgeY
    const half0 = lerp(L.roadTopHalf, L.roadBottomHalf, t0) * 0.23
    const half1 = lerp(L.roadTopHalf, L.roadBottomHalf, t1) * 0.23
    const x0 = this._laneX(next.side, t0)
    const x1 = this._laneX(next.side, t1)

    // 色温跟音符 / 判定台 / 身体位置带同一套：左冷青 / 中暖白 / 右琥珀。
    // 原来是糖果色（粉/黄/绿），在暗底上会浊成泥，而且和地平线的暖金抢眼睛。
    const col = next.side === 'left' ? '150,212,246'
      : (next.side === 'center' ? '255,238,200' : '255,196,132')
    const g = ctx.createLinearGradient(0, y0, 0, y1)
    g.addColorStop(0, 'rgba(' + col + ',0)')
    g.addColorStop(0.72, 'rgba(' + col + ',' + (0.10 + k * 0.12).toFixed(3) + ')')
    g.addColorStop(1, 'rgba(' + col + ',' + (0.20 + k * 0.18).toFixed(3) + ')')

    ctx.save()
    ctx.beginPath()
    ctx.moveTo(x0 - half0 * 1.15, y0)
    ctx.lineTo(x0 + half0 * 1.15, y0)
    ctx.lineTo(x1 + half1 * 1.55, y1 + 6)
    ctx.lineTo(x1 - half1 * 1.55, y1 + 6)
    ctx.closePath()
    ctx.fillStyle = g
    ctx.fill()
    ctx.restore()
  }

  _drawNotes(vm) {
    const ctx = this.ctx
    const L = this.L
    const notes = vm.notes || []
    const TAU = Math.PI * 2
    // 三车道用「色温」区分：左冷（青蓝）/ 中白 / 右暖（琥珀）。
    // 冷↔暖是患者不需要学就能读懂的左右区分，而且三套背景里都不变。
    const haloOf = (side, a) => (side === 'left'
      ? 'rgba(150,212,246,' + a + ')'
      : side === 'right'
        ? 'rgba(255,196,132,' + a + ')'
        : 'rgba(255,238,200,' + a + ')')
    const coreOf = (side) => (side === 'left' ? '#EAF8FF' : side === 'right' ? '#FFF0DC' : '#FFF8EA')

    for (let i = 0; i < notes.length; i++) {
      const n = notes[i]
      const p = n.progress
      if (p < 0 || p > 1.001) continue
      // 横向与纵向必须用同一条曲线：一个加速一个匀速，音符会走成一条弧，
      // 看起来像「飘」而不是「落」。
      const t = clamp(p, 0, 1)
      const y = this._noteY(t)
      const x = this._laneX(n.side, t)

      // 门控：音符**到判定线就停住**，不会冲过去。
      // 所以到线之后尺寸不再随时间变化，只跟着「等了多久」呼吸。
      const waiting = !!n.waiting && !n.judged
      const waitMs = n.waitMs || 0
      const hint = n.hintLevel || 0
      // 等待呼吸：380ms 一个来回，比心跳慢一点，不催人
      const pulse = waiting ? 0.5 + 0.5 * Math.sin(waitMs / 380) : 0

      let scale = 0.68 + 0.5 * t
      // 等得久了就长大一点 —— 这是最温和的「看这里」，不需要文字
      if (hint >= 1) scale *= 1 + 0.06 * hint + 0.05 * pulse
      const R = (n.type === 'accent' ? 19 : 15) * scale

      let alpha = 1
      if (n.judged) alpha = Math.max(0, 1 - (n.fade || 0))
      if (!n.judged && p < 0.08) alpha *= clamp(p / 0.08, 0, 1)
      if (alpha <= 0.01) continue

      ctx.save()
      ctx.globalAlpha = alpha

      // 光尾：4 节渐隐的圆，越远越小越淡。停住之后不再拖尾（它没在动）
      if (!n.judged && !waiting && p > 0.06) {
        for (let k = 1; k <= 4; k++) {
          const pk = p - k * 0.036
          if (pk <= 0.004) break
          const tx = this._laneX(n.side, pk)
          const ty = this._noteY(pk)
          ctx.globalAlpha = alpha * Math.max(0, 0.22 - k * 0.045)
          ctx.beginPath()
          ctx.arc(tx, ty, R * (1 - k * 0.14), 0, TAU)
          ctx.fillStyle = haloOf(n.side, 1)
          ctx.fill()
        }
        ctx.globalAlpha = alpha
      }

      // 落点柔光：快到判定线时脚下亮一下，帮助判断高度
      if (!n.judged && t > 0.78) {
        const k = clamp((t - 0.78) / 0.22, 0, 1)
        ctx.globalAlpha = alpha * 0.30 * k
        const g = ctx.createRadialGradient(x, L.judgeY, 2, x, L.judgeY, 30 * k + 8)
        g.addColorStop(0, haloOf(n.side, 0.9))
        g.addColorStop(1, haloOf(n.side, 0))
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.ellipse(x, L.judgeY, 22 * k + 8, 8 * k + 3, 0, 0, TAU)
        ctx.fill()
        ctx.globalAlpha = alpha
      }

      // 等待环：等得越久，环越大越亮。
      // 这是「它还在等你」的唯一信号 —— 没有这个环，患者会以为游戏卡了。
      if (waiting) {
        const ringR = R * (2.0 + 0.28 * pulse + hint * 0.16)
        ctx.globalAlpha = alpha * (0.18 + 0.16 * pulse + hint * 0.10)
        ctx.beginPath()
        ctx.arc(x, y, ringR, 0, TAU)
        ctx.lineWidth = 1.4 + hint * 0.5
        ctx.strokeStyle = haloOf(n.side, 0.9)
        ctx.stroke()
        ctx.globalAlpha = alpha
      }

      // 外晕：半径是实心的 3.2 倍，极淡。逆光光球靠「晕」立住，不靠描边。
      const glowR = R * (3.2 + (waiting ? 0.5 * pulse + hint * 0.22 : 0))
      const gh = ctx.createRadialGradient(x, y, R * 0.25, x, y, glowR)
      gh.addColorStop(0, haloOf(n.side, 0.42 + hint * 0.08))
      gh.addColorStop(0.34, haloOf(n.side, 0.16))
      gh.addColorStop(1, haloOf(n.side, 0))
      ctx.fillStyle = gh
      ctx.beginPath()
      ctx.arc(x, y, glowR, 0, TAU)
      ctx.fill()

      // 内核：偏左上一点的高光，暗示光来自地平线那一侧
      const gc = ctx.createRadialGradient(x - R * 0.22, y - R * 0.26, R * 0.08, x, y, R * 1.02)
      gc.addColorStop(0, '#FFFFFF')
      gc.addColorStop(0.52, coreOf(n.side))
      gc.addColorStop(1, haloOf(n.side, 0.88))
      ctx.beginPath()
      ctx.arc(x, y, R, 0, TAU)
      ctx.fillStyle = gc
      ctx.fill()

      // 强拍：四道短光刺（不是虚线环 —— 环在暗底上像「套了个圈」）
      if (n.type === 'accent') {
        ctx.globalAlpha = alpha * 0.55
        ctx.strokeStyle = 'rgba(255,246,224,0.85)'
        ctx.lineWidth = Math.max(0.9, R * 0.075)
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2 + 0.42
          ctx.beginPath()
          ctx.moveTo(x + Math.cos(a) * R * 1.35, y + Math.sin(a) * R * 1.35)
          ctx.lineTo(x + Math.cos(a) * R * 2.45, y + Math.sin(a) * R * 2.45)
          ctx.stroke()
        }
        ctx.globalAlpha = alpha
      }

      // 保持进度环：稳住之后开始积，积满就完成。
      // 有了它，「稳住 0.4 秒」这件事才是可看见的 —— 否则患者不知道自己在等什么。
      const hp = n.holdProgress || 0
      if (waiting && hp > 0.001) {
        const ringR = R * 1.56
        ctx.globalAlpha = alpha * 0.30
        ctx.beginPath()
        ctx.arc(x, y, ringR, 0, TAU)
        ctx.lineWidth = 2.4
        ctx.strokeStyle = haloOf(n.side, 0.5)
        ctx.stroke()
        ctx.globalAlpha = alpha * 0.95
        ctx.beginPath()
        ctx.arc(x, y, ringR, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(hp, 0, 1))
        ctx.lineWidth = 3
        ctx.lineCap = 'round'
        ctx.strokeStyle = haloOf(n.side, 1)
        ctx.stroke()
        ctx.lineCap = 'butt'
        ctx.globalAlpha = alpha
      }

      ctx.restore()
    }
  }


  /** 双雪佛龙：表示方向，但不会读成"播放键" */
  _chevron(x, y, r, dir, color, lw) {
    const ctx = this.ctx
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = lw
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (let i = 0; i < 2; i++) {
      const ox = x + dir * (i * r * 0.62 - r * 0.2)
      ctx.beginPath()
      ctx.moveTo(ox - dir * r * 0.28, y - r * 0.42)
      ctx.lineTo(ox + dir * r * 0.22, y)
      ctx.lineTo(ox - dir * r * 0.28, y + r * 0.42)
      ctx.stroke()
    }
    ctx.restore()
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
    const pulse = beatOn ? (vm.notePhase || 0) : 0
    const armed = vm.dir
    const r = (L.padH || 26) * 1.05
    const TAU = Math.PI * 2
    // 逐级提示第 2 级：不管患者站在哪，直接把该去的那一侧点亮。
    // 这是「等太久」的兜底 —— 门控下音符不会自己走，患者最容易卡在
    // 「我不知道该往哪」而不是「我做不到」，所以提示要指向**位置**。
    const hint = vm.hintLevel || 0
    const wantSide = vm.pending ? vm.pending.side : null
    const callPulse = 0.5 + 0.5 * Math.sin(this.clock * 3.4)
    // 判定台改用色温：左冷青 / 中暖白 / 右琥珀。和音符、车道保持同一套语言。
    const edgeOf = (side) => (side === 'left' ? 'rgba(150,212,246,'
      : side === 'right' ? 'rgba(255,196,132,' : 'rgba(255,238,200,')

    ;['left', 'center', 'right'].forEach((side) => {
      const x = this._laneX(side, 1)
      const y = L.judgeY
      const isLeft = side === 'left'
      const active = armed === side
      const calling = hint >= 2 && wantSide === side
      const lift = (active ? 2 : 0) + (calling ? 3 + callPulse * 3 : 0)

      ctx.save()

      // 地面光坑：逆光下台面朝上却背光，本身就是暗的。
      // 原来画成白圆盘，在这个基调里会像一块贴上去的板。
      ctx.beginPath()
      ctx.ellipse(x, y + 4, r * 1.04, r * 0.40, 0, 0, TAU)
      ctx.fillStyle = 'rgba(6,13,22,0.50)'
      ctx.fill()

      // 招唤光晕（第 2 级提示）：比「选中」那圈更大更亮，且有节奏地呼吸。
      // 只在干等太久时出现，正常游玩完全看不到它。
      if (calling) {
        const gc = ctx.createRadialGradient(x, y - lift, r * 0.2, x, y - lift, r * (3.0 + callPulse * 0.8))
        gc.addColorStop(0, edgeOf(side) + (0.30 + callPulse * 0.18).toFixed(2) + ')')
        gc.addColorStop(0.55, edgeOf(side) + (0.10 + callPulse * 0.08).toFixed(2) + ')')
        gc.addColorStop(1, edgeOf(side) + '0)')
        ctx.fillStyle = gc
        ctx.beginPath()
        ctx.arc(x, y - lift, r * (3.0 + callPulse * 0.8), 0, TAU)
        ctx.fill()
      }

      // 选中：先铺一层外扩光晕
      if (active) {
        const ga = ctx.createRadialGradient(x, y - lift, r * 0.25, x, y - lift, r * 2.3)
        ga.addColorStop(0, edgeOf(side) + '0.30)')
        ga.addColorStop(1, edgeOf(side) + '0)')
        ctx.fillStyle = ga
        ctx.beginPath()
        ctx.arc(x, y - lift, r * 2.3, 0, TAU)
        ctx.fill()
      }

      // 台面：暗玻璃
      ctx.beginPath()
      ctx.arc(x, y - lift, r, 0, TAU)
      const g = ctx.createLinearGradient(x, y - lift - r, x, y - lift + r)
      g.addColorStop(0, active || calling ? 'rgba(34,48,64,0.94)' : 'rgba(20,30,42,0.86)')
      g.addColorStop(1, active || calling ? 'rgba(14,24,36,0.92)' : 'rgba(9,16,26,0.84)')
      ctx.fillStyle = g
      ctx.fill()
      // 边缘：一圈色温光（这就是「光台」的全部）
      ctx.lineWidth = calling ? 3 + callPulse * 1.4 : (active ? 2.4 : 1.5)
      ctx.strokeStyle = edgeOf(side) + (calling ? '1)' : (active ? '0.95)' : '0.42)'))
      ctx.stroke()

      // 内圈刻度
      ctx.beginPath()
      ctx.arc(x, y - lift, r * 0.72, 0, TAU)
      ctx.lineWidth = 1
      ctx.strokeStyle = edgeOf(side) + (active ? '0.30)' : '0.14)')
      ctx.stroke()

      if (active && pulse > 0.01) {
        ctx.beginPath()
        ctx.arc(x, y - lift, r + (1 - pulse) * r * 0.35, 0, TAU)
        ctx.globalAlpha = 0.42 * pulse
        ctx.lineWidth = 2.4
        ctx.strokeStyle = edgeOf(side) + '1)'
        ctx.stroke()
        ctx.globalAlpha = 1
      }

      const inkColor = active ? '#FFF6E4' : 'rgba(244,234,220,0.66)'
      if (side === 'center') {
        this._text('中', x, y + 5 - lift, { size: 14, weight: '800', color: inkColor, align: 'center' })
      } else {
        this._chevron(x - r * 0.42, y - lift, 7, isLeft ? -1 : 1, inkColor, 2.2)
        this._text(isLeft ? '左' : '右', x + r * 0.26, y + 5 - lift, {
          size: 14, weight: '800', color: inkColor, align: 'center'
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
    const y = L.judgeY + L.padH + 26
    const TAU = Math.PI * 2

    // 位置轨道：虚线 + 三个色温刻度
    ctx.save()
    ctx.lineWidth = 2
    ctx.strokeStyle = 'rgba(226,238,248,0.16)'
    ctx.setLineDash([2, 6])
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
      ctx.strokeStyle = sd === 'left' ? 'rgba(150,212,246,0.62)'
        : (sd === 'center' ? 'rgba(255,238,200,0.62)' : 'rgba(255,196,132,0.62)')
      ctx.stroke()
    })

    // 脚下光池：逆光里人站在自己那圈光上，位置一眼能看见，
    // 不必靠把人物画成纯白贴纸来抢注意力。
    const pool = ctx.createRadialGradient(x, y + 1, 1, x, y + 1, 30)
    pool.addColorStop(0, 'rgba(255,214,168,0.34)')
    pool.addColorStop(0.45, 'rgba(255,214,168,0.12)')
    pool.addColorStop(1, 'rgba(255,214,168,0)')
    ctx.fillStyle = pool
    ctx.beginPath()
    ctx.ellipse(x, y + 2, 30, 11, 0, 0, TAU)
    ctx.fill()

    // 化身：背影团子。暖白但压到比纯白低一档（纯白在这套基调里会过曝成洞），
    // 朝阳的一侧加轮廓光，**不画脸**（逆光看的是背影）。
    const bodyH = 14
    ctx.beginPath()
    ctx.ellipse(x, y - bodyH * 0.62, 16.5, bodyH * 1.08, 0, 0, TAU)
    const bg = ctx.createLinearGradient(x, y - bodyH * 1.7, x, y + bodyH * 0.45)
    bg.addColorStop(0, '#F6EBD8')
    bg.addColorStop(0.55, '#D9C8B0')
    bg.addColorStop(1, '#8E7C68')
    ctx.fillStyle = bg
    ctx.fill()

    // 轮廓光：只描右上这一段（朝太阳那侧）。整圈描边会变成贴纸。
    ctx.lineWidth = 1.6
    ctx.strokeStyle = 'rgba(255,246,226,0.88)'
    ctx.beginPath()
    ctx.ellipse(x, y - bodyH * 0.62, 16.5, bodyH * 1.08, 0, -Math.PI * 0.95, -Math.PI * 0.08)
    ctx.stroke()

    // 两只张开的手：平衡训练里人就是这个姿势，也顺带让团子不再像一颗蛋。
    ;[-1, 1].forEach((dir) => {
      ctx.beginPath()
      ctx.arc(x + dir * 16.5, y - bodyH * 0.72, 4.2, 0, TAU)
      ctx.fillStyle = dir < 0 ? '#E2D3BC' : '#F2E4CE'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(x + dir * 16.5, y - bodyH * 0.72, 4.2, -Math.PI * 0.9, Math.PI * 0.1)
      ctx.lineWidth = 1.1
      ctx.strokeStyle = 'rgba(255,246,226,0.75)'
      ctx.stroke()
    })

    // 头顶一点暖高光：读成「头」，不用画五官
    ctx.beginPath()
    ctx.ellipse(x - 1, y - bodyH * 1.42, 7.2, 3.4, -0.12, Math.PI, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,248,232,0.55)'
    ctx.fill()

    ctx.restore()
  }

  _drawFx(vm) {
    const ctx = this.ctx
    const L = this.L
    const now = vm.musicMs
    const notes = vm.notes || []
    const TAU = Math.PI * 2
    const haloOf = (side, a) => (side === 'left' ? 'rgba(150,212,246,' + a + ')'
      : side === 'right' ? 'rgba(255,196,132,' + a + ')' : 'rgba(255,238,200,' + a + ')')

    for (let i = 0; i < notes.length; i++) {
      const n = notes[i]
      if (!n.judged || n.verdict === 'miss') continue
      const age = (now - n.judgedAt) / 520
      if (age < 0 || age > 1) continue
      const x = this._laneX(n.side, 1)
      const y = L.judgeY

      // ① 冲击帧：命中后一小段时间里，一个近白亮核迅速缩下去。
      //    只画扩散环是没有重量的 —— 必须先「炸」一下，再散开。
      if (age < 0.34) {
        const k = 1 - age / 0.34
        ctx.save()
        ctx.globalAlpha = k * 0.85
        const flash = ctx.createRadialGradient(x, y, 0.5, x, y, 42)
        flash.addColorStop(0, 'rgba(255,255,250,0.95)')
        flash.addColorStop(0.34, haloOf(n.side, 0.42))
        flash.addColorStop(1, haloOf(n.side, 0))
        ctx.fillStyle = flash
        ctx.beginPath()
        ctx.arc(x, y, 42, 0, TAU)
        ctx.fill()
        ctx.restore()
      }

      // ② 扩散环：扁的（贴着跑道平面）。正圆环在透视地面上会读成「泡泡」。
      const ringR = 18 + age * 56
      ctx.save()
      ctx.globalAlpha = Math.max(0, 1 - age) * 0.9
      ctx.beginPath()
      ctx.ellipse(x, y, ringR, ringR * 0.40, 0, 0, TAU)
      ctx.lineWidth = 2.6 * (1 - age)
      ctx.strokeStyle = haloOf(n.side, 1)
      ctx.stroke()
      ctx.restore()

      // ③ 碎光：10 颗，先快后慢（easeOut），1/3 纯白当高光
      const ease = 1 - Math.pow(1 - age, 2.4)
      ctx.save()
      for (let k = 0; k < 10; k++) {
        const a = hash(k, i) * Math.PI * 2
        const sp = 34 + hash(k + 9, i) * 82
        const px = x + Math.cos(a) * sp * ease
        const py = y + Math.sin(a) * sp * ease * 0.52 - 46 * ease * ease
        ctx.globalAlpha = (1 - age) * 0.9
        ctx.fillStyle = k % 3 === 0 ? 'rgba(255,252,240,1)' : haloOf(n.side, 1)
        ctx.beginPath()
        ctx.arc(px, py, Math.max(0.6, 3.4 * (1 - age)), 0, TAU)
        ctx.fill()
      }
      ctx.restore()
    }

    // 漏接：判定线上一道非常轻的冷灰波纹。不用红 —— 康复语境里失误不该
    // 被做成「报警」，它只是「这一次没接住」。
    if (vm.missFlash > 0.02) {
      ctx.save()
      ctx.globalAlpha = vm.missFlash * 0.28
      ctx.beginPath()
      ctx.moveTo(L.cx - L.roadBottomHalf * 0.9, L.judgeY)
      ctx.lineTo(L.cx + L.roadBottomHalf * 0.9, L.judgeY)
      ctx.lineWidth = 2
      ctx.strokeStyle = 'rgba(168,182,196,0.9)'
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
    const y = L.judgeY - 108 - age * 14
    // 漏接不给红：康复语境里失误只是「这一次没接住」，
    // 红字会让患者以为自己出错。用冷灰，读起来是「过去了」。
    const glow = f.verdict === 'miss' ? 'rgba(168,182,196,0.95)' : style.color

    ctx.save()
    ctx.globalAlpha = clamp(alpha, 0, 1)
    ctx.translate(L.cx, y)
    ctx.scale(scale, scale)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const label = style.mark + ' ' + style.en
    ctx.font = '800 22px ' + FONT

    // 判定字直接发在画面上，不再套白胶囊 ——
    // 白底胶囊在暗画面里就是一块贴纸，把「我做到了」的力度全削掉了。
    // 力度靠两层光晕 + 一层近白芯叠出来。
    ctx.shadowColor = glow
    ctx.shadowBlur = 18
    ctx.fillStyle = glow
    ctx.fillText(label, 0, 0)
    ctx.shadowBlur = 9
    ctx.fillText(label, 0, 0)
    ctx.shadowBlur = 0
    ctx.fillStyle = f.verdict === 'miss' ? 'rgba(206,216,226,0.95)' : '#FFF8EA'
    ctx.fillText(label, 0, 0)

    ctx.font = '600 10px ' + FONT
    ctx.fillStyle = 'rgba(255,246,228,0.66)'
    const sub = style.zh + (f.deltaMs !== undefined ? '  ' + (f.deltaMs > 0 ? '+' : '') + f.deltaMs + 'ms' : '')
    ctx.fillText(sub, 0, 21)
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
  /** 蓝色胶囊（顶部标题 / 曲目） */
  _pill(x, y, w, h) {
    const ctx = this.ctx
    ctx.save()
    ctx.shadowColor = 'rgba(4,10,18,0.40)'
    ctx.shadowBlur = 12
    ctx.shadowOffsetY = 4
    rr(ctx, x, y, w, h, h / 2)
    const g = ctx.createLinearGradient(x, y, x, y + h)
    g.addColorStop(0, 'rgba(30,46,64,0.92)')
    g.addColorStop(1, 'rgba(15,26,40,0.94)')
    ctx.fillStyle = g
    ctx.fill()
    ctx.restore()
    rr(ctx, x, y, w, h, h / 2)
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(255,236,206,0.22)'
    ctx.stroke()
  }

  /** 数据卡里的小图标（杯子 / 准星 / 火苗 / 时钟） */
  _statIcon(name, x, y, r, color) {
    const ctx = this.ctx
    ctx.save()
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = Math.max(1.2, r * 0.16)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (name === 'trophy') {
      ctx.beginPath()
      ctx.moveTo(x - r * 0.55, y - r * 0.6)
      ctx.lineTo(x + r * 0.55, y - r * 0.6)
      ctx.lineTo(x + r * 0.32, y + r * 0.12)
      ctx.lineTo(x - r * 0.32, y + r * 0.12)
      ctx.closePath()
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x, y + r * 0.12)
      ctx.lineTo(x, y + r * 0.5)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x - r * 0.42, y + r * 0.62)
      ctx.lineTo(x + r * 0.42, y + r * 0.62)
      ctx.stroke()
    } else if (name === 'target') {
      ctx.beginPath()
      ctx.arc(x, y, r * 0.66, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(x, y, r * 0.24, 0, Math.PI * 2)
      ctx.fill()
    } else if (name === 'flame') {
      ctx.beginPath()
      ctx.moveTo(x, y - r * 0.72)
      ctx.quadraticCurveTo(x + r * 0.62, y - r * 0.05, x + r * 0.28, y + r * 0.5)
      ctx.quadraticCurveTo(x, y + r * 0.72, x - r * 0.28, y + r * 0.5)
      ctx.quadraticCurveTo(x - r * 0.62, y - r * 0.05, x, y - r * 0.72)
      ctx.closePath()
      ctx.fill()
    } else if (name === 'clock') {
      ctx.beginPath()
      ctx.arc(x, y, r * 0.66, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x, y - r * 0.34)
      ctx.lineTo(x, y)
      ctx.lineTo(x + r * 0.3, y + r * 0.14)
      ctx.stroke()
    } else if (name === 'note') {
      this._musicGlyph(x, y, r * 0.9, color)
    }
    ctx.restore()
  }

  /** 八分音符：音符上的图标，比实心三角更好认 */
  _musicGlyph(x, y, size, color) {
    const ctx = this.ctx
    const k = size / 10
    ctx.save()
    ctx.translate(x, y)
    ctx.fillStyle = color
    ctx.strokeStyle = color
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.ellipse(-k * 2.2, k * 2.6, k * 3.0, k * 2.2, -0.36, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(k * 0.7, k * 2.2)
    ctx.lineTo(k * 0.7, -k * 5.2)
    ctx.lineWidth = Math.max(1.4, k * 1.7)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(k * 0.7, -k * 5.2)
    ctx.quadraticCurveTo(k * 4.6, -k * 4.2, k * 3.4, -k * 0.6)
    ctx.lineWidth = Math.max(1.4, k * 2.1)
    ctx.stroke()
    ctx.restore()
  }

  _fmtClock(sec) {
    const s = Math.max(0, Math.round(sec || 0))
    const mm = Math.floor(s / 60)
    const ss = s % 60
    return (mm < 10 ? '0' + mm : mm) + ':' + (ss < 10 ? '0' + ss : ss)
  }

  _drawHud(vm) {
    const ctx = this.ctx
    const L = this.L
    const W = L.W
    const short = L.short
    const top = L.safeTop
    const pad = 14
    const TAU = Math.PI * 2

    // 2026-11-01：HUD 全拆。原来这里是「两枚胶囊 + 四张数据卡」共 6 个容器，
    // 加上场上的音符卡与连击牌就是 8 个 —— 页面读起来像控制面板而不是游戏。
    // 现在数字**直接浮在画面上**，容器只留给暂停面板和结算页。

    // ---- 顶部：一条 2px 的进度线，替掉原来第 4 张卡的进度条 ----
    const pw = W - pad * 2
    const ratio = clamp((vm.timeLeftSec || 0) / Math.max(1, vm.durationSec || 1), 0, 1)
    rr(ctx, pad, top, pw, 2, 1)
    ctx.fillStyle = 'rgba(255,236,206,0.13)'
    ctx.fill()
    if (ratio > 0.005) {
      rr(ctx, pad, top, Math.max(2, pw * ratio), 2, 1)
      ctx.fillStyle = 'rgba(255,214,168,0.72)'
      ctx.fill()
    }

    // ---- 第一行：剩余时间（左） / 曲目 + BPM（右）----
    const clockStr = this._fmtClock(vm.timeLeftSec)
    const r1 = top + 20
    const clockSize = short ? 13 : 14
    this._text(clockStr, pad, r1, { size: clockSize, weight: '800', color: '#FFF6E4' })
    this._text('剩余', pad + this._measure(clockStr, clockSize, '800') + 5, r1, {
      size: 9, weight: '600', color: C.inkMute
    })
    // BPM 已经不再决定节奏（门控下音符什么时候来由患者决定），
    // 所以这里读的是难度档位 —— 显示一个不参与任何计算的 BPM 是误导。
    this._text(vm.song.name + ' · ' + (vm.difficultyLabel || ('第 ' + vm.difficulty + ' 档')), W - pad, r1, {
      size: 10, weight: '600', color: 'rgba(244,234,220,0.58)', align: 'right'
    })

    // ---- 第二行：分数大字（唯一的视觉重心）----
    const r2 = r1 + (short ? 30 : 36)
    const scoreStr = String(vm.score)
    const scoreSize = short ? 28 : 34
    this._text(scoreStr, pad, r2, { size: scoreSize, weight: '800', color: '#FFF6E4' })
    this._text('分', pad + this._measure(scoreStr, scoreSize, '800') + 4, r2, {
      size: 10, weight: '700', color: C.inkMute
    })

    // ---- 稳定度（右，冷青 —— 与暖金主色区分开，不抢重心）----
    // 原来是「节奏准确率」，门控后时间维度不存在了，换成本局真正在练的东西。
    const acc = vm.stabilityRate === null || vm.stabilityRate === undefined
      ? '—' : Math.round(vm.stabilityRate * 100) + '%'
    this._text(acc, W - pad, r2, {
      size: short ? 14 : 16, weight: '800', color: 'rgba(150,212,246,0.95)', align: 'right'
    })
    this._text('稳定度', W - pad, r2 + 12, {
      size: 8, weight: '600', color: C.inkMute, align: 'right'
    })

    // ---- 场地右上：完成个数（小字，无卡）----
    // 不写「漏 N」：门控下不存在漏接，音符会一直等到做完为止。
    this._text('已完成 ' + (vm.completed || 0) + ' 个', W - pad, L.stageTop + 16, {
      size: 10, weight: '700', color: 'rgba(244,234,220,0.66)', align: 'right'
    })

    // ---- 场地左上：连击。纯字 + 光晕，不套牌；每 5 连击升一档色温 ----
    if ((vm.combo || 0) >= 2) {
      const cxx = pad + 2
      const cyy = L.stageTop + 46
      const tier = Math.min(3, Math.floor((vm.combo || 0) / 5))
      const col = [
        'rgba(255,246,228,0.92)',
        'rgba(255,226,186,0.96)',
        'rgba(255,208,150,1)',
        'rgba(255,232,168,1)'
      ][tier]
      const pop = 1 + Math.max(0, 0.16 - (vm.comboFlash || 0) * 0.30)
      ctx.save()
      ctx.translate(cxx, cyy)
      ctx.scale(pop, pop)
      const gl = ctx.createRadialGradient(0, -6, 1, 0, -6, 38)
      gl.addColorStop(0, 'rgba(255,196,132,' + (0.16 + tier * 0.05).toFixed(2) + ')')
      gl.addColorStop(1, 'rgba(255,196,132,0)')
      ctx.fillStyle = gl
      ctx.beginPath()
      ctx.arc(0, -6, 38, 0, TAU)
      ctx.fill()
      this._text('×' + vm.combo, 0, 0, { size: short ? 22 : 26, weight: '800', color: col })
      this._text('连击', 0, short ? 12 : 14, { size: 9, weight: '700', color: 'rgba(244,234,220,0.58)' })
      ctx.restore()
    }
  }

  _drawBottomBar(vm) {
    const ctx = this.ctx
    const L = this.L
    const W = L.W
    const y = L.posY
    const h = L.posH
    const TAU = Math.PI * 2
    const pad = 14

    // ---- 身体位置：贴着跑道底边的一条细光带，**没有卡片底** ----
    // 这个信息必须留（患者在练「回到中立位」，它是唯一的实时反馈），
    // 但不需要容器：一块白卡压在这儿正好把跑道尽头挡住。
    const tx0 = pad + 56
    const tx1 = W - pad - 56
    const tw = Math.max(40, tx1 - tx0)
    const ty = y + h * 0.46

    this._text('身体位置', pad, ty + 3, { size: 8.5, weight: '700', color: C.inkMute })

    // 轨道：左冷右暖，和车道、判定台同一套色温语言
    const g = ctx.createLinearGradient(tx0, 0, tx1, 0)
    g.addColorStop(0, 'rgba(150,212,246,0.62)')
    g.addColorStop(0.5, 'rgba(255,238,200,0.62)')
    g.addColorStop(1, 'rgba(255,196,132,0.62)')
    rr(ctx, tx0, ty - 1.6, tw, 3.2, 1.6)
    ctx.fillStyle = 'rgba(255,236,206,0.08)'
    ctx.fill()
    rr(ctx, tx0, ty - 1.6, tw, 3.2, 1.6)
    ctx.fillStyle = g
    ctx.fill()

    ;[0, 0.5, 1].forEach((u) => {
      ctx.beginPath()
      ctx.arc(tx0 + tw * u, ty, 1.4, 0, TAU)
      ctx.fillStyle = 'rgba(255,246,228,0.40)'
      ctx.fill()
    })

    // 位置光点：一小团光，不再用第二个团子 ——
    // 场地里已经有一个小人，底部再来一个只是重复。
    const nx = clamp(vm.nx || 0, -1, 1)
    const px = tx0 + tw * (nx + 1) / 2
    const gl = ctx.createRadialGradient(px, ty, 0.5, px, ty, 11)
    gl.addColorStop(0, 'rgba(255,246,228,0.92)')
    gl.addColorStop(0.35, 'rgba(255,214,168,0.50)')
    gl.addColorStop(1, 'rgba(255,214,168,0)')
    ctx.fillStyle = gl
    ctx.beginPath()
    ctx.arc(px, ty, 11, 0, TAU)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(px, ty, 3.2, 0, TAU)
    ctx.fillStyle = '#FFF6E4'
    ctx.fill()

    // ---- 按钮：只留两个圆形图标 ----
    // 音量 / 节拍这些是治疗师参数，移进暂停面板：对局中患者只需要「停」和「走」。
    this._button('quit', pad, L.btnY, L.btnH, L.btnH, '', {
      variant: 'dark', icon: 'exit', size: 15
    })
    this._button('pause', W - pad - L.btnH, L.btnY, L.btnH, L.btnH, '', {
      variant: vm.state === 'PAUSED' ? 'darkOn' : 'dark',
      icon: vm.state === 'PAUSED' ? 'play' : 'pause',
      size: 15
    })
  }

  _drawCountdown(vm) {
    const ctx = this.ctx
    const L = this.L
    const n = Math.max(1, vm.countdownBeat)
    // 按秒呼吸，不再按拍长 —— 音符已经不跟拍点走了
    const frac = vm.countdownSec - Math.floor(vm.countdownSec)
    const scale = 1 + (1 - frac) * 0.25

    ctx.save()
    ctx.fillStyle = 'rgba(8,16,26,0.58)'
    ctx.fillRect(0, L.stageTop, L.W, L.stageBottom - L.stageTop)

    ctx.translate(L.cx, L.stageTop + (L.stageBottom - L.stageTop) * 0.42)
    ctx.scale(scale, scale)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '800 76px ' + FONT
    ctx.lineWidth = 10
    ctx.strokeStyle = 'rgba(255,226,186,0.26)'
    ctx.strokeText(String(n), 0, 0)
    ctx.fillStyle = '#FFF6E4'
    ctx.shadowColor = 'rgba(255,196,132,0.70)'
    ctx.shadowBlur = 26
    ctx.fillText(String(n), 0, 0)
    ctx.shadowBlur = 0
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
    ctx.fillStyle = 'rgba(6,12,20,' + (alpha === undefined ? 0.6 : alpha) + ')'
    ctx.fillRect(0, 0, L.W, L.H)
    ctx.restore()
  }

  _drawPauseOverlay(vm) {
    const ctx = this.ctx
    const L = this.L
    this._dim(0.66)
    const w = L.W - 64
    const h = 318
    const x = 32
    const y = (L.H - h) / 2 - 20
    this._glass(x, y, w, h)
    this._text('已暂停', L.cx, y + 44, { size: 20, weight: '800', color: C.ink, align: 'center' })
    this._text('音符会停在原地等你，不会漏掉', L.cx, y + 68, { size: 10, weight: '500', color: C.inkMute, align: 'center' })
    this._text('已完成 ' + (vm.completed || 0) + ' 个 · 稳定度 ' +
      (vm.stabilityRate === null || vm.stabilityRate === undefined ? '—' : Math.round(vm.stabilityRate * 100) + '%'),
    L.cx, y + 92, {
      size: 11, weight: '600', color: C.inkSoft, align: 'center'
    })
    this._button('resume', x + 20, y + 112, w - 40, 46, '继续训练', { variant: 'primary', icon: 'play', size: 14 })

    // 音量和节拍提示从对局底栏挪到这里：它们是治疗师/陪护参数，
    // 对局中患者不该被四个按钮分散注意力。对局里只留「停」和「走」。
    const beatOn = this.cfg.get('beatPulseOn')
    const vol = Math.round((Number(this.cfg.get('musicVolume')) || 0) * 100)
    const half = (w - 40 - 8) / 2
    this._button('vol', x + 20, y + 170, half, 38, '音量 ' + vol + '%', {
      variant: 'dark', icon: 'volume', size: 10.5, radius: 12
    })
    this._button('beat', x + 20 + half + 8, y + 170, half, 38, '节拍' + (beatOn ? '开' : '关'), {
      variant: beatOn ? 'darkOn' : 'dark', icon: 'wave', size: 10.5, radius: 12
    })
    this._button('quit', x + 20, y + 220, w - 40, 40, '结束本局并查看成绩', {
      variant: 'dark', icon: 'check', size: 11, radius: 12
    })
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

    // 压暗而不是提亮：三套背景都是暗调，盖一层白磨砂会把刚画好的天色
    // 全洗掉（三套主题看起来就都一样了）。这里只加一层很轻的暗幕，
    // 上面的暖白标题在暗底上才立得住。
    const scrim = ctx.createLinearGradient(0, 0, 0, H)
    scrim.addColorStop(0, 'rgba(6,12,20,0.30)')
    scrim.addColorStop(0.45, 'rgba(6,12,20,0.40)')
    scrim.addColorStop(1, 'rgba(6,12,20,0.72)')
    ctx.fillStyle = scrim
    ctx.fillRect(0, 0, W, H)

    const top = L.safeTop + 16
    this._text('节奏训练', 24, top + 36, {
      size: 30, weight: '800', color: C.ink
    })
    this._text('音符会停在判定线等你 —— 做到才出下一个，不会漏', 25, top + 60, {
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
    chips.push({ t: (THEMES[vm.backgroundId] || THEMES.dawn).label, bg: 'rgba(30,46,64,0.84)', fg: 'rgba(244,234,220,0.90)' })
    chips.push({ t: '第 ' + vm.difficulty + ' 档', bg: 'rgba(30,46,64,0.84)', fg: 'rgba(244,234,220,0.90)' })
    chips.forEach((c) => {
      const w = this._measure(c.t, 10, '700') + 18
      rr(ctx, cx, top + 74, w, 22, 11)
      ctx.fillStyle = c.bg
      ctx.fill()
      this._text(c.t, cx + w / 2, top + 89, { size: 10, weight: '700', color: c.fg, align: 'center' })
      cx += w + 6
    })

    // ---- 背景选择：三枚色卡，右上角一行 ----
    // 放在这里而不是卡片里，是因为卡片高度是按内容贴底算的，多一行会把
    // 「玩法三步」和「本局参数」挤掉（窄屏上直接不显示）。
    // 圆点本身就是那套天空的渐层，不用文字说明也看得懂。
    const swR = 18
    const swGap = 8
    const swTotal = swR * 2 * 3 + swGap * 2
    const swX0 = W - 24 - swTotal
    const swTop = top + 8 + swR
    THEME_IDS.forEach((tid, i) => {
      const th = THEMES[tid]
      const sx = swX0 + i * (swR * 2 + swGap) + swR
      const on = tid === vm.backgroundId
      ctx.save()
      ctx.beginPath()
      ctx.arc(sx, swTop, swR, 0, Math.PI * 2)
      const gg = ctx.createLinearGradient(sx, swTop - swR, sx, swTop + swR)
      gg.addColorStop(0, th.sky[0].color)
      gg.addColorStop(0.55, th.sky[2].color)
      gg.addColorStop(1, th.sky[th.sky.length - 1].color)
      ctx.fillStyle = gg
      ctx.fill()
      // 光源小点：月夜是冷的、暮色是暖的，一眼能分出来
      ctx.beginPath()
      ctx.arc(sx + swR * 0.22, swTop + swR * 0.32, swR * 0.22, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(' + th.farFade + ',0.95)'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(sx, swTop, swR, 0, Math.PI * 2)
      ctx.lineWidth = on ? 2.4 : 1
      ctx.strokeStyle = on ? 'rgba(255,246,228,0.95)' : 'rgba(255,236,206,0.28)'
      ctx.stroke()
      ctx.restore()
      this.buttons.push({ id: 'bg:' + tid, x: sx - swR, y: swTop - swR, w: swR * 2, h: swR * 2 })
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
    this._text('选择音色', cardX + 20, y + 8, { size: 11, weight: '700', color: C.ink })
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
      // 不再显示 BPM：门控下节奏与 BPM 无关，写了只会让人以为快曲子更难
      this._text(s.tag + ' · 命中发声', sx + 12, y + 42, { size: 9, weight: '500', color: C.inkMute })
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
      // 选中的档位用暖金（和「开始训练」同一个强调色）；原来用紫底紫字，
      // 在暗底上 #7B5FD6 几乎读不出来。
      ctx.fillStyle = on ? 'rgba(255,214,168,0.20)' : 'rgba(255,236,206,0.05)'
      ctx.fill()
      ctx.lineWidth = on ? 1.4 : 1
      ctx.strokeStyle = on ? 'rgba(255,214,168,0.70)' : C.line
      ctx.stroke()
      this._text(String(i), dx + dw / 2, y + 20, {
        size: 12, weight: '800', color: on ? '#FFF6E4' : C.inkMute, align: 'center'
      })
      this.buttons.push({ id: 'lv:' + i, x: dx, y: y, w: dw, h: 30 })
    }
    y += 46

    // 玩法三步
    if (showSteps) {
      const steps = [
        '站好或坐稳 —— 零点在首页标定过就行，不用每次重标',
        '音符飞到判定线会停下来等，向左 / 回正 / 向右移动身体',
        '在该侧稳住一会儿就完成，然后才出下一个音符'
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
      const approach = Number(this.cfg.get('approachMs')) || 1700
      const gap = Number(this.cfg.get('gapMs')) || 0
      const hold = Number(this.cfg.get('holdMs')) || 400
      const cycle = approach + gap + hold
      const durationSec = Number(this.cfg.get('durationSec')) || 90
      const est = Math.max(1, Math.round(durationSec * 1000 / cycle))
      const params = [
        { k: '时长', v: durationSec + ' 秒' },
        { k: '保持要求', v: hold + 'ms' },
        { k: '音符喘息', v: gap + 'ms' },
        { k: '大约能完成', v: '约 ' + est + ' 个' }
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
    this._text('戴好胸带 → 音画校准 → 开始', 23, L.safeTop + 56, {
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
      { t: vm.sim ? '模拟输入' : ((vm.rateHz || 0) + ' Hz'), bg: 'rgba(30,46,64,0.84)', fg: 'rgba(244,234,220,0.90)' }
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
    this._text(vm.song.name, cardX + 18, infoY + 10, {
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
      { t: '坐稳或站稳', d: '双手自然放下，身体保持中立位' },
      // 不再提「听 N 拍」：音符节奏已经独立于音乐，跟着拍子动反而会错
      { t: '跟着音符左右移动', d: '音符落到判定线时把重心移到对应一侧' }
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

    // 零点：只报状态，不做独立标定
    // 零点全 App 只有一份，统一在「零点标定」页设置；这里再放一套就等于让用户标两遍
    const calY = stepTop + steps.length * 40 + 2
    const z = vm.zero || { roll: 0, pitch: 0, set: false }
    const fDeg = (v) => (v >= 0 ? '+' : '') + (Math.round(v * 10) / 10).toFixed(1) + '°'
    if (z.set) {
      this._text('当前零点 ' + fDeg(z.roll) + ' / ' + fDeg(z.pitch), cardX + 18, calY + 10, {
        size: 10, weight: '600', color: C.mintDeep
      })
    } else {
      this._text('还没设置零点，读数按传感器原始角度算', cardX + 18, calY + 10, {
        size: 9.5, weight: '600', color: C.danger
      })
    }
    this._button('zero:set', cardX + cardW - 92, calY, 74, 26, z.set ? '重设' : '去标定', {
      variant: 'ghost', size: 10
    })

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
      variant: 'primary', icon: 'play', size: 15
    })
    this._button(vm.sim ? 'sim:off' : 'sim:on', cardX + 18, ghostTop, cardW - 36, 38,
      vm.sim ? '关闭模拟' : '使用模拟数据', { variant: 'ghost', icon: 'check', size: 11 })
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
    scrim.addColorStop(0, 'rgba(6,12,20,0.58)')
    scrim.addColorStop(0.5, 'rgba(6,12,20,0.66)')
    scrim.addColorStop(1, 'rgba(6,12,20,0.76)')
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
    // BPM 不再参与任何计算，结算页写它只会让人以为「快曲子更难」
    this._text((s.songName || '') + ' · 第 ' + (s.difficulty || 0) + ' 档', gx, y + 34, {
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
    resScore.addColorStop(0, '#FFF4DA')
    resScore.addColorStop(0.55, '#F7CB8A')
    resScore.addColorStop(1, '#E7A55E')
    ctx.save()
    ctx.font = '800 ' + (tight ? 36 : 40) + 'px ' + FONT
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = resScore
    ctx.fillText(scoreStr, gx, y + (tight ? 84 : 90))
    ctx.restore()
    const sw = this._measure(scoreStr, tight ? 36 : 40, '800')
    this._text('分', gx + sw + 5, y + (tight ? 84 : 90), { size: 11, weight: '600', color: C.inkMute })
    this._text('完成 ' + (s.completed || 0) + ' 个音符 · 连击最高 ×' + (s.comboMax || 0),
      gx, y + (tight ? 104 : 110), { size: 9.5, weight: '500', color: C.inkSoft })

    // 四档判定计数：**没有 MISS 这一档**。门控下音符会一直等到做完，
    // 「未完成」只可能是时间到点时的那一个，用中性灰、不给红。
    const tileY = y + (tight ? 116 : 122)
    const tileH = 44
    const tiles = [
      { k: '稳住了', v: s.perfect || 0, c: VERDICT_INK.perfect },
      { k: '很稳', v: s.great || 0, c: VERDICT_INK.great },
      { k: '完成了', v: s.good || 0, c: VERDICT_INK.good },
      { k: '未完成', v: s.unsolved || 0, c: VERDICT_INK.unsolved }
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
    const distTotal = Math.max(1, (s.perfect || 0) + (s.great || 0) + (s.good || 0) + (s.unsolved || 0))
    const dist = [
      { v: s.perfect || 0, c: VERDICT_STYLE.perfect.color },
      { v: s.great || 0, c: VERDICT_STYLE.great.color },
      { v: s.good || 0, c: VERDICT_STYLE.good.color },
      { v: s.unsolved || 0, c: VERDICT_STYLE.unsolved.color }
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

    // 三个新指标（门控口径）：时间维度已经不存在，别再把恒等于 100% 的
    // 「方向准确率 / 综合命中率」摆出来骗人。
    y = distY + (tight ? 18 : 22)
    const accs = [
      { k: '稳定度', v: s.stabilityRate, tip: '加权：稳住 / 很稳 / 完成' },
      { k: '左右均衡', v: s.balanceRate, tip: '1 - |左-右| / (左+右)' },
      { k: '平均节奏', v: s.paceSec, tip: '每个音符平均用了几秒', unit: '秒' }
    ]
    const accW = gw / 3
    accs.forEach((a, i) => {
      const ax = gx + i * accW
      this._text(a.k, ax, y + 9, { size: 9.5, weight: '600', color: C.inkMute })
      let txt = '暂无数据'
      let big = true
      if (a.v !== null && a.v !== undefined) {
        txt = a.unit ? String(a.v) + ' ' + a.unit : Math.round(a.v * 100) + '%'
        big = !a.unit
      } else {
        big = false
      }
      this._text(txt, ax, y + 27, {
        size: big ? 15 : 11,
        weight: '800',
        color: a.v === null || a.v === undefined ? C.inkMute : C.ink
      })
    })
    y += 42

    // 明细
    // 左/中/右 不再单列一行：下面的对比条已经把它们画出来了，重复一遍只是噪声。
    const rows = [
      ['平均到位用时', (s.avgReactionMs === null || s.avgReactionMs === undefined) ? '—' : (s.avgReactionMs + ' ms')],
      ['平均保持', (s.avgHoldMs === null || s.avgHoldMs === undefined) ? '—' : (s.avgHoldMs + ' ms')],
      ['训练时长', (s.durationSec || 0).toFixed(1) + ' / ' + (s.plannedSec || 0).toFixed(0) + ' 秒'],
      ['数据中断', (s.interruptedSec || 0).toFixed(1) + ' 秒'],
      ['序列种子', String(s.chartSeed || '-')]
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
    const st = s.stabilityRate
    const done = s.completed || 0
    if (st === null || st === undefined || !done) {
      out.push('本局一个音符也没完成：先确认传感器连上、并且在「零点」状态下开始')
    } else if (st >= 0.85) {
      out.push('站得很稳，可以试试提高一档：要求保持更久、节奏也更紧凑')
    } else if (st >= 0.65) {
      out.push('基本能稳住，注意进入该侧后别急着回，让身体安静下来')
    } else {
      out.push('中途晃得比较多：先把「保持要求」调低、把「音符喘息」调大一点')
    }
    // 左右失衡才是康复最该提示的，优先于其他
    const l = s.leftHitCount || 0
    const r = s.rightHitCount || 0
    if (l + r >= 6 && Math.abs(l - r) / (l + r) > 0.4) {
      out.push(l > r ? '明显偏左侧，下一局试试多向右边移动' : '明显偏右侧，下一局试试多向左边移动')
    } else if (done > 0 && (s.paceSec || 0) > 4) {
      out.push('每个音符平均用了 ' + s.paceSec + ' 秒偏慢，可以适当缩短「音符喘息」')
    } else if ((s.comboMax || 0) >= 10) {
      out.push('连续稳住的次数不错，保持这个状态继续练')
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
    // 收成左上角一枚小标签：测试用，别抢画面
    const x = 12
    const y = L.stageTop + 1
    const w = this.simOpen ? L.W - 24 : 46
    const rowH = 26
    const h = this.simOpen ? 26 + rowH * 2 : 18

    rr(ctx, x, y, w, h, 9)
    ctx.fillStyle = 'rgba(255,226,150,0.55)'
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(232,148,42,0.45)'
    ctx.stroke()
    this._text('模拟' + (this.simOpen ? ' ▴' : ' ▾'), x + 8, y + (this.simOpen ? 17 : 13), {
      size: 8.5, weight: '700', color: '#B57A1E'
    })
    this.buttons.push({ id: 'sim:toggle', x: x, y: y, w: this.simOpen ? 74 : w, h: this.simOpen ? 26 : 18 })

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
    ctx.shadowColor = 'rgba(4,10,18,0.55)'
    ctx.shadowBlur = 30
    ctx.shadowOffsetY = 12
    rr(ctx, x, y, w, h, r || 20)
    const g = ctx.createLinearGradient(0, y, 0, y + h)
    g.addColorStop(0, 'rgba(19,31,46,0.95)')
    g.addColorStop(1, 'rgba(11,20,32,0.97)')
    ctx.fillStyle = g
    ctx.fill()
    ctx.restore()

    rr(ctx, x, y, w, h, r || 20)
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(255,236,206,0.15)'
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

    let bg = 'rgba(26,40,56,0.88)'
    let fg = C.ink
    let border = 'rgba(255,236,206,0.22)'
    let shadow = 'rgba(4,10,18,0.44)'
    if (variant === 'primary') {
      // 暖金主按钮（原来是粉橙渐变，在逆光基调里像另一套 App 的控件）
      const g = ctx.createLinearGradient(x, y, x + w, y + h)
      g.addColorStop(0, '#F8CE8C')
      g.addColorStop(0.55, '#EFB070')
      g.addColorStop(1, '#DB8F52')
      bg = g
      fg = '#2A1B10'
      border = 'rgba(255,236,206,0.55)'
      shadow = 'rgba(246,197,131,0.30)'
    } else if (variant === 'glass') {
      bg = 'rgba(30,46,64,0.92)'
      fg = C.ink
      border = 'rgba(255,236,206,0.26)'
    } else if (variant === 'ghostOn') {
      bg = 'rgba(255,214,168,0.18)'
      fg = '#FFF6E4'
      border = 'rgba(255,214,168,0.60)'
    } else if (variant === 'panel') {
      bg = 'rgba(28,42,60,0.92)'
      fg = C.ink
      border = 'rgba(255,236,206,0.20)'
    } else if (variant === 'panelOn') {
      bg = 'rgba(255,214,168,0.18)'
      fg = '#FFF6E4'
      border = 'rgba(255,214,168,0.55)'
    } else if (variant === 'dark') {
      // 暗底上的按钮：对局里的圆形图标按钮
      bg = 'rgba(20,32,46,0.80)'
      fg = 'rgba(246,238,226,0.92)'
      border = 'rgba(255,236,206,0.34)'
      shadow = 'rgba(5,12,21,0.42)'
    } else if (variant === 'darkOn') {
      bg = 'rgba(255,214,168,0.16)'
      fg = '#FFF6E4'
      border = 'rgba(255,214,168,0.55)'
      shadow = 'rgba(255,196,132,0.20)'
    } else if (variant === 'mini') {
      bg = 'rgba(24,38,54,0.82)'
      fg = C.inkSoft
      border = 'rgba(255,236,206,0.16)'
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
    rr(ctx, x, y, w, h, opt.radius || (h / 2))
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
