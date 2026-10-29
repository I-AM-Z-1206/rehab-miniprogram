// ============================================================================
// tools/scene2d-test.js —— 2.5D 场景渲染自检
// ----------------------------------------------------------------------------
// 为什么需要这一套：
//   引擎的画面现在由一个独立的绘制模块（pkgShoot/games/shoot/scene2d.js）负责，
//   它没有逻辑、没有状态机，坏了也不会让玩法测试变红 —— 画面静默变丑/变空，
//   只有真机才看得出来。这里用「假 ctx」把每一层都真跑一遍，钉住三件事：
//
//   1. 不崩：任意尺寸 / 任意画质档 / 任意状态组合下，所有绘制函数都能跑完；
//   2. 不脏：传给 canvas 的坐标必须是有限数（NaN 会让整块画布静默空白）；
//   3. 不越界：保持区光柱的左右边界必须等于 keepHalfPx()，
//      否则患者看到的「范围」和实际判定不一致 —— 这是医疗类产品的红线。
//
// 另外守住「不依赖 WebGL / 不 require three」：2.5D 就是为了绕开真机 WebGL 才做的，
// 一旦有人往这个文件里塞 gl 相关调用，这里立刻红。
// ============================================================================

/* eslint-disable no-console */

const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const scene = require(path.join(ROOT, 'pkgShoot/games/shoot/scene2d.js'))

let pass = 0
let fail = 0
const fails = []

function ok(cond, msg) {
  if (cond) {
    pass += 1
  } else {
    fail += 1
    fails.push(msg)
    console.log('  ✗ ' + msg)
  }
}

function eq(actual, expected, msg) {
  ok(actual === expected, msg + '（期望 ' + expected + '，实际 ' + actual + '）')
}

function near(actual, expected, tol, msg) {
  ok(Math.abs(actual - expected) <= tol, msg + '（期望 ' + expected + '±' + tol + '，实际 ' + actual + '）')
}

// ---------------------------------------------------------------------------
// 假 Canvas 2D 上下文：只记录调用，不真的画
// ---------------------------------------------------------------------------
function makeCtx() {
  const calls = []
  const bad = []

  const record = (type) => (...args) => {
    // 所有数值参数都必须是有限数，NaN / Infinity 画不出东西还难查
    for (let i = 0; i < args.length; i++) {
      const a = args[i]
      if (typeof a === 'number' && !isFinite(a)) {
        bad.push(type + ' 参数[' + i + '] = ' + a)
      }
    }
    calls.push({ type: type, args: args })
    return ctx
  }

  const gradient = (kind) => ({
    __kind: kind,
    addColorStop(off, color) {
      if (!isFinite(off) || off < 0 || off > 1) bad.push(kind + '.addColorStop offset=' + off)
      if (typeof color !== 'string' || !color) bad.push(kind + '.addColorStop color=' + color)
    }
  })

  const ctx = {
    calls: calls,
    bad: bad,
    canvas: { width: 390, height: 600 },
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineDashOffset: 0,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '10px sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic'
  }

  const methods = [
    'save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo',
    'rect', 'fill', 'stroke', 'clip', 'fillRect', 'strokeRect', 'clearRect',
    'translate', 'rotate', 'scale', 'setTransform', 'transform',
    'fillText', 'strokeText', 'drawImage', 'setLineDash', 'measureText',
    'quadraticCurveTo', 'bezierCurveTo', 'ellipse'
  ]
  for (let i = 0; i < methods.length; i++) ctx[methods[i]] = record(methods[i])

  ctx.createLinearGradient = (...a) => {
    record('createLinearGradient')(...a)
    return gradient('linear')
  }
  ctx.createRadialGradient = (...a) => {
    record('createRadialGradient')(...a)
    // 半径为负会直接抛错，这里也记一笔
    for (let i = 2; i < a.length; i += 3) {
      if (a[i] < 0) bad.push('radial 半径为负: ' + a[i])
    }
    return gradient('radial')
  }
  ctx.measureText = (t) => {
    record('measureText')(t)
    return { width: String(t).length * 7 }
  }

  return ctx
}

