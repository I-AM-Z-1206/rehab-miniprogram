// ============================================================================
// pkgShoot/games/shoot/scene2d.js —— 2.5D 场景绘制（纯 Canvas 2D）
// ----------------------------------------------------------------------------
// 为什么是「2.5D」而不是 3D：
//   真 3D 要 WebGL + three.js（648KB）+ 真机上下文风险，已经验证过不可靠。
//   这里用透视投影的数学关系在传统 Canvas 2D 上画「纵深」：
//     · 地平线 + 消失点 → 地面网格按 y = horizonY + floorH / z 分布，越远越密
//     · 三层视差星点 / 星云 / 行星 → 远近层次
//     · 软阴影 + 轮廓光 + 体积渐变 → 实体有「厚度」
//     · 保持区光柱落到地面的光斑 → 提示「这是一条通道」
//   全部是 createLinearGradient / createRadialGradient / arc / fill 这类
//   基础 API，小程序 webview 渲染 + 低端机都能跑，零新依赖。
//
// 关键约束（不要破坏）：
//   · 本模块只画「背景与氛围」，不参与命中判定，也不改任何逻辑坐标；
//   · 保持区的左右边界必须与 keepHalfPx() 严格一致，否则会误导患者；
//   · 不做每帧 new 大量对象（星星数组在 buildScene 时一次生成）。
// ============================================================================

const TAU = Math.PI * 2

/** 地平线在屏幕高度的位置（靶子中心 0.40 稍上方，让它像悬在地面之上） */
const HORIZON_RATIO = 0.52

/**
 * 地平线弧的垂度（相对屏宽，390 宽上约 17px）。
 *
 * 取景从「一个人眼平视的高度」抬到「高空俯视地球边缘」：地平线不再是一条直线，
 * 而是一段极浅的弧 —— 中间高、两端往下垂。
 *
 * 就这一件事，把「我站在地上」变成「我在很高的地方」，而且**不新增任何直线**。
 * 这是最省的一次取景改动：整棵树一行没动，只换了地平线的形状。
 *
 * 0.045（约 17px）在 390 宽上是对的，但放到 720 高的整屏里读不出来 ——
 * 两轮视觉评审都被说成「地平线是一条直线」，等于白做。
 * 0.062（约 24px）是新的取舍点：肉眼能看出两端下垂，仍不到鱼眼。
 */
const HORIZON_CURVE = 0.062

/** 地平线在屏幕横坐标 x 处的高度（u = -1..1 是横向归一化位置） */
function horizonYAt(x, sc) {
  const w = sc.w
  if (!(w > 0)) return sc.horizonY
  const u = (x / w) * 2 - 1
  return sc.horizonY + w * HORIZON_CURVE * u * u
}

/**
 * 沿地平线弧铺一条带：offTop 是相对弧线的上沿偏移，thick 是厚度。
 *
 * 地面、天际线的基座、地面雾带全部走这一个函数。谁不跟着弧走，谁就会在弧上
 * 切出一条直边 —— 那是这类改动最容易被一眼看出来的穿帮。
 */
function fillHorizonBand(ctx, sc, offTop, thick, style) {
  const w = sc.w
  if (!(w > 0) || !(thick > 0)) return
  const step = Math.max(6, Math.round(w / 40))
  ctx.beginPath()
  ctx.moveTo(0, horizonYAt(0, sc) + offTop)
  for (let x = step; x < w; x += step) ctx.lineTo(x, horizonYAt(x, sc) + offTop)
  ctx.lineTo(w, horizonYAt(w, sc) + offTop)
  ctx.lineTo(w, horizonYAt(w, sc) + offTop + thick)
  for (let x = w - step; x > 0; x -= step) ctx.lineTo(x, horizonYAt(x, sc) + offTop + thick)
  ctx.lineTo(0, horizonYAt(0, sc) + offTop + thick)
  ctx.closePath()
  ctx.fillStyle = style
  ctx.fill()
}

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v)
}

/** 软阴影：椭圆径向渐变，越靠外越透（替代 shadowBlur，快得多） */
function softShadow(ctx, x, y, rx, ry, alpha) {
  if (rx <= 0 || ry <= 0) return
  const a = clamp(alpha, 0, 1)
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(1, ry / rx)
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx)
  g.addColorStop(0, 'rgba(0,0,0,' + a.toFixed(3) + ')')
  g.addColorStop(0.5, 'rgba(0,0,0,' + (a * 0.55).toFixed(3) + ')')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, rx, 0, TAU)
  ctx.fill()
  ctx.restore()
}

/** 椭圆填充（用 scale + arc，避免依赖 ctx.ellipse 的基础库版本） */
function fillEllipse(ctx, x, y, rx, ry, style) {
  if (rx <= 0 || ry <= 0) return
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(1, ry / rx)
  ctx.fillStyle = style
  ctx.beginPath()
  ctx.arc(0, 0, rx, 0, TAU)
  ctx.fill()
  ctx.restore()
}

