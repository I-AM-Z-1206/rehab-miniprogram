// ============================================================================
// tools/wire-headless-test.js —— 走钢丝「无头」自检脚本（Node 运行，不参与小程序包）
// ----------------------------------------------------------------------------
// 目的：在没有真机、没有 Canvas 的环境里，验证
//   1. 引擎状态机：READY → CALIBRATING → COUNTDOWN → PLAYING → RESULT
//   2. 平衡模型 / 保险绳 / 计分 / 训练时长是否按预期工作（不会跑飞、不会 NaN）
//   3. 保险绳开启与关闭两种越界规则
//   4. 渲染层每个界面都能跑完一帧（用 Mock Canvas，抓 undefined 方法等低级错误）
//
// 用法：
//   node tools/wire-headless-test.js
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
  const handler = {
    get(target, prop) {
      if (prop in target) return target[prop]
      // 未知方法一律返回 no-op，未知属性返回 undefined
      return undefined
    },
    set(target, prop, value) {
      target[prop] = value
      return true
    }
  }

  const ctx = {
    canvas: null,
    measureText: (t) => ({ width: String(t).length * 6.2 }),
    createLinearGradient: () => makeGradient(),
    createRadialGradient: () => makeGradient(),
    createPattern: () => null,
    getImageData: () => ({ data: [] })
  }

  // 常用绘图方法
  const methods = [
    'save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo',
    'ellipse', 'quadraticCurveTo', 'bezierCurveTo', 'rect', 'fill', 'stroke', 'clip',
    'translate', 'scale', 'rotate', 'setTransform', 'transform', 'resetTransform',
    'clearRect', 'fillRect', 'strokeRect', 'fillText', 'strokeText', 'drawImage',
    'setLineDash', 'putImageData', 'createImageData'
  ]
  methods.forEach((m) => { ctx[m] = function () { state[m] = (state[m] || 0) + 1 } })
  ctx.__calls = state
  return new Proxy(ctx, handler)
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

const { getStore } = require('../utils/wire-config.js')
const { WireEngine } = require('../games/wire/engine.js')
const { WireRenderer } = require('../games/wire/renderer.js')

const DT = 1 / 60

