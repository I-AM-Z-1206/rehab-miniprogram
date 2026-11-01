// ============================================================================
// games/wire/character.js —— 走钢丝角色（纯 Canvas 矢量绘制，无图片依赖）
// ----------------------------------------------------------------------------
// 【第七版 · 绘本风旅人 2026-10-31】
//
// 上一版（v6 Q版提灯旅人）用户的评价是「还是怪怪的」。放大特写逐条核对后，
// 根因不是画得糙，是三件事：
//   ① **风格割裂**：背景是低饱和、有空气感的晨光云海；角色是高饱和扁平贴纸。
//      两者放在一起，角色是「贴」上去的。
//   ② **没有统一光源**：提灯在发光，却没有照亮身体；太阳在远端，角色却没有
//      边缘光。光源各自为政 = 不在同一个世界里。
//   ③ **兜帽是纯色蛋**：一个圆球不管加多少细节都是几何体（v5/v6 两次验证了）。
//
// 这一版的三条决定（逐条讨论后定的）：
//   A 绘本插画风：4.5 头身，低饱和灰调暖赭 + 冷灰紫暗部，布料有褶皱/开合，
//     精致感来自**层次**（发丝、褶皱、环境反光、边缘光），不来自五官。
//   B 露发 + 长飘带围巾：去掉兜帽（纯色蛋的根源）。飘带是唯一能表现
//     **风 / 速度 / 失衡**的元素 —— 康复训练需要即时视觉反馈。
//   C 中低调 + 统一光源：主体压到中暗，暗部用云海的冷灰蓝（不是棕黑），
//     亮部和边缘光交给远处的太阳，提灯只作第二光源照亮身侧一小块。
//
// 康复语境红线（一直有效，改任何部分都不能破）：
//   - 不能有**杖**（读成助行器）、不能有**背带/胸带**（= 康复步态带）；
//   - 主色不能用青绿（康复科 / 隔离服色）；
//   - 不能画脸 / 不能邀请人读表情（背影一次解决方向感和表情两个问题）；
//   - 不能有失败羞耻：失衡只是「风大了」，不是「你不行」。
//
// 【动画：走路循环的四条硬规则】（gait() 是纯函数，测试逐相位扫描）
//   a) 任何时刻至少一只脚在钢丝上。抬脚量取 max(0, sin)，两腿相位差 π。
//   b) 抬脚必须**同时**变高、变小、向外。只改高度读成"上下抽搐"。
//   c) 身体起伏（bob）频率是步频的**两倍**：|cos|，双腿并拢时最高。
//   d) 脚要钉在钢丝上：脚坐标反向补偿 swayX 的 80%。
//
// 局部坐标系：原点在「脚底与钢丝接触点」，y 轴向上为负，单位 ≈ px @ scale=1。
// 总高 190px —— 与 renderer 的 charScale = charH / 190 绑定，改这里是两处一起改。
// 比例（4.5 头身）：头 r=19（直径 38 = 全身 20%），颈 -151~-146，肩 -145，
//   大衣 -145 ~ -36（下摆外扩到 ±27），腿 -48 ~ 0（靴高 13）。
// 绘制顺序（由远及近）：影子 → 飘带 → 腿+靴 → 大衣 → 围巾 → 双臂 → 头(发) → 提灯
// ============================================================================

const PALETTE = {
  // 皮肤：只露两只手。整体中低调，皮肤也不能是最亮的东西。
  skin: '#C6A184',
  skinShade: '#AC8870',

  // 头发：露出来之后，头不再是纯色蛋。
  // **必须是暖栗棕，不能是近黑** —— #4A3B36 配上一整块没有脸的后脑，
  // 正好是恐怖片里"无脸黑发背影"的配方（用户反馈：角色一点恐怖）。
  // 再提亮半档到 #75523F：整体偏暗会强化"黑暗人影"的读法。
  // 头发：暖栗棕，比上一版亮一点，更柔和。
  hair: '#825842',
  hairDeep: '#6B4836',
  hairLight: '#9A6E52',
  hairLine: '#553A2E',
  // 发夹：一小块亮色。它是"这个人在打理自己"的最便宜的信号，
  // 也是画面里唯一可以明目张胆亮起来的小东西。
  clip: '#D8A870',

  // 大衣：暖陶土色，比上一版亮 —— 上一版压太暗像黑影。
  // 暗部用冷灰紫收，但不能太暗。
  coat: '#A8705A',
  coatLight: '#C48B6E',
  coatShade: '#8B624E',
  coatShadow: '#7E6264',
  coatDeep: '#6E5860',
  // 袖子专用：比大衣主体暗两档、偏灰，不能有暖橙味。
  // 上一版 #6B4E3E 在灰蓝背景上仍然是两根亮橙棍子。
  sleeve: '#5A463E',
  sleeveDark: '#4A3C40',

  // 围巾 / 飘带：暖琥珀色，和棕色大衣形成温暖的对比。
  // 它是角色身上唯一的亮色点缀，在灰蓝背景上要跳出来。
  scarf: '#D99058',
  scarfLight: '#EFB878',
  scarfDeep: '#A86838',

  pants: '#55606E',
  pantsBack: '#48525E',
  boot: '#46403A',
  bootDeep: '#3E3833',
  bootCuff: '#5A5148',

  brass: '#C79A5E',
  brassDark: '#A87840',
  glass: '#FFE9B0',
  flame: '#FFFDF2',

  // 逆光边缘光：太阳在钢丝远端（人物正前方）。**不描整圈** ——
  // 整圈一样宽一样亮的暖边就是一圈矢量描边（"AI 味"最重的细节）。
  // 只给朝天的那一侧 + 顶部发丝。
  rim: 'rgba(244,214,166,0.50)',
  rimSoft: 'rgba(244,214,166,0.26)',
  hairRim: 'rgba(233,192,142,0.80)'
}

