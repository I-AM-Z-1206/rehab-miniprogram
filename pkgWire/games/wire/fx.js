// ============================================================================
// games/wire/fx.js —— 走钢丝的三件场景特效（纯矢量，无状态、无随机）
// ----------------------------------------------------------------------------
// 【2026-11-01 引入】借 pixelfx 库的「方法」而不是它的像素：
//   pixelfx（github.com/patch-gg/pixelfx）的特效质量来自四件事 ——
//   ① 一句话说清剧本（什么先动、什么后动、怎么收尾）；
//   ② 调色板 ramp（暗到亮有限几档，不许渐变糊成一片）；
//   ③ 运动手感（快进慢出 easeOut，先亮后淡，绝不匀速）；
//   ④ 确定性（同一 t 必须画出同一帧，测试能逐位对比）。
//   但它的成品是**像素风**（低分辨率缓冲 + 硬边色块），放进绘本风晨光场景
//   就是贴纸。所以这里只借它的方法，绘制仍走主包 renderer 的矢量 Canvas，
//   原生分辨率、零加载、零图片。
//
// 三件特效（各自的一句话剧本）：
//   motes     氛围浮尘 —— 十几粒暖金光尘悬在云海与钢丝之间的空气里，
//               缓慢上浮、水平轻漂、以各自周期呼吸发光；出屏前柔和淡出。
//               与 utils/scene/depth.js 的白色 micro-dust 明确分工：
//               那层是「空气」（纯白、1px 级、密集），这层是「晨光」
//               （暖金、光晕、稀疏、呼吸）。两层同时存在不打架。
//   wind      失衡风线 —— 失衡时三条冷白风线从身体倾斜的一侧掠过画面，
//               头部快、尾部卷曲收细，伴随被卷起的碎光；强度由 renderer
//               已平滑的 warnGlow 控制，站得稳时零开销（直接 return）。
//               **康复红线**：失衡反馈是「风大了」，不是「你错了」——
//               所以风线用云海的冷白，绝不用红/橙警示色（那是现有渐晕的事）。
//   goldDust  过桩金尘 —— 里程碑达成瞬间，角色脚下升起一簇暖金光尘，
//               easeOut 上飘外散、收细淡出，1.4s 归零；伴随一圈柔光扩散。
//               与「已走过 N 米」飘字同帧触发：字说结论，金尘说情绪。
//
// 【确定性契约】所有粒子都是 (t, 序号) 的纯函数：内部只用固定种子的
//   hash（sin 大数取小数），**不出现 Math.random、不持有任何可变状态**。
//   这不是洁癖：wire-headless-test 会对同一 t 画两次逐调用对比，任何一处
//   隐式状态都会让画面在「同帧重绘」时抖动（射击游戏踩过这条）。
// ============================================================================

const TAU = Math.PI * 2

/** 固定种子 hash：输入 (序号, 盐)，输出 0..1。同一输入永远同一输出。 */
function h(i, s) {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453
  return x - Math.floor(x)
}

function clamp01(v) {
  return v < 0 ? 0 : (v > 1 ? 1 : v)
}

/** 环形取模：把 v 折回 [0, m)，保证浮尘上浮出界后从底部回来 */
function wrap(v, m) {
  const r = v % m
  return r < 0 ? r + m : r
}

// ---------------------------------------------------------------- 氛围浮尘

/**
 * 暖金浮尘。topY..botY 是浮尘带（地平线 → 云海下方）。
 * 深度 d 大 = 近 = 更低、更大、更亮、漂得更快 —— 稀疏光斑也有了纵深。
 */