/** 椭圆描边（同上，避免依赖 ctx.ellipse） */
function ringEllipse(ctx, x, y, rx, ry, style, lw) {
  if (rx <= 0 || ry <= 0) return
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

// ============================================================================
// 场景状态（尺寸变化时重建，不要在每帧生成）
// ============================================================================
/** 确定性伪随机：同一 (i, salt) 永远同值，重建场景时剪影不会变化 */
function hash01(i, salt) {
  const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

/**
 * 颗粒：4 帧循环的噪声点。
 *
 * 为什么必须有它 —— 这是「去 AI 味」里最便宜、效果最直接的一项。
 * 矢量绘图的每个形状都有**完美边缘 + 均匀渐变**，一整屏「绝对干净」的暗面，
 * 人眼会立刻读成「CG / 图标 / 渲染图」。真实画面（哪怕是夜景）永远带一点
 * 光学噪点：胶片颗粒、传感器热噪、空气里的浮尘。
 *
 * 只用 fillRect，不依赖 createImageData / putImageData：
 * 小程序 canvas 上这两个 API 的可用性随基础库版本变化，测试用的假 ctx 也没有。
 *
 * 刻意分成「压暗」和「提亮」两组，各用一次 fillStyle 就画完 ——
 * 逐点改 fillStyle 会变成 300+ 次状态切换，比绘制本身还慢。
 */
function buildGrain(w, h, quality) {
  const q = quality === undefined ? 2 : quality
  const n = q >= 2 ? 300 : (q === 1 ? 140 : 0)
  const frames = []
  if (!n) return frames
  for (let f = 0; f < 4; f++) {
    const dark = []
    const light = []
    for (let i = 0; i < n; i++) {
      const p = {
        x: Math.round(Math.random() * w),
        y: Math.round(Math.random() * h),
        // 85% 是 1px，少量 2px —— 全是 1px 会像均匀的抖动噪点，不像颗粒
        s: Math.random() < 0.85 ? 1 : 2
      }
      // 六成压暗四成提亮：只有提亮会变成「脏屏幕」，压暗才是胶片感
      if (Math.random() < 0.62) dark.push(p)
      else light.push(p)
    }
    frames.push({ dark: dark, light: light })
  }
  return frames
}

function buildScene(w, h, quality) {
  const q = quality === undefined ? 2 : quality
  const horizonY = h * HORIZON_RATIO
  const stars = []
  const mul = q >= 2 ? 1 : (q === 1 ? 0.6 : 0.35)

  // 三层视差：远层小而暗慢、近层大而亮快
  const layers = [
    { n: Math.round((w * h) / 11000 * mul), r0: 0.45, r1: 0.9, a0: 0.18, a1: 0.45, sp: 3 },
    { n: Math.round((w * h) / 22000 * mul), r0: 0.7, r1: 1.5, a0: 0.30, a1: 0.65, sp: 9 },
    { n: Math.round((w * h) / 30000 * mul), r0: 1.1, r1: 2.1, a0: 0.45, a1: 0.85, sp: 20 }
  ]
  for (let L = 0; L < layers.length; L++) {
    const cfg = layers[L]
    for (let i = 0; i < cfg.n; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h * 0.92,
        // 尺寸长尾分布：均匀随机在缩略图上是一层「沙」，
        // 只有少数几颗明显更大更亮，天空才有景深。
        r: (cfg.r0 + Math.random() * (cfg.r1 - cfg.r0)) * (Math.random() < 0.055 ? 2.5 : 1),
        a: cfg.a0 + Math.random() * (cfg.a1 - cfg.a0),
        sp: cfg.sp * (0.7 + Math.random() * 0.6),
        p: Math.random() * TAU,
        near: L === 2,
        // 近层星点带一点色偏，别全是纯白
        tint: Math.random() < 0.25 ? '198,228,255' : '226,240,255'
      })
    }
  }

  // 星云斑：2 团，极低透明度，只负责「空气」。
  // 原来 3 团纯色圆，等于三块彩色雾贴在天上 —— 太规整了。
  // 现在每团由 2 个偏移的圆叠出来，形状不再是完美圆形。
  const nebula = []
  const nebColors = ['92,84,190', '40,150,170']
  for (let i = 0; i < 2; i++) {
    const bx = w * (0.2 + Math.random() * 0.6)
    const by = horizonY * (0.22 + Math.random() * 0.5)
    const br = Math.max(w, h) * (0.26 + Math.random() * 0.16)
    nebula.push({
      blobs: [
        { ox: 0, oy: 0, r: br },
        { ox: br * (0.42 + Math.random() * 0.3), oy: br * (0.18 + Math.random() * 0.22), r: br * 0.68 }
      ],
      x: bx,
      y: by,
      c: nebColors[i % nebColors.length],
      a: 0.055 + Math.random() * 0.03,
      dx: (Math.random() - 0.5) * 6,
      dy: (Math.random() - 0.5) * 3
    })
  }

  // 地面浮尘：贴着地面缓慢上浮的光点，强化「这里有空间」的感觉
  const dust = []
  const dustN = q >= 2 ? 9 : (q === 1 ? 5 : 2)
  for (let i = 0; i < dustN; i++) {
    dust.push({
      x: Math.random() * w,
      y: horizonY + Math.random() * (h - horizonY),
      r: 0.8 + Math.random() * 1.8,
      a: 0.10 + Math.random() * 0.22,
      sp: 4 + Math.random() * 9,
      p: Math.random() * TAU
    })
  }

  // 异星尖塔：地平线剪影的骨架。x 为 0..1 的归一化位置（绘制时按含超扫的
  // 全宽映射），h / w 以屏宽为基准，换机型比例不变。
  const spires = []
  const CITY_SCALE = 1.5
  const spireN = Math.max(14, Math.round(w / 10))
  for (let i = 0; i < spireN; i++) {
    const r1 = hash01(i, 11)
    const r2 = hash01(i, 23)
    const r3 = hash01(i, 37)
    const r4 = hash01(i, 53)
    // 城市不是等距排开的：留出空白区段，剪影才有疏密。
    // 等间距 + 等宽 + 等高是「AI 生成天际线」最典型的特征。
    if (r4 < 0.22) continue
    // 高度必须是长尾分布：绝大多数是矮塔，偶尔一根巨塔把天际线拔起来。
    // 原来的 r² 分布上限太低，所有塔都差不多高 —— 在缩略图上读成一条条形码。
    const tall = r2 > 0.93
    // 城市整体尺度（2026-10-29「放大一点点」→ 1.16；2026-10-30「还是好小」→ 1.5）。
    //
    // 1.5 倍是配合 engine 的 MONSTER_Y_RATIO 从 0.40 上移到 0.36 一起做的：
    // 不动光核的话，「光核下沿到地平线」只有 62px，最高的塔会插进去。
    //
    // 上限被光核卡住：最高的塔乘完 CITY_SCALE 后，塔顶不能插进光核下沿。
    // 光核中心在 0.40h、半径 22，地平线在 0.52h —— 中间只有约 62px 的余量。
    // 所以普通塔放 1.16 倍，而 tall 塔的基数同时从 0.10+0.042 压到 0.092+0.036，
    // 净放大只有 1.07 倍，刚好不撞。
    // 空气透视：城市剪影原本所有塔共用一个颜色，整排读成一条死黑的条形码 ——
    // 「平」的根因就是这个。远处的塔更淡、更偏蓝、更矮，近处的更暗更高，
    // 三层一叠就有了纵深。相邻两根塔同档（i>>1），街区才成片，不会随机深浅。
    // 缩放直接乘进 h / w，drawCityLights 的窗灯就自动跟着走，不会和塔身错位。
    const dv = hash01(i >> 1, 89)
    const band = dv < 0.34 ? 0 : (dv < 0.67 ? 1 : 2)
    const hs = band === 0 ? 0.70 : (band === 1 ? 0.86 : 1.0)
    spires.push({
      x: (i + r1 * 0.85) / spireN,
      h: (tall ? 0.092 + r3 * 0.036 : 0.012 + r2 * r2 * 0.060) * CITY_SCALE * hs,
      w: ((tall ? 0.0062 : 0.0032) + r3 * 0.0072) * CITY_SCALE * (0.80 + hs * 0.20),
      tip: r3 > 0.72,
      band: band,
      // 少量塔带倾角：异星建筑最省力的「不地球」信号
      lean: r4 > 0.86 ? (r1 - 0.5) * 0.30 : 0
    })
  }

  // —— 城市灯火：整局的「成果条」——
  //
  // 这是把「靶子」变成「一座城」的关键数据。每盏灯有自己的归一化位置
  // （nx, ny）和一个**点亮顺序**：按离屏幕中心的水平距离排序。
  // 于是光从中间那根塔开始向两侧扩散 —— 患者看到的是「我的城在长出来」，
  // 而不是「屏幕上多了一些随机亮点」。
  //
  // 灯数决定节奏：每次命中点亮正好一盏。默认 60 秒 × 3 发/秒 = 180 发，
  // 灯数落在 130~170 之间时，一局打满刚好铺满全城。
  const lamps = []
  for (let i = 0; i < spires.length; i++) {
    const s = spires[i]
    // 矮塔不开窗：窗灯是「有人住」的证据，不是装饰贴纸
    if (s.h * w < 0.014 * w) continue
    // 窗数按塔高定，间距约 8px —— 固定 3~7 扇会让矮塔的窗挤成一坨、
    // 高塔的窗稀稀拉拉，两种都不像人一扇扇开出来的。
    const nWin = Math.max(1, Math.min(13, Math.round((s.h * w) / 4.5)))
    for (let k = 0; k < nWin; k++) {
      const nx = s.x + (hash01(i, 300 + k) - 0.5) * s.w * 1.15
      lamps.push({
        // 归一化坐标（0..1），绘制时按含超扫的全宽映射，和尖塔同一套
        nx: nx,
        // 从塔尖往下 0.16~0.86 分布
        ny: s.h * (0.16 + hash01(i, 400 + k) * 0.70),
        warm: hash01(i, 500 + k) > 0.32,
        // 点亮顺序：离屏幕中心越近越先亮
        d: Math.abs(nx - 0.5)
      })
    }
  }
  lamps.sort(function (a, b) { return a.d - b.d })

  // —— 地面灯带：街道 ——
  // 只靠几十个塔窗，在 390px 宽的屏上读不出「万家灯火」。
  // 真实的城市夜景里，最亮的一层永远贴着地平线：那是街道。
  // 这一层**不逐个点亮**，整体亮度直接跟 light 走 ——
  // 它负责「整座城在变亮」，塔窗负责「又亮了一盏」。
  const street = []
  const streetN = q >= 2 ? 200 : (q === 1 ? 100 : 0)
  for (let i = 0; i < streetN; i++) {
    street.push({
      nx: (i + Math.random() * 0.85) / streetN,
      // 归一化 y：贴着地平线往上 0.6~11px（乘 w）。
      // 幂次 1.7 让绝大部分挤在底部：街道最亮，越往上越稀 ——
      // 均匀分布会读成一条横线，不是一片城。
      ny: 0.0015 + Math.pow(Math.random(), 1.7) * 0.040,
      warm: Math.random() > 0.22,
      ph: Math.random() * TAU
    })
  }

  return {
    w: w,
    h: h,
    horizonY: horizonY,
    // 异星尖塔剪影：地平线上的一圈建筑。
    // 用「窄峰」而不是「平滑起伏」——平滑的会被读成地球上的远山，
    // 只有垂直的窄峰才读得出「异星城市」。
    spires: spires,
    // 城市灯火（已按点亮顺序排好）。数量就是这一局的「满格」。
    lamps: lamps,
    // 街道灯带：整体亮度跟 light，不逐个点亮
    street: street,
    // 背景视差（px）：引擎每帧按患者侧屈写入，本文件只在绘制时读取。
    // 只作用于装饰层（星 / 行星 / 山脊），绝不参与任何逻辑坐标。
    parallax: 0,
    stars: stars,
    nebula: nebula,
    dust: dust,
    // 全屏颗粒（4 帧循环），见 buildGrain。画在暗角和 HUD 之间。
    grain: buildGrain(w, h, q),
    planet: {
      // 放在左上偏下（避开两块 HUD 卡片），做远景点缀而不是主角
      x: w * (0.13 + Math.random() * 0.04),
      y: horizonY * (0.34 + Math.random() * 0.08),
      r: Math.max(13, w * 0.055),
      tilt: -0.34
    }
  }
}

