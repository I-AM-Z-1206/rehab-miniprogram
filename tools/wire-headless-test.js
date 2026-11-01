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
const { WireEngine } = require('../pkgWire/games/wire/engine.js')
const { WireRenderer } = require('../pkgWire/games/wire/renderer.js')

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
console.log('\n[3] 持续偏到边界：越界停住、不判负、不再自动回正')
{
  const { engine, cfg } = makeEngine({ patch: { warnThreshold: 0.5, ropeTrigger: 0.7, ropeRelease: 0.3, durationSec: 30, trackLength: 20 } })
  engine.startCountdown()
  let sawEngage = false
  let sawWarn = false
  let maxSuppressed = 0
  run(engine, 60, () => engine.setSimTarget(1, 0), (e, evs) => {
    evs.forEach((ev) => {
      if (ev.type === 'rope:in') sawEngage = true
      if (ev.type === 'warn') sawWarn = true
    })
    // 引擎里的控制量必须**原样**进来：任何衰减都等于「游戏帮你回正」
    if (e.motion && isFinite(e.motion.nx)) {
      maxSuppressed = Math.max(maxSuppressed, Math.abs(Math.abs(e.motion.nx) - Math.abs(e.motion.nx)))
    }
  })
  const s = engine.summary
  check('越界至少触发一次', sawEngage && s.ropeTriggers >= 1, s && String(s.ropeTriggers))
  check('失衡提示出现过', sawWarn === true, String(sawWarn))
  check('本局没有被立刻判负', engine.state === 'RESULT' && s.reason !== 'boundary', s && s.reason)
  // 新语义：一直偏在一边 = 一直走不动。分数如实反映「几乎没走」。
  check('越界后几乎走不动（新语义：停住而不是被扶着继续走）',
    s.avgSpeed < 0.45, s && String(s.avgSpeed))
  check('记录越界时长', s.ropeEngagedSec > 0, s && String(s.ropeEngagedSec))
  check('平衡值没有跑到 NaN', isFinite(s.breakdown.stableSec), 'NaN')
  check('控制量没有被任何东西衰减', maxSuppressed === 0, String(maxSuppressed))
  void cfg
}

console.log('\n[3b] 自动回正已彻底拔掉（safety 不再提供抑制接口）')
{
  const { SafetyRope } = require('../pkgWire/games/wire/safety.js')
  const cfg = getStore()
  const rope = new SafetyRope(cfg)
  check('safety 不再有 getSuppression（旧接口 = 替患者站稳）',
    typeof rope.getSuppression !== 'function', typeof rope.getSuppression)
  rope.update({ dt: 0.1, load: 1, nx: 1, ny: 0 })
  const snap = rope.snapshot()
  check('失衡时给出引导方向（偏右 → 往左压）', snap.guideDir === -1, String(snap.guideDir))
  check('引导方向落在左右轴上', snap.guideAxis === 'x', String(snap.guideAxis))
  rope.update({ dt: 0.1, load: 1, nx: -1, ny: 0 })
  check('偏左 → 往右压', rope.snapshot().guideDir === 1, String(rope.snapshot().guideDir))
  rope.update({ dt: 0.1, load: 1, nx: 0, ny: -1 })
  check('前后失衡只给语音（guideDir 0 / axis y）',
    rope.snapshot().guideDir === 0 && rope.snapshot().guideAxis === 'y',
    rope.snapshot().guideDir + '/' + rope.snapshot().guideAxis)
  rope.update({ dt: 0.1, load: 0.05, nx: 0.02, ny: 0 })
  check('站得稳时不给引导（零开销）', rope.snapshot().guideStrength === 0, String(rope.snapshot().guideStrength))
}

