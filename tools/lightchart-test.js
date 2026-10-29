// ============================================================================
// tools/lightchart-test.js —— lightchart 图表自检（LineChart / ScatterChart）
// ----------------------------------------------------------------------------
// 重点锁住一条容易被「顺手优化」破坏的设计：
//   ScatterChart 的两轴共用同一个 px/度 比例。
// 理由：康复上看的就是「横向晃得多还是纵向晃得多」。一旦改成各自独立缩放
//   （让点云填满画布），两个方向的抖动就不可比了，这个图会直接失去意义。
//
// 所以这里断言：给定同一份数据，宽画布和窄画布画出来的点，
// 其「x 方向的度→像素」与「y 方向的度→像素」必须相等。
//
// 用法：node tools/lightchart-test.js
//       已并入 npm test（tools/run-all.js）
// ============================================================================

const { ScatterChart, LineChart, scatterStats } = require('../utils/lightchart.js')

let passed = 0
let failed = 0

function check(name, cond, detail) {
  if (cond) {
    passed += 1
    console.log('  ok  ' + name)
  } else {
    failed += 1
    console.log('  FAIL ' + name + (detail !== undefined ? '  → ' + detail : ''))
  }
}

// ---------------------------------------------------------------------------
// Mock Canvas 2D —— 记录绘制指令而不真画
// ---------------------------------------------------------------------------
function makeCtx() {
  const stash = []
  const ctx = {
    _calls: stash,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    globalAlpha: 1,
    setTransform() {},
    clearRect() {},
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fill() {},
    clip() {},
    setLineDash() {},
    rect() {},
    fillText(t) { stash.push({ op: 'fillText', text: String(t) }) },
    strokeRect(x, y, w, h) { stash.push({ op: 'strokeRect', x, y, w, h }) },
    arc(x, y, r) { stash.push({ op: 'arc', x, y, r }) }
  }
  return ctx
}

function makeCanvas() {
  const ctx = makeCtx()
  return { getContext: () => ctx, width: 0, height: 0, _ctx: ctx }
}

// 造一份同心圆采样：均值在 (0.5, -0.3)，半径最大 1.6
function ringSamples(n, cx, cy, maxR) {
  const out = []
  for (let i = 0; i < n; i++) {
    const a = (i * 2.399963) % (Math.PI * 2)
    const mag = Math.sqrt(i / n) * maxR
    out.push({ r: cx + Math.cos(a) * mag, p: cy + Math.sin(a) * mag })
  }
  return out
}

console.log('=== lightchart 自检 ===')
console.log('')

// ---------------------------------------------------------------------------
console.log('-- scatterStats 统计 --')
{
  const s = scatterStats(ringSamples(500, 0.5, -0.3, 1.6))
  check('样本数正确', s.n === 500, s.n)
  check('均值 roll ≈ 0.5', Math.abs(s.meanR - 0.5) < 0.02, s.meanR)
  check('均值 pitch ≈ -0.3', Math.abs(s.meanP + 0.3) < 0.02, s.meanP)
  // 圆盘均匀分布的理论标准差 = maxR / 2
  check('标准差 ≈ 0.8（理论值 maxR/2）', Math.abs(s.sdR - 0.8) < 0.05, s.sdR.toFixed(3))
  check('maxShake 取两轴较大者', Math.abs(s.maxShake - Math.max(s.sdR, s.sdP)) < 1e-9, s.maxShake)
  check('极差 spreadR ≈ 3.2', Math.abs(s.spreadR - 3.2) < 0.1, s.spreadR.toFixed(3))
}

console.log('')
console.log('-- 脏数据过滤 --')
{
  const empty = scatterStats([])
  check('空数组 n = 0', empty.n === 0, empty.n)
  check('空数组均值为 null', empty.meanR === null && empty.meanP === null)

  const dirty = scatterStats([{ r: 1, p: 2 }, { r: NaN, p: 1 }, { r: null, p: null },
    { r: 3, p: 4 }, undefined, { r: Infinity, p: 1 }])
  check('NaN / null / undefined / Infinity 被剔除', dirty.n === 2, dirty.n)
  check('有效点均值正确', dirty.meanR === 2 && dirty.meanP === 3, dirty.meanR + '/' + dirty.meanP)

  const one = scatterStats([{ r: 5, p: 5 }])
  check('单点的标准差为 0', one.sdR === 0 && one.sdP === 0, one.sdR)
  check('单点的极差为 0', one.spreadR === 0 && one.spreadP === 0)
}

console.log('')
console.log('-- ScatterChart 渲染 --')
{
  const cv = makeCanvas()
  const sc = new ScatterChart(cv, { unit: '°', minSpan: 2 })
  sc.setSize(300, 300, 2)
  check('canvas 按 dpr 放大', cv.width === 600 && cv.height === 600, cv.width + 'x' + cv.height)

  sc.setData(ringSamples(400, 0, 0, 1.5))
  const ctx = cv._ctx
  check('绘制了散点（arc）', ctx._calls.some((c) => c.op === 'arc'))
  check('绘制了范围框（strokeRect）', ctx._calls.filter((c) => c.op === 'strokeRect').length === 2)

  // 散点固定半径 2.2，与末位的零点中心圆（半径 4）区分开
  const POINT_R = 2.2
  const arcs = ctx._calls.filter((c) => c.op === 'arc' && Math.abs(c.r - POINT_R) < 1e-9)
  check('散点数量 = 400', arcs.length === 400, arcs.length)
  check('每个有效采样都画了点', arcs.length === sc.stats().n, arcs.length + ' vs ' + sc.stats().n)

  check('stats 与 setData 后的点数一致', sc.stats().n === 400, sc.stats().n)

  // 空数据不能直接崩，且要给出文字提示而不是留一块白
  cv._ctx._calls.length = 0
  sc.clear()
  check('clear 后 n = 0', sc.stats().n === 0)
  check('clear 后仍完成渲染（画出提示）',
    cv._ctx._calls.some((c) => c.op === 'fillText' && /标定/.test(c.text)),
    JSON.stringify(cv._ctx._calls.map((c) => c.op)))
}