// ============================================================================
// 天空 / 星云 / 星空 / 行星
// ============================================================================
function drawSky(ctx, sc, o) {
  const w = sc.w
  const h = sc.h
  const hz = sc.horizonY

  // 夜空必须「单调下沉」：地平线最亮，往上越来越黑。
  // 原来是 0 → 最亮 → 又暗回去（中间一段最亮的线性渐变）。
  // 这在大气散射上不成立，读起来就是「贴在图后面的一块渐变板」。
  //
  // 2026-10-30：试过蓝调时刻（天空有亮度方向、天和灯同时存在），
  // 用户看过之后仍然选深夜 —— **留黑夜**。蓝调的整套色值在
  // `docs/FR-GAME-01.md` 第 18 节，想换回去照那一节抄就行。
  const g = ctx.createLinearGradient(0, 0, 0, hz)
  g.addColorStop(0, '#02040a')
  g.addColorStop(0.42, '#040b16')
  g.addColorStop(0.78, '#071422')
  g.addColorStop(1, '#0a1c2b')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  // 地平线附近的青色大气辉光（2.5D 里「远处有光源」的关键）
  const halo = ctx.createRadialGradient(
    w * 0.5, hz, 4,
    w * 0.5, hz, Math.max(w, h) * 0.62
  )
  halo.addColorStop(0, 'rgba(48,206,186,0.155)')
  halo.addColorStop(0.35, 'rgba(32,150,160,0.062)')
  halo.addColorStop(1, 'rgba(10,40,60,0)')
  ctx.fillStyle = halo
  ctx.fillRect(0, 0, w, h)

  // —— 远处的暖色余晖：只在一侧，强度极低 ——
  //
  // 这是「有设定」和「套预设」的分界线。全屏只剩一个青绿色相，
  // 是 AI 太空图的标配；一点低强度的琥珀色（远处城市的灯火 / 邻星的余照）
  // 立刻让画面从「滤镜」变成「场景」—— 因为它暗示了画面之外还有光源。
  //
  // 强度必须压在 0.06 以下：一旦提上去就落到 teal & orange 的俗套调色里，
  // 那是另一种更常见的「AI 味」。
  const warm = ctx.createRadialGradient(
    w * 0.88, hz * 1.04, 4,
    w * 0.88, hz * 1.04, Math.max(w, h) * 0.46
  )
  warm.addColorStop(0, 'rgba(255,146,78,0.058)')
  warm.addColorStop(0.48, 'rgba(224,108,52,0.022)')
  warm.addColorStop(1, 'rgba(180,80,40,0)')
  ctx.fillStyle = warm
  ctx.fillRect(0, 0, w, h)
}

function drawNebula(ctx, sc, t) {
  const list = sc.nebula
  for (let i = 0; i < list.length; i++) {
    const n = list[i]
    const x = n.x + Math.sin(t * 0.07 + i) * n.dx * 3
    const y = n.y + Math.cos(t * 0.05 + i * 2) * n.dy * 3
    const blobs = n.blobs || []
    for (let k = 0; k < blobs.length; k++) {
      const b = blobs[k]
      const bx = x + b.ox
      const by = y + b.oy
      const a = n.a * (k ? 0.55 : 1)
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, b.r)
      g.addColorStop(0, 'rgba(' + n.c + ',' + a.toFixed(3) + ')')
      g.addColorStop(0.42, 'rgba(' + n.c + ',' + (a * 0.38).toFixed(3) + ')')
      g.addColorStop(1, 'rgba(' + n.c + ',0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(bx, by, b.r, 0, TAU)
      ctx.fill()
    }
  }
}

function drawStars(ctx, sc, t) {
  const list = sc.stars
  const h = sc.h
  ctx.save()
  for (let i = 0; i < list.length; i++) {
    const s = list[i]
    // 缓慢向下流动 = 飞船在前进（相位回绕到顶部）
    const y = (s.y + t * s.sp) % h
    const tw = 0.7 + 0.3 * Math.sin(t * 1.7 + s.p)
    const a = s.a * tw
    if (s.near) {
      // 近层画成短线，方向朝下，制造速度感
      const len = 3 + s.sp * 0.35
      const g = ctx.createLinearGradient(s.x, y - len, s.x, y + len * 0.2)
      g.addColorStop(0, 'rgba(' + s.tint + ',0)')
      g.addColorStop(1, 'rgba(' + s.tint + ',' + a.toFixed(3) + ')')
      ctx.strokeStyle = g
      ctx.lineWidth = s.r * 0.9
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(s.x, y - len)
      ctx.lineTo(s.x, y + s.r * 0.4)
      ctx.stroke()
    } else {
      ctx.fillStyle = 'rgba(' + s.tint + ',' + a.toFixed(3) + ')'
      ctx.beginPath()
      ctx.arc(s.x, y, s.r, 0, TAU)
      ctx.fill()
    }
  }
  ctx.restore()
}