console.log('\n[3c] 速度：按真实步速，并且平衡值就是速度系数')
{
  const cfg = getStore()
  cfg.reset() // 上面几段改过 patch，单例是共享的，必须回到默认值
  check('默认前进速度 ≥ 1.0 米/秒（原 0.5 属于慢速步态）',
    Number(cfg.get('forwardSpeed')) >= 1.0, String(cfg.get('forwardSpeed')))
  check('默认钢丝长度 ≥ 90 米', Number(cfg.get('trackLength')) >= 90, String(cfg.get('trackLength')))

  // 站直不动：平衡值高 → 速度全开
  const a = makeEngine()
  a.engine.startCountdown()
  run(a.engine, 6, () => a.engine.setSimTarget(0, 0))
  const fast = a.engine.speed
  check('站得稳时速度接近配置值', fast > Number(a.cfg.get('forwardSpeed')) * 0.7, String(fast))

  // 一直偏在右边：平衡值掉到 0 → 速度趋近 0
  const b = makeEngine({ patch: { durationSec: 60, trackLength: 100 } })
  b.engine.startCountdown()
  run(b.engine, 8, () => b.engine.setSimTarget(1, 0))
  check('一直偏在一边时速度掉到接近 0（不再有 35% 下限）', b.engine.speed < 0.12, String(b.engine.speed))
  check('平衡值也掉下来了', b.engine.balance < 0.25, String(b.engine.balance))

  // 回正之后速度必须自己回来
  run(b.engine, 6, () => b.engine.setSimTarget(0, 0))
  check('回正后速度按恢复速度回升', b.engine.speed > Number(b.cfg.get('forwardSpeed')) * 0.3, String(b.engine.speed))

  // 一局能走的里程
  const c = makeEngine({ patch: { durationSec: 90 } })
  c.engine.startCountdown()
  run(c.engine, 100, () => c.engine.setSimTarget(0, 0))
  const s = c.engine.summary
  check('90 秒能走 ≥ 60 米（原来 40 米/90 秒）', s && s.distance >= 60, s && String(s.distance))
  check('平均速度 ≥ 0.8 米/秒', s && s.avgSpeed >= 0.8, s && String(s.avgSpeed))
  check('结算带规则版本 v2（与 v1 的里程不可比）', s && s.rulesVersion === 'v2', s && s.rulesVersion)
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

// ----------------------------------------------------------------------------
// [8] Q版角色：纯矢量、零图集、比例与步态四规则
// ----------------------------------------------------------------------------
// 2026-10-31 角色从 Blender 序列帧退回纯矢量（Q版提灯旅人）。图集链路
//（SPRITE / createImage / walk8.png）整条删除 —— 这里守护它**不要复活**：
// 复活的代价是又回到 wx.createImage onload 不触发、切帧错位那批坑。
// 同时用 gait() 纯函数逐相位扫走路四条硬规则（规则细节见 character.js 头注释）。
console.log('\n[8] 绘本风旅人：纯矢量、零图集、比例与步态规则')
{
  const fs = require('fs')
  const path = require('path')
  const ch = require('../pkgWire/games/wire/character.js')

  // ---- 图集链路必须彻底消失 ----
  const charSrc = fs.readFileSync(
    path.join(__dirname, '..', 'pkgWire/games/wire/character.js'), 'utf8')
  check('character.js 不再引用图集（SPRITE）', !/SPRITE/.test(charSrc), 'found SPRITE')
  check('character.js 不再有 createImage 加载链路', !/createImage/.test(charSrc), 'found createImage')
  check('character.js 不再调用 drawImage', !/drawImage/.test(charSrc), 'found drawImage')

  const pngPath = path.join(__dirname, '..', 'pkgWire/assets/wire/walk8.png')
  check('图集文件已出包（walk8.png 不存在）', !fs.existsSync(pngPath), pngPath)

  const rendSrc = fs.readFileSync(
    path.join(__dirname, '..', 'pkgWire/games/wire/renderer.js'), 'utf8')
  check('renderer.js 不再加载图集', !/loadSprite|spriteStatus/.test(rendSrc), 'found loadSprite')

  // ---- Q版比例：大圆头是"可爱"的骨架，回归成人比例 = 改回去了 ----
  const B = ch.BODY
  const TOTAL_H = 190
  const headRatio = (B.headR * 2) / TOTAL_H
  check('头身比落在绘本风区间（4.5~5.5 头身 → 0.17~0.24）',
    headRatio >= 0.17 && headRatio <= 0.24, headRatio.toFixed(2))
  // 4.5 头身有脖子（Q 版没有），但脖子不能超过 10px
  check('头底在肩线之上、脖子不超过 10px',
    B.headCY + B.headR <= B.shoulderY && B.shoulderY - (B.headCY + B.headR) <= 10,
    (B.headCY + B.headR).toFixed(1) + ' vs ' + B.shoulderY)
  check('大衣下摆在脚之上（腿从摆下伸出）', B.hemY < 0 && B.hemY > B.shoulderY,
    String(B.hemY))

  // **兜帽禁止复活**：v6 被否的直接原因就是"兜帽 = 纯色蛋"。
  check('角色没有兜帽（PALETTE 里不得有 hood）', !ch.PALETTE.hood, 'found hood')

  // 头发必须比大衣深（同一条硬约束：亮圆顶 = 皮肤）
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16)
    return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
  }
  check('头发比大衣深', lum(ch.PALETTE.hair) < lum(ch.PALETTE.coat),
    ch.PALETTE.hair + ' vs ' + ch.PALETTE.coat)

  // 飘带必须画在身体**之后**（从肩后飘出来）。画在前面就成了挂在胸前的带子 ——
  // 而"胸前的带子"正是康复步态带的读法。
  const iStreamer = charSrc.indexOf('drawStreamers(ctx, st)')
  const iCoat = charSrc.indexOf('drawCoat(ctx, st)')
  check('飘带画在身体之后', iStreamer > 0 && iCoat > 0 && iStreamer < iCoat,
    iStreamer + ' vs ' + iCoat)

  // ---- 步态四规则：gait() 是纯函数，逐相位扫描 ----
  const N = 72
  let ruleA = true
  let ruleAAt = ''
  let ruleC = true
  for (let i = 0; i < N; i++) {
    const ph = (i / N) * Math.PI * 2
    const g = ch.gait(ph, 0.8, 1)
    // 规则 a：任何时刻至多一条腿抬起（两腿相位差 π）
    if (g.liftR > 0 && g.liftL > 0) {
      ruleA = false
      ruleAAt = 'phase=' + ph.toFixed(2)
      break
    }
    // 规则 c：bob 恒 <= 0（身体只会被抬起来，不会被按下去）
    if (g.bob > 0) { ruleC = false; break }
  }
  check('规则 a：任何时刻至少一只脚在钢丝上', ruleA, ruleAAt || 'ok')
  check('规则 c：身体起伏恒向上（|cos| 两倍步频）', ruleC, 'ok')

  const gMid = ch.gait(Math.PI * 0.5, 0.8, 1)
  const gLeg = ch.gait(0, 0.8, 1)
  check('规则 c：双腿并拢时身体最高', gLeg.bob < gMid.bob,
    gLeg.bob.toFixed(2) + ' vs ' + gMid.bob.toFixed(2))
  check('重心转移：抬脚时身体向对侧压', gMid.swayX < 0, gMid.swayX.toFixed(2))
  check('抬脚高度跟速度走', ch.gait(0.5, 1, 1).liftH > ch.gait(0.5, 0, 1).liftH, 'ok')

  // ---- drawWalker：纯矢量落笔、无翻转、失衡不炸 ----
  const ctx = makeCtx()
  ch.drawWalker(ctx, {
    x: 100, y: 300, scale: 1, walkPhase: 0.3, t: 0,
    speedRatio: 0.5, balance: 0.9, ropeTension: 0.2, lean: 0.05
  })
  const strokes = (ctx.__calls.stroke || 0) + (ctx.__calls.fill || 0)
  check('矢量绘制确实落笔', strokes > 10, String(strokes))
  check('纯矢量不调用 drawImage', !ctx.__calls.drawImage, String(ctx.__calls.drawImage || 0))

  // 8 相位扫一遍：全程不允许负 scale（水平翻转在偏航语境下几何不成立，
  // 4 帧 + 镜像那版就是在这里翻的车 —— 见 character.js 头注释）
  let flipOk = true
  let flipAt = ''
  for (let k = 0; k < 8; k++) {
    const c2 = makeCtx()
    const scaled = []
    c2.scale = function (sx, sy) { scaled.push([sx, sy]) }
    ch.drawWalker(c2, { x: 100, y: 300, scale: 1, walkPhase: k * Math.PI / 4, t: 0 })
    if (scaled.some((p) => p[0] < 0 || p[1] < 0)) {
      flipOk = false
      flipAt = 'k=' + k
      break
    }
  }
  check('8 相位全程无水平翻转（无负 scale）', flipOk, flipAt || 'ok')

  // 完全失衡 + 有张力：不能抛错、不能 NaN 出 NaN 坐标（mock 抓不到 NaN，
  // 但至少保证不 throw、不中断渲染帧）
  let flailOk = true
  try {
    const c3 = makeCtx()
    ch.drawWalker(c3, {
      x: 100, y: 300, scale: 1.3, walkPhase: 1.1, t: 1.7,
      speedRatio: 0.2, balance: 0, ropeTension: 1, lean: 0.42
    })
    if (!((c3.__calls.stroke || 0) + (c3.__calls.fill || 0))) flailOk = false
  } catch (e) { flailOk = false }
  check('完全失衡时渲染不炸', flailOk, 'ok')

  // 挂点与世界坐标：绳挂点在锚点上方，头顶在绳挂点上方
  const belt = ch.beltWorld({ x: 10, y: 20, scale: 1.3, lean: 0.1 })
  const head = ch.headWorld({ x: 10, y: 20, scale: 1.3, lean: 0.1 })
  check('保险绳挂点在脚底锚点上方', belt.y < 20, belt.y.toFixed(1))
  check('头顶在绳挂点上方', head.y < belt.y, head.y.toFixed(1) + ' vs ' + belt.y.toFixed(1))
}

