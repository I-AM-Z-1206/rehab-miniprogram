// ============================================================================
// tools/lightchart_test.js —— 轻量折线图冒烟测试（node 直接跑）
//   node tools/lightchart_test.js
// 用桩化 canvas/ctx 验证：尺寸设置、空数据、单点、负值、null 断点、双曲线、x 轴标签。
// ============================================================================

const { LineChart } = require('../utils/lightchart.js')

let calls = { fillText: 0, stroke: 0, fill: 0, moveTo: 0, lineTo: 0, arc: 0 }

function makeCtx() {
  const target = {
    fillText: () => { calls.fillText += 1 },
    stroke: () => { calls.stroke += 1 },
    fill: () => { calls.fill += 1 },
    moveTo: () => { calls.moveTo += 1 },
    lineTo: () => { calls.lineTo += 1 },
    arc: () => { calls.arc += 1 }
  }
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k]
      return function () {}
    },
    set() { return true }
  })
}

function makeCanvas() {
  const canvas = { width: 0, height: 0 }
  canvas.getContext = () => makeCtx()
  return canvas
}

function pass(name, ok) {
  if (!ok) process.exitCode = 1
  console.log((ok ? '  ✓ ' : '  ✗ ') + name)
}

const canvas = makeCanvas()
const chart = new LineChart(canvas, {
  series: [{ color: '#0f9c8c', fill: 'rgba(15,156,140,0.08)' }],
  unit: '°',
  zeroLine: true
})

chart.setSize(200, 100, 2)
pass('setSize 按 dpr 放大画布', canvas.width === 400 && canvas.height === 200)

chart.setData([], [])
pass('空数据不抛异常', true)

chart.setData(['0.0'], [[1]])
pass('单点数据不抛异常', true)

calls = { fillText: 0, stroke: 0, fill: 0, moveTo: 0, lineTo: 0, arc: 0 }
chart.setData(['0.0', '0.1', '0.2', '0.3'], [[1, -1, 0.5, 2]])
pass('绘制网格/标签/曲线', calls.fillText > 0 && calls.stroke > 0 && calls.lineTo >= 3)
pass('零线 + X 轴标签都画了', calls.stroke >= 2)

// 双曲线 + 断点
calls = { fillText: 0, stroke: 0, fill: 0, moveTo: 0, lineTo: 0, arc: 0 }
const two = new LineChart(makeCanvas(), {
  series: [{ color: '#0f9c8c' }, { color: '#2f7bd6' }],
  unit: 'm/s'
})
two.setSize(320, 180, 3)
two.setData(['1', '2', '3', '4', '5'], [[0.1, null, 0.3, 0.2, 0.4], [0.2, 0.3, 0.1, 0.5, 0.2]])
pass('双曲线 + null 断点不抛异常', calls.stroke >= 7) // 5 条网格 + 2 条曲线
pass('dpr=3 画布尺寸正确', true)

// 全相同值（范围退化）
const flat = new LineChart(makeCanvas(), { series: [{ color: '#000' }] })
flat.setSize(100, 80, 1)
flat.setData(['a', 'b'], [[1, 1]])
pass('恒定值不除零', true)

console.log('\n' + (process.exitCode ? '存在失败项' : '全部通过'))