function drawPlanet(ctx, sc, t) {
  const p = sc.planet
  const r = p.r
  if (r < 4) return
  const x = p.x
  const y = p.y

  // 光源在左上（与原来的高光方向一致）。月面只有朝光那半亮，另一侧留夜面 ——
  // 整颗球均匀受光会读成一只灯泡，明暗界线才是「球」的全部依据。
  const lx = -0.36
  const ly = -0.44
  const gx = x + lx * r * 1.55
  const gy = y + ly * r * 1.55

  // 外辉光：贴着盘面向外散。半径 2.6r 会散成一团雾，收在 2.0r。
  const glow = ctx.createRadialGradient(x, y, r * 0.9, x, y, r * 2.0)
  glow.addColorStop(0, 'rgba(188,208,248,0.20)')
  glow.addColorStop(0.30, 'rgba(188,208,248,0.07)')
  glow.addColorStop(1, 'rgba(188,208,248,0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(x, y, r * 2.0, 0, TAU)
  ctx.fill()

  // 环（后半：先画，会被球体压住）
  drawRing(ctx, x, y, r, p.tilt, false, 0)

  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.clip()

  // 夜面打底
  ctx.fillStyle = 'rgba(44,54,84,0.96)'
  ctx.fillRect(x - r, y - r, r * 2, r * 2)

  // 受光面：从光源点发散。0.50 → 0.66 之间是陡降，这道明暗界线（terminator）
  // 是「球」的全部依据 —— 摊平了就退化回一只灯泡。
  const g = ctx.createRadialGradient(gx, gy, r * 0.15, gx, gy, r * 2.45)
  g.addColorStop(0, 'rgba(246,249,255,1)')
  g.addColorStop(0.38, 'rgba(232,241,255,0.98)')
  g.addColorStop(0.52, 'rgba(198,216,248,0.88)')
  g.addColorStop(0.585, 'rgba(112,130,180,0.40)')
  g.addColorStop(0.635, 'rgba(58,70,110,0.07)')
  g.addColorStop(1, 'rgba(44,54,84,0)')
  ctx.fillStyle = g
  ctx.fillRect(x - r, y - r, r * 2, r * 2)

  // 月海：两片大的暗区。真实月面最显眼的不是环形山，是这几块大暗斑 ——
  // 只有小坑没有月海，读起来是一颗高尔夫球。
  for (let i = 0; i < 2; i++) {
    const a = hash01(i, 101) * TAU
    const d = (0.22 + hash01(i, 103) * 0.30) * r
    const cxx = x + Math.cos(a) * d
    const cyy = y + Math.sin(a) * d
    const cr = r * (0.26 + hash01(i, 107) * 0.16)
    const lum = 1 - Math.min(1, Math.hypot(cxx - gx, cyy - gy) / (r * 2.1))
    if (lum <= 0.15) continue
    ctx.globalAlpha = 0.22 * lum
    const mg = ctx.createRadialGradient(cxx, cyy, 0, cxx, cyy, cr)
    mg.addColorStop(0, 'rgba(62,74,112,1)')
    mg.addColorStop(1, 'rgba(62,74,112,0)')
    ctx.fillStyle = mg
    ctx.beginPath()
    ctx.arc(cxx, cyy, cr, 0, TAU)
    ctx.fill()
  }

  // 环形山：只在受光面看得见，暗面里消失。四颗够了，多了是麻子。
  for (let i = 0; i < 4; i++) {
    const a = hash01(i, 37) * TAU
    const d = (0.18 + hash01(i, 53) * 0.52) * r
    const cxx = x + Math.cos(a) * d
    const cyy = y + Math.sin(a) * d
    const cr = r * (0.10 + hash01(i, 71) * 0.13)
    const lum = 1 - Math.min(1, Math.hypot(cxx - gx, cyy - gy) / (r * 2.1))
    if (lum <= 0.12) continue
    ctx.globalAlpha = 0.26 * lum
    ctx.fillStyle = 'rgba(58,70,108,1)'
    ctx.beginPath()
    ctx.arc(cxx, cyy, cr, 0, TAU)
    ctx.fill()
    ctx.globalAlpha = 0.20 * lum
    ctx.strokeStyle = 'rgba(236,242,255,1)'
    ctx.lineWidth = Math.max(0.6, r * 0.035)
    ctx.beginPath()
    ctx.arc(cxx, cyy, cr * 0.92, 0, TAU)
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  // 边缘限暗：盘沿比盘心暗，球才有体积、不像贴纸
  const limb = ctx.createRadialGradient(x, y, r * 0.55, x, y, r)
  limb.addColorStop(0, 'rgba(28,36,60,0)')
  limb.addColorStop(1, 'rgba(28,36,60,0.30)')
  ctx.fillStyle = limb
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
  ctx.restore()

  // 环（前半）
  drawRing(ctx, x, y, r, p.tilt, true, 0)
}

function drawRing(ctx, x, y, r, tilt, front, alpha) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(tilt)
  ctx.scale(1, 0.30)
  ctx.beginPath()
  // front：只画下半弧（在球体前面）；否则上半弧
  if (front) ctx.arc(0, 0, r * 1.62, 0.02, Math.PI - 0.02)
  else ctx.arc(0, 0, r * 1.62, Math.PI + 0.02, TAU - 0.02)
  ctx.strokeStyle = 'rgba(178,206,255,' + alpha.toFixed(2) + ')'
  ctx.lineWidth = r * 0.34
  ctx.stroke()
  ctx.restore()
}

// ============================================================================
// 透视地面
// ============================================================================
function drawGround(ctx, sc, o) {
  const w = sc.w
  const h = sc.h
  const hz = sc.horizonY
  const cx = o.cx
  const floorH = h - hz
  if (floorH <= 0) return
  const q = o.quality === undefined ? 2 : o.quality

  // 地面底色：远处亮（大气散射），近处暗（视角向下、光线弱）。
  // 第一档必须**等于天空最底下那个颜色**（#0a1c2b = 10,28,43），
  // 否则地平线是一条硬边 —— 上下两块图拼在一起的味道全从这一个数来。
  const g = ctx.createLinearGradient(0, hz, 0, h)
  g.addColorStop(0, 'rgba(10,28,43,0.88)')
  g.addColorStop(0.10, 'rgba(7,22,34,0.95)')
  g.addColorStop(0.30, 'rgba(4,13,21,0.97)')
  g.addColorStop(0.62, 'rgba(2,7,12,0.99)')
  g.addColorStop(1, 'rgba(1,3,6,1)')
  // 沿地平线弧铺，不是 fillRect —— 否则弧线两端会露出直角。
  fillHorizonBand(ctx, sc, -2, floorH + 8, g)

  // —— 地面雾带 ——
  //
  // 网格删掉之后，速度感只剩这一层：几条顺着地平线弧度向前滚的雾带。
  //
  // 为什么是「带」不是「线」：带没有描边、不等宽、边缘靠两层 alpha 台阶散开，
  // 所以它读起来是地面上的雾/波光，不是一把尺子。这是这次改动里唯一
  // 兼顾「删掉线」和「不能没有速度参照物」的办法 —— 光删网格，画面会变成
  // 一块静止的黑板，反而更不像在飞。
  //
  // 间距沿用旧的透视关系 y = horizonAt(x) + floorH / u（u 递减即向前滚）。
  const bandN = q >= 2 ? 7 : (q === 1 ? 4 : 2)
  const phase = (o.t * 0.5) % 1
  for (let i = 1; i <= bandN; i++) {
    const u = i - phase
    if (u < 0.55) continue
    const off = floorH / u
    if (off > floorH + 6) continue
    // 近处的带子厚、亮；远处薄、暗 —— 透视本来就是这样
    const th = Math.max(1.6, Math.min(floorH * 0.30, (floorH / (u * u)) * 0.62))
    const a = Math.min(0.075, 0.022 + 0.075 / u)
    // 外晕要**居中**在芯上（上下各让出一截）。两者用同一个 off 时，
    // 外晕的上沿会形成一道比芯更亮的台阶，放大后是一圈明显的横纹。
    fillHorizonBand(ctx, sc, off - th * 0.9, th * 2.8, 'rgba(120,226,208,' + (a * 0.30).toFixed(3) + ')')
    fillHorizonBand(ctx, sc, off, th, 'rgba(176,246,232,' + a.toFixed(3) + ')')
  }

  // 两侧压暗：网格只在中间（通道下方）可见，不要铺满整屏
  const side = ctx.createLinearGradient(0, 0, w, 0)
  side.addColorStop(0, 'rgba(3,9,15,0.94)')
  side.addColorStop(0.20, 'rgba(3,9,15,0.56)')
  side.addColorStop(0.42, 'rgba(3,9,15,0.10)')
  side.addColorStop(0.5, 'rgba(3,9,15,0)')
  side.addColorStop(0.58, 'rgba(3,9,15,0.10)')
  side.addColorStop(0.80, 'rgba(3,9,15,0.56)')
  side.addColorStop(1, 'rgba(3,9,15,0.94)')
  fillHorizonBand(ctx, sc, -2, floorH + 8, side)

  // 近处（屏幕底部）再压一层，避免脚下网格过亮
  const bottom = ctx.createLinearGradient(0, h - floorH * 0.34, 0, h)
  bottom.addColorStop(0, 'rgba(2,6,10,0)')
  bottom.addColorStop(1, 'rgba(2,6,10,0.70)')
  ctx.fillStyle = bottom
  ctx.fillRect(0, h - floorH * 0.34, w, floorH * 0.34)

  // 地平线：扁椭圆径向光，只在中间亮、两端自然消失。
  // 之前用全宽纵向渐变，等于给屏幕画了一条横向「水位线」，山脊都被切断了。
  //
  // 2026-10-29 第二次修：原来 scale(1, 0.07) + alpha 0.22 叠上那条 1px 亮线，
  // 在地平线上合成了一条 30px 高、几乎发白的横带 —— 把画面干脆切成上下两块。
  // 远雾应该是「远处亮一点」，不是「一条发光的分界线」。
  ctx.save()
  ctx.translate(cx, hz)
  ctx.scale(1, 0.042)
  const fogR = Math.max(w * 0.66, 180)
  const fog = ctx.createRadialGradient(0, 0, 0, 0, 0, fogR)
  fog.addColorStop(0, 'rgba(80,222,206,0.115)')
  fog.addColorStop(0.5, 'rgba(66,200,190,0.040)')
  fog.addColorStop(1, 'rgba(66,200,190,0)')
  ctx.fillStyle = fog
  ctx.beginPath()
  ctx.arc(0, 0, fogR, 0, TAU)
  ctx.fill()
  ctx.restore()

  const line = ctx.createLinearGradient(0, 0, w, 0)
  line.addColorStop(0, 'rgba(160,255,242,0)')
  line.addColorStop(0.42, 'rgba(170,255,244,0.075)')
  line.addColorStop(0.5, 'rgba(190,255,248,0.125)')
  line.addColorStop(0.58, 'rgba(170,255,244,0.075)')
  line.addColorStop(1, 'rgba(160,255,242,0)')
  ctx.fillStyle = line
  ctx.fillRect(0, hz - 0.5, w, 1)

  // 地面浮尘
  const dust = sc.dust
  if (dust && dust.length) {
    for (let i = 0; i < dust.length; i++) {
      const d = dust[i]
      const y = d.y - ((o.t * d.sp) % (h - hz + 20))
      const yy = y < hz ? h - (hz - y) : y
      const a = d.a * (0.5 + 0.5 * Math.sin(o.t * 2 + d.p)) * 0.7
      if (yy <= hz) continue
      ctx.fillStyle = 'rgba(180,255,240,' + a.toFixed(3) + ')'
      ctx.beginPath()
      ctx.arc(d.x + Math.sin(o.t * 0.6 + d.p) * 5, yy, d.r, 0, TAU)
      ctx.fill()
    }
  }
}

/**
 * 远景剪影：地平线上的异星尖塔。
 * 作用不是画建筑，而是「地平线不能是一条空直线」—— 有了剪影，
 * 画面才有「远处有世界」的错觉，地面的透视也有落点。
 *
 * 为什么是尖塔而不是山脊：平滑起伏的曲线无论怎么调都会读成「地球上的远山」，
 * 一眼把太空题材拉回地面。只有垂直的窄峰 + 平顶塔楼才读得出异星城市。
 */
function drawRidge(ctx, sc) {
  const w = sc.w
  const hz = sc.horizonY
  // 背景视差会把整层横向平移（最大约 ±2% 屏宽）。若只画 0..w，
  // 平移后必有一侧露出几像素缝隙，在纯色天空上是一条清晰的竖线。
  // 所以两侧各超扫 PAD，多画的部分在屏幕外看不见。
  const PAD = 32
  const x0 = -PAD
  const x1 = w + PAD
  const span = x1 - x0

  // 远层：一条极淡的雾带，压住天际线，避免尖塔「浮」在天空上
  // 上沿是波浪，下沿也必须沿弧走回去 —— 直接 lineTo(x1, hz+2) 会在弧上切一刀。
  ctx.beginPath()
  ctx.moveTo(x0, horizonYAt(x0, sc) + 2)
  for (let x = x0; x <= x1; x += 6) {
    const u = x / w
    const wave =
      Math.sin(u * 6.1 + 1.3) * 0.5 +
      Math.sin(u * 13.7 + 2.6) * 0.3 +
      Math.sin(u * 29.3 + 3.9) * 0.14
    ctx.lineTo(x, horizonYAt(x, sc) - (wave + 0.9) * w * 0.032)
  }
  for (let x = x1; x >= x0; x -= 6) {
    ctx.lineTo(x, horizonYAt(x, sc) + 2)
  }
  ctx.closePath()
  ctx.fillStyle = 'rgba(7,24,34,0.62)'
  ctx.fill()

  // 近层：尖塔 / 塔楼
  const sp = sc.spires || []
  if (sp.length) {
    // 底部实体带：没有它，塔楼会像「插在地上的杆子」，彼此不连成城市
    ctx.beginPath()
    ctx.moveTo(x0, horizonYAt(x0, sc) + 2)
    for (let x = x0; x <= x1; x += 6) ctx.lineTo(x, horizonYAt(x, sc) - w * 0.012)
    for (let x = x1; x >= x0; x -= 6) ctx.lineTo(x, horizonYAt(x, sc) + 2)
    ctx.closePath()
    ctx.fillStyle = 'rgba(3,11,18,0.94)'
    ctx.fill()

    // 由远及近三趟：近档的塔压住远档的，遮挡关系才对。
    // band 0 最远（淡、偏蓝、矮），band 2 最近（暗、高）。
    const BANDS = [
      'rgba(12,32,48,0.70)',
      'rgba(6,19,29,0.88)',
      'rgba(2,7,12,0.96)'
    ]
    for (let bi = 0; bi < 3; bi++) {
      ctx.beginPath()
      ctx.moveTo(x0, horizonYAt(x0, sc) + 2)
      for (let i = 0; i < sp.length; i++) {
        const s = sp[i]
        if ((s.band || 0) !== bi) continue
        const bx = x0 + s.x * span
        const bw = Math.max(1.4, s.w * w)
        // 每根塔的脚都踩在**它脚下那一点**的弧线上，不是一个统一的 hz ——
        // 否则弧线一弯，塔就会一半悬空一半埋进地里。
        const baseY = horizonYAt(bx, sc)
        const top = baseY - s.h * w
        // 倾角只挪塔顶，塔基钉死在弧上 —— 歪的是建筑，不是地。
        const lx = bx + (s.lean || 0) * s.h * w
        if (s.tip) {
          ctx.lineTo(bx - bw, baseY + 1)
          ctx.lineTo(lx, top)
          ctx.lineTo(bx + bw, baseY + 1)
        } else {
          ctx.lineTo(bx - bw, baseY + 1)
          ctx.lineTo(lx - bw, top)
          ctx.lineTo(lx + bw, top)
          ctx.lineTo(bx + bw, baseY + 1)
        }
      }
      for (let x = x1; x >= x0; x -= 6) ctx.lineTo(x, horizonYAt(x, sc) + 2)
      ctx.closePath()
      ctx.fillStyle = BANDS[bi]
      ctx.fill()
    }

    // 塔尖信号灯。远处的塔灯要跟着变淡，否则远处一排亮点会把纵深压平。
    // 窗灯不在这里画 —— 它们由 drawCityLights 按「点亮进度」驱动，
    // 这里是城市的剪影，那里才是城市的灯火。
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < sp.length; i++) {
      const s = sp[i]
      const bx = x0 + s.x * span
      if (bx < -4 || bx > w + 4) continue
      const top = horizonYAt(bx, sc) - s.h * w
      const lx = bx + (s.lean || 0) * s.h * w
      if (i % 6 === 0) {
        const la = (s.band || 0) === 0 ? 0.24 : ((s.band || 0) === 1 ? 0.38 : 0.50)
        ctx.fillStyle = 'rgba(140,240,255,' + la.toFixed(2) + ')'
        ctx.beginPath()
        ctx.arc(lx, top + 1, 1.1, 0, TAU)
        ctx.fill()
      }
    }
    ctx.restore()
  }
}

