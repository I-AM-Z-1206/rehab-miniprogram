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
//   3. 越界绳索 + 回正引导光带
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

const { drawWalker, beltWorld, setCharacter, CHARACTERS, CHARACTER_IDS } = require('./character-sprite.js')
// 2.5D 纵深原语（地平线雾 / 远景剪影 / 云海 / 软阴影 / 浮尘 / 暗角）
const depth = require('../../../utils/scene/depth.js')
const fx = require('./fx.js')

const D = 5.2 // 透视深度常数（米）

// 里程界桩统一立在哪一侧：-1 = 画面左，+1 = 画面右。
// 2026-10-31 用户要求「路标统一放一边」（原来是左右交替）。
// 选左是因为角色右手提灯、光晕和活动范围都在右侧，左侧留空给路标，
// 两侧不会互相抢。改这一行就能整体翻到右边。
const SIGN_SIDE = -1

const C = {
  // 2026-11-01：文字色整套翻过来。对局外的三个界面（开始 / 准备 / 结算）
  // 从「不透明白卡」改成「暗玻璃」，浅底上的深字不再存在。
  // 原来这三页和游戏内是两套语言：游戏内一个容器都没有，这三页全是白卡。
  ink: '#F3EBDD',
  inkSoft: 'rgba(243,235,221,0.76)',
  inkMute: 'rgba(243,235,221,0.54)',
  // 浅底上的深字：只有琥珀主按钮和「选中」的角色胶囊会用到
  onLight: '#1A2530',
  teal: '#0F9C8C',
  tealDeep: '#0A7E72',
  tealLight: '#3FC3B0',
  amber: '#E39A32',
  danger: '#DF5540',
  white: '#FFFFFF',
  card: 'rgba(12,21,32,0.78)',
  cardSoft: 'rgba(12,21,32,0.55)',
  line: 'rgba(226,238,248,0.13)'
}

const SKY = {
  // 日出逆光。三个约束缺一不可：
  //   ① 天顶必须深（明度 < 25%），否则整屏没有暗部锚点，看什么都是奶白的；
  //   ② 中段必须有一次**色彩转折**（蓝 → 灰紫）。单调变亮就是「滤镜」，
  //      这是 AI 插画天空最典型的特征；
  //   ③ 金色只允许出现在地平线以上最后 12%。铺得越广越像廉价渐变。
  top: '#132540',
  upper: '#22405C',
  mid: '#4A6178',
  warm: '#96796C',
  glowLow: '#DFA875',
  horizon: '#FFE0B0',
  sunCore: 'rgba(255,240,206,0.88)',

  // 远山：逆光下是**深色剪影**，不是「比天空淡一层」。
  // 三层靠明度递进拉空气透视（远浅 · 中中 · 近深），不是靠透明度叠三张纸。
  farTop: '#33506B', farBot: '#7089A0',
  midTop: '#1E3651', midBot: '#456179',
  nearTop: '#112335', nearBot: '#293F58',

  // 云海：顶面被朝阳照亮 = 暖白；沟槽背光 = 冷紫。
  // 这个明暗交界是「云有厚度」的唯一依据，也是纵深感的来源。
  // 云体必须是**冷白**（几乎中性），暖色只允许出现在被夕阳扫到的顶面。
  // 上一版整朵云都用 255,238,212（暖米黄），在深蓝背景上立刻读成「沙漠/沙丘」——
  // 米黄 + 上亮下暗 + 扁椭圆 = 沙丘的全部特征。云和沙的差别就在色温。
  cloudHi: '249,250,250',
  cloudWarm: '255,226,186',
  cloudLo: '86,110,136',
  mist: '235,217,194'
}

