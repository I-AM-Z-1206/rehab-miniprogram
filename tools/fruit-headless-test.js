// ============================================================================
// tools/fruit-headless-test.js —— 接水果「无头」自检（Node 运行，不进小程序包）
// ----------------------------------------------------------------------------
// 验证内容：
//   1. 状态机：READY → CALIBRATING → COUNTDOWN → PLAYING → RESULT
//   2. 跟随：身体左右倾 → 果篮左右移动，跟住落点能接住
//   3. 判定：只看果篮有没有在水果下方（与"稳不稳"无关）
//   4. 暂停：计时、水果位置、果篮位置、动画时间全部冻结
//   5. 传感器中断：进入 SENSOR_ERROR 时停止判定，不静默切模拟
//   6. 计分：单果只计一次、连击倍率、成功率除零保护
//   7. 渲染冒烟：Mock Canvas 跑完四个界面 + 小屏/大屏
//   8. 记录：防重复、模拟数据不上报、与走钢丝分库互不影响
//
// 用法：node tools/fruit-headless-test.js
// ============================================================================

/* eslint-disable no-console */

const storage = {}
global.wx = {
  getStorageSync: (k) => (storage[k] === undefined ? '' : storage[k]),
  setStorageSync: (k, v) => { storage[k] = v },
  createOffscreenCanvas: (o) => makeCanvas(o.width, o.height),
  getWindowInfo: () => ({ pixelRatio: 2, statusBarHeight: 44, windowWidth: 375, windowHeight: 812 }),
  getMenuButtonBoundingClientRect: () => ({ top: 48, bottom: 80, left: 281, width: 87 })
}
global.getApp = () => ({ globalData: {} })

// ---------------------------------------------------------------- Mock Canvas
function makeGradient() {
  return { addColorStop() {} }
}

function makeCtx() {
  const state = {}
  const ctx = {
    canvas: null,
    measureText: (t) => ({ width: String(t).length * 6.2 }),
    createLinearGradient: () => makeGradient(),
    createRadialGradient: () => makeGradient(),
    createPattern: () => null,
    getImageData: () => ({ data: [] })
  }
  const methods = [
    'save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo',
    'ellipse', 'quadraticCurveTo', 'bezierCurveTo', 'rect', 'fill', 'stroke', 'clip',
    'translate', 'scale', 'rotate', 'setTransform', 'transform', 'resetTransform',
    'clearRect', 'fillRect', 'strokeRect', 'fillText', 'strokeText', 'drawImage',
    'setLineDash', 'putImageData', 'createImageData'
  ]
  methods.forEach((m) => { ctx[m] = function () { state[m] = (state[m] || 0) + 1 } })
  ctx.__calls = state
  return new Proxy(ctx, {
    get(target, prop) {
      if (prop in target) return target[prop]
      return undefined
    },
    set(target, prop, value) {
      target[prop] = value
      return true
    }
  })
}

function makeCanvas(w, h) {
  const ctx = makeCtx()
  return {
    width: w || 300,
    height: h || 150,
    getContext: () => ctx,
    requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 16),
    cancelAnimationFrame: () => {}
  }
}

const { getStore, validate } = require('../utils/fruit-config.js')
const { FruitEngine } = require('../pkgFruit/games/fruit/engine.js')
const { FruitRenderer } = require('../pkgFruit/games/fruit/renderer.js')
const { ScoreManager } = require('../pkgFruit/games/fruit/score.js')

const DT = 1 / 60

function makeEngine(opts) {
  const cfg = getStore()
  cfg.reset()
  if (opts && opts.patch) cfg.patch(opts.patch, 'test')
  const engine = new FruitEngine({ cfg: cfg })
  engine.setSimMode(true)
  engine.prepare()
  engine.calibrate()
  return { engine, cfg }
}