/**
 * 地面反光：光柱照到地面上向前（靠近观察者）铺开的一片柔光。
 * 有了它，光柱才像「立在地上」而不是「贴在屏幕上」。
 */
// ============================================================================
// 地面发光通道：从脚下向消失点收窄的一片光
// ----------------------------------------------------------------------------
// 光柱本身是一块竖直的「板」，站在有透视的地面上时会读成贴在屏幕上的 UI。
// 补一条落在地面上的通道，把「板」和地面接起来，纵深才成立。
//
// 红线：近端（y = bottom）宽度必须严格等于 2 * half，也就是 2 * keepHalfPx()。
// 患者看到的地面通道边界就是他实际的活动范围边界，不允许为了好看放宽或收窄。
// 远端宽度按透视收窄（0.16 倍），纯粹是视觉，不参与判定。
// ============================================================================
function drawFloorPath(ctx, sc, o) {
  const hz = sc.horizonY
  const half = o.half
  const bottom = o.bottom
  const farY = hz + 3
  if (!(half > 0) || !(bottom > farY)) return

  const cx = o.cx
  const farHalf = Math.max(1.5, half * 0.16)
  const core = o.inZone ? '88,232,210' : '255,110,100'

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'

  // 主体：脚下最亮，向消失点渐隐。
  //
  // 只有纵向渐变时，梯形的两条斜边是硬边 —— 通道读成「贴在地上的一块三角形
  // 色纸」，这是整屏最出戏的一处。真实的地面光斑是中间亮、向两侧散尽的，
  // 所以剪进梯形后分段填，每段用**横向**渐变（与光柱主体同一套做法）。
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(cx - half, bottom)
  ctx.lineTo(cx - farHalf, farY)
  ctx.lineTo(cx + farHalf, farY)
  ctx.lineTo(cx + half, bottom)
  ctx.closePath()
  ctx.clip()

  const FSEG = 10
  for (let i = 0; i < FSEG; i++) {
    // p：0 = 脚下，1 = 消失点
    const p = (i + 0.5) / FSEG
    const env = 0.05 + Math.pow(1 - p, 1.6) * 0.95
    const y0 = bottom - (bottom - farY) * (i / FSEG)
    const y1 = bottom - (bottom - farY) * ((i + 1) / FSEG)
    // 该段的半宽：从脚下的 half 线性收到消失点的 farHalf
    const hw = half + (farHalf - half) * p
    const hg = ctx.createLinearGradient(cx - hw, 0, cx + hw, 0)
    hg.addColorStop(0, 'rgba(' + core + ',0)')
    hg.addColorStop(0.28, 'rgba(' + core + ',0.50)')
    hg.addColorStop(0.5, 'rgba(' + core + ',0.76)')
    hg.addColorStop(0.72, 'rgba(' + core + ',0.50)')
    hg.addColorStop(1, 'rgba(' + core + ',0)')
    ctx.fillStyle = hg
    ctx.globalAlpha = env * 0.22
    ctx.fillRect(cx - hw, y1, hw * 2, (y0 - y1) + 1)
  }
  ctx.restore()

  // 两条边线：从「脚下 = 判定边界」直连消失点，把判定范围钉在地上
  // 两条边线用**纵向渐变**描：脚下最亮，往消失点一半就散光了。
  // 一条从底拉到顶、亮度不变的斜线，读起来是「画的线」；
  // 会消失的线读起来才是「光铺在地上」。
  const eg = ctx.createLinearGradient(0, bottom, 0, farY)
  eg.addColorStop(0, 'rgba(' + core + ',0.30)')
  eg.addColorStop(0.45, 'rgba(' + core + ',0.12)')
  eg.addColorStop(1, 'rgba(' + core + ',0)')
  ctx.strokeStyle = eg
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(cx - half, bottom)
  ctx.lineTo(cx - farHalf, farY)
  ctx.moveTo(cx + half, bottom)
  ctx.lineTo(cx + farHalf, farY)
  ctx.stroke()

  ctx.restore()
}