// ---------------------------------------------------------------------------
// 1. buildScene 的形状
// ---------------------------------------------------------------------------
console.log('\n[1] buildScene')
{
  const sc = scene.buildScene(390, 600, 2)
  ok(!!sc, '返回场景对象')
  eq(typeof sc.horizonY, 'number', '有地平线 y')
  near(sc.horizonY, 600 * scene.HORIZON_RATIO, 0.001, '地平线按 HORIZON_RATIO 计算')
  ok(sc.stars.length > 10, '星点数量合理（' + sc.stars.length + '）')
  // 星云从 3 团纯色圆改成 2 团「双圆叠加」：形状不再是完美圆形。
  ok(sc.nebula.length === 2, '星云 2 团')
  let blobOk = true
  for (let i = 0; i < sc.nebula.length; i++) {
    const n = sc.nebula[i]
    if (!n.blobs || n.blobs.length !== 2) blobOk = false
    else if (!(n.blobs[0].r > 0) || !(n.blobs[1].r > 0)) blobOk = false
  }
  ok(blobOk, '每团星云由 2 个偏移圆组成（避免完美圆形）')
  // 颗粒：去「矢量完美感」的唯一手段，必须真的有数据
  ok(sc.grain && sc.grain.length === 4, '颗粒有 4 帧')
  ok(sc.grain[0].dark.length > 0 && sc.grain[0].light.length > 0, '颗粒同时有压暗与提亮点')
  ok(scene.buildScene(390, 600, 0).grain.length === 0, '画质 0 不生成颗粒')
  ok(sc.dust.length > 0, '地面浮尘非空')
  ok(!!sc.planet && sc.planet.r > 0, '行星半径为正')

  // 星点必须在画面内，否则会白白计算
  let outside = 0
  for (let i = 0; i < sc.stars.length; i++) {
    const s = sc.stars[i]
    if (s.x < 0 || s.x > 390 || s.y < 0 || s.y > 600) outside += 1
  }
  eq(outside, 0, '所有星点初始位置都在画面内')

  // 画质档：低档必须更省（星星、浮尘更少）
  const lo = scene.buildScene(390, 600, 0)
  const mid = scene.buildScene(390, 600, 1)
  ok(lo.stars.length < mid.stars.length, '画质 0 的星点少于画质 1')
  ok(mid.stars.length < sc.stars.length, '画质 1 的星点少于画质 2')
  ok(lo.dust.length < sc.dust.length, '画质 0 的浮尘少于画质 2')

  // 极端尺寸不能崩、不能产生 NaN
  const sizes = [[160, 200], [320, 480], [390, 844], [768, 1024], [200, 1200]]
  for (let i = 0; i < sizes.length; i++) {
    const s2 = scene.buildScene(sizes[i][0], sizes[i][1], 2)
    ok(!!s2 && isFinite(s2.horizonY), sizes[i].join('x') + ' 能建场景')
  }
}