const BODY = {
  headR: 20.5,
  headCY: -168,
  neckTop: -150,
  neckBot: -145,
  shoulderY: -144,
  shoulderHalf: 16,
  waistY: -110,
  waistHalf: 18,
  // 大衣下摆：A 形外扩。
  hemY: -38,
  hemHalf: 26,
  // 腿根（藏在大衣里）
  legTopY: -48,
  hipHalf: 8.5,
  legSpread: 3.0,
  // 保险绳挂点（腰）。
  hookY: -94
}

function clamp01(v) {
  return v < 0 ? 0 : (v > 1 ? 1 : v)
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

/**
 * 步态纯函数：drawWalker 的动作全部从这里出，测试逐相位扫描四条硬规则。
 */
function gait(phase, speed, balance) {
  const flail = Math.pow(Math.max(0, 1 - (typeof balance === 'number' ? balance : 1)), 2)
  const pR = phase
  const pL = phase + Math.PI
  // 规则 a：抬脚量取 max(0, sin)，两腿相位差 π → 任何时刻至多一条腿抬起
  const liftR = Math.pow(Math.max(0, Math.sin(pR)), 1.15)
  const liftL = Math.pow(Math.max(0, Math.sin(pL)), 1.15)
  // 腿比 Q 版长（48px vs 34px），抬脚和摆动幅度都要跟着放大
  const liftH = 8.0 + speed * 12.0
  const swingX = 3.0 + speed * 4.0
  // 重心转移：抬右脚时重心压向左 —— 走钢丝最标志性的一下
  const swayX = -Math.sin(phase) * (1.2 + speed * 2.2)
  // 规则 c：|cos| 两倍步频。写成 |sin| 会和落脚同相 = 蹦。
  const bob = -Math.abs(Math.cos(phase)) * (1.2 + speed * 2.0)
  const roll = Math.sin(phase) * 0.011 * (0.35 + speed)
  return {
    flail: flail,
    liftR: liftR, liftL: liftL,
    liftH: liftH, swingX: swingX,
    swayX: swayX, bob: bob, roll: roll
  }
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
  ctx.lineTo(x + rr, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr)
  ctx.lineTo(x, y + rr)
  ctx.quadraticCurveTo(x, y, x + rr, y)
  ctx.closePath()
}

function ellipse(ctx, x, y, rx, ry) {
  ctx.beginPath()
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(rx, ry)
  ctx.arc(0, 0, 1, 0, Math.PI * 2)
  ctx.restore()
}

/** 安全绳挂点（世界坐标）。挂在腰上（大衣里）。 */
function beltWorld(o) {
  const s = o.scale || 1
  const ly = BODY.hookY
  const lean = o.lean || 0
  return {
    x: o.x - (ly * Math.sin(lean)) * s,
    y: o.y + (ly * Math.cos(lean)) * s
  }
}

/** 头顶位置（含飞发），用于"稳定光环"等特效定位 */
function headWorld(o) {
  const s = o.scale || 1
  const ly = BODY.headCY - BODY.headR - 6
  const lean = o.lean || 0
  return {
    x: o.x - (ly * Math.sin(lean)) * s,
    y: o.y + (ly * Math.cos(lean)) * s
  }
}

/**
 * 绘制走钢丝角色（绘本风旅人 · 背影）
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} o x, y / scale / lean / walkPhase / balance / ropeTension / t / speedRatio
 */
function drawWalker(ctx, o) {
  const s = o.scale || 1
  const lean = o.lean || 0
  const phase = o.walkPhase || 0
  const balance = typeof o.balance === 'number' ? o.balance : 1
  const speed = clamp01(o.speedRatio || 0)
  const t = o.t || 0

  const g = gait(phase, speed, balance)
  const flail = g.flail
  // 失衡时的低频摆（叠加在步态侧摆上，频率压低避免眩晕）
  const wobble = Math.sin(t * 2.6) * flail * 2.4
  const swayX = g.swayX + wobble
  // 静止时的呼吸：待机不是一张死图，但不能多——多了就是"在喘"
  const breath = speed < 0.06 ? Math.sin(t * 1.3) * 0.55 : 0

  ctx.save()
  ctx.translate(o.x, o.y)
  ctx.scale(s, s)

  // ---------- 落在钢丝上的影子 ----------
  ctx.save()
  ctx.globalAlpha = 0.16
  ellipse(ctx, 0, 2.4, 15, 3.6)
  ctx.fillStyle = '#26303C'
  ctx.fill()
  ctx.globalAlpha = 0.11
  ellipse(ctx, 0, 1.6, 8, 2.1)
  ctx.fill()
  ctx.restore()

  ctx.rotate(lean + g.roll)
  ctx.translate(swayX, g.bob + breath)

  // 规则 d：脚钉在世界系，反向补偿身体平移的 80%
  const footFixX = -swayX * 0.8
  const footFixY = -g.bob * 0.75

  const pR = phase
  const pL = phase + Math.PI
  const footR = {
    x: BODY.legSpread + Math.sin(pR) * g.swingX + footFixX,
    y: -4.0 - g.liftR * g.liftH + footFixY
  }
  const footL = {
    x: -BODY.legSpread + Math.sin(pL) * g.swingX + footFixX,
    y: -g.liftL * g.liftH + footFixY
  }

  const st = {
    phase: phase,
    speed: speed,
    flail: flail,
    swayX: swayX,
    lean: lean,
    t: t,
    liftR: g.liftR,
    liftL: g.liftL
  }

  // ---------- 飘带（画在最底层：从肩后飘出来，被身体挡住一部分） ----------
  drawStreamers(ctx, st)

  // ---------- 腿 + 靴（大衣下摆压住腿根） ----------
  drawLeg(ctx, BODY.hipHalf, footR, { back: true, lift: g.liftR })
  drawLeg(ctx, -BODY.hipHalf, footL, { back: false, lift: g.liftL })

  // ---------- 大衣 ----------
  drawCoat(ctx, st)

  // ---------- 围巾（绕颈一圈） ----------
  drawScarf(ctx, st)

  // ---------- 双臂 ----------
  drawBalanceArm(ctx, st)
  drawLanternArm(ctx, st)

  // ---------- 头（露发） ----------
  // 头比身体稳：跟随 sway 的 25%，纵向与 bob 反相（惯性）。
  const headDX = -swayX * 0.25 + Math.sin(phase - 0.8) * 0.55 * speed
  drawHead(ctx, { dx: headDX, dy: -g.bob * 0.20 }, st)

  // ---------- 提灯洒在衣摆上的暖光（灯是"在发光"的唯一证据） ----------
  drawLanternSpill(ctx, st)

  // ---------- 提灯 + 光晕（最前：画面里的第二光源） ----------
  drawLantern(ctx, st)

  ctx.restore()
}

/**
 * 飘带：围巾的两端被风从肩后吹出来。
 *
 * 为什么是这个元素（三条理由，都是功能性的）：
 *  ① 它是画面里唯一持续运动的暖色 —— 风、速度、失衡全靠它表达；
 *     康复训练需要的就是"我现在稳不稳"的即时反馈。
 *  ② 它把"旅人"的隐喻留下了（走长路的人），而没有任何医疗符号。
 *  ③ 逆光下飘带的边缘光和云海的风感是同一套语言，角色因此"在场景里"。
 *
 * 画法：一条 spine（脊柱线）+ 逐段递减的 lineWidth = 末端自然收细。
 * 分段 round cap 叠出来，不要一整条等宽的线（等宽 = 布条硬得像塑料）。
 * 波浪用两个频率的正弦叠加：低频是风，高频跟着步频；失衡时摆幅变大。
 */
function drawStreamers(ctx, st) {
  ;[-1, 1].forEach((side) => {
    // **起点在肩后（藏进大衣里），不是颈后**。
    // 上一版起点在颈后，飘带的第一段正好经过头的两侧下方 ——
    // 头两边各一条橙色 = 被读成"耳朵/触角"（恐怖排查里最后剩下的可疑点）。
    // 下移到肩后之后，飘带从腰线才露出来，明确是"肩后飘出来的围巾尾"。
    const p0 = { x: side * 5, y: -134 }
    // 风：低频摆动 + 步频抖动；失衡（flail）时摆幅变大 = "风更大"
    const w1 = Math.sin(st.t * 2.1 + side * 1.1) * (6.5 + st.speed * 4.5) + st.flail * 6.0 * side
    const w2 = Math.sin(st.t * 2.1 + side * 1.1 - 0.9) * (8.5 + st.speed * 6.5) + st.flail * 9.0 * side
    const w3 = Math.sin(st.phase * 2 + st.t * 1.7 + side * 0.6) * (5.0 + st.speed * 5.5) +
      st.flail * 7.0 * side

    // spine：从肩后伸出，微外扩后自然下垂
    const p1 = { x: side * 14 + w1 * 0.30, y: -126 + w1 * 0.08 }
    const p2 = { x: side * 22 + w2 * 0.50, y: -108 + w2 * 0.15 }
    const p3 = { x: side * 25 + w3 * 0.70, y: -90 + w3 * 0.22 }
    const p4 = { x: side * 24 + w3 * 0.90, y: -76 + w3 * 0.28 }
    const p5 = { x: side * 22 + w3 * 1.05, y: -66 + w3 * 0.32 }

    const seg = (a, b, c, lw, color) => {
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.quadraticCurveTo(b.x, b.y, c.x, c.y)
      ctx.lineWidth = lw
      ctx.lineCap = 'round'
      ctx.strokeStyle = color
      ctx.stroke()
    }

    // ① 暗面（下侧）
    ctx.save()
    ctx.translate(0, 2.0)
    seg(p0, p1, p2, 7.2, PALETTE.scarfDeep)
    seg(p2, p3, p4, 4.4, PALETTE.scarfDeep)
    seg(p4, p4, p5, 2.2, PALETTE.scarfDeep)
    ctx.restore()

    // ② 主面
    seg(p0, p1, p2, 7.4, PALETTE.scarf)
    seg(p2, p3, p4, 4.6, PALETTE.scarf)
    seg(p4, p4, p5, 2.2, PALETTE.scarf)

    // ③ 受光边
    ctx.save()
    ctx.globalAlpha = 0.6
    seg(p0, { x: p1.x, y: p1.y - 2.0 }, { x: p2.x, y: p2.y - 2.0 }, 2.0, PALETTE.scarfLight)
    seg(p2, { x: p3.x, y: p3.y - 1.6 }, { x: p4.x, y: p4.y - 1.6 }, 1.4, PALETTE.scarfLight)
    ctx.restore()
  })
}

/**
 * 腿 + 靴。腿比 Q 版长（48px），所以要画出膝盖：
 * 一条等宽的棍在 4.5 头身下会读成"两根筷子"。
 */
function drawLeg(ctx, hipX, foot, opts) {
  const back = !!(opts && opts.back)
  const lift = (opts && opts.lift) || 0
  const color = back ? PALETTE.pantsBack : PALETTE.pants
  // 膝盖：大腿/小腿的分界，抬脚时膝盖抬高
  const knee = {
    x: lerp(hipX, foot.x, 0.55) + (back ? 0.6 : -0.6) + lift * 1.2,
    y: lerp(BODY.legTopY, foot.y - 11, 0.55) - lift * 3.0
  }

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // 大腿粗、小腿细（两段分别画，膝盖处补圆盖住台阶）
  ctx.beginPath()
  ctx.moveTo(hipX, BODY.legTopY)
  ctx.lineTo(knee.x, knee.y)
  ctx.lineWidth = back ? 10.4 : 11.2
  ctx.strokeStyle = color
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(knee.x, knee.y)
  ctx.lineTo(foot.x, foot.y - 10)
  ctx.lineWidth = back ? 8.6 : 9.4
  ctx.strokeStyle = color
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(knee.x, knee.y, back ? 4.3 : 4.7, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()

  // 裤褶：膝盖下一道短折（一条腿有上下两段结构，不是一根棍）
  ctx.beginPath()
  ctx.moveTo(foot.x - 3.0, foot.y - 15)
  ctx.lineTo(foot.x + 3.0, foot.y - 16.5)
  ctx.lineWidth = 1.1
  ctx.strokeStyle = 'rgba(24,32,44,0.30)'
  ctx.stroke()
  ctx.restore()

  // 靴：抬脚时整体缩小（离镜头更远）
  ctx.save()
  ctx.translate(foot.x, foot.y)
  const ss = (back ? 0.95 : 1) * (1 - lift * 0.10)
  ctx.scale(ss, ss)
  roundRectPath(ctx, -6.6, -10, 13.2, 11.5, 4.6)
  ctx.fillStyle = back ? PALETTE.bootDeep : PALETTE.boot
  ctx.fill()
  // 翻边
  roundRectPath(ctx, -7.4, -12, 14.8, 4.8, 2.4)
  ctx.fillStyle = PALETTE.bootCuff
  ctx.fill()
  // 靴筒上的一道扣带：靴子有结构，才配得上上半身的精致度
  ctx.beginPath()
  ctx.moveTo(-6.2, -5.2)
  ctx.lineTo(6.2, -6.4)
  ctx.lineWidth = 1.6
  ctx.strokeStyle = 'rgba(24,20,16,0.45)'
  ctx.lineCap = 'round'
  ctx.stroke()
  // 鞋底：一层更深的底 + 一道被钢索反光照亮的亮边
  roundRectPath(ctx, -6.8, -1.6, 13.6, 3.4, 1.6)
  ctx.fillStyle = '#2E2924'
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(-6.0, -0.6)
  ctx.quadraticCurveTo(0, 1.0, 6.0, -0.6)
  ctx.lineWidth = 1.3
  ctx.strokeStyle = 'rgba(214,204,188,0.42)'
  ctx.lineCap = 'round'
  ctx.stroke()
  ctx.restore()
}

/**
 * 大衣：A 形，肩 → 收腰 → 下摆外扩。
 * 精致感来自四处层次：翻领、背缝、两道褶、下摆开合（内侧暗 + 反光边）。
 * 暗部一律用**冷灰紫**（云海的环境光），不用棕黑 —— 这是"在场景里"的关键。
 */
/**
 * 大衣轮廓。抽成函数是因为两处要用：
 * ① drawCoat 填充；② drawLanternSpill 用它 clip（暖光只能落在大衣上，
 * 不能溢到背景里）。灯不照亮衣服 = "灯是块黄色贴纸"。
 */
function coatPath(ctx, st) {
  const sh = BODY.shoulderHalf
  const shY = BODY.shoulderY
  const hem = BODY.hemHalf
  const hemY = BODY.hemY
  // 下摆滞后：布料跟不上身体的左右移动
  const hemSkew = -st.swayX * 0.5
  ctx.beginPath()
  ctx.moveTo(-sh, shY + 8)
  ctx.quadraticCurveTo(-sh - 2.0, shY + 1, -sh * 0.52, shY - 2)
  ctx.quadraticCurveTo(0, shY - 5, sh * 0.52, shY - 2)
  ctx.quadraticCurveTo(sh + 2.0, shY + 1, sh, shY + 8)
  // 右侧：先收到腰，再外扩到下摆
  ctx.quadraticCurveTo(sh * 1.10, BODY.waistY + 6, BODY.waistHalf, BODY.waistY)
  ctx.quadraticCurveTo(hem * 0.92, lerp(BODY.waistY, hemY, 0.55), hem + hemSkew, hemY - 2)
  // 下摆：带弧度（平直 = 箱子底）
  ctx.quadraticCurveTo(hemSkew * 0.6, hemY + 8, -hem + hemSkew, hemY - 2)
  ctx.quadraticCurveTo(-hem * 0.92, lerp(BODY.waistY, hemY, 0.55), -BODY.waistHalf, BODY.waistY)
  ctx.quadraticCurveTo(-sh * 1.10, BODY.waistY + 6, -sh, shY + 8)
  ctx.closePath()
}

/**
 * 提灯洒在衣摆上的暖光。
 * 中低调的统一光源里，提灯必须有"照亮了谁"的落点 —— 否则它只是一块黄色贴纸。
 * 用大衣轮廓 clip，光只落在衣服上，不会溢到背景。
 */
function drawLanternSpill(ctx, st) {
  // 光心压进大衣里一点（不是灯的坐标）：灯在轮廓外，光要"洒到"衣服上
  const x = BODY.shoulderHalf * 0.82 + 8
  const y = BODY.hookY + 34
  ctx.save()
  coatPath(ctx, st)
  ctx.clip()
  const g = ctx.createRadialGradient(x, y, 1, x, y, 46)
  g.addColorStop(0, 'rgba(255,210,148,0.54)')
  g.addColorStop(0.40, 'rgba(255,204,138,0.24)')
  g.addColorStop(1, 'rgba(255,202,136,0)')
  ctx.fillStyle = g
  ctx.fillRect(-BODY.hemHalf - 4, BODY.shoulderY - 4,
    (BODY.hemHalf + 4) * 2, BODY.hemY - BODY.shoulderY + 16)
  ctx.restore()
}

function drawCoat(ctx, st) {
  const sh = BODY.shoulderHalf
  const shY = BODY.shoulderY
  const hem = BODY.hemHalf
  const hemY = BODY.hemY
  const hemSkew = -st.swayX * 0.5

  // 主体：背光面。左上一小片受光，右下压到冷灰紫。
  coatPath(ctx, st)
  const g = ctx.createLinearGradient(-sh, shY, sh * 0.9, hemY)
  g.addColorStop(0, PALETTE.coatShade)
  g.addColorStop(0.28, PALETTE.coat)
  g.addColorStop(0.62, PALETTE.coatShadow)
  g.addColorStop(1, PALETTE.coatDeep)
  ctx.fillStyle = g
  ctx.fill()

  // ---------- 翻领：肩上一小片，深色 + 一道下缘 ----------
  ctx.beginPath()
  ctx.moveTo(-sh - 1.5, shY + 10)
  ctx.quadraticCurveTo(-sh - 2.5, shY + 1, -sh * 0.48, shY - 3)
  ctx.quadraticCurveTo(0, shY - 6, sh * 0.48, shY - 3)
  ctx.quadraticCurveTo(sh + 2.5, shY + 1, sh + 1.5, shY + 10)
  ctx.quadraticCurveTo(sh * 0.9, shY + 19, sh * 0.42, shY + 18)
  ctx.lineTo(-sh * 0.42, shY + 18)
  ctx.quadraticCurveTo(-sh * 0.9, shY + 19, -sh - 1.5, shY + 10)
  ctx.closePath()
  ctx.fillStyle = PALETTE.coatShade
  ctx.fill()
  // 领口弧（后领）
  ctx.beginPath()
  ctx.moveTo(-6.0, shY - 2)
  ctx.quadraticCurveTo(0, shY + 5, 6.0, shY - 2)
  ctx.lineWidth = 2.2
  ctx.strokeStyle = PALETTE.coatDeep
  ctx.lineCap = 'round'
  ctx.stroke()

  // ---------- 背缝 + 褶皱 ----------
  ctx.save()
  ctx.lineCap = 'round'
  // 背缝：贯穿的一竖（没有它，后背是一整块平色）
  ctx.beginPath()
  ctx.moveTo(hemSkew * 0.15, shY + 20)
  ctx.lineTo(hemSkew * 0.35, hemY - 8)
  ctx.lineWidth = 2.0
  ctx.strokeStyle = 'rgba(30,22,26,0.22)'
  ctx.stroke()
  // 两道褶：从腋下斜向腰线。粗而淡 = 柔和的凹槽；细而深 = 划痕。
  ;[-1, 1].forEach((sgn) => {
    ctx.beginPath()
    ctx.moveTo(sgn * 13.5, shY + 26)
    ctx.quadraticCurveTo(sgn * 12.0, BODY.waistY + 4, sgn * 11.4, BODY.waistY + 16)
    ctx.lineWidth = 3.0
    ctx.strokeStyle = 'rgba(34,24,28,0.18)'
    ctx.stroke()
    // 褶的受光边（布棱被天光照亮）
    ctx.beginPath()
    ctx.moveTo(sgn * 14.8, shY + 25)
    ctx.quadraticCurveTo(sgn * 13.3, BODY.waistY + 3, sgn * 12.7, BODY.waistY + 15)
    ctx.lineWidth = 1.2
    ctx.strokeStyle = PALETTE.rimSoft
    ctx.stroke()
  })
  ctx.restore()

  // ---------- 下摆：内侧暗（开合）+ 反光边 ----------
  ctx.beginPath()
  ctx.moveTo(-hem + hemSkew + 1.5, hemY - 1)
  ctx.quadraticCurveTo(hemSkew * 0.6, hemY + 7.5, hem + hemSkew - 1.5, hemY - 1)
  ctx.lineWidth = 5.0
  ctx.strokeStyle = 'rgba(38,28,32,0.42)'
  ctx.stroke()
  // 下摆外沿被下方云海的反光照亮（角色"站在云海上"的依据）
  ctx.beginPath()
  ctx.moveTo(-hem + hemSkew + 2.5, hemY + 0.5)
  ctx.quadraticCurveTo(hemSkew * 0.6, hemY + 8.5, hem + hemSkew - 2.5, hemY + 0.5)
  ctx.lineWidth = 2.2
  ctx.strokeStyle = 'rgba(226,196,160,0.34)'
  ctx.lineCap = 'round'
  ctx.stroke()

  // ---------- 逆光边缘：只描朝天的左轮廓（不描整圈） ----------
  ctx.beginPath()
  ctx.moveTo(-sh - 0.5, shY + 6)
  ctx.quadraticCurveTo(-sh * 1.10, BODY.waistY + 6, -BODY.waistHalf - 0.5, BODY.waistY)
  ctx.lineWidth = 2.4
  ctx.strokeStyle = PALETTE.rim
  ctx.lineCap = 'round'
  ctx.stroke()
}

/** 围巾：绕颈一圈。两端飘出去的部分在 drawStreamers 里（画在身体后面）。 */
function drawScarf(ctx, st) {
  // 上提 1px 贴住颈根：颈根不能露出浅色（会被瞥成"一张苍白的小脸"），
  // 由围巾 + 立领把这块包住。
  const y = BODY.neckTop + 2
  ctx.save()
  // 主体
  // 两端收窄到 ±9.5：上一版 ±13 会在头的两侧下方露出**两个亮橙色方块**，
  // 恐怖感排查里它俩是最像"露出的小脸"的部位。收窄并加粗下缘暗面之后，
  // 露在头外的只是窄窄一条围巾边。
  ctx.beginPath()
  ctx.moveTo(-9.5, y - 4)
  ctx.quadraticCurveTo(0, y - 9, 9.5, y - 4)
  ctx.quadraticCurveTo(11.0, y + 4, 8.6, y + 7)
  ctx.quadraticCurveTo(0, y + 11, -8.6, y + 7)
  ctx.quadraticCurveTo(-11.0, y + 4, -9.5, y - 4)
  ctx.closePath()
  ctx.fillStyle = PALETTE.scarf
  ctx.fill()
  // 下缘暗面（围巾有厚度）：加粗，把方块感压掉
  ctx.beginPath()
  ctx.moveTo(-8.8, y + 3)
  ctx.quadraticCurveTo(0, y + 10.5, 8.8, y + 3)
  ctx.lineWidth = 4.2
  ctx.strokeStyle = PALETTE.scarfDeep
  ctx.stroke()
  // 上缘受光
  ctx.beginPath()
  ctx.moveTo(-10.0, y - 3.5)
  ctx.quadraticCurveTo(0, y - 8, 10.0, y - 3.5)
  ctx.lineWidth = 1.8
  ctx.strokeStyle = PALETTE.rim
  ctx.lineCap = 'round'
  ctx.stroke()
  ctx.restore()
  void st
}

/**
 * 左臂（平衡手）：自然下垂、微微外张。
 * 失衡时向外向上抬 —— "张开手找平衡"是走钢丝的本能动作。
 */
function drawBalanceArm(ctx, st) {
  const shX = -BODY.shoulderHalf * 0.82
  const shY = BODY.shoulderY + 11
  const flail = st.flail
  // 手往回收：上一版外伸 9px 看起来像两根举着的棍子
  const handX = shX - 5.5 - flail * 8
  // 手抬高一点、手臂加粗：细长下垂的手臂是"黑暗人影"的读法之一
  const handY = BODY.hookY + 10 - flail * 13
  const elbowX = shX - 3.0 - flail * 3
  const elbowY = lerp(shY + 4, handY, 0.5)

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(shX, shY)
  ctx.lineTo(elbowX, elbowY)
  ctx.lineTo(handX, handY)
  ctx.lineWidth = 11.2
  ctx.strokeStyle = PALETTE.sleeveDark
  ctx.stroke()
  // 上缘受光
  ctx.beginPath()
  ctx.moveTo(shX, shY - 3.2)
  ctx.lineTo(elbowX + 0.5, elbowY - 3.2)
  ctx.lineWidth = 2.0
  ctx.strokeStyle = PALETTE.rimSoft
  ctx.stroke()

  // 手：加大 + 暖色 + 一道亮边。上一版是个 4px 的暗色圆点，
  // 在细手臂末端读成"枯爪"（恐怖排查里被点名）。
  ellipse(ctx, handX, handY, 4.8, 5.0)
  ctx.fillStyle = PALETTE.skinShade
  ctx.fill()
  ctx.beginPath()
  ctx.arc(handX, handY - 1.2, 4.6, Math.PI * 1.15, Math.PI * 1.85)
  ctx.lineWidth = 1.4
  ctx.strokeStyle = PALETTE.rim
  ctx.lineCap = 'round'
  ctx.stroke()
  ctx.restore()
}

/** 右臂（提灯臂）：向外下方伸出，把灯送出身体轮廓。 */
function drawLanternArm(ctx, st) {
  const shX = BODY.shoulderHalf * 0.82
  const shY = BODY.shoulderY + 11
  // 手随步态有极轻的摆，灯的摆动从这里出发
  const swing = Math.sin(st.phase - 0.7) * (0.7 + st.speed * 1.2)
  // 手往回收一点：上一版外伸 11.5px，手臂像举着的杆
  const handX = shX + 8.0 + swing
  const handY = BODY.hookY + 12
  const elbowX = shX + 4.0
  const elbowY = lerp(shY + 4, handY, 0.52)

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(shX, shY)
  ctx.lineTo(elbowX, elbowY)
  ctx.lineTo(handX, handY)
  // 不能和大衣同色：同色的手臂会和大衣糊成一片，放大看是"衣服上一块鼓包"。
  // 用专用 sleeve 色，比大衣主体暗一档但不偏橙。
  ctx.lineWidth = 11.6
  ctx.strokeStyle = PALETTE.sleeve
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(shX, shY - 3.2)
  ctx.lineTo(elbowX + 0.5, elbowY - 3.2)
  ctx.lineWidth = 2.2
  ctx.strokeStyle = PALETTE.rimSoft
  ctx.stroke()

  ellipse(ctx, handX, handY, 5.2, 5.4)
  ctx.fillStyle = PALETTE.skin
  ctx.fill()
  ctx.beginPath()
  ctx.arc(handX, handY - 1.4, 5.0, Math.PI * 1.15, Math.PI * 1.85)
  ctx.lineWidth = 1.5
  ctx.strokeStyle = PALETTE.rim
  ctx.lineCap = 'round'
  ctx.stroke()
  ctx.restore()
}

/**
 * 头（露发）。**没有兜帽** —— 一个圆球不管刷什么颜色都是几何体，
 * 这是 v6 被否的直接原因。换成头发之后，"精致感"有了载体：
 * 后脑大形 + 内部发丝层次 + 鬓角 + 低马尾 + 飞发 + 逆光边缘光。
 *
 * 三条硬规则：
 *   ① 不画脸、不露耳朵（会邀请人读表情）；
 *   ② 头发必须比大衣深（和"兜帽比斗篷深"同一条：亮圆顶 = 皮肤）；
 *   ③ 边缘光只在顶部和朝天的一侧，不描整圈（整圈 = 矢量描边 = AI 味）。
 */
function drawHead(ctx, o, st) {
  const cy = BODY.headCY
  const r = BODY.headR
  ctx.save()
  ctx.translate(o.dx || 0, o.dy || 0)

  // ---------- 后颈：**不露皮肤** ----------
  // 上一版为了让"这是个人"，在颈根露了 5px 肤色。恐怖感排查结论：
  // **头下面、深色躯干上面的一小块浅色，会被瞥成"一张苍白的小脸"或绷带** ——
  // 它反而成了最恐怖的部位。所以撤回：颈根由围巾和立领包住，
  // 只留一道头发压在衣领上的暗影。
  // "这是个人"改由三件事承担：暖栗发色 + 发夹 + 有轮廓的发型（不再是个正圆）。
  ctx.beginPath()
  ctx.moveTo(0, BODY.neckTop - 3)
  ctx.lineTo(0, BODY.neckBot + 1)
  ctx.lineWidth = 7.4
  ctx.lineCap = 'round'
  ctx.strokeStyle = PALETTE.hairDeep
  ctx.stroke()

  // ---------- 后脑大形（**不是正圆**） ----------
  // 正圆是"无脸人"最省力也最有效的载体：一个没有五官的完美圆形 = 空白的脸。
  // 打破它靠三处：顶部略平、两侧不对称（左比右鼓一点）、下发尾内收。
  const hg = ctx.createLinearGradient(0, cy - r, 0, cy + r)
  hg.addColorStop(0, PALETTE.hairLight)
  hg.addColorStop(0.40, PALETTE.hair)
  hg.addColorStop(1, PALETTE.hairDeep)
  hairPath(ctx, cy, r)
  ctx.fillStyle = hg
  ctx.fill()

  // ---------- 头顶一撮呆毛（短、粗、有弧度） ----------
  // 注意和之前删掉的"飞发"的区别：飞发是**细而亮**的线（读成虫须），
  // 呆毛是**粗而暗**的一撮（有面积的色块），是可爱的经典符号。
  ctx.beginPath()
  ctx.moveTo(r * 0.02, cy - r * 1.00)
  ctx.quadraticCurveTo(-r * 0.16, cy - r * 1.34, -r * 0.42, cy - r * 1.22)
  ctx.quadraticCurveTo(-r * 0.20, cy - r * 1.10, -r * 0.10, cy - r * 0.98)
  ctx.closePath()
  ctx.fillStyle = PALETTE.hair
  ctx.fill()

  // ---------- 暗面：左半一块（头发不是均匀的球） ----------
  ctx.save()
  hairPath(ctx, cy, r)
  ctx.clip()
  ctx.beginPath()
  ctx.moveTo(-r * 1.1, cy - r * 1.1)
  ctx.quadraticCurveTo(-r * 0.35, cy - r * 0.2, -r * 0.62, cy + r * 1.1)
  ctx.lineTo(-r * 1.1, cy + r * 1.1)
  ctx.closePath()
  // 暗面压到 0.32：上一版 0.55 的大块深色把半颗头吞掉，
  // 在"没有脸"的前提下，任何大面积阴影都会被读成"藏在暗处的东西"。
  ctx.fillStyle = PALETTE.hairDeep
  ctx.globalAlpha = 0.32
  ctx.fill()
  ctx.restore()

  // ---------- 发丝：从发旋向外散的三条弧 ----------
  // 这是"头发"和"圆球"在细节上的唯一差别，也是最便宜的精致感。
  ctx.save()
  ctx.lineCap = 'round'
  const strands = [
    [-0.42, -0.62, -0.95, -0.05, 2.6],
    [-0.10, -0.80, -0.60, 0.55, 2.2],
    [0.40, -0.70, 0.78, 0.30, 2.2]
  ]
  strands.forEach((s) => {
    ctx.beginPath()
    ctx.moveTo(r * s[0], cy + r * s[1])
    ctx.quadraticCurveTo(r * s[2], cy + r * s[3], r * (s[2] * 1.05), cy + r * 0.95)
    ctx.lineWidth = s[4]
    ctx.strokeStyle = PALETTE.hairLine
    ctx.globalAlpha = 0.55
    ctx.stroke()
  })
  ctx.restore()

  // ---------- 鬓角：两撇（头发压住耳朵的位置） ----------
  ;[-1, 1].forEach((sgn) => {
    ctx.beginPath()
    ctx.moveTo(sgn * r * 0.92, cy + r * 0.10)
    ctx.quadraticCurveTo(sgn * r * 1.02, cy + r * 0.55, sgn * r * 0.78, cy + r * 0.92)
    ctx.quadraticCurveTo(sgn * r * 0.72, cy + r * 0.45, sgn * r * 0.80, cy + r * 0.15)
    ctx.closePath()
    ctx.fillStyle = PALETTE.hairDeep
    ctx.fill()
  })

  // ---------- 发尾：两侧外翘的短发，不是颈后垂一束 ----------
  // 低马尾（颈后垂下的一束）在"背影 + 没有脸"的组合下读作
  // "头发后面藏着什么"，是恐怖感的直接来源。整束删掉，
  // 换成两侧外翘的发尾：有形状、不遮颈、读成"刚剪过的短发"。
  ;[-1, 1].forEach((sgn) => {
    ctx.beginPath()
    ctx.moveTo(sgn * r * 0.52, cy + r * 0.70)
    ctx.quadraticCurveTo(sgn * r * 0.98, cy + r * 0.94, sgn * r * 0.88, cy + r * 1.16)
    ctx.quadraticCurveTo(sgn * r * 0.56, cy + r * 1.00, sgn * r * 0.30, cy + r * 0.78)
    ctx.closePath()
    ctx.fillStyle = PALETTE.hairLight
    ctx.fill()
  })

  // ---------- 发夹：一小块亮色，**位置不能在侧脸中央** ----------
  // 上一版放在 (0.50r, +0.06r) —— 那正好是侧脸上"眼睛"的位置，
  // 于是一块亮色横条被读成"半睁的眼"。移到耳后下方（0.72r, +0.52r），
  // 那里是发尾，亮色读作装饰而不是器官。
  ctx.save()
  ctx.translate(r * 0.72, cy + r * 0.52)
  ctx.rotate(-0.30)
  roundRectPath(ctx, -3.0, -1.4, 6.0, 2.8, 1.4)
  ctx.fillStyle = PALETTE.clip
  ctx.fill()
  ctx.restore()

  // ---------- 头顶的逆光：用**柔光**，不是描弧 ----------
  // 描弧这条走过两版都不成立：一条沿头顶的亮线，不管多短都会被读成
  // "帽子的滚边"（上一版从 1.20π 描到 1.86π，再缩短到 1.30π~1.78π 还是帽檐）。
  // 线和面的区别就在这里：**线 = 帽檐，面 = 光落在头发上**。
  ctx.save()
  hairPath(ctx, cy, r)
  ctx.clip()
  const lit = ctx.createRadialGradient(-r * 0.18, cy - r * 0.92, 0.5, -r * 0.18, cy - r * 0.92, r * 1.15)
  lit.addColorStop(0, 'rgba(240,206,158,0.34)')
  lit.addColorStop(0.45, 'rgba(238,198,150,0.12)')
  lit.addColorStop(1, 'rgba(238,198,150,0)')
  ctx.fillStyle = lit
  ctx.fillRect(-r * 1.1, cy - r * 1.15, r * 2.2, r * 1.15)
  ctx.restore()

  // ---------- 飞发：整条删掉了 ----------
  // 试过两版（三根细长线 → 两根短弧），放大看都是"两根虫须"。
  // 深色头发上任何**细而亮**的线条都会读成触角，这不是参数问题，是元素错了。
  // 风的表达交给飘带就够了 —— 删掉之后头顶反而干净。

  ctx.restore()
}

/**
 * 头发轮廓。**刻意不是正圆**（见 drawHead 里的说明）。
 * 三处不对称：顶部略平、左侧比右侧鼓、下发尾内收。
 */
function hairPath(ctx, cy, r) {
  ctx.beginPath()
  ctx.moveTo(-r * 0.60, cy - r * 0.95)
  ctx.quadraticCurveTo(-r * 0.28, cy - r * 1.05, r * 0.04, cy - r * 1.04)
  ctx.quadraticCurveTo(r * 0.46, cy - r * 1.02, r * 0.80, cy - r * 0.82)
  // 右侧：外扩一点（后脑蓬）
  ctx.quadraticCurveTo(r * 1.08, cy - r * 0.34, r * 1.04, cy + r * 0.14)
  // 右下收到发尾
  ctx.quadraticCurveTo(r * 0.98, cy + r * 0.62, r * 0.70, cy + r * 0.94)
  ctx.quadraticCurveTo(r * 0.34, cy + r * 1.06, 0, cy + r * 1.02)
  // 左下：比右侧更鼓（不对称 = 不是几何体）
  ctx.quadraticCurveTo(-r * 0.44, cy + r * 1.02, -r * 0.80, cy + r * 0.84)
  ctx.quadraticCurveTo(-r * 1.06, cy + r * 0.48, -r * 1.10, cy - r * 0.12)
  ctx.quadraticCurveTo(-r * 1.12, cy - r * 0.64, -r * 0.60, cy - r * 0.95)
  ctx.closePath()
}

/**
 * 提灯：第二光源（第一光源是远处的太阳）。
 * 中低调下它不该抢戏 —— 尺寸比 v6 小，光晕更收；
 * 作用是照亮身侧一小块，让角色和"清晨"这件事不矛盾（灯是隐喻：引路）。
 */
function drawLantern(ctx, st) {
  // 与 drawLanternArm 同源的摆动公式（灯比手滞后一点 = 钟摆感）
  const swing = Math.sin(st.phase - 0.9) * (0.8 + st.speed * 1.4)
  // 与 drawLanternArm 同源：手在 shX+8，灯挂在手外侧一点点
  const x = BODY.shoulderHalf * 0.82 + 9.5 + swing
  const y = BODY.hookY + 28
  const tilt = Math.sin(st.phase - 0.9) * 0.07

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(tilt)

  // 光晕：两层，比 v6 更收（中低调）
  const halo = (rad, a0) => {
    const h = ctx.createRadialGradient(0, 7, 1, 0, 7, rad)
    h.addColorStop(0, 'rgba(255,201,120,' + a0 + ')')
    h.addColorStop(1, 'rgba(255,201,120,0)')
    ctx.beginPath()
    ctx.arc(0, 7, rad, 0, Math.PI * 2)
    ctx.fillStyle = h
    ctx.fill()
  }
  halo(20, 0.09)
  halo(11, 0.14)

  // 提梁
  ctx.beginPath()
  ctx.moveTo(-3.0, 1)
  ctx.quadraticCurveTo(-4.0, -5, 0, -6)
  ctx.quadraticCurveTo(4.0, -5, 3.0, 1)
  ctx.lineWidth = 1.5
  ctx.lineCap = 'round'
  ctx.strokeStyle = PALETTE.brassDark
  ctx.stroke()

  // 灯体（本地原点 = 顶盖左上角）
  roundRectPath(ctx, -4.6, 0, 9.2, 3.8, 1.8)
  ctx.fillStyle = PALETTE.brass
  ctx.fill()
  const gg = ctx.createLinearGradient(0, 3.5, 0, 13)
  gg.addColorStop(0, PALETTE.flame)
  gg.addColorStop(0.5, PALETTE.glass)
  gg.addColorStop(1, '#E8A85C')
  roundRectPath(ctx, -3.5, 3.8, 7.0, 9.6, 2.2)
  ctx.fillStyle = gg
  ctx.fill()
  ctx.lineWidth = 1.2
  ctx.strokeStyle = PALETTE.brassDark
  ctx.beginPath()
  ctx.moveTo(-1.7, 4.2)
  ctx.lineTo(-1.7, 13)
  ctx.moveTo(1.7, 4.2)
  ctx.lineTo(1.7, 13)
  ctx.stroke()
  roundRectPath(ctx, -5.2, 13.4, 10.4, 4.2, 2)
  ctx.fillStyle = PALETTE.brass
  ctx.fill()
  // 焰芯
  ellipse(ctx, 0, 8.6, 1.6, 2.1)
  ctx.fillStyle = 'rgba(255,253,242,0.92)'
  ctx.fill()
  halo(7, 0.16)

  ctx.restore()
}

module.exports = {
  drawWalker,
  gait,
  beltWorld,
  headWorld,
  PALETTE,
  BODY
}
