// ============================================================================
// games/wire/character.js —— 走钢丝角色（纯 Canvas 矢量绘制，无图片依赖）
// ----------------------------------------------------------------------------
// 为什么不用贴图：角色需要连续的失衡角、行走相位、绳索张力等参数驱动，
// 矢量分层绘制可以做出「连续自然」的动作，也方便后续替换成美术素材
// （PALETTE / BODY 尺寸都在文件顶部，替换风格只改这里）。
//
// 局部坐标系：原点在「脚底与钢丝接触点」，y 轴向上为负，单位 ≈ px @ scale=1。
// 绘制顺序：影子 → 后腿 → 后臂 → 躯干 → 前腿 → 头 → 平衡杆 → 安全背带
// ============================================================================

const PALETTE = {
  skin: '#F4C9A4',
  skinShade: '#E2B189',
  blush: 'rgba(226, 116, 96, 0.22)',
  hair: '#3A2A26',
  hairLight: '#553D35',
  jacket: '#E4674A',
  jacketLight: '#F2896D',
  jacketDark: '#BF5038',
  collar: '#F2D9C9',
  pants: '#2E4157',
  pantsLight: '#3F5674',
  shoe: '#2B2C35',
  shoeSole: '#EFE3D5',
  harness: '#15897C',
  harnessLight: '#3BB6A5',
  metal: '#D3DDE6',
  outline: 'rgba(52, 38, 34, 0.34)'
}