function drawMotes(ctx, W, H, t, topY, botY) {
  if (!ctx || !W || !H) return
  const band = Math.max(40, botY - topY)
  const N = 13
  for (let i = 0; i < N; i++) {
    const d = h(i, 1) // 0..1 深度
    const rise = 2.0 + d * 5.0 // 近的浮得快（视差）
    const y0 = topY + h(i, 2) * band
    // 上浮 + 环形回绕；回绕端 34px 内淡出，不会「啪一下出现」
    let fy = wrap(y0 - t * rise, band)
    const edge = Math.min(fy, band - fy)
    const edgeFade = clamp01(edge / 34)
    fy = topY + fy
    const x = h(i, 3) * (W + 60) - 30 + Math.sin(t * 0.35 + i * 2.1) * (3 + d * 7)
    // 呼吸：各自频率（0.5~1.2 rad/s）与相位；sin 输出 -1..1 → 0.5±0.5
    const br = 0.55 + 0.45 * Math.sin(t * (0.5 + h(i, 4) * 0.7) * TAU * 0.35 + i * 2.4)
    const warm = h(i, 5) <= 0.78 // 约 1/5 是冷色（云海的天光反光）
    const r = (1.6 + 3.4 * d) * (0.9 + 0.1 * br)
    // 亮色云海上低 alpha 的浅金会被洗成一片白（washed out）——
    // 用饱和一点的琥珀金 + 更高的 alpha 才读得出「光尘」。
    const a = (0.16 + 0.38 * d) * br * edgeFade

    const col = warm ? '255,199,116' : '196,221,240'
    const g = ctx.createRadialGradient(x, fy, 0.5, x, fy, r * 2.6)
    g.addColorStop(0, 'rgba(' + col + ',' + (a * 0.9).toFixed(3) + ')')
    g.addColorStop(0.45, 'rgba(' + col + ',' + (a * 0.35).toFixed(3) + ')')
    g.addColorStop(1, 'rgba(' + col + ',0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, fy, r * 2.6, 0, TAU)
    ctx.fill()

    // 近处几颗加一个亮芯：光斑有「核」才不是一片雾
    if (d > 0.55) {
      ctx.beginPath()
      ctx.arc(x, fy, r * 0.38, 0, TAU)
      ctx.fillStyle = 'rgba(' + col + ',' + (a * 1.1).toFixed(3) + ')'
      ctx.fill()
    }
  }
}

// ---------------------------------------------------------------- 失衡风线

/**
 * 风线。k = 强度（renderer 的 warnGlow，已平滑），dir = +1 风向右 / -1 向左。
 * 剧本：每条风线是一个跑过画面的「头」，拖着一条上下起伏、逐渐收细的尾巴；
 * 头部亮、尾部淡，行程两端各淡入淡出；随行 5 粒碎光。k<0.03 零开销。
 */
function drawWind(ctx, W, H, t, k, dir) {
  if (!ctx || !W || !H) return
  const intensity = clamp01(k == null ? 0 : k)
  if (intensity < 0.03) return
  const d = (dir || 1) >= 0 ? 1 : -1

  ctx.save()
  // 统一按「向右吹」画，方向不同就镜像整个坐标系（纯描边，无渐变方向问题）
  if (d < 0) {
    ctx.translate(W, 0)
    ctx.scale(-1, 1)
  }

  for (let s = 0; s < 3; s++) {
    const sp = 0.75 + h(s, 7) * 0.55 // 行程速度（屏/秒）
    const q = t * sp + h(s, 8) * 1.3 // 行程进度
    const cyc = wrap(q, 1.3) - 0.15 // 留 0.15 行程在屏外进出
    if (cyc < -0.05 || cyc > 1.05) continue
    // 行程两端淡入淡出（头出屏前先变淡，不会「撞墙消失」）
    const travel = clamp01(cyc) * Math.sin(Math.PI * clamp01(cyc))
    const a0 = intensity * 0.62 * travel
    if (a0 < 0.01) continue

    const y0 = H * (0.30 + h(s, 9) * 0.34) + Math.sin(t * 1.6 + s * 2.3) * 9
    const x0 = cyc * (W * 1.5) - W * 0.25 // 头部 x（-0.25W 进、1.25W 出）
    const TL = W * (0.30 + h(s, 10) * 0.24) // 尾长
    // 尾巴上两个控制点的起伏（一上一下 = 风线的「卷」）
    const wv1 = Math.sin(t * 2.2 + s * 1.7) * 10 - 6
    const wv2 = Math.sin(t * 2.2 + s * 1.7 + 1.1) * 12 + 7

    // 分三段收细收淡：一条等宽等淡的曲线 = 丝带，不是风。
    // 颜色用**冷钢蓝**而不是白 —— 云海是亮的，近白的风线会被洗没；
    // 比云面深半档的冷蓝在亮云上读成「银风」，在暗天上读成「夜风」，两头都对。
    const seg = (x1, y1, cxp, cyp, x2, y2, lw, al) => {
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.quadraticCurveTo(cxp, cyp, x2, y2)
      ctx.lineWidth = lw
      ctx.lineCap = 'round'
      ctx.strokeStyle = 'rgba(168,201,226,' + al.toFixed(3) + ')'
      ctx.stroke()
    }
    const x1 = x0 - TL * 0.38
    const x2 = x0 - TL * 0.72
    const x3 = x0 - TL
    seg(x0, y0, x0 - TL * 0.20, y0 + wv1 * 0.5, x1, y0 + wv1, 3.2, a0)
    seg(x1, y0 + wv1, (x1 + x2) / 2, y0 + wv1 * 0.4 + wv2 * 0.6, x2, y0 + wv2, 2.1, a0 * 0.62)
    seg(x2, y0 + wv2, (x2 + x3) / 2, y0 + wv2 * 0.6, x3, y0 + wv2 * 0.4, 1.2, a0 * 0.32)

    // 头部一点亮（风线的「锋」），随行程淡入淡出
    ctx.beginPath()
    ctx.arc(x0, y0, 2.0, 0, TAU)
    ctx.fillStyle = 'rgba(246,251,255,' + (a0 * 0.95).toFixed(3) + ')'
    ctx.fill()

    // 被卷起的碎光：沿尾巴后方一串，各自缩小变淡
    for (let f = 0; f < 5; f++) {
      const fq = cyc - 0.045 - f * 0.055
      if (fq < 0) continue
      const fx2 = fq * (W * 1.5) - W * 0.25
      const fy2 = y0 + Math.sin(t * 2.2 + s * 1.7) * 10 * (0.3 + f * 0.16) +
        Math.sin(t * 3.1 + f * 2.2) * 3
      ctx.beginPath()
      ctx.arc(fx2, fy2, 1.8 - f * 0.2, 0, TAU)
      ctx.fillStyle = 'rgba(224,240,250,' + (a0 * (0.75 - f * 0.12)).toFixed(3) + ')'
      ctx.fill()
    }
  }
  ctx.restore()
}

// ---------------------------------------------------------------- 过桩金尘

const GOLD_LIFE = 1.4

/**
 * 金尘爆发。(x, y) = 角色脚下（钢丝接触点），age = 距触发秒数，s = 尺寸系数。
 * 剧本：0~0.12s 亮起 → easeOutCubic 向四周外散 + easeOutQuart 上飘 →
 * 粒子收细、尾部按 p^1.4 淡出；原点一圈柔光同步扩散；1.4s 完全归零。
 * 调色 ramp 借 pixelfx 的 gold：核心 #FFF3D8（热）→ 主体 #FFD98F → 淡出。
 */
function drawGoldDust(ctx, x, y, age, s) {
  if (!ctx || !x && x !== 0 || !y && y !== 0) return
  const sc = s || 1
  if (!(age > 0) || age > GOLD_LIFE) return
  const p0 = clamp01(age / 0.12) // 全局亮起

  // 原点柔光：从脚下亮起并向外扩散（p 越大圈越大越淡）
  const gr = (12 + 30 * clamp01(age / GOLD_LIFE)) * sc
  const ga = p0 * Math.pow(1 - age / GOLD_LIFE, 1.6) * 0.34
  if (ga > 0.01) {
    const g = ctx.createRadialGradient(x, y, 1, x, y, gr)
    g.addColorStop(0, 'rgba(255,208,128,' + ga.toFixed(3) + ')')
    g.addColorStop(1, 'rgba(255,208,128,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, gr, 0, TAU)
    ctx.fill()
  }

  for (let i = 0; i < 18; i++) {
    const dl = h(i, 11) * 0.12 // 各自错开一点点，不是齐射
    const p = clamp01((age - dl) / (GOLD_LIFE - 0.2))
    if (p <= 0 || p >= 1) continue
    const ang = h(i, 12) * TAU
    const rad = (3.5 + h(i, 13) * 10) * sc
    const easeC = 1 - Math.pow(1 - p, 3)
    const easeQ = 1 - Math.pow(1 - p, 4)
    const px = x + Math.cos(ang) * rad * easeC * 1.5 * sc
    const py = y - (7 + h(i, 14) * 30) * sc * easeQ
    const size = (2.2 + h(i, 15) * 2.8) * sc * (1 - p * 0.55)
    // 亮云是背景：淡金会被洗成白点，主体用饱和琥珀金、只有热核是浅金
    const a = (p < 0.12 ? p / 0.12 : 1) * Math.pow(1 - p, 1.3) * 0.92 * p0
    const hot = p < 0.4
    const col = hot ? '255,232,170' : '244,168,72'
    ctx.beginPath()
    ctx.arc(px, py, size, 0, TAU)
    ctx.fillStyle = 'rgba(' + col + ',' + a.toFixed(3) + ')'
    ctx.fill()
  }
}

// ---------------------------------------------------------------- 回正引导箭头

/**
 * 回正引导箭头。**这是「回正由患者自己做」这件事的全部视觉载体。**
 *
 * 2026-11-01 第二版：从角色腰部的小光带改成**屏幕上方的 HUD 大箭头**。
 * 理由不是审美：
 *   · 腰部那条光带只有 60~90px 长，夹在云海纹理、角色和钢丝之间 —— 患者要
 *     么看不见，要么看见了也只读到「有一根斜的亮条」，读不出方向；
 *   · 失衡时人第一反应是看**画面中央偏上**（所有游戏 HUD 的固定位置）。
 *     把方向放在那儿，不需要教；放在腰上，需要教一次。
 *
 * 剧本（一句话）：一枚大箭头悬在 HUD 下方，朝「该压的那一侧」指；越失衡
 * 呼吸越急；尾部两道淡光痕往外递（表示「往这边推」）；**整体不做位移动画**，
 * 大箭头在视线中心滑来滑去只会让人分心。
 *
 * 配色只有一套：深色填充 + 冷白描边。深色底保证在亮云海/暖地平线上立得住，
 * 亮描边保证在深色天空上也立得住 —— 「亮云海上低 alpha 浅色会被洗没」这条
 * 在本项目踩过三次，所以这里从一开始就是双层对比，不靠 alpha 叠光。
 *
 * @param {object} o { cx, cy, dir, k, t, len }
 *   cx,cy 箭头中心（逻辑像素）；dir -1 往左 / 1 往右；k 0~1 强度；
 *   t 秒（连续，只用来做呼吸，必须确定性）；len 箭头总长
 */
function drawGuideArrow(ctx, o) {
  if (!ctx || !o) return
  const k = clamp01(o.k == null ? 0 : o.k)
  if (k < 0.05) return
  const dir = (o.dir || 1) >= 0 ? 1 : -1
  const len = Math.max(120, Number(o.len) || 220)
  const cx = Number(o.cx) || 0
  const cy = Number(o.cy) || 0
  const t = Number(o.t) || 0

  // 2026-11-01 第二版尺寸：**变细、变长、压暗**。
  // 第一版（头高 0.27、杆粗 0.085、填充 0.72）实测和角色一样高的一半、
  // 面积约角色的 43%，而且是画在天空最亮的那条带子上 —— 全画面对比最强的
  // 一块深色，视线先落它，角色第二。对体感训练来说主次反了：
  // 患者该看的是身体，箭头只是提示。
  // 现在杆细到 0.042（一半以下）、头降到 0.19，同时把长度拉到 0.68 ——
  // 细长的箭头读起来是「指示牌」，缩小的实心箭头还是「小黑板」。
  const half = len / 2
  const headLen = len * 0.26
  const headH = len * 0.19
  const shaft = len * 0.042

  // 呼吸只做亮度，不做位移
  const breath = 0.72 + 0.28 * (Math.sin(t * (1.0 + k * 1.5) * TAU) * 0.5 + 0.5)
  const a = (0.60 + 0.40 * k) * breath

  ctx.save()

  // 底部冷光：只留一点点。原来是 0.26 的径向雾，等于给箭头加了一圈
  // 「光晕」，在亮天上读成「贴纸的投影」。
  const g = ctx.createRadialGradient(cx, cy, len * 0.06, cx, cy, len * 0.62)
  g.addColorStop(0, 'rgba(206,232,246,' + (0.10 * k).toFixed(3) + ')')
  g.addColorStop(1, 'rgba(206,232,246,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(cx, cy, len * 0.62, headH * 1.35, 0, 0, TAU)
  ctx.fill()

  // 统一按「向右」画，向左整体镜像（纯几何，没有渐变方向问题）
  if (dir < 0) {
    ctx.translate(cx * 2, 0)
    ctx.scale(-1, 1)
  }

  const tipX = cx + half
  const baseX = tipX - headLen
  const tailX = cx - half * 0.66
  const r = shaft / 2

  // 尾部那两道「递进光痕」删掉了。箭头变细之后，它们从「动势」变成了
  // 一个独立的小箭头 —— 屏幕上出现两个方向指示，反而要多读一秒。

  // ---- 箭身：一个多边形（箭杆 + 三角头）。分开画杆和头会在接缝处露一道 ----
  // 尾端两个角做圆角：直角尾 + 尖头的组合像贴纸，圆尾才像「一枚指示牌」。
  // 尖头必须保持尖的 —— 圆头箭头在任何尺寸下都读不出「往这边」。
  const rTail = Math.min(r, len * 0.03)
  const body = () => {
    ctx.beginPath()
    ctx.moveTo(tailX + rTail, cy - r)
    ctx.lineTo(baseX, cy - r)
    ctx.lineTo(baseX, cy - headH / 2)
    ctx.lineTo(tipX, cy)
    ctx.lineTo(baseX, cy + headH / 2)
    ctx.lineTo(baseX, cy + r)
    ctx.lineTo(tailX + rTail, cy + r)
    ctx.arcTo(tailX, cy + r, tailX, cy - r, rTail)
    ctx.arcTo(tailX, cy - r, tailX + rTail, cy - r, rTail)
    ctx.closePath()
  }

  // 两层：半透明深色填充 → 亮描边。
  // 去掉的第三层是「外发光描边」—— 它让箭头比实际尺寸看起来更大一圈，
  // 正是用户说「箭头有点大」的直接来源之一。
  body()
  const fg = ctx.createLinearGradient(0, cy - headH / 2, 0, cy + headH / 2)
  fg.addColorStop(0, 'rgba(24,42,60,' + (0.42 * k + 0.08).toFixed(3) + ')')
  fg.addColorStop(1, 'rgba(10,18,28,' + (0.50 * k + 0.08).toFixed(3) + ')')
  ctx.fillStyle = fg
  ctx.fill()

  body()
  ctx.lineWidth = Math.max(1.6, len * 0.009)
  ctx.strokeStyle = 'rgba(236,248,255,' + a.toFixed(3) + ')'
  ctx.stroke()

  ctx.restore()
}

module.exports = {
  drawMotes,
  drawWind,
  drawGoldDust,
  drawGuideArrow,
  GOLD_LIFE
}