function run(engine, seconds, inputFn, onStep) {
  let t = 0
  while (t < seconds) {
    if (inputFn) inputFn(engine, t)
    engine.update(DT)
    const events = engine.drainEvents()
    if (onStep) onStep(engine, events, t)
    t += DT
    if (engine.state === 'RESULT' || engine.state === 'ABORTED') break
  }
  return t
}

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v)
}

/** 身体中立位：果篮在屏幕中间 */
function holdSteady(engine) {
  engine.setSimTarget(0, 0)
}

/** 身体向右倾：果篮往右移 */
function leanRight(engine) {
  engine.setSimTarget(0.9, 0)
}

/** 身体向左倾：果篮往左移 */
function leanLeft(engine) {
  engine.setSimTarget(-0.9, 0)
}

/**
 * 测试里的"玩家"：始终把果篮移向最低的那颗水果。
 * 把水果的 x 反算成模拟控制量，走的是和真实传感器一样的输入链路。
 */
function trackLowest(engine) {
  const f = engine._lowestFruit()
  if (!f) {
    engine.setSimTarget(0, 0)
    return
  }
  const travel = (engine.basketMaxX - engine.basketMinX) / 2
  engine.setSimTarget(clamp((f.x - 0.5) / Math.max(0.01, travel), -1, 1), 0)
}

let failed = 0
function check(name, cond, extra) {
  if (cond) {
    console.log('  ✓ ' + name)
  } else {
    failed += 1
    console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + extra : ''))
  }
}

// ---------------------------------------------------------------- 1. 状态机
console.log('\n[1] 状态机与配置校验')
{
  const { engine, cfg } = makeEngine()
  check('初始进入准备态', engine.state === 'READY', engine.state)
  const r = engine.startCountdown()
  check('倒计时可以启动', r.ok === true, JSON.stringify(r))
  run(engine, 4, holdSteady)
  check('倒计时结束进入 PLAYING', engine.state === 'PLAYING' || engine.state === 'RESULT', engine.state)

  const bad = validate(Object.assign(cfg.all(), { basketWidthPct: 50, maxFruits: 0, spawnInterval: 0 }))
  check('非法参数被拦截', bad.ok === false && bad.errors.length >= 3, bad.errors.join(' | '))

  const badAxis = validate(Object.assign(cfg.all(), { axisX: 'pitch', axisY: 'pitch' }))
  check('同轴映射被拦截', badAxis.ok === false, badAxis.errors.join(' | '))
  cfg.reset()
}

// ---------------------------------------------------------------- 2. 果篮随身体移动
console.log('\n[2] 跟随：身体左右倾 → 果篮左右移动，跟住落点就能接住')
{
  const { engine } = makeEngine({ patch: { durationSec: 60, spawnInterval: 1.1 } })
  engine.startCountdown()
  run(engine, 3.2, holdSteady)
  check('倒计时结束进入 PLAYING', engine.state === 'PLAYING', engine.state)
  const midX = engine.basket.x
  check('中立位时果篮在屏幕中间', Math.abs(midX - 0.5) < 0.02, midX)

  run(engine, 1.2, leanRight)
  const rightX = engine.basket.x
  run(engine, 2.0, leanLeft)
  const leftX = engine.basket.x
  check('身体右倾 → 果篮右移', rightX > midX + 0.05, midX + ' → ' + rightX)
  check('身体左倾 → 果篮左移', leftX < midX - 0.05, midX + ' → ' + leftX)
  check('果篮始终留在可移动范围内',
    rightX <= engine.basketMaxX + 1e-6 && leftX >= engine.basketMinX - 1e-6,
    leftX + ' ~ ' + rightX)

  // 自动追落点：接住的数量应该明显多于漏接
  run(engine, 14, trackLowest)
  check('跟住落点能接住', engine.score.hits > 0, engine.score.hits)
  check('命中多于漏接', engine.score.hits > engine.score.misses,
    engine.score.hits + ' / ' + engine.score.misses)
  check('得分 > 0', engine.score.total > 0, engine.score.total)

  engine.finish('aborted')
  const s = engine.summary
  check('分项之和能对上总分',
    Math.round(s.breakdown.rawBase + s.breakdown.comboBonus + s.breakdown.finishBonus) === s.score,
    s.breakdown.rawBase + '+' + s.breakdown.comboBonus + '+' + s.breakdown.finishBonus + ' vs ' + s.score)
  check('没有 NaN', isFinite(s.score) && isFinite(s.pathLength), 'NaN')
}