// ---------------------------------------------------------------------------
// 2. 每一层都能真跑（任意尺寸 × 任意画质 × 任意时间）
// ---------------------------------------------------------------------------
console.log('\n[2] 各层绘制不崩、不产生 NaN')
{
  const sizes = [[160, 200], [320, 480], [390, 600], [390, 844], [768, 1024]]
  const times = [0, 0.5, 3.7, 61.3, 3600.5]
  let combos = 0

  for (let si = 0; si < sizes.length; si++) {
    const W = sizes[si][0]
    const H = sizes[si][1]
    for (let q = 0; q <= 2; q++) {
      const sc = scene.buildScene(W, H, q)
      for (let ti = 0; ti < times.length; ti++) {
        const t = times[ti]
        const ctx = makeCtx()
        const o = {
          cx: W / 2,
          w: W,
          h: H,
          half: W * 0.18,
          top: 80,
          bottom: H * 0.87 - 30,
          inZone: ti % 2 === 0,
          t: t,
          quality: q
        }
        try {
          scene.drawSky(ctx, sc, { t: t })
          scene.drawNebula(ctx, sc, t)
          scene.drawStars(ctx, sc, t)
          scene.drawPlanet(ctx, sc, t)
          scene.drawRidge(ctx, sc)
          scene.drawGround(ctx, sc, { cx: o.cx, t: t, quality: q })
          scene.drawFloorPath(ctx, sc, o)
          scene.drawKeepPillar(ctx, o)
          scene.drawFloorGlow(ctx, sc, o)
          scene.drawShock(ctx, o.cx, H * 0.4, 0.35, 'rgba(190,255,240,1)')
          scene.drawVignette(ctx, sc)
          scene.drawGrain(ctx, sc, t)
          scene.softShadow(ctx, o.cx, o.bottom, 20, 6, 0.4)
          scene.fillEllipse(ctx, o.cx, o.bottom, 20, 6, 'rgba(0,0,0,.2)')
          scene.ringEllipse(ctx, o.cx, o.bottom, 20, 6, 'rgba(0,0,0,.2)', 1)
        } catch (e) {
          ok(false, W + 'x' + H + ' q=' + q + ' t=' + t + ' 抛错：' + e.message)
        }
        combos += 1
        if (ctx.bad.length) {
          ok(false, W + 'x' + H + ' q=' + q + ' t=' + t + ' 出现非法数值：' + ctx.bad.slice(0, 3).join(', '))
        }
        if (!ctx.calls.length) {
          ok(false, W + 'x' + H + ' q=' + q + ' 一次绘制都没有')
        }
      }
    }
  }
  ok(combos === sizes.length * 3 * times.length, '跑完 ' + combos + ' 种尺寸/画质/时间组合')
}

// ---------------------------------------------------------------------------
// 3. 保持区边界必须等于 keepHalfPx()（医疗产品的红线）
// ---------------------------------------------------------------------------
console.log('\n[3] 保持区边界与判定一致')
{
  const W = 390
  const H = 600
  const half = 55.5
  const ctx = makeCtx()
  const sc = scene.buildScene(W, H, 2)
  scene.drawKeepPillar(ctx, {
    cx: W / 2,
    half: half,
    top: 80,
    bottom: H * 0.87 - 30,
    inZone: true,
    t: 1.2
  })

  // 主体：28 段纵向包络填充，每一段的宽度都必须是 half * 2
  // （原来是单块矩形，改成包络后没有「一块」了，但契约没变：
  //   整个纵向范围必须严丝合缝地卡在 [top, bottom] 里，左右边界不许偏）
  const fills = ctx.calls.filter((c) => c.type === 'fillRect')
  const body = fills.filter((c) => Math.abs(c.args[2] - half * 2) < 0.01)
  ok(body.length >= 8, '光柱主体由多段包络填充（' + body.length + ' 段）')
  if (body.length) {
    let topY = Infinity
    let botY = -Infinity
    let aligned = true
    for (let i = 0; i < body.length; i++) {
      const y = body[i].args[1]
      const h = body[i].args[3]
      if (y < topY) topY = y
      if (y + h > botY) botY = y + h
      if (Math.abs(body[i].args[0] - (W / 2 - half)) > 0.01) aligned = false
    }
    near(topY, 80, 0.01, '光柱主体从 top 开始')
    ok(botY >= H * 0.87 - 30 - 1.5, '光柱主体铺到 bottom（' + botY.toFixed(1) + '）')
    ok(aligned, '每一段的左边界都严格等于 cx - half')
  }

  // 边界从 v3 起不是折线，而是「光刃」（横向渐变填充）。
  // 契约不变：光刃的内侧端点必须严格落在 cx ± half 上 ——
  // 患者看到的边界就是判定边界，一个像素都不许偏。
  // （左刃覆盖 [left-BL, left]，右刃覆盖 [right, right+BL]）
  let edgeLeft = 0
  let edgeRight = 0
  for (let i = 0; i < fills.length; i++) {
    const fx = fills[i].args[0]
    const fw = fills[i].args[2]
    if (Math.abs(fx + fw - (W / 2 - half)) < 0.01) edgeLeft += 1
    if (Math.abs(fx - (W / 2 + half)) < 0.01) edgeRight += 1
  }
  ok(edgeLeft >= 10, '左边界光刃内侧端点严格 = cx - half（' + edgeLeft + ' 段）')
  ok(edgeRight >= 10, '右边界光刃内侧端点严格 = cx + half（' + edgeRight + ' 段）')
}