// ----------------------------------------------------------------------------
// [9] 场景特效 fx.js：确定性、零状态、失衡反馈不用警示色
// ----------------------------------------------------------------------------
// fx 的三条铁规矩（引 pixelfx 的方法）：
//   a) 所有粒子是 (t, 序号) 的纯函数 —— 同一 t 画两次必须逐调用一致
//      （射击游戏踩过：同帧重绘结果不同 = 画面抖动）；
//   b) 不许出现 Math.random / 模块级可变状态；
//   c) 失衡是「风大了」不是「你错了」—— 风线必须是冷白，不能是红/橙。
console.log('\n[9] 场景特效：氛围浮尘 / 失衡风线 / 过桩金尘')
{
  const fx = require('../pkgWire/games/wire/fx.js')
  const fs = require('fs')
  const path = require('path')

  // 源码静态扫描：无随机、无状态、无图片、无 putImageData。
  // 先剥掉 // 注释再扫 —— 注释里「不许出现 Math.random」这句话自己就会命中。
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'pkgWire', 'games', 'wire', 'fx.js'), 'utf8')
    .replace(/^\s*\/\/.*$/gm, '')
  check('fx.js 不使用 Math.random', !/Math\.random/.test(src), '')
  check('fx.js 不持有模块级可变状态（只导出函数与常量）',
    !/^let\s|^\s*state\s*=/m.test(src), '')
  check('fx.js 不加载图片（零异步资源红线）',
    !/createImage|readFileSync|\.png/i.test(src), '')

  // renderer 必须真的接上了三件特效
  const rsrc = fs.readFileSync(
    path.join(__dirname, '..', 'pkgWire', 'games', 'wire', 'renderer.js'), 'utf8')
  check('renderer 接入了 fx 模块', /require\('\.\/fx\.js'\)/.test(rsrc), '')
  check('氛围浮尘画在 _drawWorld（所有界面都有）',
    /fx\.drawMotes\(ctx, L\.W/.test(rsrc), '')
  check('风线/金尘画在 _drawSceneFx（只在 play）',
    /fx\.drawWind\(/.test(rsrc) && /fx\.drawGoldDust\(/.test(rsrc), '')
  check('里程碑触发金尘（showMilestone 里设 goldBurst）',
    /showMilestone[\s\S]{0,400}goldBurst/.test(rsrc), '')
  check('风线方向跟 lean（同源自飘带）', /drawWind\([^)]*lean/.test(rsrc), '')

  // 风线颜色必须是冷白系：源码里 wind 段只允许出现冷色 rgba。
  // 拦的是「顺手把警示红也加到风线上」——失衡的红色渐晕已有专属位置。
  const windSeg = src.slice(src.indexOf('function drawWind'), src.indexOf('过桩金尘'))
  check('风线只用冷白系（不带红/橙警示色）',
    windSeg.indexOf('226,85,60') < 0 && windSeg.indexOf('255,186,96') < 0, '')

  // 确定性：同一 t 画两次，调用计数与画笔状态必须完全一致
  const snap = (ctx) => {
    const o = { calls: Object.assign({}, ctx.__calls) }
    for (const k of ['fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha']) {
      o[k] = ctx[k]
    }
    return JSON.stringify(o)
  }
  const drawAll = (ctx, t) => {
    fx.drawMotes(ctx, 390, 844, t, 280, 780)
    fx.drawWind(ctx, 390, 844, t, 0.6, 1)
    fx.drawGoldDust(ctx, 195, 640, t % 1.0, 1)
  }
  const a1 = makeCtx(); drawAll(a1, 2.4)
  const a2 = makeCtx(); drawAll(a2, 2.4)
  check('同一 t 画两次逐调用一致（确定性契约）', snap(a1) === snap(a2), '')

  const b1 = makeCtx(); drawAll(b1, 2.4)
  const b2 = makeCtx(); drawAll(b2, 2.9)
  check('不同 t 画面不同（不是静止的）', snap(b1) !== snap(b2), '')

  // 零开销门槛：站得稳时风线不产生任何绘制调用
  const c1 = makeCtx()
  fx.drawWind(c1, 390, 844, 1.0, 0, 1)
  const n0 = Object.keys(c1.__calls).length
  check('warn=0 时风线零开销（直接 return）', n0 === 0, JSON.stringify(c1.__calls))

  // 强度淡入淡出：k 越大调用越多（透明度不构成调用，说明提前退出了）
  const k1 = makeCtx(); fx.drawWind(k1, 390, 844, 1.0, 0.05, 1)
  const k2 = makeCtx(); fx.drawWind(k2, 390, 844, 1.0, 0.8, 1)
  const n1 = Object.keys(k1.__calls).reduce((s, k) => s + k1.__calls[k], 0)
  const n2 = Object.keys(k2.__calls).reduce((s, k) => s + k2.__calls[k], 0)
  check('弱风比强风开销小（强度真的在控制可见性）', n2 > n1, n1 + ' vs ' + n2)

  // 方向镜像：dir -1 与 dir +1 画的东西不同
  const d1 = makeCtx(); fx.drawWind(d1, 390, 844, 1.0, 0.8, 1)
  const d2 = makeCtx(); fx.drawWind(d2, 390, 844, 1.0, 0.8, -1)
  check('风向可镜像（lean 左右各有各的风）', snap(d1) !== snap(d2), '')

  // 金尘生命周期：结束必须完全归零（一次性特效「结束于空」）
  const e1 = makeCtx(); fx.drawGoldDust(e1, 195, 640, 0.5, 1)
  const nE1 = Object.keys(e1.__calls).reduce((s, k) => s + e1.__calls[k], 0)
  check('金尘进行中有绘制', nE1 > 0, String(nE1))
  const e2 = makeCtx(); fx.drawGoldDust(e2, 195, 640, fx.GOLD_LIFE + 0.1, 1)
  const nE2 = Object.keys(e2.__calls).reduce((s, k) => s + e2.__calls[k], 0)
  check('金尘 1.4s 后完全归零（不残留）', nE2 === 0, JSON.stringify(e2.__calls))
  const e3 = makeCtx(); fx.drawGoldDust(e3, 195, 640, 0.7, 1)
  const e4 = makeCtx(); fx.drawGoldDust(e4, 195, 640, fx.GOLD_LIFE + 0.1, 1)
  check('金尘结束时 alpha 归零（画面上不留点）', snap(e3) !== snap(e4), '')

  // 边界不炸：极端参数直接调用也不抛
  let edgeOk = true
  try {
    fx.drawMotes(makeCtx(), 320, 568, 0, 190, 200)
    fx.drawWind(makeCtx(), 320, 568, 0, 1, -1)
    fx.drawGoldDust(makeCtx(), 0, 0, 0.3, 0.6)
    fx.drawGoldDust(makeCtx(), 195, 640, -1, 1)
    fx.drawMotes(makeCtx(), 0, 0, 0, 0, 0)
  } catch (e) { edgeOk = false }
  check('极端参数不炸', edgeOk, 'ok')
}

// ----------------------------------------------------------------------------
// 2026-11-01 角色 sprite 加载契约（三只：狐狸 / 兔子 / 熊猫）。
// 真机四轮失败的**唯一根因**：微信的 CanvasRenderingContext2D 没有 ctx.canvas，
// 角色模块只能靠 renderer 显式把 canvas 传下来去 createImage。这里把这条锁死。
console.log('\n[10] 角色 sprite：三只图集 + Image 来源 + 档位状态机')
{
  const fs = require('fs')
  const path = require('path')
  const charPath = path.join(__dirname, '..', 'pkgWire', 'games', 'wire', 'character-sprite.js')
  const raw = fs.readFileSync(charPath, 'utf8')
  const src = raw.replace(/^\s*\/\/.*$/gm, '')   // 剥注释，注释里提到关键字会自己命中

  check('character-sprite.js 不内联 base64（data URI 是死路，还白占几百 KB）',
    !/data:image/.test(src), '')
  check('character-sprite.js 体积正常（< 40KB）', raw.length < 40 * 1024, raw.length + ' bytes')
  check('canvas 优先取 o.canvas（ctx.canvas 真机上不存在，只能当兜底）',
    src.indexOf('o && o.canvas') >= 0 &&
    src.indexOf('o && o.canvas') < src.indexOf('ctx && ctx.canvas'),
    'order check')

  const wxReturn = src.split('\n').findIndex(function (l) { return l.indexOf('return wx.createImage()') >= 0 })
  const wxBlock = wxReturn >= 0 ? src.split('\n').slice(Math.max(0, wxReturn - 6), wxReturn + 1).join('\n') : ''
  check('wx.createImage 只在浏览器预览分支里被调用',
    wxReturn >= 0 && wxBlock.indexOf('IS_WEB') >= 0, wxBlock.slice(0, 90))

  // renderer 必须把 canvas 传给角色 —— 这条断了，真机一定只剩兜底圆点
  const rend = fs.readFileSync(
    path.join(__dirname, '..', 'pkgWire', 'games', 'wire', 'renderer.js'), 'utf8')
  const callIdx = rend.indexOf('drawWalker(ctx,')
  const callSeg = callIdx >= 0 ? rend.slice(callIdx, callIdx + 340) : ''
  check('renderer 调用 drawWalker 时传了 canvas', /canvas:\s*this\.canvas/.test(callSeg),
    callSeg.slice(0, 80))
  check('renderer 每帧按配置切角色（setCharacter）', /setCharacter\(this\.cfg\.get\('characterId'\)/.test(rend), '')

  // ---- 三个角色的图集必须真的存在、尺寸对得上 ----
  const { PNG } = require('pngjs')
  const sprite = require(charPath)
  check('三只角色都注册了', sprite.CHARACTER_IDS.length === 3, sprite.CHARACTER_IDS.join(','))
  check('角色 id 与配置里的选项一致',
    sprite.CHARACTER_IDS.join(',') === 'fox,rabbit,panda', sprite.CHARACTER_IDS.join(','))
  sprite.CHARACTER_IDS.forEach(function (id) {
    const c = sprite.CHARACTERS[id]
    // 图集必须放**主包** assets/wire：分包里的图在小程序里拿不到（踩过）
    check(id + ' 图集在主包 assets/wire/', c.file.indexOf('/assets/wire/') === 0, c.file)
    const p = path.join(__dirname, '..', c.rel)
    check(id + ' 图集文件存在', fs.existsSync(p), p)
    if (fs.existsSync(p)) {
      const png = PNG.sync.read(fs.readFileSync(p))
      check(id + ' 图集尺寸 = 帧宽×帧数 × 190',
        png.width === c.frameW * c.frames && png.height === c.h,
        png.width + 'x' + png.height + ' 期望 ' + (c.frameW * c.frames) + 'x' + c.h)
      check(id + ' 帧数与登记一致', png.width % c.frames === 0, String(png.width))
    }
    check(id + ' 有兜底色（图集没加载出来时不是空白）', /^#/.test(c.fallback), c.fallback)
  })

  // ---- 运行时：用「微信语义」的 ctx（没有 canvas 属性）跑一遍加载 ----
  const savedWx = global.wx
  const used = []
  global.wx = {
    getImageInfo: function (o) {
      used.push('getImageInfo:' + o.src)
      o.success({ path: 'wxfile://tmp_char.png' })   // 同步回调，测试免等待
    },
    createImage: function () { used.push('WX_CREATE_IMAGE_BAD'); return null }
  }
  function fakeCanvas() {
    return {
      createImage: function () {
        const img = { onload: null, onerror: null }
        let s = ''
        Object.defineProperty(img, 'src', {
          get: function () { return s },
          set: function (v) { s = v; used.push('src:' + v); if (img.onload) img.onload() }
        })
        return img
      }
    }
  }
  function bareCtx() {
    const c = { globalAlpha: 1, fillStyle: '', font: '', textAlign: '' }
    ;['save', 'restore', 'translate', 'rotate', 'drawImage', 'beginPath', 'arc',
      'fill', 'fillText', 'stroke', 'scale'].forEach(function (k) { c[k] = function () {} })
    return c
  }
  function freshChar() {
    delete require.cache[require.resolve(charPath)]
    return require(charPath)
  }

  const f1 = freshChar()
  f1.setCharacter('rabbit')
  f1.drawWalker(bareCtx(), { canvas: fakeCanvas(), x: 100, y: 400, scale: 1, walkPhase: 0 })
  const d1 = f1._debug()
  check('传了 canvas 就真的加载到图集（ready）', d1.ready === true, JSON.stringify(d1))
  check('换成兔子后走的是兔子的图集',
    used.some(function (s) { return s.indexOf('getImageInfo:assets/wire/char-rabbit.png') === 0 }),
    used.join(' , '))
  check('优先走 getImageInfo 换临时路径',
    used.some(function (s) { return s === 'src:wxfile://tmp_char.png' }), used.join(' , '))
  check('绝不落到 wx.createImage（真机上它造的 Image 用不了）',
    used.indexOf('WX_CREATE_IMAGE_BAD') < 0, used.join(' , '))

  // 换角色必须重建：不能拿上一只的图硬画
  used.length = 0
  f1.setCharacter('panda')
  check('换角色后 ready 归零（必须重新加载）', f1._debug().ready === false, JSON.stringify(f1._debug()))
  f1.drawWalker(bareCtx(), { canvas: fakeCanvas(), x: 100, y: 400, scale: 1, walkPhase: 0 })
  check('换角色后加载的是熊猫的图集',
    used.some(function (s) { return s.indexOf('getImageInfo:assets/wire/char-panda.png') === 0 }),
    used.join(' , '))
  // 同一个角色再调一次不该重新加载（每帧都会调）
  used.length = 0
  f1.setCharacter('panda')
  check('同一角色重复设置是零开销（每帧都会调）', used.length === 0 && f1._debug().ready === true,
    used.join(' , '))

  // ★ 加载途中重复 setCharacter 不能把 in-flight 的加载打断。
  //   renderer 每帧都调 setCharacter，写成「没 ready 就 reset」会让图片永远加载不出来，
  //   表现为「三只里随机一只只剩兜底圆点」，而且只在真机/慢网络上出现。
  const f4 = freshChar()
  f4.setCharacter('rabbit')
  f4.setCharacter('rabbit')   // 还没 ready 时再来一次
  f4.setCharacter('rabbit')
  f4.drawWalker(bareCtx(), { canvas: fakeCanvas(), x: 100, y: 400, scale: 1, walkPhase: 0 })
  check('加载途中重复 setCharacter 不会打断加载', f4._debug().ready === true, JSON.stringify(f4._debug()))

  // 缺 canvas 时必须老老实实报 nocv，而不是偷偷退回 wx.createImage
  used.length = 0
  const f2 = freshChar()
  f2.drawWalker(bareCtx(), { x: 100, y: 400, scale: 1, walkPhase: 0 })
  const d2 = f2._debug()
  check('缺 canvas 时报 nocv（能一眼看出是没传画布）', d2.note === 'nocv', JSON.stringify(d2))
  check('缺 canvas 时也不碰 wx.createImage', used.length === 0, used.join(' , '))

  // 失败要升档：档 0 挂了必须能走到档 1（旧代码 onerror 不升档 = 原地打转）
  used.length = 0
  global.wx.getImageInfo = function (o) { used.push('infoFail'); o.fail({ errMsg: 'no such file' }) }
  const f3 = freshChar()
  const cv3 = fakeCanvas()
  f3.drawWalker(bareCtx(), { canvas: cv3, x: 100, y: 400, scale: 1, walkPhase: 0 })
  // 档位切换发生在「下一次」drawWalker：真机上每帧都调，一帧内不递归重入
  f3.drawWalker(bareCtx(), { canvas: cv3, x: 100, y: 400, scale: 1, walkPhase: 0.2 })
  const d3 = f3._debug()
  check('getImageInfo 失败后升到档 1 并改用包内路径直连',
    d3.ready === true && used.some(function (s) { return s === 'src:/assets/wire/fox-walk-190.png' }),
    JSON.stringify(d3) + ' ' + used.join(' , '))

  global.wx = savedWx
  freshChar()   // 还原模块缓存，别把测试用的假 wx 留给后面
}


console.log('\n[11] 规则集迁移：老设备盘里的「40 米 / 0.5 m/s」必须被迁走')
{
  // 这是真机上真实踩到的：代码改成 100 米 / 1.2 m/s，用户屏幕上还写着
  // 「里程 1.5 / 40 米」—— 因为 40 是上一版存在 storage 里的，改 def 不起作用。
  const cfgPath = require.resolve('../utils/wire-config.js')

  // 造一份「上一版存下来的盘」
  storage['wire_cfg_v1'] = {
    characterId: 'fox', difficulty: 2, durationSec: 90,
    trackLength: 40, forwardSpeed: 0.5, scorePerMeter: 4
  }
  delete storage['wire_ruleset']
  delete require.cache[cfgPath]
  const wc = require(cfgPath)
  const st = wc.getStore()

  check('里程 40 → 100', st.get('trackLength') === 100, String(st.get('trackLength')))
  check('速度 0.5 → 1.2', Math.abs(st.get('forwardSpeed') - 1.2) < 1e-6, String(st.get('forwardSpeed')))
  check('每米得分 4 → 1.5（里程翻了，分数不该跟着翻）',
    Math.abs(st.get('scorePerMeter') - 1.5) < 1e-6, String(st.get('scorePerMeter')))
  check('写入规则集标记，下次不再迁', Number(storage['wire_ruleset']) === 2, String(storage['wire_ruleset']))
  check('没碰治疗师的其它参数（时长 / 角色）',
    st.get('durationSec') === 90 && st.get('characterId') === 'fox',
    st.get('durationSec') + ' / ' + st.get('characterId'))

  // 第二次启动：标记已在，**手调过的值一个都不能动**
  // 0.75 是步长 0.05 上的合法值（写 0.73 会被 coerce 到 0.75，那是另一回事）
  storage['wire_cfg_v1'] = { forwardSpeed: 0.75, trackLength: 65, scorePerMeter: 3 }
  delete require.cache[cfgPath]
  const wc2 = require(cfgPath)
  const st2 = wc2.getStore()
  check('手调过的 0.75 不被迁移覆盖', Math.abs(st2.get('forwardSpeed') - 0.75) < 1e-6, String(st2.get('forwardSpeed')))
  check('手调过的 65 米不被迁移覆盖', st2.get('trackLength') === 65, String(st2.get('trackLength')))

  // 纯函数再钉一次：表里只有出厂值
  const p = wc2.rulesetPatch({ forwardSpeed: 0.82, trackLength: 45, scorePerMeter: 2 })
  check('rulesetPatch 只认出厂值（手调的 2 分不在表里）',
    Math.abs(p.forwardSpeed - 1.8) < 1e-6 && p.trackLength === 100 && p.scorePerMeter === undefined,
    JSON.stringify(p))

  delete storage['wire_cfg_v1']
  delete storage['wire_ruleset']
}

console.log('\n[12] 引导箭头：尖端朝外，不指回角色')
{
  const fx = require('../pkgWire/games/wire/fx.js')

  // 只记录点、不关心颜色的小画布
  function recCtx() {
    const ops = []
    return {
      ops: ops, lineWidth: 1, lineCap: '', lineJoin: '', strokeStyle: '', fillStyle: '',
      save() {}, restore() {},
      translate(x, y) { ops.push(['T', x, y]) },
      scale(x, y) { ops.push(['S', x, y]) },
      beginPath() { ops.push(['B']) },
      closePath() { ops.push(['Z']) },
      moveTo(x, y) { ops.push(['M', x, y]) },
      lineTo(x, y) { ops.push(['L', x, y]) },
      quadraticCurveTo(a, b, c, d) { ops.push(['Q', a, b, c, d]) },
      arc(x, y, r) { ops.push(['A', x, y, r]) },
      arcTo(x1, y1, x2, y2) { ops.push(['AT', x1, y1, x2, y2]) },
      ellipse() { ops.push(['E']) },
      fill() {}, stroke() {},
      createRadialGradient() { return { addColorStop() {} } },
      createLinearGradient() { return { addColorStop() {} } }
    }
  }

  const LEN = 200
  const CX = 200
  const CY = 200
  const c = recCtx()
  fx.drawGuideArrow(c, { cx: CX, cy: CY, dir: 1, k: 1, t: 0, len: LEN })

  const pts = c.ops.filter((o) => o[0] === 'M' || o[0] === 'L').map((o) => [o[1], o[2]])
  check('确实画了箭头（有路径点）', pts.length > 8, String(pts.length))

  // 尖端：x = cx + len/2，y = cy
  const tipX = CX + LEN / 2
  const hasTip = pts.some((p) => Math.abs(p[0] - tipX) < 0.01 && Math.abs(p[1] - CY) < 0.01)
  check('尖端在最外侧且在中心线上（dir=1 → 指向右）', hasTip, JSON.stringify(pts.slice(0, 4)))

  const maxX = Math.max.apply(null, pts.map((p) => p[0]))
  check('没有任何一点越过尖端（尖端就是最外点）', Math.abs(maxX - tipX) < 0.01, String(maxX))

  // 箭尾（圆角）就是整枚箭头最靠内的部分：
  // 尾部原来还有两道「递进光痕」，箭头变细之后它们读成第二个箭头，已删。
  // 圆角本身的 arcTo 控制点不走 M/L 记录，所以只断言「没有任何点越过箭尾」。
  const tailX = CX - (LEN / 2) * 0.66
  const minX = Math.min.apply(null, pts.map((p) => p[0]))
  check('没有任何点越过箭尾（没有多余的光痕拖在外面）', minX >= tailX - 0.01, minX + ' vs ' + tailX)

  const c2 = recCtx()
  fx.drawGuideArrow(c2, { cx: CX, cy: CY, dir: -1, k: 1, t: 0, len: LEN })
  check('dir=-1 时整体镜像（箭头翻到左边）',
    c2.ops.some((o) => o[0] === 'S' && o[1] === -1), JSON.stringify(c2.ops.slice(0, 3)))

  // k 太小就完全不画（正常状态零开销）
  const c3 = recCtx()
  fx.drawGuideArrow(c3, { cx: CX, cy: CY, dir: 1, k: 0.01, t: 0, len: LEN })
  check('强度不足时零开销（不画任何东西）', c3.ops.length === 0, String(c3.ops.length))
}

console.log('\n[13] 引导箭头挂在屏幕上部的 HUD 区，尺寸够大')
{
  const fx = require('../pkgWire/games/wire/fx.js')
  const orig = fx.drawGuideArrow
  let seen = null
  let calls = 0
  fx.drawGuideArrow = function (ctx, o) { calls += 1; seen = o }

  const { engine } = makeEngine()
  const canvas = makeCanvas(750, 1624)
  const ctx = canvas.getContext('2d')
  const renderer = new WireRenderer({ canvas, ctx, engine, cfg: engine.cfg })
  const W = 375
  const H = 812
  renderer.resize(W, H, 2)

  // 先跑一帧平稳状态：不该出现箭头
  engine.prepare()
  engine.calibrate()
  engine.startCountdown()
  for (let i = 0; i < 90; i++) {
    engine.update(DT)
    engine.setSimTarget(0, 0)
    renderer.render(DT, Date.now())
  }
  check('站得稳的时候不画引导箭头', calls === 0, String(calls))

  // 再推到越界
  let guard = 0
  while (guard < 600 && !(engine.safety && engine.safety.engaged)) {
    engine.update(DT)
    engine.setSimTarget(1, 0)
    renderer.render(DT, Date.now())
    guard += 1
  }
  renderer.render(DT, Date.now())
  fx.drawGuideArrow = orig

  check('越界时出现引导箭头', calls > 0 && !!seen, String(calls))
  if (seen) {
    check('箭头在屏幕上半部（cy < H/2）', seen.cy < H / 2, seen.cy + ' < ' + (H / 2))
    check('箭头在 HUD 数字下方（cy > 100）', seen.cy > 100, String(seen.cy))
    check('尺寸够大（总长 ≥ 屏宽 45%）', seen.len >= W * 0.45, seen.len + ' / ' + W)
    check('方向朝左（身体偏右 → 往左压）', seen.dir === -1, String(seen.dir))
    check('水平居中', Math.abs(seen.cx - W / 2) < 0.5, String(seen.cx))
  }
}


console.log('\n' + (failed ? '结果：' + failed + ' 项未通过' : '结果：全部通过'))
process.exit(failed ? 1 : 0)