// ---------------------------------------------------------------- 3. 对准判定
console.log('\n[3] 判定：只看果篮有没有在水果下方')
{
  const { engine } = makeEngine({
    patch: { durationSec: 40, comboWindowSec: 5, spawnInterval: 5 }
  })
  engine.startCountdown()
  run(engine, 3.2, holdSteady)

  // 果篮在中间，水果直接补在篮子正上方 → 接住
  engine.debugSpawn(1, { atBasket: true })
  run(engine, 1.6, holdSteady)
  check('对准 → 接住', engine.score.hits === 1, engine.score.hits)
  const comboAfterCatch = engine.score.combo
  check('接住后连击 > 0', comboAfterCatch > 0, comboAfterCatch)

  // 水果补在篮子上方后马上把果篮移走 → 漏接
  engine.debugSpawn(1, { atBasket: true })
  run(engine, 0.2, holdSteady)
  // 逐帧盯住那个被漏接的果子：y 有没有继续变大、最后有没有被回收
  const track = { fruit: null, y0: 0, yMax: 0 }
  run(engine, 1.6, leanRight, (e) => {
    const f = e.fruits.find((x) => x.state === 'missed')
    if (!f) return
    if (!track.fruit) { track.fruit = f; track.y0 = f.y }
    track.yMax = Math.max(track.yMax, f.y)
  })
  check('果篮移开 → 记漏接', engine.score.misses === 1, engine.score.misses)
  check('漏接后连击归零', engine.score.combo === 0, engine.score.combo)

  // 回归：漏接的果子必须继续往下掉并被回收
  // （曾经被标成 missed 后就停止更新，永远卡在篮口下方不动）
  check('漏接的果子继续下落', !!track.fruit && track.yMax > track.y0 + 0.05,
    track.y0.toFixed(3) + '→' + track.yMax.toFixed(3))
  run(engine, 0.6, leanRight)
  check('漏接的果子落出画面后回收',
    !!track.fruit && engine.fruits.indexOf(track.fruit) === -1,
    track.fruit ? String(engine.fruits.indexOf(track.fruit)) : 'null')

  // 即使"没稳住"（holding=false），只要果篮在水果下方照样能接住
  run(engine, 1.0, leanRight)
  const holdingBefore = engine.hold.holding
  const hitsBefore = engine.score.hits
  engine.debugSpawn(1, { atBasket: true })
  run(engine, 1.6, leanRight)
  check('偏离状态下也能接住（判定不看稳定）',
    holdingBefore === false && engine.score.hits > hitsBefore,
    'holding=' + holdingBefore + ' hits=' + hitsBefore + '→' + engine.score.hits)

  // 回到中间，果篮应该回到 0.5 附近
  run(engine, 2, holdSteady)
  check('回中后果篮回到屏幕中间', Math.abs(engine.basket.x - 0.5) < 0.04, engine.basket.x)
  engine.finish('aborted')
  const sum = engine.summary
  check('结算里有稳定统计', typeof sum.holdRate === 'number' && sum.holdOutCount >= 1,
    sum.holdRate + ' / ' + sum.holdOutCount)
}