/** 拼 rgba 字符串。字符串模板里反复写 'rgba(' + a + ',' + b 太容易出错 */
function buildRgba(r, g, b, a) {
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a.toFixed(3) + ')'
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

    // 角色是纯矢量绘制（character.js），没有任何异步资源，不需要预加载。
    // 2026-10-31 之前这里走 Blender 序列帧图集，那条链路上的所有坑
    //（wx.createImage onload 不触发 / base64 兜底 / 切帧错位）随图集一起删除。

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
      // 消失点必须与 horizonY 完全相等。之前 farY 比地平线低 1.7%H（约 14px），
      // 钢丝走到离地平线还有 14px 的地方就停了，末端收成一个圆头 ——
      // 读起来是「空中插着一截灰柱子」，不是「一根伸向远方的钢缆」。
      // 钢丝、安全走廊、里程灯统一用这一个消失点。
      farY: H * 0.335,
      // 脚底线：短屏时上移，保证底部平衡条不会压住脚
      charY: Math.min(H * 0.775, H - 170),
      charH: charH,
      charScale: charH / 190,
      wireNearHalf: Math.max(3.2, W * 0.0084),
      corridor: Math.max(34, W * 0.125),
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
    // 角色换了要重建图集：setCharacter 内部对同一个 id 是零开销的（直接返回），
    // 所以每帧调一次也没关系。必须在画人之前调，否则这一帧还是旧图。
    setCharacter(this.cfg.get('characterId') || 'fox')

    this._drawBackground()
    this._drawWorld(vm, screen)
    this._updateFx(vm, dt)

    if (screen === 'play') this._drawHud(vm)
    else if (screen === 'intro') this._drawIntro(vm)
    else if (screen === 'prepare') this._drawPrepare(vm)
    else this._drawResult(vm)

    this._drawTransient()
    // 里程飘字只在进行中出现：它画在最后（压在所有面板之上），
    // 结算页上会直接盖在结算卡片的正文上。
    if (screen === 'play') this._drawMilestone()
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

    // ---------- 天空：深靛天顶 → 灰紫转折 → 暖金地平线 ----------
    // 原来是一条 #7BC6EA → #B6E2F4 → #E8F5F4 的三段渐变，
    // 外加一颗半径 W*0.62 的白色径向 —— 「AI 插画天空」就是这么来的：
    // 明度单调变亮、只有一个色相、再给整个上半屏糊一层白。
    // 后果是整屏明度 70~92%，没有任何暗部，角色成了画面里唯一的重块。
    // 金色必须压在最后 8%：上一版从 0.76 就开始转暖，
    // 等于给地平线铺了一条 70px 高的橙带 —— 那正是「渐变壁纸」的观感。
    // 真实日出的暖色是一道很窄的余晖，上面很快就回到灰紫。
    const sky = g.createLinearGradient(0, 0, 0, hz + 6)
    sky.addColorStop(0, SKY.top)
    sky.addColorStop(0.30, SKY.upper)
    sky.addColorStop(0.62, SKY.mid)
    sky.addColorStop(0.845, '#5E6478')
    sky.addColorStop(0.928, '#9A7A72')
    sky.addColorStop(0.972, '#D9A277')
    sky.addColorStop(1, SKY.horizon)
    g.fillStyle = sky
    g.fillRect(0, 0, W, hz + 6)

    // ---------- 太阳：被远山挡住大半的一团眩光 ----------
    // 压在**正中**：太阳 / 钢丝 / 角色在同一条竖线上。
    // 这是整张画面唯一的叙事 ——「朝着日出走」，
    // 而且顺带把人物变成逆光半剪影，比打一层白柔光高级得多。
    // 只两层正圆（大气晕 + 光核），不做压扁变换：
    // 径向渐变在 CTM 下的坐标解释各基础库不一致，压扁过就有的机型不显示。
    const sx = W * 0.5
    const sy = hz - 6
    const hR = W * 0.52
    const halo = g.createRadialGradient(sx, sy, 0, sx, sy, hR)
    halo.addColorStop(0, 'rgba(255,206,148,0.44)')
    halo.addColorStop(0.22, 'rgba(255,190,130,0.21)')
    halo.addColorStop(0.58, 'rgba(246,176,120,0.07)')
    halo.addColorStop(1, 'rgba(246,176,120,0)')
    g.fillStyle = halo
    g.beginPath()
    g.arc(sx, sy, hR, 0, Math.PI * 2)
    g.fill()

    // 光核是整张画面唯一的焦点：上半屏有 1/4 屏高是纯渐变，
    // 没有一团实的光，视线就没有落点，「空」就变成了「没画完」。
    const core = g.createRadialGradient(sx, sy, 0, sx, sy, W * 0.175)
    core.addColorStop(0, 'rgba(255,244,214,0.96)')
    core.addColorStop(0.22, 'rgba(255,230,182,0.74)')
    core.addColorStop(0.52, 'rgba(255,214,164,0.26)')
    core.addColorStop(1, 'rgba(255,210,158,0)')
    g.fillStyle = core
    g.beginPath()
    g.arc(sx, sy, W * 0.175, 0, Math.PI * 2)
    g.fill()

    // ---------- 高空层云：已删除 ----------
    // 试过两版：柔边白椭圆（读成棉花糖）、扁平暖灰云带（读成屏幕上的划痕）。
    // 两版都失败，原因在**位置**而不在画法：天空只有 0.33H，
    // 任何横跨全屏的软边椭圆在这个尺度上都读成「一条折痕」，
    // 因为它的两端必然同时露出边界。
    // 日出时高空本来就没有多少云，纯渐变 + 一团光核才是对的。
    // 留白不是「空」—— 留白是让那根钢丝和那个人被看见的地方。
  }

  // 高空层云：两版都失败了，函数已删除。
  // 第一版「柔边白椭圆」读成棉花糖；第二版「扁平暖灰云带」读成屏幕上的折痕。
  // 根因是位置：天空只有 0.33H，任何横跨全屏的软边形状在这里都会两端同时露边。
  // 现在天空是纯渐变 + 一团光核 —— 留白让钢丝和人物被看见。

  /**
   * 远山：三层逆光剪影。
   *
   * 之前三层是 #A8C7DC / #8FB6CB / #7FA9A8 —— 彼此只差一点点，
   * 而且**全都比天空淡**，叠起来读成「三张半透明纸」，完全没有山的重量。
   * 逆光下山本来就该是深色剪影，只有山脊被太阳勾出一道暖边。
   */
  _paintHills(g) {
    const W = this.W
    const H = this.H
    const hz = this.L.horizonY

    // 山脚必须**融进暖雾**（不是融进地面色）：逆光下山脚被雾吃掉，
    // 而雾是亮的 —— 所以山是「上面深、下面化开」，
    // 不是一整块深色被地平线横切一刀。
    const ridge = (baseY, amp, topColor, botColor, freq, phase, rimAlpha) => {
      const pts = []
      for (let x = -10; x <= W + 10; x += 6) {
        const t = x / W
        // 四个八度叠起来（权重和 = 1.0）。
        // 两个正弦叠出来永远是一个圆馒头 —— 这就是上一版「三座圆山」的原因：
        // 低频正弦在 390px 宽上只有 1.3 个周期，除了一个大鼓包什么也画不出来。
        // 真实山脊是分形的：主峰之下必须有次峰、次峰之下还有锯齿。
        const y = baseY - (
          Math.sin(t * Math.PI * freq + phase) * 0.52 +
          Math.sin(t * Math.PI * freq * 2.3 + phase * 1.7) * 0.27 +
          Math.sin(t * Math.PI * freq * 4.9 + phase * 2.9) * 0.14 +
          Math.sin(t * Math.PI * freq * 9.7 + phase * 0.6) * 0.07
        ) * amp
        pts.push([x, y])
      }
      g.beginPath()
      g.moveTo(pts[0][0], pts[0][1])
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1])
      g.lineTo(W + 10, hz + 6)
      g.lineTo(-10, hz + 6)
      g.closePath()
      const grd = g.createLinearGradient(0, baseY - amp, 0, hz + 6)
      grd.addColorStop(0, topColor)
      grd.addColorStop(0.46, botColor)
      grd.addColorStop(0.80, 'rgba(196,172,160,0.90)')
      grd.addColorStop(1, 'rgba(' + SKY.mist + ',0.99)')
      g.fillStyle = grd
      g.fill()

      // 脊线轮廓光：逆光山脊没有这道暖边，三层深色叠起来还是三块纸板
      if (rimAlpha > 0.005) {
        g.beginPath()
        g.moveTo(pts[0][0], pts[0][1])
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1])
        g.lineWidth = 1.15
        g.strokeStyle = 'rgba(255,198,144,' + rimAlpha + ')'
        g.lineJoin = 'round'
        g.stroke()
      }
    }

    // 明度递进：远浅（#33506B）· 中中（#1E3651）· 近深（#112335）
    // 原来 amp 只有 H*0.062（52px），山高占屏 7%，读成「远处三个土包」。
    // 82/56/30px 是「山」的比例下限：再矮就压不住画面，中间那块天空会空掉。
    ridge(hz - H * 0.006, H * 0.098, SKY.farTop, SKY.farBot, 2.3, 0.6, 0.32)
    ridge(hz + 3, H * 0.066, SKY.midTop, SKY.midBot, 3.1, 2.4, 0.22)
    ridge(hz + 8, H * 0.034, SKY.nearTop, SKY.nearBot, 4.6, 4.9, 0.12)

    // 山脚大气雾：把三层山脚压进同一口气，不然三明治一样分明
    depth.haze(g, {
      cx: W * 0.5, y: hz - 10, rx: W * 0.80, ry: 0.045,
      color: SKY.mist, alpha: 0.55
    })

    // —— 这里删掉了一条「晨光溢出」fillRect ——
    // 它是一条 rgba(255,250,232,0.30) 的横条，横跨整个屏幕宽度、
    // 盖在所有山的最上层。初衷是「让山脚发亮」，
    // 实际效果是把刚做出来的剪影又糊回奶白，山的体积全丢。
    // 山脚该亮由 ridge 内部 0.80 档那道暖雾负责，
    // 不能事后在整个屏幕上再刷一层白 —— 这是本文件里出现过三次的同一个错误。
  }

  _paintValley(g) {
    const W = this.W
    const H = this.H
    const hz = this.L.horizonY
    const valH = H - hz

    // 云海从「地平线暖雾」一路暗到「脚下的冷蓝」。
    // 这个从亮到暗的落差就是纵深感的全部来源 ——
    // 之前五档全挤在明度 60%~95% 之间，等于没有远近。
    const v = g.createLinearGradient(0, hz, 0, H)
    // 暖雾只留地平线下 6%：上一版给到 10% 并把中段也调成 #A9A6A6，
    // 结果 hz 以下 150px 全是一片米黄 —— 整块云海读成沙漠。
    // 0.06 / 0.20 两档整体压暗一档：原来 #CDC0B2 在地平线下还停 6% 屏高，
    // 63px 的一片 201 亮度、对比度只有 19 的纯白 —— 画面正中最显眼的位置
    // 却一点信息都没有，这就是"云海糊成一片"的量化原因。
    v.addColorStop(0, 'rgb(' + SKY.mist + ')')
    v.addColorStop(0.06, '#B7AEA4')
    v.addColorStop(0.20, '#8A93A1')
    v.addColorStop(0.44, '#6D7A91')
    v.addColorStop(0.72, '#4E5B75')
    v.addColorStop(1, '#333F58')
    g.fillStyle = v
    g.fillRect(0, hz, W, valH)

    // 云海：顶面暖白（朝阳照亮）、沟槽冷紫（背光）。
    // 亮云必须压在暗地面上 —— 反过来说，之前「白云 + 白地」
    // 就是整屏什么都没有的根本原因。
    this._paintCloudSea(g, hz, valH)

    // 云海的大气雾：把远处那几行云压进雾里。
    // 没有这一层，远处和近处的云一样白、一样实 —— 5 行云并排读成「鹅卵石」。
    // 有雾之后，远云饱和度和对比度一起衰减，纵深才立起来：
    // 这是「空气透视」，比任何雾化滤镜都便宜。
    const ah = g.createLinearGradient(0, hz, 0, hz + valH * 0.62)
    ah.addColorStop(0, 'rgba(' + SKY.mist + ',0.46)')
    ah.addColorStop(0.45, 'rgba(206,198,192,0.17)')
    ah.addColorStop(1, 'rgba(180,186,198,0)')
    g.fillStyle = ah
    g.fillRect(0, hz, W, valH * 0.62)

    // 地平线过渡：山脚、云海、钢丝消失点压在同一条 1px 线上，
    // 必须有一层雾把三者黏起来。但只做「白雾压下去」是不够的 ——
    // 单层白雾会把山脚和云海一起糊白，等于又把对比抹掉。
    // 这里改成「中间最浓、两头透明」的一条窄带，只在交界处接管 14px。
    const seam = g.createLinearGradient(0, hz - 26, 0, hz + 44)
    seam.addColorStop(0, 'rgba(' + SKY.mist + ',0)')
    seam.addColorStop(0.40, 'rgba(' + SKY.mist + ',0.50)')
    seam.addColorStop(0.66, 'rgba(' + SKY.mist + ',0.26)')
    seam.addColorStop(1, 'rgba(' + SKY.mist + ',0)')
    g.fillStyle = seam
    g.fillRect(0, hz - 26, W, 70)

    // 底部压暗：近处云海是背光的，需要真正的暗。
    // 这也是唯一能让人物「站在画面里」而不是「贴在画面上」的办法。
    const bottom = g.createLinearGradient(0, H * 0.48, 0, H)
    bottom.addColorStop(0, 'rgba(20,34,52,0)')
    bottom.addColorStop(0.45, 'rgba(20,34,52,0.16)')
    bottom.addColorStop(1, 'rgba(16,28,44,0.46)')
    g.fillStyle = bottom
    g.fillRect(0, H * 0.48, W, H * 0.52)
  }

  /**
   * 云海：**层叠的云脊**，不是散落的云朵。
   *
   * 这一块改过四版，前四版全部失败，失败方式各不相同，值得记下来：
   *   ① 连续波浪带（depth.cloudBank 三层）  → 等高线 / 水波纹
   *   ② 按行铺云朵（等距 7 行）             → 梯田
   *   ③ 按行铺云朵 + hash 抖动（5 行）      → 鹅卵石
   *   ④ 云朵 + 顶部凸起 + 实心边缘          → 水面上的油斑
   *
   * 四版的共同错误：**把云海当成"很多朵云"**。但从高空看云海，你看到的
   * 不是一朵朵云，而是**一条一条的云脊**——像海浪一样从地平线排到脚下，
   * 每一条脊都是一整片云毯的**前缘**，脊后面是它自己的云面。
   *
   * 所以正确的结构是：5 条「从左到右起伏的脊线」，每条向下填充到画面底部，
   * 远景先画、近景后画，自然遮挡。脊线用四八度分形（和 _paintHills 同一套），
   * 保证它不是一条平滑的正弦——平滑正弦一定读成"水"。
   *
   * 三个约束：
   *   ① 越远越亮越暖（被朝阳照到），越近越暗越冷（背光 + 空气透视反向）；
   *   ② 每条脊线画一道 1px 受光边 —— 这是"云毯有厚度"唯一的依据；
   *   ③ 脊线下方压一道冷影 —— 没有它，五层云会糊成一整片白。
   */
  _paintCloudSea(g, hz, valH) {
    const W = this.W
    const H = this.H

    // 四八度分形脊线：确定性（同一尺寸每次结果一致，resize 不会跳）
    const ridge = (x, seed, freq) => {
      const u = x / W
      // 高频权重压到 0.05：云脊是**软**的，八度里的 27/58 两档给得太多，
      // 脊线会长出山峰一样的尖角，整片云海立刻读成等高线地形图。
      // 主频逐层变化（不是五条同频）：同频的五条脊会在同一批 x 处一起起伏，
      // 视觉上是一组平行的波浪线 —— 那还是等高线。
      return Math.sin(u * freq + seed) * 0.58 +
        Math.sin(u * freq * 2.23 + seed * 1.7) * 0.26 +
        Math.sin(u * freq * 4.21 + seed * 2.3) * 0.11 +
        Math.sin(u * freq * 8.3 + seed * 3.1) * 0.05
    }

    // t：脊线在谷高中的位置；amp：起伏幅度（相对谷高）
    const layers = [
      { t: 0.030, amp: 0.010, seed: 1.7, a: 0.60, hi: '240,243,242', lo: '212,219,226' },
      { t: 0.105, amp: 0.019, seed: 4.3, a: 0.70, hi: '233,237,237', lo: '198,207,218' },
      { t: 0.220, amp: 0.030, seed: 7.1, a: 0.78, hi: '221,227,231', lo: '182,193,208' },
      { t: 0.380, amp: 0.043, seed: 11.9, a: 0.84, hi: '204,212,220', lo: '164,177,196' },
      { t: 0.580, amp: 0.060, seed: 16.3, a: 0.88, hi: '180,190,204', lo: '146,159,182' }
    ]

    const STEP = 3
    layers.forEach((L, li) => {
      const baseY = hz + valH * L.t
      const ampPx = valH * L.amp
      const freq = 4.2 + li * 1.35
      const yAt = (x) => baseY + ridge(x, L.seed, freq) * ampPx

      // 云毯本体：从脊线一路填到画面底部
      g.beginPath()
      g.moveTo(0, yAt(0))
      for (let x = STEP; x <= W; x += STEP) g.lineTo(x, yAt(x))
      g.lineTo(W, H)
      g.lineTo(0, H)
      g.closePath()
      const grd = g.createLinearGradient(0, baseY - ampPx * 1.4, 0, H)
      grd.addColorStop(0, 'rgba(' + L.hi + ',' + L.a.toFixed(2) + ')')
      grd.addColorStop(0.30, 'rgba(' + L.hi + ',' + (L.a * 0.94).toFixed(3) + ')')
      grd.addColorStop(1, 'rgba(' + L.lo + ',' + (L.a * 0.88).toFixed(3) + ')')
      g.fillStyle = grd
      g.fill()

      // 脊线受光：**两道柔和光带**，不是一条锐利描边。
      // 1.2px 的亮线会让脊变成山脊的轮廓线，整片云海读成等高线图；
      // 云脊是软的，光必须散开。9px 的宽光打底，2.4px 的窄光收边。
      const edge = '252,250,246'
      ;[[9, 0.10 + L.a * 0.06], [2.4, 0.16 + L.a * 0.12]].forEach((sp) => {
        g.beginPath()
        g.moveTo(0, yAt(0))
        for (let x = STEP; x <= W; x += STEP) g.lineTo(x, yAt(x))
        g.lineWidth = sp[0]
        g.strokeStyle = 'rgba(' + edge + ',' + sp[1].toFixed(3) + ')'
        g.lineJoin = 'round'
        g.lineCap = 'round'
        g.stroke()
      })

      // 脊线下方压一道冷影：云毯的厚度全部写在这一道影子上
      g.save()
      g.beginPath()
      g.moveTo(0, yAt(0) + 1)
      for (let x = STEP; x <= W; x += STEP) g.lineTo(x, yAt(x) + 1)
      for (let x = W; x >= 0; x -= STEP) g.lineTo(x, yAt(x) + 3 + ampPx * 0.9)
      g.closePath()
      g.fillStyle = 'rgba(70,92,120,' + (0.10 + 0.035 * li).toFixed(3) + ')'
      g.fill()
      g.restore()
    })
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

    // ---- 暖金浮尘（fx.js）----
    // 和上面那层白尘分工：白尘是「空气」（细密、纯白），这层是「晨光」
    // （暖金、光晕、呼吸）。浮尘带从地平线铺到云海深处，近大远小有纵深。
    fx.drawMotes(ctx, L.W, L.H, this.clock, L.farY, L.H * 0.92)

    // 金尘爆发的挂点在角色脚下，供 showMilestone 用（play 层才画）
    this._feetY = feetY

    // ---- 安全走廊：已删除 ----
    // 原来是两条透视虚线，从脚下一直收到地平线。
    // 问题不在于难看，在于**它在说谎**：这两条线画的是固定的世界坐标边界，
    // 但玩家真正要守的是「身体不越过平衡阈值」，那是一个随难度变化的**数值区间**，
    // 已经由底部平衡条精确表达。画在云海上的两条白虚线既不随难度变，
    // 也不参与判定 —— 它只是两条装饰线，而且和钢丝一起读成「三条跑道」。
    // 删掉之后画面只剩一根钢丝，主体（那条线）才真正突出。

    // ---- 钢丝 ----
    this._drawWire()

    // ---- 走过的路：已删除 ----
    // 原来在钢丝上铺一条暖金色光带表示「已走过的距离」。
    // 问题是它和钢丝共用同一条线：一条线上半截是灰钢缆、下半截是金光带，
    // 整根读成「金箍棒」——而且光带的亮度和角色的暖轮廓打架，抢主体。
    // 「走了多远」现在由顶部那条进度线和「已走过 N 米」承担，
    // 钢丝只需要是钢丝。

    // ---- 里程灯 ----
    // 必须在钢丝之后：灯珠是串在钢缆上的，压在钢丝下面就成了「线画在珠子上」
    this._drawMarkers(dist)

    // ---- 里程路标 ----
    // 只在训练中出现。介绍 / 准备 / 结算页的角色是缩小后摆在面板下方的，
    // 那几根桩会从白色卡片底下露出半截竖线，读成"排版错位"。
    if (screen === 'play') this._drawSignposts(dist)

    // ---- 里程碑：给一次明确的反馈 ----
    // 钢丝上的光带大半被角色挡住，所以进度要靠一个不会被遮挡的东西说出来。
    // 纯渲染层按 distance 判定，不碰 engine 的计分与判定。
    //
    // 间距必须跟钢丝长度走：40 米赛道每 10 米报一次 = 4 次；
    // 100 米赛道还每 10 米报一次就是 10 次，语音会变吵、界桩会连成一排。
    if (dist < 1) this._lastMile = 0
    const step = this._mileStep()
    const mile = Math.floor(dist / step)
    if (mile > (this._lastMile || 0)) {
      this._lastMile = mile
      this.showMilestone(mile * step)
    }

    // ---- 保险绳 ----
    // 结算页不画：卡片几乎占满屏幕，角色只剩两条腿露在卡片下沿外面，
    // 读成「有人躲在板子后面」，比不画人更怪。
    // 介绍页也不画：那条绳会斜着穿过「走钢丝」大标题，纯噪声。
    if (screen === 'play' || screen === 'prepare') {
      this._drawRope(vm, screen, feetY, charScale)
    }

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
    // 结算页同样整段跳过（见上面保险绳的说明）
    if (screen !== 'result') {
      depth.softShadow(ctx, L.cx, feetY + 1.5,
        L.charH * 0.19, Math.max(2.4, L.charH * 0.032), 0.30, '26,58,82')

      // 回正引导**不在角色身上**了：它挪到 HUD 下方做成一枚大箭头，
      // 见 _drawHud 里的 drawGuideArrow。腰部光带在云海纹理里读不出方向
      // （截图验证过：像一根斜的标尺），而且患者失衡时看的是画面中上方。

      drawWalker(ctx, {
        // 必须把 canvas 传下去：微信的 CanvasRenderingContext2D 没有 ctx.canvas
        // 属性，角色模块只能靠它拿 Canvas 实例去 createImage（真机四轮定位结论）。
        canvas: this.canvas,
        x: L.cx + (idle ? Math.sin(this.clock * 0.7) * 1.2 : 0),
        y: feetY,
        scale: charScale,
        lean: lean,
        walkPhase: walkPhase,
        balance: balance,
        ropeTension: idle ? 0 : vm.ropeTension,
        // 归一化要跟配置走：速度提到 1.8 m/s 之后固定除 1.2 会一直顶在 1，
        // 步频就锁死了 —— 走得快和走得慢看起来一样。
        speedRatio: idle ? 0 : clamp(vm.speed / Math.max(0.2, Number(this.cfg.get('forwardSpeed')) || 1.2), 0, 1),
        t: this.clock
      })
    }

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
    // 必须画到 p=1 才落在地平线上（farY 就是地平线）。原来是 0.995，
    // 末端差 16px，钢丝在离地平线还有一小截的地方收成圆头 = 空中一根灰柱。
    const P1 = 1.0
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
    // 高光必须窄。原来 0.45~0.58 这一段是 #F1F8FC，几乎纯白，
    // 而背景是浅色云天 —— 钢丝正中与背景同色，整根线在手机上看就是「断的」。
    // 现在高光收到 0.44~0.53，峰值降到 #DCECF5，两侧留足暗边。
    const w0 = sample(P0).half
    const grad = ctx.createLinearGradient(cx - w0 * 1.2, 0, cx + w0 * 1.2, 0)
    grad.addColorStop(0, '#1F2C37')
    grad.addColorStop(0.26, '#4E6170')
    grad.addColorStop(0.44, '#B9CAD6')
    grad.addColorStop(0.50, '#DCECF5')
    grad.addColorStop(0.60, '#6A7E8C')
    grad.addColorStop(1, '#182430')

    // 远端淡出函数。
    //
    // 镜头在腰部高度（CAM_Z=0.90）、钢丝在脚下（z≈0），所以钢丝在画面上是
    // 一条**竖线**：从脚下往上走，一直通到地平线。角色正好站在这条线上，
    // 于是头顶以上那一截看起来就是「头上插了根杆」—— 几何完全正确，读感很糟。
    //
    // 头顶大约在 p=0.65（charY 654 / farY 283 / charH 242 换算下来）。
    // 让透明度从 p=0.40 一路掉到 p=0.66 时只剩 0.14：头顶以上那截几乎化进雾里，
    // 同时保留一丝轮廓，还能读出「钢丝通向远方」，不会像被凭空截断。
    const fadeAt = (p) => {
      if (p <= 0.40) return 1
      const q = clamp((p - 0.40) / 0.26, 0, 1)
      return 1 - 0.86 * (q * q * (3 - 2 * q))
    }

    // ① 剪影：整条**一次画完**，透明度交给竖向渐变。
    //    原来剪影是按 4 个带各画一次、每带一个固定 pad，
    //    带与带之间宽度和亮度的台阶在手机上就是「钢缆被切成几截」。
    ctx.beginPath()
    for (let i = 0; i <= 64; i++) {
      const p = P0 + (P1 - P0) * (i / 64)
      const s = sample(p)
      const pad = 0.9 + 0.6 * clamp((p - 0.30) / 0.70, 0, 1)
      if (i === 0) ctx.moveTo(cx + s.half + pad, s.y)
      else ctx.lineTo(cx + s.half + pad, s.y)
    }
    for (let i = 64; i >= 0; i--) {
      const p = P0 + (P1 - P0) * (i / 64)
      const s = sample(p)
      const pad = 0.9 + 0.6 * clamp((p - 0.30) / 0.70, 0, 1)
      ctx.lineTo(cx - s.half - pad, s.y)
    }
    ctx.closePath()
    // 这条渐变的透明度**必须和 ② 共用 fadeAt**。
    // 原来这里是一组硬编码的停靠点（地平线 0.55、55% 处 0.18），
    // 所以就算 ② 的钢缆本体已经淡到 0.14，角色头顶以上那截剪影还是 0.5 上下
    // —— 看着像"头上插了一根杆"。剪影比本体宽，它才是那根杆的真正来源。
    const rimG = ctx.createLinearGradient(0, L.farY, 0, L.charY)
    for (let i = 0; i <= 12; i++) {
      const t = i / 12                 // 0 = 地平线, 1 = 脚下
      rimG.addColorStop(t, 'rgba(38,56,72,' + (0.60 * fadeAt(1 - t)).toFixed(3) + ')')
    }
    ctx.fillStyle = rimG
    ctx.fill()

    // ② 钢缆本体 + 高光：按 56 个切片逐段画，每段用自己的 alpha。
    //    这是唯一能让「淡出」看起来是连续的写法 —— 单条多边形的填充
    //    没法同时沿纵向变化亮度。
    const SLICES = 56
    for (let i = 0; i < SLICES; i++) {
      const pa = P0 + (P1 - P0) * (i / SLICES)
      const pb = P0 + (P1 - P0) * ((i + 1) / SLICES)
      const a = sample(pa)
      const b = sample(pb)
      const alpha = fadeAt((pa + pb) / 2)
      if (alpha < 0.02) continue

      ctx.globalAlpha = alpha
      // 本体：四边形的两条竖边分别是两端的半宽，天然是锥形
      ctx.beginPath()
      ctx.moveTo(cx + a.half, a.y)
      ctx.lineTo(cx + b.half, b.y)
      ctx.lineTo(cx - b.half, b.y)
      ctx.lineTo(cx - a.half, a.y)
      ctx.closePath()
      ctx.fillStyle = grad
      ctx.fill()

      // 顶部细高光：远端线宽不到 1px，画了也只是噪点
      if (a.half > 0.75 && pb < 0.93) {
        const ha = a.half * 0.30
        const hb = b.half * 0.30
        const xa = cx - a.half * 0.24
        const xb = cx - b.half * 0.24
        ctx.beginPath()
        ctx.moveTo(xa + ha, a.y - a.half * 0.24)
        ctx.lineTo(xb + hb, b.y - b.half * 0.24)
        ctx.lineTo(xb - hb, b.y - b.half * 0.24)
        ctx.lineTo(xa - ha, a.y - a.half * 0.24)
        ctx.closePath()
        ctx.fillStyle = 'rgba(255,255,255,0.55)'
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1

    // 钢丝纹理：随相机滚动的短斜纹（钢缆捻纹），近处明显、远处消失
    // 只保留近处：远端线宽不到 1px，捻纹在那里只是几个脏点
    const scroll = (this.engine.distance || 0) * 6
    ctx.save()
    ctx.lineCap = 'round'
    for (let r = -2.05; r < 26; r += 0.55) {
      const rr2 = r - (scroll % 0.55)
      if (rr2 < -2.05) continue
      const d = this._depth(rr2)
      if (d.k < 0.34) continue
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

    // 灭点「化进雾里」：钢丝本身画到了地平线，但还是一条实实在在的线。
    // 在灭点盖一团暖白，钢缆才是「消失在空气里」，而不是「插进地平线」。
    // 半径和强度都要克制：0.92/21px 会把顶上 50px 的钢缆整段刷白，
    // 于是肉眼看到的是「钢丝飘到一半就没了」。
    const tipY = L.charY - (L.charY - L.farY) * P1
    const meltR = Math.max(11, this.W * 0.036)
    const melt = ctx.createRadialGradient(cx, tipY + 3, 0, cx, tipY + 3, meltR)
    melt.addColorStop(0, 'rgba(255,251,240,0.58)')
    melt.addColorStop(0.45, 'rgba(255,251,240,0.30)')
    melt.addColorStop(1, 'rgba(255,251,240,0)')
    ctx.fillStyle = melt
    ctx.beginPath()
    ctx.arc(cx, tipY + 3, meltR, 0, Math.PI * 2)
    ctx.fill()

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

  /**
   * 脚下的光：只画角色身后（屏幕下方）这一小段钢丝被照亮。
   * 断口用径向光斑柔化，避免光带在终点被硬切一刀。
   *
   * 为什么不再画到远处：透视是「上方 = 远处」，从脚下画到灭点会在角色
   * 头顶正上方拉出一条竖直橙带，读成「天上挂了根杆子」；而且远处是
   * 「还没走的路」，把那里点亮语义正好反了。进度交给路标点亮 + 飘字。
   */
  // 走过的光带：已删除。
  // 原来在钢丝上叠一条暖金色渐隐带表示「已走的距离」，
  // 但它和钢丝共用同一条线 —— 上半截灰钢缆、下半截金光带，整根读成金箍棒。
  // 进度现在由顶部那条横贯全屏的线 + 「已走过 N 米」承担。

  /**
   * 里程界桩：每 10 米一根，立在钢丝**两侧的云海里**，牌上写着这个里程数。
   *
   * 为什么不在钢丝上挂：试过两版挂在钢缆上的牌子，都失败了，原因很具体 ——
   *   · 这个视角下「前方 10 米以外」总共只有 130px 高（从头顶到地平线）。
   *     六块牌挤在 130px 里，读出来是一串灰方块，不是路标。
   *   · 「前方 10 米以内」虽然宽敞，但那一段的钢丝点落在角色身体上：
   *     挑杆从脑袋里长出来、牌贴在耳朵上，路标和角色直接打对台。
   * 所以路标不能挂在中心线上。**挂不上钢丝的东西，就立在它两侧。**
   *
   * 界桩放在云海里，横向位置随 k 收敛（近处靠屏幕边、远处靠中心），
   * 人眼把这两列读成「道路的边界」—— 这正是跑步游戏路边标杆的做法，
   * 也是这个视角下唯一能把「距离」和「前进」同时说出来的东西。
   *
   * 三条约束：
   *  ① 桩底必须**化进云里**（线性渐变到透明）。一根硬底线的柱子是
   *    "插在云上的杆"，渐变收尾才读成"从云里长出来"。
   *  ② 左右**交替**：10 在左、20 在右、30 在左。全放同侧时，
   *    几根桩在透视里连成一条斜线，读成一排栏杆。
   *  ③ 尺寸用 pow(k, 0.6) 压缩透视。严格按 k 缩放时，30 米外的牌子
   *    只有 14px 宽、字号 6px —— 等于没画。
   */
  /**
   * 界桩与里程碑的间距。
   * 40 米以下每 10 米；更长的赛道放宽到 20 米 —— 否则 300 米赛道会立 30 根桩，
   * 透视里挤成一条灰带，反而看不出走了多远。
   */
  _mileStep() {
    const trackLength = Number(this.cfg.get('trackLength')) || 100
    return trackLength > 60 ? 20 : 10
  }

  _drawSignposts(distance) {
    const ctx = this.ctx
    const L = this.L
    const cx = L.cx
    const W = this.W
    const trackLength = Number(this.cfg.get('trackLength')) || 100
    const step = this._mileStep()

    // 里程点：每 step 米一根，**终点本身也算一根**。
    // 少了终点会出岔子：终点前的最后一段一根桩都没有，
    // 玩家会以为「路标没了 = 我走错路了」。
    const marks = []
    for (let m = step; m < trackLength; m += step) marks.push({ m: m, finish: false })
    marks.push({ m: trackLength, finish: true })
    // 循环条件用 m < trackLength，所以终点不会和里程点重复，天然去重。

    marks.forEach((mk) => {
      const r = mk.m - distance
      // r<1.8 的桩会跑到画面最底下、贴着左右边缘，读成"边框"；
      // r>34 之后已经贴在远山上，牌只剩 12px，纯粹是噪点。
      if (r < 1.8 || r > 34) return
      const d = this._depth(r)
      const k = d.k
      if (k < 0.12) return

      const y = d.y
      const s = Math.pow(k, 0.6)
      const fin = mk.finish
      // 横向：**严格按 k 投影**（off ∝ k），这才是"立在路两侧固定宽度处"
      // 的透视结果 —— 近处贴屏幕边、远处向中线收敛。上一版写成
      // 0.13+0.17k，近远只差 25px，两条桩列看着像平行的两列标签，
      // 既没有纵深，10 米的桩还紧贴着角色脑袋。
      // 上限 0.38W 是防出屏：k 接近 1 时 0.78k 会算出 300px。
      const off = Math.min(0.32 * W, 0.78 * W * k)
      // 统一立在同一侧（SIGN_SIDE）。
      // 历史：这一条曾经被否决过，但当时的横向公式是 0.13+0.17k（近远只差
      // 25px），同侧会连成一排等距的栏杆；现在横向**严格 ∝ k**，同侧出来的
      // 是一条向消失点收敛的列 —— 那正是"立在路肩上的一排桩"该有的样子。
      // 再加两处防止它读成"一条斜线/栏杆"：
      //   ① 桩位抖动 ±4%（按米数确定性取值，地形本来就不绝对对齐）；
      //   ② 柱脚雾按近远放大，近处那几根被雾埋掉大半，柱列被雾打断。
      const jitter = 1 + (((mk.m * 37) % 11) - 5) * 0.008
      const px = cx + SIGN_SIDE * off * jitter
      const pw = (fin ? 1.16 : 1) * (26 + 22 * s)
      const ph = (fin ? 1.15 : 1) * (15 + 11 * s)
      const py = y - 26 * s
      const postH = 36 + 46 * s
      const postW = Math.max(3.0, 3.0 + 3.4 * s)

      ctx.save()

      // ① 界桩本体：从牌底往下，末端渐隐进云。
      //    一根硬底线的柱子是"插在云上的杆"，渐变收尾才读成"从云里长出来"。
      const postTop = py + ph * 0.55
      const pg = ctx.createLinearGradient(0, postTop, 0, postTop + postH)
      pg.addColorStop(0, 'rgba(22,42,60,0.62)')
      pg.addColorStop(0.62, 'rgba(26,46,64,0.34)')
      pg.addColorStop(0.88, 'rgba(26,46,64,0.10)')
      pg.addColorStop(1, 'rgba(26,46,64,0)')
      // 柱体分两段：左侧暗、右侧亮。一整块纯色 fillRect 读成"一条线",
      // 有明暗面才是根圆柱。
      const litG = ctx.createLinearGradient(0, postTop, 0, postTop + postH)
      litG.addColorStop(0, 'rgba(206,226,236,0.26)')
      litG.addColorStop(0.58, 'rgba(198,220,232,0.12)')
      litG.addColorStop(1, 'rgba(198,220,232,0)')
      const postCols = fin
        ? [[px - pw * 0.30, 1], [px + pw * 0.30 - postW * 0.8, 1]]
        : [[px - postW * 0.5, 1]]
      if (fin) {
        // 终点：双柱，视觉上更"重"，一眼能认出这根不一样
        postCols.forEach((c) => {
          const x0 = c[0]
          const cw = postW * 0.8
          ctx.fillStyle = pg
          ctx.fillRect(x0, postTop, cw, postH)
          ctx.fillStyle = litG
          ctx.fillRect(x0 + cw * 0.62, postTop, cw * 0.38, postH)
        })
      } else {
        ctx.fillStyle = pg
        ctx.fillRect(px - postW * 0.5, postTop, postW, postH)
        ctx.fillStyle = litG
        ctx.fillRect(px - postW * 0.5 + postW * 0.62, postTop, postW * 0.38, postH)
      }

      // 柱脚：一小团雾把它埋住。没有这团雾，柱子只是"淡出去了"，
      // 有雾才是"扎进云里"。
      const footY = postTop + postH * 0.70
      const fogR = postW * 5.4
      const fog = ctx.createRadialGradient(px, footY, 0, px, footY, fogR)
      fog.addColorStop(0, 'rgba(234,241,245,0.46)')
      fog.addColorStop(0.55, 'rgba(234,241,245,0.18)')
      fog.addColorStop(1, 'rgba(234,241,245,0)')
      ctx.fillStyle = fog
      ctx.beginPath()
      ctx.arc(px, footY, fogR, 0, Math.PI * 2)
      ctx.fill()

      // ② 牌面：深色底 + 浅边。背景是暖白云海，浅色牌会直接化进云里
      //    （和"云脊受光边必须压在云体上"是同一条）。
      rr(ctx, px - pw * 0.5, py - ph * 0.5, pw, ph, ph * 0.34)
      ctx.fillStyle = fin ? 'rgba(255,203,124,0.94)' : 'rgba(16,31,47,0.74)'
      ctx.fill()
      ctx.lineWidth = Math.max(0.7, 1.1 * s)
      ctx.strokeStyle = fin ? 'rgba(255,240,208,0.95)' : 'rgba(228,241,249,0.50)'
      ctx.stroke()

      // ③ 数字
      const fs = (fin ? 1.1 : 1) * (11 + 9 * s)
      ctx.font = '700 ' + fs.toFixed(1) + 'px "PingFang SC", "Helvetica Neue", Helvetica, Arial, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = fin ? 'rgba(88,50,10,0.96)' : 'rgba(242,249,252,0.95)'
      ctx.fillText(String(mk.m), px, py + fs * 0.04)

      // ④ 终点快到了：一圈慢慢呼吸的暖金光晕。
      //    最后 8 米是一段没有里程牌的路（下一个 10 米点就是终点本身），
      //    光晕让"目标"在视野里一直亮着，而不是靠数字提醒。
      if (fin && r < 8) {
        const pulse = 0.5 + 0.5 * Math.sin(this.clock * 2.1)
        const gr = pw * (0.72 + 0.16 * pulse)
        const gg = ctx.createRadialGradient(px, py, pw * 0.30, px, py, gr)
        gg.addColorStop(0, 'rgba(255,206,132,' + (0.30 + 0.16 * pulse).toFixed(3) + ')')
        gg.addColorStop(1, 'rgba(255,206,132,0)')
        ctx.fillStyle = gg
        ctx.beginPath()
        ctx.arc(px, py, gr, 0, Math.PI * 2)
        ctx.fill()
      }

      // ⑤ 刚走过的那一根：钉一颗暖金环，作为"这段过了"的回执
      const since = distance - mk.m
      if (since >= 0 && since < 1.4) {
        const q = since / 1.4
        ctx.beginPath()
        ctx.arc(px, py, pw * (0.5 + q * 0.5), 0, Math.PI * 2)
        ctx.lineWidth = 2.2 * (1 - q)
        ctx.strokeStyle = 'rgba(255,206,132,' + (0.85 * (1 - q)).toFixed(3) + ')'
        ctx.stroke()
      }

      ctx.restore()
    })
  }

  _drawMarkers(distance) {
    const ctx = this.ctx
    const L = this.L
    const cx = L.cx
    const trackLength = Number(this.cfg.get('trackLength')) || 100
    const spacing = 5
    const bigStep = this._mileStep()

    for (let m = spacing; m <= trackLength; m += spacing) {
      const r = m - distance
      if (r < 1.4 || r > 26) continue
      const d = this._depth(r)
      const k = d.k
      if (k < 0.13) continue
      const y = d.y
      const passed = m <= distance + 0.2
      const since = distance - m

      // 大号珠子对齐界桩的间距（40 米以下 10、更长 20），
      // 界桩在两侧写数字，钢丝上这颗是「脚下这一点就是整里程」的锚点。
      const rad = (m % bigStep === 0 ? 2.7 : 1.9) * Math.max(0.45, k)
      const alpha = clamp(k * 1.6, 0.16, 1)

      ctx.save()
      ctx.globalAlpha = alpha

      // 已点亮：暖金光晕。没点亮：什么都不加，只留一颗冷白的珠子。
      // 不发光的珠子才是「还没到」，这是唯一需要的语义区分。
      if (passed) {
        const glow = ctx.createRadialGradient(cx, y, 0, cx, y, rad * 5.5)
        glow.addColorStop(0, 'rgba(255,203,124,0.55)')
        glow.addColorStop(0.4, 'rgba(255,203,124,0.20)')
        glow.addColorStop(1, 'rgba(255,203,124,0)')
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(cx, y, rad * 5.5, 0, Math.PI * 2)
        ctx.fill()
      }

      // 灯珠本体
      ctx.beginPath()
      ctx.arc(cx, y, rad, 0, Math.PI * 2)
      ctx.fillStyle = passed ? 'rgba(255,214,148,1)' : 'rgba(236,246,250,0.92)'
      ctx.fill()
      ctx.lineWidth = Math.max(0.6, rad * 0.45)
      ctx.strokeStyle = passed ? 'rgba(196,132,40,0.55)' : 'rgba(116,156,176,0.5)'
      ctx.stroke()

      // 刚点亮的那一盏：扩散光环，给「又亮了一个」的瞬间反馈
      if (passed && since >= 0 && since < 1.2) {
        const q = since / 1.2
        const ring = rad * (2.2 + q * 5.5)
        ctx.beginPath()
        ctx.arc(cx, y, ring, 0, Math.PI * 2)
        ctx.lineWidth = Math.max(0.6, 2.4 * (1 - q))
        ctx.strokeStyle = 'rgba(255,214,150,' + (0.75 * (1 - q)).toFixed(3) + ')'
        ctx.stroke()
      }

      ctx.restore()
    }
  }

  _drawRope(vm, screen, feetY, charScale) {
    const ctx = this.ctx
    const L = this.L
    const tension = screen === 'play' ? vm.ropeTension : 0
    const enabled = this.cfg.get('ropeEnabled')
    if (!enabled) return

    // 锚点必须**偏到角色轮廓之外**。原来的锚点在 cx + 0.115W（约 45px），
    // 到安全带拉一条几乎笔直的斜线 —— 在头顶高度正好从头发里穿过去，
    // 一根米色直线穿过脑袋，读成「头上插了根棍子」。
    // 现在锚点推到 cx + 0.20W，且给足垂度：斜线 + 直 = 划痕，
    // 弧线 + 捻纹才读成「一根绳」。
    const anchorX = L.cx + this.W * 0.20
    const anchorY = -26
    const belt = beltWorld({
      x: L.cx,
      y: feetY === undefined ? L.charY : feetY,
      scale: charScale === undefined ? L.charScale : charScale,
      lean: screen === 'play' ? vm.lean : 0
    })

    // 未介入时绳子放松、自然下垂；介入时绷直并泛暖金色
    const slack = 1 - tension
    const midX = (anchorX + belt.x) / 2 + 44 * slack
    const midY = (anchorY + belt.y) / 2 + 54 * slack

    const path = () => {
      ctx.beginPath()
      ctx.moveTo(anchorX, anchorY)
      ctx.quadraticCurveTo(midX, midY, belt.x, belt.y)
    }

    // ---------- 配色逻辑：逆光下绳子是**暗的** ----------
    //
    // 上一版是「米色亮线 + 深色投影」，那是「浅背景上的白绳」的画法。
    // 现在的天空是日出逆光：一根贯穿半个屏幕的亮米色细线，
    // 在天空上就是一道划痕，而且和钢丝交叉成 X，把画面从中间劈开。
    //
    // 真实的逆光里，绳子是**暗轮廓**，只有被扫到的边缘有一线暖。
    // 更重要的是**语义**：绳子不介入时不该抢戏；一旦拉紧才亮起来 ——
    // 这才是「保险绳启动了」的反馈。所以平时压到几乎看不见，介入时才转暖金。
    const active = tension > 0.05

    // 顶端 18% 淡出：绳子是从画面外垂下来的，
    // 硬邦邦地从屏幕顶边「开始」，读成一根插进来的棍子。
    const ropeGrad = (rgb, alpha) => {
      const g = ctx.createLinearGradient(0, anchorY, 0, belt.y)
      g.addColorStop(0, buildRgba(rgb[0], rgb[1], rgb[2], 0))
      g.addColorStop(0.20, buildRgba(rgb[0], rgb[1], rgb[2], alpha))
      g.addColorStop(1, buildRgba(rgb[0], rgb[1], rgb[2], alpha))
      return g
    }

    // 介入时的外发光
    if (active) {
      path()
      ctx.lineWidth = 6.0
      ctx.strokeStyle = buildRgba(255, 196, 110, 0.10 + tension * 0.22)
      ctx.stroke()
    }

    // 绳体：一条，粗细随张力
    path()
    ctx.lineWidth = active ? 2.0 : 1.5
    // 平时只留 0.14：屏幕上有**一根钢丝就够**了。
    // 第二条贯穿画面的长线（不管多细）都会分走注意力，
    // 而且它和钢丝交叉的位置正好在角色头部上方，读成「画面被划开」。
    // 0.14 是「能感觉到有条绳、但不会去读它」的下限；
    // 一旦介入（拉紧），它立刻变成暖金色 —— 这才是这条绳的全部语义。
    ctx.strokeStyle = active
      ? ropeGrad([255, 196, 110], 0.35 + tension * 0.62)
      : ropeGrad([38, 44, 58], 0.14)
    ctx.stroke()

    // 受光侧边：只在介入时出现（平时多一根高光就是多一根线）
    if (active) {
      ctx.save()
      ctx.translate(-0.8, 0)
      path()
      ctx.lineWidth = 0.9
      ctx.strokeStyle = buildRgba(255, 232, 190, 0.30 + tension * 0.5)
      ctx.stroke()
      ctx.restore()
    }

    // 与安全带连接处的挂钩
    ctx.beginPath()
    ctx.arc(belt.x, belt.y - 1, 2.6, 0, Math.PI * 2)
    ctx.fillStyle = tension > 0.3 ? 'rgba(255,214,140,1)' : 'rgba(150,158,172,0.55)'
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(28,34,46,0.40)'
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

    // ---- 失衡风线（fx.js）----
    // warnGlow 已经在 _updateFx 里平滑过，风线跟着它淡入淡出；
    // 方向跟 lean：身体往哪边歪，风就从哪边把你往后推 —— 和飘带被吹猛是同源。
    // 站得稳时 warn≈0，drawWind 直接 return，零开销。
    fx.drawWind(ctx, W, H, this.clock, warn, (vm && vm.lean) >= 0 ? 1 : -1)

    // ---- 过桩金尘（fx.js）----
    if (this.goldBurst) {
      const age = ((this.nowMs || Date.now()) - this.goldBurst.at) / 1000
      fx.drawGoldDust(ctx, this.goldBurst.x, this.goldBurst.y, age, 1)
      if (age > fx.GOLD_LIFE) this.goldBurst = null
    }

    // ---- 失衡：**朝「该压的那一侧」的远场余光** ----
    //
    // 原来这里是两侧边缘泛红（rgba(226,85,60)）。两个问题：
    //  ① 康复红线：红色 + 两侧同时亮 = 「你错了」，而失衡要表达的是
    //     「现在往这边压」。双侧同时亮还等于没有方向 —— 患者知道出事了，
    //     但不知道该往哪动。
    //  ② 自动回正撤掉之后，方向信息是患者唯一的依靠，必须由画面直接给出。
    // 现在只在**该去的那一侧**亮一道冷白柔光，和角色腰部的引导光带同向。
    const guide = vm.rope || {}
    if (warn > 0.02 && guide.guideAxis === 'x' && guide.guideDir) {
      const side = guide.guideDir < 0 ? 0 : 1
      const a = 0.16 * warn * (0.6 + 0.4 * (guide.guideStrength || 0))
      const gw = W * 0.26
      const x0 = side === 0 ? gw : W
      const x1 = side === 0 ? 0 : W - gw
      const g = ctx.createLinearGradient(x0, 0, x1, 0)
      g.addColorStop(0, 'rgba(198,226,240,' + a.toFixed(3) + ')')
      g.addColorStop(1, 'rgba(198,226,240,0)')
      ctx.fillStyle = g
      ctx.fillRect(side === 0 ? 0 : W - gw, H * 0.16, gw, H * 0.66)
    }

    // 越界：角色周围一圈金色环（细环，不遮挡角色）。
    // 语义是「绳索绷到头了」，不是「在保护你」。
    if (rope > 0.02) {
      const L = this.L
      const rx = L.charH * 0.42
      const ry = L.charH * 0.55
      const cxr = L.cx
      const cyr = L.charY - L.charH * 0.46
      // 环必须细。2.2px / 0.55 的描边在手机上是一条实心金圈，
      // 把人整个「圈」起来，读成气泡而不是保护光。
      ctx.save()
      ctx.translate(cxr, cyr)
      ctx.scale(rx, ry)
      ctx.beginPath()
      ctx.arc(0, 0, 1, 0, Math.PI * 2)
      ctx.restore()
      ctx.lineWidth = 1.3
      ctx.strokeStyle = 'rgba(255,206,126,' + (0.30 * rope) + ')'
      ctx.stroke()

      ctx.save()
      ctx.translate(cxr, cyr)
      ctx.scale(rx * 1.06, ry * 1.06)
      ctx.beginPath()
      ctx.arc(0, 0, 1, 0, Math.PI * 2)
      ctx.restore()
      ctx.lineWidth = 9
      ctx.strokeStyle = 'rgba(255,206,126,' + (0.09 * rope) + ')'
      ctx.stroke()

      // 「保险绳已介入」原来在角色头顶再挂一枚胶囊，和里程碑飘字抢同一个位置，
      // 两个橙胶囊叠在一起。底部平衡条的状态胶囊已经写着状态，
      // 场景里只保留绳子变金 + 保护环，不再重复第三次。
      //
      // 2026-11-01：这个环的语义变了。以前是「绳子在保护你」（自动扶正），
      // 现在是「绳索绷到头了，再不回正就走不动」—— 所以它只在越界时出现，
      // 而且和引导光带同向：光带指哪边，环就偏哪边。
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

    // ---------- 顶部：一条进度线 + 三组裸数字，没有卡片 ----------
    //
    // 这一块是整屏「AI 味」最重的地方，而根因不是配色也不是圆角，是**结构**：
    //   · 白色玻璃卡，shadowBlur 14 + 白色内描边 —— 典型的「AI 生成 UI」默认皮肤；
    //   · 三段等分 + 两条竖分隔线 —— 仪表盘式布局，谁也没有主次；
    //   · 卡片下面还挂了 3 枚胶囊（难度 / 模拟数据 / 保险绳），
    //     加上「已走过 N 米」和「平衡稳定」，一屏五块白底。
    //
    // 「什么都装进一个容器」是最容易识别的模板特征。
    // 真实 HUD 的做法是反过来：**数字直接浮在画面上**，靠位置和字号建立层级，
    // 容器只在需要遮挡（面板、弹窗）时才用。
    //
    // 深色天空上白字的对比度本来就够，所以这一版把容器全部去掉。

    // 顶部极淡压暗：只为了让白字在任何天色下都有干净的边，不是卡片。
    // 0.34 是上限 —— 再高就又变成「顶部一条半透明横带」，那是另一种模板感。
    const shade = ctx.createLinearGradient(0, 0, 0, top + 118)
    shade.addColorStop(0, 'rgba(8,18,34,0.34)')
    shade.addColorStop(0.55, 'rgba(8,18,34,0.14)')
    shade.addColorStop(1, 'rgba(8,18,34,0)')
    ctx.fillStyle = shade
    ctx.fillRect(0, 0, W, top + 118)

    // ---------- 进度线：挂在屏幕最上沿 ----------
    // 进度条装进卡片里，是「仪表盘」的思维；挂在屏幕边缘，才是 HUD 的思维。
    // 一条线横贯全屏，它同时回答了「走了多远」和「还剩多少」，不需要再配刻度。
    const prog = clamp(vm.progress, 0, 1)
    ctx.fillStyle = 'rgba(255,255,255,0.14)'
    ctx.fillRect(0, top, W, 2)
    if (prog > 0.002) {
      const pg = ctx.createLinearGradient(0, 0, Math.max(24, W * prog), 0)
      pg.addColorStop(0, 'rgba(255,178,96,0.60)')
      pg.addColorStop(1, 'rgba(255,232,184,1)')
      ctx.fillStyle = pg
      ctx.fillRect(0, top, W * prog, 2)
    }
    // 当前点：2px 的线太细，光靠线头找不到「我在哪」，所以多一颗亮点
    if (prog > 0.004 && prog < 0.996) {
      ctx.beginPath()
      ctx.arc(W * prog, top + 1, 2.8, 0, Math.PI * 2)
      ctx.fillStyle = '#FFF6E2'
      ctx.fill()
    }

    // ---------- 主行：三组数字 ----------
    // 左 = 时间（最需要一眼看到）· 中 = 里程（读数）· 右 = 得分（成就）
    // 三组靠位置分组，不用分隔线，也不等宽 —— 等宽是「表格」，不是 HUD。
    const rowTop = top + 20
    const colL = 18
    const colR = W - 18
    const muted = 'rgba(255,255,255,0.62)'

    // 9px 是「设计稿里看得见、老人机上看不见」的尺寸。
    // 这是给患者用的界面，标签最小 11px，且不再靠「极淡的灰」压层级 ——
    // 层级交给字号和位置。
    this._text('剩余', colL, rowTop, { size: 11, weight: '600', color: muted })
    this._text(vm.timeLeftText, colL, rowTop + 24, {
      size: 25, weight: '700',
      color: vm.timeLeft <= 10 ? '#FF9A76' : '#FFFFFF'
    })

    this._text('得分', colR, rowTop, { size: 11, weight: '600', color: muted, align: 'right' })
    this._text(String(vm.score), colR, rowTop + 24, {
      size: 25, weight: '700', color: '#FFCE86', align: 'right'
    })

    // 中间：里程。原来是 11px 的「12.4 / 40 米」夹在两个 25px 数字中间，
    // 三条信息里最该被读到的一条却最小 —— 这就是"看不见走了多远"的一半原因
    // （另一半在场景里：见 _drawSignposts）。现在数字提到 19px 白色，
    // 单位降到 9px 弱化，两段式，既不抢「剩余」也不被吞掉。
    this._text('里程', W / 2, rowTop, { size: 11, weight: '600', color: muted, align: 'center' })
    const distStr = vm.distance.toFixed(1)
    const distTail = '  /  ' + vm.trackLength + ' 米'
    const distFont = '"PingFang SC", "Helvetica Neue", Helvetica, Arial, sans-serif'
    ctx.save()
    ctx.font = '700 19px ' + distFont
    const distW = ctx.measureText(distStr).width
    ctx.font = '600 9.5px ' + distFont
    const tailW = ctx.measureText(distTail).width
    ctx.restore()
    const distX = W / 2 - (distW + tailW) / 2
    this._text(distStr, distX, rowTop + 24, {
      size: 19, weight: '700', color: '#FFFFFF'
    })
    this._text(distTail, distX + distW, rowTop + 23, {
      size: 11, weight: '600', color: 'rgba(255,255,255,0.64)'
    })

    // ---------- 状态行：只在真正需要患者反应时出现 ----------
    // 删掉的三样东西和理由：
    //   · 「第 2 档」难度 —— 患者不需要知道参数，调参是治疗师的活；
    //   · 「已连接 / 50Hz」—— 一切正常时不需要宣布；断连时必须说，所以保留（改一行红字）；
    //   · 「保险绳 待命」—— 保险绳介入时角色身上已经有金色光环，口头再报一次是冗余。
    // 结果：正常训练时这一行是空的。空白本身就是信息 —— 「没有异常」。
    const warnY = rowTop + 42
    if (vm.sim) {
      this._text('模拟数据', W / 2, warnY, {
        size: 9, weight: '700', color: 'rgba(255,190,110,0.80)', align: 'center'
      })
    } else if (vm.stale) {
      this._text('信号中断 · 请检查传感器', W / 2, warnY, {
        size: 10, weight: '700', color: 'rgba(255,150,120,0.95)', align: 'center'
      })
    }

    // ---------- 回正引导：HUD 下方的大箭头 ----------
    // 失衡/越界时患者要的是**一个方向**，不是一句「你歪了」。
    // 位置选在 HUD 正下方而不是角色腰部，两个理由：
    //   · 这是所有游戏里「当前最重要信息」的固定位置，不需要教；
    //   · 腰部那条小光带夹在云海、角色、钢丝之间，60~90px 长，读不出方向。
    // 尺寸给到屏宽的 56%（上限 260）：这是唯一需要「隔着半米也看得见」的元素。
    const rp = vm.rope || {}
    if (rp.guideAxis === 'x' && rp.guideDir && rp.level >= 1 && vm.state !== 'PAUSED') {
      // 细长优先：0.70 屏宽（上限 320）。箭头变细之后，长度可以给得更足 ——
      // 长而细读作「指示」，短而粗读作「一块牌子」。
      const guideLen = Math.min(W * 0.70, 320)
      // 短屏（320×568）上地平线只有 180px 高，按固定偏移放会压到远山上 ——
      // 箭头的实心部分落在山脊剪影上，边缘对比就没了。所以夹在「HUD 下沿」
      // 和「地平线以上」之间，两头都留出安全距离。
      const horizonY = L.farY || H * 0.42
      // 尽量贴住 HUD：越往下越接近日出辉光带，深色箭头在那里对比最强、也最抢眼。
      const guideCy = Math.max(
        warnY + 26,
        Math.min(warnY + 40, horizonY - 10 - guideLen * 0.10)
      )
      fx.drawGuideArrow(ctx, {
        cx: W / 2,
        cy: guideCy,
        dir: rp.guideDir,
        // 只要出现就必须清楚可读，所以给 0.55 的地板；越失衡越亮
        k: clamp(0.55 + 0.45 * (rp.guideStrength || 0), 0, 1),
        t: this.clock,
        len: guideLen
      })
    }

    // ---------- 平衡指示器 ----------
    this._drawBalance(vm)

    // ---------- 底部：两个圆形玻璃按钮，只留图标 ----------
    // 原来是一对 104×46 的白色长胶囊写着「暂停 / 退出」，和顶部的白卡一起
    // 把画面上下都框死了。圆形按钮让中间的世界透气。
    const btnD = 46
    const btnY = H - 64
    this._roundButton('pause', 18, btnY, btnD, vm.state === 'PAUSED' ? 'play' : 'pause')
    this._roundButton('exit', W - 18 - btnD, btnY, btnD, 'exit')

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
    const barW = Math.min(W - 96, 360)
    const barX = (W - barW) / 2
    const barY = H - 130
    const barH = 14
    const nx = clamp(vm.nx, -1, 1)
    const warn = clamp(vm.warnThreshold, 0.1, 0.95)

    // 状态文案（多个信号共同表达，不只靠颜色）
    // 颜色全部换成暗底可读的亮色。
    // 原来用的是 C.tealDeep / #9A6414 —— 那是为白卡配的深色字，
    // 换成深色云海之后这两档直接看不见了。
    let label = '平衡稳定'
    let color = 'rgba(255,255,255,0.86)'
    // 文案随语义一起改：**不再说「已扶稳」**。自动回正撤掉之后，
    // 游戏没有那个能力，说了会让患者站在原地等它来救。
    const rp = vm.rope || {}
    const dirText = rp.guideDir < 0 ? '往左压' : (rp.guideDir > 0 ? '往右压' : '收回重心')
    if (rp.state === 'ENGAGED') {
      label = '已越界 · ' + dirText + ' 才能继续'
      color = '#FFD9A0'
    } else if (Math.abs(nx) >= warn) {
      label = '失衡 · ' + dirText
      color = '#CFE3F0'
    } else if (Math.abs(nx) >= warn * 0.6) {
      label = nx < 0 ? '轻微左偏' : '轻微右偏'
      color = '#FFCE86'
    } else if (vm.balance < 0.45) {
      label = '重心不稳 · 放慢动作'
      color = '#FFCE86'
    }

    // 状态文字：直接压在画面上，不做胶囊。
    // 深色底上白字本来就清楚，加底衬只是习惯不是必要。
    // 这一枚胶囊是整屏的第三块白底，去掉之后画面上再没有任何「贴纸」。
    this._text(label, W / 2, barY - 12, {
      size: 13, weight: '700', color: color, align: 'center', shadow: true
    })

    // 轨道：一条 2px 亮线，不是 14px 高的白胶囊。
    // 平衡条只需要表达两件事：点离中心多远、点在往哪边跑。
    // 原来的圆角容器 + 内阴影 + 两侧警戒渐变 + 刻度 + 中线，一共五层装饰，零信息。
    const trackY = barY + 9
    ctx.save()
    ctx.lineCap = 'round'

    ctx.beginPath()
    ctx.moveTo(barX, trackY)
    ctx.lineTo(barX + barW, trackY)
    ctx.lineWidth = 2
    ctx.strokeStyle = 'rgba(255,255,255,0.24)'
    ctx.stroke()

    // 安全区：唯一必须明确画出来的区间。
    // 2026-11-01：原来是薄荷绿 rgba(126,238,210) —— 整屏唯一的绿色，
    // 和暖金/冷白的色系无关，读起来像「进度条的已完成部分」。
    // 改成暖白：它表达的是「站得住的那一段」，不是「进度」。
    const safeHalf = (barW / 2) * warn * 0.82
    ctx.beginPath()
    ctx.moveTo(W / 2 - safeHalf, trackY)
    ctx.lineTo(W / 2 + safeHalf, trackY)
    ctx.lineWidth = 4
    ctx.strokeStyle = 'rgba(255,236,202,0.55)'
    ctx.stroke()

    // 中线：没有它，「中间在哪」只能靠猜 —— 患者看到点偏左，
    // 却不知道离「站直」还差多少。一条短竖线就够，不要刻度。
    // 画在轨道**上方**而不是压在上面：压在加粗的安全区里会融成一片。
    ctx.beginPath()
    ctx.moveTo(W / 2, trackY - 9)
    ctx.lineTo(W / 2, trackY - 3)
    ctx.lineWidth = 1.8
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    ctx.stroke()
    ctx.restore()

    // 指示点
    const mx = W / 2 + nx * (barW / 2 - 8)
    const over = Math.abs(nx) >= warn
    ctx.beginPath()
    ctx.arc(mx, trackY, 6.2, 0, Math.PI * 2)
    ctx.fillStyle = '#FFFFFF'
    ctx.fill()
    // 点的颜色只表达「离失稳还有多远」：冷白 → 琥珀 → 暖橙。
    // 原来正常态用 C.teal（青绿），和整屏色系无关。
    ctx.lineWidth = 2.2
    ctx.strokeStyle = over ? '#FF9A76' : (Math.abs(nx) >= warn * 0.6 ? C.amber : 'rgba(236,246,255,0.95)')
    ctx.stroke()
  }

  /**
   * 模拟控制（调试用）。
   * 这是一组开发期控件，不该和正式 HUD 抢注意力：原来是 44×34 的白底卡片
   * 加中文标签，占掉左侧 1/3 屏宽，患者第一眼看到的就是它。
   * 现在压成半透明小圆，只留箭头符号，整体 alpha 0.42。
   */
  _drawSimPad(vm) {
    const ctx = this.ctx
    const H = this.H
    const x = 9
    const y0 = Math.max(this._safeTop() + 104, H * 0.34)
    const d = 26
    const gap = 6
    const items = [
      { id: 'sim:left', t: '←' },
      { id: 'sim:right', t: '→' },
      { id: 'sim:up', t: '↑' },
      { id: 'sim:down', t: '↓' },
      { id: 'sim:center', t: '◎' },
      { id: 'sim:rope', t: '⚑' }
    ]

    ctx.save()
    // 0.42 → 0.32：这是一组调试控件，只在模拟数据时出现，
    // 生产环境（vm.sim=false）根本不会画。压到"能点到、不抢镜"就够。
    ctx.globalAlpha = 0.32
    items.forEach((it, i) => {
      const y = y0 + i * (d + gap)
      const cxp = x + d / 2
      const cyp = y + d / 2
      const pressed = this.pressId === it.id && (this.nowMs - this.pressAt < 150)

      ctx.beginPath()
      ctx.arc(cxp, cyp, d / 2, 0, Math.PI * 2)
      ctx.fillStyle = pressed ? 'rgba(15,156,140,0.92)' : 'rgba(255,255,255,0.78)'
      ctx.fill()

      this._text(it.t, cxp, cyp + 5, {
        size: 13, weight: '600',
        color: pressed ? '#FFFFFF' : 'rgba(19,41,58,0.66)', align: 'center'
      })
      this.buttons.push({ id: it.id, x: x, y: y, w: d, h: d })
    })
    ctx.restore()
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

    // 参数行：一行小字，不是三枚胶囊。
    // 三枚白胶囊并排是这套界面里最后一批「容器」——
    // 而且这三条信息（模拟/时长/里程）本来就没有重要到需要各自占一个框。
    // 用间隔号串起来，读者一扫而过，注意力留在下面的规则和按钮上。
    const simLabel = vm.sim ? '模拟数据' : (vm.stale ? '传感器未连接' : '传感器已连接')
    const durLabel = (Number(this.cfg.get('durationSec')) || 90) + ' 秒'
    const lenLabel = (Number(this.cfg.get('trackLength')) || 100) + ' 米'
    const metaY = H * 0.215 + 52
    this._text(simLabel + ' · 时长 ' + durLabel + ' · 里程 ' + lenLabel, W / 2, metaY, {
      size: 11, weight: '600',
      color: vm.sim ? 'rgba(255,196,120,0.92)' : 'rgba(255,255,255,0.62)',
      align: 'center'
    })
    const chipYs = metaY + 12

    // ---- 角色选择：三枚小胶囊 ----
    // 放在标题和规则卡之间。**患者换角色应该立刻看见**——
    // 介绍页本来就画着他当前的角色站在钢丝上，点一下画面里的人就换了，
    // 比开一个选择面板再确认要直观得多。
    const curChar = this.cfg.get('characterId') || 'fox'
    const pickW = 84
    const pickH = 32
    const pickGap = 8
    const pickTotal = pickW * 3 + pickGap * 2
    const pickX0 = W / 2 - pickTotal / 2
    const pickY = chipYs + 2
    CHARACTER_IDS.forEach((cid, i) => {
      const on = cid === curChar
      const bx = pickX0 + i * (pickW + pickGap)
      const r = pickH / 2
      ctx.beginPath()
      ctx.moveTo(bx + r, pickY)
      ctx.lineTo(bx + pickW - r, pickY)
      ctx.arcTo(bx + pickW, pickY, bx + pickW, pickY + r, r)
      ctx.lineTo(bx + pickW, pickY + pickH - r)
      ctx.arcTo(bx + pickW, pickY + pickH, bx + pickW - r, pickY + pickH, r)
      ctx.lineTo(bx + r, pickY + pickH)
      ctx.arcTo(bx, pickY + pickH, bx, pickY + pickH - r, r)
      ctx.lineTo(bx, pickY + r)
      ctx.arcTo(bx, pickY, bx + r, pickY, r)
      ctx.closePath()
      // 未选中必须**压暗**，不能用白色半透明：这三枚胶囊正好落在日出最亮的那条
      // 地平线光带上，白底白字直接读不出来。选中 = 白底深字，未选中 = 暗底白字。
      ctx.fillStyle = on ? 'rgba(255,252,246,0.96)' : 'rgba(12,21,32,0.58)'
      ctx.fill()
      ctx.lineWidth = on ? 1.6 : 1
      ctx.strokeStyle = on ? 'rgba(255,255,255,0.98)' : 'rgba(226,238,248,0.30)'
      ctx.stroke()
      const label = (CHARACTERS[cid] && CHARACTERS[cid].name) || cid
      this._text(label, bx + pickW / 2, pickY + 21, {
        size: 13, weight: on ? '800' : '600',
        // 选中是浅底 → 必须用深字；C.ink 现在是暖白，写在这儿会白底白字
        color: on ? C.onLight : 'rgba(255,255,255,0.92)', align: 'center'
      })
      this.buttons.push({ id: 'char:' + cid, x: bx, y: pickY, w: pickW, h: pickH })
    })

    // 规则卡
    const cardY = pickY + pickH + 16
    const cardW = Math.min(W - 40, 380)
    const cardX = (W - cardW) / 2
    const cardH = 126
    this._glass(cardX, cardY, cardW, cardH, 20)

    const rules = [
      { t: '身体居中，角色才走得稳', d: '身体左右偏移会带动角色倾斜' },
      { t: '失衡时不要急，慢慢回正', d: '偏移越大越久，平衡恢复越慢' },
      { t: '失衡时游戏不会替你回正', d: '按光带的方向把重心压回去，站稳了才继续走' }
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
    const wearH = Math.min(150, H * 0.2)
    // 竖直居中：整叠卡片在「副标题」和「底部按钮」之间居中。
    // 原来是贴着副标题往下排，中间空出 300px（超过半屏）—— 一屏里
    // 一大块什么都没有，读起来就是「还没做完」。
    const stackTop = top + 76
    const stackBottom = H - 132
    const stackH = 76 + 12 + wearH + 16 + 44
    let cy = stackTop + Math.max(0, (stackBottom - stackTop - stackH) / 2)
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
      size: 12, weight: '500', color: connected && !vm.sim ? C.tealLight : C.inkMute
    })
    this._button(connected ? 'refresh' : 'connect', cardX + cardW - 92, cy + 22, 76, 32,
      connected ? '重新连接' : '连接设备', { variant: 'ghost', size: 11.5 })

    // ---- 卡片 2：佩戴位置 ----
    cy += 88
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
    // 这一行原来直接压在云海上：琥珀色小字，底色是亮云，几乎读不出来。
    // 给它一条和上面两张卡同一材质的窄玻璃条 —— 三块面板一套语言，
    // 顺带把「去标定」从悬空的小胶囊收进条里。
    this._glass(cardX, cy, cardW, 44, 14)
    if (z.set) {
      this._text('当前零点 ' + fmtDeg(z.roll) + ' / ' + fmtDeg(z.pitch), cardX + 18, cy + 27, {
        size: 12, weight: '500', color: C.inkSoft
      })
    } else {
      this._text('还没设置零点，读数按原始角度算', cardX + 18, cy + 27, {
        size: 12, weight: '500', color: C.amber
      })
    }
    this._linkButton('zero:set', cardX + cardW - 82, cy + 10, 68, 24, z.set ? '重设' : '去标定')

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

    // 模拟开关：原来放在 top+26，正好压住副标题那一行（副标题很长，
    // 一直排到屏幕右侧）。提到标题那一行的右侧，两者横向不重叠。
    if (!vm.sim) {
      this._linkButton('sim:on', W - 112, top + 6, 96, 22, '用模拟数据')
    } else {
      this._linkButton('sim:off', W - 112, top + 6, 96, 22, '关闭模拟')
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

    // 暗玻璃上的人体图：浅色填充 + 略亮的描边（原来是深色，画在暗底上会消失）
    const body = 'rgba(236,246,255,0.16)'
    const edge = 'rgba(236,246,255,0.36)'

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
    ctx.fillStyle = 'rgba(236,246,255,0.26)'
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(236,246,255,0.34)'
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

    // 评级：不再用「进度环 + 字母」。
    // 那个环在任何尺寸下都读成加载圈；而且环长是编的（S=95%、C=32%），
    // 和字母本身的含义没有关系 —— 这是典型的「用图形代替内容」。
    // 一个字母 + 一行小标签，信息一点没少。
    const gradeX = px + pw - 26
    const gradeY = py + 44
    this._text(sum.grade, gradeX, gradeY, { size: 34, weight: '800', color: C.amber, align: 'right' })
    this._text('评级', gradeX, gradeY + 18, { size: 11, weight: '600', color: C.inkMute, align: 'right' })

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
        ctx.fillStyle = 'rgba(255,255,255,0.12)'
        ctx.fill()
        if (ratio > 0.01) {
          rr(ctx, tx, ry, Math.max(3, tw * ratio), 6, 3)
          // 三档保留「安全 / 注意 / 偏高」的语义，但第一档从青绿换成暖调绿：
          // #3FC3B0 是冷色，在这张暖色结算卡上是唯一一个「不属于这里」的颜色。
          ctx.fillStyle = i >= 4 ? 'rgba(206,86,62,0.80)' : (i >= 2 ? 'rgba(214,150,52,0.85)' : 'rgba(94,150,102,0.90)')
          ctx.fill()
        }
        this._text(Math.round(ratio * 100) + '%', gridX + gridW, ry + 6, {
          size: 9.5, weight: '600', color: C.inkMute, align: 'right'
        })
      })
    }

    this._text(gridW < 300 ? '轨迹与摆动为姿态代理指标，非真实位移。'
      : '轨迹与摆动为姿态代理指标，不是真实位移；成绩仅用于训练对比。', gridX, py + Y.note, {
      size: 10.5, weight: '500', color: 'rgba(243,235,221,0.46)'
    })

    // ---------------- 本局条件 ----------------
    const rc = sum.rangeConfig || {}
    this._text('左右 ±' + rc.left + '° · 前后 ±' + rc.forward + '° · 灵敏度 ' + rc.sensitivity +
      ' · 保险绳 ' + (this.cfg.get('ropeEnabled') ? '开' : '关'), gridX, py + Y.cond, {
      size: 10.5, weight: '500', color: 'rgba(243,235,221,0.46)'
    })

    // 分项得分原来还画了四个统计块（距离分 / 稳定分 / 完成奖励 / 扣分），
    // 和上面那行「距离 38 · 稳定 81 · 完成 0 · 扣分 0」是**同一组数字**，
    // 一屏里出现两遍。短屏上本来就是靠那行文字兜的，说明文字已经够用 —— 删块。

    // ---------------- 按钮 ----------------
    const bh2 = tight ? 40 : 44
    const by = py + ph - bh2 - 16
    this._button('again', gridX, by, gridW, bh2, '再来一局', { variant: 'primary', icon: 'refresh', size: 15 })
    const halfW = (gridW - 10) / 2
    this._button('records', gridX, by - 44, halfW, 34, '训练记录', { variant: 'ghost', icon: 'list', size: 12 })
    this._button('home', gridX + halfW + 10, by - 44, halfW, 34, '返回首页', { variant: 'ghost', icon: 'home', size: 12 })
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
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.stroke()
  }

  _glass(x, y, w, h, r) {
    const ctx = this.ctx
    ctx.save()
    // 暗玻璃：阴影给「浮起来」的深度，但底是深的，画面还能透出来
    ctx.shadowColor = 'rgba(2,8,14,0.42)'
    ctx.shadowBlur = 22
    ctx.shadowOffsetY = 8
    rr(ctx, x, y, w, h, r)
    ctx.fillStyle = C.card
    ctx.fill()
    ctx.restore()

    rr(ctx, x, y, w, h, r)
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(226,238,248,0.14)'
    ctx.stroke()
  }

  _panel(x, y, w, h, o) {
    const opt = o || {}
    const ctx = this.ctx
    ctx.save()
    ctx.shadowColor = 'rgba(2,8,14,0.55)'
    ctx.shadowBlur = 30
    ctx.shadowOffsetY = 12
    rr(ctx, x, y, w, h, 24)
    const g = ctx.createLinearGradient(0, y, 0, y + h)
    g.addColorStop(0, 'rgba(15,25,37,0.91)')
    g.addColorStop(1, 'rgba(9,17,27,0.93)')
    ctx.fillStyle = g
    ctx.fill()
    ctx.restore()

    rr(ctx, x, y, w, h, 24)
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(226,238,248,0.18)'
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
      // 主按钮从青绿换成**日出琥珀**。
      // 原来那套 #25B7A3 / #0A8B7E 是「清新医疗风」的标准配色，
      // 和现在的暖金地平线、暖金得分、暖金轮廓光完全不在一个色系里 ——
      // 一屏里出现第二种强调色，是最容易被读成「拼出来的界面」的地方。
      ctx.save()
      ctx.shadowColor = disabled ? 'rgba(12,38,54,0.05)' : 'rgba(164,98,26,0.30)'
      ctx.shadowBlur = disabled ? 2 : 14
      ctx.shadowOffsetY = disabled ? 1 : 5
      rr(ctx, x, y, w, h, r)
      const g = ctx.createLinearGradient(0, y, 0, y + h)
      if (disabled) {
        g.addColorStop(0, '#CBD8DD')
        g.addColorStop(1, '#B9C8CE')
      } else {
        // 深的这一档是必须的：白卡（结算/暂停面板）和深色云海两种底都要站得住。
        // 浅琥珀 #F7BE6F 在白卡上几乎和底色融成一块浅黄，看不出是个按钮。
        g.addColorStop(0, '#E8A24E')
        g.addColorStop(1, '#C4761F')
      }
      ctx.fillStyle = g
      ctx.fill()
      ctx.restore()
    } else if (opt.variant === 'glass') {
      // 次级按钮：白胶囊 → 深色玻璃。
      // 白胶囊在深色云海上是一块贴纸，和已经删掉的那几个 HUD 胶囊是同一种语言。
      rr(ctx, x, y, w, h, r)
      ctx.fillStyle = disabled ? 'rgba(20,34,52,0.34)' : 'rgba(18,32,50,0.55)'
      ctx.fill()
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'
      ctx.stroke()
    } else {
      // 默认变体也改成暗玻璃：三页全暗之后，白胶囊会是整屏唯一一块亮块，
      // 视线全跑到按钮上。
      rr(ctx, x, y, w, h, r)
      ctx.fillStyle = disabled ? 'rgba(20,34,52,0.30)' : 'rgba(18,32,50,0.58)'
      ctx.fill()
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(226,238,248,0.20)'
      ctx.stroke()
    }

    // 琥珀底配深棕字（白字在琥珀上对比不足）；其余变体都是深底配白字。
    const fg = opt.variant === 'primary' ? '#2E1C06' : '#FFFFFF'
    const iconColor = fg
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

  /** 圆形玻璃按钮：底部只放图标，不再用带文字的长胶囊 */
  _roundButton(id, x, y, d, icon) {
    const ctx = this.ctx
    const pressed = this.pressId === id && (this.nowMs - this.pressAt < 150)
    const s = pressed ? 0.94 : 1
    const cxp = x + d / 2
    const cyp = y + d / 2

    ctx.save()
    ctx.translate(cxp, cyp)
    ctx.scale(s, s)
    ctx.translate(-cxp, -cyp)
    ctx.beginPath()
    ctx.arc(cxp, cyp, d / 2, 0, Math.PI * 2)
    ctx.fillStyle = pressed ? 'rgba(40,62,86,0.80)' : 'rgba(18,32,50,0.55)'
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(226,238,248,0.22)'
    ctx.stroke()
    ctx.restore()

    const isz = d * 0.42
    this._icon(icon, cxp - isz / 2, cyp, isz, '#FFFFFF')
    this.buttons.push({ id: id, x: x, y: y, w: d, h: d })
  }

  _miniButton(id, x, y, w, h, label) {
    const ctx = this.ctx
    const pressed = this.pressId === id && (this.nowMs - this.pressAt < 150)
    rr(ctx, x, y, w, h, 10)
    ctx.fillStyle = pressed ? 'rgba(196,118,31,0.92)' : 'rgba(18,32,50,0.58)'
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = pressed ? 'rgba(232,162,78,1)' : 'rgba(226,238,248,0.20)'
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

  /** 里程碑达成：居中飘字 + 暖光晕 + 脚下金尘（fx.drawGoldDust）。 */
  showMilestone(meters) {
    this.milestone = { m: meters, at: this.nowMs || Date.now() }
    // 金尘：从角色脚下升起。飘字说结论（"已走过 10 米"），金尘说情绪。
    // 字挂头顶、尘起脚下，一上一下把角色夹在中间，反馈是包着角色的。
    this.goldBurst = {
      at: this.nowMs || Date.now(),
      x: this.L ? this.L.cx : 0,
      y: this._feetY || (this.L ? this.L.charY : 0)
    }
  }

  _drawMilestone() {
    const ms = this.milestone
    if (!ms) return
    const age = (this.nowMs || Date.now()) - ms.at
    const life = 1700
    if (age > life) {
      this.milestone = null
      return
    }
    const q = age / life
    // 快进 → 停留 → 淡出；匀速淡出会显得没做完
    const alpha = q < 0.12 ? q / 0.12 : (q > 0.7 ? (1 - q) / 0.3 : 1)
    const ctx = this.ctx
    const W = this.W
    const text = '已走过 ' + ms.m + ' 米'
    const w = this._measure(text, 13, '700') + 46
    // 位置必须挂在角色头顶上方，但要留出真正的空隙。
    // 原来是 _safeTop()+168 的固定值，在 844 高屏上落在 y≈228 ——
    // 正好是天空正中的一片空白，读成「天上飘着一条广告」。
    // 改成 headY - 62：够近（是「他的」反馈），又不压到发型。
    const L = this.L
    // 62 → 80：小屏（320×568）上角色的头顶和这行字只差 1px，
    // 截图里看起来就是「字压在头上」。给到 80 之后两种屏都留得住空隙。
    const base = Math.max(this._safeTop() + 150, L.charY - L.charH - 80)
    const y = base - q * 18

    ctx.save()
    ctx.globalAlpha = clamp(alpha, 0, 1)
    // 纯文字 + 暖色描影，不做胶囊。
    //
    // 这枚橙胶囊是画面上最后一块「贴纸」：圆角、实心、描边，
    // 和 HUD 里已经删掉的那三枚是同一套语言。
    // 里程碑反馈要的是「亮一下」，不是「弹出一张牌」——
    // 所以改成一行字：暖金色 + 深色投影，靠发光而不是靠容器取得可读性。
    const glow = ctx.createRadialGradient(W / 2, y + 10, 2, W / 2, y + 10, w * 0.62)
    glow.addColorStop(0, 'rgba(255,186,96,0.26)')
    glow.addColorStop(1, 'rgba(255,186,96,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(W / 2, y + 10, w * 0.62, 0, Math.PI * 2)
    ctx.fill()

    // 这行字正好落在钢丝上（角色头顶 → 钢丝 → 文字三点一线），
    // 所以必须自带深色底衬。手写一遍而不是用 _text 的 shadow 选项：
    // 内置的 0.35 / blur 8 不够，钢丝是高光银色，压不住。
    ctx.save()
    ctx.font = '700 15px "PingFang SC", "Helvetica Neue", Helvetica, Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.lineWidth = 3.4
    ctx.strokeStyle = 'rgba(14,24,38,0.62)'
    ctx.lineJoin = 'round'
    ctx.strokeText(text, W / 2, y + 12)
    ctx.fillStyle = '#FFE0A8'
    ctx.fillText(text, W / 2, y + 12)
    ctx.restore()
    ctx.restore()
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