// ---------------------------------------------------------------------------
// 3b. 地面通道的接地边界也必须等于判定宽度
// ---------------------------------------------------------------------------
// 光柱是「墙」，通道是「地」：患者在地面上看到的这条通道，就是他实际的活动范围。
// 近端放宽一像素都是错的；远端必须收窄，否则通道退化成矩形，等于没做纵深。
console.log('\n[3b] 地面通道接地边界 = 判定宽度')
{
  const W = 390
  const H = 600
  const half = 55.5
  const bottom = H * 0.87 - 30
  const ctx = makeCtx()
  const sc = scene.buildScene(W, H, 2)
  scene.drawFloorPath(ctx, sc, { cx: W / 2, half: half, bottom: bottom, inZone: true })

  const pts = ctx.calls.filter((c) => c.type === 'moveTo' || c.type === 'lineTo')
  const at = (x, y) => pts.some((p) => Math.abs(p.args[0] - x) < 0.01 && Math.abs(p.args[1] - y) < 0.01)
  ok(at(W / 2 - half, bottom), '近端左顶点 = cx - half')
  ok(at(W / 2 + half, bottom), '近端右顶点 = cx + half')
  ok(ctx.calls.some((c) => c.type === 'fill' || c.type === 'fillRect'), '通道主体有填充')

  const farPts = pts.filter((p) => Math.abs(p.args[1] - (sc.horizonY + 3)) < 0.01)
  ok(farPts.length >= 2, '远端顶点落在消失点附近（' + farPts.length + ' 个）')
  const farHalf = farPts.length ? Math.abs(farPts[0].args[0] - W / 2) : 0
  ok(farHalf > 0 && farHalf < half * 0.4,
    '远端明显收窄（' + farHalf.toFixed(2) + '）')

  // 极端输入不能崩：half 为 0 / 负、bottom 高过地平线
  let threw = 0
  ;[
    { cx: W / 2, half: 0, bottom: bottom, inZone: true },
    { cx: W / 2, half: -10, bottom: bottom, inZone: false },
    { cx: W / 2, half: half, bottom: sc.horizonY - 50, inZone: true }
  ].forEach((o2) => {
    try { scene.drawFloorPath(makeCtx(), sc, o2) } catch (e) { threw += 1 }
  })
  eq(threw, 0, '非法参数时静默跳过而不抛错')
}