function makeEngine(opts) {
  const cfg = getStore()
  cfg.reset()
  if (opts && opts.patch) cfg.patch(opts.patch, 'test')
  const engine = new WireEngine({ cfg: cfg })
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

let failed = 0
function check(name, cond, extra) {
  if (cond) {
    console.log('  ✓ ' + name)
  } else {
    failed += 1
    console.log('  ✗ ' + name + (extra ? '  → ' + extra : ''))
  }
}

// ---------------------------------------------------------------- 1. 状态机
console.log('\n[1] 状态机与配置校验')
{
  const { engine, cfg } = makeEngine()
  check('初始进入准备态', engine.state === 'READY', engine.state)
  const r = engine.startCountdown()
  check('倒计时可以启动', r.ok === true, JSON.stringify(r))
  run(engine, 4, () => engine.setSimTarget(0, 0))
  check('倒计时结束进入 PLAYING', engine.state === 'PLAYING' || engine.state === 'RESULT', engine.state)

  cfg.patch({ warnThreshold: 0.9, ropeTrigger: 0.8 }, 'test')
  const bad = cfg.validate()
  check('非法阈值被拦截', bad.ok === false, bad.errors.join('/'))
  cfg.reset()
}

// ---------------------------------------------------------------- 2. 稳定通关
console.log('\n[2] 保持居中：应走完全程且不触发保险绳')
{
  const { engine } = makeEngine()
  engine.startCountdown()
  let maxTriggers = 0
  run(engine, 200, () => engine.setSimTarget(0, 0), (e) => {
    maxTriggers = Math.max(maxTriggers, e.safety.triggers)
  })
  const s = engine.summary
  check('进入 RESULT', engine.state === 'RESULT', engine.state)
  check('完成全程', s && s.completed === true, s && s.reason)
  check('得分 > 0', s && s.score > 0, s && String(s.score))
  check('没有触发保险绳', maxTriggers === 0, String(maxTriggers))
  check('距离不超过里程太多', s && s.distance <= s.trackLength + 1, s && s.distance)
  check('稳定时间 > 0', s && s.stableSec > 0, s && String(s.stableSec))
  check('没有 NaN', s && isFinite(s.score) && isFinite(s.pathLength), 'NaN')
}

// ---------------------------------------------------------------- 3. 失衡 + 保险绳
console.log('\n[3] 持续偏到边界：保险绳应介入但不判负、不清零得分')
{
  const { engine, cfg } = makeEngine({ patch: { warnThreshold: 0.5, ropeTrigger: 0.7, ropeRelease: 0.3, durationSec: 30, trackLength: 20 } })
  engine.startCountdown()
  let firstPenaltyScore = null
  let sawEngage = false
  run(engine, 60, () => engine.setSimTarget(1, 0), (e, evs) => {
    evs.forEach((ev) => {
      if (ev.type === 'rope:in') {
        sawEngage = true
        if (firstPenaltyScore === null) firstPenaltyScore = e.score.total
      }
    })
  })
  const s = engine.summary
  check('保险绳至少触发一次', sawEngage && s.ropeTriggers >= 1, s && String(s.ropeTriggers))
  check('本局没有被立刻判负', engine.state === 'RESULT' && s.reason !== 'boundary', s && s.reason)
  check('触发后得分没有被清零', s.score > 0, s && String(s.score))
  check('记录保险绳时长', s.ropeEngagedSec > 0, s && String(s.ropeEngagedSec))
  check('平衡值没有跑到 NaN', isFinite(s.breakdown.stableSec), 'NaN')
  void cfg
}

// ---------------------------------------------------------------- 4. 关闭保险绳
console.log('\n[4] 关闭保险绳 + 终止规则：越界应结束本局')
{
  const { engine } = makeEngine({ patch: { ropeEnabled: false, failRule: 'terminate', warnThreshold: 0.5, ropeTrigger: 0.7, failGraceSec: 0.5 } })
  engine.startCountdown()
  run(engine, 40, () => engine.setSimTarget(1, 0))
  const s = engine.summary
  check('本局被结束', engine.state === 'RESULT', engine.state)
  check('结束原因是越界', s && s.reason === 'boundary', s && s.reason)
  check('未完成标记正确', s && s.completed === false, s && String(s.completed))
}

// ---------------------------------------------------------------- 5. 暂停不计时
console.log('\n[5] 暂停期间不计入训练时长')
{
  const { engine } = makeEngine({ patch: { durationSec: 20 } })
  engine.startCountdown()
  run(engine, 3.2, () => engine.setSimTarget(0, 0))
  const before = engine.elapsedSec
  engine.pause()
  run(engine, 5, () => engine.setSimTarget(0, 0))
  const after = engine.elapsedSec
  check('暂停期间时长不增加', Math.abs(after - before) < 1e-6, before + ' → ' + after)
  check('状态为 PAUSED', engine.state === 'PAUSED', engine.state)
  engine.resume()
  run(engine, 1, () => engine.setSimTarget(0, 0))
  check('可以继续', engine.elapsedSec > after, engine.elapsedSec)
}

// ---------------------------------------------------------------- 6. 渲染
console.log('\n[6] 渲染层冒烟测试（Mock Canvas）')
{
  const { engine } = makeEngine()
  const canvas = makeCanvas(750, 1624)
  const ctx = canvas.getContext('2d')
  const renderer = new WireRenderer({ canvas, ctx, engine, cfg: engine.cfg })
  renderer.resize(375, 812, 2)

  const screens = []
  try {
    renderer.render(0.016, Date.now())
    screens.push('intro')
    check('intro 帧渲染完成', renderer.buttons.length > 0, renderer.buttons.length + ' 个热区')

    engine.prepare()
    renderer.render(0.016, Date.now())
    screens.push('prepare')
    check('prepare 帧渲染完成', renderer.buttons.length > 0, renderer.buttons.length + ' 个热区')

    engine.resetCalibration = undefined
    engine.calibrate()
    let guard = 0
    while (engine.state === 'CALIBRATING' && guard < 400) {
      engine.update(DT)
      renderer.render(DT, Date.now())
      guard += 1
    }
    check('标定流程可完成', engine.state === 'READY', engine.state)

    engine.startCountdown()
    for (let i = 0; i < 60; i++) {
      engine.update(DT)
      engine.setSimTarget(Math.sin(i / 12), 0)
      renderer.render(DT, Date.now())
    }
    screens.push('play')
    check('play 帧渲染完成', renderer.buttons.length > 0, renderer.buttons.length + ' 个热区')

    engine.pause()
    renderer.render(DT, Date.now())
    check('暂停遮罩渲染完成', renderer.buttons.length >= 3, renderer.buttons.length + ' 个热区')
    engine.resume()

    engine.setSimTarget(1, 0)
    for (let i = 0; i < 240; i++) {
      engine.update(DT)
      renderer.render(DT, Date.now())
    }
    check('保险绳介入时渲染完成', true)

    engine.finish('timeout')
    renderer.render(DT, Date.now())
    screens.push('result')
    check('result 帧渲染完成', renderer.buttons.length > 0, renderer.buttons.length + ' 个热区')

    const hit = renderer.hitTest(renderer.buttons[0].x + 2, renderer.buttons[0].y + 2)
    check('热区命中正常', hit === renderer.buttons[0].id, hit)

    // 小屏适配
    renderer.resize(320, 568, 2)
    renderer.render(DT, Date.now())
    check('小屏 320x568 渲染完成', true)
    renderer.resize(414, 896, 3)
    renderer.render(DT, Date.now())
    check('大屏 414x896 渲染完成', true)
  } catch (err) {
    failed += 1
    console.log('  ✗ 渲染异常：' + err.message)
    console.log(err.stack)
  }
  console.log('  已覆盖界面：' + screens.join(' / '))
}

// ---------------------------------------------------------------- 7. 记录
console.log('\n[7] 训练记录：防重复 + 模拟数据不上报')
{
  const records = require('../utils/training-record.js')
  records.clear()
  const rec = {
    recordId: 'wire_test_1',
    nickname: '测试用户',
    gameId: 'wire',
    difficulty: 2,
    score: 123,
    durationSec: 30,
    distance: 12.5,
    stableSec: 10,
    offCount: 2,
    ropeTriggers: 1,
    dataSource: 'real',
    completed: true,
    startedAt: Date.now(),
    endedAt: Date.now()
  }
  records.save(rec)
  records.save(Object.assign({}, rec, { score: 999 }))
  const list = records.list()
  check('同一 recordId 只保存一次', list.length === 1, String(list.length))
  check('重复保存不覆盖原分', list[0].score === 123, String(list[0].score))

  const simRec = Object.assign({}, rec, { recordId: 'wire_test_2', dataSource: 'simulation' })
  records.save(simRec)
  check('模拟数据标记为不上报', records.get('wire_test_2').uploadState === 'skipped',
    records.get('wire_test_2').uploadState)

  const rows = records.describePayload(records.get('wire_test_1'))
  check('隐私清单包含关键字段', rows.length >= 8, String(rows.length))
}

console.log('\n' + (failed ? '结果：' + failed + ' 项未通过' : '结果：全部通过'))
process.exit(failed ? 1 : 0)