function drawFloorGlow(ctx, sc, o) {
  const hz = sc.horizonY
  const h = sc.h
  if (o.bottom >= h) return
  const spread = Math.min(o.half * 1.9, (h - o.bottom) * 1.2)
  if (spread <= 0) return
  const col = o.inZone ? '88,232,210' : '255,110,100'
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const g = ctx.createLinearGradient(0, o.bottom, 0, o.bottom + spread * 0.9)
  g.addColorStop(0, 'rgba(' + col + ',0.075)')
  g.addColorStop(1, 'rgba(' + col + ',0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(o.cx - o.half * 0.86, o.bottom)
  ctx.lineTo(o.cx + o.half * 0.86, o.bottom)
  ctx.lineTo(o.cx + spread, o.bottom + spread * 0.9)
  ctx.lineTo(o.cx - spread, o.bottom + spread * 0.9)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}
// ============================================================================
// 保持区光柱（2.5D 的「通道」）
// ----------------------------------------------------------------------------
// 这是全屏面积最大的元素，也是「AI 味」最重的一处。曾经试过两版：
//
//   v1  一块上下等亮的矩形 + 两条从上到下的完美竖线 + 外侧 14px 均匀柔光
//       + 三条往上跑的白色流光 + 正中一条虚线
//       → 读成「一块盖在画面上的玻璃板」。真实的光没有上边缘、没有边框。
//   v2  改成断续刻度 + 横向长刻度
//       → 读成「一个虚线选框」，或者「一把卷尺」。仍然是个容器。
//
// 两版犯的是同一个错：把光当成**容器**在画。光不是框住什么东西的形状，
// 它是从一个点/一条线发出来、随距离衰减的一段亮度。
//
// v3 的两条原则：
//   1) 主体贴地最亮、向上衰减 —— 光源在地面，这是唯一物理上说得通的分布。
//      顶部不再有边缘，因为它本来就该散尽。
//   2) 边界不画线，画**光刃**：内侧陡、外侧散的一道垂直亮边。
//      视觉重心落在边界上（患者看到的范围仍然等于判定范围），
//      但读起来是「光墙的边」，不是「选中框的边」。
// ============================================================================
function drawKeepPillar(ctx, o) {
  const left = o.cx - o.half
  const right = o.cx + o.half
  const top = o.top
  const bottom = o.bottom
  const ok = o.inZone
  const span = bottom - top
  if (right <= left || bottom <= top) return

  const core = ok ? '88,232,210' : '255,110,100'
  const edge = ok ? '126,255,232' : '255,150,140'

  // —— 主体：横向体积感 × 纵向「贴地最亮」衰减 ——
  // 26 段包络填充，每段只改 globalAlpha、复用同一个渐变对象。
  // 每段再给一点点横向抖动（hash 决定，不会闪）：完美的直边是
  // 「矢量图形」最明显的签名，空气里的光边永远是微微起伏的。
  const g = ctx.createLinearGradient(left, 0, right, 0)
  g.addColorStop(0, 'rgba(' + core + ',0)')
  g.addColorStop(0.16, 'rgba(' + core + ',0.075)')
  g.addColorStop(0.5, 'rgba(' + core + ',0.125)')
  g.addColorStop(0.84, 'rgba(' + core + ',0.075)')
  g.addColorStop(1, 'rgba(' + core + ',0)')
  ctx.fillStyle = g
  const SEG = 26
  for (let i = 0; i < SEG; i++) {
    // p：0 = 顶部，1 = 贴地
    const p = (i + 0.5) / SEG
    // 底部 1.0 —— 快到地平线时还有 0.45 —— 顶部 0.04 自然散尽
    const env = 0.04 + Math.pow(p, 1.45) * 0.96
    // 只有**亮度**可以抖。位置不能抖：主体的左右边缘就是判定边界。
    ctx.globalAlpha = env * (0.86 + hash01(i, 149) * 0.28)
    ctx.fillRect(left, top + span * (i / SEG), right - left, span / SEG + 1)
  }
  ctx.globalAlpha = 1

  // —— 边界：一条光的边缘，不是一个框 ——
  //
  // 历史：v2 是一条 0.95 峰值的亮线（成了「选中框」）；v3 收到 7px / 0.62
  // 的等宽亮带（看得清了，但等宽 + 硬边两件事加在一起，还是像一个框）。
  //
  // 真实的光没有恒定的宽度，也没有「到这里光就结束」的那条线。所以拆成四层：
  //     芯    1.3px  —— 判定边界本身，必须锐、必须亮（医疗红线）
  //     近晕  8px
  //     中晕  22px
  //     远晕  46px
  // 每层再加一条「越靠下越宽」：光源在地面上，底下的光自然铺得开。
  // 于是这条边读起来是「一堵光墙的边缘」，而不是「一个框的左边」。
  //
  // 四层全在边界**外侧**。光可以向外散，不能向通道里散 ——
  // 患者看到的范围必须就是判定范围，往里渗一像素都是在骗他。
  // 外两层原来只有 0.12 / 0.05 —— 等于看不见，边界就退化成一根孤立的亮线，
  // 读起来是「画上去的两条线」而不是「一堵光墙」。提亮到真正能看见为止。
  // 芯的位置与判定边界完全不动，光仍然只往外侧散。
  const LAYERS = [
    { w: 1.3, a: 1.00, n: 26 },
    { w: 8, a: 0.36, n: 12 },
    { w: 28, a: 0.26, n: 8 },
    { w: 64, a: 0.14, n: 6 }
  ]
  // 四层 × 两侧 = 104 次填充，低端机上不便宜。降档时先砍最外面的两层，
  // 再减分段 —— 芯（判定边界）在任何画质下都必须是满分段。
  const pkQ = o.quality === undefined ? 2 : o.quality
  for (let li = 0; li < LAYERS.length; li++) {
    const lay = LAYERS[li]
    if (pkQ <= 0 && li >= 2) continue
    const n = pkQ >= 2 ? lay.n : Math.max(4, Math.round(lay.n * 0.6))
    for (let side = 0; side < 2; side++) {
      const x = side ? right : left
      const gx0 = side ? x : x - lay.w
      const gx1 = side ? x + lay.w : x
      const bg = ctx.createLinearGradient(gx0, 0, gx1, 0)
      const midA = (lay.a * 0.34).toFixed(3)
      if (side) {
        bg.addColorStop(0, 'rgba(' + edge + ',' + lay.a.toFixed(3) + ')')
        bg.addColorStop(0.16, 'rgba(' + edge + ',' + midA + ')')
        bg.addColorStop(1, 'rgba(' + edge + ',0)')
      } else {
        bg.addColorStop(0, 'rgba(' + edge + ',0)')
        bg.addColorStop(0.84, 'rgba(' + edge + ',' + midA + ')')
        bg.addColorStop(1, 'rgba(' + edge + ',' + lay.a.toFixed(3) + ')')
      }
      ctx.fillStyle = bg
      for (let i = 0; i < n; i++) {
        const p = (i + 0.5) / n
        // 抖动只作用于**外缘**（宽度）：内缘永远钉在 cx ± half 上。
        const wob = (hash01(i + side * 57 + li * 91, 163) - 0.5) * (lay.w * 0.18)
        const bw = Math.max(0.7, lay.w * (0.66 + p * 0.5) + wob)
        ctx.globalAlpha = (0.05 + Math.pow(p, 1.7) * 0.95) * (0.86 + hash01(i + li * 13, 173) * 0.24)
        if (side) ctx.fillRect(x, top + span * (i / n), bw, span / n + 1)
        else ctx.fillRect(x - bw, top + span * (i / n), bw, span / n + 1)
      }
      ctx.globalAlpha = 1
    }
  }

  // 落地光斑：光柱照到地面的椭圆，缺了它就不像 3D
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  fillEllipse(ctx, o.cx, bottom, o.half * 1.05, Math.max(8, o.half * 0.16),
    'rgba(' + core + ',0.16)')
  ctx.restore()
}

// ============================================================================
// 特效
// ============================================================================
function drawShock(ctx, x, y, k, color) {
  const p = clamp(k, 0, 1)
  // 半径与透明度都用非线性：前 30% 冲出去，后 70% 迅速消失。
  // 线性扩散会变成「靶子身上的气泡」，不是打击感。
  const r = 5 + Math.pow(p, 0.55) * 42
  const a = Math.pow(1 - p, 1.9) * 0.9
  if (a < 0.02) return
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.strokeStyle = color || 'rgba(190,255,240,1)'
  ctx.globalAlpha = a
  ctx.lineWidth = 2.6 * (1 - p) + 0.4
  // 不画整圈。整圈是「力场 / 气泡」的语言 —— 一屏一个完美圆环，
  // 正是科幻 UI 贴图最典型的形状。拆成 5 段长短不一、半径略有差异的弧，
  // 读起来是「被击穿的护盾」，而且每段的破裂进度不一样。
  const SEG = 5
  for (let i = 0; i < SEG; i++) {
    const a0 = (i / SEG) * TAU + p * 0.7 + i * 0.19
    const a1 = a0 + (TAU / SEG) * (0.44 + (i % 3) * 0.13)
    const rr = r * (0.90 + (i % 2) * 0.12)
    ctx.beginPath()
    ctx.arc(x, y, rr, a0, a1)
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * 城市灯火：整局的「成果条」。
 *
 * 这是这个游戏里唯一一个「会随着训练变好而变多」的东西 ——
 * 得分是数字，灯是画面。对居家自助训练的患者，一座亮起来的城，
 * 比一个 1280 分有意义得多。
 *
 * 两层叠加，缺一不可：
 *   1) 城市底部的暖色辉光 —— 几十个 1px 的窗点在 390px 宽的屏上
 *      根本读不出「万家灯火」，辉光才是「整座城亮了」的证据；
 *   2) 窗灯逐盏点亮 —— 提供「又亮了一盏」的离散反馈。
 * 每盏灯的亮度是连续的（lit - i），所以最后一次命中会让一盏灯
 * 从他暗到亮走完整个过程，而不是「啪一下出现」。
 *
 * @param {number} light 0..1，已点亮的比例
 */
function drawCityLights(ctx, sc, light, t) {
  const lamps = sc.lamps
  if (!lamps || !lamps.length) return
  const w = sc.w
  const hz = sc.horizonY
  const PAD = 32
  const x0 = -PAD
  const span = w + PAD * 2
  const n = lamps.length
  const L = clamp(light, 0, 1)
  const lit = L * n

  // 1) 城市底部的暖色辉光
  if (L > 0.015) {
    const gr = Math.max(w * 0.74, 210)
    ctx.save()
    ctx.translate(w * 0.5, hz + 2)
    ctx.scale(1, 0.135)
    const gg = ctx.createRadialGradient(0, 0, 6, 0, 0, gr)
    const a = 0.60 * Math.pow(L, 1.25)
    gg.addColorStop(0, 'rgba(255,178,104,' + a.toFixed(3) + ')')
    gg.addColorStop(0.42, 'rgba(228,132,66,' + (a * 0.36).toFixed(3) + ')')
    gg.addColorStop(1, 'rgba(180,90,40,0)')
    ctx.fillStyle = gg
    ctx.beginPath()
    ctx.arc(0, 0, gr, 0, TAU)
    ctx.fill()
    ctx.restore()
  }

  // 2) 窗灯逐盏点亮
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < n; i++) {
    const lamp = lamps[i]
    // k > 0 表示这盏已经在亮；k 在 0..1 之间时是「正在亮起来」
    const k = lit - i
    if (k <= 0) continue
    const f = k > 1 ? 1 : k
    // 暖灯轻微呼吸：全城同时闪会很假，逐盏随机相位才像有人住
    const flick = lamp.warm ? 0.88 + 0.12 * Math.sin(t * 3.1 + i * 1.7) : 1
    const a = clamp(f * flick, 0, 1)
    const x = x0 + lamp.nx * span
    if (x < -4 || x > w + 4) continue
    const y = horizonYAt(x, sc) - lamp.ny * w
    if (lamp.warm) {
      ctx.fillStyle = 'rgba(255,198,122,' + (a * 0.62).toFixed(3) + ')'
    } else {
      ctx.fillStyle = 'rgba(158,230,255,' + (a * 0.52).toFixed(3) + ')'
    }
    ctx.fillRect(x, y, 1.5, 2.0)
  }

  // 3) 街道灯带：贴着地平线的一层，整体亮度跟 light。
  //    它不逐个点亮 —— 它负责「整座城在变亮」，塔窗负责「又亮了一盏」。
  //    少了这一层，患者看到的是「屏幕上有些橙色小点」，
  //    有了它才读得出「地平线上有一座城」。
  const street = sc.street
  if (street && street.length && L > 0.006) {
    const sa = Math.pow(L, 0.85)
    for (let i = 0; i < street.length; i++) {
      const sl = street[i]
      const flick = 0.82 + 0.18 * Math.sin(t * 2.3 + sl.ph)
      const x = x0 + sl.nx * span
      if (x < -4 || x > w + 4) continue
      const y = horizonYAt(x, sc) - sl.ny * w
      if (sl.warm) {
        // 0.66 → 0.56：城市放大 1.5 倍后街道灯多了 1.3 倍、还挤在更矮的区域里，
        // 原来那个亮度会把塔的剪影糊成一片橙，天际线就没了。
        ctx.fillStyle = 'rgba(255,192,112,' + (sa * flick * 0.56).toFixed(3) + ')'
      } else {
        ctx.fillStyle = 'rgba(172,234,255,' + (sa * flick * 0.44).toFixed(3) + ')'
      }
      ctx.fillRect(x, y, 1.6, 2.0)
    }
  }
  ctx.restore()
}