// ---------------------------------------------------------------------------
// 3c. 子弹纵深：只改绘制，判定半径不动
// ---------------------------------------------------------------------------
console.log('\n[3c] 子弹纵深')
{
  const { BulletSystem } = require(path.join(ROOT, 'pkgShoot/games/shoot/bullet.js'))
  const cfg = { get: (k) => ({ bulletSpeed: 760, spreadDeg: 0 }[k]) }
  const bs = new BulletSystem(cfg, { width: 390, height: 600 })
  bs.setDepthRange(520, 240)
  const b = bs.fire(195, 520)

  eq(b.k, 1, '出膛时缩放为 1')
  eq(b.r, 3.4, 'bullet.r 保持 3.4（HitDetector 不看它，但别让人误以为缩了）')

  let prev = b.k
  let monotonic = true
  let minK = 1
  let minA = 1
  for (let i = 0; i < 40 && b.alive; i++) {
    bs.update(1 / 60)
    if (b.k > prev + 1e-9) monotonic = false
    prev = b.k
    if (b.k < minK) minK = b.k
    if (b.a < minA) minA = b.a
  }
  ok(monotonic, '飞行过程中缩放单调不增')
  ok(minK >= 0.44 && minK <= 0.46, '飞到目标处缩到 0.45 附近（实测 ' + minK.toFixed(3) + '）')
  ok(minA > 0.7 && minA <= 1, '透明度只轻微衰减（实测 ' + minA.toFixed(3) + '），不能淡到看不见')

  // 参考面没设 / 退化时不能出现 NaN 或 0 尺寸
  const bs2 = new BulletSystem(cfg, { width: 390, height: 600 })
  const b2 = bs2.fire(10, 500)
  bs2.update(1 / 60)
  ok(isFinite(b2.k) && b2.k > 0, '未设置参考面时缩放仍是有限正数（' + b2.k + '）')
}

// ---------------------------------------------------------------------------
// 3d. 背景视差横移后，地平线不能露缝
// ---------------------------------------------------------------------------
// 引擎用 ctx.translate(parallax, 0) 把星 / 行星 / 山脊整体横移最多 ±2% 屏宽。
// 山脊是唯一一条「贴满整宽」的图层：如果它只画 0..w，平移后必有一侧空出
// 几像素，在纯色天空上就是一条清晰的竖线。这里断言它两侧都超扫够了。
console.log('\n[3d] 背景视差平移后不露缝')
{
  const widths = [320, 375, 390, 430]
  for (let i = 0; i < widths.length; i++) {
    const W = widths[i]
    const H = 700
    const ctx = makeCtx()
    const sc = scene.buildScene(W, H)
    scene.drawRidge(ctx, sc)
    const xs = ctx.calls.filter((c) => c.type === 'lineTo').map((c) => c.args[0])
    ok(xs.length > 0, W + ' 宽：山脊有路径点')
    const minX = Math.min.apply(null, xs)
    const maxX = Math.max.apply(null, xs)
    // 引擎里 parallax 被 clamp 到 ±w*0.02，超扫必须盖住这个量。
    const need = W * 0.02
    ok(minX <= -need, W + ' 宽：左侧超扫 ≥ ' + need.toFixed(1) + 'px（实际 ' + minX.toFixed(1) + '）')
    ok(maxX >= W + need, W + ' 宽：右侧超扫 ≥ ' + need.toFixed(1) + 'px（实际 ' + (maxX - W).toFixed(1) + '）')
    // 超扫也不能无限大：多画太多会白费填充
    ok(minX > -W * 0.2 && maxX < W * 1.2, W + ' 宽：超扫没有过量')
  }
}

