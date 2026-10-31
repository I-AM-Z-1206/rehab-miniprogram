// ============================================================================
// tools/fruit-metrics-test.js —— 接水果的能力指标与自适应落点
// ----------------------------------------------------------------------------
// 这一层最怕的不是算错，而是**算出一个看起来合理、其实没意义的数**：
//   · D75 从 6 颗样本里算出来 → 一颗运气球就决定了他"能够到 11°"；
//   · 命中率被落点随机污染 → 同一个患者两局差 20 个点；
//   · 走神的整段时间被算进"有效训练"。
// 所以这里既验纯函数，也真跑两局（"配合的患者"和"不动的患者"）。
//
// 用法：node tools/fruit-metrics-test.js
// ============================================================================

/* eslint-disable no-console */

const storage = {}
global.wx = {
  getStorageSync: (k) => (storage[k] === undefined ? '' : storage[k]),
  setStorageSync: (k, v) => { storage[k] = v },
  getWindowInfo: () => ({ pixelRatio: 2, statusBarHeight: 44, windowWidth: 375, windowHeight: 812 }),
  getMenuButtonBoundingClientRect: () => ({ top: 48, bottom: 80, left: 281, width: 87 })
}
global.getApp = () => ({ globalData: {} })

const { getStore } = require('../utils/fruit-config.js')
const { FruitEngine } = require('../pkgFruit/games/fruit/engine.js')
const metrics = require('../pkgFruit/games/fruit/metrics.js')

let passed = 0
let failed = 0

function ok(cond, name, extra) {
  if (cond) { passed += 1; console.log('  ok   ' + name) }
  else { failed += 1; console.log('  FAIL ' + name + (extra === undefined ? '' : '  → ' + extra)) }
}

function near(a, b, tol, name) {
  ok(Math.abs(a - b) <= tol, name, a + ' vs ' + b)
}

const DT = 1 / 60

// ---------------------------------------------------------------- 1
console.log('\n[1] 纯函数：中位数 / 分箱 / D75')
{
  ok(metrics.median([]) === null, '空数组返回 null（不能返回 0）')
  ok(metrics.median([3, 1, 2]) === 2, '奇数个取中间')
  ok(metrics.median([1, 2, 3, 4]) === 2.5, '偶数个取平均')
  ok(metrics.median([1, null, 3, undefined, 2]) === 2, '忽略 null / undefined')

  const b = metrics.bins([
    { dDeg: 1, hit: true }, { dDeg: 2, hit: false },
    { dDeg: 7, hit: true }
  ])
  ok(b[0].n === 2 && b[0].hits === 1, '0~3° 这一箱 2 颗中 1 颗')
  ok(b[2].n === 1 && b[2].hits === 1, '6~9° 这一箱 1 颗全中')

  // 样本不足：不能出值
  const few = []
  for (let i = 0; i < 10; i++) few.push({ dDeg: 4, hit: true })
  const dFew = metrics.d75(few)
  ok(dFew.value === null && dFew.enough === false, '样本 < 20 颗时不给 D75', dFew.note)

  // 全中：到顶
  const allHit = []
  for (let i = 0; i < 24; i++) allHit.push({ dDeg: 7.5, hit: true })
  const dTop = metrics.d75(allHit)
  ok(dTop.value !== null && dTop.note.length > 0, '全都成功 → 给出上限并附说明', dTop.note)

  // 插值：近处全中、远处全丢，D75 应落在 3~6 与 6~9 之间
  const mixed = []
  for (let i = 0; i < 10; i++) mixed.push({ dDeg: 1.5, hit: true })
  for (let i = 0; i < 10; i++) mixed.push({ dDeg: 4.5, hit: true })
  for (let i = 0; i < 10; i++) mixed.push({ dDeg: 7.5, hit: false })
  const dMix = metrics.d75(mixed)
  ok(dMix.value > 4.5 && dMix.value < 7.5, 'D75 落在两个箱之间（插值）', dMix.value)

  // 有效训练占比：无响应的时长要扣掉
  const sum = metrics.summarize([
    { dDeg: 3, hit: true, rt: 0.5, mt: 1.0, visibleSec: 4, noResponse: false },
    { dDeg: 6, hit: false, rt: null, mt: null, visibleSec: 4, noResponse: true }
  ], { elapsedSec: 10, holdRate: 0.5, minTrials: 1 })
  near(sum.activeRate, 0.6, 0.001, '有效训练占比 = 1 - 4/10')
  ok(sum.noResponseCount === 1 && sum.noResponseSec === 4, '无响应次数与时长')
  ok(sum.rt50 === 0.5 && sum.mt50 === 1.0, 'RT50 / MT50 取中位数')
}