console.log('')
console.log('-- 两轴等比（关键设计约束）--')
{
  // 同一份数据，分别放进宽画布和窄画布。
  // 若两轴独立缩放，点的相对间距会随画布宽高比变化；等比则不会。
  function shape(canvasW, canvasH) {
    const cv = makeCanvas()
    const sc = new ScatterChart(cv, { unit: '°', minSpan: 2 })
    sc.setSize(canvasW, canvasH, 1)
    // 三个已知点：(0,0)、(水平 +1°)、(垂直 +1°)
    sc.setData([{ r: 0, p: 0 }, { r: 1, p: 0 }, { r: 0, p: 1 }])
    const arcs = cv._ctx._calls.filter((c) => c.op === 'arc' && Math.abs(c.r - 2.2) < 1e-9)
    const pt0 = arcs[0]
    const ptH = arcs[1]
    const ptV = arcs[2]
    const pad = { left: 40, right: 10, top: 12, bottom: 18 }
    return {
      dx: Math.abs(ptH.x - pt0.x),
      dy: Math.abs(ptV.y - pt0.y),
      arcs,
      box: {
        x0: pad.left,
        x1: canvasW - pad.right,
        y0: pad.top,
        y1: canvasH - pad.bottom
      }
    }
  }

  const wide = shape(600, 300)
  const tall = shape(300, 600)
  check('宽画布：1° 横向 ≈ 1° 纵向', Math.abs(wide.dx - wide.dy) < 0.01, wide.dx.toFixed(2) + ' vs ' + wide.dy.toFixed(2))
  check('窄画布：1° 横向 ≈ 1° 纵向', Math.abs(tall.dx - tall.dy) < 0.01, tall.dx.toFixed(2) + ' vs ' + tall.dy.toFixed(2))
  check('极端宽高比下仍是正圆不是椭圆',
    Math.abs(wide.dx / wide.dy - 1) < 1e-3 && Math.abs(tall.dx / tall.dy - 1) < 1e-3,
    (wide.dx / wide.dy).toFixed(6) + ' / ' + (tall.dx / tall.dy).toFixed(6))

  // 缩放取的是短边，所以数据不会因为画布变窄就被裁到框外
  const inBox = tall.arcs.every((a) =>
    a.x >= tall.box.x0 - 3 && a.x <= tall.box.x1 + 3 &&
    a.y >= tall.box.y0 - 3 && a.y <= tall.box.y1 + 3)
  check('窄画布下数据点仍完整落在绘图区内', inBox,
    '共 ' + tall.arcs.length + ' 点，box=' + JSON.stringify(tall.box))
}

console.log('')
console.log('-- 抽稀与边界 --')
{
  const cv = makeCanvas()
  const sc = new ScatterChart(cv, { maxPoints: 100 })
  sc.setSize(300, 300, 1)
  sc.setData(ringSamples(500, 0, 0, 2))
  check('超过 maxPoints 时抽稀到上限', sc.stats().n === 100, sc.stats().n)
  const arcs = cv._ctx._calls.filter((c) => c.op === 'arc')
  check('绘制点数不超过上限 + 中心标记', arcs.length <= 110, arcs.length)

  const cv2 = makeCanvas()
  const sc2 = new ScatterChart(cv2)
  sc2.setSize(300, 300, 1)
  sc2.setData([])
  check('setData([]) 不抛异常', true)
  check('setData 非法值（null）不抛异常', (() => {
    try { sc2.setData(null); return true } catch (e) { return false }
  })())

  // 极小 canvas 不应算出负尺寸
  const cv3 = makeCanvas()
  const sc3 = new ScatterChart(cv3)
  sc3.setSize(0, 0, 1)
  sc3.setData([{ r: 1, p: 1 }, { r: -1, p: -1 }])
  check('尺寸为 0 时有下限保护', sc3.width >= 80 && sc3.height >= 80, sc3.width + 'x' + sc3.height)
}

console.log('')
console.log('-- LineChart 回归 --')
{
  const cv = makeCanvas()
  const lc = new LineChart(cv, { series: [{ color: '#0f9c8c', fill: 'rgba(15,156,140,0.08)' }], unit: '°' })
  lc.setSize(300, 200, 1)
  check('LineChart setSize 生效', cv.width === 300 && cv.height === 200, cv.width + 'x' + cv.height)
  let threw = false
  try { lc.setData(['0', '1', '2'], [[1.2, 1.5, null]]) } catch (e) { threw = true }
  check('LineChart 含 null 的数据不抛异常', !threw)
  const okEmpty = (() => { try { lc.clear(); return true } catch (e) { return false } })()
  check('LineChart clear 正常', okEmpty)
}

console.log('')
console.log('-'.repeat(50))
if (failed === 0) {
  console.log('结果：' + passed + ' 通过，0 失败')
  process.exit(0)
} else {
  console.log('结果：' + passed + ' 通过，' + failed + ' 失败')
  process.exit(1)
}