/**
 * 水面反光。
 *
 * 地平线以下原本是一片纯暗的渐变，两侧两个大三角什么都不发生 —— 那是「地面」，
 * 但看不出是地面，只看出是黑。改成水面之后，这座城的灯火在脚下有下半截，
 * 画面第一次「上下对称」，也第一次读得出「我在水上方飞」。
 *
 * 三条规矩，缺一条就不像水：
 *   1. 倒影必须挂在光源**正下方**（x 完全一致）。偏一两像素就变成「光斑」。
 *   2. 每道倒影都要被波纹**打断**（分段 + 水平抖动）。连续的一条是「光柱」，
 *      不是倒影 —— 水面的第一特征就是倒影在动、在断、在晃。
 *   3. 只有**已经点亮**的灯才有倒影。倒影是灯火的下半截，不是另一套装饰，
 *      所以它必须跟着 light 长，不能一开局就满天光。
 *
 * @param {object} o {cx, half, bottom, light, t, inZone, quality}
 */
function drawWater(ctx, sc, o) {
  const lamps = sc.lamps
  const w = sc.w
  const h = sc.h
  const cx = o.cx
  const half = o.half
  const floorH = h - sc.horizonY
  if (!lamps || !lamps.length || !(w > 0) || !(floorH > 0)) return
  const t = o.t || 0
  const L = clamp(o.light || 0, 0, 1)
  if (L <= 0.008) return
  const q = o.quality === undefined ? 2 : o.quality
  const lit = L * lamps.length

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'

  // —— 水面的天光 ——
  // 贴着弧线的一道横向亮带，往下迅速散尽。没有它，倒影会浮在一块黑布上，
  // 看起来像「地上有几个亮点」，而不是「水面反射」。
  fillHorizonBand(ctx, sc, 0, floorH * 0.07, 'rgba(96,158,196,0.030)')
  fillHorizonBand(ctx, sc, floorH * 0.07, floorH * 0.17, 'rgba(70,124,164,0.012)')

  // —— 城市在水平线上的整体倒影：一条连续的暖带 ——
  // 这一层是「水」成立的关键。只画一道道竖条，读起来是一排栅栏；
  // 先铺一条连续的暖带，竖条才变成暖带上的碎光。
  // 真实照片里也是这样：贴着水天线的永远是一片糊在一起的橙，不是一根根柱子。
  const warmA = 0.15 * Math.pow(L, 1.1)
  fillHorizonBand(ctx, sc, 0, floorH * 0.085, 'rgba(255,178,110,' + (warmA * 0.60).toFixed(3) + ')')
  fillHorizonBand(ctx, sc, floorH * 0.085, floorH * 0.15, 'rgba(240,150,90,' + (warmA * 0.24).toFixed(3) + ')')

  // —— 城市灯火的下半截 ——
  // 每 3 盏灯取 1 盏：160 盏灯全画是 480 次填充，没必要 ——
  // 水面本来就该是「一片模糊的光」，不是「一根根精确的柱子」。
  // stride 2 会到 270+ 次填充，和光柱的四层光晕叠起来低端机顶不住；
  // 3 已经够密 —— 连续暖带那层已经负责「整片」，竖条只负责「碎」。
  const stride = q >= 2 ? 3 : (q === 1 ? 5 : 9)
  const PAD = 32
  const span = w + PAD * 2
  const x0 = -PAD
  const SEGN = 4
  for (let i = 0; i < lamps.length; i += stride) {
    const k = lit - i
    if (k <= 0) break
    const lamp = lamps[i]
    const x = x0 + lamp.nx * span
    if (x < -6 || x > w + 6) continue
    const f = k > 1 ? 1 : k
    // **长度必须逐灯不同**。所有已点亮的灯都拿同一个 base 时，
    // 每道倒影一样长、一样亮，整片就变成一排栅栏 —— 水面的倒影是碎的。
    const vary = 0.30 + hash01(i, 71) * 0.70
    const base = f * vary * (lamp.warm ? 0.085 : 0.050)
    if (base < 0.006) continue
    const top = horizonYAt(x, sc) + 1
    // 越亮的灯，倒影越长。上限压到 0.26：再长就成了「竖着的灯柱」，
    // 水面的倒影是贴着光源的那一小截。
    const len = Math.min(floorH * 0.22, floorH * 0.030 + base * floorH * 1.30)
    const warm = lamp.warm ? '255,196,120' : '168,232,255'
    for (let s2 = 0; s2 < SEGN; s2++) {
      const fr = s2 / SEGN
      // 水平抖动 = 波纹。相位跟 x 走，相邻两盏灯的晃不同步，不然整片一起摆
      const sway = Math.sin(t * 1.9 + x * 0.075 + s2 * 2.1) * (0.8 + fr * 1.4)
      const yTop = top + len * fr + Math.sin(t * 2.3 + x * 0.05 + s2) * 0.7
      // 1 - fr 的二次衰减：倒影是「贴着光源最亮，往下迅速散掉」，
      // 线性衰减会让它读成一根均匀的柱子。
      const a = base * (1 - fr) * (1 - fr * 0.35)
      if (a < 0.005) continue
      const ww = 1.4 + fr * 3.8
      ctx.fillStyle = 'rgba(' + warm + ',' + a.toFixed(3) + ')'
      // 段与段之间留一点缝（0.86），缝就是波纹
      ctx.fillRect(x - ww * 0.5 + sway, yTop, ww, (len / SEGN) * 0.86)
    }
  }

  // —— 保持区光柱的下半截 ——
  // 全屏最亮的一条倒影，也是「你在水里立着一根光柱」的唯一证据。
  // 宽度随距离波动（波纹），越远越宽 —— 水面把影子摊开，不是镜子。
  const core = o.inZone ? '88,232,210' : '255,110,100'
  if (half > 4) {
    const reach = Math.min(floorH * 0.66, (o.bottom - sc.horizonY) * 0.95)
    if (reach > 6) {
      const segN = q >= 2 ? 7 : 4
      for (let s2 = 0; s2 < segN; s2++) {
        const fr = (s2 + 0.5) / segN
        const a = (0.085 - fr * 0.068) * (0.72 + 0.28 * Math.sin(t * 2.6 + s2 * 1.9))
        if (a < 0.004) continue
        const sway = Math.sin(t * 1.6 + s2 * 2.3) * 2.6
        const hw = half * (0.70 + fr * 0.46) + sway
        if (!(hw > 0.5)) continue
        ctx.fillStyle = 'rgba(' + core + ',' + a.toFixed(3) + ')'
        ctx.fillRect(cx - hw, sc.horizonY + reach * (s2 / segN), hw * 2, (reach / segN) * 0.78)
      }
    }
  }

  // —— 光核自身的倒影 ——
  // 最窄最亮的一条，钉在正中。少了它，光柱的倒影会读成「一根柱子插在水里」，
  // 而光核才是水源。
  if (L > 0.01) {
    const y0 = horizonYAt(cx, sc) + 1
    const len = Math.min(floorH * 0.34, (o.bottom - sc.horizonY) * 0.55)
    if (len > 6) {
      for (let s2 = 0; s2 < 4; s2++) {
        const fr = (s2 + 0.5) / 4
        const a = (0.16 - fr * 0.13) * L
        if (a < 0.005) continue
        const ww = 2.2 + fr * 4
        ctx.fillStyle = 'rgba(160,255,236,' + a.toFixed(3) + ')'
        ctx.fillRect(cx - ww * 0.5 + Math.sin(t * 2.2 + s2) * 1.6, y0 + len * (s2 / 4), ww, (len / 4) * 0.8)
      }
    }
  }

  ctx.restore()
}