const BODY = {
  hipY: -66,
  chestY: -108,
  shoulderY: -136,
  neckY: -146,
  headCY: -167,
  headR: 20.5,
  hipHalf: 12.5,
  shoulderHalf: 23,
  legSpread: 5.4,
  armLen: 46,
  poleHalf: 68
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

function ellipse(ctx, x, y, rx, ry) {
  ctx.beginPath()
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(rx, ry)
  ctx.arc(0, 0, 1, 0, Math.PI * 2)
  ctx.restore()
}

function roundLine(ctx, x1, y1, x2, y2, width, color) {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.strokeStyle = color
  ctx.stroke()
}

/** 安全背带上的挂钩位置（世界坐标），渲染器据此画绳索 */
function beltWorld(o) {
  const s = o.scale || 1
  const lx = 0
  const ly = BODY.chestY - 4
  const lean = o.lean || 0
  const cos = Math.cos(lean)
  const sin = Math.sin(lean)
  return {
    x: o.x + (lx * cos - ly * sin) * s,
    y: o.y + (lx * sin + ly * cos) * s
  }
}

/** 头顶位置，用于「稳定光环」等特效定位 */
function headWorld(o) {
  const s = o.scale || 1
  const ly = BODY.headCY - BODY.headR
  const lean = o.lean || 0
  return {
    x: o.x - (ly * Math.sin(lean)) * s,
    y: o.y + (ly * Math.cos(lean)) * s
  }
}

/**
 * 绘制走钢丝角色
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} o
 *   x, y            脚底接触点（CSS px）
 *   scale           画布缩放
 *   lean            失衡角（弧度，正 = 向右倒）
 *   walkPhase       行走相位（弧度）
 *   balance         0~1，平衡值（影响表情与手臂幅度）
 *   ropeTension     0~1，保险绳张力（背带被拉紧的表现）
 *   t               全局时间（秒）
 *   speedRatio      0~1，前进速度比（步频）
 */
function drawWalker(ctx, o) {
  const s = o.scale || 1
  const lean = o.lean || 0
  const phase = o.walkPhase || 0
  const balance = typeof o.balance === 'number' ? o.balance : 1
  const tension = Math.max(0, Math.min(1, o.ropeTension || 0))
  const t = o.t || 0

  const instability = Math.max(0, 1 - balance)
  // 不稳定时：手臂外张、身体轻微摆动（低频，避免眩晕）
  const flail = instability * instability
  const sway = Math.sin(t * 2.6) * flail * 2.6

  // 步伐：前进越快步频越高
  const stepAmp = 1
  const legA = Math.sin(phase) * stepAmp
  const legB = Math.sin(phase + Math.PI) * stepAmp
  const bob = -Math.abs(Math.sin(phase)) * 2.2

  ctx.save()
  ctx.translate(o.x, o.y)
  ctx.scale(s, s)

  // ---------- 落在钢丝上的影子（钢索很细，影子要收紧，否则像站在水池里） ----------
  ctx.save()
  ctx.globalAlpha = 0.26
  ellipse(ctx, 0, 2.4, 17, 4.4)
  ctx.fillStyle = '#1B2A38'
  ctx.fill()
  ctx.restore()

  ctx.rotate(lean)
  ctx.translate(sway * 0.5, bob)

  // ---------- 腿 ----------
  // 走钢丝是“两脚前后踩在同一条线上”，所以横向张开很小，
  // 鞋子会压住钢丝中轴，读起来才是“踩在钢丝上”而不是“跨在钢丝两边”
  const footL = {
    x: -BODY.legSpread + legA * 1.1,
    y: -Math.max(0, legA) * 6
  }
  const footR = {
    x: BODY.legSpread + legB * 1.1,
    y: -Math.max(0, legB) * 6 - 1.2
  }
  const kneeL = {
    x: lerp(-BODY.hipHalf, footL.x, 0.55) - 1.4 - Math.max(0, legA) * 1.8,
    y: BODY.hipY * 0.48 + footL.y * 0.45
  }
  const kneeR = {
    x: lerp(BODY.hipHalf, footR.x, 0.55) + 1.4 + Math.max(0, legB) * 1.8,
    y: BODY.hipY * 0.48 + footR.y * 0.45
  }

  // 后腿（右）
  drawLeg(ctx, BODY.hipHalf, BODY.hipY, kneeR, footR, true)
  // 后臂（右）
  drawArm(ctx, BODY.shoulderHalf, BODY.shoulderY, 1, phase + Math.PI, flail, tension, true)

  // ---------- 躯干 ----------
  drawTorso(ctx, phase, balance)

  // ---------- 前腿（左） ----------
  drawLeg(ctx, -BODY.hipHalf, BODY.hipY, kneeL, footL, false)

  // ---------- 头 ----------
  drawHead(ctx, o, balance, t)

  // ---------- 平衡杆 + 前臂 ----------
  // 先画杆再画手，让手压在杆上，读起来是「握着杆」
  drawPole(ctx, lean, phase, balance, tension)
  drawArm(ctx, -BODY.shoulderHalf, BODY.shoulderY, -1, phase, flail, tension, false)

  // ---------- 安全背带（画在最前，保证看得出被绳子拉着） ----------
  drawHarness(ctx, tension)

  ctx.restore()
}

function drawLeg(ctx, hipX, hipY, knee, foot, back) {
  const color = back ? PALETTE.pants : PALETTE.pantsLight
  const w = back ? 10.5 : 11.5
  roundLine(ctx, hipX, hipY, knee.x, knee.y, w, color)
  roundLine(ctx, knee.x, knee.y, foot.x, foot.y - 1, w - 1.5, color)

  // 鞋
  ctx.save()
  ctx.translate(foot.x, foot.y)
  ctx.beginPath()
  ctx.moveTo(-7.5, 0)
  ctx.quadraticCurveTo(-8.5, -6, -3, -7)
  ctx.lineTo(4, -7)
  ctx.quadraticCurveTo(8.5, -6, 8.5, 0)
  ctx.quadraticCurveTo(0, 2.4, -7.5, 0)
  ctx.closePath()
  ctx.fillStyle = back ? '#25262E' : PALETTE.shoe
  ctx.fill()
  // 鞋底亮边（写实小细节）
  ctx.beginPath()
  ctx.moveTo(-7, -0.6)
  ctx.quadraticCurveTo(0, 1.8, 7.8, -0.6)
  ctx.lineWidth = 1.6
  ctx.strokeStyle = PALETTE.shoeSole
  ctx.stroke()
  ctx.restore()
}

function drawTorso(ctx, phase, balance) {
  const hh = BODY.hipHalf
  const sh = BODY.shoulderHalf
  const top = BODY.shoulderY
  const bottom = BODY.hipY + 6

  // 躯干外形：肩宽腰窄，略微前挺
  ctx.beginPath()
  ctx.moveTo(-sh, top + 4)
  ctx.quadraticCurveTo(-sh - 1, top - 4, -sh * 0.62, top - 7)
  ctx.quadraticCurveTo(0, top - 9, sh * 0.62, top - 7)
  ctx.quadraticCurveTo(sh + 1, top - 4, sh, top + 4)
  ctx.quadraticCurveTo(sh * 0.95, BODY.chestY + 6, hh + 2, bottom - 6)
  ctx.quadraticCurveTo(0, bottom + 5, -hh - 2, bottom - 6)
  ctx.quadraticCurveTo(-sh * 0.95, BODY.chestY + 6, -sh, top + 4)
  ctx.closePath()

  const g = ctx.createLinearGradient(-sh, top, sh, bottom)
  g.addColorStop(0, PALETTE.jacketLight)
  g.addColorStop(0.45, PALETTE.jacket)
  g.addColorStop(1, PALETTE.jacketDark)
  ctx.fillStyle = g
  ctx.fill()
  ctx.lineWidth = 1.1
  ctx.strokeStyle = PALETTE.outline
  ctx.stroke()

  // 拉链
  ctx.beginPath()
  ctx.moveTo(0, top - 4)
  ctx.lineTo(0, bottom + 1)
  ctx.lineWidth = 1.2
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.stroke()

  // 领口
  ctx.beginPath()
  ctx.moveTo(-7.5, top - 6)
  ctx.quadraticCurveTo(0, top + 3, 7.5, top - 6)
  ctx.lineWidth = 3
  ctx.strokeStyle = PALETTE.collar
  ctx.lineCap = 'round'
  ctx.stroke()

  // 衣摆下沿的柔和阴影
  ctx.beginPath()
  ctx.moveTo(-hh - 1, bottom - 3)
  ctx.quadraticCurveTo(0, bottom + 3, hh + 1, bottom - 3)
  ctx.lineWidth = 2
  ctx.strokeStyle = 'rgba(120, 48, 32, 0.22)'
  ctx.stroke()

  // 略微呼吸起伏（幅度极小，不影响判断）
  void phase
  void balance
}

function drawArm(ctx, shoulderX, shoulderY, side, phase, flail, tension, back) {
  // side: -1 左（前）、+1 右（后）
  const swing = Math.sin(phase + (side > 0 ? Math.PI : 0)) * (2.2 + flail * 7)
  const lift = flail * 9 + tension * 6
  const handX = shoulderX + side * (BODY.poleHalf * 0.34) + side * flail * 5
  const handY = BODY.shoulderY + 26 - lift + swing * 0.4
  const elbowX = shoulderX + side * (11 + flail * 4)
  const elbowY = shoulderY + 18 - lift * 0.4 + swing * 0.2

  const w = back ? 8 : 9
  roundLine(ctx, shoulderX, shoulderY + 2, elbowX, elbowY, w, back ? PALETTE.jacketDark : PALETTE.jacket)
  roundLine(ctx, elbowX, elbowY, handX, handY, w - 1.2, back ? PALETTE.jacketDark : PALETTE.jacket)

  // 手
  ctx.beginPath()
  ctx.arc(handX, handY, 4.4, 0, Math.PI * 2)
  ctx.fillStyle = back ? PALETTE.skinShade : PALETTE.skin
  ctx.fill()
}

function drawPole(ctx, lean, phase, balance, tension) {
  const y = BODY.shoulderY + 26 + tension * 5
  // 平衡杆随失衡反向倾斜（对抗性动作），并随时间轻微摆动
  const tilt = -lean * 0.55 + Math.sin(phase * 0.8) * 0.012
  ctx.save()
  ctx.translate(0, y)
  ctx.rotate(tilt)

  const half = BODY.poleHalf
  // 杆身
  ctx.beginPath()
  ctx.moveTo(-half, 0)
  ctx.lineTo(half, 0)
  ctx.lineWidth = 4.2
  ctx.lineCap = 'round'
  const g = ctx.createLinearGradient(-half, -3, -half, 3)
  g.addColorStop(0, '#F5F9FC')
  g.addColorStop(0.5, '#C3D2DE')
  g.addColorStop(1, '#7E8E9C')
  ctx.strokeStyle = g
  ctx.stroke()

  // 高光
  ctx.beginPath()
  ctx.moveTo(-half + 6, -1.1)
  ctx.lineTo(half - 6, -1.1)
  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.stroke()

  // 两端配重
  ;[-half, half].forEach((x) => {
    ctx.beginPath()
    ctx.arc(x, 0, 3.4, 0, Math.PI * 2)
    ctx.fillStyle = PALETTE.metal
    ctx.fill()
    ctx.lineWidth = 0.9
    ctx.strokeStyle = 'rgba(60,72,84,0.5)'
    ctx.stroke()
  })
  ctx.restore()
  void balance
}

function drawHead(ctx, o, balance, t) {
  const cy = BODY.headCY
  const r = BODY.headR

  // 脖子
  roundLine(ctx, 0, BODY.neckY + 4, 0, BODY.shoulderY + 2, 9, PALETTE.skinShade)

  // 头
  ctx.beginPath()
  ctx.arc(0, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = PALETTE.skin
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(180, 120, 92, 0.35)'
  ctx.stroke()

  // 耳朵
  ellipse(ctx, -r + 1, cy + 3, 3.2, 4.6)
  ctx.fillStyle = PALETTE.skinShade
  ctx.fill()
  ellipse(ctx, r - 1, cy + 3, 3.2, 4.6)
  ctx.fill()

  // 头发：上半圆 + 侧分刘海
  ctx.beginPath()
  ctx.arc(0, cy, r + 1.2, Math.PI * 0.98, Math.PI * 2.02)
  ctx.closePath()
  ctx.fillStyle = PALETTE.hair
  ctx.fill()

  ctx.beginPath()
  ctx.moveTo(-r * 1.02, cy - 1)
  ctx.quadraticCurveTo(-r * 0.5, cy - r * 1.05, r * 0.25, cy - r * 0.92)
  ctx.quadraticCurveTo(-r * 0.15, cy - r * 0.42, -r * 0.2, cy - 1.5)
  ctx.quadraticCurveTo(-r * 0.6, cy + 1, -r * 1.02, cy - 1)
  ctx.closePath()
  ctx.fillStyle = PALETTE.hairLight
  ctx.fill()

  // 表情
  const worry = Math.max(0, 1 - balance)
  const happy = balance > 0.78
  const eyeY = cy + 3
  const eyeDx = 7.4

  ctx.strokeStyle = '#2E2320'
  ctx.fillStyle = '#2E2320'
  ctx.lineCap = 'round'

  if (happy) {
    // 弯弯的笑眼
    ;[-1, 1].forEach((sgn) => {
      ctx.beginPath()
      ctx.moveTo(sgn * eyeDx - 3.1, eyeY + 1)
      ctx.quadraticCurveTo(sgn * eyeDx, eyeY - 2.6, sgn * eyeDx + 3.1, eyeY + 1)
      ctx.lineWidth = 1.7
      ctx.stroke()
    })
  } else {
    const wide = 2.2 + worry * 1.5
    ;[-1, 1].forEach((sgn) => {
      ellipse(ctx, sgn * eyeDx, eyeY, wide * 0.82, wide)
      ctx.fill()
      if (worry > 0.45) {
        // 瞳孔高光，表现紧张但仍可控
        ctx.beginPath()
        ctx.arc(sgn * eyeDx - 0.7, eyeY - 0.9, 0.9, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.fill()
        ctx.fillStyle = '#2E2320'
      }
    })
  }

  // 眉毛：越不稳越上扬
  ctx.strokeStyle = PALETTE.hair
  ctx.lineWidth = 1.5
  ;[-1, 1].forEach((sgn) => {
    ctx.beginPath()
    const bx = sgn * eyeDx
    const by = eyeY - 6.6 - worry * 1.2
    ctx.moveTo(bx - 3.3, by + 0.9 - worry * 0.4)
    ctx.quadraticCurveTo(bx, by - 1.1, bx + 3.3, by + 0.3 + worry * 1.2)
    ctx.stroke()
  })

  // 嘴
  ctx.beginPath()
  if (happy) {
    ctx.moveTo(-4, cy + 12)
    ctx.quadraticCurveTo(0, cy + 16, 4, cy + 12)
    ctx.lineWidth = 1.6
    ctx.strokeStyle = '#8C4B3F'
    ctx.stroke()
  } else if (worry > 0.55) {
    ellipse(ctx, 0, cy + 13.4, 2.5, 3)
    ctx.fillStyle = '#8C4B3F'
    ctx.fill()
  } else {
    ctx.moveTo(-3.4, cy + 13)
    ctx.quadraticCurveTo(0, cy + 14.6, 3.4, cy + 13)
    ctx.lineWidth = 1.5
    ctx.strokeStyle = '#8C4B3F'
    ctx.stroke()
  }

  // 腮红
  ellipse(ctx, -10.5, cy + 9, 4.4, 2.4)
  ctx.fillStyle = PALETTE.blush
  ctx.fill()
  ellipse(ctx, 10.5, cy + 9, 4.4, 2.4)
  ctx.fill()

  // 紧张时的小汗滴（静态位置，不闪动）
  if (worry > 0.7) {
    ctx.beginPath()
    ctx.moveTo(r * 0.86, cy - 6)
    ctx.quadraticCurveTo(r * 1.05, cy - 1, r * 0.86, cy + 2)
    ctx.quadraticCurveTo(r * 0.66, cy - 1, r * 0.86, cy - 6)
    ctx.fillStyle = 'rgba(126, 197, 232, 0.9)'
    ctx.fill()
  }
  void o
  void t
}

function drawHarness(ctx, tension) {
  // 胸前的安全背带：两条肩带 + 胸扣，张力越大越贴身
  const top = BODY.shoulderY - 2
  const midY = BODY.chestY + 6

  ctx.save()
  ctx.lineWidth = 4
  ctx.strokeStyle = tension > 0.2 ? PALETTE.harnessLight : PALETTE.harness
  ctx.lineCap = 'round'
  ;[-1, 1].forEach((sgn) => {
    ctx.beginPath()
    ctx.moveTo(sgn * BODY.shoulderHalf * 0.72, top)
    ctx.quadraticCurveTo(sgn * 9, midY - 8, sgn * 2.5, midY)
    ctx.stroke()
  })

  // 腰带
  ctx.beginPath()
  ctx.moveTo(-BODY.hipHalf - 1, BODY.hipY + 1)
  ctx.quadraticCurveTo(0, BODY.hipY + 7, BODY.hipHalf + 1, BODY.hipY + 1)
  ctx.lineWidth = 3.4
  ctx.strokeStyle = PALETTE.harness
  ctx.stroke()

  // 胸扣 + 挂环
  ctx.beginPath()
  ctx.arc(0, midY, 3.2, 0, Math.PI * 2)
  ctx.fillStyle = tension > 0.2 ? '#FFD48A' : PALETTE.metal
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(60, 60, 60, 0.35)'
  ctx.stroke()

  if (tension > 0.05) {
    ctx.beginPath()
    ctx.arc(0, midY, 5.2 + tension * 1.6, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255, 212, 138, ' + (0.18 + tension * 0.35) + ')'
    ctx.lineWidth = 1.6
    ctx.stroke()
  }
  ctx.restore()
}

module.exports = {
  drawWalker,
  beltWorld,
  headWorld,
  PALETTE,
  BODY
}