// ---------------------------------------------------------------- 3b. 稳定统计
console.log('\n[3b] 稳定统计：只写记录，不影响接取')
{
  const { engine } = makeEngine({
    patch: { durationSec: 30, holdToleranceDeg: 5, holdStableSec: 0.6, holdGraceSec: 0 }
  })
  engine.startCountdown()
  // 倒计时结束那一刻不应该已经算稳定
  run(engine, 3.2, holdSteady)
  const vm = engine.getViewModel()
  check('刚进入 PLAYING 时还没稳住', vm.hold.holding === false, vm.hold.holding)
  run(engine, 1.2, holdSteady)
  check('持续在容差内 → 稳住', engine.hold.holding === true, engine.hold.holding)
  run(engine, 1.5, leanRight)
  check('倾身移动果篮 → 稳定计时中断', engine.hold.holding === false, engine.hold.holding)
  check('偏离被计入稳定统计', engine.hold.outCount >= 1, engine.hold.outCount)
  engine.finish('aborted')
  check('稳定率被倾身拉低', engine.summary.holdRate < 0.95, engine.summary.holdRate)
}

// ---------------------------------------------------------------- 4. 暂停
console.log('\n[4] 暂停：计时、水果与果篮位置冻结，恢复后不瞬移')
{
  const { engine } = makeEngine({ patch: { durationSec: 30 } })
  engine.startCountdown()
  run(engine, 5, leanRight)
  const before = {
    elapsed: engine.elapsedSec,
    fruits: engine.fruits.map((f) => ({ id: f.id, y: f.y, x: f.x })),
    score: engine.score.total,
    basketX: engine.basket.x,
    t: engine.t
  }
  engine.pause()
  run(engine, 3, leanLeft)
  const after = {
    elapsed: engine.elapsedSec,
    fruits: engine.fruits.map((f) => ({ id: f.id, y: f.y, x: f.x })),
    score: engine.score.total,
    basketX: engine.basket.x
  }
  check('状态为 PAUSED', engine.state === 'PAUSED', engine.state)
  check('暂停期间训练时长不增加', Math.abs(after.elapsed - before.elapsed) < 1e-6,
    before.elapsed + ' → ' + after.elapsed)
  check('暂停期间水果位置不变',
    JSON.stringify(after.fruits) === JSON.stringify(before.fruits), 'moved')
  check('暂停期间果篮不移动', Math.abs(after.basketX - before.basketX) < 1e-9,
    before.basketX + ' → ' + after.basketX)
  check('暂停期间不会加分', after.score === before.score, before.score + ' → ' + after.score)
  engine.resume()
  run(engine, 2, holdSteady)
  check('恢复后继续计时', engine.elapsedSec > after.elapsed, engine.elapsedSec)
  engine.finish('aborted')
}

// ---------------------------------------------------------------- 5. 传感器中断
console.log('\n[5] 传感器中断：停止判定，不静默切模拟')
{
  const { engine } = makeEngine({ patch: { durationSec: 30 } })
  engine.startCountdown()
  run(engine, 4, holdSteady)
  // 把运动层切成「真实模式」再制造超时
  engine.setSimMode(false)
  engine.motion.hasSignal = true
  engine.motion.lastFrameAt = Date.now() - 5000
  engine.motion.stale = true
  if (engine.state === 'PLAYING') engine.enterSensorError()
  const stateAfterLoss = engine.state
  const hitsAfterLoss = engine.score.hits
  run(engine, 2, holdSteady)
  check('进入 SENSOR_ERROR', stateAfterLoss === 'SENSOR_ERROR', stateAfterLoss)
  check('中断期间不判负也不加分', engine.score.hits === hitsAfterLoss,
    hitsAfterLoss + ' → ' + engine.score.hits)
  check('中断被记录', engine.interruption.count >= 1, engine.interruption.count)
  check('没有自动切回模拟', engine.motion.source === 'real', engine.motion.source)
  engine.finish('aborted')
}