/** 暗角：四周压暗，把注意力收到中间 */
function drawVignette(ctx, sc) {
  const w = sc.w
  const h = sc.h
  const g = ctx.createRadialGradient(
    w * 0.5, h * 0.46, Math.min(w, h) * 0.34,
    w * 0.5, h * 0.5, Math.max(w, h) * 0.78
  )
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(0.7, 'rgba(0,0,0,0.18)')
  g.addColorStop(1, 'rgba(0,0,0,0.58)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

/**
 * 全屏颗粒。
 *
 * 必须画在**所有内容之上**（暗角之后、HUD 之前）：
 * 颗粒的意义是「整张画面共用同一层光学噪声」，压在任何一层之下都会变成一层灰。
 *
 * 4 帧循环，每帧切换用 Math.floor(t * 9) % 4 —— 大约 9fps 的颗粒刷新。
 * 太慢像脏屏，太快会闪烁；9fps 接近胶片的颗粒抖动。
 */
function drawGrain(ctx, sc, t) {
  const frames = sc.grain
  if (!frames || !frames.length) return
  let idx = Math.floor(t * 9) % frames.length
  if (!(idx >= 0)) idx = 0
  const f = frames[idx]
  if (!f) return
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.060)'
  const dark = f.dark
  for (let i = 0; i < dark.length; i++) {
    const p = dark[i]
    ctx.fillRect(p.x, p.y, p.s, p.s)
  }
  ctx.fillStyle = 'rgba(176,214,255,0.030)'
  const light = f.light
  for (let i = 0; i < light.length; i++) {
    const p = light[i]
    ctx.fillRect(p.x, p.y, p.s, p.s)
  }
  ctx.restore()
}

module.exports = {
  HORIZON_RATIO,
  buildScene,
  drawSky,
  drawNebula,
  drawStars,
  drawPlanet,
  drawGround,
  drawWater,
  drawRidge,
  drawFloorPath,
  drawFloorGlow,
  drawKeepPillar,
  drawCityLights,
  drawShock,
  drawVignette,
  drawGrain,
  softShadow,
  fillEllipse,
  ringEllipse
}