// ---------------------------------------------------------------------------
// 3e. 城市灯火：整局的成果条
// ---------------------------------------------------------------------------
// 「点亮一座城」的核心数据。三件事必须成立：
//   ① 点亮顺序 = 从屏幕中心向外（光从中间长出来，不是随机的杂点）；
//   ② 灯在地平线以上（画到地面上就成了地板贴纸）；
//   ③ light 越大画得越多 —— 这是全游戏唯一的「进度可视化」，
//      它坏了，患者就只剩一个看不懂的分数。
console.log('\n[3e] 城市灯火')
{
  const W = 390
  const H = 600
  const sc = scene.buildScene(W, H, 2)
  ok(Array.isArray(sc.lamps) && sc.lamps.length >= 40,
    '灯数够撑一局（' + (sc.lamps ? sc.lamps.length : 0) + ' 盏）')

  // ① 点亮顺序：d 单调不减
  let sorted = true
  for (let i = 1; i < sc.lamps.length; i++) {
    if (sc.lamps[i].d < sc.lamps[i - 1].d - 1e-9) sorted = false
  }
  ok(sorted, '按「离屏幕中心距离」升序 —— 光从中间向外长，不是随机亮')

  // ② 全部在地平线以上
  let above = true
  for (let i = 0; i < sc.lamps.length; i++) {
    if (sc.horizonY - sc.lamps[i].ny * W > sc.horizonY + 0.01) above = false
    if (!isFinite(sc.lamps[i].nx) || !isFinite(sc.lamps[i].ny)) above = false
  }
  ok(above, '所有灯都在地平线以上，且坐标有限')

  // ③ light 越大画得越多
  const c0 = makeCtx()
  scene.drawCityLights(c0, sc, 0, 1.0)
  const n0 = c0.calls.length
  const c1 = makeCtx()
  scene.drawCityLights(c1, sc, 1, 1.0)
  const n1 = c1.calls.length
  ok(n0 <= 4, 'light=0 时几乎不画（' + n0 + ' 次调用）')
  ok(n1 > n0 + 30, 'light=1 时点亮整座城（' + n0 + ' → ' + n1 + ' 次调用）')

  // 半亮：应该落在两者之间，且不能闪（同 light / 同 t 必须一致）
  const c2 = makeCtx()
  scene.drawCityLights(c2, sc, 0.6, 2.0)
  const c3 = makeCtx()
  scene.drawCityLights(c3, sc, 0.6, 2.0)
  ok(c2.calls.length > n0 && c2.calls.length < n1,
    'half 亮度落在中间（' + c2.calls.length + ' 次）')
  eq(JSON.stringify(c2.calls), JSON.stringify(c3.calls), '同一 light / 同一 t 绘制完全一致')
  ok(c2.bad.length === 0, '没有 NaN / Infinity 坐标')
}

// ---------------------------------------------------------------------------
// 4. 不依赖 WebGL / three（2.5D 的存在意义）
// ---------------------------------------------------------------------------
console.log('\n[4] 不依赖 WebGL / three')
{
  const fs = require('fs')
  const src = fs.readFileSync(path.join(ROOT, 'pkgShoot/games/shoot/scene2d.js'), 'utf-8')
  // 去掉所有注释后再检查：注释里出现这些词是允许的（文件头正是在解释「为什么不用 WebGL」）
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .filter(function (l) { return l.trim().indexOf('//') !== 0 })
    .map(function (l) { return l.split('//')[0] })
    .join('\n')

  const banned = ['three', 'WebGL', 'webgl', 'requestAnimationFrame', 'document.', 'window.', 'wx.']
  for (let i = 0; i < banned.length; i++) {
    ok(code.indexOf(banned[i]) < 0, '代码里没有引用 ' + banned[i])
  }

  // 只应该导出这些绘制函数
  const keys = Object.keys(scene).sort()
  const allowed = [
    'HORIZON_RATIO', 'buildScene', 'drawCityLights', 'drawFloorGlow', 'drawFloorPath',
    'drawGrain', 'drawGround',
    'drawKeepPillar', 'drawNebula', 'drawPlanet', 'drawRidge', 'drawShock', 'drawSky',
    'drawStars', 'drawVignette', 'fillEllipse', 'ringEllipse', 'softShadow'
  ]
  eq(keys.join(','), allowed.join(','), '导出接口与约定一致')
}