// ---------------------------------------------------------------- 6. 计分
console.log('\n[6] 计分：单果只计一次 + 连击倍率 + 除零保护')
{
  const { engine, cfg } = makeEngine({ patch: { comboStep: 0.1, comboMaxMul: 2, comboResetOnMiss: true } })
  const sm = new ScoreManager(cfg)
  sm.reset()
  check('无水果时成功率为 0（不除零）', sm.accuracy === 0 && isFinite(sm.accuracy), sm.accuracy)
  const a = sm.hit(10, 'apple')
  const b = sm.hit(10, 'apple')
  const c = sm.hit(10, 'apple')
  check('第一次接住 1 倍', a.gain === 10 && a.mul === 1, a.gain + '/' + a.mul)
  check('第二次接住有连击加成', b.gain === 11, b.gain)
  check('第三次按 1.2 倍', c.gain === 12, c.gain)
  check('连击上限生效', sm.comboMul <= 2, sm.comboMul)
  check('连击加成被单独统计', sm.comboBonus === 3, sm.comboBonus)
  sm.miss()
  check('漏接后连击归零', sm.combo === 0, sm.combo)
  check('最高连击保留', sm.maxCombo === 3, sm.maxCombo)
  const snap = sm.snapshot()
  check('总分 = 基础分 + 完成奖励', snap.total === snap.base + snap.finishBonus,
    snap.total + ' vs ' + snap.base + '+' + snap.finishBonus)

  // 引擎层：同一水果不会被计两次
  const e2 = makeEngine({ patch: { durationSec: 20, spawnInterval: 5 } }).engine
  e2.startCountdown()
  run(e2, 3.2, () => e2.setSimTarget(0, 0))
  e2.debugSpawn(1, { atBasket: true })
  let wait = 0
  while (wait < 180 && e2.score.hits === 0) {
    e2.setSimTarget(0, 0)
    e2.update(DT)
    e2.drainEvents()
    wait += 1
  }
  const hitsOnce = e2.score.hits
  run(e2, 1.5, () => e2.setSimTarget(0, 0))
  check('同一水果只计一次', e2.score.hits === hitsOnce && hitsOnce === 1, hitsOnce + ' → ' + e2.score.hits)
  check('接住的水果已被移除出活动数组',
    e2.fruits.filter((f) => f.state === 'caught').length <= 1, e2.fruits.length)
  e2.finish('aborted')
  void engine
}

// ---------------------------------------------------------------- 7. 渲染
console.log('\n[7] 渲染层冒烟测试（Mock Canvas）')
{
  const cfg = getStore()
  cfg.reset()
  const engine = new FruitEngine({ cfg: cfg })
  engine.setSimMode(true)
  const canvas = makeCanvas(780, 1688)
  const ctx = canvas.getContext('2d')
  const renderer = new FruitRenderer({ canvas: canvas, ctx: ctx, engine: engine, cfg: cfg })
  renderer.resize(390, 844, 2)

  const screens = []
  try {
    renderer.render(0.016, Date.now())
    screens.push('intro')
    check('intro 帧渲染完成', renderer.buttons.length > 0, renderer.buttons.length + ' 个热区')
    const startBtn = renderer.buttons.find((b) => b.id === 'start')
    check('intro 有开始按钮热区', !!startBtn, 'missing')
    if (startBtn) check('热区命中正常', renderer.hitTest(startBtn.x + 2, startBtn.y + 2) === 'start')

    engine.prepare()
    renderer.render(0.016, Date.now())
    screens.push('prepare')
    check('prepare 帧渲染完成', renderer.buttons.length > 0, renderer.buttons.length + ' 个热区')

    engine.calibrate()
    let guard = 0
    while (engine.state === 'CALIBRATING' && guard < 400) {
      engine.update(DT)
      renderer.render(DT, Date.now())
      guard += 1
    }
    check('标定流程可完成', engine.state === 'READY', engine.state)

    engine.startCountdown()
    for (let i = 0; i < 240; i++) {
      engine.update(DT)
      if (engine.state === 'PLAYING') holdSteady(engine)
      renderer.render(DT, Date.now())
    }
    screens.push('play')
    check('play 帧渲染完成', renderer.buttons.length > 0, renderer.buttons.length + ' 个热区')
    check('play 下有水果在画面上', engine.fruits.length > 0 || engine.score.hits > 0, engine.fruits.length)

    // 模拟面板
    renderer.simOpen = true
    renderer.render(DT, Date.now())
    const simIds = renderer.buttons.map((b) => b.id)
    check('模拟面板包含测试按钮',
      simIds.indexOf('sim:catch') >= 0 && simIds.indexOf('sim:spawn') >= 0 && simIds.indexOf('sim:lost') >= 0,
      simIds.join(','))
    renderer.simOpen = false

    engine.pause()
    renderer.render(DT, Date.now())
    check('暂停遮罩渲染完成', renderer.buttons.length >= 3, renderer.buttons.length + ' 个热区')
    engine.resume()

    engine.enterSensorError()
    renderer.render(DT, Date.now())
    check('断线遮罩渲染完成', renderer.buttons.some((b) => b.id === 'reconnect'), 'missing')
    engine.finish('aborted')
    renderer.render(DT, Date.now())
    screens.push('result')
    check('result 帧渲染完成', renderer.buttons.length > 0, renderer.buttons.length + ' 个热区')

    // 屏幕适配
    renderer.resize(320, 568, 2)
    renderer.render(DT, Date.now())
    check('小屏 320x568 渲染完成', renderer.buttons.length > 0, renderer.buttons.length + ' 个热区')
    renderer.resize(414, 896, 3)
    renderer.render(DT, Date.now())
    check('大屏 414x896 渲染完成', renderer.buttons.length > 0, renderer.buttons.length + ' 个热区')
  } catch (err) {
    failed += 1
    console.log('  ✗ 渲染异常：' + err.message)
    console.log(err.stack)
  }
  console.log('  已覆盖界面：' + screens.join(' / '))
}