// ---------------------------------------------------------------- 2
console.log('\n[2] 引擎：逐颗留痕 + 自适应')
{
  const cfg = getStore()
  cfg.reset()
  cfg.patch({ durationSec: 30, spawnInterval: 1.2, maxFruits: 2 }, 'test')
  const e = new FruitEngine({ cfg: cfg })
  e.setSimMode(true)
  e.prepare()
  e.calibrate()
  e.startCountdown()

  const travel = 0.5 - e.basketMinX
  let t = 0
  // 「配合的患者」：每一帧都朝最低那颗水果移动
  const follow = () => {
    let low = null
    e.fruits.forEach((f) => {
      if (f.state !== 'fall') return
      if (!low || f.y > low.y) low = f
    })
    if (low) e.setSimTarget(clamp((low.x - 0.5) / travel, -1, 1), 0)
    else e.setSimTarget(0, 0)
  }
  const reachStart = e.reachDeg
  while (t < 34 && e.state !== 'RESULT') {
    follow()
    e.update(DT)
    e.drainEvents()
    t += DT
  }

  ok(e.trials.length >= 10, '跑完一局留下逐颗记录', e.trials.length + ' 颗')
  ok(e.trials.every((x) => x.dDeg > 0.5), '每颗都有落点距离（度）')
  ok(e.trials.every((x) => x.dDeg <= e._maxReachDeg() + 0.1),
    '落点距离不超过满行程（抖动不能把水果甩出可及范围）',
    Math.max.apply(null, e.trials.map((x) => x.dDeg)) + ' / 上限 ' + e._maxReachDeg())
  ok(e.trials.some((x) => x.rt !== null), '至少有一部分算出反应潜伏期')
  ok(e.reachDeg > reachStart, '接得住 → 自适应距离往上走', reachStart + ' → ' + e.reachDeg)

  const s = e.summary
  ok(s && s.metricVersion === 'v2', '记录带 metricVersion v2')
  ok(s.metrics && s.metrics.trials === e.trials.length, '指标里的样本数与逐颗记录一致')
  ok(s.metrics.activeRate !== null && s.metrics.activeRate > 0.8,
    '配合的患者：有效训练占比高', s.metrics.activeRate)
  ok(s.metrics.d75 !== null || s.metrics.trials < 20, '样本够就有 D75，不够就明说', s.metrics.d75Note)
  // 逐颗成功数与总分统计必须一致，否则会出现「记录说 20 颗、分数按 22 颗算」
  const hitTrials = e.trials.filter((x) => x.hit).length
  ok(hitTrials === e.score.hits, '逐颗命中数与计分命中数一致', hitTrials + ' vs ' + e.score.hits)
}

// ---------------------------------------------------------------- 3
console.log('\n[3] 引擎：不动的患者')
{
  const cfg = getStore()
  cfg.reset()
  cfg.patch({ durationSec: 20, spawnInterval: 1.2, maxFruits: 2 }, 'test')
  const e = new FruitEngine({ cfg: cfg })
  e.setSimMode(true)
  e.prepare()
  e.calibrate()
  e.startCountdown()

  let t = 0
  while (t < 24 && e.state !== 'RESULT') {
    e.setSimTarget(0, 0) // 一动不动
    e.update(DT)
    e.drainEvents()
    t += DT
  }

  ok(e.trials.length > 3, '仍然留下记录', e.trials.length + ' 颗')
  ok(e.trials.every((x) => x.noResponse), '全程没动 → 全部标记无响应')
  ok(e.reachDeg <= e._minReachDeg() + 0.01, '自适应没有往上走（一直漏）', e.reachDeg + ' / min ' + e._minReachDeg().toFixed(1))
  const s = e.summary
  ok(s.metrics.activeRate !== null && s.metrics.activeRate < 0.15,
    '有效训练占比接近 0', s.metrics.activeRate)
  ok(s.metrics.rt50 === null, '没动过 → 反应潜伏期无值（不是 0）')
}

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v)
}

console.log('\n----------------------------------------')
if (failed === 0) console.log('结果：全部通过（' + passed + ' 项）')
else {
  console.log('结果：' + failed + ' 项失败 / 共 ' + (passed + failed) + ' 项')
  process.exitCode = 1
}