// ---------------------------------------------------------------------------
// 5. 引擎渲染真跑
// ---------------------------------------------------------------------------
// scene2d 只是「画什么」，真正把各层拼起来的是 engine.render()。
// 引擎里改动最多的是 _drawMonster / _drawPlayer / _drawHud，光测 scene2d 抓不到。
console.log('\n[5] 引擎渲染真跑')
{
  const store = {}
  global.wx = {
    getStorageSync: (k) => (k in store ? store[k] : ''),
    setStorageSync: (k, v) => { store[k] = v },
    removeStorageSync: (k) => { delete store[k] },
    getWindowInfo: () => ({ windowWidth: 390, windowHeight: 600, pixelRatio: 2 }),
    getSystemInfoSync: () => ({ windowWidth: 390, windowHeight: 600, pixelRatio: 2 }),
    createInnerAudioContext: () => ({
      play() {}, pause() {}, stop() {}, seek() {}, destroy() {},
      onEnded() {}, onError() {}, onPlay() {}, onStop() {},
      offEnded() {}, offError() {}
    }),
    showToast() {}, vibrateShort() {}, nextTick: (fn) => fn()
  }

  const { getStore } = require(path.join(ROOT, 'pkgShoot/games/shoot/config.js'))
  const { GameEngine } = require(path.join(ROOT, 'pkgShoot/games/shoot/engine.js'))

  const states = ['ready', 'running', 'paused', 'ended']
  for (let i = 0; i < states.length; i++) {
    const st = states[i]
    const ctx = makeCtx()
    const cfg = getStore()
    let engine = null
    try {
      engine = new GameEngine({
        canvas: null,
        ctx: ctx,
        width: 390,
        height: 600,
        dpr: 2,
        cfg: cfg,
        handlers: { onState() {}, onEvent() {} }
      })
      if (st !== 'ready') {
        engine.start()
        for (let f = 0; f < 90; f++) {
          engine.feedSensor({ pitch: 2, roll: 0 })
          engine.update(1 / 60, 1000 + f * 16.7)
        }
        if (st === 'paused') engine.pause()
        if (st === 'ended') engine._end()
      }
      ctx.calls.length = 0
      ctx.bad.length = 0
      engine.render()
      ok(ctx.calls.length > 40, st + ' 状态渲染出了内容（' + ctx.calls.length + ' 次调用）')
      ok(ctx.bad.length === 0, st + ' 状态没有非法坐标' + (ctx.bad.length ? '：' + ctx.bad.slice(0, 3).join(', ') : ''))
      // 背景层必须画过：天空渐变 + 地面网格
      ok(ctx.calls.some((c) => c.type === 'createLinearGradient'), st + ' 状态有渐变绘制（天空/地面）')
      ok(engine.scene && engine.scene.stars.length > 0, st + ' 状态持有场景状态')
    } catch (e) {
      ok(false, st + ' 状态渲染抛错：' + e.message + '\n' + (e.stack || '').split('\n')[1])
    } finally {
      if (engine) engine.destroy()
    }
  }

  // 怪物被击中后要闪白 + 出现冲击波
  {
    const ctx = makeCtx()
    const cfg = getStore()
    const engine = new GameEngine({
      canvas: null, ctx: ctx, width: 390, height: 600, dpr: 2, cfg: cfg,
      handlers: { onState() {}, onEvent() {} }
    })
    engine.start()
    for (let f = 0; f < 240; f++) {
      engine.feedSensor({ pitch: 0, roll: 0 })
      engine.update(1 / 60, 1000 + f * 16.7)
    }
    ok(engine.shocks.length >= 0, '冲击波数组存在')
    ok(engine.zoom >= 0 && engine.zoom <= 0.03, '镜头推拉在允许范围内（' + engine.zoom.toFixed(4) + '）')
    engine.render()
    ok(ctx.bad.length === 0, '命中后渲染没有非法坐标')
    engine.destroy()
  }
}

// ---------------------------------------------------------------------------
console.log('\n' + '-'.repeat(48))
if (fail) {
  console.log('未通过：' + fail + ' 项失败，' + pass + ' 项通过')
  fails.forEach((f) => console.log('  · ' + f))
  process.exitCode = 1
} else {
  console.log('全部通过（' + pass + ' 项）')
}