// ---------------------------------------------------------------- 8. 记录
console.log('\n[8] 训练记录：防重复 + 模拟不上报 + 与走钢丝分库')
{
  const fruit = require('../pkgFruit/utils/fruit-record.js')
  const wire = require('../utils/training-record.js')
  fruit.clear()
  wire.clear()

  const rec = {
    recordId: 'fruit_test_1',
    nickname: '测试用户',
    gameId: 'fruit',
    difficulty: 2,
    score: 168,
    hits: 12,
    misses: 3,
    accuracy: 0.8,
    comboMax: 5,
    durationSec: 60,
    dataSource: 'real',
    completed: true,
    startedAt: Date.now(),
    endedAt: Date.now()
  }
  fruit.save(rec)
  fruit.save(Object.assign({}, rec, { score: 999 }))
  check('同一 recordId 只保存一次', fruit.list().length === 1, fruit.list().length)
  check('重复保存不覆盖原分', fruit.list()[0].score === 168, fruit.list()[0].score)

  fruit.save(Object.assign({}, rec, { recordId: 'fruit_test_2', dataSource: 'simulation' }))
  check('模拟数据标记为不上报', fruit.get('fruit_test_2').uploadState === 'skipped',
    fruit.get('fruit_test_2').uploadState)

  const rows = fruit.describePayload(fruit.get('fruit_test_1'))
  check('记录库导出时间格式化（记录页依赖）',
    typeof fruit.formatTime === 'function' && typeof fruit.formatDuration === 'function',
    typeof fruit.formatTime)
  check('隐私清单包含接住/漏接', rows.some((r) => r[0] === '接住 / 漏接'), rows.map((r) => r[0]).join('|'))

  wire.save(Object.assign({}, rec, { recordId: 'wire_x', gameId: 'wire', score: 55 }))
  check('走钢丝记录不会写进接水果库', fruit.list().length === 2, fruit.list().length)
  check('接水果记录不会写进走钢丝库', wire.list().length === 1, wire.list().length)
  check('两个游戏的上报配置互相独立',
    fruit.getUploadConfig().url === '' && wire.getUploadConfig().url === '', 'not isolated')
}

console.log('\n' + (failed ? '结果：' + failed + ' 项未通过' : '结果：全部通过'))
process.exit(failed ? 1 : 0)
